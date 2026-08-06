import "server-only";
import { eq, inArray, isNull, or, ne, and, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { scoutJobs, type ScoutJob } from "@/lib/db/schema";
import { claudePrompt } from "@/lib/llm-cli";
import { fetchJobDescription } from "@/lib/kit/jd";
import { loadBaseResume } from "./base-resume";
import { HARD_FACTS } from "./hard-facts";
import { gradeAssessment, type GradedAssessment } from "./fit-grade";
import {
  GRADE_SYSTEM,
  buildGradePrompt,
  extractJsonObject,
  validateAssessment,
} from "./grade-prompt";

/**
 * JOBDASH-010 — ONE reusable grader looped over rows (the standing pattern).
 * The LLM scores gates + dimensions; fit-grade.ts owns the letter.
 *
 * Transport is the existing `claude -p` seam — the org has no API credits, so
 * every LLM call in this repo goes through the subscription CLI.
 */

const MODEL = process.env.FIT_GRADE_MODEL ?? "claude-sonnet-5";
/** Grading is one short JSON reply per job; it must not inherit the kit
 * generator's 8-minute budget or a stuck sweep blocks the import. */
const GRADE_TIMEOUT_MS = 120_000;

export interface StoredAssessment extends GradedAssessment {
  graded_at: string;
  model: string;
}

/** Grade one job. `jd` overrides the stored JD (tests + the manual re-grade). */
export async function assessJob(
  job: Pick<ScoutJob, "company" | "title">,
  jd: string,
): Promise<StoredAssessment> {
  const resume = await loadBaseResume();
  const prompt = buildGradePrompt({
    company: job.company,
    title: job.title,
    jd,
    resumeText: resume.text,
  });

  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const nudge =
      attempt === 0
        ? ""
        : `\n\nYour previous output was invalid (${lastError}). Output ONLY the raw JSON object this time.`;
    let reply: string;
    try {
      reply = await claudePrompt({
        model: MODEL,
        system: GRADE_SYSTEM,
        prompt: prompt + nudge,
        timeoutMs: GRADE_TIMEOUT_MS,
      });
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      continue;
    }
    try {
      const assessment = validateAssessment(JSON.parse(extractJsonObject(reply)));
      return {
        ...gradeAssessment(assessment),
        graded_at: new Date().toISOString(),
        model: MODEL,
      };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(`fit grading failed: ${lastError}`);
}

/** The JD the grade is computed from. Falls back through the cached JD, a live
 * fetch, then the scraper's reason — never grades on a title alone, because
 * title-only grading is exactly the failure this ticket exists to fix. */
async function resolveScoutJd(job: ScoutJob): Promise<string | null> {
  if (job.jdText && job.jdText.trim().length >= 200) return job.jdText;
  if (job.url) {
    try {
      const fetched = await fetchJobDescription(job.url);
      if (fetched.trim().length >= 200) {
        await db
          .update(scoutJobs)
          .set({ jdText: fetched, jdFetchedAt: new Date() })
          .where(eq(scoutJobs.id, job.id))
          .run();
        return fetched;
      }
    } catch {
      // dead posting / bot wall — fall through
    }
  }
  return null;
}

export interface GradeSweepResult {
  graded: number;
  skipped: number;
  failed: number;
  /** rows with no usable JD — they stay ungraded, and ungraded is not apply-eligible */
  noJd: number;
}

/** Grade one stored scout job and persist. Returns null when there is no JD to
 * grade against (the row stays ungraded rather than getting a guessed letter). */
export async function gradeScoutJob(
  jobId: string,
  opts: { force?: boolean } = {},
): Promise<StoredAssessment | null> {
  const job = await db.select().from(scoutJobs).where(eq(scoutJobs.id, jobId)).get();
  if (!job) throw new Error("Scout job not found");

  const resume = await loadBaseResume();
  if (!opts.force && isGradeCurrent(job, resume.version)) {
    return (job.fitAssessment as StoredAssessment | null) ?? null;
  }

  const jd = await resolveScoutJd(job);
  if (!jd) return null;

  const assessment = await assessJob(job, jd);
  await db
    .update(scoutJobs)
    .set({
      fitGrade: assessment.grade,
      fitAssessment: assessment,
      gradedAt: new Date(),
      gradedResumeV: resume.version,
      gradedFactsV: HARD_FACTS.version,
    })
    .where(eq(scoutJobs.id, jobId))
    .run();
  return assessment;
}

/** A stored grade is current when it was produced from today's resume AND
 * today's hard facts. Either changing invalidates it. */
export function isGradeCurrent(
  job: Pick<ScoutJob, "fitGrade" | "gradedResumeV" | "gradedFactsV">,
  resumeV: string,
): boolean {
  return (
    job.fitGrade != null &&
    job.gradedResumeV === resumeV &&
    job.gradedFactsV === HARD_FACTS.version
  );
}

/**
 * Grade every row that needs it: never graded, or graded against a stale resume
 * / stale hard facts. Sequential on purpose — the `claude -p` seam is one
 * subscription, and a parallel fan-out gets rate-limited into failures.
 *
 * Ordered by score DESC because the sweep is BOUNDED (25 per import) while the
 * ungraded backlog is in the hundreds. Unordered, it graded arbitrary rows, so
 * the ≥75 strong fits — the only ones auto-sync can promote, and the only ones
 * a human can click Apply on — were never reached: 2026-08-04 had 29 apply-ready
 * rows and 0 of them graded. Highest-scoring first means every sweep spends its
 * budget on the rows that can actually become a To-apply card.
 */
export async function gradeStaleScoutJobs(
  opts: { limit?: number; statuses?: string[] } = {},
): Promise<GradeSweepResult> {
  const { limit = 50, statuses = ["new", "promoted"] } = opts;
  const resume = await loadBaseResume();

  const rows = await db
    .select()
    .from(scoutJobs)
    .where(
      and(
        inArray(scoutJobs.status, statuses),
        or(
          isNull(scoutJobs.fitGrade),
          ne(scoutJobs.gradedResumeV, resume.version),
          ne(scoutJobs.gradedFactsV, HARD_FACTS.version),
          isNull(scoutJobs.gradedResumeV),
          isNull(scoutJobs.gradedFactsV),
        ),
      ),
    )
    .orderBy(desc(scoutJobs.score))
    .limit(limit)
    .all();

  const result: GradeSweepResult = { graded: 0, skipped: 0, failed: 0, noJd: 0 };
  for (const row of rows) {
    try {
      const assessment = await gradeScoutJob(row.id);
      if (assessment) result.graded++;
      else result.noJd++;
    } catch {
      // One bad row (dead posting, CLI hiccup) must not abort the sweep.
      result.failed++;
    }
  }
  return result;
}

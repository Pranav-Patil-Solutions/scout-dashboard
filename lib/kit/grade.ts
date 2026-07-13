import "server-only";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { activities, applications } from "../db/schema";
import { claudePrompt } from "../llm-cli";
import { extractJsonObject, validateKitGrade, type KitGrade } from "./grade-schema";
import { kitDir, resolveJd } from "./generate";
import { htmlToText } from "./text";

/**
 * CV grader (JOBDASH-005 v1.1) — scores the generated resume's relatability
 * against the live posting and stores actionable, truth-preserving
 * improvements. The stored improvements are fed back into the NEXT
 * generation for this application (see generate.ts), closing the loop.
 */

const MODEL = "claude-sonnet-5";

const GRADE_SYSTEM = `You are a senior Berlin tech recruiter doing a first-pass CV screen, combined with an ATS keyword scan. Grade how well the RESUME relates to the JOB DESCRIPTION. Be harsh but fair — a generic resume scores in the 40s; only a resume a recruiter would shortlist on first read scores 80+.

Scoring dimensions (0–100 each):
- keywords: coverage of the JD's concrete skills/tools/terms
- experience: how directly the shown experience maps to the role's actual work
- seniority: level fit (over- and under-qualification both cost points)
- evidence: quantified, specific, verifiable claims vs vague ones
overall is your holistic screen verdict (not an average).

Improvements must be ACTIONABLE and TRUTH-PRESERVING: reframing, reordering, emphasizing, cutting, or surfacing existing facts and truthful keywords only. NEVER advise adding experience, tools, metrics, or language levels the candidate does not have. Note truthful gaps as red_flags instead.

Respond with ONLY a raw JSON object — no markdown fences, no prose — shaped exactly:
{"overall": number, "subscores": {"keywords": number, "experience": number, "seniority": number, "evidence": number}, "matched_keywords": string[], "missing_keywords": string[], "red_flags": string[], "improvements": string[] (3-8 items), "verdict": "one sentence"}`;

/** Write a grade to the card + timeline. Deliberately does NOT bump
 * lastActivityAt — grading is bookkeeping, not correspondence, and must not
 * silence the overdue/silent-days alerts. Also used by the refine loop when
 * restoring the best round. */
export async function persistGrade(
  appId: string,
  grade: KitGrade,
  activityTitle: string,
): Promise<void> {
  const now = new Date();
  await db
    .update(applications)
    .set({ kitGrade: grade, kitGradedAt: now, updatedAt: now })
    .where(eq(applications.id, appId))
    .run();
  await db
    .insert(activities)
    .values({
      id: randomUUID(),
      applicationId: appId,
      type: "note",
      title: activityTitle,
      body: grade.verdict,
      occurredAt: now,
      source: "system",
    })
    .run();
}

export async function gradeKit(appId: string, opts: { jd?: string } = {}): Promise<KitGrade> {
  const app = await db.select().from(applications).where(eq(applications.id, appId)).get();
  if (!app) throw new Error("Application not found");

  let resumeHtml: string;
  try {
    resumeHtml = await readFile(path.join(kitDir(appId), "resume.html"), "utf-8");
  } catch {
    throw new Error("No generated kit found — generate the kit first.");
  }
  const jd = opts.jd ?? (await resolveJd(app));

  const prompt = `TARGET
Company: ${app.company}
Role: ${app.roleTitle}

JOB DESCRIPTION (from the live posting)
${jd}

RESUME (as plain text)
${htmlToText(resumeHtml)}

Grade the resume now.`;

  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const nudge =
      attempt === 0
        ? ""
        : `\n\nYour previous output was invalid (${lastError}). Output ONLY the raw JSON object this time.`;
    let reply: string;
    try {
      reply = await claudePrompt({ model: MODEL, system: GRADE_SYSTEM, prompt: prompt + nudge });
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      continue;
    }
    try {
      const parsed = validateKitGrade(JSON.parse(extractJsonObject(reply)));
      const grade: KitGrade = {
        ...parsed,
        graded_at: new Date().toISOString(),
        model: MODEL,
      };
      await persistGrade(appId, grade, `CV graded ${grade.overall}/100 vs live posting`);
      return grade;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(`grading failed: ${lastError}`);
}

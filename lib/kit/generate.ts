import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { activities, applications, type Application } from "../db/schema";
import { GERMAN_REQ_META, type GermanReq } from "../constants";
import { claudePrompt } from "../llm-cli";
import type { KitGrade } from "./grade-schema";
import { fetchJobDescription } from "./jd";
import { renderPdf, pdfPageCount } from "./pdf";
import { clampText, companySlug, extractHtmlDocument, htmlToText } from "./text";

/**
 * JOBDASH-005 — tailored CV + cover letter for one application.
 * Base resume (canonical HTML) + live JD text → two claude-cli calls →
 * A4 PDFs in kits/<appId>/ → resume_variant/cover_path/is_kit_ready updated.
 * TRUTH CONSTRAINT: the model may re-order/re-phrase/emphasize/cut, never
 * invent facts — enforced in both system prompts.
 */

const MODEL = "claude-sonnet-5";
// full-document generation regularly outruns the email pipeline's 300s default
const KIT_CLI_TIMEOUT_MS = 480_000;
const DEFAULT_BASE_RESUME =
  "/Users/pranavpatil/Downloads/pranav-essentials/C--Users-Pranav/linkedin-improvement/Pranav-Resume-2026-07-12.html";

export function kitDir(appId: string): string {
  return path.join(process.cwd(), "kits", appId);
}

const RESUME_SYSTEM = `You tailor an existing HTML resume to a specific job posting. Hard rules:
- Output ONLY a complete HTML document (doctype to </html>). No prose, no markdown fences.
- Keep the base resume's <style> block, @page rules, and structural markup EXACTLY as given. You may only change text content, reorder bullets/skills, and delete the least relevant bullets.
- NEVER invent employers, job titles, dates, degrees, certifications, tools, languages, or metrics that are not in the base resume. Re-phrasing, re-ordering, emphasizing, and cutting are allowed; fabricating is not.
- Retarget the professional title line and summary to the target role using the job description's own vocabulary where it truthfully applies.
- The result must fit ONE A4 page with the given CSS — prefer cutting the least relevant bullets over shrinking anything.
- Write like a strong human writer, not an AI: plain verbs, concrete nouns, real numbers, varied sentence rhythm. Banned words/phrases: leverage(d), spearheaded, passionate, dynamic, synergy, results-driven, proven track record, utilize, delve, showcase, cutting-edge, fast-paced environment. No keyword stuffing — a JD keyword may appear only where an underlying fact truthfully supports it.`;

const COVER_SYSTEM = `You write a one-page cover letter as a complete HTML document. Hard rules:
- Output ONLY a complete HTML document (doctype to </html>). No prose around it, no markdown fences.
- Use the exact <style> skeleton provided in the prompt (A4 @page, same typography family as the resume).
- 250–320 words of body text. Direct, specific, zero clichés ("I am writing to express…" is banned). Open with a concrete hook tying the candidate's strongest relevant result to what the company is building; close with a plain call to action.
- Humanize the voice: contractions are welcome, one idea per sentence, varied sentence length, no three-part parallel flourishes, no em-dash chains. Banned words: leverage(d), spearheaded, passionate, dynamic, synergy, results-driven, proven track record, utilize, delve, showcase, cutting-edge, thrilled, excited.
- Ground EVERY claim in the resume facts provided. Never invent experience, employers, metrics, or language skills. German level is A2 (basic) — never overstate it.
- Sign off "Pranav Patil" with the contact line from the resume facts. Address the hiring team of the given company; use today's date and the location line "Berlin, Germany".`;

function resumePrompt(baseHtml: string, jd: string, target: string): string {
  return `TARGET ROLE
${target}

JOB DESCRIPTION (fetched from the live posting)
${jd}

BASE RESUME (the only source of truth about the candidate)
${baseHtml}

Produce the tailored one-page resume HTML now.`;
}

function condensePrompt(resumeHtml: string): string {
  return `This resume renders to MORE than one A4 page with its own CSS. Shorten the text content by roughly 15% — cut the least relevant bullets first, tighten phrasing — changing nothing else about the markup or style. Do not remove employers or education entries. Output ONLY the complete HTML document.

${resumeHtml}`;
}

function coverPrompt(resumeFacts: string, jd: string, target: string, dateLine: string): string {
  return `TARGET
${target}

TODAY'S DATE
${dateLine}

STYLE SKELETON (use exactly this <style>, put the letter in <body>)
<style>
  @page { size: A4; margin: 22mm 24mm; }
  body { font-family: "Segoe UI", Calibri, Arial, sans-serif; font-size: 10.5pt; line-height: 1.45; color: #1b1b1b; margin: 0; }
  .head { margin-bottom: 14px; }
  .head .name { font-size: 14pt; font-weight: 600; }
  .head .meta { font-size: 9.5pt; color: #444; }
  .date { margin: 10px 0 18px; font-size: 9.5pt; color: #444; }
  p { margin: 0 0 9px; }
  .signoff { margin-top: 16px; }
</style>

JOB DESCRIPTION
${jd}

RESUME FACTS (the only source of truth about the candidate)
${resumeFacts}

Write the cover letter HTML now.`;
}

export interface KitResult {
  dir: string;
  resumeVariant: string;
  resumePages: number;
  warnings: string[];
  files: string[];
  grade: KitGrade | null;
}

async function loadApp(appId: string): Promise<Application> {
  const app = await db
    .select()
    .from(applications)
    .where(eq(applications.id, appId))
    .get();
  if (!app) throw new Error("Application not found");
  return app;
}

/** JD text: the live posting, falling back to the card's notes (shared with the grader). */
export async function resolveJd(
  app: Pick<Application, "jdUrl" | "applyUrl" | "notes">,
): Promise<string> {
  let jd = "";
  const jdSource = app.jdUrl || app.applyUrl;
  if (jdSource) {
    try {
      jd = await fetchJobDescription(jdSource);
    } catch {
      jd = "";
    }
  }
  if (!jd && app.notes) jd = clampText(app.notes, 12_000);
  if (!jd)
    throw new Error(
      "No job description available — add a JD/apply URL that still resolves, or paste the JD into Notes.",
    );
  return jd;
}

export async function generateKit(appId: string): Promise<KitResult> {
  const app = await loadApp(appId);
  const basePath = process.env.KIT_BASE_RESUME ?? DEFAULT_BASE_RESUME;
  const baseHtml = await readFile(basePath, "utf-8");
  const jd = await resolveJd(app);

  const german = GERMAN_REQ_META[app.germanReq as GermanReq]?.label ?? app.germanReq;
  // Feedback loop (v1.1): the previous grade's improvements steer this run.
  const prior = app.kitGrade as KitGrade | null;
  const feedback = prior?.improvements?.length
    ? `\n\nPRIOR GRADER FEEDBACK on the last version of this kit — address each point truthfully where possible (reframe/reorder/emphasize existing facts only, never fabricate):\n${prior.improvements.map((s, i) => `${i + 1}. ${s}`).join("\n")}`
    : "";
  const target =
    [
      `Company: ${app.company}`,
      `Role: ${app.roleTitle}`,
      app.location ? `Location: ${app.location}` : null,
      `German requirement: ${german} (candidate is A2 — position accordingly, never overstate)`,
    ]
      .filter(Boolean)
      .join("\n") + feedback;

  const warnings: string[] = [];

  // 1 · tailored resume, with one condense retry if it overflows one page
  let resumeHtml = extractHtmlDocument(
    await claudePrompt({
      model: MODEL,
      system: RESUME_SYSTEM,
      prompt: resumePrompt(baseHtml, jd, target),
      timeoutMs: KIT_CLI_TIMEOUT_MS,
    }),
  );
  let resumePdf = await renderPdf(resumeHtml);
  let resumePages = await pdfPageCount(resumePdf);
  if (resumePages > 1) {
    resumeHtml = extractHtmlDocument(
      await claudePrompt({
        model: MODEL,
        system: RESUME_SYSTEM,
        prompt: condensePrompt(resumeHtml),
        timeoutMs: KIT_CLI_TIMEOUT_MS,
      }),
    );
    resumePdf = await renderPdf(resumeHtml);
    resumePages = await pdfPageCount(resumePdf);
    if (resumePages > 1) warnings.push(`resume is still ${resumePages} pages after condensing — trim manually`);
  }

  // 2 · cover letter
  const dateLine = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const coverHtml = extractHtmlDocument(
    await claudePrompt({
      model: MODEL,
      system: COVER_SYSTEM,
      prompt: coverPrompt(clampText(htmlToText(baseHtml), 8_000), jd, target, dateLine),
      timeoutMs: KIT_CLI_TIMEOUT_MS,
    }),
  );
  const coverPdf = await renderPdf(coverHtml);

  // 3 · persist files + DB
  const dir = kitDir(app.id);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "resume.html"), resumeHtml);
  await writeFile(path.join(dir, "resume.pdf"), resumePdf);
  await writeFile(path.join(dir, "cover-letter.html"), coverHtml);
  await writeFile(path.join(dir, "cover-letter.pdf"), coverPdf);

  const resumeVariant = `${companySlug(app.company)}-${new Date().toISOString().slice(0, 10)}`;
  const now = new Date();
  await db
    .update(applications)
    .set({
      resumeVariant,
      coverPath: `kits/${app.id}/cover-letter.pdf`,
      isKitReady: true,
      lastActivityAt: now,
      updatedAt: now,
    })
    .where(eq(applications.id, app.id))
    .run();
  await db
    .insert(activities)
    .values({
      id: randomUUID(),
      applicationId: app.id,
      type: "note",
      title: "Kit generated — tailored CV + cover letter",
      body: warnings.length ? warnings.join("; ") : null,
      occurredAt: now,
      source: "system",
    })
    .run();

  // 4 · grade the fresh kit vs the same JD (non-fatal — the kit stands either way)
  let grade: KitGrade | null = null;
  try {
    const { gradeKit } = await import("./grade");
    grade = await gradeKit(app.id, { jd });
  } catch {
    warnings.push("grading failed — press Grade CV on the card to retry");
  }

  return {
    dir,
    resumeVariant,
    resumePages,
    warnings,
    files: ["resume.pdf", "resume.html", "cover-letter.pdf", "cover-letter.html"],
    grade,
  };
}

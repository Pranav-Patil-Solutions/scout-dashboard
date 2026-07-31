import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { htmlToText } from "@/lib/kit/text";

/**
 * JOBDASH-010 — the candidate context IS the base resume.
 *
 * There is deliberately no hand-maintained CANDIDATE_PROFILE object: a struct
 * listing my experience drifts from the document I actually send, and a grader
 * reading the stale struct grades a CV that does not exist. The grader reads
 * this file instead, so grading always reflects the real base resume.
 *
 * `resumeVersion` is a hash of the extracted TEXT, not of the file bytes, so a
 * pure-CSS or whitespace edit does not invalidate every cached grade — only a
 * change to what a recruiter would actually read does.
 */

/**
 * Canonical base resume. LOCKED to the 07-22 general refresh: the same file the
 * kit generator builds from (single source — lib/kit/generate.ts imports this).
 * Tailored CVs must NEVER be the grading source; grading against a role-tailored
 * document biases every assessment toward the role it was tailored for.
 */
export const BASE_RESUME_PATH =
  process.env.BASE_RESUME_PATH ??
  process.env.KIT_BASE_RESUME ??
  "/Users/pranavpatil/Downloads/pranav-essentials/C--Users-Pranav/linkedin-improvement/Pranav-Resume-2026-07-22.html";

export interface BaseResume {
  /** plain text as a recruiter reads it — what the grader receives */
  text: string;
  /** sha256 of `text`; a change invalidates cached grades */
  version: string;
}

let cached: { path: string; mtimeMs: number; resume: BaseResume } | null = null;

/** Read + extract the base resume. Cached per (path, mtime) — the grader loops
 * over hundreds of rows and must not re-read the file for each one. */
export async function loadBaseResume(path = BASE_RESUME_PATH): Promise<BaseResume> {
  const { stat } = await import("node:fs/promises");
  let mtimeMs: number;
  try {
    mtimeMs = (await stat(path)).mtimeMs;
  } catch {
    throw new Error(
      `Base resume not readable at ${path} — set BASE_RESUME_PATH to the current one.`,
    );
  }
  if (cached && cached.path === path && cached.mtimeMs === mtimeMs) return cached.resume;

  const html = await readFile(path, "utf-8");
  const text = htmlToText(html).trim();
  if (text.length < 200) {
    // A resume that extracts to nothing would grade every job identically and
    // silently — fail loudly instead.
    throw new Error(`Base resume at ${path} extracted to ${text.length} chars — too short to grade against.`);
  }
  const resume: BaseResume = { text, version: resumeVersion(text) };
  cached = { path, mtimeMs, resume };
  return resume;
}

export function resumeVersion(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

/** Test seam — drop the module-level cache. */
export function clearBaseResumeCache(): void {
  cached = null;
}

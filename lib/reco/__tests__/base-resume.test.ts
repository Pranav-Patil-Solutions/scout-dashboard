import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { clearBaseResumeCache, loadBaseResume, resumeVersion, BASE_RESUME_PATH } from "../base-resume";

/**
 * The base resume IS the candidate context, so two things must hold: it has to
 * be readable, and it must not describe the independent work as a company —
 * a founder-framed resume would inflate the seniority band the gate depends on.
 */

const FOUNDER_TOKENS = /\b(founder|co-?founder|CEO|my (startup|company))\b/i;

async function fixture(body: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "base-resume-"));
  const file = path.join(dir, "resume.html");
  await writeFile(file, `<html><body>${body}</body></html>`, "utf-8");
  return file;
}

const LONG = "Supply chain operations, SAP MM, just-in-time material flow. ".repeat(10);

beforeEach(() => clearBaseResumeCache());

describe("loadBaseResume", () => {
  it("extracts visible text and hashes it", async () => {
    const file = await fixture(`<h1>Pranav Patil</h1><p>${LONG}</p><script>ignored()</script>`);
    const resume = await loadBaseResume(file);
    expect(resume.text).toContain("Pranav Patil");
    expect(resume.text).not.toContain("ignored");
    expect(resume.version).toBe(resumeVersion(resume.text));
  });

  it("fails loudly on a missing file instead of grading against nothing", async () => {
    await expect(loadBaseResume("/nope/missing.html")).rejects.toThrow(/not readable/);
  });

  it("fails loudly when the file extracts to almost no text", async () => {
    const file = await fixture("<p>Hi</p>");
    await expect(loadBaseResume(file)).rejects.toThrow(/too short/);
  });

  it("changes version when the text changes — that is what invalidates grades", async () => {
    const a = await loadBaseResume(await fixture(`<p>${LONG}</p>`));
    clearBaseResumeCache();
    const b = await loadBaseResume(await fixture(`<p>${LONG} Extra line.</p>`));
    expect(a.version).not.toBe(b.version);
  });
});

describe("the configured base resume", () => {
  it("is readable and carries no founder framing", async () => {
    let resume;
    try {
      resume = await loadBaseResume();
    } catch {
      // The canonical path is a local absolute path; on a machine without it,
      // skip rather than fail the suite. CI on Pranav's Mac does have it.
      console.warn(`base resume not present at ${BASE_RESUME_PATH} — skipping content guard`);
      return;
    }
    expect(resume.text.length).toBeGreaterThan(1000);
    expect(resume.text).not.toMatch(FOUNDER_TOKENS);
    expect(resume.text).toMatch(/self-directed side projects/i);
  });
});

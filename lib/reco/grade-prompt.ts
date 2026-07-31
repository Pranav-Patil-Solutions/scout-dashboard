import { HARD_FACTS, FRAMING_RULE } from "./hard-facts";
import {
  DIMENSION_WEIGHTS,
  DIMENSIONS,
  HARD_GATES,
  isHardGate,
  type Assessment,
  type Dimension,
  type HardGate,
} from "./fit-grade";

/**
 * JOBDASH-010 — prompt construction and reply validation for the fit grader.
 * Split from grade-job.ts (which owns the DB + CLI orchestration) so the prompt
 * text and the parser are unit-testable without mocking a subprocess.
 */

export const GRADE_SYSTEM = `You are screening jobs FOR one candidate. You are given the candidate's real base resume, a small set of hard facts that override anything you might infer from the resume, and one job description. Decide how applyable this job is.

HARD FACTS (authoritative — never contradict these, never infer around them):
${JSON.stringify(HARD_FACTS, null, 2)}

FRAMING RULE (authoritative):
${FRAMING_RULE}

HARD GATES — you must return a verdict for EVERY gate, one at a time. A gate that fails disqualifies the job outright:
${Object.entries(HARD_GATES)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join("\n")}

Gate discipline (this is the part graders get wrong): if your verdict sentence says the job is disqualified for a reason, the matching gate MUST be marked fails:true. Never describe a disqualifier in prose while leaving its gate false, and never compensate by pushing the dimension scores down instead — the dimensions are a separate question.

DIMENSIONS — score 0-100 each, ONLY if no hard gate fails (if a gate fails, score them anyway but they will be ignored):
${Object.entries(DIMENSION_WEIGHTS)
  .map(([k, w]) => `- ${k} (weight ${w})`)
  .join("\n")}

Be strict. A job the candidate would be screened out of on the first pass must fail its gate — do not soften a gate because the rest of the posting looks appealing. You do NOT pick a letter grade; code computes it from your numbers.

Respond with ONLY a raw JSON object — no markdown fences, no prose — shaped exactly:
{"gates": {"G1": {"fails": boolean, "why": "short"}, "G2": {"fails": boolean, "why": "short"}, "G3": {"fails": boolean, "why": "short"}, "G4": {"fails": boolean, "why": "short"}}, "dimensions": {"seniorityFit": number, "domainFit": number, "mustHaveSkillsCoverage": number, "langLocationFit": number}, "oneLineVerdict": "one sentence"}`;

export interface GradePromptInput {
  company: string | null;
  title: string | null;
  jd: string;
  resumeText: string;
}

export function buildGradePrompt({ company, title, jd, resumeText }: GradePromptInput): string {
  return `TARGET
Company: ${company?.trim() || "Unknown company"}
Role: ${title?.trim() || "Untitled role"}

JOB DESCRIPTION
${jd}

CANDIDATE BASE RESUME (plain text — this is the real document, grade against it)
${resumeText}

Grade this job now.`;
}

/** Gate verdicts from either the per-gate object (current) or the legacy array. */
function parseGates(v: Record<string, unknown>): HardGate[] {
  const gates = v.gates;
  if (typeof gates === "object" && gates !== null && !Array.isArray(gates)) {
    const record = gates as Record<string, unknown>;
    return (Object.keys(HARD_GATES) as HardGate[]).filter((key) => {
      const entry = record[key];
      if (typeof entry === "boolean") return entry;
      if (typeof entry === "object" && entry !== null) {
        return (entry as { fails?: unknown }).fails === true;
      }
      return false;
    });
  }
  const legacy = Array.isArray(v.hardGateFails) ? v.hardGateFails : [];
  return [...new Set(legacy.filter(isHardGate))];
}

function clamp100(n: unknown, label: string): number {
  if (typeof n !== "number" || Number.isNaN(n)) throw new Error(`${label} is not a number`);
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Validate a model reply into an Assessment.
 *
 * Gates come back as a per-gate object with an explicit boolean, NOT a free
 * array of codes. Smoke-testing the array form caught the failure mode this
 * guards against: on a director-level posting the model wrote "hard-gated out:
 * …neither team management nor budget ownership" in its verdict and returned
 * `hardGateFails: []`. The letter happened to land on F because it also pushed
 * the dimensions down — but a strong-domain executive role would have sailed
 * through. Asking for a verdict on every gate makes omission impossible;
 * the legacy array shape is still accepted so an older cached reply parses.
 *
 * Unknown gate codes are dropped rather than thrown on — a hallucinated "G7"
 * must not fail the whole grade, but it must never become a gate either.
 */
export function validateAssessment(value: unknown): Assessment {
  if (typeof value !== "object" || value === null) throw new Error("assessment is not an object");
  const v = value as Record<string, unknown>;

  const hardGateFails = parseGates(v);

  const rawDims = (v.dimensions ?? {}) as Record<string, unknown>;
  const dimensions = {} as Record<Dimension, number>;
  for (const d of DIMENSIONS) dimensions[d] = clamp100(rawDims[d], `dimensions.${d}`);

  const oneLineVerdict = typeof v.oneLineVerdict === "string" ? v.oneLineVerdict.trim() : "";
  if (!oneLineVerdict) throw new Error("missing oneLineVerdict");

  return { hardGateFails, dimensions, oneLineVerdict };
}

/** Pull the first JSON object out of a model reply (fences/preamble-tolerant). */
export function extractJsonObject(reply: string): string {
  const fenced = reply.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : reply).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("no JSON object in reply");
  return candidate.slice(start, end + 1);
}

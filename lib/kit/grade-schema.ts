/** Pure grade shape + validation for the CV grader (JOBDASH-005 v1.1) — unit-tested. */

export interface KitGradeSubscores {
  /** keyword/skills coverage vs the JD */
  keywords: number;
  /** relevance of experience to the role's actual work */
  experience: number;
  /** seniority/level fit */
  seniority: number;
  /** quantified evidence & specificity */
  evidence: number;
}

export interface KitGrade {
  /** relatability 0–100 vs the live posting */
  overall: number;
  subscores: KitGradeSubscores;
  matched_keywords: string[];
  missing_keywords: string[];
  red_flags: string[];
  /** actionable, truth-preserving fixes — fed back into the next generation */
  improvements: string[];
  /** one-sentence recruiter verdict */
  verdict: string;
  graded_at: string;
  model: string;
}

const SUBSCORE_KEYS = ["keywords", "experience", "seniority", "evidence"] as const;

function clamp100(n: unknown, label: string): number {
  if (typeof n !== "number" || Number.isNaN(n)) throw new Error(`${label} is not a number`);
  return Math.max(0, Math.min(100, Math.round(n)));
}

function strings(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .map((s) => s.trim())
    .slice(0, max);
}

/** Validate + normalize a model reply into a KitGrade (graded_at/model stamped by caller). */
export function validateKitGrade(value: unknown): Omit<KitGrade, "graded_at" | "model"> {
  if (typeof value !== "object" || value === null) throw new Error("grade is not an object");
  const v = value as Record<string, unknown>;
  const rawSub = (v.subscores ?? {}) as Record<string, unknown>;
  const subscores = {} as KitGradeSubscores;
  for (const key of SUBSCORE_KEYS) subscores[key] = clamp100(rawSub[key], `subscores.${key}`);
  const verdict = typeof v.verdict === "string" ? v.verdict.trim() : "";
  if (!verdict) throw new Error("missing verdict");
  const improvements = strings(v.improvements, 8);
  if (improvements.length === 0) throw new Error("missing improvements");
  return {
    overall: clamp100(v.overall, "overall"),
    subscores,
    matched_keywords: strings(v.matched_keywords, 20),
    missing_keywords: strings(v.missing_keywords, 20),
    red_flags: strings(v.red_flags, 6),
    improvements,
    verdict,
  };
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

/** Tone for a 0–100 grade — matches the app's fit-band thresholds. */
export function gradeTone(overall: number): string {
  return overall >= 75 ? "#17c08a" : overall >= 50 ? "#fbb03b" : "#fb5473";
}

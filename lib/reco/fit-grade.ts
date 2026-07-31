/**
 * JOBDASH-010 — the apply-readiness rubric. Pure, no IO, no LLM: the model
 * scores dimensions and reports which hard gates fail, and THIS file turns that
 * into the letter. Keeping the thresholds in code is the point — a grade the
 * model picked ("felt like a B") is neither auditable nor stable across runs.
 */

export const FIT_GRADES = ["A", "B", "C", "D", "F"] as const;
export type FitGrade = (typeof FIT_GRADES)[number];

/** Only these may enter "To apply". C parks for review; D/F stay in Discover. */
export const APPLY_ALLOWED_GRADES = ["A", "B"] as const;

export const HARD_GATES = {
  G1: "VISA/GEO — needs work authorisation the candidate lacks (US-only, or non-EU without sponsorship)",
  G2: "SENIORITY — requires director/VP/head, team leadership, budget ownership, or significant leadership experience",
  G3: "SPECIALISM — a must-have the candidate does not have (deep ML/robotics research, PhD-required, licensed profession)",
  G4: "LANGUAGE — mandatory native/fluent (C1+) German",
} as const;
export type HardGate = keyof typeof HARD_GATES;

export const DIMENSION_WEIGHTS = {
  seniorityFit: 30,
  domainFit: 25,
  mustHaveSkillsCoverage: 25,
  langLocationFit: 20,
} as const;
export type Dimension = keyof typeof DIMENSION_WEIGHTS;
export const DIMENSIONS = Object.keys(DIMENSION_WEIGHTS) as Dimension[];

/** Band floors, checked high to low. */
const BANDS: { grade: FitGrade; min: number }[] = [
  { grade: "A", min: 85 },
  { grade: "B", min: 70 },
  { grade: "C", min: 55 },
  { grade: "D", min: 40 },
];

export interface Assessment {
  hardGateFails: HardGate[];
  dimensions: Record<Dimension, number>;
  oneLineVerdict: string;
}

export interface GradedAssessment extends Assessment {
  grade: FitGrade;
  /** weighted 0..100 composite; null when a hard gate short-circuited it */
  composite: number | null;
}

export function isHardGate(value: unknown): value is HardGate {
  return typeof value === "string" && value in HARD_GATES;
}

export function isFitGrade(value: unknown): value is FitGrade {
  return typeof value === "string" && (FIT_GRADES as readonly string[]).includes(value);
}

export function compositeScore(dimensions: Record<Dimension, number>): number {
  const total = DIMENSIONS.reduce((sum, d) => sum + dimensions[d] * DIMENSION_WEIGHTS[d], 0);
  const weight = DIMENSIONS.reduce((sum, d) => sum + DIMENSION_WEIGHTS[d], 0);
  return Math.round(total / weight);
}

/** The letter. Any hard gate → F, whatever the dimensions say. */
export function gradeFromAssessment(a: Assessment): FitGrade {
  if (a.hardGateFails.length > 0) return "F";
  const composite = compositeScore(a.dimensions);
  return BANDS.find((b) => composite >= b.min)?.grade ?? "F";
}

export function gradeAssessment(a: Assessment): GradedAssessment {
  const gated = a.hardGateFails.length > 0;
  return {
    ...a,
    grade: gradeFromAssessment(a),
    composite: gated ? null : compositeScore(a.dimensions),
  };
}

export function isApplyEligible(grade: FitGrade | null | undefined): boolean {
  return grade != null && (APPLY_ALLOWED_GRADES as readonly string[]).includes(grade);
}

/** Short "why" for the Discover row: the failed gate wins, else the verdict. */
export function gradeReason(a: Pick<GradedAssessment, "hardGateFails" | "oneLineVerdict">): string {
  if (a.hardGateFails.length === 0) return a.oneLineVerdict;
  return a.hardGateFails.map((g) => `⛔ ${g} ${HARD_GATES[g].split(" — ")[0]}`).join(" · ");
}

/** Chip colour, matching the app's existing fit-band tones. */
export function gradeTone(grade: FitGrade): string {
  if (grade === "A" || grade === "B") return "#17c08a";
  if (grade === "C") return "#fbb03b";
  return "#fb5473";
}

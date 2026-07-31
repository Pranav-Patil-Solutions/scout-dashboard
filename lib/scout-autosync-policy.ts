import { GATE_FAIL_CAP, gateFailure } from "./constants";
import { isApplyEligible, isFitGrade } from "./reco/fit-grade";

/**
 * JOBDASH-009 auto-apply POLICY — the pure decision, no IO, no server-only
 * imports, so it can be unit-tested and imported from anywhere (the way
 * posting-verdict.ts is split from posting-check.ts). The DB orchestration
 * lives in scout-autosync.ts.
 */

/** Only "strong fit" (constants.ts deriveFitBand ≥ 75) auto-applies. */
export const AUTO_APPLY_MIN_SCORE = 75;

/** The minimal shape the eligibility decision needs (a scoutJobs row). */
export interface AutoApplyCandidate {
  status: string;
  score: number | null;
  reason: string | null;
  emailedAt: Date | null;
  /** JOBDASH-010 apply-readiness grade; null = ungraded. */
  fitGrade?: string | null;
}

/**
 * JOBDASH-010 gate switch. ON by default — that is the whole point of the
 * ticket — and `FIT_GRADE_GATE=off` falls straight back to JOBDASH-009
 * behaviour without a deploy if the grader ever misfires.
 */
export function isFitGateEnabled(): boolean {
  return (process.env.FIT_GRADE_GATE ?? "on").toLowerCase() !== "off";
}

/**
 * May this job enter "To apply"? A/B yes, C parks for review, D/F stay in
 * Discover — and UNGRADED is not eligible either: a job nobody has read the JD
 * of is exactly the case that put executive and US-only roles on the board.
 */
export function passesFitGate(fitGrade: string | null | undefined): boolean {
  if (!isFitGateEnabled()) return true;
  if (!isFitGrade(fitGrade)) return false;
  return isApplyEligible(fitGrade);
}

/**
 * The MANUAL bar, which is deliberately one band lower. A/B auto-add; C is the
 * review lane — visible, blocked from auto-add, but addable with a human click,
 * because "borderline, I'll decide" is a real answer. D/F and ungraded are not
 * addable either way; those are the roles this ticket exists to keep off the
 * board.
 */
export function passesManualApplyGate(fitGrade: string | null | undefined): boolean {
  if (!isFitGateEnabled()) return true;
  if (!isFitGrade(fitGrade)) return false;
  return isApplyEligible(fitGrade) || fitGrade === "C";
}

/**
 * Should this scout job be auto-added to "To apply"? All conditions must hold —
 * it would rather skip a borderline job than clutter the board with one the user
 * must then triage away.
 */
export function isAutoApplyEligible(job: AutoApplyCandidate): boolean {
  if (job.status !== "new") return false;
  if (job.emailedAt == null) return false;
  if ((job.score ?? 0) < AUTO_APPLY_MIN_SCORE) return false;
  // A gated job can still carry a stale ≥75 score; the "⛔ Gn" marker in the
  // reason is the authority, and the cap is a second guard if a reason is blank.
  if (gateFailure(job.reason)) return false;
  if ((job.score ?? 0) <= GATE_FAIL_CAP) return false;
  // JOBDASH-010 — the title-scorer's ≥75 is a pre-filter, not a verdict. The
  // JD-level grade is the one that decides, and it can veto a 90-scoring title.
  if (!passesFitGate(job.fitGrade)) return false;
  return true;
}

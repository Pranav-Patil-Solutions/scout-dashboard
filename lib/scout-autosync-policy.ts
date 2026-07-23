import { GATE_FAIL_CAP, gateFailure } from "./constants";

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
  return true;
}

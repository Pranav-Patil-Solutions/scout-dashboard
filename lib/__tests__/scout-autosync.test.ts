import { describe, expect, it } from "vitest";
import {
  AUTO_APPLY_MIN_SCORE,
  isAutoApplyEligible,
  type AutoApplyCandidate,
} from "../scout-autosync-policy";

const EMAILED = new Date("2026-07-23T06:00:00Z");

function candidate(overrides: Partial<AutoApplyCandidate> = {}): AutoApplyCandidate {
  return {
    status: "new",
    score: 88,
    reason: "strong role match in title; English-friendly",
    emailedAt: EMAILED,
    ...overrides,
  };
}

describe("isAutoApplyEligible", () => {
  it("promotes an emailed strong-fit new job", () => {
    expect(isAutoApplyEligible(candidate())).toBe(true);
  });

  it("requires the job to have been emailed (daily digest)", () => {
    expect(isAutoApplyEligible(candidate({ emailedAt: null }))).toBe(false);
  });

  it("only promotes 'new' rows — never a dismissed or already-promoted one", () => {
    expect(isAutoApplyEligible(candidate({ status: "promoted" }))).toBe(false);
    expect(isAutoApplyEligible(candidate({ status: "dismissed" }))).toBe(false);
  });

  it("holds the score-75 line: 75 promotes, 74 does not", () => {
    expect(isAutoApplyEligible(candidate({ score: AUTO_APPLY_MIN_SCORE }))).toBe(true);
    expect(isAutoApplyEligible(candidate({ score: AUTO_APPLY_MIN_SCORE - 1 }))).toBe(false);
  });

  it("never promotes a gated job even if a stale score reads >= 75", () => {
    // The scraper caps a gated job at 25, but a mid-migration row could carry an
    // old high score with the gate marker still in the reason — the marker wins.
    const gated = candidate({
      score: 88,
      reason: "⛔ G2 STARTUP/SCALEUP: enterprise/corporate employer (Ericsson)",
    });
    expect(isAutoApplyEligible(gated)).toBe(false);
  });

  it("never promotes a job sitting at or below the gate cap", () => {
    expect(isAutoApplyEligible(candidate({ score: 25, reason: null }))).toBe(false);
  });

  it("treats a null score as ineligible, not as zero-that-passes", () => {
    expect(isAutoApplyEligible(candidate({ score: null }))).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { buildProposals } from "../propose";
import type { MatchResult } from "../match";
import { makeApp, makeClassification, makeEvent } from "./fixtures";

const HIGH_MATCH: MatchResult = { applicationId: "app-1", confidence: 0.9, method: "company" };

describe("buildProposals", () => {
  it("proposes a pending set_status rejection for a rejection on a matched active app (never auto-apply)", () => {
    const app = makeApp({ id: "app-1", status: "interview" });
    const c = makeClassification({ category: "rejection", confidence: 0.9 });
    const event = makeEvent();

    const drafts = buildProposals(event, c, { app, match: HIGH_MATCH });

    const statusDraft = drafts.find((d) => d.type === "set_status");
    expect(statusDraft).toBeDefined();
    expect(statusDraft!.payload.toStatus).toBe("rejected");
    expect(statusDraft!.autoApply).toBe(false);
  });

  it("suppresses a backwards set_status proposal for a historical confirmation email", () => {
    const lastActivityAt = new Date("2026-03-01T00:00:00Z");
    const app = makeApp({ id: "app-1", status: "interview", lastActivityAt });
    const c = makeClassification({ category: "application_confirmation", confidence: 0.9 });
    // older than lastActivityAt
    const event = makeEvent({ receivedAt: new Date("2026-01-01T00:00:00Z") });

    const drafts = buildProposals(event, c, { app, match: HIGH_MATCH });

    expect(drafts.some((d) => d.type === "set_status")).toBe(false);
    // the activity itself is still logged
    expect(drafts.some((d) => d.type === "log_activity")).toBe(true);
  });

  it("flags a non-historical backwards confirmation as a downgrade instead of silently applying it", () => {
    const lastActivityAt = new Date("2026-01-01T00:00:00Z");
    const app = makeApp({ id: "app-1", status: "interview", lastActivityAt });
    const c = makeClassification({ category: "application_confirmation", confidence: 0.9 });
    // newer than lastActivityAt
    const event = makeEvent({ receivedAt: new Date("2026-03-01T00:00:00Z") });

    const drafts = buildProposals(event, c, { app, match: HIGH_MATCH });

    const statusDraft = drafts.find((d) => d.type === "set_status");
    expect(statusDraft).toBeDefined();
    expect(statusDraft!.payload.flags.downgrade).toBe(true);
    expect(statusDraft!.autoApply).toBe(false);
  });

  it("marks low combined confidence as low-confidence and non-auto-appliable", () => {
    const app = makeApp({ id: "app-1", status: "applied" });
    const c = makeClassification({ category: "interview_invite", confidence: 0.7 });
    const lowMatch: MatchResult = { applicationId: "app-1", confidence: 0.7, method: "company" }; // 0.7*0.7=0.49 < 0.6

    const drafts = buildProposals(makeEvent(), c, { app, match: lowMatch });

    const activity = drafts.find((d) => d.type === "log_activity");
    expect(activity).toBeDefined();
    expect(activity!.payload.flags.lowConfidence).toBe(true);
    expect(activity!.autoApply).toBe(false);
  });

  it("creates an add_application proposal for an unmatched rejection with a company", () => {
    const c = makeClassification({ category: "rejection", company: "NewCo", confidence: 0.9 });

    const drafts = buildProposals(makeEvent(), c, null);

    expect(drafts).toHaveLength(1);
    expect(drafts[0].type).toBe("add_application");
    expect(drafts[0].payload.initialStatus).toBe("rejected");
    expect(drafts[0].payload.flags.unmatched).toBe(true);
  });

  it("produces zero proposals for other_not_relevant", () => {
    const c = makeClassification({ category: "other_not_relevant", is_job_related: true });
    expect(buildProposals(makeEvent(), c, null)).toHaveLength(0);
  });

  it("produces zero proposals when is_job_related is false", () => {
    const c = makeClassification({ category: "rejection", is_job_related: false });
    expect(buildProposals(makeEvent(), c, null)).toHaveLength(0);
  });
});

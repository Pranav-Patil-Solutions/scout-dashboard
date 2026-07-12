import { describe, expect, it } from "vitest";
import { BODY_REDACTED, leaksBody, scrubClassification } from "../privacy";
import { buildProposals } from "../propose";
import { makeApp, makeClassification, makeEvent } from "./fixtures";

const SUBJECT = "Thanks for your application";
const SNIPPET = "We have reviewed your application and while we're very happy";
const BODY =
  "We have reviewed your application and while we're very happy that you found us interesting, " +
  "I'm sorry to say that we'll be continuing with other candidates for this particular role.";

describe("§8 scrub — scrubClassification", () => {
  it("redacts an evidence quote lifted verbatim from the body", () => {
    const c = makeClassification({
      evidence_quote: "we'll be continuing with other candidates for this particular role",
    });
    const out = scrubClassification(c, SUBJECT, SNIPPET, BODY);
    expect(out.evidence_quote).toBe(BODY_REDACTED);
  });

  it("keeps evidence that is visible in the persisted snippet", () => {
    const quote = "We have reviewed your application and while we're very happy";
    const c = makeClassification({ evidence_quote: quote });
    const out = scrubClassification(c, SUBJECT, SNIPPET, BODY);
    expect(out.evidence_quote).toBe(quote);
  });

  it("redacts a rationale that embeds a long verbatim body chunk", () => {
    const c = makeClassification({
      rationale: `Clearly a rejection because it says "continuing with other candidates for this particular role" near the end.`,
    });
    const out = scrubClassification(c, SUBJECT, SNIPPET, BODY);
    expect(out.rationale).toBe(BODY_REDACTED);
  });

  it("is a no-op when no body was ever available to the model", () => {
    const c = makeClassification({ evidence_quote: "anything the model paraphrased" });
    expect(scrubClassification(c, SUBJECT, SNIPPET, null)).toEqual(c);
  });

  it("leaksBody exempts windows that also appear in visible text", () => {
    expect(leaksBody(SNIPPET, BODY.toLowerCase(), SNIPPET.toLowerCase())).toBe(false);
  });
});

describe("§7 — historical rejection guard (review blocker 2)", () => {
  it("skips a set_status→rejected proposal when the rejection email predates lastActivityAt", () => {
    const app = makeApp({
      status: "interview",
      lastActivityAt: new Date("2026-03-01T00:00:00Z"),
    });
    const event = makeEvent({ receivedAt: new Date("2026-02-01T00:00:00Z") });
    const c = makeClassification({ category: "rejection", confidence: 0.95 });
    const drafts = buildProposals(event, c, {
      app,
      match: { applicationId: app.id, confidence: 0.95, method: "company+role" },
    });
    expect(drafts.some((d) => d.type === "set_status")).toBe(false);
    expect(drafts.some((d) => d.type === "log_activity")).toBe(true);
  });

  it("still proposes rejected when the rejection email is newer than lastActivityAt", () => {
    const app = makeApp({
      status: "interview",
      lastActivityAt: new Date("2026-01-15T00:00:00Z"),
    });
    const event = makeEvent({ receivedAt: new Date("2026-02-01T00:00:00Z") });
    const c = makeClassification({ category: "rejection", confidence: 0.95 });
    const drafts = buildProposals(event, c, {
      app,
      match: { applicationId: app.id, confidence: 0.95, method: "company+role" },
    });
    const setStatus = drafts.find((d) => d.type === "set_status");
    expect(setStatus?.payload.toStatus).toBe("rejected");
    expect(setStatus?.autoApply).toBe(false);
  });
});

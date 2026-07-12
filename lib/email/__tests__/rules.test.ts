import { describe, expect, it } from "vitest";
import { classifyByRules } from "../rules";
import type { RawEmail } from "../types";

function email(overrides: Partial<RawEmail> = {}): RawEmail {
  return {
    gmailMessageId: "g-1",
    threadId: "t-1",
    sender: "jobs@greenhouse.io",
    subject: "Your application to Acme",
    snippet: "",
    body: "",
    receivedAt: "2026-02-01T00:00:00Z",
    direction: "inbound",
    ...overrides,
  };
}

describe("classifyByRules", () => {
  it("prefers the rejection pattern over a confirmation opener from an ATS sender", () => {
    const result = classifyByRules(
      email({
        body:
          "Thank you for applying to Acme. After review, we will not be moving forward with your candidacy.",
      }),
    );
    expect(result).not.toBeNull();
    expect(result!.category).toBe("rejection");
    expect(result!.classified_by).toBe("rules");
  });

  it("defers to the LLM when decision language precedes a confirmation opener without a stated verdict", () => {
    const result = classifyByRules(
      email({
        body:
          "Thank you for applying to Acme. We have taken some time over the decision and will follow up soon.",
      }),
    );
    expect(result).toBeNull();
  });

  it("does not pattern-match rejection language from a non-ATS sender", () => {
    const result = classifyByRules(
      email({
        sender: "ads@businessschool.com",
        body: "Our program decided not to move forward with the old curriculum this year.",
      }),
    );
    expect(result).toBeNull();
  });
});

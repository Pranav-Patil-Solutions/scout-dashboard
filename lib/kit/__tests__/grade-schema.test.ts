import { describe, expect, it } from "vitest";
import { extractJsonObject, gradeTone, validateKitGrade } from "../grade-schema";

const VALID = {
  overall: 72,
  subscores: { keywords: 60, experience: 80, seniority: 75, evidence: 70 },
  matched_keywords: ["SAP MM", "KPI dashboards"],
  missing_keywords: ["Salesforce"],
  red_flags: [],
  improvements: ["Surface the Salesforce-adjacent CRM work in the summary"],
  verdict: "Solid ops match, light on the named stack.",
};

describe("validateKitGrade", () => {
  it("accepts a valid grade and passes fields through", () => {
    const g = validateKitGrade(VALID);
    expect(g.overall).toBe(72);
    expect(g.subscores.experience).toBe(80);
    expect(g.improvements).toHaveLength(1);
  });

  it("clamps out-of-range scores to 0–100", () => {
    const g = validateKitGrade({
      ...VALID,
      overall: 140,
      subscores: { ...VALID.subscores, keywords: -10 },
    });
    expect(g.overall).toBe(100);
    expect(g.subscores.keywords).toBe(0);
  });

  it("rejects a grade with no verdict or no improvements", () => {
    expect(() => validateKitGrade({ ...VALID, verdict: "" })).toThrow();
    expect(() => validateKitGrade({ ...VALID, improvements: [] })).toThrow();
  });

  it("rejects non-numeric subscores and caps list lengths", () => {
    expect(() =>
      validateKitGrade({ ...VALID, subscores: { ...VALID.subscores, evidence: "high" } }),
    ).toThrow();
    const g = validateKitGrade({
      ...VALID,
      missing_keywords: Array.from({ length: 40 }, (_, i) => `kw${i}`),
    });
    expect(g.missing_keywords).toHaveLength(20);
  });
});

describe("extractJsonObject", () => {
  it("unwraps fenced and preambled replies", () => {
    const json = JSON.stringify(VALID);
    expect(extractJsonObject(json)).toBe(json);
    expect(extractJsonObject("Here you go:\n```json\n" + json + "\n```")).toBe(json);
  });

  it("throws when no object is present", () => {
    expect(() => extractJsonObject("no json here")).toThrow();
  });
});

describe("gradeTone", () => {
  it("matches the app's fit-band thresholds", () => {
    expect(gradeTone(80)).toBe("#17c08a");
    expect(gradeTone(60)).toBe("#fbb03b");
    expect(gradeTone(30)).toBe("#fb5473");
  });
});

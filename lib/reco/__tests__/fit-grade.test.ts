import { describe, expect, it } from "vitest";
import {
  APPLY_ALLOWED_GRADES,
  compositeScore,
  gradeAssessment,
  gradeFromAssessment,
  gradeReason,
  isApplyEligible,
  type Assessment,
  type Dimension,
} from "../fit-grade";
import { HARD_FACTS, FRAMING_RULE } from "../hard-facts";
import { GRADE_SYSTEM, buildGradePrompt, extractJsonObject, validateAssessment } from "../grade-prompt";
import { isAutoApplyEligible, passesFitGate } from "../../scout-autosync-policy";

/** An assessment whose composite lands exactly on `target`. */
function at(target: number, gates: Assessment["hardGateFails"] = []): Assessment {
  const dimensions = {
    seniorityFit: target,
    domainFit: target,
    mustHaveSkillsCoverage: target,
    langLocationFit: target,
  } as Record<Dimension, number>;
  return { hardGateFails: gates, dimensions, oneLineVerdict: "test" };
}

describe("rubric — hard gates", () => {
  it.each(["G1", "G2", "G3", "G4"] as const)("%s failing forces F, whatever the scores", (gate) => {
    // 100 across the board: only the gate can be producing the F.
    expect(gradeFromAssessment(at(100, [gate]))).toBe("F");
  });

  it("a gated assessment reports no composite — the number would be misleading", () => {
    expect(gradeAssessment(at(100, ["G2"])).composite).toBeNull();
    expect(gradeAssessment(at(100)).composite).toBe(100);
  });

  it("names the failed gate as the reason, in place of the verdict", () => {
    const reason = gradeReason({ hardGateFails: ["G1"], oneLineVerdict: "looks great" });
    expect(reason).toContain("G1");
    expect(reason).not.toContain("looks great");
  });
});

describe("rubric — band boundaries", () => {
  it.each([
    [100, "A"],
    [85, "A"],
    [84, "B"],
    [70, "B"],
    [69, "C"],
    [55, "C"],
    [54, "D"],
    [40, "D"],
    [39, "F"],
    [0, "F"],
  ] as const)("composite %i grades %s", (score, grade) => {
    expect(gradeFromAssessment(at(score))).toBe(grade);
  });

  it("weights seniority heaviest — the dimension that gets me screened out", () => {
    const strongSeniority = compositeScore({
      seniorityFit: 100, domainFit: 0, mustHaveSkillsCoverage: 0, langLocationFit: 0,
    });
    const strongLanguage = compositeScore({
      seniorityFit: 0, domainFit: 0, mustHaveSkillsCoverage: 0, langLocationFit: 100,
    });
    expect(strongSeniority).toBeGreaterThan(strongLanguage);
  });
});

describe("apply eligibility", () => {
  it("allows only A and B", () => {
    expect(APPLY_ALLOWED_GRADES).toEqual(["A", "B"]);
    expect(isApplyEligible("A")).toBe(true);
    expect(isApplyEligible("B")).toBe(true);
    for (const g of ["C", "D", "F"] as const) expect(isApplyEligible(g)).toBe(false);
  });

  it("treats ungraded as NOT eligible — the whole point of the gate", () => {
    expect(isApplyEligible(null)).toBe(false);
    expect(passesFitGate(null)).toBe(false);
    expect(passesFitGate(undefined)).toBe(false);
  });

  it("blocks a C/D/F job from auto-apply even with a perfect title score", () => {
    const base = {
      status: "new",
      score: 95,
      reason: "strong title match",
      emailedAt: new Date(),
    };
    expect(isAutoApplyEligible({ ...base, fitGrade: "A" })).toBe(true);
    for (const g of ["C", "D", "F"] as const) {
      expect(isAutoApplyEligible({ ...base, fitGrade: g })).toBe(false);
    }
    expect(isAutoApplyEligible({ ...base, fitGrade: null })).toBe(false);
  });
});

describe("hard facts + framing rule (revision 2)", () => {
  it("declares the independent products are not a company", () => {
    expect(HARD_FACTS.startupFounder).toBe(false);
    expect(HARD_FACTS.peopleManagement).toBe(false);
    expect(HARD_FACTS.budgetOwnership).toBe(false);
  });

  it("puts the framing rule in the grader's system prompt", () => {
    expect(GRADE_SYSTEM).toContain(FRAMING_RULE);
    expect(GRADE_SYSTEM).toMatch(/SIDE PROJECTS/);
    expect(GRADE_SYSTEM).toMatch(/startupFounder/);
    // the facts themselves must reach the model, not just be described
    expect(GRADE_SYSTEM).toContain('"startupFounder": false');
  });

  it("an executive JD still fails G2 — five shipped products are not leadership", () => {
    // The grader reports the gate; the rubric must not soften it because the
    // other dimensions are strong (they would be: it's the right domain).
    const headOfRole = at(95, ["G2"]);
    expect(gradeFromAssessment(headOfRole)).toBe("F");
    expect(isApplyEligible(gradeFromAssessment(headOfRole))).toBe(false);
  });
});

describe("prompt + reply parsing", () => {
  it("passes the real resume text through, not a summary of it", () => {
    const prompt = buildGradePrompt({
      company: "Acme",
      title: "AI Ops",
      jd: "Do AI ops.",
      resumeText: "SAP MM and just-in-time material flow for a plant.",
    });
    expect(prompt).toContain("SAP MM and just-in-time material flow");
    expect(prompt).toContain("Do AI ops.");
  });

  it("parses the per-gate object", () => {
    const a = validateAssessment({
      gates: {
        G1: { fails: false, why: "EU role" },
        G2: { fails: true, why: "team of 6 + budget" },
        G3: { fails: false, why: "no specialism" },
        G4: { fails: false, why: "English" },
      },
      dimensions: { seniorityFit: 10, domainFit: 80, mustHaveSkillsCoverage: 70, langLocationFit: 90 },
      oneLineVerdict: "Too senior.",
    });
    expect(a.hardGateFails).toEqual(["G2"]);
    expect(a.dimensions.domainFit).toBe(80);
  });

  it("accepts a bare boolean per gate as well as {fails}", () => {
    const a = validateAssessment({
      gates: { G1: false, G2: true, G3: false, G4: { fails: true } },
      dimensions: { seniorityFit: 1, domainFit: 1, mustHaveSkillsCoverage: 1, langLocationFit: 1 },
      oneLineVerdict: "x",
    });
    expect(a.hardGateFails).toEqual(["G2", "G4"]);
  });

  it("still parses the legacy array shape, dropping hallucinated codes", () => {
    const a = validateAssessment({
      hardGateFails: ["G2", "G9", "sideways"],
      dimensions: { seniorityFit: 1, domainFit: 1, mustHaveSkillsCoverage: 1, langLocationFit: 1 },
      oneLineVerdict: "x",
    });
    expect(a.hardGateFails).toEqual(["G2"]);
  });

  it("REGRESSION: a gate narrated in prose but omitted from the object stays a miss the dimensions cannot hide", () => {
    // The real reply that motivated the per-gate object: verdict said
    // "hard-gated out", gates said nothing. With the object shape the model has
    // to answer G2 explicitly; if it still says false we at least fail loudly in
    // review rather than silently promoting an executive role.
    const a = validateAssessment({
      gates: { G1: { fails: false }, G2: { fails: false }, G3: { fails: false }, G4: { fails: false } },
      dimensions: { seniorityFit: 92, domainFit: 90, mustHaveSkillsCoverage: 88, langLocationFit: 90 },
      oneLineVerdict: "Hard-gated out: director-level people and budget leadership.",
    });
    expect(a.hardGateFails).toEqual([]);
    // …which is exactly why the prompt forbids it — asserted on the prompt text:
    expect(GRADE_SYSTEM).toMatch(/MUST be marked fails:true/);
    expect(GRADE_SYSTEM).toMatch(/never compensate by pushing the dimension scores down/);
  });

  it("clamps out-of-range scores and rejects unusable replies", () => {
    const a = validateAssessment({
      hardGateFails: [],
      dimensions: { seniorityFit: 140, domainFit: -20, mustHaveSkillsCoverage: 50, langLocationFit: 50 },
      oneLineVerdict: "x",
    });
    expect(a.dimensions.seniorityFit).toBe(100);
    expect(a.dimensions.domainFit).toBe(0);

    expect(() => validateAssessment({ dimensions: {}, oneLineVerdict: "x" })).toThrow();
    expect(() =>
      validateAssessment({
        hardGateFails: [],
        dimensions: { seniorityFit: 1, domainFit: 1, mustHaveSkillsCoverage: 1, langLocationFit: 1 },
        oneLineVerdict: "   ",
      }),
    ).toThrow(/oneLineVerdict/);
  });

  it("survives fenced JSON and preamble", () => {
    const reply = 'Sure!\n```json\n{"hardGateFails":[],"dimensions":{"seniorityFit":80,"domainFit":80,"mustHaveSkillsCoverage":80,"langLocationFit":80},"oneLineVerdict":"Good fit."}\n```';
    const a = validateAssessment(JSON.parse(extractJsonObject(reply)));
    expect(gradeFromAssessment(a)).toBe("B");
  });
});

/**
 * The real cases from the session that produced this ticket. These assert the
 * RUBRIC's handling of what the grader reports, not the model's judgement —
 * the model is mocked out of the equation by feeding its output directly.
 */
describe("fixtures — the jobs that motivated JOBDASH-010", () => {
  it.each([
    ["AbbVie Senior AI Leader, Europe (team + budget)", at(80, ["G2"]), "F"],
    ["AbbVie Senior Analyst, North Chicago (US visa)", at(75, ["G1"]), "F"],
    ["CloudBee founding technical hire (deep specialism)", at(60, ["G3"]), "F"],
    ["German-mandatory C1 mid role", at(65, ["G4"]), "F"],
    ["Veeva Associate Consultant Programme, EU", at(78), "B"],
  ] as const)("%s → %s", (_label, assessment, expected) => {
    expect(gradeFromAssessment(assessment)).toBe(expected);
  });
});

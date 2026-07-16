import { describe, expect, it } from "vitest";
import { buildAffinityProfile, titleTokens } from "../reco/profile";
import { RECO_WEIGHTS, scoreScoutJob } from "../reco/score";
import type { Application } from "../db/schema";

/** Minimal app factory — only fields the profile reads. */
function app(over: Partial<Application>): Application {
  return {
    id: Math.random().toString(36).slice(2),
    company: "Co",
    roleTitle: "Operations Associate",
    source: "scraper",
    fitScore: 80,
    germanReq: "none",
    status: "applied",
    ...over,
  } as Application;
}

/** Golden pipeline: 3 ops + 1 founders-associate active, 1 closed (ignored). */
const PIPELINE = [
  app({ roleTitle: "AI Operations Manager", fitScore: 85, source: "ashby" }),
  app({ roleTitle: "Operations & Automation Lead", fitScore: 78 }),
  app({ roleTitle: "Business Operations Associate", fitScore: 72, germanReq: "bonus" }),
  app({ roleTitle: "Founders Associate", fitScore: 90, status: "interview" }),
  app({ roleTitle: "Marketing Manager", status: "rejected" }), // not ACTIVE → excluded
];

describe("titleTokens", () => {
  it("lowercases, drops gender markers and stopwords", () => {
    expect(titleTokens("Senior Operations Manager (m/w/d) — Berlin")).toEqual([
      "operations",
      "manager",
    ]);
    expect(titleTokens(null)).toEqual([]);
  });
});

describe("buildAffinityProfile (golden)", () => {
  const p = buildAffinityProfile(PIPELINE);

  it("counts only ACTIVE_STATUSES apps", () => {
    expect(p.sampleSize).toBe(4);
  });

  it("weights buckets by pipeline share, ops first", () => {
    expect(p.buckets[0]).toEqual({ key: "ops", label: "Ops / AI-Ops", weight: 0.75 });
    expect(p.buckets[1]).toEqual({ key: "fa", label: "FA / CoS", weight: 0.25 });
  });

  it("keeps only recurring title keywords", () => {
    // "operations" ×3 and "associate" ×2 recur; "automation"/"founders" appear once
    expect(p.keywords).toEqual(["operations", "associate"]);
  });

  it("medianFit is the middle of active fits (78,85 → 82)", () => {
    // active fits sorted: 72, 78, 85, 90 → even count → round((78+85)/2) = 82
    expect(p.medianFit).toBe(82);
  });

  it("empty pipeline → empty profile", () => {
    const empty = buildAffinityProfile([]);
    expect(empty).toMatchObject({ sampleSize: 0, buckets: [], keywords: [], medianFit: null });
  });
});

describe("scoreScoutJob (golden)", () => {
  const p = buildAffinityProfile(PIPELINE);

  it("top-lane English job with shared keywords scores high with a full why-line", () => {
    const rec = scoreScoutJob(
      { title: "AI Operations Associate", languageFlag: "none", source: "ashby", score: 82 },
      p,
    );
    // bucket ops = max weight → 40 · keywords 2/3 of 25 ≈ 16.67 · language 20 · fit 12.3
    expect(rec.score).toBe(89);
    expect(rec.excluded).toBe(false);
    expect(rec.why).toBe(
      "Matches your Ops / AI-Ops lane · shares “operations”, “associate” · English-first · fit 82",
    );
  });

  it("German-mandatory kills the language points", () => {
    const en = scoreScoutJob({ title: "Operations Lead", languageFlag: "none", source: null, score: 80 }, p);
    const de = scoreScoutJob({ title: "Operations Lead", languageFlag: "native", source: null, score: 80 }, p);
    expect(en.score - de.score).toBe(RECO_WEIGHTS.language);
  });

  it("unseen bucket scores low and says so", () => {
    const rec = scoreScoutJob(
      { title: "Backend Developer", languageFlag: "unknown", source: null, score: null },
      p,
    );
    // bucket 0 · keywords 0 · language 10 · fit from medianFit 82 → 12.3 → 22
    expect(rec.score).toBe(22);
    expect(rec.why).toBe("Low overlap with your current pipeline.");
  });

  it("§4 high-reject buckets come back excluded, ranked-last wording", () => {
    const rec = scoreScoutJob(
      { title: "AI Operations Associate", languageFlag: "none", source: null, score: 82 },
      p,
      ["ops"],
    );
    expect(rec.excluded).toBe(true);
    expect(rec.why).toContain("Paused — your Ops / AI-Ops applications");
  });

  it("empty profile (no buckets, no median) never divides by zero and falls back fit to 50", () => {
    const empty = buildAffinityProfile([]);
    const rec = scoreScoutJob(
      { title: "AI Operations Associate", languageFlag: "none", source: null, score: null },
      empty,
    );
    // bucket 0 (no buckets to match) · keywords 0 (none recurring) · language 20 · fit 50→7.5
    expect(rec.score).toBe(28);
    expect(rec.excluded).toBe(false);
    expect(rec.why).toBe("Matches English-first");
  });

  it("profile with buckets but zero scored apps (medianFit null) also falls fit back to 50", () => {
    const noFit = buildAffinityProfile([
      app({ roleTitle: "AI Operations Manager", fitScore: null }),
      app({ roleTitle: "Operations Associate", fitScore: null }),
    ]);
    expect(noFit.medianFit).toBeNull();
    const rec = scoreScoutJob(
      { title: "Operations Associate", languageFlag: "none", source: null, score: null },
      noFit,
    );
    // bucket ops = max weight → 40 · keywords 1/3 of 25 ≈ 8.3 · language 20 · fit 50→7.5 = 75.8→76
    expect(rec.score).toBe(76);
    expect(rec.why).toBe(
      "Matches your Ops / AI-Ops lane · shares “operations” · English-first",
    );
  });

  it("clamps out-of-range job.score into the fit component but shows the raw score in the why-line", () => {
    const over = scoreScoutJob(
      { title: "Backend Developer", languageFlag: "unknown", source: null, score: 150 },
      p,
    );
    // bucket 0 · keywords 0 · language 10 · fit clamped to 100 → 15 = 25
    expect(over.score).toBe(25);
    expect(over.why).toBe("Matches fit 100"); // clamped for display too — no "fit 150"

    const under = scoreScoutJob(
      { title: "Backend Developer", languageFlag: "none", source: null, score: -50 },
      p,
    );
    // bucket 0 · keywords 0 · language 20 · fit clamped to 0 → 0 = 20; raw -50 < 75 so no fit clause
    expect(under.score).toBe(20);
    expect(under.why).toBe("Matches English-first");
  });
});

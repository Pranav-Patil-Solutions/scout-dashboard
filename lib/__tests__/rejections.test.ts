import { describe, expect, it } from "vitest";
import {
  analyzeRejections,
  highRejectRoleBuckets,
  pct,
  verifyNarration,
} from "../analysis/rejections";
import type { Application } from "../db/schema";

/** Minimal app factory — only the fields the analyzer reads. */
function app(over: Partial<Application>): Application {
  return {
    id: Math.random().toString(36).slice(2),
    company: "Co",
    roleTitle: "Operations Associate",
    source: "scraper",
    fitScore: 80,
    fitBand: "strong",
    germanReq: "none",
    status: "applied",
    appliedAt: new Date("2026-07-01"),
    closedReason: null,
    ...over,
  } as Application;
}

describe("analyzeRejections", () => {
  it("counts population and rejections deterministically", () => {
    const apps = [
      app({ status: "rejected", closedReason: "rejected" }),
      app({ status: "applied" }),
      app({ status: "interview" }),
      app({ status: "sourced", appliedAt: null }), // never applied → excluded
    ];
    const a = analyzeRejections(apps);
    expect(a.population).toBe(3);
    expect(a.rejected).toBe(1);
    expect(a.summary[0]).toBe("1 of 3 tracked applications ended rejected (33%).");
  });

  it("includes historical rejections that never got an applied stamp", () => {
    const a = analyzeRejections([
      app({ status: "rejected", closedReason: "rejected", appliedAt: null }),
    ]);
    expect(a.population).toBe(1);
    expect(a.rejected).toBe(1);
  });

  it("segments every dimension and sorts by rate", () => {
    const apps = [
      app({ roleTitle: "Software Engineer", status: "rejected", closedReason: "rejected" }),
      app({ roleTitle: "Software Engineer", status: "rejected", closedReason: "rejected" }),
      app({ roleTitle: "Operations Manager", status: "interview" }),
    ];
    const a = analyzeRejections(apps);
    const role = a.dimensions.find((d) => d.key === "role")!;
    expect(role.rows[0]).toMatchObject({ key: "engineer", population: 2, rejected: 2, rate: 1 });
    expect(role.rows[1]).toMatchObject({ key: "ops", rejected: 0 });
    expect(a.dimensions.map((d) => d.key)).toEqual(["role", "source", "german", "fit"]);
  });

  it("keeps small segments out of the summary but in the table", () => {
    const a = analyzeRejections([
      app({ roleTitle: "Growth Marketing", status: "rejected", closedReason: "rejected" }),
      app({ roleTitle: "Operations Manager", status: "applied" }),
      app({ roleTitle: "Operations Manager", status: "applied" }),
    ]);
    const role = a.dimensions.find((d) => d.key === "role")!;
    expect(role.rows.some((r) => r.key === "marketing")).toBe(true);
    // marketing has population 1 (< MIN_SUMMARY_POPULATION) → no role summary line
    expect(a.summary.some((s) => s.startsWith("Role type"))).toBe(false);
  });

  it("breaks rate ties by larger population first", () => {
    const a = analyzeRejections([
      // fit band "strong": 1/1 rejected → rate 1
      app({ fitBand: "strong", status: "rejected", closedReason: "rejected" }),
      // fit band "stretch": 2/2 rejected → rate 1, bigger population
      app({ fitBand: "stretch", status: "rejected", closedReason: "rejected" }),
      app({ fitBand: "stretch", status: "rejected", closedReason: "rejected" }),
    ]);
    const fit = a.dimensions.find((d) => d.key === "fit")!;
    expect(fit.rows[0]).toMatchObject({ key: "stretch", population: 2, rate: 1 });
    expect(fit.rows[1]).toMatchObject({ key: "strong", population: 1, rate: 1 });
  });

  it("falls back to the unknown language label for a germanReq value outside the known set", () => {
    // germanReq is a raw text column (lib/db/schema.ts) — legacy/drifted rows can
    // hold a value outside the GermanReq union at runtime despite the app-level type.
    const a = analyzeRejections([
      app({ germanReq: "b1_certificate" as never, status: "rejected", closedReason: "rejected" }),
    ]);
    const german = a.dimensions.find((d) => d.key === "german")!;
    expect(german.rows[0]).toMatchObject({
      key: "b1_certificate",
      label: "Language unknown",
    });
  });

  it("empty input yields an empty, render-safe analysis", () => {
    const a = analyzeRejections([]);
    expect(a.population).toBe(0);
    expect(a.rejected).toBe(0);
    expect(a.summary).toEqual([]);
    expect(a.dimensions.every((d) => d.rows.length === 0)).toBe(true);
  });
});

describe("highRejectRoleBuckets (§5 feedback seam)", () => {
  it("flags buckets only past both population and rate thresholds", () => {
    const rejectedEngineer = () =>
      app({ roleTitle: "Backend Developer", status: "rejected", closedReason: "rejected" });
    const a = analyzeRejections([
      rejectedEngineer(),
      rejectedEngineer(),
      rejectedEngineer(),
      app({ roleTitle: "Growth Marketing", status: "rejected", closedReason: "rejected" }),
    ]);
    // engineer: 3/3 rejected → flagged; marketing: population 1 → not flagged
    expect(highRejectRoleBuckets(a)).toEqual(["engineer"]);
  });
});

describe("pct", () => {
  it("rounds to whole percent", () => {
    expect(pct(0.335)).toBe("34%");
    expect(pct(0)).toBe("0%");
    expect(pct(1)).toBe("100%");
  });
});

describe("verifyNarration (anti-fabrication gate)", () => {
  const analysis = analyzeRejections([
    app({ status: "rejected", closedReason: "rejected" }),
    app({ status: "rejected", closedReason: "rejected" }),
    app({ status: "applied" }),
  ]); // population 3, rejected 2, 67%

  it("accepts text whose every numeral is in the table", () => {
    const res = verifyNarration("2 of your 3 applications were rejected — 67%.", analysis);
    expect(res).toEqual({ ok: true, offending: [] });
  });

  it("rejects any numeral not derivable from the table", () => {
    const res = verifyNarration("Roughly 80% of your 12 applications failed.", analysis);
    expect(res.ok).toBe(false);
    expect(res.offending).toEqual(["80", "12"]);
  });

  it("accepts number-free text and catches decimal fabrications", () => {
    expect(verifyNarration("Most rejections come from engineering roles.", analysis).ok).toBe(true);
    expect(verifyNarration("Your rate is 0.67 overall.", analysis).ok).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { deriveFitBand, fitBandFor, roleBucket } from "../constants";

describe("roleBucket", () => {
  it("matches specialised buckets before the broad ones (Founders Associate Marketing -> Marketing)", () => {
    expect(roleBucket("Founders Associate Marketing").key).toBe("marketing");
  });

  it("matches AI Enablement Engineer -> Engineer, not Ops", () => {
    expect(roleBucket("AI Enablement Engineer").key).toBe("engineer");
  });

  it("falls back to other for unrecognised titles", () => {
    expect(roleBucket("Executive Assistant").key).toBe("other");
  });
});

describe("deriveFitBand", () => {
  it("returns null for a null/undefined score", () => {
    expect(deriveFitBand(null)).toBeNull();
    expect(deriveFitBand(undefined)).toBeNull();
  });

  it("buckets scores at the >=75 / >=50 boundaries", () => {
    expect(deriveFitBand(75)).toBe("strong");
    expect(deriveFitBand(74)).toBe("stretch");
    expect(deriveFitBand(50)).toBe("stretch");
    expect(deriveFitBand(49)).toBe("skip");
  });
});

describe("fitBandFor", () => {
  it("prefers an explicit valid band over the derived score", () => {
    expect(fitBandFor("strong", 10)).toBe("strong");
  });

  it("falls back to deriving from score when band is invalid/missing", () => {
    expect(fitBandFor(null, 80)).toBe("strong");
    expect(fitBandFor("bogus", 10)).toBe("skip");
  });
});

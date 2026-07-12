import { describe, expect, it } from "vitest";
import { companySimilarity, matchApplication, roleSimilarity } from "../match";
import { makeApp } from "./fixtures";

describe("companySimilarity", () => {
  it("treats legal-suffix variants of the same name as identical", () => {
    expect(companySimilarity("Acme GmbH", "Acme")).toBe(1);
  });

  it("returns a low score for unrelated company names", () => {
    expect(companySimilarity("Zeta Corp", "Acme Inc")).toBeLessThan(0.65);
  });
});

describe("roleSimilarity", () => {
  it("scores a role that is a subset of the other highly", () => {
    expect(roleSimilarity("Senior Backend Engineer (m/f/d)", "Backend Engineer")).toBeGreaterThanOrEqual(0.9);
  });

  it("scores unrelated roles low", () => {
    expect(roleSimilarity("Backend Engineer", "Sales Manager")).toBeLessThan(0.5);
  });
});

describe("matchApplication", () => {
  it("matches a single candidate at the exact company with high confidence", () => {
    const apps = [makeApp({ id: "app-1", company: "Acme", roleTitle: "Engineer" })];
    const result = matchApplication({ company: "Acme", role_title: null }, apps);
    expect(result).not.toBeNull();
    expect(result!.applicationId).toBe("app-1");
    expect(result!.method).toBe("company");
    expect(result!.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it("disambiguates two applications at the same company by role", () => {
    const apps = [
      makeApp({ id: "backend", company: "Acme", roleTitle: "Backend Engineer" }),
      makeApp({ id: "frontend", company: "Acme", roleTitle: "Frontend Engineer" }),
    ];
    const result = matchApplication(
      { company: "Acme", role_title: "Senior Backend Engineer (m/f/d)" },
      apps,
    );
    expect(result).not.toBeNull();
    expect(result!.applicationId).toBe("backend");
    expect(result!.method).toBe("company+role");
  });

  it("returns null when company similarity is below the matching threshold", () => {
    const apps = [makeApp({ id: "app-1", company: "Acme Inc" })];
    const result = matchApplication({ company: "Zeta Corp", role_title: null }, apps);
    expect(result).toBeNull();
  });

  it("returns null when the classification has no company at all", () => {
    const apps = [makeApp({ id: "app-1", company: "Acme" })];
    const result = matchApplication({ company: null, role_title: "Engineer" }, apps);
    expect(result).toBeNull();
  });
});

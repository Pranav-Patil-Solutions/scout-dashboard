import { describe, expect, it } from "vitest";
import { parseJobMeta } from "../job-meta";

/** Minimal JSON-LD JobPosting page, like an ATS embeds. */
function ldPage(posting: Record<string, unknown>, extraHead = ""): string {
  return `<!doctype html><html><head>${extraHead}
    <script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "JobPosting",
      ...posting,
    })}</script></head><body>page body</body></html>`;
}

describe("parseJobMeta — JSON-LD JobPosting", () => {
  it("extracts title, company, location, salary and description", () => {
    const html = ldPage({
      title: "Senior Product Manager",
      hiringOrganization: { "@type": "Organization", name: "Acme GmbH" },
      jobLocation: {
        "@type": "Place",
        address: {
          "@type": "PostalAddress",
          addressLocality: "Berlin",
          addressCountry: "DE",
        },
      },
      baseSalary: {
        "@type": "MonetaryAmount",
        currency: "EUR",
        value: {
          "@type": "QuantitativeValue",
          minValue: 55000,
          maxValue: 75000,
          unitText: "YEAR",
        },
      },
      description: "<p>Own the <b>roadmap</b>.</p><ul><li>B2B SaaS</li></ul>",
    });
    const m = parseJobMeta(html);
    expect(m.title).toBe("Senior Product Manager");
    expect(m.company).toBe("Acme GmbH");
    expect(m.location).toBe("Berlin, DE");
    expect(m.salary).toBe("€55,000–€75,000 / year");
    expect(m.description).toContain("Own the roadmap");
    expect(m.description).toContain("B2B SaaS");
    expect(m.via).toContain("json-ld");
  });

  it("handles a string hiringOrganization and a single salary value", () => {
    const html = ldPage({
      title: "Ops Analyst",
      hiringOrganization: "Tacto",
      baseSalary: { currency: "USD", value: { value: 90000, unitText: "YEAR" } },
    });
    const m = parseJobMeta(html);
    expect(m.company).toBe("Tacto");
    expect(m.salary).toBe("$90,000 / year");
  });

  it("marks remote from TELECOMMUTE and joins multiple locations", () => {
    const html = ldPage({
      title: "Remote Engineer",
      jobLocationType: "TELECOMMUTE",
      jobLocation: [
        { address: { addressLocality: "Berlin", addressCountry: "DE" } },
        { address: { addressLocality: "London", addressCountry: "UK" } },
      ],
    });
    const m = parseJobMeta(html);
    expect(m.remote).toBe(true);
    expect(m.location).toBe("Berlin, DE · London, UK");
  });

  it("finds JobPosting inside an @graph and ignores malformed sibling blocks", () => {
    const html = `<html><head>
      <script type="application/ld+json">{ not valid json </script>
      <script type="application/ld+json">${JSON.stringify({
        "@context": "https://schema.org",
        "@graph": [
          { "@type": "WebSite", name: "Careers" },
          { "@type": "JobPosting", title: "Data Lead", hiringOrganization: { name: "Nord" } },
        ],
      })}</script></head><body></body></html>`;
    const m = parseJobMeta(html);
    expect(m.title).toBe("Data Lead");
    expect(m.company).toBe("Nord");
  });
});

describe("parseJobMeta — OG / meta / title fallbacks", () => {
  it("falls back to Open Graph tags when there is no JSON-LD", () => {
    const html = `<html><head>
      <meta property="og:title" content="Chief of Staff" />
      <meta property="og:site_name" content="Northbeam" />
      <meta property="og:description" content="Run the founder's office." />
    </head><body></body></html>`;
    const m = parseJobMeta(html);
    expect(m.title).toBe("Chief of Staff");
    expect(m.company).toBe("Northbeam");
    expect(m.description).toBe("Run the founder's office.");
    expect(m.via).toContain("opengraph");
  });

  it("never lets an ATS brand pose as the company via og:site_name", () => {
    const html = `<html><head>
      <meta property="og:title" content="Backend Engineer at Vela" />
      <meta property="og:site_name" content="Greenhouse" />
    </head><body></body></html>`;
    const m = parseJobMeta(html);
    expect(m.company).toBe("Vela"); // parsed from title, not "Greenhouse"
    expect(m.title).toBe("Backend Engineer");
  });

  it("parses company out of a 'Role - Company | ATS' <title>", () => {
    const html =
      "<html><head><title>Growth Marketer - Kaddi | Lever</title></head><body></body></html>";
    const m = parseJobMeta(html);
    expect(m.title).toBe("Growth Marketer");
    expect(m.company).toBe("Kaddi");
  });

  it("uses visible body text as a description of last resort", () => {
    const body = "We are hiring an operations associate. ".repeat(12);
    const html = `<html><head><title>Ops Associate</title></head><body><p>${body}</p></body></html>`;
    const m = parseJobMeta(html);
    expect(m.description).toContain("operations associate");
    expect(m.via).toContain("body-text");
  });
});

describe("parseJobMeta — salary heuristic", () => {
  it("sniffs a grouped currency range from text when JSON-LD has none", () => {
    const html =
      "<html><head><title>Analyst</title></head><body><p>Compensation: €55,000 – €70,000 per year plus equity.</p></body></html>";
    const m = parseJobMeta(html);
    expect(m.salary).toBe("€55,000 – €70,000");
    expect(m.via).toContain("heuristic");
  });

  it("catches the k-suffixed shorthand '$150k - $230k'", () => {
    const html =
      "<html><head><title>Head of Marketing</title></head><body><p>💸 Salary: $150k - $230k. Location: Worldwide.</p></body></html>";
    const m = parseJobMeta(html);
    expect(m.salary).toBe("$150k - $230k");
  });

  it("does not treat small numbers like '$5 lunch' as salary", () => {
    const html =
      "<html><head><title>Barista</title></head><body><p>Free $5 lunch every day.</p></body></html>";
    const m = parseJobMeta(html);
    expect(m.salary).toBeNull();
  });

  it("drops a placeholder baseSalary of 0 (boards like Remotive emit it)", () => {
    const html = ldPage({
      title: "Engineer",
      baseSalary: { currency: "USD", value: { value: 0, unitText: "YEAR" } },
      description: "No comp in the structured data here.",
    });
    const m = parseJobMeta(html);
    expect(m.salary).toBeNull();
  });
});

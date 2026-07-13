import { describe, expect, it } from "vitest";
import { clampText, companySlug, extractHtmlDocument, htmlToText } from "../text";

describe("htmlToText", () => {
  it("strips scripts, styles, and comments (incl. i18n bundles inside scripts)", () => {
    const html = `<html><style>body{color:red}</style>
      <script>{"archivedJob.title":"This job is no longer available"}</script>
      <!-- hidden --><body><p>Founder Associate</p></body></html>`;
    const text = htmlToText(html);
    expect(text).toContain("Founder Associate");
    expect(text).not.toContain("no longer available");
    expect(text).not.toContain("color:red");
  });

  it("turns block ends into newlines and decodes entities", () => {
    const text = htmlToText("<ul><li>Ops &amp; AI</li><li>B2B</li></ul><p>Berlin&nbsp;&gt;</p>");
    expect(text).toBe("Ops & AI\nB2B\n\nBerlin >");
  });
});

describe("clampText", () => {
  it("passes short text through and truncates long text with a marker", () => {
    expect(clampText("short", 100)).toBe("short");
    const clamped = clampText("x".repeat(200), 50);
    expect(clamped).toHaveLength(50 + "\n[truncated]".length);
    expect(clamped.endsWith("[truncated]")).toBe(true);
  });
});

describe("extractHtmlDocument", () => {
  it("unwraps fenced or preambled replies down to the doctype", () => {
    const doc = "<!doctype html><html><body>CV</body></html>";
    expect(extractHtmlDocument(doc)).toBe(doc);
    expect(extractHtmlDocument("Here is the resume:\n```html\n" + doc + "\n```")).toBe(doc);
    expect(extractHtmlDocument("Sure!\n" + doc)).toBe(doc);
  });

  it("throws when there is no HTML document", () => {
    expect(() => extractHtmlDocument("I cannot do that")).toThrow();
  });
});

describe("companySlug", () => {
  it("slugs company names safely for filenames", () => {
    expect(companySlug("Weflow (Remote)")).toBe("Weflow-Remote");
    expect(companySlug("  ")).toBe("company");
  });
});

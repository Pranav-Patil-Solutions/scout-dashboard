import { describe, expect, it } from "vitest";
import { fetchJobDescription } from "../jd";
import { clampText, htmlToText } from "../text";

/**
 * JOBDASH-006 §6 — golden fixtures for the JD render path: one reusable
 * htmlToText/clampText pipeline over every scout_jobs row, so these encode the
 * exact output for realistic ATS pages. If a fixture breaks, the JD panel and
 * the kit generator both regressed.
 */

const GREENHOUSE_STYLE = `<!doctype html><html><head>
<meta property="og:title" content="Operations Manager"/>
<style>.app{display:flex}</style>
<script>window.__data={"boards":{"jobs":[{"id":1}]}}</script>
</head><body>
<div id="app"><header><nav>Jobs</nav></header>
<div class="opening">
  <h1>Operations Manager</h1>
  <div class="location">Berlin, Germany &middot; Hybrid</div>
  <section><h2>What you&#39;ll do</h2>
    <ul><li>Own the ops roadmap &amp; KPIs</li><li>Scale tooling for 40&nbsp;people</li></ul>
  </section>
  <section><h2>Compensation</h2><p>55.000&nbsp;&euro; &ndash; 70.000&nbsp;&euro;</p></section>
</div></div></body></html>`;

const GERMAN_ENTITIES = `<p>F&uuml;r unser B&uuml;ro in M&uuml;nchen suchen wir Unterst&uuml;tzung
im Bereich Qualit&auml;t &amp; Prozesse. Flie&szlig;end Deutsch (C1) erforderlich.</p>
<p>Benefits: 30&nbsp;Tage Urlaub &#8211; Jobticket &#x2013; Weiterbildung&hellip;</p>`;

const BR_AND_TABLES = `<table><tr><td>Start</td><td>ASAP</td></tr>
<tr><td>Contract</td><td>Full-time<br/>Permanent</td></tr></table>
<p>Apply<br>now</p>`;

const UNKNOWN_ENTITIES = `<p>Formula: a &lambda; b &notarealentity; c &amp; d</p>`;

describe("JD golden fixtures (htmlToText)", () => {
  it("greenhouse-style page: chrome stripped, headings and lists readable", () => {
    expect(htmlToText(GREENHOUSE_STYLE)).toBe(
      [
        "Jobs",
        "Operations Manager",
        "Berlin, Germany · Hybrid",
        "What you'll do",
        "Own the ops roadmap & KPIs\nScale tooling for 40 people",
        "Compensation\n55.000 € – 70.000 €",
      ].join("\n\n"),
    );
  });

  it("german posting: umlauts, sharp-s, and dash entities decode", () => {
    const text = htmlToText(GERMAN_ENTITIES);
    expect(text).toBe(
      "Für unser Büro in München suchen wir Unterstützung\nim Bereich Qualität & Prozesse. Fließend Deutsch (C1) erforderlich.\n\nBenefits: 30 Tage Urlaub – Jobticket – Weiterbildung…",
    );
  });

  it("br and table rows become line breaks", () => {
    expect(htmlToText(BR_AND_TABLES)).toBe(
      "Start ASAP\n\nContract Full-time\nPermanent\n\nApply\nnow",
    );
  });

  it("unknown named entities pass through untouched, known ones decode", () => {
    expect(htmlToText(UNKNOWN_ENTITIES)).toBe("Formula: a &lambda; b &notarealentity; c & d");
  });

  it("out-of-range numeric entities never throw", () => {
    expect(htmlToText("<p>bad &#1114112; ok &#252;</p>")).toBe("bad &#1114112; ok ü");
  });

  it("clamps to the 12k JD budget with a visible marker", () => {
    const clamped = clampText(htmlToText(`<p>${"role ".repeat(4000)}</p>`), 12_000);
    expect(clamped.length).toBe(12_000 + "\n[truncated]".length);
    expect(clamped.endsWith("[truncated]")).toBe(true);
  });

  it("refuses non-http(s) URLs before any network I/O", async () => {
    await expect(fetchJobDescription("ftp://evil/jd")).rejects.toThrow("JD fetch refused");
    await expect(fetchJobDescription("file:///etc/passwd")).rejects.toThrow("JD fetch refused");
  });
});

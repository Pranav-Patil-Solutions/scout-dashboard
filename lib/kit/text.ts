/** Pure text helpers for the kit generator (JOBDASH-005) — unit-tested. */

// Named entities common in real (esp. German) job postings. &amp;/&lt;/&gt;/
// &quot;/&apos; are handled separately below, deliberately after these.
const NAMED_ENTITIES: Record<string, string> = {
  uuml: "ü", auml: "ä", ouml: "ö", Uuml: "Ü", Auml: "Ä", Ouml: "Ö", szlig: "ß",
  eacute: "é", egrave: "è", agrave: "à", ccedil: "ç",
  mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“",
  hellip: "…", middot: "·", bull: "•", euro: "€", copy: "©", reg: "®", trade: "™",
};

/** Visible text of an HTML page: scripts/styles/comments stripped, blocks → newlines. */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|ul|ol)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (m, n) =>
      Number(n) <= 0x10ffff ? String.fromCodePoint(Number(n)) : m,
    )
    .replace(/&#x([0-9a-f]+);/gi, (m, n) =>
      parseInt(n, 16) <= 0x10ffff ? String.fromCodePoint(parseInt(n, 16)) : m,
    )
    .replace(/&([a-zA-Z]+);/g, (m, name: string) => NAMED_ENTITIES[name] ?? m)
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function clampText(text: string, maxChars: number): string {
  return text.length <= maxChars ? text : `${text.slice(0, maxChars)}\n[truncated]`;
}

/** Pull a complete HTML document out of a model reply (fences/preamble-tolerant). */
export function extractHtmlDocument(reply: string): string {
  const fenced = reply.match(/```(?:html)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : reply;
  const start = candidate.search(/<!doctype html|<html[\s>]/i);
  if (start === -1) throw new Error("model reply contains no HTML document");
  return candidate.slice(start).trim();
}

export function companySlug(company: string): string {
  return company.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "company";
}

import { clampText, htmlToText } from "../kit/text";

/**
 * Free job-posting meta scraper (no paid link-preview API, no LLM).
 * Pure fetch + regex, so it runs everywhere — including Vercel.
 *
 * Extraction is layered, best source first:
 *   1. schema.org JSON-LD `JobPosting` — the gold source. Greenhouse, Lever,
 *      Ashby, SmartRecruiters, Workday, LinkedIn, Indeed, Personio and most ATS
 *      embed a <script type="application/ld+json"> with title, hiringOrganization,
 *      jobLocation, baseSalary and an HTML description.
 *   2. Open Graph / Twitter-card / <meta> / <title> — fills gaps when there is
 *      no JSON-LD (og:title, og:site_name, og:description, <meta description>).
 *   3. Visible body text + a conservative salary regex as a last resort.
 *
 * The pure parser `parseJobMeta(html, url)` is exported for unit tests; the IO
 * wrapper `scrapeJobMeta(url)` does the guarded fetch.
 */

export interface JobMeta {
  title: string | null;
  company: string | null;
  location: string | null;
  salary: string | null;
  description: string | null;
  remote: boolean;
  /** Which extractors contributed, for transparency in the UI/logs. */
  via: string[];
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const FETCH_TIMEOUT_MS = 15_000;
const MAX_DESCRIPTION_CHARS = 12_000;

// og:site_name is frequently the ATS/board brand, not the employer — never let
// one of these masquerade as the hiring company.
const ATS_BRANDS = new Set([
  "greenhouse",
  "lever",
  "ashby",
  "ashbyhq",
  "workday",
  "smartrecruiters",
  "join",
  "personio",
  "recruitee",
  "workable",
  "teamtailor",
  "linkedin",
  "indeed",
  "glassdoor",
  "wellfound",
  "angellist",
  "jobs",
  "careers",
]);

const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: "€",
  USD: "$",
  GBP: "£",
  INR: "₹",
  JPY: "¥",
  CNY: "¥",
};

/** Guarded fetch of a job posting, reduced to structured meta. */
export async function scrapeJobMeta(url: string): Promise<JobMeta> {
  const protocol = new URL(url).protocol;
  if (protocol !== "http:" && protocol !== "https:")
    throw new Error(`Meta scrape refused: ${protocol} URL`);
  const res = await fetch(url, {
    headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" },
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Meta scrape failed: HTTP ${res.status}`);
  return parseJobMeta(await res.text(), url);
}

/** Pure: parse HTML into job meta. No network — unit-testable. */
export function parseJobMeta(html: string, _url?: string): JobMeta {
  const via: string[] = [];
  const posting = findJobPosting(collectJsonLd(html));

  let title: string | null = null;
  let company: string | null = null;
  let location: string | null = null;
  let salary: string | null = null;
  let description: string | null = null;
  let remote = false;

  if (posting) {
    via.push("json-ld");
    title = str(posting.title) ?? str(posting.name);
    company = orgName(posting.hiringOrganization);
    location = locationText(posting.jobLocation);
    salary = formatSalary(posting.baseSalary ?? posting.estimatedSalary);
    const jsonDesc = str(posting.description);
    if (jsonDesc) description = htmlToText(jsonDesc);
    remote =
      isTelecommute(posting.jobLocationType) ||
      posting.applicantLocationRequirements != null;
  }

  // --- Open Graph / meta / <title> fallbacks ---
  const meta = metaTags(html);
  const docTitle = firstTitleTag(html);

  if (!title) {
    const ogTitle = pickMeta(meta, "og:title") ?? pickMeta(meta, "twitter:title");
    title = ogTitle ?? docTitle;
    if (title) via.push("opengraph");
  }
  if (!company) {
    const site = pickMeta(meta, "og:site_name");
    if (site && !isAtsBrand(site)) {
      company = site;
      pushOnce(via, "opengraph");
    } else {
      // last resort: split company out of a "Role at Company | ATS" doc title
      const parsed = companyFromTitle(title ?? docTitle);
      if (parsed) {
        company = parsed;
        pushOnce(via, "title-parse");
      }
    }
  }
  if (!description) {
    const ogDesc =
      pickMeta(meta, "og:description") ??
      pickMeta(meta, "twitter:description") ??
      pickMeta(meta, "description");
    if (ogDesc) {
      description = ogDesc;
      pushOnce(via, "opengraph");
    }
  }
  if (!description) {
    const body = htmlToText(html);
    if (body.length >= 200) {
      description = body;
      pushOnce(via, "body-text");
    }
  }
  if (!salary) {
    const guess = salaryFromText(description ?? htmlToText(html));
    if (guess) {
      salary = guess;
      pushOnce(via, "heuristic");
    }
  }

  // Trim a trailing " at/-/| Company" or " (Location)" decoration off the title
  title = cleanTitle(title, company);

  return {
    title: nullifyBlank(title),
    company: nullifyBlank(company),
    location: nullifyBlank(location),
    salary: nullifyBlank(salary),
    description: description ? clampText(description, MAX_DESCRIPTION_CHARS) : null,
    remote,
    via,
  };
}

/* ------------------------------------------------------------------ JSON-LD */

/** All parseable JSON-LD objects on the page, flattened (arrays + @graph). */
function collectJsonLd(html: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const re =
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(m[1].trim());
    } catch {
      continue; // malformed block — skip, never throw
    }
    for (const node of flattenLd(parsed)) out.push(node);
  }
  return out;
}

function flattenLd(node: unknown): Record<string, unknown>[] {
  if (Array.isArray(node)) return node.flatMap(flattenLd);
  if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    const graph = obj["@graph"];
    if (Array.isArray(graph)) return graph.flatMap(flattenLd);
    return [obj];
  }
  return [];
}

function findJobPosting(
  nodes: Record<string, unknown>[],
): Record<string, unknown> | null {
  return nodes.find((n) => typeList(n["@type"]).includes("jobposting")) ?? null;
}

function typeList(t: unknown): string[] {
  if (typeof t === "string") return [t.toLowerCase()];
  if (Array.isArray(t))
    return t.filter((x) => typeof x === "string").map((x) => (x as string).toLowerCase());
  return [];
}

/* ------------------------------------------------------- field extraction */

function orgName(org: unknown): string | null {
  if (typeof org === "string") return org.trim() || null;
  if (org && typeof org === "object") {
    const o = org as Record<string, unknown>;
    return str(o.name) ?? str(o.legalName);
  }
  return null;
}

function locationText(jobLocation: unknown): string | null {
  const places = Array.isArray(jobLocation) ? jobLocation : [jobLocation];
  const parts = places.map(placeToString).filter((p): p is string => !!p);
  const uniq = [...new Set(parts)];
  return uniq.length ? uniq.join(" · ") : null;
}

function placeToString(place: unknown): string | null {
  if (typeof place === "string") return place.trim() || null;
  if (!place || typeof place !== "object") return null;
  const addr = (place as Record<string, unknown>).address ?? place;
  if (typeof addr === "string") return addr.trim() || null;
  if (addr && typeof addr === "object") {
    const a = addr as Record<string, unknown>;
    const bits = [
      str(a.addressLocality),
      str(a.addressRegion),
      nameOf(a.addressCountry),
    ].filter((b): b is string => !!b);
    const uniq = bits.filter((b, i) => bits.indexOf(b) === i);
    return uniq.length ? uniq.join(", ") : null;
  }
  return null;
}

function isTelecommute(v: unknown): boolean {
  return typeof v === "string" && v.toUpperCase() === "TELECOMMUTE";
}

/** MonetaryAmount / QuantitativeValue → a human string like "€55,000–€75,000 / year". */
function formatSalary(baseSalary: unknown): string | null {
  if (baseSalary == null) return null;
  if (typeof baseSalary === "number") return String(baseSalary);
  if (typeof baseSalary === "string") return baseSalary.trim() || null;
  if (typeof baseSalary !== "object") return null;

  const b = baseSalary as Record<string, unknown>;
  const value = (b.value && typeof b.value === "object" ? b.value : b) as Record<
    string,
    unknown
  >;
  const currency = str(b.currency) ?? str(b.salaryCurrency) ?? str(value.currency);
  const sym = currencySymbol(currency);
  const unit = unitLabel(str(value.unitText) ?? str(b.unitText));

  // Drop non-positive amounts — boards like Remotive stuff a placeholder 0.
  const min = positive(numeric(value.minValue));
  const max = positive(numeric(value.maxValue));
  const single = positive(numeric(value.value));

  let amount: string | null = null;
  if (min != null && max != null) amount = `${sym}${fmt(min)}–${sym}${fmt(max)}`;
  else if (min != null) amount = `${sym}${fmt(min)}+`;
  else if (max != null) amount = `up to ${sym}${fmt(max)}`;
  else if (single != null) amount = `${sym}${fmt(single)}`;
  if (!amount) return null;
  return unit ? `${amount} / ${unit}` : amount;
}

function currencySymbol(code: string | null): string {
  if (!code) return "";
  const c = code.toUpperCase();
  return CURRENCY_SYMBOLS[c] ?? `${c} `;
}

function unitLabel(unit: string | null): string | null {
  if (!unit) return null;
  const map: Record<string, string> = {
    HOUR: "hour",
    DAY: "day",
    WEEK: "week",
    MONTH: "month",
    YEAR: "year",
  };
  return map[unit.toUpperCase()] ?? null;
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

function numeric(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v.replace(/[,\s]/g, ""));
    return Number.isFinite(n) && v.trim() !== "" ? n : null;
  }
  return null;
}

function positive(n: number | null): number | null {
  return n != null && n > 0 ? n : null;
}

/**
 * Conservative salary sniff for pages with no usable JSON-LD baseSalary. Only
 * matches a currency-marked RANGE where each side is either a grouped/4+ digit
 * number (55,000) or a k-suffixed one ($150k) — so "$5 lunch" never matches.
 */
function salaryFromText(text: string): string | null {
  // a money amount: grouped thousands, 4+ digits, or the "150k" shorthand
  const MONEY = "[€$£₹]\\s?(?:\\d{1,3}(?:[.,]\\d{3})+|\\d{4,}|\\d{2,3}\\s?[kK])";
  const AMT = "(?:\\d{1,3}(?:[.,]\\d{3})+|\\d{4,}|\\d{2,3}\\s?[kK])";
  const range = new RegExp(`${MONEY}\\s?(?:[-–—]|to)\\s?(?:[€$£₹]\\s?)?${AMT}`);
  const m = text.match(range);
  if (m) return m[0].replace(/\s+/g, " ").trim();
  return null;
}

/* --------------------------------------------------- OG / meta / <title> */

interface MetaTag {
  key: string | undefined;
  content: string | undefined;
}

function metaTags(html: string): MetaTag[] {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  return tags.map((t) => ({
    key: (attr(t, "property") ?? attr(t, "name") ?? attr(t, "itemprop"))?.toLowerCase(),
    content: attr(t, "content"),
  }));
}

function pickMeta(tags: MetaTag[], key: string): string | null {
  const hit = tags.find((t) => t.key === key.toLowerCase() && t.content);
  return hit?.content ? decode(hit.content) : null;
}

function attr(tag: string, name: string): string | undefined {
  // Tie the closing quote to the opening one so an apostrophe inside a
  // double-quoted value (…founder's office…) doesn't end the capture early.
  const quoted = tag.match(new RegExp(`\\b${name}=(["'])([\\s\\S]*?)\\1`, "i"));
  if (quoted) return quoted[2];
  const bare = tag.match(new RegExp(`\\b${name}=([^\\s>]+)`, "i"));
  return bare ? bare[1] : undefined;
}

function firstTitleTag(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decode(m[1]) || null : null;
}

/** Decode entities / strip stray tags from a short attribute or title string. */
function decode(s: string): string {
  return htmlToText(s);
}

/* ----------------------------------------------------------- title / company */

const TITLE_SPLIT = /\s+[-–—|·]\s+|\s+@\s+/;

/** Pull the employer out of a doc title like "Senior PM at Acme | Greenhouse". */
function companyFromTitle(title: string | null): string | null {
  if (!title) return null;
  let base = title;
  // drop a trailing ATS/board brand segment
  const segs = base.split(TITLE_SPLIT).map((s) => s.trim()).filter(Boolean);
  if (segs.length && isAtsBrand(segs[segs.length - 1])) segs.pop();
  base = segs.join(" | ");

  const at = base.match(/\bat\s+(.+)$/i);
  if (at) return tidyCompany(at[1]);
  if (segs.length >= 2) {
    const candidate = segs[segs.length - 1];
    if (candidate.length <= 40 && !/\b(job|jobs|career|careers|hiring)\b/i.test(candidate))
      return tidyCompany(candidate);
  }
  return null;
}

function tidyCompany(s: string): string | null {
  const cleaned = s.replace(/\s*\((?:remote|hybrid|on-?site)\)\s*$/i, "").trim();
  return cleaned || null;
}

/** Strip a redundant "… at/-/| Company" or "… | ATS" tail from the title. */
function cleanTitle(title: string | null, company: string | null): string | null {
  if (!title) return null;
  const segs = title.split(TITLE_SPLIT).map((s) => s.trim()).filter(Boolean);
  // peel trailing ATS-brand and company segments (e.g. "Role – Acme | Lever")
  while (segs.length > 1) {
    const last = segs[segs.length - 1];
    if (isAtsBrand(last) || (company && last.toLowerCase() === company.toLowerCase()))
      segs.pop();
    else break;
  }
  let t = segs.join(" – ");
  // "Role at Company" has no delimiter to split on — strip it explicitly
  if (company) {
    const c = company.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    t = t.replace(new RegExp(`\\s*(?:[-–—|]|\\bat)\\s+${c}\\s*$`, "i"), "").trim();
  }
  return t.trim() || title;
}

function isAtsBrand(s: string): boolean {
  const key = s.toLowerCase().replace(/[^a-z]/g, "");
  return ATS_BRANDS.has(key) || [...ATS_BRANDS].some((b) => key === b);
}

/* ---------------------------------------------------------------- helpers */

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function nameOf(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null;
  if (v && typeof v === "object") return str((v as Record<string, unknown>).name);
  return null;
}

function nullifyBlank(v: string | null): string | null {
  return v && v.trim() ? v.trim() : null;
}

function pushOnce(arr: string[], v: string): void {
  if (!arr.includes(v)) arr.push(v);
}

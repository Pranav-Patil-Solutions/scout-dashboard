import type { Application } from "../db/schema";
import type { Classification } from "./types";

/**
 * JOBDASH-002 P3 — classification → application matching (§7).
 * Deterministic and pure (no db): thread continuity is resolved by the caller
 * (same Gmail thread as an already-matched event beats everything); this
 * module handles the company + role fuzzy match.
 */

export interface MatchResult {
  applicationId: string;
  confidence: number; // 0..1
  method: "thread" | "company+role" | "company";
}

const LEGAL_SUFFIX =
  /\b(gmbh|ag|se|kg|ug|inc|llc|ltd|co|corp|corporation|bv|oy|ab|sas|plc)\b/g;
// (m/f/d)-style tags, work-mode words, and glue words carry no identity
const ROLE_NOISE =
  /\(?\b[mwf]\/[mwfdx](\/[dx])?\b\)?|\b(remote|hybrid|onsite|the|of|and|for|a|an|in|at)\b/g;

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9/()]+/g, " ")
    .replace(LEGAL_SUFFIX, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s: string, noise?: RegExp): Set<string> {
  const cleaned = noise ? normalize(s).replace(noise, " ") : normalize(s);
  return new Set(cleaned.replace(/[/()]/g, " ").split(/\s+/).filter(Boolean));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

function isSubset(a: Set<string>, b: Set<string>): boolean {
  if (a.size === 0) return false;
  for (const t of a) if (!b.has(t)) return false;
  return true;
}

export function companySimilarity(a: string, b: string): number {
  const na = normalize(a).replace(/[/()]/g, " ").replace(/\s+/g, " ").trim();
  const nb = normalize(b).replace(/[/()]/g, " ").replace(/\s+/g, " ").trim();
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if ((na.length >= 3 && nb.includes(na)) || (nb.length >= 3 && na.includes(nb))) return 0.9;
  return jaccard(tokens(a), tokens(b));
}

export function roleSimilarity(a: string, b: string): number {
  const ta = tokens(a, ROLE_NOISE);
  const tb = tokens(b, ROLE_NOISE);
  if (isSubset(ta, tb) || isSubset(tb, ta)) return 0.9;
  return jaccard(ta, tb);
}

/**
 * Match a classification to the most plausible application.
 * A single application at the matched company is accepted even when the role
 * title diverges (company identity dominates); multiple applications at the
 * same company are disambiguated by role similarity.
 */
export function matchApplication(
  c: Pick<Classification, "company" | "role_title">,
  apps: Application[],
): MatchResult | null {
  if (!c.company) return null;

  const candidates = apps
    .map((app) => ({ app, cs: companySimilarity(c.company as string, app.company) }))
    .filter((x) => x.cs >= 0.65);
  if (candidates.length === 0) return null;

  let best: MatchResult | null = null;
  for (const { app, cs } of candidates) {
    const rs = c.role_title ? roleSimilarity(c.role_title, app.roleTitle) : null;
    const confidence =
      candidates.length === 1
        ? cs * (rs == null ? 0.85 : 0.7 + 0.3 * rs)
        : rs == null
          ? cs * 0.6
          : cs * 0.5 + rs * 0.5;
    if (!best || confidence > best.confidence) {
      best = {
        applicationId: app.id,
        confidence: Math.round(confidence * 100) / 100,
        method: rs == null ? "company" : "company+role",
      };
    }
  }
  return best && best.confidence >= 0.5 ? best : null;
}

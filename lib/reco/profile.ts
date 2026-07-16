import { ACTIVE_STATUSES, roleBucket, type Status } from "@/lib/constants";
import type { Application } from "@/lib/db/schema";

/**
 * JOBDASH-006 §5 — "what I'm doing now" as data. Pure: the affinity profile is
 * counted from the ACTIVE_STATUSES applications passed in, nothing inferred.
 */

export interface AffinityProfile {
  /** how many active applications the profile is built from */
  sampleSize: number;
  /** role buckets by share of the active pipeline, desc */
  buckets: { key: string; label: string; weight: number }[];
  /** recurring title tokens (appear ≥2×), most frequent first */
  keywords: string[];
  /** language-requirement distribution across active apps */
  germanShare: Record<string, number>;
  /** source distribution across active apps */
  sourceShare: Record<string, number>;
  medianFit: number | null;
}

const STOPWORDS = new Set([
  "the", "and", "for", "of", "in", "at", "to", "with", "und", "für",
  "remote", "berlin", "germany", "deutschland", "gmbh",
  "junior", "senior", "lead", "head", "intern", "working", "student",
]);

/** Title → meaningful lowercase tokens ("(m/w/d)" gender markers dropped). */
export function titleTokens(title: string | null | undefined): string[] {
  if (!title) return [];
  return title
    .toLowerCase()
    .replace(/\((?:[mfwdx]\s*\/\s*)+[mfwdx]\)/g, " ")
    .split(/[^a-zà-öø-ÿ]+/i)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

export function buildAffinityProfile(apps: Application[]): AffinityProfile {
  const active = apps.filter((a) => ACTIVE_STATUSES.includes(a.status as Status));

  const bucketCounts = new Map<string, { label: string; n: number }>();
  const tokenCounts = new Map<string, number>();
  const germanShare: Record<string, number> = {};
  const sourceShare: Record<string, number> = {};
  const fits: number[] = [];

  for (const app of active) {
    const bucket = roleBucket(app.roleTitle);
    const b = bucketCounts.get(bucket.key) ?? { label: bucket.label, n: 0 };
    b.n += 1;
    bucketCounts.set(bucket.key, b);

    for (const token of new Set(titleTokens(app.roleTitle))) {
      tokenCounts.set(token, (tokenCounts.get(token) ?? 0) + 1);
    }
    const german = app.germanReq ?? "unknown";
    germanShare[german] = (germanShare[german] ?? 0) + 1;
    sourceShare[app.source] = (sourceShare[app.source] ?? 0) + 1;
    if (app.fitScore != null) fits.push(app.fitScore);
  }

  const buckets = [...bucketCounts.entries()]
    .map(([key, { label, n }]) => ({ key, label, weight: n / active.length }))
    .sort((a, b) => b.weight - a.weight);

  const keywords = [...tokenCounts.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 12)
    .map(([token]) => token);

  fits.sort((a, b) => a - b);
  const medianFit =
    fits.length === 0
      ? null
      : fits.length % 2
        ? fits[(fits.length - 1) / 2]
        : Math.round((fits[fits.length / 2 - 1] + fits[fits.length / 2]) / 2);

  return { sampleSize: active.length, buckets, keywords, germanShare, sourceShare, medianFit };
}

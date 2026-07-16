import {
  FIT_BAND_META,
  GERMAN_REQ_META,
  roleBucket,
  sourceLabel,
  type FitBand,
  type GermanReq,
} from "@/lib/constants";
import type { Application } from "@/lib/db/schema";

/**
 * JOBDASH-006 §4 — rejection analysis, pure and deterministic.
 * One aggregator looped over four dimension descriptors (role bucket, source,
 * language requirement, fit band); every number is a count over the rows
 * passed in — nothing is estimated. The LLM layer (route) only narrates this.
 */

export interface RejectionRow {
  key: string;
  label: string;
  /** apps in this segment that were submitted (or rejected pre-submit) */
  population: number;
  rejected: number;
  /** rejected / population, 0..1 */
  rate: number;
}

export interface RejectionDimension {
  key: "role" | "source" | "german" | "fit";
  label: string;
  rows: RejectionRow[];
}

export interface RejectionAnalysis {
  population: number;
  rejected: number;
  dimensions: RejectionDimension[];
  /** deterministic "what's getting rejected" lines, each traceable to a row */
  summary: string[];
}

function isRejected(a: Application): boolean {
  return a.status === "rejected" || a.closedReason === "rejected";
}

type DimensionSpec = {
  key: RejectionDimension["key"];
  label: string;
  of: (a: Application) => { key: string; label: string };
};

const DIMENSIONS: DimensionSpec[] = [
  { key: "role", label: "Role type", of: (a) => roleBucket(a.roleTitle) },
  {
    key: "source",
    label: "Source",
    of: (a) => ({ key: a.source, label: sourceLabel(a.source) }),
  },
  {
    key: "german",
    label: "Language",
    of: (a) => {
      const key = (a.germanReq ?? "unknown") as GermanReq;
      return { key, label: (GERMAN_REQ_META[key] ?? GERMAN_REQ_META.unknown).label };
    },
  },
  {
    key: "fit",
    label: "Fit band",
    of: (a) => {
      const band = a.fitBand as FitBand | null;
      return band && FIT_BAND_META[band]
        ? { key: band, label: FIT_BAND_META[band].label }
        : { key: "unscored", label: "Unscored" };
    },
  },
];

/** Segments with fewer submitted apps than this stay in the table but out of the summary. */
export const MIN_SUMMARY_POPULATION = 2;

export function analyzeRejections(apps: Application[]): RejectionAnalysis {
  // Population = apps that actually went out (or were closed as rejected
  // before a submit stamp existed — historical email-sync rejections).
  const population = apps.filter((a) => a.appliedAt || isRejected(a));

  const dimensions: RejectionDimension[] = DIMENSIONS.map((dim) => {
    const rows = new Map<string, RejectionRow>();
    for (const app of population) {
      const seg = dim.of(app);
      const row =
        rows.get(seg.key) ??
        rows
          .set(seg.key, { key: seg.key, label: seg.label, population: 0, rejected: 0, rate: 0 })
          .get(seg.key)!;
      row.population += 1;
      if (isRejected(app)) row.rejected += 1;
    }
    const sorted = [...rows.values()]
      .map((r) => ({ ...r, rate: r.population ? r.rejected / r.population : 0 }))
      .sort((x, y) => y.rate - x.rate || y.population - x.population);
    return { key: dim.key, label: dim.label, rows: sorted };
  });

  const rejected = population.filter(isRejected).length;

  const summary: string[] = [];
  if (population.length > 0) {
    summary.push(
      `${rejected} of ${population.length} tracked applications ended rejected (${pct(
        rejected / population.length,
      )}).`,
    );
  }
  for (const dim of dimensions) {
    const worst = dim.rows.find(
      (r) => r.population >= MIN_SUMMARY_POPULATION && r.rejected > 0,
    );
    if (worst && worst.rate > 0) {
      summary.push(
        `${dim.label} — ${worst.label}: ${worst.rejected} of ${worst.population} rejected (${pct(worst.rate)}).`,
      );
    }
  }

  return { population: population.length, rejected, dimensions, summary };
}

export function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

/**
 * Every number the narration LLM is allowed to utter: the overall counts, each
 * segment's counts, and their whole-percent forms. Anything else in its output
 * is a fabrication by definition.
 */
export function allowedNarrationNumbers(analysis: RejectionAnalysis): Set<number> {
  const allowed = new Set<number>([
    analysis.population,
    analysis.rejected,
    Math.round((analysis.population ? analysis.rejected / analysis.population : 0) * 100),
  ]);
  for (const dim of analysis.dimensions) {
    for (const row of dim.rows) {
      allowed.add(row.population);
      allowed.add(row.rejected);
      allowed.add(Math.round(row.rate * 100));
    }
  }
  return allowed;
}

/**
 * Verify a narration against the table it was generated from: extract every
 * numeric token and reject the text when any is not in the allowlist. Strict
 * by design — a false rejection just falls back to the deterministic summary.
 */
export function verifyNarration(
  text: string,
  analysis: RejectionAnalysis,
): { ok: boolean; offending: string[] } {
  const allowed = allowedNarrationNumbers(analysis);
  const offending: string[] = [];
  for (const token of text.match(/\d+(?:[.,]\d+)?/g) ?? []) {
    const value = Number(token.replace(",", "."));
    if (!allowed.has(value)) offending.push(token);
  }
  return { ok: offending.length === 0, offending };
}

/**
 * Role-bucket keys whose rejection signal is strong enough that §5's
 * recommender should stop surfacing similar roles: at least `minPopulation`
 * submitted AND a rejection rate at/above `minRate`.
 */
export function highRejectRoleBuckets(
  analysis: RejectionAnalysis,
  { minPopulation = 3, minRate = 0.75 }: { minPopulation?: number; minRate?: number } = {},
): string[] {
  const role = analysis.dimensions.find((d) => d.key === "role");
  if (!role) return [];
  return role.rows
    .filter((r) => r.population >= minPopulation && r.rate >= minRate)
    .map((r) => r.key);
}

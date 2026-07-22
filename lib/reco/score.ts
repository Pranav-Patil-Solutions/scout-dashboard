import { gateFailure, roleBucket } from "@/lib/constants";
import { titleTokens, type AffinityProfile } from "./profile";

/**
 * JOBDASH-006 §5 — similarity of one scout job to the active pipeline,
 * 0..100. Pure and per-row (§6: ONE reusable fn looped over all rows).
 * Role buckets §4 flags as high-reject come in via `excludeBuckets` and mark
 * the recommendation excluded — the feedback loop closes here.
 */

export interface ScoutJobLike {
  title: string | null;
  languageFlag: string | null;
  source: string | null;
  score: number | null;
  /** The scraper's one-line verdict; carries the "⛔ Gn …" marker when gated. */
  reason?: string | null;
}

export interface Recommendation {
  /** similarity 0..100 */
  score: number;
  /** one-line "why recommended" (or why paused) for the detail pane */
  why: string;
  excluded: boolean;
}

export const RECO_WEIGHTS = { bucket: 40, keywords: 25, language: 20, fit: 15 } as const;

/** English-first gate as points — German-mandatory roles earn nothing here. */
const LANGUAGE_POINTS: Record<string, number> = {
  none: 20,
  bonus: 18,
  unknown: 10,
  de_en: 6,
  native: 0,
};

export function scoreScoutJob(
  job: ScoutJobLike,
  profile: AffinityProfile,
  excludeBuckets: string[] = [],
): Recommendation {
  const bucket = roleBucket(job.title ?? "");
  const maxWeight = profile.buckets[0]?.weight ?? 0;
  const bucketWeight = profile.buckets.find((b) => b.key === bucket.key)?.weight ?? 0;
  const bucketPts =
    maxWeight > 0 ? RECO_WEIGHTS.bucket * (bucketWeight / maxWeight) : 0;

  const tokens = new Set(titleTokens(job.title));
  const matched = profile.keywords.filter((k) => tokens.has(k));
  const keywordPts = RECO_WEIGHTS.keywords * (Math.min(matched.length, 3) / 3);

  const languagePts = LANGUAGE_POINTS[job.languageFlag ?? "unknown"] ?? LANGUAGE_POINTS.unknown;

  const fitBase = job.score ?? profile.medianFit ?? 50;
  const clampedFit = Math.max(0, Math.min(100, fitBase));
  const fitPts = RECO_WEIGHTS.fit * (clampedFit / 100);

  const score = Math.round(bucketPts + keywordPts + languagePts + fitPts);

  // A job the scraper gated (not English-first, corporate, unreachable, or not
  // a real posting) must never be recommended, however well its title happens
  // to match the pipeline — the affinity profile is title-driven and would
  // otherwise happily surface "AI Operations Lead @ Ericsson, London".
  const gate = gateFailure(job.reason);
  if (gate) {
    return {
      score,
      excluded: true,
      why: `Ruled out by your scout — failed ${gate}.`,
    };
  }

  if (excludeBuckets.includes(bucket.key)) {
    return {
      score,
      excluded: true,
      why: `Paused — your ${bucket.label} applications keep ending in rejection, so this lane is ranked last.`,
    };
  }

  const parts: string[] = [];
  if (bucketPts >= RECO_WEIGHTS.bucket / 2) parts.push(`your ${bucket.label} lane`);
  if (matched.length > 0)
    parts.push(`shares ${matched.slice(0, 2).map((k) => `“${k}”`).join(", ")}`);
  if (languagePts >= LANGUAGE_POINTS.bonus) parts.push("English-first");
  // Display the clamped value — a scraper glitch (score 150) must not render.
  if (job.score != null && clampedFit >= 75) parts.push(`fit ${clampedFit}`);

  return {
    score,
    excluded: false,
    why: parts.length
      ? `Matches ${parts.join(" · ")}`
      : "Low overlap with your current pipeline.",
  };
}

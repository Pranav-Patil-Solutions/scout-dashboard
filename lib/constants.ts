/**
 * Scout Control domain vocabulary — JOBDASH-001 §5/§9.
 * Hex values mirror the CSS custom properties in app/globals.css (the reserved
 * status palette). Keep the two in sync; this file is the source of truth for JS
 * (charts, board dots, chips) and CSS is the source of truth for utility classes.
 */

export type Status =
  | "sourced"
  | "to_apply"
  | "applied"
  | "screening"
  | "interview"
  | "offer"
  | "rejected"
  | "withdrawn"
  | "expired_missed";

export type FitBand = "strong" | "stretch" | "skip";
export type GermanReq = "none" | "bonus" | "de_en" | "native" | "unknown";
export type WorkMode = "remote" | "hybrid" | "onsite";

export interface StatusMeta {
  key: Status;
  label: string;
  color: string;
  /** shown on the board? (closed states live in the collapsed tray) */
  group: "triage" | "board" | "closed";
}

export const STATUS_META: Record<Status, StatusMeta> = {
  sourced: { key: "sourced", label: "Sourced", color: "#8a8fa3", group: "triage" },
  to_apply: { key: "to_apply", label: "To apply", color: "#9b8cff", group: "board" },
  applied: { key: "applied", label: "Applied", color: "#6b7a99", group: "board" },
  screening: { key: "screening", label: "Screening", color: "#fbb03b", group: "board" },
  interview: { key: "interview", label: "Interview", color: "#17c08a", group: "board" },
  offer: { key: "offer", label: "Offer", color: "#f4c430", group: "board" },
  rejected: { key: "rejected", label: "Rejected", color: "#fb5473", group: "closed" },
  withdrawn: { key: "withdrawn", label: "Withdrawn", color: "#5b616b", group: "closed" },
  expired_missed: { key: "expired_missed", label: "Missed", color: "#ff5a52", group: "closed" },
};

/** The five live board columns, left → right (§5). */
export const BOARD_COLUMNS: Status[] = [
  "to_apply",
  "applied",
  "screening",
  "interview",
  "offer",
];

export const CLOSED_STATUSES: Status[] = ["rejected", "withdrawn", "expired_missed"];

/** Applied-and-still-moving (used for "Active apps" tile). */
export const ACTIVE_STATUSES: Status[] = [
  "to_apply",
  "applied",
  "screening",
  "interview",
  "offer",
];

/** Statuses that represent a real submitted application (denominator for rates). */
export const APPLIED_FUNNEL: Status[] = [
  "applied",
  "screening",
  "interview",
  "offer",
];

export function statusMeta(status: string): StatusMeta {
  return STATUS_META[status as Status] ?? STATUS_META.applied;
}

export interface SourceMeta {
  key: string;
  label: string;
}

export const SOURCES: SourceMeta[] = [
  { key: "indeed", label: "Indeed" },
  { key: "join", label: "Join" },
  { key: "cherry", label: "Cherry" },
  { key: "smartrecruiters", label: "SmartRecruiters" },
  { key: "ashby", label: "Ashby" },
  { key: "greenhouse", label: "Greenhouse" },
  { key: "wellfound", label: "Wellfound" },
  { key: "cold-email", label: "Cold email" },
  { key: "scraper", label: "Scout" },
  { key: "referral", label: "Referral" },
];

export function sourceLabel(key: string | null | undefined): string {
  if (!key) return "—";
  return SOURCES.find((s) => s.key === key)?.label ?? key;
}

export const GERMAN_REQ_META: Record<GermanReq, { label: string; color: string; tone: string }> = {
  none: { label: "English OK", color: "#17c08a", tone: "English-first" },
  bonus: { label: "German a plus", color: "#8a8fa3", tone: "English-first" },
  de_en: { label: "DE + EN", color: "#fbb03b", tone: "German-required" },
  native: { label: "Native German", color: "#fb5473", tone: "German-required" },
  unknown: { label: "Language unknown", color: "#666b7d", tone: "Unknown" },
};

/** §4: derive band from score when null — >=75 strong / >=50 stretch / <50 skip. */
export function deriveFitBand(score: number | null | undefined): FitBand | null {
  if (score == null) return null;
  if (score >= 75) return "strong";
  if (score >= 50) return "stretch";
  return "skip";
}

export const FIT_BAND_META: Record<FitBand, { label: string; color: string }> = {
  strong: { label: "Strong fit", color: "#17c08a" },
  stretch: { label: "Stretch", color: "#fbb03b" },
  skip: { label: "Skip", color: "#6b7a99" },
};

export function fitBandFor(
  band: string | null | undefined,
  score: number | null | undefined,
): FitBand | null {
  if (band === "strong" || band === "stretch" || band === "skip") return band;
  return deriveFitBand(score);
}

export const WORK_MODES: WorkMode[] = ["remote", "hybrid", "onsite"];
export const SENIORITY = ["intern", "early", "mid", "senior"] as const;

/**
 * Role-type buckets for the "Engineer/specialised = rejected" analysis (§7).
 * Order matters: specialised buckets match BEFORE the broad FA/Ops ones, so
 * "Founders Associate Marketing" lands in Marketing (the Reonic case), and
 * "AI Enablement Engineer" in Engineer.
 */
export const ROLE_BUCKETS: { key: string; label: string; match: RegExp }[] = [
  { key: "engineer", label: "Engineer", match: /engineer|developer|swe\b/i },
  { key: "marketing", label: "Marketing", match: /marketing|growth|content/i },
  { key: "procurement", label: "Procurement", match: /procure|sourcing|supply/i },
  { key: "fa", label: "FA / CoS", match: /founder'?s?\s*assoc|founding|chief of staff|\bcos\b/i },
  { key: "ops", label: "Ops / AI-Ops", match: /\bops\b|operations|enablement/i },
];

export function roleBucket(title: string): { key: string; label: string } {
  for (const b of ROLE_BUCKETS) if (b.match.test(title)) return { key: b.key, label: b.label };
  return { key: "other", label: "Other" };
}

/** Weekly-velocity goal line (§7 default). */
export const WEEKLY_GOAL = 5;

/** Follow-up is "overdue" after this many silent days (§6A / §7). */
export const FOLLOWUP_SILENT_DAYS = 10;

/** Categorical chart ramp (identity) — mirrors --chart-1..5. Validator-passed (dark, both surfaces). */
export const CHART_CATEGORICAL = ["#7c6bf5", "#0fa39a", "#c98317", "#d4557c", "#5b8def"];

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

/* ==========================================================================
   JOBDASH-006 §5 — the search lanes the jobscraper should trawl. Canonical
   config from Pranav's job-search targeting (2026-07-13, widened to
   global-remote): the scraper repo reads these; importScoutJobs() then pulls
   whatever it wrote. Scheduled scraping is deliberately out of scope.
   ========================================================================== */

export const SEARCH_SOURCES: { key: string; label: string; url: string; lane: "global-remote" | "berlin-local" }[] = [
  { key: "yc-waas", label: "YC Work at a Startup", url: "https://www.workatastartup.com/jobs?remote=true", lane: "global-remote" },
  { key: "wellfound", label: "Wellfound (remote)", url: "https://wellfound.com/jobs", lane: "global-remote" },
  { key: "himalayas", label: "Himalayas", url: "https://himalayas.app/jobs", lane: "global-remote" },
  { key: "remoteok", label: "RemoteOK", url: "https://remoteok.com", lane: "global-remote" },
  { key: "startup-jobs", label: "startup.jobs (remote)", url: "https://startup.jobs/remote-jobs", lane: "global-remote" },
  { key: "builtin", label: "Built In (remote)", url: "https://builtin.com/jobs/remote", lane: "global-remote" },
  { key: "linkedin", label: "LinkedIn (remote)", url: "https://www.linkedin.com/jobs", lane: "global-remote" },
  { key: "topstartups", label: "topstartups.io", url: "https://topstartups.io/jobs", lane: "global-remote" },
  { key: "englishjobs-de", label: "englishjobs.de", url: "https://englishjobs.de", lane: "berlin-local" },
  { key: "hisignal", label: "Hisignal", url: "https://hisignal.io", lane: "berlin-local" },
  { key: "berlin-startup-jobs", label: "Berlin Startup Jobs", url: "https://berlinstartupjobs.com", lane: "berlin-local" },
  { key: "ashby-berlin", label: "Ashby boards (Berlin)", url: "https://jobs.ashbyhq.com", lane: "berlin-local" },
];

/** Target titles — the AI×Ops overlap zone plus startup-generalist lanes. */
export const SEARCH_QUERIES: string[] = [
  "AI Operations",
  "AI Automation Lead",
  "AI Automation Specialist",
  "Operations & Automation",
  "AI Enablement",
  "Agent Manager",
  "AI Program Manager",
  "Founders Associate",
  "Chief of Staff",
  "Founder's Office",
  "Business Operations",
  "Operations Associate",
];

/**
 * The scraper's relevancy contract.
 *
 * IMPORTANT: this is documentation of a pipeline that runs in the OTHER repo —
 * no code here calls it. Every score/reason/language_flag in scout_jobs is
 * produced by the Python jobscraper and read in verbatim by importScoutJobs().
 * Retuning relevancy means editing the jobscraper, not this file; this constant
 * exists so the contract is reviewable from the dashboard side.
 *
 * Mirrors (keep in sync — drift here caused the 2026-07-21 rebuild):
 *   jobscraper/gates.py      — G0..G3, enforced in code
 *   jobscraper/scoring.py    — keyword rubric, the recall stage
 *   jobscraper/llm_rank.py   — RANK_SYSTEM_PROMPT, the precision stage
 *
 * History: from 2026-07-13 to 2026-07-21 the gates below existed ONLY as this
 * string and nothing enforced them, so corporations (Ericsson, Swisscom) and
 * non-EU roles (Awign, India) scored in the 80s. They are now real code.
 */
export const SCOUT_SCORING_PROMPT = `You score one job posting for Pranav Patil — "AI Operations & Automation Builder": 5 yrs procurement/supply-chain/production ops (SAP MM, Lean, Six Sigma) + hands-on AI/full-stack building (agent fleets, LLM pipelines, Next.js products). Berlin-based, German permit, CET; German language level A2 only.

HARD GATES — evaluate in order; any failure caps score at 25 and the reason must name the failed gate:
G0 REAL POSTING: must be a specific role at an identifiable employer. A title echoing the search query, or a forum handle as the company, fails.
G1 ENGLISH-FIRST: working language must be English. German-mandatory (fluent/native/C1+) fails. "German is a plus" passes.
G2 STARTUP/SCALEUP: roughly Seed–Series C startups or scaleups. Corporations, agencies, staffing firms, talent marketplaces, universities fail.
G3 REACHABLE: fully-remote (global or EU-inclusive) OR on-site/hybrid in the EU/DACH OR Berlin-local. US/India/LATAM/APAC-located roles fail.

RUBRIC (gates passed → score 40..100). Judge what the person would DO all day, not how many keywords appear:
+ core AI×Ops overlap (AI Operations / AI Automation / AI Enablement / Agent Ops / AI Program Mgmt): 85–100
+ startup-generalist (Founders Associate, Chief of Staff, Founder's Office, BizOps): 70–90
+ classic ops with automation surface (Operations Associate/Manager with tooling/AI mentions): 55–80
− the role IS an engineering or specialist post (SWE/ML/data engineer, Marketing, Sales, Recruiting, Design): ≤ 30 (proven rejecters) even when the title also contains "AI" or "Operations"
− entry-level (Intern / Werkstudent / Trainee): heavily down-weighted — 5 yrs experience makes these a step backwards

OUTPUT — exactly one JSON object, no prose:
{"source":"<board key>","title":"<posting title>","company":"<company>","url":"<canonical posting url>","score":<0-100 integer>,"reason":"<one sentence: strongest match signal or the failed gate>","language":"en|bonus|de_en|de"}`;

/**
 * Scores at or below this were capped by a hard gate in the scraper rather than
 * earned by the rubric. Mirrors GATE_FAIL_CAP in jobscraper/gates.py.
 */
export const GATE_FAIL_CAP = 25;

/**
 * The scraper prefixes a gated job's reason with "⛔ G2 STARTUP/SCALEUP: …".
 * Returns the gate name, or null when the job passed every gate. Parsing the
 * reason (rather than inferring from a low score) keeps a genuinely weak-but-
 * ungated job distinguishable from a suppressed one.
 */
export function gateFailure(reason: string | null | undefined): string | null {
  const match = /⛔\s*(G\d[A-Z\s/-]*)/.exec(reason ?? "");
  return match ? match[1].trim() : null;
}

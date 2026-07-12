import "server-only";
import {
  differenceInCalendarDays,
  format,
  getISOWeek,
  getISOWeekYear,
  startOfISOWeek,
  addWeeks,
  isBefore,
} from "date-fns";
import { getAllApplications } from "./queries";
import { GERMAN_REQ_META, ROLE_BUCKETS, roleBucket, WEEKLY_GOAL, type GermanReq } from "./constants";
import type { Application } from "./db/schema";

/**
 * Analytics for /analytics — JOBDASH-001 §7, definitions implemented verbatim.
 * "Applied" (the denominator for every rate) = has a real applied_at timestamp.
 */

export type Outcome = "rejected" | "no_response" | "responded" | "interview";

export interface AnalyticsData {
  kpi: {
    applied: number;
    responseRate: number | null; // %
    interviewRate: number | null; // %
    medianTimeToResponse: number | null; // days
    medianTimeToRejection: number | null; // days
    responded: number;
    interviews: number;
    rejections: number;
  };
  funnel: { stage: string; count: number; pctOfApplied: number }[];
  velocity: { week: string; count: number; isCurrent: boolean }[];
  weeklyGoal: number;
  fitOutcome: { outcome: Outcome; fit: number; company: string; role: string }[];
  sources: {
    source: string;
    sent: number;
    responseRate: number;
    interviewRate: number;
  }[];
  language: { group: string; sent: number; responseRate: number | null }[];
  roles: { bucket: string; sent: number; responseRate: number; rejections: number }[];
  missed: { count: number; apps: { id: string; company: string; role: string; fit: number | null; kitWasReady: boolean }[] };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function pct(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 100);
}

/** Did this application ever get a genuine human response? */
function responded(a: Application): boolean {
  return !!a.firstResponseAt;
}

/** Did it reach interview or beyond? */
function reachedInterview(a: Application): boolean {
  return a.status === "interview" || a.status === "offer" || a.closedReason === "hired" || a.closedReason === "offer_declined";
}

/**
 * Funnel reach rank: how deep did this application get?
 * 1 applied · 2 screening · 3 interview · 4 offer. Closed apps count the
 * deepest stage they hit (a response implies screening was reached).
 */
function reachRank(a: Application): number {
  switch (a.status) {
    case "offer": return 4;
    case "interview": return 3;
    case "screening": return 2;
    case "applied": return responded(a) ? 2 : 1;
    default: {
      // closed — infer from history
      if (a.closedReason === "hired" || a.closedReason === "offer_declined") return 4;
      return responded(a) ? 2 : 1;
    }
  }
}

function outcomeOf(a: Application): Outcome {
  if (reachedInterview(a)) return "interview";
  if (a.closedReason === "rejected") return "rejected";
  if (responded(a)) return "responded";
  return "no_response";
}

export function computeAnalytics(now = new Date()): AnalyticsData {
  const all = getAllApplications();
  const applied = all.filter((a) => a.appliedAt);

  const respondedApps = applied.filter(responded);
  const interviewApps = applied.filter(reachedInterview);
  const rejectedApps = applied.filter((a) => a.closedReason === "rejected" && a.closedAt);

  // --- KPIs
  const ttrDays = respondedApps
    .filter((a) => a.appliedAt && a.firstResponseAt)
    .map((a) => differenceInCalendarDays(a.firstResponseAt!, a.appliedAt!));
  const ttrejDays = rejectedApps
    .filter((a) => a.appliedAt && a.closedAt)
    .map((a) => differenceInCalendarDays(a.closedAt!, a.appliedAt!));

  const kpi = {
    applied: applied.length,
    responseRate: applied.length ? pct(respondedApps.length, applied.length) : null,
    interviewRate: applied.length ? pct(interviewApps.length, applied.length) : null,
    medianTimeToResponse: median(ttrDays),
    medianTimeToRejection: median(ttrejDays),
    responded: respondedApps.length,
    interviews: interviewApps.length,
    rejections: rejectedApps.length,
  };

  // --- Funnel conversion (reach counts, % of applied)
  const stages = ["Applied", "Screening", "Interview", "Offer"];
  const funnel = stages.map((stage, i) => {
    const count = applied.filter((a) => reachRank(a) >= i + 1).length;
    return { stage, count, pctOfApplied: pct(count, applied.length) };
  });

  // --- Weekly velocity vs goal (ISO weeks from first application to now)
  const velocity: AnalyticsData["velocity"] = [];
  if (applied.length) {
    const first = applied.reduce(
      (min, a) => (a.appliedAt! < min ? a.appliedAt! : min),
      applied[0].appliedAt!,
    );
    let cursor = startOfISOWeek(first);
    const currentWeekStart = startOfISOWeek(now);
    while (!isBefore(currentWeekStart, cursor)) {
      const wk = cursor;
      const label = `W${getISOWeek(wk)}`;
      const count = applied.filter(
        (a) => startOfISOWeek(a.appliedAt!).getTime() === wk.getTime(),
      ).length;
      velocity.push({
        week: label,
        count,
        isCurrent: wk.getTime() === currentWeekStart.getTime(),
      });
      cursor = addWeeks(cursor, 1);
      if (velocity.length > 26) break; // cap at half a year of columns
    }
  }

  // --- Fit-score vs outcome (per applied application with a score)
  const fitOutcome = applied
    .filter((a) => a.fitScore != null)
    .map((a) => ({
      outcome: outcomeOf(a),
      fit: a.fitScore!,
      company: a.company,
      role: a.roleTitle,
    }));

  // --- Source performance
  const bySource = new Map<string, Application[]>();
  for (const a of applied) {
    const list = bySource.get(a.source) ?? [];
    list.push(a);
    bySource.set(a.source, list);
  }
  const sources = [...bySource.entries()]
    .map(([source, apps]) => ({
      source,
      sent: apps.length,
      responseRate: pct(apps.filter(responded).length, apps.length),
      interviewRate: pct(apps.filter(reachedInterview).length, apps.length),
    }))
    .sort((a, b) => b.sent - a.sent || b.responseRate - a.responseRate);

  // --- Language outcomes (english-first vs german-required)
  const langGroup = (a: Application) =>
    (GERMAN_REQ_META[(a.germanReq ?? "unknown") as GermanReq] ?? GERMAN_REQ_META.unknown).tone;
  const language = ["English-first", "German-required", "Unknown"]
    .map((group) => {
      const apps = applied.filter((a) => langGroup(a) === group);
      return {
        group,
        sent: apps.length,
        responseRate: apps.length ? pct(apps.filter(responded).length, apps.length) : null,
      };
    })
    .filter((g) => g.sent > 0 || g.group !== "Unknown");

  // --- Role-type outcomes (the Engineer/specialised pattern)
  const buckets = [...ROLE_BUCKETS.map((b) => b.label), "Other"];
  const roles = buckets
    .map((label) => {
      const apps = applied.filter((a) => roleBucket(a.roleTitle).label === label);
      return {
        bucket: label,
        sent: apps.length,
        responseRate: pct(apps.filter(responded).length, apps.length),
        rejections: apps.filter((a) => a.closedReason === "rejected").length,
      };
    })
    .filter((r) => r.sent > 0)
    .sort((a, b) => b.responseRate - a.responseRate || b.sent - a.sent);

  // --- MISSED (the Moss lesson)
  const missedApps = all.filter((a) => a.status === "expired_missed");
  const missed = {
    count: missedApps.length,
    apps: missedApps.map((a) => ({
      id: a.id,
      company: a.company,
      role: a.roleTitle,
      fit: a.fitScore,
      kitWasReady: a.isKitReady,
    })),
  };

  return {
    kpi,
    funnel,
    velocity,
    weeklyGoal: WEEKLY_GOAL,
    fitOutcome,
    sources,
    language,
    roles,
    missed,
  };
}

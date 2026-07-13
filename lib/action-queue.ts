import { differenceInCalendarDays } from "date-fns";
import { FOLLOWUP_SILENT_DAYS } from "./constants";
import type { Application } from "./db/schema";

/**
 * The Action Queue — JOBDASH-001 §6A. Ranked "what to do NOW" cards.
 * Four alert types, in severity order (the Moss lesson is #1):
 *   kit_ready   ⚠ kit prepared but application never sent (red)
 *   overdue     ⏰ live application silent > FOLLOWUP_SILENT_DAYS
 *   closing     ⌛ posting sitting unapplied long enough that it may expire
 *   next_send   ▶ the single best remaining application to send
 *
 * Snooze contract: `snoozed_until` in the future hides a card from every rule
 * until that date passes. (Deliberately separate from next_action_due, which is
 * a real task deadline — a future deadline must NOT hide a kit-ready alert.)
 */

export type ActionKind = "kit_ready" | "overdue" | "closing" | "next_send";

export interface ActionItem {
  kind: ActionKind;
  app: Application;
  /** e.g. "Kit ready, never sent", used as the card headline */
  title: string;
  /** supporting line, e.g. "silent for 21d · due 30 Jun" */
  detail: string;
  /** lower = more urgent (stable sort key) */
  rank: number;
}

/** A posting waiting in to_apply this long is at risk of closing (heuristic). */
const CLOSING_AGE_DAYS = 10;

function snoozed(app: Application, now: Date): boolean {
  return !!app.snoozedUntil && app.snoozedUntil > now;
}

function silentDays(app: Application, now: Date): number {
  const last = app.lastActivityAt ?? app.appliedAt ?? app.createdAt;
  return differenceInCalendarDays(now, last);
}

export function buildActionQueue(apps: Application[], now = new Date()): ActionItem[] {
  const items: ActionItem[] = [];
  const claimed = new Set<string>();

  // 1 ⚠ Kit ready, not submitted — open pipeline only (Moss-class risk).
  for (const app of apps) {
    if (!app.isKitReady) continue;
    if (app.status !== "to_apply" && app.status !== "sourced") continue;
    if (snoozed(app, now)) continue;
    const waited = differenceInCalendarDays(now, app.lastActivityAt ?? app.createdAt);
    const cvGrade = (app.kitGrade as { overall?: number } | null)?.overall;
    items.push({
      kind: "kit_ready",
      app,
      title: "Kit ready — not sent",
      detail: `${app.resumeVariant ?? "Kit"} prepared ${waited <= 0 ? "today" : `${waited}d ago`} · fit ${app.fitScore ?? "—"}${typeof cvGrade === "number" ? ` · CV ${cvGrade}/100` : ""}`,
      rank: 100 - (app.fitScore ?? 0),
    });
    claimed.add(app.id);
  }

  // 2 ⏰ Follow-up overdue — applied/screening and silent too long.
  for (const app of apps) {
    if (claimed.has(app.id)) continue;
    if (app.status !== "applied" && app.status !== "screening") continue;
    if (snoozed(app, now)) continue;
    const silent = silentDays(app, now);
    if (silent < FOLLOWUP_SILENT_DAYS) continue;
    items.push({
      kind: "overdue",
      app,
      title: "Follow-up overdue",
      detail: `Silent for ${silent}d in ${app.status === "screening" ? "screening" : "applied"}${app.nextAction ? ` · ${app.nextAction}` : ""}`,
      rank: 200 - silent,
    });
    claimed.add(app.id);
  }

  // 3 ⌛ Posting may be closing — unapplied and aging (kit-less Moss-risk).
  for (const app of apps) {
    if (claimed.has(app.id)) continue;
    if (app.status !== "to_apply") continue;
    if (snoozed(app, now)) continue;
    const age = differenceInCalendarDays(now, app.createdAt);
    if (age < CLOSING_AGE_DAYS) continue;
    items.push({
      kind: "closing",
      app,
      title: "Posting may be closing",
      detail: `Sitting unapplied for ${age}d · fit ${app.fitScore ?? "—"}`,
      rank: 300 - age,
    });
    claimed.add(app.id);
  }

  // 4 ▶ Next application to send — the single best remaining to_apply.
  const candidates = apps
    .filter(
      (a) => !claimed.has(a.id) && a.status === "to_apply" && !snoozed(a, now),
    )
    .sort((a, b) => (b.fitScore ?? 0) - (a.fitScore ?? 0));
  if (candidates[0]) {
    const app = candidates[0];
    items.push({
      kind: "next_send",
      app,
      title: "Next application to send",
      detail: `Best open fit (${app.fitScore ?? "—"})${app.location ? ` · ${app.location}` : ""}`,
      rank: 400,
    });
  }

  return items.sort((a, b) => a.rank - b.rank);
}

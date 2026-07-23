"use server";

import { and, eq, gte, isNotNull } from "drizzle-orm";
import { db } from "./db";
import { scoutJobs } from "./db/schema";
import { applyToScoutJob } from "./actions";
import { AUTO_APPLY_MIN_SCORE, isAutoApplyEligible } from "./scout-autosync-policy";

/**
 * JOBDASH-009 — auto-add the daily digest's strong fits to "To apply".
 *
 * The scraper stamps `emailed_at` on every job that makes the daily digest. This
 * promotes the ones worth acting on immediately (score ≥ AUTO_APPLY_MIN_SCORE)
 * onto the board so the user opens the app to a ready to-do list instead of an
 * empty column.
 *
 * It REUSES applyToScoutJob() rather than forking a second promote path: that
 * function already claims the scout row atomically (so a manual apply racing the
 * sync can't double-create) and is idempotent on an already-promoted row. This
 * module only decides WHICH jobs qualify.
 *
 * Deliberately conservative — it would rather skip a borderline job than clutter
 * the board with one the user must then triage away:
 *   · status must still be "new" (never re-touch a dismissed/promoted row)
 *   · score ≥ 75 (the "strong fit" band; stretch/skip stay in Discover)
 *   · reason must carry NO "⛔ Gn" gate marker — belt-and-braces against a stale
 *     score reading ≥ 75 on a row the scraper actually gated.
 */

export interface AutoSyncResult {
  /** newly created To-apply cards */
  promoted: number;
  /** already on the board (idempotent no-ops) */
  reused: number;
  /** eligible-looking but held back (gate marker, or a mid-run claim race) */
  skipped: number;
  /** "Company — Role" of the cards created this run, for the toast */
  promotedLabels: string[];
}

export async function autoSyncEmailedJobs(): Promise<AutoSyncResult> {
  const candidates = await db
    .select()
    .from(scoutJobs)
    .where(
      and(
        eq(scoutJobs.status, "new"),
        isNotNull(scoutJobs.emailedAt),
        gte(scoutJobs.score, AUTO_APPLY_MIN_SCORE),
      ),
    )
    .all();

  const result: AutoSyncResult = { promoted: 0, reused: 0, skipped: 0, promotedLabels: [] };

  for (const job of candidates) {
    // The SQL WHERE already applied status/emailed/score; re-check the full
    // predicate so the gate-marker guard is enforced in exactly one place.
    if (!isAutoApplyEligible(job)) {
      result.skipped++;
      continue;
    }

    try {
      const { reused } = await applyToScoutJob(job.id, {
        note: "Auto-added from the daily scout digest",
        actor: "scraper",
      });
      if (reused) {
        result.reused++;
      } else {
        result.promoted++;
        result.promotedLabels.push(
          `${job.company?.trim() || "Unknown company"} — ${job.title?.trim() || "Untitled role"}`,
        );
      }
    } catch {
      // applyToScoutJob throws only when the row was claimed by a racing apply
      // between our SELECT and its UPDATE — that role is already on the board, so
      // a skip here is correct, not a lost job.
      result.skipped++;
    }
  }

  return result;
}

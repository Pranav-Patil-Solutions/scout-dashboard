import "server-only";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "./db";
import { scoutJobs, syncState, type ScoutJob } from "./db/schema";
import { probePosting } from "./posting-check";
import type { PostingVerdict } from "./posting-verdict";

/**
 * Discover expiry sweep (JOBDASH-007) — the scout-side half of the Moss guard.
 * Probes every Open (`new`) scout job's posting URL; verifiably dead postings
 * flip to `expired`, which removes them from every Discover tab and count
 * (all scout queries filter by status). Deleting the flagged rows is a
 * separate, explicit purge step so the sweep itself never destroys data.
 * Verdict rules live in posting-verdict.ts (pure); only `expired` verdicts
 * mutate anything — `unknown` is always a no-op, same as the pipeline watchdog.
 */

export interface ScoutSweepStats {
  checked: number;
  live: number;
  expired: number;
  unknown: number;
  /** "Company — Title" of rows flipped this run (toast detail). */
  expiredJobs: string[];
  /** Rows left unprobed by the per-run cap — run the sweep again for these. */
  remaining: number;
}

const CONCURRENCY = 6;
// Worst case per probe is the 12s fetch timeout, so a run is bounded by
// (MAX_PER_RUN / CONCURRENCY) * 12s = 240s — safely inside the route's
// maxDuration=300 on Vercel. Bigger queues finish across repeat runs.
const MAX_PER_RUN = 120;

function label(job: ScoutJob): string {
  return `${job.company?.trim() || "Unknown company"} — ${job.title?.trim() || "Untitled role"}`;
}

export async function sweepScoutJobs(
  probe: (url: string) => Promise<PostingVerdict> = probePosting,
): Promise<ScoutSweepStats> {
  const queue = await db
    .select()
    .from(scoutJobs)
    .where(and(eq(scoutJobs.status, "new"), isNotNull(scoutJobs.url)))
    .all();

  // Rotating window: live rows keep their `new` status, so a plain head-slice
  // would re-probe the same rows forever. The cursor (persisted in sync_state)
  // advances each run, so back-to-back sweeps cover the whole queue.
  const prior = await db.select().from(syncState).where(eq(syncState.id, "scout-sweep")).get();
  const offset = queue.length > 0 ? (Number(prior?.lastCursor) || 0) % queue.length : 0;
  const open = [...queue.slice(offset), ...queue.slice(0, offset)].slice(0, MAX_PER_RUN);

  const stats: ScoutSweepStats = {
    checked: open.length,
    live: 0,
    expired: 0,
    unknown: 0,
    expiredJobs: [],
    remaining: queue.length - open.length,
  };

  // Flips persist batch by batch, so a platform timeout mid-sweep keeps the
  // progress already made; the next run resumes with a smaller queue.
  for (let i = 0; i < open.length; i += CONCURRENCY) {
    const batch = open.slice(i, i + CONCURRENCY);
    const verdicts = await Promise.all(batch.map((j) => probe(j.url!)));
    for (let k = 0; k < batch.length; k++) {
      const v = verdicts[k];
      if (v.state === "expired") {
        // Status-guarded so an apply click racing the sweep wins: a row
        // promoted mid-flight must never be flipped off the board.
        const res = await db
          .update(scoutJobs)
          .set({ status: "expired" })
          .where(and(eq(scoutJobs.id, batch[k].id), eq(scoutJobs.status, "new")))
          .run();
        if (res.rowsAffected > 0) {
          stats.expired++;
          stats.expiredJobs.push(label(batch[k]));
        } else stats.unknown++;
      } else if (v.state === "live") stats.live++;
      else stats.unknown++;
    }
  }

  const nextCursor = String(queue.length > 0 ? (offset + open.length) % queue.length : 0);
  await db
    .insert(syncState)
    .values({ id: "scout-sweep", lastCursor: nextCursor, lastRunAt: new Date(), stats })
    .onConflictDoUpdate({
      target: syncState.id,
      set: { lastCursor: nextCursor, lastRunAt: new Date(), stats },
    })
    .run();

  return stats;
}

/** Delete every `expired` scout row. Only the sweep produces that status, so
 * this can never touch Open/Saved-for-later/On-board rows. */
export async function purgeExpiredScoutJobs(): Promise<{ deleted: number }> {
  const res = await db.delete(scoutJobs).where(eq(scoutJobs.status, "expired")).run();
  return { deleted: res.rowsAffected };
}

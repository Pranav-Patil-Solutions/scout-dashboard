import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "./db";
import { activities, applications, syncState, type Application } from "./db/schema";
import {
  verdictFromHtml,
  type PostingCheckStats,
  type PostingVerdict,
} from "./posting-verdict";

/**
 * Posting-expiry watchdog — the pre-apply half of the Moss guard.
 * Probes the apply URL of every open card (sourced / to_apply) and, when a
 * posting is VERIFIABLY gone, auto-moves the card to expired_missed with the
 * evidence on its timeline. Verdict rules live in posting-verdict.ts (pure);
 * this module owns the IO: probing, the auto-move, and the stats record.
 */

export type { PostingCheckStats, PostingVerdict } from "./posting-verdict";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const TIMEOUT_MS = 12_000;
const CONCURRENCY = 4;

async function probeSmartRecruiters(applyUrl: string): Promise<PostingVerdict> {
  const m = applyUrl.match(/jobs\.smartrecruiters\.com\/([^/]+)\/(\d+)/);
  if (!m) return { state: "unknown", reason: "unrecognized SmartRecruiters URL shape" };
  const res = await fetch(
    `https://api.smartrecruiters.com/v1/companies/${m[1]}/postings/${m[2]}`,
    { signal: AbortSignal.timeout(TIMEOUT_MS) },
  );
  if (res.status === 200) return { state: "live" };
  if (res.status === 404)
    return {
      state: "expired",
      evidence: "SmartRecruiters postings API returns 404 (no longer published)",
    };
  return { state: "unknown", reason: `SmartRecruiters API HTTP ${res.status}` };
}

export async function probePosting(applyUrl: string): Promise<PostingVerdict> {
  try {
    if (/jobs\.smartrecruiters\.com\//.test(applyUrl))
      return await probeSmartRecruiters(applyUrl);
    const res = await fetch(applyUrl, {
      headers: { "user-agent": UA, accept: "text/html" },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const html = res.status < 400 ? await res.text() : "";
    return verdictFromHtml(applyUrl, res.status, html);
  } catch (err) {
    return {
      state: "unknown",
      reason: err instanceof Error ? err.message : "fetch failed",
    };
  }
}

async function moveToMissed(app: Application, evidence: string): Promise<void> {
  const now = new Date();
  await db
    .update(applications)
    .set({
      status: "expired_missed",
      closedReason: "expired_missed",
      closedAt: app.closedAt ?? now,
      lastActivityAt: now,
      updatedAt: now,
      snoozedUntil: null,
    })
    .where(eq(applications.id, app.id))
    .run();
  await db
    .insert(activities)
    .values({
      id: randomUUID(),
      applicationId: app.id,
      type: "status_change",
      title: "Posting expired — auto-moved to Missed",
      body: `Verified ${now.toISOString().slice(0, 10)}: ${evidence}`,
      occurredAt: now,
      source: "system",
    })
    .run();
}

/**
 * Check every open card's posting; auto-move verifiably dead ones to Missed.
 * Only `expired` verdicts mutate anything — `unknown` is always a no-op.
 */
export async function checkAllPostings(): Promise<PostingCheckStats> {
  const open = await db
    .select()
    .from(applications)
    .where(
      and(
        inArray(applications.status, ["sourced", "to_apply"]),
        isNotNull(applications.applyUrl),
      ),
    )
    .all();

  const stats: PostingCheckStats = {
    checked: open.length,
    live: 0,
    expired: 0,
    unknown: 0,
    moved: [],
  };

  for (let i = 0; i < open.length; i += CONCURRENCY) {
    const batch = open.slice(i, i + CONCURRENCY);
    const verdicts = await Promise.all(batch.map((a) => probePosting(a.applyUrl!)));
    for (let j = 0; j < batch.length; j++) {
      const app = batch[j];
      const v = verdicts[j];
      if (v.state === "expired") {
        await moveToMissed(app, v.evidence);
        stats.expired++;
        stats.moved.push(`${app.company} — ${app.roleTitle}`);
      } else if (v.state === "live") stats.live++;
      else stats.unknown++;
    }
  }

  await db
    .insert(syncState)
    .values({ id: "posting-check", lastCursor: null, lastRunAt: new Date(), stats })
    .onConflictDoUpdate({
      target: syncState.id,
      set: { lastRunAt: new Date(), stats },
    })
    .run();

  return stats;
}

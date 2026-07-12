import "server-only";
import { randomUUID } from "node:crypto";
import { eq, isNull } from "drizzle-orm";
import { db } from "../db";
import { activities, applications, emailEvents, proposals, syncState } from "../db/schema";
import { classifyEmails } from "./classify";
import { matchApplication, type MatchResult } from "./match";
import { scrubClassification } from "./privacy";
import { buildProposals } from "./propose";
import { stagingSource } from "./staging-source";
import type { RawEmail } from "./types";

export interface SyncStats {
  fetched: number;
  ingested: number;
  duplicates: number;
  classified?: number;
  llmCalls?: number;
  proposals?: number;
  autoApplied?: number;
  error?: string;
}

/**
 * The sync pipeline core (JOBDASH-002). P1: fetch → persist email_events →
 * advance cursor. P3: classify unprocessed events → match → propose (§7
 * non-destructive: applications are only ever touched via accepted proposals;
 * auto-apply is limited to log_activity).
 * Idempotent: unique gmail_message_id + the processedAt watermark mean
 * re-syncing never double-processes or double-proposes.
 */
export async function runSync(): Promise<SyncStats> {
  const state = await db.select().from(syncState).where(eq(syncState.id, "gmail")).get();
  const { emails, nextCursor } = await stagingSource.fetchSince(
    state?.lastCursor ?? null,
  );

  let ingested = 0;
  let duplicates = 0;

  await db.transaction(async (tx) => {
    for (const email of emails) {
      const inserted = await tx
        .insert(emailEvents)
        .values({
          id: randomUUID(),
          gmailMessageId: email.gmailMessageId,
          threadId: email.threadId,
          sender: email.sender,
          subject: email.subject,
          snippet: email.snippet, // body deliberately NOT persisted (§8)
          receivedAt: new Date(email.receivedAt),
          direction: email.direction,
        })
        .onConflictDoNothing({ target: emailEvents.gmailMessageId })
        .run();
      if (inserted.rowsAffected > 0) ingested++;
      else duplicates++;
    }
  });

  const processed = await processNewEvents();

  const stats: SyncStats = {
    fetched: emails.length,
    ingested,
    duplicates,
    ...processed,
  };
  await db
    .insert(syncState)
    .values({ id: "gmail", lastCursor: nextCursor, lastRunAt: new Date(), stats })
    .onConflictDoUpdate({
      target: syncState.id,
      set: { lastCursor: nextCursor, lastRunAt: new Date(), stats },
    })
    .run();

  return stats;
}

/** P3 stage: classify events with no processedAt, match, and create proposals. */
async function processNewEvents(): Promise<{
  classified: number;
  llmCalls: number;
  proposals: number;
  autoApplied: number;
}> {
  // chronological order — the temporal downgrade guard in propose.ts assumes
  // older emails are processed before newer ones
  const pending = await db
    .select()
    .from(emailEvents)
    .where(isNull(emailEvents.processedAt))
    .orderBy(emailEvents.receivedAt)
    .all();
  if (pending.length === 0)
    return { classified: 0, llmCalls: 0, proposals: 0, autoApplied: 0 };

  // bodies live only in staging (§8) — fall back to the persisted event fields
  const raws = await loadRawEmailsById();
  const rawList: RawEmail[] = pending.map(
    (ev) =>
      raws.get(ev.gmailMessageId) ?? {
        gmailMessageId: ev.gmailMessageId,
        threadId: ev.threadId ?? "",
        sender: ev.sender,
        subject: ev.subject ?? "",
        snippet: ev.snippet ?? "",
        receivedAt: ev.receivedAt.toISOString(),
        direction: (ev.direction as RawEmail["direction"]) ?? "inbound",
      },
  );

  const { classifications, llmCalls } = await classifyEmails(rawList);

  const apps = await db.select().from(applications).all();
  const appById = new Map(apps.map((a) => [a.id, a]));
  // thread continuity: an already-matched event pins its whole thread
  const threadMatches = new Map<string, string>();
  for (const ev of await db.select().from(emailEvents).all()) {
    if (ev.threadId && ev.matchedApplicationId)
      threadMatches.set(ev.threadId, ev.matchedApplicationId);
  }

  let classified = 0;
  let proposalCount = 0;
  let autoApplied = 0;

  await db.transaction(async (tx) => {
    for (const ev of pending) {
      const raw = classifications.get(ev.gmailMessageId);
      if (!raw) continue; // stays unprocessed — retried on the next sync
      // §8 choke point: nothing body-derived may be persisted from here on
      const c = scrubClassification(
        raw,
        ev.subject,
        ev.snippet,
        raws.get(ev.gmailMessageId)?.body,
      );

      let match: MatchResult | null = null;
      const threadAppId = ev.threadId ? threadMatches.get(ev.threadId) : undefined;
      if (threadAppId && appById.has(threadAppId)) {
        match = { applicationId: threadAppId, confidence: 0.98, method: "thread" };
      } else {
        match = matchApplication(c, apps);
      }
      const app = match ? (appById.get(match.applicationId) ?? null) : null;

      const drafts = buildProposals(ev, c, app && match ? { app, match } : null);
      for (const d of drafts) {
        await tx
          .insert(proposals)
          .values({
            id: randomUUID(),
            type: d.type,
            applicationId: d.applicationId,
            payload: d.payload,
            sourceEmailEventId: ev.id,
            confidence: d.confidence,
            status: d.autoApply ? "accepted" : "pending",
            resolvedAt: d.autoApply ? new Date() : null,
          })
          .run();
        proposalCount++;

        if (d.autoApply && d.applicationId) {
          await tx
            .insert(activities)
            .values({
              id: randomUUID(),
              applicationId: d.applicationId,
              type: d.payload.activityType ?? "email_in",
              title: d.payload.title ?? d.payload.summary,
              body: d.payload.evidence || null,
              occurredAt: new Date(d.payload.occurredAt),
              source: "gmail",
            })
            .run();
          const current = appById.get(d.applicationId);
          const occurred = new Date(d.payload.occurredAt);
          if (current && (!current.lastActivityAt || current.lastActivityAt < occurred)) {
            await tx
              .update(applications)
              .set({ lastActivityAt: occurred })
              .where(eq(applications.id, d.applicationId))
              .run();
            current.lastActivityAt = occurred;
          }
          autoApplied++;
        }
      }

      if (ev.threadId && match) threadMatches.set(ev.threadId, match.applicationId);
      await tx
        .update(emailEvents)
        .set({
          classification: c,
          matchedApplicationId: match?.applicationId ?? null,
          processedAt: new Date(),
        })
        .where(eq(emailEvents.id, ev.id))
        .run();
      classified++;
    }
  });

  return { classified, llmCalls, proposals: proposalCount, autoApplied };
}

/** Raw emails (with bodies) for the classify stage — read from staging, keyed by message id. */
export async function loadRawEmailsById(): Promise<Map<string, RawEmail>> {
  const { emails } = await stagingSource.fetchSince(null);
  return new Map(emails.map((e) => [e.gmailMessageId, e]));
}

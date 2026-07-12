import "server-only";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { activities, applications, emailEvents, proposals } from "../db/schema";
import { matchApplication } from "./match";
import { CLOSED, STATUS_RANK, type ProposalPayload } from "./propose";

/**
 * JOBDASH-002 P3 — proposal resolution. The ONLY place a proposal touches an
 * application (§7 non-destructive core: sync never mutates directly).
 */

export type ApplyResult = { ok: true } | { ok: false; error: string };

export async function acceptProposal(id: string): Promise<ApplyResult> {
  const p = await db.select().from(proposals).where(eq(proposals.id, id)).get();
  if (!p) return { ok: false, error: "proposal not found" };
  if (p.status !== "pending") return { ok: false, error: `proposal already ${p.status}` };

  const payload = p.payload as ProposalPayload;
  const occurredAt = payload.occurredAt ? new Date(payload.occurredAt) : new Date();
  const now = new Date();

  try {
    await db.transaction(async (tx) => {
      let applicationId = p.applicationId;

      switch (p.type) {
        case "add_application": {
          // an application may exist by NOW that didn't at proposal time (e.g.
          // the sibling add_application for the same company was accepted
          // first) — rematch before inserting, or accepting both Wolt cards
          // would create two Wolt rows
          const apps = await tx.select().from(applications).all();
          const knownRole =
            payload.roleTitle && payload.roleTitle !== "Unknown role"
              ? payload.roleTitle
              : null;
          const rematch = matchApplication(
            { company: payload.company ?? null, role_title: knownRole },
            // ignore role when the existing app's title is the placeholder
            apps.map((a) =>
              a.roleTitle === "Unknown role" && knownRole
                ? { ...a, roleTitle: knownRole }
                : a,
            ),
          );

          if (rematch && rematch.confidence >= 0.8) {
            applicationId = rematch.applicationId;
            const app = apps.find((a) => a.id === applicationId);
            if (!app) throw new Error("rematched application vanished");
            if (app.roleTitle === "Unknown role" && knownRole) {
              await tx
                .update(applications)
                .set({ roleTitle: knownRole, updatedAt: now })
                .where(eq(applications.id, applicationId))
                .run();
            }
            await tx
              .insert(activities)
              .values({
                id: randomUUID(),
                applicationId,
                type: "email_in",
                title: payload.summary,
                body: payload.evidence || null,
                occurredAt,
                source: "gmail",
              })
              .run();
            // the user accepted this card, so a status implied by it may apply —
            // but only forward moves or closing an active application
            const target = payload.initialStatus;
            if (target && target !== app.status) {
              const closing = target === "rejected" && !CLOSED.has(app.status);
              const forward =
                !CLOSED.has(app.status) &&
                (STATUS_RANK[target] ?? -1) > (STATUS_RANK[app.status] ?? 99);
              if (closing || forward) {
                await tx
                  .update(applications)
                  .set({
                    status: target,
                    updatedAt: now,
                    ...(app.lastActivityAt && app.lastActivityAt > occurredAt
                      ? {}
                      : { lastActivityAt: occurredAt }),
                    ...(closing
                      ? { closedReason: "rejected", closedAt: occurredAt }
                      : {}),
                  })
                  .where(eq(applications.id, applicationId))
                  .run();
                await tx
                  .insert(activities)
                  .values({
                    id: randomUUID(),
                    applicationId,
                    type: "status_change",
                    title: `${app.status} → ${target} (email sync)`,
                    body: payload.evidence || null,
                    occurredAt,
                    source: "gmail",
                  })
                  .run();
              }
            }
          } else {
            applicationId = randomUUID();
            const initialStatus = payload.initialStatus ?? "applied";
            await tx
              .insert(applications)
              .values({
                id: applicationId,
                company: payload.company ?? "Unknown company",
                roleTitle: payload.roleTitle ?? "Unknown role",
                source: payload.source ?? "cold-email",
                status: initialStatus,
                appliedAt: occurredAt,
                lastActivityAt: occurredAt,
                ...(initialStatus === "rejected"
                  ? { closedReason: "rejected", closedAt: occurredAt }
                  : {}),
              })
              .run();
            await tx
              .insert(activities)
              .values({
                id: randomUUID(),
                applicationId,
                type: "email_in",
                title: payload.summary,
                body: payload.evidence || null,
                occurredAt,
                source: "gmail",
              })
              .run();
          }
          await tx
            .update(emailEvents)
            .set({ matchedApplicationId: applicationId })
            .where(eq(emailEvents.id, p.sourceEmailEventId))
            .run();
          break;
        }

        case "set_status": {
          if (!applicationId) throw new Error("set_status proposal has no application");
          const app = await tx
            .select()
            .from(applications)
            .where(eq(applications.id, applicationId))
            .get();
          if (!app) throw new Error("application no longer exists");
          const toStatus = payload.toStatus;
          if (!toStatus) throw new Error("set_status proposal has no toStatus");
          const closing = toStatus === "rejected";
          await tx
            .update(applications)
            .set({
              status: toStatus,
              updatedAt: now,
              ...(app.lastActivityAt && app.lastActivityAt > occurredAt
                ? {}
                : { lastActivityAt: occurredAt }),
              ...(closing
                ? { closedReason: "rejected", closedAt: occurredAt }
                : { closedReason: null, closedAt: null }), // accepting a reopen clears the closed state
            })
            .where(eq(applications.id, applicationId))
            .run();
          await tx
            .insert(activities)
            .values({
              id: randomUUID(),
              applicationId,
              type: "status_change",
              title: `${app.status} → ${toStatus} (email sync)`,
              body: payload.evidence || null,
              occurredAt,
              source: "gmail",
            })
            .run();
          break;
        }

        case "log_activity": {
          if (!applicationId) throw new Error("log_activity proposal has no application");
          await tx
            .insert(activities)
            .values({
              id: randomUUID(),
              applicationId,
              type: payload.activityType ?? "email_in",
              title: payload.title ?? payload.summary,
              body: payload.evidence || null,
              occurredAt,
              source: "gmail",
            })
            .run();
          break;
        }

        case "set_first_response": {
          if (!applicationId) throw new Error("set_first_response proposal has no application");
          const app = await tx
            .select()
            .from(applications)
            .where(eq(applications.id, applicationId))
            .get();
          if (!app) throw new Error("application no longer exists");
          // only ever moves the timestamp EARLIER or fills a blank — never overwrites a real earlier response
          if (!app.firstResponseAt || app.firstResponseAt > occurredAt) {
            await tx
              .update(applications)
              .set({ firstResponseAt: occurredAt, updatedAt: now })
              .where(eq(applications.id, applicationId))
              .run();
          }
          break;
        }

        default:
          throw new Error(`unknown proposal type: ${p.type}`);
      }

      await tx
        .update(proposals)
        .set({ status: "accepted", resolvedAt: now, applicationId })
        .where(eq(proposals.id, id))
        .run();
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "accept failed" };
  }
}

export async function dismissProposal(id: string): Promise<ApplyResult> {
  const p = await db.select().from(proposals).where(eq(proposals.id, id)).get();
  if (!p) return { ok: false, error: "proposal not found" };
  if (p.status !== "pending") return { ok: false, error: `proposal already ${p.status}` };
  await db
    .update(proposals)
    .set({ status: "dismissed", resolvedAt: new Date() })
    .where(eq(proposals.id, id))
    .run();
  return { ok: true };
}

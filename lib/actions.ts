"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { db } from "./db";
import { activities, applications, scoutJobs, type Application } from "./db/schema";
import { CLOSED_STATUSES, deriveFitBand, statusMeta, type Status } from "./constants";
import type { ApplicationInput } from "./types";

const APPLIED_STATUSES = ["applied", "screening", "interview", "offer"];
const RESPONSE_STATUSES = ["screening", "interview", "offer"];

function revalidateAll() {
  // Everything derives from the DB and the root layout is dynamic — invalidate the tree.
  revalidatePath("/", "layout");
}

/**
 * Datetime side-effects of entering `toStatus`, given the existing row.
 * - first time it becomes a submitted application → stamp appliedAt
 * - first genuine forward reply (screening+) → stamp firstResponseAt
 * - entering a closed state → record reason + closedAt (preserve an earlier close)
 * - leaving a closed state → clear reason + closedAt
 */
function transitionPatch(
  toStatus: string,
  existing?: Pick<Application, "appliedAt" | "firstResponseAt" | "closedAt"> | null,
) {
  const now = new Date();
  const patch: Partial<Application> = {};
  if (APPLIED_STATUSES.includes(toStatus) && !existing?.appliedAt) patch.appliedAt = now;
  if (RESPONSE_STATUSES.includes(toStatus) && !existing?.firstResponseAt)
    patch.firstResponseAt = now;
  if (CLOSED_STATUSES.includes(toStatus as Status)) {
    patch.closedReason = toStatus;
    patch.closedAt = existing?.closedAt ?? now;
  } else {
    patch.closedReason = null;
    patch.closedAt = null;
  }
  return patch;
}

async function logActivity(
  appId: string,
  type: string,
  title: string,
  source = "manual",
  body?: string,
): Promise<void> {
  await db
    .insert(activities)
    .values({
      id: randomUUID(),
      applicationId: appId,
      type,
      title,
      body: body ?? null,
      occurredAt: new Date(),
      source,
    })
    .run();
}

async function getRow(id: string): Promise<Application | undefined> {
  return db.select().from(applications).where(eq(applications.id, id)).get();
}

export async function createApplication(input: ApplicationInput): Promise<{ id: string }> {
  const company = input.company?.trim();
  const roleTitle = input.roleTitle?.trim();
  if (!company || !roleTitle) throw new Error("Company and role are required.");

  const id = randomUUID();
  const now = new Date();
  const status = input.status || "to_apply";
  const patch = transitionPatch(status, null);

  await db
    .insert(applications)
    .values({
      id,
      company,
      roleTitle,
      source: input.source || "scraper",
      fitScore: input.fitScore ?? null,
      fitBand: deriveFitBand(input.fitScore),
      germanReq: input.germanReq || "unknown",
      location: input.location || null,
      workMode: input.workMode || null,
      seniority: input.seniority || null,
      salaryRange: input.salaryRange || null,
      applyUrl: input.applyUrl || null,
      jdUrl: input.jdUrl || null,
      status,
      isKitReady: !!input.isKitReady,
      resumeVariant: input.resumeVariant || null,
      coverPath: input.coverPath || null,
      nextAction: input.nextAction || null,
      nextActionDue: input.nextActionDue ? new Date(input.nextActionDue) : null,
      notes: input.notes || null,
      lastActivityAt: now,
      createdAt: now,
      updatedAt: now,
      ...patch,
    })
    .run();

  await logActivity(id, "status_change", `Added to pipeline — ${statusMeta(status).label}`);

  // §8 — promotion: link the scout job and take it out of triage.
  if (input.scoutJobId) {
    await db
      .update(scoutJobs)
      .set({ status: "promoted", promotedApplicationId: id })
      .where(eq(scoutJobs.id, input.scoutJobId))
      .run();
    await logActivity(id, "note", "Promoted from Scout Inbox", "scraper");
  }

  revalidateAll();
  return { id };
}

/**
 * One-click apply from the Discover surface (JOBDASH-004 apply-click seam):
 * create a tracked application on the board (status `to_apply`) so the role is
 * captured the moment the user opens the posting. Returns the posting URL so the
 * caller can open it, and `reused` when the scout job is already on the board
 * (idempotent — re-applying never duplicates a card). Company/role fall back so
 * a sparse scrape can never make this throw.
 */
export async function applyToScoutJob(
  scoutJobId: string,
): Promise<{ id: string; url: string | null; reused: boolean }> {
  const job = await db.select().from(scoutJobs).where(eq(scoutJobs.id, scoutJobId)).get();
  if (!job) throw new Error("That role is no longer available.");

  if (job.status === "promoted" && job.promotedApplicationId) {
    return { id: job.promotedApplicationId, url: job.url ?? null, reused: true };
  }

  // Atomically claim the scout job before creating the application. This
  // UPDATE only succeeds if the row is still not `promoted`, so a duplicate
  // apply (double-click / repeated keypress racing this same function) can
  // never create two applications for one scout job — the loser re-reads
  // and reuses whichever application the winner created.
  const claim = await db
    .update(scoutJobs)
    .set({ status: "promoted" })
    .where(and(eq(scoutJobs.id, scoutJobId), ne(scoutJobs.status, "promoted")))
    .run();
  if (claim.rowsAffected === 0) {
    const fresh = await db.select().from(scoutJobs).where(eq(scoutJobs.id, scoutJobId)).get();
    if (fresh?.promotedApplicationId) {
      return { id: fresh.promotedApplicationId, url: fresh.url ?? null, reused: true };
    }
    throw new Error("That role was just applied to elsewhere — refresh and try again.");
  }

  const { id } = await createApplication({
    company: job.company?.trim() || "Unknown company",
    roleTitle: job.title?.trim() || "Untitled role",
    source: job.source || "scraper",
    status: "to_apply",
    fitScore: job.score ?? null,
    germanReq: job.languageFlag || "unknown",
    applyUrl: job.url ?? null,
    jdUrl: job.url ?? null, // kit generator's resolveJd reads this (JOBDASH-006 §2)
    notes: job.reason ?? null,
    isKitReady: false,
    scoutJobId: job.id,
  });
  await logActivity(id, "note", "Apply clicked — posting opened", "scraper");

  return { id, url: job.url ?? null, reused: false };
}

export async function updateApplication(
  id: string,
  input: ApplicationInput,
): Promise<{ id: string }> {
  const existing = await getRow(id);
  if (!existing) throw new Error("Application not found.");
  const company = input.company?.trim();
  const roleTitle = input.roleTitle?.trim();
  if (!company || !roleTitle) throw new Error("Company and role are required.");

  const now = new Date();
  const status = input.status || existing.status;
  const statusChanged = status !== existing.status;
  const patch = statusChanged ? transitionPatch(status, existing) : {};

  await db
    .update(applications)
    .set({
      company,
      roleTitle,
      source: input.source || existing.source,
      fitScore: input.fitScore ?? null,
      fitBand: deriveFitBand(input.fitScore),
      germanReq: input.germanReq || "unknown",
      location: input.location || null,
      workMode: input.workMode || null,
      seniority: input.seniority || null,
      salaryRange: input.salaryRange || null,
      applyUrl: input.applyUrl || null,
      jdUrl: input.jdUrl || null,
      status,
      isKitReady: !!input.isKitReady,
      resumeVariant: input.resumeVariant || null,
      coverPath: input.coverPath || null,
      nextAction: input.nextAction || null,
      nextActionDue: input.nextActionDue ? new Date(input.nextActionDue) : null,
      notes: input.notes || null,
      lastActivityAt: now,
      updatedAt: now,
      ...patch,
    })
    .where(eq(applications.id, id))
    .run();

  if (statusChanged) await logActivity(id, "status_change", `Moved to ${statusMeta(status).label}`);
  revalidateAll();
  return { id };
}

/** Board drag-to-move and quick status changes. */
export async function moveApplication(
  id: string,
  toStatus: string,
): Promise<{ ok: true }> {
  const existing = await getRow(id);
  if (!existing) throw new Error("Application not found.");
  if (existing.status === toStatus) return { ok: true };

  const now = new Date();
  const patch = transitionPatch(toStatus, existing);
  await db
    .update(applications)
    .set({ status: toStatus, lastActivityAt: now, updatedAt: now, snoozedUntil: null, ...patch })
    .where(eq(applications.id, id))
    .run();

  await logActivity(id, "status_change", `Moved to ${statusMeta(toStatus).label}`);
  revalidateAll();
  return { ok: true };
}

export async function deleteApplication(id: string): Promise<{ ok: true }> {
  await db.delete(applications).where(eq(applications.id, id)).run();
  revalidateAll();
  return { ok: true };
}

/** Fields the detail page may inline-edit. */
const PATCHABLE = [
  "company",
  "roleTitle",
  "source",
  "fitScore",
  "germanReq",
  "location",
  "workMode",
  "seniority",
  "salaryRange",
  "applyUrl",
  "jdUrl",
  "resumeVariant",
  "coverPath",
  "nextAction",
  "nextActionDue",
  "notes",
  "isKitReady",
] as const;
type PatchField = (typeof PATCHABLE)[number];

export async function patchApplication(
  id: string,
  patch: Partial<Record<PatchField, string | number | boolean | null>>,
): Promise<{ ok: true }> {
  const existing = await getRow(id);
  if (!existing) throw new Error("Application not found.");

  const set: Record<string, unknown> = { updatedAt: new Date() };
  for (const [key, raw] of Object.entries(patch)) {
    if (!(PATCHABLE as readonly string[]).includes(key)) continue;
    let value: unknown = raw === "" ? null : raw;
    if (key === "fitScore") {
      value = value == null ? null : Math.max(0, Math.min(100, Number(value)));
      set.fitBand = deriveFitBand(value as number | null);
    }
    if (key === "nextActionDue") value = value == null ? null : new Date(String(value));
    if (key === "isKitReady") value = !!value;
    set[key] = value;
  }
  await db.update(applications).set(set).where(eq(applications.id, id)).run();
  revalidateAll();
  return { ok: true };
}

export async function addActivity(
  applicationId: string,
  input: { type: string; title: string; body?: string },
): Promise<{ ok: true }> {
  const existing = await getRow(applicationId);
  if (!existing) throw new Error("Application not found.");
  if (!input.title?.trim()) throw new Error("A title is required.");

  await logActivity(applicationId, input.type || "note", input.title.trim(), "manual", input.body?.trim() || undefined);
  await db
    .update(applications)
    .set({ lastActivityAt: new Date(), updatedAt: new Date() })
    .where(eq(applications.id, applicationId))
    .run();
  revalidateAll();
  return { ok: true };
}

/** Action Queue: hide this application's cards until `days` from now. */
export async function snoozeApplication(id: string, days = 3): Promise<{ ok: true }> {
  const existing = await getRow(id);
  if (!existing) throw new Error("Application not found.");
  const until = new Date(Date.now() + days * 86_400_000);
  await db
    .update(applications)
    .set({ snoozedUntil: until, updatedAt: new Date() })
    .where(eq(applications.id, id))
    .run();
  await logActivity(id, "reminder", `Snoozed for ${days} days`, "system");
  revalidateAll();
  return { ok: true };
}

/** Action Queue: record that a follow-up was sent (clears the overdue alert). */
export async function logFollowUp(id: string): Promise<{ ok: true }> {
  const existing = await getRow(id);
  if (!existing) throw new Error("Application not found.");
  const now = new Date();
  await logActivity(id, "follow_up", "Follow-up sent", "manual");
  await db
    .update(applications)
    .set({
      lastActivityAt: now,
      updatedAt: now,
      nextAction: null,
      nextActionDue: null,
      snoozedUntil: null,
    })
    .where(eq(applications.id, id))
    .run();
  revalidateAll();
  return { ok: true };
}

/** Detail page: clear the next action once done. */
export async function completeNextAction(id: string): Promise<{ ok: true }> {
  const existing = await getRow(id);
  if (!existing) throw new Error("Application not found.");
  const now = new Date();
  if (existing.nextAction)
    await logActivity(id, "note", `Done: ${existing.nextAction}`, "manual");
  await db
    .update(applications)
    .set({ nextAction: null, nextActionDue: null, lastActivityAt: now, updatedAt: now })
    .where(eq(applications.id, id))
    .run();
  revalidateAll();
  return { ok: true };
}

/** Load a row for the edit sheet (returns serializable Dates). */
export async function loadApplication(id: string): Promise<Application | null> {
  return (await getRow(id)) ?? null;
}

/* ==========================================================================
   JOBDASH-002 P4 — proposal review actions (thin wrappers over lib/email/apply;
   §7: this is the only path from a proposal to an application mutation).
   ========================================================================== */

export async function acceptProposalAction(id: string) {
  const { acceptProposal } = await import("./email/apply");
  const result = await acceptProposal(id);
  if (!result.ok) throw new Error(result.error);
  revalidateAll();
}

export async function dismissProposalAction(id: string) {
  const { dismissProposal } = await import("./email/apply");
  const result = await dismissProposal(id);
  if (!result.ok) throw new Error(result.error);
  revalidateAll();
}

"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
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

function logActivity(
  appId: string,
  type: string,
  title: string,
  source = "manual",
  body?: string,
) {
  db.insert(activities)
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

function getRow(id: string): Application | undefined {
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

  db.insert(applications)
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

  logActivity(id, "status_change", `Added to pipeline — ${statusMeta(status).label}`);

  // §8 — promotion: link the scout job and take it out of triage.
  if (input.scoutJobId) {
    db.update(scoutJobs)
      .set({ status: "promoted", promotedApplicationId: id })
      .where(eq(scoutJobs.id, input.scoutJobId))
      .run();
    logActivity(id, "note", "Promoted from Scout Inbox", "scraper");
  }

  revalidateAll();
  return { id };
}

export async function updateApplication(
  id: string,
  input: ApplicationInput,
): Promise<{ id: string }> {
  const existing = getRow(id);
  if (!existing) throw new Error("Application not found.");
  const company = input.company?.trim();
  const roleTitle = input.roleTitle?.trim();
  if (!company || !roleTitle) throw new Error("Company and role are required.");

  const now = new Date();
  const status = input.status || existing.status;
  const statusChanged = status !== existing.status;
  const patch = statusChanged ? transitionPatch(status, existing) : {};

  db.update(applications)
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

  if (statusChanged) logActivity(id, "status_change", `Moved to ${statusMeta(status).label}`);
  revalidateAll();
  return { id };
}

/** Board drag-to-move and quick status changes. */
export async function moveApplication(
  id: string,
  toStatus: string,
): Promise<{ ok: true }> {
  const existing = getRow(id);
  if (!existing) throw new Error("Application not found.");
  if (existing.status === toStatus) return { ok: true };

  const now = new Date();
  const patch = transitionPatch(toStatus, existing);
  db.update(applications)
    .set({ status: toStatus, lastActivityAt: now, updatedAt: now, snoozedUntil: null, ...patch })
    .where(eq(applications.id, id))
    .run();

  logActivity(id, "status_change", `Moved to ${statusMeta(toStatus).label}`);
  revalidateAll();
  return { ok: true };
}

export async function deleteApplication(id: string): Promise<{ ok: true }> {
  db.delete(applications).where(eq(applications.id, id)).run();
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
  const existing = getRow(id);
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
  db.update(applications).set(set).where(eq(applications.id, id)).run();
  revalidateAll();
  return { ok: true };
}

export async function addActivity(
  applicationId: string,
  input: { type: string; title: string; body?: string },
): Promise<{ ok: true }> {
  const existing = getRow(applicationId);
  if (!existing) throw new Error("Application not found.");
  if (!input.title?.trim()) throw new Error("A title is required.");

  logActivity(applicationId, input.type || "note", input.title.trim(), "manual", input.body?.trim() || undefined);
  db.update(applications)
    .set({ lastActivityAt: new Date(), updatedAt: new Date() })
    .where(eq(applications.id, applicationId))
    .run();
  revalidateAll();
  return { ok: true };
}

/** Action Queue: hide this application's cards until `days` from now. */
export async function snoozeApplication(id: string, days = 3): Promise<{ ok: true }> {
  const existing = getRow(id);
  if (!existing) throw new Error("Application not found.");
  const until = new Date(Date.now() + days * 86_400_000);
  db.update(applications)
    .set({ snoozedUntil: until, updatedAt: new Date() })
    .where(eq(applications.id, id))
    .run();
  logActivity(id, "reminder", `Snoozed for ${days} days`, "system");
  revalidateAll();
  return { ok: true };
}

/** Action Queue: record that a follow-up was sent (clears the overdue alert). */
export async function logFollowUp(id: string): Promise<{ ok: true }> {
  const existing = getRow(id);
  if (!existing) throw new Error("Application not found.");
  const now = new Date();
  logActivity(id, "follow_up", "Follow-up sent", "manual");
  db.update(applications)
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
  const existing = getRow(id);
  if (!existing) throw new Error("Application not found.");
  const now = new Date();
  if (existing.nextAction)
    logActivity(id, "note", `Done: ${existing.nextAction}`, "manual");
  db.update(applications)
    .set({ nextAction: null, nextActionDue: null, lastActivityAt: now, updatedAt: now })
    .where(eq(applications.id, id))
    .run();
  revalidateAll();
  return { ok: true };
}

/** Load a row for the edit sheet (returns serializable Dates). */
export async function loadApplication(id: string): Promise<Application | null> {
  return getRow(id) ?? null;
}

/* ==========================================================================
   JOBDASH-002 P4 — proposal review actions (thin wrappers over lib/email/apply;
   §7: this is the only path from a proposal to an application mutation).
   ========================================================================== */

export async function acceptProposalAction(id: string) {
  const { acceptProposal } = await import("./email/apply");
  const result = acceptProposal(id);
  if (!result.ok) throw new Error(result.error);
  revalidateAll();
}

export async function dismissProposalAction(id: string) {
  const { dismissProposal } = await import("./email/apply");
  const result = dismissProposal(id);
  if (!result.ok) throw new Error(result.error);
  revalidateAll();
}

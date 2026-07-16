import "server-only";
import { and, count, desc, eq, getTableColumns, gte, inArray, ne, sql } from "drizzle-orm";
import { db } from "./db";
import { activities, applications, emailEvents, proposals, scoutJobs, syncState } from "./db/schema";
import { ACTIVE_STATUSES, BOARD_COLUMNS, CLOSED_STATUSES } from "./constants";
import { buildActionQueue } from "./action-queue";
import type { Activity, Application, Proposal, ScoutJob } from "./db/schema";
import type { NavCounts } from "@/components/app-shell";

function scalar(row: { n: number } | undefined): number {
  return row?.n ?? 0;
}

/** Counts for the sidebar badges. `actions` = live Action Queue length. */
export async function getNavCounts(): Promise<NavCounts> {
  const [activeRow, triageRow, apps, pendingRow] = await Promise.all([
    db
      .select({ n: count() })
      .from(applications)
      .where(inArray(applications.status, ACTIVE_STATUSES))
      .get(),
    db
      .select({ n: count() })
      .from(scoutJobs)
      .where(eq(scoutJobs.status, "new"))
      .get(),
    getAllApplications(),
    db
      .select({ n: count() })
      .from(proposals)
      .where(eq(proposals.status, "pending"))
      .get(),
  ]);

  return {
    active: scalar(activeRow),
    triage: scalar(triageRow),
    actions: buildActionQueue(apps).length,
    proposals: scalar(pendingRow),
  };
}

/** All applications, most-recently-active first. */
export async function getAllApplications(): Promise<Application[]> {
  return db.select().from(applications).orderBy(desc(applications.lastActivityAt)).all();
}

export async function getApplicationById(id: string): Promise<Application | undefined> {
  return db.select().from(applications).where(eq(applications.id, id)).get();
}

export interface BoardApplication extends Application {
  /** When the card entered its current stage (latest status_change, else applied/created). */
  stageEnteredAt: Date | null;
}

/** Applications for the board (5 live columns + closed tray; excludes triage `sourced`). */
export async function getBoardApplications(): Promise<BoardApplication[]> {
  const apps = await db
    .select()
    .from(applications)
    .where(inArray(applications.status, [...BOARD_COLUMNS, ...CLOSED_STATUSES]))
    .orderBy(desc(applications.lastActivityAt))
    .all();

  const stageRows = await db
    .select({
      appId: activities.applicationId,
      at: sql<number>`max(${activities.occurredAt})`,
    })
    .from(activities)
    .where(eq(activities.type, "status_change"))
    .groupBy(activities.applicationId)
    .all();

  const stageMap = new Map(stageRows.map((r) => [r.appId, r.at]));

  return apps.map((a) => {
    const sec = stageMap.get(a.id);
    const stageEnteredAt = sec ? new Date(sec * 1000) : (a.appliedAt ?? a.createdAt);
    return { ...a, stageEnteredAt };
  });
}

/** Timeline for one application, newest first. */
export async function getActivitiesForApplication(applicationId: string): Promise<Activity[]> {
  return db
    .select()
    .from(activities)
    .where(eq(activities.applicationId, applicationId))
    .orderBy(desc(activities.occurredAt))
    .all();
}

export interface RecentActivity extends Activity {
  company: string;
  applicationId: string;
}

export type ScoutJobWithOutcome = ScoutJob & {
  /** linked application's live status (promoted rows), else null — JOBDASH-006 §3 */
  appStatus: string | null;
};

/** Scout Inbox rows by triage status, best score first. One query shape for
 * every tab: the application join is simply null when nothing is linked. */
export async function getScoutJobs(
  status: "new" | "dismissed" | "promoted",
): Promise<ScoutJobWithOutcome[]> {
  return db
    .select({ ...getTableColumns(scoutJobs), appStatus: applications.status })
    .from(scoutJobs)
    .leftJoin(applications, eq(applications.id, scoutJobs.promotedApplicationId))
    .where(eq(scoutJobs.status, status))
    .orderBy(desc(scoutJobs.score))
    .all();
}

/** Latest activity across the pipeline (for the Command strip). */
export async function getRecentActivities(limit = 8): Promise<RecentActivity[]> {
  return db
    .select({
      id: activities.id,
      applicationId: activities.applicationId,
      type: activities.type,
      title: activities.title,
      body: activities.body,
      occurredAt: activities.occurredAt,
      source: activities.source,
      company: applications.company,
    })
    .from(activities)
    .innerJoin(applications, eq(applications.id, activities.applicationId))
    .orderBy(desc(activities.occurredAt))
    .limit(limit)
    .all();
}

/* ==========================================================================
   JOBDASH-002 P4 — email-sync review queries.
   ========================================================================== */

export interface PendingProposal {
  proposal: Proposal;
  email: {
    sender: string;
    subject: string | null;
    snippet: string | null;
    receivedAt: Date;
  };
  /** company of the matched application, when the proposal targets one */
  company: string | null;
}

/** Pending proposals with their source email, newest email first. */
export async function getPendingProposals(): Promise<PendingProposal[]> {
  const rows = await db
    .select({
      proposal: proposals,
      email: {
        sender: emailEvents.sender,
        subject: emailEvents.subject,
        snippet: emailEvents.snippet,
        receivedAt: emailEvents.receivedAt,
      },
      company: applications.company,
    })
    .from(proposals)
    .innerJoin(emailEvents, eq(proposals.sourceEmailEventId, emailEvents.id))
    .leftJoin(applications, eq(applications.id, proposals.applicationId))
    .where(eq(proposals.status, "pending"))
    .orderBy(desc(emailEvents.receivedAt))
    .all();
  return rows;
}

export interface SyncStatus {
  lastRunAt: Date | null;
  stats: Record<string, number> | null;
  pending: number;
  resolvedToday: number;
}

/** Sync-state card data (Command Center + /inbox-sync header). */
export async function getSyncStatus(): Promise<SyncStatus> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [state, pendingRow, resolvedRow] = await Promise.all([
    db.select().from(syncState).where(eq(syncState.id, "gmail")).get(),
    db.select({ n: count() }).from(proposals).where(eq(proposals.status, "pending")).get(),
    db
      .select({ n: count() })
      .from(proposals)
      .where(and(ne(proposals.status, "pending"), gte(proposals.resolvedAt, startOfDay)))
      .get(),
  ]);

  return {
    lastRunAt: state?.lastRunAt ?? null,
    stats: (state?.stats as Record<string, number> | null) ?? null,
    pending: scalar(pendingRow),
    resolvedToday: scalar(resolvedRow),
  };
}

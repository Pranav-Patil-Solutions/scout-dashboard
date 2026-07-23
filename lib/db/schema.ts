import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

/**
 * Scout Control data model — JOBDASH-001 §4/§5.
 * Datetimes are stored as unix-epoch integers (`{ mode: "timestamp" }`) so
 * Drizzle hands JS `Date` objects back and date math in analytics is exact.
 */

export const applications = sqliteTable(
  "applications",
  {
    id: text("id").primaryKey(),
    company: text("company").notNull(),
    roleTitle: text("role_title").notNull(),
    // indeed | join | cherry | smartrecruiters | ashby | greenhouse |
    // wellfound | cold-email | scraper | referral
    source: text("source").notNull().default("scraper"),
    fitScore: integer("fit_score"), // 0..100
    fitBand: text("fit_band"), // strong | stretch | skip
    germanReq: text("german_req").notNull().default("unknown"), // none | bonus | de_en | native | unknown
    location: text("location"),
    workMode: text("work_mode"), // remote | hybrid | onsite
    seniority: text("seniority"), // intern | early | mid | senior
    applyUrl: text("apply_url"),
    jdUrl: text("jd_url"),
    // sourced | to_apply | applied | screening | interview | offer
    //   | rejected | withdrawn | expired_missed
    status: text("status").notNull().default("to_apply"),
    isKitReady: integer("is_kit_ready", { mode: "boolean" })
      .notNull()
      .default(false),
    resumeVariant: text("resume_variant"),
    coverPath: text("cover_path"),
    salaryRange: text("salary_range"),
    appliedAt: integer("applied_at", { mode: "timestamp" }),
    firstResponseAt: integer("first_response_at", { mode: "timestamp" }), // first genuine human reply (not auto-ack, not a rejection)
    lastActivityAt: integer("last_activity_at", { mode: "timestamp" }),
    nextAction: text("next_action"),
    nextActionDue: integer("next_action_due", { mode: "timestamp" }),
    snoozedUntil: integer("snoozed_until", { mode: "timestamp" }), // hides Action Queue cards until this passes
    kitGrade: text("kit_grade", { mode: "json" }), // JOBDASH-005 grader output (KitGrade)
    kitGradedAt: integer("kit_graded_at", { mode: "timestamp" }),
    // rejected | withdrawn | expired_missed | offer_declined | hired
    closedReason: text("closed_reason"),
    closedAt: integer("closed_at", { mode: "timestamp" }), // §4 addition — makes time-to-rejection computable
    notes: text("notes"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    index("app_status_idx").on(t.status),
    index("app_source_idx").on(t.source),
  ],
);

export const activities = sqliteTable(
  "activities",
  {
    id: text("id").primaryKey(),
    applicationId: text("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    // status_change | note | email_in | email_out | interview | follow_up | reminder
    type: text("type").notNull(),
    title: text("title"),
    body: text("body"),
    occurredAt: integer("occurred_at", { mode: "timestamp" }).notNull(),
    source: text("source").notNull().default("manual"), // manual | gmail | scraper | system
  },
  (t) => [index("act_app_idx").on(t.applicationId)],
);

export const contacts = sqliteTable("contacts", {
  id: text("id").primaryKey(),
  applicationId: text("application_id")
    .notNull()
    .references(() => applications.id, { onDelete: "cascade" }),
  name: text("name"),
  role: text("role"),
  email: text("email"),
  linkedin: text("linkedin"),
});

export const scoutJobs = sqliteTable("scout_jobs", {
  id: text("id").primaryKey(),
  source: text("source"),
  title: text("title"),
  company: text("company"),
  url: text("url").unique(),
  score: integer("score"),
  reason: text("reason"),
  languageFlag: text("language_flag"),
  firstSeen: integer("first_seen", { mode: "timestamp" }),
  status: text("status").notNull().default("new"), // new | dismissed | promoted | expired (JOBDASH-007 sweep — hidden everywhere, purgeable)
  promotedApplicationId: text("promoted_application_id"),
  jdText: text("jd_text"), // JOBDASH-006 §2 — cached plain-text JD from `url`
  jdFetchedAt: integer("jd_fetched_at", { mode: "timestamp" }),
  // JOBDASH-009 — set by the scraper when a job makes the daily digest. The
  // auto-sync promotes emailed strong fits (score ≥ 75) into "To apply".
  emailedAt: integer("emailed_at", { mode: "timestamp" }),
});

/* ==========================================================================
   JOBDASH-002 — Gmail → status sync engine (§8).
   Privacy: subject + snippet + classification only; full bodies are never
   persisted (they live transiently in .gmail-staging for classification).
   ========================================================================== */

export const emailEvents = sqliteTable(
  "email_events",
  {
    id: text("id").primaryKey(),
    gmailMessageId: text("gmail_message_id").notNull().unique(),
    threadId: text("thread_id"),
    sender: text("sender").notNull(),
    subject: text("subject"),
    snippet: text("snippet"),
    receivedAt: integer("received_at", { mode: "timestamp" }).notNull(),
    direction: text("direction").notNull().default("inbound"), // inbound | outbound
    classification: text("classification", { mode: "json" }), // §5 output schema
    matchedApplicationId: text("matched_application_id"),
    processedAt: integer("processed_at", { mode: "timestamp" }), // null = awaiting classify/match
  },
  (t) => [index("email_thread_idx").on(t.threadId)],
);

export const proposals = sqliteTable(
  "proposals",
  {
    id: text("id").primaryKey(),
    // add_application | set_status | log_activity | set_first_response
    type: text("type").notNull(),
    applicationId: text("application_id"),
    payload: text("payload", { mode: "json" }).notNull(),
    sourceEmailEventId: text("source_email_event_id")
      .notNull()
      .references(() => emailEvents.id, { onDelete: "cascade" }),
    confidence: real("confidence").notNull().default(0),
    status: text("status").notNull().default("pending"), // pending | accepted | dismissed
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    resolvedAt: integer("resolved_at", { mode: "timestamp" }),
  },
  (t) => [index("proposal_status_idx").on(t.status)],
);

export const syncState = sqliteTable("sync_state", {
  id: text("id").primaryKey(), // source name, e.g. "gmail"
  lastCursor: text("last_cursor"), // ISO date of newest ingested email
  lastRunAt: integer("last_run_at", { mode: "timestamp" }),
  stats: text("stats", { mode: "json" }),
});

export type EmailEvent = typeof emailEvents.$inferSelect;
export type Proposal = typeof proposals.$inferSelect;

export type Application = typeof applications.$inferSelect;
export type NewApplication = typeof applications.$inferInsert;
export type Activity = typeof activities.$inferSelect;
export type NewActivity = typeof activities.$inferInsert;
export type Contact = typeof contacts.$inferSelect;
export type ScoutJob = typeof scoutJobs.$inferSelect;
export type NewScoutJob = typeof scoutJobs.$inferInsert;

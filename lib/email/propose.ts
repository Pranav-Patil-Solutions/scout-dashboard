import type { Status } from "../constants";
import type { Application, EmailEvent } from "../db/schema";
import type { Classification, EmailCategory } from "./types";
import type { MatchResult } from "./match";

/**
 * JOBDASH-002 P3 — the non-destructive proposal engine (§7).
 * Nothing here mutates an application. Every consequence of an email is a
 * proposal draft; only log_activity may auto-apply (and only at decent
 * confidence). Status changes always wait for acceptance.
 */

export type ProposalType =
  | "add_application"
  | "set_status"
  | "log_activity"
  | "set_first_response";

export interface ProposalFlags {
  /** classification confidence < 0.6 — "low confidence, review" (§7) */
  lowConfidence?: boolean;
  /** §7 downgrade guard: proposed status is behind the current one */
  downgrade?: boolean;
  /** application is closed; accepting would reopen it */
  reopens?: boolean;
  /** no application matched — proposal creates one */
  unmatched?: boolean;
}

export interface ProposalPayload {
  summary: string;
  evidence: string;
  occurredAt: string; // ISO
  flags: ProposalFlags;
  // set_status
  toStatus?: Status;
  fromStatus?: string;
  // add_application
  company?: string;
  roleTitle?: string;
  source?: string;
  initialStatus?: Status;
  // log_activity
  activityType?: "email_in" | "email_out";
  title?: string;
  // provenance
  category?: EmailCategory;
  matchConfidence?: number;
  matchMethod?: string;
}

export interface ProposalDraft {
  type: ProposalType;
  applicationId: string | null;
  confidence: number;
  autoApply: boolean;
  payload: ProposalPayload;
}

export const STATUS_RANK: Record<string, number> = {
  sourced: 0,
  to_apply: 1,
  applied: 2,
  screening: 3,
  interview: 4,
  offer: 5,
};
export const CLOSED = new Set(["rejected", "withdrawn", "expired_missed"]);

const TARGET_STATUS: Partial<Record<EmailCategory, Status>> = {
  application_confirmation: "applied",
  rejection: "rejected",
  interview_invite: "interview",
  assessment_task: "screening",
  offer: "offer",
};

/** Categories that create the application when nothing matched. */
const CREATES_APPLICATION = new Set<EmailCategory>([
  "application_confirmation",
  "rejection",
  "interview_invite",
  "assessment_task",
  "offer",
  "scheduling_info_request",
  "outbound_application",
]);

/**
 * firstResponseAt = first genuine human reply — NOT auto-acks, NOT rejections
 * (mirrors lib/analytics.ts `responded()`).
 */
const FIRST_RESPONSE = new Set<EmailCategory>([
  "interview_invite",
  "assessment_task",
  "scheduling_info_request",
  "offer",
]);

const CATEGORY_LABEL: Record<EmailCategory, string> = {
  application_confirmation: "Application confirmed",
  rejection: "Rejection",
  interview_invite: "Interview invite",
  assessment_task: "Assessment / task",
  offer: "Offer",
  scheduling_info_request: "Scheduling / info request",
  recruiter_outreach: "Recruiter outreach",
  application_viewed: "Application viewed",
  outbound_application: "Outbound application",
  other_not_relevant: "Not relevant",
};

/** Known ATS keys that are also application sources in JOBDASH-001 §5. */
const ATS_AS_SOURCE = new Set(["ashby", "greenhouse", "smartrecruiters", "join"]);

export function buildProposals(
  event: EmailEvent,
  c: Classification,
  matched: { app: Application; match: MatchResult } | null,
): ProposalDraft[] {
  if (!c.is_job_related || c.category === "other_not_relevant") return [];

  const drafts: ProposalDraft[] = [];

  const occurredAt = event.receivedAt.toISOString();
  const label = CATEGORY_LABEL[c.category];
  const base = {
    evidence: c.evidence_quote ?? "",
    occurredAt,
    category: c.category,
  };

  if (matched) {
    const { app, match } = matched;
    const combined = round2(c.confidence * match.confidence);
    // §7 "low confidence, review" gates on what the proposal actually carries —
    // the combined classification × match score
    const flags: ProposalFlags = {};
    if (combined < 0.6) flags.lowConfidence = true;
    const provenance = { matchConfidence: match.confidence, matchMethod: match.method };

    // 1. activity — the only auto-appliable type (§7)
    drafts.push({
      type: "log_activity",
      applicationId: app.id,
      confidence: combined,
      autoApply: !flags.lowConfidence,
      payload: {
        ...base,
        ...provenance,
        flags: { ...flags },
        summary: `${label} — ${app.company}`,
        activityType: event.direction === "outbound" ? "email_out" : "email_in",
        title: `${label}: ${event.subject ?? "(no subject)"}`,
      },
    });

    // 2. status change — always needs acceptance
    const target = TARGET_STATUS[c.category];
    // an email older than the app's last recorded activity is historical
    // backfill — it can add an activity, but proposing to move the status
    // BACKWARDS from it is noise (first sync of an old mailbox would otherwise
    // propose reopening every already-closed application)
    const historical =
      event.receivedAt <= (app.lastActivityAt ?? app.closedAt ?? app.appliedAt ?? new Date(0));
    if (target && target !== app.status) {
      const statusFlags: ProposalFlags = { ...flags };
      let skip = false;
      if (target === "rejected") {
        if (CLOSED.has(app.status)) skip = true; // already closed — nothing to change
        else if (historical) skip = true; // stale rejection — the app has since moved on
      } else if (CLOSED.has(app.status)) {
        if (historical) skip = true;
        else statusFlags.reopens = true;
      } else if (STATUS_RANK[target] < STATUS_RANK[app.status]) {
        if (historical) skip = true;
        else statusFlags.downgrade = true; // §7: never move backwards silently
      }
      if (!skip) {
        drafts.push({
          type: "set_status",
          applicationId: app.id,
          confidence: combined,
          autoApply: false,
          payload: {
            ...base,
            ...provenance,
            flags: statusFlags,
            summary: `${app.company}: ${app.status} → ${target}`,
            toStatus: target,
            fromStatus: app.status,
          },
        });
      }
    }

    // 3. first genuine human response
    if (
      FIRST_RESPONSE.has(c.category) &&
      !app.firstResponseAt &&
      event.direction === "inbound"
    ) {
      drafts.push({
        type: "set_first_response",
        applicationId: app.id,
        confidence: combined,
        autoApply: false,
        payload: {
          ...base,
          ...provenance,
          flags: { ...flags },
          summary: `${app.company}: first human response (${label.toLowerCase()})`,
        },
      });
    }

    return drafts;
  }

  // ---- unmatched ----
  if (!CREATES_APPLICATION.has(c.category) || !c.company) return [];

  const source =
    c.category === "outbound_application"
      ? "cold-email"
      : c.ats_platform && ATS_AS_SOURCE.has(c.ats_platform)
        ? c.ats_platform
        : "cold-email";
  const target = TARGET_STATUS[c.category];

  const unmatchedFlags: ProposalFlags = { unmatched: true };
  if (c.confidence < 0.6) unmatchedFlags.lowConfidence = true;
  drafts.push({
    type: "add_application",
    applicationId: null,
    confidence: c.confidence,
    autoApply: false,
    payload: {
      ...base,
      flags: unmatchedFlags,
      summary: `New: ${c.company} — ${c.role_title ?? "unknown role"} (${label.toLowerCase()})`,
      company: c.company,
      roleTitle: c.role_title ?? "Unknown role",
      source,
      initialStatus: target ?? "applied",
    },
  });
  return drafts;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

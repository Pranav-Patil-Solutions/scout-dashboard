/**
 * JOBDASH-002 §3 — the EmailSource seam.
 * v1: StagingSource (session-fetched JSON dumps). Later: GmailApiSource
 * (OAuth2 + gmail.readonly) emits the same RawEmail — nothing downstream moves.
 */

export interface RawEmail {
  gmailMessageId: string;
  threadId: string;
  sender: string;
  recipients?: string[];
  subject: string;
  snippet: string;
  /** plaintext body — classification only, NEVER persisted (§8 privacy) */
  body?: string;
  /** ISO 8601 */
  receivedAt: string;
  direction: "inbound" | "outbound";
}

export interface FetchResult {
  emails: RawEmail[];
  /** ISO date of the newest email seen — becomes sync_state.last_cursor */
  nextCursor: string | null;
}

export interface EmailSource {
  name: string;
  fetchSince(cursor: string | null): Promise<FetchResult>;
}

/** §5 classifier output — validated via strict structured output. */
export type EmailCategory =
  | "application_confirmation"
  | "rejection"
  | "interview_invite"
  | "assessment_task"
  | "offer"
  | "scheduling_info_request"
  | "recruiter_outreach"
  | "application_viewed"
  | "outbound_application"
  | "other_not_relevant";

export interface Classification {
  is_job_related: boolean;
  category: EmailCategory;
  company: string | null;
  role_title: string | null;
  ats_platform: string | null;
  decision_sentiment: "positive" | "negative" | "neutral" | null;
  confidence: number; // 0..1
  interview_datetimes: string[];
  evidence_quote: string;
  rationale: string;
  /** which stage produced this — rules are free, llm calls are logged */
  classified_by: "rules" | "haiku" | "sonnet";
}

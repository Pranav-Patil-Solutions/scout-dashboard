import { spawn } from "node:child_process";
import Anthropic from "@anthropic-ai/sdk";
import type { Classification, EmailCategory, RawEmail } from "./types";

/**
 * §5 STEP 2 — LLM classification with strict structured outputs.
 * Bulk: claude-haiku-4-5, batched ~15 emails/call, subject+snippet+sender only.
 * Escalation: claude-sonnet-5 with full body when confidence < 0.6.
 *
 * Two transports (LLM_TRANSPORT env, default: "api" if ANTHROPIC_API_KEY is
 * set, else "claude-cli"):
 *  - "api": zero-arg Anthropic SDK client (ANTHROPIC_API_KEY or `ant auth
 *    login` profile). Bills API credits. Server-enforced json_schema output.
 *  - "claude-cli": shells out to `claude -p` headless mode, which runs on the
 *    local Claude Code subscription — no API credits. The CLI cannot enforce
 *    json_schema server-side, so the schema goes into the prompt and results
 *    are validated locally with one retry.
 */

const BULK_MODEL = "claude-haiku-4-5";
const ESCALATION_MODEL = "claude-sonnet-5";
// §9 tuning: was 0.6 per ticket §5, but Haiku parks ambiguous truncated-decision
// emails at exactly 0.6, dodging escalation while the decisive body goes unread.
export const ESCALATION_THRESHOLD = 0.7;
const BATCH_SIZE = 15;

// §6 — implemented verbatim.
const SYSTEM_PROMPT = `You classify emails from a job seeker's inbox. For each email decide if it is about one of THEIR job applications, and which category. Be conservative: only 'rejection' when the email clearly declines the candidate; only 'interview_invite' when it clearly proposes/schedules a conversation. Extract the hiring company (not the ATS vendor) and the exact role title if present. Ignore marketing, newsletters, job-alert digests, and the seeker's own automated job-scout emails. Always return the evidence sentence you used. If unsure, lower confidence rather than guessing a strong category.

Additional context: the seeker also SENDS cold/open applications — an outbound email pitching themselves for a role is category 'outbound_application'. Recruiting spam from bulk senders (mass "you've been shortlisted, schedule your interview" blasts) is never 'interview_invite'; classify it 'recruiter_outreach' with is_job_related=false unless it clearly concerns an application the seeker actually made.

Precision guards (§9 eval-tuned):
- 'rejection' requires the sender to be the employer (or its ATS) deciding on a specific application the seeker actually made — a real company and role. Marketing that mimics rejection language ("after careful consideration, we have decided not to move forward" from a school, newsletter, or coaching service pitching itself) is 'other_not_relevant' with is_job_related=false, no matter how rejection-like the subject line reads.
- 'application_viewed' is ONLY for explicit "the employer viewed your application" notifications from job boards. An employer email saying "we have reviewed your application and…" is a DECISION email, not a view notification.
- Gmail snippets often truncate BEFORE the verdict. If an employer/ATS email opens with application-thanks plus completed-decision language ("we have taken some time over the decision", "after careful consideration", "we have reviewed your application and while…") and shows NO positive signal (no interview, assessment, or offer language), it is almost always a rejection template — classify 'rejection'; use confidence below 0.7 when the verdict itself is off-screen so it escalates to a deeper read.`;

const CATEGORIES: EmailCategory[] = [
  "application_confirmation",
  "rejection",
  "interview_invite",
  "assessment_task",
  "offer",
  "scheduling_info_request",
  "recruiter_outreach",
  "application_viewed",
  "outbound_application",
  "other_not_relevant",
];

const RESULT_SCHEMA = {
  type: "object",
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        properties: {
          gmail_message_id: { type: "string" },
          is_job_related: { type: "boolean" },
          category: { type: "string", enum: CATEGORIES },
          company: { type: ["string", "null"] },
          role_title: { type: ["string", "null"] },
          ats_platform: { type: ["string", "null"] },
          decision_sentiment: {
            type: ["string", "null"],
            enum: ["positive", "negative", "neutral", null],
          },
          confidence: { type: "number" },
          interview_datetimes: { type: "array", items: { type: "string" } },
          evidence_quote: { type: "string" },
          rationale: { type: "string" },
        },
        required: [
          "gmail_message_id",
          "is_job_related",
          "category",
          "company",
          "role_title",
          "ats_platform",
          "decision_sentiment",
          "confidence",
          "interview_datetimes",
          "evidence_quote",
          "rationale",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["results"],
  additionalProperties: false,
} as const;

type LlmResult = {
  gmail_message_id: string;
  is_job_related: boolean;
  category: EmailCategory;
  company: string | null;
  role_title: string | null;
  ats_platform: string | null;
  decision_sentiment: "positive" | "negative" | "neutral" | null;
  confidence: number;
  interview_datetimes: string[];
  evidence_quote: string;
  rationale: string;
};

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

type LlmTransport = "api" | "claude-cli";
function transport(): LlmTransport {
  const t = process.env.LLM_TRANSPORT;
  if (t === "api" || t === "claude-cli") return t;
  return process.env.ANTHROPIC_API_KEY ? "api" : "claude-cli";
}

function validateResults(value: unknown, expectedIds: string[]): LlmResult[] {
  if (typeof value !== "object" || value === null) throw new Error("output is not an object");
  const results = (value as { results?: unknown }).results;
  if (!Array.isArray(results)) throw new Error("missing results array");
  for (const r of results as Array<Record<string, unknown>>) {
    if (typeof r?.gmail_message_id !== "string") throw new Error("result missing gmail_message_id");
    if (typeof r.is_job_related !== "boolean") throw new Error("is_job_related is not a boolean");
    if (!CATEGORIES.includes(r.category as EmailCategory)) {
      throw new Error(`invalid category: ${String(r.category)}`);
    }
    if (typeof r.confidence !== "number") throw new Error("confidence is not a number");
  }
  // completeness — a structurally valid response can still silently drop an
  // email, which downstream degrades to a conf-0 "other_not_relevant"
  const returned = new Set((results as LlmResult[]).map((r) => r.gmail_message_id));
  const missing = expectedIds.filter((id) => !returned.has(id));
  if (missing.length > 0) throw new Error(`no result for id(s): ${missing.join(", ")}`);
  return results as LlmResult[];
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : text).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("no JSON object in output");
  return candidate.slice(start, end + 1);
}

const CLI_TIMEOUT_MS = 300_000;

function runClaudeCli(args: string[], stdinInput: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", args, { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`claude -p timed out after ${CLI_TIMEOUT_MS / 1000}s`));
    }, CLI_TIMEOUT_MS);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`claude -p exited ${code}: ${err || out}`));
      else resolve(out);
    });
    child.stdin.write(stdinInput);
    child.stdin.end();
  });
}

async function classifyViaApi(
  model: string,
  userPrompt: string,
  expectedIds: string[],
): Promise<LlmResult[]> {
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const nudge =
      attempt === 0
        ? ""
        : `\n\nYour previous output was invalid (${lastError}). Return one result for EVERY email id.`;
    const response = await client().messages.create({
      model,
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      output_config: {
        format: { type: "json_schema", schema: RESULT_SCHEMA },
      },
      messages: [{ role: "user", content: userPrompt + nudge }],
    });
    const text = response.content.find((b) => b.type === "text");
    try {
      if (!text || text.type !== "text") throw new Error("No structured output returned");
      return validateResults(JSON.parse(text.text), expectedIds);
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(`api transport failed: ${lastError}`);
}

async function classifyViaCli(
  model: string,
  userPrompt: string,
  expectedIds: string[],
): Promise<LlmResult[]> {
  const schemaNote = `\n\nRespond with ONLY a raw JSON object — no markdown fences, no prose — that validates against this JSON Schema:\n${JSON.stringify(RESULT_SCHEMA)}`;
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const nudge =
      attempt === 0
        ? ""
        : `\n\nYour previous output was invalid (${lastError}). Output ONLY the raw JSON object this time.`;
    let stdout: string;
    try {
      stdout = await runClaudeCli(
        ["-p", "--model", model, "--output-format", "json", "--system-prompt", SYSTEM_PROMPT],
        userPrompt + schemaNote + nudge,
      );
    } catch (e) {
      // timeouts / spawn failures are as retryable as bad JSON
      lastError = e instanceof Error ? e.message : String(e);
      continue;
    }
    let envelope: { is_error?: boolean; subtype?: string; result?: string };
    try {
      envelope = JSON.parse(stdout);
    } catch {
      lastError = "CLI stdout was not JSON";
      continue;
    }
    if (envelope.is_error || typeof envelope.result !== "string") {
      lastError = `CLI error: ${envelope.subtype ?? "no result"}`;
      continue;
    }
    try {
      return validateResults(JSON.parse(extractJson(envelope.result)), expectedIds);
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(`claude-cli transport failed: ${lastError}`);
}

function emailBlock(e: RawEmail, includeBody: boolean): string {
  const lines = [
    `<email id="${e.gmailMessageId}">`,
    `direction: ${e.direction}`,
    `from: ${e.sender}`,
    e.recipients?.length ? `to: ${e.recipients.join(", ")}` : null,
    `date: ${e.receivedAt}`,
    `subject: ${e.subject}`,
    `snippet: ${e.snippet}`,
    includeBody && e.body ? `body:\n${e.body}` : null,
    `</email>`,
  ];
  return lines.filter(Boolean).join("\n");
}

async function classifyBatch(
  emails: RawEmail[],
  model: string,
  includeBody: boolean,
): Promise<Map<string, LlmResult>> {
  const userPrompt = `Classify each of the following ${emails.length} emails. Return one result per email, keyed by its gmail_message_id.\n\n${emails
    .map((e) => emailBlock(e, includeBody))
    .join("\n\n")}`;
  const expectedIds = emails.map((e) => e.gmailMessageId);
  const results =
    transport() === "api"
      ? await classifyViaApi(model, userPrompt, expectedIds)
      : await classifyViaCli(model, userPrompt, expectedIds);
  return new Map(results.map((r) => [r.gmail_message_id, r]));
}

export interface LlmClassifyOutcome {
  classifications: Map<string, Classification>;
  llmCalls: number;
  escalated: number;
}

/**
 * Classify emails with Haiku in batches; escalate low-confidence results to
 * Sonnet with the full body. Throws only on total API failure — a missing
 * per-email result degrades to a low-confidence "other_not_relevant".
 */
export async function classifyWithLlm(emails: RawEmail[]): Promise<LlmClassifyOutcome> {
  const out = new Map<string, Classification>();
  let llmCalls = 0;
  let escalated = 0;
  if (emails.length === 0) return { classifications: out, llmCalls, escalated };

  const byId = new Map(emails.map((e) => [e.gmailMessageId, e]));
  const needsEscalation: RawEmail[] = [];

  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    const batch = emails.slice(i, i + BATCH_SIZE);
    const results = await classifyBatch(batch, BULK_MODEL, false);
    llmCalls++;

    for (const email of batch) {
      const r = results.get(email.gmailMessageId);
      if (!r) {
        out.set(email.gmailMessageId, fallbackClassification("missing from batch result"));
        continue;
      }
      if (r.confidence < ESCALATION_THRESHOLD) {
        needsEscalation.push(email);
      }
      out.set(email.gmailMessageId, toClassification(r, "haiku"));
    }
  }

  // Escalate ambiguous ones to Sonnet with full body (§5).
  for (let i = 0; i < needsEscalation.length; i += BATCH_SIZE) {
    const batch = needsEscalation.slice(i, i + BATCH_SIZE);
    const results = await classifyBatch(batch, ESCALATION_MODEL, true);
    llmCalls++;
    escalated += batch.length;
    for (const email of batch) {
      const r = results.get(email.gmailMessageId);
      if (r) out.set(email.gmailMessageId, toClassification(r, "sonnet"));
    }
  }

  // guard against ids the model never returned
  for (const id of byId.keys()) {
    if (!out.has(id)) out.set(id, fallbackClassification("no LLM result"));
  }

  return { classifications: out, llmCalls, escalated };
}

function toClassification(r: LlmResult, by: "haiku" | "sonnet"): Classification {
  return {
    is_job_related: r.is_job_related,
    category: r.category,
    company: r.company,
    role_title: r.role_title,
    ats_platform: r.ats_platform,
    decision_sentiment: r.decision_sentiment,
    confidence: Math.max(0, Math.min(1, r.confidence)),
    interview_datetimes: r.interview_datetimes ?? [],
    evidence_quote: r.evidence_quote ?? "",
    rationale: r.rationale ?? "",
    classified_by: by,
  };
}

function fallbackClassification(reason: string): Classification {
  return {
    is_job_related: false,
    category: "other_not_relevant",
    company: null,
    role_title: null,
    ats_platform: null,
    decision_sentiment: null,
    confidence: 0,
    interview_datetimes: [],
    evidence_quote: "",
    rationale: reason,
    classified_by: "haiku",
  };
}

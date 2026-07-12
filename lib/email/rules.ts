import { isHardNoise } from "./noise";
import type { Classification, RawEmail } from "./types";

/**
 * §5 STEP 1 — deterministic rules. High-precision only:
 * pattern rules fire ONLY for known ATS/recruiting senders. (A real inbox
 * contains marketing that quotes rejection language verbatim — e.g. a business
 * school ad titled "we have decided not to move forward" — so bare pattern
 * matching over all senders is a precision trap. Non-ATS senders go to the LLM.)
 */

const ATS_DOMAINS = [
  "ashbyhq.com",
  "join.com",
  "msg.join.com",
  "smartrecruiters.com",
  "greenhouse.io",
  "greenhouse-mail.io",
  "us.greenhouse-mail.io",
  "lever.co",
  "myworkday.com",
  "workday.com",
  "personio.de",
  "personio.com",
  "recruitee.com",
  "teamtailor.com",
];

function isAtsSender(sender: string): boolean {
  const domain = sender.slice(sender.lastIndexOf("@") + 1).toLowerCase();
  return ATS_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}

export function atsPlatformOf(sender: string): string | null {
  const domain = sender.slice(sender.lastIndexOf("@") + 1).toLowerCase();
  if (domain.includes("ashby")) return "ashby";
  if (domain.includes("join.com")) return "join";
  if (domain.includes("smartrecruiters")) return "smartrecruiters";
  if (domain.includes("greenhouse")) return "greenhouse";
  if (domain.includes("lever")) return "lever";
  if (domain.includes("workday")) return "workday";
  if (domain.includes("personio")) return "personio";
  if (domain.includes("recruitee")) return "recruitee";
  if (domain.includes("teamtailor")) return "teamtailor";
  return null;
}

// §5 patterns, checked in precedence order (rejection before confirmation —
// rejections routinely open with "thank you for applying").
const REJECTION =
  /not to move forward|decided not to move forward|will not be moving forward|not be moving forward with your candidacy|decided not to proceed|will not be progressing|unfortunately[\s\S]{0,80}other candidates|(continuing|moving forward|proceeding) with other candidates/i;
// Rejection templates open politely ("Thank you for your application…") and
// Gmail snippets often truncate BEFORE the verdict — if decision language is
// present but no pattern above matched, the outcome is off-screen: defer to
// the LLM instead of letting CONFIRMATION fire.
const DECISION_UNDERWAY =
  /taken (some )?time over the decision|after careful (consideration|review)|we have (now )?(made|reached) (a|our) decision/i;
const INTERVIEW =
  /invite you to (an? )?(interview|call|chat)|schedule (an? |your )?[\w\s]{0,24}(interview|call)|calendly\.com|savvycal\.com/i;
const ASSESSMENT = /assessment|case study|take-home|take home task|coding challenge/i;
const OFFER = /pleased to offer|offer letter/i;
const CONFIRMATION =
  /thank you for applying|we received your application|application has been received|we've received your application|thank you for your application/i;

function base(
  category: Classification["category"],
  evidence: string,
  sentiment: Classification["decision_sentiment"],
  sender: string,
): Omit<Classification, "company" | "role_title"> {
  return {
    is_job_related: category !== "other_not_relevant",
    category,
    ats_platform: atsPlatformOf(sender),
    decision_sentiment: sentiment,
    confidence: 0.97,
    interview_datetimes: [],
    evidence_quote: evidence,
    rationale: "deterministic rule",
    classified_by: "rules",
  };
}

function evidenceFor(pattern: RegExp, text: string): string {
  const m = pattern.exec(text);
  if (!m) return "";
  // return the containing sentence-ish span
  const start = Math.max(0, text.lastIndexOf(".", m.index) + 1);
  const end = text.indexOf(".", m.index + m[0].length);
  return text.slice(start, end === -1 ? m.index + m[0].length + 60 : end + 1).trim();
}

/**
 * Returns a Classification when a rule resolves the email, else null (→ LLM).
 * company/role extraction is left to the LLM except for noise (never needed).
 */
export function classifyByRules(email: RawEmail): Classification | null {
  const text = [email.subject, email.snippet, email.body ?? ""].join("\n");

  // 1. hard noise-list — never job-related, never costs a token (§4)
  if (isHardNoise(email.sender, email.body ?? email.snippet)) {
    return {
      ...base("other_not_relevant", "", "neutral", email.sender),
      is_job_related: false,
      company: null,
      role_title: null,
      rationale: "sender is on the hard noise-list",
    };
  }

  // 2. pattern rules — ATS senders only (precision guard)
  if (email.direction === "inbound" && isAtsSender(email.sender)) {
    if (REJECTION.test(text)) {
      return {
        ...base("rejection", evidenceFor(REJECTION, text), "negative", email.sender),
        company: null,
        role_title: null,
      };
    }
    if (INTERVIEW.test(text)) {
      return {
        ...base("interview_invite", evidenceFor(INTERVIEW, text), "positive", email.sender),
        company: null,
        role_title: null,
      };
    }
    if (ASSESSMENT.test(text)) {
      return {
        ...base("assessment_task", evidenceFor(ASSESSMENT, text), "positive", email.sender),
        company: null,
        role_title: null,
      };
    }
    if (OFFER.test(text)) {
      return {
        ...base("offer", evidenceFor(OFFER, text), "positive", email.sender),
        company: null,
        role_title: null,
      };
    }
    if (CONFIRMATION.test(text) && !DECISION_UNDERWAY.test(text)) {
      return {
        ...base(
          "application_confirmation",
          evidenceFor(CONFIRMATION, text),
          "neutral",
          email.sender,
        ),
        company: null,
        role_title: null,
      };
    }
  }

  // 3. unresolved → LLM
  return null;
}

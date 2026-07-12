/**
 * §4 hard noise-list — senders that must NEVER be classified as applications.
 * Checked before any LLM call: matching emails are marked not_relevant at
 * zero cost. Matching is on the sender's domain or full address.
 */

const NOISE_SENDERS = [
  "onboarding@resend.dev", // Pranav's OWN Job Scout digest
  "donotreply@jobalert.indeed.com", // Indeed job alerts
  "team@hi.wellfound.com", // Wellfound suggestions
  "noreply@notifications.freelancer.com", // freelance spam
];

const NOISE_DOMAINS = [
  "jobalert.indeed.com",
  "hi.wellfound.com",
  "notifications.freelancer.com",
  "resend.dev",
  // finance/personal (§4)
  "groww.in",
  "revolut.com",
  "hdfc.bank.in",
  "hdfcbank.com",
  "monsterindia.com",
  "klarna.de",
  "klarna.com",
  // platform notifications that match job keywords but never are applications
  "github.com",
  "email.openai.com",
];

/** linkedin notifications are noise UNLESS the body carries a recruiter DM (§4). */
const LINKEDIN_NOTIFICATIONS = "notifications-noreply@linkedin.com";

function domainOf(sender: string): string {
  const at = sender.lastIndexOf("@");
  return at === -1 ? sender.toLowerCase() : sender.slice(at + 1).toLowerCase();
}

export function isHardNoise(sender: string, body?: string): boolean {
  const s = sender.toLowerCase().trim();
  if (NOISE_SENDERS.includes(s)) return true;
  const domain = domainOf(s);
  if (NOISE_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) {
    return true;
  }
  if (s === LINKEDIN_NOTIFICATIONS) {
    // keep only if the content looks like an actual recruiter message
    const text = (body ?? "").toLowerCase();
    return !/sent you a message|would like to connect about|reached out about (a|the) role/.test(text);
  }
  return false;
}

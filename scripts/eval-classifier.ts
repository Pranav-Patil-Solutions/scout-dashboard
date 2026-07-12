/**
 * JOBDASH-002 §9 — labeled-email eval on REAL inbox fixtures.
 * Run: npx tsx scripts/eval-classifier.ts
 * Targets: rejection & interview precision ≥ 95%, overall accuracy ≥ 90%,
 * ZERO job-alert/digest emails treated as applications. Exits 1 on any miss.
 */
import fs from "node:fs";
import path from "node:path";
import { classifyEmails } from "../lib/email/classify";
import type { EmailCategory, RawEmail } from "../lib/email/types";

const staging = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), ".gmail-staging/2026-07-11-sweep.json"), "utf-8"),
) as { emails: RawEmail[] };

// §9 synthetic fixtures — hard-noise senders are skipped at fetch time, so the
// digest/alert cases are asserted from known-truth replicas here.
const SYNTHETIC: RawEmail[] = [
  {
    gmailMessageId: "synthetic-jobscout-digest",
    threadId: "synthetic-jobscout-digest",
    sender: "onboarding@resend.dev",
    subject: "Job Scout: 7 matches",
    snippet:
      "Your daily job scout found 7 matches: Founders Associate at Pliant (score 78), Chief of Staff at Tacto (81), Operations Manager at Scoutbee (72)…",
    receivedAt: "2026-07-10T06:00:00Z",
    direction: "inbound",
  },
  {
    gmailMessageId: "synthetic-indeed-alert",
    threadId: "synthetic-indeed-alert",
    sender: "donotreply@jobalert.indeed.com",
    subject: "Berlin: Lagermitarbeiter (m/w/d) und 29 weitere Jobs",
    snippet:
      "Neue Jobs in Berlin: Lagermitarbeiter (m/w/d) bei DHL, Operations Manager bei Zalando, und 29 weitere Jobs für deine Suche.",
    receivedAt: "2026-07-10T07:00:00Z",
    direction: "inbound",
  },
];

type Expect =
  | { kind: "category"; category: EmailCategory }
  | { kind: "not_relevant" }
  | { kind: "not_categories"; forbidden: EmailCategory[] };

// id → (label, expectation). Strict labels count toward accuracy; "not_categories"
// guards count toward precision (a hit on a forbidden category is a false positive).
const TRUTH: Record<string, { label: string; expect: Expect }> = {
  "19eef81c2d927f86": { label: "telli confirmation", expect: { kind: "category", category: "application_confirmation" } },
  "19ef4d87816f30cb": { label: "telli REJECTION", expect: { kind: "category", category: "rejection" } },
  "19ed8838b91b3dad": { label: "Reonic confirmation", expect: { kind: "category", category: "application_confirmation" } },
  "19edeadfecd1b6cb": { label: "Reonic REJECTION", expect: { kind: "category", category: "rejection" } },
  "19eef673d37c97fe": { label: "voize confirmation", expect: { kind: "category", category: "application_confirmation" } },
  "19efe8b9b0a6495c": { label: "voize REJECTION", expect: { kind: "category", category: "rejection" } },
  "19ed22a250c2c0ce": { label: "CEF AI confirmation (pending)", expect: { kind: "category", category: "application_confirmation" } },
  "19f000ee65913118": { label: "Overfly SENT cold application", expect: { kind: "category", category: "outbound_application" } },
  "19ea6e5c8c48367f": { label: "Glacis REJECTION (undetected app)", expect: { kind: "category", category: "rejection" } },
  "19e7eba662550139": { label: "Glacis interview invite", expect: { kind: "category", category: "interview_invite" } },
  "19cf61721ea10382": { label: "Wolt REJECTION", expect: { kind: "category", category: "rejection" } },
  "19cec082fd99631b": { label: "Wolt confirmation", expect: { kind: "category", category: "application_confirmation" } },
  "synthetic-jobscout-digest": { label: "OWN Job Scout digest", expect: { kind: "not_relevant" } },
  "synthetic-indeed-alert": { label: "Indeed job alert", expect: { kind: "not_relevant" } },
  "19f4f4fb55145ee4": { label: "groww IPO marketing", expect: { kind: "not_relevant" } },
  "19ebfed9e35eec29": { label: "Klarna 'we received your payment'", expect: { kind: "not_relevant" } },
  "19ed4fc58255d3b2": { label: "GitHub OAuth 'application'", expect: { kind: "not_relevant" } },
  "19e91f80a316385b": { label: "freshersindia 'Schedule Your Interview' SPAM", expect: { kind: "not_categories", forbidden: ["interview_invite", "rejection", "application_confirmation", "offer"] } },
  "19e34ff29fa15d1a": { label: "freshersindia 'application processed' SPAM", expect: { kind: "not_categories", forbidden: ["interview_invite", "rejection", "application_confirmation", "offer"] } },
  "19e17226d8112b7a": { label: "RWTH fake-rejection MARKETING", expect: { kind: "not_categories", forbidden: ["rejection", "interview_invite", "offer"] } },
  "19e8c38f708552f3": { label: "Join sign-in link (incomplete app)", expect: { kind: "not_categories", forbidden: ["rejection", "interview_invite", "offer"] } },
};

async function main() {
  const emails = [...staging.emails, ...SYNTHETIC];
  const t0 = Date.now();
  const { classifications, llmCalls, escalated, byRules } = await classifyEmails(emails);
  const ms = Date.now() - t0;

  let pass = 0;
  let fail = 0;
  const failures: string[] = [];

  // per-category precision bookkeeping
  const predicted: Record<string, string[]> = { rejection: [], interview_invite: [] };
  const truthRejections = new Set(
    Object.entries(TRUTH).filter(([, v]) => v.expect.kind === "category" && v.expect.category === "rejection").map(([k]) => k),
  );
  const truthInterviews = new Set(
    Object.entries(TRUTH).filter(([, v]) => v.expect.kind === "category" && v.expect.category === "interview_invite").map(([k]) => k),
  );

  for (const [id, { label, expect }] of Object.entries(TRUTH)) {
    const c = classifications.get(id);
    if (!c) {
      fail++;
      failures.push(`${label}: NO RESULT`);
      continue;
    }
    if (c.category === "rejection") predicted.rejection.push(id);
    if (c.category === "interview_invite") predicted.interview_invite.push(id);

    let ok = false;
    if (expect.kind === "category") ok = c.category === expect.category;
    else if (expect.kind === "not_relevant") ok = !c.is_job_related;
    else ok = !expect.forbidden.includes(c.category);

    if (ok) pass++;
    else {
      fail++;
      failures.push(`${label}: got ${c.category} (job_related=${c.is_job_related}, by=${c.classified_by}, conf=${c.confidence})`);
    }
  }

  // also count predictions on unlabeled emails toward precision
  for (const [id, c] of classifications) {
    if (TRUTH[id]) continue;
    if (c.category === "rejection") predicted.rejection.push(id);
    if (c.category === "interview_invite") predicted.interview_invite.push(id);
  }

  const rejPrecision = predicted.rejection.length
    ? predicted.rejection.filter((id) => truthRejections.has(id)).length / predicted.rejection.length
    : 1;
  const intPrecision = predicted.interview_invite.length
    ? predicted.interview_invite.filter((id) => truthInterviews.has(id)).length / predicted.interview_invite.length
    : 1;
  const rejRecall = truthRejections.size
    ? [...truthRejections].filter((id) => predicted.rejection.includes(id)).length / truthRejections.size
    : 1;
  const accuracy = pass / (pass + fail);

  const digestAsApp = ["synthetic-jobscout-digest", "synthetic-indeed-alert"].some((id) => {
    const c = classifications.get(id);
    return c?.is_job_related === true;
  });

  console.log("\n════════ §9 EVAL SCORECARD ════════");
  console.log(`fixtures:            ${pass + fail} (${pass} pass / ${fail} fail)`);
  console.log(`overall accuracy:    ${(accuracy * 100).toFixed(1)}%  (target ≥90)`);
  console.log(`rejection precision: ${(rejPrecision * 100).toFixed(1)}%  (target ≥95)  [recall ${(rejRecall * 100).toFixed(1)}%]`);
  console.log(`interview precision: ${(intPrecision * 100).toFixed(1)}%  (target ≥95)`);
  console.log(`digest-as-app:       ${digestAsApp ? "VIOLATION" : "zero"}  (target zero)`);
  console.log(`pipeline:            ${byRules} rule-resolved · ${llmCalls} LLM calls · ${escalated} escalated to sonnet · ${ms}ms`);
  if (failures.length) {
    console.log("\nFAILURES:");
    for (const f of failures) console.log(`  ✗ ${f}`);
  }

  const green = accuracy >= 0.9 && rejPrecision >= 0.95 && intPrecision >= 0.95 && !digestAsApp;
  console.log(`\nRESULT: ${green ? "PASS ✅" : "FAIL ❌"}`);
  process.exit(green ? 0 : 1);
}

main().catch((err) => {
  console.error("eval crashed:", err);
  process.exit(1);
});

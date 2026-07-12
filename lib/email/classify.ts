import { classifyByRules } from "./rules";
import { classifyWithLlm } from "./llm";
import type { Classification, RawEmail } from "./types";

export interface ClassifyOutcome {
  classifications: Map<string, Classification>;
  llmCalls: number;
  escalated: number;
  byRules: number;
}

/**
 * §5 hybrid pipeline. Noise resolves free; every other email goes through the
 * Haiku batch (entities + category); ambiguous ones escalate to Sonnet.
 * A fired category RULE always wins over the LLM's category — the rules are
 * the high-precision layer — but entity extraction (company/role) and
 * evidence come from the LLM when the rule couldn't provide them.
 */
export async function classifyEmails(
  emails: RawEmail[],
): Promise<ClassifyOutcome> {
  const ruleResults = new Map<string, Classification>();
  const forLlm: RawEmail[] = [];

  for (const email of emails) {
    const ruled = classifyByRules(email);
    if (ruled) ruleResults.set(email.gmailMessageId, ruled);
    // noise never reaches the LLM; rule-classified emails still go for entity extraction
    if (!ruled || ruled.category !== "other_not_relevant") forLlm.push(email);
  }

  const { classifications: llmResults, llmCalls, escalated } =
    await classifyWithLlm(forLlm);

  const merged = new Map<string, Classification>();
  for (const email of emails) {
    const id = email.gmailMessageId;
    const rule = ruleResults.get(id);
    const llm = llmResults.get(id);

    if (rule && rule.category === "other_not_relevant") {
      merged.set(id, rule); // hard noise — final
    } else if (rule && llm) {
      // rule category wins; LLM fills entities + richer evidence. ats_platform
      // is domain-derived in the rules layer — deterministic beats the guess.
      merged.set(id, {
        ...llm,
        category: rule.category,
        decision_sentiment: rule.decision_sentiment,
        is_job_related: true,
        confidence: Math.max(rule.confidence, llm.confidence),
        evidence_quote: rule.evidence_quote || llm.evidence_quote,
        ats_platform: rule.ats_platform ?? llm.ats_platform,
        classified_by: "rules",
      });
    } else if (llm) {
      merged.set(id, llm);
    } else if (rule) {
      merged.set(id, rule);
    }
  }

  return { classifications: merged, llmCalls, escalated, byRules: ruleResults.size };
}

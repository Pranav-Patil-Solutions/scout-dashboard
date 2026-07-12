# EVOLUTION — Scout Control

Permanent system deltas per the global Evolve rule (every bug/misstep → a rule, not just a fix).

## 2026-07-11 — JOBDASH-002 P2 (classifier eval gate)

1. **OAuth login ≠ API credits.** `ant auth login` gives identity only; inference still bills org credits (Pranav's Individual Org has none). Free path that works: `claude -p` headless runs on the Claude Code subscription. → Delta: `lib/email/llm.ts` now has a transport seam (`LLM_TRANSPORT=api|claude-cli`, auto: `claude-cli` when no `ANTHROPIC_API_KEY`). Rule for future builds: any personal-tool LLM feature should default to the claude-cli transport unless the org is funded.
2. **Gmail snippets truncate BEFORE the verdict — polite-opener rejection templates then look like confirmations.** Reonic/Ashby rejection matched the `CONFIRMATION` rule at 0.97. → Delta: rules layer gained a `DECISION_UNDERWAY` guard (decision language + no verdict → defer to LLM) and the rejection pattern covers "(continuing|moving forward|proceeding) with other candidates". Rule: never let a positive/neutral pattern fire when completed-decision language is present.
3. **Knife-edge escalation thresholds get dodged.** Haiku parked an ambiguous rejection at exactly 0.6 vs `< 0.6` escalation, so Sonnet never saw the decisive body. → Delta: threshold raised to 0.7 + prompt instructs sub-0.7 confidence when the verdict is off-screen. Rule: escalation cutoffs must sit ABOVE the model's "unsure" round number, not at it.
4. **Structurally valid LLM output can silently drop an item.** A 5-email batch returned 4 results; the dropped one degraded to conf-0 `other_not_relevant` — a real rejection would have been invisible in the product. → Delta: `validateResults` now takes `expectedIds` and fails (→ retry) on any missing id, in BOTH transports. Rule: batch LLM calls always validate completeness, not just shape.
5. **LLM-mimicking marketing beats sender-level guards.** The RWTH "fake rejection" ad fooled Haiku even though the rules layer was already guarded. → Delta: §6 system prompt gained precision guards (rejection requires a deciding employer + an actual application; `application_viewed` ≠ "we have reviewed your application"). Rule: precision guards must exist at BOTH layers — rules and prompt.

## 2026-07-12 — JOBDASH-002 P3 (match + proposal engine)

6. **First sync of an old mailbox proposes reopening every closed application.** Historical confirmation emails generated `rejected → applied (reopens)` cards for telli/voize/Reonic. → Delta: propose.ts skips BACKWARDS status proposals when the email predates the app's lastActivityAt (flag path kept for genuinely-new downgrade signals). Rule: temporal ordering is part of the downgrade guard — an old email is backfill, not news.
7. **Sibling add_application proposals create duplicate apps when both accepted.** Two Wolt emails → two "New: Wolt" cards → two rows. → Delta: apply.ts rematches at ACCEPT time; a confident match links + logs + applies a guarded forward/closing status instead of inserting. Verified: Wolt and Glacis pairs each collapsed to one app with full activity trail. Rule: proposals are frozen at creation, so any accept that creates an entity must re-check the world first.
8. **"May auto-apply" must gate on the confidence the proposal carries.** A 0.58 combined-confidence activity auto-applied because the flag checked classification confidence only. → Delta: lowConfidence flag computed from combined (classification × match) score; auto-apply respects it. Rule: gate on the score you store, not an upstream component of it.
9. **Transport errors must be as retryable as bad output.** A one-off `claude -p` stall (>180s) crashed the whole sync because only parse failures were retried. → Delta: CLI timeout 300s + spawn/timeout errors re-enter the retry loop. Rule: in a retry loop, catch the transport, not just the parse.

## 2026-07-12 — JOBDASH-002 P4 (/inbox-sync review UI)

No failures — built against existing idioms (action-queue client pattern, chips tint(), server actions + revalidateAll) and verified first-pass: typecheck 0, Playwright screenshots on-system, live browser click of Sync now → success toast, GET /api/proposals 200.

## 2026-07-12 — Apply-button 404s (user-reported)

10. **The seed fabricated apply URLs onto real applications.** WeFlow/Kadmos `applyUrl` (and the sample scout Knowunity URL) were invented slugs that 404 on the real sites — fake facts wearing real domains, hit the moment Pranav clicked Apply. → Delta: replaced with WebFetch-VERIFIED live posting URLs in both the DB and `lib/db/seed.ts`; unverifiable Knowunity posting nulled (UI hides the link). Rule: seed/spec data may NEVER contain invented URLs — a URL is either verified-live at write time or null.

## 2026-07-12 — P5 ship gate (code-reviewer blockers)

11. **A privacy rule needs a choke point, not discipline.** §8 said "never persist bodies" and the schema honored it — but body text still leaked into THREE columns via classification side-channels (evidence_quote/rationale quoting Sonnet's body reads, rules extracting evidence from body text). → Delta: `lib/email/privacy.ts` scrubs any field containing a verbatim body window (subject/snippet-visible text exempt) at the single point where classifications enter persistence; existing rows scrubbed + probe-verified. Rule: enforce data-boundary constraints at one code choke point and verify with a content probe, never by convention across call sites.
12. **Guard clauses added per-branch will miss a branch.** The temporal downgrade guard was added to two of three status-target branches; the `rejected` branch silently skipped it (stale rejection could close an advanced app unflagged). Zero-context review caught it. → Delta: guard applied to all branches + regression test. Rule: when adding a cross-cutting guard to a branch tree, table every branch × guard combination explicitly — and keep the ship gate's fresh-eyes review, it caught what the author (me) reread past twice.

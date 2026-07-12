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

## 2026-07-12 — JOBDASH-003 §1/§4/§5 (libsql driver swap + auth gate + serverless guards)

No failures — driver migration (better-sqlite3 → @libsql/client via drizzle-orm/libsql, all call sites async), root `proxy.ts` Basic-auth gate (Next 16 renames middleware → Proxy; confirmed in node_modules/next/dist/docs BEFORE writing it, per AGENTS.md), and SYNC_DISABLED 501 guard all passed first-run: tsc 0, 32/32 tests, build green, migrate/seed scripts verified against a scratch DB (re-seed no-ops). Two API deltas worth remembering: better-sqlite3 `.changes` → libsql `.rowsAffected` on run results, and libsql transactions are `await db.transaction(async (tx) => …)`.

## 2026-07-12 — JOBDASH-003 §2/§3/§6/§7 (Turso provision + data migration + prod go-live)

13. **A "Ready" Vercel deploy can still be 100% down.** The prior session shipped the libsql code (§1/§4/§5) and deployed, but never ran §2/§3 — no Turso DB, zero env vars — so every `GET /` 500'd while Vercel reported the deployment `● Ready`. Build-green ≠ live. → Delta: provisioned Turso (Vercel Marketplace `tursocloud/database` → `database-cordovan-desert`), set TURSO_* + BASIC_AUTH_* + SYNC_DISABLED=1, FK-topo-ordered data copy (all 7 tables row-count matched), prod-promoted behind ALLOW_PROD=1, curl-verified public 401→200. Rule: a deploy isn't done until the PUBLIC url is hit and returns real content — never trust readyState alone.
14. **`vercel integration add` silently runs `env pull` and clobbers `.env.local`.** Its default post-provision env-pull overwrote the local file and wiped the pinned `LLM_TRANSPORT=claude-cli`, which would have let a future ANTHROPIC_API_KEY flip sync to the billed transport (org has no credits). Behavior was neutral only because the code auto-defaults to claude-cli with no key. → Delta: restored the pin; for future provisions use `vercel integration add … --no-env-pull` (or pull to a scratch path) and diff `.env.local` before/after. Rule: any Vercel command that may `env pull` is a destructive write to `.env.local` — back it up first.

## 2026-07-12 — first post-cloud email sync

15. **A running `next dev` won't repoint the DB after an `.env.local` change — the client is cached on `globalThis`.** After wiring the Mac to Turso, `POST /api/sync` still wrote to the local file: the 2h-old dev server had built its libsql client from the old env and `lib/db/index.ts` caches it on `globalForDb.__scoutDb` (survives HMR + env hot-reload). Detected via last_run_at diverging (local fresh, Turso stale). → Delta: after any DB-env change, fully kill+restart the Mac server (not just save the file); verify the write landed by checking `sync_state.last_run_at` on the INTENDED db. Rule: env hot-reload ≠ singleton refresh — a cached client outlives the reload.

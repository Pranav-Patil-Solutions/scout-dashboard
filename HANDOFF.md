# HANDOFF — Scout Control (JOBDASH-001 + JOBDASH-002)

> Resume file for a fresh Claude Code session. Repo: `~/scout-dashboard`. Dev: `npm run dev` → http://localhost:3312 (port 3312 fixed; 3000 is taken). DB: `scoutdash.db` (SQLite via Drizzle/better-sqlite3, boot-migrate + seed singleton in `lib/db/index.ts`).

## DONE

### JOBDASH-001 — dashboard (Phases 0–5 complete, approved at each gate)
- Aurora Signal design system (dark-committed): bg `#0a0a0f`, card `#14151c`, accent gradient `#7c6bf5→#4e7df0`, Geist. Tokens in `app/globals.css`; categorical chart ramp validated per /dataviz (`--chart-1..5`).
- Pages: `/` Command Center (Action Queue, funnel, weekly velocity, MISSED counter), `/pipeline` Kanban (dnd-kit drag between statuses), `/applications` table + detail drawer, `/analytics` (funnel, response/interview rates, fit-outcome, source/language/role-type performance — funnel + rate bars are plain HTML, NOT Recharts), `/scout` (reads jobscraper `jobs.db` read-only via `JOBSCRAPER_DB_PATH`).
- Core logic: `lib/constants.ts` (STATUS_META, ROLE_BUCKETS — engineer/marketing/procurement matched BEFORE fa/ops for precision; deriveFitBand ≥75/≥50), `lib/action-queue.ts` (kit_ready / overdue / closing / next_send; `snoozedUntil` is separate from `nextActionDue` so kit-ready alerts can't be hidden), `lib/analytics.ts` (`responded()` = human reply only → honest 20% response rate on seed).
- Seed data per ticket §10 loaded.

### JOBDASH-002 — Gmail sync engine (P0–P2 built)
- Schema additions in `lib/db/schema.ts`: `email_events` (NO body column — §8: subject+snippet+classification only), `proposals`, `sync_state`.
- `lib/email/`: `types.ts` (EmailSource seam, RawEmail, Classification), `staging-source.ts` (reads `.gmail-staging/*.json`), `noise.ts` (hard noise-list), `rules.ts` (§5 step 1 — pattern rules fire ONLY for ATS senders; precision guard vs marketing quoting rejection language), `llm.ts` (§5 step 2 — Haiku 4.5 batch of 15 subject+snippet, escalate confidence<0.6 to Sonnet 5 with body, strict `output_config` json_schema, §6 system prompt verbatim), `classify.ts` (hybrid merge: rule category wins, LLM fills entities), `sync.ts` (fetch→persist→advance cursor, body never persisted).
- `app/api/sync/route.ts` (POST /api/sync), `docs/gmail-fetch-spec.md` (the 3 Gmail MCP queries).
- `.gmail-staging/2026-07-11-sweep.json`: 23 REAL emails from Gmail MCP sweep (telli, voize, Reonic, CEF AI, Glacis ×2, Wolt ×2, Overfly outbound + noise). Bodies only on Glacis interview + Wolt rejection.
- `scripts/eval-classifier.ts`: §9 eval — 21 labeled fixtures (TRUTH map), rejection/interview precision, overall accuracy, digest-as-app check, exits 1 on miss. Typechecks clean (`npx tsc --noEmit` = 0).

## IN-FLIGHT

**P2 GREEN + approved (2026-07-11)**: 21/21 eval, 100% everywhere, runs FREE via `claude-cli` transport (`claude -p` on the subscription; `LLM_TRANSPORT` env, auto when no ANTHROPIC_API_KEY, pinned in `.env.local`). Pranav confirmed: NO API key, CLI transport is the permanent path.

**P3 BUILT + verified (2026-07-12)**: `lib/email/match.ts` (fuzzy company+role, thread continuity in sync), `propose.ts` (non-destructive drafts; temporal downgrade guard — historical emails never propose backwards moves; lowConfidence = combined score < 0.6), `apply.ts` (accept/dismiss; accept-time REMATCH prevents duplicate apps from sibling add_application cards; roleTitle backfill), sync.ts P3 stage (processedAt watermark), `GET /api/proposals`, `PATCH /api/proposals/[id]` {action}. Verified live: 23 events → 15 proposals, Wolt + Glacis add-pairs each collapsed to ONE app with activity trail, double-accept 409s. 4 pending cards left as P4 demo data (Hays, Munchies, Mmaah, Reonic-lowConf). Deltas 6–9 in EVOLUTION.md.

**P4 BUILT + verified (2026-07-12)**: `/inbox-sync` page (header w/ last-sync stats, §7 trust strip, proposal cards: type chip + confidence + flag badges + evidence blockquote + source email + Accept/Dismiss via server actions `acceptProposalAction`/`dismissProposalAction` in lib/actions.ts), `components/proposal-review.tsx` (ProposalCard + SyncButton), sync-status strip under Command Center Action Queue, nav "Email Sync" entry with pending-proposals badge (NavCounts.proposals). Verified: Playwright screenshots on-system, real browser click of Sync now → toast, GET /api/proposals 200. 4 real pending cards await Pranav's decision (Hays/XING, Munchies outbound, Mmaah, Reonic low-conf).

## NEXT (in order)
1. **002-P5 + 001-Phase 6 COMBINED FINAL GATE** (user chose one final gate): polish (empty states w/ imagery, motion, keyboard G+P/G+A chords — G E for Email Sync already reserved in nav, board arrows, responsive, a11y) + verification: `npm run build` pass, Playwright smoke screenshots, code-reviewer agent zero blockers, qa-runner zero blockers. Playwright lives in scratchpad, use playwright@1.61.1 (matches cached chromium-1228 — do NOT install 1.50.x).
2. Log deltas in `EVOLUTION.md` per global Evolve rule.

## GOTCHAS

- npm 11 blocks native build scripts: already handled via `allowScripts` in package.json (`npm approve-scripts` + `npm rebuild better-sqlite3` if node_modules is ever wiped).
- Migrations only run at boot (DB singleton survives HMR) — after schema changes, `pkill -f "next dev"` and restart.
- dnd-kit needs stable `id="board-dnd"` on DndContext (SSR hydration).
- shadcn here uses `@base-ui/react` (Nova style), NOT radix. NativeSelect Omit<…,"size"> fix already in.
- Recharts drops zero-value labels — funnel/rate bars are hand-built HTML; don't "fix" them back to Recharts.
- jobscraper repo is READ-ONLY (env `JOBSCRAPER_DB_PATH`); never write to it.
- §8 hard constraint: never persist email bodies; local SQLite only.
- Models: bulk `claude-haiku-4-5`, escalation `claude-sonnet-5` (JOBDASH-002 ticket specifies these — do not swap).
- Zero-arg `new Anthropic()` resolves ANTHROPIC_API_KEY or the `ant auth login` profile.

## FILE MAP

```
app/globals.css                 design tokens (Aurora Signal + chart ramp)
app/page.tsx                    Command Center
app/pipeline/ applications/ analytics/ scout/   the 4 other pages
app/api/sync/route.ts           POST sync endpoint
lib/constants.ts                status/board/source/role-bucket/fit metadata
lib/action-queue.ts             alert engine (4 types + snooze)
lib/analytics.ts                all analytics computation
lib/db/schema.ts                Drizzle schema (001 + 002 tables)
lib/db/index.ts                 singleton + boot migrate + seed
lib/email/{types,staging-source,noise,rules,llm,classify,sync}.ts   002 pipeline
scripts/eval-classifier.ts      §9 eval harness (run: npx tsx scripts/eval-classifier.ts)
.gmail-staging/2026-07-11-sweep.json   real labeled email fixtures
docs/gmail-fetch-spec.md        Gmail MCP fetch queries
```

Original tickets (JOBDASH-001, JOBDASH-002) are in the prior session transcript; the specs' operative constraints are all reflected above.

# HANDOFF — Scout Control (JOBDASH-001 + JOBDASH-002)

> Resume file for a fresh Claude Code session. Repo: `~/scout-dashboard`. Serving (since 2026-07-12, Pranav-approved LAN access): production mode via `npx next start -H 0.0.0.0 -p 3312` → http://localhost:3312 + http://<mac-ip>:3312 on home Wi-Fi (no auth — LAN exposure was an explicit user choice). For code changes use `npm run dev` (localhost) then rebuild + restart prod. Port 3312 fixed; 3000 is taken. DB: `scoutdash.db` (SQLite via Drizzle/better-sqlite3, boot-migrate + seed singleton in `lib/db/index.ts`).

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

**P5 + Phase 6 FINAL GATE PASSED (2026-07-12).** Polish: G-chords (G C/P/A/I/E + nav kbd hints), board arrow moves (hover/focus, aria-labeled), mount motion w/ motion-reduce, mobile verified. Verification: `npm run build` ✓, Playwright smoke (5 pages × desktop+mobile, chord + arrow interaction tests, zero console/network errors) ✓, qa-runner 32/32 (vitest bootstrapped; real DB checksum-verified untouched) ✓, code-reviewer 2 blockers → fixed (`lib/email/privacy.ts` §8 scrub choke point + historical-rejection guard) → re-verified 0 BLOCKERS ✓. Repo is now git (repo-local identity, 3+ commits). Deltas 1–12 in EVOLUTION.md.

**Posting-expiry watchdog SHIPPED (2026-07-13)**: `lib/posting-verdict.ts` (pure per-ATS rules: Ashby og:title, join.com `__NEXT_DATA__` status — its i18n bundle contains tombstone text on EVERY page, never text-match; SmartRecruiters public API 200/404; ambiguous = unknown = no-op) + `lib/posting-check.ts` (auto-move dead postings → expired_missed w/ evidence activity) + `POST /api/check-postings` (works on Vercel too) + piggyback in `/api/sync` + Command Center "Check postings" button. 40/40 tests. Live-verified: dead Tacto Ashby posting (HTTP 200!) auto-moved to Missed; WeFlow/Kadmos live; idempotent. Delta 16.

**JOBDASH-005 kit generator SHIPPED (2026-07-13)**: spec `docs/JOBDASH-005-kit-generator.md`. `lib/llm-cli.ts` (generic `claude -p` runner; email llm.ts refactored onto it), `lib/kit/` (text pure-helpers + JD fetch + playwright-core@1.61.1-EXACT PDF + generate orchestrator w/ truth constraint + one-page condense retry), `POST /api/kit/[id]` (SYNC_DISABLED→501), `GET /api/kit/[id]/[file]` allowlisted, KitGenerator button in detail-page Documents card. Sets resume_variant/cover_path/is_kit_ready + activity. kits/ gitignored. Base resume: KIT_BASE_RESUME env → default Pranav-Resume-2026-07-12.html. Live-verified WeFlow 3m45s, 1-page CV, 46/46 tests. Delta 17.

**JOBDASH-005 v1.1 grader + v1.2 Kit Studio SHIPPED (2026-07-13)**: CV grader (kit_grade/kit_graded_at cols — Turso MIGRATED with Pranav's OK; KitGradeCard on detail page; CV score on kit_ready queue card; feedback loop: prior improvements steer the next generation). Kit Studio at `/studio` (nav + G S): scout-job picker or pasted JD → create/reuse card → generate humanized CV+cover → grade → refine to target (max 2 rounds). Kit CLI calls 480s (email stays 300s); llm-cli unwraps CLI error envelopes (429 session-limit reads human). PENDING: one full-loop live studio run — blocked by subscription session window (resets 16:30 Berlin 2026-07-13); everything below the LLM call verified. Deltas 18–19.

## JOBDASH-005 v1.2.1 SHIPPED (2026-07-14) — keep-best + THE BAR + fetchJson

User ask (DONE): fix Safari "string did not match the expected pattern" on Regenerate + never mark a kit ready below 80.

- `lib/kit/refine.ts` keep-best snapshot/restore (kits/<id>/rounds/round-N) + THE BAR (below-target → isKitReady=false + activity; grade-failed/null NOT demoted); `lib/kit/grade.ts` persistGrade export; `lib/fetch-json.ts` (network + non-JSON → human message).
- `app/api/kit/[id]/route.ts` POST now runs `generateKitToTarget(id, {target: body?.target ?? 80, maxRounds: body?.maxRounds ?? 2})` with tolerant body parse; returns rounds/keptRound/reachedTarget/grade/target. Detail-card Regenerate button now gets keep-best + THE BAR + the below-bar toast; "~2 min" hint → "~2–9 min".
- `fetchJson` wired into kit-card.tsx (+below-bar toast "Graded N/100 — below your 80 bar, kit not marked ready"), kit-grade.tsx, studio-form.tsx. studio route/form already return+show keptRound.
- Gate: tsc 0 · 53/53 tests · `next build` green · prod restarted on 3312 (LAN) · /studio + detail 200. EVOLUTION delta 20. Committed + preview redeployed (`vercel`).
- **Open (needs Pranav):** `git push` (now 9+ commits ahead) so prod/phone at scout-dashboard-nine-ruby get the fix. **Honest gap:** end-to-end keep-best live run blocked AGAIN by the CLI session window (scratchpad studio-run5.json = `session limit · resets 10:30pm Berlin`, zero rounds) — logic is code-complete + gate-green but the 2-round regression not re-observed live; run one Kit Studio build after 22:30 Berlin to confirm restore + below-bar demote.
- **NOT wired (deliberate, out of ticket scope):** `components/proposal-review.tsx` + `components/check-postings-button.tsx` still use raw `res.json()` — same Safari exposure on the sync/postings paths; fold into a future pass if it recurs there.

## NEXT — JOBDASH-004: Apply-Click Lifecycle & Auto-Reconcile (P0 CONFIRMED 2026-07-13, start here after /clear)

**Spec = source of truth: `docs/JOBDASH-004-apply-lifecycle.md`** — full config, 10-transition
table, integration seams, gated P1–P5 plan. Renumbered from the ticket's "003" (taken by the
shipped migration below; revert if Pranav prefers).

**Goal**: see jobs → click APPLY (tracked) → Gmail confirms whether it actually applied → if not,
escalating reminders push it forward → if the posting expires/goes stale unapplied, archive then
(after 30d grace) delete. One idempotent **Mac-only** `reconcile()` is the heartbeat.

**P0 decisions locked (in the spec):**
1. **UNIFY status model** — retire `expired_missed`; closed-unapplied path = `expired → archived`;
   `expiry_reason` (`missed_kit`) drives the analytics "missed" count. Migrate consumers:
   `posting-check.ts`, `constants.ts`, `analytics.ts`, Moss seed row.
2. **apply_clicked = pulsing badge** in the To-apply column, NOT a 6th board column.
3. **reconcile Mac-only** — `POST /api/reconcile` + "Reconcile now" button + optional local `/loop`; no cron v1.
4. Build in a fresh session from this HANDOFF + the spec doc.

**Big reuse note (HANDOFF delta 16):** §5 liveness/expiry is ALREADY BUILT and smarter than the
ticket's naive scan — `lib/posting-verdict.ts` (per-ATS: Ashby dead-at-HTTP-200, join `__NEXT_DATA__`,
SmartRecruiters API) + `lib/posting-check.ts` + `/api/check-postings`. JOBDASH-004 §5 = retarget its
verdict to `expired→archived`+`expiry_reason` and call it from reconcile; do NOT reinvent.

**Refinements folded in (ticket-vs-code diff):** A patch `propose.ts` STATUS_RANK(apply_clicked=1.5)+CLOSED ·
B confirmation auto-apply (T2) only for `apply_clicked` apps, else keep the proposal queue ·
C add nullable `close_date` col · D `REMINDER_STEPS_H=[24,72,144]` + T3 guard `count<len` ·
E expiry prefers `close_date`/`next_action_due` over pure age · F moot (see reuse note).

New `applications` columns for P1: clicked_at, confirm_deadline_at, lapsed_at, expired_at,
archived_at, reminder_count, reminder_last_at, expiry_reason, close_date.

---

### JOBDASH-003 — Vercel/Turso migration: COMPLETED 2026-07-12 (deltas 13–15; live at scout-dashboard-nine-ruby.vercel.app). Original ticket kept below for reference.

**Goal**: dashboard usable on Pranav's phone anywhere (Mac asleep OK) at a Vercel URL behind a password. Email sync STAYS on the Mac at $0 (claude-cli transport), writing to the cloud DB.

```
TICKET JOBDASH-003 — cloud DB + auth gate + Vercel deploy
§1 DB driver swap: better-sqlite3 → @libsql/client via drizzle-orm/libsql (schema UNCHANGED —
    Turso is SQLite). ALL call sites become async: lib/db/index.ts (drop boot-migrate+seed
    singleton → plain client; migrations move to `npm run db:migrate` script), lib/queries.ts,
    lib/actions.ts, lib/email/{apply,sync}.ts, lib/import.ts, lib/db/seed.ts (manual script,
    NEVER auto-runs in cloud), every page component gains async/await. db.transaction(sync fn)
    → libsql batch/transaction API. Local dev uses SAME driver with DATABASE_URL=file:scoutdash.db.
§2 Provision: Turso via Vercel Marketplace (`vercel integration` flow; project not yet linked —
    `vercel link` first). Fallback if marketplace flow needs interactive browser: have Pranav run
    `! brew install tursodatabase/tap/turso && turso auth signup`. Env: TURSO_DATABASE_URL +
    TURSO_AUTH_TOKEN (Vercel) / DATABASE_URL=file: (local default when unset).
§3 Data migration: sqlite3 scoutdash.db .dump → replay to Turso (script, verify row counts match
    per table). BACK UP scoutdash.db first. After migration, Mac local env points at Turso so
    sync + phone see one DB; keep file: fallback documented.
§4 Auth gate: middleware Basic-auth (BASIC_AUTH_USER/BASIC_AUTH_PASS envs). Active ONLY when
    envs set → local stays open. Check Next 16 middleware vs proxy.ts naming in
    node_modules/next/dist/docs FIRST (AGENTS.md rule).
§5 Serverless guards: /api/sync returns 501 + friendly message when SYNC_DISABLED=1 (set on
    Vercel — claude CLI doesn't exist there; SyncButton shows "run sync from the Mac" hint).
    Scout import (lib/import.ts, jobscraper local file) gracefully disabled when
    JOBSCRAPER_DB_PATH unset. better-sqlite3 dependency REMOVED (breaks Vercel native build).
§6 Verify gate (same bar as P5): npx tsc 0 · npm test 32/32 (fixtures don't touch DB — should
    survive) · npm run build · local Playwright smoke vs file: DB · deploy PREVIEW via `vercel`
    (guard.sh allows preview; prod needs Pranav's explicit OK + ALLOW_PROD=1) · smoke the preview
    URL incl. Basic-auth challenge + a real accept/dismiss round-trip against Turso.
§7 Ship: give Pranav the preview URL + credentials; prod promote only on his OK. Update
    HANDOFF/EVOLUTION, commit, push to GitHub (origin exists).
GUARDS: never run destructive SQL against Turso without a fresh scoutdash.db backup; sync
    remains Mac-only; §8 privacy scrub unchanged (bodies never reach ANY database, cloud included).
```

## Open items (non-blocking)

- Ship-gate nits accepted as known: match.ts short-name containment (≥3 chars) can over-match; `claude -p` SIGKILL doesn't reap grandchildren; concurrent double-sync isn't locked.
- Future: Gmail API source (replace .gmail-staging manual sweeps).

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

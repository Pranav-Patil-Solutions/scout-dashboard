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

## DISCOVER redesign SHIPPED (2026-07-15) — job-search surface reimagined as a premium apply portal

Pranav asked to "actually apply for jobs in an easy way" and to redesign the job-search segment
against real job boards. `/triage` ("Scout Inbox") is now **Discover** ("Find your next role") — a
LinkedIn/Otta-style **split master-detail**: fit-ranked list (score chip + company/role + source +
language dot) on the left, rich detail on the right (conic score ring, Strong/Stretch pill, "Why you
match" accent panel from `reason`, 2×2 fact grid). Design decisions were user-chosen via a
question with layout previews: **split master-detail** + **Apply = open posting + auto-track**.

- **One-click apply**: `applyToScoutJob(scoutJobId)` in `lib/actions.ts` — opens the posting AND
  creates a tracked `to_apply` application by delegating to `createApplication` (reuses promotion +
  activity trail + scout-job linkage; idempotent `reused` path when already on the board). This is
  the JOBDASH-004 apply-click seam, landed early.
- **Files**: `components/job-board.tsx` (new, replaces deleted `components/triage.tsx`),
  `app/triage/page.tsx` (rewritten header + JobBoard), `components/app-shell.tsx` (nav "Scout Inbox"
  → "Discover", icon `Inbox`→`Compass`; href/chord `G I`/badge unchanged). Tabs relabelled
  new→**Open roles** · promoted→**Applied** · dismissed→**Passed**. Client filters: search + fit
  pills (All/Strong/Stretch+) + English-first toggle. Keyboard: j/k move · a/Enter apply · x pass.
- **Gotcha fixed (EVOLUTION delta 21)**: side detail panel must be `max-h`+inner-scroll, never fixed
  `h-[100dvh-…]`, or the Apply CTA drops below the fold. Verified desktop/mobile/empty via Playwright.
- **Data note**: Turso (the live DB) currently has 0 `new` scout_jobs (all promoted) → Discover "Open
  roles" reads empty until an `Import from scout` (Mac-only, needs `JOBSCRAPER_DB_PATH`). The local
  `scoutdash.db` has 6 `new` rows and was used for screenshot verification.
- Gate: tsc 0 · 53/53 tests · `next build` green · 3312 prod restarted. Committed 2026-07-16 together
  with JOBDASH-006 §1+§2 (left uncommitted here — see EVOLUTION delta 22).

## JOBDASH-006 §1+§2 SHIPPED (2026-07-16) — landing = apply queue, JD in the detail pane

Operative ticket = **"Closed-Loop Apply Engine"** (land → apply → outcome → recommend), given in-session
2026-07-16. ⚠️ Numbering collision: the untracked draft `docs/JOBDASH-006-hybrid-worker.md` (Mac-worker
job queue) predates it and now effectively becomes JOBDASH-007 — renumber when it's picked up.

- **§1 landing**: `/` server-redirects (307) to `/triage` (`app/page.tsx`); Command Center moved intact
  to `app/command/page.tsx`; nav + `G C` chord → `/command` (app-shell.tsx). proxy.ts untouched.
- **§2 schema**: `scout_jobs.jd_text` TEXT null + `jd_fetched_at` ts — `drizzle/0004_jd-cache.sql`,
  applied to BOTH Turso and the local file DB. Fresh restore-verified Turso backup taken first via new
  `scripts/backup-turso.ts` (no turso CLI on this Mac; dump is `scoutdash.db.turso-dump-*.sql`, gitignored).
- **§2 route**: `POST /api/scout-jd/[id]` — cached jd_text short-circuits; else `fetchJobDescription(url)`
  → cache → `{ok,text,cached}`. 404 (row gone) / 422 (no url) / 502 (unfetchable posting) all return human
  messages. Pure fetch — runs on Vercel, deliberately NOT behind SYNC_DISABLED.
- **§2 UI**: `JdPanel` in job-board.tsx JobDetail (all tabs), under "Why you match": cached text → pre-wrap
  panel with own `max-h-[38dvh]` scroll + "fetched Xh ago" stamp; else "Load description" (fetchJson +
  useTransition + skeleton). "Copy" → clipboard + "JD copied" toast (clipboard failure → human message).
  Plain "Open posting" anchor added beside the gradient Apply CTA (new tab only).
- **§2 kit seam**: `applyToScoutJob` now writes `jdUrl` on the created application → `lib/kit/generate.ts::
  resolveJd` picks the posting up with zero kit-side changes.
- **htmlToText upgrade** (shared with the kit pipeline): decodes numeric (`&#252;`/`&#x2013;`) + common
  named entities (umlauts, ß, dashes, quotes, €…); unknown entities pass through; out-of-range numerics
  can't throw. Golden fixtures in `lib/kit/__tests__/jd-golden.test.ts` (greenhouse-style page, German
  posting, br/table handling, 12k clamp).
- **Known behavior**: a dead-but-HTTP-200 Ashby posting would cache its tombstone text as the JD (jd fetch
  doesn't consult posting-verdict). Acceptable v1 — the text honestly says the job is gone; wire
  `posting-verdict` into the route if it annoys.
- Gate: tsc 0 · 59/59 vitest · `next build` green · Playwright smoke 28/28 desktop+mobile with 0 console/
  network errors (ERR_ABORTED prefetch aborts filtered — delta 22) incl. full JD loop against a local
  fixture posting (load → entities decoded → copy → clipboard verified → cache hit on revisit, DB row
  stamped) · route 404/422/502 curl-verified · code-reviewer 0 BLOCKERS (2 of 3 nits fixed same-session:
  http(s)-only scheme guard in fetchJobDescription + Uint8Array blobs in backup-turso; 3rd accepted, see
  Open items) · qa-runner 0 fails, 64/64 after its 4 entity tests + the scheme-guard test. Post-gate
  follow-up commit: reviewer's atomic-claim fix for the apply double-click race, live-verified via
  Playwright apply-click on a seeded row (1 application, scout row promoted+linked, reuse view OK).

## JOBDASH-006 §3 SHIPPED (2026-07-16) — Gmail outcome → visible status chips

§1+§2 demo OK'd by Pranav same day; §3 built as its own gated commit.

- **Data**: `getScoutJobs` now left-joins `applications` on `promoted_application_id` → every tab row
  carries `appStatus` (null when unlinked; one query shape for all tabs, type `ScoutJobWithOutcome`).
- **Discover**: `StatusBadge` (existing chips.tsx component — pure reuse) renders on Applied-tab list
  rows (meta line, right-aligned) + the detail "on your board" notice. Rejected/Interview/Screening/
  To-apply etc. all read at a glance from the queue.
- **Timeline**: status_change entries on `/a/[id]` get a compact StatusBadge, derived by EXACT match
  of the title shapes our own writers produce — manual ("Moved to X" / "Added to pipeline — X"),
  email sync ("from → to (email sync)", the §3 case that matters), and posting-check's expiry line —
  free-text notes can't false-positive.
- **Loop confirmed**: `scripts/eval-classifier.ts` re-run live — rejection precision 100%, interview
  100%, digest-as-app zero (16 rule-resolved, 3 LLM calls via claude-cli).
- **OPTIONAL gmail-mcp-source NOT built (deliberate)**: the claude.ai Gmail MCP connector is only
  callable from a Claude session, not from the Next runtime — a runtime `EmailSource` on it is
  architecturally impossible; the real replacement for .gmail-staging sweeps is either in-session MCP
  sweeps writing to staging (today's documented flow) or Gmail API creds (future). ENABLE_GMAIL_MCP
  therefore doesn't exist.
- Gate: tsc 0 · 64/64 vitest · build green · Playwright §3 smoke 6/6 desktop+mobile 0 console/HTTP
  errors (seeded rejected app + promoted scout row, chips verified in list/detail/timeline, seeds
  removed) · classifier eval PASS · code-reviewer/qa-runner results in the §3 commit message.

## JOBDASH-006 §4 SHIPPED (2026-07-16) — rejection analysis, "Why roles close"

- `lib/analysis/rejections.ts` (pure, vitest-covered): ONE aggregator looped over four dimension
  descriptors (roleBucket × source × german_req × fit_band) per §6 — population = apps with
  appliedAt OR closed-rejected (historical email-sync rejections count), per-segment rejected/rate,
  sorted worst-first; deterministic `summary` lines (segments under MIN_SUMMARY_POPULATION=2 stay in
  the table, out of the summary); **`highRejectRoleBuckets(analysis, {minPopulation:3, minRate:0.75})`
  is the §5 feedback seam** — role buckets the recommender must exclude.
- `POST /api/rejection-narrative`: SYNC_DISABLED→501 first; else re-computes the table from the DB and
  has claude-haiku-4-5 narrate ONLY the handed numbers (system prompt forbids computing/estimating;
  small-sample honesty rule). 422 when zero rejections.
- `components/charts/rejection-card.tsx` on /analytics (full-width, after Language outcomes):
  summary lines + 4 segment groups with plain-HTML rate bars (NOT Recharts, per repo rule) +
  "Narrate" button via fetchJson.
- **Anti-fabrication gate (reviewer blocker, fixed):** `verifyNarration` (pure, tested) extracts every
  numeral from the LLM reply and 502s the narration if any is not in `allowedNarrationNumbers(analysis)`
  (counts + whole-percent forms) — a hallucinated figure can never render; the deterministic table
  always does. Payload rows carry pre-formatted `pct` strings so the model needs zero arithmetic.
- Gate: tsc 0 · 76/76 vitest (§4 aggregator + verifier tests; qa-runner added tie-sort + drifted-
  germanReq cases) · build green · Playwright smoke 8/8 desktop+mobile 0 console/HTTP errors — the
  rendered "5 of 12 (42%)" line matches direct DB counts · live narration verified TWICE on the Mac,
  second run through the verifier (all numerals table-traced) · code-reviewer 1 blocker → fixed as
  above, re-tested · qa-runner 0 fails.

## JOBDASH-006 §5 SHIPPED (2026-07-16) — market recommend, "More like your pipeline"

CLOSES THE TICKET: land → apply → outcome → recommend all live.

- `lib/reco/profile.ts` (pure): `buildAffinityProfile(apps)` counts ACTIVE_STATUSES apps → bucket
  shares (desc), recurring title keywords (tokenized, gender-markers/stopwords stripped, ≥2×, top 12),
  german/source distributions, medianFit. `titleTokens` exported/shared with scoring.
- `lib/reco/score.ts` (pure, ONE fn per §6): `scoreScoutJob(job, profile, excludeBuckets)` → 0..100:
  bucket 40 (normalized to the profile's top lane) + keywords 25 (≤3 matches) + language 20
  (none 20 / bonus 18 / unknown 10 / de_en 6 / native 0) + fit 15 (falls back to medianFit). §4's
  `highRejectRoleBuckets` → `excluded: true` + "Paused — … keeps ending in rejection" why-line;
  excluded rows RANK LAST, never hidden.
- Discover wiring (`app/triage/page.tsx`): Open-roles tab only, and only when profile sample ≥3 —
  jobs sorted excluded-last → reco desc → fit desc; header copy switches; JobBoard gets `reco` map;
  detail shows "score · why" line (amber Paused variant), list gets a "More like your pipeline" strip.
- `lib/constants.ts`: SEARCH_SOURCES (8 global-remote + 4 Berlin-local boards), SEARCH_QUERIES
  (12 AI×Ops + generalist titles), SCOUT_SCORING_PROMPT (G1 English / G2 startup / G3 reachable
  gates + rubric, emits scout_jobs-shaped JSON) — canonical scraper config per job-search targeting;
  importScoutJobs untouched (scraper repo stays read-only; scheduled scrape out of scope).
- Gate: tsc 0 · 86/86 vitest (10 golden reco tests) · build green · Playwright smoke 8/8
  desktop+mobile 0 console/HTTP errors, live why-line "80 · Matches your FA / CoS lane · shares
  “associate” · English-first · fit 79" · reviewers: see commit message.

## NEXT — JOBDASH-006 complete; open follow-ups

- `git push` (Pranav's call — main is 13+ commits ahead; push = prod deploy on Vercel).
- Point the jobscraper at constants.ts SEARCH_SOURCES/SEARCH_QUERIES/SCOUT_SCORING_PROMPT, then
  `Import from scout` — Turso currently has 0 `new` rows, so Discover's ranked queue is empty until
  a real import lands.
- Parked: JOBDASH-004 lifecycle/reconcile (spec `docs/JOBDASH-004-apply-lifecycle.md`), the
  hybrid Mac-worker queue draft (`docs/JOBDASH-006-hybrid-worker.md` — renumber to 007).

## PARKED — JOBDASH-004: Apply-Click Lifecycle & Auto-Reconcile (P0 CONFIRMED 2026-07-13)

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

- Ship-gate nits accepted as known: match.ts short-name containment (≥3 chars) can over-match; `claude -p` SIGKILL doesn't reap grandchildren; concurrent double-sync isn't locked. (The `applyToScoutJob` double-insert race was FIXED post-gate by the reviewer: atomic claim `UPDATE … WHERE status != 'promoted'`; loser re-reads and reuses the winner's application. Known edge: if `createApplication` throws after a successful claim, the scout row is left `promoted` with no linked application — recover by setting its status back to `new` in the DB.)
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
app/page.tsx                    redirect → /triage (JOBDASH-006 §1)
app/command/page.tsx            Command Center (nav · G C)
app/triage/page.tsx             Discover (landing surface) + components/job-board.tsx
app/pipeline/ analytics/ inbox-sync/ studio/   the other pages
app/api/sync/route.ts           POST sync endpoint
app/api/scout-jd/[id]/route.ts  POST JD fetch+cache (jd_text/jd_fetched_at)
scripts/backup-turso.ts         remote DB dump → replayable .sql (run before Turso migrations)
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

---

# ✅ DONE — JOBDASH-009 (shipped 2026-07-23)

Built and verified live. Dashboard commit `f87eade`, scraper commits `d3f2ad3`
(emailed_at + mark) and `583e565` (launchd daily automation). Turso migration
0005 applied. Live proof: To apply went 0 → 4 as strong-fit digest jobs
auto-added. Scheduler: `~/Library/LaunchAgents/com.pranav.jobscout-daily.plist`
(08:00 Berlin) → `daily-run.sh` (scrape → POST /api/import → auto-add).

Still open (NOT blockers, deliberately deferred):
- **Email not sending** — SMTP creds are commented out in the scraper `.env`;
  board sync is decoupled and works without it. Uncomment SMTP_USER/SMTP_PASS to
  enable (see scraper README). This was a deliberate design call over a
  code-review objection — EVOLUTION delta 33.
- **The expiry watchdog still probes `to_apply` cards** (posting-check.ts:100).
  The 4 current cards have LinkedIn/Indeed URLs that resolve to unknown/live (not
  swept), but a future auto-added card with a 404 URL could vanish. A grace
  period for freshly-created cards would harden this.
- **G2 enterprise list is incomplete** — "Senior AI Leader @ AbbVie" (a pharma
  giant) scored 76 and auto-added; AbbVie isn't in gates.py's enterprise set.
  Relevancy tuning, not an automation bug.
- **Import into remote Turso is slow (~6 min, per-row round-trips)** — fine for a
  daily background job (curl -m 600), but batching upserts would help.

--- historical spec below (kept for context) ---

# NEXT — JOBDASH-009: sync daily-emailed jobs into "To apply"

> Written 2026-07-22 at a context handoff. Everything in "Context" below is DONE and
> committed; only "Build" remains. Start a fresh session and read this section first.

## Context — what just shipped (do not redo)

Relevancy was rebuilt across both repos and committed:
- `~/scout-dashboard` — commit `53f228c` on branch **`feat/jobdash-008-relevancy-gates`**
  (branched off `main`; NOT pushed, no PR yet).
- `~/Downloads/pranav-essentials/D--vyaparwerk/jobscraper` — commit `aaee227`.
  **This repo had no git until now**; it was `git init`-ed. No remote. `.env` is
  correctly gitignored (real Gmail app password lives there).

The scraper is now three stages: `gates.py` (G0 real posting / G1 English-first /
G2 startup / G3 reachable — a failure caps the score at 25 and names the gate in
`reason`), `scoring.py` (keyword recall), `llm_rank.py` (`claude -p` precision,
degrades to keyword score on any failure). `rescore_db.py` re-scores the stored
corpus — **run it after any scoring change**, or `jobs.db` drifts into a mix of
old and new scores. `jobs.db` now persists the JD (`description` column).
Tests: `pytest test_relevancy.py` 77/77; dashboard `npx vitest run` 106/106; tsc 0.

## Decisions already made by Pranav (2026-07-22) — do not re-ask

1. **Only strong fits auto-add.** Score **≥ 75** goes into `to_apply`. Everything
   else stays in Discover for manual triage. Rationale: the daily email now carries
   11–15 jobs; auto-adding all of them is ~90 cards/week and makes the board
   meaningless.
2. **The daily run moves to the Mac** (launchd/cron), not GitHub Actions. Actions
   has no `claude` CLI, so it would silently skip the LLM ranking stage every day.

## Build

### A. Scraper — make "emailed" explicit
`seen_jobs` is currently the de-facto emailed log (`mark_seen` is called only for
the emailed top-N, and only on a real send — never on `--dry-run`). That is
implicit and its name says "dedupe". Add an explicit column instead:
- `models.py init_db()`: additive migration `ALTER TABLE jobs ADD COLUMN emailed_at TEXT`
  (follow the existing `PRAGMA table_info` pattern used for `description`).
- `models.py`: `mark_emailed(job)` setting `emailed_at` to UTC ISO now.
- `main.py`: call it for each job in `top` in the real-send branch ONLY. `--dry-run`
  must never mark (that would silently promote jobs during testing).

### B. Dashboard — import + auto-promote
- `lib/db/schema.ts`: add `emailedAt` (integer timestamp) to `scoutJobs`.
  Then `npm run db:generate` and `npm run db:migrate`.
- `lib/import.ts` `importScoutJobs()`: read `emailed_at` from the scraper DB
  (guard with `PRAGMA table_info` — the column may not exist yet on an old DB,
  the existing code is already defensive this way) and persist it.
- New `lib/scout-autosync.ts`: for every scout job with `emailedAt != null`,
  `status === "new"`, and `score >= 75`, call the EXISTING
  `applyToScoutJob(id)` from `lib/actions.ts`. **Reuse it — do not write a second
  promote path.** It already claims the row atomically (`ne(status,"promoted")`),
  is idempotent on double-apply, creates the application with `status: "to_apply"`,
  and logs an activity. Bulk version should collect results and return
  `{ promoted, skipped, reused }` for the toast.
- Call the autosync right after a successful import (same place the import toast
  is raised), and log one activity line per promoted card so the board shows
  provenance ("Auto-added from the daily scout email").
- Use `GATE_FAIL_CAP` / `gateFailure()` from `lib/constants.ts` as a belt-and-braces
  guard: never auto-promote a row whose `reason` carries a "⛔ Gn" marker, even if
  a stale score somehow reads ≥ 75.

### C. Daily run on the Mac
- launchd plist (or `cron`) running `main.py` daily ~08:00 Berlin from the venv at
  `.venv`, logging to `~/Library/Logs/jobscraper-daily.log`.
- Must `cd` to the repo (relative `DB_PATH = "jobs.db"`) and load `.env`.
- Disable/remove `.github/workflows/daily.yml` so the two do not double-send.

### D. Gate before calling it done
`pytest test_relevancy.py`, `npx vitest run`, `npx tsc --noEmit`, then
`python main.py --dry-run` and confirm **no** row gained `emailed_at`.
Ship gate per the standing rule: `code-reviewer` then `qa-runner`, zero blockers.
Then rebuild + detached restart of 3312 (EVOLUTION delta 28 — a committed fix the
running server does not serve is not shipped).

## Known-open, unrelated to this ticket
- Discover still serves the **old 198 prod rows**; re-import after a scrape.
- German ads with no stored JD still rank (`everphone "AI Operations Lead (w/m/d)"`
  84.2, S-Markt, IW Medien). They gate automatically once re-scraped with a JD.
  `GERMAN_MARKER_STRICT = False` in `config.py` is the deliberate switch — turning
  it on gated lemon.markets' real English Berlin role, see EVOLUTION delta 32.
- `ECCO Select, "Kansas City Metropolitan Area"` slips G3: LinkedIn's
  "X Metropolitan Area" format carries no state code to match.
- Neither repo is pushed. scout-dashboard has an origin; jobscraper has no remote.

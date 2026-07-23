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

## 2026-07-13 — posting-expiry watchdog (auto-move dead postings to Missed)

16. **Two ATS calibration traps that break naive expiry detection.** (a) Ashby serves dead postings with HTTP 200 — status-code probing says "live" on a page literally titled "Job not found"; the reliable structural signal is that live postings server-render an `og:title` meta and dead shells don't. (b) join.com ships "This job is no longer available" inside its i18n translation bundle on EVERY page, live or dead — a bare text-marker check would have auto-killed the live WeFlow card; the job's true state is `"status":"ONLINE"` inside `__NEXT_DATA__`. → Delta: `lib/posting-verdict.ts` (pure, unit-tested per-ATS structural rules; ambiguous = `unknown` = never acted on) + `lib/posting-check.ts` (probe → auto-move to expired_missed with evidence on the timeline) + `/api/check-postings` + Command Center button, piggybacked on `/api/sync`. Rule: never infer posting death from status codes or visible strings alone — verify against a structural signal calibrated per ATS, and default to no-op when ambiguous.

## 2026-07-13 — JOBDASH-005 kit generator (tailored CV + cover letter in-app)

17. **Two build-time traps, one pattern.** (a) `import "server-only"` poisons vitest imports — any module with unit-testable logic must keep that logic in a pure sibling module (posting-verdict.ts, kit/text.ts) and let the IO module import it; this is now the house pattern. (b) tsconfig targets pre-es2018, so regex `/s` (dotAll) fails tsc — use `[\s\S]` instead. → Shipped: lib/llm-cli.ts (generic `claude -p` runner extracted from email/llm.ts — email pipeline refactored onto it, 46/46 green), lib/kit/{text,jd,pdf,generate}.ts (JD fetched from the live posting, truth-constrained Sonnet 5 tailoring, playwright-core@1.61.1 EXACT + cached chromium_headless_shell-1228 for A4 PDFs, pdf-lib one-page guard with one condense retry), POST /api/kit/[id] + allowlisted GET download route, KitGenerator on the detail page. Live-verified on WeFlow: 3m45s, 1-page CV, grounded cover letter, DB row + activity updated, kit_ready armed.

## 2026-07-13 — JOBDASH-005 v1.1 CV grader

18. **Schema changes now have a two-DB sequencing rule.** The grader added `kit_grade`/`kit_graded_at`; the auto-mode classifier (correctly) blocked migrating the live Turso DB without explicit approval, so the build was verified end-to-end against the local file DB instead (same WeFlow row id — data was file→Turso copied, ids align). Rule: for prod schema changes, ship code + migration together but MIGRATE TURSO BEFORE RESTARTING the Mac server or pushing (a build whose drizzle schema selects a column the DB lacks 500s on every applications query). Also: adding schema columns breaks test factories typed as full rows (lib/email/__tests__/fixtures.ts) — update makeApp() in the same commit. Grader live-verified: WeFlow scored 30/100 with truth-preserving improvements; feedback loop feeds them into the next generation.

## 2026-07-13 — JOBDASH-005 v1.2 Kit Studio

19. **Two live-run traps in the studio loop.** (a) `claude -p` full-document generation regularly outruns the email pipeline's 300s timeout on real JDs — kit calls now pass timeoutMs 480s explicitly (the default stays 300s for classification). Rule: timeouts are per-workload, not per-transport. (b) The subscription itself is a shared resource: heavy kit generation burned the 5h session window mid-verification and the CLI returned a 429 envelope ("session limit · resets 4:30pm") — llm-cli now unwraps the envelope so the UI shows the human message instead of raw JSON. Also fixed: studio manual path is idempotent (reuses an open same-company+role card after a failed attempt) and scout path pre-resolves the JD BEFORE creating a card (seed scout URLs are fictional — a dead URL must not pollute the board). Full refine loop live-verified after the window reset: Tacto Strategy & Ops, 2 rounds (42 → 40), honest below-target verdict persisted to the card — round 2 scoring slightly lower confirms keep-best-round as a known future improvement.

## 2026-07-16 — JOBDASH-006 §1+§2 (landing = apply queue + JD in detail)

22. **An uncommitted gate is a debt the next session pays.** The Discover redesign passed its gate on 2026-07-15 but was left uncommitted; JOBDASH-006 §1+§2 then had to edit the same files (job-board.tsx, app-shell.tsx, actions.ts, triage/page.tsx), so the two shipped units are no longer separable into clean, bisectable commits — they land as one. Rule: a phase gate is not closed until its commit exists; commit before the session ends, even when the push waits for Pranav. Also hit: (a) **ticket-number collision** — an untracked draft `docs/JOBDASH-006-hybrid-worker.md` already claimed "JOBDASH-006" before this session's closed-loop apply-engine ticket reused the number; the hybrid-worker draft is now implicitly JOBDASH-007 — always grep docs/ for the ticket number before speccing. (b) **Playwright `requestfailed` fires for `net::ERR_ABORTED`**, which App-Router prefetches produce on every navigation — a "0 network errors" smoke bar must filter aborted requests (cancelled ≠ failed) or it drowns in 200+ false positives. (c) **No turso CLI on this Mac** — remote backup now has a permanent path: `scripts/backup-turso.ts` dumps schema+rows to a replayable `.sql` (named `scoutdash.db.turso-dump-*` so the existing gitignore glob covers it); the dump was restore-verified into a scratch sqlite before migrating. Shipped: root → `/triage` redirect (Command Center moved to `/command`, nav + G-C chord retargeted), `scout_jobs.jd_text/jd_fetched_at` (migration 0004 on Turso + local), `POST /api/scout-jd/[id]` (pure fetch → htmlToText → cache; 404/422/502 all human-messaged; NOT SYNC_DISABLED-guarded, works on Vercel), JdPanel in the Discover detail (load-on-click skeleton, pre-wrap scroll panel, Copy→clipboard toast, fetched-at stamp, "Open posting" anchor beside Apply), `applyToScoutJob` now stamps `jd_url` so kit generation reuses the posting, and htmlToText decodes numeric + common named entities (German postings: ü/ä/ö/ß/– render true in the panel, the clipboard, and kit JDs).

## 2026-07-16 — JOBDASH-006 §3 (outcome chips)

23. **A ticket can spec the architecturally impossible — say so instead of faking it.** §3's optional
"live gmail-mcp-source implementing EmailSource using the authorized Gmail MCP connector" cannot exist:
claude.ai MCP connectors are callable only from a Claude session, never from the Next.js runtime, so an
ENABLE_GMAIL_MCP runtime source would have nothing to call. Logged the impossibility in HANDOFF and
skipped it rather than building a stub that pretends. Rule: when a spec names an integration, verify the
call is possible from the runtime that would make it BEFORE building the seam. Otherwise §3 was pure
reuse (StatusBadge + one left join + exact-title chip derivation on the timeline) — no new failures; the
smoke-locator lesson (a mounted-but-CSS-hidden duplicate detail pane needs `.filter({visible:true})`,
positional `.first()/.last()` both break across viewports) is folded here for the next Playwright pass.

## 2026-07-16 — JOBDASH-006 §5 (market recommend — ticket complete)

25. **No new failures; one reusable lesson re-confirmed and one made explicit.** (a) The §3 smoke
lesson (delta 23: mounted-but-hidden duplicate detail panes break positional locators) bit AGAIN in
the §5 smoke script — a stray overlay-opening pre-click made row clicks land under the mobile overlay;
the fix was removing the speculative click, but the durable rule is: in this app's tests, NEVER click
"the first matching button" — click the specific row, then assert with `.filter({ visible: true })`.
(b) Made the §4→§5 feedback contract explicit in code: excluded lanes are ranked LAST with an amber
"Paused" why-line instead of being filtered out — silent exclusion would read as "the scout found
nothing", which is the same honesty failure as silent truncation. Feature-complete ticket: landing →
JD → apply → Gmail outcome → rejection analysis → recommendation, every phase gated.

## 2026-07-16 — JOBDASH-006 §4 (rejection analysis)

24. **No failures this loop** — §4 was pure reuse of established patterns (pure-sibling module per
delta 17, plain-HTML bars per the Recharts rule, SYNC_DISABLED guard shape, fetchJson client path,
one aggregator looped over dimension descriptors per §6) and every gate passed first run. One
deliberate design note worth keeping: the narration LLM gets the table as JSON with a
numbers-verbatim-only system prompt, and the deterministic summary renders REGARDLESS of narration —
so a hallucinated number could only ever appear next to the true table, never instead of it.

## 2026-07-14 — JOBDASH-005 v1.2.1 (keep-best + THE BAR + fetchJson)

## 2026-07-15 — Discover redesign (job-search surface → premium split master-detail + one-click apply)

21. **A detail pane sized to `h-[calc(100dvh-…)]` puts its primary CTA below the fold whenever it sits under a page header.** The redesigned `/triage` (renamed **Discover**) right pane was forced full-viewport-height with the Apply footer pinned to the bottom via `flex-col` — but the split starts ~230px down the page (title + tabs), so a full-height card overflows and the Apply button lands off-screen on first paint. Playwright verification caught it (empty space under the fact grid, no CTA). → Delta: detail card is now `max-h-[calc(100dvh-104px)]` with `flex-col` + an internal `overflow-y-auto` middle, so it sizes to CONTENT (footer sits directly under the last block) and only scrolls when the content genuinely exceeds the viewport — the LinkedIn/Otta behavior. Rule: a sticky/side detail panel under a header must be content-height with `max-h` + inner scroll, never a fixed `h-[100dvh-…]` — otherwise the action footer falls below the fold at the exact moment the user wants it. Verified across desktop (open + applied tabs), mobile overlay, and empty states. **Reuse win:** one-click Apply routes through the existing `createApplication` (new `applyToScoutJob` action) so promotion, activity trail, scout-job linkage, and idempotent re-apply all come for free — no parallel insert path. Gate: tsc 0, 53/53 tests, `next build` green, prod restarted on 3312 (LAN).

20. **A regenerate loop that trusts the last round can ship a worse kit than one it already made.** Delta 19's live run scored 42 → 40 — the grader is noisy, so "generate again to improve" is not monotonic and the naive loop presented the lower-scoring round 2. → Delta: `lib/kit/refine.ts` keep-best — every round is snapshotted to `kits/<id>/rounds/round-N/`, and at loop end the top-scoring round's files + grade are restored + re-persisted as THE kit (ties → later round, which absorbed more feedback). Rule: when a scored generate loop can regress, snapshot every attempt and pick the max at the end — never assume the last iteration is the best. **THE BAR:** `generateKit` unconditionally arms `is_kit_ready` each round, so a below-target kept-best would still read "ready" — refine now flips `is_kit_ready` back OFF (+ timeline note) when the best kept round misses target, but a grade-FAILED kit (null overall) is NOT demoted (no grade ≠ a bad grade). The detail-card Regenerate button was rewired onto the same `generateKitToTarget` loop (tolerant body parse, default target 80 / maxRounds 2) so it gets keep-best + THE BAR too, not just Kit Studio; its toast now says "Graded N/100 — below your 80 bar, kit not marked ready" instead of a false "Kit ready". **Safari fix:** raw `fetch`+`res.json()` surfaced Safari's "string did not match the expected pattern" (and Vercel SSO/gateway HTML bodies) straight into a toast — `lib/fetch-json.ts` is now the single client helper that catches the network layer + non-JSON bodies and returns a human message; wired into kit-card, kit-grade, and studio-form. Rule: client code must never hand a raw `fetch`/`res.json()` failure to the user — route every JSON fetch through one helper that translates transport and content-type failures. Gate: tsc 0, 53/53 tests, `next build` green, prod restarted on 3312 (LAN), /studio + detail pages render 200. **Honest gap:** the fresh end-to-end keep-best live run was blocked AGAIN by the CLI session window (studio-run5.json = `session limit · resets 10:30pm Berlin`, zero rounds produced) — keep-best/BAR/restore are code-complete and unit-safe by construction but the 2-round divergence has not been re-observed live this session; Pranav should run one Kit Studio build after 22:30 Berlin to confirm restore + the below-bar demote on a real regression.

## 2026-07-18 — Free job-posting meta scraper (lib/scrape/job-meta + /api/scrape-meta + Studio wiring)

26. **Fixtures pass while real pages lie — verify a scraper against the live web, not just crafted HTML.**
The pure `parseJobMeta` passed 10/10 hand-written fixtures, but the FIRST real Remotive posting exposed two
defects fixtures never would: (a) boards emit a placeholder `baseSalary: {value: 0}`, so I was rendering a
confident **"$0 / year"** over a job whose true comp ("$150k–$230k") sat in the description; (b) my salary
heuristic only matched grouped/4-digit numbers, missing the ubiquitous `$150k–$230k` k-shorthand. → Deltas
applied same session: `positive()` drops non-positive salary amounts as absent (0 is never a salary), and the
text heuristic now accepts the `NNk` shorthand on each side of a currency-marked range while still rejecting
`$5 lunch`. Rule: any HTML/DOM scraper ships only after being run against ≥3 REAL target pages through its IO
path — fixtures encode what you expect, live pages encode what vendors actually do. **Two more caught by the
tests themselves, worth noting:** an attribute regex `content=["']([^"']*)["']` truncates any value containing
the other quote (`founder's office` → `founder`) — tie the closing quote to the opener with a backreference;
and a title cleaner that only peels a trailing ATS brand leaves the employer stranded mid-title
("Growth Marketer – Kaddi") — peel BOTH trailing ATS-brand and company segments in a loop. **Reuse wins:** the
fetch guard (http/https-only, UA, 15s timeout) and `htmlToText`/`clampText` mirror `lib/kit/jd.ts`; the route is
pure fetch+regex so it runs on Vercel (NOT behind SYNC_DISABLED), same shape as `/api/scout-jd`; the Studio
"Paste a JD" form gained a Fetch button that auto-fills company/role/JD and surfaces scraped location+salary as
chips. No LLM, no paid API — genuinely free. Gate: tsc 0, 101/101 tests (12 new), verified live on 3 Remotive
postings (title/company/remote/salary all correct, $0 gone). **Honest gap:** structured `location` stays null
when a board keeps location only in prose (A.Team/Remotive) — `remote` is still captured; a prose-location
heuristic was deliberately left out as scope creep.

27. **A route's `maxDuration` is a budget your own arithmetic must respect — and `next dev` dirties `next-env.d.ts`.**
JOBDASH-007's first cut swept the whole `new` queue (189 rows) at concurrency 6 with a 12s probe timeout:
worst case ≈ 396s against the route's own `maxDuration = 300` — Vercel would hard-kill mid-request, losing the
in-flight batch and the response. Caught by the zero-context ship-gate reviewer, not by tests (the gate suite has
no wall-clock model). → Delta: whenever a handler loops over an unbounded row set doing network IO, do the
worst-case math (rows/concurrency × timeout) against `maxDuration` IN THE CODE COMMENT, and cap the run
(`MAX_PER_RUN` slice) with a persisted rotating cursor so repeat runs cover the tail — never assume "it'll be
faster in practice". Second catch, same review: running `next dev` rewrites `next-env.d.ts` to reference
`.next/dev/types/routes.d.ts`, which only exists after a dev run — committing it breaks tsc on any fresh
clone/CI. `git checkout -- next-env.d.ts` before every commit in this repo (dev server used for live verify).

28. **An "env var not set" error from a long-lived server means STALE PROCESS before missing config.**
The Mac LAN server on 3312 had been running detached since Jul 16 — its process env predated the
.env.local JOBSCRAPER_DB_PATH fix (Jul 17) and its build predated /api/import entirely, so the dashboard
showed "JOBSCRAPER_DB_PATH is not set in .env." even though every env file on disk was correct. → Delta:
(a) when diagnosing config errors, check the serving process's start time against the config's mtime FIRST
(`ps -o lstart -p $(lsof -ti :3312)`); (b) shipping anything in this repo now ends with rebuild + detached
restart of 3312 (`nohup npx next start -H 0.0.0.0 -p 3312 > ~/Library/Logs/scout-dashboard-3312.log 2>&1 &`)
— a committed fix the running server doesn't serve is not shipped.

29. **A scoring rubric where every signal only ADDS cannot rank — and a scraper that writes the query into the result will always top its own ranking.**
The jobscraper's relevancy had two independent structural faults, both invisible until the live 198-job corpus was
replayed. (a) `yc_hiring.py` set `title = f"{term} (HN hiring post)"` and `company = <HN username>`, so `_role_fit`
matched the very search term that produced the row and returned 100/100 — 20 of the top 25 jobs were HN handles
(`guitarmartini`, `mike_hearn`), and HN averaged 83.0 against LinkedIn's 65.2 purely from this self-fulfilling loop.
(b) Weights were role 40 / seniority 20 / language 20 / stage 20, so 60% of the score measured "is this a normal
English startup job" — every posting floated to a ~55-60 floor, the corpus compressed into 80-90, and the
`title_mismatch_flags` cap on the 40%-weighted role_fit component was too weak to bite ("Senior DevOps Engineer" @
Lemon.io scored 84). Meanwhile the G1/G2/G3 gates existed ONLY as prose inside `SCOUT_SCORING_PROMPT` in this repo's
`lib/constants.ts` — a constant **no code imports** — so nothing enforced them: Ericsson/Swisscom/Mphasis sat in the
80s and the #1 ranked job was in Bengaluru. → **Deltas:** (1) A disqualifier must be a GATE in code, not a negative
weight — anything expressible as "never show me this" gets a hard cap plus the gate name in the reason, so a wrong
rule is auditable instead of invisible. (2) A rubric constant that documents behaviour in ANOTHER repo must say so in
its docstring and name the mirrored files, or it silently becomes fiction — `SCOUT_SCORING_PROMPT` now does. (3) Never
let a scraper populate a scored field from its own query; assert it, which `gates.py` G0 now does as defence in depth.
(4) Always replay the real corpus before/after a ranking change — every one of these was found by diffing the top 25,
not by reading code. **Self-inflicted catch worth keeping:** the first cut of G0 also gated "title == one of our
search terms" as an echo, which suppressed `Founders Associate @ Kuro Technology` (Berlin) and two real Chief of Staff
roles — *the best matches in the corpus*. Search terms ARE real job titles; a heuristic that punishes a result for
matching its query inverts the ranking. Caught only by auditing gate failures for false positives, which is now a
mandatory step whenever a filter is added. (5) `"intern" in txt` also matches "international" — an English-friendly
signal was applying an entry-level penalty; word-boundary regexes for all short substring flags.
Gate: pytest 39/39 (new suite), vitest 106/106, tsc 0, 198-job replay verified.

30. **An LLM stage layered on top of a rules stage will silently overwrite the rules unless policy is re-applied after it — and `breakdown` is a numeric contract.**
Three catches from the JOBDASH relevancy ship gate, all invisible to the unit suite that existed at the time.
(a) `llm_rank.py` replaces `job.score` outright, so every deterministic down-weight computed in `scoring.py` was
discarded the moment the LLM ranked a job — the live dry run returned "Founders Associate Intern" at **78**, above
real full-level roles, because the model weighed the title match over the entry-level signal. → Delta: split
*policy* from *ranking*. Hard gates and non-negotiable down-weights are policy and get re-applied to whatever the
model returns (`apply_policy_multipliers()`, called by BOTH stages); the LLM ranks WITHIN policy and never overrules
it. Any time a model's output replaces a computed value, ask what invariants that computation was carrying.
(b) The LLM's language verdict was stashed in `job.breakdown["llm_language"]` as a string, but `mailer.py` renders
every breakdown value with `:.0f` — the entire `--dry-run` crashed at render, *after* a full scrape and 5 LLM calls.
→ Delta: a dict consumed by a formatter is a typed contract; new fields of a different type get their own attribute,
and end-to-end dry runs are mandatory because the unit suite never touched the renderer.
(c) Zero-context reviewer caught bare `"coo"` in `senior_overshoot_flags` matching inside `"coordinator"`/`"coordinate"`,
costing ops-titled roles 25 seniority points — the *third* instance of the substring trap in one session (after
`intern`/`international` and the search-term echo). → Delta: in this codebase a keyword flag list is guilty until
proven innocent — every short flag is matched with `\b…\b`, and adding a new flag list means adding a false-positive
test in the same commit. Gate: pytest 47/47, vitest 106/106, tsc 0, live `--dry-run` clean end to end.

31. **A two-letter code that means two different places is not a default to pick — it is an ambiguity to resolve.**
The ship gate's QA pass found `DE` in `_US_STATE_SUFFIX` (Delaware) silently gating every `"Berlin, DE"` /
`"Munich, DE"` posting as US-located — the single worst failure this scraper can produce, since Berlin roles are the
target. The obvious fix (read `DE` as Germany) was also wrong, and the live corpus proved it within one run:
"Senior AI & Automation Specialist @ The Bancorp, **Wilmington, DE**" — a Delaware bank — jumped from gated to #6.
Same collision for `MT` (Malta / Montana). → **Delta:** when a token is genuinely ambiguous, neither default is
acceptable; resolve it with corroborating evidence in the same field (`"Berlin, DE"` → a European city confirms
Germany; `"Wilmington, DE"` → nothing European, so Delaware) and write the test for BOTH readings. Picking a default
just moves the bug to the other side and makes it harder to see. **Second-order catch from the same fix:** the
`_EU_TOKENS` allowlist was missing half the EU/EEA (Malta, Luxembourg, Greece, Hungary, Croatia, the Baltics,
Norway…), so those countries were unreachable purely because nobody had listed them — an allowlist is a silent
denylist for everything absent from it, so enumerate the full set or don't use one.
Ship gate this session: zero-context reviewer (1 blocker + 3 warns, all fixed) then qa-runner (6 failures exposing 3
real bugs, all fixed) → pytest 68/68, vitest 106/106, tsc 0, live `--dry-run` clean.

32. **A filter that fires on missing data is not strict — it is broken. Distinguish "evidence of X" from "no evidence of not-X".**
Asked to make English mandatory, the first cut treated a German gender marker — "(m/w/d)" / "(f/m/d)" — as evidence
the posting was German, gated unless the JD proved otherwise. It gated **lemon.markets' "Founder's Associate
(f/m/d)"**, an English-speaking Berlin startup role and one of the best matches in the corpus, purely because its
staged JD was too thin to verify. German employment law (AGG) puts that marker on German-market ads *in any
language*: it means "employer is in Germany", not "job is in German". The rule was scoring the absence of data, and
across the stored corpus it cut passing rows from 100 to 73 while catching almost no actual German. → **Delta:** gate
on POSITIVE evidence (German function words/umlauts in the title, or a German JD), never on a legal formality plus
missing context; where the strict reading is still wanted, make it a named config flag with the measured cost in its
comment (`GERMAN_MARKER_STRICT`), not a silent default. **Two supporting deltas from the same session:** (a) `jobs.db`
never stored the JD, so any stored row was permanently unjudgeable on language and unrescoreable by the LLM —
persist the inputs a scorer needs, or "re-score" can only ever re-run the weakest half of the scorer; (b) scores were
only refreshed when a run happened to re-scrape a row, so after every scoring change the table was a MIX of old and
new — 40 pre-fix rows still sat above the email threshold, including one at 95. Added `rescore_db.py`; a scoring
change is not shipped until the existing corpus is re-scored, because every surface reads that table.
Also fixed: the HN parser read "Who wants to be HIRED?" candidate posts as jobs ("SEEKING WORK | Australia, APAC" at
70.8) and took the employment-type field as the role ("Mitte (mitte.ai) | Berlin | Full-Time | …" → role "Full-Time").
Gate: pytest 77/77, live --dry-run clean, 340-row corpus re-scored.

33. **A tracker nobody writes to reports "no problem" in exactly the same way as "no data". Seed it from the system of record before trusting any funnel read.**
Asked why the job search wasn't converting, the honest first answer should have come from `applications` — the table
this whole product exists to populate. It had **zero rows**, across a period in which Gmail proved 18 real
applications had been sent. Nothing in the UI distinguishes "you have applied to nothing" from "you have applied to
eighteen things and logged none of them", so the dashboard had been silently reporting a healthy empty board while
the actual funnel ran 18 → 10 rejections → 8 silent → **0 interviews**. The diagnosis had to be reconstructed
entirely from the inbox, and only then backfilled (`source='gmail-backfill'`, ids `bf-*`). This is the same failure
class as delta 23 and [[sqlite-db-is-not-one-file]]: **a check whose pass state is indistinguishable from its
failure state is not a check.** → **Delta:** (a) treat Gmail as the system of record for applications, not the
board — the confirmation/rejection mail is the event, the row is a cached projection of it, so an empty board must
be reconciled against the inbox before it is believed; (b) any dashboard tile computed over an empty table must
render "no data logged" rather than a zero, because a zero reads as a measurement; (c) the funnel read that
mattered most was not a status count but **time-to-rejection (mean 5.2 days) and the one row that reached screening**
— surface the shape of the funnel, not just its totals.
Second-order catch from the same session: **the resume had never once stated work authorisation**, on any of 21
variants, while the candidate held a permit reading "Erwerbstätigkeit gestattet" — the single cheapest fix in the
whole pipeline sat outside the tool's scope because the tool models postings and statuses but not the artifact
being sent. A pipeline that optimises targeting while never inspecting the payload will optimise the wrong half.

34. **A stored preference only works if it is read at write time. Load the style rules BEFORE generating the artifact, not after rendering it.**
Rebuilt the CV, rendered it, showed it, and only then noticed ten em-dashes in it. Two mechanisms existed to prevent
exactly that and neither fired: an explicit rule in memory ("Pranav does not want em-dashes in his resumes, a common
AI-written tell") and a `humanizer` skill scoped to the very directory the file was written into. Both were consulted
*after* Pranav pointed at the output. The failure is ordering, not knowledge. → **Delta:** when generating a
user-facing artifact into a directory that carries scoped skills, load them as part of planning the write, in the
same step as reading the previous version of the file; treat a directory-scoped skill as a precondition of writing
there, not as a review tool. Concretely for resumes/cover letters: no em-dashes (en-dashes in ranges are fine), no
curly quotes, vary bullet structure instead of a uniform `**Label:** text` list, and verify with a character count
(`em-dash: 0`) before rendering rather than by eye afterwards.

33. **"No new To apply jobs" was TWO bugs wearing one coat — a missing feature and a silent data-decoupling trap. Diagnose the live DB before believing either.**
Reported symptom: nothing ever appears in the "To apply" column. Querying live Turso (not the local fallback file) settled it in two facts: (a) 0 `to_apply` applications existed, and (b) the auto-add feature that would create them was only SPEC'd in HANDOFF.md, never built — so "no new jobs appear" was literally correct. A second, subtler finding: 8 of 11 past manual applies had been swept to `expired_missed` by the posting-expiry watchdog, which probes exactly `to_apply` cards (posting-check.ts:100) — on seed rows with fabricated URLs that genuinely 404, so a fresh apply could vanish fast. → **Delta:** when a user says "X never shows up", query the ACTUAL serving DB for X's count and X's producers before choosing between "feature missing" and "feature broken" — they demand different fixes and the symptom is identical. Built JOBDASH-009: scraper stamps `emailed_at` on digest picks; dashboard auto-promotes emailed + `new` + score≥75 (gate-marker-guarded) via the EXISTING `applyToScoutJob()` atomic claim — reused, not forked, so a manual apply racing the sync can't double-create. Verified live: to_apply 0→2.
**The decoupling call, against a code-review blocker:** the reviewer said mark `emailed_at` only on SMTP success. But the user's SMTP creds are commented out — email never sends — so gating board-sync on delivery would make the whole feature silently do nothing, reproducing the exact bug it closes. Kept the decoupling: `emailed_at` means "selected for the daily digest," the board is its own delivery channel (provenance activity + toast make it visible), and a send failure is loud, not swallowed. Documented the deliberate deviation in main.py so the next reviewer doesn't "fix" it back. Reviewer was right on the cheap correct sub-point: naive `utcnow().isoformat()` is parsed as LOCAL by the dashboard's `Date.parse()` — added a "Z" suffix.
Gate: pytest 77/77, vitest 113/113, tsc 0, live import + board render verified.

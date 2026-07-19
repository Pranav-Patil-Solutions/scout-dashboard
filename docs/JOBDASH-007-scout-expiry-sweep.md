# JOBDASH-007 — Discover expiry sweep & purge

**As** the only user of Job Scout, **I want** Discover to detect roles whose postings are
verifiably dead and let me delete them, **so that** the Open queue never shows jobs I can no
longer apply to.

## Scope

- §1 **Status**: `scout_jobs.status` gains `expired` (text column — no migration). Every existing
  query filters by status, so expired rows vanish from all Discover tabs, tab counts, the nav
  badge, and reco ranking with zero query changes.
- §2 **Sweep** (`lib/scout-sweep.ts` → `sweepScoutJobs`): probe every `new` row's `url` with the
  watchdog's `probePosting` (per-ATS positive-evidence rules in `posting-verdict.ts`; `unknown`
  is ALWAYS a no-op). `expired` verdicts flip status — status-guarded update so an apply click
  racing the sweep wins. Batch concurrency 6; flips persist per batch (timeout-safe). Capped at
  120 rows per run so worst-case (120/6 × 12s = 240s) stays inside `maxDuration = 300`; a
  rotating cursor in `sync_state` id `scout-sweep` makes repeat runs cover the rest of the queue
  (`remaining` in the response/toast says when to sweep again). Stats land in the same row.
- §3 **Purge** (`purgeExpiredScoutJobs`): `DELETE FROM scout_jobs WHERE status='expired'`. Only
  the sweep produces that status, so purge can never touch open/dismissed/promoted rows.
  Deletion is a separate explicit click — the sweep itself never destroys data.
- §4 **API** (`POST|DELETE /api/scout-sweep`): plain HTTP + DB, works on Vercel (no
  SYNC_DISABLED). `maxDuration = 300` for big queues.
- §5 **UI** (`components/scout-sweep.tsx`, Discover header): "Sweep expired" button (toast:
  flipped roles or live/unverifiable stats) + destructive "Clear N expired" button that renders
  only when flagged rows exist. `fetchJson` for Safari-safe errors.

## Non-goals

- No expired tab — flagged rows are invisible until cleared (the count on the Clear button is
  the only surface). If a live posting is ever mis-flagged: verdicts require positive evidence,
  and re-import from the scraper re-creates the row as `new` after a purge.
- Applications/pipeline side is untouched — that's the existing JOBDASH watchdog.

## Acceptance

1. Sweep on a queue with dead postings → those roles leave Open (and the nav badge) without a
   deploy or manual SQL; toast names them.
2. Clear deletes exactly the flagged rows; Discover tabs unaffected.
3. `unknown` verdicts (network errors, odd ATS pages) never hide anything.
4. Gate: tsc 0 · vitest green · `next build` green · live sweep observed against the real queue.

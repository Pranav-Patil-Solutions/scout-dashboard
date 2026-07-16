# JOBDASH-006 — Hybrid Mac-Worker Queue (run kit-gen + sync from the deployed app)

**Goal (user, 2026-07-14):** tap Generate / Kit Studio / Sync on the **deployed
Vercel app** (phone, anywhere) and have it actually run — with **$0 LLM cost**,
so the product markets as a standalone deployed system, not a localhost tool.

**Chosen architecture:** hybrid. The $0 subscription `claude -p` transport stays
on the Mac; the cloud becomes the *control surface*. Cloud enqueues a job in the
**shared Turso DB**; a **Mac worker** polls, runs the existing pipeline locally,
writes results back to Turso; the cloud UI polls the job and refreshes.

**Why a queue, not a direct cloud→Mac call (locked):**
1. Kit runs take 2–9 min — past every Vercel function max-duration tier.
2. Pointing the public internet at the home Mac (funnel/port-forward) is a
   security downgrade. Pull-based = Mac makes **outbound-only** connections.
3. Turso is already shared (Mac `.env.local` has `TURSO_DATABASE_URL`; the
   deployed app reads the same DB) — the queue rides infra we already trust.

**§8 privacy (unchanged, hard):** sync job rows carry **no email bodies** — a
sync job is a bare trigger; the worker reads `.gmail-staging` + classifies
locally and persists only subject/snippet/classification. Kit job payload =
`{ target, maxRounds }` only; the applicationId already lives on the board.

```
TICKET JOBDASH-006 — hybrid Mac-worker job queue

§1 SCHEMA — new `jobs` table (lib/db/schema.ts), additive migration:
    id (uuid) · kind ("kit" | "studio" | "sync") · applicationId (nullable —
    null for sync + paste-studio) · payload (json: {target?,maxRounds?,
    scoutJobId?,manual?}) · status ("queued"|"running"|"done"|"error") ·
    result (json, nullable) · error (text, nullable) · attempts (int, def 0) ·
    claimedBy (text worker id, nullable) · claimedAt · createdAt · finishedAt.
    Index on (status, createdAt). NO PII in payload/result (see §8).
    Turso migration is a GATED step — needs Pranav's OK + fresh backup
    (delta 18 rule); until then verify against a local file DB.

§2 JOBS LIB (lib/jobs/*, pure + IO split so vitest can import):
    - types.ts: JobKind, JobStatus, JobRow, enqueue payload shapes.
    - queue.ts: enqueueJob(kind,payload,applicationId?) → row;
      claimNextJob(workerId) → atomic UPDATE ... WHERE status='queued' (lease,
      single-flight; libsql has no SELECT FOR UPDATE → claim by
      `UPDATE jobs SET status='running',claimedBy=? WHERE id=(SELECT id ...
      ORDER BY createdAt LIMIT 1) AND status='queued'` then re-read; retry on
      race) ; completeJob(id,result) / failJob(id,error,{retry}).
    - Idempotency: a queued kit job for an app that already has a newer queued
      job of the same kind is a no-op (dedupe on (kind,applicationId,status)).

§3 CLOUD ENQUEUE — flip the 3 routes so cloud enqueues instead of 501:
    app/api/kit/[id]/route.ts · app/api/studio/route.ts · app/api/sync/route.ts.
    When SYNC_DISABLED=1 (cloud): validate input, enqueue, return
    {ok:true, queued:true, jobId}. When NOT set (Mac dev): run inline as today
    (so localhost stays synchronous + debuggable). Studio's card create/reuse
    logic runs at enqueue time on the cloud too (needs the appId in the job).
    Add GET /api/jobs/[id] → {status,result,error} for UI polling (no auth-gate
    beyond the existing proxy Basic-auth).

§4 MAC WORKER — scripts/worker.ts + "worker" npm script:
    poll loop (default 5s), workerId = hostname+pid; claimNextJob → dispatch:
      kit    → generateKitToTarget(applicationId, payload)
      studio → (reuse the studio route's create/reuse, then generateKitToTarget)
      sync   → runSync() (existing pipeline)
    completeJob with a small result summary (grade.overall, keptRound,
    reachedTarget for kit; counts for sync). Wrap each in try/catch → failJob
    with retry cap (attempts<2). Heartbeat: worker upserts sync_state row
    "worker" with lastRunAt each tick → UI can show "worker online/offline".
    Must load .env.local (Turso + LLM_TRANSPORT=claude-cli). Ship as a plain
    `npm run worker`; optional `/loop` wrapper is Pranav's choice.

§5 UI — cloud shows queue state, Mac stays inline:
    KitGenerator / StudioForm / SyncButton: on enqueue (queued:true) show
    "Queued on your Mac worker" + poll GET /api/jobs/[id] every 4s → on done,
    router.refresh() + success toast; on error, error toast. If worker
    heartbeat is stale (>60s), badge "Mac worker offline — is `npm run worker`
    running?". A cloud "isCloud" flag (server → client prop, from SYNC_DISABLED)
    drives copy; on the Mac the buttons behave exactly as today (synchronous).

§6 VERIFY GATE (same bar as prior ships):
    npx tsc 0 · npm test (jobs lib unit tests: enqueue/claim race/idempotency/
    dedupe + §8 no-body probe on sync payload) · npm run build · LOCAL: enqueue
    a kit job against a file DB, run the worker, watch status queued→running→done
    and the app row update · deploy PREVIEW · from the preview URL enqueue a real
    kit, run the Mac worker pointed at Turso, watch it land, phone sees the kit.

§7 SHIP: Turso migration (backup first, Pranav OK), keep SYNC_DISABLED=1 on
    Vercel (it now means "enqueue, don't run inline" — NOT "disabled"), redeploy
    preview, `git push` for prod. Update HANDOFF/EVOLUTION.

GUARDS: Turso schema change gated on approval + backup · sync/kit payloads
    NEVER carry email bodies or secrets · worker is Mac-only, outbound-only ·
    localhost keeps the synchronous inline path (don't force everything async).
OPEN: worker as a background service (launchd) vs manual `npm run worker` —
    Pranav's call at ship. Multi-worker leasing is built but single worker is
    the v1 expectation.
```

## Phase status
- **P1 (§1–§2) schema + jobs lib + local migration + unit tests** — _build first._
- P2 (§4) Mac worker · P3 (§3) cloud enqueue + status · P4 (§5) UI · P5 (§6–§7) verify + ship.

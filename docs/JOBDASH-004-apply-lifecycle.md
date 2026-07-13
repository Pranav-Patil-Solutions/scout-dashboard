# JOBDASH-004 — Apply-Click Lifecycle & Auto-Reconcile (P0-CONFIRMED)

> Renumbered from the ticket's "JOBDASH-003" — that number is already taken in-repo
> by the completed Turso migration (`lib/db/index.ts` cites "JOBDASH-003 §1").
> Revert to 003 if preferred. Binds JOBDASH-001 (dashboard) + JOBDASH-002 (Gmail sync).
> P0 gate signed off 2026-07-13 with the 4 decisions + refinements A–F below baked in.

## GOAL
See jobs → click APPLY → click is tracked → Gmail tells us if it actually got
applied → if not, escalating reminders push it forward → if the posting expires or
goes stale unapplied, archive then (after grace) delete. One idempotent daily
reconcile job is the heartbeat.

## DECISIONS (P0 gate, 2026-07-13)
- **D1 Status model = UNIFY.** Retire `expired_missed`. New closed-unapplied path is
  `expired → archived`. Carry an `expiry_reason` so analytics keeps a "missed" count
  without a dedicated status (see §2/§8). Moss migrates to `archived`,
  `expiry_reason='missed_kit'`. **Existing consumers to migrate off `expired_missed`:**
  `lib/posting-check.ts` (writes it today), `lib/constants.ts` STATUS_META/CLOSED_STATUSES,
  `lib/analytics.ts` "missed" counter, and any seed row.
- **D2 apply_clicked UI = badge, not a column.** Board stays 5 columns. `apply_clicked`
  (and `not_applied_lapsed`) render inside the **To-apply** column with a pulsing
  "awaiting confirmation" / red "lapsed" chip. No dnd-kit column change.
- **D3 reconcile runs Mac-only.** `POST /api/reconcile` behind a "Reconcile now" button;
  optional local `/loop`. Consistent with Mac-only sync, writes to Turso, $0. No cron in v1.
- **D4 Build in a fresh session**, resuming from HANDOFF.md. This doc is the spec.

## §1 CONFIG CONSTANTS (`lib/config.ts`, all tunable)
```
APPLY_CONFIRM_WINDOW_H   = 48            // watch Gmail this long after a click
REMINDER_STEPS_H         = [24, 72, 144] // ⚠ 144 (was 168) so the last nudge precedes lapse — refinement D
LAPSED_AFTER_H           = 168           // 7d clicked, no confirm, no manual "yes" → not_applied_lapsed
TO_APPLY_NUDGE_H         = 336           // 14d in to_apply, never clicked → nudge
EXPIRE_STALE_AFTER_H     = 504           // 21d never clicked/applied → expired (age fallback)
APPLIED_FOLLOWUP_AFTER_H = 288           // 12d applied, no human response → follow-up reminder
ARCHIVE_GRACE_DAYS       = 30            // archived rows hard-delete after this
LIVENESS_RECHECK         = true
```

## §2 STATE MACHINE
Enum after D1 (`lib/constants.ts` `Status`): drop `expired_missed`; add
`apply_clicked`, `not_applied_lapsed`, `expired`, `archived`. Keep `withdrawn`.
`hard_deleted` is NOT a stored value — it is the absence of the row (T10 deletes it).

```
sourced ─▶ to_apply ─▶ apply_clicked ─▶ applied ─▶ screening ─▶ interview ─▶ offer
              │             │               │            └──────────┬────────────┘
              │             ▼               ▼                       ▼
              │      not_applied_lapsed ────┘ (late confirm/manual) rejected
              ▼             │
           expired ◀────────┘
              ▼
          archived ─▶ (after ARCHIVE_GRACE_DAYS) ─▶ (row deleted)
```
New columns on `applications`: `clicked_at`, `confirm_deadline_at`, `lapsed_at`,
`expired_at`, `archived_at`, `reminder_count` (default 0), `reminder_last_at`,
`expiry_reason` (`'lapsed'|'stale'|'closed'|'missed_kit'|null`), and **`close_date`**
(refinement C — new, nullable; scraper best-effort).

Board display (D2): To-apply column shows `status ∈ {to_apply, apply_clicked, not_applied_lapsed}`.
Archive tray shows `status='archived'`. `CLOSED_STATUSES = [rejected, withdrawn, expired, archived]`.

## §3 TRANSITION TABLE (from → to · TRIGGER · GUARD · EFFECT)
- **T1** `to_apply|sourced → apply_clicked` — user clicks APPLY.
  EFFECT: `clicked_at=now`, `confirm_deadline_at=now+APPLY_CONFIRM_WINDOW_H`,
  `window.open(apply_url,'_blank','noopener')`, activity "Apply clicked",
  toast "Opened {company} — did you submit? [Yes, applied] [Not yet]".
- **T2** `apply_clicked → applied` — (a) Gmail `application_confirmation` matched for this
  company/role, OR (b) user clicks "Yes, applied", OR (c) outbound SENT to the company.
  EFFECT: `applied_at=(email date or now)`, `status=applied`, clear reminders, stop watch, log evidence.
  **Auto-apply is allowed ONLY here** (refinement B) — see §Integration.
- **T3** `apply_clicked → (stays, REMINDER)` — reconcile: `reminder_count < REMINDER_STEPS_H.length`
  **AND** `now ≥ clicked_at + REMINDER_STEPS_H[reminder_count]` AND no confirmation.
  EFFECT: refresh Action-Queue card "Did you finish applying to {company}?"
  [Yes→T2][Not yet][Didn't apply→to_apply]; `reminder_count++`, `reminder_last_at=now`.
  (Refinement D: the `count < len` guard is what lets T4 own 168h cleanly.)
- **T4** `apply_clicked → not_applied_lapsed` — reconcile: `now ≥ clicked_at + LAPSED_AFTER_H`
  AND no confirmation AND no manual yes. EFFECT: `lapsed_at=now`; RED card
  "Applied? {company} clicked 7d ago, no confirmation" [Yes→T2][Re-open link][Give up→expired].
- **T5** `not_applied_lapsed → applied` — late confirm / manual yes → same EFFECT as T2.
- **T6** `not_applied_lapsed → expired` — user "Give up" OR posting closed (§5).
  EFFECT: `expired_at=now`, `expiry_reason='lapsed'` (or `'closed'`), → archived (T9).
- **T7** `to_apply|sourced → expired` — reconcile: posting close detected (§5) OR
  (age via `close_date`/`next_action_due` when present, else `EXPIRE_STALE_AFTER_H`;
  refinement E) AND never clicked AND never applied. EFFECT: `expired_at=now`,
  `expiry_reason = is_kit_ready ? 'missed_kit' : (closed ? 'closed' : 'stale')`,
  log "Expired unapplied", → archived (T9). (The Moss-miss guard.)
- **T8** `applied → screening|interview|offer|rejected` — accepted Gmail proposal (JOBDASH-002 §7).
- **T9** `{expired} → archived` — EFFECT `archived_at=now`; hide from board, show in Archive
  tray with [Restore]; soft-delete only. Reconcile advances expired→archived in the same pass.
- **T10** `archived → (deleted)` — reconcile: `now ≥ archived_at + ARCHIVE_GRACE_DAYS`.
  EFFECT: DELETE row + its activities; one-line audit log. Only destructive step.

GUARDS: never downgrade from a timer · Gmail status changes route through proposals
EXCEPT T2 confirmation auto-apply · hard-delete NEVER touches `applied`-or-beyond,
only expired/archived-unapplied.

## §4 APPLY BUTTON (frontend)
On every job card + detail. onClick: `POST /api/apply/:id` (does T1) →
`window.open(apply_url,'_blank','noopener')` → toast [Yes, applied→T2][Not yet].
Missing `apply_url` → disable, "Add apply link first".

## §5 POSTING-EXPIRY / LIVENESS — ALREADY BUILT, reuse it
**A posting-expiry watchdog shipped 2026-07-13 (HANDOFF delta 16) and is SMARTER than
this ticket's naive body-scan. Do NOT reinvent §5 — retarget it.**
- `lib/posting-verdict.ts`: pure per-ATS rules — Ashby `og:title` (dead postings return
  **HTTP 200**, so status codes alone are useless), join.com `__NEXT_DATA__` status field
  (its i18n bundle has tombstone text on EVERY page → **never text-match join**),
  SmartRecruiters public API 200/404; ambiguous ⇒ `unknown` ⇒ no-op.
- `lib/posting-check.ts` auto-moves dead postings with an evidence activity;
  `POST /api/check-postings` (Vercel-safe) + piggyback in `/api/sync` + Command Center
  "Check postings" button. 40/40 tests, live-verified (dead Tacto Ashby @ HTTP 200 → Missed).
- **The only JOBDASH-004 work here**: today it writes `expired_missed`; under D1 retarget the
  dead verdict to `expired → archived` with `expiry_reason = is_kit_ready ? 'missed_kit' : 'closed'`.
  Also feed `close_date` (refinement C) as an additional CLOSED signal, and let `reconcile()`
  call the same `posting-check` for the T7 liveness branch (throttle already handled there).
- Refinement F is therefore MOOT — the per-ATS engine already handles 200-but-dead and
  SPA-ish cases; generic/unknown ATS stays a safe no-op.

## §6 REMINDER ENGINE (Action Queue = the surface, JOBDASH-001 §6A)
RED: not_applied_lapsed · closing-within-48h · applied+rejected-unseen.
AMBER: apply_clicked awaiting confirmation (T3 pulses) · applied+no-response>12d.
BLUE: to_apply not clicked (nudge) · new triaged matches.
Each card carries its one-click §3 resolution. Optional OS notification (flagged) on new RED.
NEVER auto-apply / auto-email / auto-reject.

## §7 DAILY reconcile() — Mac-only (D3), idempotent
```
reconcile():                       // "Reconcile now" button + optional /loop; POST /api/reconcile
  for app where status NOT in (offer, rejected, archived):   // archived waits for T10 sweep only
    run liveness (§5) if due
    evaluate T2,T3,T4,T6,T7 in order; apply FIRST matching transition
    if now-expired → advance T9 (expired→archived) same pass
  T10 hard-delete sweep on archived past grace
  refresh Action-Queue cards; set sync_state.last_reconcile_at
```
All time math from stored timestamps, never wall-clock assumptions. One DB
transaction per app (libsql batch). Serialize with `/api/sync` (shared advisory
lock) so reconcile + sync don't race writes.

## §Integration seams (refinements A + B — do in P1/P2)
- **A** `propose.ts`: add `apply_clicked: 1.5` to `STATUS_RANK`; add
  `not_applied_lapsed, expired, archived` to the `CLOSED` set — else JOBDASH-002
  downgrade/reopen guards misfire (`rank < undefined`).
- **B** Confirmation auto-apply: a `application_confirmation` whose matched app is
  `apply_clicked` executes T2 directly (safe, non-destructive). Every OTHER
  confirmation keeps producing a manual `set_status` proposal as today.

## §8 SEED BEHAVIOR CHECK (post-first-reconcile)
- WeFlow, Kadmos (to_apply, kits ready) → BLUE nudges; Apply → apply_clicked badge.
- CEF AI (screening, no human response) → AMBER "send follow-up" (>12d rule).
- Moss → migrated to `archived`, `expiry_reason='missed_kit'`, Analytics "missed" = 1.
- telli/Reonic/voize → rejected (terminal); Overfly → applied, awaiting response.
- Demonstrate one full click→lapse→expire→archive→restore path on a test row.
- Analytics "missed" = count of `archived` (or expired) rows with
  `expiry_reason='missed_kit'` (replaces the old `expired_missed` count).

## §9 BUILD PLAN — GATED
- **P0** ✅ enum + config + transitions + decisions confirmed (this doc).
- **P1** ▣ schema migration (new cols + `close_date`), Status enum + STATUS_META +
  board grouping (D2), Apply button + T1 + toast + confirm-watch, `propose.ts`
  STATUS_RANK/CLOSED patch (A). Data migration: `expired_missed`→`archived`+reason. GATE.
- **P2** ▣ reconcile() T2–T7 timers + Action-Queue reminders + confirmation auto-apply (B). GATE.
- **P3** ▣ liveness/expiry (§5) — MOSTLY DONE (posting-verdict/posting-check exist). Work =
  retarget its verdict to `expired→archived`+`expiry_reason`, add `close_date` signal, call from
  reconcile T7. Migrate `posting-check.ts`'s `expired_missed` write under D1. GATE.
- **P4** ▣ Archive tray + T9 soft-delete + Restore + T10 grace sweep. GATE.
- **P5** ▣ optional `/loop` schedule (manual first). VERIFICATION GATE ↓.

## §10 VERIFICATION GATE
- Unit-test T1–T10 with mocked timestamps (drive each timer past threshold, assert
  state + activity + reminder). Assert GUARDS: no timer downgrade; hard-delete never
  hits applied+; `reconcile()` twice = identical (idempotent).
- `npm run build` green · browser smoke on :3312 of click→confirm and
  click→lapse→expire→archive→restore, with screenshots.
- code-reviewer + qa-runner → zero blockers. Report scorecard, then done.

## §11 OUT OF SCOPE (v1)
Auto-submitting applications · ATS browser-extension capture · writing to Gmail ·
SMS reminders. Intent-click + mail-confirm + timers only.

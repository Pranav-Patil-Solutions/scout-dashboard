# Gmail fetch spec — JOBDASH-002 §4 (connector path A)

The Claude Code session runs these Gmail MCP queries and writes the merged,
deduped results to `.gmail-staging/<date>-sweep.json` as `{ fetchedAt, emails: RawEmail[] }`
(shape: `lib/email/types.ts`). The app never talks to Gmail directly in v1;
`StagingSource` reads these files. Swap to `GmailApiSource` (OAuth, path B)
without touching classifier/proposal code.

## Queries (all `newer_than:120d`, or `after:<last_cursor>` on incremental runs)

1. **ATS senders** (`THREAD_VIEW_MINIMAL`, pageSize 50, paginate):
   `{from:ashbyhq.com from:join.com from:msg.join.com from:smartrecruiters.com from:greenhouse.io from:us.greenhouse-mail.io from:lever.co from:personio.de from:personio.com from:recruitee.com from:teamtailor.com from:wolt.com} newer_than:120d`
2. **Subject signals, minus ATS + hard noise**:
   `subject:{application applying interview assessment "next steps" "move forward" unfortunately "thank you for applying" "we received your"} newer_than:120d -from:jobalert.indeed.com -from:hi.wellfound.com -from:notifications.freelancer.com -from:resend.dev -from:<ATS senders above>`
3. **Sent mail (outbound/cold detection)**:
   `in:sent newer_than:120d {application applying "founders associate" "founder's associate" role position CV resume}`

## Rules for staging

- One entry per **message** (not thread); `direction: "outbound"` when labelIds
  contains SENT and sender is the user.
- HTML-decode snippets. Include `body` (plaintext) ONLY where classification
  needs it (ambiguous snippet); bodies are never persisted to the DB (§8).
- Include borderline noise (job-alert lookalikes, "we received your payment",
  recruiting spam) — the classifier must prove it rejects them; the hard
  noise-list senders in `lib/email/noise.ts` may be skipped at fetch time.
- Gmail ignores dots: results cover pranavpatil.work@ and pranavpatilwork@.
- Personal correspondence is excluded at fetch time and never staged.

## Incremental runs

Read `sync_state.last_cursor` (ISO date) from `scoutdash.db`, use
`after:YYYY/MM/DD` in place of `newer_than:120d`, write a new staging file.
Ingest dedupes on `gmail_message_id`, so overlap is safe.

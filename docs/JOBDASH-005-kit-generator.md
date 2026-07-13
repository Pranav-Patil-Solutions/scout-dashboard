# TICKET JOBDASH-005 — In-dashboard Kit Generator (tailored CV + cover letter)

**Confirmed by Pranav 2026-07-13** ("Build it into the dashboard"). Mac-only capability, $0 via
claude-cli transport (same subscription seam as email sync).

## §1 Goal
One click on an application → tailored one-page A4 CV (PDF) + cover letter (PDF), grounded in the
canonical base resume and the job's real posting text → files saved locally, `resume_variant` +
`cover_path` filled, `is_kit_ready` flipped ON (arms the kit_ready alert), activity logged.

## §2 Inputs
- **Base resume**: `KIT_BASE_RESUME` env, default
  `~/Downloads/pranav-essentials/C--Users-Pranav/linkedin-improvement/Pranav-Resume-2026-07-12.html`
  (canonical per resume-versions memory; self-contained A4-print HTML with `@page` CSS).
- **Job description**: fetched live from `jd_url ?? apply_url` (HTML → text, scripts/styles stripped,
  clamped ~12k chars). Fallback: the card's `notes`. No JD source at all → 422.
- **App fields**: company, role_title, location, german_req.

## §3 Generation (lib/kit/)
- `lib/llm-cli.ts` — generic `claudePrompt({model, system, prompt})` extracted from
  lib/email/llm.ts's private runner (email pipeline refactored to import it; behavior unchanged).
- Model: `claude-sonnet-5`, 2 calls: (1) tailored resume HTML, (2) cover-letter HTML.
- **TRUTH CONSTRAINT (hard)**: the model may re-order, re-phrase, emphasize, and re-target the
  summary/title; it may NEVER invent employers, titles, dates, degrees, tools, or metrics not in
  the base resume. Cover letter grounded in resume facts only.
- Resume keeps the base file's exact CSS/`@page` and must fit ONE A4 page: render → count pages
  (pdf-lib) → if >1, ONE condense retry (~15% shorter), then save with a `warnings` flag.

## §4 Output & persistence
- Files: `kits/<appId>/{resume,cover-letter}.{html,pdf}` (kits/ gitignored; bodies stay local).
- DB: `resume_variant` = `<CompanySlug>-<YYYY-MM-DD>`, `cover_path` = kits path,
  `is_kit_ready` = true, `last_activity_at` bump + activity (`note`, source `system`,
  "Kit generated — tailored CV + cover letter").
- §8 privacy inherited: generated docs contain only Pranav's own data; nothing leaves the machine
  except the claude-cli call itself.

## §5 API
- `POST /api/kit/[id]` — generate. Guard: `SYNC_DISABLED=1` (Vercel) → 501 "Generate kits from the
  Mac" (same env as sync — it means "no claude CLI / no local FS here").
- `GET /api/kit/[id]/[file]` — download, allowlist {resume,cover-letter}.{pdf,html}, path-traversal
  safe. 404 on Vercel (no kits dir).

## §6 UI (detail page → Documents card)
- `components/detail/kit-card.tsx`: Generate/Regenerate button (spinner + "~2 min" hint; disabled
  while running), on success toast + refresh; when files exist → "CV (PDF)" / "Cover letter (PDF)"
  links via §5 GET. Server passes file-existence (fs check, try-wrapped → false on Vercel).

## §7 Deps
- `playwright-core@1.61.1` EXACT (matches cached chromium_headless_shell-1228 — version-lock gotcha)
- `pdf-lib` (page count only)

## §8 Verify gate
tsc 0 · vitest green (new: jd html→text) · next build · LIVE: generate for WeFlow — files exist,
resume PDF = 1 page, DB row updated, activity logged, idempotent regenerate overwrites · restart
Mac prod server.

## §9 Out of scope (v1)
Editing generated docs in-app · DOCX output · auto-attach to applications · German-language covers ·
regeneration history/versioning.

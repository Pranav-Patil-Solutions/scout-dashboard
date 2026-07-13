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

## v1.1 — CV Grader (2026-07-13, Pranav: "add resume grader … improve it for next time … show on dashboard")

- `lib/kit/grade-schema.ts` (pure: KitGrade type, validate/clamp, extractJsonObject, gradeTone) +
  `lib/kit/grade.ts` (Sonnet 5 recruiter+ATS grade of kits/<id>/resume.html vs the live JD; one
  retry; writes `applications.kit_grade` JSON + `kit_graded_at` + activity; deliberately does NOT
  bump last_activity_at so silent-days alerts stay honest).
- Grade = overall 0–100 + subscores (keywords/experience/seniority/evidence) + matched/missing
  keywords + red_flags + improvements + verdict. Improvements are truth-preserving only.
- **Feedback loop**: generateKit() appends the previous grade's improvements to the tailoring
  prompt ("PRIOR GRADER FEEDBACK") — Regenerate is self-improving.
- Auto-grade runs at the end of every generation (non-fatal); `POST /api/kit/[id]/grade` re-grades
  on demand. UI: KitGradeCard on the detail page (score, bars, keyword chips, "For next time"),
  CV score on the Command Center kit_ready card.
- Schema: migration `drizzle/0003` (additive ADD COLUMN ×2). Applied to the local file DB;
  **Turso needs `npx tsx --env-file=.env.local scripts/migrate.ts` run by Pranav** (prod-DB gate),
  THEN restart the Mac server — the new build selects kit_grade and errors on an unmigrated DB.

## v1.2 — Kit Studio (2026-07-13, Pranav: "standalone resume builder … humanise … compare with the JD for each job in job scout … aim accuracy")

- `/studio` page (nav "Kit Studio", chord G S): pick a NEW Scout Inbox job OR paste any JD
  (company/role/JD text/optional URL) + target score (75/80/85, default 80).
- `POST /api/studio`: scout job → createApplication (promotes the scout row, reuses the card if
  already promoted); pasted JD → createApplication with JD stored in notes (resolveJd's fallback).
  Then `lib/kit/refine.ts` generateKitToTarget: generate → grade → if overall < target and rounds
  remain (max 2, clamp 1–3), regenerate — each round auto-consumes the previous grade's
  improvements. Returns rounds trajectory + final grade + files. Mac-only (SYNC_DISABLED guard).
- **Humanize rules** added to BOTH prompts (all kit generation, not just studio): plain verbs,
  varied rhythm, contractions OK; banned AI-tells (leveraged, spearheaded, passionate, dynamic,
  synergy, results-driven, proven track record, utilize, delve, showcase, cutting-edge…); no
  keyword stuffing — a JD keyword may appear only where a real fact supports it. Truth constraint
  unchanged.
- Result panel: score + verdict + round trajectory + CV/cover PDF links + link to the application
  card (kit_ready arms as usual, so the Command Center picks it up).

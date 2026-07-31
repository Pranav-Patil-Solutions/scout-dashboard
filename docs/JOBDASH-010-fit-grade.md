# JOBDASH-010 — Apply-readiness fit grade (JD-level gate into "To apply")

**Status:** spec, not built. Consolidates the original ticket + revision 1
(grade against the base resume, not a hand-kept profile) + revision 2
(base = `Pranav-Resume-2026-07-22.html`; independent products are framed as side
projects, never a founded startup).

## Context
`lib/reco/score.ts` scores jobs on TITLE only (role-bucket affinity + title-keyword
overlap + language flag). It never reads the JD body, so it cannot catch the four
things that actually disqualify a job for me:
  1. seniority band too high (director/VP, "significant leadership experience",
     team leadership, budget ownership),
  2. work-authorization / geography I can't take (US-only, non-EU no-sponsorship),
  3. a must-have specialism I don't have (deep ML/robotics research, PhD, licensed
     profession),
  4. mandatory native/fluent German.
Result: executive roles (AbbVie "Senior AI Leader") and US-only roles still look
like matches on title and can flow into "To apply" (JOBDASH-009 auto-adds strong
fits). I want a resume-aware fit GRADE computed for EVERY job before it is allowed
into the Apply section.

## Goal
Add an apply-readiness fit grade (A–F) produced by reading the full JD against my
real base resume. Only grade A/B may enter "To apply". C parks in a review lane;
D/F stay in Discover with the failing reason shown. Reuse the existing `claude -p`
LLM seam (free transport). Keep the title-scorer as a cheap pre-filter.

## Non-goals
- Do NOT replace `scoreScoutJob` — it stays as the pre-filter/sort key.
- No auto-apply, no UI redesign beyond rendering grade + one-line reason.
- No new LLM provider — `claude -p` headless only (per free-LLM-transport).
- No hand-maintained copy of my experience. See §Source of truth.

## Guardrails (do first — do not skip)
- [ ] Concurrent-session check: `pgrep -fl "claude"` + inspect recent transcripts;
      abort if a second live session is editing ~/scout-dashboard (memory: two
      sessions clobbered ~/gigos).
- [ ] Branch: `git checkout -b feat/jobdash-010-fit-grade` off the current tip.
      Note: the tree currently carries an uncommitted base-resume repoint in
      `lib/kit/generate.ts` + `docs/JOBDASH-005-kit-generator.md` — commit or
      stash it deliberately, do not sweep it into this branch by accident.
- [ ] This is the modified Next.js — READ `node_modules/next/dist/docs/` for any
      route/server-action touched before writing (AGENTS.md).
- [ ] Repo defaults to Sonnet; keep grader model overridable via env.
- [ ] After any server change restart :3312 (EVOLUTION delta 28 — stale detached
      server masks fixes).

## Source of truth — the base resume (revision 1)
The candidate context IS the base resume. Do not duplicate my experience into a
struct that goes stale.

`lib/reco/base-resume.ts`

    // Canonical base resume. LOCKED (revision 2) to the 07-22 general refresh —
    // the same file lib/kit/generate.ts generates from. Tailored CVs (CloudBee,
    // Logistics, …) must NEVER be the grading source: grading against a
    // role-tailored CV biases every assessment.
    export const BASE_RESUME_PATH =
      process.env.BASE_RESUME_PATH ??
      "/Users/pranavpatil/Downloads/pranav-essentials/C--Users-Pranav/" +
      "linkedin-improvement/Pranav-Resume-2026-07-22.html";

    // At grade time: read the file, strip HTML -> plain text = the candidate
    // context passed to the grader. resumeVersion = sha256(resumeText), so any
    // resume edit invalidates cached grades and triggers a re-grade sweep.

Single-source rule: `lib/kit/generate.ts`'s `DEFAULT_BASE_RESUME` and this
constant must resolve to the same file. Export one and import it in the other —
two literals will drift.

## Hard-facts overlay (small, explicit — NOT inferred from resume prose)
A few gate facts must be deterministic, not LLM-guessed from resume text:

    export const HARD_FACTS = {
      version: 2,              // bump -> invalidates cached grades
      workAuth: { eu: true, germany: true, us: false, sponsorshipNeeded: false },
      german: "A2",            // resume says "full work authorisation" — that's
      peopleManagement: false, // Germany-scoped; US/seniority must not be
      budgetOwnership: false,  // inferred from a line that isn't in the resume.
      startupFounder: false,   // revision 2 — see §Framing rule
    } as const;

Rationale: the resume asserts German work auth and lists no direct reports, but
"can he take a US role" / "has he managed a team" / "did he found a company" are
NOT safely readable from resume prose. These facts drive hard gates G1/G2/G4;
everything else (seniority band, domain fit, skills coverage) the grader reads
from the resume.

## Framing rule (revision 2) — independent products are SIDE PROJECTS
PetraOS, Granitopia, HandelOS/WerkOS, Stone Galleriem, AgentOS and the scout
dashboard are graded as **self-directed side projects**, NOT a founded startup and
NOT a leadership role. This binds in three places:

1. **HARD_FACTS is authoritative over resume prose.** The grader is told
   explicitly: `peopleManagement`, `budgetOwnership` and `startupFounder` are
   FALSE regardless of how the independent-work section reads. It may not infer
   any of the three from the products, the umbrella brand name, or "sold it to a
   paying client".
2. **Where the builds may count.** They are evidence for `mustHaveSkillsCoverage`,
   `domainFit` and shipping/evidence quality. They may NEVER raise the seniority
   band. If a JD requires director/VP, head-of, team leadership, budget ownership
   or "significant leadership experience", **G2 fires** — the shipped products do
   not satisfy it. Inflating my band into director/VP territory would wrongly let
   senior roles pass the gate and violates the standing no-founder-emphasis rule.
3. **Enforced in the resume text.** Because grading reads the file verbatim, the
   base resume must not label the independent work as a venture. Blocking edit
   before this ships (currently the file reads
   `Systems Architect & Product Builder, Vyaparwerk / HandelOS, Berlin (independent)`,
   which grades as a company):

       - Systems Architect & Product Builder, Vyaparwerk / HandelOS, Berlin (independent)
       + Independent Builder — self-directed side projects (Vyaparwerk / HandelOS
       + product family), Berlin

   Keep "one sold to a paying client" — it is employee-neutral proof of skill, not
   a founder claim.

## Data model
Schema (new migration, follow existing migration style in `lib/db/`):

    ALTER scout jobs table ADD:
      fit_grade        TEXT      -- 'A'|'B'|'C'|'D'|'F'|NULL(ungraded)
      fit_assessment   TEXT      -- JSON blob (dimensions + gate fails + verdict)
      graded_at        INTEGER   -- epoch ms
      graded_resume_v  TEXT      -- sha256 of the base-resume text used
      graded_facts_v   INTEGER   -- HARD_FACTS.version used
    Index on fit_grade for the Apply-gate query.

## The rubric (`lib/reco/fit-grade.ts` — pure, unit-tested)
HARD GATES (any true -> grade capped at F, never enters Apply):
  - G1 visa/geo:   role needs work auth I lack (US-only, or non-EU w/o sponsorship).
  - G2 seniority:  requires director/VP/head OR team leadership OR budget ownership
                   OR "significant leadership experience". Judged against
                   HARD_FACTS, not against the side projects.
  - G3 specialism: a hard disqualifier (deep ML/robotics research, PhD-required,
                   licensed profession) appears as a MUST-have.
  - G4 language:   mandatory native/fluent (C1+) German.
WEIGHTED DIMENSIONS (0–100 each; only scored if no hard gate) -> composite:
  seniorityFit 30 · domainFit 25 · mustHaveSkillsCoverage 25 · langLocationFit 20.
GRADE BANDS: A >=85 · B 70–84 · C 55–69 · D 40–54 · F <40 or any hard gate.

    export function gradeFromAssessment(a: Assessment): 'A'|'B'|'C'|'D'|'F'
    export const APPLY_ALLOWED_GRADES = ['A','B'] as const;

## LLM grader (`lib/reco/grade-job.ts` — ONE reusable fn, looped over rows)
- Input: JD text (full, not title) + BASE RESUME text + HARD_FACTS + the rubric +
  the framing rule as an explicit system-prompt clause.
- Output: STRICT JSON, schema-validated, retry on parse fail:

      { hardGateFails: ["G2", ...], dimensions: {seniorityFit, domainFit,
        mustHaveSkillsCoverage, langLocationFit}, oneLineVerdict }

- Grade is computed in code by `gradeFromAssessment` (LLM scores dimensions/gates;
  code owns the thresholds — no "LLM picks the letter").
- Call via the existing `claude -p` seam (`lib/llm-cli.ts`, same pattern as
  `lib/kit/grade.ts`); low temperature; model from env (default repo Sonnet).
- Cache: skip re-grading a row whose `graded_resume_v` == current resume hash AND
  `graded_facts_v` == HARD_FACTS.version AND JD unchanged.

## Apply-gate wiring
- Discover -> "To apply" promotion (the JOBDASH-009 auto-add path in
  `lib/scout-autosync.ts` AND any manual "add to apply" action) must check
  `fit_grade ∈ APPLY_ALLOWED_GRADES`.
  - A/B -> allowed into "To apply".
  - C   -> "Review" lane (visible, needs my click; not auto-added).
  - D/F -> stays in Discover, row shows the grade + oneLineVerdict + failed gate.
- Ungraded (`fit_grade NULL`) is NOT apply-eligible — grade first.
- Surface grade chip + reason in the Discover row and the detail pane.

## Grading triggers
- On scrape/import (scout-sweep) for each new/changed posting.
- On resume change (`resumeVersion` differs) or HARD_FACTS.version bump:
  background re-grade of stale rows. Grades stay in lockstep with the current CV.
- Manual "re-grade" action on a row.

## Backfill
One-shot: grade all existing Discover + "To apply" rows. Any currently-in-
"To apply" row that now grades C/D/F is flagged, not silently deleted — surface
"was added before fit-grade; now grades D" so I decide.

## Tests (`lib/reco/__tests__/fit-grade.test.ts`) — fixtures REQUIRED
Rubric unit tests (pure, no LLM):
  - hard gate each of G1–G4 -> 'F'.
  - dimension combos -> correct band boundaries (84->B, 85->A, 40->D, 39->F).
Grader integration (mock the LLM seam; assert parse+grade, not model output):
  - AbbVie "Senior AI Leader, Europe"       -> F (G2 seniority: team + budget).
  - AbbVie "Senior Analyst, AI & Automation, North Chicago" -> F (G1 US visa).
  - Veeva Associate Consultant Program (EU) -> A or B.
  - CloudBee founding TECHNICAL hire        -> D/F (G3 specialism).
  - A German-mandatory (C1) mid role        -> F (G4) or D.
Revision-1 test — proves the grader reads the document, not a hardcoded list:
  - a JD demanding "SAP MM + JIT material flow" scores high
    `mustHaveSkillsCoverage` BECAUSE those are on the base resume.
Revision-2 tests — the framing rule:
  - `HARD_FACTS.startupFounder === false` and the grader prompt carries the
    side-project clause (assert on the composed prompt string).
  - An executive JD ("Head of AI, own the roadmap and a team of 6") still grades
    F via G2 even though the resume lists five shipped products and a sale.
  - Base-resume guard: the resolved base-resume text contains no founder tokens
    (`/\b(founder|co-?founder|CEO|my (startup|company))\b/i`). Fails loudly if a
    future resume edit reintroduces venture framing.

## Ship gate (both must return zero blockers)
- [ ] `npm run build` passes.
- [ ] code-reviewer agent on the diff -> 0 blockers.
- [ ] qa-runner on lib/reco + the gate module -> 0 failures.
- [ ] Restart :3312, smoke-test: a US/executive fixture shows in Discover graded F
      and is blocked from "To apply"; a Veeva-type fixture grades A/B and is
      allowed. Give me the localhost link BEFORE any deploy (preview-before-prod).

## Rollback
Grades live in additive columns; the gate reads them. Feature-flag the gate
(`FIT_GRADE_GATE=on`) so it can fall back to JOBDASH-009 behaviour instantly.

## EVOLUTION (INTEL-P1)
Log the delta: title-only scoring let executive + wrong-geo roles reach Apply;
fix = JD-level fit grade with hard gates, graded against the real base resume with
a small deterministic hard-facts overlay. Record in EVOLUTION.md (or an explicit
"no failures") in the same session the ticket is built.

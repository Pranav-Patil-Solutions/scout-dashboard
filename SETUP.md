# Job Scout — Setup Guide

A personal job-application command center: track applications through a pipeline,
discover roles, and generate tailored resumes + cover letters with AI.

Next.js 16 · SQLite/Turso (Drizzle) · runs locally for free, or deploys to Vercel.

---

## What you need first

1. **Node.js 20+** and npm.
2. **Claude Code CLI**, installed and logged in with your own account. The AI
   features (Kit Studio resume/cover generation, email classification) run
   through *your* `claude` CLI on *your* subscription — no API key, no token.
   Verify it works:
   ```bash
   claude -p "say ok"
   ```
   If that prints a reply, you're set.
3. **Your resume as an HTML file** (used as the base for AI-tailored kits).

---

## Quick start (local — recommended)

```bash
npm install
cp .env.example .env.local        # then edit it — see below
npm run db:migrate                # creates the database schema (empty)
npm run dev                       # → http://localhost:3312
```

Open http://localhost:3312. That's it — no login needed for local use.

> **Do NOT run `npm run db:seed`.** That seeds a specific person's sample
> pipeline. You want an empty board that fills with *your* applications.

---

## Configure `.env.local`

Only three things matter to get running. Everything else has a safe default.

```ini
# 1. LLM transport — use your own Claude Code CLI (free on your subscription).
#    No ANTHROPIC_API_KEY, no token. Just have `claude` installed and logged in.
LLM_TRANSPORT=claude-cli

# 2. Your resume (absolute path to an .html file) — powers Kit Studio.
KIT_BASE_RESUME=/absolute/path/to/your-resume.html

# 3. Database — leave blank to use a local file (scoutdash.db). Fine for one user.
#    Only fill these if you deploy to the cloud (see below).
# TURSO_DATABASE_URL=
# TURSO_AUTH_TOKEN=

# Optional — a job feed for the Discover page (see "Discover feed" below).
JOBSCRAPER_DB_PATH=./sample/jobs.db

# Optional — email sync. Leave off unless you set up a Gmail source.
ENABLE_GMAIL_SYNC=false
```

---

## What each page does

| Page | What it's for |
|------|---------------|
| `/` Command Center | Action queue, funnel, weekly velocity |
| `/pipeline` | Kanban board — drag applications between statuses |
| `/applications` | Full table + detail drawer per application |
| `/analytics` | Response/interview rates, fit-vs-outcome |
| Discover | Browse fit-ranked roles → one-click apply + auto-track |
| `/studio` Kit Studio | Paste a job description → AI-tailored resume + cover, graded to a target score |

---

## Retarget for YOUR job role (important)

This app was tuned for one person's job search (an "AI Operations" profile,
Berlin, English-first startups). The fit scores, "why you match" reasons, and
rankings are all judged against *that* career. **In a different field, retarget
these two spots or every score will be wrong for you.**

**1. The scoring persona + gates** — [`lib/constants.ts`](lib/constants.ts), the
`SCOUT_SCORING_PROMPT` string. Rewrite it for you:
- Replace the person description ("You score one job posting for … 5 yrs
  procurement…") with *your* background, skills, and what a great role looks like.
- Rewrite the **HARD GATES** (currently: English-first, startup/scaleup only,
  EU-reachable). Change these to your must-haves — location, seniority, industry,
  language — or delete gates that don't apply to you.
- Rewrite the **RUBRIC** so the roles *you* want score high and the ones you'd
  reject score low.

**2. The role buckets** — [`lib/constants.ts`](lib/constants.ts), `ROLE_BUCKETS`.
These regexes drive the analytics breakdown ("which role types reject me").
Swap them for the role families in your field (e.g. for a designer:
`product|ux|ui`, `brand|visual`, `motion`, etc.).

**3. Your resume** — `KIT_BASE_RESUME` in `.env.local` points at your resume, so
AI-tailored kits are built from *your* experience, not a template.

> If you also use the Python **jobscraper** to feed Discover, the same scoring
> rules are mirrored there (`gates.py`, `scoring.py`, `llm_rank.py`). Retarget
> those to match, or your feed keeps surfacing the wrong roles. If you're only
> tracking applications manually (not using the scraper), you can ignore the
> scraper files entirely.

---

## Discover feed (optional)

The **Discover** page reads roles from an external SQLite database at
`JOBSCRAPER_DB_PATH`. Without one, Discover is simply empty — the rest of the
app works fully. To populate it, point `JOBSCRAPER_DB_PATH` at a job-scraper
database, or use it purely as a manual tracker via `/applications`.

---

## Deploying to the cloud (optional)

If you want it online instead of just on your machine:

1. Create a **Turso** database, put its URL + token in `TURSO_DATABASE_URL` /
   `TURSO_AUTH_TOKEN`, and run `npm run db:migrate` against it.
2. Deploy to **Vercel**.
3. Protect it with HTTP Basic auth by setting these in Vercel's env vars:
   ```ini
   BASIC_AUTH_USER=you
   BASIC_AUTH_PASS=a-strong-password
   ```
   When both are set, the whole site requires that login. Locally they're
   absent, so local dev stays open.

> The AI features still call the Claude CLI, which lives on *your machine*. In a
> cloud deployment those specific features need a machine that has `claude`
> available. For pure application tracking, the cloud deploy works standalone.

---

## Common commands

```bash
npm run dev          # local dev server on :3312
npm run build        # production build
npm run start        # run the production build on :3312
npm run db:migrate   # apply schema to the configured database
npm run db:studio    # browse the database in a GUI
npm run test         # run the test suite
```

## Troubleshooting

- **AI features do nothing / error** → check `claude -p "hi"` works in your
  terminal, and that `LLM_TRANSPORT=claude-cli` is set.
- **Kit Studio can't find your resume** → `KIT_BASE_RESUME` must be an
  *absolute* path to an existing `.html` file.
- **Discover is empty** → expected unless `JOBSCRAPER_DB_PATH` points at a real
  feed database.
- **Board is empty** → also expected — it fills as you add/apply to roles. Don't
  run `db:seed`.

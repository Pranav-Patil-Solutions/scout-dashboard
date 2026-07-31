# Job Scout

Paste a JD, get a tailored CV + cover letter in the navy/stone template, and track the application.

## Setup

Personal data (phone, email, headshot) is kept out of git. First-time setup:

```bash
cp contact_local.example.py contact_local.py   # then fill in your real email/phone
# drop a circular headshot at ../headshot-circular.png (optional; skipped if absent)
pip install python-docx Pillow                 # or use an existing venv
```

`contact_local.py`, `headshot-circular.png`, `applications.csv`, and real `jobs/*.json`
are gitignored — only the engine, the `_template.json`, and this README are tracked.

## The flow

1. **You** paste a job description (or send an Indeed link).
2. **Claude** writes `jobs/<slug>.json` with only the tailoring for that JD
   (headline, sidebar summary, skills emphasis, cover-letter body).
3. **Build:** `../.venv/bin/python jobscout.py build <slug>`
   - writes `~/Desktop/Applications/<slug>/Pranav-Patil-CV-<Company>.docx`
   - writes `...-CoverLetter-<Company>.docx`
   - upserts a row in `applications.csv` (status `to_apply`)
4. **Track** as you go: `status <slug> applied` / `interview` / `offer` / `rejected`.

## Files

| File | Role |
|---|---|
| `profile.py` | Master CV content, the single source of truth. Edit once, every doc updates. |
| `render.py` | The navy/stone CV + cover-letter renderers (design is locked to the canonical template). |
| `jobscout.py` | CLI + CSV tracker. |
| `jobs/<slug>.json` | Per-job tailoring. Anything omitted falls back to `profile.py`. |
| `jobs/_template.json` | Copy this to start a new job spec. |
| `applications.csv` | The tracker. |

## Commands

```bash
cd ~/Desktop/CV-Template/jobscout
PY=../.venv/bin/python

$PY jobscout.py build   voize                 # generate docs + track
$PY jobscout.py status  voize applied          # update status (stamps applied_date)
$PY jobscout.py list                           # print the pipeline
$PY jobscout.py scout   --slug x --company "X" --role "..." --url "..."   # log a lead, no docs yet
```

## What gets tailored vs. what stays fixed

- **Fixed (in `profile.py`):** experience, education, contact, languages, tools. Never re-typed per job.
- **Tailored (in `jobs/<slug>.json`):** the headline under the name, the sidebar summary,
  the skills / core-focus emphasis, and the whole cover-letter body.

## Three requested extras

- **Track application status** — the `status` column + `status` command (new → to_apply → applied → interview → offer/rejected).
- **Pull full job details** — Claude fetches the full JD (via Indeed) before writing the spec, so tailoring is grounded in the real text, and drops key facts into `notes`.
- **Auto-refresh new roles** — Claude re-runs the Berlin founder-associate search and `scout`s any new posting into the tracker as `new`; you decide which to `build`. (Ask Claude to "refresh job scout" to run a pass.)

## Convention

No em dashes anywhere in generated prose. English C1 / German A2 stated honestly in cover letters.

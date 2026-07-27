# Scout

An **AI-powered job-search command center** — one dark, single-pane dashboard that turns a chaotic job hunt into a managed pipeline: sync your inbox, triage every opportunity, track applications end-to-end, and let AI draft the outreach.

## What it does

- **Inbox sync** — pulls job-related mail and postings into one place.
- **Pipeline & triage** — a Kanban-style board of every application with drag-and-drop stages and fast triage.
- **AI studio** — generates tailored proposals, application kits, and rejection-narrative analysis with the Anthropic SDK.
- **Live posting checks** — re-probes postings to flag ones that have closed.
- **Analytics** — conversion, response, and stage-velocity metrics across the whole funnel.

## Stack

Next.js 16 (App Router) · React · TypeScript · [Anthropic SDK](https://docs.anthropic.com) · Drizzle ORM + libSQL · Recharts · dnd-kit · Framer Motion · Playwright · Tailwind · Vitest

## Run it

```bash
npm install
npm run db:generate && npm run db:migrate && npm run db:seed
npm run dev        # http://localhost:3312
```

```bash
npm run build && npm start   # production (port 3312)
npm test                     # vitest
npm run db:studio            # Drizzle Studio
```

## Routes

| Route | Purpose |
|-------|---------|
| `/` | Overview |
| `/inbox-sync` | Pull & connect sources |
| `/pipeline` | Application pipeline board |
| `/triage` | Fast triage queue |
| `/command` | Command palette / actions |
| `/analytics` | Funnel metrics |
| `/studio` | AI generation studio |

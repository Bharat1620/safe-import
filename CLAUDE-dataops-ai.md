# DataOps AI

An enterprise data onboarding workspace. Ingests messy customer CSV exports, maps their
columns onto a canonical schema using LLM inference with confidence scores, validates
every row, and lets a human fix problems in a hand-written editable grid before
committing clean data to Postgres in one transaction.

> **AI makes recommendations. Humans make decisions.**

Positioned as a workspace, not an importer. The difference matters on a resume and in
the demo — it must not leak into the build order.

## Why this project exists

Portfolio project with a hard deadline of **Aug 31, 2026**. It serves two interview
tracks and a third as a checkbox:

- **Senior frontend** — the editable grid is the signal (virtualization, diff-based
  undo/redo, range selection, clipboard, per-cell validation, keyboard navigation,
  ARIA, render performance)
- **Full stack** — the pipeline is the signal (schema design, migrations, staged vs
  committed data, transactions, database-enforced constraints, background jobs,
  server-side pagination)
- **AI literacy** — column mapping with confidence and a measured eval set. Small,
  bounded, verifiable.

**Chosen over a semantic photo library for one reason: it teaches backend in the right
order.** One new system (Postgres via FastAPI) instead of five, and the concepts arrive
in sequence — schema, migration, query, transaction, constraint — each traceable in a
single request. Pipelines and vector search come next, in the September project, once
these fundamentals are in hand.

Implication: **prioritize things I can defend in an interview over things that look
finished.** A narrower feature I fully understand beats a broader one I don't.

Target: 40–50 minutes of conversation. That comes from the number of decisions I can
defend with specifics, not from feature count.

## Canonical schema

| field | type | rules |
|---|---|---|
| `full_name` | str | required, non-blank |
| `email` | str | required, must parse as email, dedupe key |
| `phone` | str | optional, normalized to one format |
| `company` | str | optional |

One schema. Multi-schema support is a cut, not a goal.

## User flow

1. **Upload** — drop a CSV. Parse it, strip BOM, store rows as *staged* data. Nothing
   touches the contacts table. Files above a threshold go to a background worker with
   progress streamed to the UI.
2. **Map columns** — send headers plus ~5 sample values per column to the LLM, get back
   `{column, field, confidence}`. Low-confidence mappings surface first. Human confirms
   or overrides. Block progress until required fields are mapped.
3. **Fix rows** — validate every staged row, return field-level errors. The grid shows
   per-cell errors and duplicate warnings. Human edits inline, in bulk, or accepts a
   suggested transformation.
4. **Commit** — either import valid rows and export a rejects file, or block the whole
   import in one transaction. User chooses; both are defensible.

## Stack

- **Frontend** — React + TypeScript + Vite, Tailwind, TanStack Query (server state),
  Zustand (edit buffer + undo stack), react-dropzone, Papa Parse, Zod, Vitest, Playwright
- **Grid** — `react-virtual-sheet`, built standalone first (spec below). Windowing is
  hand-written.
- **Backend** — Python, FastAPI, Pydantic, SQLAlchemy, Alembic, pytest
- **Data** — Postgres (Neon)
- **LLM** — direct Anthropic SDK calls, structured outputs
- **Jobs** — a `jobs` table and a polling worker. No Celery, no Redis.
- **Deploy** — Docker Compose locally; Vercel (web) + Fly.io (api, worker)

Not Next.js. One dense interactive surface with a separate Python API — routing and
server components buy nothing here and add a second server to reason about.

## Routes

Exactly two, plus URL state. Every additional page must introduce a *problem*, not just
a screen.

- `/imports` — list of past imports with live status for running jobs. Exists to create
  the stale-cache-across-views problem and force a real answer about invalidation.
- `/imports/:id` — the grid.
- Grid filter and selected row live in the query string, so `?filter=errors&row=1240`
  restores the exact view. URL as source of truth, scroll and focus restoration.

**Not building:** settings, dashboard, profile, landing page, help. Screens without
problems behind them.

Build both routes in the Aug 29 slot, not earlier — maintaining them through every data
model change is wasted effort.

## Backend concepts I need explained, not assumed

Frontend engineer, no backend experience. Explain the concept before the code:

- transactions and rollback
- unique constraints, and why a pre-check in Python races
- indexes, and why a query gets slow
- migrations and why they run in order
- connection pooling
- what a worker process is and how it differs from the API process
- cursor vs offset pagination
- server-sent events
- idempotency keys

## Don't

- **Don't reach for AG Grid, MUI DataGrid, or any table library.** Cell editing,
  selection, and undo are the senior FE signal — hand-written, no exceptions. Windowing
  is hand-written too, timeboxed, with react-window as a documented fallback.
- **Don't add LangChain or any LLM framework.** It hides the mechanics I need to explain.
- **Don't use AI for deduplication.** Dedupe on normalized email is deterministic and
  correct. A model makes it slower, unverifiable, and worse.
- **Don't add a "data quality score."** A number nobody can check is worse than none.
- **Don't add Redis, Kafka, Kubernetes, or microservices.** A monolith I can fully
  explain interviews better than architecture I inherited.
- **Don't use Redux.**
- **Don't build the landing page before the grid.** A README with a demo GIF does the
  same job better and costs an hour instead of a week.
- **Don't write large amounts of the Python for me unprompted.** Backend is my weakest
  evidence area, so I need to write it. Explain, critique, and review instead of
  generating — and when I ask for code, keep it small enough that I can read every line.
- **Don't polish.** Polish is timeboxed to Aug 29.

## Explicitly not building

Considered and rejected — recorded so they don't return in week four:

- analytics dashboard, import statistics, data quality trends
- audit log UI (the command stack already gives me the story)
- Excel support
- mapping templates
- multi-schema support
- AI-suggested deduplication

## Key design decisions (keep these; they're interview answers)

- **Undo/redo is a command stack of cell-level diffs**, not snapshots — so "normalize
  all 4,000 phones" is one undoable command and memory stays flat regardless of dataset
  size. This is the headline answer.
- **Staged table separate from committed table** — the human approves before anything is
  written, which makes the commit a single transaction.
- **Dedupe is enforced by the database.** A unique index on normalized email, and the
  commit path handles the violation. A Python pre-check races: two concurrent commits
  both read "no duplicate" before either writes.
- **Within a file: first occurrence wins, later ones flagged not dropped.**
- **Ingest is transactional and idempotent.** The import row and its jobs are created in
  one transaction, with an idempotency key so a retried upload doesn't produce a second
  import.
- **Confidence scores drive UI priority**, not just display — low-confidence mappings
  surface for review first.
- **The grid fetches windows from Postgres**, it never holds the file in memory. This is
  what makes 500k rows possible and it makes frontend and backend one story.
- **Large imports run as background jobs** with progress over SSE. The request returns
  immediately; the work outlives it.
- **Transformation suggestions are proposals, never actions.** The model may say "these
  400 phones look like `+91 XXXXX`" — applying it is one undoable bulk command the human
  triggers.

## Evals

20 header sets with expected mappings. Exact-match on `{column → field}` — no
LLM-as-judge, this problem doesn't need one. Run before and after every prompt change
and record the delta in `DECISIONS.md`. Track confidence calibration separately: when
the model says 95%, is it right 95% of the time?

Record the starting accuracy. The improvement from first prompt to last is a resume line.

## What exists when — the link must never be empty

Applying from early August, so a URL has to be showable at every point:

| date | what an interviewer can open | how to describe it |
|---|---|---|
| Jul 27 | deployed page rendering staged rows | don't send this — it only proves the pipeline exists |
| **Aug 6** | **`react-virtual-sheet` — standalone, deployed, benchmarked, README'd** | **"a virtualized editable grid I built from scratch; it's the core of a data onboarding tool I'm finishing this month"** |
| Aug 16 | grid + real ingest, validation, background jobs | "the app around it — mapping lands next week" |
| Aug 31 | the whole thing, with a measured mapping accuracy number | the full pitch |

**Aug 6 is the commitment.** A component demo with a benchmark page is a normal,
respected thing for a frontend engineer to show and needs no apology for being part of
something larger.

## Who writes what

I write anything that could appear in a resume bullet or be asked about in an interview.
Claude writes the rest. The split is not negotiable mid-build — catching myself asking
Claude for something in the left column means I'm behind and should cut scope instead.

| mine | Claude's |
|---|---|
| windowing and virtualization | Docker Compose, GitHub Actions |
| cell editing lifecycle | Alembic setup and migration boilerplate |
| range selection model | SQLAlchemy model scaffolding |
| clipboard copy / TSV paste | plain CRUD endpoints |
| undo/redo command stack | pytest / Vitest scaffolding |
| validation pipeline | Vercel and Fly config |
| dedupe and commit transaction | seed scripts, messy CSV fixtures |
| background worker logic | dependency and env setup |
| paginated rows endpoint | Papa Parse wiring |
| the eval harness | |
| `DECISIONS.md` and the README | |

Read Claude's scaffolding properly rather than skimming — not to defend it, but so I'm
not lost when it breaks at 11pm.

**After finishing any piece of my own work: close the editor and explain it out loud as
if to an interviewer.** Stalling means I don't own it yet.

## react-virtual-sheet — standalone spec

A headless-ish editable data grid. Its own repo and deployed demo, then imported by
DataOps AI.

**Frozen feature list.** Virtualized rows, inline cell editing, full keyboard navigation
with roving focus and ARIA grid semantics, range selection, clipboard copy and TSV paste
into a range, undo/redo. That is the entire list. **No** formulas, sorting, column
resizing, CSV export, filtering, or column pinning.

**The adapter boundary — design this on day one.** The component never owns the data:

```ts
interface SheetDataSource {
  getTotalCount(): Promise<number>
  getRows(offset: number, limit: number): Promise<Row[]>
  applyEdits(diffs: CellDiff[]): Promise<void>
  getCellErrors?(offset: number, limit: number): Promise<CellError[]>
}
```

Standalone demo backs this with a generated in-memory array. DataOps AI backs it with
paginated FastAPI calls against Postgres. Same component, different adapter, no rewrite.
Rows arrive async and may be absent — render placeholders for windows not yet loaded.

**Virtualization: fixed row height, timeboxed, with an escape hatch.** Row height is a
constant — no variable heights, no measurement. That leaves roughly fifty lines:
`startIndex = floor(scrollTop / rowHeight)`, render a slice plus overscan. **Timebox: 2
days.** If it isn't smooth by day 3, install react-window, move on, and record the
decision — the undo stack is the rarer signal and must not be squeezed.

Ceiling worth noting in the README: browsers cap element height around 17M px (Firefox)
to 33M px (Chrome), so at 26px rows that's ~650k rows before the scroll container itself
breaks. Cap the demo at 500k and say why. Noticing this is a better interview detail than
the virtualizer.

Focus management and selection across virtualized rows are my problem either way — a
windowing library doesn't solve those.

**Undo is the headline, not virtualization.** Windowing is table stakes. A command stack
of cell-level diffs, where a 10,000-cell paste is a single undoable command with flat
memory, is the rare part. Lead with it in the README.

**Benchmark panel.** Row count, scroll FPS, DOM node count, heap, undo depth, time to
first paint. One hour; it turns resume adjectives into numbers.

**Resume lines this produces:**

- Built a virtualized spreadsheet component from scratch — 500k rows at 60fps with ~40
  DOM nodes live at any time, no table library
- Implemented undo/redo as a command stack of cell-level diffs; a 10k-cell paste is one
  undoable command and memory stays flat regardless of dataset size
- Range selection, clipboard TSV paste, and full keyboard navigation with roving focus
  and ARIA grid semantics

## Build order

| when | milestone |
|---|---|
| Jul 27 | two hours only: skeleton deployed. Upload → parse → render staged rows → live public URL. A URL must exist while I build. |
| Jul 28 – Aug 6 | `react-virtual-sheet` standalone: virtualization, cell editing, keyboard nav, range selection, clipboard TSV paste, cell-diff undo/redo, benchmark panel. Deployed, README, frozen feature list. |
| — one evening each week | backend, specifically the endpoint the adapter will call: `GET /rows?offset&limit` plus `GET /rows/count`. Keeps Python warm; makes integration an adapter swap. |
| Aug 9 | backend spine: staged table, Alembic, transactional and idempotent commit, unique index on normalized email with violation handling |
| Aug 16 | scale + data layer: messy fixtures, field-level validation, partial-import path, background worker for large files with SSE progress, server-side pagination behind the adapter |
| Aug 23 | LLM mapping: inference + confidence, 20-case eval set, graceful failure when the model is down or returns malformed JSON |
| Aug 29 | `/imports` list route, URL-encoded grid state, then timeboxed polish — 4 hours. Loading, empty and error states first. |
| Aug 31 | auth, README with architecture reasoning and demo GIF, rehearsed 3-minute demo |

If behind, cut in this order: transformation suggestions → auth → `/imports` route →
SSE progress (keep the worker) → bulk edit.
**Never cut the grid, the eval set, the transactional commit, or the deploy.**

If Aug 16 slips, cut from Aug 29 — not from the eval set.

## Demo script (3 minutes, rehearsed)

1. Drop a deliberately horrible CSV — wrong headers, BOM, blank rows, duplicate emails. (15s)
2. Show the AI mapping with confidence scores. Override the 63% one. (30s)
3. Grid loads 500k rows. Scroll fast. Point at the row count and the frame rate. (30s)
4. Bulk-normalize a phone column. Undo. Redo. Say the words "command stack of diffs,
   not snapshots." (40s)
5. Commit. Show the rejects file and the transaction. (30s)
6. Show the eval output: mapping accuracy before and after prompt v3. (20s)

Step 4 is the one they'll remember.

## Decisions log

Append to `DECISIONS.md`: what I chose, what I rejected, what broke, what I measured.
Every entry is a potential interview answer — this file matters as much as the code.

Numbers to capture as they happen: rows rendered at 60fps, DOM nodes live, memory before
and after the diff-based undo change, mapping accuracy per prompt version, commit time
for 100k rows, p95 latency of the paginated rows endpoint.

## After Aug 31

Ship first, then extend — driven by interview feedback rather than feature appetite.
Likely order: accessibility verification with a real screen reader → Excel support →
mapping templates → multi-schema → auth with real multi-tenancy.

Then the semantic photo library as the September project, which reuses FastAPI,
migrations, jobs, and deployment, leaving object storage and vector search as the only
genuinely new parts.

## About me

Frontend engineer, 4 years. Strong React, TypeScript, Next.js. No backend experience —
learning Python, FastAPI, and Postgres through this project. Explain backend idioms when
they come up rather than assuming familiarity. Roughly 3 hours on weekdays, one longer
weekend block. Applying to senior frontend and full-stack roles from early August, so
the deployed URL matters before the feature set does.

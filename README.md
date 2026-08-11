# Safe Import

A data onboarding workspace. It takes a messy CSV export, works out which of its
columns map onto a fixed contact schema, validates every row, lets a human fix
the problems in an editable grid, and commits the clean rows to Postgres in a
single transaction.

**[Live app](https://safe-import.vercel.app) · [API docs](https://safe-import-nf62.onrender.com/docs)**

> The model recommends. The human decides. The database enforces.

---

## Why it exists

Every tool that accepts customer data hits the same three problems, and they are
more interesting than they look:

1. **The columns are never what you expect.** `Full Name`, `Contact Person`,
   `Col3`. You cannot validate anything until you know which column is which.
2. **The data is dirty and someone has to fix it.** Which means an editable grid
   over data too large to hold in the browser.
3. **Half an import is worse than none.** Which means transactions, and
   deduplication that survives two people committing at once.

## How it works

```
CSV upload
   ↓  headers + 5 sample values per column  →  Gemini  →  {column, field, confidence}
   ↓
staged_rows          validated per field, nothing real yet
   ↓  human fixes cells in a virtualized grid, paginated from Postgres
   ↓
COMMIT               one transaction, dedupe enforced by a unique index
   ↓
contacts             clean, canonical, plus a rejects file for the rest
```

## Things worth knowing

**Undo is a command stack of cell diffs, not snapshots.** Each entry is a list of
`{row, column, before, after}`, so undo is the same list applied with the two
fields swapped — there are no reverse operations anywhere in the codebase. A
10,000-cell paste is one entry and one Ctrl+Z, and memory grows with edits made
rather than with dataset size.

**The grid never holds the file.** It renders ~40 rows into the DOM and keeps a
sliding window of ±3 chunks (~1,400 rows) in memory, evicting the rest. Heap is
flat whether the import is 5,000 rows or 500,000. Row height is fixed, so row N
is at `N × 26px` and nothing has to be measured.

**Deduplication is the database's job.** A unique index on a normalized email
column, not a `SELECT` before the `INSERT`. Two concurrent commits would both
read "no duplicate" before either wrote — Postgres is the only thing that can
serialise them, so the code attempts the insert and handles the violation.

**Staged and committed data live in different tables.** Invalid rows have to be
storable so a human can see and fix them, and `contacts` has constraints that
would reject them. Staging also makes the commit a single atomic event rather
than a stream of inserts to unwind on failure.

**Commit is the user's choice.** Import the valid rows and download the rest as
a rejects file, or reject the whole import unless every row is valid. Both are
defensible for different data, so the UI asks.

**The LLM is used for exactly one thing.** Column mapping is genuinely fuzzy —
no alias list anticipates `Col3`. Deduplication is not: normalized string
equality is exact, instant, and enforceable by an index. Using a model there
would be slower, unverifiable, and worse.

## Mapping accuracy

`evals/cases.json` holds 20 header sets with known-correct answers, 81 columns in
total, scored on exact match.

```
heuristic alias matching     62/81   77%
gemini-2.5-flash             74/81   91%

calibration
  claimed ≥90% confidence    44/44  100% correct
  claimed  <90% confidence   30/37   81% correct
```

The calibration matters as much as the accuracy: it is why the mapping UI sorts
least-confident first. When the model hedges, that is genuinely where the
mistakes are.

```bash
uv run python -m evals.run heuristic   # baseline
uv run python -m evals.run             # with the model
```

The model falls back to the heuristic mapper whenever it is unavailable,
rate-limited, or returns unusable JSON. A mapping failure must never block an
import.

## Stack

| | |
|---|---|
| frontend | React, TypeScript, Vite, Tailwind — deployed on Vercel |
| grid | hand-written, no table library |
| backend | FastAPI, SQLAlchemy, Alembic — Docker image on Render |
| database | Postgres on Neon |
| mapping | Gemini via direct HTTP, structured output, no framework |

## Running it

```bash
# api
cd api
cp .env.example .env          # add your Neon URL and Gemini key
uv run alembic upgrade head
uv run uvicorn app.main:app --reload

# web
cd web
npm install
npm run dev
```

The frontend proxies `/api` to `localhost:8000` in development, so there is no
CORS to configure locally.

`fixtures/messy.csv` has a blank name, a malformed email, an unparseable phone,
and a duplicate that differs only by case and trailing whitespace.
`fixtures/opaque.csv` has headers named `Col1`–`Col4`, which the heuristic mapper
cannot resolve and the model can.

## Known bounds

- The demo caps at 500,000 rows because browsers limit element height to roughly
  17M px (Firefox) to 33M px (Chrome), which at 26px rows breaks the scroll
  container somewhere near 650k.
- The undo stack is unbounded. Every edit is small, but nothing trims it.
- Background jobs are triggered by request rather than by a queue. The jobs table,
  batching, and resume-from-progress are real; only the trigger is simplified.
- The API sleeps after 15 minutes idle on Render's free tier, so the first
  request after a quiet spell takes around a minute.

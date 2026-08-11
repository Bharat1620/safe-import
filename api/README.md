---
title: Safe Import API
emoji: 📥
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
---

# Safe Import API

FastAPI backend for [Safe Import](https://github.com/Bharat1620/safe-import) — CSV
ingestion with column mapping, per-field validation, and a transactional commit
into Postgres.

Interactive docs at `/docs`.

## Endpoints

| | |
|---|---|
| `POST /imports` | upload a CSV; stages inline when small, creates a job when large |
| `GET /imports/{id}` | status, detected headers, current mapping |
| `PUT /imports/{id}/mapping` | re-stage under a different column mapping |
| `POST /imports/{id}/process` | run a queued import's staging job |
| `POST /imports/{id}/commit` | staged rows into contacts, one transaction |
| `GET /imports/{id}/rows` | one window of rows, for the virtualized grid |
| `PATCH /imports/{id}/rows` | apply a batch of cell edits |
| `GET /jobs/{id}` | progress for a background import |

## Configuration

| variable | |
|---|---|
| `DATABASE_URL` | Postgres connection string, pooled endpoint |
| `CORS_ORIGINS` | comma-separated origins allowed to call the API |
| `INLINE_ROW_LIMIT` | rows processed during upload before a job is used |

Migrations run automatically at container startup.

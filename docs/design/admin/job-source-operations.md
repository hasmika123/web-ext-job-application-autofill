# Job-source operations: ingestion health, per-source sync, retries, run history, quality

Area `admin`. Stories: A6.*. Existing: `job_source` + `job_posting` (20260922070000), `JobSourceService`, `JobIngestService` (all boards at once, in-memory `running` flag, auto-disable after 5 consecutive failures), `JobIngestScheduler` (02:00 UTC), `JobMatchScheduler` (04:00 UTC), `HttpJobBoardClient` (10 s connect / 30 s request / 400 ms between calls, no retry), `AdminJobSourceResource` (`GET`, `POST`, `PUT /{id}`, `POST /run`, `POST /match`), seed `config/job-sources.csv` (217 boards). Web: `JobSourcesBoard.tsx` with real list/add/toggle/run/match and SAMPLE charts (`PERF_*`, `SYNC_*`). Constraints: public ATS JSON APIs only, one licensed aggregator later, **never scraping**.

## 1. Decisions

| # | Decision |
|---|---|
| D1 | **Every run and every per-source fetch becomes a row.** `ingest_run` (one per nightly/manual run) and `ingest_source_run` (one per source per run) replace the in-memory `running` flag and the `last_*` columns as the truth; `job_source.last_*` stay as a denormalised cache. This is what makes "sync history" and "source performance" real. |
| D2 | **Per-source actions**: `sync` (fetch one board now), `test` (live check without saving postings), `retry` (sync + reset `consecutive_failures`), `pause`/`resume`, `rename`, `archive` (soft; never hard delete, the seed must not resurrect it: `archived_at` wins over CSV sync). Bulk = the same actions over selected ids, each audited once with the id list. |
| D3 | **Retry policy in the client, bounded and polite**: 3 attempts with 2 s / 8 s / 30 s backoff on 5xx and timeouts only; 404/410 = board gone (`last_status=GONE`, no retry, auto-pause after 2 nights); 429 = respect `Retry-After` up to 10 min then give up for the night; never more than one in-flight request per host. |
| D4 | **A run is a job in the scheduled-jobs registry** (observability doc): pause/resume/run-now of the *nightly* lives there; this page shows the per-source view. |
| D5 | **Source types stay ATS-only now** (`greenhouse|lever|ashby` + `workable|smartrecruiters|recruitee` when 16.1 adds them) plus `AGGREGATOR` as a type with its own license fields (`provider`, `monthly_quota`, `used_this_month`) when the licensed API is chosen. The board's "LinkedIn/Indeed" rows are **not** a target (no scraping) — the audit marks them as decorative. |
| D6 | **Quality gates are measured, not just applied**: each source-run records `fetched`, `new`, `updated`, `deduped`, `rejected_age`, `rejected_agency`, `rejected_location`, so the page can show why a source yields little. |
| D7 | **Discovery is visible**: boards found from users' application links (origin `DISCOVERED`) show in a "new this week" strip with approve/pause; discovery never stores who applied. |

## 2. Data model (additive)

```sql
ALTER TABLE job_source ADD COLUMN display_name VARCHAR(200), ADD COLUMN archived_at DATETIME, ADD COLUMN paused_by VARCHAR(50),
  ADD COLUMN paused_reason VARCHAR(255), ADD COLUMN tags VARCHAR(255), ADD COLUMN source_type VARCHAR(20) NOT NULL DEFAULT 'ATS',
  ADD COLUMN provider VARCHAR(40), ADD COLUMN monthly_quota INT, ADD COLUMN used_this_month INT;
CREATE TABLE ingest_run (
  id BIGINT AUTO_INCREMENT PRIMARY KEY, kind VARCHAR(10) NOT NULL,            -- NIGHTLY|MANUAL|SINGLE
  triggered_by VARCHAR(50), started_at DATETIME NOT NULL, finished_at DATETIME,
  status VARCHAR(12) NOT NULL,                                                 -- RUNNING|OK|PARTIAL|FAILED|CANCELLED
  sources_total INT, sources_ok INT, sources_failed INT, postings_fetched INT, postings_new INT, postings_deleted INT,
  error VARCHAR(500), INDEX (started_at)
);
CREATE TABLE ingest_source_run (
  id BIGINT AUTO_INCREMENT PRIMARY KEY, run_id BIGINT NOT NULL, source_id BIGINT NOT NULL,
  started_at DATETIME NOT NULL, finished_at DATETIME, status VARCHAR(12) NOT NULL,  -- OK|FAILED|GONE|RATE_LIMITED|SKIPPED
  attempts INT NOT NULL DEFAULT 1, http_status INT, latency_ms INT,
  fetched INT, new_count INT, updated INT, deduped INT, rejected_age INT, rejected_agency INT, rejected_location INT,
  error VARCHAR(500), INDEX (source_id, started_at), INDEX (run_id)
);
CREATE TABLE ingest_source_daily (day DATE, source_id BIGINT, fetched INT, new_count INT, ok BOOLEAN, PRIMARY KEY (day, source_id));  -- chart feed
```
`job_posting` unchanged. Postings keep the 7-day retention; `ingest_*` rows keep 90 days (purged by the retention job).

## 3. API

```
GET  /api/admin/job-sources?type=&status=&q=&page=       -> paged SourceView + per-source 14-day sparkline from ingest_source_daily
GET  /api/admin/job-sources/overview                      -> {activeSources, failedSources, importedToday, successRate7d, running:{runId,startedAt,progress}, lastRun, nightly:{enabled, nextAt}}
GET  /api/admin/job-sources/runs?page=                    -> ingest_run rows ;  GET /runs/{id} -> with its source runs
GET  /api/admin/job-sources/{id}/runs?page=               -> history for one source
POST /api/admin/job-sources/{id}/sync                     -> 202 {runId} (kind SINGLE); 409 if a run touching this source is active
POST /api/admin/job-sources/{id}/test                     -> 200 {ok, httpStatus, latencyMs, jobCount, sample:[3 titles]} — no writes
POST /api/admin/job-sources/{id}/retry                    -> sync + reset consecutive_failures; audit JOB_SOURCE_RETRY
PUT  /api/admin/job-sources/{id} {enabled?, displayName?, tags?, pausedReason?}   (extends today's enabled-only PUT)
POST /api/admin/job-sources/{id}/archive {reason}         -> HIGH; audit JOB_SOURCE_ARCHIVE
POST /api/admin/job-sources/bulk {ids[], action: sync|pause|resume|retry|archive, reason?}
POST /api/admin/job-sources/run                           -> exists; now creates ingest_run(kind MANUAL) and is audited (gap: not audited today)
POST /api/admin/job-sources/match                         -> exists; audited
GET  /api/admin/job-sources/errors?days=7                 -> grouped {error class, count, sources[]} for the "Recent errors" panel
GET  /api/admin/job-sources/discovered?since=             -> origin DISCOVERED, not yet reviewed
```
`JobIngestService.run()` is refactored into `runSources(List<JobSource>, kind, actor)`; the scheduler and the three triggers call it. The `running` AtomicBoolean becomes "is there an `ingest_run` with status RUNNING younger than 2 h" (durable across restarts; a stale RUNNING is marked FAILED on boot).

## 4. State machines

Source: `ACTIVE -(5 failures | 2× GONE | admin pause)-> PAUSED -(resume/retry)-> ACTIVE`; `ANY -(archive)-> ARCHIVED` (terminal; the CSV sync skips archived tokens). `enabled` stays the column; `PAUSED` = `enabled=false AND archived_at IS NULL`.
Run: `RUNNING -> OK | PARTIAL (≥1 source failed) | FAILED (run-level exception) | CANCELLED (admin)`.

## 5. Failure modes

- Boot with a RUNNING run → marked FAILED "interrupted by restart"; nightly reruns anyway.
- One slow board stalls the run → per-source timeout 30 s, run-level budget 45 min; after the budget, remaining sources are SKIPPED and the run is PARTIAL; alert OPS.
- Dedup key collision across sources → the earlier `first_seen_at` wins; the later source-run counts it under `deduped` (visible, so a mirror board doesn't look broken).
- Aggregator quota exhausted → `RATE_LIMITED` status, `used_this_month` shown against `monthly_quota`, nightly skips it until the 1st.
- Seed CSV removes a token → the source is paused with reason `SEED_REMOVED`, never deleted.

## 6. Security / privacy

Postings are public data; no user data in this area. Discovery stores only the company board token. OPS/ADMIN act; others view. Archive is HIGH because the seed will not bring it back.

## 7. Tests

`HttpJobBoardClientRetryTest` (backoff on 5xx, no retry on 404, honours Retry-After, caps), `JobIngestServiceTest` (PARTIAL when one source fails; durable running flag; interrupted-run boot cleanup), `AdminJobSourceResourceIT` (sync one source writes an `ingest_source_run`; test does not write postings; bulk pause audits once; archived token survives CSV sync; `/run` now audited), web: chart reads `ingest_source_daily` (no `PERF_*` import left; eslint rule `no-restricted-imports` on `sample-data` for this folder).

## 8. Rollout

1. Tables + write rows from the existing run (no UI change). 2. Replace sample charts with real series. 3. Per-source sync/test/retry. 4. Bulk + archive. 5. Discovery strip. 6. Aggregator type when 16.1 picks the provider.

## 9. Mobile wireframe (390px) — triage a failing source

```
┌──────────────────────────────┐
│ Job sources   ● run 02:00 ok │
│ 212 active · 3 failing · 842 │
│ imported today               │
├──────────────────────────────┤
│ ✖ Greenhouse · acme   3 fails│
│   401 token expired · 2h ago │
│   [Retry] [Test] [Pause]     │  <- 44px; Retry shows progress inline
│ ✖ Workday · globex  rate-lim │
│   429 · retry after 10m      │
│   [Retry later ▾]            │
│ ⏸ Ashby · nova   paused by   │
│   maya "seed removed"        │
│   [Resume]                   │
└──────────────────────────────┘
```

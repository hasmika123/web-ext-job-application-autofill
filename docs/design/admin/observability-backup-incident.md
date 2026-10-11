# Observability, scheduled jobs, backups and restore drills, incident response

Area `admin`. Stories: A10.*. Existing: `/admin/system` reads actuator `health/info/jhimetrics/loggers` (real) and shows SAMPLE tiles, deployments, jobs queue, events, resources (`system/sample-data.ts`); 15.1a backup scripts + `verify-restore.sh` + cron file exist in `scripts/ops/` and CI lints them; 15.1b `ErrorDigestService` (ERROR log events → email every ≤ 15 min) is live; **15.1c is OPEN**: no bucket/IAM/Healthchecks/UptimeRobot, the nightly dump has never run, no restore drill has ever been performed (DEPLOY §5, MIGRATION §8, PROGRESS 15.1c). Six `@Scheduled` jobs exist with no registry (UserService cleanup 01:00, ingest 02:00, inbox retention 03:30, matches 04:00, inbox poll */15, error-digest tick). Hosting: one shared box with BeeCompete, Docker Compose, memory is tight (3.7 GB shared).

## 1. Decisions

| # | Decision |
|---|---|
| D1 | **15.1c is the first admin story to ship, and it is mostly a human runbook** (A10.1): create the bucket/IAM/Healthchecks/UptimeRobot, install the cron, run the drill by hand, paste the evidence into `DEPLOY.md`. The admin page then *reads* that evidence (D3). Nothing in this doc replaces 15.1's design. |
| D2 | **A scheduled-job registry in code + a run ledger in the DB.** `ScheduledJobRegistry` lists every job (key, cron, description, owner, pausable); `job_run` records every execution (start, end, status, counts, error). `@Scheduled` methods are wrapped by a `JobRunner` that writes the ledger, honours pause (runtime setting `jobs.<key>.paused`), and supports "run now" via `/api/admin/jobs/{key}/run`. |
| D3 | **Backup and drill status come from Healthchecks.io, not from our own guesses**: the API polls the Healthchecks read-only API (`HC_API_KEY`, read-only) every 10 min into `ops_check` rows (last ping, status, last duration); the System page shows "Last backup 03:17 UTC · 412 MB · ok" and "Last restore drill Sun 04:02 · passed". If `HC_API_KEY` is blank, the page says "Not configured" in red — never green by default. |
| D4 | **Uptime and latency are measured by us too**: a `request_metric_minute` rollup (count, p50, p95, errors per route group per minute, 7-day retention) from a servlet filter → the "API latency p95" and "Error rate" tiles become real; UptimeRobot stays the external truth for "is it up". |
| D5 | **Deployments are recorded by the deploy pipeline**: `deploy.yml` posts `POST /api/admin/deployments` (token-protected, `DEPLOY_HOOK_TOKEN`) with sha, version, actor, started/finished; the API also records its own boot (`BOOT` row with git sha from `/management/info`). The "Recent deployments" panel is real. |
| D6 | **System events = one table for everything an admin should see on the timeline** (`system_event`: deploy, boot, job failed, backup missed, cap hit, kill switch flipped, break-glass used, maintenance toggled, provider errors). Fed by the digest, the job runner, the settings service and the AI alerts. The error digest email keeps going; the page is the searchable history. |
| D7 | **Incident response is a lightweight log, not a tool**: `incident` rows (title, severity, started, resolved, impact, timeline notes, postmortem link) created from admin; a "Declare incident" button on the System page also turns on the status banner (announcement, audience both) and emails admins. The public status page is the announcement banner on the marketing site, nothing more at this size. |
| D8 | **Runbooks live in the repo (`docs/runbooks/*.md`) and the System page links to them by key** (`backup-missed`, `restore`, `provider-down`, `stripe-webhook-failing`, `disk-full`, `memory-pressure`, `rotate-inbox-key`, `break-glass`). The page shows the runbook link next to the matching alert. |
| D9 | **Memory/CPU/disk tiles come from the box via node-exporter-style numbers the API reads itself** (`/proc/meminfo`, `df` on the data volume) through a tiny `HostStats` bean, since we don't run Prometheus/Grafana. Disk > 85 % → system event + digest. |
| D10 | **Maintenance mode** = runtime flag `ops.maintenance` (settings doc). **Restart background jobs** = pause/resume in the registry. **View system logs** = the last 500 ERROR/WARN lines from the in-memory digest appender, not a log viewer. **Export diagnostics** = a JSON bundle (health, info, settings with secrets redacted, last 50 job runs, last 200 system events). |

## 2. Data model (additive)

```sql
CREATE TABLE job_run (id BIGINT AUTO_INCREMENT PRIMARY KEY, job_key VARCHAR(40) NOT NULL, kind VARCHAR(10) NOT NULL,  -- SCHEDULED|MANUAL
  triggered_by VARCHAR(50), started_at DATETIME NOT NULL, finished_at DATETIME, status VARCHAR(10) NOT NULL,         -- RUNNING|OK|FAILED|SKIPPED
  items INT, error VARCHAR(1000), INDEX (job_key, started_at), INDEX (started_at));
CREATE TABLE ops_check (check_key VARCHAR(40) PRIMARY KEY, name VARCHAR(100), status VARCHAR(10), last_ping DATETIME, last_duration_s INT,
  next_due DATETIME, source VARCHAR(20), detail VARCHAR(500), fetched_at DATETIME);
CREATE TABLE request_metric_minute (minute DATETIME NOT NULL, route_group VARCHAR(40) NOT NULL, count INT, errors_4xx INT, errors_5xx INT,
  p50_ms INT, p95_ms INT, PRIMARY KEY (minute, route_group));
CREATE TABLE deployment (id BIGINT AUTO_INCREMENT PRIMARY KEY, version VARCHAR(40), git_sha VARCHAR(40), environment VARCHAR(20), actor VARCHAR(50),
  kind VARCHAR(10), started_at DATETIME, finished_at DATETIME, status VARCHAR(10), notes VARCHAR(500), INDEX (started_at));
CREATE TABLE system_event (id BIGINT AUTO_INCREMENT PRIMARY KEY, level VARCHAR(10) NOT NULL, kind VARCHAR(40) NOT NULL, title VARCHAR(200) NOT NULL,
  detail VARCHAR(2000), ref_type VARCHAR(30), ref_id VARCHAR(100), created_at DATETIME NOT NULL, INDEX (created_at), INDEX (kind, created_at));
CREATE TABLE incident (id BIGINT AUTO_INCREMENT PRIMARY KEY, title VARCHAR(200), severity VARCHAR(10), status VARCHAR(12),   -- OPEN|MONITORING|RESOLVED
  started_at DATETIME, resolved_at DATETIME, impact VARCHAR(1000), postmortem_url VARCHAR(300), declared_by VARCHAR(50));
CREATE TABLE incident_note (id BIGINT AUTO_INCREMENT PRIMARY KEY, incident_id BIGINT, author VARCHAR(50), body VARCHAR(2000), at DATETIME);
```

## 3. Job registry (initial)

| key | cron (UTC) | class | pausable | runbook |
|---|---|---|---|---|
| `users.purge_unactivated` | 0 0 1 * * ? | `UserService.removeNotActivatedUsers` | yes | — |
| `jobs.ingest` | 0 0 2 * * * | `JobIngestScheduler` | yes | `provider-down` |
| `inbox.retention` | 0 30 3 * * * | `InboxRetention` | yes | — |
| `jobs.match` | 0 0 4 * * * | `JobMatchScheduler` | yes | `provider-down` |
| `inbox.poll` | 0 */15 * * * * | `InboxPoller` | yes | `rotate-inbox-key` |
| `ops.error_digest` | fixedDelay 60 s | `ErrorDigestService.tick` | no | — |
| `ai.rollup` (new) | 0 10 0 * * * | `AiDailyRollupJob` | yes | — |
| `retention.purge` (new) | 0 45 3 * * * | `RetentionJob` | yes | — |
| `ops.healthchecks_poll` (new) | fixedDelay 10 min | `OpsCheckPoller` | no | `backup-missed` |
| `ops.host_stats` (new) | fixedDelay 1 min | `HostStatsSampler` | no | `disk-full`, `memory-pressure` |
| `billing.reconcile` (new, A2) | 0 20 5 * * * | `StripeReconcileJob` | yes | `stripe-webhook-failing` |
| `crm.redeliver` (new, A2.9) | fixedDelay 5 min | `CrmWebhookRedeliver` | yes | — |
| `tokens.purge_expired` (new) | 0 15 1 * * * | `RefreshTokenPurge` | yes | — |
| `mfa.purge_challenges` (new) | 0 20 1 * * * | `AdminMfaChallengePurge` | yes | — |

## 4. API

```
GET  /api/admin/system/overview      -> {uptimePct30d (from UptimeRobot via HC-like poll or null), latencyP95 (last 15 min), errorRatePct, jobsRunning, health (actuator), host:{memUsedPct, diskUsedPct, cpuLoad}, backup:{lastOk, sizeBytes, status}, drill:{lastOk, status}, env:{version, gitSha, profile, bootAt}}
GET  /api/admin/jobs                 -> registry + last run + paused
POST /api/admin/jobs/{key}/run       -> 202 or 409 running; audited
PUT  /api/admin/jobs/{key} {paused, reason} -> HIGH when pausing ingest/poll; audited
GET  /api/admin/jobs/{key}/runs?page=
GET  /api/admin/system/events?level=&kind=&page=
GET  /api/admin/deployments          ; POST /api/admin/deployments (bearer DEPLOY_HOOK_TOKEN, from deploy.yml)
GET  /api/admin/system/logs?level=ERROR&limit=500   -> from the digest appender ring buffer
GET  /api/admin/system/diagnostics   -> application/json bundle (HIGH, audited: secrets redacted by key pattern)
GET/POST /api/admin/incidents ; POST /{id}/notes ; PUT /{id} {status}
PUT  /api/admin/settings/ops.maintenance   (settings doc)
```

## 5. Alerting matrix

| Signal | Threshold | Channel | Runbook |
|---|---|---|---|
| Backup check late | HC says `late`/`down` | digest HIGH immediately + system_event | backup-missed |
| Drill failed | HC `down` on drill | digest HIGH | restore |
| Job failed twice in a row | ledger | digest MEDIUM | per job |
| 5xx rate > 2 % over 5 min | request_metric_minute | digest HIGH | — |
| p95 > 1500 ms over 10 min | same | digest MEDIUM | memory-pressure |
| Disk > 85 % / mem > 90 % | host stats | digest HIGH | disk-full |
| Stripe webhook failures > 0 in 1 h | stripe_event.status=failed | digest HIGH | stripe-webhook-failing |
| Brevo send cap > 80 % of 300/day | mail_log count | digest MEDIUM | — |
| AI platform cap 80 % / 100 % | ai doc | digest HIGH | — |

## 6. Failure modes

- Healthchecks API unreachable → `ops_check.status=UNKNOWN`, tile grey "couldn't reach Healthchecks since 10:40"; never shows the last green.
- The API itself is down → nothing here helps; that's UptimeRobot's job (external). The page states that plainly in a footnote.
- Job runner wraps a job that throws → FAILED row + system_event + the next schedule still runs; two consecutive failures alert.
- A paused job forgotten → paused jobs show a yellow pill on the Overview health list and in the daily digest summary line.
- Diagnostics bundle leaks a secret → redaction by key regex (`(key|secret|password|token|hash)`) **and** a unit test with a fixture settings map.

## 7. Security

OPS/ADMIN act, others view. Diagnostics and log views are HIGH (they can contain user identifiers in error messages). `POST /api/admin/deployments` uses a dedicated bearer token and is excluded from the admin JWT path; the token is in GitHub secrets **and** the password manager (lesson of 2026-09-17).

## 8. Tests

`JobRunnerTest` (ledger rows; pause honoured; exception → FAILED; run-now conflict), `OpsCheckPollerTest` (HC JSON fixture → statuses; blank key → NOT_CONFIGURED), `RequestMetricFilterTest` (p95 math, route grouping), `DiagnosticsRedactionTest`, `AdminSystemResourceIT` (overview shape; run-now audited; deployment hook rejects a bad token), web: System page renders "Not configured" states without sample fallbacks (no `SYSTEM_TILES`/`JOBS`/`EVENTS`/`DEPLOYMENTS` imports remain).

## 9. Rollout

A10.1 (human 15.1c) → registry + ledger → HC poll + backup tiles → request metrics → deployments hook → system events + logs → incidents + runbooks → diagnostics.

## 10. Mobile wireframe (390px) — the "is everything running?" screen

```
┌──────────────────────────────┐
│ System            ● all ok   │
│ Backup   03:17 · 412 MB · ✓  │
│ Drill    Sun 04:02 · passed ✓│
│ API p95  186 ms  · 5xx 0.1 % │
│ Disk 61 % · Mem 78 % ⚠       │
├──────────────────────────────┤
│ Jobs                         │
│ ingest   02:00 ✓ 212 boards  │
│ match    04:00 ✓ 1,204 users │
│ inbox    */15  ✓ 2 min ago   │
│ ai.rollup 00:10 ✖ FAILED     │
│   [Run now] [View runs]      │  <- 44px
├──────────────────────────────┤
│ [ Declare incident ]  (red)  │
└──────────────────────────────┘
```

# External monitors and alert routes (REAL-GAPS-C P1.1)

Until these exist, "you find out by visiting it". Two free services, each doing a different job:

| Service | Looks from | Catches |
|---|---|---|
| **UptimeRobot** | outside, every 5 minutes | the site or the API is unreachable, the API cannot reach its database, a certificate or DNS problem |
| **Healthchecks.io** | the box tells it "I ran" | a backup, drill, binlog shipment, uploads archive or deploy that did not happen; disk, memory, crash loops and certificates (via `host-guard.sh`); and **the box itself being down** (its pings simply stop) |

You create the accounts. Everything else is exact below, and the machine-readable version of every
definition is **`docs/ops/monitors.json`** (names, URLs, periods, grace, which `.env` variable and which
script feeds each check). Ping URLs are never committed: they go in the box's `.env` only.

## 1. Alert routes (do this first, both services use it)

| Severity | Means | Who is told | Response |
|---|---|---|---|
| **SEV1** | production down or unreachable | `OPS_ALERT_EMAIL`, a **second human's** email, **and** a push that rings a phone | start now, any hour: `docs/ops/incident-runbook.md` sections 3 and 4H |
| **SEV2** | a backup/drill/binlog/uploads/deploy check did not report; disk or memory alarm | `OPS_ALERT_EMAIL` and the phone push | within the hour |
| **SEV3** | nuisance (the www redirect) | `OPS_ALERT_EMAIL` | next working day |

1. Pick the **phone push** channel once, it serves both services: the UptimeRobot mobile app, Telegram,
   Pushover or ntfy (Healthchecks.io has all of them as integrations). Email alone is how a missed backup
   goes unnoticed for a week.
2. A **second person** matters: add a second email as an alert contact in both services. One person on
   holiday must not be a single point of failure.
3. Test each route once the monitors exist (section 4). An alert you have never received is a guess.

## 2. UptimeRobot (uptimerobot.com, free plan)

Sign up with the ops address. **My Settings -> Alert Contacts -> Add**: the primary email, the second
email, and the push channel. Then **Add New Monitor** three times. For every monitor: monitoring interval
**5 minutes**, request timeout **30 seconds**, HTTP method **GET**, follow redirects **on**, and **turn
on SSL expiry reminders** if the plan offers them (the box also checks certificates itself, below).
Assign alert contacts as in the Route column.

| Name | Type | URL | Pass condition | Route |
|---|---|---|---|---|
| `kiwiply-apex` | HTTP(s) | `https://kiwiply.com/` | status 200 | SEV1: all three contacts |
| `kiwiply-api-health` | Keyword | `https://api.kiwiply.com/management/health` | keyword `"status":"UP"` exists (alert when the keyword is **not found**) | SEV1: all three contacts |
| `kiwiply-www-redirect` | HTTP(s) | `https://www.kiwiply.com/` | status 200 after following the redirect | SEV3: primary email only |

Notes:

- The health endpoint answers `UP` only when **the API and MySQL are both up**, so one keyword monitor
  covers the database too.
- `www` 301s to the apex (`CLAUDE.md`). UptimeRobot follows it, so a pass proves the redirect and the target.
- The API host is a deliberate public route on the shared edge (the extension calls it directly), so this
  monitor works without credentials. The edge Caddyfile lives outside this repo; nothing here changes it.
- Do not add the web app's signed-in pages: they need a session, and a 302 to sign-in is not a pass.

## 3. Healthchecks.io (healthchecks.io, free plan)

Sign up, **Integrations -> add** the primary email, the second email and the push channel. Then **Add
Check** for each row. Set Name, **Period** and **Grace Time** exactly; leave the schedule type "Simple".
Each check's page shows a **ping URL** (`https://hc-ping.com/<uuid>`): paste it into the box's `.env`
(`/root/web-ext-job-application-autofill/.env`, or the deploy user's checkout, `docs/ops/deploy-user.md`)
under the variable in the table. The scripts read `.env` on every run; nothing to restart.

| Check name | `.env` variable | Period | Grace | Fed by (cron, UTC) | Route |
|---|---|---|---|---|---|
| `kiwiply-backup` | `HC_BACKUP_URL` | 1 day | 2 hours | `backup-db.sh` (03:15 daily) | SEV2 |
| `kiwiply-uploads` | `HC_UPLOADS_URL` | 1 day | 2 hours | `backup-uploads.sh` (03:40 daily) | SEV2 |
| `kiwiply-binlog` | `HC_BINLOG_URL` | 15 minutes | 15 minutes | `ship-binlogs.sh` (every 15 min) | SEV2 |
| `kiwiply-host` | `HC_HOST_URL` | 10 minutes | 10 minutes | `host-guard.sh` (every 5 min) | SEV2; see below |
| `kiwiply-restore-drill-weekly` | `HC_RESTORE_URL` | 7 days | 6 hours | `verify-restore.sh` (Sunday 04:45) | SEV2 |
| `kiwiply-restore-drill-monthly` | `HC_DRILL_URL` | 31 days | 2 days | `restore-drill.sh` (the 1st, 05:30) | SEV2 |
| `kiwiply-deploy` | `HC_DEPLOY_URL` | 365 days | 365 days | `deploy.sh` (each deploy: start, success, fail) | SEV2 |

How to read them:

- **Disk is `kiwiply-host`.** `host-guard.sh` pings every 5 minutes; on a problem it pings `/fail` with the
  reasons in the body (`disk / 91% (CRITICAL)`, memory, a restarting container, a certificate under 14
  days), and the alert email shows that body. At 85 % used it fails; at 90 % it says CRITICAL.
- **A box that is down** sends no ping at all, so `kiwiply-host` goes late. **Late with no `/fail` ping
  before it = the box or cron is down.** If `kiwiply-apex` is down too, treat it as SEV1. This is the one
  failure UptimeRobot alone cannot distinguish from "just the web container".
- **Backup freshness** is `kiwiply-backup` (the dump ran and was whole) plus `kiwiply-restore-drill-weekly`
  (the newest dump in the bucket is at most 2 days old and matches its sha256).
- **`kiwiply-deploy`** has no real schedule; the long period just means it only ever alerts on a `/fail`
  ping (a failed or rolled-back deploy). `deploy.sh` sends the tag and the rollback result in the body.
- A script whose variable is blank stays silent, so a check created but not wired shows as "new", then late.
  `ship-binlogs.sh` is a no-op until the backup bucket and keys are in `.env`, and does not ping then.

## 4. Test every route once

1. UptimeRobot: **Alert Contacts -> test** (or briefly point a copy of a monitor at a URL that 404s).
2. Healthchecks: on any check's page, **Send test notification** to each integration; then simulate a
   failure from your laptop, which touches nothing on the box:
   `curl -fsS -m 10 --data-raw 'test: ignore' https://hc-ping.com/<uuid-of-kiwiply-deploy>/fail` and
   confirm the email and the phone both arrive, then press **Resume**/ping success to clear it.
3. Write down who got what in the incident log. If the phone did not ring, fix that now.

## 5. Where this connects

- Severity definitions and the first fifteen minutes: `docs/ops/incident-runbook.md` sections 2 and 3.
- The scripts and what each pings: `DEPLOY.md` sections 5.1 (backups), 5.2 (alarms), 5.4 (deploys), 5.6
  (host guard), 5.7 (uploads), 5.9 (binlogs), 5.10 (restore drills).
- Status page for customers (P1.2) is a separate item; these monitors are what would feed it.

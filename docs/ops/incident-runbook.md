# Incident and breach-notification runbook

> Written 2026-10-16 for REAL-GAPS-C row T5.5 (blocker: real user data needs a written process).
> Outline source: `docs/design/trust/security-program.md` sections 3 and 4. Operational companions:
> `DEPLOY.md` (sections 5.3 restore, 5.4 deploy and rollback, 12 inbox key), `scripts/ops/`.
> **Not legal advice.** The deadlines below are the ones we plan to meet; counsel confirms them
> (`docs/design/trust/legal-review-register.md`, item L12). Until counsel has reviewed this
> file, when in doubt, notify earlier rather than later.

Use this when something might have exposed, altered or destroyed other people's data, or when the
site is down and you do not yet know why. If you are unsure whether it is an incident: it is. Open the
log (section 3, step 2) and keep going; closing an incident that turned out to be nothing costs a
paragraph, missing one costs a regulatory clock.

## 0. The three rules

1. **Write the time down.** The moment you (or anyone on the team) have a reasonable degree of certainty
   that personal data was breached is the **awareness time**. Every deadline in section 7 counts from it.
2. **Contain before you investigate, preserve before you clean.** Stop the bleeding with the least
   destructive switch available (section 4), but never `docker compose down -v`, never delete a
   volume, never rebuild the box over the evidence.
3. **One person decides, everything is logged.** The incident lead (section 1) makes the calls; every
   action goes in the incident log with a UTC timestamp.

## 1. Who does what

Kiwiply is small. Fill in the blanks once, keep this page current, and put a printout where you can
find it when the site is down.

| Role | Who | Backup |
|---|---|---|
| Incident lead (decides, owns the clock) | the product owner | `<NAME, PHONE, set this>` |
| Communications (users, org customers, regulators) | same person as the lead | `<NAME>` |
| Technical responder | whoever has root on the box | `<NAME>` |
| Counsel on call | `<FIRM, PHONE, set after L12>` | |
| Shared-box owner (BeeCompete's edge) | `<NAME, PHONE>` | |

Everyone else: if you see something, tell the lead immediately and write down what you saw and when.
Do not discuss the incident in public channels or with customers before the lead says what to say.

## 2. Severity

| Level | Meaning | Examples | First response |
|---|---|---|---|
| **SEV1** | Data of real people is, or may be, in the wrong hands; or production is down | database or backup bucket exposed, leaked production secret, one org seeing another org's data, box compromised, site down | start now, any hour |
| **SEV2** | Degraded or at risk, no evidence of exposure | repeated failed deploys, disk or memory alarm, a provider reports an incident, certificate expiring | within the hour |
| **SEV3** | Nuisance | noisy error digest, one user locked out | next working day |

A SEV2 that might have exposed data is a SEV1. Disk-full and memory alarms come from
`scripts/ops/host-guard.sh` (Healthchecks "host" check); a missed backup or drill from Healthchecks; a
dead site from UptimeRobot (the exact monitors and who is told for each severity: `docs/ops/monitors.md`).

## 3. The first fifteen minutes

1. **Declare.** Tell the lead. Note the **detection time** and, if exposure is plausible, the
   **awareness time** (rule 1).
2. **Open the incident log.** One file, `incident-<YYYY-MM-DD>-<slug>.md`, kept OUTSIDE the repo and off the
   box (password manager note or a private document). Headings: timeline (UTC), what we know, what we
   don't, actions taken, decisions and who made them, people and providers contacted. The skeleton is
   section 11.
3. **Look before touching.** On the box (SSH in; never run anything against production from a laptop):
   ```bash
   cd /root/web-ext-job-application-autofill
   COMPOSE="docker compose -f docker-compose.prod.yml -f docker-compose.shared-edge.yml"   # ALWAYS the overlay
   $COMPOSE ps
   $COMPOSE logs --since 6h api | tail -n 400
   $COMPOSE logs --since 6h web | tail -n 200
   uptime; df -h /; free -m; docker ps --format '{{.Names}} {{.Status}}'
   ```
   The overlay is not optional even in an emergency: the bare file starts our own Caddy, which fights
   BeeCompete's edge for :80/:443 and takes their sites down too.
4. **Preserve** (section 5) before changing anything that is not an emergency switch.
5. **Contain** (section 4). Pick the scenario, apply the smallest switch that works.
6. **Decide the clock.** If personal data may be involved, write the deadlines of section 7 into the log
   now, as absolute UTC times.

## 4. Containment by scenario

Prefer the switches in this order: a feature flag, one user or one session, a secret rotation, stopping a
single container, and only last, taking the whole site offline. Every switch below is reversible.

### A. A secret leaked (repo, chat, screenshot, log, ex-contractor)

Treat it as compromised from the moment it was visible. Rotate it (section 6), then check the logs for
use between the leak time and the rotation time. For the JWT secret and the inbox key, rotation has user
impact; read the table first.

### B. Suspected unauthorised access to the database or a backup

1. `$COMPOSE stop api` if data is being read or changed right now (the site shows errors; nothing is lost).
2. Rotate `MYSQL_ROOT_PASSWORD` (needs the container's own user reset; section 6) and the backup AWS key.
3. In the AWS console: check the `kiwiply-db-backups` bucket's CloudTrail / access log for reads you
   don't recognise; keep Block Public Access ON; check the bucket policy and the IAM user's last use.
4. Dumps are encrypted only if `BACKUP_AGE_RECIPIENT` was set (DEPLOY.md 5.7): until it is, a copied dump
   is readable. Say so in the assessment.

### C. Account takeover (one or a few users)

Admin area, per user: **deactivate**, **force-logout**, or **revoke sessions** (`/api/admin/users/{login}/...`).
Reset the password by emailing the owner, never by telling anyone a password. For many accounts at once the
fastest switch is rotating `JHIPSTER_SECURITY_AUTHENTICATION_JWT_BASE64_SECRET` (signs everyone out;
section 6). Refresh-token reuse already revokes a token family (`RefreshToken`); check whether that
fired in the log before assuming a leak.

### D. One organization seeing another's data (tenant isolation failure)

This is always SEV1.
1. Turn organization features off: `ORGS_ENABLED=false` in the box `.env`, then
   `$COMPOSE up -d --no-deps api` (an admin-stored `feature.orgs.enabled` setting overrides the env var;
   set it off in admin settings too). `/api/orgs/**` then answers 404.
2. Keep the request ids and timestamps; they identify who saw what. Do not delete the audit rows.
3. Reproduce on a staging copy (DEPLOY.md 5.5), never on production data.
4. The affected organizations are processor-side notifications (section 7).

### E. The box itself looks compromised (unknown processes, unexpected users, crypto-miner, ransomware note)

1. Tell the shared-box owner at once: BeeCompete runs on the same machine. Do not restart or reconfigure
   their edge Caddy; it is not ours (`CLAUDE.md`).
2. Take a snapshot of the VM at the hosting provider's panel if it offers one, and a database snapshot
   (`scripts/ops/snapshot-db.sh --label incident`) copied OFF the box.
3. Isolate: provider firewall to your own IP only, or power off from the provider panel if data is being
   exfiltrated. Do not log in with new credentials from an untrusted machine.
4. Rebuild on a fresh box rather than cleaning this one: `MIGRATION.md` plus the latest verified backup
   (DEPLOY.md 5.3). Rotate EVERY secret (section 6): assume the `.env` was read.

### F. The browser extension is the problem (malicious update, bad host permission, compromised store account)

1. Chrome Web Store developer dashboard: unpublish or roll back to the previous version; rotate the dashboard
   password and the API refresh token used by `publish-extension.yml`.
2. The extension talks only to `api.kiwiply.com`; if the API side is implicated, apply A-C above.
3. Say plainly in the user notice which version numbers are affected.

### G. A provider tells us they were breached (Brevo, Stripe, AWS, Gemini, GitHub, the host)

Rotate the key we hold for them immediately (section 6), ask the provider in writing what of ours was in
scope, and treat anything they confirm as our awareness time for that data. Stripe holds cards, never us.

### H. Outage only, no data concern

Follow DEPLOY.md: `scripts/ops/deploy.sh --rollback` for a bad release (5.4), restore (5.3) for lost data.
Keep the log anyway; if the cause turns out to be hostile it becomes a SEV1 retroactively.

## 5. Preserve evidence

Do these once, early, before restarts rotate anything. Store the result off the box.

```bash
mkdir -p ~/incident-$(date -u +%F) && cd ~/incident-$(date -u +%F)
for s in api web mysql chromium; do $COMPOSE logs --no-color --timestamps "$s" > "logs-$s.txt" 2>&1; done
docker ps -a --format '{{.Names}}\t{{.Image}}\t{{.Status}}' > containers.txt
last -n 50 > logins.txt; w > who.txt
~/web-ext-job-application-autofill/scripts/ops/snapshot-db.sh --label incident
chmod -R go-rwx .
```

Container logs are capped by the rotation in `docker-compose.prod.yml` (5 x 10 MB per container), so
older lines may already be gone: copy them first. The edge Caddy's access log belongs to the shared-box
owner; ask them to preserve the window. Never `docker compose down -v` (removes the volumes).

## 6. Rotating secrets

Names only; values live in the password manager and the box `.env`. After editing `.env`, recreate only
what reads the value (`$COMPOSE up -d --no-deps api web`) and write the new value to the password manager
first. Rotation of a secret never goes through chat, GitHub secrets (write-only) or the repo.

| Secret (`.env` name) | What changing it does | Notes |
|---|---|---|
| `JWT_BASE64_SECRET` | signs **everyone** out; all tokens invalid | no user data lost; extension reconnects |
| `MYSQL_ROOT_PASSWORD` | the API and the ops scripts need the new value | change inside MySQL first (`ALTER USER`), then `.env`, then recreate api |
| `DOSSIER_INBOX_KEY` | stored mailbox app passwords no longer decrypt | rotate with `DOSSIER_INBOX_KEY_VERSION` + the retired-keys procedure in DEPLOY.md section 12 so users do not have to reconnect |
| `DOSSIER_INTERNAL_TOKEN`, `DOSSIER_SCRAPE_TOKEN`, `DOSSIER_TENANT_HOST_SECRET` | service-to-service only; set the same value on api and web | tenant host secret blank = no tenant host resolves |
| `ADMIN_PASSWORD_HASH` | the admin password | regenerate the bcrypt hash, double every `$` |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | resume storage (driver s3) | IAM console, deactivate the old key after switching |
| `BACKUP_AWS_ACCESS_KEY_ID` / `BACKUP_AWS_SECRET_ACCESS_KEY` | backups stop until updated | the key can upload and read, never delete |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | billing | roll in the Stripe dashboard; keep live and test keys apart |
| `MAIL_PASSWORD`, `BREVO_API_KEY` | outgoing mail | Brevo console |
| `DOSSIER_AI_API_KEY` | AI features | provider console |
| SSH keys (`VPS_SSH_KEY` for CI, personal keys) | CI deploys, shell access | remove the old public key from `authorized_keys` |
| `HC_*` URLs | monitoring only | a leaked ping URL lets someone fake a "healthy" ping: regenerate in Healthchecks |
| `BACKUP_AGE_RECIPIENT` | public key for new dumps | losing the PRIVATE key means encrypted backups cannot be read: keep it in the password manager |

## 7. Assess, then notify

### 7.1 What data could be involved

Use the facts, not the worst case, but write down both. What Kiwiply holds (personal accounts and
organizations): account email and name; resume and profile content (work history, education, contact
details, addresses, phone numbers); application records and notes; inbox message headers and bodies (never
attachments) and the encrypted app password; AI call records; organization records (members, roles,
clients, placements; HR and finance entries are record-only). **By product rule we hold none of:**
SSN or tax ids, bank or routing numbers, passport / visa / I-9 numbers, dates of birth, card numbers
(Stripe only). If the investigation finds any of these in the data, that is itself a finding to record
and a separate bug to fix.

Counting: how many users or organizations, which fields, which time window. Use read-only queries inside
the MySQL container (`$COMPOSE exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -uroot dossierApi'`)
and keep the queries in the log. Once the data map test exists (privacy work, REAL-GAPS-C T1.1), use it to
list every table that holds user data.

### 7.2 Who must be told, and by when

| Who | Trigger | Deadline (planned; counsel confirms) | How |
|---|---|---|---|
| EU/EEA supervisory authority; UK ICO | personal-data breach likely to result in a risk to people (GDPR Art. 33) | **within 72 hours of the awareness time**; if later, say why | regulator's online form |
| Affected people | high risk to them (resume, contact details, inbox content) (Art. 34) | without undue delay | email + a banner after sign-in |
| Organization customers | any incident touching their members' data (we act as their processor) | **within 48 hours** of awareness (planned; make it a contract term), and always "without undue delay" | email to each org's owner/admin + banner in their workspace |
| US states / residents | state breach laws, thresholds differ | counsel decides (often 30 to 60 days; some shorter) | counsel-drafted letters |
| Stripe, Brevo, AWS, GitHub, hosting provider | their credential or integration is involved | immediately | their security contact |
| Chrome Web Store | extension compromise | immediately | developer dashboard |
| Shared-box owner (BeeCompete) | anything at the box level | immediately | phone |

If you cannot establish within 72 hours whether people are at risk, notify the authority anyway with what
you know and say the investigation continues; Art. 33 allows information in phases. A breach that is
unlikely to risk anyone still goes in the register (section 10) with the reasoning.

### 7.3 What every notification says

(What Art. 33(3) asks for; adapt per audience.) What happened and when; the kinds and approximate
numbers of people and records; what data; the likely consequences; what we have done and will do; what
the person can do (change the password, watch for phishing, nothing); the contact point (`privacy@` once
it exists, otherwise the lead's address). Plain words, no blame, no speculation, no promise we cannot keep.

User notice skeleton:

> Subject: A security incident affecting your Kiwiply account
> On `<date>` we found that `<what happened, one sentence>`. It affected `<which data>` for `<which group>`.
> We have `<contained it / fixed it>`. Your password `<was / was not>` exposed. What you can do:
> `<specific steps>`. We are sorry. Questions: `<address>`.

Organization customer notice skeleton:

> We are writing within 48 hours of becoming aware of an incident that involves data of your members.
> What happened: `<>`. Data and number of your members involved: `<>`. What we have done: `<>`. What we
> recommend you do: `<>`. We will update you by `<time>` and when the investigation closes.

## 8. Recover

1. Fix the cause first (patch, rotate, remove the account or key). Recovering onto an unfixed system
   repeats the incident.
2. Restore data only if it was lost or corrupted: DEPLOY.md 5.3. When the binary logs are being shipped (DEPLOY.md 5.9),
   prefer **point-in-time recovery**: dump plus the logs up to just before the damage, which loses minutes instead of up to
   a day and keeps account deletions made after the dump. After a plain dump restore, **re-apply every account
   deletion and erasure request received after the backup was taken** (the restore resurrects them);
   keep a list of erasures during the incident for exactly this.
3. Bring features back one at a time (`ORGS_ENABLED`, `DEMO_ENABLED`), watch the error digest, run
   `scripts/migrate/04-verify.sh kiwiply.com`.
4. Tell everyone you told in section 7 that it is over.

## 9. After: within 5 working days

Blameless review in the incident log: timeline; impact in users and minutes; root cause; what detection
missed; one to three actions with an owner and a date (as stories). Update this runbook if it was wrong.
Public incidents go on the status page / trust page once those exist.

## 10. The breach register

Keep one row per incident, including near-misses (Art. 33(5) wants every breach documented, notified or
not). Outside the repo, next to the incident logs.

| ID | Awareness (UTC) | What | Data and number affected | Authority notified (when / why not) | People notified | Org customers notified | Closed |
|---|---|---|---|---|---|---|---|

## 11. Incident log skeleton

```
# Incident <id>: <slug>      severity: SEV?      lead: <name>
Detected: <UTC>   Aware (clock starts): <UTC>   Deadlines: authority <UTC>, org customers <UTC>
## Timeline (UTC)
## What we know / what we do not know
## Actions (who, what, when)
## Data assessment (classes, counts, window, how counted)
## Notifications (who, when, text sent)
## Root cause / follow-ups
```

## 12. Drill it

Twice a year, spend an hour walking one scenario (a leaked `.env`; org A seeing org B) on paper: who is
called, which switch is thrown, what is written in the first notice. Record gaps as stories. The restore
drills below (weekly dump check, monthly full drill with binlogs, quarterly rebuild) cover the technical half.

### 12.1 The restore drills (REAL-GAPS-C P0.4, P0.6)

A backup that has never been restored is a hope. Three drills, each with an alarm, so a quiet failure becomes an email:

| Drill | Command (on the box unless noted) | Cadence | Alarm (Healthchecks) |
|---|---|---|---|
| Dump | `scripts/ops/verify-restore.sh` | Sundays 04:45 UTC, cron | `kiwiply-restore-drill-weekly` (7 d / 6 h) |
| Full: dump + binlogs | `scripts/ops/restore-drill.sh` | the 1st of the month 05:30 UTC, cron | `kiwiply-restore-drill-monthly` (31 d / 2 d) |
| Rebuild on a new machine | the checklist in DEPLOY.md 5.10, **never on the production box** | quarterly, by hand | none: you write the result in the drill log |

Running the full drill by hand (it never touches the live database; it uses a throwaway `mysql` container with no network):

```bash
cd /root/web-ext-job-application-autofill           # or the deploy user's checkout
scripts/ops/restore-drill.sh --dry-run               # what it would do
scripts/ops/restore-drill.sh                         # newest dump + the binlogs after it, from the backup bucket
scripts/ops/restore-drill.sh --stop-datetime '2026-10-17 14:05:00'    # rehearse a point in time
tail -n 5 ~/kiwiply-backups/restore-drills.log       # one line per drill: when, which dump, tables, users, changesets
```

A pass ends with `restore drill OK - dossier-<date>.sql.gz + N binlog file(s) replayed (...): T tables, U users, C changesets`, and
prints every table's exact row count. **What a failure means and what to do:**

| It says | Meaning | Do |
|---|---|---|
| `the newest backup (...) is N days old` | the nightly backup stopped | SEV2: run `scripts/ops/backup-db.sh` by hand, read `/var/log/kiwiply-backup.log`, fix, rerun the drill |
| `doesn't match the sha256 it was uploaded with` | the dump in S3 is damaged | SEV2: the previous night's copy is the one to trust; investigate before the next lifecycle expiry |
| `is incomplete (no trailer or no tables)` | a cut-short dump got uploaded | SEV2: same as above; `backup-db.sh` should have refused it, so also find out why it did not |
| `the binlogs have a gap between number N and M` | files missing from `binlog/` | SEV2: point-in-time recovery stops at N until fixed; check `kiwiply-binlog` and `/var/log/kiwiply-binlog.log` |
| `the binlog the dump starts at (...) is missing` | the file open at dump time is not shipped yet | usually right after a nightly dump: run `scripts/ops/ship-binlogs.sh`, rerun |
| `INTEGRITY ONLY` | the dump is age/gpg encrypted and this machine has no key (by design) | fine for the cron run; do the full restore quarterly where the key is: `--identity KEY` |
| `user table ... expected at least` / `Liquibase ...` / `exectype` | the restored data is wrong | SEV1 if no other good backup exists: do not trust this backup; treat as a failed backup chain |

Record every manual drill in the incident folder (date, who, result, minutes taken) even when it passes: the minutes are
the number to quote when someone asks how long a restore takes.

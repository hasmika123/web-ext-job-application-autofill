# Backups, point-in-time recovery and restore drills

Area `plat`. Stories: P0.1–P0.6. Existing: `scripts/ops/backup-db.sh` (nightly consistent dump →
`s3://kiwiply-db-backups/daily/` + `monthly/`, sha256 metadata, keeps 3 locally, Healthchecks pings),
`scripts/ops/verify-restore.sh` (weekly restore into a throwaway container, checks sha256 / age ≤ 2 d /
tables / row counts), `scripts/ops/aws/{backup-user-policy,lifecycle}.json` (List+Put+Get, **no Delete**;
30 daily + 12 monthly), `scripts/ops/kiwiply-ops.cron`, the CI "Ops scripts" job. **None of it has run
on the box** (`DEPLOY.md` §5, `MIGRATION.md` §8). The 2026-09-17 loss = no dump + no escrowed `.env`.
Admin A10.1 is the admin-page half of 15.1c and reads the evidence this doc produces.

## 1. Decisions

| # | Decision |
|---|---|
| D1 | **Targets.** RPO **≤ 15 min** for the database (binlog shipping), **≤ 24 h** for files (nightly rsync-style sync, P5.2) until files move to S3; RTO **≤ 2 h** to a working stack on a fresh box from the password manager + S3 alone, **≤ 20 min** for a same-box restore. These numbers are published on `/trust` (P7.3) only once a drill has hit them. |
| D2 | **15.1c first, unchanged.** P0.1 executes `DEPLOY.md` §5.1–§5.3 exactly: bucket, IAM user, Healthchecks checks, cron install, first dump by hand, first drill by hand, evidence pasted into `DEPLOY.md` §5.4 (new: "Evidence log"). Nothing in this doc replaces 15.1a's scripts; it extends them. |
| D3 | **PITR via binlog shipping, not a second dump schedule.** MySQL runs with `--log-bin --binlog_format=ROW --sync_binlog=1 --binlog_expire_logs_seconds=1209600` (14 d). A new `scripts/ops/ship-binlogs.sh` runs every 15 min from the same cron file: `FLUSH BINARY LOGS` is **not** used (it churns small files); instead it uploads every *closed* binlog not yet in S3 plus the current one's bytes-so-far by `mysqlbinlog --read-from-remote-server --raw --stop-never`? No: simpler and restartable — `mysqlbinlog --raw` of closed logs + a `tail` upload of the active log keyed by name+size. Dumps are taken with `--source-data=2` so the base carries its own binlog coordinates. |
| D4 | **Files are backed up as data, not as a volume snapshot.** Once `LocalFileStorage` (P5.1) exists, `scripts/ops/backup-files.sh` syncs the uploads volume to `s3://kiwiply-db-backups/files/` with `aws s3 sync --no-delete`-equivalent semantics (the key cannot delete anyway) nightly at 03:40 UTC, and writes a manifest (`files/manifest-<date>.txt`: path, size, sha256). Restores of DB + files from the same night are consistent to within a day; the orphan sweep (P5.5) reconciles the rest. |
| D5 | **Client-side encryption of the dumps** with `age` (public key in the repo, private key in the password manager only). The bucket already has SSE-S3; `age` protects against the AWS account itself being the thing that leaks. The drill therefore also proves the private key in the password manager works — if it doesn't, the drill fails loudly, which is the point. |
| D6 | **Three kinds of drill, three cadences.** *Weekly* (exists): newest dump restores into a throwaway container. *Monthly* (new): base + binlog replay to "now − 1 h", row-count parity with live for append-only tables (`application`, `jhi_user`), timed → RTO log. *Quarterly* (new, human, ~2 h): fresh VPS from `MIGRATION.md` §9.1 using only the password manager + S3, `04-verify.sh` green, then destroy. Each pings its own Healthchecks check. |
| D7 | **A backup exists only if Healthchecks says it ran** (kept). Four checks: `kiwiply-backup` (1 d, grace 2 h), `kiwiply-binlog` (15 min, grace 10 min), `kiwiply-files` (1 d, grace 2 h), `kiwiply-restore-drill` (7 d, grace 6 h); monthly PITR drill = `kiwiply-pitr-drill` (31 d, grace 1 d). Admin A10.3 polls these. |
| D8 | **Secrets escrow is part of "backup".** `scripts/ops/secrets-fingerprint.sh` prints a sha256 fingerprint per secret in `.env` (never the value); the same list, run by hand against the password-manager copy, must match. The weekly drill compares the box's fingerprints against a committed-nowhere expected list stored *in Healthchecks' check description*? No — stored in the password manager entry; the script just prints, the human compares quarterly (checklist item). Automated half: the drill fails if `.env` on the box is missing any key present in `.env.example`'s REQUIRED section. |
| D9 | **Retention ladder.** daily 30 d · monthly 365 d · binlogs 14 d in S3 (lifecycle `binlog/`) · files manifest 90 d · the last 3 dumps + last 24 h of binlogs on the box. Account-deletion (GDPR) rows live on in backups ≤ 30 d daily / ≤ 365 d monthly — stated in the privacy policy (trust area). |
| D10 | **Dumps never contain secrets we can avoid**: `inbox_connection.app_password_enc` is ciphertext (key in `.env`); Stripe ids are not secrets; refresh-token hashes are hashes. The dump is still PII → `age` (D5). |

## 2. What runs where

| Job | Schedule (UTC) | Script | Writes | Healthchecks |
|---|---|---|---|---|
| DB dump | 03:15 daily | `backup-db.sh` (exists; add `--source-data=2`, `age` encrypt) | `daily/dossier-<date>.sql.gz.age`, `monthly/…` on the 1st | `kiwiply-backup` |
| Binlog ship | `*/15` | `ship-binlogs.sh` (new) | `binlog/<host>/<file>` + `binlog/<host>/index.json` | `kiwiply-binlog` |
| Files sync | 03:40 daily | `backup-files.sh` (new, after P5.1) | `files/<relpath>`, `files/manifest-<date>.txt` | `kiwiply-files` |
| Weekly drill | Sun 04:45 | `verify-restore.sh` (exists; add `age` decrypt) | `/root/kiwiply-backups/restore-drills.log` | `kiwiply-restore-drill` |
| Monthly PITR drill | 1st, 05:30 | `verify-pitr.sh` (new) | same log, + `rto_seconds` | `kiwiply-pitr-drill` |
| Quarterly rebuild | human | `MIGRATION.md` §9.1 + `04-verify.sh` | `DEPLOY.md` §5.4 evidence row | — |

Cron stays one file (`kiwiply-ops.cron`) so BeeCompete's crontabs are never touched. The binlog job
and the API's own nightly jobs (02:00 ingest, 03:30 inbox retention, 04:00 match) don't overlap the
dump at 03:15 by more than seconds; the dump is `--single-transaction` so it never blocks them.

## 3. Restore state machine

```
          ┌──────────────┐  dump ok, sha ok   ┌──────────────┐  binlogs applied   ┌──────────────┐
 start ──>│ BASE_RESTORED│───────────────────>│ PITR_APPLIED │───────────────────>│  VERIFIED    │
          └──────┬───────┘                    └──────┬───────┘                    └──────┬───────┘
                 │ sha mismatch / no trailer          │ gap in binlog chain               │ row counts off / app won't boot
                 v                                    v                                   v
          FAIL(base) → hc /fail              FAIL(gap) → hc /fail, drill reports    FAIL(verify) → hc /fail
                                              "recoverable to <last good ts>"
```

A gap in the chain is **not** a total failure: the drill reports the last recoverable timestamp, which
is what an operator needs at 3 a.m. (`FAIL(gap)` still pages, because a gap means the shipper broke.)

## 4. Runbook: restore production (replaces `DEPLOY.md` §5.3 once P0.2 lands)

1. **Decide the target time** `T` (last known-good; for ransomware/corruption, before the event).
2. `$COMPOSE stop api` (Liquibase must not race the import). Web keeps serving a static "maintenance"
   answer because the API is down → the `/api/account` probe fails → sign-in page shows the banner (A5.6).
3. Base: newest `daily/` ≤ `T`: `age -d -i <key-from-password-manager> | gunzip | mysql`.
4. Replay: `mysqlbinlog --start-position=<from dump header> --stop-datetime="T" binlog/… | mysql`
   (the `ship-binlogs.sh --list --until T` helper prints the exact file list and positions).
5. `$COMPOSE up -d api` → Liquibase applies anything newer than the dump; watch `Started DossierApiApp`.
6. `scripts/migrate/04-verify.sh kiwiply.com`; sign in; check the newest `application` row's timestamp ≈ `T`.
7. Files: if the uploads volume is also gone, `backup-files.sh --restore <date>` then run the orphan sweep (P5.5) and read its report.
8. Tell users what was lost (`T` → now). Post the incident on the status page (P1.2). Postmortem (P7.2).

Measured RTO lands in `DEPLOY.md` §5.4 every time this runs (drills included).

## 5. Failure modes

| Failure | Detected by | Behaviour |
|---|---|---|
| cron never installed / box clock drift | Healthchecks (no start ping) | email + push (P1.3) within grace |
| backup key lost delete rights? (n/a) / gained delete rights | quarterly IAM policy diff (`aws iam get-user-policy` by hand) | checklist |
| dump cut short | `dump_complete` trailer check (exists) | `/fail` ping, local copy discarded |
| `age` private key missing from password manager | monthly drill decrypt step | drill FAIL → page |
| binlog gap (disk full, MySQL restart with log reset) | `index.json` continuity check in `verify-pitr.sh` | FAIL(gap) with last-good ts |
| S3 unreachable | `aws_cli` non-zero | `/fail`; local copies still written (3 dumps + 24 h binlogs) |
| bucket lifecycle deleted something early | drill's "age ≤ 2 d" + monthly list vs expected count | WARN in drill log → digest |
| restore drill eats the box's memory (MySQL throwaway container on a 3.7 GB box) | `mem_limit: 512m` on the throwaway + `--innodb-buffer-pool-size=128M` | drill slower, never OOMs BeeCompete |

## 6. Security

- Backup IAM user: List/Put/Get only (exists). Add `s3:PutObjectRetention`? No — use **S3 Object Lock
  (governance mode, 30 d)** on `daily/` and `binlog/` so even the root account needs a special permission
  to delete early. Decision for the user (open question, costs nothing).
- `age` keys: public key committed (`scripts/ops/aws/backup.age.pub`), private only in the password manager.
- Local copies under `/root/kiwiply-backups` (mode 700) — after P2.5 (deploy user), the directory moves
  to `/srv/kiwiply/backups` owned by that user, mode 700.
- Drill containers run with `--network none`.

## 7. Cost

S3 Standard, us-east-1: ~50 MB/day dumps + ~100 MB/day binlogs + ≤ 2 GB files → < 10 GB stored, a few
hundred PUTs/day → **< $1/month**. Healthchecks Supporter $5/mo (shared with monitoring). `age` is free.

## 8. Tests

- `scripts/ops/test/ops.test.sh` grows: `ship-binlogs.sh` against a real MySQL in CI (write rows, ship,
  simulate a gap, assert the listing), `verify-pitr.sh` replays to a timestamp and asserts a row written
  after `T` is absent, `age` round-trip with a throwaway key, `backup-files.sh` manifest sha256 check,
  secrets-fingerprint prints no secret values (grep the output for the fixture values).
- shellcheck stays mandatory.

## 9. Rollout

P0.1 (human, 15.1c) → P0.2 binlog shipping + `--source-data` → P0.3 `age` encryption → P0.4 monthly PITR
drill + evidence log → P0.5 files backup (after P5.1) → P0.6 quarterly rebuild drill + Object Lock.

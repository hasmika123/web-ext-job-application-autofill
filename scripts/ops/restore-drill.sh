#!/usr/bin/env bash
# The restore drill (REAL-GAPS-C P0.4, P0.6): restore the newest backup, plus the binary logs written
# after it, into a THROWAWAY MySQL container, check the result and report. It never touches the live
# database: the scratch container has no network and is removed afterwards. Run it monthly (cron) and
# before you trust a new backup setup; it is the rehearsal for DEPLOY.md sections 5.3 and 5.9.
#
# RUN ON: the box (monthly from scripts/ops/kiwiply-ops.cron), or any machine with Docker:
#   scripts/ops/restore-drill.sh                           # newest dump + binlogs in the backup bucket
#   scripts/ops/restore-drill.sh --dry-run                 # say what it would do; touch nothing
#   scripts/ops/restore-drill.sh --file X.sql.gz [--binlog-dir DIR]     # local files, no AWS at all
#   scripts/ops/restore-drill.sh --file X.sql.gz.age --identity key.txt # an encrypted dump (needs the key)
#   scripts/ops/restore-drill.sh --stop-datetime '2026-10-17 14:05:00'  # point-in-time: replay up to then (UTC)
#
# What it does:
#   1. gets the newest dump (daily/ in the bucket, sha256 checked, must be at most MAX_AGE_DAYS old),
#      or the --file you give; decrypts it when it is .age/.gpg and you gave the key;
#   2. starts a fresh mysql container of the production version (no network, 1 GB) and loads the dump;
#   3. replays the binary logs: from the dump's recorded position (lib.sh dump_binlog_position) through
#      every file after it, newest last, up to --stop-datetime if given. The files come from
#      s3://$BACKUP_S3_BUCKET/binlog/<server uuid>/ (the newest uuid, or --binlog-prefix), or --binlog-dir.
#      A gap in the numbering FAILS the drill: that is a hole in point-in-time recovery. A dump with no
#      recorded position, or no binlogs at all, is reported as "dump only" (not a failure);
#   4. sanity queries: every table present, the user table not empty, the Liquibase changelog present,
#      not empty and free of FAILED changesets; each table's exact row count is printed and logged;
#   5. removes the container and pings Healthchecks.io (HC_DRILL_URL: period 31 days, grace 2 days).
#
# An encrypted dump from the bucket with no key is checked for freshness and sha256 only ("integrity
# only"), exactly like verify-restore.sh: the box holds no private key by design.
#
# From .env (bucket mode): BACKUP_S3_BUCKET, BACKUP_S3_REGION, BACKUP_AWS_ACCESS_KEY_ID,
# BACKUP_AWS_SECRET_ACCESS_KEY, HC_DRILL_URL. The report line also goes to $BACKUP_LOCAL_DIR/restore-drills.log.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=scripts/ops/lib.sh
. "$HERE/lib.sh"

REPO="${REPO:-$(cd "$HERE/../.." && pwd)}"
ENV_FILE="${ENV_FILE:-$REPO/.env}"
LOG_DIR="${BACKUP_LOCAL_DIR:-$HOME/kiwiply-backups}"
MAX_AGE_DAYS="${MAX_AGE_DAYS:-2}"
# Must match the mysql image in docker-compose.prod.yml (the ops test asserts it does).
MYSQL_IMAGE="${MYSQL_IMAGE:-mysql:9.2.0}"
DRILL="kiwiply-restore-drill-$$"
SCHEMA="dossierapi"   # lower_case_table_names=1 lowercases dossierApi
FILE=""
IDENTITY="${BACKUP_AGE_IDENTITY_FILE:-}"
GPG_DECRYPT=0
BINLOG_DIR=""
BINLOG_PREFIX=""
BINLOG_TOOL_IMAGE="${BINLOG_TOOL_IMAGE:-}"
NO_BINLOGS=0
STOP_DT=""
MIN_USERS=1
DRY=0
FROM_BUCKET=0
HC_DRILL_URL=""
WORK=""

while [ $# -gt 0 ]; do
  case "$1" in
    --file) FILE="${2:?--file needs a path}"; shift 2 ;;
    --identity) IDENTITY="${2:?--identity needs the age private key file}"; shift 2 ;;
    --gpg-decrypt) GPG_DECRYPT=1; shift ;;
    --binlog-dir) BINLOG_DIR="${2:?--binlog-dir needs a directory}"; shift 2 ;;
    --binlog-prefix) BINLOG_PREFIX="${2:?--binlog-prefix needs the server uuid}"; shift 2 ;;
    --binlog-tool-image) BINLOG_TOOL_IMAGE="${2:?--binlog-tool-image needs an image name}"; shift 2 ;;
    --no-binlogs) NO_BINLOGS=1; shift ;;
    --stop-datetime) STOP_DT="${2:?--stop-datetime needs 'YYYY-MM-DD HH:MM:SS'}"; shift 2 ;;
    --min-users) MIN_USERS="${2:?--min-users needs a number}"; shift 2 ;;
    --dry-run) DRY=1; shift ;;
    -h|--help) sed -n '2,/^set -euo/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown argument: $1 (see --help)" ;;
  esac
done

[ -z "$STOP_DT" ] || printf '%s' "$STOP_DT" | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}$' \
  || die "--stop-datetime must look like '2026-10-17 14:05:00' (UTC)"
case "$MIN_USERS" in ''|*[!0-9]*) die "--min-users must be a number" ;; *) ;; esac
[ -z "$BINLOG_PREFIX" ] || printf '%s' "$BINLOG_PREFIX" | grep -Eq '^[0-9a-f-]{36}$' || die "--binlog-prefix is the server uuid (36 characters)"

finish() {
  local rc=$?
  [ "$DRY" = 1 ] || "${DOCKER:-docker}" rm -f -v "$DRILL" >/dev/null 2>&1 || true
  [ -z "$WORK" ] || rm -rf "$WORK"
  if [ "$rc" -ne 0 ]; then
    warn "restore drill FAILED (exit $rc)"
    hc_ping "$HC_DRILL_URL" fail
  fi
}
trap finish EXIT

HC_DRILL_URL="$(env_or_file HC_DRILL_URL "$ENV_FILE")"

if [ "$DRY" = 1 ]; then
  if [ -n "$FILE" ]; then
    say "[dry-run] would restore the local dump $FILE"
  else
    say "[dry-run] would take the newest daily/ dump from s3://$(env_or_file BACKUP_S3_BUCKET "$ENV_FILE")/ (at most $MAX_AGE_DAYS days old, sha256 checked)"
  fi
  say "[dry-run] into a throwaway $MYSQL_IMAGE container (no network, 1 GB), never the live database"
  if [ "$NO_BINLOGS" = 1 ]; then
    say "[dry-run] binlogs: skipped (--no-binlogs)"
  elif [ -n "$BINLOG_DIR" ]; then
    say "[dry-run] then replay the binlogs in $BINLOG_DIR from the dump's recorded position${STOP_DT:+ up to $STOP_DT}"
  else
    say "[dry-run] then replay the binlogs in s3://<bucket>/binlog/<newest server uuid>/ from the dump's recorded position${STOP_DT:+ up to $STOP_DT}"
  fi
  say "[dry-run] then check tables, users (at least $MIN_USERS), the Liquibase changelog; log one line to $LOG_DIR/restore-drills.log; Healthchecks.io: $(configured "$HC_DRILL_URL")"
  exit 0
fi

WORK="$(mktemp -d)"
chmod 700 "$WORK"

if [ -z "$FILE" ]; then
  [ -f "$ENV_FILE" ] || die "no .env at $ENV_FILE (or pass --file)"
  load_backup_env "$ENV_FILE"
  hc_ping "$HC_DRILL_URL" start

  say "Finding the newest dump in s3://$BACKUP_S3_BUCKET/daily/"
  NAME="$(aws_cli s3 ls "s3://$BACKUP_S3_BUCKET/daily/" | latest_backup)"
  [ -n "$NAME" ] || die "there are no backups in s3://$BACKUP_S3_BUCKET/daily/"
  AGE="$(days_between "$(backup_date "$NAME")" "$(date -u +%F)")"
  [ "$AGE" -le "$MAX_AGE_DAYS" ] || die "the newest backup ($NAME) is $AGE days old - the nightly backup has stopped"
  say "Downloading $NAME ($AGE day(s) old)"
  aws_cli s3 cp "s3://$BACKUP_S3_BUCKET/daily/$NAME" "/work/$NAME" --only-show-errors
  EXPECTED="$(aws_cli s3api head-object --bucket "$BACKUP_S3_BUCKET" --key "daily/$NAME" \
    --query 'Metadata.sha256' --output text | tr -d '\r')"
  [ "$(sha256_of "$WORK/$NAME")" = "$EXPECTED" ] || die "$NAME doesn't match the sha256 it was uploaded with"
  FILE="$WORK/$NAME"
  FROM_BUCKET=1
else
  hc_ping "$HC_DRILL_URL" start
  [ -f "$FILE" ] || die "no such file: $FILE"
  NAME="$(basename "$FILE")"
fi

case "$NAME" in
  *.age|*.gpg)
    if { [ "${NAME##*.}" = age ] && [ -n "$IDENTITY" ]; } || { [ "${NAME##*.}" = gpg ] && [ "$GPG_DECRYPT" = 1 ]; }; then
      say "Decrypting $NAME"
      decrypt_file "$FILE" "$WORK/plain.sql.gz" "$IDENTITY"
      FILE="$WORK/plain.sql.gz"
    else
      [ "$FROM_BUCKET" = 1 ] || die "$NAME is encrypted: pass --identity KEY (age) or --gpg-decrypt (gpg)"
      REPORT="$(date -u +%FT%TZ) restore drill INTEGRITY ONLY - $NAME is encrypted and this machine holds no private key (by design): fresh and sha256 verified, NOT restored"
      say "$REPORT"
      mkdir -p "$LOG_DIR"
      printf '%s\n' "$REPORT" >> "$LOG_DIR/restore-drills.log"
      hc_ping "$HC_DRILL_URL" "" "integrity only: $NAME fresh and sha256-verified, not restored (encrypted)"
      exit 0
    fi ;;
  *) ;;
esac

say "Checking the dump is whole"
dump_complete "$FILE" || die "$NAME is incomplete (no trailer or no tables)"
POSITION="$(dump_binlog_position "$FILE")"

# ---- the binlogs: find them, check they are contiguous, decrypt, before any container exists -------
BL_START=""; BL_POS=""; BL_COUNT=0; BL_LAST=""; BL_NOTE=""
BL_FILES=()
if [ "$NO_BINLOGS" = 1 ]; then
  BL_NOTE="dump only (--no-binlogs)"
elif [ -z "$POSITION" ]; then
  BL_NOTE="dump only: this dump records no binlog position (taken before binary-log recovery existed, or with binary logging off)"
else
  BL_START="${POSITION% *}"; BL_POS="${POSITION#* }"
  binlog_file_ok "$BL_START" || die "the dump records an odd binlog file name: $BL_START"
  mkdir -p "$WORK/binlogs"
  if [ -n "$BINLOG_DIR" ]; then
    [ -d "$BINLOG_DIR" ] || die "no such directory: $BINLOG_DIR"
    cp "$BINLOG_DIR"/* "$WORK/binlogs/" 2>/dev/null || true
  elif [ "$FROM_BUCKET" = 1 ]; then
    if [ -z "$BINLOG_PREFIX" ]; then
      # The server uuid with the newest upload; a re-initialised database gets a new uuid and a new lineage.
      BINLOG_PREFIX="$(aws_cli s3 ls "s3://$BACKUP_S3_BUCKET/binlog/" --recursive | sort | tail -n 1 | awk '{print $NF}' | awk -F/ 'NF>=3{print $2}' || true)"
    fi
    if [ -n "$BINLOG_PREFIX" ]; then
      say "Downloading binlogs from s3://$BACKUP_S3_BUCKET/binlog/$BINLOG_PREFIX/"
      aws_cli s3 cp "s3://$BACKUP_S3_BUCKET/binlog/$BINLOG_PREFIX/" /work/binlogs/ --recursive --only-show-errors
    fi
  fi
  # Decrypt/decompress to plain files named like the server's own, keep those from the dump's file on.
  for f in "$WORK"/binlogs/*; do
    [ -f "$f" ] || continue
    b="$(basename "$f")"
    case "$b" in
      *.gz.age) [ -n "$IDENTITY" ] || { BL_NOTE="dump only: the binlogs are encrypted and no key was given"; break; }
                decrypt_file "$f" "$f.dec" "$IDENTITY"; gunzip -c "$f.dec" > "$WORK/binlogs/${b%.gz.age}"; rm -f "$f.dec" ;;
      *.gz.gpg) [ "$GPG_DECRYPT" = 1 ] || { BL_NOTE="dump only: the binlogs are encrypted and no key was given"; break; }
                decrypt_file "$f" "$f.dec"; gunzip -c "$f.dec" > "$WORK/binlogs/${b%.gz.gpg}"; rm -f "$f.dec" ;;
      *.gz) gunzip -c "$f" > "$WORK/binlogs/${b%.gz}" ;;
      *) ;;
    esac
  done
  if [ -z "$BL_NOTE" ]; then
    START_N="$(binlog_number "$BL_START")"
    prev=""
    while read -r b; do
      [ -n "$b" ] || continue
      binlog_file_ok "$b" || continue
      n="$(binlog_number "$b")"
      [ "$n" -ge "$START_N" ] || continue
      if [ -n "$prev" ] && [ "$n" -ne $((prev + 1)) ]; then
        die "the binlogs have a gap between number $prev and $n - point-in-time recovery would stop there"
      fi
      if [ -z "$prev" ] && [ "$n" -ne "$START_N" ]; then
        die "the binlog the dump starts at ($BL_START) is missing; the first one found is $b"
      fi
      prev="$n"
      BL_FILES+=("$b")
    done < <(find "$WORK/binlogs" -maxdepth 1 -type f -printf '%f\n' | sort)
    BL_COUNT="${#BL_FILES[@]}"
    if [ "$BL_COUNT" = 0 ]; then
      BL_NOTE="dump only: no binlog files from $BL_START on were found"
    else
      BL_LAST="${BL_FILES[$((BL_COUNT - 1))]}"
      for b in "${BL_FILES[@]}"; do
        [ "$(head -c 4 "$WORK/binlogs/$b" | od -An -tx1 | tr -d ' \n')" = "fe62696e" ] || die "$b is not a binary log (bad magic number)"
      done
    fi
  fi
fi

# ---- the mysqlbinlog tool image ---------------------------------------------------------------------
# The official mysql image ships mysqld, mysql and mysqldump but NOT mysqlbinlog (found by running
# this drill against the real image). The replay uses a small tool image with the SAME version of
# the MySQL client, built once from MySQL's own yum repo and kept on the box (a few hundred MB, a few
# minutes the first time). BINLOG_TOOL_IMAGE / --binlog-tool-image names one you already have.
TOOL_IMAGE="$BINLOG_TOOL_IMAGE"
if [ "$BL_COUNT" -gt 0 ] && [ -z "$TOOL_IMAGE" ]; then
  MYSQL_VERSION="${MYSQL_IMAGE#*:}"
  printf '%s' "$MYSQL_VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' \
    || die "cannot derive a MySQL version from $MYSQL_IMAGE: set BINLOG_TOOL_IMAGE to an image that has mysqlbinlog"
  TOOL_IMAGE="kiwiply-mysqlbinlog:$MYSQL_VERSION"
  if ! "${DOCKER:-docker}" image inspect "$TOOL_IMAGE" >/dev/null 2>&1; then
    say "Building $TOOL_IMAGE (mysql-community-client $MYSQL_VERSION from MySQL's yum repo; once, takes a few minutes)"
    # The GPG key is copied out of the official image, so the packages are signature-checked.
    "${DOCKER:-docker}" build -q -t "$TOOL_IMAGE" - >/dev/null <<DOCKERFILE || die "could not build $TOOL_IMAGE (needs network access to repo.mysql.com); or set BINLOG_TOOL_IMAGE"
FROM $MYSQL_IMAGE AS keys
FROM oraclelinux:9-slim
COPY --from=keys /etc/pki/rpm-gpg/RPM-GPG-KEY-mysql /etc/pki/rpm-gpg/RPM-GPG-KEY-mysql
RUN printf '[mysql-innovation]\nname=MySQL innovation\nbaseurl=https://repo.mysql.com/yum/mysql-innovation-community/el/9/\$basearch/\nenabled=1\ngpgcheck=1\ngpgkey=file:///etc/pki/rpm-gpg/RPM-GPG-KEY-mysql\nmodule_hotfixes=true\n' > /etc/yum.repos.d/mysql-innovation.repo \\
 && microdnf install -y tar mysql-community-client-$MYSQL_VERSION && microdnf clean all && mysqlbinlog --version
DOCKERFILE
  fi
fi

# ---- the throwaway server --------------------------------------------------------------------------
say "Starting a throwaway $MYSQL_IMAGE (no network)"
PW="drill-$(head -c 18 /dev/urandom | base64 | tr -dc 'A-Za-z0-9')"
# Same server flags as production, so names and charsets restore exactly as they are live. No binary
# log of its own: the drill's replay should not write more files.
"${DOCKER:-docker}" run -d --name "$DRILL" --network none --memory 1g \
  -e MYSQL_ROOT_PASSWORD="$PW" "$MYSQL_IMAGE" \
  mysqld --lower_case_table_names=1 --skip-mysqlx --character_set_server=utf8mb4 --explicit_defaults_for_timestamp --skip-log-bin \
  >/dev/null

drill_sql() { "${DOCKER:-docker}" exec -i -e MYSQL_PWD="$PW" "$DRILL" mysql -uroot -N -B "$@"; }

# The image's entrypoint runs a temporary server first (port 0) and then restarts: only the real
# one listens on 3306, so wait for that line rather than the first successful ping.
for i in $(seq 1 90); do
  if "${DOCKER:-docker}" logs "$DRILL" 2>&1 | grep -q 'ready for connections.*port: 3306' \
    && drill_sql -e 'SELECT 1' >/dev/null 2>&1; then
    break
  fi
  [ "$i" -lt 90 ] || die "the throwaway MySQL never came up"
  sleep 2
done

say "Restoring $NAME into it"
gunzip -c "$FILE" | drill_sql

if [ "$BL_COUNT" -gt 0 ]; then
  say "Replaying $BL_COUNT binlog file(s), $BL_START from position $BL_POS to $BL_LAST${STOP_DT:+, stopping at $STOP_DT}"
  args=(--start-position="$BL_POS")
  [ -z "$STOP_DT" ] || args+=(--stop-datetime="$STOP_DT")
  args+=("${BL_FILES[@]}")
  # Two steps, so a mysqlbinlog failure stops the drill instead of being hidden by a pipe. The files
  # travel into the tool container as a tar stream on stdin: no bind mounts, no docker cp.
  tar -C "$WORK/binlogs" -cf - "${BL_FILES[@]}"     | "${DOCKER:-docker}" run --rm -i --network none --memory 512m "$TOOL_IMAGE"         sh -c 'mkdir /b && tar -xf - -C /b && cd /b && exec mysqlbinlog "$@"' mysqlbinlog "${args[@]}" > "$WORK/replay.sql"
  [ -s "$WORK/replay.sql" ] || die "mysqlbinlog produced nothing"
  drill_sql < "$WORK/replay.sql"
  BL_NOTE="+ $BL_COUNT binlog file(s) replayed ($BL_START@$BL_POS .. $BL_LAST${STOP_DT:+, to $STOP_DT})"
fi

# ---- the sanity checks -----------------------------------------------------------------------------
say "Checking the restore"
TABLES="$(drill_sql -e "SELECT table_name FROM information_schema.tables WHERE table_schema='$SCHEMA' ORDER BY 1")"
[ -n "$TABLES" ] || die "no tables restored into $SCHEMA"
printf '%s\n' "$TABLES" | grep -qx databasechangelog || die "the Liquibase changelog table is missing"
printf '%s\n' "$TABLES" | grep -qx jhi_user || die "the user table is missing"
USERS="$(drill_sql -e "SELECT COUNT(*) FROM $SCHEMA.jhi_user")"
[ "$USERS" -ge "$MIN_USERS" ] || die "the user table has $USERS row(s), expected at least $MIN_USERS"
CHANGESETS="$(drill_sql -e "SELECT COUNT(*) FROM $SCHEMA.databasechangelog")"
[ "$CHANGESETS" -ge 1 ] || die "the Liquibase changelog restored empty"
FAILED_CS="$(drill_sql -e "SELECT COUNT(*) FROM $SCHEMA.databasechangelog WHERE exectype NOT IN ('EXECUTED','RERAN','MARK_RAN','SKIPPED')")"
[ "$FAILED_CS" = 0 ] || die "$FAILED_CS Liquibase changeset(s) are not in a good state (exectype)"
LAST_CS="$(drill_sql -e "SELECT COALESCE(MAX(dateexecuted),'unknown') FROM $SCHEMA.databasechangelog")"

# The drill's record: every table's exact row count.
COUNTS="$(printf '%s\n' "$TABLES" \
  | while read -r t; do printf "SELECT '%s', COUNT(*) FROM %s.\`%s\`;\n" "$t" "$SCHEMA" "$t"; done \
  | drill_sql)"
printf '%s\n' "$COUNTS" | awk '{printf "    %-40s %s\n", $1, $2}'
NTABLES="$(printf '%s\n' "$TABLES" | wc -l | tr -d ' ')"
REPORT="$(date -u +%FT%TZ) restore drill OK - $NAME ${BL_NOTE:-dump only}: $NTABLES tables, $USERS users, $CHANGESETS changesets (latest $LAST_CS)"
say "$REPORT"
mkdir -p "$LOG_DIR"
printf '%s\n' "$REPORT" >> "$LOG_DIR/restore-drills.log"

hc_ping "$HC_DRILL_URL" "" "$REPORT"

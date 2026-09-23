#!/usr/bin/env bash
# Prove the newest backup actually restores (Phase 15.1a) — the weekly restore drill.
#
# RUN ON: the production box, weekly from cron (scripts/ops/kiwiply-ops.cron) or by hand:
#   scripts/ops/verify-restore.sh                        # newest backup in the bucket vs the live DB
#   scripts/ops/verify-restore.sh --file X.sql.gz --no-live   # a local dump, no live comparison
#
# Restores into a THROWAWAY MySQL container with no network, never into production:
#   1. fetches the newest daily/ backup and checks its sha256 against the one uploaded with it;
#   2. fails if that backup is more than MAX_AGE_DAYS old (the nightly job has stopped);
#   3. checks the dump is whole, loads it into a fresh mysql container of the production version;
#   4. checks the restore: users and the Liquibase changelog are there, and every live table
#      that existed before the backup was taken exists in the restore;
#   5. prints each table's row count (the drill's record, also appended to restore-drills.log),
#      removes the container, and reports to Healthchecks.io.
#
# From .env (bucket mode): the BACKUP_* variables (see backup-db.sh) and HC_RESTORE_URL.
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
LIVE=1
HC_RESTORE_URL=""
WORK=""

while [ $# -gt 0 ]; do
  case "$1" in
    --file) FILE="${2:?--file needs a path}"; shift 2 ;;
    --no-live) LIVE=0; shift ;;
    *) die "unknown argument: $1 (usage: $0 [--file X.sql.gz] [--no-live])" ;;
  esac
done

compose() {
  "${DOCKER:-docker}" compose -f "$REPO/docker-compose.prod.yml" -f "$REPO/docker-compose.shared-edge.yml" "$@"
}

finish() {
  local rc=$?
  "${DOCKER:-docker}" rm -f -v "$DRILL" >/dev/null 2>&1 || true
  [ -z "$WORK" ] || rm -rf "$WORK"
  if [ "$rc" -ne 0 ]; then
    warn "restore check FAILED (exit $rc)"
    hc_ping "$HC_RESTORE_URL" fail
  fi
}
trap finish EXIT

WORK="$(mktemp -d)"
chmod 700 "$WORK"

if [ -z "$FILE" ]; then
  [ -f "$ENV_FILE" ] || die "no .env at $ENV_FILE"
  HC_RESTORE_URL="$(env_get "$ENV_FILE" HC_RESTORE_URL)"
  load_backup_env "$ENV_FILE"
  hc_ping "$HC_RESTORE_URL" start

  say "Finding the newest backup in s3://$BACKUP_S3_BUCKET/daily/"
  NAME="$(aws_cli s3 ls "s3://$BACKUP_S3_BUCKET/daily/" | latest_backup)"
  [ -n "$NAME" ] || die "there are no backups in s3://$BACKUP_S3_BUCKET/daily/"
  AGE="$(days_between "$(backup_date "$NAME")" "$(date -u +%F)")"
  [ "$AGE" -le "$MAX_AGE_DAYS" ] || die "the newest backup ($NAME) is $AGE days old — the nightly backup has stopped"

  say "Downloading $NAME ($AGE day(s) old)"
  aws_cli s3 cp "s3://$BACKUP_S3_BUCKET/daily/$NAME" "/work/$NAME" --only-show-errors
  EXPECTED="$(aws_cli s3api head-object --bucket "$BACKUP_S3_BUCKET" --key "daily/$NAME" \
    --query 'Metadata.sha256' --output text | tr -d '\r')"
  [ "$(sha256_of "$WORK/$NAME")" = "$EXPECTED" ] || die "$NAME doesn't match the sha256 it was uploaded with"
  FILE="$WORK/$NAME"
else
  [ -f "$FILE" ] || die "no such file: $FILE"
  NAME="$(basename "$FILE")"
fi
TAKEN="$(backup_date "$NAME")"
# A name without a date (a hand-made dump) compares against nothing live "before" it.
printf '%s' "$TAKEN" | grep -qE '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' || TAKEN="1970-01-01"

say "Checking the dump is whole"
dump_complete "$FILE" || die "$NAME is incomplete (no trailer or no tables)"

say "Starting a throwaway $MYSQL_IMAGE (no network)"
PW="drill-$(head -c 18 /dev/urandom | base64 | tr -dc 'A-Za-z0-9')"
# Same server flags as production, so names and charsets restore exactly as they are live.
"${DOCKER:-docker}" run -d --name "$DRILL" --network none --memory 1g \
  -e MYSQL_ROOT_PASSWORD="$PW" "$MYSQL_IMAGE" \
  mysqld --lower_case_table_names=1 --skip-mysqlx --character_set_server=utf8mb4 --explicit_defaults_for_timestamp \
  >/dev/null

drill_sql() { "${DOCKER:-docker}" exec -i -e MYSQL_PWD="$PW" "$DRILL" mysql -uroot -N -B "$@"; }

# The image's entrypoint runs a temporary server first (port 0) and then restarts — only the
# real one listens on 3306, so wait for that line rather than the first successful ping.
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

say "Checking the restore"
TABLES="$(drill_sql -e "SELECT table_name FROM information_schema.tables WHERE table_schema='$SCHEMA' ORDER BY 1")"
[ -n "$TABLES" ] || die "no tables restored into $SCHEMA"
printf '%s\n' "$TABLES" | grep -qx databasechangelog || die "the Liquibase changelog is missing"
printf '%s\n' "$TABLES" | grep -qx jhi_user || die "the user table is missing"
USERS="$(drill_sql -e "SELECT COUNT(*) FROM $SCHEMA.jhi_user")"
[ "$USERS" -ge 1 ] || die "the user table restored empty"
CHANGESETS="$(drill_sql -e "SELECT COUNT(*) FROM $SCHEMA.databasechangelog")"

if [ "$LIVE" = 1 ]; then
  # Every live table created before the backup's date must be in it. (A table created since —
  # a migration that deployed after last night's dump — is expected to be missing.)
  # shellcheck disable=SC2016
  LIVE_TABLES="$(compose exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -uroot -N -B -e "$0"' \
    "SELECT table_name FROM information_schema.tables WHERE table_schema='$SCHEMA' AND create_time < '$TAKEN 00:00:00' ORDER BY 1" \
    | tr -d '\r')"
  MISSING="$(comm -23 <(printf '%s\n' "$LIVE_TABLES" | sort) <(printf '%s\n' "$TABLES" | sort) | tr '\n' ' ')"
  [ -z "${MISSING// /}" ] || die "live tables missing from the restore: $MISSING"
fi

# The drill's record: every table's exact row count.
COUNTS="$(printf '%s\n' "$TABLES" \
  | while read -r t; do printf "SELECT '%s', COUNT(*) FROM %s.\`%s\`;\n" "$t" "$SCHEMA" "$t"; done \
  | drill_sql)"
REPORT="$(date -u +%FT%TZ) restore drill OK — $NAME: $(printf '%s\n' "$TABLES" | wc -l | tr -d ' ') tables, $USERS users, $CHANGESETS changesets"
printf '%s\n' "$COUNTS" | awk '{printf "    %-40s %s\n", $1, $2}'
say "$REPORT"
mkdir -p "$LOG_DIR"
printf '%s\n' "$REPORT" >> "$LOG_DIR/restore-drills.log"

hc_ping "$HC_RESTORE_URL"

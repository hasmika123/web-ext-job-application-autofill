#!/usr/bin/env bash
# Ship MySQL binary logs off the box (REAL-GAPS-C P0.2): point-in-time recovery between the nightly
# dumps, so a disaster loses minutes instead of up to a day.
#
# RUN ON: the production box, every 15 minutes from cron (scripts/ops/kiwiply-ops.cron), or by hand:
#   scripts/ops/ship-binlogs.sh              # rotate the log, upload every closed file not yet in S3, ping
#   scripts/ops/ship-binlogs.sh --dry-run    # say what it would do; touch nothing
#
# 1. Rotates the binary log (FLUSH BINARY LOGS), so every committed transaction up to this moment is
#    in a CLOSED file. The newest (active) file is never copied; it is closed on the next run.
#    That is the 15 minute RPO: at most one run's worth of writes lives only on the box.
# 2. Lists what is already in s3://$BACKUP_S3_BUCKET/binlog/<server uuid>/ and uploads each closed
#    file that is missing, as <name>.gz (encrypted to .age/.gpg when a recipient is set, like the
#    dumps), with its sha256 as metadata. Safe to re-run: a file is never uploaded twice.
# 3. Optionally frees disk on the box: BINLOG_LOCAL_KEEP_DAYS=N purges files older than N days, only
#    after every closed file has been shipped. Unset = MySQL's own expiry (30 days) applies.
# 4. Pings Healthchecks.io (HC_BINLOG_URL: period 15 minutes, grace 15 minutes): start, success, /fail.
#
# NO-OP when the backup settings are not set (BACKUP_S3_BUCKET and both keys all empty): it says so
# and exits 0, so the cron line is safe to install before the bucket exists. Set only some of them
# and it fails naming the missing ones. It cannot delete anything in S3 (the backup key has no
# delete permission); the bucket's lifecycle rule `binlog/` expires files after 32 days.
#
# Point-in-time recovery needs a dump that records its binlog position (lib.sh dump_database does,
# via --source-data=2): DEPLOY.md section 5.9. scripts/ops/restore-drill.sh rehearses it monthly.
#
# From .env or the environment: BACKUP_S3_BUCKET, BACKUP_S3_REGION, BACKUP_AWS_ACCESS_KEY_ID,
# BACKUP_AWS_SECRET_ACCESS_KEY, HC_BINLOG_URL (optional but it is the alarm), BINLOG_LOCAL_KEEP_DAYS,
# BACKUP_AGE_RECIPIENT / BACKUP_GPG_RECIPIENT.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=scripts/ops/lib.sh
. "$HERE/lib.sh"

REPO="${REPO:-$(cd "$HERE/../.." && pwd)}"
ENV_FILE="${ENV_FILE:-$REPO/.env}"
HC_BINLOG_URL=""
WORK=""
DRY=0

case "${1:-}" in
  --dry-run) DRY=1 ;;
  "") ;;
  *) die "unknown argument: $1 (usage: $0 [--dry-run])" ;;
esac

# Production always runs with the shared-edge overlay (CLAUDE.md), like every other ops script.
compose() {
  "${DOCKER:-docker}" compose --project-directory "$REPO" \
    -f "$REPO/docker-compose.prod.yml" -f "$REPO/docker-compose.shared-edge.yml" "$@"
}

# sql STATEMENT — one statement to the live MySQL, tab-separated rows, no headers.
sql() {
  # shellcheck disable=SC2016 # $MYSQL_ROOT_PASSWORD is the container's own, expanded in there.
  compose exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -uroot -N -B -e "$0"' "$1" | tr -d '\r'
}

finish() {
  local rc=$?
  [ -z "$WORK" ] || rm -rf "$WORK"
  if [ "$rc" -ne 0 ]; then
    warn "binlog shipping FAILED (exit $rc)"
    hc_ping "$HC_BINLOG_URL" fail
  fi
}
trap finish EXIT

BUCKET="$(env_or_file BACKUP_S3_BUCKET "$ENV_FILE")"
KEY_ID="$(env_or_file BACKUP_AWS_ACCESS_KEY_ID "$ENV_FILE")"
KEY_SECRET="$(env_or_file BACKUP_AWS_SECRET_ACCESS_KEY "$ENV_FILE")"
if [ -z "$BUCKET$KEY_ID$KEY_SECRET" ]; then
  say "Binlog shipping is not configured (BACKUP_S3_BUCKET and the backup keys are empty in the environment and in $ENV_FILE): nothing to do"
  exit 0
fi
HC_BINLOG_URL="$(env_or_file HC_BINLOG_URL "$ENV_FILE")"
KEEP_DAYS="$(env_or_file BINLOG_LOCAL_KEEP_DAYS "$ENV_FILE")"
case "$KEEP_DAYS" in ''|*[!0-9]*) [ -z "$KEEP_DAYS" ] || die "BINLOG_LOCAL_KEEP_DAYS must be a whole number of days (got '$KEEP_DAYS')" ;; *) ;; esac
missing=""
[ -n "$BUCKET" ] || missing="$missing BACKUP_S3_BUCKET"
[ -n "$KEY_ID" ] || missing="$missing BACKUP_AWS_ACCESS_KEY_ID"
[ -n "$KEY_SECRET" ] || missing="$missing BACKUP_AWS_SECRET_ACCESS_KEY"
[ -z "$missing" ] || die "set these in $ENV_FILE:$missing (DEPLOY.md section 5.9)"
BACKUP_S3_BUCKET="$BUCKET"
AWS_ACCESS_KEY_ID="$KEY_ID"
AWS_SECRET_ACCESS_KEY="$KEY_SECRET"
AWS_DEFAULT_REGION="$(env_or_file BACKUP_S3_REGION "$ENV_FILE")"
: "${AWS_DEFAULT_REGION:=us-east-1}"
export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_DEFAULT_REGION
load_encryption_env "$ENV_FILE"
ENC_EXT="$(encryption_ext)"

if [ "$DRY" = 1 ]; then
  say "[dry-run] would rotate the binary log, then upload each closed binlog file not yet in s3://$BACKUP_S3_BUCKET/binlog/<server uuid>/ as <name>.gz${ENC_EXT}"
  if [ -n "$KEEP_DAYS" ]; then PURGE_NOTE="files older than $KEEP_DAYS days, after a full ship"; else PURGE_NOTE="none (MySQL's own expiry applies)"; fi
  say "[dry-run] local purge: $PURGE_NOTE; Healthchecks.io: $(configured "$HC_BINLOG_URL")"
  exit 0
fi

hc_ping "$HC_BINLOG_URL" start

[ "$(sql 'SELECT @@log_bin')" = 1 ] || die "binary logging is OFF on this MySQL: nothing to ship (see DEPLOY.md section 5.9)"
UUID="$(sql 'SELECT @@server_uuid')"
printf '%s' "$UUID" | grep -Eq '^[0-9a-f-]{36}$' || die "could not read the server uuid (got '$UUID')"
BASENAME="$(sql 'SELECT @@log_bin_basename')"
DATADIR="$(dirname "$BASENAME")"

WORK="$(mktemp -d)"
chmod 700 "$WORK"

say "Rotating the binary log"
sql 'FLUSH BINARY LOGS' >/dev/null

# SHOW BINARY LOGS: name, size[, encrypted]; the LAST row is the active file, the rest are closed.
LOGS="$(sql 'SHOW BINARY LOGS' | awk '{print $1}')"
[ -n "$LOGS" ] || die "SHOW BINARY LOGS returned nothing"
CLOSED="$(printf '%s\n' "$LOGS" | sed '$d')"

say "Checking what is already in s3://$BACKUP_S3_BUCKET/binlog/$UUID/"
SHIPPED="$(aws_cli s3 ls "s3://$BACKUP_S3_BUCKET/binlog/$UUID/" | awk '{print $NF}' | sed -E 's/(\.(gz|age|gpg))+$//' | sort -u || true)"

N=0
LAST=""
SIZE_TOTAL=0
while read -r name; do
  [ -n "$name" ] || continue
  binlog_file_ok "$name" || die "unexpected binlog file name: $name"
  if printf '%s\n' "$SHIPPED" | grep -qxF -- "$name"; then continue; fi
  say "Shipping $name"
  compose exec -T mysql cat "$DATADIR/$name" | gzip -9 > "$WORK/$name.gz"
  gzip -t "$WORK/$name.gz" || die "$name did not copy cleanly"
  [ "$(gunzip -c "$WORK/$name.gz" | head -c 4 | od -An -tx1 | tr -d ' \n')" = "fe62696e" ] \
    || die "$name is not a binary log (bad magic number)"
  OBJ="$name.gz"
  if [ -n "$ENC_EXT" ]; then
    encrypt_file "$WORK/$OBJ" "$WORK/$OBJ$ENC_EXT"
    rm -f "$WORK/$OBJ"
    OBJ="$OBJ$ENC_EXT"
  fi
  SUM="$(sha256_of "$WORK/$OBJ")"
  aws_cli s3 cp "/work/$OBJ" "s3://$BACKUP_S3_BUCKET/binlog/$UUID/$OBJ" --only-show-errors --metadata "sha256=$SUM"
  SIZE_TOTAL=$((SIZE_TOTAL + $(wc -c < "$WORK/$OBJ")))
  rm -f "$WORK/$OBJ"
  N=$((N + 1))
  LAST="$name"
done <<<"$CLOSED"

if [ -n "$KEEP_DAYS" ]; then
  # Every closed file is in S3 now (this run or an earlier one), so dropping the old ones from the
  # box loses nothing. PURGE ... BEFORE never touches the active file.
  say "Purging binary logs older than $KEEP_DAYS days from the box (all closed files are in S3)"
  sql "PURGE BINARY LOGS BEFORE NOW() - INTERVAL $KEEP_DAYS DAY" >/dev/null
fi

hc_ping "$HC_BINLOG_URL" "" "shipped $N file(s), $SIZE_TOTAL bytes${LAST:+, newest $LAST}"
say "Binlogs done: $N shipped${LAST:+ (newest $LAST)}, $(printf '%s\n' "$CLOSED" | grep -c . || true) closed on the box"

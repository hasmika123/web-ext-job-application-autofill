#!/usr/bin/env bash
# Nightly off-box backup of the production database (Phase 15.1a).
#
# RUN ON: the production box, from cron (scripts/ops/kiwiply-ops.cron, DEPLOY.md §5.1):
#   scripts/ops/backup-db.sh
#
# 1. Dumps MySQL as one consistent InnoDB snapshot — the app keeps serving, nothing is locked.
# 2. Refuses a dump that was cut short (no "Dump completed" trailer, or no tables in it).
# 3. Uploads it to the BACKUP bucket as daily/dossier-YYYY-MM-DD.sql.gz with its sha256 as
#    metadata, and on the 1st of the month also as monthly/… .
# 4. Keeps the last 3 on the box as well, for a fast restore that doesn't need S3.
# 5. Reports start / success / failure to Healthchecks.io, which emails when a night is missed.
#
# It can't delete anything in the bucket — the backup key has no delete permission, by design,
# so a compromised box can't wipe its own backups. The bucket's lifecycle rules expire old copies.
#
# From .env: BACKUP_S3_BUCKET, BACKUP_S3_REGION, BACKUP_AWS_ACCESS_KEY_ID,
# BACKUP_AWS_SECRET_ACCESS_KEY, and HC_BACKUP_URL (optional, but it's the alarm).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=scripts/ops/lib.sh
. "$HERE/lib.sh"

REPO="${REPO:-$(cd "$HERE/../.." && pwd)}"
ENV_FILE="${ENV_FILE:-$REPO/.env}"
LOCAL_DIR="${BACKUP_LOCAL_DIR:-$HOME/kiwiply-backups}"
KEEP_LOCAL="${BACKUP_KEEP_LOCAL:-3}"
TODAY="${BACKUP_DATE:-$(date -u +%F)}"
HC_BACKUP_URL=""
WORK=""

# Production always runs with the shared-edge overlay (DEPLOY.md §5) — the same pair deploy.yml uses.
compose() {
  "${DOCKER:-docker}" compose -f "$REPO/docker-compose.prod.yml" -f "$REPO/docker-compose.shared-edge.yml" "$@"
}

finish() {
  local rc=$?
  [ -z "$WORK" ] || rm -rf "$WORK"
  if [ "$rc" -ne 0 ]; then
    warn "backup FAILED (exit $rc)"
    hc_ping "$HC_BACKUP_URL" fail
  fi
}
trap finish EXIT

[ -f "$ENV_FILE" ] || die "no .env at $ENV_FILE"
HC_BACKUP_URL="$(env_get "$ENV_FILE" HC_BACKUP_URL)"
load_backup_env "$ENV_FILE"
hc_ping "$HC_BACKUP_URL" start

WORK="$(mktemp -d)"
chmod 700 "$WORK"
NAME="$(backup_name "$TODAY")"

say "Dumping the database"
# --single-transaction: a consistent snapshot without locking. --set-gtid-purged=OFF: restores
# into a fresh server. The password stays inside the container (MYSQL_PWD), off the command line.
# shellcheck disable=SC2016 # $MYSQL_ROOT_PASSWORD is the container's own, expanded in there.
compose exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysqldump -uroot \
    --single-transaction --routines --triggers --events --set-gtid-purged=OFF \
    --databases dossierApi' \
  | gzip -9 > "$WORK/$NAME"

say "Checking the dump is whole"
dump_complete "$WORK/$NAME" || die "the dump is incomplete (no trailer or no tables) — not uploading it"
SUM="$(sha256_of "$WORK/$NAME")"
SIZE="$(du -h "$WORK/$NAME" | awk '{print $1}')"

say "Uploading daily/$NAME ($SIZE) to s3://$BACKUP_S3_BUCKET"
aws_cli s3 cp "/work/$NAME" "s3://$BACKUP_S3_BUCKET/daily/$NAME" --only-show-errors --metadata "sha256=$SUM"
if is_monthly "$TODAY"; then
  say "First of the month — also keeping monthly/$NAME"
  aws_cli s3 cp "/work/$NAME" "s3://$BACKUP_S3_BUCKET/monthly/$NAME" --only-show-errors --metadata "sha256=$SUM"
fi

say "Keeping the last $KEEP_LOCAL on the box in $LOCAL_DIR"
mkdir -p "$LOCAL_DIR"
chmod 700 "$LOCAL_DIR"
cp "$WORK/$NAME" "$LOCAL_DIR/$NAME"
# Names sort by date; everything but the newest KEEP_LOCAL goes. (Local copies only — the
# bucket is never touched here.)
find "$LOCAL_DIR" -maxdepth 1 -name 'dossier-*.sql.gz' -printf '%f\n' | sort | head -n "-$KEEP_LOCAL" \
  | while read -r old; do rm -f "$LOCAL_DIR/$old"; done

hc_ping "$HC_BACKUP_URL"
say "Backup done: $NAME, $SIZE, sha256 $SUM"

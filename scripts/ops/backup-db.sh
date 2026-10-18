#!/usr/bin/env bash
# Nightly off-box backup of the production database (Phase 15.1a).
#
# RUN ON: the production box, from cron (scripts/ops/kiwiply-ops.cron, DEPLOY.md §5.1):
#   scripts/ops/backup-db.sh
#
# 1. Dumps MySQL as one consistent InnoDB snapshot — the app keeps serving, nothing is locked.
# 2. Refuses a dump that was cut short (no "Dump completed" trailer, or no tables in it).
# 3. Optionally encrypts it (BACKUP_AGE_RECIPIENT or BACKUP_GPG_RECIPIENT; off by default).
# 4. Uploads it to the BACKUP bucket as daily/dossier-YYYY-MM-DD.sql.gz[.age|.gpg] with its sha256
#    as metadata, and on the 1st of the month also as monthly/… .
# 5. Keeps the last 3 on the box as well, for a fast restore that doesn't need S3.
# 6. Reports start / success / failure to Healthchecks.io, which emails when a night is missed.
#
# It can't delete anything in the bucket — the backup key has no delete permission, by design,
# so a compromised box can't wipe its own backups. The bucket's lifecycle rules expire old copies.
#
# From .env: BACKUP_S3_BUCKET, BACKUP_S3_REGION, BACKUP_AWS_ACCESS_KEY_ID,
# BACKUP_AWS_SECRET_ACCESS_KEY, and HC_BACKUP_URL (optional, but it's the alarm). Optional:
# BACKUP_AGE_RECIPIENT / BACKUP_GPG_RECIPIENT (encrypt the dump; only the PUBLIC key goes on the
# box, the private key stays in the password manager - DEPLOY.md §5.7).
#   scripts/ops/backup-db.sh --dry-run    # says what it would do; dumps, uploads and pings nothing
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
DRY=0

case "${1:-}" in
  --dry-run) DRY=1 ;;
  "") ;;
  *) die "unknown argument: $1 (usage: $0 [--dry-run])" ;;
esac

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
load_encryption_env "$ENV_FILE"
ENC_EXT="$(encryption_ext)"
NAME="$(backup_name "$TODAY")"

if [ "$DRY" = 1 ]; then
  say "[dry-run] would dump the database to $NAME and check it is whole"
  if [ -n "$ENC_EXT" ]; then
    say "[dry-run] would encrypt it to $NAME$ENC_EXT (${ENC_EXT#.})"
  else
    say "[dry-run] not encrypting (no BACKUP_AGE_RECIPIENT / BACKUP_GPG_RECIPIENT)"
  fi
  say "[dry-run] would upload daily/$NAME$ENC_EXT to s3://$BACKUP_S3_BUCKET$(is_monthly "$TODAY" && printf ' and monthly/')"
  say "[dry-run] would keep the last $KEEP_LOCAL in $LOCAL_DIR; Healthchecks.io: $(configured "$HC_BACKUP_URL")"
  exit 0
fi

hc_ping "$HC_BACKUP_URL" start

WORK="$(mktemp -d)"
chmod 700 "$WORK"

say "Dumping the database"
dump_database > "$WORK/$NAME"

say "Checking the dump is whole"
dump_complete "$WORK/$NAME" || die "the dump is incomplete (no trailer or no tables) — not uploading it"
if [ -n "$ENC_EXT" ]; then
  say "Encrypting it (${ENC_EXT#.}); only the public key is on this box"
  encrypt_file "$WORK/$NAME" "$WORK/$NAME$ENC_EXT"
  rm -f "$WORK/$NAME"
  NAME="$NAME$ENC_EXT"
fi
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
find "$LOCAL_DIR" -maxdepth 1 -name 'dossier-*.sql.gz*' -printf '%f\n' | sort | head -n "-$KEEP_LOCAL" \
  | while read -r old; do rm -f "$LOCAL_DIR/$old"; done

hc_ping "$HC_BACKUP_URL"
say "Backup done: $NAME, $SIZE, sha256 $SUM"

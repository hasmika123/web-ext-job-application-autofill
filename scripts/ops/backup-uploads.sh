#!/usr/bin/env bash
# Back up the `uploads` Docker volume (REAL-GAPS-C P0.5). The volume holds user files (resumes,
# attachments, built-resume PDFs) when DOSSIER_STORAGE_DRIVER=local, and it is NOT in the MySQL dump.
#
# RUN ON: the production box, daily from cron (scripts/ops/kiwiply-ops.cron), or by hand:
#   scripts/ops/backup-uploads.sh              # archive, (encrypt), upload, ping
#   scripts/ops/backup-uploads.sh --dry-run    # say what it would do; touch nothing
#
# 1. Archives the volume read-only through a throwaway container (nothing is installed on the host,
#    the app keeps running; files written during the minute are simply in or out of the archive).
# 2. Writes a manifest (sha256, path) next to it, so a restore can be checked file by file.
# 3. Encrypts the archive when BACKUP_AGE_RECIPIENT / BACKUP_GPG_RECIPIENT is set (it holds resumes,
#    which are PII), refuses an empty or unreadable archive.
# 4. Uploads uploads/uploads-YYYY-MM-DD.tar.gz[.age|.gpg] and uploads/manifest-YYYY-MM-DD.txt to the
#    BACKUP bucket (same upload-only key as the database dumps; the lifecycle rule expires them
#    after 30 days, so a user's deleted file leaves the backups within a month).
# 5. Pings Healthchecks.io (HC_UPLOADS_URL: period 1 day, grace 2 hours): start, success, /fail.
#
# An empty volume (storage driver s3: the files live in S3, enable versioning on THAT bucket) is a
# success with a note, not a failure. Restore: DEPLOY.md section 5.7.
#
# From .env: the BACKUP_* settings of backup-db.sh, HC_UPLOADS_URL, optionally UPLOADS_VOLUME (else
# found from the running api container, else dossier_uploads) and the encryption recipient.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=scripts/ops/lib.sh
. "$HERE/lib.sh"

REPO="${REPO:-$(cd "$HERE/../.." && pwd)}"
ENV_FILE="${ENV_FILE:-$REPO/.env}"
TODAY="${BACKUP_DATE:-$(date -u +%F)}"
HELPER_IMAGE="${UPLOADS_HELPER_IMAGE:-alpine:3.20}"
HC_UPLOADS_URL=""
WORK=""
DRY=0

case "${1:-}" in
  --dry-run) DRY=1 ;;
  "") ;;
  *) die "unknown argument: $1 (usage: $0 [--dry-run])" ;;
esac

compose() {
  "${DOCKER:-docker}" compose --project-directory "$REPO" \
    -f "$REPO/docker-compose.prod.yml" -f "$REPO/docker-compose.shared-edge.yml" "$@"
}

finish() {
  local rc=$?
  [ -z "$WORK" ] || rm -rf "$WORK"
  if [ "$rc" -ne 0 ]; then
    warn "uploads backup FAILED (exit $rc)"
    hc_ping "$HC_UPLOADS_URL" fail
  fi
}
trap finish EXIT

[ -f "$ENV_FILE" ] || die "no .env at $ENV_FILE"
HC_UPLOADS_URL="$(env_or_file HC_UPLOADS_URL "$ENV_FILE")"
load_backup_env "$ENV_FILE"
load_encryption_env "$ENV_FILE"
ENC_EXT="$(encryption_ext)"

# The volume name: explicit setting, else the one mounted at /srv/uploads in the running api, else the default.
VOLUME="$(env_or_file UPLOADS_VOLUME "$ENV_FILE")"
if [ -z "$VOLUME" ] && [ "$DRY" = 0 ]; then
  cid="$(compose ps -q api 2>/dev/null | head -n 1)" || cid=""
  if [ -n "$cid" ]; then
    VOLUME="$("${DOCKER:-docker}" inspect --format '{{range .Mounts}}{{if eq .Destination "/srv/uploads"}}{{.Name}}{{end}}{{end}}' "$cid" 2>/dev/null)" || VOLUME=""
  fi
fi
: "${VOLUME:=dossier_uploads}"
ARCHIVE="uploads-$TODAY.tar.gz"
MANIFEST="manifest-$TODAY.txt"

if [ "$DRY" = 1 ]; then
  say "[dry-run] would archive volume $VOLUME (read-only, via $HELPER_IMAGE) to $ARCHIVE and write $MANIFEST"
  if [ -n "$ENC_EXT" ]; then say "[dry-run] would encrypt the archive to $ARCHIVE$ENC_EXT"; else say "[dry-run] not encrypting (no BACKUP_AGE_RECIPIENT / BACKUP_GPG_RECIPIENT)"; fi
  say "[dry-run] would upload both under s3://$BACKUP_S3_BUCKET/uploads/; Healthchecks.io: $(configured "$HC_UPLOADS_URL")"
  exit 0
fi

hc_ping "$HC_UPLOADS_URL" start
WORK="$(mktemp -d)"
chmod 700 "$WORK"

say "Archiving volume $VOLUME"
# The manifest is sha256sum's own format, relative to the volume root: `sha256sum -c` checks a restore.
# shellcheck disable=SC2016 # $0 and $1 are the container shell's own (the two names passed after the script).
"${DOCKER:-docker}" run --rm -v "$VOLUME:/data:ro" -v "$WORK:/out" "$HELPER_IMAGE" sh -c \
  'cd /data && tar -cf - . | gzip -9 > "/out/$0" && find . -type f -print0 | xargs -r -0 sha256sum > "/out/$1"' \
  "$ARCHIVE" "$MANIFEST"

[ -s "$WORK/$ARCHIVE" ] || die "the archive is empty - is $VOLUME the right volume?"
gunzip -t "$WORK/$ARCHIVE" || die "the archive is not a valid gzip - not uploading it"
FILES="$(wc -l < "$WORK/$MANIFEST" | tr -d ' ')"
if [ "$FILES" = 0 ]; then
  say "Volume $VOLUME has no files (storage driver s3?): nothing to upload"
  hc_ping "$HC_UPLOADS_URL" "" "volume empty, nothing to back up"
  exit 0
fi
tar -tzf "$WORK/$ARCHIVE" >/dev/null || die "the archive cannot be listed - not uploading it"

NAME="$ARCHIVE"
if [ -n "$ENC_EXT" ]; then
  say "Encrypting the archive (${ENC_EXT#.}); only the public key is on this box"
  encrypt_file "$WORK/$ARCHIVE" "$WORK/$ARCHIVE$ENC_EXT"
  rm -f "$WORK/$ARCHIVE"
  NAME="$ARCHIVE$ENC_EXT"
fi
SUM="$(sha256_of "$WORK/$NAME")"
SIZE="$(du -h "$WORK/$NAME" | awk '{print $1}')"

say "Uploading uploads/$NAME ($SIZE, $FILES files) to s3://$BACKUP_S3_BUCKET"
aws_cli s3 cp "/work/$NAME" "s3://$BACKUP_S3_BUCKET/uploads/$NAME" --only-show-errors --metadata "sha256=$SUM"
aws_cli s3 cp "/work/$MANIFEST" "s3://$BACKUP_S3_BUCKET/uploads/$MANIFEST" --only-show-errors

hc_ping "$HC_UPLOADS_URL" "" "$FILES files, $SIZE"
say "Uploads backup done: $NAME, $FILES files, $SIZE, sha256 $SUM"

#!/usr/bin/env bash
# Pre-deploy database snapshot (REAL-GAPS-C P2.3). deploy.sh runs this just before it changes
# anything, so a deploy whose migration goes wrong has a dump from seconds earlier to go back to.
#
# RUN ON: the box, by deploy.sh (it is the default snapshot hook), or by hand:
#   scripts/ops/snapshot-db.sh                    # production
#   scripts/ops/snapshot-db.sh --staging          # the staging stack (.env.staging)
#   scripts/ops/snapshot-db.sh --dry-run
#
# Writes $BACKUP_LOCAL_DIR/pre-deploy-<UTC time>[-label].sql.gz (default ~/kiwiply-backups), refuses
# a dump that was cut short, encrypts it when BACKUP_AGE_RECIPIENT / BACKUP_GPG_RECIPIENT is set,
# keeps the newest KEEP_SNAPSHOTS (default 5) and prints "snapshot: <path>" as its last line.
# The nightly job (backup-db.sh) is separate and goes off the box; this one stays local.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=scripts/ops/lib.sh
. "$HERE/lib.sh"

REPO="${REPO:-$(cd "$HERE/../.." && pwd)}"
MODE=prod
ENV_FILE=""
LABEL=""
DRY=0

while [ $# -gt 0 ]; do
  case "$1" in
    --staging) MODE=staging; shift ;;
    --env-file) ENV_FILE="${2:?--env-file needs a path}"; shift 2 ;;
    --label) LABEL="${2:?--label needs a value}"; shift 2 ;;
    --dry-run) DRY=1; shift ;;
    *) die "unknown argument: $1 (usage: $0 [--staging] [--env-file F] [--label L] [--dry-run])" ;;
  esac
done

if [ "$MODE" = staging ]; then
  : "${ENV_FILE:=$REPO/.env.staging}"
  LOCAL_DIR="${BACKUP_LOCAL_DIR:-$HOME/kiwiply-backups-staging}"
else
  : "${ENV_FILE:=$REPO/.env}"
  LOCAL_DIR="${BACKUP_LOCAL_DIR:-$HOME/kiwiply-backups}"
fi
KEEP="${KEEP_SNAPSHOTS:-5}"
set_compose_mode "$MODE"
assert_compose_files "$MODE"

compose() {
  "${DOCKER:-docker}" compose --project-directory "$REPO" --env-file "$ENV_FILE" "${COMPOSE_FILES[@]}" "$@"
}

SAFE_LABEL="$(printf '%s' "$LABEL" | tr -c 'A-Za-z0-9._-' '-' | cut -c1-40)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
NAME="pre-deploy-${STAMP}${SAFE_LABEL:+-$SAFE_LABEL}.sql.gz"

[ -f "$ENV_FILE" ] || die "no env file at $ENV_FILE"
load_encryption_env "$ENV_FILE"
ENC_EXT="$(encryption_ext)"

if [ "$DRY" = 1 ]; then
  say "[dry-run] would dump the $MODE database to $LOCAL_DIR/$NAME$ENC_EXT, check it is whole, keep the newest $KEEP"
  exit 0
fi

mkdir -p "$LOCAL_DIR"
chmod 700 "$LOCAL_DIR"
WORK="$(mktemp -d)"
chmod 700 "$WORK"
trap 'rm -rf "$WORK"' EXIT

say "Snapshotting the $MODE database before the deploy"
dump_database > "$WORK/$NAME"
dump_complete "$WORK/$NAME" || die "the snapshot is incomplete (no trailer or no tables) - not trusting it"
if [ -n "$ENC_EXT" ]; then
  encrypt_file "$WORK/$NAME" "$WORK/$NAME$ENC_EXT"
  NAME="$NAME$ENC_EXT"
fi
cp "$WORK/$NAME" "$LOCAL_DIR/$NAME"
chmod 600 "$LOCAL_DIR/$NAME"

# Names sort by time; everything but the newest KEEP goes (local files only).
find "$LOCAL_DIR" -maxdepth 1 -name 'pre-deploy-*' -printf '%f\n' | sort | head -n "-$KEEP" \
  | while read -r old; do rm -f "$LOCAL_DIR/$old"; done

say "snapshot: $LOCAL_DIR/$NAME ($(du -h "$LOCAL_DIR/$NAME" | awk '{print $1}'))"

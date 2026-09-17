#!/usr/bin/env bash
# Capture everything stateful from the CURRENT production box.
# RUN ON: the OLD server, in the repo checkout.
#
# Produces ./dossier-migration-<timestamp>/ containing:
#   dossier-db.sql.gz   the full MySQL dump
#   env.backup          a verbatim copy of the live .env  (SECRETS — handle carefully)
#   MANIFEST.txt        sizes + checksums + row counts to verify the restore against
#
#   ./02-dump-old.sh            # normal (hot) dump — app keeps serving
#   FINAL=1 ./02-dump-old.sh    # cutover dump — stops api+web first so no writes are lost
set -euo pipefail

COMPOSE="docker compose -f docker-compose.prod.yml"
DB="dossierApi"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$PWD/dossier-migration-$STAMP"

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!!  %s\033[0m\n' "$*"; }

[ -f docker-compose.prod.yml ] || { echo "Run this from the repo checkout on the OLD box." >&2; exit 1; }
[ -f .env ] || { echo "No .env here — is this the production checkout?" >&2; exit 1; }

mkdir -p "$OUT"
chmod 700 "$OUT"

MODE="HOT (app still serving)"
if [ "${FINAL:-0}" = "1" ]; then
  MODE="FINAL (api+web stopped)"
  say "FINAL dump — stopping api + web so no writes land after the snapshot"
  warn "The site is now DOWN. Restore + DNS cutover, or run 'docker compose -f docker-compose.prod.yml up -d' to roll back."
  $COMPOSE stop web api
else
  say "HOT dump (app stays up). Rows written after this point will NOT be migrated."
fi

say "Dumping MySQL database '$DB'"
# --single-transaction: consistent InnoDB snapshot without locking the whole server.
# --set-gtid-purged=OFF: keeps GTID statements out so the dump restores into a fresh server.
$COMPOSE exec -T mysql sh -c \
  "exec mysqldump -uroot -p\"\$MYSQL_ROOT_PASSWORD\" \
     --single-transaction --routines --triggers --events \
     --set-gtid-purged=OFF --databases $DB" \
  | gzip -9 > "$OUT/dossier-db.sql.gz"

say "Verifying the dump is complete (not truncated)"
if gunzip -c "$OUT/dossier-db.sql.gz" | tail -5 | grep -q "Dump completed"; then
  echo "  OK — trailer present"
else
  echo "DUMP IS TRUNCATED — do not migrate with this file." >&2
  exit 1
fi

say "Recording row counts (compare these after the restore)"
$COMPOSE exec -T mysql sh -c \
  "exec mysql -uroot -p\"\$MYSQL_ROOT_PASSWORD\" -N -B -e \
    'SELECT table_name, table_rows FROM information_schema.tables \
     WHERE table_schema=\"${DB,,}\" ORDER BY table_name'" \
  > "$OUT/row-counts.txt" 2>/dev/null || warn "could not read row counts"

say "Copying .env verbatim"
# Copy — never regenerate. The bcrypt ADMIN_PASSWORD_HASH has '$' doubled to '$$' for Compose
# interpolation; retyping it is the #1 way to break the admin bootstrap.
cp .env "$OUT/env.backup"
chmod 600 "$OUT/env.backup"

{
  echo "Dossier migration snapshot"
  echo "taken:      $(date -Is)"
  echo "from host:  $(hostname) / $(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || echo '?')"
  echo "git commit: $(git rev-parse --short HEAD 2>/dev/null || echo '?')"
  echo "mode:       $MODE"
  echo
  echo "sha256:"
  sha256sum "$OUT/dossier-db.sql.gz" | sed 's|'"$OUT"'/||'
  echo
  echo "sizes:"
  ls -lh "$OUT" | sed 's/^/  /'
  echo
  echo "row counts (information_schema estimate):"
  sed 's/^/  /' "$OUT/row-counts.txt" 2>/dev/null || echo "  (unavailable)"
} > "$OUT/MANIFEST.txt"

say "Snapshot ready"
cat "$OUT/MANIFEST.txt"
echo
echo "Pull it to your laptop:"
echo "  scp -r <olduser>@<oldip>:$OUT ."
warn "env.backup contains live secrets (DB password, JWT secret, S3 keys, SMTP, AI key). Delete local copies when done."

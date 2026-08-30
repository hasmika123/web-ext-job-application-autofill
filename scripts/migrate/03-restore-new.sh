#!/usr/bin/env bash
# Bring the stack up on the NEW box and load the snapshot from 02-dump-old.sh.
# RUN ON: the NEW server, in the repo checkout, with the snapshot directory alongside.
#
#   ./03-restore-new.sh ~/dossier-migration-20260830-101500
#
# By default it stages on a sslip.io hostname so Caddy can get real certs WITHOUT touching
# kiwiply.com DNS — you validate the whole stack before any user-visible change.
#   HOST_MODE=stage   (default) SSLIP_HOST=<dashed-ip>.sslip.io
#   HOST_MODE=live              SSLIP_HOST as it was on the old box (kiwiply.com) — cutover
set -euo pipefail

SNAP="${1:?usage: $0 <snapshot-dir>}"
COMPOSE="docker compose -f docker-compose.prod.yml"
DB="dossierApi"
HOST_MODE="${HOST_MODE:-stage}"

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!!  %s\033[0m\n' "$*"; }

[ -f docker-compose.prod.yml ] || { echo "Run from the repo checkout on the NEW box." >&2; exit 1; }
[ -f "$SNAP/dossier-db.sql.gz" ] || { echo "No dossier-db.sql.gz in $SNAP" >&2; exit 1; }
[ -f "$SNAP/env.backup" ] || { echo "No env.backup in $SNAP" >&2; exit 1; }

say "Install .env from the snapshot"
if [ -f .env ]; then
  cp .env ".env.bak.$(date +%s)"
  warn "existing .env backed up"
fi
cp "$SNAP/env.backup" .env
chmod 600 .env

case "$HOST_MODE" in
  stage)
    IP="$(curl -fsS --max-time 10 https://api.ipify.org)"
    SSLIP="${IP//./-}.sslip.io"
    say "Staging on $SSLIP (kiwiply.com DNS untouched)"
    # Keep the real value around so 'live' can restore it verbatim later.
    grep -q '^#ORIG_SSLIP_HOST=' .env || \
      sed -i "1i #ORIG_SSLIP_HOST=$(grep -E '^SSLIP_HOST=' .env | cut -d= -f2-)" .env
    sed -i "s|^SSLIP_HOST=.*|SSLIP_HOST=$SSLIP|" .env
    # Activation links must point at the staging host, not the live domain.
    if grep -qE '^MAIL_BASE_URL=' .env; then
      sed -i "s|^MAIL_BASE_URL=.*|MAIL_BASE_URL=https://$SSLIP|" .env
    fi
    ;;
  live)
    ORIG="$(grep -E '^#ORIG_SSLIP_HOST=' .env | cut -d= -f2- || true)"
    if [ -n "$ORIG" ]; then
      say "Cutover — restoring SSLIP_HOST=$ORIG"
      sed -i "s|^SSLIP_HOST=.*|SSLIP_HOST=$ORIG|" .env
      sed -i "/^#ORIG_SSLIP_HOST=/d" .env
      # MAIL_BASE_URL defaults to https://$SSLIP_HOST; drop the staging override.
      sed -i "/^MAIL_BASE_URL=https:\/\/.*sslip\.io$/d" .env
    else
      say "Cutover — .env already carries the live SSLIP_HOST ($(grep -E '^SSLIP_HOST=' .env | cut -d= -f2-))"
    fi
    ;;
  *) echo "HOST_MODE must be 'stage' or 'live'" >&2; exit 1 ;;
esac
echo "  SSLIP_HOST=$(grep -E '^SSLIP_HOST=' .env | cut -d= -f2-)"

say "Pull images from GHCR and start the stack"
$COMPOSE pull
$COMPOSE up -d
# The Caddyfile is a single-file bind mount; force-recreate so config changes actually apply.
$COMPOSE up -d --force-recreate caddy

say "Waiting for MySQL to report healthy"
for i in $(seq 1 60); do
  if $COMPOSE ps mysql | grep -q healthy; then echo "  healthy after ${i}0s"; break; fi
  sleep 10
  [ "$i" = 60 ] && { echo "MySQL never became healthy" >&2; $COMPOSE logs --tail=50 mysql; exit 1; }
done

say "Stopping api during the restore (Liquibase must not race the import)"
$COMPOSE stop api

say "Restoring the dump into MySQL"
gunzip -c "$SNAP/dossier-db.sql.gz" \
  | $COMPOSE exec -T mysql sh -c "exec mysql -uroot -p\"\$MYSQL_ROOT_PASSWORD\""

say "Restarting api (Liquibase will apply any migrations newer than the dump)"
$COMPOSE up -d api

say "Row counts on the NEW box"
$COMPOSE exec -T mysql sh -c \
  "exec mysql -uroot -p\"\$MYSQL_ROOT_PASSWORD\" -N -B -e \
    'SELECT table_name, table_rows FROM information_schema.tables \
     WHERE table_schema=\"${DB,,}\" ORDER BY table_name'" \
  > /tmp/row-counts-new.txt 2>/dev/null || warn "could not read row counts"

if [ -f "$SNAP/row-counts.txt" ]; then
  echo
  echo "  diff vs the old box (left=old, right=new; estimates, small drift is normal):"
  diff -y --suppress-common-lines "$SNAP/row-counts.txt" /tmp/row-counts-new.txt \
    | sed 's/^/    /' || true
  echo "  (no output above = identical)"
fi

say "Stack status"
$COMPOSE ps
echo
echo "Next: ./04-verify.sh $(grep -E '^SSLIP_HOST=' .env | cut -d= -f2-)"

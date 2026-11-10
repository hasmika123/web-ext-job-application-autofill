#!/usr/bin/env bash
# Install the ops cron file and log rotation for a given user and checkout (REAL-GAPS-C P2.5).
# The templates in this repo (kiwiply-ops.cron, kiwiply-logrotate.conf) say `root` and
# /root/web-ext-job-application-autofill; this fills in the real user and path, so moving the
# deploy off root (docs/ops/deploy-user.md) is one command and the files never drift by hand.
#
# RUN ON: the box, as root:
#   scripts/ops/install-cron.sh --dry-run                       # print what would be installed
#   scripts/ops/install-cron.sh                                 # root + this checkout (today's setup)
#   scripts/ops/install-cron.sh --user kiwiply-deploy           # the deploy user, its own checkout
#   scripts/ops/install-cron.sh --user kiwiply-deploy --repo /home/kiwiply-deploy/web-ext-job-application-autofill
#
# Writes /etc/cron.d/kiwiply-ops and /etc/logrotate.d/kiwiply (files of their own: BeeCompete's cron
# and logrotate config are never touched), and, for a non-root user, creates the /var/log/kiwiply-*.log
# files owned by that user so cron can append to them. Refuses a user that is not in the docker group
# or a repo with no .env. Idempotent: run it again after the templates change.
#
# Testing seams: CRON_DEST, LOGROTATE_DEST, LOG_DIR.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=scripts/ops/lib.sh
. "$HERE/lib.sh"

RUN_USER=root
REPO="${REPO:-$(cd "$HERE/../.." && pwd)}"
CRON_DEST="${CRON_DEST:-/etc/cron.d/kiwiply-ops}"
LOGROTATE_DEST="${LOGROTATE_DEST:-/etc/logrotate.d/kiwiply}"
LOG_DIR="${LOG_DIR:-/var/log}"
DRY=0
CHECKS=1

while [ $# -gt 0 ]; do
  case "$1" in
    --user) RUN_USER="${2:?--user needs a name}"; shift 2 ;;
    --repo) REPO="${2:?--repo needs a path}"; shift 2 ;;
    --dry-run) DRY=1; shift ;;
    --no-checks) CHECKS=0; shift ;;
    -h|--help) sed -n '2,/^set -euo/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown argument: $1 (see --help)" ;;
  esac
done

printf '%s' "$RUN_USER" | grep -Eq '^[a-z_][a-z0-9_-]{0,31}$' || die "not a user name: $RUN_USER"
printf '%s' "$REPO" | grep -Eq '^/[A-Za-z0-9._/-]+$' || die "--repo must be an absolute path without spaces or odd characters (got '$REPO')"

if [ "$CHECKS" = 1 ]; then
  [ -f "$REPO/.env" ] || die "no .env in $REPO"
  [ -x "$REPO/scripts/ops/backup-db.sh" ] || die "$REPO/scripts/ops/backup-db.sh is missing or not executable (is that the checkout?)"
  id -u "$RUN_USER" >/dev/null 2>&1 || die "no such user: $RUN_USER"
  if [ "$RUN_USER" != root ]; then
    id -nG "$RUN_USER" | tr ' ' '\n' | grep -qx docker || die "$RUN_USER is not in the docker group (usermod -aG docker $RUN_USER)"
    [ "$(stat -c %U "$REPO/.env")" = "$RUN_USER" ] || die "$REPO/.env is not owned by $RUN_USER (chown $RUN_USER: it; chmod 600)"
  fi
fi

# The schedule lines carry the user in the sixth field; REPO= carries the checkout.
CRON_TEXT="$(sed -E \
  -e "s#^REPO=.*#REPO=$REPO#" \
  -e "s#^([0-9*/,-]+ [0-9*/,-]+ [0-9*/,-]+ [0-9*/,-]+ [0-9*/,-]+) root #\\1 $RUN_USER #" \
  "$HERE/kiwiply-ops.cron" | tr -d '\r')"
LOGROTATE_TEXT="$(sed -E "s#^( *create 0640 )root root#\\1$RUN_USER $RUN_USER#" "$HERE/kiwiply-logrotate.conf" | tr -d '\r')"
LOGS="$(printf '%s\n' "$LOGROTATE_TEXT" | grep -oE '/var/log/kiwiply-[a-z-]+\.log' | sort -u)"

if [ "$DRY" = 1 ]; then
  say "[dry-run] would write $CRON_DEST (user $RUN_USER, repo $REPO):"
  printf '%s\n' "$CRON_TEXT" | grep -vE '^#|^$'
  say "[dry-run] would write $LOGROTATE_DEST (files created as $RUN_USER)"
  say "[dry-run] would create these logs owned by $RUN_USER: $(printf '%s' "$LOGS" | tr '\n' ' ')"
  exit 0
fi

printf '%s\n' "$CRON_TEXT" > "$CRON_DEST"
chmod 644 "$CRON_DEST"
printf '%s\n' "$LOGROTATE_TEXT" > "$LOGROTATE_DEST"
chmod 644 "$LOGROTATE_DEST"
say "Installed $CRON_DEST and $LOGROTATE_DEST for user $RUN_USER, repo $REPO"

if [ "$RUN_USER" != root ]; then
  # /var/log is root's: pre-create each log so the user's cron jobs can append to it.
  for f in $LOGS; do
    f="$LOG_DIR/${f##*/}"
    touch "$f"
    chown "$RUN_USER:$RUN_USER" "$f"
    chmod 640 "$f"
  done
  say "Created the log files in $LOG_DIR owned by $RUN_USER"
fi

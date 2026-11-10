#!/usr/bin/env bash
# Host guard: disk, memory, container restarts and certificate expiry on the box (REAL-GAPS-C P1.6).
#
# RUN ON: the production box, every 5 minutes from cron (scripts/ops/kiwiply-ops.cron), or by hand:
#   scripts/ops/host-guard.sh              # check; ping Healthchecks.io "host" (success, or /fail + reasons)
#   scripts/ops/host-guard.sh --dry-run    # check and print, ping nothing
#
# The box is shared with BeeCompete, so a full disk or an OOM here is not just our outage. This
# script only READS (df, /proc/meminfo, docker ps/inspect, openssl): it never stops, restarts or
# deletes anything. When it fails, the Healthchecks alert carries the reasons in its body.
#
# Checks and thresholds (environment overrides):
#   disk     HOST_GUARD_DISK_PATHS ("/ /var/lib/docker"), fails at HOST_GUARD_DISK_PCT (85) used,
#            marked CRITICAL at HOST_GUARD_DISK_CRIT_PCT (90)
#   memory   fails when used memory is over HOST_GUARD_MEM_PCT (90) or swap in use is over
#            HOST_GUARD_SWAP_MB (2048) on HOST_GUARD_MEM_STRIKES (2) runs in a row (about 10 min)
#   restarts fails when a container of the dossier / dossier-staging projects has restarted since
#            the last run (a crash loop or an OOM kill). BeeCompete's containers are never judged
#   certs    HOST_GUARD_CERT_HOSTS (space separated, default: $SSLIP_HOST and api.$SSLIP_HOST from the
#            env file) fail under HOST_GUARD_CERT_DAYS (14) days left; no hosts = skipped
#
# From .env: HC_HOST_URL (the Healthchecks.io "host" check: period 10 min, grace 10 min).
# Testing seams: MEMINFO_FILE, DF, DOCKER, OPENSSL, CURL, HOST_GUARD_STATE.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=scripts/ops/lib.sh
. "$HERE/lib.sh"

REPO="${REPO:-$(cd "$HERE/../.." && pwd)}"
ENV_FILE="${ENV_FILE:-$REPO/.env}"
STATE="${HOST_GUARD_STATE:-$HOME/kiwiply-host-guard.state}"
DISK_PCT="${HOST_GUARD_DISK_PCT:-85}"
DISK_CRIT="${HOST_GUARD_DISK_CRIT_PCT:-90}"
MEM_PCT="${HOST_GUARD_MEM_PCT:-90}"
SWAP_MB="${HOST_GUARD_SWAP_MB:-2048}"
MEM_STRIKES="${HOST_GUARD_MEM_STRIKES:-2}"
CERT_DAYS="${HOST_GUARD_CERT_DAYS:-14}"
MEMINFO="${MEMINFO_FILE:-/proc/meminfo}"
DRY=0

case "${1:-}" in
  --dry-run) DRY=1 ;;
  "") ;;
  *) die "unknown argument: $1 (usage: $0 [--dry-run])" ;;
esac

HC_HOST_URL="$(env_or_file HC_HOST_URL "$ENV_FILE")"
PROBLEMS=()

problem() { PROBLEMS+=("$1"); warn "PROBLEM: $1"; }

state_get() { if [ -f "$STATE" ]; then env_get "$STATE" "$1"; fi; }

# ---- disk -----------------------------------------------------------------------------------
DISK_PATHS="${HOST_GUARD_DISK_PATHS:-/ /var/lib/docker}"
for p in $DISK_PATHS; do
  [ -d "$p" ] || continue
  used="$("${DF:-df}" -P "$p" | awk 'NR==2 {gsub("%","",$5); print $5}')"
  if [ -z "$used" ]; then
    warn "could not read disk usage for $p"
  elif [ "$used" -ge "$DISK_CRIT" ]; then
    problem "CRITICAL disk $p is ${used}% full (limit ${DISK_CRIT}%)"
  elif [ "$used" -ge "$DISK_PCT" ]; then
    problem "disk $p is ${used}% full (limit ${DISK_PCT}%)"
  else
    say "disk $p ${used}% used"
  fi
done

# ---- memory and swap ------------------------------------------------------------------------
mem_bad=0
if [ -r "$MEMINFO" ]; then
  total_kb="$(awk '/^MemTotal:/ {print $2}' "$MEMINFO")"
  avail_kb="$(awk '/^MemAvailable:/ {print $2}' "$MEMINFO")"
  swap_total_kb="$(awk '/^SwapTotal:/ {print $2}' "$MEMINFO")"
  swap_free_kb="$(awk '/^SwapFree:/ {print $2}' "$MEMINFO")"
  if [ -n "$total_kb" ] && [ -n "$avail_kb" ] && [ "$total_kb" -gt 0 ]; then
    mem_used_pct=$(((total_kb - avail_kb) * 100 / total_kb))
    swap_used_mb=$((((${swap_total_kb:-0}) - (${swap_free_kb:-0})) / 1024))
    say "memory ${mem_used_pct}% used, swap ${swap_used_mb} MB in use"
    [ "$mem_used_pct" -lt "$MEM_PCT" ] || mem_bad=1
    [ "$swap_used_mb" -lt "$SWAP_MB" ] || mem_bad=1
  fi
else
  warn "cannot read $MEMINFO: memory check skipped"
fi

strikes="$(state_get mem_strikes)"
strikes="${strikes:-0}"
if [ "$mem_bad" = 1 ]; then strikes=$((strikes + 1)); else strikes=0; fi
if [ "$mem_bad" = 1 ] && [ "$strikes" -ge "$MEM_STRIKES" ]; then
  hint=""
  if "${DOCKER:-docker}" ps --filter label=com.docker.compose.project=dossier-staging -q 2>/dev/null | grep -q .; then
    hint=" - the staging stack is running: docker compose -p dossier-staging stop"
  fi
  problem "memory pressure for ${strikes} checks in a row (memory ${mem_used_pct:-?}% used, swap ${swap_used_mb:-?} MB)$hint"
fi

# ---- container restarts ---------------------------------------------------------------------
new_restarts=""
for project in dossier dossier-staging; do
  ids="$("${DOCKER:-docker}" ps -a --filter "label=com.docker.compose.project=$project" -q 2>/dev/null || true)"
  [ -n "$ids" ] || continue
  # shellcheck disable=SC2086 # ids is a list of container ids, one word each
  while read -r name count; do
    [ -n "$name" ] || continue
    key="restarts_$(printf '%s' "$name" | tr -c 'A-Za-z0-9' '_')"
    old="$(state_get "$key")"
    new_restarts="$new_restarts$key=$count"$'\n'
    if [ -n "$old" ] && [ "$count" -gt "$old" ]; then
      problem "container $name restarted $((count - old)) time(s) since the last check (total $count)"
    fi
  done < <("${DOCKER:-docker}" inspect --format '{{.Name}} {{.RestartCount}}' $ids 2>/dev/null | sed 's|^/||')
done

# ---- certificates ---------------------------------------------------------------------------
CERT_HOSTS="${HOST_GUARD_CERT_HOSTS:-}"
if [ -z "$CERT_HOSTS" ] && [ -f "$ENV_FILE" ]; then
  base="$(env_get "$ENV_FILE" SSLIP_HOST)"
  [ -z "$base" ] || CERT_HOSTS="$base api.$base"
fi
if [ -n "$CERT_HOSTS" ]; then
  if command -v "${OPENSSL:-openssl}" >/dev/null 2>&1; then
    for h in $CERT_HOSTS; do
      end="$(printf '' | "${OPENSSL:-openssl}" s_client -servername "$h" -connect "$h:443" 2>/dev/null \
        | "${OPENSSL:-openssl}" x509 -noout -enddate 2>/dev/null | sed 's/^notAfter=//')" || true
      if [ -z "$end" ]; then
        problem "could not read the certificate of $h"
        continue
      fi
      left=$((($(date -u -d "$end" +%s) - $(date -u +%s)) / 86400))
      if [ "$left" -lt "$CERT_DAYS" ]; then
        problem "certificate of $h expires in ${left} day(s) (limit ${CERT_DAYS})"
      else
        say "certificate of $h: ${left} days left"
      fi
    done
  else
    warn "openssl is not installed: certificate check skipped"
  fi
fi

# ---- remember, report -----------------------------------------------------------------------
if [ "$DRY" = 0 ]; then
  mkdir -p "$(dirname "$STATE")"
  printf 'mem_strikes=%s\n%s' "$strikes" "$new_restarts" > "$STATE.new"
  mv "$STATE.new" "$STATE"
fi

if [ "${#PROBLEMS[@]}" -gt 0 ]; then
  body="$(printf '%s; ' "${PROBLEMS[@]}")"
  if [ "$DRY" = 1 ]; then
    say "[dry-run] would ping Healthchecks.io /fail: ${body%; }"
  else
    hc_ping "$HC_HOST_URL" fail "${body%; }"
  fi
  exit 1
fi
if [ "$DRY" = 1 ]; then
  say "[dry-run] all clear; would ping Healthchecks.io ($(configured "$HC_HOST_URL"))"
else
  hc_ping "$HC_HOST_URL"
  say "host ok"
fi

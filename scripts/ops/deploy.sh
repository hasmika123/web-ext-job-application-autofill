#!/usr/bin/env bash
# Deploy Dossier by EXPLICIT IMAGE TAG, with a safety net (REAL-GAPS-C P2.1, P2.2, P2.3).
#
# RUN ON: the box, from the repo checkout (DEPLOY.md §5.4):
#   scripts/ops/deploy.sh --dry-run                    # print every step, change nothing
#   scripts/ops/deploy.sh                              # deploy the checkout's HEAD sha (what CI built)
#   scripts/ops/deploy.sh --tag <40-hex git sha>       # deploy that build
#   scripts/ops/deploy.sh --rollback                   # go back to the previous tag
#   scripts/ops/deploy.sh --staging --build            # staging: build the checkout on the box
#
# What it does, in order (a failure BEFORE step 6 changes nothing):
#   1. validates the tags (never "latest") and the compose files. Production ALWAYS uses
#      `-f docker-compose.prod.yml -f docker-compose.shared-edge.yml` (CLAUDE.md): without the
#      overlay our own Caddy fights BeeCompete's edge for :80/:443. Staging has its own overlay;
#   2. works out the tags to go back to (the recorded ones, or the running images, tagged `pre-…`);
#   3. lints the new Liquibase changesets for destructive statements (refuses without
#      --allow-destructive-migrations);
#   4. takes a database snapshot (scripts/ops/snapshot-db.sh, or $DEPLOY_SNAPSHOT_HOOK);
#   5. pulls api + web at the tag (a tag that isn't in the registry stops here, nothing touched);
#   6. `compose up -d` with DOSSIER_API_TAG / DOSSIER_WEB_TAG set;
#   7. waits for the API (/management/health UP) and the web to answer, then runs the smoke checks;
#   8. on ANY failure after step 6: rolls back to the previous tags, waits for health again, and
#      exits 1 (2 if the rollback itself failed). The database is NOT restored automatically (that
#      would throw away every write since the snapshot); the message names the snapshot and the
#      restore command. Liquibase is additive-only, so the previous image runs on the newer schema.
#   Healthchecks.io: start / success / fail to HC_DEPLOY_URL (from the env file or the environment;
#   unset = no-op).
#
# Settings (environment, or the env file for the first three):
#   HC_DEPLOY_URL          Healthchecks.io ping URL for deploys (optional)
#   DEPLOY_SMOKE_URLS      space-separated public URLs to check after the deploy, `url` or
#                          `url|substring-the-body-must-contain` (default on prod: https://$SSLIP_HOST/
#                          and https://api.$SSLIP_HOST/management/health|"status":"UP")
#   DEPLOY_SNAPSHOT_HOOK   executable run before the deploy (default scripts/ops/snapshot-db.sh)
#   DEPLOY_HEALTH_TIMEOUT  seconds to wait for health (default 300); DEPLOY_HEALTH_INTERVAL (5)
#   DEPLOY_STATE_DIR       where the current/previous tags are recorded (default ~/kiwiply-deploy)
#   DOCKER, CURL           the binaries (tests put fakes here)
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=scripts/ops/lib.sh
. "$HERE/lib.sh"

REPO="${REPO:-$(cd "$HERE/../.." && pwd)}"
MODE=prod
ENV_FILE=""
TAG=""
API_TAG=""
WEB_TAG=""
BUILD=0
DRY=0
SNAPSHOT=1
ALLOW_DESTRUCTIVE=0
ROLLBACK_ONLY=0
PUBLIC_SMOKE=""

IMG_API="ghcr.io/hasmika123/dossier-api"
IMG_WEB="ghcr.io/hasmika123/dossier-web"

usage() {
  sed -n '2,/^set -euo/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'
}

while [ $# -gt 0 ]; do
  case "$1" in
    --tag) TAG="${2:?--tag needs a value}"; shift 2 ;;
    --api-tag) API_TAG="${2:?--api-tag needs a value}"; shift 2 ;;
    --web-tag) WEB_TAG="${2:?--web-tag needs a value}"; shift 2 ;;
    --staging) MODE=staging; shift ;;
    --build) BUILD=1; shift ;;
    --env-file) ENV_FILE="${2:?--env-file needs a path}"; shift 2 ;;
    --no-snapshot) SNAPSHOT=0; shift ;;
    --no-public-smoke) PUBLIC_SMOKE=0; shift ;;
    --allow-destructive-migrations) ALLOW_DESTRUCTIVE=1; shift ;;
    --rollback) ROLLBACK_ONLY=1; shift ;;
    --dry-run) DRY=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown argument: $1 (see --help)" ;;
  esac
done

[ "$BUILD" = 0 ] || [ "$MODE" = staging ] || die "--build is for staging only: production pulls the images CI built"
set_compose_mode "$MODE"
assert_compose_files "$MODE"
if [ "$MODE" = staging ]; then
  : "${ENV_FILE:=$REPO/.env.staging}"
  STATE_DIR="${DEPLOY_STATE_DIR:-$HOME/kiwiply-deploy-staging}"
  : "${PUBLIC_SMOKE:=0}"
else
  : "${ENV_FILE:=$REPO/.env}"
  STATE_DIR="${DEPLOY_STATE_DIR:-$HOME/kiwiply-deploy}"
  : "${PUBLIC_SMOKE:=1}"
fi
[ -f "$ENV_FILE" ] || die "no env file at $ENV_FILE"
STATE_FILE="$STATE_DIR/current.env"
HC_DEPLOY_URL="$(env_or_file HC_DEPLOY_URL "$ENV_FILE")"
HEALTH_TIMEOUT="${DEPLOY_HEALTH_TIMEOUT:-300}"
HEALTH_INTERVAL="${DEPLOY_HEALTH_INTERVAL:-5}"
SNAPSHOT_HOOK="${DEPLOY_SNAPSHOT_HOOK:-$HERE/snapshot-db.sh}"
LOCAL_DIR="${BACKUP_LOCAL_DIR:-$HOME/kiwiply-backups}"
[ "$MODE" = prod ] || LOCAL_DIR="${BACKUP_LOCAL_DIR:-$HOME/kiwiply-backups-staging}"

compose() {
  "${DOCKER:-docker}" compose --project-directory "$REPO" --env-file "$ENV_FILE" "${COMPOSE_FILES[@]}" "$@"
}

# run_compose ARGS… — a compose command, or (--dry-run) the full command it would be, printed.
run_compose() {
  if [ "$DRY" = 1 ]; then
    printf '[dry-run] docker compose --project-directory %s --env-file %s %s %s\n' \
      "$REPO" "$ENV_FILE" "${COMPOSE_FILES[*]}" "$*"
  else
    compose "$@"
  fi
}

# run CMD… — a command, or (--dry-run) the command it would be, printed.
run() {
  if [ "$DRY" = 1 ]; then printf '[dry-run] %s\n' "$*"; else "$@"; fi
}

state_get() { if [ -f "$STATE_FILE" ]; then env_get "$STATE_FILE" "$1"; fi; }

# ---- the tags ------------------------------------------------------------------------------
if [ "$ROLLBACK_ONLY" = 0 ]; then
  if [ -z "$TAG" ] && [ -z "$API_TAG" ] && [ -z "$WEB_TAG" ]; then
    if [ "$MODE" = staging ]; then
      TAG="staging-$(git -C "$REPO" rev-parse --short=12 HEAD)"
    else
      TAG="$(git -C "$REPO" rev-parse HEAD)"
    fi
  fi
  : "${API_TAG:=$TAG}"
  : "${WEB_TAG:=$TAG}"
  valid_tag "$API_TAG" || die "the API tag must be an explicit tag, never 'latest' or empty (got '$API_TAG')"
  valid_tag "$WEB_TAG" || die "the web tag must be an explicit tag, never 'latest' or empty (got '$WEB_TAG')"
fi

PHASE=prepare
PREV_API=""
PREV_WEB=""
LOCKED=0
STARTED=0
ROLLED_BACK=""

# ---- lock ----------------------------------------------------------------------------------
acquire_lock() {
  local pid
  mkdir -p "$STATE_DIR"
  chmod 700 "$STATE_DIR"
  if ! mkdir "$STATE_DIR/lock" 2>/dev/null; then
    pid="$(cat "$STATE_DIR/lock/pid" 2>/dev/null || true)"
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      die "another deploy is running (pid $pid)"
    fi
    warn "removing a stale deploy lock (pid ${pid:-unknown} is gone)"
    rm -rf "$STATE_DIR/lock"
    mkdir "$STATE_DIR/lock"
  fi
  echo "$$" > "$STATE_DIR/lock/pid"
  LOCKED=1
}

# ---- probes --------------------------------------------------------------------------------
# From inside the web container, over the compose network: no public DNS or TLS in the way, and
# the same path the web uses to reach the API.
probe_api() {
  compose exec -T web node -e 'fetch("http://api:8080/management/health",{signal:AbortSignal.timeout(5000)}).then(r=>r.json()).then(j=>process.exit(j.status==="UP"?0:1)).catch(()=>process.exit(1))' >/dev/null 2>&1
}
probe_web() {
  compose exec -T web node -e 'fetch("http://127.0.0.1:3000/",{signal:AbortSignal.timeout(5000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))' >/dev/null 2>&1
}

wait_healthy() {
  local deadline=$((SECONDS + HEALTH_TIMEOUT))
  say "Waiting for the API and the web to be healthy (up to ${HEALTH_TIMEOUT}s)"
  until probe_api && probe_web; do
    if [ "$SECONDS" -ge "$deadline" ]; then
      warn "not healthy after ${HEALTH_TIMEOUT}s"
      return 1
    fi
    sleep "$HEALTH_INTERVAL"
  done
  say "API /management/health is UP and the web answers"
}

smoke_urls() {
  if [ -n "${DEPLOY_SMOKE_URLS:-}" ]; then
    printf '%s' "$DEPLOY_SMOKE_URLS"
  elif [ "$PUBLIC_SMOKE" = 1 ]; then
    local h
    h="$(env_get "$ENV_FILE" SSLIP_HOST)"
    [ -z "$h" ] || printf 'https://%s/ https://api.%s/management/health|"status":"UP"' "$h" "$h"
  fi
}

smoke() {
  local entry url want body tries
  for entry in $(smoke_urls); do
    url="${entry%%|*}"
    want=""
    case "$entry" in *'|'*) want="${entry#*|}" ;; *) ;; esac
    tries=0
    while :; do
      if body="$("${CURL:-curl}" -fsS -m 20 "$url" 2>/dev/null)" && { [ -z "$want" ] || printf '%s' "$body" | grep -qF -- "$want"; }; then
        say "smoke ok: $url"
        break
      fi
      tries=$((tries + 1))
      if [ "$tries" -ge "${DEPLOY_SMOKE_RETRIES:-3}" ]; then
        warn "smoke FAILED: $url${want:+ (expected $want)}"
        return 1
      fi
      sleep "${DEPLOY_SMOKE_WAIT:-3}"
    done
  done
}

# prev_tag SERVICE REPO STATE_TAG — the tag to roll SERVICE back to. The recorded tag when the
# running container is still that image; otherwise (first run of this script, or CI deployed
# `latest` since) the running image itself, tagged `pre-<time>` so it can't be pruned or lost.
# Prints nothing when nothing is running.
prev_tag() {
  local svc="$1" repo="$2" recorded="$3" cid running tagid t
  cid="$(compose ps -q "$svc" 2>/dev/null | head -n 1)" || true
  [ -n "$cid" ] || return 0
  running="$("${DOCKER:-docker}" inspect --format '{{.Image}}' "$cid" 2>/dev/null)" || return 0
  if [ -n "$recorded" ]; then
    tagid="$("${DOCKER:-docker}" image inspect --format '{{.Id}}' "$repo:$recorded" 2>/dev/null)" || tagid=""
    if [ "$tagid" = "$running" ]; then
      printf '%s' "$recorded"
      return 0
    fi
  fi
  t="pre-$(date -u +%Y%m%dT%H%M%SZ)"
  "${DOCKER:-docker}" tag "$running" "$repo:$t" >/dev/null
  printf '%s' "$t"
}

rollback() {
  if [ -z "$PREV_API" ] || [ -z "$PREV_WEB" ]; then
    warn "no previous version is known - there is nothing to roll back to"
    return 1
  fi
  say "Rolling back to api:$PREV_API web:$PREV_WEB"
  export DOSSIER_API_TAG="$PREV_API" DOSSIER_WEB_TAG="$PREV_WEB"
  compose up -d --no-deps api web || return 1
  wait_healthy || return 1
  smoke || return 1
  say "Rolled back and healthy"
}

latest_snapshot() {
  # shellcheck disable=SC2012 # names are ours (pre-deploy-<time>…), ls -t is the point
  ls -t "$LOCAL_DIR"/pre-deploy-* 2>/dev/null | head -n 1 || true
}

release_lock() {
  [ "$LOCKED" = 0 ] || rm -rf "$STATE_DIR/lock"
  LOCKED=0
}

on_exit() {
  local rc=$?
  set +e
  trap - EXIT
  if [ "$DRY" = 1 ] || [ "$rc" -eq 0 ]; then
    release_lock
    exit "$rc"
  fi
  case "$PHASE" in
    applied)
      warn "deploy FAILED after the stack was changed - rolling back"
      if rollback; then
        ROLLED_BACK="rolled back to api:$PREV_API web:$PREV_WEB"
        rc=1
      else
        ROLLED_BACK="ROLLBACK FAILED - the stack may be down, fix by hand"
        rc=2
      fi ;;
    manual)
      ROLLED_BACK="ROLLBACK FAILED - the stack may be down, fix by hand"
      rc=2 ;;
    *)
      warn "deploy FAILED before anything was changed: nothing to roll back"
      ROLLED_BACK="nothing changed" ;;
  esac
  warn "$ROLLED_BACK"
  local snap
  snap="$(latest_snapshot)"
  if [ -n "$snap" ] && [ "$PHASE" = applied ]; then
    warn "the pre-deploy database snapshot is $snap (restore: DEPLOY.md section 5.3; only if a migration damaged data)"
  fi
  if [ "$STARTED" = 1 ]; then hc_ping "$HC_DEPLOY_URL" fail "deploy ${API_TAG:-?} failed: $ROLLED_BACK"; fi
  release_lock
  exit "$rc"
}
trap on_exit EXIT
trap 'exit 130' INT TERM

# ---- go ------------------------------------------------------------------------------------
say "Stack: $MODE | env file: $ENV_FILE"
say "Compose files: ${COMPOSE_FILES[*]}"
[ "$DRY" = 0 ] || say "DRY RUN: nothing below is executed"

cur_api="$(state_get API_TAG)"
cur_web="$(state_get WEB_TAG)"

if [ "$ROLLBACK_ONLY" = 1 ]; then
  PREV_API="$(state_get PREV_API_TAG)"
  PREV_WEB="$(state_get PREV_WEB_TAG)"
  [ -n "$PREV_API" ] && [ -n "$PREV_WEB" ] || die "no previous tags are recorded in $STATE_FILE"
  say "Manual rollback to api:$PREV_API web:$PREV_WEB (from api:${cur_api:-?} web:${cur_web:-?})"
  if [ "$DRY" = 1 ]; then
    printf '[dry-run] docker compose up -d --no-deps api web with DOSSIER_API_TAG=%s DOSSIER_WEB_TAG=%s\n' "$PREV_API" "$PREV_WEB"
    exit 0
  fi
  acquire_lock
  hc_ping "$HC_DEPLOY_URL" start; STARTED=1
  PHASE=manual
  rollback
  PHASE=finished
  printf 'API_TAG=%s\nWEB_TAG=%s\nPREV_API_TAG=%s\nPREV_WEB_TAG=%s\nDEPLOYED_AT=%s\n' \
    "$PREV_API" "$PREV_WEB" "$cur_api" "$cur_web" "$(date -u +%FT%TZ)" > "$STATE_FILE.new"
  mv "$STATE_FILE.new" "$STATE_FILE"
  printf '%s %s rollback to api=%s web=%s\n' "$(date -u +%FT%TZ)" "$MODE" "$PREV_API" "$PREV_WEB" >> "$STATE_DIR/history.log"
  hc_ping "$HC_DEPLOY_URL" "" "rolled back to ${PREV_API}"
  exit 0
fi

say "Deploying api:$API_TAG web:$WEB_TAG"
export DOSSIER_API_TAG="$API_TAG" DOSSIER_WEB_TAG="$WEB_TAG"

if [ "$DRY" = 0 ]; then
  acquire_lock
  hc_ping "$HC_DEPLOY_URL" start; STARTED=1
fi

say "1/7 Checking the compose files and the env file"
run_compose config -q

say "2/7 Working out what to roll back to"
if [ "$DRY" = 1 ]; then
  printf '[dry-run] previous = the recorded tags (api:%s web:%s) if still running, else the running images tagged pre-<time>\n' "${cur_api:-none}" "${cur_web:-none}"
else
  PREV_API="$(prev_tag api "$IMG_API" "$cur_api")"
  PREV_WEB="$(prev_tag web "$IMG_WEB" "$cur_web")"
  if [ -n "$PREV_API" ]; then
    say "will roll back to api:$PREV_API web:$PREV_WEB"
  else
    warn "no running api found: this looks like a first start, so there is no rollback target"
  fi
fi

say "3/7 Linting the new Liquibase changesets"
HITS="$(migration_lint "$cur_api" "$API_TAG" || true)"
if [ -n "$HITS" ]; then
  warn "destructive-looking statements in changesets added since api:$cur_api:"
  printf '%s\n' "$HITS" >&2
  [ "$ALLOW_DESTRUCTIVE" = 1 ] || die "refusing: review them, then re-run with --allow-destructive-migrations"
else
  say "nothing destructive found (or the previous commit is unknown to this checkout)"
fi

say "4/7 Database snapshot"
if [ "$SNAPSHOT" = 1 ]; then
  if [ "$MODE" = staging ]; then
    run "$SNAPSHOT_HOOK" --staging --env-file "$ENV_FILE" --label "${API_TAG:0:12}"
  else
    run "$SNAPSHOT_HOOK" --env-file "$ENV_FILE" --label "${API_TAG:0:12}"
  fi
else
  warn "snapshot skipped (--no-snapshot)"
fi

if [ "$BUILD" = 1 ]; then
  say "5/7 Building the images from this checkout (staging)"
else
  say "5/7 Pulling api:$API_TAG and web:$WEB_TAG"
  run_compose pull api web
fi

say "6/7 Applying (compose up -d)"
PHASE=applied
if [ "$BUILD" = 1 ]; then run_compose up -d --build; else run_compose up -d; fi

say "7/7 Health and smoke checks"
if [ "$DRY" = 1 ]; then
  printf '[dry-run] wait up to %ss for the API health and the web; then smoke: %s\n' "$HEALTH_TIMEOUT" "$(smoke_urls || true)"
  printf '[dry-run] on failure: roll back to the previous tags, wait for health, exit 1\n'
  exit 0
fi
wait_healthy
smoke

PHASE=finished
printf 'API_TAG=%s\nWEB_TAG=%s\nPREV_API_TAG=%s\nPREV_WEB_TAG=%s\nDEPLOYED_AT=%s\n' \
  "$API_TAG" "$WEB_TAG" "$PREV_API" "$PREV_WEB" "$(date -u +%FT%TZ)" > "$STATE_FILE.new"
mv "$STATE_FILE.new" "$STATE_FILE"
printf '%s %s deployed api=%s web=%s (previous %s)\n' "$(date -u +%FT%TZ)" "$MODE" "$API_TAG" "$WEB_TAG" "${PREV_API:-none}" >> "$STATE_DIR/history.log"
hc_ping "$HC_DEPLOY_URL" "" "deployed api=${API_TAG} web=${WEB_TAG}"
say "Deployed api:$API_TAG web:$WEB_TAG (previous: ${PREV_API:-none}). Roll back with: $0 --rollback"

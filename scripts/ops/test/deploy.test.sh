#!/usr/bin/env bash
# Tests for deploy.sh, snapshot-db.sh and the compose files they drive (sprint 2 B3). Run in CI via
# ops.test.sh, or by hand:  scripts/ops/test/deploy.test.sh
# Everything runs against a FAKE docker and a FAKE curl on PATH-style overrides (DOCKER, CURL): nothing
# touches a real daemon, a registry or a network. The compose-file checks use the real
# `docker compose config`, which needs no daemon, and are skipped when that is not installed.
set -uo pipefail

OPS="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$OPS/../.." && pwd)"
# shellcheck source=scripts/ops/test/harness.sh
. "$OPS/test/harness.sh"
# shellcheck source=scripts/ops/lib.sh
. "$OPS/lib.sh"

T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
OLD="$(printf 'a%.0s' $(seq 1 40))"
NEW="$(printf 'b%.0s' $(seq 1 40))"

mkdir -p "$T/bin"
cat > "$T/bin/docker" <<'EOF'
#!/usr/bin/env bash
# Fake docker. FAKE_CALLS: every call is logged. FAKE_DIR/running holds the API tag "running now".
files=""
case "$1" in
  compose)
    shift
    while [ $# -gt 0 ]; do
      case "$1" in
        --project-directory|--env-file) shift 2 ;;
        -f) files="$files+$(basename "$2")"; shift 2 ;;
        *) break ;;
      esac
    done
    sub="$1"; shift
    echo "compose[${files#+}] $sub $* tags=${DOSSIER_API_TAG:-}/${DOSSIER_WEB_TAG:-}" >> "$FAKE_CALLS"
    case "$sub" in
      config) exit 0 ;;
      ps) echo "cid-${*: -1}" ;;
      pull) if [ "${FAKE_PULL_FAIL:-0}" = 1 ]; then exit 1; fi ;;
      up)
        if [ "${FAKE_UP_FAIL:-0}" = 1 ]; then exit 1; fi
        echo "${DOSSIER_API_TAG:-latest}" > "$FAKE_DIR/running" ;;
      exec)
        case "$*" in
          *mysqldump*)
            printf -- '-- MySQL dump\nCREATE TABLE `jhi_user` (id int);\n'
            [ "${FAKE_DUMP_CUT:-0}" = 1 ] || printf -- '-- Dump completed on today\n' ;;
          *) [ "$(cat "$FAKE_DIR/running")" != "${FAKE_UNHEALTHY_TAG:-none}" ] || exit 1 ;;
        esac ;;
    esac ;;
  inspect) echo "sha256:running-image" ;;
  image)
    case "${*: -1}" in
      *":${FAKE_KNOWN_TAG:-none}") echo "sha256:running-image" ;;
      *) exit 1 ;;
    esac ;;
  tag) echo "$*" >> "$FAKE_CALLS" ;;
  *) echo "unexpected docker $*" >> "$FAKE_CALLS"; exit 1 ;;
esac
exit 0
EOF
cat > "$T/bin/curl" <<'EOF'
#!/usr/bin/env bash
for a in "$@"; do
  if [ "$a" = /dev/null ]; then echo "ping $*" >> "$FAKE_CALLS"; exit 0; fi
done
echo "get ${*: -1}" >> "$FAKE_CALLS"
# FAKE_CURL_FAIL=1: always; FAKE_CURL_FAIL_TAG=X: only while X is the running api tag.
if [ "${FAKE_CURL_FAIL:-0}" = 1 ] || [ "$(cat "$FAKE_DIR/running")" = "${FAKE_CURL_FAIL_TAG:-none}" ]; then exit 22; fi
printf '{"status":"UP"}'
EOF
chmod +x "$T/bin/docker" "$T/bin/curl"
cat > "$T/prod.env" <<'EOF'
MYSQL_ROOT_PASSWORD=not-a-real-password
JWT_BASE64_SECRET=not-a-real-secret
SSLIP_HOST=example.test
ACME_EMAIL=ops@example.test
HC_DEPLOY_URL=https://hc.example.test/deploy-uuid
EOF

CALLS="$T/calls"
fresh() { # [CURRENT_TAG] — a clean state dir (optionally with a recorded current deploy) and clean fakes
  rm -rf "$T/state" "$T/backups" "$T/fake"
  mkdir -p "$T/state" "$T/fake"
  : > "$CALLS"
  echo "${1:-$OLD}" > "$T/fake/running"
  if [ -n "${1:-}" ]; then
    printf 'API_TAG=%s\nWEB_TAG=%s\n' "$1" "$1" > "$T/state/current.env"
  fi
}
deploy() { # ARGS… (extra env via the caller's exports) — sets OUT and RC
  OUT="$(DOCKER="$T/bin/docker" CURL="$T/bin/curl" FAKE_CALLS="$CALLS" FAKE_DIR="$T/fake" \
    DEPLOY_STATE_DIR="$T/state" BACKUP_LOCAL_DIR="$T/backups" HOME="$T" \
    DEPLOY_HEALTH_TIMEOUT=0 DEPLOY_HEALTH_INTERVAL=0 DEPLOY_SMOKE_WAIT=0 DEPLOY_SMOKE_RETRIES=1 \
    "$OPS/deploy.sh" --env-file "$T/prod.env" "$@" 2>&1)"
  RC=$?
}
line_of() { grep -n -- "$1" "$CALLS" | head -n 1 | cut -d: -f1; }

echo "tags"
no "valid_tag refuses latest" valid_tag latest
no "valid_tag refuses LATEST" valid_tag LATEST
no "valid_tag refuses empty" valid_tag ""
no "valid_tag refuses a tag with a slash" valid_tag "a/b"
yes "valid_tag takes a sha" valid_tag "$NEW"
yes "valid_tag takes a release tag" valid_tag "v1.2.3"
fresh
deploy --tag latest
no "deploy --tag latest is refused" test "$RC" = 0
yes "and says why" grep -q "never 'latest'" <<<"$OUT"
eq "and calls nothing" "$(wc -l < "$CALLS" | tr -d ' ')" "0"

echo "dry run"
fresh
deploy --dry-run --tag "$NEW"
eq "a dry run exits 0" "$RC" "0"
yes "it uses the production file and the shared-edge overlay together" grep -q -- "-f $REPO/docker-compose.prod.yml -f $REPO/docker-compose.shared-edge.yml" <<<"$OUT"
yes "it pulls api and web" grep -q 'pull api web' <<<"$OUT"
yes "it applies with compose up -d" grep -q 'up -d$' <<<"$OUT"
yes "it names the snapshot step" grep -q '4/7 Database snapshot' <<<"$OUT"
yes "it names the tags" grep -q "api:$NEW web:$NEW" <<<"$OUT"
no "it never mentions :latest" grep -qi latest <<<"$OUT"
eq "it calls no docker" "$(wc -l < "$CALLS" | tr -d ' ')" "0"
no "it creates no state" test -e "$T/state/current.env"
no "it creates no lock" test -e "$T/state/lock"
fresh
deploy --dry-run --staging --build --tag "staging-abc"
eq "staging dry run exits 0" "$RC" "0"
yes "staging uses its own overlay" grep -q -- "-f $REPO/docker-compose.staging.yml" <<<"$OUT"
no "and never the shared-edge overlay" grep -q 'shared-edge' <<<"$OUT"
yes "and builds" grep -q 'up -d --build' <<<"$OUT"
fresh
deploy --dry-run --build --tag "$NEW"
no "--build on production is refused" test "$RC" = 0
fresh
set_compose_mode prod
yes "prod compose files pass the assertion" assert_compose_files prod
COMPOSE_FILES=(-f "$REPO/docker-compose.prod.yml")
no "prod without the overlay is refused" bash -c ". '$OPS/lib.sh'; COMPOSE_FILES=(-f a/docker-compose.prod.yml); assert_compose_files prod" 2>/dev/null
no "staging with the shared-edge overlay is refused" bash -c ". '$OPS/lib.sh'; COMPOSE_FILES=(-f a/docker-compose.staging.yml -f a/docker-compose.shared-edge.yml); assert_compose_files staging" 2>/dev/null

echo "a good deploy"
fresh "$OLD"
FAKE_KNOWN_TAG="$OLD" deploy --tag "$NEW"
eq "exits 0" "$RC" "0"
yes "the snapshot was taken (a dump ran)" grep -q 'mysqldump' "$CALLS"
yes "and kept in the local dir" bash -c "ls '$T'/backups/pre-deploy-*.sql.gz >/dev/null 2>&1"
yes "the pull happens" grep -q 'compose\[docker-compose.prod.yml+docker-compose.shared-edge.yml\] pull api web' "$CALLS"
yes "compose up carries the shared-edge overlay and the new tags" grep -q "up -d tags=$NEW/$NEW" "$CALLS"
no "compose never runs without the overlay" grep -E '^compose\[docker-compose.prod.yml\]' "$CALLS"
yes "snapshot, then pull, then up" test "$(line_of mysqldump)" -lt "$(line_of ' pull ')" -a "$(line_of ' pull ')" -lt "$(line_of ' up ')"
yes "the public smoke URLs were checked" grep -q 'get https://api.example.test/management/health' "$CALLS"
yes "state records the new and the previous tag" bash -c "grep -q 'API_TAG=$NEW' '$T/state/current.env' && grep -q 'PREV_API_TAG=$OLD' '$T/state/current.env'"
yes "history has a line" grep -q "deployed api=$NEW" "$T/state/history.log"
eq "pings start then success" "$(grep '^ping' "$CALLS" | sed -E 's/.*(https[^ ]*)$/\1/' | tr '\n' ' ')" "https://hc.example.test/deploy-uuid/start https://hc.example.test/deploy-uuid "
no "the lock is released" test -e "$T/state/lock"

echo "a failed deploy rolls back"
fresh "$OLD"
FAKE_KNOWN_TAG="$OLD" FAKE_UNHEALTHY_TAG="$NEW" deploy --tag "$NEW"
eq "exits 1" "$RC" "1"
yes "says it rolled back" grep -q "rolled back to api:$OLD web:$OLD" <<<"$OUT"
yes "the rollback ran the OLD tags without touching mysql" grep -q "up -d --no-deps api web tags=$OLD/$OLD" "$CALLS"
yes "state still says OLD" grep -q "API_TAG=$OLD" "$T/state/current.env"
no "state never recorded the failed tag" grep -q "$NEW" "$T/state/current.env"
yes "pings fail" grep -q '^ping .*deploy-uuid/fail' "$CALLS"
yes "names the snapshot" grep -q 'pre-deploy database snapshot is' <<<"$OUT"
no "the lock is released" test -e "$T/state/lock"

fresh "$OLD"
FAKE_KNOWN_TAG="$OLD" FAKE_CURL_FAIL_TAG="$NEW" deploy --tag "$NEW"
eq "a failing smoke check also rolls back (exit 1)" "$RC" "1"
yes "to the old tags" grep -q "up -d --no-deps api web tags=$OLD/$OLD" "$CALLS"

fresh "$OLD"
FAKE_KNOWN_TAG="$OLD" FAKE_CURL_FAIL=1 deploy --tag "$NEW"
eq "when the rollback fails too the exit code is 2" "$RC" "2"
yes "and it says to fix by hand" grep -q 'ROLLBACK FAILED' <<<"$OUT"
yes "and pings fail" grep -q '^ping .*deploy-uuid/fail' "$CALLS"

fresh "$OLD"
FAKE_KNOWN_TAG="$OLD" FAKE_UP_FAIL=1 deploy --tag "$NEW"
no "a failing compose up does not succeed" test "$RC" = 0
yes "and tries to roll back" grep -q 'rolling back' <<<"$OUT"

fresh "$OLD"
FAKE_KNOWN_TAG="$OLD" FAKE_UNHEALTHY_TAG="none" deploy --tag "$NEW" --no-public-smoke
eq "--no-public-smoke deploys without public checks" "$RC" "0"
no "and does not fetch any URL" grep -q '^get ' "$CALLS"

echo "failures before anything changes"
fresh "$OLD"
FAKE_KNOWN_TAG="$OLD" FAKE_PULL_FAIL=1 deploy --tag "$NEW"
no "a tag missing from the registry fails" test "$RC" = 0
no "and never runs up" grep -q ' up ' "$CALLS"
yes "and says nothing changed" grep -q 'nothing to roll back' <<<"$OUT"
yes "pings fail" grep -q '^ping .*deploy-uuid/fail' "$CALLS"
no "state not touched" grep -q "$NEW" "$T/state/current.env"

fresh "$OLD"
FAKE_KNOWN_TAG="$OLD" FAKE_DUMP_CUT=1 deploy --tag "$NEW"
no "a snapshot that is cut short stops the deploy" test "$RC" = 0
no "before any pull" grep -q ' pull ' "$CALLS"
no "and before any up" grep -q ' up ' "$CALLS"
fresh "$OLD"
FAKE_KNOWN_TAG="$OLD" deploy --tag "$NEW" --no-snapshot
eq "--no-snapshot skips the dump" "$(grep -c mysqldump "$CALLS")" "0"

echo "first deploy / CI deployed latest in between"
fresh ""
deploy --tag "$NEW"
eq "a deploy with no recorded state still works" "$RC" "0"
yes "the running api image was tagged pre-<time> to roll back to" grep -qE '^tag sha256:running-image ghcr.io/hasmika123/dossier-api:pre-[0-9]{8}T[0-9]{6}Z$' "$CALLS"
yes "and the web image too" grep -qE '^tag sha256:running-image ghcr.io/hasmika123/dossier-web:pre-' "$CALLS"
fresh ""
FAKE_UNHEALTHY_TAG="$NEW" deploy --tag "$NEW"
eq "a failed first deploy rolls back to the pre- tag" "$RC" "1"
yes "using it" grep -qE "up -d --no-deps api web tags=pre-[0-9]{8}T[0-9]{6}Z/pre-" "$CALLS"

echo "manual rollback"
fresh "$NEW"
printf 'API_TAG=%s\nWEB_TAG=%s\nPREV_API_TAG=%s\nPREV_WEB_TAG=%s\n' "$NEW" "$NEW" "$OLD" "$OLD" > "$T/state/current.env"
deploy --rollback
eq "--rollback exits 0" "$RC" "0"
yes "it runs the previous tags" grep -q "up -d --no-deps api web tags=$OLD/$OLD" "$CALLS"
yes "and swaps the record" bash -c "grep -q 'API_TAG=$OLD' '$T/state/current.env' && grep -q 'PREV_API_TAG=$NEW' '$T/state/current.env'"
fresh ""
deploy --rollback
no "--rollback with no recorded previous tag fails" test "$RC" = 0
fresh "$NEW"
printf 'API_TAG=%s\nWEB_TAG=%s\nPREV_API_TAG=%s\nPREV_WEB_TAG=%s\n' "$NEW" "$NEW" "$OLD" "$OLD" > "$T/state/current.env"
deploy --dry-run --rollback
eq "--rollback --dry-run exits 0" "$RC" "0"
eq "and calls nothing" "$(wc -l < "$CALLS" | tr -d ' ')" "0"

echo "locking"
fresh "$OLD"
mkdir -p "$T/state/lock"
sleep 300 &
SLEEPER=$!
echo "$SLEEPER" > "$T/state/lock/pid"
FAKE_KNOWN_TAG="$OLD" deploy --tag "$NEW"
kill "$SLEEPER" 2>/dev/null || true
no "a second deploy while one runs is refused" test "$RC" = 0
yes "naming the pid" grep -q "another deploy is running (pid $SLEEPER)" <<<"$OUT"
eq "and it touched nothing" "$(wc -l < "$CALLS" | tr -d ' ')" "0"
fresh "$OLD"
mkdir -p "$T/state/lock"
echo 999999 > "$T/state/lock/pid"
FAKE_KNOWN_TAG="$OLD" deploy --tag "$NEW"
eq "a stale lock is cleared" "$RC" "0"

echo "migration lint"
G="$T/repo"
mkdir -p "$G/api/src/main/resources/config/liquibase/changelog"
git -C "$G" init -q
git -C "$G" config user.email t@example.test
git -C "$G" config user.name tester
echo '<changeSet id="1"><createTable tableName="a"/></changeSet>' > "$G/api/src/main/resources/config/liquibase/changelog/001.xml"
git -C "$G" add -A && git -C "$G" commit -q -m one
C1="$(git -C "$G" rev-parse HEAD)"
echo '<changeSet id="2"><addColumn tableName="a"><column name="x" type="int"/></addColumn></changeSet>' > "$G/api/src/main/resources/config/liquibase/changelog/002.xml"
git -C "$G" add -A && git -C "$G" commit -q -m two
C2="$(git -C "$G" rev-parse HEAD)"
echo '<changeSet id="3"><dropColumn tableName="a" columnName="x"/></changeSet>' > "$G/api/src/main/resources/config/liquibase/changelog/003.xml"
git -C "$G" add -A && git -C "$G" commit -q -m three
C3="$(git -C "$G" rev-parse HEAD)"
eq "an additive changeset lints clean" "$(REPO="$G" migration_lint "$C1" "$C2")" ""
yes "a dropColumn is reported with its file" grep -q '003.xml:1:' <<<"$(REPO="$G" migration_lint "$C2" "$C3")"
eq "an unknown commit lints clean (it can't look)" "$(REPO="$G" migration_lint "$OLD" "$NEW")" ""
eq "a non-sha previous tag lints clean" "$(REPO="$G" migration_lint "pre-20261016T000000Z" "$C3")" ""
fresh "$C2"
FAKE_KNOWN_TAG="$C2" REPO="$G" deploy --tag "$C3"
no "a destructive migration stops the deploy" test "$RC" = 0
yes "telling how to override" grep -q 'allow-destructive-migrations' <<<"$OUT"
no "before any pull" grep -q ' pull ' "$CALLS"
fresh "$C2"
FAKE_KNOWN_TAG="$C2" REPO="$G" deploy --tag "$C3" --allow-destructive-migrations
eq "--allow-destructive-migrations lets it through" "$RC" "0"

echo "snapshot-db.sh"
fresh
OUT="$(DOCKER="$T/bin/docker" FAKE_CALLS="$CALLS" FAKE_DIR="$T/fake" BACKUP_LOCAL_DIR="$T/backups" KEEP_SNAPSHOTS=2 HOME="$T" \
  "$OPS/snapshot-db.sh" --env-file "$T/prod.env" --label "My Label/1" 2>&1)"
eq "a snapshot exits 0" "$?" "0"
yes "writes a pre-deploy file with a safe label" bash -c "ls '$T'/backups/pre-deploy-*-My-Label-1.sql.gz >/dev/null"
if [ "$(uname -s)" = Linux ]; then
  eq "the file is mode 600" "$(stat -c %a "$T"/backups/pre-deploy-*.sql.gz)" "600"
fi
for _ in 1 2 3; do
  sleep 1
  DOCKER="$T/bin/docker" FAKE_CALLS="$CALLS" FAKE_DIR="$T/fake" BACKUP_LOCAL_DIR="$T/backups" KEEP_SNAPSHOTS=2 HOME="$T" \
    "$OPS/snapshot-db.sh" --env-file "$T/prod.env" >/dev/null 2>&1
done
eq "only the newest KEEP_SNAPSHOTS stay" "$(find "$T/backups" -type f | wc -l | tr -d ' ')" "2"
DOCKER="$T/bin/docker" FAKE_CALLS="$CALLS" FAKE_DIR="$T/fake" FAKE_DUMP_CUT=1 BACKUP_LOCAL_DIR="$T/backups2" HOME="$T" \
  "$OPS/snapshot-db.sh" --env-file "$T/prod.env" >/dev/null 2>&1
no "a cut-short snapshot fails" test "$?" = 0
eq "and leaves nothing behind" "$(find "$T/backups2" -type f 2>/dev/null | wc -l | tr -d ' ')" "0"
OUT="$("$OPS/snapshot-db.sh" --dry-run --env-file "$T/prod.env" 2>&1)"
yes "--dry-run says what it would do" grep -q '\[dry-run\]' <<<"$OUT"

echo "compose files (real 'docker compose config', no daemon needed)"
if docker compose version >/dev/null 2>&1; then
  cat > "$T/cfg.env" <<'EOF'
MYSQL_ROOT_PASSWORD=x
JWT_BASE64_SECRET=x
SSLIP_HOST=example.test
ACME_EMAIL=ops@example.test
EOF
  cfg() { (cd "$REPO" && docker compose --env-file "$T/cfg.env" "$@" config 2>&1); }
  PROD="$(cfg -f docker-compose.prod.yml -f docker-compose.shared-edge.yml)"
  yes "production config is valid" grep -q '^name: dossier$' <<<"$PROD"
  yes "production keeps the shared-edge aliases" grep -q 'dossier-web' <<<"$PROD"
  no "production has no Caddy service of ours" grep -q '^  caddy:' <<<"$PROD"
  eq "every running service rotates its logs" "$(grep -c '^        max-size: 10m' <<<"$PROD")" "4"
  yes "the api image defaults to latest when no tag is exported" grep -q 'dossier-api:latest' <<<"$PROD"
  PINNED="$(cd "$REPO" && DOSSIER_API_TAG="$NEW" DOSSIER_WEB_TAG="$NEW" docker compose --env-file "$T/cfg.env" -f docker-compose.prod.yml -f docker-compose.shared-edge.yml config 2>&1)"
  yes "an exported tag pins the api image" grep -q "dossier-api:$NEW" <<<"$PINNED"
  yes "an exported tag pins the web image" grep -q "dossier-web:$NEW" <<<"$PINNED"
  STG="$(cfg -f docker-compose.prod.yml -f docker-compose.staging.yml)"
  yes "staging is its own project" grep -q '^name: dossier-staging$' <<<"$STG"
  yes "staging web has its own alias" grep -q 'dossier-staging-web' <<<"$STG"
  yes "staging api has its own alias" grep -q 'dossier-staging-api' <<<"$STG"
  no "staging never carries the production aliases" grep -qE -- '- dossier-(web|api)$' <<<"$STG"
  no "staging has no Caddy service" grep -q '^  caddy:' <<<"$STG"
  yes "staging volumes are its own" grep -q 'dossier-staging_uploads' <<<"$STG"
  eq "staging rotates its logs too" "$(grep -c '^        max-size: 10m' <<<"$STG")" "4"
  PROD_CMD="$(grep -E '^\s+command: mysqld' "$REPO/docker-compose.prod.yml" | sed -E 's/^\s*command: //; s/\r$//')"
  yes "staging's mysql command starts with production's" grep -qF "command: $PROD_CMD" "$REPO/docker-compose.staging.yml"
  # shellcheck disable=SC2016 # literal text for the compose file, not an expansion
  yes "the example env file satisfies staging's required variables" bash -c "cd '$REPO' && docker compose --env-file .env.staging.example -f docker-compose.prod.yml -f docker-compose.staging.yml config -q"
else
  echo "  skip  docker compose is not installed"
fi

echo ".env.staging.example"
yes "is tracked-able (not git-ignored)" bash -c "cd '$REPO' && ! git check-ignore -q .env.staging.example"
BAD="$(grep -E '^[A-Z0-9_]*(PASSWORD|SECRET|TOKEN|KEY|HASH)[A-Z0-9_]*=' "$REPO/.env.staging.example" \
  | grep -vE '=(CHANGE_ME[A-Za-z0-9_]*)?$' || true)"
eq "every secret is blank or a CHANGE_ME placeholder" "$BAD" ""
no "no live Stripe key" grep -qE 'sk_live|pk_live|whsec_' "$REPO/.env.staging.example"
yes "production's .env.example documents the new monitoring variables" grep -q '^HC_HOST_URL=' "$REPO/.env.example"

finish

# shellcheck shell=bash
# Shared helpers for the ops scripts (Phase 15.1). Sourced by backup-db.sh and
# verify-restore.sh, never run on its own. Everything here is plain bash + coreutils so the
# scripts run on the box as-is: the AWS CLI comes in a throwaway container (aws_cli below), so
# nothing gets installed on a host we share with BeeCompete.

say()  { printf '==> %s\n' "$*"; }
warn() { printf '!!  %s\n' "$*" >&2; }
die()  { printf 'FAIL: %s\n' "$*" >&2; exit 1; }

# env_get FILE KEY — one value from a docker-compose style .env, WITHOUT sourcing it: the
# production .env has unquoted values with spaces (sourcing would break on them, and would run
# anything in the file). The last assignment wins, a trailing " # comment" is dropped, and one
# pair of surrounding quotes is removed. A missing key prints nothing.
env_get() {
  local file="$1" key="$2" line val
  line="$(grep -E "^[[:space:]]*${key}=" "$file" | tail -n 1)" || true
  [ -n "$line" ] || return 0
  val="${line#*=}"
  case "$val" in
    \"*) val="${val#\"}"; val="${val%%\"*}" ;;
    \'*) val="${val#\'}"; val="${val%%\'*}" ;;
    *) val="$(printf '%s' "$val" | sed -E 's/[[:space:]]+#.*$//; s/[[:space:]]+$//')" ;;
  esac
  printf '%s' "$val"
}

# backup_name DATE — the object name of one night's dump (DATE is YYYY-MM-DD, UTC).
backup_name() { printf 'dossier-%s.sql.gz' "$1"; }

# backup_date NAME — the date back out of a backup's name (encrypted copies add .age or .gpg).
backup_date() { printf '%s' "$1" | sed -E 's/^dossier-([0-9]{4}-[0-9]{2}-[0-9]{2})\.sql\.gz(\.age|\.gpg)?$/\1/'; }

# is_monthly DATE — the dump taken on the 1st is also kept as the month's copy.
is_monthly() { [ "${1:8:2}" = "01" ]; }

# latest_backup — `aws s3 ls` output on stdin; prints the newest backup's name (or nothing).
# Only well-formed names count, so a stray upload can never be mistaken for a backup.
latest_backup() {
  awk '{print $NF}' | grep -E '^dossier-[0-9]{4}-[0-9]{2}-[0-9]{2}\.sql\.gz(\.age|\.gpg)?$' | sort | tail -n 1 || true
}

# days_between FROM TO — whole days from one YYYY-MM-DD to another.
days_between() {
  local a b
  a="$(date -u -d "$1" +%s)" b="$(date -u -d "$2" +%s)"
  printf '%s' $(((b - a) / 86400))
}

# dump_complete FILE.gz — mysqldump writes "-- Dump completed" as its last line, so a dump
# without it was cut short (disk full, killed, lost connection). It must also hold a schema.
dump_complete() {
  gunzip -c "$1" | tail -n 5 | grep -q -- '-- Dump completed' || return 1
  gunzip -c "$1" | grep -q 'CREATE TABLE'
}

sha256_of() { sha256sum "$1" | awk '{print $1}'; }

# hc_ping URL [start|fail] [BODY] — report to Healthchecks.io. Never fails the caller: a monitoring
# outage must not be what breaks a backup or a deploy. No URL = monitoring not set up; skipped
# quietly. BODY (optional, short, never a secret) shows on the check's page and in its alert.
hc_ping() {
  local url="$1" suffix="${2:-}" body="${3:-}"
  [ -n "$url" ] || return 0
  if [ -n "$body" ]; then
    "${CURL:-curl}" -fsS -m 10 --retry 3 -o /dev/null --data-raw "$body" "${url}${suffix:+/$suffix}" \
      || warn "could not reach Healthchecks.io (${suffix:-success})"
  else
    "${CURL:-curl}" -fsS -m 10 --retry 3 -o /dev/null "${url}${suffix:+/$suffix}" \
      || warn "could not reach Healthchecks.io (${suffix:-success})"
  fi
}

# configured VALUE — "configured" / "not configured", for dry-run output that must not print a URL.
configured() { if [ -n "$1" ]; then printf 'configured'; else printf 'not configured'; fi; }

# env_or_file KEY FILE — the value of KEY from the process environment when set there, else from
# FILE. Lets a script be configured from the box's .env and still be driven by a test or by hand.
env_or_file() {
  local key="$1" file="$2"
  if [ -n "${!key:-}" ]; then
    printf '%s' "${!key}"
  elif [ -f "$file" ]; then
    env_get "$file" "$key"
  fi
}

# aws_cli ARGS… — the AWS CLI in a throwaway container, with $WORK mounted at /work. The
# credentials are the BACKUP key (upload + read, never delete), passed by NAME from the
# environment so they never appear in the process list.
aws_cli() {
  "${DOCKER:-docker}" run --rm -i \
    -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_DEFAULT_REGION \
    -v "$WORK:/work" -w /work \
    "${AWS_CLI_IMAGE:-amazon/aws-cli:latest}" "$@"
}

# load_backup_env FILE — the backup settings from .env, exported for aws_cli. Dies naming
# every missing one, so a half-configured box says exactly what to add.
load_backup_env() {
  local file="$1" missing=""
  BACKUP_S3_BUCKET="$(env_get "$file" BACKUP_S3_BUCKET)"
  BACKUP_S3_REGION="$(env_get "$file" BACKUP_S3_REGION)"
  AWS_ACCESS_KEY_ID="$(env_get "$file" BACKUP_AWS_ACCESS_KEY_ID)"
  AWS_SECRET_ACCESS_KEY="$(env_get "$file" BACKUP_AWS_SECRET_ACCESS_KEY)"
  AWS_DEFAULT_REGION="${BACKUP_S3_REGION:-us-east-1}"
  [ -n "$BACKUP_S3_BUCKET" ] || missing="$missing BACKUP_S3_BUCKET"
  [ -n "$AWS_ACCESS_KEY_ID" ] || missing="$missing BACKUP_AWS_ACCESS_KEY_ID"
  [ -n "$AWS_SECRET_ACCESS_KEY" ] || missing="$missing BACKUP_AWS_SECRET_ACCESS_KEY"
  [ -z "$missing" ] || die "set these in $file:$missing (DEPLOY.md §5.1)"
  export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_DEFAULT_REGION
}

# ---------------------------------------------------------------------------------------------
# Compose (sprint 2 B3, REAL-GAPS-C P2.1): one place decides WHICH compose files a stack uses.

# set_compose_mode prod|staging — fills COMPOSE_FILES (needs REPO). Production ALWAYS carries the
# shared-edge overlay (CLAUDE.md): without it our own Caddy starts, fights BeeCompete's edge for
# :80/:443 and takes the other sites on the box down. Staging carries its OWN overlay instead,
# never shared-edge's (that one gives web/api the production aliases the edge routes to).
set_compose_mode() {
  case "$1" in
    prod) COMPOSE_FILES=(-f "$REPO/docker-compose.prod.yml" -f "$REPO/docker-compose.shared-edge.yml") ;;
    staging) COMPOSE_FILES=(-f "$REPO/docker-compose.prod.yml" -f "$REPO/docker-compose.staging.yml") ;;
    *) die "unknown stack: $1 (prod or staging)" ;;
  esac
}

# assert_compose_files prod|staging — belt and braces: refuse to go on with the wrong file set.
assert_compose_files() {
  local joined=" ${COMPOSE_FILES[*]} "
  case "$1" in
    prod)
      case "$joined" in *"docker-compose.shared-edge.yml "*) ;; *) die "refusing: production without the shared-edge overlay would start our Caddy on :80/:443" ;; esac
      case "$joined" in *"docker-compose.staging.yml "*) die "refusing: the staging overlay in a production run" ;; *) ;; esac ;;
    staging)
      case "$joined" in *"docker-compose.staging.yml "*) ;; *) die "refusing: staging without its overlay" ;; esac
      case "$joined" in *"docker-compose.shared-edge.yml "*) die "refusing: the shared-edge overlay in a staging run (it carries the production aliases)" ;; *) ;; esac ;;
  esac
}

# valid_tag TAG — an explicit image tag: never empty, never "latest" in any case.
valid_tag() {
  [ -n "$1" ] || return 1
  [ "${1,,}" != latest ] || return 1
  printf '%s' "$1" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$'
}

# migration_lint FROM TO — the destructive-looking lines among the Liquibase changesets that
# changed between two git commits (additive-only is the rule, CLAUDE.md). Prints "file:line:text"
# per hit; prints nothing (and returns 0) when either commit is unknown to the checkout, because
# a lint that can't look must not block a deploy. Needs REPO.
migration_lint() {
  local from="$1" to="$2" dir="api/src/main/resources/config/liquibase/changelog" f
  printf '%s' "$from" | grep -Eq '^[0-9a-f]{7,40}$' || return 0
  printf '%s' "$to" | grep -Eq '^[0-9a-f]{7,40}$' || return 0
  git -C "$REPO" cat-file -e "${from}^{commit}" 2>/dev/null || return 0
  git -C "$REPO" cat-file -e "${to}^{commit}" 2>/dev/null || return 0
  git -C "$REPO" diff --name-only --diff-filter=AM "$from" "$to" -- "$dir" | while read -r f; do
    git -C "$REPO" show "$to:$f" 2>/dev/null \
      | grep -nEi '<(dropTable|dropColumn|renameTable|renameColumn|modifyDataType|dropIndex|dropForeignKeyConstraint|dropPrimaryKey|dropView|delete)[ />]|(DROP|TRUNCATE)[[:space:]]+(TABLE|COLUMN|INDEX)|RENAME[[:space:]]+(TABLE|COLUMN)' \
      | sed "s|^|$f:|" || true
  done
}

# dump_database — writes a gzip'd, consistent mysqldump of the live database to stdout.
# Needs a compose() function from the caller (each script builds its own from COMPOSE_FILES).
#
# When binary logging is on (MySQL's default) the dump also records the binlog file and position it
# is consistent with, as a comment (`--source-data=2`). That is the starting point for a
# point-in-time recovery (P0.2, DEPLOY.md section 5.9); it costs a global read lock for a moment.
dump_database() {
  local extra=()
  # shellcheck disable=SC2016 # $MYSQL_ROOT_PASSWORD is the container's own, expanded in there.
  if [ "$(compose exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -uroot -N -B -e "SELECT @@log_bin"' 2>/dev/null | tr -d '\r')" = 1 ]; then
    extra=(--source-data=2)
  fi
  # --single-transaction: a consistent snapshot without locking. --set-gtid-purged=OFF: restores
  # into a fresh server. The password stays inside the container (MYSQL_PWD), off the command line.
  # shellcheck disable=SC2016
  compose exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysqldump -uroot \
      --single-transaction --routines --triggers --events --set-gtid-purged=OFF "$@" \
      --databases dossierApi' dump ${extra[@]+"${extra[@]}"} | gzip -9
}

# ---------------------------------------------------------------------------------------------
# Binary logs (P0.2, P0.4) — point-in-time recovery between the nightly dumps.

# binlog_file_ok NAME — a closed MySQL binlog's file name: <base>.<6 digits> (binlog.000012).
binlog_file_ok() { printf '%s' "$1" | grep -Eq '^[A-Za-z0-9_-]+\.[0-9]{6}$'; }

# binlog_number NAME — the sequence number of a binlog file (binlog.000012 -> 12, no octal surprises).
binlog_number() { printf '%s' "$((10#${1##*.}))"; }

# dump_binlog_position FILE.sql.gz — "binlog.000012 157": where in the binary log the dump is
# consistent with (the commented CHANGE REPLICATION SOURCE TO line that --source-data=2 writes).
# Prints nothing for a dump taken without it (before this existed, or with binary logging off).
dump_binlog_position() {
  local line
  # head closes the pipe early; the subshell swallows gunzip's SIGPIPE so `pipefail` callers survive.
  line="$( (gunzip -c "$1" 2>/dev/null || true) | head -n 80 | grep -E "SOURCE_LOG_FILE=|MASTER_LOG_FILE=" | head -n 1 || true)"
  [ -n "$line" ] || return 0
  printf '%s %s' \
    "$(printf '%s' "$line" | sed -nE "s/.*(SOURCE|MASTER)_LOG_FILE='([^']+)'.*/\2/p")" \
    "$(printf '%s' "$line" | sed -nE "s/.*(SOURCE|MASTER)_LOG_POS=([0-9]+).*/\2/p")"
}

# ---------------------------------------------------------------------------------------------
# Backup encryption (P0.3) — OFF unless a recipient is configured. Only PUBLIC keys live on the box:
# BACKUP_AGE_RECIPIENT (age public key(s), comma separated; the `age` tool must be installed) or
# BACKUP_GPG_RECIPIENT (key id/email already imported on the box). Decrypting needs the PRIVATE
# key, which must NOT be on the box: it stays in the password manager and on the restoring machine.

# load_encryption_env FILE — the recipient settings from the environment or FILE.
load_encryption_env() {
  BACKUP_AGE_RECIPIENT="$(env_or_file BACKUP_AGE_RECIPIENT "$1")"
  BACKUP_GPG_RECIPIENT="$(env_or_file BACKUP_GPG_RECIPIENT "$1")"
  if [ -n "$BACKUP_AGE_RECIPIENT" ] && [ -n "$BACKUP_GPG_RECIPIENT" ]; then
    die "set only one of BACKUP_AGE_RECIPIENT / BACKUP_GPG_RECIPIENT"
  fi
}

# encryption_ext — ".age", ".gpg" or "" (not encrypting), from the loaded settings.
encryption_ext() {
  if [ -n "${BACKUP_AGE_RECIPIENT:-}" ]; then
    printf '.age'
  elif [ -n "${BACKUP_GPG_RECIPIENT:-}" ]; then
    printf '.gpg'
  fi
}

# encrypt_file IN OUT — encrypts IN to the configured recipient(s). Fails closed: a configured
# recipient with a missing tool is an error, never a silent plaintext upload.
encrypt_file() {
  local in="$1" out="$2" r
  local -a args=() recips=()
  if [ -n "${BACKUP_AGE_RECIPIENT:-}" ]; then
    command -v "${AGE:-age}" >/dev/null 2>&1 || die "BACKUP_AGE_RECIPIENT is set but the age tool is not installed (apt install age)"
    IFS=, read -ra recips <<<"$BACKUP_AGE_RECIPIENT"
    for r in "${recips[@]}"; do args+=(-r "$r"); done
    "${AGE:-age}" "${args[@]}" -o "$out" "$in"
  elif [ -n "${BACKUP_GPG_RECIPIENT:-}" ]; then
    command -v "${GPG:-gpg}" >/dev/null 2>&1 || die "BACKUP_GPG_RECIPIENT is set but gpg is not installed"
    IFS=, read -ra recips <<<"$BACKUP_GPG_RECIPIENT"
    for r in "${recips[@]}"; do args+=(--recipient "$r"); done
    "${GPG:-gpg}" --batch --yes --trust-model always "${args[@]}" --output "$out" --encrypt "$in"
  else
    die "encrypt_file called with no recipient configured"
  fi
  [ -s "$out" ] || die "encryption produced an empty file"
}

# decrypt_file IN OUT [AGE_IDENTITY_FILE] — the reverse, on a machine that holds the private key.
decrypt_file() {
  local in="$1" out="$2" identity="${3:-}"
  case "$in" in
    *.age)
      [ -n "$identity" ] || die "an .age backup needs the private key file (--identity FILE)"
      "${AGE:-age}" -d -i "$identity" -o "$out" "$in" ;;
    *.gpg) "${GPG:-gpg}" --batch --yes --output "$out" --decrypt "$in" ;;
    *) cp "$in" "$out" ;;
  esac
}

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

# backup_date NAME — the date back out of a backup's name.
backup_date() { printf '%s' "$1" | sed -E 's/^dossier-([0-9]{4}-[0-9]{2}-[0-9]{2})\.sql\.gz$/\1/'; }

# is_monthly DATE — the dump taken on the 1st is also kept as the month's copy.
is_monthly() { [ "${1:8:2}" = "01" ]; }

# latest_backup — `aws s3 ls` output on stdin; prints the newest backup's name (or nothing).
# Only well-formed names count, so a stray upload can never be mistaken for a backup.
latest_backup() {
  awk '{print $NF}' | grep -E '^dossier-[0-9]{4}-[0-9]{2}-[0-9]{2}\.sql\.gz$' | sort | tail -n 1 || true
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

# hc_ping URL [start|fail] — report to Healthchecks.io. Never fails the caller: a monitoring
# outage must not be what breaks a backup. No URL = monitoring not set up; skipped quietly.
hc_ping() {
  local url="$1" suffix="${2:-}"
  [ -n "$url" ] || return 0
  "${CURL:-curl}" -fsS -m 10 --retry 3 -o /dev/null "${url}${suffix:+/$suffix}" \
    || warn "could not reach Healthchecks.io (${suffix:-success})"
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

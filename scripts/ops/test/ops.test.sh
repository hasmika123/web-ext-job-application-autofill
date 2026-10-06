#!/usr/bin/env bash
# Tests for the ops scripts (Phase 15.1a). Run in CI (the "Ops scripts" job) and by hand:
#   scripts/ops/test/ops.test.sh            # helpers + backup-db.sh against a fake docker
#   REAL_DOCKER=1 scripts/ops/test/ops.test.sh   # also a real dump → verify-restore.sh round trip
set -uo pipefail

OPS="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$OPS/../.." && pwd)"
# shellcheck source=scripts/ops/lib.sh
. "$OPS/lib.sh"

PASS=0
FAIL=0
ok()  { PASS=$((PASS + 1)); printf '  ok    %s\n' "$1"; }
bad() { FAIL=$((FAIL + 1)); printf '  FAIL  %s\n' "$1"; }
eq()  { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 — expected [$3], got [$2]"; fi; }
yes() { if "${@:2}"; then ok "$1"; else bad "$1"; fi; }
no()  { if "${@:2}"; then bad "$1"; else ok "$1"; fi; }

T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT

echo "lib.sh"
cat > "$T/env" <<'EOF'
# a comment
BACKUP_S3_BUCKET=kiwiply-backups
MAIL_USERNAME=        # Brevo SMTP login
NEWSLETTER_POSTAL_ADDRESS=1 Main St, Springfield
QUOTED="with spaces"  # and a comment
SINGLE='x y'
TWICE=first
TWICE=second
EOF
eq "plain value" "$(env_get "$T/env" BACKUP_S3_BUCKET)" "kiwiply-backups"
eq "blank value with a comment" "$(env_get "$T/env" MAIL_USERNAME)" ""
eq "unquoted value with spaces" "$(env_get "$T/env" NEWSLETTER_POSTAL_ADDRESS)" "1 Main St, Springfield"
eq "double quotes" "$(env_get "$T/env" QUOTED)" "with spaces"
eq "single quotes" "$(env_get "$T/env" SINGLE)" "x y"
eq "last assignment wins" "$(env_get "$T/env" TWICE)" "second"
eq "missing key" "$(env_get "$T/env" NOPE)" ""
eq "backup name" "$(backup_name 2026-10-01)" "dossier-2026-10-01.sql.gz"
eq "date from a name" "$(backup_date dossier-2026-10-01.sql.gz)" "2026-10-01"
yes "the 1st is monthly" is_monthly 2026-10-01
no "the 2nd is not" is_monthly 2026-10-02
eq "newest backup from a listing" "$(printf '%s\n' \
  "2026-09-30 03:15:02    1234 dossier-2026-09-30.sql.gz" \
  "2026-10-02 03:15:02    1234 dossier-2026-10-02.sql.gz" \
  "2026-10-03 09:00:00      10 notes.txt" \
  "2026-10-01 03:15:02    1234 dossier-2026-10-01.sql.gz" | latest_backup)" "dossier-2026-10-02.sql.gz"
eq "empty listing" "$(printf '' | latest_backup)" ""
eq "days between" "$(days_between 2026-09-29 2026-10-02)" "3"

# shellcheck disable=SC2016 # the backticks are SQL, not a command
printf -- '-- MySQL dump\nCREATE TABLE `jhi_user` (id int);\n-- Dump completed on 2026-10-01\n' | gzip > "$T/whole.sql.gz"
# shellcheck disable=SC2016
printf -- '-- MySQL dump\nCREATE TABLE `jhi_user` (id int);\nINSERT INTO' | gzip > "$T/cut.sql.gz"
printf -- '-- MySQL dump\n-- Dump completed on 2026-10-01\n' | gzip > "$T/empty.sql.gz"
yes "a whole dump passes" dump_complete "$T/whole.sql.gz"
no "a dump cut short fails" dump_complete "$T/cut.sql.gz"
no "a dump with no tables fails" dump_complete "$T/empty.sql.gz"

COMPOSE_MYSQL="$(grep -E '^\s+image: mysql:' "$REPO/docker-compose.prod.yml" | head -n 1 | awk '{print $2}')"
DRILL_MYSQL="$(grep -E '^MYSQL_IMAGE=' "$OPS/verify-restore.sh" | sed -E 's/.*:-([^}]*)\}.*/\1/')"
eq "the drill restores into production's MySQL version" "$DRILL_MYSQL" "$COMPOSE_MYSQL"

echo "backup-db.sh (fake docker)"
# A fake docker: `compose … exec … mysqldump` prints a dump (cut short when FAKE_CUT=1), and
# `run … aws-cli …` records the AWS call. A fake curl records the Healthchecks pings.
mkdir -p "$T/bin"
cat > "$T/bin/docker" <<'EOF'
#!/usr/bin/env bash
if [ "$1" = compose ]; then
  printf -- '-- MySQL dump\nCREATE TABLE `jhi_user` (id int);\n'
  [ "${FAKE_CUT:-0}" = 1 ] || printf -- '-- Dump completed on today\n'
  exit 0
fi
if [ "$1" = run ]; then
  shift
  while [ "$1" != "${AWS_CLI_IMAGE:-amazon/aws-cli:latest}" ]; do shift; done
  shift
  echo "aws $*" >> "$FAKE_CALLS"
  exit 0
fi
exit 1
EOF
cat > "$T/bin/curl" <<'EOF'
#!/usr/bin/env bash
echo "ping ${*: -1}" >> "$FAKE_CALLS"
EOF
chmod +x "$T/bin/docker" "$T/bin/curl"
cat > "$T/backup.env" <<'EOF'
BACKUP_S3_BUCKET=kiwiply-backups
BACKUP_S3_REGION=us-east-1
BACKUP_AWS_ACCESS_KEY_ID=AKIAFAKE
BACKUP_AWS_SECRET_ACCESS_KEY=fake-secret
HC_BACKUP_URL=https://hc-ping.com/uuid
EOF

run_backup() { # DATE [extra env…] — runs backup-db.sh against the fakes; sets OUT and RC
  local date="$1"; shift
  : > "$T/calls"
  OUT="$(env "$@" DOCKER="$T/bin/docker" CURL="$T/bin/curl" FAKE_CALLS="$T/calls" \
    ENV_FILE="$T/backup.env" BACKUP_LOCAL_DIR="$T/local" BACKUP_DATE="$date" HOME="$T" \
    "$OPS/backup-db.sh" 2>&1)"
  RC=$?
}

mkdir -p "$T/local"
for d in 2026-09-26 2026-09-27 2026-09-28 2026-09-29; do : > "$T/local/dossier-$d.sql.gz"; done
run_backup 2026-10-01
eq "a good night exits 0" "$RC" "0"
yes "uploads the daily copy with its sha256" grep -qE '^aws s3 cp /work/dossier-2026-10-01.sql.gz s3://kiwiply-backups/daily/dossier-2026-10-01.sql.gz --only-show-errors --metadata sha256=[0-9a-f]{64}$' "$T/calls"
yes "the 1st also keeps a monthly copy" grep -q 's3://kiwiply-backups/monthly/dossier-2026-10-01.sql.gz' "$T/calls"
eq "pings start, then success" "$(grep '^ping' "$T/calls" | tr '\n' '|')" "ping https://hc-ping.com/uuid/start|ping https://hc-ping.com/uuid|"
yes "keeps a copy on the box" test -f "$T/local/dossier-2026-10-01.sql.gz"
eq "keeps only the last 3 on the box" "$(find "$T/local" -type f -printf '%f\n' | sort | tr '\n' ' ')" "dossier-2026-09-28.sql.gz dossier-2026-09-29.sql.gz dossier-2026-10-01.sql.gz "

run_backup 2026-10-02
eq "any other day: daily copy only" "$(grep -c '^aws s3 cp' "$T/calls")" "1"

run_backup 2026-10-03 FAKE_CUT=1
no "a dump cut short fails the run" test "$RC" = 0
eq "and uploads nothing" "$(grep -c '^aws' "$T/calls")" "0"
yes "and pings fail" grep -q '^ping https://hc-ping.com/uuid/fail$' "$T/calls"
no "and keeps no copy on the box" test -f "$T/local/dossier-2026-10-03.sql.gz"

grep -v '^BACKUP_AWS' "$T/backup.env" > "$T/half.env"
: > "$T/calls"
OUT="$(DOCKER="$T/bin/docker" CURL="$T/bin/curl" FAKE_CALLS="$T/calls" ENV_FILE="$T/half.env" \
  HOME="$T" "$OPS/backup-db.sh" 2>&1)"
RC=$?
no "a half-configured box fails" test "$RC" = 0
yes "naming exactly what to add" grep -q 'BACKUP_AWS_ACCESS_KEY_ID BACKUP_AWS_SECRET_ACCESS_KEY' <<<"$OUT"

if [ "${REAL_DOCKER:-0}" = 1 ]; then
  echo "verify-restore.sh (real MySQL)"
  IMG="$COMPOSE_MYSQL"
  SRC="kiwiply-ops-test-src-$$"
  docker run -d --name "$SRC" -e MYSQL_ROOT_PASSWORD=pw -e MYSQL_DATABASE=dossierApi "$IMG" \
    mysqld --lower_case_table_names=1 --skip-mysqlx --character_set_server=utf8mb4 --explicit_defaults_for_timestamp >/dev/null
  for _ in $(seq 1 90); do
    docker logs "$SRC" 2>&1 | grep -q 'ready for connections.*port: 3306' \
      && docker exec -e MYSQL_PWD=pw "$SRC" mysql -uroot -e 'SELECT 1' >/dev/null 2>&1 && break
    sleep 2
  done
  docker exec -i -e MYSQL_PWD=pw "$SRC" mysql -uroot dossierApi <<'SQL'
CREATE TABLE databasechangelog (id varchar(255));
INSERT INTO databasechangelog VALUES ('00000000000000'), ('20260923030000');
CREATE TABLE jhi_user (id bigint primary key, login varchar(50));
INSERT INTO jhi_user VALUES (1, 'admin'), (2, 'user');
CREATE TABLE job_application (id bigint primary key, company varchar(200));
INSERT INTO job_application VALUES (1, 'Acme');
SQL
  # The same dump command backup-db.sh runs.
  docker exec -e MYSQL_PWD=pw "$SRC" mysqldump -uroot --single-transaction --routines --triggers --events \
    --set-gtid-purged=OFF --databases dossierApi | gzip -9 > "$T/dossier-2026-10-01.sql.gz"
  docker rm -f -v "$SRC" >/dev/null

  OUT="$(BACKUP_LOCAL_DIR="$T/drills" "$OPS/verify-restore.sh" --file "$T/dossier-2026-10-01.sql.gz" --no-live 2>&1)"
  RC=$?
  eq "a real backup restores" "$RC" "0"
  yes "with its tables, users and changesets counted" grep -q 'restore drill OK — dossier-2026-10-01.sql.gz: 3 tables, 2 users, 2 changesets' <<<"$OUT"
  yes "and every table's rows listed" grep -qE 'job_application +1' <<<"$OUT"
  yes "and the drill logged" grep -q 'restore drill OK' "$T/drills/restore-drills.log"
  eq "the throwaway container is gone" "$(docker ps -a --filter name=kiwiply-restore-drill -q)" ""

  gunzip -c "$T/dossier-2026-10-01.sql.gz" | head -n 40 | gzip > "$T/dossier-2026-10-02.sql.gz"
  OUT="$(BACKUP_LOCAL_DIR="$T/drills" "$OPS/verify-restore.sh" --file "$T/dossier-2026-10-02.sql.gz" --no-live 2>&1)"
  no "a cut-short backup fails the drill" test "$?" = 0
fi

echo
echo "$PASS passed, $FAIL failed"
[ "$FAIL" = 0 ]

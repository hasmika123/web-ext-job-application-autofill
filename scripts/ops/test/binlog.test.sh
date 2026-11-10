#!/usr/bin/env bash
# Tests for binlog shipping and the restore drill (REAL-GAPS-C P0.2, P0.4, P0.6): lib.sh's binlog
# helpers, ship-binlogs.sh, restore-drill.sh, the cron/lifecycle/logrotate wiring. Run in CI via
# ops.test.sh, or by hand:  scripts/ops/test/binlog.test.sh
# Everything runs against test/fake-docker.sh (a fake docker + a directory standing in for S3 + a fake
# MySQL datadir): no daemon, no AWS, no network. With REAL_DOCKER=1 it also does a real point-in-time
# round trip: a real MySQL of the production version, a real mysqldump through lib.sh's dump_database,
# real binary logs, restored and replayed by restore-drill.sh into a scratch container.
set -uo pipefail

OPS="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$OPS/../.." && pwd)"
# shellcheck source=scripts/ops/test/harness.sh
. "$OPS/test/harness.sh"
# shellcheck source=scripts/ops/lib.sh
. "$OPS/lib.sh"

T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin" "$T/s3" "$T/mysql" "$T/home"

UUID="11111111-2222-3333-4444-555555555555"
export DOCKER="$OPS/test/fake-docker.sh"
export FAKE_CALLS="$T/calls" FAKE_S3="$T/s3" FAKE_MYSQL="$T/mysql" FAKE_UUID="$UUID"
export HOME="$T/home"
cat > "$T/bin/curl" <<'EOF'
#!/usr/bin/env bash
echo "ping ${*: -1}" >> "$FAKE_CALLS"
EOF
# A fake age: "encrypts" by prefixing, so the tests can tell an encrypted object from a plain one.
cat > "$T/bin/age" <<'EOF'
#!/usr/bin/env bash
in="${*: -1}"; out=""
while [ $# -gt 0 ]; do case "$1" in -o) out="$2"; shift 2 ;; *) shift ;; esac; done
{ printf 'AGE-ENCRYPTED:'; cat "$in"; } > "$out"
EOF
chmod +x "$T/bin/curl" "$T/bin/age"
export CURL="$T/bin/curl"

cat > "$T/backup.env" <<'EOF'
BACKUP_S3_BUCKET=kiwiply-backups
BACKUP_S3_REGION=us-east-1
BACKUP_AWS_ACCESS_KEY_ID=AKIAFAKE
BACKUP_AWS_SECRET_ACCESS_KEY=fake-secret
HC_BINLOG_URL=https://hc.example.test/binlog
HC_DRILL_URL=https://hc.example.test/drill
EOF

# new_server N — a fake datadir with binlog.000001 .. binlog.00000N (the highest is the active one).
new_server() {
  rm -rf "$T/mysql" "$T/s3"; mkdir -p "$T/mysql" "$T/s3"
  local i
  for i in $(seq 1 "$1"); do printf '\xfebin payload for binlog.%06d\n' "$i" > "$T/mysql/$(printf 'binlog.%06d' "$i")"; done
}
calls_clear() { : > "$FAKE_CALLS"; }
calls() { cat "$FAKE_CALLS"; }
uploads() { grep -c '^aws s3 cp /work/' "$FAKE_CALLS" || true; }

run_ship() { # [env…] — runs ship-binlogs.sh against the fakes; sets OUT and RC
  calls_clear
  OUT="$(env "$@" ENV_FILE="${ENV_FILE_OVERRIDE:-$T/backup.env}" "$OPS/ship-binlogs.sh" 2>&1)"
  RC=$?
}

echo "lib.sh binlog helpers"
yes "a binlog file name is accepted" binlog_file_ok binlog.000012
no "a bare name is not" binlog_file_ok binlog
no "a path trick is not" binlog_file_ok '../binlog.000012'
no "a gz name is not (closed server files only)" binlog_file_ok binlog.000012.gz
eq "number from a name" "$(binlog_number binlog.000012)" "12"
eq "08 is not octal" "$(binlog_number binlog.000008)" "8"
printf -- "-- MySQL dump\n-- CHANGE REPLICATION SOURCE TO SOURCE_LOG_FILE='binlog.000012', SOURCE_LOG_POS=1573;\nCREATE TABLE \`t\` (i int);\n-- Dump completed on x\n" | gzip > "$T/pos.sql.gz"
eq "the dump's binlog position" "$(dump_binlog_position "$T/pos.sql.gz")" "binlog.000012 1573"
printf -- "-- MySQL dump\n-- CHANGE MASTER TO MASTER_LOG_FILE='mysql-bin.000004', MASTER_LOG_POS=99;\n-- Dump completed on x\n" | gzip > "$T/old.sql.gz"
eq "the older MASTER spelling too" "$(dump_binlog_position "$T/old.sql.gz")" "mysql-bin.000004 99"
printf -- "-- MySQL dump\nCREATE TABLE \`t\` (i int);\n-- Dump completed on x\n" | gzip > "$T/nopos.sql.gz"
eq "a dump without one prints nothing" "$(dump_binlog_position "$T/nopos.sql.gz")" ""

echo "lib.sh dump_database"
compose() { "$DOCKER" compose "$@"; }
new_server 2
calls_clear
FAKE_LOG_BIN=1 FAKE_DUMP_POS="binlog.000002 157" dump_database > "$T/d1.sql.gz"
yes "binary logging on: the dump asks for --source-data=2" grep -q '^mysqldump .*--source-data=2' "$FAKE_CALLS"
eq "and carries the position" "$(dump_binlog_position "$T/d1.sql.gz")" "binlog.000002 157"
yes "and is a whole dump" dump_complete "$T/d1.sql.gz"
calls_clear
FAKE_LOG_BIN=0 dump_database > "$T/d0.sql.gz"
no "binary logging off: no --source-data (the backup must still work)" grep -q -- '--source-data' "$FAKE_CALLS"
yes "and the dump is whole" dump_complete "$T/d0.sql.gz"

echo "ship-binlogs.sh"
new_server 3
ENV_FILE_OVERRIDE="$T/none.env" run_ship BACKUP_S3_BUCKET= BACKUP_AWS_ACCESS_KEY_ID= BACKUP_AWS_SECRET_ACCESS_KEY=
eq "unconfigured: exits 0" "$RC" "0"
yes "and says there is nothing to do" grep -q 'not configured' <<<"$OUT"
eq "and touches nothing" "$(wc -c < "$FAKE_CALLS" | tr -d ' ')" "0"

grep -v '^BACKUP_AWS_SECRET' "$T/backup.env" > "$T/half.env"
ENV_FILE_OVERRIDE="$T/half.env" run_ship BACKUP_AWS_SECRET_ACCESS_KEY=
no "half-configured: fails" test "$RC" = 0
yes "naming what is missing" grep -q 'BACKUP_AWS_SECRET_ACCESS_KEY' <<<"$OUT"

calls_clear
OUT="$(ENV_FILE="$T/backup.env" "$OPS/ship-binlogs.sh" --dry-run 2>&1)"; RC=$?
eq "dry run exits 0" "$RC" "0"
yes "and says what it would do" grep -q 'would rotate the binary log' <<<"$OUT"
eq "and touches nothing" "$(wc -c < "$FAKE_CALLS" | tr -d ' ')" "0"

new_server 3
run_ship
eq "a run exits 0" "$RC" "0"
yes "rotates the log first" grep -q '^sql FLUSH BINARY LOGS' "$FAKE_CALLS"
eq "ships the three files that are closed after the rotation" "$(uploads)" "3"
for n in 1 2 3; do
  yes "binlog.00000$n.gz is under the server uuid" test -f "$T/s3/kiwiply-backups/binlog/$UUID/binlog.00000$n.gz"
done
no "the new active file (4) is never shipped" test -e "$T/s3/kiwiply-backups/binlog/$UUID/binlog.000004.gz"
eq "the upload is the gzip of the file" "$(gunzip -c "$T/s3/kiwiply-backups/binlog/$UUID/binlog.000002.gz" | head -c 4 | od -An -tx1 | tr -d ' \n')" "fe62696e"
SUM="$(sha256_of "$T/s3/kiwiply-backups/binlog/$UUID/binlog.000002.gz")"
eq "with its sha256 as metadata" "$(cat "$T/s3/kiwiply-backups/binlog/$UUID/binlog.000002.gz.meta")" "sha256=$SUM"
eq "pings start, then success" "$(grep '^ping' "$FAKE_CALLS" | tr '\n' '|')" "ping https://hc.example.test/binlog/start|ping https://hc.example.test/binlog|"

run_ship
eq "the next run ships only the file closed since" "$(uploads)" "1"
yes "that is file 4" test -f "$T/s3/kiwiply-backups/binlog/$UUID/binlog.000004.gz"
run_ship
eq "and again exactly one (the log is rotated every run)" "$(uploads)" "1"
eq "nothing is ever uploaded twice (5 closed files, 5 objects)" "$(find "$T/s3" -name '*.gz' | wc -l | tr -d ' ')" "5"
no "no PURGE unless asked" grep -q PURGE "$FAKE_CALLS"

run_ship BINLOG_LOCAL_KEEP_DAYS=7
yes "BINLOG_LOCAL_KEEP_DAYS purges old files from the box" grep -q '^sql PURGE BINARY LOGS BEFORE NOW() - INTERVAL 7 DAY' "$FAKE_CALLS"
LINES="$(grep -n -E 's3 cp /work|PURGE' "$FAKE_CALLS" | tail -n 1 | cut -d: -f2- | cut -c1-9)"
eq "and only after the uploads" "$LINES" "sql PURGE"
run_ship BINLOG_LOCAL_KEEP_DAYS=abc
no "a non-numeric keep is refused" test "$RC" = 0

new_server 2
run_ship FAKE_LOG_BIN=0
no "binary logging off: fails" test "$RC" = 0
yes "saying so" grep -q 'binary logging is OFF' <<<"$OUT"
yes "and pings fail" grep -q '^ping https://hc.example.test/binlog/fail$' "$FAKE_CALLS"
eq "uploads nothing" "$(uploads)" "0"

new_server 3
run_ship FAKE_PUT_FAIL=1
no "an upload failure fails the run" test "$RC" = 0
yes "and pings fail" grep -q '^ping https://hc.example.test/binlog/fail$' "$FAKE_CALLS"
no "and does not ping success" grep -q '^ping https://hc.example.test/binlog$' "$FAKE_CALLS"
run_ship
eq "the next run picks up the 3 that failed and the 1 closed since" "$(uploads)" "4"

new_server 2
run_ship AGE="$T/bin/age" BACKUP_AGE_RECIPIENT=age1fakekey
eq "with a recipient set, it still succeeds" "$RC" "0"
yes "objects are .gz.age" test -f "$T/s3/kiwiply-backups/binlog/$UUID/binlog.000001.gz.age"
no "and there is no plaintext copy" test -f "$T/s3/kiwiply-backups/binlog/$UUID/binlog.000001.gz"
run_ship AGE="$T/bin/age" BACKUP_AGE_RECIPIENT=age1fakekey
eq "an encrypted object counts as shipped (one new file only)" "$(uploads)" "1"

echo "restore-drill.sh"
TODAY="$(date -u +%F)"
OLD="$(date -u -d '5 days ago' +%F)"
DUMP="dossier-$TODAY.sql.gz"
# stage_bucket POSITION — a fresh S3 with last night's dump (recording POSITION, or none) and the
# binlogs of a server that has rotated through 5 files (shipped for real by ship-binlogs.sh).
stage_bucket() {
  new_server 4
  FAKE_UUID="$UUID" ENV_FILE="$T/backup.env" "$OPS/ship-binlogs.sh" >/dev/null 2>&1   # ships 1-4, activates 5
  FAKE_UUID="$UUID" ENV_FILE="$T/backup.env" "$OPS/ship-binlogs.sh" >/dev/null 2>&1   # ships 5, activates 6
  mkdir -p "$T/s3/kiwiply-backups/daily"
  if [ -n "$1" ]; then
    printf -- "-- MySQL dump\n-- CHANGE REPLICATION SOURCE TO SOURCE_LOG_FILE='%s', SOURCE_LOG_POS=%s;\nCREATE TABLE \`jhi_user\` (id int);\n-- Dump completed on x\n" "${1% *}" "${1#* }" | gzip > "$T/s3/kiwiply-backups/daily/$DUMP"
  else
    printf -- "-- MySQL dump\nCREATE TABLE \`jhi_user\` (id int);\n-- Dump completed on x\n" | gzip > "$T/s3/kiwiply-backups/daily/$DUMP"
  fi
  echo "sha256=$(sha256_of "$T/s3/kiwiply-backups/daily/$DUMP")" > "$T/s3/kiwiply-backups/daily/$DUMP.meta"
}
run_drill() { # args… — sets OUT, RC; drill log in $T/drills
  calls_clear
  OUT="$(ENV_FILE="$T/backup.env" BACKUP_LOCAL_DIR="$T/drills" MAX_AGE_DAYS=2 "$OPS/restore-drill.sh" "$@" 2>&1)"
  RC=$?
}

stage_bucket "binlog.000002 157"
run_drill
eq "a drill with dump + binlogs exits 0" "$RC" "0"
yes "reports the replay" grep -q 'restore drill OK - dossier-.*4 binlog file(s) replayed (binlog.000002@157 .. binlog.000005)' <<<"$OUT"
yes "counts tables, users and changesets" grep -q ': 3 tables, 2 users, 4 changesets' <<<"$OUT"
yes "lists every table's rows" grep -qE 'job_application +3' <<<"$OUT"
yes "starts the scratch MySQL with no network by name" grep -q '^run scratch mysql:9.2.0 name=kiwiply-restore-drill-' "$FAKE_CALLS"
yes "replays from the dump's position through every later file" grep -qF 'mysqlbinlog --start-position=157 binlog.000002 binlog.000003 binlog.000004 binlog.000005 (image kiwiply-mysqlbinlog:9.2.0)' "$FAKE_CALLS"
no "and not from the files before the dump" grep -q 'mysqlbinlog .*binlog.000001' "$FAKE_CALLS"
yes "builds the mysqlbinlog tool image the first time (the official image has none)" grep -q '^build tool image' "$FAKE_CALLS"
yes "removes the container" grep -q '^rm -f -v kiwiply-restore-drill-' "$FAKE_CALLS"
eq "NEVER touches the live database (no compose call at all)" "$(grep -c -E '^(sql|cat|mysqldump|compose) ' "$FAKE_CALLS")" "0"
yes "logs one line" grep -q 'restore drill OK' "$T/drills/restore-drills.log"
yes "pings start" grep -qx 'ping https://hc.example.test/drill/start' "$FAKE_CALLS"
yes "and success" grep -qx 'ping https://hc.example.test/drill' "$FAKE_CALLS"
no "and not fail" grep -q '/drill/fail' "$FAKE_CALLS"

run_drill --stop-datetime '2026-10-17 14:05:00'
yes "point in time: --stop-datetime reaches mysqlbinlog" grep -qF 'mysqlbinlog --start-position=157 --stop-datetime=2026-10-17 14:05:00 binlog.000002' "$FAKE_CALLS"
no "and the tool image is built only once" grep -q '^build tool image' "$FAKE_CALLS"
run_drill --stop-datetime 'yesterday'
no "a bad --stop-datetime is refused" test "$RC" = 0

run_drill --no-binlogs
eq "--no-binlogs: dump only, exits 0" "$RC" "0"
yes "says so" grep -q 'dump only (--no-binlogs)' <<<"$OUT"
no "and replays nothing" grep -q mysqlbinlog "$FAKE_CALLS"

rm "$T/s3/kiwiply-backups/binlog/$UUID/binlog.000004.gz"
run_drill
no "a gap in the binlogs FAILS the drill" test "$RC" = 0
yes "naming the gap" grep -q 'gap between number 3 and 5' <<<"$OUT"
yes "and pings fail" grep -q '^ping https://hc.example.test/drill/fail$' "$FAKE_CALLS"
no "before a container was even started" grep -q '^run scratch' "$FAKE_CALLS"

stage_bucket "binlog.000002 157"
rm "$T/s3/kiwiply-backups/binlog/$UUID/binlog.000002.gz"
run_drill
no "the dump's own starting file missing FAILS" test "$RC" = 0
yes "saying which" grep -q 'binlog.000002) is missing' <<<"$OUT"

stage_bucket "binlog.000002 157"
mkdir -p "$T/s3/kiwiply-backups/binlog/00000000-0000-0000-0000-000000000000"
echo old > "$T/s3/kiwiply-backups/binlog/00000000-0000-0000-0000-000000000000/binlog.000001.gz"
touch -d '2020-01-01' "$T/s3/kiwiply-backups/binlog/00000000-0000-0000-0000-000000000000/binlog.000001.gz"
run_drill
eq "with two server lineages in the bucket, the one with the newest upload is used" "$RC" "0"
run_drill --binlog-prefix 00000000-0000-0000-0000-000000000000
no "--binlog-prefix picks the lineage explicitly (the old one lacks the dump's file)" test "$RC" = 0

stage_bucket ""
run_drill
eq "a dump with no recorded position restores dump-only" "$RC" "0"
yes "and says why" grep -q 'dump only: this dump records no binlog position' <<<"$OUT"
no "replaying nothing" grep -q mysqlbinlog "$FAKE_CALLS"

stage_bucket "binlog.000002 157"
echo "sha256=0000" > "$T/s3/kiwiply-backups/daily/$DUMP.meta"
run_drill
no "a dump that doesn't match its sha256 fails" test "$RC" = 0

stage_bucket "binlog.000002 157"
mv "$T/s3/kiwiply-backups/daily/$DUMP" "$T/s3/kiwiply-backups/daily/dossier-$OLD.sql.gz"
mv "$T/s3/kiwiply-backups/daily/$DUMP.meta" "$T/s3/kiwiply-backups/daily/dossier-$OLD.sql.gz.meta"
run_drill
no "a stale newest backup fails" test "$RC" = 0
yes "saying the nightly backup stopped" grep -q 'has stopped' <<<"$OUT"

stage_bucket "binlog.000002 157"
FAKE_USERS=0 run_drill
no "an empty user table fails" test "$RC" = 0
stage_bucket "binlog.000002 157"
OUT="$(FAKE_BAD_CHANGESETS=2 ENV_FILE="$T/backup.env" BACKUP_LOCAL_DIR="$T/drills" "$OPS/restore-drill.sh" 2>&1)"; RC=$?
no "a bad Liquibase changeset fails" test "$RC" = 0
OUT="$(FAKE_REPLAY_FAIL=1 ENV_FILE="$T/backup.env" BACKUP_LOCAL_DIR="$T/drills" "$OPS/restore-drill.sh" 2>&1)"; RC=$?
no "a failing replay fails the drill" test "$RC" = 0
OUT="$(FAKE_TABLES=$'jhi_user\njob_application' ENV_FILE="$T/backup.env" BACKUP_LOCAL_DIR="$T/drills" "$OPS/restore-drill.sh" 2>&1)"; RC=$?
no "a missing Liquibase table fails" test "$RC" = 0

# An encrypted dump: no key here, so only freshness + sha256 are checked.
stage_bucket "binlog.000002 157"
mv "$T/s3/kiwiply-backups/daily/$DUMP" "$T/s3/kiwiply-backups/daily/$DUMP.age"
echo "sha256=$(sha256_of "$T/s3/kiwiply-backups/daily/$DUMP.age")" > "$T/s3/kiwiply-backups/daily/$DUMP.age.meta"
rm "$T/s3/kiwiply-backups/daily/$DUMP.meta"
run_drill
eq "an encrypted dump with no key: exits 0" "$RC" "0"
yes "as INTEGRITY ONLY" grep -q 'INTEGRITY ONLY' <<<"$OUT"
no "restoring nothing" grep -q '^run scratch' "$FAKE_CALLS"

# Local files, no AWS at all.
new_server 4
rm -rf "$T/bl" "$T/s3"; mkdir -p "$T/bl" "$T/s3"
for n in 3 4 5 6; do printf '\xfebin local %s\n' "$n" | gzip > "$T/bl/$(printf 'binlog.%06d' "$n").gz"; done
printf '\xfebin plain 7\n' > "$T/bl/binlog.000007"
printf -- "-- MySQL dump\n-- CHANGE REPLICATION SOURCE TO SOURCE_LOG_FILE='binlog.000003', SOURCE_LOG_POS=157;\nCREATE TABLE \`jhi_user\` (id int);\n-- Dump completed on x\n" | gzip > "$T/local-dump.sql.gz"
run_drill --file "$T/local-dump.sql.gz" --binlog-dir "$T/bl"
eq "--file + --binlog-dir restore with no AWS" "$RC" "0"
no "no aws call" grep -q '^aws' "$FAKE_CALLS"
yes "gz and plain binlog files both replay (3..7)" grep -qF 'binlog.000003 binlog.000004 binlog.000005 binlog.000006 binlog.000007 (image' "$FAKE_CALLS"
rm -f "$FAKE_CALLS.built"
run_drill --file "$T/local-dump.sql.gz" --binlog-dir "$T/bl" --binlog-tool-image fake-tool:1
eq "--binlog-tool-image uses the image you name" "$RC" "0"
no "and builds nothing" grep -q '^build tool image' "$FAKE_CALLS"
yes "running it" grep -qF '(image fake-tool:1)' "$FAKE_CALLS"
rm -f "$FAKE_CALLS.built"
FAKE_BUILD_FAIL=1 run_drill --file "$T/local-dump.sql.gz" --binlog-dir "$T/bl"
no "a tool image that cannot be built fails the drill" test "$RC" = 0
yes "saying how to avoid it" grep -q 'BINLOG_TOOL_IMAGE' <<<"$OUT"
no "before any scratch server was started" grep -q '^run scratch' "$FAKE_CALLS"
rm -f "$FAKE_CALLS.built"
run_drill --file "$T/nope.sql.gz"
no "a missing --file fails" test "$RC" = 0

run_drill --dry-run
eq "dry run exits 0" "$RC" "0"
yes "and says what it would do" grep -q 'would take the newest daily/ dump' <<<"$OUT"
eq "touching nothing" "$(wc -c < "$FAKE_CALLS" | tr -d ' ')" "0"

echo "wiring"
CRON="$OPS/kiwiply-ops.cron"
# shellcheck disable=SC2016 # $REPO is literal text in the cron file
yes "the cron file ships binlogs every 15 minutes" grep -Eq '^\*/15 \* \* \* \* root "\$REPO/scripts/ops/ship-binlogs.sh" >> /var/log/kiwiply-binlog.log' "$CRON"
# shellcheck disable=SC2016
yes "the cron file runs the restore drill monthly" grep -Eq '^[0-9]+ [0-9]+ [0-9]+ \* \* root "\$REPO/scripts/ops/restore-drill.sh" >> /var/log/kiwiply-restore-drill-monthly.log' "$CRON"
yes "logrotate covers the binlog log" grep -q '/var/log/kiwiply-binlog.log' "$OPS/kiwiply-logrotate.conf"
yes "logrotate covers the monthly drill log" grep -q '/var/log/kiwiply-restore-drill-monthly.log' "$OPS/kiwiply-logrotate.conf"
yes "the lifecycle file expires binlog/ after 32 days" bash -c "tr -d ' \r\n' < '$OPS/aws/lifecycle.json' | grep -q '\"Prefix\":\"binlog/\"},\"Status\":\"Enabled\",\"Expiration\":{\"Days\":32}'"
no "the backup key still cannot delete" grep -q 's3:Delete' "$OPS/aws/backup-user-policy.json"
DRILL_MYSQL="$(grep -E '^MYSQL_IMAGE=' "$OPS/restore-drill.sh" | sed -E 's/.*:-([^}]*)\}.*/\1/')"
COMPOSE_MYSQL="$(grep -E '^\s+image: mysql:' "$REPO/docker-compose.prod.yml" | head -n 1 | awk '{print $2}' | tr -d '\r')"
eq "the drill restores into production's MySQL version" "$DRILL_MYSQL" "$COMPOSE_MYSQL"
for s in ship-binlogs restore-drill; do
  yes "$s.sh is executable in git (cron runs it directly)" bash -c "git -C '$REPO' ls-files -s scripts/ops/$s.sh | grep -q '^100755'"
done

if [ "${REAL_DOCKER:-0}" = 1 ]; then
  echo "point-in-time round trip (real MySQL $COMPOSE_MYSQL)"
  unset DOCKER   # the real one from here on
  SRC="kiwiply-pitr-test-src-$$"
  cleanup_src() { docker rm -f -v "$SRC" >/dev/null 2>&1 || true; }
  trap 'cleanup_src; rm -rf "$T"' EXIT
  docker run -d --name "$SRC" -e MYSQL_ROOT_PASSWORD=pw -e MYSQL_DATABASE=dossierApi "$COMPOSE_MYSQL" \
    mysqld --lower_case_table_names=1 --skip-mysqlx --character_set_server=utf8mb4 --explicit_defaults_for_timestamp >/dev/null
  for _ in $(seq 1 90); do
    docker logs "$SRC" 2>&1 | grep -q 'ready for connections.*port: 3306' \
      && docker exec -e MYSQL_PWD=pw "$SRC" mysql -uroot -e 'SELECT 1' >/dev/null 2>&1 && break
    sleep 2
  done
  src_sql() { docker exec -i -e MYSQL_PWD=pw "$SRC" mysql -uroot dossierApi; }
  src_sql <<'SQL'
CREATE TABLE databasechangelog (id varchar(255), exectype varchar(10), dateexecuted datetime);
INSERT INTO databasechangelog VALUES ('00000000000000','EXECUTED',NOW()), ('20260923030000','EXECUTED',NOW());
CREATE TABLE jhi_user (id bigint primary key, login varchar(50));
INSERT INTO jhi_user VALUES (1, 'admin'), (2, 'user');
CREATE TABLE job_application (id bigint primary key, company varchar(200));
INSERT INTO job_application VALUES (1, 'Acme');
SQL
  # The real dump_database, with `compose exec -T mysql ARGS` mapped onto the source container.
  compose() { shift; shift; shift; docker exec -i "$SRC" "$@"; }
  dump_database > "$T/real.sql.gz"
  POS="$(dump_binlog_position "$T/real.sql.gz")"
  yes "the real dump records a binlog position ($POS)" test -n "$POS"
  # Writes AFTER the dump: rows, a new table, an update, a delete. These exist only in the binlogs.
  src_sql <<'SQL'
INSERT INTO job_application VALUES (2, 'Globex'), (3, 'Initech');
CREATE TABLE after_dump (id int primary key, note varchar(20));
INSERT INTO after_dump VALUES (1, 'written later');
UPDATE job_application SET company = 'Acme Corp' WHERE id = 1;
DELETE FROM jhi_user WHERE id = 2;
SQL
  docker exec -e MYSQL_PWD=pw "$SRC" mysql -uroot -e 'FLUSH BINARY LOGS'
  mkdir -p "$T/realbl"
  docker exec -e MYSQL_PWD=pw "$SRC" mysql -uroot -N -B -e 'SHOW BINARY LOGS' | awk '{print $1}' | sed '$d' | while read -r f; do
    docker exec "$SRC" cat "/var/lib/mysql/$f" | gzip -9 > "$T/realbl/$f.gz"
  done
  OUT="$(BACKUP_LOCAL_DIR="$T/realdrills" "$OPS/restore-drill.sh" --file "$T/real.sql.gz" --binlog-dir "$T/realbl" 2>&1)"
  RC=$?
  [ "$RC" = 0 ] || printf '%s\n' "$OUT" | tail -n 25
  eq "the drill restores the dump and replays the binlogs" "$RC" "0"
  yes "reports 4 tables (3 + the one created after the dump)" grep -q ': 4 tables, 1 users, 2 changesets' <<<"$OUT"
  yes "the rows written after the dump are back (3 applications)" grep -qE 'job_application +3' <<<"$OUT"
  yes "including the table created after it" grep -qE 'after_dump +1' <<<"$OUT"
  yes "and the delete replayed (1 user)" grep -qE 'jhi_user +1' <<<"$OUT"
  OUT="$(BACKUP_LOCAL_DIR="$T/realdrills" "$OPS/restore-drill.sh" --file "$T/real.sql.gz" --no-binlogs 2>&1)"
  yes "dump only: just the 3 original tables and 2 users" grep -qE 'jhi_user +2' <<<"$OUT"
  eq "no scratch container is left behind" "$(docker ps -a --filter name=kiwiply-restore-drill -q)" ""
  cleanup_src
fi

finish

#!/usr/bin/env bash
# Tests for host-guard.sh, the encryption support in backup-db.sh / verify-restore.sh and
# backup-uploads.sh (sprint 2 B3). Run in CI via ops.test.sh, or by hand: scripts/ops/test/guard.test.sh
# Fake docker / curl / df / openssl / age / gpg only: no daemon, no network, no real key.
set -uo pipefail

OPS="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=scripts/ops/test/harness.sh
. "$OPS/test/harness.sh"
# shellcheck source=scripts/ops/lib.sh
. "$OPS/lib.sh"

T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
CALLS="$T/calls"
mkdir -p "$T/bin" "$T/vol/sub"
echo "resume one" > "$T/vol/a.pdf"
echo "resume two" > "$T/vol/sub/b.pdf"

# ---- fakes ---------------------------------------------------------------------------------
cat > "$T/bin/docker" <<'EOF'
#!/usr/bin/env bash
echo "docker $*" >> "$FAKE_CALLS"
host_of() { # the host side of the -v mount whose container side is $1
  local prev=""
  for a in "$@"; do
    if [ "$prev" = -v ] && [ "${a##*:}" = "$MOUNT" ]; then printf '%s' "${a%:*}"; return; fi
    prev="$a"
  done
}
case "$1" in
  compose)
    case "$*" in
      *mysqldump*)
        printf -- '-- MySQL dump\nCREATE TABLE `jhi_user` (id int);\n'
        [ "${FAKE_CUT:-0}" = 1 ] || printf -- '-- Dump completed on today\n' ;;
      *"ps -q api"*) echo cid-api ;;
    esac ;;
  ps)
    case "$*" in
      *"project=dossier-staging"*) [ "${FAKE_STAGING:-0}" = 1 ] && echo cstg ;;
      *"project=dossier"*) [ -z "${FAKE_RESTARTS:-}" ] || echo c1 ;;
    esac ;;
  inspect)
    case "$*" in
      *RestartCount*) printf '/dossier-api-1 %s\n' "${FAKE_RESTARTS:-0}" ;;
      *Mounts*) printf '%s' "${FAKE_VOLUME:-}" ;;
    esac ;;
  run)
    case "$*" in
      *"/out"*)  # backup-uploads.sh: the throwaway archiver
        MOUNT=/out; out="$(host_of "$@")"
        archive="${*: -2:1}"; manifest="${*: -1}"
        if [ "${FAKE_EMPTY_VOLUME:-0}" = 1 ]; then
          (cd "$FAKE_EMPTY_DIR" && tar -cf - . | gzip > "$out/$archive"); : > "$out/$manifest"
        elif [ "${FAKE_BAD_ARCHIVE:-0}" = 1 ]; then
          echo "not a gzip" > "$out/$archive"; echo "x  ./a" > "$out/$manifest"
        else
          (cd "$FAKE_VOL" && tar -cf - . | gzip > "$out/$archive" && find . -type f | xargs sha256sum > "$out/$manifest")
        fi ;;
      *)         # the AWS CLI container
        MOUNT=/work; work="$(host_of "$@")"
        shift; while [ "$1" != "${AWS_CLI_IMAGE:-amazon/aws-cli:latest}" ]; do shift; done; shift
        case "$1 $2" in
          "s3 cp")
            case "$3" in
              s3://*) printf 'ciphertext-bytes' > "$work/$(basename "$3")" ;;
              *) echo "aws $*" >> "$FAKE_CALLS" ;;
            esac ;;
          "s3 ls") printf '2026-01-01 03:15:02       12 %s\n' "$FAKE_LISTING_NAME" ;;
          "s3api head-object") printf '%s\n' "$(printf 'ciphertext-bytes' | sha256sum | awk '{print $1}')" ;;
        esac ;;
    esac ;;
esac
exit 0
EOF
cat > "$T/bin/curl" <<'EOF'
#!/usr/bin/env bash
echo "ping $*" >> "$FAKE_CALLS"
exit 0
EOF
cat > "$T/bin/df" <<'EOF'
#!/usr/bin/env bash
printf 'Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/x 100 %s 10 %s%% /\n' "${FAKE_DF_PCT:-40}" "${FAKE_DF_PCT:-40}"
EOF
cat > "$T/bin/openssl" <<'EOF'
#!/usr/bin/env bash
if [ "$1" = s_client ]; then cat > /dev/null; [ "${FAKE_CERT_BROKEN:-0}" = 1 ] || echo CERT; exit 0; fi
if [ "$1" = x509 ]; then
  grep -q CERT || exit 1
  echo "notAfter=$(date -u -d "+${FAKE_CERT_DAYS:-60} days" '+%b %e %H:%M:%S %Y GMT')"
fi
EOF
cat > "$T/bin/age" <<'EOF'
#!/usr/bin/env bash
echo "age $*" >> "$FAKE_CALLS"
out=""; in=""
while [ $# -gt 0 ]; do
  case "$1" in -r) shift 2 ;; -o) out="$2"; shift 2 ;; *) in="$1"; shift ;; esac
done
{ echo "age-encryption.org/v1"; cat "$in"; } > "$out"
EOF
cat > "$T/bin/gpg" <<'EOF'
#!/usr/bin/env bash
echo "gpg $*" >> "$FAKE_CALLS"
out=""; in=""
while [ $# -gt 0 ]; do
  case "$1" in --output) out="$2"; shift 2 ;; --encrypt) in="$2"; shift 2 ;; *) shift ;; esac
done
{ echo "-----BEGIN PGP MESSAGE-----"; cat "$in"; } > "$out"
EOF
chmod +x "$T/bin"/*

# ---- host-guard ----------------------------------------------------------------------------
echo "host-guard.sh"
cat > "$T/hg.env" <<'EOF'
HC_HOST_URL=https://hc.example.test/host-uuid
SSLIP_HOST=example.test
EOF
cat > "$T/meminfo.ok" <<'EOF'
MemTotal:        1000000 kB
MemAvailable:     500000 kB
SwapTotal:       4000000 kB
SwapFree:        4000000 kB
EOF
cat > "$T/meminfo.bad" <<'EOF'
MemTotal:        1000000 kB
MemAvailable:      50000 kB
SwapTotal:       4000000 kB
SwapFree:        4000000 kB
EOF
cat > "$T/meminfo.swap" <<'EOF'
MemTotal:        1000000 kB
MemAvailable:     500000 kB
SwapTotal:       4000000 kB
SwapFree:        1000000 kB
EOF
guard() { # ARGS… — sets OUT and RC (the caller exports FAKE_* and MEMINFO_FILE)
  : > "$CALLS"
  OUT="$(DF="$T/bin/df" DOCKER="$T/bin/docker" OPENSSL="$T/bin/openssl" CURL="$T/bin/curl" FAKE_CALLS="$CALLS" \
    HOST_GUARD_DISK_PATHS="$T" HOST_GUARD_STATE="$T/hg.state" ENV_FILE="$T/hg.env" HOME="$T" \
    MEMINFO_FILE="${MEMINFO_FILE:-$T/meminfo.ok}" "$OPS/host-guard.sh" "$@" 2>&1)"
  RC=$?
}
rm -f "$T/hg.state"
guard
eq "a healthy host exits 0" "$RC" "0"
yes "and pings success" grep -q '^ping .*hc.example.test/host-uuid$' "$CALLS"
no "and never /fail" grep -q '/fail' "$CALLS"
yes "and reports the certificate days" grep -q 'certificate of api.example.test: ' <<<"$OUT"

FAKE_DF_PCT=86 guard
eq "a disk at 86% fails" "$RC" "1"
yes "pings /fail with the reason in the body" grep -qE '^ping .*--data-raw disk .* is 86% full .*host-uuid/fail$' "$CALLS"
FAKE_DF_PCT=91 guard
yes "over 90% is marked CRITICAL" grep -q 'CRITICAL disk' "$CALLS"
FAKE_DF_PCT=85 guard
eq "85% is the limit (fails)" "$RC" "1"
FAKE_DF_PCT=84 guard
eq "84% is fine" "$RC" "0"

rm -f "$T/hg.state"
MEMINFO_FILE="$T/meminfo.bad" guard
eq "memory pressure on one check is only a strike (exit 0)" "$RC" "0"
MEMINFO_FILE="$T/meminfo.bad" guard
eq "the second check in a row fails" "$RC" "1"
yes "naming memory pressure" grep -q 'memory pressure for 2 checks in a row' "$CALLS"
no "no staging hint when staging isn't running" grep -q 'dossier-staging stop' "$CALLS"
MEMINFO_FILE="$T/meminfo.bad" FAKE_STAGING=1 guard
yes "with staging running it says to stop staging" grep -q 'docker compose -p dossier-staging stop' "$CALLS"
MEMINFO_FILE="$T/meminfo.ok" guard
eq "recovery clears it" "$RC" "0"
MEMINFO_FILE="$T/meminfo.bad" guard
eq "and starts the count again" "$RC" "0"
rm -f "$T/hg.state"
MEMINFO_FILE="$T/meminfo.swap" guard
MEMINFO_FILE="$T/meminfo.swap" guard
eq "swap over 2 GB in use also counts" "$RC" "1"
yes "reported" grep -q 'swap 2929 MB' "$CALLS"

rm -f "$T/hg.state"
FAKE_RESTARTS=0 guard
eq "the first look at a container's restart count is a baseline" "$RC" "0"
FAKE_RESTARTS=0 guard
eq "no new restarts is fine" "$RC" "0"
FAKE_RESTARTS=3 guard
eq "a container that restarted fails the check" "$RC" "1"
yes "naming it and the count" grep -q 'dossier-api-1 restarted 3 time(s)' "$CALLS"
FAKE_RESTARTS=3 guard
eq "and only once: the next check is clean" "$RC" "0"

FAKE_CERT_DAYS=5 guard
eq "a certificate with 5 days left fails" "$RC" "1"
yes "naming the host" grep -q 'certificate of example.test expires in 5 day' "$CALLS"
FAKE_CERT_DAYS=30 guard
eq "30 days left is fine" "$RC" "0"
FAKE_CERT_BROKEN=1 guard
eq "an unreadable certificate fails" "$RC" "1"
HOST_GUARD_CERT_HOSTS="" ENV_FILE="$T/none.env" guard
eq "no hosts configured: the certificate check is skipped" "$RC" "0"

rm -f "$T/hg.state"
FAKE_DF_PCT=95 guard --dry-run
eq "--dry-run still reports the failure" "$RC" "1"
no "but pings nothing" grep -q '^ping' "$CALLS"
no "and writes no state" test -e "$T/hg.state"
yes "and says what it would send" grep -q '\[dry-run\] would ping Healthchecks.io /fail' <<<"$OUT"
OUT="$(DF="$T/bin/df" DOCKER="$T/bin/docker" CURL="$T/bin/curl" FAKE_CALLS="$CALLS" HOST_GUARD_DISK_PATHS="$T" HOST_GUARD_STATE="$T/hg2.state" \
  ENV_FILE="$T/none.env" MEMINFO_FILE="$T/meminfo.ok" HOME="$T" "$OPS/host-guard.sh" 2>&1)"
eq "with no Healthchecks URL it just runs" "$?" "0"

# ---- backup-db.sh encryption ---------------------------------------------------------------
echo "backup-db.sh encryption"
cat > "$T/backup.env" <<'EOF'
BACKUP_S3_BUCKET=kiwiply-backups
BACKUP_S3_REGION=us-east-1
BACKUP_AWS_ACCESS_KEY_ID=AKIAFAKE
BACKUP_AWS_SECRET_ACCESS_KEY=fake-secret
HC_BACKUP_URL=https://hc.example.test/backup-uuid
EOF
backup() { # DATE [env…] — sets OUT and RC; the aws calls land in CALLS
  local date="$1"; shift
  : > "$CALLS"
  OUT="$(env "$@" DOCKER="$T/bin/docker" CURL="$T/bin/curl" FAKE_CALLS="$CALLS" ENV_FILE="$T/backup.env" \
    BACKUP_LOCAL_DIR="$T/local" BACKUP_DATE="$date" HOME="$T" "$OPS/backup-db.sh" 2>&1)"
  RC=$?
}
rm -rf "$T/local"
backup 2026-10-02
yes "default: no encryption, a plain .sql.gz is uploaded" grep -q 'aws s3 cp /work/dossier-2026-10-02.sql.gz s3://kiwiply-backups/daily/dossier-2026-10-02.sql.gz ' "$CALLS"
no "and age is not called" grep -q '^age ' "$CALLS"

backup 2026-10-03 AGE="$T/bin/age" BACKUP_AGE_RECIPIENT=age1aaa,age1bbb
eq "age: exits 0" "$RC" "0"
yes "encrypts to both recipients" grep -q '^age -r age1aaa -r age1bbb -o ' "$CALLS"
yes "uploads the .age file" grep -q 's3://kiwiply-backups/daily/dossier-2026-10-03.sql.gz.age ' "$CALLS"
no "and never the plaintext dump" grep -q 'daily/dossier-2026-10-03.sql.gz ' "$CALLS"
yes "keeps the encrypted copy on the box" test -f "$T/local/dossier-2026-10-03.sql.gz.age"
no "and no plaintext copy" test -f "$T/local/dossier-2026-10-03.sql.gz"
yes "the local file is an age file" grep -q 'age-encryption.org/v1' "$T/local/dossier-2026-10-03.sql.gz.age"
yes "the success ping still goes out" grep -q '^ping .*backup-uuid$' "$CALLS"

backup 2026-10-04 AGE="$T/nowhere/age" BACKUP_AGE_RECIPIENT=age1aaa
no "age missing: fails closed" test "$RC" = 0
yes "saying what to install" grep -q 'apt install age' <<<"$OUT"
eq "uploads nothing" "$(grep -c '^aws' "$CALLS")" "0"
yes "and pings fail" grep -q '^ping .*backup-uuid/fail$' "$CALLS"

backup 2026-10-05 GPG="$T/bin/gpg" BACKUP_GPG_RECIPIENT=ops@example.test
eq "gpg: exits 0" "$RC" "0"
yes "encrypts to the recipient" grep -q '^gpg --batch --yes --trust-model always --recipient ops@example.test --output ' "$CALLS"
yes "uploads the .gpg file" grep -q 'daily/dossier-2026-10-05.sql.gz.gpg ' "$CALLS"

backup 2026-10-06 AGE="$T/bin/age" BACKUP_AGE_RECIPIENT=age1aaa BACKUP_GPG_RECIPIENT=ops@example.test
no "both recipients set: refused" test "$RC" = 0
yes "with a clear message" grep -q 'set only one of' <<<"$OUT"

backup 2026-10-07 FAKE_CUT=1 AGE="$T/bin/age" BACKUP_AGE_RECIPIENT=age1aaa
no "a cut-short dump is still refused before encrypting" test "$RC" = 0
no "age was not even called" grep -q '^age ' "$CALLS"

backup 2026-10-08 --dry-run
: > "$CALLS"
OUT="$(DOCKER="$T/bin/docker" CURL="$T/bin/curl" FAKE_CALLS="$CALLS" ENV_FILE="$T/backup.env" BACKUP_LOCAL_DIR="$T/local" \
  BACKUP_DATE=2026-10-01 BACKUP_AGE_RECIPIENT=age1aaa HOME="$T" "$OPS/backup-db.sh" --dry-run 2>&1)"
eq "--dry-run exits 0" "$?" "0"
yes "it says it would encrypt" grep -q 'would encrypt it to dossier-2026-10-01.sql.gz.age' <<<"$OUT"
yes "and keep a monthly copy on the 1st" grep -q 'and monthly/' <<<"$OUT"
eq "it ran no docker and no curl" "$(wc -l < "$CALLS" | tr -d ' ')" "0"
no "it does not print the ping URL" grep -q 'hc.example.test' <<<"$OUT"

# ---- names ---------------------------------------------------------------------------------
echo "backup names"
eq "date from an .age name" "$(backup_date dossier-2026-10-01.sql.gz.age)" "2026-10-01"
eq "date from a .gpg name" "$(backup_date dossier-2026-10-01.sql.gz.gpg)" "2026-10-01"
eq "newest backup counts encrypted names" "$(printf '%s\n' \
  "2026-10-01 03:15:02 1 dossier-2026-10-01.sql.gz" \
  "2026-10-02 03:15:02 1 dossier-2026-10-02.sql.gz.age" | latest_backup)" "dossier-2026-10-02.sql.gz.age"
eq "a stray .age file is not a backup" "$(printf '%s\n' "2026-10-02 03:15:02 1 notes.age" | latest_backup)" ""

# ---- verify-restore.sh with an encrypted newest backup -------------------------------------
echo "verify-restore.sh (encrypted)"
TODAY="$(date -u +%F)"
drill() { # ARGS… — sets OUT and RC
  : > "$CALLS"
  OUT="$(env DOCKER="$T/bin/docker" CURL="$T/bin/curl" FAKE_CALLS="$CALLS" ENV_FILE="$T/drill.env" BACKUP_LOCAL_DIR="$T/drills" HOME="$T" \
    "$OPS/verify-restore.sh" "$@" 2>&1)"
  RC=$?
}
{ cat "$T/backup.env"; echo "HC_RESTORE_URL=https://hc.example.test/restore-uuid"; } > "$T/drill.env"
FAKE_LISTING_NAME="dossier-$TODAY.sql.gz.age" drill
eq "the weekly drill on an encrypted backup exits 0 (integrity only)" "$RC" "0"
yes "and says so plainly" grep -q 'INTEGRITY ONLY' <<<"$OUT"
yes "and logs it" grep -q 'INTEGRITY ONLY' "$T/drills/restore-drills.log"
no "it starts no MySQL" grep -q 'mysqld' "$CALLS"
yes "it pings success with the reason" grep -q 'integrity only' "$CALLS"
echo "x" > "$T/dossier-2026-10-01.sql.gz.age"
drill --file "$T/dossier-2026-10-01.sql.gz.age" --no-live
no "a local encrypted file without a key is refused" test "$RC" = 0
yes "asking for --identity" grep -q -- '--identity' <<<"$OUT"

# ---- backup-uploads.sh ---------------------------------------------------------------------
echo "backup-uploads.sh"
cat > "$T/up.env" <<'EOF'
BACKUP_S3_BUCKET=kiwiply-backups
BACKUP_S3_REGION=us-east-1
BACKUP_AWS_ACCESS_KEY_ID=AKIAFAKE
BACKUP_AWS_SECRET_ACCESS_KEY=fake-secret
HC_UPLOADS_URL=https://hc.example.test/uploads-uuid
EOF
mkdir -p "$T/empty"
uploads() { # [env…] — sets OUT and RC
  : > "$CALLS"
  OUT="$(env "$@" DOCKER="$T/bin/docker" CURL="$T/bin/curl" FAKE_CALLS="$CALLS" FAKE_VOL="$T/vol" FAKE_EMPTY_DIR="$T/empty" \
    ENV_FILE="$T/up.env" BACKUP_DATE=2026-10-10 HOME="$T" "$OPS/backup-uploads.sh" 2>&1)"
  RC=$?
}
uploads FAKE_VOLUME=dossier_uploads_found
eq "a normal run exits 0" "$RC" "0"
yes "archives the volume it found mounted in the api, read-only" grep -q -- '-v dossier_uploads_found:/data:ro' "$CALLS"
yes "uploads the archive with its sha256" grep -qE '^aws s3 cp /work/uploads-2026-10-10.tar.gz s3://kiwiply-backups/uploads/uploads-2026-10-10.tar.gz --only-show-errors --metadata sha256=[0-9a-f]{64}$' "$CALLS"
yes "uploads the manifest" grep -q 's3://kiwiply-backups/uploads/manifest-2026-10-10.txt' "$CALLS"
yes "reports the file count" grep -q '2 files' <<<"$OUT"
yes "pings start, then success with the count" bash -c "grep -n '^ping' '$CALLS' | head -n 1 | grep -q 'uploads-uuid/start' && grep '^ping' '$CALLS' | tail -n 1 | grep -q '2 files'"
uploads
yes "without a running api it falls back to dossier_uploads" grep -q -- '-v dossier_uploads:/data:ro' "$CALLS"
uploads UPLOADS_VOLUME=custom_vol
yes "UPLOADS_VOLUME wins" grep -q -- '-v custom_vol:/data:ro' "$CALLS"
uploads AGE="$T/bin/age" BACKUP_AGE_RECIPIENT=age1aaa
eq "encrypted: exits 0" "$RC" "0"
yes "uploads the .age archive" grep -q 'uploads/uploads-2026-10-10.tar.gz.age ' "$CALLS"
no "and not the plain one" grep -q 'uploads/uploads-2026-10-10.tar.gz ' "$CALLS"
uploads FAKE_EMPTY_VOLUME=1
eq "an empty volume is a success" "$RC" "0"
eq "with nothing uploaded" "$(grep -c '^aws' "$CALLS")" "0"
yes "and says why" grep -q 'nothing to upload' <<<"$OUT"
uploads FAKE_BAD_ARCHIVE=1
no "a corrupt archive fails" test "$RC" = 0
eq "uploading nothing" "$(grep -c '^aws' "$CALLS")" "0"
yes "and pings fail" grep -q '^ping .*uploads-uuid/fail$' "$CALLS"
: > "$CALLS"
OUT="$(DOCKER="$T/bin/docker" CURL="$T/bin/curl" FAKE_CALLS="$CALLS" ENV_FILE="$T/up.env" HOME="$T" "$OPS/backup-uploads.sh" --dry-run 2>&1)"
eq "--dry-run exits 0" "$?" "0"
eq "and runs no docker" "$(wc -l < "$CALLS" | tr -d ' ')" "0"

echo "cron and logrotate files"
yes "the cron file schedules the uploads backup" grep -q 'backup-uploads.sh' "$OPS/kiwiply-ops.cron"
yes "and the host guard every 5 minutes" grep -q '^\*/5 \* \* \* \* root .*host-guard.sh' "$OPS/kiwiply-ops.cron"
yes "logrotate covers every log the cron file writes" bash -c "for l in \$(grep -o '/var/log/kiwiply-[a-z-]*.log' '$OPS/kiwiply-ops.cron' | sort -u); do grep -q \"\$l\" '$OPS/kiwiply-logrotate.conf' || exit 1; done"
yes "the lifecycle file expires uploads/ after 30 days" bash -c "grep -A4 'uploads-30-days' '$OPS/aws/lifecycle.json' | grep -q '\"Days\": 30'"

finish

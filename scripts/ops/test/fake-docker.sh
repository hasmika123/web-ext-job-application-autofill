#!/usr/bin/env bash
# shellcheck disable=SC2016,SC2012 # fake: single-quoted SQL/shell text on purpose, ls of a flat test dir
# A fake `docker` for binlog.test.sh: just enough of docker compose exec (mysql), docker run (the
# AWS CLI image and the scratch MySQL), docker exec/cp/logs/rm to drive ship-binlogs.sh and
# restore-drill.sh with no daemon, no AWS and no network. Used as DOCKER=.../fake-docker.sh.
#
# Environment (all set by the test):
#   FAKE_CALLS     file: every interesting call is appended here, one line each
#   FAKE_S3        directory standing in for S3: $FAKE_S3/<bucket>/<key>, metadata in <key>.meta
#   FAKE_MYSQL     directory standing in for the live datadir (binlog.000001 ...; the highest is active)
#   FAKE_LOG_BIN   @@log_bin (default 1); FAKE_UUID the server uuid
#   FAKE_PUT_FAIL  =1: every `s3 cp` upload fails
#   FAKE_DUMP_POS  "binlog.000002 157": the position `mysqldump --source-data=2` writes
#   FAKE_TABLES    newline-separated table names the scratch server reports
#   FAKE_REPLAY_FAIL =1: mysqlbinlog fails
set -u

log() { echo "$*" >> "$FAKE_CALLS"; }

fdate() { date -r "$1" '+%Y-%m-%d %H:%M:%S'; }

binlog_payload() { printf '\xfebin payload for %s\n' "$1"; }

case "${1:-}" in
  compose)
    shift
    while [ $# -gt 0 ]; do
      case "$1" in
        --project-directory|--env-file|-f) shift 2 ;;
        *) break ;;
      esac
    done
    [ "${1:-}" = exec ] || { log "compose $*"; exit 0; }
    shift
    [ "${1:-}" = -T ] && shift
    shift # the service name (mysql)
    if [ "${1:-}" = cat ]; then
      log "cat $2"
      cat "$FAKE_MYSQL/$(basename "$2")"
      exit 0
    fi
    # sh -c SCRIPT ARG...
    script="$3"
    shift 3
    case "$script" in
      *mysqldump*)
        log "mysqldump $*"
        printf -- '-- MySQL dump\n'
        case " $* " in
          *" --source-data=2 "*)
            read -r f p <<<"${FAKE_DUMP_POS:-binlog.000001 157}"
            printf -- "-- CHANGE REPLICATION SOURCE TO SOURCE_LOG_FILE='%s', SOURCE_LOG_POS=%s;\n" "$f" "$p" ;;
          *) ;;
        esac
        printf -- 'CREATE TABLE `jhi_user` (id int);\n-- Dump completed on today\n' ;;
      *'-e "SELECT @@log_bin"'*) log "probe log_bin"; echo "${FAKE_LOG_BIN:-1}" ;;
      *'-e "$0"'*)
        q="$1"
        log "sql $q"
        case "$q" in
          "SELECT @@log_bin") echo "${FAKE_LOG_BIN:-1}" ;;
          "SELECT @@server_uuid") echo "${FAKE_UUID:-11111111-2222-3333-4444-555555555555}" ;;
          "SELECT @@log_bin_basename") echo "/var/lib/mysql/binlog" ;;
          "FLUSH BINARY LOGS")
            last="$(ls "$FAKE_MYSQL" | sort | tail -n 1)"
            n=$((10#${last##*.} + 1))
            nf="$(printf 'binlog.%06d' "$n")"
            binlog_payload "$nf" > "$FAKE_MYSQL/$nf" ;;
          "SHOW BINARY LOGS")
            for f in $(ls "$FAKE_MYSQL" | sort); do printf '%s\t%s\tNo\n' "$f" "$(wc -c < "$FAKE_MYSQL/$f")"; done ;;
          PURGE*) ;;
          *) log "unexpected sql: $q"; exit 1 ;;
        esac ;;
      *) log "unexpected compose exec: $script"; exit 1 ;;
    esac
    exit 0 ;;

  run)
    shift
    work=""
    detached=0
    while [ $# -gt 0 ]; do
      case "$1" in
        -v) case "$2" in *:/work) work="${2%:/work}" ;; *) ;; esac; shift 2 ;;
        -d) detached=1; shift ;;
        --name) cname="$2"; shift 2 ;;
        -e|--network|--memory|-w) shift 2 ;;
        --rm|-i) shift ;;
        amazon/aws-cli*) shift; break ;;
        mysql:*) log "run scratch $1 name=${cname:-?} detached=$detached"; exit 0 ;;
        kiwiply-mysqlbinlog:*|fake-tool:*)
          # the mysqlbinlog tool image: `sh -c SCRIPT mysqlbinlog ARGS...`; the tar stream arrives on stdin
          img="$1"; shift 4
          cat > /dev/null
          log "mysqlbinlog $* (image $img)"
          [ "${FAKE_REPLAY_FAIL:-0}" != 1 ] || exit 1
          echo "-- replayed events"
          exit 0 ;;
        *) shift ;;
      esac
    done
    # ---- the AWS CLI ----
    host() { case "$1" in /work/*) printf '%s' "$work/${1#/work/}" ;; /work) printf '%s' "$work" ;; *) printf '%s' "$1" ;; esac; }
    log "aws $*"
    sub="$1 $2"
    case "$sub" in
      "s3 cp")
        src="$3"; dst="$4"
        recursive=0; meta=""
        shift 4
        while [ $# -gt 0 ]; do
          case "$1" in
            --recursive) recursive=1; shift ;;
            --metadata) meta="$2"; shift 2 ;;
            *) shift ;;
          esac
        done
        if [ "${src#s3://}" = "$src" ]; then
          # upload
          [ "${FAKE_PUT_FAIL:-0}" != 1 ] || { echo "upload failed" >&2; exit 1; }
          key="${dst#s3://}"
          mkdir -p "$FAKE_S3/$(dirname "$key")"
          cp "$(host "$src")" "$FAKE_S3/$key"
          [ -z "$meta" ] || echo "$meta" > "$FAKE_S3/$key.meta"
        elif [ "$recursive" = 1 ]; then
          mkdir -p "$(host "$dst")"
          for f in "$FAKE_S3/${src#s3://}"*; do [ -f "$f" ] && case "$f" in *.meta) ;; *) cp "$f" "$(host "$dst")";; esac; done
        else
          cp "$FAKE_S3/${src#s3://}" "$(host "$dst")"
        fi ;;
      "s3 ls")
        url="${3#s3://}"
        case " $* " in
          *" --recursive "*)
            ( cd "$FAKE_S3" && find "$url" -type f ! -name '*.meta' 2>/dev/null | sort ) | while read -r k; do
              printf '%s       100 %s\n' "$(fdate "$FAKE_S3/$k")" "${k#*/}"
            done ;;
          *)
            for f in "$FAKE_S3/$url"*; do
              [ -f "$f" ] || continue
              case "$f" in *.meta) continue ;; *) ;; esac
              printf '%s       100 %s\n' "$(fdate "$f")" "$(basename "$f")"
            done ;;
        esac ;;
      "s3api head-object")
        shift 2
        bucket=""; key=""
        while [ $# -gt 0 ]; do
          case "$1" in --bucket) bucket="$2"; shift 2 ;; --key) key="$2"; shift 2 ;; *) shift ;; esac
        done
        sed -E 's/^sha256=//' "$FAKE_S3/$bucket/$key.meta" ;;
      *) echo "fake aws: unsupported $*" >&2; exit 1 ;;
    esac
    exit 0 ;;

  image) [ "${2:-}" = inspect ] && [ -e "$FAKE_CALLS.built" ]; exit $? ;;
  build) cat > /dev/null; log "build tool image"; touch "$FAKE_CALLS.built"; [ "${FAKE_BUILD_FAIL:-0}" != 1 ]; exit $? ;;
  logs) echo "mysqld: ready for connections. Version: '9.2.0'  socket: '/var/run/mysqld/mysqld.sock'  port: 3306"; exit 0 ;;
  rm) shift; log "rm $*"; exit 0 ;;
  cp) log "cp $(basename "$2") -> ${3##*:}"; exit 0 ;;
  exec)
    shift
    stdin=0
    while [ $# -gt 0 ]; do
      case "$1" in -i) stdin=1; shift ;; -e) shift 2 ;; -*) shift ;; *) break ;; esac
    done
    shift # the container name
    case "${1:-}" in
      mkdir) log "exec mkdir $*"; exit 0 ;;
      cat) echo "-- replayed events"; exit 0 ;;
      sh)
        log "exec mysqlbinlog ${*:5}"
        [ "${FAKE_REPLAY_FAIL:-0}" != 1 ] || exit 1
        exit 0 ;;
      mysql)
        shift
        sqlarg=""
        while [ $# -gt 0 ]; do case "$1" in -e) sqlarg="$2"; shift 2 ;; *) shift ;; esac; done
        input=""
        [ "$stdin" = 0 ] || input="$(cat)"
        if [ -n "$sqlarg" ]; then
          case "$sqlarg" in
            "SELECT 1") echo 1 ;;
            *information_schema.tables*) printf '%s\n' "${FAKE_TABLES:-$(printf 'databasechangelog\njhi_user\njob_application')}" ;;
            *"FROM dossierapi.jhi_user"*) echo "${FAKE_USERS:-2}" ;;
            *"WHERE exectype"*) echo "${FAKE_BAD_CHANGESETS:-0}" ;;
            *"MAX(dateexecuted)"*) echo "2026-10-01 03:00:00" ;;
            *"FROM dossierapi.databasechangelog"*) echo "${FAKE_CHANGESETS:-4}" ;;
            *) log "unexpected scratch sql: $sqlarg"; exit 1 ;;
          esac
        elif printf '%s' "$input" | grep -q 'COUNT(\*)'; then
          printf '%s\n' "$input" | sed -nE "s/^SELECT '([^']+)', COUNT.*/\1\t3/p"
        else
          log "restore $(printf '%s' "$input" | wc -c) bytes"
        fi
        exit 0 ;;
      *) log "unexpected exec: $*"; exit 1 ;;
    esac ;;
  *) log "unexpected docker $*"; exit 1 ;;
esac

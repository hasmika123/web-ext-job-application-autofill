#!/usr/bin/env bash
# Smoke-test a Dossier deployment over the public internet.
# RUN FROM: anywhere with curl + dig (your laptop is ideal — it tests real DNS + TLS).
#
#   ./04-verify.sh kiwiply.com              # verify the live host
#   ./04-verify.sh 203-0-113-5.sslip.io     # verify the staging host
#   EXPECT_IP=203.0.113.5 ./04-verify.sh kiwiply.com   # also assert DNS points at the new box
set -uo pipefail

HOST="${1:?usage: $0 <base-host> [e.g. kiwiply.com]}"
API="api.$HOST"
PASS=0; FAIL=0

ok()   { printf '  \033[1;32mPASS\033[0m  %s\n' "$*"; PASS=$((PASS+1)); }
bad()  { printf '  \033[1;31mFAIL\033[0m  %s\n' "$*"; FAIL=$((FAIL+1)); }
info() { printf '  \033[1;34m··\033[0m    %s\n' "$*"; }
say()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

code() { curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$@"; }

# Resolve an A record with whatever the box has. Git-Bash on Windows ships no `dig`, so fall
# back to nslookup, then to python — otherwise every DNS check silently "fails".
resolve() {
  local h="$1" out=""
  if command -v dig >/dev/null 2>&1; then
    out="$(dig +short "$h" A 2>/dev/null | grep -E '^[0-9.]+$' | tail -1)"
  fi
  if [ -z "$out" ] && command -v nslookup >/dev/null 2>&1; then
    out="$(nslookup "$h" 2>/dev/null | awk '/^Address: /{a=$2} END{print a}')"
  fi
  if [ -z "$out" ] && command -v python >/dev/null 2>&1; then
    out="$(python -c "import socket,sys
try: print(socket.gethostbyname(sys.argv[1]))
except Exception: pass" "$h" 2>/dev/null)"
  fi
  printf '%s' "$out"
}

say "DNS"
for h in "$HOST" "www.$HOST" "$API"; do
  got="$(resolve "$h")"
  if [ -z "$got" ]; then bad "$h does not resolve"; continue; fi
  if [ -n "${EXPECT_IP:-}" ]; then
    [ "$got" = "$EXPECT_IP" ] && ok "$h -> $got" || bad "$h -> $got (expected $EXPECT_IP)"
  else
    ok "$h -> $got"
  fi
done

say "TLS certificates"
for h in "$HOST" "$API"; do
  exp="$(echo | timeout 20 openssl s_client -servername "$h" -connect "$h:443" 2>/dev/null \
        | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)"
  if [ -n "$exp" ]; then ok "$h cert valid until $exp"; else bad "$h — no TLS handshake"; fi
done

say "API"
health="$(curl -s --max-time 20 "https://$API/management/health")"
if echo "$health" | grep -q '"status":"UP"'; then ok "health UP"; else bad "health: ${health:-<no response>}"; fi

say "Web app"
c="$(code "https://$HOST/")";           [ "$c" = 200 ] && ok "GET https://$HOST/ -> 200" || bad "GET https://$HOST/ -> $c"
c="$(code "https://$HOST/privacy")";    [ "$c" = 200 ] && ok "/privacy -> 200"           || bad "/privacy -> $c"

say "Canonical-host redirects (www + app must 301 to the apex)"
for h in "www.$HOST" "app.$HOST"; do
  loc="$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 20 "https://$h/")"
  case "$loc" in
    301*"https://$HOST/"*) ok "$h -> $loc" ;;
    *) bad "$h -> $loc (want 301 https://$HOST/)" ;;
  esac
done

say "Security gate — the public-hash admin/admin seed must be DEAD"
c="$(code -X POST "https://$API/api/authenticate" \
      -H 'Content-Type: application/json' \
      -d '{"username":"admin","password":"admin"}')"
[ "$c" = 401 ] && ok "admin/admin -> 401 (seed removed)" \
                || bad "admin/admin -> $c (EXPECTED 401 — the default seed may be live!)"

say "Extension-facing CORS preflight"
c="$(code -X OPTIONS "https://$API/api/authenticate" \
      -H 'Origin: chrome-extension://abcdefghijklmnopabcdefghijklmnop' \
      -H 'Access-Control-Request-Method: POST')"
case "$c" in 200|204) ok "preflight -> $c" ;; *) bad "preflight -> $c" ;; esac

say "Result: $PASS passed, $FAIL failed"
info "Not covered here (do by hand): signup + activation email, resume upload to S3,"
info "admin sign-in with the real password, and an extension autofill against $API."
[ "$FAIL" -eq 0 ]

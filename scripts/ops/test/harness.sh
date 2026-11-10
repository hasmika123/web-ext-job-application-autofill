# shellcheck shell=bash
# Tiny test harness shared by scripts/ops/test/*.test.sh (sourced, never run). Same helpers as the
# ones inline in ops.test.sh: ok / bad / eq / yes / no, a PASS/FAIL tally and a `finish` that
# prints it and sets the exit code.

PASS=0
FAIL=0
ok()  { PASS=$((PASS + 1)); printf '  ok    %s\n' "$1"; }
bad() { FAIL=$((FAIL + 1)); printf '  FAIL  %s\n' "$1"; }
eq()  { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 - expected [$3], got [$2]"; fi; }
yes() { if "${@:2}"; then ok "$1"; else bad "$1"; fi; }
no()  { if "${@:2}"; then bad "$1"; else ok "$1"; fi; }

finish() {
  echo
  echo "$PASS passed, $FAIL failed"
  [ "$FAIL" = 0 ]
}

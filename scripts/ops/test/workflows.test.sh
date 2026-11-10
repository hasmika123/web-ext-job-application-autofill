#!/usr/bin/env bash
# shellcheck disable=SC2016,SC2126 # patterns are literal text of the YAML ($TAG, $COMPOSE), not expansions
# Static checks on the CI/CD workflows, the monitor definitions and the cron installer
# (REAL-GAPS-C P2.1, P2.5, P2.6, P1.1). Run in CI via ops.test.sh, or by hand:
#   scripts/ops/test/workflows.test.sh
# Nothing here runs a workflow, contacts GitHub or touches Docker.
set -uo pipefail

OPS="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$OPS/../.." && pwd)"
# shellcheck source=scripts/ops/test/harness.sh
. "$OPS/test/harness.sh"

WF="$REPO/.github/workflows"
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT

# Normalise line endings once: a Windows checkout may hold CRLF in the YAML.
for f in ci deploy publish-extension; do tr -d '\r' < "$WF/$f.yml" > "$T/$f.yml"; done

echo "CI hardening (P2.6)"
for f in ci deploy publish-extension; do
  yes "$f.yml has top-level least-privilege permissions" grep -qE '^permissions:' "$T/$f.yml"
  eq "$f.yml: every action is pinned by a full commit sha with its version in a comment" \
    "$(grep -E '^\s*(- )?uses:' "$T/$f.yml" | grep -vE '@[0-9a-f]{40} # v[0-9][0-9.]*$' | grep -vE 'uses: \./' | wc -l | tr -d ' ')" "0"
  no "$f.yml: no write-all, no broad token scopes" grep -qE 'write-all|contents: write|id-token: write|pull-requests: write' "$T/$f.yml"
done
eq "the only write permission anywhere is packages: write, in the image build job" \
  "$(grep -hE ': write' "$T"/*.yml | sed 's/^ *//' | sort -u | tr '\n' ' ')" "packages: write "
yes "dependabot keeps the pinned shas current" grep -q 'package-ecosystem: "github-actions"' "$REPO/.github/dependabot.yml"

echo "deploy.yml (P2.1)"
D="$T/deploy.yml"
line_of() { grep -n -m1 -- "$1" "$2" | cut -d: -f1; }
yes "runs only on main pushes and manual dispatch" bash -c "grep -A3 '^on:' '$D' | grep -q 'branches: \[main\]' && grep -q 'workflow_dispatch' '$D'"
yes "deploys are serialised and never cancelled mid-flight" bash -c "grep -A3 '^concurrency:' '$D' | grep -q 'group: deploy-main' && grep -A3 '^concurrency:' '$D' | grep -q 'cancel-in-progress: false'"
eq "both images are tagged with the commit sha" "$(grep -cE 'dossier-(api|web):\$\{\{ github.sha \}\}' "$D")" "2"
eq "and still with latest" "$(grep -cE 'dossier-(api|web):latest' "$D")" "2"
yes "the remote step runs scripts/ops/deploy.sh with the explicit tag" grep -q 'bash scripts/ops/deploy.sh --tag "\$TAG"' "$D"
no "no raw compose command is left in the workflow" grep -qE '^\s*(\$COMPOSE|docker compose)' "$D"
no "and no deploy of latest" grep -qE '^\s+bash scripts/ops/deploy.sh.*latest' "$D"
PULL="$(line_of 'git pull --ff-only' "$D")"; DRY="$(line_of 'deploy.sh --dry-run' "$D")"; REAL="$(line_of 'bash scripts/ops/deploy.sh --tag "\$TAG" ;;$' "$D")"
yes "the box pulls the repo (so deploy.sh is the repo's copy) before it runs it" test "$PULL" -lt "$DRY"
yes "a dry run of the plan precedes the real deploy" test "$DRY" -lt "$REAL"
yes "workflow_dispatch has a rollback_tag input" grep -q 'rollback_tag:' "$D"
yes "rollback 'previous' maps to deploy.sh --rollback" grep -q 'bash scripts/ops/deploy.sh --rollback' "$D"
yes "the image build is skipped for a rollback" grep -q "if: \${{ inputs.rollback_tag == '' }}" "$D"
yes "the deploy job still runs when the build was skipped, but not when it failed" grep -q '!cancelled() && !failure()' "$D"
yes "still gated by DEPLOY_ENABLED" grep -q "vars.DEPLOY_ENABLED == 'true'" "$D"
yes "the tag is validated on the runner before it reaches a remote shell" grep -qF '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$' "$D"
yes "the existing secrets are used unchanged" bash -c "grep -q 'secrets.VPS_HOST' '$D' && grep -q 'secrets.VPS_USER' '$D' && grep -q 'secrets.VPS_SSH_KEY' '$D'"
yes "DEPLOY_PATH variable kept" grep -q 'vars.DEPLOY_PATH' "$D"
no "no secret is echoed" grep -qE 'echo .*secrets\.' "$D"
yes "ci.yml checks every ops script parses (bash -n)" grep -qF 'bash -n "$f"' "$T/ci.yml"
yes "ci.yml runs deploy.sh --dry-run" grep -q 'scripts/ops/deploy.sh --dry-run' "$T/ci.yml"

echo "deploy.sh itself"
yes "deploy.sh is executable in git" bash -c "git -C '$REPO' ls-files -s scripts/ops/deploy.sh | grep -q '^100755'"
yes "deploy.sh never deploys the shared-edge-less file set" grep -q 'docker-compose.shared-edge.yml' "$OPS/lib.sh"

echo "monitors (P1.1)"
J="$REPO/docs/ops/monitors.json"
if command -v node >/dev/null 2>&1; then
  yes "monitors.json is valid JSON" node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))" "$J"
  # Every Healthchecks check names an env variable that its script really reads, and a script that exists.
  MISSING="$(node -e "
    const j = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'));
    const fs = require('fs'); const path = require('path');
    const root = process.argv[2];
    const bad = [];
    for (const c of j.healthchecks.checks) {
      const p = path.join(root, c.script);
      if (!fs.existsSync(p)) { bad.push(c.name + ': no ' + c.script); continue; }
      const src = fs.readFileSync(p, 'utf8') + fs.readFileSync(path.join(root, 'scripts/ops/lib.sh'), 'utf8');
      if (!src.includes(c.env)) bad.push(c.name + ': ' + c.script + ' never reads ' + c.env);
    }
    process.stdout.write(bad.join('; '));
  " "$J" "$REPO")"
  eq "every check's env variable is read by its script" "$MISSING" ""
  eq "the monitors cover apex, api health, backup, binlog, host/disk" \
    "$(node -e "
      const j = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'));
      const n = [...j.uptimerobot.monitors, ...j.healthchecks.checks].map(x => x.name);
      for (const need of ['kiwiply-apex','kiwiply-api-health','kiwiply-backup','kiwiply-binlog','kiwiply-host']) if (!n.includes(need)) process.stdout.write('missing ' + need + ' ');
    " "$J")" ""
  yes "the API health monitor keys on status UP" node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const m=j.uptimerobot.monitors.find(x=>x.name==="kiwiply-api-health");process.exit(m.keyword==="\"status\":\"UP\""?0:1)' "$J"
else
  ok "node not installed: monitors.json checks skipped"
fi
no "no ping URL is committed" grep -rqE 'hc-ping\.com/[0-9a-f]{8}-' "$REPO/docs/ops" "$REPO/scripts/ops"
yes "the cron file feeds every script the monitors name" bash -c "for s in backup-db backup-uploads ship-binlogs host-guard verify-restore restore-drill; do grep -q \"scripts/ops/\$s.sh\" '$OPS/kiwiply-ops.cron' || exit 1; done"

echo "install-cron.sh (P2.5)"
mkdir -p "$T/etc/cron.d" "$T/etc/logrotate.d" "$T/var/log"
SCHED='^[0-9*/,-]+ [0-9*/,-]+ [0-9*/,-]+ [0-9*/,-]+ [0-9*/,-]+'
export CRON_DEST="$T/etc/cron.d/kiwiply-ops" LOGROTATE_DEST="$T/etc/logrotate.d/kiwiply" LOG_DIR="$T/var/log"
OUT="$("$OPS/install-cron.sh" --dry-run --no-checks --user kiwiply-deploy --repo /home/kiwiply-deploy/web-ext-job-application-autofill 2>&1)"
RC=$?
eq "dry run exits 0" "$RC" "0"
eq "and puts the deploy user on every schedule line" "$(grep -cE "$SCHED kiwiply-deploy " <<<"$OUT")" "$(grep -cE "$SCHED " <<<"$OUT")"
yes "with at least the backup, binlog, drill and guard lines" test "$(grep -cE "$SCHED kiwiply-deploy " <<<"$OUT")" -ge 6
eq "dry run writes nothing" "$(find "$T/etc" -type f | wc -l | tr -d ' ')" "0"
# A real run needs a user we may chown to: ourselves, or nobody when we are root.
if [ "$(id -u)" = 0 ]; then AS=nobody; else AS="$(id -un)"; fi
"$OPS/install-cron.sh" --no-checks --user "$AS" --repo /srv/kiwiply/web-ext-job-application-autofill >/dev/null 2>&1
RC=$?
eq "a real run exits 0" "$RC" "0"
yes "and writes the cron file" test -s "$CRON_DEST"
eq "every schedule line runs as that user" "$(grep -cE "$SCHED $AS " "$CRON_DEST")" "$(grep -cE "$SCHED " "$CRON_DEST")"
yes "REPO points at the new checkout" grep -qx 'REPO=/srv/kiwiply/web-ext-job-application-autofill' "$CRON_DEST"
no "no carriage returns" grep -q $'\r' "$CRON_DEST"
yes "logrotate recreates logs as that user" grep -q "create 0640 $AS $AS" "$LOGROTATE_DEST"
yes "every ops log exists, owned by the user" test -f "$T/var/log/kiwiply-binlog.log"
no "a user name with a space is refused" "$OPS/install-cron.sh" --dry-run --no-checks --user 'a b' --repo /x
no "a --repo with odd characters is refused" "$OPS/install-cron.sh" --dry-run --no-checks --repo '/x;rm -rf /'
yes "install-cron.sh is executable in git" bash -c "git -C '$REPO' ls-files -s scripts/ops/install-cron.sh | grep -q '^100755'"

finish

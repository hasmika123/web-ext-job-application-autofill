# Moving the deploy off root: the `kiwiply-deploy` user (REAL-GAPS-C P2.5)

**For you to run on the box, one step at a time. Nothing in a deploy does this for you, and nothing here is run by an assistant.**
Production keeps running throughout: the old root path stays in place and working until phase D, and phases A and B change
nothing the live stack depends on.

## Why, and what it does not do

Today CI logs in as **root** (`VPS_USER=root`), the checkout and the `.env` (every secret) live under `/root`, and every ops
cron job runs as root. A leaked CI key is a root login on a box shared with BeeCompete.

After this: CI logs in as `kiwiply-deploy`, which owns its own checkout, key and cron jobs, has no password and no `sudo`, and
whose key may not forward ports or agents. **Be honest about the limit:** membership of the `docker` group is still
root-equivalent on the host (it can start a container that mounts `/`). What you gain is that the CI key is no longer a root
login, no root-owned secrets directory is writable by the pipeline, the key can be rotated without touching anything else,
and logs show who did what. Rootless Docker would close the rest but is not practical on a box that shares the daemon with
BeeCompete. Do **not** reuse BeeCompete's `deploy` user: it is their identity, and sharing it widens the blast radius to their stack.

Names used below (change them in one place if you like): user `kiwiply-deploy`, old checkout
`/root/web-ext-job-application-autofill`, new checkout `/home/kiwiply-deploy/web-ext-job-application-autofill`. The compose
project is named `dossier` inside the compose files (`name: dossier`), so containers and volumes (`dossier_mysql-data`,
`dossier_uploads`) are adopted by the new checkout, not recreated empty. Check that in A1 before you go on.

## Phase A: prepare (production untouched)

**A1. Look first, and write down what you see** (as root, in the old checkout):

```bash
cd /root/web-ext-job-application-autofill
git status --short; git rev-parse HEAD; git remote -v        # clean, on main, note how the remote authenticates
COMPOSE="docker compose -f docker-compose.prod.yml -f docker-compose.shared-edge.yml"   # ALWAYS the overlay
$COMPOSE ps                                                  # api, web, mysql up
docker volume ls | grep dossier                              # dossier_mysql-data and dossier_uploads exist
cat ~/kiwiply-deploy/current.env                             # the tags deploy.sh recorded
ls ~/kiwiply-backups | tail -n 5
```

**A2. Create the user.** No password, no sudo, only the docker group:

```bash
adduser --disabled-password --gecos "" kiwiply-deploy
passwd -l kiwiply-deploy
usermod -aG docker kiwiply-deploy
id kiwiply-deploy                                            # groups include docker, not sudo
```

**A3. A new SSH key for CI.** On your laptop (Git Bash on Windows; never reuse the old `dossier_deploy` key):

```bash
ssh-keygen -t ed25519 -f ~/.ssh/kiwiply_deploy_ci -C "kiwiply-deploy CI" -N ""
cat ~/.ssh/kiwiply_deploy_ci.pub                             # one line: ssh-ed25519 AAAA... kiwiply-deploy CI
```

On the box, install the public line with restrictions (paste it in place of `PASTE-THE-PUBLIC-LINE`):

```bash
install -d -m 700 -o kiwiply-deploy -g kiwiply-deploy /home/kiwiply-deploy/.ssh
printf '%s\n' 'no-port-forwarding,no-agent-forwarding,no-X11-forwarding PASTE-THE-PUBLIC-LINE' \
  > /home/kiwiply-deploy/.ssh/authorized_keys
chown kiwiply-deploy:kiwiply-deploy /home/kiwiply-deploy/.ssh/authorized_keys
chmod 600 /home/kiwiply-deploy/.ssh/authorized_keys
```

Test it from the laptop with the **right key** (fail2ban bans your IP after a few failures, DEPLOY.md section 7.3):

```bash
ssh -i ~/.ssh/kiwiply_deploy_ci kiwiply-deploy@74.208.212.158 'id && docker ps --format "{{.Names}}" | head -n 5'
```

**A4. The checkout, with the `.env`.** Copy rather than clone: it keeps the remote, branch and the `.env`.

```bash
cp -a /root/web-ext-job-application-autofill /home/kiwiply-deploy/
chown -R kiwiply-deploy:kiwiply-deploy /home/kiwiply-deploy/web-ext-job-application-autofill
chmod 600 /home/kiwiply-deploy/web-ext-job-application-autofill/.env
sudo -u kiwiply-deploy -H git -C /home/kiwiply-deploy/web-ext-job-application-autofill pull --ff-only
```

If that last `pull` fails with an authentication error, the remote was using something only root has (a token in the URL or
`/root/.ssh`). Give the new user its own **read-only deploy key**:

```bash
sudo -u kiwiply-deploy -H ssh-keygen -t ed25519 -f /home/kiwiply-deploy/.ssh/github_read -N "" -C "kiwiply-deploy read-only"
cat /home/kiwiply-deploy/.ssh/github_read.pub          # GitHub -> the repo -> Settings -> Deploy keys -> Add (leave "write" OFF)
printf 'Host github.com\n  IdentityFile ~/.ssh/github_read\n  IdentitiesOnly yes\n' | sudo -u kiwiply-deploy tee -a /home/kiwiply-deploy/.ssh/config >/dev/null
sudo -u kiwiply-deploy chmod 600 /home/kiwiply-deploy/.ssh/config
sudo -u kiwiply-deploy -H git -C /home/kiwiply-deploy/web-ext-job-application-autofill remote set-url origin git@github.com:<owner>/<repo>.git
sudo -u kiwiply-deploy -H ssh -o StrictHostKeyChecking=accept-new -T git@github.com    # "Hi <repo>!" then
sudo -u kiwiply-deploy -H git -C /home/kiwiply-deploy/web-ext-job-application-autofill pull --ff-only
```

(`<owner>/<repo>` is what `git remote -v` showed in A1.)

**A5. The state the scripts keep in the user's home** (the recorded deploy tags, the local dumps, the drill log):

```bash
cp -a /root/kiwiply-deploy /home/kiwiply-deploy/ 2>/dev/null || true
cp -a /root/kiwiply-backups /home/kiwiply-deploy/ 2>/dev/null || true
rm -rf /home/kiwiply-deploy/kiwiply-deploy/lock
chown -R kiwiply-deploy:kiwiply-deploy /home/kiwiply-deploy/kiwiply-deploy /home/kiwiply-deploy/kiwiply-backups 2>/dev/null || true
```

Skipping this is safe: `deploy.sh` then treats the next deploy as a first run and tags the running images `pre-<time>`.

**A6. Prove the new user sees the same stack, and every script plans correctly. All dry runs or read-only:**

```bash
sudo -u kiwiply-deploy -H bash -c '
  set -e
  cd ~/web-ext-job-application-autofill
  docker compose -f docker-compose.prod.yml -f docker-compose.shared-edge.yml ps      # the SAME api/web/mysql, "running"
  scripts/ops/deploy.sh --dry-run
  scripts/ops/backup-db.sh --dry-run
  scripts/ops/ship-binlogs.sh --dry-run
  scripts/ops/host-guard.sh --dry-run
  scripts/ops/restore-drill.sh --dry-run
'
```

If `ps` shows nothing, **stop**: the project name or directory is not matching; do not run `up`. Nothing has changed yet.

## Phase B: move the cron jobs

From the **new** checkout, as root (`install-cron.sh` refuses a user that is not in the docker group or an `.env` the user does not own):

```bash
cd /home/kiwiply-deploy/web-ext-job-application-autofill
scripts/ops/install-cron.sh --dry-run --user kiwiply-deploy --repo /home/kiwiply-deploy/web-ext-job-application-autofill
scripts/ops/install-cron.sh           --user kiwiply-deploy --repo /home/kiwiply-deploy/web-ext-job-application-autofill
ls -l /etc/cron.d/kiwiply-ops /var/log/kiwiply-*.log
```

This rewrites `/etc/cron.d/kiwiply-ops` (one file, so the root jobs are replaced, not doubled), `/etc/logrotate.d/kiwiply`
(logs are re-created as the new user) and creates the log files owned by `kiwiply-deploy`. It touches nothing of BeeCompete's.
Within ten minutes check `tail /var/log/kiwiply-host-guard.log` and that the `kiwiply-host` Healthchecks check is green.
First nightly run: next morning, `tail /var/log/kiwiply-backup.log` and the Healthchecks `kiwiply-backup` check.

## Phase C: switch CI

Keep the old values for a way back: `VPS_USER=root`, the old private key, `DEPLOY_PATH=/root/web-ext-job-application-autofill`.

```bash
# Git Bash, repo directory:
gh secret set VPS_USER --body kiwiply-deploy
gh secret set VPS_SSH_KEY < ~/.ssh/kiwiply_deploy_ci
```

```powershell
# PowerShell (Git Bash would rewrite the path value into C:/Program Files/Git/...):
gh variable set DEPLOY_PATH --body "/home/kiwiply-deploy/web-ext-job-application-autofill"
```

Prove it with a harmless redeploy of the version that is already running, at a quiet time (the api and web containers restart
briefly, as in any deploy: their build path changed): Actions -> **Deploy** -> *Run workflow* -> `rollback_tag` = the full sha
in `~/kiwiply-deploy/current.env` (`API_TAG=`). It runs `git pull`, a `deploy.sh --dry-run`, then the real `deploy.sh` as the new user,
with the snapshot, health checks and rollback. Green run + `sign in works` = done.

## Phase D: retire root's path (after a week of green deploys and backups)

1. Remove the **old CI public key** from `/root/.ssh/authorized_keys` (the line commented for the old `dossier_deploy` key;
   find it with `ssh-keygen -lf /root/.ssh/authorized_keys` if the comment is gone). Keep a copy of the file first:
   `cp /root/.ssh/authorized_keys /root/authorized_keys.bak`. Your own admin access is untouched.
2. Move the old copies aside, then delete them a week later:
   `mv /root/web-ext-job-application-autofill /root/OLD-checkout-delete-after-2026-xx-xx`, likewise `/root/kiwiply-deploy` and
   `/root/kiwiply-backups`; then `shred -u` the old `.env` and `rm -rf` the rest. Keep the `.env` in the password manager (CLAUDE.md).
3. Update DEPLOY.md section 7.1's table (`VPS_USER`, `DEPLOY_PATH`) and `scripts/ops/kiwiply-ops.cron`'s `REPO` comment if you
   want the repo to say what is live.
4. Optional, and a decision for whoever administers the whole box (it is shared): `PermitRootLogin no` in sshd.

## Going back (any time before phase D)

```bash
gh secret set VPS_USER --body root
gh secret set VPS_SSH_KEY < ~/.ssh/dossier_deploy          # the old key
cd /root/web-ext-job-application-autofill && scripts/ops/install-cron.sh      # the jobs run as root again
```

```powershell
gh variable set DEPLOY_PATH --body "/root/web-ext-job-application-autofill"
```

The new user and its copy can stay unused, or go: `userdel -r kiwiply-deploy` (after `docker ps` shows nothing of it running).

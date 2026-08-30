# Migrating Dossier production to a new server

Moving the live stack (**https://kiwiply.com**) from the current IONOS VPS to a new host,
keeping the same domain.

> ### ⚠️ Current situation (2026-08-30)
> The old VPS `132.148.79.209` is **gone** — no ping, no 22/80/443 — and there is no off-box
> database dump. So the data-migration path (§3–§5) **cannot run**, and production is being
> **rebuilt empty**. Jump to [§9.1 Rebuilding from nothing](#91-rebuilding-from-nothing),
> then come back for §6 (DNS) and §7 (CI).
>
> §1–§8 below describe the full migration for the next time there *is* a live box to move.

> **The good news: no code changes.** Nothing in the repo hardcodes the server — the host is
> entirely driven by `SSLIP_HOST` in the `.env` file that lives *on the box* (gitignored).
> Grepping the tree for the old IP returns nothing. So this is purely an infrastructure
> operation: stand up the new box, move the database, repoint DNS, retarget CI.
>
> **The extension needs no release either.** It talks to `https://api.kiwiply.com`, which is
> unchanged — it follows DNS to the new box automatically.

**What actually moves:**

| Thing | How it moves |
|---|---|
| MySQL data (users, applications, field cache, AI cache) | `mysqldump` → restore (§3, §5) |
| Secrets (`.env`) | copied **verbatim** from the old box (§3) |
| Resume files | **nothing to do** — they're in AWS S3, off-box. Same bucket, same keys. |
| TLS certificates | **nothing to do** — Caddy re-issues from Let's Encrypt on the new box. |
| Container images | pulled from GHCR, already built by CI. |
| DNS | Cloudflare A-records repointed (§6) |
| CI/CD | GitHub `VPS_HOST` secret + a deploy key on the new box (§7) |

Scripts for each step live in [`scripts/migrate/`](scripts/migrate/).

---

## 0. Before you start

- [ ] **The old box is reachable.** Everything in §3–§4 depends on being able to SSH in and dump
      the database. If it isn't, go to [§9 — when the old box is gone](#9-contingency-when-the-old-box-is-unreachable) first.
- [ ] **New host meets the bar:** public static IP, ports 80+443 open to the internet
      *(remember: the hosting-panel firewall is separate from `ufw`)*, and Ubuntu 22.04/24.04.
      The old box runs 20.04, which is EOL — don't reproduce that.
- [ ] **You can SSH in** to the new host as a sudo-capable non-root user.
- [ ] **Lower the DNS TTL now.** In Cloudflare, set the A-records for `kiwiply.com`, `www`, and
      `api` to a **60-second** TTL and let the old TTL expire *before* cutover day. This is what
      keeps the switch in §6 fast, and what makes rollback quick. Records stay
      **grey-cloud / DNS-only** — Caddy needs the origin reachable for its ACME challenge.
- [ ] **Pause auto-deploy.** A merge to `main` mid-migration would deploy to the *old* box and
      confuse the picture. GitHub → Settings → Secrets and variables → Actions → Variables:
      set `DEPLOY_ENABLED` = `false` until §7.

---

## 1. Provision the new host

On the **new** box:

```bash
git clone https://github.com/hasmika123/web-ext-job-application-autofill.git
cd web-ext-job-application-autofill && ./scripts/migrate/01-provision-new-host.sh
```

Installs Docker + Compose from the official apt repo, puts you in the `docker` group, opens
22/80/443 in `ufw`, and — importantly — **frees port 80**. A preinstalled web server squatting
on `:80` blocked Caddy on the old box; the script detects and disables that.

**Log out and back in** afterwards so the `docker` group membership takes effect.

---

## 2. Rehearse the move (recommended, zero user impact)

Do the whole thing once on a throwaway hostname before touching the live domain. Take a **hot**
dump (§3 without `FINAL=1`), restore it (§5 in `stage` mode), and verify (§5.1). The site stays
up the entire time and `kiwiply.com` DNS is never touched.

Staging uses **sslip.io**: `<dashed-ip>.sslip.io` resolves to your IP with no DNS setup, so Caddy
gets real Let's Encrypt certs and you exercise the true HTTPS path. It also keeps you from
burning Let's Encrypt's *duplicate certificate* rate limit (5 per week) on `kiwiply.com` while
iterating.

---

## 3. Snapshot the old box

On the **old** box, in the repo checkout:

```bash
./scripts/migrate/02-dump-old.sh
```

```bash
FINAL=1 ./scripts/migrate/02-dump-old.sh
```

The first is the rehearsal (hot dump, app keeps serving). The second is the cutover dump — it
stops `api` + `web` first so no writes land after the snapshot.

It writes `dossier-migration-<timestamp>/` containing the gzipped dump, a **verbatim copy of
`.env`**, and a `MANIFEST.txt` with checksums and per-table row counts to check the restore
against. It refuses to continue if the dump came out truncated.

> **Copy `.env`; never retype it.** The bcrypt `ADMIN_PASSWORD_HASH` has every `$` doubled to
> `$$` for Docker Compose interpolation. Regenerating or hand-copying it is the single most
> likely way to lock yourself out of the admin account.

> **`FINAL=1` takes the site down** — that's the point, so no writes are lost. Only run it when
> you're ready to finish the cutover in one sitting.

---

## 4. Move the snapshot

```bash
scp -r <olduser>@<oldip>:~/web-ext-job-application-autofill/dossier-migration-* .
```

```bash
scp -r dossier-migration-* <newuser>@<newip>:~/
```

Confirm the `sha256` on the new box matches `MANIFEST.txt`. The snapshot holds **live secrets**
(DB password, JWT signing secret, S3 keys, SMTP credentials, AI key) — delete the laptop copy
once the migration is done.

---

## 5. Restore onto the new box

On the **new** box, in the repo checkout:

```bash
./scripts/migrate/03-restore-new.sh ~/dossier-migration-<timestamp>
```

```bash
HOST_MODE=live ./scripts/migrate/03-restore-new.sh ~/dossier-migration-<timestamp>
```

The first stages on the sslip.io hostname; the second is the real cutover on `kiwiply.com`.

The script installs the `.env`, points it at the staging or live hostname, pulls the GHCR
images, waits for MySQL to go healthy, **stops the API while importing** (so Liquibase can't
race the load), restores, restarts the API to apply any migrations newer than the dump, and
diffs row counts against the old box.

### 5.1 Verify

From your laptop — this tests real DNS and TLS, not just localhost:

```bash
./scripts/migrate/04-verify.sh <the-host-you-just-brought-up>
```

Checks DNS, certificates, API health, the web app, the `www`/`app` → apex redirects, the
extension CORS preflight, and asserts the removed `admin`/`admin` seed still returns **401**.

Then by hand, because these touch real external services the script can't safely exercise:

- [ ] Sign up with a real inbox → activation email arrives → `/account/activate` → sign in.
      *(Sign in with the **username**, not the email — a recurring stumble.)*
- [ ] Upload a resume and re-download it — proves the S3 keys came across intact.
- [ ] Sign in as the real admin with the env password — proves the `$$` escaping survived.
- [ ] Trigger an extension autofill against `api.kiwiply.com`.

---

## 6. Cutover

Once §5 passes on staging:

1. `FINAL=1 ./scripts/migrate/02-dump-old.sh` on the old box — **the site goes down here.**
2. Move the snapshot (§4).
3. `HOST_MODE=live ./scripts/migrate/03-restore-new.sh <snapshot>` on the new box.
   Caddy will fail its ACME retries for a moment — expected, DNS still points at the old box.
4. **Repoint Cloudflare** A-records `kiwiply.com`, `www`, `api` → the new IP. Keep them
   **grey-cloud / DNS-only**.
5. Watch propagation, then nudge Caddy to retry issuance immediately:

```bash
docker compose -f docker-compose.prod.yml up -d --force-recreate caddy
```

6. `EXPECT_IP=<new-ip> ./scripts/migrate/04-verify.sh kiwiply.com`

**Rollback** — good until you delete the old box's data: repoint the Cloudflare records back to
the old IP and run `docker compose -f docker-compose.prod.yml up -d` there. That is what the
60-second TTL buys you.

---

## 7. Retarget CI/CD

`deploy.yml` SSHes into whatever `VPS_HOST` says, so it still points at the old box.

1. On the new box, install the deploy key:

```bash
ssh-copy-id -i dossier_deploy.pub <newuser>@<newip>
```

   Reuse the existing key, or generate a fresh one with
   `ssh-keygen -t ed25519 -f dossier_deploy -N ""`.
2. Confirm the checkout is on `main` and `docker` works **without sudo** — CI cannot answer a
   sudo prompt.
3. GitHub → Settings → Secrets and variables → Actions:
   - `VPS_HOST` = the **new** IP
   - `VPS_USER` = the new deploy user *(the old box used `adhya`)*
   - `VPS_SSH_KEY` = the **private** key, if you generated a new one
4. Set the `DEPLOY_ENABLED` variable back to `true`.
5. Actions → **Deploy** → *Run workflow* to prove the pipeline reaches the new box end to end.

---

## 8. After the dust settles

- [ ] Re-point the nightly `mysqldump` backup cron at the new box (DEPLOY.md §5) and confirm one
      backup actually lands off-box. **This migration is a good moment to notice whether that
      cron was ever set up.**
- [ ] Leave the old VPS **powered off but intact** for about a week as the rollback of last
      resort. Only then destroy it — and drop its key from `~/.ssh/known_hosts`.
- [ ] Raise the Cloudflare TTLs back to Auto.
- [ ] Update the `live-deployment` note with the new IP and provider.
- [ ] Unchanged, and worth confirming you *didn't* touch: the S3 bucket, the Brevo sender and
      its DNS auth records, the Google OAuth client, and the published extension.

---

## 9. Contingency: when the old box is unreachable

If the old server does not answer SSH, the dump in §3 is impossible and **§3–§4 cannot run**.
Confirm it's really the host and not your network by testing a machine you know is up:

```bash
for p in 22 80 443; do timeout 8 bash -c "cat < /dev/null > /dev/tcp/<oldip>/$p" 2>/dev/null && echo "port $p OPEN" || echo "port $p no response"; done
```

No response on every port, plus no ping, means the host is off, suspended, or destroyed — not a
crashed container.

**Recovery options, best first:**

1. **Bring it back.** In the hosting control panel, check whether the VPS is stopped, suspended
   for billing, or snapshot-recoverable. Powering it back on restores the full §3 path. If the
   provider keeps automatic snapshots, restoring one to a new instance gets the database back
   even if the original is gone.
2. **Restore from a backup.** If the nightly `mysqldump` from DEPLOY.md §5 was running and
   copied off-box, that file substitutes directly for `dossier-db.sql.gz` in §5.
3. **Rebuild empty** — §9.1 below.

### 9.1 Rebuilding from nothing

> **Status for this project (2026-08-30): this is the live path.** The old VPS is gone and no
> off-box dump exists, so production is being rebuilt with an empty database.

**Do not count on GitHub Actions secrets as your credential backup.** They are **write-only by
design** — the UI and API expose only names, never values, so a secret stored there cannot be
read back, only overwritten. In this repo they also never held the app config in the first
place; `.env` lived solely on the server. What is actually in the repo's secrets is
`GA_MEASUREMENT_ID`, `GA_API_SECRET`, `VPS_HOST`, `VPS_USER`, and `VPS_SSH_KEY` — CI plumbing,
not application secrets.

What survives the server, and what doesn't:

| Survives | Must be reissued |
|---|---|
| The S3 **bucket and every resume file in it** | The IAM **access keys** (mint a new pair for the same bucket) |
| The domain, DNS, and Brevo domain authentication | The Brevo **SMTP key** |
| The Google OAuth **client id** (public, in compose) | The **Gemini API key** |
| The GHCR images (CI rebuilds them anyway) | `JWT_BASE64_SECRET`, `MYSQL_ROOT_PASSWORD`, `ADMIN_PASSWORD_HASH` (generate fresh) |

Accounts, applications, the field cache, and the AI answer cache **start empty**. Resume files
remain in the bucket but are orphaned — nothing in the new database points at them, so they are
dead weight you can audit and delete later.

Build the new `.env` with:

```bash
./scripts/migrate/05-bootstrap-env.sh
```

It generates the DB password, JWT secret, and admin bcrypt hash, prompts for the credentials
only you can supply, and — importantly — **doubles every `$` to `$$`** across all values, not
just the bcrypt hash, because Compose interpolates `$` in any `.env` value.

**Order matters, and it is simpler here than in a live migration.** Because the old box is
already down, there is no traffic to protect — so **repoint DNS to the new IP first**, then
launch. Caddy then gets its certificates on the first request instead of retrying failed ACME
challenges while DNS still points elsewhere. There is no need to stage on sslip.io either;
that step exists to avoid disrupting a *running* production.

1. Provision the new host (§1).
2. Repoint the Cloudflare A-records — `kiwiply.com`, `www`, `api` → new IP, grey-cloud (§6).
3. `./scripts/migrate/05-bootstrap-env.sh` with `SSLIP_HOST=kiwiply.com`.
4. Launch: `docker compose -f docker-compose.prod.yml pull && … up -d` (DEPLOY.md §3).
5. Verify: `./scripts/migrate/04-verify.sh kiwiply.com` (§5.1).
6. Retarget CI (§7).

> A fresh `JWT_BASE64_SECRET` invalidates every existing session and extension token — all
> users, and every connected extension, must sign in again. With an empty user table that is
> moot, but it is the reason you cannot mix a new secret with a restored database.

> **Back the new `.env` up somewhere you can read it back from** — a password manager. That is
> the gap that turned a server loss into a data loss.

# Deploying Dossier (self-hosted VPS)

> **Current production:** live at **https://kiwiply.com** (apex canonical; `www`/`app` 301 to it;
> API at `api.kiwiply.com`), deployed automatically by CI on merge to `main` (§7).
>
> ⚠️ **Production is CO-HOSTED with BeeCompete on one box, behind a shared edge Caddy that owns
> :80/:443.** The Caddy service in `docker-compose.prod.yml` therefore **does not run there** —
> deploys must pass the overlay, `-f docker-compose.prod.yml -f docker-compose.shared-edge.yml`,
> and the public routes live in `~/beecompete-edge/Caddyfile`, outside this repo. See
> **`MIGRATION.md` §10** before changing anything about the proxy or the ports.
>
> The from-scratch steps below describe a **single-tenant** host, which production no longer is.
> They stay accurate for a fresh box: they use **sslip.io** as the no-domain bootstrap; for a
> real domain, set `SSLIP_HOST` to it and point DNS at the IP (see §6).

> **Moving to a different server?** See `MIGRATION.md` — it covers the data migration,
> DNS cutover, and CI retarget that this from-scratch guide does not.

The whole stack runs as Docker containers on one host: **MySQL + API + web**, behind
**Caddy** (auto-HTTPS via Let's Encrypt). With no domain, **sslip.io** gives real certificates
on the bare IP; with a domain, Caddy serves it directly. Object storage is **AWS S3** (private bucket).

```
browser ──https──> Caddy ─┬─> web  (Next.js :3000) ──internal──> api (Spring :8080) ──> MySQL
extension ─https─> Caddy ─┘                                          └──> AWS S3 (resume files)
```

## 0. Prerequisites
- A Linux VPS with a **public static IP** and **ports 80 + 443 open** to the internet.
- **Docker + Docker Compose** installed:
  ```bash
  curl -fsSL https://get.docker.com | sh
  ```
- This repo on the box (`git clone …`).

## 1. AWS S3 (private bucket)
1. Create a **private** bucket (e.g. `dossier-resumes`) in your region (e.g. `us-east-1`).
   Leave "Block all public access" ON — downloads are proxied through the API.
2. Create an IAM user with programmatic keys and this least-privilege policy (replace the
   bucket name):
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Effect": "Allow",
       "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
       "Resource": "arn:aws:s3:::dossier-resumes/*"
     }]
   }
   ```
3. Keep the access key / secret for the `.env` below.

## 2. Configure secrets
```bash
cp .env.example .env
openssl rand -base64 64        # paste into JWT_BASE64_SECRET
```
Edit `.env` and set every value. For `SSLIP_HOST`, take your public IP and replace dots
with dashes: IP `203.0.113.5` → `SSLIP_HOST=203-0-113-5.sslip.io`. The app will then be at
`https://app.203-0-113-5.sslip.io` and the API at `https://api.203-0-113-5.sslip.io`.

### 2.1 Admin account (Phase 9.A0 — security gate)
The default `admin`/`admin` (and `user`/`user`) seed accounts — which shipped with JHipster's
*publicly known* bcrypt hashes — **no longer exist in production**: the seed is gated to
`dev`/`test`, and a one-time migration removes any already-seeded rows from the live DB on the
next deploy. The real admin is created from env at startup (no credential committed).

⚠️ **A bcrypt hash is full of `$`, and Docker Compose interpolates `$` in `.env` values** — a raw
hash gets corrupted (e.g. `$2y$10$…` arrives as `$y$10$…` and the bootstrap logs *"not a bcrypt
hash"*). **You MUST double every `$` to `$$` in `.env`** (Compose collapses `$$`→`$` on the way in).
This one-liner regenerates the hash and prints the correctly-escaped line — paste its output
straight into `.env` (it also keeps the plaintext out of your shell history):
```bash
read -rs PW; echo
RAW=$(docker run --rm httpd:2.4-alpine htpasswd -bnBC 10 "" "$PW" | tr -d ':\n'); unset PW
printf 'ADMIN_PASSWORD_HASH=%s\n' "$(printf '%s' "$RAW" | sed 's/[$]/$$/g')"
```
Resulting `.env` (note the `$$`):
```ini
ADMIN_EMAIL=admin@kiwiply.com
ADMIN_PASSWORD_HASH=$$2y$$10$$....the-rest-of-the-hash....
# ADMIN_LOGIN=admin   # optional; defaults to "admin"
```
After editing, recreate the container and confirm the env arrived intact (a clean 60-char `$2y$10$…`):
```bash
docker compose -f docker-compose.prod.yml up -d --force-recreate api
docker compose -f docker-compose.prod.yml exec api printenv ADMIN_PASSWORD_HASH
docker compose -f docker-compose.prod.yml logs api | grep -i "admin bootstrap" | tail -1  # want: created admin account
```
On boot the API creates (or, on later boots, updates/rotates) this admin with `ROLE_ADMIN`.
Change the hash + restart the api container to rotate the password. Leaving these blank skips
the bootstrap — then **no one can sign in as admin**. After deploy, verify the old seed is dead:
```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://api.<SSLIP_HOST>/api/authenticate \
  -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin"}'   # expect 401
```
then confirm the real admin signs in.

## 3. Launch
```bash
docker compose -f docker-compose.prod.yml up -d --build
```
First build is slow (Gradle + npm download everything once). Watch it come up:
```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f api
```
Verify:
- API health: `curl https://api.<SSLIP_HOST>/management/health` → `{"status":"UP"}`
- Web: open `https://<SSLIP_HOST>` and sign up / sign in.

> TLS note: Caddy fetches certificates on first request to each hostname; the very first
> hit may take a few seconds. If it fails, confirm ports 80/443 are open and the sslip.io
> host resolves to this box (`dig +short <SSLIP_HOST>`).

## 4. Point the extension at this API
The extension calls the API directly, so it needs the public API origin:
- Add `https://api.<SSLIP_HOST>/*` to `host_permissions` in `job-autofill/wxt.config.ts`
  (WXT generates the manifest; there is no checked-in `manifest.json`), then rebuild.
- Set the extension's backend base URL to `https://api.<SSLIP_HOST>` (Options page / config).
Reload the unpacked extension. (At Chrome Web Store launch, also pin
`CORS_ALLOWED_ORIGIN_PATTERNS=chrome-extension://<published-id>` in `.env` and restart.)

## 5. Operations

> ⚠️ **On production, ALWAYS pass the shared-edge overlay.** Production is co-hosted with
> BeeCompete behind `beecompete-edge-caddy`, which owns :80/:443. A bare
> `docker compose -f docker-compose.prod.yml up -d` starts **our** Caddy, which fights for those
> ports and **takes BeeCompete down**. Set this once per shell and use `$COMPOSE` below — it is
> the same command `deploy.yml` runs:
>
> ```bash
> cd ~/web-ext-job-application-autofill
> COMPOSE="docker compose -f docker-compose.prod.yml -f docker-compose.shared-edge.yml"
> ```
>
> (The from-scratch steps in §1–§3 omit the overlay on purpose — they describe a fresh
> single-tenant box, which production no longer is.)
- **Update to latest code:**
  ```bash
  git pull && $COMPOSE up -d --build
  ```
  Liquibase applies new DB migrations automatically on API start.
- **Logs:** `$COMPOSE logs -f <service>`
- **Database backup — ⚠️ NOT SET UP. There is no automated backup of production.**
  Verified 2026-09-21: both the `root` and `deploy` crontabs are empty, there is no systemd
  timer, and no Dossier dump exists on the box. This is the exact gap that turned the loss of
  the old VPS into a permanent **loss of all user data** — the previous version of this file
  described a nightly cron that had never actually been installed, and everyone read the
  intention as a fact. Do not treat the command below as a backup strategy; it is a manual
  dump you have to remember to run:
  ```bash
  $COMPOSE exec -T mysql \
    sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --databases dossierApi' > dossier-$(date +%F).sql
  ```
  A real fix needs three things, and **is still owed**: a schedule (cron/systemd timer), a copy
  that lands **off the box** (S3), and a restore that has actually been tested. Until a dump is
  sitting somewhere other than this server, production is one server failure from zero.
- **Restore:** `… exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD"' < backup.sql`
- **Resume files** live in S3 — durability/backup is handled by AWS. Note this saves the
  *blobs* only: without the DB rows that point at them they are orphaned objects, which is
  exactly what happened to the pre-2026-09 resumes.
- **Monitoring — ⚠️ NONE.** There is no uptime check, no health polling, and no alerting on
  either hostname. Nothing will tell you production is down; you find out by visiting it. The
  old VPS's death was noticed only because someone happened to `curl` it during unrelated work.
  If you add one, the obvious probes are `https://kiwiply.com/` and
  `https://api.kiwiply.com/management/health` (returns `{"status":"UP"}`), and
  `scripts/migrate/04-verify.sh kiwiply.com` covers the fuller surface by hand.

## 6. When you get a real domain
Point `app.` and `api.` A-records at the IP, then in `Caddyfile` replace the two
`*.{$SSLIP_HOST}` site labels with `app.yourdomain.com` / `api.yourdomain.com`, update the
extension's host permission, and restart Caddy. Nothing else changes.

## 7. CI/CD (GitHub Actions)
Two workflows live in `.github/workflows/`:
- **`ci.yml`** — runs the extension, web, and API test suites on every PR and push. No setup needed.
- **`deploy.yml`** — on merge to `main`, builds the api + web images on GitHub's runners,
  pushes them to **GHCR**, then SSHes into the VPS to `pull` + restart. Building off-box keeps
  the heavy Gradle/npm builds from hammering the VPS.

### 7.1 Current configuration (live since 2026-09-17 — nothing to do)

Auto-deploy **is enabled and working**. These are the values in use, for reference and for
rebuilding it if it ever breaks:

| Kind | Name | Value |
|---|---|---|
| Secret | `VPS_HOST` | `74.208.212.158` |
| Secret | `VPS_USER` | `root` |
| Secret | `VPS_SSH_KEY` | private half of `~/.ssh/dossier_deploy` |
| Variable | `DEPLOY_PATH` | `/root/web-ext-job-application-autofill` |
| Variable | `DEPLOY_ENABLED` | `true` |

`DEPLOY_PATH` exists because the checkout lives under `/root`, so a bare `~` would resolve
differently for any other user. `VPS_USER=root` is a **known compromise**: BeeCompete's `deploy`
user is in the `docker` group but has no passwordless sudo, so it cannot drive a stack under
`/root`. Moving the checkout somewhere `deploy` can read would let CI drop root — worth doing,
not yet done.

### 7.2 Setting this up again from scratch

1. **Put the production checkout on `main`.** A checkout left on a feature branch breaks
   `git pull --ff-only` the moment that branch is deleted (see §7.3).
2. **Let the deploy user run Docker without sudo** (CI can't answer a sudo prompt):
   ```bash
   sudo usermod -aG docker $USER && exit   # then SSH back in
   ```
   Not needed when deploying as `root`.
3. **Create a deploy SSH key** and install the public half on the box:
   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/dossier_deploy -N ""
   ssh-copy-id -i ~/.ssh/dossier_deploy.pub root@YOUR_IP
   ```
   On **Windows, run this in Git Bash** — PowerShell has no `ssh-copy-id`, and it mangles
   `-N ""` (use `-N '""'` there). The PowerShell equivalent of the install step is:
   ```powershell
   type $HOME\.ssh\dossier_deploy.pub | ssh root@YOUR_IP "mkdir -p ~/.ssh; chmod 700 ~/.ssh; tr -d '\r' >> ~/.ssh/authorized_keys; chmod 600 ~/.ssh/authorized_keys"
   ```
   The `tr -d '\r'` is required — PowerShell's pipe appends a carriage return that silently
   corrupts `authorized_keys`.
4. **Add the Secrets and Variables** from the table in §7.1. Set `VPS_SSH_KEY` from **Git Bash**
   (`gh secret set VPS_SSH_KEY < ~/.ssh/dossier_deploy`) or by pasting into the web UI —
   PowerShell has no `<` redirection and its pipe corrupts multi-line values. Beware MSYS path
   conversion too: `gh variable set DEPLOY_PATH --body "/root/..."` from Git Bash rewrites the
   value to `C:/Program Files/Git/root/...`, so set that one from PowerShell.
5. **Make the two GHCR packages public** after the first `main` build runs (GitHub → your
   profile → Packages → `dossier-api`/`dossier-web` → Package settings → Change visibility →
   Public). Then the box pulls with no registry login. *(Prefer private? Instead add a
   `docker login ghcr.io` with a read:packages PAT to the deploy script.)*
6. **Flip the switch:** set repo **Variable** `DEPLOY_ENABLED` = `true`.

### 7.3 Deploy traps (all three cost a failed deploy on 2026-09-17)

- **`DEPLOY_ENABLED` is snapshotted when a run is *created*, not when the job starts.** Flipping
  it to `true` does **not** rescue a run that is already queued — that run keeps the old value
  and silently skips the SSH step (`Pull + restart on the VPS: skipped`). Trigger a *new* run
  after changing it.
- **Never delete a branch the production checkout is sitting on.** `git pull --ff-only` then
  fails with *"your configuration specifies to merge with the ref … but no such ref was
  fetched"*, and the deploy dies before touching any container. Keep the box on `main`.
- **fail2ban bans your whole public IP** after a few failed root password attempts. Ubuntu
  defaults to `PermitRootLogin prohibit-password`, so root password auth fails *every* time and
  retrying digs the ban deeper. The signature is a **timeout on :22 while :80/:443 stay fine**.
  Recover through the hosting panel's **KVM/web console**, which bypasses SSH:
  `fail2ban-client set sshd unbanip <your-ip>` — or wait it out (10 min default).

After that, every merge to `main` auto-builds and deploys. Trigger manually anytime via the
Actions tab → **Deploy** → *Run workflow*. The compose pulls `…:latest` from GHCR; a manual
`$COMPOSE up -d --build` still works for an off-pipeline deploy (**with the overlay** — see §5).

## 8. Publishing the browser extension (Chrome Web Store)
The **`publish-extension.yml`** workflow packages the extension into a CWS-ready zip (always,
as a downloadable build artifact) and can publish it to the Chrome Web Store.

**First listing (manual, one-time):** the CWS API can only *update* an existing item, so the
first submission is by hand. **Do these in order — step 5 is not optional**, because the store
assigns an extension id that the web `/connect` page must be told about, and `/connect` is the
only way to sign in:
1. Run **Actions → Publish extension → Run workflow** with **`omit_key` ticked**. A brand-new
   store item rejects a manifest carrying a `key`, so that one build drops it
   (`KIWIPLY_OMIT_KEY=1`). Publishing is skipped — the run just builds the zip.
   **Only ever tick this for the first upload**; every later release must keep the key or the
   published extension ID changes. Tag-driven releases can't set it.
2. Download the **`dossier-extension`** artifact from that run.
3. Create a [Chrome Web Store developer account](https://chrome.google.com/webstore/devconsole)
   (one-time $5 fee), **Add new item**, upload the zip, fill the listing (privacy URL =
   `https://kiwiply.com/privacy`; `job-autofill/PRIVACY.md` is the source for the Privacy tab's
   single-purpose + per-permission + data-use answers), and submit for review. The item is
   **login-gated**, so put working test credentials for kiwiply.com in the reviewer notes or it
   gets rejected as broken.
4. Once the item exists, copy its **public key** (devconsole → item → Package → *View public key*)
   into `MANIFEST_KEY` in `wxt.config.ts`, so the unpacked dev build and the published item share
   one id forever. Nothing else to undo — the omission was a build flag, not an edit.
5. Copy the item's **extension id** (from its devconsole URL) into
   **`NEXT_PUBLIC_KIWIPLY_EXTENSION_ID`** for the web build and **redeploy web**. It's a
   `NEXT_PUBLIC_*` var, so it is baked in at build time — until web is rebuilt, `/connect` targets
   the old dev id and every store user's sign-in silently fails. Verify on
   `https://kiwiply.com/connect` with the published extension installed before making the listing
   public (publish it **unlisted** first if you want to test with a real store install).

**Automated updates (after the item exists):**
1. Get CWS API credentials (Google Cloud project → enable the *Chrome Web Store API* → OAuth
   *Desktop* client → generate a **refresh token**; see the
   [chrome-webstore-upload keys guide](https://github.com/fregante/chrome-webstore-upload-keys)).
2. Add repo **Secrets**: `CWS_EXTENSION_ID` (from the item's URL), `CWS_CLIENT_ID`,
   `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`.
3. Add repo **Variable** `PUBLISH_EXTENSION` = `true`.
4. To ship an update: bump the version in `job-autofill/wxt.config.ts` (+ `package.json`), then
   tag it — `git tag ext-v0.11.1 && git push origin ext-v0.11.1` — or run the workflow manually.
   CWS rejects re-uploading the same version, so the bump is required each release.

**Usage analytics (GA4, optional):** the extension can send anonymous usage events via the GA4
Measurement Protocol (Phase 6.1). The measurement id + api secret are **kept out of the repo** and
**injected into the build by CI** (`.github/scripts/inject-ga.js`, run by `publish-extension.yml`),
so the bundled zip carries them but the source never does. To turn it on:
1. In Google Analytics, create a GA4 property → Web data stream → copy the **Measurement ID**
   (`G-XXXXXXXXXX`); on that stream, under **Measurement Protocol API secrets**, create one and
   copy the **secret value**.
2. Add repo **Secrets**: `GA_MEASUREMENT_ID` and `GA_API_SECRET`.
3. **Master switch (stage now, turn on later):** analytics stays **OFF** even with the secrets set,
   until you add the repo **Variable** `EXT_ANALYTICS_ENABLED` = `true`. So you can ship a build
   with credentials baked in but no data collected, then flip the variable (and republish) to go
   live. Leave the variable unset/`false` to keep it staged-but-dark.
4. That's it — the next packaged build injects the creds + switch automatically. **If the secrets
   are absent the build still succeeds**, just with analytics disabled (constants stay empty, every
   event no-ops). Users can also opt out in the extension's Settings. No app/server change is
   involved (events go straight from the service worker to Google). *(Dev tip: to test on your own
   unpacked build without republishing, set `gaMeasurementId`, `gaApiSecret`, and `gaEnabled:true`
   in the extension's stored settings via the service-worker console.)*

**Microsoft Edge (same bundle):** Edge is Chromium/MV3, so the extension runs **unchanged** — the
same `dossier-extension` zip is accepted by the Edge Add-ons store (Microsoft Partner Center). To
sideload for testing: `edge://extensions` → Developer mode → **Load unpacked**. Full porting notes
(Edge, Firefox, Safari) are in `job-autofill/BROWSERS.md`.

## 9. Email verification (Brevo SMTP)
New signups are created **inactive** and emailed an activation link; they can't sign in until
they click it. This is the gate before opening signups to the public. The integration is
provider-agnostic (just `MAIL_*` env) — Brevo for now, swappable to SES/Resend later.

1. **Create a Brevo account** (free, 300 emails/day) at https://www.brevo.com.
2. **Verify a sender address** (no domain needed): Brevo → **Senders, Domains & Dedicated IPs**
   → **Senders** → add your email (e.g. your Gmail) → click the confirmation Brevo emails you.
   This becomes `MAIL_FROM`.
3. **Get SMTP credentials:** Brevo → **SMTP & API** → **SMTP** tab. Note the server
   (`smtp-relay.brevo.com`), port `587`, your **login** (looks like `…@smtp-brevo.com`), and
   **Generate a new SMTP key** (this is the password — not your account password).
4. **On the VPS**, edit `.env` and set:
   ```
   MAIL_HOST=smtp-relay.brevo.com
   MAIL_PORT=587
   MAIL_USERNAME=<your @smtp-brevo.com login>
   MAIL_PASSWORD=<the SMTP key>
   MAIL_FROM=<your verified sender email>
   ```
   `MAIL_BASE_URL` auto-derives to `https://<SSLIP_HOST>` — only set it for a real domain.
5. **Apply it** — use `$COMPOSE` from §5; **the overlay is required on production**:
   ```bash
   $COMPOSE up -d api
   ```
   Recreates the API with the new env. No rebuild needed.
6. **Test:** sign up with a real inbox → you get the activation email → the link opens
   `https://<SSLIP_HOST>/account/activate?key=…` → "Email verified" → sign in works. If the
   email doesn't arrive, check spam and the API logs (`… logs api | grep -i mail`).

### 9.1 Email architecture (kiwiply.com)

Two distinct mail flows on the `kiwiply.com` domain — **transactional** (the app sends) and
**human support** (a person reads/replies). Both go out through **one Brevo account**
(free tier, 300 emails/day shared), owned by **`admin.kiwiply@gmail.com`**.

| Address | Direction | How |
|---|---|---|
| **`no-reply@kiwiply.com`** | App → user (outbound only) | Backend (Spring) → Brevo SMTP. `MAIL_FROM=no-reply@kiwiply.com` in the VPS `.env`. Used for signup/activation. Unmonitored. |
| **`support@kiwiply.com`** | Both | **In:** Cloudflare Email Routing → `mail.kiwiply@gmail.com`. **Out/reply:** Gmail "Send mail as" via Brevo SMTP. Public-facing contact (shown on `/privacy`). |
| **`contact-us@kiwiply.com`** | In | Cloudflare Email Routing → a Gmail (earlier alias; kept as a secondary contact). |

- **Domain auth (Cloudflare DNS, all live):** DKIM `brevo1._domainkey`/`brevo2._domainkey` →
  `b1/b2.kiwiply-com.dkim.brevo.com`; SPF `v=spf1 include:_spf.mx.cloudflare.net ~all`;
  DMARC `p=none; rua=mailto:rua@dmarc.brevo.com`; plus the Brevo verification `brevo-code` TXT.
  Outbound mail (no-reply / support) is DKIM-signed as `kiwiply.com` → passes DMARC alignment.
- **Brevo account ownership:** the account is owned by `admin.kiwiply@gmail.com` (migrated from a
  personal Gmail by changing the account login email in Brevo settings — this keeps the existing
  DKIM/brevo-code DNS and SMTP keys valid, so **no DNS or VPS change** was needed). The app's
  `MAIL_USERNAME` is the generated `…@smtp-brevo.com` SMTP login (not a Gmail); `MAIL_PASSWORD` is
  the Brevo SMTP key.
- **Gmail "Send mail as" (for `support@`):** SMTP `smtp-relay.brevo.com:587` (TLS), username =
  the Brevo `…@smtp-brevo.com` login, password = the Brevo SMTP key. Set Gmail → *Reply from the
  same address the message was sent to*.

## 10. Server-side AI drafting (Phase 5) — ✅ LIVE (Gemini free tier)
> **Status (2026-06-24): enabled in production** on Google Gemini **`gemini-2.5-flash-lite`** (free
> tier). The extension's "Use Dossier AI" toggle is active (opt-in + explicit consent), the server
> runs `DOSSIER_AI_ENABLED=true`, with a per-user monthly quota. The **BYO-Anthropic-key** path still
> takes priority for users who supply their own key. To pause it again, set `DOSSIER_AI_ENABLED=false`
> and re-run the apply step (it then cleanly reports `{"disabled":true}`).

The AI "draft an answer" proxy (`POST /api/ai/draft`) reports `{"disabled":true}` whenever
`DOSSIER_AI_ENABLED=false` or no key is set. The provider key lives **only** in the VPS `.env`;
it is never shipped in the extension. Provider is Google Gemini (swappable via env).

> **Model choice / free-tier gotcha:** `gemini-2.0-flash` returns HTTP `429` `... free_tier_requests,
> limit: 0` on this project (that model has no free-tier grant here). **`gemini-2.5-flash-lite` does
> have free-tier quota** and is the default — verified live. If a model ever returns `limit: 0`, try a
> different model first; if *every* model is `limit: 0`, the project has no free tier at all and the
> fix is enabling billing (paid tier — a few cents/month, and a privacy win since paid-tier inputs
> aren't used to train Google's products).

> **Privacy note (free tier):** the free Gemini tier may use submitted inputs to improve Google's
> services (and may be human-reviewed). That's why the extension keeps AI drafting **opt-in +
> explicit consent**, and both privacy policies disclose it. A paid key removes that caveat.

1. **Get a Gemini API key** (free): sign in at https://aistudio.google.com/apikey → **Create
   API key**. Copy it (looks like `AIza…`). Keep it secret — treat it like a password.
2. **On the VPS**, edit `.env` and set:
   ```
   DOSSIER_AI_ENABLED=true
   DOSSIER_AI_PROVIDER=gemini
   DOSSIER_AI_MODEL=gemini-2.5-flash-lite
   DOSSIER_AI_API_KEY=<paste your AIza… key here>
   DOSSIER_AI_FREE_MONTHLY_QUOTA=50
   ```
   (Leave `DOSSIER_AI_API_KEY` blank or `DOSSIER_AI_ENABLED=false` to keep AI off.)
   `DOSSIER_AI_FREE_MONTHLY_QUOTA` is the per-user monthly draft cap on **your** key.
3. **Apply it** — use `$COMPOSE` from §5; **the overlay is required on production**:
   ```bash
   $COMPOSE up -d api
   ```
   Recreates the API with the new env. No rebuild needed.
4. **Test:** in the extension, Options → Settings → enable **"Use Dossier AI"** + tick the
   consent box, then trigger a draft on a question field. A first call should return an answer
   and `{used, quota}`. Without the env set, it returns `{"disabled":true}` (correct = off).
5. **Switching providers / going paid later:** change `DOSSIER_AI_PROVIDER`/`DOSSIER_AI_MODEL`/
   `DOSSIER_AI_API_KEY` and re-run step 3 — no code change (the proxy is provider-agnostic).
   When you move off the free tier, you can soften the opt-in/consent copy in the privacy policy.
6. **Rotate / disable anytime:** edit the same lines in `.env` (swap the key, or set
   `DOSSIER_AI_ENABLED=false`) and re-run step 3. Auto-deploys (`git pull` on merge to `main`)
   update `.env.example` but **never your real `.env`** (it's gitignored), so the key you set here
   persists across deploys — you only configure it once.

> **Answer caching (Phase 5.3):** identical questions from the same user are served from a
> server-side cache (`ai_answer`, keyed by a normalized-question hash) — a cache hit costs **no
> quota** and makes **no provider call**, which also softens Gemini's per-minute rate limits for
> common questions. Nothing to configure; it's automatic.

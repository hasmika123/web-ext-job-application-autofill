# Deploying Dossier (self-hosted VPS)

> **Current production:** live on an IONOS VPS at **https://kiwiply.com** (apex canonical;
> `www`/`app` 301 to it; API at `api.kiwiply.com`), deployed automatically by CI on merge to
> `main` (§7). The from-scratch steps below use **sslip.io** as the no-domain bootstrap; to use a
> real domain instead, set `SSLIP_HOST` to it and point DNS at the IP (see §6).

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
- Add `https://api.<SSLIP_HOST>/*` to `host_permissions` in `job-autofill/manifest.json`.
- Set the extension's backend base URL to `https://api.<SSLIP_HOST>` (Options page / config).
Reload the unpacked extension. (At Chrome Web Store launch, also pin
`CORS_ALLOWED_ORIGIN_PATTERNS=chrome-extension://<published-id>` in `.env` and restart.)

## 5. Operations
- **Update to latest code:**
  ```bash
  git pull && docker compose -f docker-compose.prod.yml up -d --build
  ```
  Liquibase applies new DB migrations automatically on API start.
- **Logs:** `docker compose -f docker-compose.prod.yml logs -f <service>`
- **Database backup** (cron nightly; also copy off-box, e.g. to S3):
  ```bash
  docker compose -f docker-compose.prod.yml exec -T mysql \
    sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --databases dossierApi' > dossier-$(date +%F).sql
  ```
- **Restore:** `… exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD"' < backup.sql`
- **Resume files** live in S3 — durability/backup is handled by AWS.

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

**One-time setup to enable auto-deploy** (until then, images still build/push; only the SSH
step is skipped):

1. **Put the production checkout on `main`** (it was cloned on a feature branch):
   ```bash
   cd ~/web-ext-job-application-autofill && git checkout main && git pull
   ```
2. **Let the deploy user run Docker without sudo** (CI can't answer a sudo prompt):
   ```bash
   sudo usermod -aG docker $USER && exit   # then SSH back in
   ```
3. **Create a deploy SSH key** (on your laptop), add the public half to the VPS:
   ```bash
   ssh-keygen -t ed25519 -f dossier_deploy -N ""        # makes dossier_deploy(.pub)
   ssh-copy-id -i dossier_deploy.pub adhya@YOUR_VPS_IP   # or paste into ~/.ssh/authorized_keys
   ```
4. **Add GitHub repo Secrets** (Settings → Secrets and variables → Actions → Secrets):
   - `VPS_HOST` = your IP · `VPS_USER` = `adhya` · `VPS_SSH_KEY` = contents of the **private**
     `dossier_deploy` file.
5. **Make the two GHCR packages public** after the first `main` build runs (GitHub → your
   profile → Packages → `dossier-api`/`dossier-web` → Package settings → Change visibility →
   Public). Then the VPS pulls with no registry login. *(Prefer private? Instead add a
   `docker login ghcr.io` with a read:packages PAT to the deploy script.)*
6. **Flip the switch:** add repo **Variable** `DEPLOY_ENABLED` = `true` (Settings → Secrets and
   variables → Actions → Variables).

After that, every merge to `main` auto-builds and deploys. Trigger manually anytime via the
Actions tab → **Deploy** → *Run workflow*. The compose pulls `…:latest` from GHCR; a manual
`docker compose -f docker-compose.prod.yml up -d --build` still works for an off-pipeline deploy.

## 8. Publishing the browser extension (Chrome Web Store)
The **`publish-extension.yml`** workflow packages the extension into a CWS-ready zip (always,
as a downloadable build artifact) and can publish it to the Chrome Web Store.

**First listing (manual, one-time):** the CWS API can only *update* an existing item, so the
first submission is by hand:
1. Run **Actions → Publish extension → Run workflow** (it skips publishing, just builds the zip).
2. Download the **`dossier-extension`** artifact from that run.
3. Create a [Chrome Web Store developer account](https://chrome.google.com/webstore/devconsole)
   (one-time $5 fee), **Add new item**, upload the zip, fill the listing (use the web `/privacy`
   URL and `job-autofill/PRIVACY.md` for the data-use disclosure), and submit for review.

**Automated updates (after the item exists):**
1. Get CWS API credentials (Google Cloud project → enable the *Chrome Web Store API* → OAuth
   *Desktop* client → generate a **refresh token**; see the
   [chrome-webstore-upload keys guide](https://github.com/fregante/chrome-webstore-upload-keys)).
2. Add repo **Secrets**: `CWS_EXTENSION_ID` (from the item's URL), `CWS_CLIENT_ID`,
   `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`.
3. Add repo **Variable** `PUBLISH_EXTENSION` = `true`.
4. To ship an update: bump the version in `job-autofill/manifest.json` (+ `package.json`), then
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
3. That's it — the next packaged build injects them automatically. **If the secrets are absent the
   build still succeeds**, just with analytics disabled (the constants stay empty and every event
   no-ops). Users can always opt out in the extension's Settings. No app/server change is involved
   (events go straight from the service worker to Google).

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
5. **Apply it:** `docker compose -f docker-compose.prod.yml up -d` (recreates the API with the
   new env). No rebuild needed.
6. **Test:** sign up with a real inbox → you get the activation email → the link opens
   `https://<SSLIP_HOST>/account/activate?key=…` → "Email verified" → sign in works. If the
   email doesn't arrive, check spam and the API logs (`… logs api | grep -i mail`).

## 10. Server-side AI drafting (optional, Phase 5) — ⏸️ ON HOLD / "coming soon"
> **Status (2026-06-24): deliberately OFF in production.** The full infrastructure is built and
> merged (`POST /api/ai/draft`, provider-agnostic `AiProvider`, per-user quota), but the feature
> is **not active for users**: the extension shows the toggle as **"coming soon"** (disabled), and
> the server runs with `DOSSIER_AI_ENABLED=false`. Enabling was paused because the trial Gemini
> **free tier returned `limit: 0`** for the project (see the gotcha below). Re-activate by working
> through the steps here once the provider/billing question is resolved. The **BYO-Anthropic-key**
> path (extension Options → "Use the Anthropic API…") is unaffected and remains the live AI option.

The AI "draft an answer" proxy (`POST /api/ai/draft`) is **OFF by default** — the API reports
`{"disabled":true}` until you enable it here. The provider key lives **only** in the VPS `.env`;
it is never shipped in the extension. Default provider is Google Gemini.

> **Free-tier gotcha (why this is on hold):** a Gemini key whose Google Cloud project has **no
> free-tier grant** returns HTTP `429` with `... free_tier_requests, limit: 0` on *every* model
> (it's a per-project quota, so switching model names doesn't help). Fix = enable billing on the
> project (moves it to the paid tier — a few cents/month at this scale). **Paid tier is also a
> privacy win:** Google does **not** use paid-tier inputs to train its products, unlike the free
> tier — so once on paid, the opt-in/consent copy can be softened.

> **Privacy note (free tier):** the free Gemini tier may use submitted inputs to improve Google's
> services (and may be human-reviewed). That's why the extension keeps AI drafting **opt-in +
> explicit consent**, and both privacy policies disclose it. A paid key removes that caveat.

**To re-enable later, follow steps 1–4. To keep it OFF (current state):** ensure
`DOSSIER_AI_ENABLED=false` in `.env` (or leave `DOSSIER_AI_API_KEY` blank) and run step 3 — the
API then cleanly reports `{"disabled":true}` and nothing is sent anywhere.

1. **Get a Gemini API key** (free): sign in at https://aistudio.google.com/apikey → **Create
   API key**. Copy it (looks like `AIza…`). Keep it secret — treat it like a password.
2. **On the VPS**, edit `.env` and set:
   ```
   DOSSIER_AI_ENABLED=true
   DOSSIER_AI_PROVIDER=gemini
   DOSSIER_AI_MODEL=gemini-2.0-flash
   DOSSIER_AI_API_KEY=<paste your AIza… key here>
   DOSSIER_AI_FREE_MONTHLY_QUOTA=50
   ```
   (Leave `DOSSIER_AI_API_KEY` blank or `DOSSIER_AI_ENABLED=false` to keep AI off.)
   `DOSSIER_AI_FREE_MONTHLY_QUOTA` is the per-user monthly draft cap on **your** key.
3. **Apply it:** `docker compose -f docker-compose.prod.yml up -d` (recreates the API with the
   new env). No rebuild needed.
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

# Deploying Dossier (self-hosted VPS)

The whole stack runs as Docker containers on one host: **MySQL + API + web**, behind
**Caddy** (auto-HTTPS via Let's Encrypt). With no domain yet, we use **sslip.io** to get
real certificates on the bare IP. Object storage is **AWS S3** (private bucket).

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
- Web: open `https://app.<SSLIP_HOST>` and sign up / sign in.

> TLS note: Caddy fetches certificates on first request to each hostname; the very first
> hit may take a few seconds. If it fails, confirm ports 80/443 are open and the sslip.io
> host resolves to this box (`dig +short app.<SSLIP_HOST>`).

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

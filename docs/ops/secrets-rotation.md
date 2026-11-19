# Rotating secrets

Gap D-5. Every secret production uses: where it lives, how to replace it, and what users notice. Rotate one when it may have leaked (a lost
laptop, a pasted log, a departed contractor), and on the schedule at the end.

**Ground rules (all of them):**
- **New value goes to the password manager first**, then to the box's `.env`. GitHub secrets are write-only, and the `.env` was lost once
  (2026-09-17): the password manager is the only copy you can read back.
- **Generate on your own machine** (`openssl rand …`), never in a chat or a ticket.
- **Recreate, don't restart**, so the container reads the new `.env`. Always use the shared-edge overlay
  (`-f docker-compose.prod.yml -f docker-compose.shared-edge.yml`); never free ports 80/443 (that takes BeeCompete down):
  `docker compose -f docker-compose.prod.yml -f docker-compose.shared-edge.yml up -d --force-recreate api web`
- **Revoke the old value at its provider** once the new one works, and note the date in the password manager.

## The box's `.env`

| Secret | What it protects | How to rotate | What users notice |
|---|---|---|---|
| `JWT_BASE64_SECRET` | Signs every access AND refresh token (web, extension, tenant sessions). | `openssl rand -base64 64`, set it, recreate `api`. | **Everyone is signed out**: web users sign in again, and the extension (personal and enterprise) must reconnect. Do it out of hours. |
| `DOSSIER_TENANT_HOST_SECRET` | Proves to the API that a request's host header came from the web server (tenant isolation). | `openssl rand -hex 32`; set the **same** value for `api` and `web`; recreate **both together**. | While only one side has the new value, every tenant host answers 404. Recreate both in one command. |
| `DOSSIER_INTERNAL_TOKEN` | The web's resume-PDF worker calling `/api/internal/**`. | `openssl rand -hex 32`; same value for `api` and `web`; recreate both. | Background PDFs pause while the two disagree; manual "Export PDF" keeps working. |
| `DOSSIER_SCRAPE_TOKEN` | A Prometheus scraper on `/management/prometheus` (≥ 32 chars). | New value; update the scraper's config at the same time. | Nothing (metrics gap until the scraper has it). |
| `DOSSIER_INBOX_KEY` (+ `_VERSION`) | Encrypts each user's Gmail app password at rest (AES-256-GCM). | **Not a plain swap.** Follow `DEPLOY.md` §12: bump the version and keep the old key readable as a retired key for a day. | Nothing if done that way. A plain swap makes every connected inbox reconnect. |
| `MYSQL_ROOT_PASSWORD` | The database. The API connects with it too (`SPRING_DATASOURCE_PASSWORD` in `docker-compose.prod.yml`; a least-privilege app user is gap D-7). | Change it in MySQL first (`ALTER USER 'root'@'%' IDENTIFIED BY …`), then `.env`, then recreate `mysql`-dependent services (`api`). The backup jobs read it too: run one backup by hand after. | A few seconds of errors during the recreate. |
| `ADMIN_PASSWORD_HASH` | The platform admin account. | `DEPLOY.md` §2.1 (bcrypt hash, every `$` doubled), then recreate `api`; the bootstrap updates the account on boot. | The admin signs in with the new password. |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | Resume files and branding assets in AWS S3. | Create a second access key for the IAM user, set it, recreate `api`, check an upload and a download, then **delete** the old key in IAM. | Nothing. |
| `BACKUP_AWS_ACCESS_KEY_ID` / `_SECRET_ACCESS_KEY` | Off-box database dumps and binlogs. | Same as S3 (its own IAM user), then run one backup by hand and check it arrived. | Nothing. |
| `MAIL_PASSWORD` | Brevo SMTP key: every email we send (verification, resets, invites, notices). | Brevo → SMTP & API → SMTP keys: create a new key, set it, recreate `api`, send yourself a password reset, then delete the old key. | Nothing; mail queued during the recreate is retried. |
| `BREVO_API_KEY` | Brevo contacts (newsletter). | Brevo → API keys: same create, swap, test, delete. | Nothing. |
| `DOSSIER_AI_API_KEY` | Server AI (Google AI Studio / Gemini). | Create a new key in Google AI Studio, set it, recreate `api`, run one AI call (admin AI page probe), delete the old key. | Nothing. |
| `STRIPE_SECRET_KEY` | Stripe API (personal and organization billing). | Stripe Dashboard → Developers → API keys → **Roll key** (give the old one a short expiry), set the new one, recreate `api`. | Nothing. |
| `STRIPE_WEBHOOK_SECRET` | Verifies Stripe's webhook calls. | Stripe Dashboard → Webhooks → the endpoint → **Roll secret** (keep the old one valid for a while), set it, recreate `api`, send a test event. | Nothing. Events signed with the old secret during the switch are retried by Stripe. |
| `DEMO_PASSWORD` | The demo accounts' stored password (blank in production on purpose). | Leave blank: production uses a random one per boot. | — |

## GitHub (repository secrets)

| Secret | What it protects | How to rotate |
|---|---|---|
| `VPS_SSH_KEY` (+ `VPS_HOST`, `VPS_USER`) | CI's deploy access to the box. | Make a new key pair, add the public key to the deploy user's `authorized_keys` on the box, put the private key in the GitHub secret, run a deploy, then remove the old public key from the box. See `docs/ops/deploy-user.md`. |
| `CWS_CLIENT_ID` / `CWS_CLIENT_SECRET` / `CWS_REFRESH_TOKEN` | Publishing the extension to the Chrome Web Store. | Google Cloud console → the OAuth client → reset the secret, mint a new refresh token (`DEPLOY.md` §8), update all three secrets. |
| `GA_API_SECRET` | Analytics Measurement Protocol from the publish workflow. | Google Analytics → Admin → Data streams → Measurement Protocol API secrets: create, update, delete the old one. |

## Schedule

- **After any suspected leak:** that secret at once, plus `JWT_BASE64_SECRET` if anything that could sign tokens was exposed.
- **When someone with box or password-manager access leaves:** every secret in the first table and the SSH key.
- **Yearly:** the provider keys (AWS, Brevo, AI, Stripe), and the date in `web/src/lib/security-txt.ts` (its test fails 30 days before it
  expires, as the reminder).

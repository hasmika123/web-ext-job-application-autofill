# AUDIT — area `plat` (Platform, DevOps & reliability)

Written 2026-10-11 against branch `product-roadmap` (= `version2` + design docs; production runs
`main` at `4de5b60`, ~130 commits behind). Method: read every file the area owns —
`.github/workflows/*`, `docker-compose*.yml`, `api/Dockerfile`, `web/Dockerfile`, `DEPLOY.md`,
`MIGRATION.md`, `scripts/ops/*`, `scripts/migrate/*`, `.env.example`, the API's `application*.yml`,
`SecurityConfiguration`, the rate-limit filters, `StorageConfiguration` + `S3ResumeStorageService`,
`web/next.config.ts`, `web/src/lib/rate-limit.ts` — plus `PROGRESS.md` Phase 15 and ROADMAP §15/§21.
Nothing was run against the production box. State legend: **real** = exists, tested, running in
production · **partial** = code exists but is not live, or live but untested · **missing** = nothing.

Companion: `docs/roadmap/PLAN-plat.md`, `docs/roadmap/areas/plat.json`, `docs/design/plat/*.md`.

## 0. The shape of production today

```
Cloudflare DNS (grey-cloud, DNS-only)
  └─ 74.208.212.158  one self-managed Ubuntu box, SHARED with BeeCompete (3.7 GB RAM total, ~1.1 GB free, 4 GB swap)
       └─ beecompete-edge-caddy  owns :80/:443, Caddyfile in ~/beecompete-edge/ (outside this repo)
            ├─ kiwiply.com      → dossier-web:3000   (Next standalone, node:22-alpine, non-root)
            └─ api.kiwiply.com  → dossier-api:8080   (Spring Boot, temurin 17 JRE, non-root, -Xmx512m)
                                      └─ mysql:9.2.0 (named volume mysql-data, on the box)
                                      └─ AWS S3 private bucket (resume files)   ← FileStorage seam to come (local first)
GitHub Actions: ci.yml (PR + develop/main) · deploy.yml (main → GHCR → ssh root@box → compose pull/up :latest) · publish-extension.yml (tag → CWS)
```

Evidence: `docker-compose.prod.yml`, `docker-compose.shared-edge.yml`, `MIGRATION.md` §10,
`DEPLOY.md` §7.1, §13.1 ("Memory is tight: 3.7 GB shared … ~1.1 GB free, 4 GB swap").

## 1. Feature-by-feature

| Capability | State | Real today | Gap | Evidence | → stories |
|---|---|---|---|---|---|
| **Database backups** | **partial** | `scripts/ops/backup-db.sh` (consistent `--single-transaction` dump, refuses cut-short dumps, sha256 metadata, daily/ + monthly/ prefixes, keeps 3 locally, Healthchecks pings), upload-only IAM policy + lifecycle JSON, cron file, CI job runs it against a real MySQL | **Never run on the box.** No bucket, no IAM user, no Healthchecks account, cron not installed, `develop` not promoted so the scripts aren't even on the box. RPO = ∞ today; nightly dump = 24 h RPO once live. No binlog/PITR. `mysql-data` is a plain named volume on one disk. | `scripts/ops/backup-db.sh`, `scripts/ops/aws/*.json`, `scripts/ops/kiwiply-ops.cron`, `.github/workflows/ci.yml:116-126`, `DEPLOY.md` §5.1, `MIGRATION.md` §8, `PROGRESS.md:1158-1168` | P0.1, P0.2, P0.4 |
| **Restore drill** | **partial** | `scripts/ops/verify-restore.sh` restores newest dump into a throwaway container weekly, checks sha256/age/tables/row counts; tested in CI | Never performed on production. No measured RTO. No full-box rebuild rehearsal (MIGRATION.md §9.1 was written *during* the real loss, not rehearsed). | `scripts/ops/verify-restore.sh`, `scripts/ops/test/ops.test.sh`, `DEPLOY.md` §5.3 | P0.1, P0.4 |
| **Secrets / `.env` custody** | **partial** | `.env` gitignored, every secret env-only, docs insist on the password manager; GitHub secrets write-only; inbox key has a fingerprint log line | No script verifies the password-manager copy matches the box (fingerprints exist only for the inbox key). No rotation calendar; JWT secret rotation = sign everyone out. `.env` file mode not enforced. The 2026-09-17 loss was precisely an un-escrowed `.env`. | `.env.example`, `DEPLOY.md` §11, §12, `CLAUDE.md` locked decisions | P4.6 |
| **File storage** | **partial** | `ResumeStorageService` interface + `S3ResumeStorageService` (AWS SDK v2, per-user keys, sanitised names, proxied downloads, no public bucket); MinIO in dev/tests | User decision (2026-10-11, `docs/RESUME-BUILDER-DECISIONS.md`): **local filesystem first**, S3 later by config. No local driver, no `FileStorage` seam name, no backup of local files, no orphan sweep (S3 blobs from before 2026-09 are orphaned today). Javadoc still says "Cloudflare R2". | `api/src/main/java/com/dossier/api/service/ResumeStorageService.java`, `S3ResumeStorageService.java`, `config/StorageConfiguration.java`, `application-prod.yml` `dossier.storage.*` | P5.1–P5.5 |
| **Uptime monitoring** | **missing** | — | Nothing watches the hostnames. "That is how the old VPS's death went unnoticed." Plan names UptimeRobot (free tier is "hobby and non-profit"). | `MIGRATION.md` §8, `DEPLOY.md` §5.2 | P1.1 |
| **Public status page** | **missing** | — | Competitor Simplify runs one (incident.io; components Website/Job Search/Copilot, 99.96–100 % shown). Admin design D7 says "the announcement banner is the status page" — not enough once Pro is paid. | `docs/design/admin/observability-backup-incident.md` D7 | P1.2 |
| **Error alerting** | **real** | 15.1b `ErrorDigestAppender` → one email per ≤15 min, grouped by kind, via Brevo; ignore-list env | Email only; no push/SMS; no severity; no dedupe across restarts; silent if Brevo is down. | `api/src/main/java/com/dossier/api/service/ops/*`, `DEPLOY.md` §5.2 | P1.3 |
| **Alert routing / on-call** | **missing** | — | One person, one email inbox, no escalation, no "the box is dead" path independent of the box. | — | P1.3 |
| **Metrics (API latency, error rate)** | **missing** in prod | JHipster `jhimetrics` endpoint exists (admin-only); `management.prometheus.metrics.export.enabled=false` in prod; dev-only Prometheus/Grafana compose | Admin A10.3 designs a `request_metric_minute` rollup; nothing emits it. No SLOs defined. | `application-prod.yml:21-25`, `api/src/main/docker/monitoring.yml` | P1.4, relates A10.3 |
| **Host metrics / disk-full guard** | **missing** | — | Disk/mem/swap unmonitored on a box where memory is the known constraint. Docker log driver unlimited (default json-file) → disk can fill silently. | `docker-compose.prod.yml` (no `logging:` block) | P1.5, P1.6 |
| **Synthetic end-to-end probe** | **missing** | `scripts/migrate/04-verify.sh` is a manual smoke (DNS/TLS/health/web) | Nothing exercises sign-in → profile → extension sync continuously. | `scripts/migrate/04-verify.sh` | P1.7 |
| **CI** | **real** | Extension tests, web tsc/eslint/build, web Docker build + runtime smoke, ops scripts, API unit + Testcontainers IT; correct per-SHA concurrency; `actions/*@v7` | Actions pinned by tag not SHA; no `permissions:` block on `ci.yml`; no Dependabot; no dependency/image scanning; no secret scanning; no branch protection documented; web has no unit/e2e tests (U19.3). | `.github/workflows/ci.yml` | P2.6 |
| **Deploy pipeline** | **real** | On merge to `main`: build api+web on runners → GHCR `:latest` + `:sha` → `appleboy/ssh-action` as **root** → `git pull --ff-only` → `compose pull && up -d` with overlay | `:latest` is what runs → rollback is a manual retag (DEPLOY §13.3). `up -d` = stop-then-start = **~30–60 s downtime per deploy** (API boot + Liquibase). No pre-deploy DB snapshot. No post-deploy verification. Root SSH with an unrestricted key. `DEPLOY_ENABLED` snapshot trap. | `.github/workflows/deploy.yml`, `DEPLOY.md` §7.1–§7.3, §13.3 | P2.1–P2.5 |
| **Schema migration safety** | **partial** | Liquibase synchronous in prod (`async-start:false`), additive-only convention in CLAUDE.md, §13.1 review done by hand | One rename (13.1b) already made rollback a dump-restore. No CI lint for destructive changesets; no expand/contract rule written down. | `application-prod.yml` `application.liquibase.async-start`, `DEPLOY.md` §13.1 | P2.3 |
| **Zero-downtime / health gating** | **missing** | MySQL has a healthcheck; api/web do not; `depends_on` for web is unconditional | Readiness probes exist (`/management/health/readiness` incl. db) but nothing uses them. | `docker-compose.prod.yml:22-26,146-147`, `application.yml` probes | P2.2 |
| **Environments** | **missing** | prod only; local = `api/src/main/docker/{mysql,minio}.yml` + `npm run dev`; mock API for demo | No staging. BeeCompete runs `staging-web` on the same box, so the edge convention exists. `develop` → `main` promotions (~50 PRs) are tested only locally and in CI. | `DEPLOY.md` §13, `MIGRATION.md` §10 | P3.1–P3.3 |
| **Config schema** | **partial** | Every var has a compose default; `.env.example` documented; startup checks log (inbox key, mail, Stripe blank-secret ERROR) | No single typed env schema; `.env.example` can drift from compose (13.1a found three vars "never passed through"). | `docker-compose.prod.yml:68-71` comment | P3.4 |
| **HTTP security headers** | **missing** | Edge Caddy `import common` (outside repo, unverified) | Neither `web/next.config.ts` nor `SecurityConfiguration.java` sets CSP/HSTS/Referrer-Policy/Permissions-Policy/frame-ancestors (grep empty). | `web/next.config.ts`, `api/.../config/SecurityConfiguration.java` | P4.1 |
| **Actuator exposure** | **partial** | `/management/health`, `/health/**`, `/info`, `/prometheus` permitAll; everything else `ROLE_ADMIN`; `env`/`configprops`/`threaddump`/`logfile` in the exposure list | `info` with `git.mode: full` leaks commit/branch/build to anyone (admin audit A0.2 flags this); `env`/`configprops` exposed at all is a foot-gun even behind admin. | `SecurityConfiguration.java:68-72`, `application.yml:27-56` | P4.2, relates A0.2 |
| **Rate limiting** | **partial** | Next BFF: per-IP fixed window for login/signup/reset, trusts the **last** XFF hop; API filter: same rules, **off by default**, trusts the **first** XFF hop (spoofable), per-instance | API is called directly by the extension and by anyone → `/api/authenticate` is unlimited at the API. `server.forward-headers-strategy` only set in dev. | `web/src/lib/rate-limit.ts`, `api/.../web/filter/RateLimitFilter.java:98-100`, `application.yml:245-251`, `application-dev.yml:65` | P4.3, relates A0.2 |
| **Container/host hardening** | **partial** | Non-root users in both images; graceful shutdown; `restart: unless-stopped`; fail2ban on the box | No `mem_limit`/`cpus` (our 512 MB heap can still push BeeCompete into swap); no `read_only`/`no-new-privileges`; no log rotation; base images by tag not digest; root deploy user; SSH key unrestricted. | `docker-compose.prod.yml`, `api/Dockerfile`, `web/Dockerfile`, `DEPLOY.md` §7.1 | P4.4, P2.5 |
| **Supply chain** | **missing** | — | No Dependabot/Renovate, no `npm audit`/OWASP check, no Trivy, no SBOM, no gitleaks, workflow actions by major tag. | `.github/` (no `dependabot.yml`) | P4.5, P4.6 |
| **Vulnerability disclosure** | **missing** | `support@kiwiply.com` exists | No `/.well-known/security.txt`, no disclosure policy page. | — | P4.7 |
| **DNS / TLS posture** | **partial** | Cloudflare DNS-only, Let's Encrypt via edge Caddy, apex canonical, 301s | Grey-cloud = no DDoS/WAF/bot protection; no CAA record documented; no HSTS preload; no DNSSEC documented. | `DEPLOY.md` §9.1 (DNS records), `MIGRATION.md` §0 | P4.8 |
| **Capacity** | **partial** | Heap capped 512 MB; MySQL defaults; §13.1 numbers | No load test, no baseline, no capacity model for Autopilot (300 preps/user/month) or job ingest (217 boards). Own server required "before Phase 21" (ROADMAP). | `DEPLOY.md` §13.1, `ROADMAP.md:1241` | P6.1–P6.4 |
| **Incident response** | **missing** | §7.3 deploy traps, §13.3 rollback, §5.3 disaster restore are the only runbooks | No severity scale, no comms templates, no postmortem format, no runbook index (admin D8 expects `docs/runbooks/*.md`). | `DEPLOY.md` §5.3, §7.3, §13.3 | P7.1–P7.3 |
| **Dependency outages** | **partial** | Mail failure never fails a webhook; Stripe blank = disabled state; AI `{"disabled":true}` | No per-provider timeout/retry/circuit policy written or tested; Gemini/Brevo/IMAP/AWS outages surface as digests at best. | `DEPLOY.md` §11.1 F, `BillingWebhookService` | P7.4 |
| **Extension release pipeline** | **real** (Chrome) | Tag `ext-v*` → tests → GA inject → WXT build → manifest-limit check → zip artifact → CWS publish (flag-gated) | Firefox AMO and Edge are manual; no release notes generation; no rollback (CWS has none — staged rollout only via CWS %). | `.github/workflows/publish-extension.yml`, `DEPLOY.md` §8 | P2.7 |
| **Admin observability surface** | partial (admin area) | `/admin/system` reads actuator; sample tiles | Owned by A10.* — this area supplies the data (Healthchecks, deploy hook, host stats) that A10.3/A10.4 read. | `docs/design/admin/observability-backup-incident.md` | relates A10.2–A10.6 |

## 2. Cross-cutting findings (ordered by how much they can hurt)

1. **RPO is infinite and nobody would know the box died.** 15.1a/b are built; 15.1c (the human
   half) has not happened; uptime monitoring is a line in a doc. Everything else in this plan is
   secondary to P0.1 + P1.1 (two sessions, mostly runbook).
2. **Every deploy is a brief outage and `:latest` is the only pointer.** `compose up -d` restarts
   api (Liquibase + Spring boot ≈ 30–60 s) and web; rollback is a four-command manual retag.
   Fix = SHA-pinned deploys + healthchecked rolling restart (`docker rollout`) + pre-deploy snapshot.
3. **Shared-box blast radius runs both ways.** No memory limits on our containers; BeeCompete's
   containers can reach `dossier-api` on `web_edge` (MIGRATION §10.2 security note). Own server
   is already a ROADMAP commitment (before Phase 21).
4. **No staging.** The first `develop → main` promotion is ~130 commits; §13 is a careful review but
   still a review, not a rehearsal. BeeCompete already runs a staging stack on the box — the pattern
   is free.
5. **The API is a public origin with no header hardening, a leaky `/info`, and an off-by-default
   limiter.** All cheap to fix; all visible to a security-minded reviewer (or a CWS reviewer).
6. **The storage decision inverts the current code.** Local-first means the box's disk becomes
   user-data storage, so the backup story must grow a second leg (files) *before* R0.6 ships.

## 3. Competitive benchmark (checked 2026-10-11)

What the products Kiwiply is measured against actually publish about reliability and security,
plus the practices a one-person team should copy. Research was by direct page fetch; where a
page did not exist or returned nothing, that is recorded rather than guessed.

| # | Product / practice | What they publish (as found) | Kiwiply: beat / match / don't copy | Source |
|---|---|---|---|---|
| 1 | **Simplify (simplify.jobs)** — closest competitor (Copilot autofill extension + job search) | A public **status page on incident.io** with three components (Website, Job Search, Copilot), 90-day uptime bars (100 % / 99.96 % / 100 % for Jul–Oct 2026), "Subscribe to updates", linked from the privacy page footer. Privacy policy names only "encryption and access controls", no hosting provider, **no SOC 2 or audit**, no breach-notification timeline, Gmail metadata-only. Extension stores profile/resume locally on the device. | **Match** the status page within a quarter (P1.2) with components that mean something to a job seeker (Web app, API/extension sync, Email, Job matches, Billing). **Beat** on honesty: publish RPO/RTO, the last restore-drill date and the subprocessor list on a `/trust` page (P7.3) — Simplify publishes none of that. **Don't copy** the vagueness ("appropriate measures"). | https://status.simplify.jobs/ · https://simplify.jobs/privacy |
| 2 | **Teal (tealhq.com)** — tracker + resume builder | Privacy policy says encryption "in transit and at rest", "regular security assessments", 30-day deletion after account close, backup copies removed per an unspecified schedule, names Stripe/OpenAI/Google Analytics/Impact.com as processor examples. `/security` returns 403; `status.tealhq.com` does not resolve. **No status page, no SOC 2.** | **Match** the 30-day deletion promise and the at-rest encryption claim (MySQL volume + S3 SSE + local-disk encryption, P5.2). **Beat** by publishing a *complete* subprocessor list (A9.7) and a status page. | https://www.tealhq.com/privacy-policy |
| 3 | **Huntr (huntr.co)** — tracker/CRM | Privacy policy (Feb 2024) says "secured servers", no encryption statement, no hosting provider, no breach process, no retention period. `/security` has no content; no status page found. | **Beat** across the board; this is the floor, not the bar. | https://huntr.co/privacy |
| 4 | **Jobscan (jobscan.co)** — ATS resume scanner | `/security` → 404; `status.jobscan.co` does not resolve; the privacy page rendered only navigation (policy body not captured). Footer carries **WCAG 2.1 AA / ADA** badges. Third-party commentary: deletion via support chat, no published retention window. | **Match** the accessibility signalling (owned by U19/trust). **Beat** with a self-serve deletion that completes on a published clock (exists: `AccountDeletionResource`) and a published retention table. | https://www.jobscan.co/privacy · https://venture-lab.org/2026/resume-scanner-data-retention-questions/ |
| 5 | **SOC 2 in this category** | None of the four publishes a SOC 2 report or trust center. Chrome Web Store requires only self-reported data disclosures and the Limited Use certification, not audits. | **Don't copy** the audit race yet: a SOC 2 Type II costs $20–50k+/yr and buys nothing against competitors who don't have one. **Beat** with *evidence*: public status, restore-drill log, security.txt, disclosure policy, subprocessor page — the artefacts a SOC 2 would produce, published directly. Revisit SOC 2 when an Organization (Phase 19) customer asks (trust area). | https://9to5google.com/2020/11/18/chrome-web-store-disclosure/ |
| 6 | **Healthchecks.io** (cron/heartbeat monitoring) | Free Hobbyist tier: 20 checks, 100 log entries per check; Supporter $5/mo same limits; open source and self-hostable. The plan already pings it from the backup and drill scripts. | **Adopt** (already chosen): backup, drill, nightly jobs, file backup, binlog shipper each get a check. Pay the $5 Supporter tier — it is a business. | https://healthchecks.io/pricing/ |
| 7 | **UptimeRobot vs Uptime Kuma** (external uptime + status page) | UptimeRobot free: 50 monitors / 5-min / 1 status page, described as "good for hobby and non-profit projects"; Solo $12/mo annual. Uptime Kuma: self-hosted, MIT, built-in status pages, 20-s intervals, push monitors — but it lives on a box, so it cannot watch the box it lives on. | **Match** lean practice: an **external, paid** monitor (UptimeRobot Solo or equivalent, ~$12/mo) hosting the public status page off-box, so "the box is dead" is still visible. **Don't** self-host the only uptime monitor on the production box. | https://uptimerobot.com/pricing/ · https://uptimerobot.com/knowledge-hub/comparisons-and-alternatives/uptime-kuma-alternatives/ |
| 8 | **docker-rollout** (zero-downtime Compose deploys) | MIT CLI plugin: `docker rollout <service>` scales to 2×, waits for the Docker healthcheck, removes the old container; needs no `container_name` and no `ports:` (both already true for api/web), a reverse proxy in front (the shared edge Caddy proxies to the `dossier-web`/`dossier-api` aliases, which Docker DNS round-robins across replicas), optional drain hook for zero dropped requests. | **Adopt** (P2.2). It removes the per-deploy outage without touching the edge Caddyfile. Caveat: memory doubles for ~60 s during the API roll — needs the P6.1 limits first. | https://github.com/Wowu/docker-rollout |
| 9 | **SHA-pinned images + one-variable rollback** (lean-team deploy practice) | Tag every build with the commit SHA (done); run from a pinned tag, not `:latest`; keep the running tag in one file the deploy script reads, so rollback is rewriting one value and `up -d`. | **Adopt** (P2.1). GHCR already holds `:sha` tags — only the pointer is missing. | https://servercompass.app/learn/11-production-grade |
| 10 | **MySQL PITR via binlog shipping** (backup practice) | Nightly dumps give a 24 h RPO; continuous binlog capture (ROW format, `sync_binlog=1`, dumps taken with `--source-data=2`) shipped off-box closes it to minutes; drills must replay the chain, not just the base; 3-2-1 copies; delete-restricted off-site bucket (done). | **Adopt** after 15.1c (P0.2): a 15-min binlog shipper to the same no-delete bucket; drill = base + replay to a timestamp (P0.4). | https://oneuptime.com/blog/post/2026-03-31-mysql-continuous-binary-log-backup/view |
| 11 | **Cloudflare proxy (orange-cloud) in front of a self-hosted origin** | HTTP-01 ACME keeps working through the proxy unless Under Attack mode / managed challenges answer the request; Bot Fight Mode on Free cannot be skip-ruled; DNS-01 removes the dependency. | **Evaluate, don't assume** (P4.8): orange-cloud would add free DDoS/WAF and hide the origin IP, but the edge Caddy's ACME is BeeCompete's too — needs their agreement and a DNS-01 or path-exempt plan. Keep grey until then. | https://stackharbor.com/en/knowledge-base/cffix-lets-encrypt-http01-behind-proxy/ |

**Reading of the field:** no competitor in this category publishes more than a status page (one of
four) and policy boilerplate. The bar for "best reliability posture" is therefore low and cheap to
clear: a real status page, published RPO/RTO with drill evidence, security.txt, a subprocessor
list, and a 30-day deletion clock. The expensive signal (SOC 2) is absent across the board and
should wait for a paying organization to ask for it.

## 4. Honest status counts for `areas/plat.json`

`done` = exists, tested, and running the way the AC describe (15.1a scripts + CI job, 15.1b digest,
CI baseline, GHCR build + ssh deploy, shared-edge overlay, S3 storage baseline, CWS publish).
`partial` = code exists but not live or not complete (deploy pipeline pointer, rate limiting,
actuator exposure, config schema, extension multi-store release). `not_started` = everything else.
Counted in `PLAN-plat.md` §5.

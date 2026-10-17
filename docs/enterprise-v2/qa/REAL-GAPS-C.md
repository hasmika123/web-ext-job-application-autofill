# REAL GAPS C - areas `trust`, `plat`, `sup` (audit 2026-10-16)

Read-only audit of branch `version2`. Nothing was built or run; "unverified" = could not be confirmed from the repo alone.
Verdicts: DONE / PARTIAL / NOT BUILT / DEFERRED (billing; none of the 162 stories here are billing items).
Importance: BLOCKER = do not take a first paying customer without it; IMPORTANT; LATER.

## 0. Headline answers

| Topic | Real state |
|---|---|
| **Backups** | Automation EXISTS in the repo and on `main` since 2026-10-06: `scripts/ops/backup-db.sh` (mysqldump, sha256, upload-only S3 key, 3 local copies, Healthchecks ping), `verify-restore.sh` (weekly drill), `kiwiply-ops.cron`, `aws/backup-user-policy.json` + `lifecycle.json`, CI job "Ops scripts" (real MySQL round trip). **Nothing proves it runs.** PROGRESS 15.1c is unchecked (bucket, IAM user, Healthchecks, cron install, first dump, first drill are all "needs you"); `docs/HANDOFF.md` still says "Both crontabs empty". Treat as: **no backup is running until you confirm** `/etc/cron.d/kiwiply-ops` exists and a dump is in the bucket. No PITR/binlog shipping, no encryption of dumps, no backup of the `uploads` volume. |
| **Monitoring / alerting** | Only the server-error email digest (`service/ops/ErrorDigest*`, at most every 15 min). No uptime monitor config (UptimeRobot is a manual-account step in DEPLOY 5.2), no host-guard, no canary, no status page. |
| **Rate limits** | Two layers: Next BFF `web/src/lib/rate-limit.ts` used by 16 `app/api` routes (auth, forgot-password, demo...), plus API throttles (`ScopedLoginThrottle`, `ConnectCodeThrottle`, `JoinRateLimiter`, `PublicShareRateLimiter`). The generic API `RateLimitFilter` is OFF by default (`RATE_LIMIT_ENABLED=false`, the API only sees the proxy IP). No trusted-proxy config in prod. |
| **GDPR/CCPA export + deletion (1.11)** | Built, synchronous: `GET /api/account/export` (`AccountExportService`), `DELETE /api/account` (`AccountDeletionService`: storage first, then rows, one transaction, tokens revoked, Stripe cancelled, inbox purged). Missing: completeness proof (data-map test), async ZIP with files, 24 h undo, backup purge-on-restore, email-intake requests. |
| **Refresh-token rotation** | DONE (`RefreshTokenService`: per-jti row, family id, rotate on use, replay revokes the family, revoked on logout/deletion/admin action). Gap: no scheduled purge of expired/revoked rows (unverified: no `@Scheduled` found). |
| **Security headers** | Only tenant hosts get them (`web/src/lib/tenant-headers.ts`: nosniff, X-Frame-Options, Referrer-Policy). The personal site `kiwiply.com` has NO CSP/HSTS/frame/permissions headers in `next.config.ts`, `Caddyfile` or the API; the shared edge Caddy is outside the repo (HSTS unverified). Actuator exposes `env`, `configprops`, `threaddump`, `logfile`, `loggers` (admin-only) while `/info` and `/prometheus` are public. |
| **Audit retention** | `admin_audit_event` + `AdminAuditService`, org audit and job-data audit exist; NO retention job for them. Purge jobs that exist: inbox, tracker history, enterprise history, onboarding drafts, resume view events, idempotency, connect codes, demo reset. |
| **PII scanner** | Strong: `SensitivePatterns` (SSN/ITIN, routing/account/IBAN, tax id, passport, visa doc, DOB) with a JS twin in `packages/ui` and a shared corpus; wired into ~25 enterprise services, `ProfileItemService`, application notes, `AiRouter`, `ResumeAiService`. Not found (unverified) on the resume-file parse path, extension learned answers, bug-report free text. |
| **Error pages / status page** | No `error.tsx`, `global-error.tsx` or root `not-found.tsx` for the personal site (only `(tenant)/not-found.tsx`); no `/status`, no incident model. |
| **Support tooling** | Floating `BugReportWidget` + `BugReport` + admin triage (`/admin/bug-reports`, status/severity/notes, audited), sales `inquiries`, contact page "Help & support" topic that is a `mailto:support@kiwiply.com`. No `/help`, tickets, replies or macros. No admin impersonation of personal users exists (only audited org "act-for" for marketers); the staff-access rule is unwritten. |
| **Secrets handling** | Env-only keys, AI keys sanitised in `/management/env`, inbox creds AES-GCM at rest, `.env.example` holds no values. Missing: rotation runbook, JWT dual-key, secret scanning in CI, written custody of `.env`. |

## 1. AREA trust (56 stories)

| id | title | verdict | evidence | missing | size | importance |
|---|---|---|---|---|---|---|
| T0.1 | Lawyer-review register + counsel brief | PARTIAL | `docs/design/trust/legal-review-register.md` | brief not sent; needs counsel | M | IMPORTANT - paid terms/privacy need review (ROADMAP 15.2) |
| T0.2 | Record terms acceptance | FIXED (34f66fe0 + 110e4632: `terms_acceptance` table, `GET/POST /api/account/terms-acceptance`, versions in settings `legal.*`, in export and erasure; the sign-up screen does not call it yet, see HANDOFF) | no acceptance table/column in Liquibase (JSON says partial) | accepted_version + timestamp | M | IMPORTANT - proof of consent |
| T0.3 | Versioned policy content + changelog | PARTIAL | terms/privacy pages have a `Last updated` const | versions in repo, changelog page | S | LATER |
| T0.4 | Material-change notice + re-accept | NOT BUILT | none | email + sheet | M | LATER |
| T0.5 | Post-review copy landing | NOT BUILT | blocked on T0.1 | - | S | LATER |
| T0.6 | Org terms/DPA hooks | NOT BUILT | none | versioned org terms at org create | M | IMPORTANT - first org will ask for a DPA |
| T1.0 | Privacy baseline | DONE | export + erasure + inbox rules | - | - | - |
| T1.1 | Data map as code | FIXED (34f66fe0 + 110e4632: `DataMap`/`DataClass`, `DataMapIT` reads the live schema; RoPA text not written) | no DataClass/DataMapTest | enum, test, RoPA | L | IMPORTANT - proves export/erasure completeness |
| T1.2 | DSAR export v2 | FIXED (34f66fe0 + 110e4632: async job, ZIP with files, size cap, signed expiring link; bug reports, inquiries and terms added to the JSON export) | `AccountExportService` sync JSON | async ZIP with files, signed link | M | IMPORTANT |
| T1.3 | Deletion completeness | FIXED (34f66fe0 + 110e4632: undo window, purge report with census before/after, bug reports, contact messages, AI quota and admin challenges now erased; backup purge-on-restore is T1.9 and not built) | `AccountDeletionService` | enumerated check, 24 h undo, downstream purge | M | IMPORTANT |
| T1.4 | Retention catalogue + jobs | FIXED (34f66fe0 + 110e4632: admin audit, refresh-token, AI call, bug report and deletion-report sweeps with lease, dry run, audit) | 8 purge jobs | audit, refresh-token, ai_call, bug-report retention | M | IMPORTANT |
| T1.5 | Subprocessor register + DPA tracker | NOT BUILT | none | page + tracker | S | IMPORTANT - customers ask |
| T1.6 | AI provider no-training tier + DPA | NOT BUILT | unverified | contract/tier decision | S | IMPORTANT - user action |
| T1.7 | GPC + consent mirrored | PARTIAL | `CookieConsent.tsx` (equal accept/decline, GA after accept) | GPC, server mirror | S | LATER |
| T1.8 | Email privacy requests intake | NOT BUILT | none | privacy@ flow | M | LATER |
| T1.9 | Backups/logs in privacy promise | NOT BUILT | no purge-on-restore | re-delete list on restore, 30-day log cap | M | IMPORTANT - needs backups first |
| T2.1 | Neutral age screen 16+ | NOT BUILT | no age gate in signup (JSON says partial) | screen + wording | S | IMPORTANT - minor-data exposure |
| T2.2-T2.5 | Under-age handling, school org 16+, minor defaults, age copy | NOT BUILT | none | all | M | LATER |
| T3.1 | AI feature register as code | NOT BUILT | no `AiFeature` enum (config kill-switch list only) | enum + doc-sync | M | LATER |
| T3.2 | AiDisclosure + structured why | PARTIAL | resume-builder suggestions show reasons; no shared component | rest of AI outputs | M | LATER |
| T3.3 | Sensitive-field firewall test | PARTIAL | `SensitivePatterns` in AiRouter/ResumeAiService | explicit EEO/DOB-never-reaches-AI test | S | IMPORTANT - cheap, backs a public claim |
| T3.4 | Attestation guard | PARTIAL | no-tick rule in extension rules; fixtures unverified | fixtures | S | IMPORTANT |
| T3.5 | AI regulatory memo | NOT BUILT | blocked | counsel | M | LATER |
| T3.6 | Fairness check | NOT BUILT | none | - | M | LATER |
| T3.7 | AI provenance | PARTIAL | `ai_call` rows; prompt_version unverified | columns | S | LATER |
| T3.8-T3.9 | Interview-integrity statement, work-auth rules | NOT BUILT | none | copy/rules | S | LATER |
| T4.1-T4.6 | Accessibility statement, CI a11y gate, ui contract, SR audit, drawer a11y, ACR | NOT BUILT | no /accessibility, no axe in CI | all | L | IMPORTANT for T4.1/T4.2 (org procurement); rest LATER |
| T5.1 | security.txt + disclosure policy | NOT BUILT | no file in repo | file, page, security@ | S | IMPORTANT - an hour of work |
| T5.2 | HTTP security headers + CSP | FIXED (061da2d7: API headers, main site headers with report-only CSP; Caddy extras in 62b-edge-rules.md) | tenant hosts only | CSP report-only, HSTS, frame, Permissions-Policy on main site + API | M | BLOCKER - cheap, any buyer scan flags it |
| T5.3 | Supply-chain scanning | NOT BUILT | no dependabot.yml, gitleaks, audit, Trivy in workflows | all | M | IMPORTANT |
| T5.4 | Public /security page | NOT BUILT | none | page | S | IMPORTANT |
| T5.5 | Incident + breach runbook | FIXED (404cd911: `docs/ops/incident-runbook.md` severities, first 15 minutes, containment by scenario, secret rotation, evidence, 72 h GDPR / 48 h org clocks, templates, breach register); counsel review (L12) still open | no `docs/runbooks` | runbook (72 h GDPR, orgs 48 h) | S | BLOCKER - real data needs a written process |
| T5.6 | External pen test | NOT BUILT | none | vendor | L | LATER (before org sales) |
| T5.7 | Secrets custody + rotation | NOT BUILT | single JWT secret, no dual key | calendar, runbook | M | IMPORTANT |
| T5.8 | SOC 2 readiness | NOT BUILT | none | - | L | LATER |
| T5.9 | Extension hardening | PARTIAL | `externally_connectable` restricted in `wxt.config.ts`; MV3 default CSP | prod test, message-origin checks (unverified) | S | IMPORTANT |
| T6.1 | CWS Limited-Use conformance | PARTIAL | store listing work merged (PR #122) | destination inventory (unverified) | S | IMPORTANT - store rejection risk |
| T6.2-T6.4 | Permissions explainer, 'what left this page', store privacy generated | NOT BUILT | none | all | M | LATER |
| T7.1 | /trust hub | NOT BUILT | none | page | M | LATER |
| T7.2 | Privacy nutrition label | PARTIAL | privacy copy only (unverified) | at signup/onboarding | S | LATER |
| T7.3 | 'Who looked at my data' ledger | NOT BUILT | admin audit exists, no user view | user ledger | M | LATER |
| T7.4-T7.5, T8.1-T8.2 | Claims register, transparency report, watch log, doc-sync CI | NOT BUILT | none | - | S | LATER |

## 2. AREA plat (51 stories)

| id | title | verdict | evidence | missing | size | importance |
|---|---|---|---|---|---|---|
| P0.0 | Backup + restore-drill scripts | DONE | `scripts/ops/*`, CI job `ops` | - | - | - |
| P0.1 | Backup go-live | PARTIAL (repo side done in 404cd911 + 132417e0: scripts, cron file, DEPLOY 5.1-5.7 steps, HANDOFF corrected; the bucket, IAM, Healthchecks, cron install, first dump and drill are still the user's) | PROGRESS 15.1c unchecked | bucket, IAM user, Healthchecks, cron install, first dump + drill | S (user) | BLOCKER - the 2026-09-17 loss repeats without it |
| P0.2 | Binlog shipping (RPO 15 min) | NOT BUILT | none | shipper + cron | M | IMPORTANT - nightly = up to 24 h loss |
| P0.3 | age-encrypted dumps | FIXED (404cd911: `BACKUP_AGE_RECIPIENT` / `BACKUP_GPG_RECIPIENT` encrypt the dump, the pre-deploy snapshot and the uploads archive, fail closed if the tool is missing; `verify-restore.sh --identity` decrypts; 132417e0: key custody in DEPLOY 5.7). Off until the user sets a recipient | none | key custody + script | S | IMPORTANT - dumps hold all PII in S3 |
| P0.4 | Monthly PITR drill | NOT BUILT | needs P0.2 | - | M | LATER |
| P0.5 | Uploads volume backup | FIXED (404cd911: `scripts/ops/backup-uploads.sh`, nightly, archive + sha256 manifest, optional encryption, 30-day lifecycle rule, HC_UPLOADS_URL; 132417e0: DEPLOY 5.7 incl. restore). Cron install is the user's | DEPLOY says "back it up too", no script | script + manifest | S | BLOCKER if prod driver is `local`, else IMPORTANT (driver unverified) |
| P0.6 | Fresh-box rebuild drill | NOT BUILT | none | quarterly drill, S3 versioning | M | IMPORTANT |
| P1.0 | Server-error email digest | DONE | `service/ops/ErrorDigest*` | - | - | - |
| P1.1 | External uptime monitors | NOT BUILT | manual accounts in DEPLOY 5.2 only | monitors | S (user) | BLOCKER - HANDOFF: "you find out by visiting it" |
| P1.2 | Public status page | NOT BUILT | no /status | page or hosted | M | IMPORTANT |
| P1.3 | Alert routing | NOT BUILT | email only | push, severities | S | IMPORTANT |
| P1.4 | SLOs | NOT BUILT | none | - | S | LATER |
| P1.5 | Log rotation + JSON logs | FIXED (404cd911: `logging:` json-file 5 x 10 MB compressed on every service in `docker-compose.prod.yml`, `kiwiply-logrotate.conf` for the ops logs; 132417e0: DEPLOY 5.6) | no `logging:` block in prod compose | max-size/max-file | S | IMPORTANT - disk fill hurts shared box |
| P1.6 | host-guard.sh | FIXED (404cd911: `scripts/ops/host-guard.sh` disk, memory/swap with strikes, container restarts, certificate days, /fail ping with reasons, cron every 5 min; DEPLOY 5.6 in 132417e0). Healthchecks check + cron install are the user's | none | disk/mem/cert pings | S | IMPORTANT |
| P1.7 | Synthetic canary | NOT BUILT | none | - | M | LATER |
| P2.0 | CI + GHCR + SSH deploy | DONE | `ci.yml`, `deploy.yml` (sha + latest tags) | - | - | - |
| P2.1 | SHA-pinned deploys + rollback | FIXED (404cd911: `deploy.sh --tag <sha>` never `latest`, `--rollback`, state in `~/kiwiply-deploy`, compose reads `DOSSIER_API_TAG`/`DOSSIER_WEB_TAG`; 132417e0: DEPLOY 5.4). `deploy.yml` itself is unchanged and still pulls `latest`; the one-line switch is documented, to be made after a manual run on the box | pulls `:latest`; sha tag is pushed | deploy.env, rollback | M | IMPORTANT |
| P2.2 | Post-deploy verification | PARTIAL (404cd911: `deploy.sh` waits for API health UP and web, runs public smoke URLs, rolls back on failure; `04-verify.sh` is not wired in and the GitHub pipeline is unchanged) | `04-verify.sh` manual | in pipeline | S | IMPORTANT |
| P2.3 | Pre-deploy snapshot + migration lint | FIXED (404cd911: `snapshot-db.sh` as the pre-deploy hook, aborts the deploy if the dump is cut short; `migration_lint` flags destructive Liquibase statements and refuses without `--allow-destructive-migrations`; it is a regex heuristic, not the CI lint of the design) | manual dump (DEPLOY 13.3) | automate | S | IMPORTANT |
| P2.4 | Zero-downtime rolling deploy | NOT BUILT | single API container | - | L | LATER |
| P2.5 | Drop root deploy user | NOT BUILT | scripts use `/root/...` | deploy user | M | IMPORTANT |
| P2.6 | CI hardening | NOT BUILT | actions on tags, no dependabot | perms, SHA pins | S | IMPORTANT |
| P2.7 | Extension release pipeline | PARTIAL | `publish-extension.yml` (CWS only) | AMO, Edge, GitHub Release | M | LATER |
| P3.1 | One local compose | NOT BUILT | three JHipster docker files | - | S | LATER |
| P3.2 | Staging stack | FIXED, repo side (404cd911: `docker-compose.staging.yml` own project/aliases/memory caps, `.env.staging.example` placeholders only, `deploy.sh --staging --build`; 132417e0: DEPLOY 5.5 with the edge blocks). DNS, the edge Caddy route and `.env.staging` are the user's | none | - | L | IMPORTANT - customer deploys hit prod |
| P3.3-P3.5 | Staging seed, env schema fail-fast, env header + maintenance mode | NOT BUILT | only JWT secret fails fast | - | M | LATER |
| P4.1 | Security headers + CSP | FIXED (061da2d7, same work as T5.2) | same as T5.2 | same work | M | BLOCKER (same item) |
| P4.2 | Actuator diet | NOT BUILT | exposure list still has env/configprops/threaddump/logfile | trim, `/info` admin-only | S | IMPORTANT |
| P4.3 | Trusted proxies + API limiter | PARTIAL | BFF limiter + 4 API throttles; generic filter off | forward-headers in prod, real-IP keying | S | IMPORTANT |
| P4.4 | Container/host hardening | NOT BUILT | no cap_drop/read_only/no-new-privileges | - | M | LATER |
| P4.5-P4.7 | Supply chain, secrets hygiene, security.txt | NOT BUILT | see T5.3, T5.7, T5.1 | same work | M | IMPORTANT |
| P4.8 | DNS/TLS posture | NOT BUILT | Cloudflare grey-cloud; CAA/HSTS unverified | user DNS actions | S (user) | LATER |
| P5.0 | S3 resume storage | DONE | `service/storage/s3/*` | - | - | - |
| P5.1 | FileStorage + LocalFileStorage | DONE | `FileStorage`, `LocalFileStorage`, `StorageConfiguration` | - | - | - |
| P5.2 | Disk as user data (507 guard) | NOT BUILT | none | min-free guard | S | IMPORTANT if driver is local |
| P5.3 | Sniffing, limits, Range | PARTIAL | 10 MB multipart limit only | MIME sniff, ETag/Range | M | LATER |
| P5.4-P5.5 | Driver migration, storage_object ledger + orphan sweep | NOT BUILT | none; S3 files from 2026-09-17 are orphaned | - | M | LATER |
| P6.1 | Container resource limits | PARTIAL | `mem_limit: 1g` on one service only | the rest | S | IMPORTANT - shared box, 3.7 GB |
| P6.2-P6.5 | k6, own-server move, capacity doc, MySQL hygiene | NOT BUILT | none | - | M-L | LATER |
| P7.1 | Runbooks per alert | NOT BUILT | `docs/runbooks/` absent; DEPLOY 5.3 covers restore only | - | M | IMPORTANT |
| P7.2 | Incident process | NOT BUILT | none | same as T5.5 | S | BLOCKER (same item) |
| P7.3-P7.4 | /trust facts, outage matrix | NOT BUILT | none | - | M | LATER |

## 3. AREA sup (55 stories)

Support today = `BugReportWidget` + `BugReport` + admin triage + `SalesInquiry` + mailto links. No `/help`, `/safety`, `/status`, `/feedback`, `/changelog` route and no drawer HelpSheet were found.

| id | title | verdict | evidence | missing | size | importance |
|---|---|---|---|---|---|---|
| S1.1, S1.2, S1.4, S1.5, S1.7 | /help route, search/index, article stats, accuracy table, link switch | NOT BUILT | contact page: "There is no /help route yet" | all | L | IMPORTANT (S1.1 minimum) |
| S1.3 | Launch content (~40 articles) | NOT BUILT | none (JSON says partial) | content | L | IMPORTANT |
| S1.6 | In-app Help sheet | NOT BUILT | only resume-builder sheets match (JSON says partial) | all | M | LATER |
| S2.1 | Ticket model + API + adapter | NOT BUILT | only `BugReport` | tickets | L | IMPORTANT - email-only does not scale past ~20 customers |
| S2.2 | My requests + thread UI | NOT BUILT | none | - | L | IMPORTANT |
| S2.3 | Contact 'Help & support' path | PARTIAL | topic exists, goes to `mailto:` | creates a ticket | S | LATER |
| S2.4 | Screenshot attachments | NOT BUILT | none | - | M | LATER |
| S2.5 | 'Message us' sheet | PARTIAL | `BugReportWidget.tsx` | sheet + ticket | M | LATER |
| S2.6 | Admin reply, macros, fan-out | PARTIAL | admin triage status/severity/notes | reply to user + email | M | IMPORTANT - cannot answer a user in-product |
| S2.7 | Ticket privacy cascade | NOT BUILT | bug reports in export/deletion unverified | DSAR/deletion/retention | S | IMPORTANT - PII in free text |
| S2.8 | Inbound email to ticket | NOT BUILT | none | - | M | LATER |
| S3.1-S3.8 | Scam rules, /safety, report-a-scam, extension banner, posting flags, blocklist, inbox label, checklist | NOT BUILT | none | all | L | LATER |
| S4.1 | Drawer HelpSheet | NOT BUILT | nothing under `job-autofill/entrypoints/panel` (JSON says partial) | - | M | LATER |
| S4.2-S4.5 | Site-didn't-fill report, fill thumbs, per-ATS status, unread dot | NOT BUILT | none (`FillTelemetryService` is a base) | - | M | LATER (S4.2 IMPORTANT for fill-quality loop) |
| S5.1-S5.6 | Feedback events, AI thumbs, feature board, changelog, CSAT/NPS, review prompt | NOT BUILT | none | - | M | LATER |
| S6.1-S6.4 | Help retrieval, AI help, drawer assistant, eval | NOT BUILT | needs S1 first | - | L | LATER |
| S7.1-S7.4 | Incident model, /status, banners, subscribe | NOT BUILT | none | - | L | IMPORTANT for S7.2 only (a hosted status page is ~1 h) |
| S8.1-S8.4 | Community / Discord | NOT BUILT | none | decision | M | LATER |
| S9.1-S9.5 | Metrics, tags, gap report, SUPPORT role, playbooks | NOT BUILT | no SUPPORT authority seen (unverified) | - | M | LATER (S9.4/S9.5 IMPORTANT once a 2nd person helps) |
| S10.1 | Published support policy | NOT BUILT | none | one page | S | IMPORTANT - sets expectations for paying users |
| S10.2-S10.4 | Support a11y, i18n, org routing | NOT BUILT | none | - | M | LATER |

## 4. Totals

| Area | DONE | PARTIAL | NOT BUILT | DEFERRED |
|---|---|---|---|---|
| trust (56) | 1 | 13 | 42 | 0 |
| plat (51) | 5 | 4 | 42 | 0 |
| sup (55) | 0 | 3 | 52 | 0 |
| **all (162)** | **6** | **20** | **136** | 0 |

Deferred billing/subscription ids in these areas: none identified.
Status drift: JSON marks T0.2, T2.1, S1.3, S1.6, S4.1 `partial`; the code shows nothing built for them. No story marked `not_started` was found built. T5.9, T6.1, P2.7 `partial` are fair.
Grouped rows above (for example "T4.1-T4.6", "S3.1-S3.8") all share one verdict, so counts are per story id.

## 5. Top 10 real gaps (priority order)

1. **P0.1 Backups actually running** (S, user action). Scripts are done and CI-tested; bucket, IAM user, Healthchecks and the cron were never set up (15.1c). Until a dump sits in the bucket and a drill is logged, 2026-09-17 can repeat.
2. **P1.1 + P1.6 + P1.5 Uptime monitor, host guard, log rotation** (S). Nothing tells you the box is down or the disk is full.
3. **T5.2 / P4.1 Security headers on main site and API** (M), plus the actuator trim (P4.2).
4. **T5.5 / P7.2 Incident + breach-notification runbook** (S, writing). A 72 h clock with no written process is a legal risk with real customer data.
5. **P0.5 Uploads volume backup, and confirm the prod storage driver** (S). Resume files are user data and are not in the DB dump if the driver is `local`.
6. **P0.3 + P0.2 Encrypt dumps; ship binlogs** (S + M). Dumps hold all PII in S3; nightly-only means up to 24 h of lost data.
7. **T1.1-T1.4 Privacy completeness** (L): data-map test, deletion completeness and undo, retention for audit/refresh-token/ai_call/bug-report, async export. Basic export and delete work, so this is hardening.
8. **T0.2 + T0.6 + T1.5 Terms acceptance record, org DPA, subprocessor list** (M). No proof anyone accepted terms; the first organization will ask for a DPA.
9. **S2.1 / S2.6 / S10.1 / S2.7 Minimum viable support** (L): tickets with replies, a published support policy, ticket data in export/deletion. Today support is an email address plus a bug widget with no reply.
10. **P3.2 + P2.1-P2.3 Staging and deploy safety** (L): deploys pull `:latest` to prod with no automatic verify, pre-deploy snapshot or rollback, and no staging.

Honourable mentions: T5.3/P2.6 (Dependabot, gitleaks, audit gate), T5.1 (security.txt), T2.1 (age screen), T3.3 (AI firewall test), main-site `error.tsx` / `not-found.tsx`.

## 6. What needs a decision or action from you

Actions only you can do (server / accounts):
1. **15.1c go-live:** create bucket `kiwiply-db-backups` (apply `scripts/ops/aws/lifecycle.json`), IAM user `kiwiply-backup` with `backup-user-policy.json`, put `BACKUP_*`, `HC_BACKUP_URL`, `HC_RESTORE_URL` in the box `.env`, run `install -m 644 scripts/ops/kiwiply-ops.cron /etc/cron.d/kiwiply-ops`, run `backup-db.sh` and `verify-restore.sh` once, log both in DEPLOY.md.
2. **Healthchecks.io and UptimeRobot (or similar) accounts;** monitors for `kiwiply.com`, `api.kiwiply.com/management/health` and TLS expiry.
3. **Off-box copy of `.env`** in a password manager (the 2026-09-17 lesson); confirm it exists.
4. **Confirm the prod storage driver** (`DOSSIER_STORAGE_DRIVER`: `s3` or `local`) so P0.5 can be sized.
5. **Shared edge Caddy** (`~/beecompete-edge/Caddyfile`, outside the repo): you apply any HSTS/header change there and confirm what it sends today.
6. **Cloudflare DNS:** CAA records and the DNSSEC decision (P4.8).
7. **DPAs and counsel:** Stripe, Brevo, AWS, Google AI tier (T1.5, T1.6); lawyer review (T0.1).

Decisions needed:
- Staff access rule for support: audited read-only views of a user's data (recommended) or impersonation? Nothing exists today; write the rule before building support tooling.
- Hosted status page (Instatus/Better Stack, about 1 h) vs building S7 in-house.
- Support at launch: email + ticket MVP (S2.1/S2.6) vs email only with a published policy (S10.1).
- RPO target: is nightly (24 h) acceptable for launch, or binlog shipping (P0.2) first?
- Keep the generic API rate limiter off (BFF only) or enable it with trusted-proxy config (P4.3)?
- Age gate (16+) wording, and whether to ship before counsel review (T2.1).

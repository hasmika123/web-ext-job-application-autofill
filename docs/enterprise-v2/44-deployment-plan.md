# 44 — Deployment plan: phased rollout behind flags, migration safety, the shared-edge change (user-applied), custom-domain ops, backups, monitoring, rollback, capacity, runbooks, go-live

> Status: design (Session E, task 3), 2026-10-12. Builds on `06-phase-plan.md` (phases, flags), `10-domain-routing.md` §5.3/§8 (edge snippet + runbook — **the user applies it**), ADR-002/022/023, `DEPLOY.md` (§5 backups, §13 promotion runbook, §10 monitors), `MIGRATION.md` §10 (shared edge). Locks: `main` auto-deploys (only the user promotes `develop → main`) · **never run our own Caddy** on the box (the BeeCompete edge owns :80/:443; always `-f docker-compose.prod.yml -f docker-compose.shared-edge.yml`) · no real charges / no irreversible customer-data migration without the user's go.
> Facts used: one box `74.208.212.158`, **3.7 GB RAM shared with BeeCompete (~1.1 GB free, 4 GB swap), 106 GB disk**; MySQL 9.2 container; API heap capped at 512 MB; Chromium PDF sidecar `mem_limit 1g, cpus 1.5`; Docker Compose + GHCR + SSH deploy; nightly off-box `mysqldump` 03:15 UTC + weekly restore drill; Healthchecks.io + UptimeRobot.
> `⚑ needs design review` marks judgment calls.

## 1. Environments

| Env | Purpose | Stack | Tenant hosts | Data | Notes |
|---|---|---|---|---|---|
| **Dev (laptop / agent)** | build + mock E2E | `npm run dev:demo` (Next + mock API), `./gradlew bootRun` against Docker MySQL for real-stack | `*.localhost:3100` (no TLS, no edge) | synthetic fixtures (`EntFixtures`, mock tenants) | `dossier.orgs.dev-activate` allowed; Stripe off |
| **CI** | gates | GitHub Actions; Testcontainers MySQL (prod version); compose smoke; dev-edge rehearsal (Caddy `local_certs`) | `*.localhost` | synthetic | secrets only for nightly Stripe clock job |
| **Edge rehearsal** | prove the Caddy snippet before the user touches the shared edge | `docker-compose.dev-edge.yml` (X3.6): `caddy:2` + `local_certs` + exact 10 §5.3 snippet → API ask | `https://acme.localhost`, `https://careers.acme.localhost` | synthetic | CI job + local optional |
| **Production** | the only live environment | the box; `develop → main` auto-deploy (`deploy.yml`) | `kiwiply.com`, `{label}.kiwiply.com`, customer domains | real | — |
| ~~Staging~~ | **not created** (⚑): the box has no memory for a second stack. Substitute = **pilot org in prod behind per-org flags** (`acme` demo org, platform-admin created, `*.localhost`-style test data labelled) + full compose rehearsal on the laptop/CI before every promotion | | | | Revisit if the box is upsized (§9) |

### 1.1 New configuration (env vs settings)
| Name | Where | Set by | Notes |
|---|---|---|---|
| `DOSSIER_ASK_TOKEN` (API) = `KIWIPLY_ASK_TOKEN` (edge compose env) | `.env` on box + edge compose | **user** | **distinct** from `DOSSIER_INTERNAL_TOKEN` (42 T17); ≥ 32 chars; used only by `/api/internal/tenant-hosts/check` |
| `DOSSIER_SCRAPE_TOKEN` | `.env` | user (only if a scraper is added) | blank ⇒ prometheus admin-only (X1.13) |
| Stripe live/test keys, webhook signing secret | `.env` (existing) | user | enterprise adds **no new Stripe env**; org webhooks use the same endpoint |
| `DOSSIER_INTERNAL_TOKEN`, `DOSSIER_SECRETBOX_KEY` (existing) | `.env` | user | SecretBox encrypts webhook/SSO secrets (Phase 12) |
| All feature switches, prices, limits, caps, retention | **admin settings registry** (`EnterpriseSettingKeys`) | platform admin | never env, never code (admin-config-driven rule); code ships safe defaults (flags **off**) |
New secrets go into the password manager the same day (CLAUDE.md: `.env` copy lives there; GitHub secrets are write-only).

## 2. Release train: phases behind flags

**Promotion = schema + code, not exposure.** Every phase merges to `develop` with its flag **off**; promoting a batch to `main` runs its Liquibase changelog at API start (additive, 41 §2) and ships dormant code. Exposure is a separate, reversible, per-org decision.

### 2.1 Exposure ladder (per flag `{on, pct, allow[], deny[]}`; flags fail closed)
`dark (off)` → **L1 internal**: allow-list = pilot org `acme` (platform-admin created) → **L2 design partner**: allow-list adds named real orgs the user approves → **L3 percentage** (only for flags where pct makes sense: not for tenancy/billing; those stay allow-list until GA) → **L4 GA** (`on`). Flip = admin Settings → Flags (audited, history, reason). Kill switch order: org `deny` → `pct 0` → flag off → master `flag.enterprise` off. Effect ≤ flag cache TTL (X1.1 target ≤ 60 s).

### 2.2 Per phase

| Ph | Flag(s) | L1 pilot gate (acme) | GA gate | Kill switch behaviour | Soak |
|---|---|---|---|---|---|
| 1 | `flag.enterprise` | scenario F green in CI; `HostUnknownIT` etc.; X1.13 live; roles backfill verified (41 §7) | n/a (foundation; stays allow-list until Phase 2 UI exists) | master off ⇒ `EnterpriseEnabledFilter` 404s, legacy `/org` console unchanged | 3 days, watch §10 |
| 2 | `flag.enterprise` + per-org allow | E2E-A (A1–A4, A10–A11) + B1–B3 on `acme.kiwiply.com` for real (needs wildcard DNS + edge change **for subdomains**, §6) | branded login + shell for ≥ 1 design partner for 2 weeks without Sev2 | org `deny` ⇒ tenant host UNKNOWN (branded login disappears), members use `kiwiply.com` | 1 week |
| 3 | `flag.enterprise.domains` | edge change applied + dev-edge rehearsal green; **one** custom domain (user-owned) full lifecycle incl. suspend/remove | LE counters healthy; 2 partner domains live 2 weeks | flag off ⇒ ask 404 for CUSTOM, resolver ignores them (existing certs inert) | 2 weeks |
| 4 | `flag.enterprise.roles` | `OrgMemberRoleAuthoritativeIT` + verification job clean 7 days | roles page used by pilot; no ceiling bypass in audit review | off ⇒ enum fallback (dual-written) until X4.10 removes it — **after X4.10 the kill switch only hides the editor** | 1 week |
| 5 | `flag.enterprise.billing` (API only, Stripe off) | `PersonalSubscriptionUnchangedIT` + golden tables; catalog has **no prices** in prod until the user publishes | n/a (UI-less) | off ⇒ license APIs 404 | — |
| 6 | `flag.enterprise.billing` (UI + Stripe) | **Stripe test mode first** (§12.2), test-clock run clean (43 §5.2); then live-mode switch is a user decision (checklist §12) with one pilot org and a real card of the user | 2 billing cycles clean, reconciler drift = 0, no support contact on wrong totals | off ⇒ new quotes/confirms refused; existing licenses keep working (entitlements read mirrors); Stripe subscriptions untouched | 2 cycles |
| 7 | `flag.enterprise.marketing` (part 1) | `ResumeAccessOrgIT`; consent journeys D2–D4 | partner uses directory + approvals | off ⇒ org resume links inert (rows kept) | 1 week |
| 8 | `flag.enterprise.marketing` | E2E-D to authorization (D1–D8); `NoSubmitSurfaceTest`; AI matching cost under budget | per-org AI spend ≤ budget for 2 weeks | off ⇒ marketing modules 404; matches kept | 2 weeks |
| 9 | `flag.enterprise.extension_workspaces` + **extension release** | **extension version bump + store submission lag**: the new build ships first, header ignored while flag off; E2E-D D9–D11 | extension adoption ≥ 80 % of pilot consultants | off ⇒ `workspaces[]` omitted, header ignored | 2 weeks |
| 10 | `flag.enterprise.marketing` | D10, D12; Timesheets bridge | partner AM uses clients/placements | off ⇒ pages 404 | 1 week |
| 11 | `flag.enterprise.hr_finance` | PII corpus green; legal review of policy-ack text (user) | partner HR uses checklists without scanner refusals spiking | off ⇒ pages 404; `policy_ack` rows kept | 1 week |
| 12 | per feature (`analytics`, `integrations`, `sso`) | each feature's story gate; SSRF/SAML tests; **second-instance readiness (X12.5) before adding any second API container** | per feature | per-feature flag | — |

**Never** turned on together on the same day: edge change, billing live mode, extension store release (one blast radius at a time).

### 2.3 Promotion procedure (unchanged from `DEPLOY.md` §13.3, plus enterprise checks)
1. Manual `mysqldump` copied off-box (any promotion containing a changelog).  2. Record current image SHAs (`docker inspect … Image`) for rollback.  3. User opens PR `develop → main`, CI green, merges.  4. Watch `logs -f api` until `Started DossierApiApp`; a Liquibase error ⇒ stop, §3.3.  5. Smoke: health, login, personal dashboard, `acme.kiwiply.com` branded login (if Phase ≥ 2), `GET /api/internal/health/ent` from inside the network (job last-run timestamps), `scripts/migrate/04-verify.sh kiwiply.com`.  6. Next morning check §10 dashboards.
Expected blip: the API container restarts (Liquibase + Spring ≈ 60–90 s) — deploy outside business hours of the pilot orgs; web serves its friendly error during the gap.

## 3. Migration safety

### 3.1 Rules (41 §1, ADR-023)
Additive only (one allow-listed VARCHAR widening, one allow-listed NOT NULL relaxation); precondition-guarded changesets; backfills separate and idempotent; every changelog tested on empty **and** previous-release schema (`MigrationUpgradeIT`); Liquibase runs at API start (single instance ⇒ no lock contention); no data moves between tables.

### 3.2 DDL cost on MySQL 9 (current table sizes are tiny; thresholds for when it matters)
| Operation | Algorithm | Cost now | Threshold to schedule off-hours |
|---|---|---|---|
| `CREATE TABLE` | instant | ~ms | n/a |
| `ADD COLUMN` nullable/default | `INSTANT` | ~ms | n/a |
| `ADD COLUMN … GENERATED STORED` (+ unique index) on `org_member`, `org_hostname` | table rebuild (`INPLACE`) | < 1 s (hundreds of rows) | > 1 M rows |
| `CREATE INDEX` | `INPLACE` | ~ms | > 5 M rows |
| `ALTER … MODIFY VARCHAR(20)→(40)` (`organization.type`) | `INPLACE` (no rebuild within same length class) | ~ms | n/a |
| FK add (`ADD CONSTRAINT` composite) | needs index + validation scan | ~ms | > 1 M rows (use `foreign_key_checks=0` is **not** allowed) |
Changesets declare `ALGORITHM=INPLACE, LOCK=NONE` where supported (`<sql>`), so a wrong assumption fails loudly instead of locking.

### 3.3 Failure handling
| Failure | Action |
|---|---|
| Changeset fails at startup | API exits (good); **do not retry blindly**: read the error; MySQL DDL is non-transactional, so a half-applied changeset may exist → each changeset's precondition (`tableExists/columnExists false → MARK_RAN`) makes a re-run safe after the cause is fixed; fix forward on `develop`, promote again. Only if data was damaged: restore the pre-promotion dump (§3.4). |
| Backfill wrong | rerun idempotent backfill after fix; verification SQL in 41 §7 |
| New code broken, schema fine | **flag off** (seconds); if still broken redeploy previous image SHAs **without** DB restore — valid because the schema is additive and old code ignores new tables/columns |
| Exception to "old image works on new schema" | `interview.application_id` NULLable (Phase 9) — org-created interviews have NULL; old code reading them could fail ⇒ before rolling back past Phase 9: flag off, `UPDATE interview SET …` is **not** done (no data fixes under pressure); old image is only valid if no org-created interviews exist ⚑ → rollback past Phase 9 = restore dump or forward fix |

### 3.4 Rollback matrix (fastest first)
| Level | Action | Time | Data impact |
|---|---|---|---|
| L0 | org `deny` / flag off | seconds | none |
| L1 | previous image SHAs (`docker tag … :latest; $COMPOSE up -d api web`) | ~2 min | none (additive schema) |
| L2 | L1 + pre-promotion dump restore (DEPLOY.md §13.3 rollback) | ~15 min | **loses writes since the dump** |
| L3 | Stripe-side: nothing automatic — reconcile by runbook RB-5 | hours | manual |
Never `gradlew --stop`, never machine-wide kills; compose commands always with the shared-edge overlay.

## 4. Feature-flag operations
- Flags and every threshold live in the admin settings registry; changes need a reason (HIGH-risk keys), are audited, and show history with one-click revert.
- Dependencies: every `flag.enterprise.*` needs master `flag.enterprise` on **and** the org in the allow-list; the UI shows the effective state ("on because: master ✓, allow-list ✓, module price ✓"). `ModuleGate` = flag ∧ commercial state (09 row 13).
- Flag review at each phase exit: delete temporary per-phase rules from docs; module flags (`marketing`, `hr_finance`, `analytics`, `integrations`, `sso`) are **permanent commercial switches**, not temporary.
- The extension has no remote flags; its behaviour keys off server responses (`workspaces[]`).

## 5. Release cadence and ownership
Fable designs; Sonnet agents build story-by-story on `ev2-*` topic branches off `develop` (CLAUDE.md branching); the **user** promotes batches. Suggested cadence: promote at phase exits (§2.2) or when a security fix (X1.13) is ready. A promotion never contains an un-gated behaviour change for personal users (`PersonalSubscriptionUnchangedIT`, `personal-billing-regression` required).

## 6. The shared edge (BeeCompete Caddy) — what the **user** applies

Boundary: this repo and its agents **never** edit, reload or restart `~/beecompete-edge`. We ship **text**: snippets and runbooks (10 §5.3/§8, this section). `docker-compose.shared-edge.yml` already keeps our Caddy parked behind `--profile standalone-edge`; **never** use that profile on this box (it would try to bind :80/:443 and take BeeCompete down).

### 6.1 Three independent edge changes (apply in this order, each reversible alone)
| # | Change | Needed by | Risk | Do when |
|---|---|---|---|---|
| E12 | **Deny rule** for `/api/internal/*`, `/management/prometheus`, `/management/info` on `api.kiwiply.com` (§6.4) | security fix, independent of V2 | very low (one `handle` in an existing block) | **now / with X1.13** |
| DNS | Cloudflare (grey-cloud) `*.kiwiply.com A 74.208.212.158`, `edge.kiwiply.com A 74.208.212.158` (+ AAAA if the box has IPv6) | Phase 2 subdomains | low (wildcard resolves anything under kiwiply.com to the box ⇒ unknown names hit the catch-all/ask) | before Phase 2 L1 |
| TLS | `on_demand_tls { ask … }` global option + `https://` catch-all (10 §5.3) + HTTP redirect catch-all (§6.5) | Phase 2 subdomains + Phase 3 custom domains | medium (global block merge; catch-all interplay with BeeCompete blocks) | after rehearsal green |

### 6.2 Apply procedure = 10 §8 steps 1–9, **plus**
- **Before step 3**: run the dev-edge rehearsal (`docker-compose.dev-edge.yml`) and keep its output; read the box's current `Caddyfile` and list every site block and any existing `http://` / catch-all / wildcard block — the merge decisions below depend on it.
- **Ask token (42 T17)**: `KIWIPLY_ASK_TOKEN` is a **new** secret, not `DOSSIER_INTERNAL_TOKEN`; same value as the API's `DOSSIER_ASK_TOKEN`. After changing either, restart `dossier-api` (`$COMPOSE up -d api`) and `caddy reload` (env change needs `up -d caddy` for the edge compose).
- **After step 6 (neighbours)**: also `curl -sI https://api.kiwiply.com/management/health | head -1` (must stay 200) and the extension host check.
- **New step 7b — spoof test (42 T23)**: `curl -sk --resolve acme.kiwiply.com:443:74.208.212.158 https://kiwiply.com/ -H 'X-Forwarded-Host: acme.kiwiply.com' -o /dev/null -w '%{http_code}\n'` and compare with the same without the header: the response must be the **platform** site both times (Caddy overwrote the header). If it differs, **stop and roll back**: the edge trusts client XFH.
- **Step 8 (first issuance)** expects ≤ 5 s; if > 30 s check `caddy` logs for `ask` 404 (host not ACTIVE) vs LE errors.
- **Rollback**: unchanged (restore `Caddyfile.bak-<date>`, `caddy reload`); certificates already obtained stay on disk (harmless).

### 6.3 Interplay risks with BeeCompete blocks ⚑
| Risk | Check | Mitigation |
|---|---|---|
| Existing global options block already present | open `Caddyfile` first lines | **merge** `on_demand_tls`; exactly one global block |
| BeeCompete uses wildcard certificates or `*.beecompete.com` blocks | grep `\*\.` | explicit-host and wildcard blocks win over the catch-all; verify with `caddy adapt` |
| Unknown BeeCompete hostnames now reach the catch-all and call **our** ask endpoint (404 ⇒ handshake refused) | same as before (no cert ⇒ failure), but now each probe costs an API call | rate limit on ask (600/min), alert on 404 bursts; acceptable |
| `import common` sets HSTS `includeSubDomains/preload` | read the snippet | do not inherit it in the catch-all (04 §7) |
| `trusted_proxies` configured globally | grep | spoof test (§6.2) decides |
| Our API restarts ⇒ ask unreachable ⇒ Caddy refuses *new* handshakes only; existing certs keep serving | | acceptable; Caddy retries ask on next handshake |

### 6.4 E12 edge deny rule (inside the existing `api.kiwiply.com { … }` block, **before** `reverse_proxy`)
```caddyfile
	# E12: operational and service-only paths are never public (defence in depth; the API also refuses them, X1.13)
	@ops path /api/internal/* /management/prometheus /management/info
	handle @ops {
		respond 404
	}
```
`/management/health` stays public (UptimeRobot keyword monitor). If a Prometheus scraper is added later it runs **inside** the docker network with the scrape token — never through the edge.

### 6.5 Addenda this plan adds to the 10 §8 runbook (to be merged into 10 by its owner — not edited here)
1. **HTTP→HTTPS for on-demand hosts.** Caddy's automatic redirect only covers hostnames it manages; custom domains arriving on :80 (before a cert exists) need an explicit catch-all: `http:// { redir https://{host}{uri} permanent }` — unless the edge already has an `http://` catch-all. (ACME HTTP-01 challenges are answered by Caddy before this block.)
2. **Separate ask token** (above).
3. **Spoof test** step (above).
4. **Caddy storage backup**: `caddy_data` (account key + issued certs) is a weekly backup target (§8); losing it causes a re-issue storm against LE limits.
5. **Edge access log masking**: ensure the access log does not record the `ask` query string `t=` (Caddy logs the request URI of *incoming* requests; the `ask` call is outbound from Caddy to the API — the API masks `t=` in its own logs).

## 7. Custom-domain and on-demand-TLS operations (day 2)

### 7.1 Facts
Let's Encrypt limits drive everything: **50 certificates / registered domain / week**, **300 new orders / account / 3 h**, **5 failed validations / hostname / h**, duplicate-cert limit 5/week. The edge account is shared with BeeCompete's own issuance. Our counters (`le_issuance`, 10 §7) stop **subdomain** auto-provisioning at 45/7 days for `kiwiply.com`; the new global activation cap (42 T16, default 30/day) protects the account limit.

### 7.2 Support playbook (status → what to tell the customer → what ops does)
| `last_check_result` / state | Customer sees | Ops action |
|---|---|---|
| `TXT_MISSING/MISMATCH` | "ownership record not found / different value" | none; point to instructions panel; DNS TTL |
| `CNAME_*`, `A_WRONG_IP` | exact record to set | none |
| `PROXIED` (orange cloud) | "switch to DNS-only" | none |
| `CAA_BLOCKS_LE` | add CAA `letsencrypt.org` | none |
| `CERT_PENDING` > 30 min / `CERT_FAILED:RATE_LIMIT` | "issuance limited, retry after {date}" | check `le_issuance`; if kiwiply.com budget hit, wait; consider X12.6 |
| `CERT_FAILED:UNREACHABLE` | "we couldn't reach your domain" | `curl -v --resolve host:443:IP`, check edge log for ask result, hairpin issue ⇒ `probe_via_edge_ip` |
| SUSPENDED (auto) | banner + email | confirm DNS now; customer fixes; **Resume** re-verifies |
| Customer cancels / leaves | — | org SUSPENDED/CLOSED ⇒ ask 404; names released after REMOVED |

### 7.3 Routine operations
- **Renewals** are Caddy's (≈ 30 days before expiry, re-asking first). Monitor: `cert_state` and a weekly expiry probe (`HostnameProbeJob` also records `not_after` ⚑ small addition to X3.3: store the served cert's `notAfter`; alert < 14 days).
- **Releasing a name**: REMOVED ⇒ ask 404 ⇒ no renewal; the cert expires naturally.
- **Apex domains** need A/AAAA to the edge IP (no CNAME flattening assumed); documented in the instructions panel.
- **IP change of the box** (migration): update `enterprise.domains.edge_ipv4/6`, Cloudflare wildcard + `edge.` records, notify custom-domain customers whose apex A record points at the IP (CNAME customers need nothing) — a runbook line in MIGRATION.md when it happens.
- **Option if LE limits bite**: wildcard cert for `*.kiwiply.com` via DNS-01 (needs a Caddy build with the Cloudflare DNS plugin ⇒ BeeCompete's image would change — user decision), or Cloudflare for SaaS (X12.6). Not planned.

## 8. Backups, restore, retention for the new tables

| Asset | Mechanism | RPO / retention | New work |
|---|---|---|---|
| MySQL `dossierApi` (all new tables) | existing nightly `backup-db.sh` (03:15 UTC) → `kiwiply-db-backups` S3, 30 daily, upload-read-never-delete key; weekly restore drill 04:45 Sun | RPO ≤ 24 h | **none** — new tables are in the dump automatically (`--routines --triggers --events`) |
| Pre-promotion dump | manual, before any promotion with a changelog (§2.3) | per event | add to checklist |
| Restore drill assertions | `verify-restore.sh` | weekly | **extend** (X1.x ops task ⚑): after restore assert `SELECT COUNT(*)` > 0 for `org_role`, `feature_definition`; `databasechangelog` max id equals expected; for orgs with enterprise on: one `org_member_role` per live member; `product_price` immutable-hash check passes (`PriceIntegrityJob --once`) |
| S3 objects (`org/{id}/…` logos, resumes) | AWS durability; **enable bucket versioning** on the org assets prefix ⚑ (cheap; protects overwrite) | | decision for the user |
| Caddy storage `caddy_data` of the shared edge | weekly `tar` of the volume to the backup bucket (user's edge script) | 7 d | §6.5 addendum |
| `.env` and secrets | password manager | | add new tokens (§1.1) |
| Stripe | Stripe is the source of truth for payments; Kiwiply mirrors rebuildable by the reconciler/`stripe` re-sync (`OrgBillingResync` admin action) | | RB-5 |
| Erased data in backups | erased members remain in dumps up to **30 days** (retention); policy statement in the privacy notes (user/legal) ⚑ | 30 d | disclose |

Restore scenarios:
| Scenario | Procedure |
|---|---|
| Whole DB (disaster) | existing `restore` script + dump; then run `OrgSeatReconciler` and `HostnameCheckJob --once`; flags unchanged (settings are in the DB) |
| One org damaged (bug) | restore latest dump into a **scratch** schema; copy rows `WHERE org_id = X` table-by-table in FK order (org-id-first design makes this mechanical; a helper `scripts/ops/restore-org.sh` is a Phase-12 nice-to-have ⚑); never overwrite another tenant's rows |
| Price/catalog edit gone wrong | immutable rows ⇒ retire the bad row, publish a new one; history intact |
| Accidental license/usage data loss | usage rollups + Stripe invoices reconstruct billing; reconcile (RB-5) |
| Point-in-time | not available (nightly dumps only) ⚑ — if Phase 6 goes live with real money, the user should decide on binlog archiving or a second daily dump |

## 9. Capacity on the shared 3.7 GB box

### 9.1 Budget (measured baseline from `DEPLOY.md` §13.1: ~1.1 GB free with BeeCompete + our stack, 4 GB swap)
| Component | Current cap/typical | Enterprise delta (est.) | Budget |
|---|---|---|---|
| API (JVM) | heap 512 MB (RSS ~700 MB) | + Caffeine caches (resolver ≤ 10 k entries ≈ 2 MB, membership/permission ≈ 5 MB), + jobs | **RSS ≤ 800 MB**; heap cap stays 512 MB (raise only after soak ⚑) |
| Web (Next standalone) | ~150–250 MB | + tenant route group, branding assets proxied | ≤ 300 MB |
| MySQL | buffer pool default | + tables (all small) | ≤ 700 MB |
| Chromium PDF sidecar | `mem_limit 1g`, `cpus 1.5` | org-managed resume edits ⇒ more PDF jobs | unchanged; per-org concurrency 2 (42 T65) |
| Free + page cache | ~1.1 GB | – | **≥ 600 MB** and swap in use **< 1 GB** sustained |
Compute: 20 orgs × 50 users × ~200 req/day ≈ 200 k req/day ≈ 2.3 rps average, ~20 rps peak — within one API instance; the constraint is **RAM, not CPU**.

### 9.2 Triggers and decisions (⚑ needs the user)
| Trigger | Action |
|---|---|
| Swap > 1 GB for 24 h, or free+cache < 500 MB at p50, or any API OOM kill | stop promoting; upsize the VPS (8 GB) **before** the next phase |
| **Before Phase 8 L1** (AI matching batches + marketer PDFs) | recommended: upsize regardless (decision gate in tracker) |
| > 10 active orgs or Phase 6 live-mode | review upsizing + second daily DB dump |
| A second API instance | only after X12.5 (ShedLock, shared rate limits, cache invalidation); ADR-022 |
Disk: 106 GB free; enterprise growth (usage events ≈ 4 MB/org-month, audit, pipeline events) is negligible; Docker image prune on deploy already; logs rotated by Docker (confirm `max-size`).

### 9.3 Soak procedure after each promotion
`docker stats --no-stream` + `free -m` + `vmstat 5 5` at +10 min, +1 h, next morning; record in the tracker (`progress-tracker.md` Log). Compare with the budget; any breach blocks the next flag raise.

## 10. Monitoring and alerting

No Prometheus/Grafana on the box (memory). Alert channels that exist: **error digest email** (to `ADMIN_EMAIL`, ≤ 1/15 min), **Healthchecks.io** dead-man pings (job ran), **UptimeRobot** keyword monitors, admin **Tenant Health** page (X3.3), `docker logs`. Micrometer metrics stay available at `/management/prometheus` (token) for ad-hoc `curl` from the box.

| Signal | Source | Threshold | Severity → channel | Runbook |
|---|---|---|---|---|
| API/web up | UptimeRobot `api…/management/health`, `kiwiply.com`; **new**: `https://acme.kiwiply.com/` keyword "Powered by Kiwiply" (L1+), one per pilot custom domain | 2 failures | page (email/SMS) | RB-1, RB-10 |
| Ask 404 burst | `kiwiply_tenant_ask_total{result="404"}` | > 50 / 5 min | warn → digest + Tenant Health | RB-2 |
| Hostname SUSPENDED/FAILED cert | gauges 10 §7 | > 0 | warn → org owners + admin | RB-2/3 |
| LE budget | `le_issuance` | ≥ 45/7 d | warn | RB-3 |
| Job dead-man | Healthchecks.io pings from `HostnameCheckJob`, `UsageSweeperJob`, `OrgSeatReconciler`, `PriceIntegrityJob`, `LicenseLifecycleJob`, nightly backup | period + grace (job-specific) | page for reconciler/backup, warn others | RB-5, RB-10 |
| `ent_job_run` FAIL | table + digest | any FAIL twice in a row | warn | per job |
| Stripe webhook failures / `billing_drift` unresolved > 24 h | logs + table | any | page once live | RB-5 |
| Stuck reservations | `usage_event RESERVED` older than TTL×2 | > 0 | warn | RB-7 |
| License change stuck | `license_change` PENDING/FAILED > 15 min | > 0 | warn | RB-7 |
| 5xx rate | error digest | > 1 % / 5 min for a tenant host | warn | RB-1 |
| Login failure rate per host | `RATE_LIMITED` + 401 counters | > 100 / 5 min | warn | RB-8 |
| Break-glass used | `break_glass_grant` insert | any | notify security mailbox + org owner | RB-13 |
| PII sweep hit | `PiiSweepJob` counts | > 0 | page (privacy) | RB-9 |
| Price integrity mismatch | `PriceIntegrityJob` | any | page | RB-6 |
| Memory / swap | `free -m` cron to Healthchecks (`vm-ok` ping when free+cache ≥ 600 MB and swap < 1 GB) | missed ping | warn | RB-10 |
| DB slow queries / connections | MySQL `slow_query_log` (200 ms), `max_connections` usage | > 5 / hour; > 80 % | warn | RB-10 |
| Disk | `df` cron ping | > 80 % | warn | — |
| Cert expiry | probe `notAfter` | < 14 d | warn | RB-2 |
All thresholds are admin settings (`enterprise.alerts.*`) where the API computes them; external-monitor thresholds are configured in those services (documented in `DEPLOY.md` §10 additions made by the story that adds each job).

## 11. Incident runbooks (concise; each ends with "write the post-incident note in `docs/enterprise-v2/progress-tracker.md` Log")

| Id | Symptom | Check | Fix | Comms |
|---|---|---|---|---|
| **RB-1** Known tenant shows "workspace unavailable"/404 | `GET /api/public/tenant` with `X-Kiwiply-Host`; org status; hostname status; `flag.enterprise` allow-list; resolver cache (bump `config_version`) | wrong flag/status ⇒ fix in admin; stale cache ⇒ `config_version++`; DNS ⇒ RB-2 | status banner to the org if > 15 min |
| **RB-2** Cert not issuing / handshake errors | edge `caddy` logs (`ask` 404 vs LE error); Domains page cert_state; `curl ask` from edge container | host not ACTIVE ⇒ fix state; LE limit ⇒ RB-3; token mismatch ⇒ §6.2 | customer-facing text from 7.2 |
| **RB-3** LE rate limit | `le_issuance` counts; Caddy log `too many certificates` | stop provisioning (automatic), wait for window, communicate ETA | affected orgs |
| **RB-4** **SEV1: suspected cross-tenant exposure** | preserve logs (copy `docker logs`, audit query by `tenant=` MDC), reproduce with `CrossTenantSweepIT` line for the route | **kill switch immediately**: master `flag.enterprise` off (or org deny); fix forward; add regression line to registry; review audit for actual access | **user** notifies affected orgs and regulators as required (GDPR 72 h) — not decided by tooling |
| **RB-5** Stripe webhook failing / drift | Stripe dashboard events; `stripe_event`; `billing_drift` | replay failed events from Stripe; admin "replay batch" (same keys); never hand-edit mirrors | finance contacts if charges affected |
| **RB-6** Wrong price/total reported | quote `inputs_hash`, `catalog_version`, contract version; `PriceIntegrityJob` | retire bad price row, publish correct; issue Stripe credit (no refunds policy ⇒ credit memo, user decision) | org billing contact |
| **RB-7** Stuck license change / reservation | `license_change` FAILED; `usage_event` RESERVED | retry job; `LicenseChangeRetryJob` runs every 5 min; manual replay with same keys | none |
| **RB-8** Credential stuffing on a tenant host | 429/401 counters per host; audit | lower per-host limit setting, enable `org.security.mfa_required`, block IP at edge (user), notify org admin | org admin |
| **RB-9** PII found in HR/finance/notes (e.g. SSN) | `PiiSweepJob` counts by table (never values) | locate rows by query on the flagged column, **blank the field** via admin tool/SQL under reason; do not copy value anywhere; keep audit row; backups expire in 30 d | org owner (their data), privacy log |
| **RB-10** Memory pressure / OOM / swap storm | `free -m`, `docker stats`, API OOM in logs | stop AI batch jobs (flags), restart API, upsize decision (§9.2) | — |
| **RB-11** Migration failed on promotion | §3.3 | fix forward; restore only if data damaged | — |
| **RB-12** Edge change broke BeeCompete | edge logs, `curl` neighbours | restore `Caddyfile.bak-<date>`, `caddy reload` (10 §8 step 9) | **first**: restore, then investigate |
| **RB-13** Break-glass misuse / admin compromise | `break_glass_grant`, tenant audit `ADMIN_READ` | revoke admin, rotate admin passwords + MFA, list reads in the window | affected orgs informed (they can see the audit rows) |
| **RB-14** Token leak (ask / scrape / internal / Stripe) | where it appeared | rotate (env + restart api + edge env + `caddy reload`), search logs for use | — |

## 12. Go-live checklist (enterprise GA; each phase's L2/GA subset is marked in §2.2)

### 12.1 Code and data
- [ ] All X-stories of the phase **Completed** in the tracker with code + test references; CI required jobs green on the promotion PR (`api-tests`, `web`, `ent-e2e`, `personal-billing-regression`, `db-migrations`, `security-static`).
- [ ] `OrgIsolationIT`/`CrossTenantSweepIT`/`NoSubmitSurfaceTest`/PII suites green; no `@Disabled` without tracker entry.
- [ ] Pre-promotion manual dump taken **and copied off the box**; current image SHAs noted.
- [ ] Liquibase changelog reviewed against 41 §2 (additive, preconditions); `MigrationUpgradeIT` green on previous-release schema.
- [ ] Catalog has no prices until the user publishes them (E3); margin guard report reviewed for every published price (≥ 80 % subscriptions / ≥ 20 % services worst case).

### 12.2 Config and secrets
- [ ] `.env` on the box has every required variable (checked by name); new tokens (§1.1) generated (≥ 32 chars), stored in the password manager; `DOSSIER_ASK_TOKEN` ≠ internal token.
- [ ] Stripe: **test mode** verified end-to-end first; live keys only at Phase 6 GA by the user; webhook endpoint registered once; `dossier.orgs.dev-activate` false (`BillingConfigIT`); no test-clock vars on prod.
- [ ] `SPRING_PROFILES_ACTIVE=prod,api-docs` reviewed: `/v3/api-docs` ADMIN-only; Swagger UI disabled (X1.13 `OpenApiExposureTest`).
- [ ] **Hardening (recommended, ⚑):** the API connects to MySQL as `root` with `createDatabaseIfNotExist` (compose) — create a least-privilege `dossier` user (DML + DDL on `dossierApi` only) before enterprise data holds real customers.
- [ ] Mail: org mail templates send from `no-reply@kiwiply.com`; tenant-branded content in body only (SPF/DKIM unchanged).

### 12.3 Edge, DNS, TLS (Phase 2/3; the user's actions)
- [ ] E12 deny rule applied and verified (`curl https://api.kiwiply.com/management/prometheus` → 404; `/management/health` → 200).
- [ ] DNS wildcard + `edge.` records created grey-cloud; TLS snippet applied per 10 §8 **with** §6.2/§6.5 additions; neighbours verified; spoof test passes; rollback copy `Caddyfile.bak-<date>` exists.
- [ ] First subdomain issuance observed; one user-owned custom domain through the full lifecycle; suspension and removal tested.
- [ ] Caddy storage backup scheduled.

### 12.4 Monitoring and operations
- [ ] §10 monitors created (UptimeRobot keyword for `acme` host + pilot custom domain; Healthchecks for each new job; memory/disk cron pings); alert recipients confirmed.
- [ ] Restore drill extended (§8) and passed once after the promotion; manual restore-one-org rehearsal on scratch DB done once before Phase 6 live.
- [ ] Soak recorded (§9.3); capacity gate evaluated (§9.2) — **decision recorded** (upsize or accept).
- [ ] Runbooks RB-1…14 reviewed by the user; security mailbox for break-glass alerts exists.

### 12.5 Product, legal and support (user-owned; no legal advice from the tooling)
- [ ] Terms/privacy/subprocessor pages updated for: tenant-branded logins, Let's Encrypt, Stripe, Gemini (redacted input only), HR record-only statement, backups retention 30 d.
- [ ] Customer-facing statements: "no refunds, cancel anytime — license ends now on removal, paid period not refunded" (09 row 4 wording), no SSN/tax/bank/passport/DOB collected.
- [ ] Support playbook (7.2) and onboarding checklist for a new org (admin creates org → platform admin enables enterprise → subdomain → branding → invite → licenses).
- [ ] Pilot org agreed; rollback/kill-switch plan shared with the pilot contact.

### 12.6 Post-launch (first 7 days)
Daily check of §10 board, error digest, reconciler (`billing_drift` = 0), LE counters, memory soak; first-week review of audit HIGH rows; retro note in the tracker; decide on raising exposure (§2.1) only after the soak column of §2.2 is satisfied.

## 13. Open items needing the user (also in the session report)
1. Apply the E12 edge deny rule (6.4) — independent of V2, security fix.
2. Decide on a **VPS upsize** before Phase 8 and a second daily/binlog backup before Phase 6 live (9.2, 8).
3. Provide a Stripe **test-mode** key as GitHub secret `STRIPE_TEST_SECRET_KEY` if the nightly test-clock job is wanted (else manual runbook).
4. Approve: separate `DOSSIER_ASK_TOKEN`; no staging environment (pilot org instead); least-privilege DB user; S3 versioning on the org assets prefix.
5. Edge facts only the user can read: whether BeeCompete's Caddyfile has a global block, `trusted_proxies`, an `http://` catch-all, wildcard blocks (6.3).

## 14. Design review decisions on the ⚑ items (Session E Task 4, 2026-10-12)

| Item | Decision | Consequence |
|---|---|---|
| No staging environment (pilot org behind per-org flags instead) | **Accept** until the box is upsized — **E25** asks the user about the upsize trigger | §1, §9.2 |
| Rollback past Phase 9 with `interview.application_id` NULL rows | **Accept**: rollback past Phase 9 = restore dump or forward fix; no data fixes under pressure | §3.4 |
| §6.3 interplay risks with BeeCompete blocks | **Accept** — the user applies with the §6.2 checks (dev-edge rehearsal first, spoof test 7b in 10 §8) | 10 §8 |
| `HostnameProbeJob` stores `notAfter`, alert < 14 days | **Accept** — applied to X3.3 | X3.3 |
| Restore-drill assertions for enterprise tables | **Accept** — owned by **X1.9** (the `verify-restore.sh` extension is part of the isolation gate's DoD; the `PriceIntegrityJob --once` line is added when X5.1 lands) | X1.9 |
| S3 bucket versioning on the org assets prefix | **Accept** — user action in AWS (**E26**) | §8 |
| Erased members remain in dumps ≤ 30 days | **Accept** — disclose in the privacy notes (**E26**) | §8, §12.5 |
| `scripts/ops/restore-org.sh` | **Accept as a nice-to-have** inside X12.5 (ops addendum) | X12.5 |
| No point-in-time recovery (nightly dumps only) | **Accept now**; before Phase 6 goes live with real money the user decides on binlog archiving or a second daily dump — **E27** | §8, §13 |
| JVM heap cap 512 MB, raise only after soak | **Accept** | §9.1 |
| Least-privilege MySQL user instead of `root` | **Accept (recommended)** — user action before enterprise data holds real customers — **E28** | §12.1 |

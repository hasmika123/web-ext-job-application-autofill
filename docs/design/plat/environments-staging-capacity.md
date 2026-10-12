# Environments, staging, configuration schema, capacity and the own-server move

Area `plat`. Stories: P3.1–P3.5, P6.1–P6.5. Existing: production only; local dev = `api/src/main/docker/
{mysql,minio}.yml` + `./gradlew bootRun` + `npm run dev -w web` (+ `web/scripts/mock-api.mjs` for the demo);
CI = GitHub runners. The shared box runs BeeCompete's `prod-web` **and** `staging-web` behind the same edge
Caddy, so a staging convention already exists on that host. Memory: 3.7 GB total, ~1.1 GB free, 4 GB swap
(`DEPLOY.md` §13.1). ROADMAP commits to moving to our own server "before Phase 21 ships".

## 1. Decisions

| # | Decision |
|---|---|
| D1 | **Three environments, no more**: `local` (developer machine, one compose file), `staging` (the shared box, project `dossier-staging`, hostnames `staging.kiwiply.com` + `api-staging.kiwiply.com`), `prod`. No per-PR previews — the box cannot afford them and CI already builds + smoke-runs the web image on every PR. |
| D2 | **Staging deploys from `develop` on every push**, with the same pipeline as prod (`deploy.yml` gains a matrix over `{staging: develop, production: main}` and an `environment:` per target). Same images (`:sha`), same compose files, a second `deploy.env` (`IMAGE_TAG`, `ENV=staging`), a second `.env` (`/srv/kiwiply/staging/.env`) with **its own** MySQL, uploads volume, JWT secret, blank Stripe, `DOSSIER_AI_ENABLED=false` by default, Brevo pointed at a `staging-` sender or Mailpit, `DEMO_ENABLED=true`. Overlay `docker-compose.staging.yml`: `name: dossier-staging`, aliases `dossier-staging-web` / `dossier-staging-api`, `mem_limit` 384 m api / 192 m web / 256 m mysql, `JAVA_OPTS=-Xmx256m`, cron jobs **off** (`DOSSIER_JOBS_ENABLED=false`, inbox poll cron `-`), robots `noindex` + HTTP basic auth at the edge (BeeCompete's `staging-web` already does this — copy the Caddy snippet). The edge Caddyfile site blocks are a one-time human step (MIGRATION §10.2 pattern). |
| D3 | **Staging data is synthetic, never a prod copy.** Seed = the demo seed (`DemoResource` data, Jordan Lee) + a `seed-staging.sql` with 200 users / 2 000 applications / 50 resumes (generated, no real names) checked into `scripts/ops/seed/`. Resetting staging = `storage-reset + mysql restore of the seed` via `scripts/ops/staging-reset.sh`. PII never leaves prod; the restore *drill* uses prod dumps but in a throwaway container with `--network none`, which is a different thing. |
| D4 | **One typed configuration schema.** `api/src/main/resources/config/env-schema.yml` lists every `DOSSIER_*`/`STRIPE_*`/`MAIL_*`/… variable with `required: prod|staging|never`, type, default, secret: true/false, and the story that introduced it. A boot-time `EnvSchemaCheck` logs a table (secrets masked) and **fails fast in prod** on a missing required var or an unknown `DOSSIER_*` (typo guard — 13.1a found three vars silently ignored). CI job `env-schema` asserts `.env.example`, `docker-compose.prod.yml` and the schema agree (every schema var appears in both; every compose var is in the schema). Web gets the same for `NEXT_PUBLIC_*` + `DOSSIER_API_URL` in `web/scripts/check-env.mjs` at build. |
| D5 | **Resource limits on every container, both environments.** prod: api `mem_limit 768m` (`-Xmx512m` + metaspace/threads), web `256m`, mysql `640m` with `innodb_buffer_pool_size=256M`, `cpus: 1.5` on api; `oom_kill_disable: false`; `restart: unless-stopped` (exists). The sum (≈ 1.7 GB prod + ≈ 0.85 GB staging) exceeds today's free memory, so **staging runs on the shared box only with the api capped at 256 m heap and the MySQL buffer pool at 64 M**, and is the first thing switched off under pressure (host-guard rule). This is the practical argument for P6.3. |
| D6 | **Capacity model, written and re-run quarterly.** Per 1 000 active users: ~12 k autofill `version` checks/day (15-min alarm + focus), ~3 k application syncs, ~1 k profile reads, nightly ingest fixed (~217 boards × 1 call), matches ~N_pro × 50 candidates, inbox polls N_connected × 96/day, Autopilot (Phase 21) ≤ 30 preps/user/day. A k6 script (`scripts/perf/baseline.js`) replays that mix against staging; the baseline (p50/p95 per route, CPU, RSS) is committed as `scripts/perf/baseline-<date>.json`; nightly CI runs k6 at 0.2× against staging and fails on > 30 % p95 regression. |
| D7 | **MySQL hygiene**: slow query log on (`long_query_time=0.5`, to a file in the volume, rotated), `performance_schema` on, a monthly `pt-index-usage`-style review by hand (`sys.schema_unused_indexes`), `innodb_flush_log_at_trx_commit=1` (durability over speed — we have backups to think about), binlog settings from backup-restore-pitr.md D3. Connection pool Hikari max 10 (default) is enough for one instance; raise with replicas. |
| D8 | **Own server before Phase 21**, chosen and rehearsed on staging first: 4 vCPU / 8 GB / 80 GB NVMe + a separate 40 GB data volume (LUKS), Ubuntu 24.04, Docker, **our own** edge Caddy from `docker-compose.prod.yml` (no overlay), Cloudflare DNS TTL 60 s cutover per `MIGRATION.md` §0–§7, DB moved by **base + binlog replay** (P0.2) so the write freeze is minutes, not the dump length. Rehearsal = `MIGRATION.md` §2 against staging's data with a throwaway VPS, timed; the quarterly rebuild drill (P0.6) is the same exercise. Provider is an open question (Hetzner/OVH/DigitalOcean/IONOS); cost ≈ $25–40/mo. |
| D9 | **Feature flags and maintenance mode are consumed, not built, here** (A5.3, A5.6). Platform supplies the `ops.maintenance` hook in the edge (a 503 page served by Caddy when a file exists — on the shared box it is a request to BeeCompete's owner, on our own box it is ours) and the `X-Kiwiply-Env: staging` response header so the extension can refuse to sync to staging unless its own `apiBase` says so. |

## 2. Environment matrix

| | local | staging | prod |
|---|---|---|---|
| Compose | `docker-compose.dev.yml` (new: mysql + minio + mailpit; replaces the three JHipster files) | `prod.yml + shared-edge.yml + staging.yml` | `prod.yml + shared-edge.yml` (→ `prod.yml` alone on own server) |
| Images | `--build` | `:sha` from `develop` | `:sha` from `main` |
| DB | mysql:9.2 container, `dossierApi` | own container + volume, seeded | own container + volume |
| Files | `local` driver → `./.data/uploads` | `local` → `uploads-staging` | `local` → `uploads` |
| Mail | Mailpit (web UI :8025) | Mailpit or Brevo `staging-` sender | Brevo |
| AI / jobs / inbox | off | off unless a tester turns on | on |
| Stripe | test keys optional (`stripe listen`) | test keys | live (15.4) |
| Deploy | — | push to `develop` | merge to `main` |
| Auth at edge | — | basic auth + `noindex` | — |
| Data | demo seed | synthetic seed, reset weekly | real |

## 3. Boot-time config check (API)

```
EnvSchemaCheck  ─ reads env-schema.yml ─┐
                                        ├─ prod: missing required → log table → System.exit(1) (before Liquibase)
                                        ├─ unknown DOSSIER_* → prod: exit; staging/dev: WARN
                                        └─ prints: NAME | source(env/default) | value(masked if secret) | story
```

Secrets are masked as `sha256:ab12cd…` (first 8 hex) — the same fingerprint `secrets-fingerprint.sh`
prints, so the box log and the password-manager note can be compared without exposing anything.

## 4. Failure modes

- Staging eats prod's memory → host-guard SEV2 "memory-pressure" names the staging project; runbook
  `memory-pressure` step 1 is `docker compose -p dossier-staging stop`. The limits (D5) make this a
  slowdown, not an OOM of BeeCompete.
- Extension pointed at staging by a tester syncs real resumes there → `X-Kiwiply-Env` header + the
  extension's `apiBase` allow-list (ext area) + staging's weekly reset.
- Edge basic auth breaks the CWS reviewer? Staging is never given to reviewers; prod + the demo account are.
- `develop` broken → staging broken → that is the point; prod untouched.
- Env schema too strict blocks a hotfix deploy → `DOSSIER_ENV_SCHEMA_STRICT=false` escape hatch, logged
  as a system event (A10.4) so it can't be forgotten.

## 5. Security

Staging shares nothing with prod: separate secrets, separate JWT, separate DB user, basic auth at the edge,
`noindex`, no real PII, Stripe test mode only. The staging `.env` goes in the password manager too (it is
rebuilt from the schema in minutes if lost — but the discipline is the same).

## 6. Cost

Staging on the shared box: $0 (memory). Own server: ~$25–40/mo + ~$5/mo for the data volume; the shared
box's share of cost today is unknown to this plan (BeeCompete's bill).

## 7. Tests

`EnvSchemaCheckTest` (missing required → exits in prod profile, warns in dev; unknown var; masking),
CI `env-schema` job (schema ↔ `.env.example` ↔ compose parity, three fixtures), `scripts/ops/test` grows
`staging-reset.sh` dry-run, `scripts/perf/baseline.js` runs in CI at 0.05× against the PR's web image as a
smoke (not a benchmark), `docker compose config` validation of every compose combination in CI.

## 8. Rollout

P3.1 local compose + Mailpit → P3.4 env schema + CI parity → P3.2 staging stack (needs the user on the box
for the edge Caddyfile + `.env`) → P3.3 synthetic seed + reset → P6.1 limits (prod first, then staging) →
P6.2 k6 baseline → P6.5 MySQL hygiene → P6.4 capacity doc + quarterly re-run → P6.3 own-server move
(rehearsed, then real, before Phase 21).

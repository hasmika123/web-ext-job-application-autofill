# Deploy pipeline: pinned images, zero-downtime rolls, one-variable rollback, safe migrations

Area `plat`. Stories: P2.1–P2.7. Existing: `.github/workflows/deploy.yml` builds api + web on GitHub
runners, pushes `ghcr.io/hasmika123/dossier-{api,web}:latest` **and** `:<sha>`, then `appleboy/ssh-action`
as `root` → `git pull --ff-only` → `compose pull && up -d` with the shared-edge overlay → `image prune`.
`ci.yml` gates PRs. `DEPLOY.md` §13.3 is the manual rollback (retag four images, restore a dump).
Constraints: the edge Caddy (`beecompete-edge-caddy`) is never ours to restart; it proxies to the
`dossier-web` / `dossier-api` network aliases on `web_edge`.

## 1. Decisions

| # | Decision |
|---|---|
| D1 | **The box runs a pinned SHA, never `:latest`.** `docker-compose.prod.yml` reads `image: ghcr.io/hasmika123/dossier-api:${IMAGE_TAG:-latest}`; the box holds `/srv/kiwiply/deploy.env` (`IMAGE_TAG=<sha>`, `DEPLOYED_AT`, `DEPLOYED_BY`). `deploy.yml` writes it, then `up`. `:latest` keeps being pushed for humans and local `--build`, but production never references it. |
| D2 | **Rollback = one variable.** `workflow_dispatch` input `image_tag` (default empty = HEAD sha). Running Deploy with a previous sha rewrites `deploy.env` and rolls. The box also keeps `deploy.env.prev`; `scripts/ops/rollback.sh` with no args swaps them for the no-GitHub case. GHCR keeps every `:sha` for 90 days (retention policy set on the packages). |
| D3 | **Rolling restart via `docker rollout`** (MIT CLI plugin installed on the box at `/usr/local/lib/docker/cli-plugins/docker-rollout`, pinned by sha256 in `scripts/ops/install-rollout.sh`). `docker rollout -f prod.yml -f shared-edge.yml api` scales api to 2, waits for the Docker **healthcheck**, removes the old one; same for web. The edge Caddy resolves `dossier-api` through Docker DNS, which returns both replicas during the roll — no Caddyfile change. Prerequisites already true: no `container_name`, no `ports:` on api/web. |
| D4 | **Healthchecks become real.** api: `test: curl -fsS http://localhost:8080/management/health/readiness` (readiness includes `db`), `interval 10s`, `start_period 90s` (Liquibase), `retries 3`. web: `GET /` 200, `start_period 20s`. `depends_on: api: condition: service_healthy` for web. The same probes gate `docker rollout`. |
| D5 | **Expand/contract is law, enforced in CI.** A Liquibase changelog may not `dropColumn`, `dropTable`, `renameColumn`, `renameTable`, or `modifyDataType` narrowing, unless the changeset carries `<!-- contract-of: <changeset id that expanded ≥ 1 release ago> -->`. `scripts/ci/liquibase-lint.mjs` parses new changelog XML on PRs and fails otherwise. Two-release rule: expand (new column, dual-write) → deploy → backfill → next release: switch reads → next: contract. Rollback is then always an image swap. |
| D6 | **Snapshot before every deploy.** `deploy.yml` runs `scripts/ops/backup-db.sh --tag pre-deploy-<sha>` before `rollout` (≈ 5 s at today's size; pinged to a separate Healthchecks check with a loose period so it never alarms on quiet weeks). Kept 7 days under `predeploy/` by lifecycle. |
| D7 | **Post-deploy verification in the pipeline.** After the roll, the runner executes `scripts/migrate/04-verify.sh kiwiply.com` + `scripts/ops/canary.sh` (sign in as the canary user, `GET /api/profile/version`, `GET /api/account`; P1.7). Failure → automatic rollback to `deploy.env.prev` and a red run. Deploy markers go to the admin deployments hook (`POST /api/admin/deployments`, A10.4 D5) and the status page as a maintenance note only when a migration is `contract`. |
| D8 | **Drop root.** Checkout moves to `/srv/kiwiply/app` owned by `kiwiply` (a new user in the `docker` group, no sudo). The CI key is installed in `~kiwiply/.ssh/authorized_keys` with `command="/srv/kiwiply/bin/deploy-entry",no-port-forwarding,no-agent-forwarding,no-pty,from="<GitHub Actions IP ranges optional>"` — a **forced command** that accepts only `deploy <sha>` / `rollback`. The SSH action therefore cannot run arbitrary shell even if the secret leaks. `DEPLOY_PATH`/`VPS_USER` updated. `/root/web-ext-job-application-autofill` is deleted after one successful deploy from the new path. |
| D9 | **CI hardening.** Every workflow gets a top-level `permissions: {contents: read}` and job-level grants; third-party actions pinned to a full SHA with a version comment; Dependabot for `github-actions`, `npm` (root workspace), `gradle`; required checks on `main` and `develop` (extension, web, web-docker, ops, api, liquibase-lint, gitleaks); `deploy.yml` uses an **environment** `production` with required reviewer = the user, replacing the `DEPLOY_ENABLED` variable and its snapshot trap. |
| D10 | **Extension releases stay tag-driven** but publish to CWS, AMO (`web-ext sign` / AMO API) and Edge Partner Center from one workflow, each behind its own `PUBLISH_*` variable, with release notes generated from commits since the last `ext-v*` tag and attached to a GitHub Release holding the zip. Staged rollout % on CWS is set by hand (no API). |

## 2. The deploy flow (after P2.1–P2.5)

```
merge to main ─┐
workflow_dispatch(image_tag?) ─┴─> build-push (api, web → :sha, :latest)
                                      └─> deploy (environment: production, reviewer gate for dispatch)
                                            ssh kiwiply@box  "deploy <sha>"           (forced command)
                                              ├─ 1. git fetch && git checkout --detach <sha>  (compose files of that sha)
                                              ├─ 2. backup-db.sh --tag pre-deploy-<sha>
                                              ├─ 3. mv deploy.env deploy.env.prev; write IMAGE_TAG=<sha>
                                              ├─ 4. docker compose pull
                                              ├─ 5. docker rollout api   (readiness-gated; Liquibase runs inside the new container before it is ready)
                                              ├─ 6. docker rollout web
                                              ├─ 7. docker image prune -f (keeps prev sha: labelled keep)
                                              └─ 8. POST /api/admin/deployments {sha, actor, started, finished, status}
                                            runner: 04-verify.sh + canary.sh ──fail──> ssh "rollback" → red run → digest HIGH
```

Liquibase + rolling: two api containers run for ~60 s. The *new* one applies migrations while the old
one serves. That is exactly why D5 exists — an expand-only migration is safe for the old code to keep
running against. (`application.liquibase.async-start=false` already makes readiness wait for migrations.)

Memory during the roll: two JVMs at `-Xmx512m` → ~1.2 GB peak for a minute. On the shared box this is
the tightest moment of the week; `mem_limit` (P6.1) on both replicas + 4 GB swap make it survivable, and
the own-server move (P6.3) makes it comfortable. Until P6.1 lands, `rollout` runs api with
`--wait-after-healthy 5` and web second, never both at once.

## 3. Rollback matrix

| Situation | Action | Data |
|---|---|---|
| bad build, no migration in range | Deploy with `image_tag=<prev>` (or `rollback.sh`) | none lost |
| bad build, expand-only migration in range | same — old code ignores new columns | none lost |
| contract migration in range (lint-approved, ≥ 1 release after expand) | roll forward only; the lint comment names the expand changeset so the reviewer knows | — |
| data corruption by the new code | rollback image **and** PITR to just before the deploy (`backup-restore-pitr.md` §4) | writes between deploy and restore are lost → status page incident |
| box unreachable | nothing to roll; see runbook `box-unreachable` (P7.1) | — |

## 4. Failure modes

- **Healthcheck never green** (bad env, Liquibase error): `rollout` times out (`-t 180`), leaves the old
  container serving, exits non-zero → pipeline red, `deploy.env` restored from `.prev`. The failed
  container's logs are captured into the run output (`docker logs <new>` before removal).
- **Two replicas, in-memory rate limiter** (`FixedWindowRateLimiter` is per-instance): during the
  60 s roll limits effectively double. Acceptable; noted in P4.3.
- **Edge Caddy caches DNS?** Caddy resolves upstream per dial by default; verified during P2.2 by
  rolling web while curling `/` in a loop from the runner (zero non-2xx = pass; that assertion is the
  P2.2 acceptance test).
- **`git pull --ff-only` fails because the box is on a deleted branch** — eliminated: the forced command
  does `fetch` + `checkout --detach <sha>`; the checkout is never on a branch.
- **GHCR package made private by accident** → `pull` fails before anything changes; red run; the box
  keeps the old sha. (Add a read-only `GHCR_PULL_TOKEN` to the box's docker config at P2.5 so the
  packages can go private.)
- **Forced command drift**: `deploy-entry` is in the repo (`scripts/ops/deploy-entry.sh`) and symlinked;
  the install step is part of P2.5's runbook and the quarterly rebuild drill.

## 5. Security

- Secrets never leave the box: `deploy.yml` sends only `<sha>`; `.env` is read by compose on the box.
- The CI SSH key can run exactly two verbs. Key rotation = new key pair, `authorized_keys` edit, GitHub
  secret update; quarterly (P4.6 calendar).
- `permissions:` least-privilege; `packages: write` only in build-push; no `pull_request_target`.
- Image provenance: `docker/build-push-action` with `provenance: true` and `sbom: true` (P4.5) so the
  sha on the box can be traced to a run.

## 6. Cost

Zero new services. ~2 extra minutes per deploy (snapshot + verify). GHCR storage: 90 days of ~400 MB
image pairs ≈ 20 GB → within the free tier for public packages; if made private, ~$0.25/GB-month.

## 7. Tests

- `scripts/ops/test/ops.test.sh`: `deploy-entry.sh` rejects any verb other than `deploy <40-hex>` /
  `rollback`; writes `deploy.env` + `.prev` correctly; `rollback.sh` swaps them back.
- `scripts/ci/liquibase-lint.test.mjs`: fixtures for each forbidden op, the `contract-of` escape, and an
  additive changelog that passes.
- CI job `rollout-smoke` (new, ubuntu-latest): compose up a tiny stack (api image from the PR build is
  too heavy → use the web image), install `docker-rollout`, roll it while `curl` loops; assert 0 failures.
- `04-verify.sh` and `canary.sh` run against staging (P3.2) on every push to `develop`.

## 8. Rollout

P2.1 (pinned tag + `deploy.env` + dispatch input; still `up -d`) → P2.4 (healthchecks + `docker rollout`)
→ P2.3 (pre-deploy snapshot + liquibase-lint) → P2.2 (post-deploy verify + auto-rollback; needs P1.7 canary)
→ P2.5 (deploy user + forced command; needs a 30-min window with the user on the box) → P2.6 (CI hardening,
environment gate) → P2.7 (multi-store extension release).

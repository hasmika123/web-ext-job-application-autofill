# PLAN — area `plat` (Platform, DevOps & reliability)

Written 2026-10-11. Machine-readable twin: `docs/roadmap/areas/plat.json` (8 epics, 51 stories: 4 done ·
1 partial · 46 not started). Audit with the competitive benchmark: `docs/roadmap/AUDIT-plat.md`. Deep
designs: `docs/design/plat/{backup-restore-pitr, deploy-pipeline-rollback, monitoring-alerting-status-page,
file-storage-seam, environments-staging-capacity, security-hardening-supply-chain}.md`.

## 1. The shape of the problem

Kiwiply runs on one shared, self-managed box behind someone else's edge proxy, deploys `:latest` with a
root SSH key, has never taken a backup, and nobody would be told if it died. That is the whole area in one
sentence, and it is why this plan is unusual: the first two sessions are mostly a human with a browser and
an SSH prompt (bucket, IAM user, Healthchecks, a paid uptime monitor, a cron file), not code. Everything
after that is code, and it falls into three threads that can run in parallel once the floor is in:

1. **Never lose data again** — backups that run, binlog shipping for a 15-minute RPO, encrypted dumps,
   drills that are timed and published, files backed up the moment the local-first storage decision puts
   them on disk, and a `FileStorage` seam so S3 is a config change later.
2. **Deploys that are boring** — a pinned SHA on the box, rolling restarts behind the edge Caddy with no
   Caddyfile change, one-variable rollback, expand/contract migrations enforced by lint, a staging stack
   fed from `develop`, and a CI key that can only say `deploy <sha>` or `rollback`.
3. **A posture we can show** — external monitors and a public status page, security headers and a slimmer
   actuator, rate limits that see the real client IP, scanning in CI, a secrets calendar, `security.txt`,
   and a `/trust` page whose every line points at a done story.

Nothing here re-litigates a locked decision: the shared edge Caddy is never ours to run; `.env` lives in
the password manager; GitHub secrets stay write-only; hosting stays long-running containers; the
`TrackingProvider` seam is untouched; the own-server move waits for proven backups and happens before
Phase 21, as ROADMAP already says.

## 2. Epics

| Epic | Pri | What | Why it matters | Main risk |
|---|---|---|---|---|
| **P0 Backups, restore & recovery** | P0 | 15.1c live, binlog PITR, `age` encryption, monthly PITR drill with RTO, files backup, quarterly rebuild | Infinite RPO today; the one failure the audience never forgives | Human steps gate everything; `develop` must be promoted first |
| **P1 Monitoring, alerting & public status** | P0 | Paid external monitors, `status.kiwiply.com`, severity routing to a phone, SLOs, log rotation, host-guard, canary | A dead box is silent today; Simplify already has a status page | Alert fatigue if routing is lazy |
| **P2 Deploy pipeline, rollback & CI** | P0 | Pinned SHA, `docker rollout`, auto-rollback, migration lint + pre-deploy snapshot, non-root forced-command deploy, CI hardening, multi-store extension release | Every deploy is a short outage and rollback is folklore | Memory spike during a roll on the shared box (needs P6.1) |
| **P3 Environments & configuration** | P1 | Local compose, staging on the box from `develop`, synthetic seed, typed env schema, env header + maintenance hook | 130-commit promotions are reviewed, not rehearsed | Staging memory on a 3.7 GB box; needs the box owner for the Caddyfile |
| **P4 Security hardening & supply chain** | P0 | Headers + CSP, actuator diet, trusted proxies + limiter on, container/host hardening, Dependabot/Trivy/gitleaks/CodeQL, secrets calendar + JWT dual-key, security.txt, DNS/TLS | A public API origin with no headers and an off limiter is visible to any reviewer | CSP breaking Google/Stripe (report-only first) |
| **P5 FileStorage seam** | P0 | Interface + local driver by config, min-free guard, sniffing/streaming/Range, ledger + orphan sweep, driver migration | User decision: local first; disk becomes user data | R0.6 may start before P5.1 — order matters |
| **P6 Capacity & own server** | P1 | Resource limits, k6 baseline, MySQL hygiene, capacity model, the rehearsed move | We can currently OOM another business; Autopilot and orgs need headroom | Provider choice and cost are the user's call |
| **P7 Incident response, runbooks & trust facts** | P1 | Runbooks per alert, incident process + game day, `/trust` facts, dependency outage matrix | Turns reliability into something users can see | Claims drifting from reality — the CI lint against `plat.json` guards it |

## 3. Recommended build order — the first 10

The skeleton proves: **a backup ran last night and restored this morning → the site is watched from
outside → a deploy rolled with zero failed requests → it could be rolled back with one value → a
user can read all of that on /trust.**

| # | Story | Why here |
|---|---|---|
| 1 | **P0.1** 15.1c go-live (bucket, IAM, Healthchecks, cron, first dump, first drill, evidence) | Finite RPO. Needs `develop → main` first (DEPLOY §13); ~2 h of the user's time |
| 2 | **P1.1** External uptime monitors on a paid plan | "The box is dead" becomes a page, not a discovery. Same session as #1 |
| 3 | **P6.1** Resource limits on every container | Cheap; prerequisite for rolling deploys and staging on a shared box |
| 4 | **P2.1** SHA-pinned deploys + one-variable rollback | Removes `:latest`; prerequisite for staging, rollout and auto-rollback |
| 5 | **P5.1** `FileStorage` interface + local driver | Must land before R0.6 writes its first PDF; unblocks P0.5 files backup |
| 6 | **P4.2 → P4.1** Actuator diet, then headers + CSP (report-only) | Two sessions of pure hardening with no human steps |
| 7 | **P2.4** Healthchecks + `docker rollout` | Deploys stop being outages; test = zero non-2xx during a roll |
| 8 | **P3.2** Staging stack from `develop` | Needs the box owner for two Caddyfile blocks; then every later story rehearses there |
| 9 | **P0.2 → P0.4** Binlog shipping, then the monthly PITR drill with RTO | RPO 15 min; the first number `/trust` can publish |
| 10 | **P1.7 → P2.2 → P1.2** Canary, auto-rollback, public status page | The user-visible reliability story: status.kiwiply.com driven by real probes |

Then in parallel lanes (strict file ownership, one Sonnet agent each):
- **Lane A (ops scripts):** P0.3 `age`, P0.5 files backup, P1.6 host-guard, P1.5 logs, P2.5 deploy user, P4.4 hardening, P6.5 MySQL.
- **Lane B (CI/pipeline):** P2.3 snapshot + Liquibase lint, P2.6 CI hardening, P4.5 supply chain, P2.7 multi-store release, P3.4 env schema.
- **Lane C (API):** P5.3 sniff/stream, P5.5 ledger + sweep, P5.2 min-free, P4.3 trusted proxies + limiter, P4.6 JWT dual-key, P7.4 outage matrix, P5.4 migration job.
- **Lane D (process + pages):** P1.3 routing, P1.4 SLOs, P7.1 runbooks, P7.2 incident process, P7.3 `/trust`, P4.7 security.txt, P4.8 DNS/TLS, P3.3 seed, P3.5 env header.
- **Later, gated:** P6.2 k6 → P6.4 capacity model → P6.3 own server (before Phase 21) → P0.6 quarterly rebuild.

Launch-critical (P0 epics) before real money (15.4): P0.1–P0.4, P1.1–P1.3, P1.7, P2.1–P2.4, P4.1–P4.3, P5.1–P5.3, P5.5.

## 4. Experience principles for Gen Z / Alpha / millennials (as they apply to reliability and trust)

This audience does not read uptime reports; they screenshot them. Reliability reaches them in three
ways and the plan is built around each. **Receipts, not reassurance**: a `/trust` page with the last
restore-drill date and a measured RTO, a status page with a real incident history, a `security.txt` —
dated facts beat "bank-grade security", and the CI lint that ties every claim to a done story keeps the
page honest when nobody is looking. **Honest degradation**: a provider outage becomes "AI is resting"
or "email delayed", never a spinner or a 500, because a 23-year-old applying at 11 pm on a phone forgives
a clear message and not a hung screen. **Invisible deploys and a short memory for failure**: rolling
restarts mean the drawer never dies mid-application; a 15-minute RPO means an outage never erases the
afternoon they spent applying; a public postmortem within five days reads as "they read the comments".
And privacy as a verifiable default: encrypted off-site backups with a key kept offline, deletion that
provably removes every file through the storage ledger, a complete subprocessor list — stated plainly,
with the "not yet" list (SOC 2, pen test, encrypted host disk on the shared box) printed right beside it.

## 5. Status honesty

`done` (4): P0.0 backup/drill scripts + CI job, P1.0 error digest, P2.0 CI + GHCR + SSH deploy baseline,
P5.0 S3 storage baseline. `partial` (1): P2.7 extension release (Chrome automated; AMO/Edge/notes
missing). Everything else `not_started` — including the two stories (P0.1, P1.1) that are mostly a
human following a runbook that already exists. Nothing is marked done because a script passes in CI; it
must run on the box.

## 6. How we beat the competition (from the benchmark, AUDIT §3)

1. **Publish the artefacts a SOC 2 would produce, without the SOC 2.** No competitor publishes backup
   cadence, drill evidence, RPO/RTO, a subprocessor list or a disclosure policy; Simplify alone has a
   status page. `/trust` (P7.3) + status (P1.2) + `security.txt` (P4.7) + the A9.7 subprocessor page
   clears the field for a few hundred dollars a year.
2. **Deploys users never notice.** `docker rollout` behind the existing edge gives zero-downtime releases
   on a single box — most small competitors restart; so do we, today.
3. **Measured recovery.** A monthly PITR drill with a logged RTO and a 15-minute RPO is a stronger claim
   than Teal's "encrypted at rest", and it is true the day it is published.
4. **Honest "not yet".** Saying we do not have SOC 2 or a pen test yet, and when we will, is the move
   this audience trusts; it also sets up the first Organization conversation (Phase 19) instead of
   being caught out by it.

### Competitive-gap rows (`docs/roadmap/COMPETITIVE-GAPS.md`, commit 0843de1)

- **G32 Public status page + incident history — accepted**, folded into **P1.2** (and P7.2 for the
  history/postmortems). One amendment: the gap's acceptance line sources status "from the A10 monitors";
  this plan sources it from **external** monitors (P1.1/P1.7) and A10 reads them — a monitor that lives
  on the box cannot report the box dying.
- **No other row is tagged P**, so nothing was rejected. Two adjacent rows need a CI gate this area
  supplies but does not claim: **G30** (manifest hosts vs the permissions page) and **G36** (honest-claims
  register lint) — both are the same pattern as P7.3's `trust-claims-check.mjs`; the M/T/E designers can
  reuse it. **G11** (Firefox/Safari presence) gets its pipeline half in P2.7; the listing work stays with
  the ext area.

## 7. Top risks

1. **The human steps stall.** P0.1, P1.1, P2.5, P3.2 and P6.3 all need the user (and twice the box owner).
   Mitigation: each is a one-page runbook with a time estimate; the first two are bundled into one sitting.
2. **Memory on the shared box.** Staging + a rolling API deploy can exceed the ~1.1 GB free. Mitigation:
   P6.1 limits first, staging at 256 m heap, host-guard stops staging first, own server before Phase 21.
3. **CSP or the trusted-proxy change breaks sign-in.** Mitigation: report-only mode with a runtime switch;
   limiter rolled on staging for a week; the canary asserts its own IP.
4. **Local-first storage lands after R0.6 starts writing PDFs.** Mitigation: P5.1 is #5 in the build
   order and R0.6's acceptance already forbids direct S3 calls.
5. **Claims drift.** A `/trust` page that overstates is worse than none. Mitigation: the CI lint ties
   every claim to a done story; stale drill data renders as "overdue", never hidden.
6. **`develop → main` promotion itself** is the riskiest single deploy of the year (DEPLOY §13). This plan
   does not change that runbook; it makes the *next* one rehearsed on staging.

## 8. Dependencies on other areas

- **A (admin):** A10.1 is the admin-page view of P0.1; A10.2 registry hosts `storage.sweep`,
  `storage.migrate`; A10.3 reads Healthchecks, host-stats JSON (P1.6) and the P1.4 thresholds; A10.4 takes
  the deploy marker (P2.1/P2.2); A10.5 links runbooks (P7.1) and the status page (P1.2); A5.6 maintenance
  flag is consumed by P3.5; A0.2 overlaps P4.2/P4.3 (admin side keeps the stale-roles and Google-MFA fixes).
- **R (resume builder):** R0.6 must use P5.1's seam; R3.3 benefits from P5.3 Range support.
- **U (user):** U1.1 CSRF/backoff complements P4.3; U14.4/U14.5 privacy copy uses P5.5 and P7.3 facts;
  U19.5 web error monitoring feeds the digest; U20.4 unified events are unaffected.
- **E (extension):** drawer error-state link (P1.2), env header check (P3.5), release pipeline (P2.7).
- **T / M / S:** `/trust` route and words, security-policy wording, `/help` links to status — facts from here.

## 9. Open questions for the user

1. **Monitoring vendor and budget**: UptimeRobot Solo (~$12/mo) for monitors + the public status page, or
   a different vendor? Free tiers are "hobby/non-profit". Plus Healthchecks Supporter ($5/mo) and a push
   channel (ntfy.sh free, Pushover $5 once). Total ≈ $17/mo.
2. **S3 Object Lock** (governance, 30 days) on the backup bucket: on? It costs nothing and stops even a
   root-credential leak from deleting backups early, but it also stops *you* from deleting early.
3. **Orange-cloud (Cloudflare proxy)** for `kiwiply.com`/`api.kiwiply.com`: the edge Caddy's ACME is
   shared with BeeCompete, so this needs their owner's agreement and a DNS-01 token. Pursue, or stay
   grey until the own server?
4. **Own server**: provider (Hetzner / OVH / DigitalOcean / IONOS), ~$25–40/mo + an encrypted data
   volume, and the target date relative to Phase 19 (Autopilot) — ROADMAP says "before Phase 21".
5. **The pre-2026-09 S3 orphans**: once P5.5's first sweep lists them, delete, or keep in case a user
   returns? (They cannot be matched to accounts; recommendation: delete after 90 days.)
6. **Code scanning if the repo is private**: GitHub Advanced Security costs per committer; Semgrep OSS is
   the free fallback. Which?

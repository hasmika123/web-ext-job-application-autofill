# HANDOFF - Sprint 2 split between machine A (coordinator) and machine B

> Written 2026-10-16 (evening). Machine B = the SECOND machine; its Claude session reads this file after `git fetch origin && git switch sprint-2`.
> Self-contained. Read sections 1 to 3 fully before touching anything. Everything here is NON-subscription work: subscriptions, billing, custom
> domains and the HR / Finance / Integrations / Executive pages are deferred to next week by the user. Do not start them.

## 1. BRANCH RULES (read twice)

| Do | Don't |
|---|---|
| `git fetch origin` then `git switch sprint-2` (this branch only carries this document on top of `version2` at the time it was cut). | Never commit to or push `version2`, `develop`, `main`, `sprint-2`, `subscription-impl` or any `sub-*` branch. |
| For each task create a branch off the CURRENT `origin/version2`: `git switch -c sprint2-b-<topic> origin/version2` (topics below). Commit ONLY there; push often: `git push -u origin sprint2-b-<topic>`. | No force-push, no `git stash` (use WIP commits), no pull requests. Machine A merges after verification. |
| Sync only when told, with `git fetch origin && git merge origin/version2`. | Do not edit the areas listed in section 3 ("machine A owns"). |

Commits: `sprint2-b: <subject>`, each ending with the line `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## 2. Rules that always apply (from CLAUDE.md; read it first)

- **No auto-submit, ever** (E1: marketers prepare, request and record; the consultant submits; Kiwiply never submits). `NoSubmit*` tests stay green and untouched.
- **We never collect sensitive PII** (no SSN/ITIN, bank/routing numbers, tax ids, passport/visa/I-9 numbers, date of birth). Use `SensitiveContent` on every new free-text write path (a coverage test, `SensitiveTextCoverageTest`, may exist once machine A merges `ent-hardening-b`; add new endpoints to the scan or give a one-line allow-list reason).
- Two kinds of account, never connected (O4). Org from the host/token only, never the client. Unknown or foreign = generic 404, never 403.
- Additive Liquibase only. Every new `/api/orgs/**` route needs a COVERAGE row in `OrgIsolationIT` (it fails otherwise) and an IT with a second tenant. Regenerate `api/openapi.json` with `OpenApiContractIT` and commit it ONLY if it keeps every route of the baseline (diff the path sets; the IT can time out at 120 s on a busy machine, rerun once).
- Everything admin-configured: limits, switches, windows come from the settings registry (`AdminSettingKeys`), never hard-coded; code ships safe defaults.
- One design system `@kiwiply/ui`; never an inline `<svg>`. Engine code in `job-autofill/` stays vanilla JS.
- **NO Playwright, no browser walks, no videos** (user paused them). Verify with unit/IT/vitest/tsc/eslint only; write 'not verified in a browser' where relevant.
- Disk and RAM on your machine: check `df`; `npm ci` once at the repo ROOT; never `rm -rf` node_modules or a worktree (Windows junctions delete sibling sources). Run ONE gradle command at a time; long ones in the background.
- If a harness hook blocks a Write/Edit, STOP and report; never route around it.
- Test commands: `cd api && ./gradlew compileJava compileTestJava --offline -q` (compile first!), `./gradlew test --offline`, `./gradlew integrationTest -x test --offline --tests '*Name*'`; web: `node web/scripts/sync-parser-core.mjs`, then in `web/`: `npx vitest run <folders>`, `npx tsc --noEmit`, `npx eslint <changed files>`. Demo/QA stack runbook: `docs/enterprise-v2/real-stack-runbook.md` (your own MySQL, your own DB).

## 3. The split

### Machine A (coordinator, this evening) OWNS - do not touch these areas
Account Manager workspace (requirements, contacts, Accounts Home, Offers, Submissions pages; `web/src/components/ent/clients`, the `accounts` workspace registry), offers and placement lifecycle (`placements`, `PlacementDemoSeeder`, consultant offers seeder), Organization Settings page and enterprise reset/notice e-mails (`web/src/components/ent/settings`, `api/src/main/resources/templates/mail/*`, `MailService`), the batch-prepare feature (`con/prepare*`, the `job-autofill/` batch controller), `ent-hardening-b` (resume approval pinning, PII coverage test), the Gmail inbox audit, and the final merge to `version2`.
Branches in flight on machine A (not on the remote yet): `ent-hardening-b`, `ent-accounts-ws`, `ent-offers-placements`, `ent-org-settings`, `ent-prepare-batch`, `ent-prepare-ext`.

### Machine B (you), in this order
1. **B1 `sprint2-b-assignments` - Marketer assignment cleanup and duplicate-submission guard** (REAL-GAPS-A rows X4.7, X4.8, X4.13; REAL-GAPS-B rows X8.4, X8.8; docs/enterprise-v2/07-backlog.md; `docs/enterprise-v2/qa/REAL-GAPS-A.md`, `-B.md` and `-C.md` are on `version2`).
   - Today the marketing UI uses the `marketer_assignment` table while `org_assignment` (the spec table) has no create/end API, no reassign history chain and no handover job. Decide the minimal correct design WITH EVIDENCE (read both tables' users first): one authoritative assignment model, an API to create/end/reassign atomically with history rows (who, when, reason), a handover job that moves open work (opportunities in flight, tasks, follow-ups) to the new marketer with an audit trail and notifications (existing kinds), and keep the `MarketerAccess` seam (decision O6, per-assignment visibility is built LATER; do not build it).
   - Duplicate-submission guard (X8.8): across consultants and across the vendor chain, the same posting for the same consultant (ApplicationKeys / dedupe key; same requirement via a different vendor) is detected at assignment and at record time: policy admin-configured (WARN or BLOCK, default WARN); an assignment cap per consultant (X8.4, admin-configured, default off); clear messages in the existing Opportunities board dialogs (small web change only in `marketer-ws`, additive).
   - Tests: unit + ITs with a second tenant, `OrgIsolationIT` rows, stories (descriptions only: grep `docs/enterprise-v2/qa/stories/*.md` for the highest ids first).
2. **B2 `sprint2-b-privacy` - Privacy and retention completeness** (`docs/enterprise-v2/qa/REAL-GAPS-C.md` rows T1.1-T1.5 and its privacy notes; pre-launch gate 1.11 in CLAUDE.md). Build, in this order: (a) retention jobs (admin-configured windows, safe defaults, dry-run mode, audited, batch-limited, safe with a second API instance) for the admin audit table, expired refresh-token rows, AI-call logs and bug reports; (b) a data-map test that fails when a new table with a user/org reference is not covered by the delete/export lists; (c) account deletion: grace period/undo window and downstream purge (inbox mail, resumes in storage, AI logs, suggestions) with a purge report; (d) async data export (job + download link, size-capped) for large accounts; (e) record of terms acceptance (version + timestamp) if absent. Tests and `OrgIsolationIT` rows as above. Do not touch login/identity internals beyond what the deletion flow needs.
3. **B3 `sprint2-b-ops` - Deploy safety and ops scripts (repo files only)** (REAL-GAPS-C rows P0.x, P1.x, P2.x, P3.2). Build: a `scripts/ops/deploy.sh` that pulls the images by explicit tag (not `:latest`), runs a pre-deploy DB snapshot hook, applies compose, waits for health, runs smoke checks, and rolls back to the previous tag automatically on failure; a staging compose overlay and `.env.staging.example`; log-rotation config for the containers; a host disk/memory guard script + cron line; Healthchecks.io ping hooks in the backup and deploy scripts (URL via env, no-op when unset); dump encryption support in `scripts/ops/backup-db.sh` (age/gpg recipient via env, no-op default) and an uploads-volume backup script; an incident and breach-notification runbook `docs/ops/incident-runbook.md`; update `DEPLOY.md` and the `docs/HANDOFF.md` sections that say crontabs are empty. NEVER edit any Caddy file or the shared edge; NEVER run anything against production; the user does the server setup (bucket, IAM, cron install). Shell scripts get careful quoting and a dry-run flag; add simple test scripts where cheap.
4. **B4 verification duty (takes priority over B1-B3 when it appears).** Machine A will append entries to section 6 below on branch `sprint-2`, listing pushed branches to verify (`git fetch origin; git show origin/sprint-2:docs/HANDOFF-ENT-SPRINT2-SPLIT.md` to read the latest; check every 30-40 minutes while you work). For each listed branch: `git switch -c verify-<branch> origin/<branch>` (a throwaway local branch, never pushed), run compile, the unit task, `OrgIsolationIT`, `OpenApiContractIT`, `TechnicalStructureTest`, the ITs named in the queue entry, and web tsc + vitest on the folders named; write the counts and any failure text into `docs/HANDOFF-ENT-SPRINT2-B-REPORT.md` section 'Verification' on your own `sprint2-b-report` branch (push it) and report in chat. Do not fix other people's branches; report failures precisely (test name, first assertion, log path).

## 4. Order of work and expected time (machine B, sequential)
B1 about 3-4 hours, B2 about 3 hours, B3 about 2 hours, verification interrupts as listed. Stop after B3 and wait.

## 5. Done when / report
Per task: branch pushed (`sprint2-b-assignments`, `sprint2-b-privacy`, `sprint2-b-ops`), tests green with counts, `api/openapi.json` kept (or untouched), stories and one log line at the END of `docs/enterprise-v2/progress-tracker.md` on each branch, REAL-GAPS-A/B/C rows updated with FIXED and commit ids. Write the final report as the last chat message AND as the committed file `docs/HANDOFF-ENT-SPRINT2-B-REPORT.md` on branch `sprint2-b-report` (what changed per task, tests with counts, deviations, open questions, verification results). Then stop and wait for the coordinator.

## 6. VERIFY QUEUE
(empty at the time of writing; machine A appends entries here as branches finish)

# HANDOFF - where things stand on 2026-10-18, and what to do next week

> **START HERE.** Written 2026-10-18 (Sunday) when the user paused until next week. Everything finished is on GitHub `version2`
> (head `06edc1b6` when this was written). Nothing is left uncommitted or unpushed. Read `CLAUDE.md` first (O4 separate accounts, E1 nobody but the
> consultant submits, no sensitive PII, one design system `@kiwiply/ui`, additive Liquibase only), then this file, then pick from section 4.

## 1. Branch state

| Branch | State |
|---|---|
| `version2` | THE integration branch. Contains everything below. Deploys nothing by itself. |
| `develop`, `main` | Far behind `version2` (about 1,380 commits). **Only the user promotes** `version2` -> `develop` -> `main` (a `main` merge is a production deploy). Not requested yet. |
| `subscription-impl` + `sub-*` streams | Already merged into `version2` (the subscription module is in; the user accepted that on 2026-10-17). The stream branches on GitHub are history and can be deleted. |
| `sprint2-b-*`, `h-*`, `resume-templates*`, `ci-green`, `e2e-fix`, `ent-deferred-design` | Machine B / C work, merged into `version2`. |

Local leftovers on the coordinator machine (safe to delete): worktrees locked by finished agent sessions (`git worktree list`; remove with the junction-safe
method in the memory note `worktree-removal-junction-hazard`: unlink `node_modules\web`, `\job-autofill`, `\@kiwiply\ui` junctions first, never `rm -rf`), and the
branches they hold (`ent-hardening-b` has one superseded openapi regeneration; everything else is fully on `version2`).

## 2. What is on `version2` (built and verified, this stretch)

Verification means: unit tests, the relevant integration tests (`OrgIsolationIT` 10/10, `OpenApiContractIT`), tsc and vitest green; some features also
walked in a real browser (marked below). Playwright story suites and the videos were NOT re-run end to end (user paused them), see section 5.

- **Org Admin:** Reports page (`/w/admin/reports`), dashboard activation checklist, Organization Settings (general + security with required reason),
  Policies (tenant policy pages with Kiwiply review queue; public `/privacy /terms /support /acceptable-use` per tenant host), Team + Manager on invites, Captured-jobs
  audit tab, audit/report CSV export, tenant-branded reset/notice e-mails.
- **Account Manager:** Requirements intake, Contacts, Accounts Home, Offers (record, extend, consultant accepts or declines), Submissions (records only),
  hire creates a placement (PENDING_START -> ACTIVE, notice, terminate).
- **Marketer:** consultant contact fields, add a job by hand, withdraw and reassign an assignment, answer a consultant's question, Save for consultant, handover
  and temporary cover (machine B `h-assign`).
- **Consultant:** Offers, Inbox, resume builder in the workspace, "Prepare selected openings" (batch open + prefill in the extension; OFF by default behind
  `enterprise.autopilot.prepare.enabled`; never submits; unit-tested only, NOT run on a live ATS page).
- **Gmail inbox (details: `docs/enterprise-v2/qa/INBOX-FEATURE-STATUS.md`):** reads interview schedules (ICS + text, DST-correct), reschedule/cancel; 0-100
  confidence and ATS-id / job-link / thread / company+role matching with ranked candidates; categories (outreach, closed role, assessment reminder, newsletters
  ignored); AI-input guards and a sensitive-data scan; rejections / ambiguous / low-confidence / backwards changes are HELD under "Needs your review"
  (accept, dismiss, choose application); undo for 7 days; "Apply rejections automatically" (default off); interview line + Undo on the Inbox page rows;
  admin stuck-mailbox list. **Browser-walked** on the sample mailbox (`web/e2e/stories/consultant/inbox-review-walk.story.ts`).
- **Security / ops hardening (X1.13, X4.10, X8.9, T5.2, X7.4, X11.7):** ops endpoints refused on public hosts, enterprise roles read from the role table only,
  no-submit guard coverage, security headers, resume approval pinning (stale when edited by anyone but the consultant), PII coverage test.
- **Machine B:** privacy + retention + deletion undo + async export + terms acceptance + subprocessor register, assignments lifecycle, deploy/rollback/backup
  scripts (`scripts/ops/*`, `docs/ops/*`), resume photo. **Machine C:** UI styling/polish, ten resume templates, CI split (unit + 6 IT shards).

## 3. Demo stack (QA stack) - how to bring it back

Runbook: `docs/enterprise-v2/real-stack-runbook.md`. Quick facts:
- MySQL: Docker container `kiwiply-qa-mysql` on `127.0.0.1:33511`, DB `dossier_ent_demo` (NEVER wipe; data lives in a Docker volume). If Docker hangs, restart
  Docker Desktop (`wsl --shutdown`), then `docker start kiwiply-qa-mysql`.
- API on `18183` (`./gradlew bootRun` with `DEMO_ENABLED=true ENT_DEMO_SEED=true DEMO_ALLOW_WRITES=true APPLICATION_LIQUIBASE_ASYNC_START=false
  DOSSIER_STORAGE_DRIVER=local DOSSIER_STORAGE_LOCAL_ROOT=./build/ent-demo-uploads`, datasource URL with `allowPublicKeyRetrieval=true`, plus random
  `DOSSIER_TENANT_HOST_SECRET` and a 32-byte base64 `DOSSIER_INBOX_KEY`); web on `3200` from a production build (`npm run build -w web`, then in `web/`:
  `DOSSIER_API_URL=http://localhost:18183 DOSSIER_TENANT_HOST_SECRET=<same> TRUST_PROXY_HOST=false npx next start -p 3200`). Hosts: `acme.localhost`,
  `beta.localhost`, `gamma.localhost` (Gamma = separate-accounts demo org). Sign in through the "Demo accounts" tab; passwords come from the seeders, never print them.
- **Sample Gmail:** the demo API serves a built-in sample mailbox (`demo/inbox-demo.json`; any 16 letters connect `kiwiply.demo.anika@gmail.com`).
  **Real Gmail demo:** set `DOSSIER_DEMO_INBOX_SANDBOX=false` and follow `docs/enterprise-v2/qa/REAL-GMAIL-DEMO.md` (dedicated account, App Password, the six mails).
- **Walk / recordings:** from `web/` with `STORY_WORKERS=1 STORY_SLOWMO=300 STORY_PAUSE_MS=1200 E2E_REAL_PORT=3200 E2E_API_URL=http://localhost:18183
  DOSSIER_TENANT_HOST_SECRET=<same> npx playwright test -c playwright.stories.config.ts e2e/stories/consultant/inbox-review-walk.story.ts`.
  GOTCHA: never reset Anika's board by direct SQL while the API is running (Hibernate second-level cache makes Accept a no-op); reset BEFORE (re)starting the API.
  Videos and screenshots go to `C:\work_bench_claude\qa-videos\` (outside git).
- **Shared build lock** (one machine, 11.7 GB RAM): `until mkdir "$TEMP/build.lock"; do sleep 15; done` ... `rmdir` (always via `trap`). Check Docker is
  responsive (`docker version`) before any integration run; run ONE gradle command at a time; tests have a 15 s default timeout (heavy fixtures in `@BeforeAll`).

## 4. Next week (the user deferred these; do not start unprompted)

1. **Subscriptions and billing, the rest** (`docs/HANDOFF-SUBSCRIPTIONS.md`, `docs/subscriptions/`): enterprise layer K6.1-K6.6 (blocked on X5/X6), annual rules K9.3/K9.5,
   billing-off parity K8.7, retirement gate K10.11 and enterprise retirement K10.7. **Open user decisions:** K8-F1, F-1, RT-3, RT-14 / S-21, S-09 (tax mode), S-11 (fee model).
   The tracker `docs/subscriptions/progress-tracker.md` is stale: reconcile it from what is actually built first.
2. **Custom domains** (X3.1-X3.8: Domains page, DNS ownership check, certificates, tenant policy/e-mail/sign-in on the custom host). The user applies the Caddy change
   (`docs/enterprise-v2/62b-edge-rules.md`). Decision needed: are custom domains sold at launch? NB the extension manifest lists `https://*.kiwiply.com/*` only,
   so custom hosts cannot reach the extension.
3. **HR, Finance, Integrations, Executive workspace pages** (X11, X12.3, X12.8; record-only, never move money, no SSN/bank/tax/DOB). Placeholders today.
4. **Add personal applications to my interview board** (consultant adds her own applications with a consent step). Decision 2026-10-18: personal inbox interviews
   stay OFF the consultant Interviews page until then (memory note `inbox-personal-interviews-parked`).
5. **Parked on purpose:** Marketing Manager workspace (8 pages), per-assignment marketer visibility O6 (`MarketerAccess` seam exists), timesheets / finance ops (needs the 23.0 brainstorm), marketer
   inbox attribution D4, extension half of X9.12 and real-ATS runs of "Prepare selected" and MKT-42/43 (need a real browser on live ATS pages).
6. **Inbox follow-ups:** closed-role / reminder mails write no timeline row yet; the mirror to the organization Interviews page needs a job-linked, FULL-consent application;
   English-only rules; accuracy on REAL mail is unmeasured (corpus is synthetic): measure with a few real mails before trusting auto-apply.

## 5. Verification debt (be honest in demos)

- **Re-run the full Playwright story suites** (`web/e2e/stories/**`) and **re-record** the videos (`docs/enterprise-v2/qa/videos-index.md`, `HANDOFF-ENT-STORY-VIDEOS.md`):
  last run was before this stretch. Known stale: PLT-05 / PLT-10 / PLT-12 (platform stories), and any story touching pages restyled by machine C.
- **Not seen in a browser:** Reports, activation checklist, Organization Settings, Policies review queue, Accounts pages (Requirements, Contacts, Offers, Submissions),
  marketer create-job / withdraw / reassign, resume approval pinning, the 390 px layouts of those pages, "Prepare selected". Resume act-for flows (MKT-47/48, CON-84/85) need the Gamma org.
- Flaky-under-load tests seen (pass alone): `JobDiscoveryPage` right rail, `CatalogPricing` review sheet, `OrgClientResourceIT.seedWorld`, `AiResumeParseServiceTest.setUp`.

## 6. Things only the user can do (server side)

Backups actually running (bucket, IAM user, `.env`, cron via `scripts/ops/install-cron.sh`, one restore drill), uptime monitors (Healthchecks / UptimeRobot), an off-box copy of
`.env`, the Caddy rules in `docs/enterprise-v2/62b-edge-rules.md`, confirming prod storage driver (`s3` vs `local`), CAA/DNSSEC, DPAs and legal review, and the decisions in section 4.

## 7. Gap and audit files (what is left, with evidence)

`docs/enterprise-v2/qa/REAL-GAPS-A.md` (tenancy, roles, domains), `-B.md` (consultants, marketing, accounts, HR, analytics), `-C.md` (security, backups, support),
`INBOX-FEATURE-STATUS.md`, `DEMO-READINESS.md`, `ENTERPRISE-ROLE-AUDIT-2026-10-16.md`. Rows marked FIXED cite commit ids; the rest are the backlog. The roadmap JSON statuses
(`docs/roadmap/areas/*.json`) are partly stale: trust the REAL-GAPS files.

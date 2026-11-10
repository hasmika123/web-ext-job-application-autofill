# Deferred enterprise areas — index, placeholders, decisions, wave plan, benchmark

> Written 2026-10-17 by Fable on branch `ent-deferred-design` (cut from `version2` 463d5f09). Design only; Sonnet engineers
> build from `stories.md`. `CLAUDE.md` wins on conflict; every decision taken here is recorded in
> `../08-decisions-for-user.md` under "Deferred-areas decisions (DD-1…DD-15)" as *Decided (recommended), revisit if you disagree*.

| File | Covers | Stories |
|---|---|---|
| `marketing-manager.md` | `/w/marketing-mgmt`: Home, Team, Consultant Assignments, Pipeline, Approvals, Workload, Escalations, Reports | MM-01…MM-17 (17) |
| `org-admin-pages.md` | `/w/admin/hr` + HR workspace, `/w/admin/finance` + Finance workspace, Reports library + families, Integrations (webhooks + CSV), Executive `/w/exec` | HR-01…08 (8), FIN-01…08 (8), REP-01…06 (6), INT-01…08 (8), EXE-01…04 (4) |
| `custom-domains.md` | Org Domains page, verification, on-demand TLS ask token, primary/redirects, suspend/remove, platform ops, the edge snippet the **user** applies | DOM-01…DOM-10 (10) |
| `org-billing-pages.md` | Subscription Overview, Consultant Licenses (+ quote → confirm, LOCAL applier), Billing & Invoices, Feature Usage | OBL-01…OBL-09 (9) |
| `stories.md` | all 70 stories with files, signatures, tests, deps | — |

## 1. What is a placeholder today (verified in code, 2026-10-17)

| Surface | Evidence | State |
|---|---|---|
| Marketing Manager workspace, 8 pages | `workspaces.json` `MARKETING_MGMT` nav exists; no `mgmt-ws` registry; catch-all renders `ComingSoon` | all 8 placeholders (role audit D4 P0) |
| Admin: Subscription Overview, Consultant Licenses, Billing, Feature Usage | `shell.ts` `ADMIN_NOT_BUILT`; no org billing controller; mirror tables seeded (`billing-data-foundation.md`) | placeholders |
| Admin: HR, Finance (+ sidebar children) | `ADMIN_NOT_BUILT`; `hr_*`/`finance_*` seeded, no service/controller (`ops-data-foundation.md`) | placeholders; HR workspace pages except Employees also `ComingSoon` |
| Admin: Reports | `/w/admin/reports` real (`GET /reports/overview` 30/90 d); `report_*` tables seeded, unread; other workspaces' Reports `ComingSoon` | partial |
| Admin: Domains | `org_hostname`, resolver 404, ask endpoint, platform subdomain ops exist; no org API, verifier, jobs, page | placeholder |
| Admin: Integrations | only `integrations.manage` + deferred flag | placeholder |
| Executive `/w/exec` Home + Reports | nav exists; catch-all `ComingSoon` | placeholders |
| Side finding (not in scope, flagged): `/w/marketing/{applications,interviews,resumes}` are shadowed by the explicit `[workspace]/<page>` folders and render the Admin pages instead of the marketer-ws ones | web inventory | bug to fix separately (one-line gate in each folder's `page.tsx`, like `jobs/page.tsx` does) |

## 2. Key decisions (full text in `08-decisions-for-user.md`)

| # | Decision |
|---|---|
| DD-1 | Manager approvals = one generic `mkt_approval_request` (kinds OPPORTUNITY_ASSIGN, DUPLICATE_OVERRIDE, RESUME_RELEASE) decided by `approvals.decide` at TEAM; holds are behind org settings whose defaults change nothing (`org.pipeline.manager_approval` NEVER, `duplicate_policy` WARN, `org.resumes.manager_review` false). The consultant's own resume approval is never replaced. |
| DD-2 | Escalations = `mkt_escalation` fed by a 15-min rules job (stalled opportunity, overdue follow-up, unanswered consultant question, overloaded marketer, approval aging) plus manual raises; auto-resolve when the condition clears. |
| DD-3 | "My team" = the existing TEAM/DEPARTMENT scope rule (`ScopeDirectory`), admins at ORG see all; no new permission keys anywhere. |
| DD-4 | HR/Finance/Reports build on the **built ops data foundation** (`hr_*`, `finance_*`, `report_*`), not doc 36's `employment_record`/`hr_task`/`ops_*` names; doc 36's rules (E2, verbs, scanner) stay. |
| DD-5 | `hr_document_requirement` stays status-only (type + status label); UI says "tracked elsewhere — Kiwiply stores only the status". |
| DD-6 | Finance workspace Timesheets/Approvals = the monthly `finance_timesheet` records; product-H week-view embedding stays out of scope. |
| DD-7 | Reports library management uses `reports.export` as the "manage" key (no new key); CSV only in v1; scheduled runs notify in-app, never attach files to e-mail. |
| DD-8 | Integrations v1 = outbound webhooks (40 §9.2) + two-phase CSV import/export of consultants and requirements; **no OAuth, no Google API, no inbound API keys, no "sync"**. |
| DD-9 | Executive Home = the org dashboard projected to counts with a k-anonymity floor (`org.analytics.k_min` 5), via the existing widget registry; Reports = shared page, family `exec`. |
| DD-10 | Ask token as query `t`, dedicated `DOSSIER_ASK_TOKEN` (B1 a). |
| DD-11 | dnsjava added to the API (B7 a). |
| DD-12 | Custom domains are sold at launch behind `flag.enterprise.domains` per org; apex allowed with a subdomain recommendation (B4 a); Google sign-in per host stays out (E14 a). |
| DD-13 | Org billing pages read the mirror; no Stripe call on a page read. |
| DD-14 | Licence changes = quote → confirm through one `OrgLicenseChangeService` with a `LocalBillingApplier`; the Stripe applier (X6.6/X6.7) plugs into the same `LicenseChangeApplier` seam later; seat TRANSFER / interval / plan-version stay K6. |
| DD-15 | Invoices list = `org_invoice` mirror; the customer portal is the only Stripe call and is disabled until the org has a Stripe customer (X6.12). |

Flags that become live (default **off**, platform admin turns them on per org): `flag.enterprise.hr_finance`, `flag.enterprise.integrations`, `flag.enterprise.analytics`, `flag.enterprise.billing`.

## 3. Wave plan (parallel agents never share an exclusive file; shared files are append-only)

**Wave 1 — API foundations, 7 agents in parallel** (each owns its own changelog file, service package, resource package and test classes; shared appends: `master.xml`, `OrgIsolationIT`, `DataMap`, `EnterpriseSettingKeys`):

| Agent | Stories | Exclusive packages |
|---|---|---|
| A-MM | MM-01 → MM-02 → MM-03 → MM-04 → MM-05 → MM-06 → MM-07 → MM-08 | `service/ent/mgmt/**`, `service/ent/mkt/{approvals,escalations}/**`, `web/rest/ent/mgmt/**`, `MktApprovalsResource`, `MktEscalationsResource` (+ small edits in `OpportunityAssignmentService`, `DuplicateGuard`, `MktResumesService`, `MarketingAssignmentsService`, `OrgReportsService` — A-REP must not edit `OrgReportsService` in Wave 1) |
| A-HR | HR-01 → HR-02 → HR-03 → HR-04 | `service/ent/hr/**`, `web/rest/ent/hr/**`, `service/privacy/NoSensitiveText*`, changelog `…_ent_hr_finance_pages.xml` (HR-01 creates it **with the FIN columns too**, so A-FIN never touches it) |
| A-FIN | FIN-01 → FIN-02 → FIN-03 → FIN-04 | `service/ent/finance/**`, `web/rest/ent/finance/**` (starts after HR-01 is merged, or on a stub changelog branch rebased later) |
| A-INT | INT-01 → INT-02 → INT-03 → INT-04 → INT-05 | `service/ent/integrations/**`, `web/rest/ent/integrations/**` (INT-03's one-line producers at other services' call sites land in Wave 2 after the other streams merge) |
| A-DOM | DOM-01 → DOM-02 → DOM-03 → DOM-04 → DOM-05 → DOM-07 → DOM-08 | `service/ent/domains/**`, `web/rest/ent/domains/**`, `InternalTenantHostResource`, `OrgTenancyService`, `build.gradle` (dnsjava) |
| A-OBL | OBL-01 → OBL-02 → OBL-03 → OBL-04 → OBL-05 | `service/ent/billing/**`, `web/rest/ent/billing/**` |
| A-EXE | EXE-01 | `service/ent/dashboard/Exec*`, `OrgDashboardService` (nobody else edits it) |

**Wave 2 — web pages + the cross-cutting API, 7 agents in parallel** (each owns `components/ent/<area>/**`, `lib/ent/<area>*.ts`, `app/api/orgs/[orgId]/<area>/**`, `w/[workspace]/<key>/page.tsx` (new folders only), `scripts/mock-<area>.mjs`; shared append: `scripts/mock-api.mjs`):

| Agent | Stories |
|---|---|
| W-MM | MM-09 → MM-10 → MM-11 → MM-12 → MM-13 → MM-14 → MM-15 → MM-16 |
| W-HR | HR-05 → HR-06 → HR-07 |
| W-FIN | FIN-05 → FIN-06 → FIN-07 |
| W-INT | INT-06 → INT-07, then INT-03's producer lines (API) |
| W-DOM | DOM-06 |
| W-OBL | OBL-06 → OBL-07 → OBL-08 |
| W-REP | REP-01 → REP-02 → REP-03 → REP-04 → EXE-03 → REP-05 → EXE-02 (REP needs Wave-1 sources; it owns `service/ent/reports/**` and `components/ent/reports/**`, `components/ent/exec/**`) |

**Wave 3 — wiring, one agent, sequential** (the exclusive files): MM-17 → EXE-04 → HR-08 → FIN-08 → OBL-09 → DOM-09 → INT-08 → REP-06 → DOM-10. Each removes its keys from `ADMIN_NOT_BUILT`, updates `shell.test.ts`, adds its branch to the catch-all, writes the QA story file, regenerates `openapi.json`, runs `OrgIsolationIT`, `DataMapIT`, `LiquibaseAdditiveTest`, `OpenApiContractIT`, `shadowing.test.tsx`, full `npm test`.

Order inside a wave respects the `Deps` column of `stories.md`. Estimated effort: Wave 1 ≈ 6 agent-days, Wave 2 ≈ 6, Wave 3 ≈ 2.

## 4. Competitor benchmark (brief) — manager dashboards, approvals, escalations in staffing/consultancy tools

| Tool | What managers get | What we take | Source |
|---|---|---|---|
| **Bullhorn** | A "Recruiter Dashboard for Managers" that shows the same eight reports as a recruiter's but lets the manager pick whose dashboard to view: recruiting activity vs goals, placements actual-to-goal, jobs without coverage, and three **"without status change in 5 days"** stall reports (submissions, client submissions, interviews), plus placements ending in 30 days. | Our Escalations rules are exactly these stall reports turned into actionable rows (`STALLED_OPPORTUNITY`, `OVERDUE_FOLLOWUP`), and the Team page's member sheet is the "pick a user" view. | [Bullhorn KB — Running the Recruiter Dashboard](https://kb.bullhorn.com/ats/Content/BHATS/Topics/runningRecruiterDashboard.htm) |
| **Ceipal** | Admin-configured approval workflows (e.g. an approver must OK a placement; requisitions can route supervisor → boss) and a **unified Approvals dashboard** across jobs, clients, vendors, timesheets. | One generic approval queue with kinds, admin-set policies (`org.pipeline.manager_approval`), and a finance timesheet approve/reject on the same pattern. | [Ceipal KB — placement approvers](https://knowledgebase.ceipal.com/?p=845), [Ceipal product page](https://www.ceipal.com/?p=151) |
| **JobDiva** | Custom BI dashboards with KPIs and **scheduled reports e-mailed to stakeholders** (recruiting managers, account managers, back office). | The Reports library with schedules and recipients; we notify in-app with a link instead of e-mailing files. | [GetApp — JobDiva features](https://www.getapp.com.au/software/106391/jobdiva) |
| **Zoho Recruit** | Approval processes on records with Anyone/Everyone approvers, sequential or parallel, up to 10 per module; approvers act from a **pending list (MyActions)**; hiring-manager "Approve/Reject Submission" transitions inside a blueprint. | A single pending list with Approve/Reject + note, one open request per subject, admins can act on all; we keep one approver level in v1 (no chains). | [Zoho Recruit help — Approval Process](https://help.zoho.com/portal/en/kb/recruit/automation/approval-process/articles/approval-process) |
| **Avionté** | Real-time BI dashboards (placements, revenue, billing, candidate flow, **recruiter activity/productivity**), role-tailored and filterable by branch/client; a recruiter "priority dashboard" of high-priority tasks. | Workload page with per-marketer load and 8-week series; Manager Home "Needs you" list as the priority view. | [Avionté — BI for staffing](https://www.avionte.com/?p=216) |
| **Vincere** | Prebuilt dashboards drilling brand → office → **team → consultant**; a TV mode with pipeline status and top performers; a user-engagement dashboard that counts actions, not targets; invoice dashboards that surface **approval status and dates**. | Team-scoped drill-down (`TeamScope`), activity feed per marketer, approval timestamps on finance records (`finance_event`). | [Vincere — prebuilt dashboards](https://vincere.io/prebuilt-recruitment-dashboard), [Vincere help — TV dashboard](https://help.vincere.io/en/articles/9399046-tv-dashboard), [Vincere help — invoices dashboard](https://help.vincere.io/en/articles/10183566-invoices-dashboard-vincere-intelligence) |

Gap none of them close that we keep: Kiwiply **never submits** and never moves money — approvals here release a marketer's *preparation*, and finance pages are records; that is a product stance (E1/E2), not a missing feature.

# AUDIT — area `org` (organization dashboard, marketing /organizations, org model, billing, consultancy, services)

Audited 2026-10-11 on branch `product-roadmap` against the code. Legend for **state**:
**real** = API + tables + tests behind it · **partial-sample** = UI built, every number from
`web/src/components/org-v2/sample-data.ts` (file header: "SAMPLE — board data, not from the API") ·
**missing** = nothing in code.

## 0. The one finding that frames everything
There is **no organization model anywhere in the API**: no `organization`/`org_member` table in
`api/src/main/resources/config/liquibase/changelog/` (46 changelogs, the newest is
`20261011010000_app_setting.xml`), no `Org*` domain class in `api/src/main/java/com/dossier/api/domain/`,
no `/api/orgs` resource in `web/rest/`. The only org-flavoured server code is the sales-inquiry intake
(`SalesInquiryService.TOPICS` contains `organization`, `consultancy`, `consultancy-ops`) and demo
accounts. `web/src/app/(org)/layout.tsx` says so in its own comment: *"no organization model exists in
the API yet, so ANY signed-in user can open `/org` … every number on the pages is sample data"*, and
`web/src/lib/site.ts` keeps `/org/` in `NON_INDEXABLE_PATHS`. Entitlements are per-user Pro only
(`EntitlementService.isPro(login)` over the `subscription` mirror; no grants, no catalog — Phase 18 is
not started). So: the UI shell exists and looks finished; the product behind it does not exist.

## 1. Page-by-page

| route | state | evidence | gaps / what remains |
|---|---|---|---|
| `(org)` layout + `OrgShell` | partial-sample | `web/src/app/(org)/layout.tsx` (session gate copies `(app)`, `robots: noindex`), `components/org-v2/shell/OrgShell.tsx` (10-item nav, bell hard-coded "1 unread", role label hard-coded "Admin"), `OrgChip.tsx` (reads `ORG = {name:"Acme Corp", plan:"Enterprise"}` from sample) | no membership/role gate; no org switcher; nav not role-aware; bell is fake; no mobile bottom nav (sidebar drawer only); demo badge logic exists (`isDemoLogin`) |
| `/org` Dashboard | partial-sample | `org-v2/dashboard/DashboardPage.tsx` ← `DASHBOARD_STATS`, `PLACEMENT_PIPELINE`, `TIMELINE`, `UPCOMING_INTERVIEWS`, `OPPORTUNITIES`, `DASHBOARD_QUICK_ACTIONS` | no metrics API; no activation checklist/empty state; "Placements" has no data source (no placement concept in `ApplicationStatus` = SAVED/APPLIED/INTERVIEW/OFFER/REJECTED) |
| `/org/team` | partial-sample | `team/TeamPage.tsx`, `team/TeamTable.tsx` ← `EMPLOYEES`, `TEAM_TABS`, `DEPARTMENTS`, `SUPPORT_OWNERS`; spec §6.9 buttons "Add Employee / Import CSV / Bulk Assign" | no members API, invites, CSV import, groups, support owners, roles, seat assignment; "Placement Stage" per employee would need consent (none exists) |
| `/org/opportunities` | partial-sample | `opportunities/OpportunitiesPage.tsx`, `OpportunitiesTable.tsx` ← `OPPORTUNITIES`, `TOP_HIRING`, `PIPELINE_DONUT`, `RECENT_ASSIGNMENTS` | no org job bank / `job_assignment` (ROADMAP 22.3); "Match Score" per org role has no engine (job matching is per user, `job_match` tables, Phase 16); "Employer Responses" undefined |
| `/org/applications` | partial-sample | `applications/ApplicationsPage.tsx`, `ApplicationsTable.tsx` ← `APPLICATIONS`, `STAGE_BREAKDOWN`, `RECENT_RESPONSES`, `FOLLOW_UP_TASKS`, `TIMELINE` | real `application` rows exist per user but no org view and no consent model; spec rows show employer names per person (would require FULL scope); "Resume Status: Needs Update", follow-up tasks, "Add Application / Bulk Update / Send Reminder" have no backing |
| `/org/interviews` | partial-sample | `interviews/InterviewsPage.tsx`, `InterviewCalendar.tsx` ← `CALENDAR_EVENTS`, `UPCOMING_INTERVIEWS`, `PREP_STATUS`, `PREP_CHECKLIST`, `INTERVIEW_OUTCOMES` | no interview entity with dates in the API (applications have status INTERVIEW only); "Mock Interviews" = human service (Phase 20) not built; prep checklist undefined; "Schedule Interview" conflicts with "never act for the member" |
| `/org/analytics` | partial-sample | `analytics/AnalyticsPage.tsx` ← `ANALYTICS_STATS`, `APPLICATION_TREND`, `PLACEMENT_FUNNEL`, `RESPONSE_RATE`, `DEPARTMENT_PERFORMANCE`, `SUPPORT_OWNER_PERFORMANCE`, `ROI_TILES`; HTML/CSS charts in `app-v2/common` | no metric definitions, no rollups, no consent filtering, no export/schedule; "ROI 3.2x", "Hiring Manager Satisfaction 96 %" are unmeasurable (dropped in design) |
| `/org/resumes` (AI Resume Support) | partial-sample | `resumes/ResumesPage.tsx` ← `RESUME_STATS`, `EMPLOYEE_RESUMES`, `RESUME_SUGGESTIONS`, `RESUME_TOOLS` | per-user resumes + ATS scoring exist (`resume`, `resume_match`, `ResumeTailorResource`, `AtsScoreResource`) but no org view; "Bulk Tailor Resumes" for other people violates "never act for the member" except via the Phase 22 marketer flow; suggestions panel would spend the member's AI budget on an admin's click (not allowed) |
| `/org/integrations` | partial-sample | `integrations/IntegrationsPage.tsx` ← `INTEGRATIONS` (9 "Connected" apps), `AUTOMATION_FLOWS`, `API_ACCESS_ROWS`, `NOTIFICATION_ROUTES` | none exist; only real integrations are the extension and per-user Gmail IMAP (`InboxConnection`); Workday/Greenhouse are autofill *targets*, not org integrations; see `docs/design/org/integrations.md` §1 |
| `/org/billing` | partial-sample | `billing/BillingPage.tsx` ← `INVOICES`, `USAGE`, `SUBSCRIPTION_DETAILS`, `PLAN_FEATURES`, `BILLING_CONTACTS`; "Enterprise plan, 72/100 seats, Visa 4242" | no org Stripe customer/subscription/invoices; real per-user billing exists (`BillingResource`, `BillingWebhookService`, `StripeGateway`, `subscription` table, `EntitlementServiceTest`) and is the pattern to extend; pricing model in UI ("Enterprise plan, seats, annual contract") contradicts the locked model (setup fee + per-person items, monthly, no annual) |
| `/org/settings` | partial-sample | `settings/SettingsPage.tsx` ← `ABOUT_COMPANY`, `INDUSTRIES`, `DEFAULT_ROLES` ("Recruiter, Hiring Manager, Admin, Support Owner, Viewer"), `PERMISSION_TOGGLES`, `ADMIN_ROLES`, `APPROVAL_RULES`, `SECURITY_CHECKS` ("SSO Enabled, 2FA Required, AES-256") | no org settings API; roles/permissions invented (design fixes the matrix: OWNER/ADMIN/STAFF/MEMBER + MARKETER/FINANCE); "Security Status" claims untrue (no SSO; admin MFA exists only for *platform* admins via `AdminMfaChallenge`); 5 of 7 tabs are "Coming soon" |
| `/organizations` (marketing) | partial | `web/src/app/(marketing)/organizations/page.tsx` → `components/marketing/organizations/*` (hero, 12 feature cards, how, visibility, reporting, CTA); `placeholder-data.ts` marked PLACEHOLDER (numbers/quotes); CTA "Book a Demo" → `/contact?topic=organization` | no self-serve "Start your workspace"; feature cards promise "Application automation", "Email & response tracking", "Role-based permissions", "Notes & activity timeline" that do not exist yet; mock stats are placeholders (user decided honesty for marketing — `honest:` commits) |
| `/pricing` Consultancy card + add-ons | real (copy) / missing (checkout) | `web/src/lib/catalog.ts` (`CONSULTANCY` $499 setup + per-person table, `CONSULTANCY_ADDONS` Marketer seats $29.99, Ops "Custom"), topics map to `SalesInquiryService.TOPICS` | sold via contact form only; prices hard-coded pending Phase 18 catalog; note `TOPIC_LABELS.organization = "Consultancy plan"` (the generic Organization offer is labelled as consultancy — copy decision to revisit) |
| `/contact?topic=organization` (sales intake) | real | `SalesInquiryResource`/`SalesInquiryService` (public submit, admin queue, audited status changes, mail to sales), changelog `20261005010000_sales_inquiry.xml`, `AdminSalesInquiryResource` | no conversion path from inquiry → org creation; no CRM fields beyond company/team size |
| Member side ("my organizations", consent, leave) | missing | — | nothing; `AccountExportResource`/`AccountDeletionResource` exist and are the hooks for GDPR additions |
| Marketer workspace (Phase 22) | missing | ROADMAP only; extension has no role concept (`job-autofill/src/lib/tracking.js` seam is where "Save for consultant" would go) | — |
| Consultancy Ops (Phase 23) | missing | ROADMAP draft scope; "23.0 brainstorm" not done — `docs/design/org/consultancy-ops.md` proposes the locked spec | — |
| Services marketplace (Phase 20) | missing (copy real) | `EXPERT_SERVICES` in `catalog.ts`; `SalesInquiry` topics `resume-review` etc. | no `expert`/`service_order` tables, no checkout, no expert portal, no payouts |
| Catalog & entitlements engine (Phase 18) | missing | `EntitlementService` = per-user Pro from `subscription`; config `pro-monthly-budget-usd`, resume caps in code | product/price/entitlement/grant tables absent; org billing cannot start before it (owner: admin area `A*`; see PLAN open question) |

## 2. Tests that exist in scope
- API: `api/src/test/java/com/dossier/api/service/EntitlementServiceTest.java` (status × period matrix),
  billing webhook tests (per-user), sales inquiry tests. **Zero** org tests (nothing to test).
- Web: `npm test -w web` = `tsc + eslint` only; no component tests in `web/src` (glob `**/*.test.*`
  → none). HANDOFF-V2 "never verified": tap targets, keyboard/screen reader, dark mode, real-API
  behaviour for these pages.
- Extension: unaffected so far (no role concept).

## 3. Cross-cutting gaps
| area | gap |
|---|---|
| Tenancy/RBAC | no org scoping, no permission model, no isolation tests (ROADMAP 21.0 gate) |
| Money | no org customer, invoices, proration, dunning; no margin guard; no catalog |
| Privacy/PII | no consent model; sample pages display per-person employer data an org must not see by default; no org audit trail |
| Data integrity | "placed" has no source; seat counts have no source |
| AI cost/abuse | admin-triggered AI on members' budgets is implied by the Resumes page — disallowed by design |
| Notifications | `Notification` table is per-user, kinds limited to inbox statuses; no org kinds, digests, quiet hours |
| Mobile/a11y | shell has a drawer, no bottom nav; tables use `DataTable` with `minWidth` (horizontal scroll on phones); no 390 px designs for org flows |
| Security claims | settings page asserts SSO/2FA/AES-256 — untrue for orgs |
| Marketing honesty | feature cards overpromise vs what will exist at Phase 21 |

## 4. What is reusable (don't rebuild)
`BillingWebhookService` idempotency/ordering pipeline and `StripeGateway` seam; `AdminAuditEvent`
shape; `InboxConnection` + `SecretBox` for marketer inbox and Slack secrets; `Notification`;
`SalesInquiry` intake; `AccountDeletion/Export` services; `DemoAccountService`/`DemoBadge` for a demo
org; `app-v2/common` primitives (`StatRow`, `DataTable`, `Donut`, `SectionCard`, `RailLayout`,
`MascotCard`) and `OrgPageHero`; `catalog.ts` copy for the sales page; `JobCapture` (JSON-LD) for the
job bank; resume builder `R*` stories for marketer-made/expert-made resumes.

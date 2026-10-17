# QA use-case stories: PLT (Platform, cross-cutting, and the HR / Finance / Accounts / Executive workspaces)

Area key `PLT`. Specs: `web/e2e/stories/platform/*.story.ts` (shared helpers in `_platform.ts`). Stack: Spring API + MySQL + `next start`
with the demo tenants **Acme Staffing** (`http://acme.localhost:3200`) and **Beta Talent** (`http://beta.localhost:3200`), API started with
`DEMO_ALLOW_WRITES=true`. Roster source: `api/.../service/ent/EnterpriseDemoSeeder.java`. Sessions come from `_support/global-setup.ts`
(one Demo-accounts sign-in per persona).

Story-fix log 2026-10-16 (branch ent-story-fixes): fixed in the specs, none weakened: **PLT-05** (the Demo accounts tab shows the seeded role names, "Organization Admin + Marketing Manager"), **PLT-12** (split: Acme and Beta people are PLT-12; the separate-accounts people of Gamma are **PLT-12b**, which runs when their sign-ins were cached with `GAMMA_DEMO_PASSWORD`), **PLT-14** (Audit Logs is a built page now; the story asserts that), **PLT-23** (an unknown job id is the generic 404 by design, a job of this organization answers 200), **PLT-43** (the empty state's own title is the exact, always-visible line; the header subtitle is hidden on a phone). **PLT-42** was a real product bug, fixed: the Marketing home's Job Stream Monitor and Top Openings tables had no overflow box and pushed the page 76 px wider than a 390 px phone.

Status key: **AUTOMATED** (a Playwright story drives it) · **BLOCKED:why** (cannot be driven safely or at all on the demo stack) ·
**NOT-BUILT:roadmap** (the page or flow does not exist yet; the story records what the UI honestly does today).

## 1. Area overview

### What this area does in the product

Kiwiply Enterprise V2 is a multi-tenant staffing/consultancy platform. Every organization is a *tenant* reached on its own host. The host
alone decides the tenant (clients never name one); the shell, menu and pages are the same code for everyone, recoloured by the
organization's published branding, and every menu is *data* the API filtered by the member's real permissions and the organization's
modules. This area covers what is common to every role:

- **Tenant resolution and branding:** host → organization (name, logo, two colours, welcome copy, support address); an unserved host is a
  generic 404 with no cookie; the platform host never serves the tenant tree.
- **Sign-in:** the branded sign-in; the *Demo accounts* tab (dev-style drawer, API-driven, empty unless the API's `DEMO_ENABLED` and
  `ENT_DEMO_SEED` are on) which lists the roster and refuses paused/invited members; login-first redirects with a safe `?next=`.
- **The shell:** sidebar (desktop) / top bar + quick tabs + menu sheet (phone), role-based landing, workspace switcher (only for members
  with more than one workspace; Sarah has two), one menu per role, honest "This page is on the way" pages, and the "This isn't part of your
  role" denied state (no redirect, no data).
- **Isolation:** one organization can never read another's data; the API answers a generic 404 (never 403) for anything you may not read.
- **E1 rules:** marketers prepare, request and record; the consultant submits; Kiwiply never submits. No auto-submit surface anywhere.
- **Licensing / entitlements:** what is built today (see 4.3).
- **The other role workspaces:** HR (People), Finance, Accounts (Clients), Executive (Overview).

### Roster used (all sign in through the Demo accounts tab, no password)

| Key | Person | Tenant | Roles | Lands on |
|---|---|---|---|---|
| sarah | Sarah Chen | Acme | Org Admin + Marketing Manager | `/w/admin` (also `/w/marketing-mgmt`) |
| omar | Omar Haddad | Acme | Marketing Specialist | `/w/marketing` |
| anika, ben | Anika Rao, Ben Okafor | Acme | Consultant | `/w/consultant` |
| hana | Hana Petrov | Acme | HR Specialist | `/w/hr` |
| tomas | Tomas Berg | Acme | Talent Acquisition | `/w/hr` |
| felix | Felix Ng | Acme | Finance Specialist | `/w/finance` |
| amara | Amara Silva | Acme | Account Manager | `/w/accounts` |
| eve | Eve Lindqvist | Acme | Executive Viewer | `/w/exec` |
| sam | Sam Whitfield | Acme | Consultant, **suspended** (cannot sign in) | n/a |
| nina | Nina Vogel | Acme | Consultant, **invited** (no account yet) | n/a |
| bea | Bea Turner | Beta | Owner | `/w/admin` |

Branding seeded by the demo seeder: Acme primary `#1d5bd8` (blue, **not teal**) + secondary `#f59e0b` (amber); Beta primary `#4338ca`
(indigo) + secondary `#ec4899` (pink). The stories compare the generated theme variables (`--brand-solid`, `--brand-2-solid`) between the
two hosts rather than hard-coding hex values, because the UI derives a 50..900 scale from each colour.

### Pages that exist, by workspace (verified against `workspaces.json`, the `[workspace]` route folders and the catch-all)

A menu entry opens a **real page** when a route folder exists for it (`/w/{workspace}/employees|clients|placements|interviews|applications|jobs|resumes|consultants|teams|departments|roles|invitations|branding|marketing-assignments` are shared folders, gated per page by permission or menu listing; `/w/consultant/**` and `/w/marketing/**` have their own page registries). Everything else in a menu is the `ComingSoon` page ("This page is on the way", with the bee), never a 404. The Administration home (`/w/admin`) is the Organization Dashboard only for a member holding `dashboard.view_org`.

| Workspace | Real pages today | "On the way" (menu lists it, page not built) |
|---|---|---|
| HR `/w/hr` (Hana, Tomas) | Employees | Home, Onboarding, Documents, Compliance, Lifecycle, Offboarding, Candidates, Talent pools, Reports |
| Finance `/w/finance` (Felix) | Placements (shared board, by `placements.view`) | Home, Consultant Subscriptions, Billing, Invoices, Timesheets, Approvals, Payments, Reports |
| Accounts `/w/accounts` (Amara) | Clients, Placements, Interviews | Home, Contacts, Requirements, Submissions, Offers |
| Executive `/w/exec` (Eve) | none | Home, Reports |
| Administration `/w/admin` (Sarah, Bea) | Dashboard, Employees, Invitations, Teams, Departments, Roles & Permissions, Consultants, Resumes, Marketing Assignments, Jobs, Applications, Interviews, Clients, Placements, Organization Branding | Subscription Overview, Consultant Licenses, Billing, Feature Usage, HR, Finance, Reports, Domains, Integrations, Audit Logs, Settings |

Module flags matter for menus: the demo seeder enables `enterprise`, `domains`, `roles`, `marketing`, `consultant_jobs` only. `billing`,
`hrFinance`, `integrations` and `analytics` stay off unless the coordinator turns them on, so with the default seed Hana's and Tomas's HR menu
is just Home + Employees (+ Offboarding for Hana) and Felix's Finance menu is just Home. The stories read the live menu and only assert on
entries that are present, so they pass either way (see PLT-33, PLT-34).

### Pages not built yet (roadmap pointers)

HR Home/Onboarding/Policies/Compliance/Lifecycle/Candidates/Talent pools/Reports: X11.1 to X11.8 (doc 16 section 5.5, doc 36). Finance
Home/Subscriptions/Billing/Invoices: X6.1 to X6.4; Timesheets/Approvals/Payments/Placements-with-rates/Reports: X11.4 to X11.6 (doc 16 5.6).
Accounts Home/Contacts/Requirements/Submissions/Offers: X10.1 to X10.5 (doc 16 5.7). Executive Home/Reports: X12.1 + X12.8 (doc 16 5.8).
Admin Subscription/Licenses/Billing/Usage: Session C (docs 24, 28). Audit Logs viewer: no story yet (the evidence API exists, see PLT-23).

---

## 2. Tenant resolution and branding

### PLT-01 A visitor reaches Acme Staffing's branded sign-in
- **Persona:** anonymous visitor. **Goal:** every organization has its own front door, drawn from its published branding only.
- **Preconditions/data:** Acme published branding: title "Welcome to Acme Staffing", message "Sign in to your consultant bench, placements and team workspace.", support `support@acme.example.com`, generated logo.
- **Steps:** 1 Open `acme.localhost:3200/login`. 2 Read tab title, heading, message. 3 Check logo slot, support mailto link. 4 Check the form: User Name, Password, Sign In.
- **Expected:** title contains "Acme Staffing"; H1 "Welcome to Acme Staffing"; logo present; `mailto:support@acme.example.com` link; no Kiwiply chrome.
- **Negative:** see PLT-03 (unknown host).
- **Linked:** `/login` (rewritten to `(tenant)/%5Ft/login`), `GET /api/public/tenant` (host resolution), `GET /api/ent/demo`.
- **Automation:** `tenant-branding.story.ts` → "PLT-01 A visitor reaches Acme Staffing's branded sign-in". **Status: AUTOMATED**

### PLT-02 Beta Talent gets its own colours and copy from the same code
- **Persona:** anonymous visitor. **Goal:** branding is per tenant; nothing leaks between tenants.
- **Preconditions:** Beta branding indigo/pink, "Welcome to Beta Talent", "Sign in to your people workspace.", `help@beta.example.com`.
- **Steps:** 1 Open Acme `/login`, record theme variables. 2 Open Beta `/login`. 3 Read heading, message, support link. 4 Compare variables. 5 Check no "Acme Staffing" text.
- **Expected:** Beta copy and support address; `--brand-solid` and `--brand-2-solid` differ from Acme's; no Acme name anywhere.
- **Automation:** `tenant-branding.story.ts` → "PLT-02 ...". **Status: AUTOMATED**

### PLT-03 An unknown host is a plain 404
- **Persona:** anonymous. **Goal:** an unserved host reveals nothing and sets no cookie.
- **Steps:** 1 Open `nobody.localhost:3200/`. 2 Open `nobody.localhost:3200/w/admin`.
- **Expected:** HTTP 404, no `Set-Cookie`, generic page "This workspace isn't available" (`[data-tenant-unavailable]`), no Acme/Beta/Kiwiply text.
- **Negative variant:** the API being unreachable shows a different "try again" page (`TenantTemporarilyUnavailable`), never "doesn't exist" (not automated: needs the API down).
- **Linked:** `(tenant)/not-found.tsx`, `TenantUnavailable`, `proxy.ts`.
- **Automation:** `tenant-branding.story.ts` → "PLT-03 ...". **Status: AUTOMATED**

### PLT-04 The platform host never serves the tenant tree
- **Persona:** anonymous. **Steps:** open `localhost:3200/_t`, then `localhost:3200/w/admin`.
- **Expected:** `/_t` is 404; no `[data-enterprise-shell]` on the platform host.
- **Automation:** `tenant-branding.story.ts` → "PLT-04 ...". **Status: AUTOMATED**

---

## 3. Sign-in

### PLT-05 The Demo accounts tab lists Acme's roster; paused and invited members cannot sign in
- **Persona:** anonymous visitor on Acme's `/login`. **Goal:** demo and QA can enter as any role in one click; non-active members are visible but blocked.
- **Preconditions:** API with `DEMO_ENABLED` + `ENT_DEMO_SEED`; 11 seeded Acme people (9 active, Sam suspended, Nina invited).
- **Steps:** 1 Click the "Demo accounts" side tab. 2 Count `[data-demo-member]` rows (11). 3 Confirm nine "Sign in as <name>" buttons. 4 Read Sarah's role line ("Org Admin ..."). 5 Inspect Sam's row (`data-status=SUSPENDED`) and Nina's (`INVITED`).
- **Expected:** Sam: "Access paused - can't sign in", no button. Nina: "Invitation pending - no account yet", no button. No "Sign in as Sam Whitfield / Nina Vogel" button exists.
- **Negative:** `POST /api/auth/tenant-demo` with Sam's login is refused by the API (API IT; the UI never offers it).
- **Linked:** `TenantDemoTab`, `GET /api/ent/demo` → `/api/public/tenant/demo`, `POST /api/auth/tenant-demo`.
- **Automation:** `sign-in.story.ts` → "PLT-05 ...". **Status: AUTOMATED**

### PLT-06 Beta's Demo accounts tab shows only Beta's person
- **Steps:** open Beta `/login`, open the tab. **Expected:** exactly one row, "Sign in as Bea Turner"; no Acme names.
- **Automation:** `sign-in.story.ts` → "PLT-06 ...". **Status: AUTOMATED**

### PLT-07 A wrong password shows one calm message
- **Steps:** type `sarah.chen@acme.example.com` and a wrong password, press Sign In; then open `/w/admin`.
- **Expected:** "Incorrect email or password." stays on `/login`; `/w/admin` still redirects to `/login` (no session).
- **Note:** the seeded users have random per-boot passwords nobody knows, so a *correct* password sign-in is not part of any story; the Demo tab is the only way in. A 429 ("Too many attempts") would indicate rate limiting hit by earlier runs.
- **Linked:** `POST /api/auth/login`. **Automation:** `sign-in.story.ts` → "PLT-07 ...". **Status: AUTOMATED**

### PLT-08 A signed-out deep link is sent to the sign-in with a return path
- **Steps:** open `/w/admin/employees` signed out; check `?next=`; open `/login?next=https://evil.example/steal` and sign in as Hana via the Demo tab.
- **Expected:** `/login?next=%2Fw%2Fadmin%2Femployees`; the foreign `next` is ignored (the member lands on a same-host `/w/...` path on `acme.localhost`).
- **Note:** the Demo tab pushes the API's landing and ignores `?next=`; only the password form honours it (documented behaviour, not a bug for this story).
- **Linked:** `proxy.ts` (`loginRedirectPath`), `safeReturnTo`. **Automation:** `sign-in.story.ts` → "PLT-08 ...". **Status: AUTOMATED**

### PLT-09 Signing in as a marketer lands on Marketing
- **Steps:** Demo tab → "Sign in as Omar Haddad". **Expected:** URL `/w/marketing`; shell visible; account menu labelled "Account menu for Omar Haddad".
- **Automation:** `sign-in.story.ts` → "PLT-09 ...". **Status: AUTOMATED**

### PLT-45 Sign out
- **Goal:** the account menu's "Sign out" ends the session and returns to the sign-in.
- **Status: BLOCKED:** logging out may revoke the member's refresh token server-side, which would break the stored sessions every other story reuses. Enable only as the very last spec, on a throwaway persona, once the coordinator confirms the API revokes per session and not per user.

### PLT-46 Forgot password (tenant)
- **Page exists:** `/forgot-password` on a tenant host. **Status: BLOCKED:** it sends mail through Brevo and the demo users' passwords are random, so there is nothing to reset to. Not driven.

---

## 4. The shell, workspaces and role-based menus

### PLT-10 Sarah has two workspaces and switches between them
- **Persona:** Sarah Chen (Org Admin + Marketing Manager). **Goal:** one person, two jobs, one URL-driven switcher.
- **Steps:** 1 Open `/w/admin`. 2 Account menu → "Switch workspace". 3 See two rows: Administration (checked, "opens first") and Marketing management. 4 Choose Marketing management. 5 See that menu (Team, Approvals, Pipeline; no Employees). 6 Press Back.
- **Expected:** lands on `/w/marketing-mgmt`, Back returns to `/w/admin` (no cookie/server state).
- **Linked:** `WorkspaceSwitcher` (`[data-workspace-switcher=panel]`, `menuitemradio` rows), `GET /api/me/tenant`.
- **Automation:** `workspaces.story.ts` → "PLT-10 ...". **Status: AUTOMATED**
- **Not covered:** "Open <workspace> first" preference (X4.2) is local-only today; Ctrl+Shift+W shortcut is covered by the older `tenant-shell.spec.ts`.

### PLT-11 A member with one workspace never sees a switcher
- **Personas:** Omar, Anika. **Expected:** no `[data-workspace-switcher]`; the account menu has Sign out but no "Switch workspace".
- **Automation:** `workspaces.story.ts` → "PLT-11 ...". **Status: AUTOMATED**

### PLT-12 Every persona lands on the workspace their primary role opens
- **Steps:** for each of the 10 personas open `/`. **Expected:** redirect to `/w/<home>` (admin, marketing, consultant x2, hr x2, finance, accounts, exec, and Bea on admin) with the shell drawn.
- **Automation:** `workspaces.story.ts` → "PLT-12 ...". **Status: AUTOMATED**

### PLT-13 A workspace you do not hold shows the denied state inside the shell
- **Persona:** Sarah. **Steps:** open `/w/hr`, `/w/finance`, `/w/exec`, `/w/accounts`, `/w/not-a-workspace`; then use "Open Administration".
- **Expected:** `[data-not-your-role]` "This isn't part of your role" with the sidebar still drawn and the URL unchanged (no redirect); the button returns to `/w/admin`.
- **Negative variant:** a member with *no* workspace at all sees "There is nothing for your role here yet" (needs a role-less member; not seeded).
- **Automation:** `workspaces.story.ts` → "PLT-13 ...". **Status: AUTOMATED**

### PLT-14 Unbuilt menu entries open an honest "on the way" page
- **Persona:** Sarah. **Steps:** click Subscription Overview, Consultant Licenses, Billing, Feature Usage, Audit Logs, Reports in the sidebar.
- **Expected:** URL changes to `/w/admin/<key>`, `[data-coming-soon]` "This page is on the way", header shows the page name; never a 404. Rows for modules that are off are greyed with a "Soon" chip (`data-nav-soon`); the page is the same either way.
- **Automation:** `workspaces.story.ts` → "PLT-14 ...". **Status: AUTOMATED**

### PLT-15 Each role sees a different menu
- **Personas:** Omar, Anika, Hana, Felix, Amara, Eve.
- **Expected (present / absent menu keys):** Omar home, talent, jobs, tasks / employees, roles, billing, invitations. Anika home, matches, applications, interviews, profile / employees, talent, roles. Hana home, employees / billing, talent, roles, clients. Felix home / employees, talent, roles. Amara home, clients / employees, roles, talent. Eve home, reports / employees, clients, roles. Outside Administration there are no greyed "Soon" rows.
- **Automation:** `workspaces.story.ts` → "PLT-15 ...". **Status: AUTOMATED**

---

## 5. Role denial

### PLT-16 A consultant typing an admin or marketing address is refused
- **Persona:** Anika. **Steps:** open `/w/consultant`, then `/w/admin`, `/w/admin/employees`, `/w/admin/billing`, `/w/marketing`, `/w/marketing/talent`; use "Open My workspace".
- **Expected:** denied state each time, no dashboard/employee data in the DOM; the link returns to `/w/consultant`.
- **Automation:** `role-denial.story.ts` → "PLT-16 ...". **Status: AUTOMATED**

### PLT-17 A marketing specialist cannot reach Administration, billing, HR, Finance or Marketing management
- **Persona:** Omar. **Steps:** open `/w/admin`, `/w/admin/billing`, `/w/admin/roles`, `/w/hr`, `/w/finance`, `/w/marketing-mgmt`. **Expected:** denied each time; his own `/w/marketing` shows "My Assigned Talent".
- **Automation:** `role-denial.story.ts` → "PLT-17 ...". **Status: AUTOMATED**

### PLT-18 Inside a workspace you hold, a page your role lacks is refused
- **Cases:** Omar `/w/marketing/clients`; Hana `/w/hr/clients`; Amara `/w/accounts/employees`. **Expected:** denied state; no clients/employees board.
- **Automation:** `role-denial.story.ts` → "PLT-18 ...". **Status: AUTOMATED**

### PLT-19 The API refuses with a generic 404, never 403
- **Steps:** Sarah reads `GET /api/orgs/{acme}/dashboard` (200). Omar, Anika, Felix read it. A nonexistent org id is read.
- **Expected:** 200 for Sarah; 404 for the three others with a body that contains no "permission", "forbidden", permission key or org name; 404 for the nonexistent id.
- **Linked:** `AuthorizationService` ("every authorization decision remains 404 not 403", doc 55 section 2), `OrgPermissionInterceptor`.
- **Automation:** `role-denial.story.ts` → "PLT-19 ...". **Status: AUTOMATED**

---

## 6. Isolation and audit

### PLT-20 Beta's owner cannot read Acme's data
- **Persona:** Bea Turner (plus Sarah only to learn Acme's org id). **Steps:** read Beta's own dashboard (200); then Acme's dashboard, a nonexistent org's, and `members`, `invitations`, `consultants`, `clients`, `placements` of Acme's org id on Beta's host.
- **Expected:** all foreign reads 404; the refusal body never names Acme; Acme and nonexistent look the same.
- **Linked:** doc 55 T9 (IDOR across tenants), `EntRepositoryContractTest`, `OrgPermissionInterceptor` (path orgId must equal the tenant org).
- **Automation:** `isolation-audit.story.ts` → "PLT-20 ...". **Status: AUTOMATED**

### PLT-21 A session from one host means nothing on another host
- **Persona:** Sarah. **Steps:** signed in on Acme, open `beta.localhost:3200/w/admin`. **Expected:** redirected to Beta's `/login` showing "Welcome to Beta Talent"; no shell. (Session cookies are `__Host-` and tid-bound.)
- **Automation:** `isolation-audit.story.ts` → "PLT-21 ...". **Status: AUTOMATED**

### PLT-22 Bea sees only Beta
- **Steps:** Bea opens `/w/admin` then Employees. **Expected:** shell branded "Beta Talent"; Employees lists Bea Turner and none of Sarah, Omar, Anika, Hana.
- **Automation:** `isolation-audit.story.ts` → "PLT-22 ...". **Status: AUTOMATED**

### PLT-23 The org admin can read the job-data audit evidence
- **Persona:** Sarah (`audit.view` at ORG). **Goal:** "where each job came from, who put it there, what happened to its data" (docs 60 s11, 61 s7).
- **Steps:** `GET /api/orgs/{orgId}/audit/job-data?size=5`, then `?jobId=999999999`.
- **Expected:** 200 `{items:[{job:{id,title,employer,captureSource,...},events:[...]}], total, page:0, size:5}`; no job description field; unknown job id → 200 with empty `items`.
- **Automation note:** there is **no web page and no BFF route** for this endpoint, so the story calls the API directly with Sarah's tenant access token (from the stored browser state) and the tenant host header. Needs `STORY_API_URL` (default `http://localhost:8080`) and, if the API enforces it, `DOSSIER_TENANT_HOST_SECRET`. The test skips itself if the access cookie is not in the stored state.
- **Linked:** `OrgJobDataAuditResource`, `JobDataAuditService`. **Automation:** `isolation-audit.story.ts` → "PLT-23 ...". **Status: AUTOMATED** (direct API; coordinator to verify API base URL/host header)

### PLT-24 Everyone else gets the generic 404 from the audit evidence
- **Personas:** Omar, Anika, Felix (has `audit.view` but row-filtered to billing rows), Hana, Amara, Eve. **Expected:** 404 for each (same as a missing org).
- **Automation:** `isolation-audit.story.ts` → "PLT-24 ...". **Status: AUTOMATED** (same direct-API caveat as PLT-23)

### PLT-51 An Audit Logs page
- **Goal:** the admin browses audit events (including the job-data ledger) in the UI. **Status: NOT-BUILT:** the "Audit Logs" menu entry opens "This page is on the way" (PLT-14); the dashboard's "View all" on Recent Activity falls back to Applications. Roadmap: doc 14 s2.1 + Phase 8 audit; job-data ledger UI in doc 61.

---

## 7. Licensing, entitlements and E1

### PLT-25 The Org Admin's licensing and billing pages say honestly that they are on the way
- **Persona:** Sarah. **Steps:** open `/w/admin/subscription`, `/licenses`, `/billing`, `/usage`. **Expected:** `[data-coming-soon]` with the page name in the header, shell intact.
- **Status of the product pages:** **NOT-BUILT** (Session C, docs 24/28; roadmap X6.1 to X6.4, no `consultant_license`/`FeatureGate` code yet per doc 55 section 5). **Automation:** `licensing-e1.story.ts` → "PLT-25 ...". **Status: AUTOMATED** (as the honest-placeholder check)

### PLT-26 A consultant sees which features their organization has enabled
- **Persona:** Anika. **Steps:** click "My Features" in her menu. **Expected:** `/w/consultant/features`, `[data-consultant-features][data-status=ready]`, header "My Features", tiles, table of `[data-feature-row]` (at least one), filter dropdown.
- **Caveat:** the page marks sample entitlement data with a "Sample" chip (`entitlementsSample`) until the real license block exists, so the rows prove the surface, not real licensing. **Automation:** `licensing-e1.story.ts` → "PLT-26 ...". **Status: AUTOMATED**

### PLT-27 A consultant cannot see the organization's licensing or billing
- **Steps:** Anika's menu has no billing/licenses; `/w/admin/licenses` is denied; no price (`$<digit>`) on the page. **Automation:** `licensing-e1.story.ts` → "PLT-27 ...". **Status: AUTOMATED**

### PLT-52 Licence configuration and the 402 "feature not licensed" card
- **Goal:** admin configures per-consultant licences; a gated feature shows "This feature isn't included in {Name}'s license". **Status: NOT-BUILT:** `FeatureGate`, `consultant_license`, the 402 `FEATURE_NOT_LICENSED` card (doc 16 s2.5, doc 55 s5). Admin catalog starts without prices by decision.

### PLT-28 No page offers to submit an application on a consultant's behalf (E1)
- **Pages checked:** Omar `/w/marketing/submissions`, `/w/marketing/opportunities`; Sarah `/w/admin/applications`; Anika `/w/consultant/submissions`, `/w/consultant/opportunities`.
- **Expected:** no button or link named like "auto-apply", "auto-submit", "submit for/on behalf", "apply for me", "submit all". The marketer *records* submissions; the consultant authorizes (`submissions.authorize`, OWN); Kiwiply never submits.
- **Limits:** this is a negative text check on rendered controls, not a proof; the real guarantee is the permission matrix (doc 55 section 2) and API ITs. **Automation:** `licensing-e1.story.ts` → "PLT-28 ...". **Status: AUTOMATED**

### PLT-29 The Marketing Manager home has no approve-everything switch
- **Persona:** Sarah on `/w/marketing-mgmt`. **Expected:** no "approve all" / "auto-approve" button. **Automation:** `licensing-e1.story.ts` → "PLT-29 ...". **Status: AUTOMATED** (negative check; note `/w/marketing-mgmt` itself may be an "on the way" page)

### PLT-53 Past-due payment banner
- **Goal:** a billing-capable member sees the amber "payment is past due" banner with "Open billing". **Status: BLOCKED:** needs an org with `flags.pastDue` (a Stripe/billing state the demo seed does not create); the banner component exists (`bannersFor`).

### PLT-54 A paused member's session shows "Your access is paused"
- **Goal:** suspending a member removes their access immediately. **Status: BLOCKED:** needs a destructive change to the seeded roster (suspend an active persona) and Sam cannot sign in through the Demo tab. Admin suspension belongs in the ADM stories; the paused panel (`[data-tenant-paused]`) is unit-tested.

---

## 8. Other role workspaces

### PLT-30 Hana (HR Specialist): lands on People; the home is not built, Employees is
- **Steps:** open `/`; see `/w/hr` "This page is on the way"; no switcher; click Employees.
- **Expected:** `/w/hr/employees`, `[data-employees-page]`, rows for Anika Rao and Felix Ng (seeded roster visible to HR via `members.invite` / `hr.view`).
- **Automation:** `other-workspaces.story.ts` → "PLT-30 ...". **Status: AUTOMATED** (HR Home itself: **NOT-BUILT:X11.3**)

### PLT-31 Hana sees people but no sensitive identifiers, and no Clients or Finance
- **Expected:** the Employees board text contains none of ssn / social security / date of birth / passport / bank account / routing number / tax id; `/w/hr/clients` and `/w/finance` are denied. (Repo rule: no SSN, DOB, bank, tax or document numbers anywhere in the product; HR is record-only.)
- **Automation:** `other-workspaces.story.ts` → "PLT-31 ...". **Status: AUTOMATED**

### PLT-32 Tomas (Talent Acquisition): same workspace, smaller menu, can add employees
- **Expected:** `/w/hr`; menu has home + employees, **not** offboarding; Employees shows "Add Employee" (`[data-add-employee]`, `members.invite`).
- **Seed caution:** `web/e2e/journeys/tenant-employees.spec.ts` offboards Tomas Berg for good. If it ran against this database, PLT-32 (and PLT-12's Tomas session) will fail until the seed is reset.
- **Automation:** `other-workspaces.story.ts` → "PLT-32 ...". **Status: AUTOMATED**

### PLT-33 HR pages beyond Employees open the placeholder
- **Steps:** for each of Onboarding, Documents, Compliance, Lifecycle, Offboarding, Candidates, Talent pools, Reports that Hana's live menu lists, click it. **Expected:** "This page is on the way". With the default demo flags (hrFinance off) only Offboarding is listed.
- **Automation:** `other-workspaces.story.ts` → "PLT-33 ...". **Status: AUTOMATED** (placeholder check). The real pages: **NOT-BUILT:X11.1/X11.2/X11.6/X11.8**

### PLT-47 HR product stories (Onboarding checklists, policy acknowledgements, compliance, lifecycle timeline, candidates and talent pools)
- **Status: NOT-BUILT:** doc 36 s3, doc 16 s5.5 (X11.1 to X11.8). HR is record-only (no identity documents, no SSN/DOB/bank/tax, never moves money, PII scanner on every write).

### PLT-34 Felix (Finance): lands on Finance; the Finance pages are not built; nothing moves money
- **Steps:** open `/`; `/w/finance` is "on the way"; click every other entry his menu lists. **Expected:** each is "on the way" (or the real Placements board if listed); no pay/transfer/wire/charge button anywhere. With the default flags his menu is only Home.
- **Automation:** `other-workspaces.story.ts` → "PLT-34 ...". **Status: AUTOMATED** (placeholder + no money-moving control)

### PLT-35 Felix can open Placements by address and is refused HR and Administration
- **Expected:** `/w/finance/placements` renders `[data-placements-page]` (`placements.view` ORG); `/w/admin` and `/w/hr/employees` denied.
- **Assumption:** the placements API grants Felix 200 with `placements.view`. **Automation:** `other-workspaces.story.ts` → "PLT-35 ...". **Status: AUTOMATED**

### PLT-48 Finance product stories (Finance Home tiles, consultant subscriptions, billing, invoices, timesheet approvals, payment records, finance reports)
- **Status: NOT-BUILT:** X6.1 to X6.4 (billing, Session C), X11.4 to X11.6 (ops/timesheets). Rule: finance *records* money, never moves it; no bank numbers.

### PLT-36 Amara (Account Manager): lands on Clients; the home is not built, Clients is
- **Expected:** `/w/accounts` "on the way"; Clients board (`[data-clients-page]`) with "Add client" (`[data-add-client]`, `clients.manage`).
- **Automation:** `other-workspaces.story.ts` → "PLT-36 ...". **Status: AUTOMATED** (Accounts Home: **NOT-BUILT:X10.x**)

### PLT-37 Amara's Placements and Interviews boards open; Contacts, Requirements, Submissions, Offers are on the way
- **Expected:** `/w/accounts/placements` and `/interviews` render their boards; the other four show the placeholder.
- **Automation:** `other-workspaces.story.ts` → "PLT-37 ...". **Status: AUTOMATED**

### PLT-49 Account Manager product stories (client accounts with contacts/relationships/requirements, requirement intake, offers, submissions record)
- **Status: NOT-BUILT:** doc 34 s4, doc 38 s5, X10.1 to X10.5.

### PLT-38 Eve (Executive Viewer): lands on Overview; the executive pages are not built
- **Expected:** `/w/exec` and `/w/exec/reports` show "This page is on the way". (Doc 16 5.8 intended counts-only tiles in Phase 2; today only the Administration home renders the dashboard, and Eve cannot open it.)
- **Automation:** `other-workspaces.story.ts` → "PLT-38 ...". **Status: AUTOMATED** (placeholder). Real pages: **NOT-BUILT:X12.1/X12.8**

### PLT-39 Eve is read-only: everything else is refused
- **Expected:** `/w/admin`, `/w/admin/employees`, `/w/hr`, `/w/finance`, `/w/accounts`, `/w/marketing`, `/w/consultant`, `/w/exec/employees` all show the denied state; no switcher.
- **Automation:** `other-workspaces.story.ts` → "PLT-39 ...". **Status: AUTOMATED**

### PLT-50 Executive product stories (counts-only home tiles, k-anonymity for per-person figures, shared AnalyticsPage reports)
- **Status: NOT-BUILT:** X12.1, X12.8.

---

## 9. Mobile (390px) shell

### PLT-40 At 390px the sidebar becomes a top bar, quick tabs and a menu sheet
- **Persona:** Sarah at 390x844. **Steps:** open `/w/admin`; see the top bar and 2 to 4 quick tabs + "More"; no sidebar; tap Open menu; tap Employees.
- **Expected:** `[data-shell-sidebar]` hidden, `[data-shell-topbar-phone]` and `[data-shell-tabs]` visible; the sheet lists Employees, Organization Branding, Sign out; choosing a page closes the sheet and opens it; no horizontal scroll. (Tab count is 2 to 4 because the Billing tab disappears when the billing module is off.)
- **Automation:** `mobile-shell.story.ts` → "PLT-40 ...". **Status: AUTOMATED**

### PLT-41 Sarah switches workspace on a phone
- **Expected:** top-bar chip `[data-workspace-switcher=bar]` shows "Administration"; tapping opens the "Switch workspace" sheet with two rows; choosing the second lands on `/w/marketing-mgmt` and the chip updates.
- **Automation:** `mobile-shell.story.ts` → "PLT-41 ...". **Status: AUTOMATED**

### PLT-42 Every role's home fits a phone
- **Personas:** Omar, Anika, Hana, Felix, Amara, Eve. **Expected:** top bar + quick tabs; `scrollWidth - clientWidth <= 1`.
- **Automation:** `mobile-shell.story.ts` → "PLT-42 ...". **Status: AUTOMATED**

### PLT-43 Denied and "on the way" pages fit a phone
- **Persona:** Hana. **Expected:** `/w/admin` denied and `/w/hr` placeholder, no horizontal scroll. **Automation:** `mobile-shell.story.ts` → "PLT-43 ...". **Status: AUTOMATED**

### PLT-44 Signing in from a phone
- **Steps:** 390px `/login` → Demo accounts drawer → Sign in as Anika Rao. **Expected:** no sideways scroll on the sign-in, drawer opens, lands on `/w/consultant` with `[data-consultant-home]`.
- **Automation:** `mobile-shell.story.ts` → "PLT-44 ...". **Status: AUTOMATED**

---

## 10. Counts

| Status | Stories | Ids |
|---|---|---|
| AUTOMATED | 44 | PLT-01 to PLT-44 (PLT-23, PLT-24 call the API directly; PLT-25, 33, 34, 38 assert the honest placeholder for unbuilt pages) |
| BLOCKED | 4 | PLT-45, 46, 53, 54 |
| NOT-BUILT | 6 | PLT-47 (HR), 48 (Finance), 49 (Accounts), 50 (Executive), 51 (Audit Logs page), 52 (Licence config) |

---

## 11. APP: the Kiwiply app admin (Organizations and hostnames, X1.11)

Spec: `web/e2e/stories/platform/app-admin-organizations.story.ts`. The app admin signs in on the **platform** host (`http://localhost:3200`, not a tenant)
with the seeded `admin` account (`STORY_ADMIN_LOGIN` / `STORY_ADMIN_PASSWORD` override). Each story creates its own organization with a unique label.
Temporary passwords are read from the shown-once dialog at run time and never printed.

| Id | Story | Status |
|---|---|---|
| APP-01 | List organizations, search, open Acme: counts and hostnames, no member names, History opens | AUTOMATED |
| APP-02 | Provision an address: a reserved label and a taken label are refused live (with a suggestion), a free one goes live and the old one is retired | AUTOMATED |
| APP-03 | Enterprise switch asks for a 10+ character reason, the organization address answers after it, History records it | AUTOMATED |
| APP-04 | Create organization: shown-once temporary password (copy), owner signs in on the new address, is held on the change-password screen (pages and API refused), chooses a password, lands on the Organization Dashboard; the temporary password no longer works; a reset is refused once the owner chose their own. (The dashboard has no activation checklist yet: NOT-BUILT.) | AUTOMATED |
| APP-04b | Reset owner password before first sign-in: new password shown once | AUTOMATED |
| APP-05 | Suspend a hostname (address answers 404 at once) and resume it, each with a reason | AUTOMATED |
| APP-06 | 390 px: cards, bottom sheets, no sideways scroll | AUTOMATED |

## Create organization leaves personal accounts untouched (S9, decision O4; described only, no spec yet)

### PLT-55 The platform admin creates an organization for an owner who has a personal Kiwiply account
- **Persona:** the app admin. **Preconditions:** a personal account `owner@example.test` exists with its own password and a resume. **Steps:** 1. Create organization with that owner address. 2. Read the shown-once dialog: the hint says this is a new organization account, separate from any personal Kiwiply account. 3. Copy the temporary password; sign in at the new address, choose a password.
- **Expected:** the dialog always shows a temporary password (never "no password was issued ... existing account"); the owner's personal account still signs in on kiwiply.com with its old password, keeps its resume and has no new membership; the platform `/org` console and the admin customer lists show nothing for the new enterprise account.
- **Pages / APIs:** `/admin/organizations`, `POST /api/admin/organizations`.
- **Status: STORY-ONLY**

## Seeds, migration tool and health query (S10, decision O4; described only, no spec yet)

### APP-07 The owner is created while a personal account with that email exists
- **Persona:** the app admin. **Preconditions:** the QA stack is seeded with Gamma Consulting (`gamma.localhost`, SEPARATE); a personal account `gina.alvarez@gamma.example.com` is created on kiwiply.com first (password of its own, one saved resume). **Steps:** 1. In Organizations choose Create organization with that exact owner address. 2. Read the shown-once dialog and copy the temporary password. 3. Open the new address, sign in with the address and the temporary password, choose a password. 4. On kiwiply.com sign in with the address and the personal password.
- **Expected:** the dialog and the response are identical to those of an address nobody has used (a temporary password, `CREATED`); the owner lands on the Organization Dashboard of the new organization; the personal account signs in only on kiwiply.com, still has its resume and password, shows no organization anywhere, and the temporary or the chosen enterprise password is refused on kiwiply.com while the personal password is refused on the new address.
- **Pages / APIs:** `/admin/organizations`, `POST /api/admin/orgs`, tenant `/login`, kiwiply.com `/login`.
- **Status: STORY-ONLY (the API half is covered by `SeparateAccountsRegressionIT`)**

### PLT-56 The app admin checks accounts before an organization is switched to separate accounts
- **Persona:** the app admin (API tools only: there is no page for these yet). **Preconditions:** a legacy SHARED organization whose two members are personal accounts. **Steps:** 1. `GET /api/admin/orgs/{id}/account-mode-check`: `seatsOnPersonalAccounts` is 2, `readyForSeparate` false. 2. `POST /api/admin/orgs/{id}/account-migration` with `{"apply":false}`: a dry-run report (`wouldCreate` 2, nothing written). 3. The same with `{"apply":true,"reason":"..."}` (10+ characters). 4. Repeat the check. 5. `GET /api/admin/enterprise-accounts/health`.
- **Expected:** the apply creates two new enterprise accounts, repoints the two seats and leaves every personal account (id, password, resumes, sessions) exactly as it was; the second check says 0 and `readyForSeparate` true; the organization stays SHARED and `enterprise.separate_accounts` is not changed (flipping is a separate, deliberate step); History of the organization shows one HIGH row `ADMIN_ACCOUNT_MIGRATE` without addresses; the health query lists eight invariants with counts only (no address, login or name) and a total of 0 on a healthy database.
- **Pages / APIs:** `GET /api/admin/orgs/{id}/account-mode-check`, `GET /api/admin/orgs/account-migration/report`, `POST /api/admin/orgs/{id}/account-migration`, `GET /api/admin/enterprise-accounts/health`.
- **Status: STORY-ONLY (covered by `EnterpriseAccountMigrationJobIT` and `EnterpriseAccountInvariantIT`)**

### APP-08 The app admin approves an organization's first privacy policy
- **Persona:** the Kiwiply app admin. **Preconditions:** Acme submitted its privacy policy (ADM-120). **Steps:** 1. Open Policy reviews: Acme Staffing, Privacy Policy, "first publication". 2. Open it: the whole text shows as added lines. 3. Choose "Approve and publish".
- **Expected:** the queue empties; `acme.localhost/privacy` shows the approved text (version 1, "Last updated"); Acme's Org Admins get an in-app notice "Privacy Policy is published"; Acme's History shows `POLICY_APPROVE` by the app admin's login (not an Acme member); the admin audit log records it.
- **Pages / APIs:** Policy reviews (`/admin/policy-reviews`), `GET /api/admin/org-policies`, `POST /api/admin/org-policies/{id}/approve`.
- **Status: STORY-ONLY (covered by `OrgPolicyResourceIT`, `PolicyReviewsPage.test.tsx`)**

### APP-09 The app admin compares an update with the live text and sends it back with a comment
- **Persona:** the app admin. **Preconditions:** Acme has version 1 live and submitted version 2. **Steps:** 1. Open the submission: a line diff against version 1 (removed lines struck through, added lines highlighted, "+N lines, -M lines"). 2. "Request changes" is disabled until the note field has text; write "Name your data protection contact." and send.
- **Expected:** version 1 stays public; Acme sees "Changes requested" with the note (ADM-121); a second decision on the same submission is refused (409) and a withdrawn one cannot be decided; an Org Admin of Acme calling the review API gets 401/403, never data.
- **Pages / APIs:** Policy reviews, `POST /api/admin/org-policies/{id}/request-changes`.
- **Status: STORY-ONLY (covered by `OrgPolicyResourceIT`)**

### APP-10 A person deletes their account and can still change their mind for 24 hours
- **Persona:** an account holder on kiwiply.com. **Steps:** 1. Ask for the account to be deleted (`POST /api/account/deletion-request`). 2. Keep using the account; ask again. 3. Withdraw the request (`DELETE /api/account/deletion-request`) and ask again. 4. Let the window pass.
- **Expected:** step 1 answers PENDING with the moment the erasure becomes final (the `privacy.deletion.grace_hours` setting, default 24) and `canUndo`; the account works as usual meanwhile and nothing is erased early even when the sweep runs; asking twice is the same request; withdrawing answers CANCELLED and the status goes back to NONE (a second withdraw is a 404); after the window the sweep erases the account, its files and its rows, and writes a purge report that holds counts only (no login, e-mail or name); with the grace set to 0 the account is erased at once and the answer says DELETED; another account's status call says NONE and its withdraw call is a 404; signed out is 401.
- **Pages / APIs:** `POST/GET/DELETE /api/account/deletion-request`, `DELETE /api/account` (immediate). The Settings page still offers the immediate route; wiring the undo flow into the page is a follow-up (not built, not verified in a browser).
- **Status: STORY-ONLY (covered by `AccountPrivacyResourceIT`, `AccountErasureReportIT`)**

### APP-11 A person asks for a copy of everything and downloads it later
- **Persona:** an account holder. **Steps:** 1. Start an export (`POST /api/account/exports`); start it again. 2. Poll the job until READY. 3. Download from the signed path it carries. 4. Try the path as another account, with a changed signature, and after the expiry.
- **Expected:** one active export at a time (the second call returns the same job), at most `privacy.export.max_per_day` (default 3) per 24 hours (429 beyond); the job is built in the background into a ZIP with `export.json`, the stored files under `files/` and a `manifest.json`; the ZIP is capped at `privacy.export.max_mb` (default 200): a file that would cross the cap is left out and listed under `skipped` with the reason; the path carries an expiry and an HMAC signature; another account gets the generic 404 for the job and the file, a bent signature is a 404, an expired export says EXPIRED, gives no path and its file is deleted; earlier exports are never part of the next one; the export also carries bug reports, contact-us messages and the terms acceptances.
- **Pages / APIs:** `POST/GET /api/account/exports`, `GET /api/account/exports/{id}`, `GET /api/account/exports/{id}/file`. The synchronous `GET /api/account/export` is unchanged.
- **Status: STORY-ONLY (covered by `AccountPrivacyResourceIT`, `DataExportServiceTest`)**

### APP-12 The terms a person accepted are on record with the version and the time
- **Persona:** an account holder. **Steps:** 1. Read the status (`GET /api/account/terms-acceptance`). 2. Accept TERMS and PRIVACY at the version in force. 3. Try an old version. 4. The app admin publishes a new version in Settings (`legal.terms_version`).
- **Expected:** the status lists both documents with the version in force and `upToDate`; an acceptance is stored once per account, document and version with its timestamp (repeating it keeps the first timestamp); an old or unknown version is a 400; after a new version is published the old acceptance no longer counts and `upToDate` is false; another account has its own record; the rows are part of the data export and are erased with the account. Recording the acceptance at sign-up is not wired (the sign-up flow is identity code this task did not touch): an open question.
- **Pages / APIs:** `GET/POST /api/account/terms-acceptance`, Settings (`legal.*`).
- **Status: STORY-ONLY (covered by `TermsAcceptanceServiceTest`, `AccountPrivacyResourceIT`)**

### PLT-63 The app admin sets how long audit, token, AI-call and bug-report data is kept
- **Persona:** the app admin. **Steps:** 1. In Settings (area `privacy`) read the windows: admin audit 24 months, expired sign-in sessions (refresh-token rows) 7 days after expiry, AI call ledger 13 months, resolved bug reports 24 months, deletion reports 36 months. 2. Change one; set one to 0.
- **Expected:** each window is a registry setting with a safe default and bounds (nothing is hard-coded); 0 keeps that data for ever; the nightly sweep (03:50 UTC) honours the new value; a master switch (`privacy.retention.enabled`) stops every purge; open bug reports and tokens that can still be presented are never purged.
- **Pages / APIs:** Settings, `GET /api/admin/privacy/retention`.
- **Status: STORY-ONLY (covered by `RetentionServiceIT`, `PrivacySettingKeysTest`)**

### PLT-64 The app admin previews a purge before it happens and every run is on record
- **Persona:** the app admin. **Steps:** 1. Run `POST /api/admin/privacy/retention/run?job=ADMIN_AUDIT` (no other parameter). 2. Run it again with `dryRun=false`. 3. Read `GET /api/admin/privacy/retention/runs` and the admin audit trail. 4. Start the same job from a second API instance while the first runs.
- **Expected:** a manual run is a dry run by default (counts only, nothing deleted); a real purge must be asked for; each run leaves a run record (window, cutoff, candidates, deleted, who) and an audit event (`RETENTION_DRY_RUN` / `RETENTION_PURGE`, counts only); work is batch-limited per run and a bigger backlog continues the next night; the second instance finds the job's lease held, does nothing and records nothing; a crashed instance's lease expires on its own; an ordinary account gets 403 on every route.
- **Pages / APIs:** `/api/admin/privacy/retention[/run|/runs]`.
- **Status: STORY-ONLY (covered by `RetentionServiceTest`, `RetentionServiceIT`, `AdminPrivacyResourceIT`)**

### PLT-65 The app admin can show that an erasure ran and what it removed, and that the data map is complete
- **Persona:** the app admin (and a privacy auditor). **Steps:** 1. Open `GET /api/admin/privacy/deletion-reports` after an account was erased. 2. Open `GET /api/admin/privacy/data-map`. 3. A developer adds a table with a `user_id` or `org_id` column without classifying it.
- **Expected:** a report holds the former numeric account id, the account kind, the source (SELF, ADMIN, IMMEDIATE, RETENTION), the status (COMPLETE, or COMPLETE_WITH_RESIDUE with the leftovers listed) and counts per table and for stored files, never a login, e-mail or name; the data map lists every table with a user or organization reference, how it is erased, which export section carries it (or why none) and its retention job; the build fails (`DataMapIT`) for the unclassified table, for a stale entry, and for an export section that the real export does not produce.
- **Pages / APIs:** `/api/admin/privacy/deletion-reports`, `/api/admin/privacy/deletion-requests`, `/api/admin/privacy/data-map`.
- **Status: STORY-ONLY (covered by `DataMapIT`, `DataMapTest`, `AccountErasureReportIT`, `AdminPrivacyResourceIT`)**

### PLT-60 A visitor of an organization's address reads its policies, never Kiwiply's
- **Persona:** a signed-out visitor at `acme.localhost`. **Steps:** 1. Open `/privacy`, `/terms`, `/acceptable-use`, `/support` (no sign-in is asked). 2. Open the footer links of the sign-in page, the forgot-password page and an invitation page. 3. Open `/policies/not-a-kind`.
- **Expected:** every page shows Acme's logo, colours and name, the neutral template until Acme publishes (no Kiwiply name, logo or link anywhere), and a row of Acme's other policy links on the same host; `/policies/not-a-kind` is Acme's own "page doesn't exist" page; `kiwiply.com/privacy` still shows the Kiwiply policy; a draft or an in-review text is never visible.
- **Pages / APIs:** `/privacy`, `/terms`, `/acceptable-use`, `/support`, `/policies/{slug}`, `GET /api/public/tenant/policies[/{kind}]`.
- **Status: STORY-ONLY (covered by `policy-pages.test.tsx`, `OrgPolicyResourceIT`)**

### PLT-61 No link in an enterprise account leads to a Kiwiply page
- **Persona:** Cora (consultant of Acme, signed in at `acme.localhost`). **Steps:** 1. Open the account menu: Privacy policy and Terms of use. 2. Open the help panel (the "?" card): Support and contact, Privacy policy, Terms of use. 3. Open Inbox: the privacy line and the profile link in the connect guide. 4. Open the Resume Builder in a locked state (no AI in the license). 5. Open the invitation e-mail and the account-created e-mail footers.
- **Expected:** every link stays on `acme.localhost` (the policy pages, `/w/consultant/profile`); no "See Pro" or pricing link appears; the wording says "This workspace", never "Kiwiply"; the e-mail footers link to `https://acme.../privacy`, `/terms`, `/support` and carry no Kiwiply address line; the only intentional platform-side link is "Connect extension", which opens the one-time-code connect page (doc 19 section 6.3).
- **Pages / APIs:** shell, Inbox, Resume Builder, e-mail templates; guarded by `web/src/lib/ent/tenant-links.test.ts` and `EnterpriseMailFooterTest`.
- **Status: STORY-ONLY (covered by the two guard tests)**

### PLT-62 The policy kinds are an admin setting
- **Persona:** the app admin. **Steps:** 1. In Settings set `enterprise.policies.kinds` to add `COOKIES`. 2. Open an organization's Policies page and `acme.localhost/policies/cookies`.
- **Expected:** a Cookie Policy appears in every organization's Policies list (state Draft) and its public page shows a neutral template until published; removing the key hides it again (published text is kept); an invalid list (lower case, duplicates, empty) is refused by the Settings page.
- **Pages / APIs:** Settings, Policies, `/policies/{slug}`.
- **Status: STORY-ONLY (covered by `PolicyPagesUnitTest`)**

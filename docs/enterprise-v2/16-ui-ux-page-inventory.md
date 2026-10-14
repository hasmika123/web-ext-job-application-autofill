# 16 — UI/UX page inventory: the enterprise shell, the tenant route tree, workspaces, every page per role, wireframes

> Status: design (Session B), 2026-10-12. Implements ADR-007 (one shell, permission nav,
> data-defined workspaces), requirements §25 (refined against reusable functionality) and §26 (UX
> standards). Build-ready for X2.2, X2.6, X2.11, X4.2 and as the page contract for every later
> UI story (C: X6.*; D: X7–X11; E reviews). `@kiwiply/ui` only; tenant tokens only (11 §2).

## 1. UX standards (requirements §26 + memory `ux-genz-notion-style`) — the checklist every page story carries
1. **Kiwiply identity preserved**: Editorial/Kiwi tokens, display font for H1 only, pills and
   rounded-2xl cards; tenant colours flow through the remap (11 §2), nothing else changes.
2. **Gen Z / Alpha first, enterprise-professional**: short sentences, no jargon in empty states,
   one compact mascot per viewport at most (11 §6), status badges (`Badge`/`StatusDot`) not
   coloured text, modern icons from `@kiwiply/ui/icons` only.
3. **Autosave, never Save buttons** in forms; quiet `SaveStatusChip`; inline ✓ (`SavedTick`); undo
   toasts for reversible actions; `ReasonSheet` for HIGH actions; `ConfirmTypedSheet` only for
   irreversible ones (offboard, remove domain, close org, transfer ownership).
4. **Compact contextual actions**: row kebabs and sheet footers; no oversized edit buttons; primary
   action top-right of the page header, one per page.
5. **Search and filters** on every list (`FilterBar`, URL-synced, debounced); **scalable grid/list**
   (`DataTable` ≥ `md`, cards below) with real pagination.
6. **Comfortable spacing, natural scrolling**: pages scroll; the sidebar is viewport-height and
   scrolls independently; dashboards are never squeezed into one viewport.
7. **Responsive**: 390 px (16 px gutters, 44 px targets, bottom tab bar), 768, 1024, 1440; no
   horizontal scroll; tables → cards.
8. **Accessible**: AA contrast (11 §4), focus-visible rings, `aria-busy` on autosaving controls,
   sheets trap focus and return it, reduced motion respected (`useReducedMotion`), every icon-only
   control labelled.
9. **Honest states**: loading skeleton → rows → `EmptyState` (one action) → `ErrorState` (retry);
   nothing fake; unavailable modules are omitted from nav, not teased, except the dashboard's
   explicit "soon" cards.
10. **Consistency across roles**: the same page component serves every workspace that includes it;
    only scope, nav highlight and copy (terminology) differ.

## 2. The enterprise shell (`EnterpriseShell`, X2.2)

### 2.1 Geometry
```
1440 (≥ lg)                                                           390 (< md)
┌──────────┬───────────────────────────────────────────────────────┐  ┌──────────────────────────────┐
│ ◉ Acme   │ top bar 64px: [workspace chip ▾]  🔍 quick search   🔔 (PS)▾│ ◉ Acme     Administration ▾  🔔 ☰ │ 56px
│ Talent   ├───────────────────────────────────────────────────────┤  ├──────────────────────────────┤
│──────────│                                                       │  │                              │
│ Admin ▾  │  page header: H1 + subtitle + primary action          │  │  page (natural scroll)       │
│ Home     │                                                       │  │                              │
│ Employees│  content (natural scroll)                             │  │                              │
│ Teams    │                                                       │  │                              │
│ Roles    │                                                       │  │                              │
│ …        │                                                       │  │                              │
│ (scrolls │                                                       │  │                              │
│  itself) │                                                       │  ├──────────────────────────────┤
│──────────│                                                       │  │  ⌂   👥   📄   💳   ⋯        │ 56px bottom tabs
│ Need help│                                                       │  └──────────────────────────────┘
│ (mascot) │                                                       │     ☰ opens the full nav as a sheet; ⋯ = "More"
└──────────┴───────────────────────────────────────────────────────┘
```
- Sidebar 236 px (collapsible to 64 px icons; preference in `localStorage`, try/catch),
  `position: sticky; top: 0; height: 100dvh; overflow-y: auto` (`scroll-slim`) — independent of
  the page. Header = org logo (40 px tall, fallback `BrandLockup`) + display name; then the
  **workspace switcher** (§4) when > 1 workspace, else the workspace label as a static eyebrow;
  then nav groups; footer: "Need help?" `MascotCard` (violet tone, existing) linking to the org's
  support email (`org.contact.support_email`) or Kiwiply support when unset; "Powered by Kiwiply"
  only when `powered_by = LOGIN_AND_FOOTER`.
- Top bar: breadcrumb-less (page H1 carries the context); quick search (⌘K) over employees,
  consultants, clients, jobs — scoped by permission, Phase 4+ (hidden until a provider exists);
  `NotificationBell` (existing, user-scoped; org kinds included); avatar menu (13 §2.3).
- Mobile: top bar 56 px; nav drawer (`BottomSheet` full) from ☰; **bottom tab bar** = the first
  four nav items of the active workspace + More (56 px, 44 px targets, `useBottomBar` inset).
- Banners (stacked under the top bar, dismiss-per-session): PAST_DUE (billing.view), draft branding
  (branding.manage), domain failing (domains.manage), "Your access changed — reload" (12 §3).

### 2.2 Navigation as data (`web/src/lib/ent/workspaces.ts`, X2.2; per-org prefs X4.2)
```ts
export interface NavItem { key: string; label: string; icon: IconName; href: string; needs: string[]; module?: ModuleKey; badge?: "attention" }
export interface Workspace { key: WorkspaceKey; label: string; order: number; home: string; nav: NavItem[] }
```
`needs` is any-of permission keys (branch A's model); `module` hides the item when the org's module
flag is off; an item with `needs: []` shows for every member of the workspace. A member sees a
workspace when they may open its **home**. Per-org `nav_prefs_json` (11 §1.1) hides/orders items
within a workspace, never adds. `web/src/lib/ent/workspaces.test.ts` is table-driven over the
templates in 05 §3 and asserts the inventory in §5 exactly (doc-sync test against this file's
tables, like `ShareMatrixTest`).

### 2.3 Route tree (tenant hosts; `proxy.ts` rewrite, X2.6)
Public URL on `careers.acme.com` → file under `web/src/app/(tenant)/%5Ft/` (**directory name is
`%5Ft`**, the URL-encoded `_t`: Next.js treats a folder starting with `_` as private and would not
route it — the public path stays `/_t`; corrected by Session E Task 3, 09 row 15). The `_t/…` names
below are the URL segments after the rewrite, not folder names:
```
/                      → _t/page.tsx           redirect: signed-in member → /w/{landing}; else /login
/login                 → _t/login/page.tsx     BrandedLogin (11 §3)
/forgot-password, /reset-password, /account/activate      → branded wrappers of the existing forms
/join/t/[token], /join/[slug]/[code]                       → branded join (12 §5)
/me, /me#…             → _t/me/page.tsx        basic profile (13)
/w/[workspace]/…       → _t/w/[workspace]/layout.tsx  (shell) + pages per §5
/tenant-unavailable    → rendered by the layout for UNKNOWN (never linked)
```
`proxy.ts`: for a non-platform host, `NextResponse.rewrite('/_t' + pathname + search)` for every
path except `/api/*`, `/_next/*`, `/tenant-assets/*`, static files; sets the security headers
(11 §7). A platform host requesting `/_t/*` directly gets `notFound()` from the layout. Platform
hosts are untouched (`(marketing)`, `(app)`, `(admin)`, `(org)` keep working on kiwiply.com).
The proxy matcher also runs on `/api/auth/*` and the other BFF route handlers (not rewritten, but
`x-kiwiply-host` must be set there — X1.4/X1.5). **Root layout split (X1.4):** the Kiwiply chrome
(cookie-consent banner, bug-report widget, analytics scripts) moves out of `app/layout.tsx` into
the platform groups' layouts; `(tenant)/%5Ft/layout.tsx` mounts none of it.

### 2.4 Workspace layout (`(tenant)/%5Ft/w/[workspace]/layout.tsx`, URL `/w/[workspace]`)
1. `getTenant()` (cached) → TENANT or 404.
2. `getMeTenant()` (cached; `GET /api/me/tenant`) → 401 → `redirect('/login?next=…')`; 403
   `MEMBER_SUSPENDED` → "Your access is paused" panel; 404 → not-a-member panel.
3. Validate `[workspace]` ∈ `me.workspaces` → else render the **"not part of your role"** state
   (no redirect, 05 §7).
4. Render `EnterpriseShell workspace={…} me={…} tenant={…}`; pages are server components that
   call their own BFF route and re-check nothing client-side (the API is the gate).

### 2.5 Shared page states (every page)
| State | Component | Rule |
|---|---|---|
| Loading | `ListSkeleton` / `TileSkeleton` / `TableSkeleton` in `loading.tsx` per route | never a spinner-only page |
| Empty | `EmptyState` (page) with one action; `mascot` only on primary pages (home, employees, consultants, jobs) | copy from §5 |
| Error | `ErrorState` with retry; per-widget on dashboards | message from the API problem `detail` when safe |
| Not allowed | `EmptyState icon="🔒"` "This isn't part of your role" + "Switch workspace" when another exists | on BFF 404 for a nav page |
| Consent required (403 `CONSENT_REQUIRED`) | card "{Name} hasn't shared this with you yet" + "Ask {Name}" (cooldown) | 05 §7 |
| Feature not licensed (402) | card "This feature isn't included in {Name}'s license" + "Ask an admin" (admins: link to Configure license) | C's codes (X5.6) |
| Offline | `SaveStatusChip` amber; reads keep the last data | autosave controller |

## 3. Workspaces and landing (ADR-007; data in `workspaces.ts`)

| `workspace_key` | Label | URL prefix | Home | Primary for templates | Bottom tabs (phone) |
|---|---|---|---|---|---|
| `ADMIN` | Administration | `/w/admin` | Org Admin Dashboard (14) | OWNER, ORG_ADMIN | Home · Employees · Consultants · Billing · More |
| `MARKETING` | Marketing | `/w/marketing` | Marketer Home (§6.3) | MARKETING_SPECIALIST | Home · My talent · Jobs · Tasks · More |
| `MARKETING_MGMT` | Marketing management | `/w/marketing-mgmt` | Manager Home | MARKETING_MANAGER | Home · Team · Approvals · Pipeline · More |
| `CONSULTANT` | My workspace | `/w/consultant` | Consultant Home (§6.2) | CONSULTANT | Home · Matches · Applications · Interviews · More |
| `HR` | People | `/w/hr` | HR Home | HR_SPECIALIST, TALENT_ACQUISITION | Home · Employees · Onboarding · Compliance · More |
| `FINANCE` | Finance | `/w/finance` | Finance Home | FINANCE_SPECIALIST | Home · Subscriptions · Invoices · Timesheets · More |
| `ACCOUNTS` | Clients | `/w/accounts` | Account Manager Home | ACCOUNT_MANAGER | Home · Clients · Requirements · Submissions · More |
| `EXEC` | Overview | `/w/exec` | Executive Home | EXECUTIVE_VIEWER | Home · Reports · More |

Landing = the primary role's workspace home; a member may pin another allowed workspace as
landing from the switcher ("Open this first", `org_member.landing_workspace`, X4.2). A member with
exactly one workspace never sees a switcher. STAFF/MEMBER (school flows) map to the existing `/org`
console on kiwiply.com and to `CONSULTANT`-like `MEMBER` nav on tenant hosts (Home, My profile, My
resumes, Applications, Notifications, Settings).

## 4. The workspace switcher (X2.2)
```
1440 (menu under the sidebar chip)             390 (bottom sheet from the top-bar chip)
┌──────────────────────────────┐               ┌──────────────────────────────┐
│ Administration        ▾      │               │ Switch workspace             │
├──────────────────────────────┤               │ Pick where to work.          │
│ Your workspaces              │               │ ┌──────────────────────────┐ │
│ ✓ Administration   Org Admin │               │ │ ✓ Administration         │ │
│   Marketing mgmt   Mkt Mgr   │               │ │   Org Admin · landing    │ │
│   Marketing        Mkt Spec. │               │ ├──────────────────────────┤ │
│──────────────────────────────│               │ │   Marketing management   │ │
│ ☆ Open Marketing first       │               │ │   Marketing Manager      │ │
│──────────────────────────────│               │ └──────────────────────────┘ │
│ Personal workspace ↗         │               │ Personal workspace ↗ (kiwiply.com) │
└──────────────────────────────┘               └──────────────────────────────┘
```
- Rows: workspace label + the role(s) granting it; ✓ on the current; "landing" chip on the one
  that opens first; "Open … first" toggles the preference (autosave + undo toast).
- Switching = `router.push(ws.home)`; no cookie, no server state (the URL is the state), so the
  back button works and links are shareable within the org.
- "Personal workspace ↗" (kiwiply.com) appears only when the person also has personal data
  (always true — the account exists) and opens a new tab; it reminds "You'll sign in separately
  there" the first time (12 §1).
- Keyboard: `⌘⇧W` / `Ctrl+Shift+W` opens it; arrow keys + Enter.
- E2E-B lives here: Sarah (ORG_ADMIN + MARKETING_MANAGER) lands on Administration, switches to
  Marketing management, is refused `/w/hr` with the not-part-of-your-role state, profile identical.

## 5. Page inventory (every role's nav from §25, refined)

Columns: **Page** (nav label → URL) · **Component** (shared page module under
`web/src/components/ent/pages/`) · **Data source** (BFF → API) · **Permission** (any-of needs;
the API re-checks with scope) · **Entitlement / module** · **Empty state** · **Story**.
"Scope" says which rows the same component shows in this workspace.

### 5.1 ADMIN — Organization Admin
| Page | Component | Data source | Permission | Module | Empty state | Story |
|---|---|---|---|---|---|---|
| Home → `/w/admin` | `OrgAdminDashboard` | `GET /api/orgs/{id}/dashboard` (14 §2) | `dashboard.view_org` | — | checklist | X2.4 |
| Employees → `/w/admin/employees` | `EmployeesPage` (15 §3) | `GET …/members` | `member.view_summary`, `members.invite` | — | "It's just you so far" | X4.3, X4.4, X4.6 |
| Invitations → `/w/admin/invitations` | `InvitationsPage` (its own board, design/enterprise-admin/invitations.png: counters, table, invite panel, activity; `badge: attention` with the INVITED count) | `GET …/invitations`, `…/counts`, `…/activity` | `members.invite` | — | "No invitations yet" → [Invite your first teammate] | X4.12 |
| Teams → `/w/admin/teams` | `TeamsPage` (15 §6; departments + teams on one page; §25's two items become one page with two sections — the Departments nav item deep-links `#departments`) | `GET …/groups` | `groups.manage` | — | "Group people into departments and teams" | X4.5 |
| Departments → `/w/admin/departments` | same | | | | | |
| Roles & Permissions → `/w/admin/roles` | `RolesPage` | `GET …/roles`, `GET …/roles/{id}` | `roles.manage` (view: `member.view_summary`) | `flag.enterprise.roles` | "Start from a template" | X4.1 |
| Consultants → `/w/admin/consultants` | `ConsultantDirectory` (D, X7.1) scope ORG | `GET …/consultants` | `consultants.view` | marketing (directory itself is Phase 7) | "No consultants yet" → [Invite consultants] | X7.1 (D) |
| Resumes → `/w/admin/resumes` | `OrgResumesPage` (D, X7.3) scope ORG | `GET …/resumes` | `resumes.view_for` | marketing | "No resumes shared with Acme yet" (explains consent) | X7.3 (D) |
| Marketing Assignments → `/w/admin/assignments` | `AssignmentsPage` (D, X4.7) | `GET …/assignments` | `assignments.manage` | marketing | "Pair consultants with marketers" | X4.7 (D) |
| Jobs → `/w/admin/jobs` | `OrgJobsPage` (D, X8.2 job banks) scope ORG | `GET …/jobs` | `pipeline.view` | marketing | "No curated jobs yet" | X8.2 (D) |
| Applications → `/w/admin/applications` | `OrgApplicationsPage` (D, X9.4) scope ORG, consent-projected | `GET …/applications` | `member.view_summary` | — (Phase 2 shows the consent-based list from 18f2123's overview; full page Phase 9) | "Nobody is sharing progress yet" | X9.4 (D) |
| Interviews → `/w/admin/interviews` | `OrgInterviewsPage` (D, X9.6) | `GET …/interviews` | `member.view_summary` | — | "No interviews scheduled" | X9.6 (D) |
| Clients → `/w/admin/clients` | `ClientsPage` (D, X10.1) scope ORG | `GET …/clients` | `clients.view` | marketing | "Add your first client" | X10.1 (D) |
| Placements → `/w/admin/placements` | `PlacementsPage` (D, X10.4) | `GET …/placements` | `placements.view` | marketing | "No placements yet" | X10.4 (D) |
| Subscription Overview → `/w/admin/subscription` | `SubscriptionOverview` (C, X6.1) | `GET …/billing/overview` | `billing.view` | billing | status card | X6.1 (C) |
| Consultant Licenses → `/w/admin/licenses` | `LicensesPage` (C, X6.2) | `GET …/licenses` | `licenses.view` | billing | "Assign the first license" | X6.2 (C) |
| Billing → `/w/admin/billing` | `BillingPage` (C, X6.4) | `GET …/billing` | `billing.view` | billing | "Billing isn't connected" (dev) | X6.4 (C) |
| Feature Usage → `/w/admin/usage` | `UsagePage` (C, X6.5) | `GET …/usage` | `usage.view` | billing | "No usage yet" | X6.5 (C) |
| HR → `/w/admin/hr` | link tile page to the HR workspace (admins who also hold HR see it in the switcher; admins without HR see a read-only summary from `hr.view`) | `GET …/hr/summary` | `hr.view` | hr_finance | "HR arrives with Phase 11" | X11.3 (D) |
| Finance → `/w/admin/finance` | as HR, `finance.view` | `GET …/finance/summary` | `finance.view` | hr_finance | — | X11.4 (D) |
| Reports → `/w/admin/reports` | `ReportsPage` (Phase 12; Phase 2 ships the audited CSV exports hub) | `GET …/reports` | `reports.view` | — | "Exports appear here" | X12.7 (E) / X4.9 (exports hub) |
| Organization Branding → `/w/admin/branding` | `BrandingPage` (11 §1) | `GET/PATCH …/branding/draft`, `POST …/publish` | `branding.manage` | — | — (always has defaults) | X2.5 |
| Domains → `/w/admin/domains` | `DomainsPage` (10) | `GET …/hostnames` | `domains.manage` | `flag.enterprise.domains` | "Your workspace is at acme.kiwiply.com. Add your own domain." | X3.1–X3.5 |
| Integrations → `/w/admin/integrations` | `IntegrationsPage` (Phase 12) — hidden until the module | — | `integrations.manage` | integrations | — | X12.3 (E) |
| Audit Logs → `/w/admin/audit` | `AuditLogPage` | `GET …/audit` | `audit.view` | — | "No activity yet" | X4.9 |
| Settings → `/w/admin/settings` | `OrgSettingsPage` (14 §4) | `GET/PATCH /api/orgs/{id}`, `…/settings` | `org.settings.manage` | — | — | X2.9 |
| My Profile | avatar menu → `/me` (13) — **not** a nav item | | | | | X2.7 |

### 5.2 MARKETING — Talent Marketing Specialist (D owns the pages; B owns the nav/shell contract)
| Page | Component (scope ASSIGNED) | Data source | Permission | Module | Empty state | Story |
|---|---|---|---|---|---|---|
| Home → `/w/marketing` | `MarketerHome` (§6.3) | `GET …/me/marketing/home` | `consultants.view` (ASSIGNED) | marketing | "No consultants assigned to you yet" (mascot peek) | X8.1 (D) |
| My Assigned Talent → `/w/marketing/talent` | `ConsultantDirectory` scope ASSIGNED | `GET …/consultants?assigned=me` | `consultants.view` | marketing | same | X8.1 (D) |
| Resumes → `/w/marketing/resumes` | `OrgResumesPage` scope ASSIGNED | `GET …/resumes?assigned=me` | `resumes.view_for` | marketing | "Ask your consultants to share a resume" | X7.3 (D) |
| Job Discovery → `/w/marketing/jobs` | `JobDiscoveryPage` (beneficiary picker) | `GET …/jobs/search?for=…` | `matches.run` | marketing + `ai.job_matching` (beneficiary) for AI ranking | "Pick a consultant to search for" | X8.2 (D) |
| Job Matches → `/w/marketing/matches` | `MatchesPage` | `GET …/matches?assigned=me` | `matches.run` | marketing + entitlement | "Run a match to see suggestions" | X8.3 (D) |
| Opportunities → `/w/marketing/opportunities` | `OpportunitiesPage` | `GET …/opportunities?mine` | `opportunities.manage` | marketing | "Assign the first opportunity" | X8.4 (D) |
| Job Streams → `/w/marketing/streams` | `JobStreamsPage` (job-source feeds, sync health) | `GET …/mkt/streams` | `matches.run` | marketing | "Connect your first job source" | X8.2 (D) |
| Submissions → `/w/marketing/submissions` | `SubmissionsPage` (records only, ADR-010; E1 answered 2026-10-12: consultants submit) | `GET …/submissions?mine` | `submissions.record` | marketing | "Nothing recorded yet" | X10.3 (D) |
| Applications → `/w/marketing/applications` | `OrgApplicationsPage` scope ASSIGNED | `GET …/applications?assigned=me` | `member.view_summary` (ASSIGNED) | — | consent copy | X9.4 (D) |
| Interviews → `/w/marketing/interviews` | `OrgInterviewsPage` scope ASSIGNED | `GET …/interviews?assigned=me` | `interviews.coordinate` | marketing | "No interviews yet" | X9.5/X9.6 (D) |
| Follow-ups → `/w/marketing/followups` | `FollowupsPage` | `GET …/followups?mine` | `followups.manage` | marketing | "You're all caught up" (mascot celebrate, once) | X8.6 (D) |
| Tasks → `/w/marketing/tasks` | same component, tab | same | same | marketing | same | X8.6 (D) |
| Activities → `/w/marketing/activity` | `ActivityFeed` (pipeline_event, mine) | `GET …/activity?mine` | `pipeline.view` | marketing | "No activity yet" | X8.6 (D) |
| Performance → `/w/marketing/performance` | `MarketerPerformance` | `GET …/me/marketing/performance` | `reports.view` (ASSIGNED) | marketing | "Numbers appear after your first week" | X8.7 (D) |

### 5.3 MARKETING_MGMT — Marketing Manager
| Page | Component (scope TEAM) | Data source | Permission | Module | Empty state | Story |
|---|---|---|---|---|---|---|
| Home → `/w/marketing-mgmt` | `ManagerHome` (team tiles: open assignments, approvals waiting, workload, pipeline this week) | `GET …/me/marketing-mgmt/home` | `workload.view` | marketing | "Build your team" → Team | X8.1 (D) |
| Team → `/w/marketing-mgmt/team` | `EmployeesPage` preset filter role=MARKETING_SPECIALIST, scope TEAM | `GET …/members?roleKey=…&scope=team` | `member.view_summary` (TEAM) | — | "No marketers in your team" | X4.3 |
| Consultant Assignments → `/w/marketing-mgmt/assignments` | `AssignmentsPage` scope TEAM | `GET …/assignments?scope=team` | `assignments.manage` (TEAM) | marketing | — | X4.7 (D) |
| Pipeline → `/w/marketing-mgmt/pipeline` | `PipelineBoard` scope TEAM | `GET …/pipeline?scope=team` | `pipeline.view` | marketing | "No opportunities in flight" | X8.4 (D) |
| Approvals → `/w/marketing-mgmt/approvals` | `ApprovalsPage` | `GET …/approvals` | `approvals.decide` | marketing | "Nothing waiting on you" | X8.5 (D) |
| Workload → `/w/marketing-mgmt/workload` | `WorkloadView` | `GET …/workload` | `workload.view` | marketing | — | X4.8 (D) |
| Escalations → `/w/marketing-mgmt/escalations` | `EscalationsPage` | `GET …/escalations` | `escalations.manage` | marketing | "No escalations" | X8.6 (D) |
| Reports → `/w/marketing-mgmt/reports` | `ReportsPage` scope TEAM | `GET …/reports?scope=team` | `reports.view` (TEAM) | — | — | X8.7 (D) |

### 5.4 CONSULTANT — Consultant / Talent (scope OWN)
| Page | Component | Data source | Permission | Entitlement | Empty state | Story |
|---|---|---|---|---|---|---|
| Home → `/w/consultant` | `ConsultantHome` (§6.2) | `GET …/me/consultant/home` | `self.*` | — | first-run checklist | X9.1 (D) |
| My Career Profile → `/w/consultant/profile` | existing career profile editor (`profiles`) + org overlay tab (D, X7.2) | `/api/profile`, `GET/PATCH …/me/consultant-profile` | `self.*` | — | setup flow | X7.2 (D) |
| My Resumes → `/w/consultant/resumes` | existing `ResumesWorkspace` + "Shared with Acme" chips and approval requests (D, X7.3/7.4) | `/api/resumes`, `…/me/org-resumes` | `resumes.manage` (OWN) | — | existing upload empty state | X7.4 (D) |
| My Marketer → `/w/consultant/marketer` | `MyMarketer` (your marketer, focus opportunities, follow-ups; messages, action plan and notes are marked SAMPLE until the marketing workspace is connected) | `GET …/me-workspace/marketer` | `opportunities.respond` | — | "No marketer assigned yet" | consultant workspace |
| Job Discovery → `/w/consultant/job-discovery` | `JobDiscovery` (jobs the marketer loaded: quick info + source link `cws_job_source`, **Open job link** then apply with the extension; a full in-app job search is a later phase) | `GET …/me-workspace/job-discovery/…` | `opportunities.respond` | — | "No jobs loaded yet" | consultant workspace |
| Job Matches → `/w/consultant/matches` | existing matches page scoped to org matches (`opportunity_match` for me) + personal matches are **not** shown here (ADR-018) | `GET …/me/matches` | `opportunities.respond` | `ai.job_matching` via Acme (the page says "Provided by Acme") | "No matches yet — your marketer is on it" | X9.1 (D) |
| Assigned Opportunities → `/w/consultant/opportunities` | `MyOpportunities` (accept / decline / authorize) | `GET …/me/opportunities` | `opportunities.respond`, `submissions.authorize` | — | "Nothing assigned yet" | X8.5/X9.2 (D) |
| My Applications → `/w/consultant/applications` | existing tracker list, filtered to org-linked applications + "link an application" | `/api/applications`, `…/me/application-links` | `applications.manage` (OWN) | — | existing | X9.2 (D) |
| Submissions & Approvals → `/w/consultant/submissions` | `MySubmissions` (approve or decline what the marketer prepared; Kiwiply never submits) | `GET …/me-workspace/submissions`, `POST …/{id}/approve|decline` | `submissions.authorize` | — | "Nothing waiting for your approval" | consultant workspace |
| Interviews → `/w/consultant/interviews` | existing interviews + proposed slots to confirm | `/api/interviews`, `…/me/interview-slots` | `interviews.manage` (OWN) | — | existing | X9.5 (D) |
| Interview Prep → `/w/consultant/interview-prep` | existing interview-prep gated by entitlement (402 card when not licensed) | `/api/interview-prep` with workspace context | `self.*` | `interview.ai_prep` | "Not included in your license" | X9.7 (D) |
| Offers → `/w/consultant/offers` | `MyOffers` | `GET …/me/offers` | `offers.respond` | — | "No offers yet" | X9.8 (D) |
| My Placement → `/w/consultant/placements` | `MyPlacements` (+ declare) | `GET …/me/placements` | `self.*` | — | — | X10.6 (D) |
| Availability → `/w/consultant/availability` | `MyAvailability` (calendar, blocked dates, work preferences, history) | `GET/PUT …/me-workspace/availability` | `self.*` | — | "No blocked dates" | consultant workspace |
| Tasks & Follow-ups → `/w/consultant/tasks` | `MyTasks` (own tasks and follow-ups) | `GET/POST/PUT/DELETE …/me-workspace/tasks` | `applications.manage` (OWN) | — | "All caught up" | consultant workspace |
| Activity Timeline → `/w/consultant/activity-timeline` | `ActivityTimeline` (read-only merge of your own events) | `GET …/me-workspace/activity-timeline` | `self.*` | — | "No activity yet" | consultant workspace |
| My Features → `/w/consultant/features` | `MyFeatures` (base + features, allowances, "Provided by Acme", consent per feature) | `GET …/me/entitlements` | `features.view` | — | "Your organization hasn't assigned a license yet" | X6.3 (C) / X7.6 (D consent) |
| Notifications → `/w/consultant/notifications` | existing notifications page | `/api/notifications` | — | — | existing | X9.1 (D) |
| Settings → `/w/consultant/settings` | consent scope + leave org (from `/me#memberships`, 13) and notification prefs — **not** personal billing/plan (that stays on kiwiply.com) | `/api/me/orgs/{id}/share` | `self.share_scope.set` | — | — | X2.7 |

### 5.5 HR — HR Specialist / Talent Acquisition (D owns pages, Phase 11)
| Page | Component | Data source | Permission | Module | Story |
|---|---|---|---|---|---|
| Home → `/w/hr` | `HrHome` (headcount, onboarding in progress, compliance due, invites) | `GET …/hr/home` | `hr.view` | hr_finance (Phase 2: Employees-only nav until the module) | X11.3 (D) |
| Employees → `/w/hr/employees` | `EmployeesPage` (15) | `GET …/members` | `member.view_summary` | — | X4.3 |
| Onboarding → `/w/hr/onboarding` | `OnboardingPage` (hr_task checklists) | `GET …/hr/onboarding` | `hr.manage` | hr_finance | X11.1 (D) |
| Documents → `/w/hr/documents` | policies only (ADR-011; E2 answered 2026-10-12: record-only, no identity documents) | `GET …/hr/policies` | `hr.manage` | hr_finance | X11.2 (D) |
| Compliance → `/w/hr/compliance` | `CompliancePage` (acks) | `GET …/hr/compliance` | `hr.view` | hr_finance | X11.2 (D) |
| Lifecycle → `/w/hr/lifecycle` | `LifecyclePage` (employment_record) | `GET …/hr/lifecycle` | `lifecycle.manage` | hr_finance | X11.1 (D) |
| Offboarding → `/w/hr/offboarding` | scheduled offboardings (15 §5) + HR steps | `GET …/members/offboarding` | `members.remove`, `lifecycle.manage` | — / hr_finance | X4.4, X11.1 |
| Reports → `/w/hr/reports` | `ReportsPage` HR rows | `GET …/reports?family=hr` | `reports.view` | hr_finance | X11.6 (D) |
| (Talent Acquisition) Candidates, Talent pools → `/w/hr/candidates`, `/w/hr/talent-pools` | `CandidatesPage`, `TalentPoolsPage` (36 §3; members/invites only, D5) | `GET …/hr/candidates`, `…/hr/talent-pools` | `candidates.manage`, `talent_pools.manage` | hr_finance | "Invite your first candidate" | X11.8 |

### 5.6 FINANCE — Finance Specialist (C: subscriptions/billing; D: placements/timesheets)
| Page | Component | Data source | Permission | Module | Story |
|---|---|---|---|---|---|
| Home → `/w/finance` | `FinanceHome` (MRR, next invoice, licensed count, open approvals, timesheets due) | `GET …/finance/home` | `finance.view` or `billing.view` | billing / hr_finance | X6.1 (C) + X11.4 (D) |
| Consultant Subscriptions → `/w/finance/subscriptions` | `LicensesPage` read-only | `GET …/licenses` | `licenses.view` | billing | X6.2 (C) |
| Billing → `/w/finance/billing` | `BillingPage` | `GET …/billing` | `billing.view` | billing | X6.4 (C) |
| Invoices → `/w/finance/invoices` | `InvoicesPage` (org_invoice mirrors) | `GET …/billing/invoices` | `billing.view` | billing | X6.4 (C) |
| Placements → `/w/finance/placements` | `PlacementsPage` with rate columns | `GET …/placements?rates=1` | `placements.view`, `finance.view` | hr_finance | X11.5 (D) |
| Timesheets → `/w/finance/timesheets` | product H pages (`ops.*`) | H APIs | `ops.*` | hr_finance | X11.4 (D) |
| Approvals → `/w/finance/approvals` | H approvals | H APIs | `ops.approve` | hr_finance | X11.4 (D) |
| Payments → `/w/finance/payments` | payment records (status only, never execution) | `GET …/finance/payments` | `finance.manage` | hr_finance | X11.5 (D) |
| Reports → `/w/finance/reports` | `ReportsPage` finance rows | `GET …/reports?family=finance` | `reports.export` | — | X11.6 (D) |

### 5.7 ACCOUNTS — Account Manager (D, Phase 10)
Home `/w/accounts` (`AccountsHome`: open requirements, submissions this week, interviews, offers
pending) · Clients `/clients` · Contacts `/contacts` · Requirements `/requirements` · Submissions
`/submissions` · Interviews `/interviews` · Offers `/offers` · Placements `/placements` — all scope
ORG, permissions `clients.*`, `requirements.manage`, `submissions.record`, `interviews.coordinate`,
`offers.manage`, `placements.manage`; stories X10.1–X10.5.

### 5.8 EXEC — Executive / Viewer (E, Phase 12; Phase 2 ships Home with counts only)
Home `/w/exec` (counts-only tiles from `GET …/dashboard` projected by `EXECUTIVE_VIEWER`'s
permissions; k-anonymity rules for anything per-person) · Reports `/w/exec/reports`
(`reports.view` ORG aggregates) — API X12.1, pages **X12.8** (AnalyticsPage shared with `/w/admin/reports`).

### 5.9 Kiwiply Platform Admin (kiwiply.com `/admin/*`, existing admin kit; never on tenant hosts)
| Page | Story |
|---|---|
| Platform Home (existing), Organizations + Tenant Provisioning (`/admin/organizations`, `/[id]`) | X1.11 |
| Domains (`/admin/domains`: every hostname, states, re-check, suspend/resume, Google-origin flag) | X3.3, X3.7 |
| Subscriptions (org billing ops), Feature Catalog, Pricing, Commercial Agreements | X6.9, X6.10 (C) |
| Integrations (delivery health across orgs) | X12.3 |
| Platform Analytics (`/admin/analytics`, cross-tenant aggregates only) | X12.12 |
| Security (`/admin/security`: break-glass grant log, E8) | X6.17 |
| Tenant Health (ask rate, hostname states, check-job health, flags per org) | X3.3, X3.6 |
| Settings (registry) | existing (A5.1) |

## 6. Wireframes for the key pages (390 / 1440)

### 6.1 Branded login — see `11-branding-and-login.md` §3.1 (both sizes).

### 6.2 Consultant Home (`/w/consultant`)
```
1440                                                                     390
┌──────────┬───────────────────────────────────────────────────────┐    ┌──────────────────────────┐
│ ◉ Acme   │ Hi Anika 👋  ·  Marketing: Active · Available now     │    │ Hi Anika 👋   (mascot)   │
│ My work- │ (mascot greet, first visit)         [Update availability]│    │ Marketing: Active        │
│  space   ├───────────────────────────────────────────────────────┤    ├──────────────────────────┤
│ Home     │ Needs you (2)                                          │    │ Needs you (2)            │
│ Matches  │ ┌──────────────────────────────┐ ┌───────────────────┐ │    │ ┌──────────────────────┐ │
│ Opport.  │ │ Approve submission · Capital │ │ Confirm interview │ │    │ │ Approve submission   │ │
│ Applic.  │ │ One · Sarah prepared resume  │ │ Thu 2pm · Zoom    │ │    │ │ Capital One · Sarah  │ │
│ Interv.  │ │ v3 → [Review & authorize]    │ │ [Confirm] [Propose]│ │    │ │ [Review & authorize] │ │
│ Prep     │ └──────────────────────────────┘ └───────────────────┘ │    │ └──────────────────────┘ │
│ Offers   ├───────────────────────────────────────────────────────┤    │ ┌──────────────────────┐ │
│ Placem.  │ Your pipeline   Assigned 4 · Applied 2 · Interview 1  │    │ │ Confirm interview    │ │
│ Features │ ┌─────────────┬─────────────┬────────────┬──────────┐ │    │ └──────────────────────┘ │
│ Notif.   │ │ Assigned 4  │ Applied 2   │ Interview 1│ Offers 0 │ │    │ Pipeline  4 · 2 · 1 · 0  │
│ Settings │ └─────────────┴─────────────┴────────────┴──────────┘ │    │ Your marketer            │
│──────────│ Your marketer: (SR) Sarah R. · [Message ↗ (mailto)]   │    │ (SR) Sarah R.            │
│ Help     │ Provided by Acme: AI job matching · Interview prep ✓  │    │ Provided by Acme ✓ ✓     │
└──────────┴───────────────────────────────────────────────────────┘    │ ⌂  ✦  📄  📅  ⋯          │
                                                                        └──────────────────────────┘
```
Data: `GET …/me/consultant/home` → `{needsYou: [...authorization requests, slot proposals, consent requests], pipeline counts (my opportunity_match by status), marketer: primary assignment, features: licensed keys}`.
Empty (new member): checklist card "Get set up: share a resume · set availability · review what
Acme can see" (mascot encourage). Nothing here is the personal dashboard; personal data lives on
kiwiply.com (a one-line footer says so).

### 6.3 Marketer Home (`/w/marketing`)
```
1440                                                                     390
┌──────────┬───────────────────────────────────────────────────────┐    ┌──────────────────────────┐
│ ◉ Acme   │ Good morning, Sarah · 6 consultants · 3 follow-ups due│    │ Hi Sarah · 6 talent      │
│ Marketing├───────────────────────────────────────────────────────┤    ├──────────────────────────┤
│ Home     │ Today  ┌ Follow up: Anika @ Capital One (2d) [Done]┐ │    │ Today (3)                │
│ My talent│        │ Authorization waiting: Raj · Deloitte      │ │    │ • Follow up Anika [Done] │
│ Resumes  │        │ Interview Thu: Mei · Stripe  [Prep notes]  │ │    │ • Raj authorization      │
│ Jobs     │        └────────────────────────────────────────────┘ │    │ • Mei interview Thu      │
│ Matches  │ My talent (6)                      [Find jobs for ▾] │    │ My talent (6)   [Find ▾] │
│ Opport.  │ ┌──────────┬──────────┬──────────┬──────────┐        │    │ ┌──────────────────────┐ │
│ Submiss. │ │(AK)Anika │(RJ) Raj  │(ML) Mei  │(TS) Tom  │ …      │    │ │(AK) Anika · Available│ │
│ Applic.  │ │Available │On project│Notice 2w │Available │        │    │ │ consent FULL ✓ · lic ✓│ │
│ Interv.  │ │✓consent ✓│SUMMARY ⚠ │FULL ✓    │none ✗    │        │    │ │ 2 opps · 1 interview  │ │
│ Follow-  │ │2 opps    │—         │1 intv    │[Ask]     │        │    │ └──────────────────────┘ │
│  ups     │ └──────────┴──────────┴──────────┴──────────┘        │    │ … cards …                │
│ Tasks    │ Pipeline this week  Assigned 9 · Authorized 4 ·       │    │ Pipeline 9·4·3·1         │
│ Activity │                     Applied 3 · Interviews 1          │    │                          │
│ Perform. │ (no submit button anywhere — consultants apply)       │    │ ⌂  👥  🔍  ☑  ⋯          │
└──────────┴───────────────────────────────────────────────────────┘    └──────────────────────────┘
```
Consent and license chips per consultant tell the marketer what they may do before they try
(05 §7); "Ask" triggers the cooldown-limited consent request.

### 6.4 Org Admin Home — see `14-organization-administration.md` §2.1.
### 6.5 Employees — see `15-employees-and-teams.md` §3.1. Workspace switcher — §4 above.

## 7. Reuse map (what is shared, so §25's 90+ items are ~35 components)
| Shared component | Used by |
|---|---|
| `EmployeesPage` | ADMIN Employees/Invitations, HR Employees, MARKETING_MGMT Team |
| `ConsultantDirectory` (scope prop) | ADMIN Consultants, MARKETING My Assigned Talent, MARKETING_MGMT (via Team) |
| `OrgResumesPage` | ADMIN, MARKETING |
| `OrgApplicationsPage`, `OrgInterviewsPage` | ADMIN, MARKETING, ACCOUNTS |
| `PlacementsPage` | ADMIN, FINANCE (rates), ACCOUNTS, CONSULTANT (own) |
| `SubmissionsPage` | MARKETING, ACCOUNTS |
| `LicensesPage` | ADMIN (manage), FINANCE (read) |
| `BillingPage`, `InvoicesPage`, `UsagePage` | ADMIN, FINANCE |
| `ReportsPage` (family filter) | ADMIN, MARKETING_MGMT, HR, FINANCE, EXEC |
| `ActivityFeed` | MARKETING, ADMIN dashboard (recent), employee sheet |
| `AssignmentsPage` | ADMIN, MARKETING_MGMT |
| `DashboardTiles` (`AdminStatTiles` promoted) | every Home |
| Kit (promoted to `packages/ui` in **X2.15**, the one enterprise UI-kit story — 09 row 14; X2.2 depends on it): `FilterBar`, `DataTable`, `ReasonSheet`, `ConfirmTypedSheet`, `HistoryDrawer`, `PersonCell` (+`MemberAvatar`), `StatusDot`, `StatePill` (tone maps per domain; merges C's `StatusPill` and D's `PipelineBadge`), `QuickActionTiles`, `MoneyText` (+ band mode), `PriceDelta`, `FeatureChip`, `AllowanceMeter`, `ConsentChip`, `ReadinessRing`, `KanbanBoard`, `WorkloadColumn`, `TimelineFeed`, `SensitiveTextField`, icons `briefcase, handshake, calendar-check, clipboard-check, shield-check, building, route`; `useSave` stays a web lib hook; `MascotPose` stays in X2.8 | everything |

## 8. Doc-sync and tests (X2.2, X2.11)
- `workspaces.test.ts` asserts the nav tables in §5 (keys, order, needs, module) — update both
  or the test fails.
- `EnterpriseShell.test.tsx`: sidebar scroll independence (sticky + `h-dvh` + `overflow-y-auto`),
  collapsed mode, drawer/escape, bottom tabs = first four + More, banners by permission,
  not-part-of-your-role state, switcher visibility rule.
- Playwright `e2e-a.spec.ts` (acme.localhost: branded login → dashboard → avatar → `/me` →
  Settings → Employees) and `e2e-b.spec.ts` (Sarah: landing → switch → refused `/w/hr` → same
  profile), both at 390 and 1440 with screenshots in `web/e2e/__screenshots__/ent/`.

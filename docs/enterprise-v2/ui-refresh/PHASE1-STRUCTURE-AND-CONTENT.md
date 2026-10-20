# Enterprise UI refresh, Phase 1: structure and content

> Written 2026-10-19 (Fable) from a full walk of the live demo tenant (`aaruna.localhost:3200`, branch `ent-demo-p1`) as Priya (Org Admin, 20 pages), Rahul (Marketing Specialist, 14 pages) and Anika (Consultant, 20 pages), plus the sign-in, My profile, "on the way" and help surfaces. Phase 2 (fonts, sizes, colours, images, alignment) is not in this file.
>
> **Who this is for:** the implementing session (Sonnet). Every item says *what* to change, *where* (file), and *why* in one line. Nothing here changes behaviour, APIs or data: pages move, merge, shrink and get rewritten copy. Where something is a product call, it is listed under **Decisions** with my recommendation; implement the recommendation unless the user says otherwise.
>
> **Scope:** the tenant web app only (`web/src/components/ent/**`, `web/src/app/(tenant)/**`, `web/src/lib/ent/**`, the nav data in `api/src/main/resources/config/ent/workspaces.json`). Not the browser extension, not kiwiply.com, not the API's behaviour.

---

## 0. What the walk found (the five problems every page shares)

1. **Every page is built as a dashboard.** Hero band, then 4 to 6 KPI tiles with sparklines and "vs last month" deltas, then the actual list, then a right rail with a bee card, a "Quick Actions" list and two or three more widgets. 34 pages carry a "Quick Actions" card; about 40 carry a bee help card. A list page (Employees, Resumes, Tasks) does not need any of that. This is the main reason "there's a lot going on".
2. **The help cards promise an assistant that does not exist.** Every "Ask a question..." button opens a panel that says *"The question assistant isn't switched on yet, so there is nothing to type into here."* Yet the cards say "I can help you find reports, manage users..." in first person. On a demo to a prospect this is the first thing they will click. Remove all of them; keep one plain "Help & support" entry.
3. **Invented numbers.** Deltas like "+2175% vs last month", "+2700% vs last week", "Placement rate 233%, industry 5%", decorative sparklines, "$40K monthly spend" with no billing, "0% match" on real postings that were never scored. These make real numbers look fake. Rule in section 2.
4. **The same information lives in three places.** A consultant's work preferences are on My Career Profile, on Availability *and* on Settings. Follow-ups are on Home, Tasks, My Marketer and Notifications. Job streams are on Home, Job Discovery and Job Streams. Quick Actions repeat the buttons already on the page (Profile has Edit profile / Update skills / Add certification / Save preferences twice).
5. **Too many menu rows for too few jobs.** Consultant 20, Marketing 14, Admin 26 (8 greyed "Soon"). Several rows are one job split in three (Job Discovery / Job Matches / Assigned Opportunities; Teams / Departments; Employees / Invitations; Tasks / Follow-ups; Interviews / Interview Prep; Notifications / Activity Timeline). After this phase: Admin 17 + 1 Soon, Marketing 11, Consultant 15, each menu grouped under short labels.

Also noticed, and in scope because it is content: raw event keys leak into the UI ("Priya Sharma marketing bulk", "marketer job capture", "billing plan view", "history purged"); "Kiwiply news" appears on the tenant's My profile page (brand leak on a white-label host); five repetitions of "Aaruna Technologies" / "Sign in" on the sign-in card; British and American spelling mixed ("licence" in copy, "Licenses" in the menu, "Colours" on Branding).

---

## 1. Decisions to confirm before starting (my recommendation in bold)

| # | Question | Recommendation |
|---|---|---|
| D1 | The 8 greyed "Soon" rows in the Admin menu (Subscription Overview, Consultant Licenses, Billing, Feature Usage, HR, Finance, Domains, Integrations). | **Collapse to ONE row, "Plan & billing" (Soon).** Drop HR, Finance, Domains, Integrations from the Admin menu entirely (HR and Finance have their own workspaces for those roles; Domains and Integrations are modules nobody has). Eight greyed rows tell a prospect "not done". |
| D2 | Spelling. Copy says "licence", "colours"; menus say "Licenses"; everything else is US. | **US spelling everywhere** (license, color, organization). The demo customer and all seed data are US. |
| D3 | The honesty notes ("A full job search arrives in a later phase", "Usage tracking arrives with this tool", "has no screen on their side yet", "Coming soon" ×4 on My Placement). | **Remove the element, not just the note.** A block that only exists to say it is not built should not be on the page. Keep the small `SAMPLE` chip only where a stand-in row must stay for the demo flow. |
| D4 | Casing. Today "Add Employee", "Total Assigned Consultants", "Create account now" and "Save changes" are mixed. | **Title Case for menu labels and page titles only** ("My Applications"). **Sentence case for everything else**: buttons, tabs, tile labels, table headers, section titles, helper text. |
| D5 | Marketer Performance page "Goals progress" (200 submissions / 60 interviews / 40 offers / 15 placements are hard-coded) and "Performance benchmarks" ("Industry 25%"). | **Remove both.** No admin sets goals yet; the industry numbers are invented. |
| D6 | Consultant "Inbox" label. The page does not show mail; it connects Gmail so applications update themselves. | **Rename to "Email tracking"** (icon stays Mail). Optional; everything else in this plan works with either label. |
| D7 | The hero band's handwritten "Let's make today count!" on every Home. | **Remove.** The greeting already carries the warmth; the note crowds the band at tablet width. |

---

## 2. Global rules (apply on every page before the per-page items)

### 2.1 Remove on every page
- **Bee help cards** ("Your career companion, here to help!", "Need help with ...?", "Find the right opportunities for your talent faster!", "Your marketing buddy", "Stream Assistant", etc.). Components to delete and un-import: `consultant-ws/parts.tsx` → `BeeCard`; `marketer-ws/parts.tsx` → `HelpBannerCard`; `shared/HelpBanner.tsx`; `shell/BeeBanner.tsx`; `employees/HelpBeeCard.tsx`; `consultants/HelpBeeCard.tsx`; `clients/HelpBeeCard.tsx`; `interviews/HelpBeeCard.tsx`; `invitations/HelpInvitesCard.tsx`; `placements/HelpCard.tsx`; `resumes/ResumeHelpCard.tsx`; the dashboard's own card in `dashboard/DashboardPage.tsx`; the `MarketingHomePage` card; `roles/RolesPage.tsx` card; `groups/GroupVisuals.tsx` card. Keep **only** `shell/HelpCard.tsx` → `HelpPanel` (the dialog), opened from a new account-menu entry **"Help & support"** (`shell/AccountMenu.tsx`, after "Connect extension") and from the footer "Support" link. Panel copy: replace *"The question assistant isn't switched on yet, so there is nothing to type into here. Until it is, these reach a person."* with *"Questions about {org}? These reach a person."*
- **"Quick Actions" cards** (34 pages). A quick action that is also a button on the page is a duplicate; one that is only a link to another menu page is the menu. Delete the card everywhere. The few actions that are *not* reachable otherwise are listed per page below and become a header button or a row action.
- **Sparklines and deltas on KPI tiles.** Stop passing `series` and `delta` from every page to `KpiTile` (`packages/ui/src/enterprise/KpiTile.tsx`, `marketer-ws/parts.tsx KpiTile`, `dashboard/parts.tsx StatTile`). Exceptions where the comparison is real and the page is about trends: Admin Dashboard tiles (month over month), Reports (already plain) and Performance. Nowhere else.
- **Tiles that only restate the list** ("Total employees 17" above a table that says "17 employees"; "Total tasks 22" above chips that say "All 22"). Per-page lists say which tiles stay. Rule of thumb: a tile stays only if it names something that needs attention (overdue, pending approval, ending soon, unassigned) or that the page is literally about (active placements on Placements).
- **Exclamation marks** in product copy, and **first-person AI voice** ("I can help you...", "I've found 22 matches"). After the cards are gone, grep `!</` and `I can\b` across `components/ent` to catch the rest ("Your profile is looking good!", "You're making great progress!", "Nothing overdue. Nice.").
- **"Coming soon" / "Not available yet" rows and sections** (D3): Connected tools (4 rows), Helpful resources (4 rows), "Usage tracking arrives with this tool", Stream Rules, "View calendar" buttons that go nowhere.

### 2.2 Numbers and empty values
- A match score that was never computed renders **"Not scored"**, never "0%" (Admin Jobs cards, Marketer Opportunities, Consultant Matches/Opportunities/Discovery, Home "Recommended matches"). Implement in the shared formatter the pages use (`web/src/lib/ent/consultant-ws/*` and `marketer-ws/*` match helpers); the data stays `0`/`null`.
- "0 Submissions" → "No submissions"; "—" for unknown; never "-" alone as a value in a tile (My Placement shows five tiles of "-").
- A delta is shown only on the pages in 2.1 and only as "+9% vs last month" (no arrow glyph plus the word "Up"; screen readers get the sign from the text).

### 2.3 Copy standard
- **Page subtitle:** one sentence, at most 12 words, says what the page is *for*. Never "Manage your ... and ...". Exact subtitles per page below.
- **Section titles:** sentence case, no icon-plus-title where the title is the only thing in the header (phase 2 decides the icon; phase 1 decides the words).
- **Help text** under a field: one sentence. **Empty states:** one sentence plus at most one button.
- **Terminology (use these words, nowhere else synonyms):** *consultant*; *marketer* (the person) and *Marketing Specialist* (the role name); *opening* (a job post); *opportunity* (an opening assigned to a consultant); *application*; *submission* (a package put forward to a client); *interview*; *offer*; *placement*; *client*. Do not call a marketer a "Marketing Consultant" (seed title in Assignments; fix in `web/scripts/fixtures/enterprise-demo.json` and the seeder) and do not call openings "jobs", "roles" and "openings" in the same table.
- **Casing per D4.** Nav labels and page titles Title Case; everything else sentence case. Tests that assert button text must be updated with the text.
- **No "SAMPLE" chip** next to a KPI number. Where a whole section is stand-in data and must stay for the demo, one chip at the section header is enough.

### 2.4 Layout rules (structure, not styling)
- A list page is: hero band → optional chip row with counts → filter row → list/table → pagination. No right rail.
- A rail exists only when it carries *decision-relevant* content for the selected row: the match explanation on Matches, the detail drawer on Placements, the "Next steps" card on Assigned Opportunities. Everything else goes full width.
- Tabs within a page use the existing `Tabs` with the tab in the URL (`?tab=`), the way `applications/ApplicationsPage.tsx` keeps `view.tab`. `activeKey()` in `web/src/lib/ent/shell.ts` already matches nav hrefs that carry a query string, so a merged menu item can point at `?tab=` and still highlight correctly.
- Merged pages keep their old routes as redirects (Next `redirect()` in the old `page.tsx`, or in `marketingPageFor` / `accountsPageFor` for the catch-all workspaces), so nothing in the app, the demo scripts or a bookmark breaks.

---

## 3. The shell (`web/src/components/ent/shell/*`, `web/src/lib/ent/shell.ts`)

| Item | Change | File |
|---|---|---|
| Sidebar groups | Every workspace's menu is drawn in labelled groups (today only Admin has unlabelled separators). Add a `group` key to each nav item in `workspaces.json` and a `groups: [{key,label}]` list per workspace; `navSections()` groups by it and `ShellNav` draws the label as a small eyebrow above each group (collapsed rail: a separator only). Remove the hard-coded `ADMIN_GROUP` map. | `workspaces.json`, `shell.ts`, `ShellNav.tsx` |
| Collapse control | The collapse button is hidden at `lg` and up (`collapsed \|\| wide ? null : ...`), so on a desktop the menu cannot be minimised. Show one toggle at every width ≥ `md`, pinned at the bottom of the sidebar ("Collapse" / "Expand" with the chevron), preference kept as today. | `EnterpriseShell.tsx` |
| "Soon" rows | After D1 there is one: "Plan & billing". `ADMIN_FULL` shrinks to the real menu plus that row; `ADMIN_NOT_BUILT = {"billing"}`; `ADMIN_CHILDREN` (HR/Finance sub-rows) deleted. | `shell.ts`, `shell.test.ts` |
| Hero band on Home | Drop the eyebrow ("ORGANIZATION DASHBOARD", "TALENT MARKETING DASHBOARD", "HOME") and the handwritten note (D7). Keep "Good afternoon, {first name}" and one subtitle per workspace (section 4). | `EnterpriseShell.tsx` (`ent-hero-eyebrow`, `ent-hero-note`), each Home page's `PageHeader` |
| Search box | Placeholder "Search pages" → "Jump to a page (Ctrl+K)". | `ShellSearch.tsx` |
| Account menu | Add "Help & support" (opens `HelpPanel`). Order: My profile · Notifications · Security · Switch workspace · Connect extension · Help & support · Privacy · Terms · Sign out. | `AccountMenu.tsx` |
| Phone bottom tabs | Update `bottomTabs` per workspace after the merges: Admin `home, employees, consultants, applications`; Marketing `home, talent, jobs, tasks`; Consultant `home, opportunities, applications, interviews`. | `workspaces.json` |
| Page title fallback | Unchanged (`defaultTitle`). | — |
| Coming-soon page | "Back to my home" → "Back to home". | `shell/ComingSoon.tsx` |
| Footer | Unchanged. | — |

**Nav data plumbing (one commit):** edit `api/src/main/resources/config/ent/workspaces.json` (sections 4 to 6 give the exact rows), then update `docs/enterprise-v2/16-ui-ux-page-inventory.md` §3 table and §5.1/5.2/5.4 page tables so `api/src/test/.../WorkspaceDocSyncTest` passes, then `WorkspaceServiceTest`, `MeTenantResourceIT`; on the web: `shell.ts`, `shell.test.ts`, `tenant-session*.test.ts`, `mock-me-tenant.test.ts` and whatever mock-API session fixture `npm run dev:demo` serves (grep `"workspaces"` under `web/src/mocks`), `hero-look.ts` (`POSE_BY_SEGMENT` keys for removed segments can stay; add `activity`), and every `hrefs.<key>` read in `marketer-ws/**` for a key that no longer exists (`matches`, `streams`, `followups`). Build the API in the second worktree (`C:\work_bench_claude\ent-demo-build`, JDK 17), never in the running checkout.

---

## 4. Administration workspace (Priya)

### 4.1 Menu after (17 rows + 1 Soon; was 26)

```
Dashboard                      /w/admin
People
  Employees (• pending invites) /w/admin/employees          tabs: Employees | Invitations
  Teams & Departments          /w/admin/teams              tabs: Teams | Departments
  Roles                        /w/admin/roles
Talent
  Consultants                  /w/admin/consultants
  Assignments                  /w/admin/marketing-assignments
  Resumes                      /w/admin/resumes
Pipeline
  Jobs                         /w/admin/jobs
  Applications                 /w/admin/applications
  Interviews                   /w/admin/interviews
  Clients                      /w/admin/clients
  Placements                   /w/admin/placements
Organization
  Reports                      /w/admin/reports
  Audit Log                    /w/admin/audit
  Branding                     /w/admin/branding
  Settings                     /w/admin/settings           tabs: General | Security | Autopilot | Resumes | Policies
  Plan & Billing  (Soon)       /w/admin/billing
```

`workspaces.json` ADMIN changes: delete `invitations` (its `badge: attention` moves onto `employees`), `departments`, `subscription`, `licenses`, `usage`, `hr`, `finance`, `domains`, `integrations`, `policies`; relabel `teams` → "Teams & Departments", `roles` → "Roles", `assignments` → "Assignments", `audit` → "Audit Log", `branding` → "Branding", `billing` → "Plan & Billing"; add `group` to each row (`people`, `talent`, `pipeline`, `organization`; Dashboard has none). Redirects: `/w/admin/invitations` → `/w/admin/employees?tab=invitations`; `/w/admin/departments` → `/w/admin/teams?tab=departments`; `/w/admin/policies` → `/w/admin/settings?tab=policies`.

### 4.2 Pages

**Dashboard** · `dashboard/DashboardPage.tsx`
- Subtitle: "Here's where {org} stands today." Status line ("1 invitation waiting · 1 suspended · Updated just now") stays; make the first two links (Employees?tab=invitations, Employees?status=suspended).
- Tiles 6 → 4: **Consultants** 153 · **Open applications** 111 · **Upcoming interviews** 21 · **Active placements** 91. Drop "Active staff" (0%, no change) and "Monthly spend $40K" (no billing exists). Deltas allowed here (month over month), sparklines no.
- Order: tiles → [Activity & alerts | Recent activity] → [Applications, interviews and placements by month (the "Team performance" chart, renamed) | Pipeline overview].
- Remove: Quick Actions card (one of its four is "Soon"; the other three are menu pages), the help card.
- Recent activity: the rows read "Priya Sharma marketing bulk". The API already humanises some actions in `api/.../service/ent/dashboard/ActivityRecentProvider.java` (switch at ~l.189; default lowercases the key). Add cases for every action the seed emits: `MARKETING_BULK` → "reassigned consultants", `MARKETING_REASSIGN` → "reassigned a consultant", `MARKETING_HANDOVER` → "handed a consultant over", `MARKETER_JOB_CAPTURE` → "saved a job for a consultant", `BILLING_PLAN_VIEW` → "viewed the plan", `HISTORY_PURGED` → "purged old history". The same map serves the Audit log (below).
- Tests: `DashboardPage.test.tsx`, `DashboardTalent.test.tsx`, `ChecklistCard.test.tsx`.

**Employees** (absorbs Invitations) · `employees/EmployeesPage.tsx`, `invitations/InvitationsPage.tsx`
- Subtitle: "Everyone with an account at {org}, their role and access."
- Tabs: **Employees** | **Invitations (1)**. The Invitations tab is today's invitations table with its status/role/department filters. The "Invite employee" side panel becomes a dialog opened by the header button; the four invitation tiles (three of them 0) and the "Recent invitation activity" card go (the audit log has it).
- Tiles 6 → 3: **Active** 15 · **Invited** 1 · **Suspended** 1. Drop Total (sum), Departments, Teams (their own page).
- Header action: one button, **"Add employee"**, opening the existing create/invite dialog (its two modes "Create account now" / "Send invitation" stay; "Bulk invite" becomes a link inside that dialog).
- Table: drop the **Manager** column (every row "—"). Keep Employee, Role, Department, Team, Status, Joined, actions.
- Drawer (`DetailSheet.tsx`): "Quick Actions" heading → "Actions"; keep its four buttons.
- Copy in the create dialog: "Create their account in your organization now with a temporary password. It is a separate account: it never touches or links to any personal account they have." → "Creates a separate account at {org}. It never links to any personal account they have." Field "Who they report to." help text → remove (the label says it).
- Tests: `EmployeesPage.test.tsx`, `InvitationsPage.test.tsx` (move the invitation cases under the tab), `invitations-routes.test.ts`.

**Teams & Departments** (merge) · `groups/TeamsPage.tsx`, `groups/DepartmentsPage.tsx`
- One page, tabs **Teams** | **Departments**, header action "Create team" / "Create department" per tab.
- Subtitle: "How {org} is organised: departments, and the teams inside them."
- Drop all ten tiles (3 teams, 4 members, 3 leads, 1.3 avg size, 11 not in a team; 5 departments, 15 employees, 5 leads, 1.3, 3 teams). Replace with one line under the tabs: "3 teams · 4 members · 11 people not in a team" / "5 departments · 15 people".
- Each tab shows **one** list, the directory table (name, department, lead, members, status, actions). Drop the card grid above it (same three items twice).
- Keep the **Structure** tree once, on the Departments tab (rename "Organization Structure" → "Structure"; drop "View full structure" if it opens the same tree).
- Remove: "Team Performance" (an empty card explaining it is empty), "Department Performance" (it is headcount, already in the table), both help cards.
- Tests: `TeamsPage.test.tsx`, `DepartmentsPage.test.tsx`.

**Roles** · `roles/RolesPage.tsx`
- Subtitle: "Who can do what. Start from a template or create your own."
- Drop the four tiles; one line: "12 roles · 0 custom".
- Tabs Roles | Permission sets stay. Header action **"Create role"** (today in the rail). Search stays above the table.
- Table: drop the **Status** column (all "Active"). Keep the role descriptions (good copy).
- Remove: "Permission overview" donut, "Quick Actions" (Create / Duplicate / Manage assignments / View permission sets / Audit role changes: the first is the header button, the rest are the tabs and the Audit log), help card.
- Copy: "licences" → "licenses" (D2).

**Consultants** · `consultants/ConsultantsPage.tsx`
- Subtitle: "Your bench: who's available, who's placed, and who looks after them."
- Tiles 4 → 3: **Available** 44 · **On project** 91 · **Needs review** 15 (drop Total; the list header says "153 consultants").
- Table 10 columns → 8: drop **Profile %** (dial) and **Apps**. Keep Consultant, Primary skills, Experience, Location, Marketer, Availability, License, Next interview, actions.
- Keep the drawer and the **License** dialog (demo must-show); relabel per D2.
- Remove the help card at the foot.
- The "Marketer" column shows people whose title is "Marketing Consultant": fix the seed title to "Marketing Specialist" (2.3).

**Resumes** · `resumes/ResumesPage.tsx`
- Subtitle: "Every consultant's resumes, and the ones waiting for approval."
- Drop the four tiles. Tabs: **All** | **Pending approval (18)**; drop "Recent updates" (sorting by last modified covers it).
- Header action "Upload resume" stays. Remove the bee card.

**Assignments** · `marketing/MarketingAssignmentsPage.tsx`
- Label "Marketing Assignments" → "Assignments" (truncates today). Subtitle: "Which marketer looks after each consultant, and how full their plate is."
- Tiles 4 → 2 attention tiles: **Unassigned consultants** 12 · **Overloaded marketers** 3. The left list header carries "8 marketers · 141 assigned".
- Left marketer list: keep. Its footer trio (141 / 17.6 avg / 3 overloaded) → drop; keep the "View workload report" link.
- Right table: drop **Last activity**. Keep Bulk actions and "Assign consultants".
- Remove the bee card.

**Jobs** · `jobs/JobsPage.tsx`
- Subtitle: "Openings your marketers are working, and who's matched to each."
- Tiles 4 → 2: **Open** 54 · **New this week** 22.
- Cards: "0 Submissions" → "No submissions"; "AR 0% match" on unscored postings → "Not scored" (2.2).
- Filters: keep Status, Client, Location visible; Work mode and Skills go under "More filters".
- Remove the help card.

**Applications** · `applications/ApplicationsPage.tsx`
- Subtitle: "Every application your consultants have in flight."
- Tiles 4 stay (Total, In review, Interviewing, Offers), no deltas. Tabs All | Pipeline | Analytics stay. Remove the bee card ("Streamline your hiring pipeline").

**Interviews** · `interviews/InterviewsPage.tsx`
- Subtitle: "Interviews across all consultants and clients." Tiles stay without deltas; tabs stay; help card out.

**Clients** · `clients/ClientsPage.tsx`
- Subtitle: "The companies you place consultants with." Tiles 4 → 2 (**Clients**, **Active requirements**). Tabs stay. Help card out.

**Placements** · `placements/PlacementsPage.tsx`
- Subtitle: "Who is placed where, and what ends soon." Tiles stay (all four are actionable) without deltas. Tabs stay. Drawer "Quick Actions" heading → "Actions". Help card out.

**Reports** · `reports/ReportsPage.tsx`
- Keep as is. This is the reference page for the plain-number style: six boxes with one sentence each, no sparkline, no bee.

**Audit Log** · `audit/AuditPage.tsx`, `AuditTabs.tsx`
- Label → "Audit Log". Subtitle stays ("Who did what in your organization, and when.").
- The **What** column shows raw keys. The labels come from the API (`ActivityRecentProvider` map above, and the `actions` list `OrgAuditEventsResource` returns); complete the map so every key has a sentence, and show the subject's *name* in **To whom** where the event carries one, else the type in words ("a consultant", "a requirement"), never bare `consultant` / `requirement` / `org`.

**Branding** · `branding/BrandingPage.tsx`
- Label → "Branding". Subtitle stays ("Make the portal yours before anyone sees it.").
- Copy trims: "Raster images only (PNG, JPEG or WebP). They go into your draft; Publish makes them live." → "PNG, JPEG or WebP. Changes stay in your draft until you publish." "Colours" → "Colors" (D2). The secondary-colour contrast warning ("#f59e0b is too light ... Not saved yet") shows on first load with no edit made: show it only after the field changes.

**Settings** (absorbs Policies) · `settings/OrgSettingsPage.tsx`, `policy/PoliciesPage.tsx`, `lib/ent/prepare-settings.ts`
- Tabs: **General** | **Security** | **Autopilot** | **Resumes** | **Policies**. Subtitle stays ("Defaults and policies for your organization.").
- General: Legal name (read-only) · Display name · Time zone · Default language (show "English", not "en") · Contact email. Keep "Save changes".
- Security: unchanged (idle sign-out, min password length, reason).
- Autopilot (today's "Prepare selected openings" block): heading "Autopilot"; intro → "When a consultant selects assigned openings, the browser extension opens each one in its own tab and fills it from their profile. They review and press Submit themselves. Nothing is ever submitted for them." Switch label "Let consultants prepare selected openings" (drop "Off by default. Only consultants whose licence includes the add-on can use it." → "Only consultants whose license includes the add-on."). Limits stay. The footer line keeps only the Consultants link (Licenses is Soon).
- Resumes: the share-links switch, help text → "Off by default. A marketer preparing a resume for a consultant can never create share links."
- Policies: `PoliciesPage` as the tab, unchanged inside.

**Plan & Billing (Soon)**: the `ComingSoon` page; copy "Plan & billing isn't ready yet. Everything else in your menu works, and we'll let you know when this one opens." stays.

---

## 5. Marketing workspace (Rahul)

### 5.1 Menu after (11 rows; was 14)

```
Home                           /w/marketing
Talent
  My Talent                    /w/marketing/talent
  Resumes                      /w/marketing/resumes
Pipeline
  Jobs                         /w/marketing/jobs           tabs: Openings | Matches | Sources
  Opportunities                /w/marketing/opportunities
  Submissions                  /w/marketing/submissions
  Applications                 /w/marketing/applications
  Interviews                   /w/marketing/interviews
My work
  Tasks                        /w/marketing/tasks          tabs: Tasks | Follow-ups
  Activity                     /w/marketing/activity
  Performance                  /w/marketing/performance
```

`workspaces.json` MARKETING: delete `matches`, `streams`, `followups`; relabel `talent` → "My Talent", `jobs` → "Jobs", `activity` → "Activity"; add groups. Redirects: `/matches` → `/jobs?tab=matches`; `/streams` → `/jobs?tab=sources`; `/followups` → `/tasks?tab=followups`. `marketer-ws/registry.tsx` drops the three cases and the new tabs live inside `JobDiscoveryPage` / `TasksPage` (or a thin wrapper that mounts the old components per tab, which is the smaller change).

### 5.2 Pages

**Home** · `MarketingHomePage.tsx`
- Title stays the greeting; subtitle: "Your consultants, their openings, and what's due today."
- Tiles 6 → 4: **Assigned consultants** 25 · **New job matches** 46 · **Pending submissions** 1 · **Overdue follow-ups** 17.
- Blocks, in this order: **Today** (new card: follow-ups due today + interviews today and tomorrow, replacing "Today's follow-ups & tasks" and "Upcoming interviews") · **Top openings for my talent** · **My talent** (5 rows: Consultant, Availability, Resume, Next action; drop Primary skill and Active apps) · **Recent activity**.
- Remove: Job stream monitor (→ Jobs › Sources), Submission pipeline funnel (→ Performance), bee card.

**My Talent** · `talent/TalentPage.tsx`
- Subtitle: "The consultants you market, and what each needs next."
- Drop the five tiles; the chip row already carries the counts (All 25 · Available now 5 · In interview 7 · Needs update 9 · Pending approval 2).
- Table: drop **Active apps**; keep Consultant, Primary skill, Experience, Location, Availability, Resume status, Assigned jobs, View profile.
- Remove: the three carousels under the table (Available now / Needs resume update / In interview process: they repeat the chips), the bee card, Quick Actions (5). "Add consultant" stays only if it does something for a marketer; else drop.

**Resumes** · `resumes/ResumesPage.tsx`
- Subtitle: "Your consultants' resumes: approve, request updates, download."
- Drop the four tiles; add chip "Pending review (3)". Table: drop **Profile completeness**. Keep "New resume for…". Remove the bee card and "Recent resume activity" (→ Activity).

**Jobs** (merge Job Discovery + Job Matches + Job Streams) · `jobs/JobDiscoveryPage.tsx`, `matches/JobMatchesPage.tsx`, `streams/JobStreamsPage.tsx`
- Subtitle: "Openings from your sources, matched to your consultants."
- **Openings** tab (Discovery): drop the five tiles (keep "7 new today" as a chip). Visible filters: Skills, Location, Work type, Source; Visa and Rate under More filters. Table stays (View / Match / Assign). Saved searches become a chip row above the table. Remove: Trending skills, Top clients hiring, Recent job alerts, Watched job streams, bee card.
- **Matches** tab: drop the four tiles ("High-confidence (22)" becomes a filter chip). Table stays; the **Match explanation** panel stays as the right side for the selected row (this is the valuable content). Remove: Top matches today, Match insights, bee card. Unscored rows: "Not scored".
- **Sources** tab (Streams): drop the four tiles; one status line "6 sources · last sync 3 hours ago · 4 warnings". Table stays (Configure / Pause / View jobs). Merge "Sync activity" and "Stream alerts & warnings" into one list "Recent syncs and warnings" under the table. Remove: "Openings captured" chart, Stream Assistant card, Stream Rules card (its four rows open nothing).

**Opportunities** · `opportunities/OpportunitiesPage.tsx`
- Subtitle: "Openings you've shortlisted for your consultants, and where each stands."
- Tiles 4 → 2: **Awaiting consultant review** 12 · **Stale** 5. Interest status becomes a chip row with counts (Very interested 5 · Interested 6 · Open 4 · Not interested 8 · No response 28) replacing the "Consultant responses" donut.
- Table: drop **Owner** (always the signed-in marketer). Unscored → "Not scored". "Add opportunity" stays.
- Remove: bee card, Quick Actions (5), Top opportunities by match, Recent opportunity activity.

**Submissions** · `submissions/SubmissionsPage.tsx`
- Subtitle: "Packages you've put forward, and the consultant's approval on each."
- Drop the four tiles; chips: Awaiting approval 1 · Under client review 8 · Rejected 2. Table stays; "No resume" cells → "—". "New submission" stays.
- Remove: bee card, Recent submission activity, Submissions by status donut.

**Applications** · `applications/ApplicationsPage.tsx`, `BottomCards.tsx`
- Subtitle: "Where each consultant's applications stand."
- Tiles stay (4) without deltas; stage chips stay.
- Rows whose every detail is "Not shared" (consent = summary): show one **"Summary only"** chip in the row instead of four "Not shared" cells, and keep the sentence "2 consultants haven't shared their applications, so they are not counted here."
- Keep "Overdue actions". Remove: Application funnel (→ Performance), Recent updates (→ Activity), bee card.

**Interviews** · `interviews/InterviewsPage.tsx`
- Subtitle: "Your consultants' interviews, and the feedback still owed."
- Drop the four tiles ("8 this week" goes in the schedule header). Schedule (list/calendar) stays. Keep **Pending feedback (4)**. Remove: Upcoming interviews card (same rows as the schedule), Interview reminders (same again), Preparation checklist (static), bee card.

**Tasks** (merge with Follow-ups) · `tasks/TasksPage.tsx`, `followups/FollowupsPage.tsx`
- Subtitle: "What you owe and when: tasks, calls and reminders."
- Tabs **Tasks** | **Follow-ups**. Drop the tiles on both; keep the chip rows (Tasks: All · My tasks · Overdue · Due this week · Completed; Follow-ups: Today · Overdue · Upcoming · Done).
- Follow-ups: Send reminder / Log call / Update status become row actions; the three sections become the chip filter.
- Remove: calendar widget, Upcoming deadlines, Follow-up insights (66% response rate etc.), Quick Actions, both bee cards.

**Activity** · `activity/ActivitiesPage.tsx`
- Label "Activities" → "Activity". Subtitle: "Everything you and your consultants did, newest first."
- Drop the five tiles. Filters: Date range, Consultant, Type, Status, Client (drop Owner). Table: drop **Tags**. "Log activity" stays.
- Remove: Activity summary by type, Upcoming activities (→ Tasks), bee card.

**Performance** · `performance/PerformancePage.tsx`, `Rail.tsx`, `Cards.tsx`, `Tables.tsx`
- Subtitle: "How your pipeline is converting."
- Tiles 6 → 4: **Active submissions** · **Interview rate** · **Offer rate** · **Placements this month** (deltas allowed). Drop Assigned consultants, Follow-up completion.
- Keep: Submissions by week, Interviews vs offers, Placement funnel, Top performing consultants, "Job stream effectiveness" renamed **By client**.
- Fix the accessible data table under "Interviews vs offers": rows are labelled "Point 2 … Point 15"; label them by month.
- Remove (D5): Performance benchmarks, Goals progress, Recommended actions, Consultant readiness (→ My Talent chips), bee card.

---

## 6. Consultant workspace (Anika)

### 6.1 Menu after (15 rows; was 20)

```
Home                           /w/consultant
Me
  My Profile                   /w/consultant/profile
  My Resumes                   /w/consultant/resumes
  Availability                 /w/consultant/availability
Work
  Opportunities                /w/consultant/opportunities  tabs: Assigned | Matches | Browse
  Submissions                  /w/consultant/submissions
  My Applications              /w/consultant/applications
  Interviews                   /w/consultant/interviews     tabs: Schedule | Prepare
  Offers                       /w/consultant/offers
  My Placement                 /w/consultant/placements
Keep up
  Tasks                        /w/consultant/tasks
  Activity                     /w/consultant/activity       tabs: Needs attention | Timeline
  Email Tracking (D6)          /w/consultant/inbox
  My Marketer                  /w/consultant/marketer
Settings                       /w/consultant/settings       tabs: Privacy | Appearance | Plan & features
```

`workspaces.json` CONSULTANT: delete `job-discovery`, `matches`, `interview-prep`, `activity-timeline`, `notifications`, `features`; relabel `profile` → "My Profile", `opportunities` → "Opportunities", `submissions` → "Submissions", `tasks` → "Tasks", `inbox` → "Email Tracking"; add `activity` (href `/w/consultant/activity`, needs `[]` like notifications had, icon `Route`); add groups. Routes: new folder `app/(tenant)/%5Ft/w/consultant/activity/page.tsx`; old `job-discovery`, `matches`, `interview-prep`, `activity-timeline`, `notifications`, `features` pages become `redirect()`s to the tab URLs (`/opportunities?tab=browse`, `?tab=matches`, `/interviews?tab=prepare`, `/activity?tab=timeline`, `/activity?tab=attention`, `/settings?tab=features`). The bell panel (`ShellBell.tsx`) has no "See all" today; add one at its foot that opens `/w/consultant/activity` when the member has the Consultant workspace (nothing for other workspaces).

### 6.2 Pages

**Home** · `consultant-ws/HomePage.tsx`
- Subtitle: "What needs your answer, and what's coming up."
- Tiles 6 → 4: **Opportunities awaiting your response** (New + Awaiting) · **Active applications** 5 · **Upcoming interviews** 3 · **Submissions to approve** 3. Drop Job matches, Active placement (0).
- Blocks: **Today** (today's focus + tasks due today + today's interview) · **Opportunities needing a response** (5 rows, "Respond") · **Upcoming interviews** · **My applications** (5 rows).
- Remove: Recommended job matches (→ Opportunities › Matches), Resume strength (→ My Resumes), the Tasks table (→ Today), Marketer messages (empty; → My Marketer), Quick Actions, bee card.

**My Profile** · `ProfilePage.tsx`, `ProfileEditors.tsx`
- Label "My Career Profile" → "My Profile". Subtitle: "What your marketer uses to match and submit you."
- Header: the four buttons (Edit profile / Update skills / Add certification / Save preferences) → one **"Edit profile"**; every section already has its pencil.
- Keep all sections. This is the **only** home of work preferences (roles, locations, authorization, employment type, rate, travel, availability status); Availability and Settings link here.
- Remove: Profile strength ring (keep one line under the name: "Profile complete" / "Profile 83% complete: add a summary"), "Missing details: All set", Quick Actions, bee card.
- Copy: "Add Work Experience on My Resumes" → "Edit work experience in My Resumes".

**My Resumes** · `ResumesPage.tsx`, `ResumesSheets.tsx`
- Subtitle: "Your resumes, and the ones your marketer prepared for your approval."
- Drop all five tiles (5 / 1 / 24 views / 12 downloads / 8 shared). Table stays; "Create new resume" stays and its dialog keeps the four ways (scratch / template / import / tailor) that the Quick Actions listed.
- Keep **Resume strength** as one compact card with the checklist (actionable). Remove: Suggested improvements ("Nothing to suggest"), Recent activity, Quick Actions, bee card.

**Availability** · `AvailabilityPage.tsx`, `AvailabilitySheets.tsx`
- Subtitle: "When you can start, and the dates you're away."
- Drop the five tiles; one line: "Available now · 2 weeks' notice · Hybrid". Keep the calendar, Upcoming unavailable dates, Availability history.
- Remove: **Work preferences** card (→ My Profile; add a link "Edit work preferences on My Profile"), Quick Actions, bee card, the note "Approval of time off is your marketer's step and has no screen on their side yet." (D3; keep the Status column as is).

**Opportunities** (merge Assigned Opportunities + Job Matches + Job Discovery) · `OpportunitiesPage.tsx`, `MatchesPage.tsx`, `JobDiscoveryPage.tsx`, `PrepareBatch.tsx`
- Subtitle: "Openings your marketer assigned or matched to you. Open the link, apply with the extension, keep your marketer posted."
- **Assigned** tab (default; the Autopilot demo lives here): drop the five tiles; chips with counts (All 13 · Needs response 6 · Interested 2 · In review 2 · Declined 2). **Prepare selected** bar stays above the table, unchanged. Keep the **Next steps** rail card (it is specific). Remove: Quick Actions ("Acts on: Senior React Developer"; the row kebab has them), bee card. The sentence "Priority and due date come from your marketer; where none is set they are worked out from the match score and the assignment date." becomes a tooltip on the Priority header.
- **Matches** tab: table + Match details panel stay. **Skill alignment** bars at 0%/100% ("levels are not tracked") → has/missing chips: "You have React. Missing: TypeScript, Next.js, Node.js." Unscored rows "Not scored". Remove: "Improve your match quality" checklist (all done), Personalized alerts (→ Activity), bee card.
- **Browse** tab: search + filters + cards stay. Saved searches → a chip row. Remove: Trending skills, Recent searches, bee card, the subtitle sentence "A full job search arrives in a later phase." (D3). The "Marketer's quick info · SAMPLE" paragraph shows only when the marketer wrote one.
- `bottomTabs` key `matches` → `opportunities`.

**Submissions** · `SubmissionsPage.tsx`
- Label "Submissions & Approvals" → "Submissions". Subtitle: "Packages your marketer wants to send. Approve or decline."
- Drop the four tiles; chip "3 awaiting your approval". Both sections stay. The "Submission checklist" (5 lines) moves into the Review dialog as a short reminder. Remove: Quick Actions, bee card.

**My Applications** · `ApplicationsPage.tsx`
- Subtitle: "Each application and its next step."
- Drop the five tiles (the chip row already has the counts). Table stays. Remove: Application pipeline summary, Recent status updates (empty), Quick Actions, bee card.

**Interviews** (merge with Interview Prep) · `InterviewsPage.tsx`, `InterviewPrepPage.tsx`, `InterviewSheet.tsx`
- Subtitle: "Your interviews, and how to get ready for them."
- **Schedule** tab: drop the four tiles. Keep Upcoming interviews, the calendar, Recent interview feedback (with "Waiting for your feedback"). Remove: Quick Actions, "Interview preparation" rail (→ Prepare tab), bee card.
- **Prepare** tab: the four modules, Practice session history, Before-interview checklist (2/8, interactive) stay. "Practice score 74%" becomes one line above the modules. Remove: tiles, Quick Actions, bee card.

**Offers** · `OffersPage.tsx`
- Subtitle: "Offers on the table. Compare, negotiate, decide."
- Drop the five tiles; chips Pending 2 · Negotiation 1 · Accepted 1 · Declined 1. Table and **Compare** stay. Remove: Recent offer activity, Quick Actions, bee card.

**My Placement** · `PlacementsPage.tsx`
- Subtitle: "Your current engagement, once an offer becomes a placement."
- Drop the five "-" tiles; show the empty state and Past placements only. Remove: Helpful resources (4 × Coming soon), Quick Actions, bee card.

**Tasks** · `TasksPage.tsx`
- Label "Tasks & Follow-ups" → "Tasks". Subtitle: "What's on your plate, by due date."
- Drop the five tiles; chips stay. Table stays. Remove: Today's focus (→ Home), Upcoming deadlines (the sorted list), Task insights ("200% more tasks than last week"), Reminders (→ Activity), Quick Actions, bee card.

**Activity** (merge Notifications + Activity Timeline) · `NotificationsPage.tsx`, `ActivityTimelinePage.tsx`, new `ActivityPage.tsx`
- Subtitle: "What happened, and what's waiting on you."
- **Needs attention** tab = the notifications list (Respond / Snooze / View row actions, filters Active/Type/Priority). **Timeline** tab = the activity timeline (type and period filters, Load more).
- Remove on both: tiles, Notifications by category, Notification preferences block (→ link to `/me#notifications`), Quick Actions, bee cards.

**Email Tracking** (today "Inbox") · `InboxPage.tsx`
- Already the best-written page. Trims only: the "Only you see your mail" panel (5 sentences) → 3: "This is your own Gmail, connected with an app password that is kept encrypted and never shown again. {org}, your marketer and your administrators never see the password, the address or any message; they only see the stage an application reaches. This workspace only reads; it never sends, moves or deletes mail." Steps 1 to 4 stay.

**Settings** (absorbs My Features) · `SettingsPage.tsx`, `FeaturesPage.tsx`
- Subtitle: "Privacy, appearance and your plan."
- Tabs: **Privacy** (Profile visibility, Share with employers, Show contact information, Analytics) · **Appearance** (Theme, Language, Time zone; keep the line "The language is a label only; the app is not translated yet." → "English only for now.") · **Plan & features** (the feature table from My Features: Feature · Status · Allowance / usage · Renews; shown when `can(me, "features.view")`).
- Three link rows at the top of the page: "Profile and contact details → My Profile", "Notifications → My profile › Notifications", "Password and security → My profile › Security".
- Remove: the four tiles, Account information (read-only copy), Career preferences (→ My Profile), Notification preferences (→ /me), Security (three "Managed in your account settings" rows), Connected tools (4 × Not available yet), Documents & permissions, Recent account activity, Quick Actions, bee card ("Your marketing buddy"). From My Features: tiles with SAMPLE, Usage overview ("Usage tracking arrives with this tool"), Recommended tools, Tips to get more value.

**My Marketer** · `MarketerPage.tsx`
- Subtitle: "{Marketer name} finds and submits openings for you. Reach them here."
- Keep: the marketer card with **Send message** and **Schedule call** (drop "View calendar" unless it opens something), Recent messages, Collaboration notes, "Marketer's focus for you".
- Remove: Shared action plan (empty), Current focus opportunities (→ Opportunities), Upcoming follow-ups (→ Tasks), Quick Actions (same four as the card), bee card.

---

## 7. Shared surfaces

**Sign-in** · `components/ent/login/*`
- Right card today repeats the organization five times. Keep: "Welcome to {org}" + one line "Sign in to your consultant bench, placements and team workspace." Remove the second heading pair ("Sign In" / "Sign in to your {org} account."). Field label "User Name" → "Email". Button "Sign in". Under the button: "This account is separate from any personal job-search account." Drop "Secure access protected by industry standards." Keep "Need help? Contact IT support" (→ `/support`) and the four footer links.

**My profile** (`/me`) · `components/ent/me/MyProfilePage.tsx`, `lib/notification-preferences.ts`
- Notifications section: the row **"Kiwiply news"** is a brand leak on a tenant host. The label comes from the API (`api/.../domain/enumeration/NotificationKind.java`, kind `SYSTEM`); on tenant hosts the web relabels that kind "Product news" (in `lib/notification-preferences.ts` or `MyProfilePage.tsx`, keyed by kind, not by text) or hides the row. The **Billing (always on)** row does not apply to an enterprise member (no personal billing): hide kind `BILLING` on tenant hosts. Add `/me` to `web/scripts/demo-crawl.mjs` so the white-label check covers it.
- Everything else stays.

**Help panel** · `shell/HelpCard.tsx` (`HelpPanel` only; the card component is deleted): title "Help & support", copy per 2.1.

**Coming soon** · `shell/ComingSoon.tsx`: "Back to my home" → "Back to home".

---

## 8. Implementation order (one commit per step; branch `ent-ui-phase1` off `ent-demo-p1`; PR into `version2`, never merge)

1. **Shared removals** (2.1): delete the bee/help card components and every usage; delete every Quick Actions card; stop passing sparkline/delta props except on Dashboard, Reports, Performance; add "Help & support" to the account menu; fix the help panel copy. Run `npm test -w web`; fix the tests that asserted "Ask a question" / "Quick Actions".
2. **Shell** (section 3): groups in `workspaces.json` + `navSections` + `ShellNav` eyebrows; collapse toggle at every width; eyebrow/note removal on Home; search placeholder; coming-soon copy.
3. **Nav data** (4.1, 5.1, 6.1): `workspaces.json` rows, doc 16 §3/§5, `shell.ts` constants, redirects for every removed route, bottom tabs, `hrefs.*` usages. API tests in the build worktree; web tests.
4. **Admin pages** (4.2), one commit per page (Employees+Invitations and Teams+Departments and Settings+Policies are each one commit).
5. **Marketing pages** (5.2), one commit per page (Jobs merge = one commit; Tasks merge = one commit).
6. **Consultant pages** (6.2), one commit per page (Opportunities merge, Interviews merge, Activity merge, Settings+Features = one commit each).
7. **Shared surfaces** (section 7) and the audit/activity label map.
8. **Copy pass** (2.3): subtitles from this file, casing per D4, spelling per D2, exclamation marks, first-person voice, "Not scored". One commit per workspace.
9. **Verify**: `npm test -w web`, `./gradlew test` (API, build worktree), `node web/scripts/demo-crawl.mjs` (now including `/me`), then walk the three personas through `docs/enterprise-v2/demo/DEMO-WALKTHROUGH.md` on the demo stack; the walkthrough's menu names must be updated in the same PR (Job Discovery → Jobs; Assigned Opportunities → Opportunities › Assigned; Inbox → Email Tracking; Interview Prep → Interviews › Prepare; Audit Logs → Audit Log; Marketing Assignments → Assignments).

Bump nothing in the extension (no extension change). Update `docs/enterprise-v2/16-ui-ux-page-inventory.md` as part of step 3 (the doc-sync test requires it) and add one line to `docs/enterprise-v2/progress-tracker.md` under the UI area.

---

## 9. Acceptance (what "done" looks like for Phase 1)

- No tenant page renders a bee help card, an "Ask a question..." button, or a "Quick Actions" card. `grep -rn "Ask a question\|Quick Actions" web/src/components/ent` returns only the help panel and tests.
- No KPI tile outside Dashboard, Reports and Performance has a sparkline or a delta.
- Menus: Admin 17 rows + 1 Soon in four groups; Marketing 11 rows in three groups; Consultant 15 rows in three groups. Every removed route redirects.
- Every page subtitle is the one in this file (≤ 12 words).
- "0% match" never appears; "Not scored" does.
- Audit log and dashboard activity show sentences, not keys.
- `/me` on a tenant host shows no "Kiwiply" and no Billing notification row; `demo-crawl.mjs` passes with `/me` included.
- Web and API tests green; the demo walkthrough runs end to end with the renamed menu entries.

---

## 10. Noticed, not in this phase

- Admin **Applications**, **Interviews** and **Clients** lists stayed on their skeleton for more than six seconds on the demo stack even though the list/counts/filters calls answered 200 in well under a second. Worth a look before the demo (likely a client-side render or a second fetch), but it is functionality, not content.
- Marketer Interviews seed has rows at 5:30 AM and 6:00 AM (Oct 24); Performance has "Placement rate 233%". Seed data, not UI; fix in `demo-setup.mjs` / the seeder when convenient.
- The extension drawer, kiwiply.com and the personal app are untouched; the same structure rules will apply when this is carried to Kiwiply enterprise.
- Phase 2 (visual): tile and card styling, the hero band art and height, sidebar width and density, fonts, colours, the donut legend wrapping on the Dashboard, table column widths, truncated labels in the rail cards, dark theme.

# App v2 — signed-in app, auth, enterprise admin and landing v3 (branch `version2`)

**Status:** design locked 2026-10-11 (Fable). Builds run on Sonnet agents in parallel; one commit per
phase on `version2`; never a PR. Companion to `web/LANDING-V2-SPEC.md` (theme tokens, exact-board
rules, placeholder-data rule). Boards live in `design/app-v2/*.webp`; eight **enterprise boards exist
only as transcriptions in §6** (the agent cannot view them — the text there is the board).

## 0. Scope in one paragraph

Four surfaces, all in the "Kiwiply Bright" look: (A) the **signed-in individual app** gets a new shell
and eight redesigned pages; (B) **login / signup** get the split-screen boards; (C) a brand-new
**enterprise admin** area at `/org/*` with ten pages; (D) an alternate **landing v3** at `/v3`. Every
board is implemented exactly — layout, copy, sample rows, chips, charts. Real data is wired where an
API exists; everything else renders from one sample-data file per surface.

## 1. Rules that bind every agent

1. **Exact to the board.** Copy, rows, numbers, chip colours, icons, order. Where a board is only
   transcribed (§6), the transcription is the board.
2. **Engineering rules** from `CLAUDE.md`: no inline `<svg>` in `web/` (add glyphs to
   `packages/ui/src/primitives/icons.tsx`), no new npm deps, charts are HTML/CSS (bars, lines via
   `clip-path`/gradients, donuts via `conic-gradient`), icons/doodles from `@kiwiply/ui`.
3. **Data policy.** Real where it exists; otherwise sample:
   - Real: account (`/api/account` → name, initial), plan (`getPlan()` → hide the Upgrade card on
     Pro), applications (`/api/profile/applications`), resumes (`/api/profile/resumes`), job matches
     (`/api/profile/job-matches`, Pro only), notifications (`/api/notifications`), inbox.
   - Sample: everything else (job search results, saved jobs, campaigns, interviews, templates,
     scores, org data). Sample data lives in **one file per surface** —
     `web/src/components/app-v2/sample-data.ts` and `web/src/components/org-v2/sample-data.ts` —
     with the top comment `SAMPLE — board data, not from the API; replace when the feature ships`.
     When a real list exists but is **empty**, render the sample rows so the page looks like the
     board (comment that in code). The signed-in user's real name replaces "Priya S."/"Priya Nair".
4. **People avatars** are initials tiles (no stock photos). **Company logos** are coloured initial
   tiles; `GoogleIcon` may be used for Google. Third-party app marks (LinkedIn, Slack, …) are
   lettered/initial tiles in the brand colour.
5. **Theme.** The `(app)`, `(org)` and auth layouts wrap their content in `.theme-v2` (same class
   the marketing layout uses) plus the Jakarta/Caveat font variables. App-specific tokens go in
   `packages/ui/styles/theme-v2.css` under `.theme-v2` (add, don't rename): sidebar active pill
   `--color-v2-nav-active-bg: #E9FBD9` / text navy for the individual app; **blue** family for the
   org app (`#1E6FF5` buttons, `#E8F0FF` active pill).
6. **Responsive.** Desktop boards are 1440-class. ≥1280 three-column layouts as drawn; 1024
   collapses the right rail under the main column; <1024 the sidebar becomes the existing drawer and
   everything stacks; 375 single column, tables become stacked cards, no horizontal scroll.
7. **Shared primitives.** Build once in `web/src/components/app-v2/common/` (contract in §2) and
   reuse everywhere, including the org app. If the agent that owns `common/` has not pushed when
   another agent starts, that agent builds local equivalents under its own folder and the QA phase
   dedupes.
8. **Branch discipline.** Worktree agents: fast-forward to `origin/version2` first, commit on the
   worktree branch, push that branch, never open a PR. Main-checkout agents commit on `version2`
   and push. Message prefix per phase (§8).

## 2. Shared primitives (`web/src/components/app-v2/common/`)

| Component | Props | Look |
|---|---|---|
| `PageHero` | `title`, `icon?`, `subtitle`, `note?` (handwritten), `art?` (ReactNode), `tone?` (`lime`/`blue`), `actions?` | rounded 20px banner, soft gradient wash (lime/blue tints + pastel blobs), title 32px navy 800, note in Caveat (navy for org, green/navy for app), art bottom-right |
| `StatTile` | `icon`, `value`, `label`, `delta?` ({value, up}), `sparkline?: number[]`, `tone` | tinted bg per tone (`blue`,`green`,`amber`,`violet`,`teal`,`coral`), icon in a white rounded square, value 26px 800, delta chip green `↑ 32%` (coral `↓` when down), optional sparkline polyline in the tone colour |
| `StatusChip` | `tone`, `children`, `dot?` | pill, tinted bg, 12px 600 |
| `DataTable` | `columns`, `rows`, `selectable?`, `actions?`, `footer?` | white card, header row muted 12px, hairline rows, hover tint, `⋮` actions; under `md` renders stacked cards |
| `Pagination` | `page`, `pages`, `summary` | "Showing 1-8 of 124 …" + ‹ 1 2 3 4 5 … 16 › |
| `Donut` | `segments: {label, value, tone}[]`, `centerValue`, `centerLabel`, `legend?` | conic-gradient ring 140px, white hole, legend with dots and `value (pct%)` |
| `BarGroupChart` | `groups: {label, values[]}`, `series: {label, tone}[]`, `max`, `yTicks` | grouped bars with legend dots |
| `LineChart` | `series: {label, tone, points[]}`, `xLabels`, `yLabels` | polyline via inline style gradients/`clip-path`, dots, end-value chips |
| `Sparkline` | `points`, `tone` | 80×28 polyline |
| `Progress` | `value`, `tone` | 6px rounded bar |
| `InitialsAvatar` | `name`, `size?`, `tone?` | coloured circle with initials |
| `CompanyTile` | `name`, `size?` | coloured initial square (Google → `GoogleIcon`) |
| `SectionCard` | `title`, `action?` (link text + href), `children` | white card, 16px radius, title 16px 700, "View all →" link |
| `MascotCard` | `title`, `body`, `cta`, `mascot`, `tone` | the sidebar "Upgrade to Kiwiply Pro" / "Need Help?" card |
| `SearchInput` | `placeholder`, `size` | rounded 12px, grey bg, search icon |
| `Tabs` (pill or underline) | reuse `@kiwiply/ui` Tabs where it fits; else `UnderlineTabs` with counts |
| `Toggle` | reuse `Switch` from `@kiwiply/ui` (green when on) |

Icons needed beyond the current set (add to `icons.tsx`): `HomeIcon`, `BellIcon` exists, `HelpCircleIcon`,
`BuildingIcon`, `UsersIcon` exists, `BriefcaseIcon` exists, `CalendarIcon` exists, `BarChartIcon` (=ChartIcon),
`SparklesIcon` exists, `ShareNodesIcon`, `CreditCardIcon` exists, `GearIcon` exists, `SendIcon` (paper plane),
`BookmarkIcon` exists, `MessageIcon` exists, `GraduationCapIcon` exists, `NetworkIcon`, `CompassIcon`,
`DownloadIcon`, `UploadIcon` exists, `FilterIcon` (=FunnelIcon), `MoreHorizontalIcon` (⋮/…), `ExternalLinkIcon`,
`CrownIcon`, `KeyIcon`, `WebhookIcon`, `ClockIcon` exists, `TrophyIcon` exists, `ListIcon`, `GridIcon`
(=LayoutGridIcon), `MapPinIcon`, `DollarIcon`, `VideoIcon`, `PlayIcon` exists, `CheckCircleIcon` exists,
`XCircleIcon`, `MinusCircleIcon`, `PlusIcon`, `ArrowUpRightIcon`, `TrendingUpIcon` exists, `LightbulbIcon` exists.

## 3. Individual app (A)

### 3.1 Shell (board `app-home-dashboard.webp` and every app board)
- **Sidebar** 232px, white, logo lockup (`BrandLogo`), nav with 18px icons: Home (`/dashboard`),
  Job Search (`/jobs`), AI Apply (`/ai-apply`), My Applications (`/applications`), Interviews
  (`/interviews`), Saved Jobs (`/saved`), Resume (`/resume`), AI Tools (`/ai-tools`), Career Insights
  (`/insights`), Messages (`/messages`), Company Research (`/companies`), Networking (`/networking`),
  Learning (`/learning`), Profile (`/profile`), Settings (`/settings`). Active = lime-soft pill, navy
  bold text. Below: `MascotCard` "Upgrade to Kiwiply Pro" with `mascot-grad.png`, ticks "AI Apply to
  more jobs · Advanced insights · Priority support", lime button "Upgrade Now →" (→ `/pricing`;
  hidden on Pro). Existing collapse behaviour, mobile drawer, sign-out and notification bell stay
  (bell moves to the top bar).
- **Top bar** 64px: search "Search jobs, companies, or skills..." (max 880px), right: bell with red
  count badge, avatar initials + "<First L.>" / "Student · Individual" (use the account's real name;
  the subtitle stays as drawn) + chevron opening a menu: Profile · Settings · **Kiwiply for
  Organizations** (→ `/org`) · Sign out.
- Keep `/board` and `/matches` routes working as redirects to `/applications` and `/jobs` so the
  extension's and emails' links keep resolving.

### 3.2 Pages — transcribe each board verbatim; wiring notes below
| Route | Board | Wiring |
|---|---|---|
| `/dashboard` (Home) | `app-home-dashboard.webp` | greeting uses the real first name + time of day; KPI tiles and "Recent Applications" from the real applications list (fallback sample); "Recommended Jobs" from matches (Pro) else sample; Kiwiply AI panel buttons link: Find jobs → `/jobs`, Tailor my resume → `/resume`, Write a cover letter → `/resume#cover-letter`, Prepare for an interview → `/interviews`, Research a company → `/companies`; the right-rail hero art is `home-woman.png`; everything else sample |
| `/jobs` | `app-job-search.webp` (list + preferences rail) and `app-job-search-split.webp` (the split view with a detail panel when a row is selected — implement as the same page: clicking a row opens the right-side detail panel and the rail collapses) | matches (Pro) else sample; "Apply with AI" → `/ai-apply?job=<id>` ; bookmark toggles saved (client state) |
| `/jobs/[id]` | `app-job-detail.webp` | sample job by id; "Apply Now" → `/ai-apply?job=<id>`; Previous/Next cycle the sample list |
| `/saved` | `app-saved-jobs.webp` | sample + client state |
| `/ai-apply` | `app-ai-apply-campaigns.webp` for the "Auto Apply" tab, `app-ai-apply-find.webp` for the "Find & Apply" tab; tabs: Find & Apply · Bulk Apply · Auto Apply Agent · Application Templates · Manage Preferences (both boards' tab rows merged in that order; first tab default) | sample; "Start Auto Apply" and "Apply with AI" buttons are no-ops with a toast "Coming soon — Autopilot prepares, you submit" |
| `/applications` | `app-my-applications.webp` | the real applications list mapped to the table (status → chip; Next Step from status) with the sample rows as fallback; tabs count real rows; the existing `ApplicationBoard` component stays importable but is not rendered here |
| `/interviews` | `app-interviews.webp` (primary; `app-interviews-alt.webp` only differs in art) | sample; hero art `calendar-note.png` |
| `/resume` | `app-resume-builder.webp` | "My Resume" card from the real default resume (name, updated, version = count); "Recent Versions" from real resumes; templates/score/suggestions sample; "Edit Resume"/"Create New Resume" open the existing `ResumesWorkspace` in a `SidePanel` |
| `/ai-tools`, `/insights`, `/messages`, `/companies`, `/networking`, `/learning` | no boards | same shell, `PageHero` with a fitting title/subtitle and a `MascotCard` "Coming soon" body; one component `ComingSoonPage` |
| `/profile`, `/settings` | existing pages | keep content; inherit the theme; wrap in the same page container |

## 4. Auth (B) — `auth-login-desktop.webp`, `auth-signup-desktop.webp`, `auth-login-signup-mobile.webp`
- `/login`: left panel copy "More opportunities / for a **brighter you.**" + lede + the four-row
  feature card (Find jobs on 1,000+ sites · AI autofill applications · Smart resume selection · Track
  applications & interviews) + handwritten "Big dreams. You got this." (sticky) and "Same me. More
  opportunities." + `auth-trio.png` bottom-left over foliage blobs; right card: logo stacked, "Welcome
  back", "Log in to continue your job search journey.", Email address, Password (+ Forgot password?),
  lime "Log in →", "or continue with" Google · Apple · LinkedIn (Apple/LinkedIn render but show a toast
  "Not available yet"; Google uses the existing `GoogleSignIn`), "Don't have an account? Sign up free →",
  green-soft card "Hiring for a team or organization? Manage multiple employees, schedule applications
  and track results — all in one place." → `/organizations`.
  **Keep the existing login logic** (username OR email field label becomes "Email address" but the
  input still posts `username`; MFA step stays; `next` handling stays).
- `/signup`: left "Join millions / finding more / **opportunities.**" + lede + four feature rows +
  sticky "Big dreams. You got this." + crown/star doodles + `auth-trio-signup.png`; right card:
  "Create your account", "It's free and takes less than a minute.", Full name, Email address,
  Password, Confirm password, lime "Create account →", "or sign up with" Google · Apple · LinkedIn,
  "By creating an account, you agree to our Terms of Service and Privacy Policy.", org card
  "Creating an account for your team?". Keep the existing signup API (derive `username` from the
  email local part + a short random suffix if the API rejects it; `firstName/lastName` from the full
  name), the activation "Almost there" state and the newsletter opt-in (as a small checkbox under
  the terms line).
- Mobile (`auth-login-signup-mobile.webp`): stacked — logo, tagline, art, white card with the form,
  org card; signup variant has the mascot on books (`mascot-books.png`).
- `/forgot-password` and `/reset-password` keep their flows, restyled in the same card.

## 5. Enterprise admin (C) — route group `web/src/app/(org)/org/*`
- Layout gates the session exactly like `(app)` (no org model exists yet; any signed-in user can
  open it on this branch — comment that). Wraps in `.theme-v2`.
- **Shell** (every org board): sidebar 236px white: logo; nav Dashboard (`/org`), Team Management
  (`/org/team`), Job Opportunities (`/org/opportunities`), Applications (`/org/applications`),
  Interviews (`/org/interviews`), Analytics & Reports (`/org/analytics`), AI Resume Support
  (`/org/resumes`), Integrations (`/org/integrations`), Billing & Subscription (`/org/billing`),
  Settings (`/org/settings`); active = blue-soft pill, blue text. Bottom `MascotCard` violet-soft:
  `mascot-help.png`, "Need Help?", "Get setup support or speak to our team.", button "Contact Support →"
  (violet-soft bg, violet text) → `/contact?topic=organization`.
  Top bar: chip "🏢 Acme Corp [Enterprise]" (building icon, blue-soft "Enterprise" pill), search
  "Search jobs, employees, applications...", bell (red "1"), help icon, avatar initials + "<real name>"
  / "Admin" + chevron (menu: Switch to individual app → `/dashboard`, Settings, Sign out).
- **Page hero** on every page: chip "🏢 Acme Corp Enterprise", title + blue icon, subtitle, right:
  `org-team-banner.png` + green spark doodles + pastel blobs + handwritten note (navy Caveat).
- **Stat tiles**: 4 per row (5 on Analytics), tinted, with sparklines.
- Pages and exact content: **§6**.

## 6. Enterprise boards — transcriptions (these ARE the boards)

### 6.1 Applications (`design/app-v2/org-admin-applications.webp` — also viewable)
Hero "Application" (file icon) · "Track employee job applications and outcomes, and provide the right support at every step." · note "Support your people. Brighter futures together."
Stats: 124 Total Applications ↑32% (green) · 48 In Review ↑18% (blue) · 32 Interviews ↑20% (amber) · 18 Offers ↑50% (violet).
Main card "Applications": buttons "+ Add Application" (blue solid) · "Bulk Update" · "Send Reminder" (outlined). Tabs: All Applications (124) · Applied (28) · In Review (48) · Interview (32) · Offer (18) · Rejected (14). Search "Search applications by employee name, company, or role..." + selects All Statuses · All Job Roles · Last 30 days + filter icon.
Table Employee · Company · Role / Position · Application Date · Current Stage · Support Owner · Resume Status · Next Action · Actions:
1. Aarav Mehta (Product Designer) · Google · Product Designer · Oct 8, 2026 · Interviewing (blue) · Priya Nair · Submitted (green) · Prepare for interview / Oct 12, 2026
2. Sneha Patel (Software Engineer) · Microsoft · Software Engineer · Oct 6, 2026 · Applied (blue-soft) · Rahul Sharma · Submitted · Follow up / Oct 14, 2026
3. Vikram Reddy (Data Analyst) · Amazon · Data Analyst · Oct 5, 2026 · Offer (amber) · Aishwarya K. · Submitted · Review offer / Oct 7, 2026
4. Neha Gupta (Product Manager) · Atlassian · Product Manager · Oct 4, 2026 · In Review (violet) · Vikram R. · Submitted · Check status / Oct 10, 2026
5. Daniel Kim (UX Researcher) · Meta · UX Researcher · Oct 3, 2026 · Rejected (coral) · Priya Nair · Submitted · Share feedback / Oct 6, 2026
6. Fatima Khan (Marketing Specialist) · Spotify · Marketing Specialist · Oct 2, 2026 · Interviewing · Rahul Sharma · Needs Update (coral) · Send updated resume / Oct 9, 2026
7. Rohan Desai (Software Engineer) · Stripe · Software Engineer · Oct 1, 2026 · In Review · Aishwarya K. · Submitted · Follow up / Oct 8, 2026
8. Emily Chen (Data Analyst) · Adobe · Data Analyst · Sep 30, 2026 · Applied · Vikram R. · Needs Update · Update resume / Oct 5, 2026
Footer "Showing 1–8 of 124 applications" · ‹ 1 2 3 4 5 … 16 ›.
Right rail: **Application Stage Breakdown · View all** — donut "124 Applications": Applied 28 (23%) blue · In Review 48 (39%) green · Interviewing 32 (26%) amber · Offer 18 (15%) violet · Rejected 14 (11%) coral. **Recent Responses · View all**: Google · Interview Invitation / Product Designer · 2h ago · "New" chip; Microsoft · Application Received / Software Engineer · 1d ago; Amazon · Moved to Interview / Data Analyst · 2d ago; Atlassian · Application Under Review / Product Manager · 3d ago; Spotify · Rejection Received / Marketing Specialist · 4d ago.
Bottom row: **Follow-up Tasks · View all** (checkbox · text · date · priority chip): Send follow-up email to Microsoft · Today · High (coral); Check status for Atlassian application · Oct 9, 2026 · Medium (amber); Help Fatima update resume for Spotify · Oct 9, 2026 · Medium; Prepare Aarav for Google interview · Oct 12, 2026 · High; Review Amazon offer with Vikram · Oct 13, 2026 · Low (green). **Application Activity Timeline · View all** (dot timeline): Aarav Mehta moved to Interviewing / Google – Product Designer · Oct 8, 2026 2:14 PM; Sneha Patel application submitted / Microsoft – Software Engineer · Oct 8, 2026 11:20 AM; Vikram Reddy received an offer / Amazon – Data Analyst · Oct 7, 2026 4:35 PM; Neha Gupta moved to In Review / Atlassian – Product Manager · Oct 7, 2026 10:18 AM. **Quick Actions** (2×3 tiles): Add Application · Bulk Update · Send Reminder · View Reports · Export Data · Manage Integrations.

### 6.2 Integrations
Hero "Integrations" (share-nodes icon) · "Connect the tools you use for employee job placement and streamline your workflow." · note "Connect your tools. Create more opportunities together."
Stats: 8 Connected Apps ↑33% (blue) · 98% Sync Health ↑12% (green) · 6 Active Automations ↑50% (amber) · 3 Pending Actions ↓25% (violet).
"Connected Integrations" + search "Search integrations..." + "+ Add Integration" (blue) · "Run Sync" · "Configure Mapping" (outlined). Cards (row 1: 4, row 2: 5), each: mark tile, name, "Connected" green chip, ⋮; rows "Last Sync" and "Synced Data"; buttons Manage · Run Sync:
LinkedIn · Oct 8, 2026 2:14 PM · Job posts, candidates, company info | Indeed · Oct 8, 2026 11:20 AM · Job postings, applications, candidates | Greenhouse · Oct 7, 2026 4:35 PM · Job postings, candidates, interviews | Workday · Oct 6, 2026 3:22 PM · Employee data, job requisitions, org chart | Gmail · Oct 8, 2026 10:18 AM · Email communication, interview invites | Outlook · Oct 6, 2026 1:05 PM · Email communication, calendar events | Slack · Oct 5, 2026 4:50 PM · Channel notifications, application updates | Google Calendar · Oct 5, 2026 11:12 AM · Interview schedules, team availability | Google Drive · Oct 4, 2026 9:30 AM · Resumes, documents, placement files.
Bottom three cards: **Webhooks & API Keys** — "Manage API access and webhook endpoints for custom integrations." rows: API Keys · 2 active keys · Manage; Webhook Endpoints · 1 active endpoint · Manage; API Documentation · View docs and guides · View Docs ↗. **Notification Routing** — "Send integration events to the right people and channels." rows: Interview Invites · Slack #interviews · Edit; Application Updates · Slack #applications · Edit; Placement Confirmations · Email to hiring team · Edit; Sync Failures (red alert icon) · Email to admins · Edit. **Automation Flows · View all** — "Automate tasks across your integrated tools." toggles (all on) + ⋮: Create interview event from application (Indeed → Google Calendar); Notify hiring team on new application (Greenhouse → Slack); Sync new employees to Workday (Kiwiply → Workday); Save resumes to Drive (Applications → Google Drive).

### 6.3 Billing & Subscription
Hero "Billing & Subscription" · "Manage your plan, seats, usage, and invoices all in one place." · note "Invest in your people. Build brighter futures together."
Stats: Current Plan **Enterprise** + "Active" green chip (crown icon, blue) · Active Seats **72 / 100** ↑72% used (green) · Monthly Usage **2,486** Total actions ↑18% (violet) · Next Renewal **Nov 15, 2026** ⏱ 32 days remaining (amber).
**Plan Summary** + "⚙ Manage Plan": crown tile, "Enterprise" + Active chip, "Advanced hiring tools for growing teams with customization, dedicated support, and more."; check chips: AI Resume Support · Advanced Analytics · Team Collaboration · Custom Integrations · Dedicated Support · Priority Access.
**Seat Utilization · View Details**: donut "72 of 100 seats"; Active Seats 72 (72%) green; Available Seats 28 (28%) blue; blue button "Add Seats".
**Payment Method**: VISA tile, "Visa ending in 4242" / "Expires 04/2028", ⋮; green chip "Default Payment Method"; outlined "Update Payment Method".
**Billing History & Invoices · View all** table Invoice # · Date · Description · Amount · Status · Actions: INV-2026-010 · Oct 15, 2026 · Enterprise Plan (72 seats) · $1,800.00 · Paid · Download; INV-2026-009 · Sep 15, 2026 · (68 seats) · $1,700.00; INV-2026-008 · Aug 15, 2026 · (65 seats) · $1,625.00; INV-2026-007 · Jul 15, 2026 · (62 seats) · $1,550.00; INV-2026-006 · Jun 15, 2026 · (60 seats) · $1,500.00.
**Usage Breakdown (This Month) · View all**: AI Resume Support · 842 / 1,000 resumes · 84% (violet bar); Job Applications · 1,240 / 2,000 applications · 62% (blue); Integrations · 404 / 500 API calls · 81% (green).
**Subscription Details** + "✎ Edit": Plan Enterprise · Active Seats 72 / 100 · Billing Cycle Monthly · Next Renewal Nov 15, 2026 · Plan Started Jan 15, 2025 · Annual Contract Yes · Auto-Renewal Enabled (green chip) · Currency USD.
**Upgrade Options · View Plans**: Add More Seats — Scale your team as you grow. ›; Custom Plan — Need a tailored solution? ›.
**Billing Contacts** + "+ Add Contact": Priya Nair · Primary Billing Contact · priya.nair@acmecorp.com ⋮; Rahul Sharma · Finance Team · rahul.sharma@acmecorp.com ⋮.

### 6.4 Settings
Hero "Settings" · "Configure your enterprise workspace, manage permissions, and customize your hiring experience." · note "Build a stronger team together."
Tab bar (icons + labels, active underlined blue): Organization Profile · Team Permissions · Notification Rules · Placement Workflow · Branding · Security & SSO · Audit Logs (only the first two have content; the others show a "Coming soon" panel in the same card).
**Organization Profile** — "Manage your company information and workspace settings." + blue "Save Changes": logo box (building icon, "Change Logo" outlined, "JPG, PNG up to 2MB"); fields Company Name = Acme Corp · Industry = Technology ▾ · Company Email = careers@acmecorp.com · Company Size = 501 - 1,000 employees ▾ · Website = https://www.acmecorp.com · Location = 📍 San Francisco, CA · About Company (textarea) = "Acme Corp is a technology company building innovative solutions for a brighter future. We're committed to diversity, growth, and creating meaningful opportunities for talent worldwide." counter 156/500.
**Team Permissions** — "Set default permissions and access levels for your team members." + "Save Changes": Default Role for New Members [Recruiter ▾] "Set the default role when inviting new team members."; Access to Salary Information (on) "Allow team members to view salary details in job postings."; Can Manage Candidates (on) "Allow team members to view and manage candidate data."; (on) "Allow team members to create new job postings."; (off) "Allow Expert members to export analytics reports."
Right rail: **Admin Roles · View all**: Priya Nair · priya@acmecorp.com · Super Admin (violet); Rahul Sharma · rahul@acmecorp.com · Admin (blue); Aishwarya K. · aishwarya@acmecorp.com · Hiring Manager (green); Vikram R. · vikram@acmecorp.com · Recruiter (amber); "+ Add Admin" (blue-soft). **Approval Rules · Edit**: Job Posting Approval — Requires approval from Hiring Manager ›; Offer Approval — Requires approval from Department Head ›; Placement Approval — Requires approval from Recruitment Head ›. **Security Status · View details**: green shield, "Secure" / "Your workspace is protected with enterprise-grade security."; ✓ SSO Enabled · ✓ 2FA Required · ✓ Data Encryption (AES-256) · ✓ Regular Security Scans.

### 6.5 Interviews
Hero "Interviews" (calendar icon) · "Schedule, prepare, and track interview progress for your employees." · note "Confident employees. Stronger career outcomes."
Stats: 18 Interviews This Week ↑28% (amber) · 26 Mock Interviews ↑18% (violet) · 32 Upcoming Employer Interviews ↑25% (green) · 68% Offer Rate ↑12% (blue).
**Interview Schedule** ‹ Oct 6 - Oct 12, 2026 › [Week active][Month] [Today]; week grid Mon Oct 6 · Tue Oct 7 · Wed Oct 8 · Thu Oct 9 · Fri Oct 10; rows 9 AM … 4 PM; events (title / subtitle, tone): Mon 10–11 Product Designer / Google (blue); Mon 1–2 PM Mock Interview / Priya Nair (violet); Mon 3 PM UX Researcher / Microsoft (green); Tue 9 AM Software Engineer / Amazon (amber); Tue 1–2 PM Data Analyst / Salesforce (blue); Wed 11–12 Mock Interview / Aarav Mehta (violet); Wed 2 PM Product Manager / Notion (green); Thu 10 AM Software Engineer / Google (blue); Thu 1 PM Data Analyst / Microsoft (amber); Fri 10 AM UX Researcher / Spotify (green); Fri 1 PM Mock Interview / Neha Gupta (violet).
**Upcoming Interviews · View all** table Employee · Company · Role · Interview Type · Date & Time · Interviewer · Status · Actions: Aarav Mehta · Google · Product Designer · Final Round · Oct 8, 2026 2:00 PM · Sarah Kim · Upcoming; Sneha Patel · Microsoft · Data Analyst · Technical · Oct 8, 2026 11:00 AM · James Park · Upcoming; Vikram Reddy · Amazon · Software Engineer · Technical · Oct 9, 2026 10:00 AM · Priya Shah · Upcoming; Neha Gupta · Notion · Product Manager · Final Round · Oct 9, 2026 1:00 PM · Daniel Kim · Upcoming; Daniel Kim · Spotify · UX Researcher · Behavioral · Oct 10, 2026 9:00 AM · Emily Carter · Upcoming.
Bottom: **Employee Interview Prep Status · View all** (Employee · Upcoming Interviews · Prep Progress · Status): Aarav Mehta · 2 · 80% · On Track (green); Sneha Patel · 1 · 60% · In Progress (blue); Vikram Reddy · 1 · 45% · Needs Support (amber); Neha Gupta · 2 · 90% · Well Prepared (green); Daniel Kim · 1 · 50% · In Progress (violet). **Interview Prep Checklist · View all**: donut 75% "Prep Complete"; Resume Review 5/5 (green) · Company Research 4/5 (blue) · Mock Interviews 3/5 (amber) · Behavioral Prep 4/5 (violet) · Technical Prep 3/5 (teal); "Upcoming Tasks": ☑ Review company background · Oct 6; ☑ Practice common questions · Oct 7; ☐ Complete mock interview · Oct 8; ☐ Review portfolio / projects · Oct 8; ☐ Prepare questions to ask · Oct 9. **Recent Interview Outcomes · View all**: Google · Product Designer / Aarav Mehta · Oct 5, 2026 · Offered (green); Microsoft · Data Analyst / Sneha Patel · Oct 3, 2026 · Next Round (blue); Amazon · Software Engineer / Vikram Reddy · Oct 2, 2026 · Rejected (coral); Notion · Product Manager / Neha Gupta · Oct 1, 2026 · Next Round; Spotify · UX Researcher / Daniel Kim · Sep 29, 2026 · Offered. **Quick Actions**: Schedule Interview — Set up employer interviews; Assign Mock Interview — Help employees practice; Share Prep Pack — Send resources to employees; View Reports — Track interview performance.

### 6.6 Analytics & Reports
Hero "Analytics & Reports" (bar-chart icon) · "Measure your team's placement performance and track the impact of Kiwiply." · note "Data today. Brighter opportunities tomorrow."
Stats (5): 124 Total Applications ↑32% (blue) · 72 Interviews Conducted ↑28% (green) · 18 Offers Extended ↑50% (amber) · 12 Placements ↑33% (violet) · 72% Placement Success Rate ↑14% (teal).
Filter bar (labels above selects): Date Range [📅 Last 30 days ▾] · Department [All Departments ▾] · Role Category [All Roles ▾] · Support Owner [All Support Owners ▾] · right: "Export Report" (outlined, download icon) · "Schedule Report" (blue, calendar icon).
Row 1: **Application Trend** (Last 30 days ▾) grouped bars, legend Applications (blue) · Interviews (green) · Offers (amber) · Placements (violet); x Sep 10 · Sep 17 · Sep 24 · Oct 1 · Oct 8; values 25/18/8/5 · 32/20/10/6 · 30/22/9/5 · 28/18/8/4 · 38/25/12/7; y 0–40. **Placement Funnel** (Last 30 days ▾): stacked trapezoids 124 (blue) · 72 (green) · 18 (amber) · 12 (violet); legend Applications 124 (100%) · Interviewed 72 (58%) · Offers 18 (15%) · Placed 12 (10%). **Response Rate Trend** (Last 30 days ▾): lines Application Response Rate (blue, 55→78%, end chip "78%") · Offer Acceptance Rate (green, 30→67%, end chip "67%"); y 0% 25% 50% 75% 100%; x Sep 10 … Oct 8.
Row 2: **Department Performance** (Last 30 days ▾) grouped bars (same legend) for Product · Engineering · Design · Data · Marketing · Sales: 40/30/18/14 · 34/25/15/10 · 28/20/12/8 · 24/18/10/7 · 22/16/9/6 · 20/14/8/5. **Support Owner Performance · View all** table Support Owner · Applications · Interviews · Offers · Placements · Success Rate (green chip): Priya Nair 28 16 5 4 80%; Rahul Sharma 24 14 4 3 75%; Aishwarya K. 18 10 3 2 67%; Vikram R. 16 9 3 2 67%; Neha Gupta 14 8 2 1 63%. **Kiwiply Impact & ROI** (Last 30 days ▾) 2×2 tiles: 12 Employees Placed ↑33% (green) · 28 Avg. Days to Place ↓22% (violet) · 3.2x ROI Estimate ↑28% (amber) · 96% Hiring Manager Satisfaction ↑12% (blue).

### 6.7 AI Resume Support
Hero "AI Resume Support" (sparkle icon) · "Optimize employee resumes and application materials with AI-powered insights." · note "Stronger resumes. Brighter opportunities together."
Stats: 156 Resumes Reviewed ↑24% (blue) · 132 ATS Ready ↑32% (green) · 48 Tailored This Week ↑28% (amber) · 12 Needs Attention ↑20% (coral).
**Employee Resumes** + "Upload Resume" (blue, upload icon) + "Bulk Actions ▾" (outlined); tabs All Employees (85) · Needs Attention (12) · ATS Ready (132) · No Resume (8) · Departments ▾; search "Search employees by name, role, or department..." + [Last Updated (Newest) ▾] + filter icon.
Table Name · Current Role · Target Role · Resume Score · ATS Score · Latest Version · Status · Actions (score chips: ≥85 green, 70–84 amber, <70 coral): Priya Nair · Product Designer · Senior Product Designer · 92 · 88 · Oct 8, 2026 · ATS Ready (green); Rahul Sharma · Software Engineer · Senior Software Engineer · 78 · 72 · Oct 7, 2026 · Needs Review (coral-soft); Aishwarya K. · Data Analyst · Data Scientist · 85 · 80 · Oct 6, 2026 · ATS Ready; Vikram R. · Salesforce Developer · Technical Architect · 66 · 58 · Oct 6, 2026 · Needs Attention (coral); Neha Gupta · Product Manager · Senior Product Manager · 90 · 86 · Oct 5, 2026 · ATS Ready; Daniel Kim · UX Researcher · Senior UX Researcher · 74 · 70 · Oct 4, 2026 · Review Suggested (amber); Fatima Khan · Marketing Specialist · Growth Marketer · 82 · 76 · Oct 4, 2026 · ATS Ready; Rohan Desai · Software Engineer · DevOps Engineer · 69 · 64 · Oct 3, 2026 · Needs Attention. "Showing 1-8 of 85 employees" ‹ 1 2 3 4 5 … 11 ›.
Right rail **AI Resume Suggestions · View all**: avatar Rahul Sharma / Software Engineer; "Resume Score 78/100" (amber) · "ATS Score 72/100" (amber); tabs Key Suggestions (active) · Role Alignment · ATS Insights; items (icon tile, title, body, ›): Add Missing Keywords — Include "React", "AWS", "CI/CD", "Docker" to match Senior Software Engineer roles.; Stronger Bullet Points — Use more impact-driven bullets with quantifiable results (e.g., "Improved system performance by 40%").; Improve Summary — Highlight 5+ years of experience and core strengths in a more compelling summary.; Better Role Alignment — Tailor your resume for Senior Software Engineer roles using industry-relevant skills and terminology.; buttons "✦ Generate Suggestions" (outlined) · "Tailor for Job" (blue).
Bottom three tinted cards with ›: Bulk Tailor Resumes — Select multiple employees and tailor their resumes for specific job roles using AI. (blue-soft); Resume Comparison — Compare multiple resume versions to see improvements and ATS score changes. (violet-soft); Cover Letter Drafts — Generate personalized cover letters to match target roles and job descriptions. (green-soft).

### 6.8 Job Opportunities
Hero "Job Opportunities" (briefcase icon) · "Discover and assign high-impact roles for your employees." · note "More opportunities. Brighter futures together."
Stats: 48 Open Roles ↑12% (blue) · 326 Assigned Opportunities ↑28% (green) · 92 Employer Responses ↑18% (amber) · 56 Placements Started ↑33% (violet).
**All Opportunities** + "+ Add Opportunity" (blue) · "Bulk Assign" · "Export List" (outlined); filter chips All Departments ▾ · All Locations ▾ · Remote / Hybrid ▾ · Match Score ▾ · All Stages ▾; search "Search opportunities by role, company, or keyword..." + [Last Updated (Newest) ▾] + filter icon.
Table Company · Role Title · Location (pin) · Work Mode (chip: Hybrid violet, Remote blue) · Assigned · Match Score (pct + bar: ≥80 green else amber) · Support Owner · Status (Open green, In Progress blue, Reviewing amber) · Actions: Google · Product Designer · San Francisco, CA · Hybrid · 6 · 92% · Priya Nair · Open; Microsoft · Software Engineer · Seattle, WA · Remote · 8 · 88% · Rahul Sharma · Open; Amazon · Data Analyst · New York, NY · Hybrid · 5 · 82% · Aishwarya K. · In Progress; Salesforce · UX Researcher · San Francisco, CA · Remote · 4 · 78% · Vikram R. · In Progress; Adobe · Product Manager · Seattle, WA · Hybrid · 7 · 76% · Neha Gupta · Open; Stripe · Software Engineer · New York, NY · Remote · 3 · 72% · Daniel Kim · Reviewing; Notion · Growth Marketing · Austin, TX · Hybrid · 4 · 68% · Fatima Khan · Open; Meta · Data Scientist · Menlo Park, CA · Remote · 5 · 66% · Rohan Desai · In Progress; Spotify · Business Analyst · New York, NY · Hybrid · 2 · 64% · Emily Chen · Open; Airbnb · Product Designer · San Francisco, CA · Remote · 3 · 61% · Arjun Nair · Reviewing. "Showing 1-10 of 48 opportunities" ‹ 1 2 3 4 5 … ›.
Right rail: **Top Hiring Companies · View all** (tile · name · "N roles" · bar · pct): Google · 12 roles · 25% (blue); Microsoft · 9 roles · 19% (green); Amazon · 7 roles · 15% (amber); Salesforce · 6 roles · 13% (violet); Adobe · 5 roles · 10% (grey). **Opportunity Pipeline · View all** donut "48 Roles": Open 18 (38%) blue · Assigned 14 (29%) green · In Progress 8 (17%) amber · Reviewing 5 (10%) violet · Closed 3 (6%) grey. **Recent Assignments · View all**: Aarav Mehta · Product Designer at Google · 2h ago; Sneha Patel · Software Engineer at Microsoft · 6h ago; Neha Gupta · Data Analyst at Amazon · 1d ago; Rohan Desai · Product Manager at Adobe · 1d ago; Fatima Khan · UX Researcher at Salesforce · 2d ago (company tile at right).

### 6.9 Dashboard and Team Management (no boards — compose in the same system)
**Dashboard** `/org`: hero "Dashboard" · "Your team's placement activity at a glance." · note "Support your people. Brighter futures together."; stats 85 Employees ↑8% (blue) · 124 Applications ↑32% (green) · 32 Interviews ↑20% (amber) · 12 Placements ↑33% (violet); "Placement Pipeline" horizontal stacked bar (Applied 124 · In Review 48 · Interview 32 · Offer 18 · Placed 12); row: "Recent Activity" (the §6.1 timeline) · "Upcoming Interviews" (first 4 of §6.5) · "Top Opportunities" (first 5 of §6.8); "Quick Actions" (Add Employee · Add Opportunity · Schedule Interview · View Reports).
**Team Management** `/org/team`: hero "Team Management" (users icon) · "Manage employees, support owners, and roles across your organization." · note "Build great careers together."; stats 85 Employees · 72 Active Seats · 6 Support Owners · 12 Needs Attention; buttons "+ Add Employee" (blue) · "Import CSV" · "Bulk Assign"; tabs All Employees (85) · Active (72) · Needs Attention (12) · Placed (12); table Name · Current Role · Department · Support Owner · Placement Stage · Last Activity · Actions using the people of §6.1/§6.7 (Aarav Mehta · Product Designer · Product · Priya Nair · Interviewing · 2 days ago; Sneha Patel · Software Engineer · Engineering · Rahul Sharma · Applied · 1 day ago; Vikram Reddy · Data Analyst · Data · Aishwarya K. · Offer · 3 days ago; Neha Gupta · Product Manager · Product · Vikram R. · In Review · 1 day ago; Daniel Kim · UX Researcher · Design · Priya Nair · Rejected · 2 days ago; Fatima Khan · Marketing Specialist · Marketing · Rahul Sharma · Interviewing · 4 hours ago; Rohan Desai · Software Engineer · Engineering · Aishwarya K. · In Review · 6 hours ago; Emily Chen · Data Analyst · Data · Vikram R. · Applied · 2 days ago); right rail: "Departments" donut (Engineering 28 · Product 18 · Design 12 · Data 14 · Marketing 8 · Sales 5), "Support Owners" list (Priya Nair 16 employees · Rahul Sharma 15 · Aishwarya K. 14 · Vikram R. 14 · Neha Gupta 13 · Daniel Kim 13), "Recent Activity".

## 7. Landing v3 (D) — `design/app-v2/landing-v3-desktop.webp` + `landing-v3-mobile.webp`
Built at **`/v3`** (the current `/` carousel landing stays; the user picks). Same marketing layout
but with its own header nav as drawn (For Students · For Job Seekers · For Employers · Resources ·
Pricing · Sign In · Get Started →). Transcribe both boards verbatim: hero "From Resume / to Dream Job /
with AI by Your Side", "Get Started for Free →" + "Watch Video", ticks AI-Powered · Save Time · More
Interviews · Land Better Jobs, `mascot-laptop-big.png` centre with the cards (Build Resume · Find Jobs
Google/Microsoft/Amazon Apply · AI Apply · Prepare for Interviews), "Our users get hired at amazing
companies" wordmarks Google · Microsoft · amazon · stripe · Meta · Apple · NETFLIX · "and many more…",
six pillars (AI Resume Builder · Smart Job Matching · One-Click Apply · Interview Prep · Track Your
Progress · Learn & Grow with their lines), stats band (1M+ Jobs Aggregated · 200K+ Applications Sent ·
75K+ Interviews Scheduled · 68% Get More Interviews with Kiwiply) with `mascot-grad-big.png` and
"Real People. Real Opportunities. Real Growth.", "How it works — Get Hired in 4 Simple Steps" …; below
the first screen continue with the v2 landing sections (`sections/*`) in the mobile board's order
(Apply with AI on 1,000+ job sites · One platform for your entire job search (phone mock) · For
Individuals "More opportunities for a brighter you." · For Organizations "Empower your people. Grow
together." · Real stories, real progress · stats · dark CTA "Your next opportunity is waiting." with
"No credit card required." · FAQ (Is Kiwiply free to use? · Which job sites does it work on? · How does
AI autofill work? · Can I use my own resume? · Is there an organization plan?) · dark footer with
accordion columns). Mobile per the mobile board. Stats/testimonials/partner names go into
`placeholder-data.ts` like §13 of the landing spec.

## 8. Phases, agents and file ownership (all Sonnet, parallel)

| Phase | Agent | Owns (create/edit ONLY these) | Commit prefix |
|---|---|---|---|
| **A1 shell + common + home + jobs** | main checkout | `(app)/layout.tsx`, `components/app-shell/*`, `components/app-v2/common/*`, `components/app-v2/sample-data.ts`, `components/app-v2/{home,jobs}/*`, `(app)/dashboard/page.tsx`, new `(app)/jobs/**`, `(app)/board/page.tsx` + `(app)/matches/page.tsx` (→ redirects), `packages/ui/src/primitives/icons.tsx` (ADD only), `theme-v2.css` (ADD only) | `app1:` |
| **A2 app pages** | worktree | new `(app)/{saved,ai-apply,applications,interviews,resume,ai-tools,insights,messages,companies,networking,learning}/**`, `components/app-v2/{saved,ai-apply,applications,interviews,resume,coming-soon}/*`, `components/app-v2/sample-data.pages.ts` (its own sample file; QA merges) | `app2:` |
| **B auth** | worktree | `app/login/**`, `app/signup/**`, `app/forgot-password/**`, `app/reset-password/**`, `components/auth/*`, `public/v2/app/auth-*` | `auth:` |
| **C1 org shell + 5 pages** | worktree | `(org)/**` layout + `org/page.tsx`, `org/team`, `org/applications`, `org/opportunities`, `org/interviews`; `components/org-v2/{shell,common-local,sample-data.ts,dashboard,team,applications,opportunities,interviews}/*` | `org1:` |
| **C2 org 5 pages** | worktree | `org/analytics`, `org/resumes`, `org/integrations`, `org/billing`, `org/settings`; `components/org-v2/{analytics,resumes,integrations,billing,settings}/*`, `components/org-v2/sample-data.2.ts` — pages are built as components first; the C1 shell is merged by the coordinator before routes are wired, or C2 wires them itself after `git merge origin/version2` if C1 has landed | `org2:` |
| **D landing v3** | worktree | `(marketing)/v3/**`, `components/marketing/v3/*` | `v3:` |
| **QA** | main checkout | everything: merge, dedupe local primitives into `app-v2/common`, dedupe sample files, tablet/mobile pass on every new route, `npm run build`, PROGRESS log | `appqa:` |

## 9. Demo accounts, switchable from the internal admin (phase `demo:`)

**Goal.** Two demo accounts anyone can open from the login page with one click, so the redesigned
app and the `/org` admin can be explored without signing up; an internal admin toggle turns the
whole feature on/off (default **off** in production).

### 9.1 API (Spring)
- **`app_setting` table** (Liquibase `20261011010000_app_setting.xml`): `setting_key` varchar(100)
  PK · `setting_value` varchar(1000) · `updated_by` varchar(50) · `updated_date` timestamp. Entity
  `AppSetting`, repo, `AppSettingService` (`get(key, default)`, `set(key, value, by)`; cached).
  Seed row `demo.enabled = false`.
- **Demo accounts** are created at startup by `DemoAccountService.ensureAccounts()` (a
  `@PostConstruct`/`ApplicationRunner`), never via CSV: logins `demo` (first/last "Demo" /
  "Job seeker", email `demo@kiwiply.com`) and `demo-org` ("Demo" / "Organization",
  `demo-org@kiwiply.com`), `ROLE_USER`, activated, password from `dossier.demo.password`
  (`${DEMO_PASSWORD:kiwiply-demo}`), bcrypt at runtime. Idempotent (update the password hash if the
  config changed). `isDemo(login)` = login in that fixed set.
- **Public** `GET /api/public/demo` (permitAll): `{ enabled, accounts: [{login, label, description,
  landing}] }` — `demo` → label "Job seeker", landing `/dashboard`; `demo-org` → "Organization admin",
  landing `/org`. **No passwords in any response.**
- **`POST /api/authenticate/demo` `{login}`** (permitAll): when `demo.enabled` is true and `login`
  is a demo account, issue the normal access+refresh token pair exactly as `/api/authenticate`
  does (reuse its code path; `rememberMe=false`); otherwise 403 `DEMO_DISABLED` / 404.
- **Login guard:** in the password `/api/authenticate` path, a demo login while the flag is off →
  403 problem `DEMO_DISABLED` ("Demo accounts are currently disabled"). Google sign-in never maps
  to a demo account.
- **Read-only guard** `DemoGuard.assertNotDemo()` (403 problem `DEMO_READ_ONLY`, message "This is
  a demo account — changes aren't saved") on: `POST /api/account` (profile save), change-password,
  account deletion, account export, billing checkout/portal, inbox connect/disconnect, resume upload
  and delete, AI quota-consuming endpoints beyond the free allowance (reuse the Free plan gate —
  demo accounts are Free; do not grant Pro). Reads and the application board mutations (status
  changes, notes) stay allowed so the board feels live.
- **Admin** (`ROLE_ADMIN`): `GET /api/admin/settings/demo` → `{enabled, accounts, updatedBy,
  updatedDate}`; `PUT /api/admin/settings/demo {enabled}` → writes the setting and an audit entry
  via the existing admin audit mechanism (see `AdminAuditResource`/its service); `POST
  /api/admin/settings/demo/reset` → `DemoAccountService.resetData()`: wipes the two accounts'
  applications/resumes/profile/notifications/inbox rows and re-seeds the `demo` profile (bio payload
  with a complete fictional job seeker: Jordan Lee, Product Designer, Austin TX, skills, two jobs,
  one degree) plus 8 applications across SAVED/DRAFT/APPLIED/INTERVIEW/OFFER/REJECTED with
  realistic company/title/dates, and 2 resume rows WITHOUT files (label + parsed payload only;
  guard the file endpoints for missing blobs). `resetData()` also runs the first time the flag is
  turned on if the demo account has no applications.
- Tests: unit tests for `DemoGuard`, `DemoAccountService.ensureAccounts()` idempotency, the setting
  service; a `DemoAuthenticateIT` for `/api/authenticate/demo` (enabled/disabled) if Docker ITs run
  on this machine, otherwise a `@WebMvcTest`-style slice. `./gradlew test` green.

### 9.2 Web (Next)
- BFF routes: `GET /api/demo` (public proxy, `cache: no-store`), `POST /api/auth/demo {login}` (calls
  `/api/authenticate/demo`, sets the same cookies as `/api/auth/login` — reuse its cookie helper),
  `GET`/`PUT /api/admin/settings/demo`, `POST /api/admin/settings/demo/reset`.
- **Login page** (`AuthScreen`, login mode, below the social row): when `enabled`, a card "Just
  looking? Try the demo" with two buttons — "Explore as a job seeker →" (logs in as `demo`, goes
  to `/dashboard`) and "Explore as an organization admin →" (logs in as `demo-org`, goes to
  `/org`). Fetched server-side in `app/login/page.tsx` and passed as a prop; hidden when disabled
  or when the fetch fails. Also on `/signup` as a one-line link "or try the demo first".
- **In-app:** `AppShell` and `OrgShell` account menus show a "Demo" badge next to the name and a
  "Demo account — changes aren't saved" line; `/settings` hides Delete account / Billing actions
  for demo accounts and shows the same note. Detect via `account.login` in `["demo","demo-org"]`
  (the layout already fetches `/api/account`).
- **Admin:** `/admin/system` gets a "Demo accounts" card (first card on the page): a `Switch`
  "Demo accounts enabled" (client component, optimistic, toasts on success/failure), the two
  accounts listed with login · label · landing route, "Last changed by X on <date>", a
  "Reset demo data" ghost button with a confirm dialog, and a note "When off, demo logins are
  refused and the login page hides the demo buttons." Audit entries appear in `/admin/audit`.
- Docs: `DEPLOY.md` gets a short "Demo accounts" note (env `DEMO_PASSWORD`, flag lives in the
  DB, default off); `PROGRESS.md` Log line.

Worktree boot (every worktree agent): `git fetch origin && git merge --ff-only origin/version2`
(the worktree starts at an old commit), then link dependencies without installing:
`cmd /c mklink /J node_modules <main-checkout>\node_modules` at the worktree root AND
`cmd /c mklink /J web\node_modules <main-checkout>\web\node_modules` if that folder exists in the
main checkout; **remove both junctions (`cmd /c rmdir node_modules`) before finishing**. Run only
`npm test -w web` there (no `next dev`/`next build`; the main checkout holds port 3000).

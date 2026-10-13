# Organization Dashboard v2 (talent board)

> Branch `ent-dashboard` (cut from `ent-talent`). Board: `design/enterprise-talent/dashboard.png`. Built shots: `design/enterprise-talent/built/dashboard-{1440,768,390}.png`.
> Route `/w/admin` (sidebar "Dashboard"), endpoint `GET /api/orgs/{orgId}/dashboard` (X2.4), journey `web/e2e/journeys/tenant-dashboard-v2.spec.ts`.
> Formulas come from `talent-foundation.md` section 5; this page records what the code actually does.

## What changed against the X2.17 dashboard

Kept: the one-call-per-page contract (`widgets[]` with `state` ok / empty / unavailable / error, `data` only when ok), the provider registry
(`DashboardWidgetProvider`), per-widget permission gating (a caller without any of a provider's permissions gets the widget omitted), alert dismissal
for 7 days with Undo, honest `NOT_ENABLED` for a module that has no tables, per-card skeleton / empty / error, refresh on focus, one mascot per view.

Changed: the six placeholder providers (`NotYetBuiltProviders`) are now real providers under the **same keys and board positions**
(`TalentWidgets`); the consultants tile reads the consultant directory; Recent Activity merges application events; Alerts gained the talent conditions;
Quick Actions availability follows the sidebar's own test (page exists and module on); Team Performance has a range select; Activity & Alerts has
"View all"; the bee card is dismissible. `NotYetBuiltProvider` (the abstract base) stays for modules that still have no tables.

## Widgets, formulas, real vs empty

All counts are tenant-scoped (`org_id` first in every query) and use request time (UTC) as "now". "vs last month" = `now - 30 days`.
Percent = `(value - previous) / previous`, one decimal, **null (no chip) when previous is 0**.

| Key (order) | Tile / card | Value | Previous / delta | Sparkline | Empty when |
|---|---|---|---|---|---|
| `consultants.total` (10) | Total Consultants | ACTIVE `consultant_profile` rows (when the caller holds the permission at ORG scope; otherwise the seat-based count as before) | same count of profiles created on or before `now-30d` | six points, 30 days apart, last = value | no consultants (then seat-based fallback; empty `NO_CONSULTANTS` if none) |
| `employees.active` (20) | Active Employees | unchanged (ACTIVE non-consultant seats) | seat dates | eight weekly points | `NO_EMPLOYEES` |
| `applications.active` (30) | Open Applications | applications with stage != CLOSED | open applications replayed at `now-30d` from `created_at` and the CLOSED event time | six monthly replays | no application rows: `NO_APPLICATIONS` |
| `interviews.upcoming` (40) | Upcoming Interviews | SCHEDULED in `[now, now+7d)` | the 7 days before now (SCHEDULED + COMPLETED), compared to "last week" | eight weekly windows (SCHEDULED + COMPLETED), last = value | no interview in the window or the 8 weeks: `NO_INTERVIEWS` |
| `placements` (50) | Active Placements | `talent_placement.status = ACTIVE` | placements running on `today-30d` (start <= day, end null or > day) | six monthly replays | none ever: `NO_PLACEMENTS` |
| `finance.summary` (60) | Monthly Spend | sum of `org_spend_entry.amount_minor` of the current calendar month (minor units + `unit: money` + currency; the page prints `$328K`) | previous calendar month's sum | six calendar months | no entry for the current month: `NO_SPEND` |
| `team.performance` (70) | Team Performance | six calendar months: applications (`applied_on`), interviews (`scheduled_at`, SCHEDULED + COMPLETED), placements (`start_date`); the current month is partial | n/a | n/a | all three series zero: `NO_APPLICATIONS` |
| `pipeline.overview` (80) | Pipeline Overview | New = ASSIGNED, In Review = SUBMITTED + UNDER_REVIEW, Interview Scheduled = INTERVIEWING, Offered = OFFER, Hired = CLOSED with reason HIRED; total = sum of the five (other closed reasons are not in the donut) | n/a | n/a | no rows in those buckets: `NO_APPLICATIONS` |
| `quick.actions` (90) | Quick Actions | see below | | | `NO_ACTIONS` |
| `alerts` (100) | Activity & Alerts | see below | | | `NO_ALERTS` ("All clear") |
| `activity.recent` (120) | Recent Activity | newest 10 of: org audit rows (callers with `audit.view`, row filters honoured) and application events `CREATED / STAGE_CHANGE / NOTE` (callers with `pipeline.view`): who = the acting marketer else the consultant, what = a stage sentence ("submitted an application for Dana Cole"), subject = the job title | | | `NO_ACTIVITY` |

Permissions per widget (any one suffices; the whole endpoint also needs `dashboard.view_org`): applications and pipeline `member.view_summary` / `pipeline.view`;
interviews the same; placements `placements.view` / `member.view_summary`; finance `finance.view` / `billing.view`; team performance `reports.view` / `pipeline.view`;
activity `audit.view` / `pipeline.view`. An Executive Viewer therefore sees applications, interviews, pipeline and team performance but not spend.

### Quick Actions

Invite Employee `/w/admin/employees?invite=1`, Assign Marketer `/w/admin/assignments` (module marketing), Configure Licenses `/w/admin/licenses` (module billing),
Review Applications `/w/admin/applications`, then View Pipeline (no page: always "Soon") and Configure Organization `/w/admin/settings`. Each is shown only with its permission.
A shortcut is a link only when its page is on the Admin menu and its module is on for the organization (the same test the sidebar applies), otherwise a "Soon" chip, never a dead link.
The board shows four; the rest sit behind "Show more".

### Alerts (each dismissible for 7 days, per member, Undo toast)

Kept: ORG_PAST_DUE, DOMAIN_FAILING, DOMAIN_SUSPENDED, INVITES_EXPIRING, MEMBERS_SUSPENDED, SINGLE_ADMIN, BRANDING_DRAFT.
New (real rows, each needs its permission at ORG scope): APPLICATIONS_OVERDUE (next action past due, not closed), LICENSES_ATTENTION (EXPIRING / NEEDS_REVIEW consultant licences),
MARKETERS_OVERLOADED (workload >= 90 % of capacity), APPLICATIONS_NEW (created in the last 7 days, with the newest time), INTERVIEWS_WEEK (SCHEDULED in the next 7 days, across n clients),
PLACEMENT_NEW (started in the last 7 days), RESUMES_PENDING, CONSULTANTS_UNASSIGNED. The board's "License usage at 85 %" is **not shown**: there is no license-seat usage data yet,
so no alert pretends to know it. The card shows four, "View all" reveals the rest.

## Web

`web/src/components/ent/dashboard/DashboardPage.tsx` + `parts.tsx`, client logic `web/src/lib/ent/dashboard.ts`. Charts are the shared `@kiwiply/ui` `Sparkline`, `BarChart`
(visually-hidden data table as the text alternative) and `DonutChart` (aria-label lists the slices); series colours are `--brand-*` / status variables, never hex (a test asserts no hex literal).
Tiles are two across at 390 px, charts stack below `lg`. Money tiles format compactly from minor units. A negative delta draws the sparkline in the danger colour. The help card
(`Need help, Sarah?`, enterprise bee, "Ask a question...") has an X; the choice is remembered per organization in `localStorage` (a convenience, wrapped in try/catch) and the shell's own
sidebar help card returns when it is dismissed (the card holds the shell claims). The range select offers Last 3 / Last 6 Months (the API sends six months).

## Tests

- API unit: `DashboardWidgetRegistryTest` (providers, order, permissions registered), `OrgDashboardServiceTest`, `StatTilesTest`.
- API IT: `TalentDashboardIT` (seeded Acme and Beta): every tile equals an independent repository count, deltas and sparklines from rows, rising history, pipeline mapping,
  Beta differs from Acme, a nonexistent org gets empty widgets, alert counts (3 overloaded / 12 unassigned for Acme; 2 / 4 for Beta), the merged feed, role-without-permission omission.
  `OrgIsolationIT` already registers `GET /api/orgs/{orgId}/dashboard` and the dismiss route (no new routes).
- Web: `DashboardPage.test.tsx`, `DashboardTalent.test.tsx`, `dashboard.test.ts`, `dashboard-talent.test.ts` (vitest).
- Journey: `web/e2e/journeys/tenant-dashboard-v2.spec.ts` on the real stack (tiles equal the API, range select, quick action navigates, help card dismissal, alerts, 390 px, Beta vs Acme).

## Gaps and decisions

- Scope: the dashboard gate (`dashboard.view_org`, ORG) means every caller sees organization-wide numbers; the talent widgets are **not** narrowed by TEAM / ASSIGNED scope. A member who holds a widget's permission only
  at a narrower scope still sees org-wide figures there. If that is not wanted, tighten the widget permissions (admin-config) rather than filtering in code.
- Quick action routes: Assign Marketer points at the Admin menu's `assignments` entry (`/w/admin/assignments`); `talent-foundation.md` calls the route key `marketing-assignments`. If the Assignments page lands under the other key, change the one `href` in `QuickActionsProvider`.
- The mock API (`web/scripts/mock-dashboard.mjs`) still answers these six widgets as `unavailable / NOT_ENABLED` (it has no talent data); real-stack runs show the full picture.
- Spend, license usage and the "Last 6 months" range beyond six months have no history (spend is seed-only, record-only; nothing moves money).
- No photos: the avatars are initials. No PII beyond names the org already holds (consultant and marketer display names, job titles).
- Alert dismissal keys: eight new keys were added to `DashboardAlertService.KEYS`; the dismiss route accepts them.

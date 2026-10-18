# 14 — Organization administration: the Org Admin Dashboard (landing), quick actions, organization profile and settings

> Status: design (Session B), 2026-10-12. Implements requirements §7 (Org Admin lands on the
> dashboard; profile is not a dashboard), ADR-007. Reworks branch A's `18f2123`
> (`OrgOverviewService`, `ActivationChecklist`) — kept as prior art, re-verified, never trusted.
> Build-ready for X2.4, X2.9. Every widget maps to a **real** data source or an honest empty /
> unavailable state; nothing shows a number that is not real (00 §5 principle 5).

## 1. Landing rule
After authentication on a tenant host the shell routes to `landing` from `GET /api/me/tenant`
(12 §3): for a member whose primary role is `OWNER`/`ORG_ADMIN` that is `/w/admin` — **this page**.
There is no generic "employee home" in between, and `/me` is never a landing.

## 2. The Org Admin Dashboard (`/w/admin`, X2.4)

### 2.1 Layout
```
1440                                                                 390
┌──────────────────────────────────────────────────────────────┐    ┌──────────────────────────┐
│ Hero band: "Good morning, Priya" · Acme Talent · {date}      │    │ Good morning, Priya  (m) │
│ mascot greet (first visit of the day, dismissable)   [Invite]│    │ Acme Talent · Tue 12 Oct │
├──────────────────────────────────────────────────────────────┤    ├──────────────────────────┤
│ ▲ Alerts (0–3 rows; hidden when none)                        │    │ ▲ 1 alert  ▸             │
├──────────────────────────────────────────────────────────────┤    ├──────────────────────────┤
│ Stat tiles (2 rows × 4, AdminStatTiles with computed deltas) │    │ ┌─────────┐┌─────────┐   │
│ Consultants · Licensed · Available · Marketing activity      │    │ │ 42      ││ 31      │   │
│ Active applications · Interviews · Placements · Pending      │    │ │consult. ││licensed │   │
├────────────────────────────────┬─────────────────────────────┤    │ └─────────┘└─────────┘   │
│ Activation checklist (until    │ Quick actions (6 tiles)     │    │ … (2 per row, 8 tiles)   │
│ complete) / Pipeline this week │                             │    ├──────────────────────────┤
├────────────────────────────────┼─────────────────────────────┤    │ Checklist 4/7  ▸         │
│ Recent activity (audit tail,   │ Subscription summary ·      │    │ Quick actions (2×3)      │
│ 10 rows, "View audit log")     │ Financial summary (perm.)   │    │ Recent activity (5)      │
├────────────────────────────────┴─────────────────────────────┤    │ Subscription             │
│ Team performance (Phase 12; "unavailable" card until then)   │    │ Team performance (soon)  │
└──────────────────────────────────────────────────────────────┘    └──────────────────────────┘
```
Natural page scroll (not one viewport); sidebar independent (16 §2). Tiles use real deltas only
(`previous` from the same endpoint for the prior 30 days) or no delta.

### 2.2 Widget registry (`web/src/components/ent/dashboard/widgets.ts` + API `OrgDashboardService`)
`GET /api/orgs/{orgId}/dashboard` (`dashboard.view_org` **or** `OWNER`/`ORG_ADMIN` — the system
templates carry `dashboard.view_org` for both, 05 §3 is amended by X2.4) returns
`{ widgets: { [key]: { state: "ok"|"empty"|"unavailable", reason?, data } }, generatedAt }`.
A widget is **unavailable** when its module flag is off for the org or the caller lacks its
permission (then it is omitted entirely, not greyed); **empty** when the source exists but has no
rows (honest empty card); **ok** otherwise.

| Key | §7 widget | Data source (real) | Permission | Module / phase | Empty / unavailable copy |
|---|---|---|---|---|---|
| `consultants.total` | Total consultants | count `org_member` ACTIVE ⨝ `org_member_role` role template `CONSULTANT` (X1.6) | `member.view_summary` | Phase 2 | "No consultants yet" → [Invite consultants] |
| `employees.active` | Active employees (board tile; added by X2.4) | count `org_member` ACTIVE that do not hold the CONSULTANT role, with the 30-day change from seat start/end dates | `hr.view` or `members.invite` | Phase 2 | "No employees yet" |
| `consultants.licensed` | Licensed consultants | count `consultant_license` ACTIVE (C, X5.4) | `licenses.view` | `flag.enterprise.billing` → Phase 5/6 | unavailable until the module; then "No licenses assigned" → [Assign licenses] |
| `consultants.available` | Available consultants | `consultant_profile.availability_status = AVAILABLE` (D, X7.2) | `consultants.view` | `flag.enterprise.marketing` → Phase 7 | unavailable until the module |
| `marketing.activity7d` | Marketing activity | count `pipeline_event` last 7 d by kind (D, X8.6) + sparkline per day | `pipeline.view` | marketing → Phase 8 | unavailable until the module |
| `applications.active` | Active applications | consented application counts: today from `OrgOverviewRepository` (18f2123, `data_share` SUMMARY+, statuses APPLIED/IN_REVIEW/INTERVIEW); Phase 9 adds `pipeline_application_link` | `member.view_summary` | Phase 2 (consent-based) | "Nobody is sharing application progress yet" (explains consent; no nag) |
| `interviews.upcoming` | Interviews | consented `interview` rows in the next 14 d (18f2123 `upcomingInterviews`); Phase 9 adds `interview_slot` | `member.view_summary` | Phase 2 | "No interviews scheduled" |
| `placements` | Placements | today: members who declared a placement (consent doc §6, 18f2123 `placedMembers`); Phase 10: `placement` ACTIVE count | `placements.view` or `member.view_summary` | Phase 2 → 10 | "No placements recorded" |
| `approvals.pending` | Pending approvals | Phase 8 authorization requests awaiting a manager (`opportunity_match.authorization = PENDING` where the caller may decide); **until then** the tile is `invites.pending` = `org_member` INVITED count (labelled "Pending invites") | `approvals.decide` / `members.invite` | Phase 2 (invites) → 8 (approvals) | "Nothing waiting on you" |
| `invites.pending` | Pending invites (and suspended members) | `org_member` INVITED count, how many expire within 48 h, and SUSPENDED count; `approvals.pending` replaces it in Phase 8 | `members.invite` or `members.suspend` | Phase 2 | "Nothing waiting on you" |
| `pipeline.overview` | Pipeline overview donut (board; added by X2.4) | Applications module by stage (New, In Review, Interview Scheduled, Offered, Hired); `NOT_ENABLED` until it exists | `pipeline.view` or `member.view_summary` | Applications module | unavailable until the module |
| `quick.actions` | Quick actions (board; added by X2.4) | the six shortcuts of §2.5 filtered by the caller's permissions; `available=false` = "soon" | any permission of a shortcut | Phase 2 | hidden when the caller holds none |
| `team.performance` | Team performance | Phase 12 org analytics with k-anonymity (`docs/design/org/analytics.md`) | `reports.view` | Phase 12 | unavailable card: "Team performance arrives with analytics" (mascot encourage, no numbers) |
| `subscription.summary` | Subscription summary | today: `organization.status`, `setup_fee_paid_at`, billing email; Phase 6: `org_billing_account` + `org_subscription` mirror (MRR, next invoice, licensed count, pending changes) | `billing.view` | Phase 2 → 6 | "Billing isn't connected in this environment" (dev) / status only |
| `finance.summary` | Financial summary | Phase 11 finance records (H6 money mirrors: billed/paid this month) | `finance.view` | `flag.enterprise.hr_finance` → 11 | unavailable until the module |
| `activity.recent` | Recent activity | `org_audit_event` last 10 (actor, action label, target, relative time; no PII beyond names the caller may see) | `audit.view` or admin templates | Phase 2 | "No activity yet" |
| `alerts` | Important alerts | computed, see §2.3 | per alert | Phase 2 | hidden when none |
| `checklist` | Activation checklist | `GET /api/orgs/{orgId}/onboarding` (18f2123 reworked, §2.4) | admin templates | Phase 2 | hides when complete; the slot shows "Pipeline this week" (Phase 8) or nothing |

**As built (X2.4).** The response is an ordered array, not a map: `{ orgId, generatedAt, widgets: [ { key, state: "ok"|"empty"|"unavailable"|"error", reason?, module?, data? } ] }` in board order. A widget the caller has no permission for is absent. `unavailable` with `reason: "NOT_ENABLED"` and the `module` name means its module is off or has no tables yet: no data, no zeros (applications, interviews, placements, spend, team performance and the pipeline donut are all in this state today). `error` (`reason: "PROVIDER_FAILED"`) isolates one failing provider. `data` is present only for `ok`. Scope: a team/department/assigned actor's counts cover only their slice. No server-side cache.

**Registry shape (09 row 3).** X2.4 ships the bean interface
`DashboardWidgetProvider { String key(); String permission(); String module(); WidgetResult compute(long orgId, Membership m); }`
plus the Phase-2 providers (`consultants.total`, `applications.active`, `interviews.upcoming`, `invites.pending`,
`activity.recent`, `alerts`, `checklist`). Every later widget is **one bean in its owning story**, never a
change to `OrgDashboardService`: `consultants.licensed` + `subscription.summary` (X6.1),
`consultants.available` (X7.2), `marketing.activity7d` (X8.6), `approvals.pending` (X8.5),
`placements` (X10.4), `finance.summary` (X11.5), `team.performance` (X12.1). A missing bean renders the
widget `unavailable`. `DashboardWidgetRegistryTest` diffs the registered keys against this table's key column.

### 2.3 Alerts (computed server-side, each with a deep link and a dismiss-for-7-days per member)
| Alert key | Condition | Severity | Link |
|---|---|---|---|
| `ORG_PAST_DUE` | `organization.status = PAST_DUE` | danger | `/w/admin/billing` |
| `DOMAIN_FAILING` | any ACTIVE hostname with `failing_since` set, or `cert_state = FAILED` | warn | `/w/admin/domains` |
| `DOMAIN_SUSPENDED` | any SUSPENDED hostname | warn | `/w/admin/domains` |
| `INVITES_EXPIRING` | INVITED seats expiring within 48 h | info | `/w/admin/employees?status=invited` |
| `SINGLE_ADMIN` | only one member holds OWNER/ORG_ADMIN | info | `/w/admin/employees` ("Add a second administrator") |
| `BRANDING_DRAFT` | `org_branding.draft_json` differs from published for > 24 h | info | `/w/admin/branding` |
| `MEMBERS_SUSPENDED` | any member with status SUSPENDED (added by X2.4) | info | `/w/admin/employees?status=suspended` |
| `CONSENT_GAPS` | consultants with `data_share.scope = NONE` ≥ 1 (count only) | info | `/w/admin/consultants?consent=none` (Phase 7) |
| `LICENSE_CHANGES_PENDING` | `license_change` PENDING effective within 7 d (Phase 6) | info | `/w/admin/licenses` |

### 2.4 Activation checklist (rework of `OrgOnboardingService`)
Rows (computed, each `{key, done, count, total, href, available, optional}`): `activate` (setup fee
paid or dev-activated) · `branding` (published at least once) · `admins` (≥ 2 admins; optional) ·
`invite` (≥ 1 ACTIVE non-admin member; shows joined/invited) · `roles` (admin opened Roles &
Permissions once — `org_setting` `org.ui.roles_reviewed_at`; optional) · `teams` (≥ 1 department or
team; optional) · `domain` (any CUSTOM hostname ACTIVE; optional) · `licenses` (≥ 1 ACTIVE license;
only when the billing module is on). `available=false` rows render "soon", never a dead link.
Complete → the card hides; a one-time mascot `celebrate` + "Your workspace is set up" toast.

### 2.5 Quick actions (`QuickActionTiles`, 6; each shown only when permitted)
| Tile | Permission | Target |
|---|---|---|
| Invite employee | `members.invite` | opens the invite sheet on `/w/admin/employees` (`?invite=1`) |
| Assign marketer | `assignments.manage` (+ marketing module; "soon" chip until X4.7) | `/w/admin/assignments` |
| Manage licenses | `licenses.manage` (billing module; "soon" until X6.2) | `/w/admin/licenses` |
| Review applications | `member.view_summary` | `/w/admin/applications` |
| View pipeline | `pipeline.view` (marketing module) | `/w/admin/pipeline` |
| Configure organization | `org.settings.manage` | `/w/admin/settings` |

### 2.6 States
Loading: `TileSkeleton` × 8 + `ListSkeleton`. Error: `ErrorState` per widget (the page never
blanks because one source failed — the endpoint returns per-widget `state: "error"` with a safe
message). Empty: per table above. Reduced motion: no number animation (`AnimatedNumber` respects it).

## 3. Organization profile vs basic profile (requirements §7)
The organization profile is the org's record; it never shows on `/me`. Reachable only as the
ADMIN workspace nav item **Settings** (`/w/admin/settings`) and from the quick action.

## 4. Organization Settings (`/w/admin/settings`, X2.9)
Sections (anchors; autosave per field; HIGH changes via ReasonSheet):

| Section | Fields | Endpoint | Permission | Notes |
|---|---|---|---|---|
| Identity | legal name (`organization.name`), display name, website, organization type (read-only after activation; change = support), size band, country, timezone | `PATCH /api/orgs/{orgId}` (exists; extend with `displayName`) | `org.settings.manage` | PII scan on names |
| Contact & addresses | billing email (`billing_email`), support email (`org_setting org.contact.support_email`), addresses (`org_setting org.addresses` — JSON list of `{label, lines[], city, region, postal, country}`; business addresses are allowed, they are not personal data) | `PATCH /api/orgs/{orgId}` + `PUT /api/orgs/{orgId}/settings/{key}` (new `OrgSettingsResource`, allow-listed keys from `SettingDefinitions` marked `orgOverridable`) | `org.settings.manage` | billing email change audited (risk MEDIUM) |
| Branding | link card → `/w/admin/branding` (X2.5) | — | `branding.manage` | not inline: it has its own page with preview |
| Domains | subdomain (read-only, "Ask Kiwiply to change"), custom domains summary + link → `/w/admin/domains` (X3.1) | — | `domains.manage` | |
| Policies | `org.invite.require_email_match` (default true), `org.consent.request_cooldown_days` (7), `org.security.mfa_required` (false; HIGH → ReasonSheet), `org.domains.redirect_non_primary` (true), `org.domains.subdomain_mode`, `org.attention.inactive_days` (30), `org.dashboard.greeting` (true) | `OrgSettingsResource` | `org.settings.manage` | every row shows the platform default and "Reset to default"; history per key (`HistoryDrawer` over `org_setting` audit) |
| Team configuration | link cards → Departments & Teams, Roles & Permissions | — | respective permissions | |
| Integrations | link → `/w/admin/integrations` (Phase 12, "soon") | — | `integrations.manage` | |
| Subscription | link → `/w/admin/subscription` (Phase 6) ; today: status, setup fee date, dev-activate button in dev (branch A `OrgActivationService`) | — | `billing.view` | |
| Danger zone | transfer ownership (OWNER; `ConfirmTypedSheet`), close organization (OWNER; typed + reason; existing `POST /close`) | existing | `org.transfer_ownership`, `org.close` | closing keeps records (soft) |

### 4.1 `OrgSettingsResource` (new, X2.9)
- `GET /api/orgs/{orgId}/settings` → `[ {key, value, default, source: ORG|GLOBAL|CODE, type, risk, updatedAt, updatedBy} ]`
  for keys flagged `orgOverridable` in `SettingDefinitions` (`EnterpriseSettingKeys.ORG_OVERRIDABLE`).
- `PUT /api/orgs/{orgId}/settings/{key}` `{value, reason?}` → validates type/range from the
  definition; HIGH risk requires `reason` (10–500 chars); writes `org_setting` and
  `org_audit_event ORG_SETTING {key, from, to}`; bumps `config_version` for keys that affect the
  public DTO (`mfa_required`, domain redirect keys).
- `DELETE …/{key}` resets to the global/code default (audited).
- Resolution helper `OrgSettings.get(orgId, key)` = org override → global registry → code default,
  cached per request.

## 5. Permissions summary (05 §3 amendments by this doc)
Add `dashboard.view_org` to `OWNER` and `ORG_ADMIN` (ORG) so the dashboard permission is explicit
(EXECUTIVE_VIEWER already has it, with counts-only projections). `org.settings.manage` covers
Settings; `branding.manage`, `domains.manage` their pages.

## 6. Tests
`OrgDashboardResourceIT` (per-widget permission omission, module gating, consent-scoped counts
unchanged from 18f2123's `OrgDashboardIT`, alerts table), `OrgOnboardingServiceTest` (rows),
`OrgSettingsResourceIT` (allow-list, HIGH reason, reset, audit, config_version), `OrgIsolationIT`
coverage entries, web `dashboard.test.tsx` (widget states), Playwright `org-admin-home.spec.ts`
(E2E-A "lands directly on the Org Admin Dashboard", 390/1440, quick actions by permission).

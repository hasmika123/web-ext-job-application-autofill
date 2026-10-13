# 15 — Employees and teams UX: lifecycle, bulk actions, departments, teams, managers

> Status: design (Session B), 2026-10-12. UX for requirements §9 over the API semantics in
> `05-permission-model.md` (roles, scopes, ceiling) and the Phase 1 invitation framework (X1.8).
> Consultant–marketer **assignments** are Session D's (X4.7/X4.8, ADR-008); this doc only links to
> them. HR employment records (`employment_record`) are Phase 11 (D) — this doc is the *seat*
> lifecycle (`org_member.status`), which HR's lifecycle sits on top of. Build-ready for X4.3–X4.6.

## 1. Vocabulary (one word each, used in copy and code)
| Word | Means | Table |
|---|---|---|
| Employee | any member of the org with a seat (`org_member`), whatever the roles | `org_member` |
| Consultant | an employee holding the CONSULTANT role (may also hold others) | `org_member_role` |
| Department | `org_group kind=DEPARTMENT` (top level) | `org_group` |
| Team | `org_group kind=TEAM`, optionally under a department (`parent_group_id`) | `org_group` |
| Lead | `org_group.lead_member_id` (one per group; counts as a member of it for TEAM scope) | |
| Manager | `org_member.manager_member_id` (reporting line; drives approvals and the MANAGER assignment kind) | |

## 2. The seat lifecycle (requirements §9 → `org_member.status`)

```
 invite ──► INVITED ──accept──► ACTIVE ◄──reinstate── SUSPENDED
              │ expire/revoke      │ suspend  ───────────▲
              ▼                    │
           REMOVED (invite revoked)│ deactivate (offboard) ──► REMOVED      self: leave ──► LEFT
                                   └──────────────────────────────────────────────────────────────► ERASED (account erasure only)
```
| Action (§9) | From → To | Who (permission) | Guards | Records | Audit |
|---|---|---|---|---|---|
| Invite | — → INVITED | `members.invite` (roles within ceiling) | seat limits (`OrgLimitsIT` pattern), email match setting | nothing else | `MEMBER_INVITE` |
| Accept invitation | INVITED → ACTIVE | the invitee | email match (E7) | roles, groups, manager from the invite | `MEMBER_JOINED` |
| Assign roles | — | `members.role.set` + ceiling | last-admin guard; `is_primary` exactly one | `org_member_role` rows | `ROLE_ASSIGN/REVOKE` (HIGH when admin roles) |
| Assign department / team | — | `members.group.set` (new key; ORG_ADMIN, HR_SPECIALIST) | team must belong to the chosen department if both set | `department_group_id`, `team_group_id` | `MEMBER_GROUP` |
| Set manager | — | `members.manager.set` (new key; ORG_ADMIN, HR_SPECIALIST, MARKETING_MANAGER at TEAM) | no cycles (walk up ≤ 20); manager must be ACTIVE | `manager_member_id` | `MEMBER_MANAGER` |
| Activate | INVITED → ACTIVE **by acceptance only** | — | an admin cannot "activate" someone who has not accepted; the UI offers **Resend** instead | | |
| Suspend | ACTIVE → SUSPENDED | `members.suspend` | not self; not the last OWNER/ORG_ADMIN | seat kept; sessions with this user's `tid` revoked; licenses untouched (C decides suspension effects in X5.4) | `MEMBER_SUSPEND` (reason) |
| Reinstate | SUSPENDED → ACTIVE | `members.suspend` | — | — | `MEMBER_REINSTATE` |
| Deactivate / Offboard | ACTIVE/SUSPENDED → REMOVED | `members.remove` | not the last OWNER (transfer first); OWNER → `409 OWNER_MUST_TRANSFER` | **records kept**: audit rows, assignments ended (`ends_at`, D), `org_resume` links removed (ADR-009, audited), consent ended, licenses ended at period end (C), overlay deleted; the member's personal data untouched | `MEMBER_REMOVE` (reason) + the offboarding summary |
| Reinstate after removal | REMOVED → (new INVITED) | `members.invite` | a removed person is **re-invited** (new seat row); history stays on the old row | | `MEMBER_INVITE` |
| Leave | ACTIVE → LEFT | the member (`self.leave`) | OWNER cannot | as Deactivate | `MEMBER_LEFT` |
| Transfer ownership | — | `org.transfer_ownership` (OWNER) | target ACTIVE admin; `ConfirmTypedSheet` | OWNER role moves | `OWNER_TRANSFER` (HIGH) |

"Deactivate" and "Offboard" are the same transition; the UI calls it **Offboard** and runs the
wizard (§5). HR's `employment_record` (Phase 11) adds ONBOARDING/LEAVE/OFFBOARDING states for the
*employment*, never for the seat.

## 3. Employees page (`/w/admin/employees`, also `/w/hr/employees` — same component, X4.3)

### 3.1 Layout
```
1440                                                                        390
┌──────────────────────────────────────────────────────────────────────┐   ┌──────────────────────────┐
│ Employees                                       [Invite ▾] [⋯ Export]│   │ Employees      [Invite]  │
│ 42 active · 3 invited · 1 suspended                                  │   │ 42 active · 3 invited    │
│ [🔍 Search name or email] [Status ▾] [Role ▾] [Department ▾] [Team ▾]│   │ [🔍 Search            ] │
│ [Manager ▾] [License ▾ (Phase 6)]                      Clear filters │   │ [Filters (2)]  sort ▾    │
│ ┌──┬────────────────┬───────────────┬──────────┬────────┬─────────┐  │   │ ┌──────────────────────┐ │
│ │☐ │ Name           │ Roles         │ Dept/Team│ Manager│ Status  │  │   │ │ (PS) Priya Sharma    │ │
│ │☐ │(PS) Priya S.   │ Mkt Specialist│ Bench/NY │ R. Iyer│ ● Active│  │   │ │ Mkt Specialist · NY  │ │
│ │☐ │(AK) Anika K.   │ Consultant    │ Delivery │ —      │ ● Active│  │   │ │ ● Active   R. Iyer   │ │
│ │☐ │(JL) Jon L.     │ HR Specialist │ People   │ —      │ ◐ Invited│ │   │ └──────────────────────┘ │
│ └──┴────────────────┴───────────────┴──────────┴────────┴─────────┘  │   │ … cards …                │
│ 1–25 of 46            ‹ 1 2 ›                                        │   │ Load more                │
└──────────────────────────────────────────────────────────────────────┘   └──────────────────────────┘
  selection bar (sticky bottom when ≥1 selected): "3 selected · [Assign roles] [Move to team] [Set manager] [Suspend] [Resend invite] [Clear]"
```
- `AdminFilterBar` + `AdminTable` (promoted to `packages/ui` as `FilterBar`/`DataTable` in X2.2;
  cards + details `BottomSheet` below `md`). URL-synced, server-driven
  (`GET /api/orgs/{orgId}/members?q&status&roleId&departmentId&teamId&managerId&licenseStatus&sort&page&size`).
- Columns: Name (`PersonCell`: avatar/initials, name, work email muted), Roles (chips; `+2`),
  Department / Team, Manager, Status (`StatusDot`), Last active (relative, from
  `org_member.last_active_at`, updated at most hourly by the interceptor), License (Phase 6 chip).
- Row click → the employee sheet (§4). Row kebab: Edit roles · Move · Set manager · Resend invite
  (INVITED) · Suspend / Reinstate · Offboard · View activity.
- Search matches display name / invite name / email (prefix + contains; server `LIKE` on the
  indexed lower-case columns). Sort: name, joined, last active, status.
- **Invite ▾**: "By email" (sheet: emails textarea, roles multi-select within ceiling, department,
  team, manager, note; preview of what they get) · "From CSV" (branch B import, `email, name,
  roles, department, team, manager_email`; ≤ 2 000 rows; validation table before sending) ·
  "Join link / QR" (CONSULTANT/MEMBER only, existing). Sending shows one toast "12 invitations
  sent" with [Undo] (revokes within 10 s before the mail job picks them up — mail is queued 15 s
  precisely to allow this).
- **Export** (`reports.export`): CSV of the visible filter (name, email, roles, department, team,
  manager, status, joined) — audited `EXPORT`; no phone, no consent-scoped data.

### 3.2 Bulk actions (selection ≤ 500; each runs as one API call per action with per-row results)
| Action | Endpoint | Rules | Feedback |
|---|---|---|---|
| Assign roles | `POST /api/orgs/{orgId}/members/bulk/roles {memberIds[], add[], remove[], primaryRoleId?}` | ceiling per role; last-admin guard evaluated after the whole batch; INVITED rows allowed | sheet with the role grid; result toast "Roles updated for 11 · 1 skipped (would remove the last admin)" + [Undo] (reverse batch) |
| Move to department / team | `…/bulk/groups {memberIds[], departmentGroupId?, teamGroupId?}` | team ⊂ department | undo |
| Set manager | `…/bulk/manager {memberIds[], managerMemberId}` | no cycles | undo |
| Suspend / Reinstate | `…/bulk/status {memberIds[], action: SUSPEND\|REINSTATE, reason}` | ReasonSheet (HIGH); self and last admin skipped with reasons | undo for reinstate; suspend undo = reinstate |
| Resend invites | `…/bulk/resend {memberIds[]}` | INVITED only; 3/week cap per invite (branch B) | toast |
| Offboard | not bulk (wizard per person) | — | — |
Every bulk call returns `{ok: n, skipped: [{memberId, reason}]}` and writes one audit row per
member plus one `MEMBER_BULK` summary row (`details = {action, count}`).

## 4. Employee detail sheet (`SideSheet` ≥ `md`, full-screen `BottomSheet` on phone; X4.6)
Tabs: **Overview** · **Roles** · **Groups & manager** · **Access** · **Activity**.
- Overview: avatar, name, work email, org title (editable, org-set), status + since, joined, last
  active, invite details (INVITED: sent, resends, expires, [Resend] [Revoke]), primary role,
  consultant chips when CONSULTANT (availability/marketing status — D's overlay, read-only here).
- Roles: checklist of org roles with the **ceiling** applied (roles the caller cannot grant are
  disabled with "You can't grant more than you hold"); primary role radio; autosave per toggle with
  undo; HIGH roles (OWNER/ORG_ADMIN) ask a reason. Shows the effective permission summary
  ("Can: invite, manage teams…", collapsible).
- Groups & manager: department select → team select (filtered), manager picker (search ACTIVE
  members; shows their title), autosave + undo.
- Access: consent scope the person chose (`data_share.scope`, read-only + "Ask to share" with the
  7-day cooldown), named marketer for FULL, licenses (Phase 6, read-only link), sessions count
  (no details), "Sign out of this workspace" (`members.suspend` not needed: it only revokes `tid`
  sessions for this org — new endpoint `POST …/members/{id}/sessions/revoke`, audited).
- Activity: `org_audit_event` where `target_type=MEMBER and target_id=…` or `actor = member`
  (toggle "Actions on them / by them"), `HistoryDrawer` list, filter by action family.
- Footer actions: Suspend / Reinstate · Offboard… · (INVITED) Revoke invitation.

## 5. Offboarding wizard (`Dialog` ≥ `md`, 3 steps; X4.4)
1. **Review** — what will happen (read-only list computed by `GET …/members/{id}/offboard-preview`):
   roles ended · consultants assigned to them (D: N assignments will need a new marketer →
   inline reassign picker, required if any PRIMARY) · their consent/links ended · licenses (C:
   "ends at period end, no refund" wording from the locked rule) · sessions signed out · records kept.
2. **Reason** — ReasonSheet-style text (10–500) + optional "last day" date (defaults today; a
   future date schedules the removal via a `member_offboarding` job row — additive table
   `org_member_offboarding(org_id, member_id, effective_at, reason, created_by, status)`).
3. **Confirm** — `ConfirmTypedSheet` with the person's name. Result: toast "Priya was offboarded"
   (no undo: the audited path is re-invite).
OWNER: step 1 shows "Transfer ownership first" and links the transfer flow.

## 6. Departments & Teams (`/w/admin/teams`, also HR; X4.5)
```
1440                                                              390
┌───────────────────────────────┬──────────────────────────────┐  ┌──────────────────────────┐
│ Departments & Teams  [+ New ▾]│ Delivery (department)        │  │ Departments & Teams  [+] │
│ ▾ Delivery · 18 · lead R. Iyer│ Lead  [R. Iyer        ▾]✓    │  │ ▾ Delivery (18)          │
│    ├ Bench NY · 7 · lead P.S. │ Members 18 · Teams 3         │  │    Bench NY (7)          │
│    ├ Bench TX · 6             │ ┌ Members ───────────────┐   │  │    Bench TX (6)          │
│    └ Mobile · 5               │ │ (AK) Anika K.  Bench NY│   │  │    Mobile (5)            │
│ ▾ People · 4 · lead J. Lee    │ │ (SR) Sam R.    —  [Move]│  │  │ ▸ People (4)             │
│    └ (no teams)               │ └────────────────────────┘   │  │ ▸ Sales (3)              │
│ ▸ Sales · 3                   │ [Rename] [Move under…] [Delete]│ │ tap a row → sheet        │
└───────────────────────────────┴──────────────────────────────┘  └──────────────────────────┘
```
- Tree: departments (expandable) → teams; counts are live member counts (`org_member` ACTIVE by
  `department_group_id`/`team_group_id`). Teams without a department sit under "Unassigned teams".
- Create (name ≤ 80, kind, parent for teams, lead optional) — inline row, autosave on blur; rename
  inline; **Move under** (team → another department, with the members' `department_group_id`
  following automatically; undo); **Delete** only when empty (`409 GROUP_NOT_EMPTY` → "Move 7
  members first" with a bulk-move shortcut); leads must be ACTIVE members (any role).
- Drag-and-drop of teams between departments on desktop (`SortableList`/`DragHandle`), with the
  same undo; buttons on phone.
- Members panel per group: list with [Move] (single) and "Select → Move to…" (bulk, §3.2).
- Cohorts (`COHORT`, schools) are listed in a separate collapsed section and untouched.
- API: `GET/POST /api/orgs/{orgId}/groups` (exists; add `parentGroupId`, `leadMemberId`,
  `memberCount`, `teams[]` on departments), `PATCH …/groups/{id}` (rename, parent, lead),
  `DELETE …/groups/{id}` (empty only), `POST …/groups/{id}/members {memberIds[]}` (bulk move
  shortcut). Permission `groups.manage` (exists) — `departments.manage`/`teams.manage` (05 §3)
  are aliases resolved to it by `EntPermissions` so HR templates work without a second key.

## 7. Managers and scope
- `manager_member_id` feeds `ScopeEvaluator` for the MANAGER assignment kind and approvals
  (05 §4); the Employees page "Manager" filter and the sheet's picker are the only UI that sets it
  (plus invites and CSV).
- An org chart view is **not** built now (Phase 12 reports); the HR workspace shows "Reports to"
  on the employee sheet and a "Direct reports (n)" link that filters the Employees page.

## 8. Notifications (X2.10 kinds used here)
`ORG_INVITE_ACCEPTED` (admins, batched daily "3 people joined"), `ORG_ROLE_CHANGED` (to the
member: "Your roles in Acme changed: + Marketing Manager"), `ORG_SUSPENDED_ME` (to the member,
email too), `ORG_OFFBOARDED_ME` (email), `ORG_MANAGER_CHANGED` (to the member). Never to third
parties; org admins are not notified of routine edits (audit covers it).

## 9. Empty states and copy
- No employees besides the admin: `EmptyState mascot` "It's just you so far" → [Invite employees]
  (+ "Import a CSV").
- Filters with no match: inline "Nobody matches these filters" → [Clear filters].
- No departments: "Group people into departments and teams to delegate work" → [New department].
- Not allowed (404 from BFF): "This isn't part of your role" (shell-level, 16 §2.5).

## 10. Tests
`OrgMemberBulkResourceIT` (each bulk action: ceiling, last-admin, skip reasons, audit rows,
undo reverse), `OrgOffboardingServiceTest` (preview, scheduled removal, OWNER guard, records
kept), `OrgGroupResourceIT` (parent/lead/counts/move/delete-empty), `OrgIsolationIT` coverage
entries, `ScopeEvaluatorTest` manager cycle guard, web `employees.test.tsx` (selection bar,
filters URL sync, sheet tabs), `teams.test.tsx` (tree, move with undo), Playwright
`employees.spec.ts` (invite → appears INVITED → resend → suspend → reinstate → offboard wizard;
390/1440) and `teams.spec.ts`.

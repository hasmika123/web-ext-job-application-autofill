# 19b - What a marketer can see of an assigned consultant: set by the Org Admin per assignment (decision O6)

> Status: design, 2026-10-15. Decision O6 (user), which refines O5. Read `08-decisions-for-user.md` O5/O6 and
> `19-separate-enterprise-accounts.md` first.

## 1. The decision

* **Org Admin sees everything.** An Org Admin (and Owner) sees all details of every consultant, employee and staff member of the
  organization, limited only by the role's permissions (permission-driven menu and API; HR/Finance identifiers that we never
  collect stay out: no SSN/tax/bank/ID/DOB). No consultant consent is involved: enterprise accounts are organization-created
  and separate from personal accounts (O4).
* **Marketer sees what the Org Admin chooses, per consultant.** When the Org Admin assigns consultants to a talent marketer
  (Marketing Assignments page), he ticks which areas of EACH assigned consultant that marketer may see. An unassigned
  consultant stays a generic 404. This **replaces "assignment alone gives the full view" (O5)** with "assignment gives the
  view the Org Admin chose; the default is the standard set". Marketer-made resumes still need the consultant's approval,
  nothing is ever submitted for the consultant, no public share links.
* No consultant-consent gate on any of this (O5/O4 stand on that point).

## 2. Visibility areas (keys) and defaults

Stored per assignment (marketer x consultant). Keys are constants like `ShareField`; the settings registry holds the
organization-wide default set and the admin may change it (everything admin-configured).

| Key | What the marketer sees when ON | Default on assign |
|---|---|---|
| `PROFILE_CONTACT` | profile, skills, availability, work mode, headline, contact details (work e-mail, phone) | ON |
| `RESUMES` | all the consultant's resumes (view, download, tailor/edit through the approval flow) | ON |
| `APPLICATIONS` | the consultant's job applications and their stages, full detail | ON |
| `INTERVIEWS` | interviews and prep notes of the consultant | ON |
| `SUBMISSIONS` | submissions the marketer prepared/recorded for the consultant (always at least their own) | ON |
| `PLACEMENT_CLIENT` | the consultant's placement and client (read-only) | OFF |
| `TIMESHEETS` | timesheets of the consultant (only when the Consultancy Ops add-on exists; record-only, never money movement) | OFF |
| `DOCUMENTS` | other consultant documents stored in the organization (not identity documents; none are collected) | OFF |

Rules: turning an area OFF hides the matching pages' rows and API reads for that consultant (the page shows the consultant
without that area, or the generic 404 for a direct id); `PROFILE_CONTACT` is always at least the name and assignment (a marketer
cannot work a consultant they cannot identify). Changing visibility is audited (HIGH, who, which consultant, before/after) and
takes effect immediately. The consultant is informed that their marketer's view changed ("Sarah can now see your resumes") by an in-app
notice; they cannot veto it.

## 3. Data model (additive Liquibase)

* New table `org_assignment_visibility` (`org_id`, `assignment_id` or (`marketer_member_id`, `consultant_member_id`),
  `area_key`, `allowed` BOOLEAN, audit columns) or a JSON/bitmask column on the existing marketing assignment row: pick the
  one that matches how `MarketingAssignmentsService` stores assignments today (read it first). Unique per (assignment, area).
* Settings registry keys: `org.marketer_visibility.default_areas` (list), and per-area availability flags (e.g. `TIMESHEETS`
  hidden until the add-on module exists).
* Seed: existing assignments (demo and any real) get the default set so nothing disappears silently.

## 3b. Enforcement (one gate, many callers)

* One service `MarketerAccess` (or extend the existing `MktScope`): `allows(callerMemberId, consultantMemberId, area)`. Every
  marketing read that touches consultant data calls it: `service/ent/mkt/**` (talent, resumes, applications, interviews,
  submissions, matches, tasks, performance where consultant-specific), the consultant detail drawer, resume download/PDF/print,
  CSV exports. Org Admin/Owner bypass the gate by role (they pass through their own permission scope, not the assignment).
* ArchUnit rule: no class under `service/ent/mkt` reads consultant-owned entities except through `MarketerAccess`.
* Hostile cases return the generic 404 (never 403), audit rows for reads of RESUMES/APPLICATIONS keep their current HIGH rows
  on export/print.

## 4. UI

* **Marketing Assignments page** (`/w/admin/marketing-assignments`): in the assign sheet, after picking consultants, a
  "What can this marketer see?" panel with the area checkboxes and the default pre-ticked; applied to every consultant in the
  batch, with a per-consultant override row ("Customize"). The assignment table shows a compact visibility summary chip and
  an "Edit access" action on each assignment (opens the same panel, ReasonSheet not required, audited).
* **Marketer workspace:** pages simply omit what is not allowed; the My Assigned Talent drawer shows only allowed tabs.
  No "request access" in v1.
* Copy never says why something is hidden beyond "Not shared by your administrator".

## 5. Tests and stories

* `MarketerVisibilityIT` (every area ON/OFF x every marketer endpoint: allowed returns data, denied returns the generic 404;
  unassigned consultant 404; Org Admin sees all; another marketer cannot see; audit rows for changes), ArchUnit rule,
  `OrgIsolationIT` COVERAGE rows for new routes, vitest for the panel and page, `MarketerScopeTest` stays.
* Stories (descriptions first, recording later): ADM-4x admin assigns two consultants to Ben with RESUMES and APPLICATIONS only,
  edits access later; MKT-5x Ben sees exactly those areas and gets 404 on a hidden one; the consultant sees the notice.

## 6. Order of work (after S4 lands; this touches the permission code S4 also touches)

1. Data model + settings + seed (S).  2. `MarketerAccess` + migrate the mkt services behind it (L; the isolation IT must stay green).
3. Assign sheet + "Edit access" UI + notices (M).  4. Tests/stories (M).  5. Org Admin "sees all" audit: a visibility matrix
(role x data) generated from the code and one IT per admin page proving the Org Admin and Owner reach consultant, employee and
staff details; list the gaps (HR/Finance pages are still placeholders).

## 7. Queue position (user instruction, 2026-10-15)

This work (O6) starts AFTER the subscription work is done. Do not start it earlier, and do not let other work depend on it.
Current queue, in order: (1) account separation S4 (running), then S5-S11 per doc 19; (2) resume builder in the organization
workspaces (second machine, branch `ent-resume-builder-b`); (3) the subscription work; (4) O6, this document.

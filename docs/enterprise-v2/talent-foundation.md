# Talent foundation: data layer for Jobs, Consultants, Marketing Assignments, Applications, Resumes (+ dashboard tiles)

> Branch `ent-talent` (cut from `ent-admin`). **Read this first** if you build one of the five talent pages or the dashboard's talent tiles.
> It gives you tables, entities, repositories, seeded demo data and the formulas for every KPI. You still write the REST resource, service
> and web UI of your page. Boards: `design/enterprise-talent/*.png`. Rules: `41-database-design.md` (R1-R10), CLAUDE.md (no sensitive PII, 404 not 403,
> admin-config-driven, `@kiwiply/ui` only).

## 1. Tables (one changelog: `20261019010000_ent_talent.xml`, registered after `ent_dashboard`)

All org-owned: `org_id NOT NULL` + FK `organization`, every secondary index starts with `org_id`, composite tenant FKs `(org_id, parent_id)` to the
parent's `uk_<t>_org_id` (so the DB refuses a child that points at another tenant), varchar enum names, `DATETIME(6)` UTC. One precondition-guarded
changeSet per table, empty rollbacks (flag off, data inert). Also adds `uk_group_org_id` on `org_group` (for the department FK).

| Table | Purpose |
|---|---|
| `client_account` | Demand-side companies (34). `name_key` generated, unique per org. |
| `client_contact` | Business contacts of a client: name, title, work email, role (no phone). |
| `consultant_profile` | The consultant directory row (30, 03 s2.3 + board columns): display name, email, job title, years, location + work mode, availability (+since/from), license status + valid-until, profile completeness, `member_id` (null when not a seat), `department_group_id`. |
| `consultant_skill` | Skills per consultant; `primary_skill` = the chips in the directory. |
| `marketer_capacity` | Per marketer: `capacity` (max consultants), status, title label. |
| `marketer_assignment` | One current row per consultant: `marketer_member_id`, `backup_member_id`, priority HIGH/MEDIUM/LOW, status ACTIVE/PAUSED, `assigned_at`, `last_activity_at`. |
| `client_requirement` | **The Jobs board rows** (34 s2): client, contact, title, description, location, work mode, employment (CONTRACT/FTE/C2C), duration, experience level, rate min/max (minor) + unit HOUR/YEAR, positions/filled, status, `posted_at`, `closed_at`. |
| `requirement_skill` | Required skills of a job. |
| `requirement_match` | Consultant to job match %, `score`, `reason`, status SUGGESTED / ASSIGNED / DISMISSED, `assigned_at`. UNIQUE per pair. |
| `org_resume` | Metadata-only resume (30 s3): name, file name, target role, `version_no`, `primary_for_org` (one per consultant: generated unique key), visibility INTERNAL/PUBLIC/PRIVATE, approval PENDING/APPROVED, `owner_member_id`, `file_size_kb`, `headline`, `summary_text`, created/updated. No file bytes; `resume_id` is a future link to a person resume (no FK). |
| `org_resume_experience` | Experience entries the resume **preview** is drawn from (title, employer, start/end year). |
| `talent_application` | Application of a consultant to a job: `code` (APP-2026-001, unique per org), stage, `closed_reason`, `applied_on`, `source_label`, `next_action` + `next_action_due`, marketer, resume, `stage_changed_at`. UNIQUE `(org, job, consultant)`. |
| `talent_application_event` | Append-only timeline: CREATED / STAGE_CHANGE / NOTE with from/to stage, actor, time. Source of Application Progress dates, Activity tab, Recent Activity, week-over-week stage deltas. |
| `talent_application_note` | Notes tab. |
| `talent_interview` | Interview slots: application (nullable), consultant, client, `scheduled_at`, duration, status SCHEDULED/COMPLETED/CANCELLED, round label, interviewer name (text). |
| `talent_placement` | Consultant placed at a client: role title, status ACTIVE/ENDED, `start_date`, `end_date`, `bill_rate_minor` + unit + currency (record only, never moves money). |
| `org_spend_entry` | Record-only monthly spend ledger (`month_start`, category CONSULTANT_LICENSES/INFRA/OTHER, `amount_minor`). Demo-seed only. |

## 2. Classes

- Entities `com.dossier.api.domain.ent.talent.*` (one per table: `ClientAccount`, `ClientContact`, `ConsultantProfile`, `ConsultantSkill`, `MarketerCapacity`,
  `MarketerAssignment`, `ClientRequirement`, `RequirementSkill`, `RequirementMatch`, `OrgResume`, `OrgResumeExperience`, `TalentApplication`,
  `TalentApplicationEvent`, `TalentApplicationNote`, `TalentInterview`, `TalentPlacement`, `OrgSpendEntry`). Plain fields, explicit `orgId`, status as String.
- Repositories `com.dossier.api.repository.ent.talent.<Entity>Repository`. **Every method takes `orgId` first** (enforced by `TalentSchemaIT`). Each has
  `findByOrgIdAndId`, `findByOrgId`, `countByOrgId` plus the count/lookup methods named in section 5. Add your own org-scoped methods next to them.
- Seeder `com.dossier.api.service.ent.TalentDemoSeeder` (called by `EnterpriseDemoBootstrap` after the base seeder).

## 3. Demo data and how to turn it on

Same switches as the demo tenants: `DEMO_ENABLED=true ENT_DEMO_SEED=true` (never under `prod`; see `real-stack-runbook.md`). Idempotent: an org that already has
consultant profiles is skipped. Dates are relative to now (all history is in the last 6 months). The random stream is seeded per org (same story every time).
Extra marketer seats (Acme: Jessica Davis, Michael Park, Emily Lawson, David Kim, Samantha Lee, Ryan Thompson; Beta: Priya Nair, Leo Fischer) are real
`demo-ent-<org>-<key>` members with the Marketing Specialist role; they are **not** in the one-click demo login tab (that list is the 11-person base roster,
kept equal to `enterprise-demo.json`). Sign in as Sarah (Org Admin + Marketing Manager) or Omar to see everything.

| Seeded (Acme / Beta) | |
|---|---|
| consultants | 153 / 46 (Anika, Ben, Sam are linked to their seats; everyone else has `member_id` null) |
| marketers (seats with capacity) | 8 / 3. Acme workload/capacity: Jessica 28/30, Michael 29/30, Emily 23/25, David 16/25, Samantha 14/25, Ryan 12/20, Omar 10/20, Sarah 9/20 |
| assigned / unassigned consultants | 141 / 12 and 42 / 4. **Overloaded = workload >= 90 % of capacity** (`TalentDemoSeeder.OVERLOAD_PCT`): 3 and 2 |
| clients (+2 contacts each) | 8 (TechCorp, Global Media, FinTech Solutions, HealthPlus, InnovateLab, RetailCo, ACME Internal, Northwind Logistics) / 3 |
| jobs | 24 (13 OPEN, 3 IN_REVIEW, 2 ON_HOLD, 4 FILLED, 2 CLOSED; 6 posted in the last 7 days) / 8 |
| matches | ~275 / 41 (top 14 per job with score >= 70, plus every application pair as ASSIGNED, plus ~12 assigned without an application) |
| applications | 120 / 36; stages 14 ASSIGNED, 22 SUBMITTED, 24 UNDER_REVIEW, 26 INTERVIEWING, 10 OFFER, 24 CLOSED (10 HIRED, 8 REJECTED, 4 WITHDRAWN, 2 NO_RESPONSE) |
| application events / notes | 541 / 143 and 164 / 45 |
| interviews | ~90 / ~28: 28 / 10 SCHEDULED in the next 13 days, the rest COMPLETED (some CANCELLED) over the last 5 months, rising (4/8/14/20/46 per month at seed time; the current month includes the upcoming ones) |
| placements | 108 / 33: one ACTIVE per ON_PROJECT consultant (hired applicants included), the rest ENDED |
| resumes | 121 / 35 (v1-v4, ~14 % PENDING, ~12 % PRIVATE, ~28 % PUBLIC, one primary per consultant at most) + 303 experience rows |
| spend entries | 18 / 18 (3 categories x 6 months) |

Trend design: applications per calendar month (oldest to current) are 6/9/12/16/22/35 percent of the total, placements start about 4/6/9/15/24/42 percent (ended ones fill the older months), so
"vs last month" is positive and a Jan..Jun style bar chart rises. The current month is partial (to today) on purpose.

## 4. Permissions

No new keys: the registry (`EntPermissions`, doc 05) already covers the talent pages; use these (scope in brackets as in `RoleTemplates`):

| Page | View | Write |
|---|---|---|
| Consultants | `consultants.view` (ASSIGNED; TEAM for a manager, ORG for admin/TA) | `consultants.edit` (ORG) |
| Marketing Assignments | `consultants.view` + `workload.view` (TEAM) | `assignments.manage` (TEAM) |
| Jobs | `pipeline.view` (ASSIGNED), `clients.view` (ORG) | `opportunities.manage` (ASSIGNED, assign a consultant), `requirements.manage` (ORG, create/edit a job), `matches.run` |
| Applications | `pipeline.view` | `submissions.prepare` / `submissions.record` / `followups.manage` (ASSIGNED); a consultant's own: `applications.manage` (OWN) |
| Resumes | `resumes.view_for` (ASSIGNED) | `resumes.edit_for` (ASSIGNED, acting), `resumes.approve_request` (ORG) for approval; consultant's own: `resumes.manage` (OWN) |
| Dashboard tiles | `dashboard.view_org` (ORG) | none |

Marketing Specialist holds the ASSIGNED ones; Marketing Manager the same at TEAM plus `assignments.manage`, `workload.view`, `approvals.decide`; Org Admin everything;
Account Manager `clients.*` and `requirements.manage`; Executive Viewer `dashboard.view_org`, `pipeline.view`. Scope: filter list queries by the caller's scope
(ORG = all, TEAM = consultants whose marketer is in the caller's team, ASSIGNED = consultants whose `marketer_assignment` marketer/backup is the caller).
Unknown ids or another tenant's ids answer the generic 404 (never 403). Free text on write DTOs goes through the PII scanner (`SensitiveContent`).

## 5. KPI formulas (all from rows; "now" is request time, UTC; `T-30` = now minus 30 days)

Percent delta = `(current - previous) / previous`; show "n/a" when previous = 0. Sparklines: bucket by week from the timestamp named.

**Jobs page** (`ClientRequirementRepository`, `RequirementMatchRepository`)
- Open Jobs = `countByOrgIdAndStatus(OPEN)`; vs last month = minus `countOpenAt(orgId, T-30)`. (The board's mock shows 24 open of 24 listed; here open is honestly the OPEN status.)
- New This Week = `countByOrgIdAndPostedAtGreaterThanEqual(now-7d)`; vs last week = minus the same count for `[now-14d, now-7d)` (= `since(now-14d) - since(now-7d)`).
- Assigned Opportunities = `matches.countByOrgIdAndStatus(ASSIGNED)`; vs last month = minus `countByOrgIdAndStatusAndAssignedAtLessThan(ASSIGNED, T-30)`.
- High Match Jobs = `countRequirementsWithScoreAtLeast(orgId, 90)`; previous = same, restricted in the service to jobs with `posted_at <= T-30`.
- Row: submissions = `talent_application` count per `requirement_id`; match avatars/% = top `requirement_match` rows by score (initials circles, no photos); status chip from `status` (OPEN / IN_REVIEW / FILLED / ON_HOLD / CLOSED).
- Detail: Top Matches = `findByOrgIdAndRequirementIdOrderByScoreDesc`; Assign = set the match to ASSIGNED (`assigned_by_member_id`, `assigned_at`) and create a `talent_application` stage ASSIGNED + CREATED event.

**Consultants page** (`ConsultantProfileRepository`)
- Total = `countByOrgIdAndStatus(ACTIVE)`; vs last month = minus `countByOrgIdAndStatusAndCreatedAtLessThan(ACTIVE, T-30)` (people who joined in the last 30 days).
- Available = `countByOrgIdAndStatusAndAvailabilityStatus(ACTIVE, AVAILABLE)`; On Project = same with `ON_PROJECT`; Needs Review = `countByOrgIdAndStatusAndLicenseStatus(ACTIVE, NEEDS_REVIEW)`. Last-month values for the three: apply the same `created_at < T-30` cut in the service (no history table; state changes are not versioned).
- Row: marketer = `marketer_assignment` (initials circle); Apps = `talent_application` count for the consultant (`countByOrgIdAndConsultantIdAndStageNot(.., CLOSED)` for active); Next Interview = earliest SCHEDULED `talent_interview` after now (`findByOrgIdAndConsultantIdAndStatusAndScheduledAtAfterOrderByScheduledAtAsc`); Profile ring = `profile_completeness`; checklist ticks: Basic = always, Skills = has skills, Resume = has `org_resume`, Certifications = `has_certifications`, Preferences = `has_preferences`.
- License status chip values: ACTIVE / EXPIRING / PENDING / NEEDS_REVIEW. Availability: AVAILABLE / ON_PROJECT / NOTICE / UNAVAILABLE. No phone number is stored: the drawer shows email + location (+ work mode) only.

**Marketing Assignments page** (`MarketerAssignmentRepository`, `MarketerCapacityRepository`)
- Assigned Consultants = `assignments.countByOrgId`; vs last month = minus `countByOrgIdAndAssignedAtLessThan(T-30)`.
- Active Marketers = capacity rows with status ACTIVE; Unassigned = ACTIVE consultants without an assignment row (`consultants.findByOrgId` minus assigned ids, or a NOT EXISTS query of your own); Overloaded = marketers with `countByOrgIdAndMarketerMemberId * 100 >= 90 * capacity`.
- Marketer card "28 / 30" = `countByOrgIdAndMarketerMemberId` / `capacity`; percent = ratio. Footer: Total Assigned, Avg per Marketer = total / active marketers, Overloaded.
- Right table: rows where `marketer_member_id = selected`; columns assigned/backup marketer, status, priority, Active Apps (`talent_application` open count), Last Activity = `last_activity_at`. Reassign = update the row (write an audit row; history table is not part of this foundation).

**Applications page** (`TalentApplicationRepository`, `TalentApplicationEventRepository`)
- Total = `countByOrgId`; In Review = stages `SUBMITTED + UNDER_REVIEW`; Interviewing = `INTERVIEWING`; Offers = `OFFER`. "vs last month": total uses `countByOrgIdAndCreatedAtLessThan(T-30)`; for a stage use stage events: the stage count at T-30 = applications whose latest `STAGE_CHANGE`/`CREATED` event before T-30 has `to_stage` = that stage (service query on `talent_application_event`).
- Progress steps dates (Assigned, Submitted, Under Review, Interviewing, Offer, Closed) = the first event of each `to_stage`; Notes (n) = `talent_application_note`; Activity tab = events. Detail fields: `code` is the Application ID, Applied Date = `applied_on`, Source = `source_label`, Next Action/Due = `next_action`/`next_action_due`. The Full-time chip is `client_requirement.employment_label` (CONTRACT/FTE/C2C).
- "In Review" and "Under Review" on the board are the same stage `UNDER_REVIEW`. Stage names: ASSIGNED, SUBMITTED, UNDER_REVIEW, INTERVIEWING, OFFER, CLOSED (closed carries `closed_reason`: HIRED / REJECTED / WITHDRAWN / NO_RESPONSE).

**Resumes page** (`OrgResumeRepository`)
- Total = `countByOrgId`; vs last month = minus `countByOrgIdAndCreatedAtLessThan(T-30)`. Primary = `countByOrgIdAndPrimaryForOrgTrue`. Needs Approval = `countByOrgIdAndApprovalStatus(PENDING)` (delta needs `approval` history: use `created_at` cut on pending rows). Updated This Week = `countByOrgIdAndUpdatedAtGreaterThanEqual(now-7d)`; vs last week = minus the `[now-14d, now-7d)` count.
- Pending Approval tab = PENDING rows; Recent Updates tab = order by `updated_at` desc. Owner avatar = `owner_member_id` (initials). Version cell = `v<version_no>`; Primary column = `primary_for_org`.
- Preview = render `headline`, `summary_text`, the consultant's skills (primary first) and `org_resume_experience` rows into the paper mock. Download/Print: generate from the same structured fields (no stored file). Visibility values INTERNAL / PUBLIC / PRIVATE; setting a new primary clears the old one first (the generated unique key allows one).

**Dashboard tiles** (read-only aggregates, `dashboard.view_org`)
| Tile | Formula |
|---|---|
| Total Consultants | as the Consultants page KPI (ACTIVE profiles; vs last month by `created_at`) |
| Active Employees | existing member counts (`org_member` ACTIVE; already served by the dashboard) |
| Open Applications | `countByOrgId - countByOrgIdAndStage(CLOSED)`; vs last month via `countByOrgIdAndCreatedAtLessThan(T-30)` minus those already closed (`closed_at` = the CLOSED event time) |
| Upcoming Interviews | `countByOrgIdAndStatusAndScheduledAtBetween(SCHEDULED, now, now+7d)`; list = `findByOrgIdAndScheduledAtBetweenOrderByScheduledAtAsc`; previous = the same window one week earlier counting COMPLETED+SCHEDULED |
| Active Placements | `countByOrgIdAndStatus(ACTIVE)`; vs last month = minus `countActiveOn(orgId, today-30d)` |
| Monthly Spend | sum `amount_minor` of `org_spend_entry` for the current month; delta vs the previous month (`findByOrgIdAndMonthStartBetweenOrderByMonthStartAsc`). Record-only, no billing logic |
| Team Performance (6 months) | per calendar month: applications = `countByOrgIdAndAppliedOnBetween`, interviews = `talent_interview` with `scheduled_at` in the month and status in (SCHEDULED, COMPLETED), placements = `countByOrgIdAndStartDateBetween` |
| Pipeline Overview (donut) | New = `ASSIGNED`; In Review = `SUBMITTED + UNDER_REVIEW`; Interview Scheduled = `INTERVIEWING`; Offered = `OFFER`; Hired = `CLOSED` with `closed_reason = HIRED`. (Other CLOSED reasons are not in the donut.) |
| Activity & Alerts | derived live: applications with `next_action_due < today` and stage not CLOSED (overdue), licenses with status EXPIRING or NEEDS_REVIEW, resumes PENDING, overloaded marketers, unassigned consultants, interviews today |
| Recent Activity | merge the newest `talent_application_event` rows (`findTop20ByOrgIdOrderByOccurredAtDesc`, actor = member) with `org_audit_event` rows; show who, what, when |

## 6. Isolation and tests

- `TalentSchemaIT` (api/src/test/.../service/ent): migration applies and every table has `org_id NOT NULL` + FK, the composite tenant FK refuses a cross-tenant child, seeded counts and cross-references (marketer of an application = marketer of its consultant, one ACTIVE placement per ON_PROJECT consultant, 12 unassigned, 3 overloaded), six months of rising history, idempotent second run, Beta never mixes with Acme, and every talent repository method takes `orgId` first.
- `OrgIsolationIT` only scans `repository.org` for its repository registry, so the talent repositories are covered by `TalentSchemaIT` instead. **Add your route rows to `OrgIsolationIT.COVERAGE`** when you add `/api/orgs/{orgId}/...` routes (the test fails until you do).

## 7. Known limitations / decisions

- **Scale deviates from the first brief (about 40 consultants):** 153 consultants, so that the board's workloads (28/30 and so on, 3 overloaded, 12 unassigned) are real counts of assignment rows. Beta is 30 %.
- Table names: docs' names kept where the meaning matches (`client_account`, `client_contact`, `client_requirement`, `consultant_profile`, `org_resume`); `application` and `interview` are person-owned tables, so the org records are `talent_application`, `talent_interview`, `talent_placement`, and the match is `requirement_match` (precursor of `opportunity_match`). A later Phase 8 story can migrate them additively.
- `org_assignment` (X4.1) cannot hold the assignments (consultants are not all seats, and the board needs backup + priority + status), so `marketer_assignment` + `marketer_capacity` exist as 17 s5 allows. Anika to Sarah and Ben to Omar are consistent with the base `org_assignment` rows. `org_assignment` is not written.
- `client_requirement.status` adds IN_REVIEW to the doc's list; `org_resume.resume_id` has no FK; no resume history table (one row per resume with its current `version_no`); no assignment history table; no notification/audit rows are written by the seeder.
- Skills are child rows (no JSON column), so there is nothing for the JSON allow-list to track.
- Extra marketer members are not in the demo login tab (the roster is kept equal to `web/scripts/fixtures/enterprise-demo.json`); the web mock API has no talent data.
- No photos, no phone numbers, no DOB, no document/bank numbers anywhere. Initials circles only.
- Nav items (sidebar labels of the boards): Consultants, Resumes, Marketing Assignments, Jobs, Applications (route keys `consultants`, `resumes`, `marketing-assignments`, `jobs`, `applications`). Interviews, Clients and Placements are shown in the boards' sidebar; their tables exist (`talent_interview`, `client_account`, `talent_placement`) but their pages are not part of this foundation.

- Counts of random-driven rows (matches, interviews, notes, resumes) vary by a few between runs because dates are relative to now; the headline numbers (consultants, assignments, jobs, applications and their stage mix, clients) are fixed.

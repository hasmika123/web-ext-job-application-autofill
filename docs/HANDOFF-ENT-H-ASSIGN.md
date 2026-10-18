# HANDOFF - h-assign: cover, scheduled handovers, Reassign sheet, offboarding, `consultants.max`, marketing route fix

> Branch `h-assign`, cut from `origin/version2` 7f77db37. Written 2026-10-17 by a Sonnet engineer.
> Closes what the B1 report listed as "not built" (`docs/HANDOFF-ENT-SPRINT2-B-REPORT.md`) except the consent re-point prompt and the nightly role re-check.
> The Marketing Manager approval hold (X8.4) is another agent's work and is not here.

## START HERE

- Read `AssignmentScheduleService` first (it explains the model), then `AssignmentScheduleJob`, then `MarketerOffboardingService`.
- Web: `web/src/components/ent/marketing/ReassignSheet.tsx`, wired from `MarketingAssignmentsPage.tsx`.
- Tests: `OrgAssignmentScheduleIT` (28 tests), `MarketingSettingsScheduleTest`, the five `OrgIsolationIT` COVERAGE rows, `MarketingAssignmentsPage.test.tsx`, `shadowing.test.tsx`.

## The model (decision)

`marketer_assignment` stays the one authoritative record (the B1 decision). **Temporary cover is a time-boxed swap of the marketer in that table**, not a second
row, so the 35 readers, the ASSIGNED scope, the board counts and `MarketerAccess` need no change and cover cannot disagree with anything. The plan lives in the new
table `marketer_assignment_schedule` (additive Liquibase `20261123010000_ent_assignment_schedule.xml`):

| kind | what it is | start | end |
|---|---|---|---|
| `REASSIGN` | a handover on a future date | the job applies it (status SCHEDULED to DONE) | none |
| `DELEGATE` | temporary cover | at once or on a date (SCHEDULED to ACTIVE; the marketer it was taken from is saved as `return_marketer_member_id`) | the job gives the consultant back (ACTIVE to ENDED, outcome RETURNED) |

Every apply goes through `AssignmentLifecycleService.record`, so history (actions `DELEGATE`, `DELEGATE_END`, or the usual `REASSIGN`/`ASSIGN`), the handover of open
work (both ways for cover), the `org_assignment` projection (cover shows as the PRIMARY row while it lasts) and the notices are the same code as the board. The audit
rows are `MARKETING_SCHEDULE`, `MARKETING_DELEGATE_START`, `MARKETING_DELEGATE_END`, `MARKETING_REASSIGN` (job), `MARKETING_SCHEDULE_CANCEL`, `MARKETING_SCHEDULE_FAILED`.
The spec's `DELEGATE` kind in `org_assignment` itself is NOT written (the cover is projected as PRIMARY); say if you want a separate projected kind.

Edge rules (all tested): someone changes the marketer by hand during cover, so the cover ends as SUPERSEDED and nothing is given back; the marketer to return to has gone, so
the cover stays (RETURN_UNAVAILABLE); a cover whose whole window passed while the job was down is dropped (EXPIRED_BEFORE_START); unassigning the consultant cancels waiting
plans; a plan that cannot be applied (marketer paused or gone, consultant gone, licence cap) becomes FAILED with the code as outcome and an audit row; one open plan of each kind per consultant.

## The job

`AssignmentScheduleJob`, every 15 minutes (`dossier.ent.assignment-schedule-cron`, default `0 */15 * * * *`, UTC), under the `job_lease` lease `assignment-schedule` (`JobLeaseService.withLease`).
It scans due plans across organizations (JPQL in `AssignmentScheduleService.runDue`, because the org-scoped repository cannot) and applies each one in its own transaction
inside `TenantScoped`. Idempotent: an applied plan is no longer due.

## API (all `/api/orgs/{orgId}/marketing-assignments/...`, `OrgIsolationIT` COVERAGE rows added)

| route | note |
|---|---|
| `GET handover-preview?consultantId=&toMemberId=` | counts only (opportunities, tasks, follow-ups), the switch, the new marketer's load, the licence cap, pending plans |
| `POST reassign` | `{consultantId, newMarketerMemberId, effectiveAt?, reason?, allowOverCapacity?}`: no date (or under a minute ahead) = the same change as `/assign` (status DONE); later = a plan (SCHEDULED) |
| `POST delegate` | `{consultantId, coverMarketerMemberId, startsAt?, endsAt, reason, allowOverCapacity?}` |
| `GET schedules?consultantId=` | SCHEDULED and ACTIVE plans inside the caller's scope |
| `POST schedules/{scheduleId}/cancel` | cancels a waiting plan or ends a running cover now |

Writes need an `Idempotency-Key`. Generic 404 everywhere outside the caller's reach. `reason` is max 200 characters and `SensitiveContent`-checked.

Settings (registry, org_setting override, safe defaults): `org.assignments.delegate_max_days` 90, `org.assignments.schedule_max_days` 180, `org.license.consultants_max` **0 = off**.

## `consultants.max` (X4.8)

`MarketingSettings.consultantsMax` is checked in `MarketingAssignmentsService.assign` (so the board, `/reassign`, undo-free paths), in cover and plan creation, and again when the job applies a plan.
409 `CONSULTANTS_LIMIT` with `{marketerMemberId, max, current, adding, projected}`; **`allowOverCapacity` never waives it** (the board capacity stays a warning).
There is no organization-level `EntitlementService` in the code yet (it answers personal logins only; `ConsultantFeaturesService` says the same), so the allowance is read the way
`OrgResumeCap` reads `org.license.resumes_max`. When the org catalog resolver exists, change `MarketingSettings.consultantsMax` only.

## Offboarding

`DefaultOffboardingHooks.Assignments.apply` now calls `MarketerOffboardingService`: first plans that involve the person are cancelled or ended, then the request's
`reassignments` (they name the consultant by SEAT; the new assignee must be an active marketer), then everyone else goes to the backup (open work follows) or to nobody
(UNASSIGN history line; the board shows them as unassigned), the person's backup slots are cleared, and their capacity row is PAUSED. One `MARKETER_OFFBOARD` audit row.
The preview adds a `MARKETER_CONSULTANTS` line. **Known gap:** consultants without a seat cannot be named in `reassignments` (the request shape is seat-based); they fall through to the backup/nobody rule.
Open work of an unassigned consultant stays with the person who left (as it always did for unassign).

## Web

- `ReassignSheet`: side sheet (full screen on a phone). Mode Reassign or Temporary cover, marketer list with the load they would have, now or a date, reason, a live "what will move" card (counts only), the plans already waiting with Cancel or End cover now, over-capacity notice with Assign anyway, and a licence notice with no way round it.
  Row menu entries "Reassign or schedule..." and "Temporary cover..." for one consultant; the bulk menu keeps the quick picker. Plans show as a note under the marketer in the table. Every outcome is a toast with Undo (restore for a change made now, cancel for a plan).
- BFF forwards the five new routes and `consultants/{id}/history` (the history route was not reachable from the web before).
- **Route bug fixed:** `/w/marketing/{applications,interviews,resumes}` were shadowed by the explicit `[workspace]/<page>` folders and rendered the Administration pages. Each folder now hands the Marketing workspace to `marketingPageFor`, like `jobs` and `submissions`. `shadowing.test.tsx` now asserts the right component for all five shadowed pages (and that Admin still gets its own); it fails without the fix.
- **Not verified in a browser.** No Playwright run, no video. vitest only.

## Not done / open

- The consent re-point prompt and the nightly role re-check (`health = ROLE_LOST`) of X4.13.
- Cover is projected as PRIMARY in `org_assignment`, not as kind `DELEGATE`.
- Playwright journeys for the sheet (cannot run here).
- Marketing Manager approval hold, BoardPolicy, metering, pinned resume version (X8.4): the other agent.

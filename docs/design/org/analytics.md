# Org analytics — metric definitions, rollups, suppression, dashboard (stories O7.*)

> Status: design, 2026-10-11. Replaces the sample numbers in `web/src/components/org-v2/sample-data.ts`
> (`DASHBOARD_STATS`, `ANALYTICS_STATS`, `PLACEMENT_FUNNEL`, `RESPONSE_RATE`, `ROI_TILES`, …).
> Depends on `consent-data-sharing.md` (scope ≥ SUMMARY, k-anonymity) and `tenant-model.md`
> (`org_group`, `support_owner_member_id`). Existing sources: `application` (+`ApplicationStatus`
> SAVED/APPLIED/INTERVIEW/OFFER/REJECTED), `fill_event` (20260922000000), `resume`, `resume_match`
> ATS scores, `inbox_message` status changes, `job_assignment` (Phase 22), `autopilot_item` (Phase 19).

## 1. Decisions

1. **Definitions are code.** Every metric below is one method in `OrgMetricDefinitions` with a
   javadoc copy of its definition; this doc and that class are kept in sync by a test that renders
   the enum to Markdown and diffs §2.
2. **Nightly rollups, not live queries.** `org_metric_daily` is computed at 03:00 org-local by
   `OrgMetricRollupJob` for the previous day; the dashboard reads rollups and adds a cheap "today so
   far" from live counts only for the four headline tiles.
3. **Consent first, then math.** A member with scope `NONE` contributes to seat metrics only.
   Aggregates are computed over consenting members and every tile shows "of N sharing" when N <
   member count.
4. **Suppression below 5.** Any cell (group × metric × period) with fewer than 5 contributing
   members renders "<5" and is excluded from per-group charts; the org-wide total still shows. A
   support owner with 3 members sees their own 3 only as a list, never as rates.
5. **No vanity metrics we cannot stand behind.** The board's "ROI Estimate 3.2x", "Hiring Manager
   Satisfaction 96 %", "Employer Responses", "Sync Health" are **not built**. Time-to-place and
   placement rate are built because members declare placements (`consent-data-sharing.md` §6).
6. **Exports are CSV of the rollups, audited.** No per-member export below SUMMARY; FULL exports
   do not exist (marketers work in the UI).

## 2. Metric definitions (period = org-local calendar days; "member" = ACTIVE membership with scope ≥ SUMMARY unless stated)

| key | definition | source |
|---|---|---|
| `seats.total` | ACTIVE + INVITED + SUSPENDED memberships (all scopes) | `org_member` |
| `seats.active` | ACTIVE memberships | `org_member` |
| `seats.invited_pending` | INVITED, not expired | `org_member` |
| `members.activated` | ACTIVE members who have ≥1 resume **or** ≥1 application **or** a fill_event, ever | `resume`, `application`, `fill_event` |
| `members.active_7d` | members with any own event (application change, fill, resume update) in the last 7 days | event tables' `updated_at` |
| `applications.prepared` | distinct `fill_event` per (member, job url) in period — a fill the member ran | `fill_event` |
| `applications.submitted` | `application` rows whose status first became `APPLIED` in period (status history or `applied_at`) | `application` |
| `applications.interview` | applications whose status first became `INTERVIEW` in period | `application` |
| `applications.offer` | first became `OFFER` in period | `application` |
| `applications.rejected` | first became `REJECTED` in period | `application` |
| `applications.placed` | `application.outcome = ACCEPTED` with `accepted_at` in period (member-declared) | `application` (new cols) |
| `members.placed` | distinct members with ≥1 `applications.placed` ever | derived |
| `rate.response` | among applications submitted ≥14 days before period end: share with any status beyond APPLIED (interview/offer/rejected) or an inbox-driven status change | `application`, `inbox_message` |
| `rate.interview` | interview ÷ submitted (same cohort rule, ≥14 days) | derived |
| `rate.offer` | offer ÷ interview | derived |
| `time.to_first_application_days` | median(joined_at → first APPLIED) over members activated in period | derived |
| `time.to_place_days` | median(joined_at → accepted_at) over members placed in period | derived |
| `resume.ready_share` | members with ≥1 resume whose latest ATS band is `high` (`resume_match`/ATS score ≥ 75) ÷ members with a resume | `resume`, ATS score tables |
| `resume.none` | ACTIVE members with 0 resumes | `resume` |
| `interviews.upcoming` | applications in INTERVIEW with a future interview date (when the member recorded one) | `application` + interview fields (user area) |
| `autopilot.prepared` (19) | `autopilot_item` READY+SUBMITTED in period for members with an Autopilot grant | `autopilot_item` |
| `assignments.open` / `.applied` (22) | `job_assignment` by status, per consultant/marketer | `job_assignment` |
| `ai.budget_used_pct` | mean % of AI budget used across org grants this period (never dollars to the org) | AI usage tables |

Funnel = submitted → interview → offer → placed for applications **submitted in the period**
(cohort funnel, not a snapshot), so the trapezoids are honest.

## 3. Data model (`20261011040000_org_metrics.xml`)

### `org_metric_daily`
`id, org_id, day DATE, group_id BIGINT NULL (NULL = whole org), support_owner_member_id NULL,
metric VARCHAR(50), value DECIMAL(14,4), contributors INT (members counted), computed_at`.
Unique `(org_id, day, group_id, support_owner_member_id, metric)`; index `(org_id, metric, day)`.
`contributors` drives suppression at read time, so a late consent change does not require a recompute
(the next night's run reflects it anyway).

### `application` additions (user area owns the table; additive)
`outcome VARCHAR(20) NULL (ACCEPTED|DECLINED)`, `accepted_at DATETIME(6) NULL`, `applied_at
DATETIME(6) NULL` (backfilled from `created_date` where status ≥ APPLIED), `status_changed_at`.
If a status-history table arrives from the user area (U*), "first became" reads it; until then,
`applied_at`/`status_changed_at` approximate (documented in the javadoc).

## 4. API

```
GET /api/orgs/{id}/metrics/summary?period=30d                 → headline tiles {metric, value, delta, contributors, suppressed}
GET /api/orgs/{id}/metrics/series?metric=&from=&to=&groupId=&ownerId=&bucket=week
GET /api/orgs/{id}/metrics/funnel?from=&to=&groupId=
GET /api/orgs/{id}/metrics/breakdown?by=group|owner&from=&to=   (rows with contributors<5 → suppressed:true, values null)
POST /api/orgs/{id}/metrics/export {from,to,groupBy}           → CSV (audited EXPORT)
POST /api/orgs/{id}/reports/schedule {cadence: WEEKLY|MONTHLY, dayOfWeek, recipients[] (members only)}  → emailed PDF/CSV digest
```
Delta = vs the previous equal-length period; shown only when both periods have ≥5 contributors.

## 5. Suppression & privacy rules (enforced in `OrgMetricReadService`)
- `contributors < 5` → `value = null, suppressed = true` for group/owner rows; org-wide rows always show.
- Rates need denominator ≥ 10 or they show "n/a (too few)".
- Deltas never show for suppressed cells.
- The analytics page states at the top: "Based on N of M members who share progress."
- No metric reveals an employer, a document or a date finer than a day.

## 6. Dashboard & analytics pages (390 px first)

```
Dashboard (`/org`)                             Analytics (`/org/analytics`)
┌──────────────────────────────┐              ┌──────────────────────────────┐
│ Acme Bootcamp · 58 of 60 share│             │ Last 30 days ▾  Group: All ▾ │
│ ┌──────┐┌──────┐┌──────┐┌────┐│             │ Based on 58 of 60 members    │
│ │ 60   ││ 51   ││ 212  ││ 9  ││             │ Funnel (submitted Sep 11–Oct 10)│
│ │seats ││active││applied││placed│           │ ▇▇▇▇▇▇▇▇ 212 submitted       │
│ └──────┘└──────┘└──────┘└────┘│             │ ▇▇▇▇▇    61 interview (29%)  │
│ This week                     │             │ ▇▇       14 offer            │
│ ▁▂▃▅▆▇ applications/day       │             │ ▇         9 placed           │
│ Needs attention (4)        ▸  │             │ Trend · weekly ▾             │
│  • 6 people with no resume    │             │ ⟋ submitted  ⟋ interviews    │
│  • 3 invites expiring Fri     │             │ By cohort                    │
│  • 2 seats unassigned         │             │  26-A  48 · 12 · 3 · 2       │
│ Recent (consented)            │             │  26-B  <5 (too few sharing)  │
│  • 2 new interviews today     │             │ Response rate 61% (n=180)    │
│  • 1 placement 🎉             │             │ Median time to place 34 d    │
└──────────────────────────────┘              │ [Export CSV] [Schedule report]│
                                              └──────────────────────────────┘
```
Charts follow the `dataviz` skill palette already used by `app-v2/common` (`Donut`, bars, lines in
HTML/CSS). Needs-attention items link to the Team page filtered. "Recent" never names an employer
unless the viewer has FULL on that member.

## 7. Cost & performance
Rollup cost: O(members × applications in day); indexed by `user_id, updated_at`. For 5,000-member
orgs the nightly job runs in minutes; reads are rollup lookups. "Today so far" tiles use 4 counts
with `org_member → user_id IN (...)` joins, cached 60 s per org in-process.

## 8. Tests
`OrgMetricDefinitionsDocTest` (doc ↔ enum), `RollupJobTest` (fixtures: 2 cohorts, one <5 → suppressed;
NONE-scope member excluded; placement counted once), `CohortFunnelTest` (submitted in period only),
`ResponseRateCohortTest` (14-day rule), `ExportAuditedTest`, web: tiles render "of N sharing", suppressed
rows show "<5", 390 px layout has no horizontal scroll.

# Marketing workspace page: Performance (`/w/marketing/performance`)

Branch `mkt-performance` (off `ent-talent-marketer`). Board: `design/enterprise-marketer/performance.webp`. Permission `reports.view` (ASSIGNED for a Marketing Specialist, ORG sees all).
Read-only (E1) apart from the marketer's own monthly targets (numbers recorded; nothing is submitted, sent or signed in as anyone).

## Endpoints (`/api/orgs/{orgId}/mkt/performance`, every one through `MktScope.resolve(me, "reports.view")`; non-members, flag off, missing permission: generic 404)
| Route | What |
|---|---|
| `GET ?weeks=4w\|8w\|12w&trend=1m\|3m\|6m&funnel=1m\|3m\|6m&streams=1m\|3m\|6m&benchmarks=month\|lastMonth&goals=month\|lastMonth` | The whole board in one call: `kpis[6]`, `weekly`, `trend`, `funnel`, `readiness`, `streams`, `top[5]`, `benchmarks`, `goals`, `actions`. Every period is optional (board defaults: 8w, 3m, 3m, 3m, month, month); an unknown value falls back to the default. |
| `PUT /goals` `{submissions?, interviews?, offers?, placements?}` | The caller's OWN monthly targets (0..100000; omitted metrics unchanged; nothing given or out of range: 400). Upserts `mkt_goal` rows with `owner_member_id` = caller, audits `MARKETER_GOALS_UPDATE`, returns the Goals card. Only the caller's row changes; the org default is never edited here. |

## Definitions (one place: `MktPerformanceService`; the web only draws)
- **Submission** = a `talent_application` row of an assigned consultant, counted on `applied_on` (the consultant submitted; the marketer only records it). **Interview** = that application reached Interviewing, **Offer** = reached Offer, read exactly like the Applications funnel (`MktApplicationStages`: its current stage or any stage its event history proves). Rates are therefore cohort rates and Interviews <= Submissions. **Placement** = a `talent_placement` row by `start_date`. `mkt_submission` (recorded packages, drafts included) is not used: it has no interview/offer outcome, so mixing it would break the funnel.
- Interview / Offer / Placement Rate = interviews / offers / placements divided by submissions of the same window.
- **This Month** = the last 30 days; **last month** = the 30 days before (the T-30 convention of the foundation doc). A delta with no previous value (previous 0 or nothing to compare) is null and no chip is drawn. Deltas are relative changes in percent.
- Tiles: Assigned Consultants = the Talent page's `assigned` tile (value, delta, sparkline; needs `consultants.view`, otherwise "Nothing yet"); Active Submissions = applications not CLOSED (delta vs 30 days ago, rebuilt from event history like the Applications page); Interview Rate, Offer Rate, Placements This Month over the last 30 days; Follow-up Completion = of the `mkt_followup` rows that fell due in the window, the share COMPLETED. Sparklines are eight calendar weeks.
- **Submissions by Week**: calendar weeks Monday-Sunday (UTC), the last one holds today; submissions / interviews / offers of that week's cohort. **Interviews vs Offers**: running totals from the period start, sampled at each Sunday and at today; the end values equal the funnel's. **Placement Funnel**: Submissions, Interviews, Offers, Placements with % of submissions.
- **Consultant Readiness** over the Talent page's rows (assigned, ACTIVE consultants): Inactive = on a project or unavailable; Needs Attention = resume needs an update or profile completeness below 50; Ready to Submit = up-to-date resume, Available Now and completeness at least 70; In Progress = everyone else (pending approval, soon/later, in interview). Needs `consultants.view`; without it the card is empty.
- **Job Stream Effectiveness** is per **client** (the board lists clients), top 5 by submissions. The Offer Rate chip is green at or above the window's overall offer rate and red below it.
- **Top Performing Consultants** (last 3 months): ranked by placements, then offers, interviews, submissions. **Match Rate** = average score of the consultant's `requirement_match` rows that are not DISMISSED. **Last Activity** = latest application event / stage change. **Trend** = submissions per week, 8 weeks.
- **Recommended Actions** (each row opens a Marketing page through `hrefs`): consultants with no application activity for 14 days -> Follow-ups; consultants with an application in Interviewing -> Interviews; SUGGESTED matches of the top performers -> Job Matches; the client with the lowest offer rate below the overall rate (at least 3 submissions) -> Submissions. A row with nothing to do is left out.
- **Consent**: a consultant who shares nothing with the organization (`DataShareService`, the Applications rule) is left out of every count. Counts only; no consultant detail leaves this endpoint.

## Tables (`20261104130000_mkt_performance.xml`)
- `mkt_goal`: id, org_id, `owner_member_id` null = org default (composite FK org_member), `metric` SUBMISSIONS/INTERVIEWS/OFFERS/PLACEMENTS, `period` MONTH, `target` int, created_at, updated_at. Unique `(org_id,id)` and `(org_id, owner_member_id, metric, period)`; a marketer's row overrides the default for them only.
- `mkt_benchmark`: id, org_id, `metric` INTERVIEW_RATE/OFFER_RATE/PLACEMENT_RATE, `industry_value` decimal(5,2) percent, updated_at. Unique `(org_id, metric)`. No UI edits it (admin work); it is read for "Industry".
Entities `MktGoal`, `MktBenchmark`; bare-`Repository` `MktGoalRepository`, `MktBenchmarkRepository`, `MktPerformancePlacementRepository`, `MktPerformanceFollowupRepository`, `MktPerformanceMatchRepository` (all methods take `orgId` first). Reads of applications/events/consultants/clients reuse the sibling `MktApplication*Repository` interfaces unedited.

## Demo data (`MktPerformanceDemoSeeder`)
On `ApplicationReadyEvent` (no shared class edited), same switches as the other demo seeds (`DEMO_ENABLED`, `ENT_DEMO_SEED`, never prod). Per demo org: default targets Submissions 200, Interviews 60, Offers 40, Placements 15, and industry Interview Rate 25%, Offer Rate 12%, Placement Rate 5%. Each table is filled only when the org has no rows in it. The numbers on the page come from the demo applications/placements/follow-ups, not from the board.

## Web
- Page `web/src/components/ent/marketer-ws/performance/` (`PerformancePage`, `Cards`, `Tables`, `Rail`, `bits`), lib `web/src/lib/ent/marketer-ws/performance.ts`, BFF `web/src/app/api/orgs/[orgId]/mkt/performance/route.ts` and `goals/route.ts`, dev mock `web/scripts/mock-mkt-performance.mjs` (the board's numbers), art `web/public/ent/marketer/performance/` (bee banner and five faces cropped from the board).
- New shared visuals in `packages/ui/src/enterprise/`: `line-chart.tsx` (`LineChart`, multi-line with end-point value bubbles) and `week-bars.tsx` (`WeekBarChart`, grouped bars with two-line labels), each with one export block in `index.ts` and a test. Everything else reuses `BarChart`-family pieces, `DonutChart`, `FunnelChart`, `Sparkline`, `DeltaChip`, `Select`, `Tooltip`, `Dialog`.
- Info icons (tooltip + accessible name) carry the exact formula: on every chart/table card and on the Follow-up Completion tile (as on the board). Period selects refetch the board with the period in the query.
- The pencil beside "Goals Progress" opens a dialog to set the caller's own monthly targets (not on the board; the only write on the page).

## Real vs empty
Everything is real rows. With no data the cards say "Numbers appear after your first week." (tiles "Nothing yet", readiness "No consultants are assigned to you yet.", actions "You're all caught up.", goals "No targets yet."). `avatarUrl` is null from the real API (initials); the mock/board returns the cropped faces by name.

## Known gaps
- The board's sixth tile is drawn taller with an extra orange sparkline that looks like a clipped neighbouring card; it is drawn as a normal wide tile with its real sparkline.
- The Follow-up Completion tile and benchmark deltas are relative changes (percent), not percentage points.
- Industry benchmarks have no editor yet.

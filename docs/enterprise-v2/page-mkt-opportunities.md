# Marketing workspace: Opportunities page (`/w/marketing/opportunities`)

Branch `mkt-opportunities` (cut from `ent-talent-marketer`). Board: `design/enterprise-marketer/opportunities.webp`. Brief: `mkt-page-brief.md`.
Permission `opportunities.manage` (read and write), resolved by `MktScope` (ASSIGNED for a Marketing Specialist, ORG for a manager/admin).

## What an opportunity is

A `requirement_match` row that is **ASSIGNED or SUGGESTED** for a job (`client_requirement`) whose status is OPEN or IN_REVIEW. The id on the wire is the
match id. The marketing state the talent foundation does not hold (the consultant's interest, the owner, the next action, the feed) lives in two new tables.

## Endpoints (`/api/orgs/{orgId}/mkt/opportunities`, `MktOpportunitiesResource`)

| Method | Path | What |
|---|---|---|
| GET | `` | The whole board in one call: `kpis`, `items`, `total/page/size`, `topMatches`, `responses` (donut), `activity`, `filters` (options). Query: `q`, `consultantId`, `clientId`, `interest`, `minScore`, `days` (default 30, 0 = any time), `stale`, `ready`, `sort` (recent/score/consultant/client/next), `dir`, `page`, `size` (max 100), `responseDays` |
| GET | `/{id}` | One opportunity + the same consultant's other open opportunities (Compare) + its timeline |
| GET | `/options?q=` | Consultants in scope + open jobs (Add Opportunity dialog) |
| GET | `/export` | The visible rows under the same filters as `text/csv` (names and job facts only; audited as `EXPORT`) |
| POST | `` | Add Opportunity `{consultantId, requirementId}`: a SUGGESTED match (reopens a DISMISSED one; 409 `OPPORTUNITY_EXISTS`, 409 `JOB_NOT_OPEN`) |
| POST | `/{id}/assign` | SUGGESTED to ASSIGNED, then asks the consultant for their interest. Needs an approved resume (409 `RESUME_NOT_APPROVED`), 409 `ALREADY_ASSIGNED` |
| POST | `/bulk-assign` | `{ids}` (max 50); the ones that cannot be assigned come back in `skipped` with a code |
| POST | `/{id}/request` | Follow Up `{kind: INTEREST|RESUME}`: records the request and moves the next action. Same request within an hour is not recorded twice. 409 `NOT_ASSIGNED`, `ALREADY_ANSWERED` |
| POST | `/notify` | Send Opportunity Notifications: asks every assigned consultant who has not answered (not asked in the last 24 h) |
| POST | `/{id}/review` | Records that the marketer reviewed it |
| PATCH | `/{id}/next-action` | `{nextActionAt}` (null clears; within -30 d .. +1 y) |

Every route: not a member / flag off / missing permission / another tenant / a consultant outside the caller's scope is the generic **404**.
Audit rows: `MARKETER_OPPORTUNITY_CREATE|ASSIGN|BULK_ASSIGN|REQUEST|NOTIFY`, `EXPORT`.

**E1:** nothing here sets `interest` (only the consultant's own workspace will), submits for a consultant, or signs in as one. Assign and Follow Up only
record a request (`mkt_opportunity.interest_requested_at` + a `mkt_opportunity_event`); the in-app notification record for the consultant belongs to the
consultant workspace and reads these rows.

## Tables (`20261104040000_mkt_opportunities.xml`)

- `uk_requirement_match_org_id` on `requirement_match (org_id, id)` (guarded, additive; the composite FK below needs it).
- `mkt_opportunity`: `org_id`, `match_id` (UNIQUE per org, composite FK to `requirement_match`), `interest` (VERY_INTERESTED / INTERESTED / OPEN / NOT_INTERESTED / NO_RESPONSE),
  `owner_member_id` (composite FK `org_member`), `next_action_at`, `last_response_at`, `interest_requested_at`, `created_at`, `updated_at`.
- `mkt_opportunity_event`: `org_id`, `opportunity_id` (composite FK), `kind`, `actor_member_id` (null = the consultant), `text` (short verb phrase), `occurred_at`.

Rows are created lazily by the first write (an opportunity with no row reads as NO_RESPONSE, owned by the consultant's marketer). `MktOpportunityDemoSeeder`
(runs on `ApplicationReadyEvent`, after the Home/Talent seeders, same `ENT_DEMO_SEED` switches, idempotent) gives Acme and Beta the board's interest mix.

## Derived values (all from rows)

- **Open Opportunities** = visible ASSIGNED/SUGGESTED rows on an open job. **Ready to Assign** = SUGGESTED, resume Updated, interest not NOT_INTERESTED.
  **Awaiting Consultant Review** = ASSIGNED with interest NO_RESPONSE. **Stale** = open with no activity for 14 days.
- "vs last month" = `(now - previous) / previous` where previous counts the same rows created (assigned for Awaiting) more than 30 days ago (the foundation's
  rule: no history table). **Stale has no honest previous value, so no delta is drawn.** Sparklines: weekly buckets of the last 8 weeks.
- **Resume Status**: the consultant's primary (else newest) org resume is APPROVED and updated in the last 120 days = Updated; otherwise Needs Update.
- **Button**: NOT_INTERESTED = Compare; resume Needs Update = Follow Up; SUGGESTED = Assign; ASSIGNED and interested = Review; otherwise Follow Up.
- **Next Action** is shown by calendar day (Today, 1 day, n days, Overdue). Top Opportunities = best score per job, 5 rows. Consultant Responses = counts per interest in the period.

## Web

`web/src/components/ent/marketer-ws/opportunities/` (`OpportunitiesPage.tsx`, `Dialogs.tsx`, `bits.tsx`), lib `web/src/lib/ent/marketer-ws/opportunities.ts` (+ `opportunities-bff.ts`),
BFF `web/src/app/api/orgs/[orgId]/mkt/opportunities/**`, dev mock `web/scripts/mock-mkt-opportunities.mjs`, art `web/public/ent/marketer/opportunities/` (11 faces cropped from the board).
Reuses `DonutChart` from `@kiwiply/ui` (`primitives/Charts.tsx`); no new shared visual.

## Known gaps

- The donut legend (shared `DonutChart`) shows the count as well as the percentage; the board shows the percentage only.
- Assign does not create a `talent_application` row (the Jobs page owns that); it only moves the match and records the request.
- No consultant-side notification record exists yet (the consultant workspace is not built): requests live in `mkt_opportunity` / `mkt_opportunity_event`.
- The list loads the caller's visible opportunities and filters/sorts/pages them in the service (fine at demo scale; a DB-side filter is the next step for very large orgs).
- Write endpoints do not use `Idempotency-Key`; the one-hour duplicate guard on requests and the 409s cover the double-click case.
- The real API returns `avatarUrl: null` (initials); the board photos are served only by the dev mock.
- `OrgIsolationIT.COVERAGE` was not edited (the brief forbids it): its route rows for `/api/orgs/{orgId}/mkt/opportunities/**` still have to be added by the owner.

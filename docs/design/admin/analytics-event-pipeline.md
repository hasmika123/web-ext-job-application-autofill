# Admin analytics and the event / metrics pipeline — real vs sample for every chart

Area `admin`. Stories: A11.*. Existing: `AdminAnalyticsService` (real DB aggregates: user counts, activation, applications by status, active users 7d/30d **proxied by refresh-token creation**, funnel, fill quality by ATS from `fill_event`, billing block computed over `subscriptionRepository.findAll()` with MRR from configured prices), GA4 on web (consent-gated, master switch default OFF) and extension (Measurement Protocol, default OFF). **No first-party product-event table.** Every time series on every board is SAMPLE.

## 1. Decisions

| # | Decision |
|---|---|
| D1 | **A first-party `product_event` table is the backbone**; GA4 stays optional marketing telemetry. Admin charts never read GA. Events are written server-side where the truth is (API services), plus a small allow-listed client event endpoint for things only the client knows (`page_view` on key routes, `drawer_opened`, `fill_started`). |
| D2 | **Daily rollups, not live scans.** `metric_daily(day, metric, dimension, value)` is computed at 00:20 UTC for yesterday and refreshed hourly for today. Charts read rollups; tiles for "today" read the live table bounded to 24 h. The 30-day board charts become `metric_daily` series. |
| D3 | **Activity = events, not refresh tokens.** DAU/WAU/MAU = distinct users with ≥ 1 `product_event` that day. The refresh-token proxy stays as a fallback for days before the table existed. |
| D4 | **Every tile delta ("↑ 12 % vs last 30 days") is computed from rollups or hidden.** No `*_TILE_EXTRAS` sample deltas remain on any admin page once A11.3 lands: the shared `AdminStatTiles` takes `{value, previous}` and renders the delta only when `previous` is a number. |
| D5 | **Sample forever (decorative, labelled)**: users-by-country (we don't store country — add `signup_country` from Cloudflare `CF-IPCountry` *later*, P2), acquisition channels (needs UTM capture at signup: P2), "engagement by feature" categories that don't exist (Data analysis, Reports, Team collaboration — replaced by real features in D6), the Email open/click rates until Brevo webhooks (email doc). Anything decorative is wrapped in `<SampleTag/>` **and** hidden when `NEXT_PUBLIC_ADMIN_SHOW_SAMPLE=false` (prod default). |
| D6 | **Real feature engagement** = distinct users per feature per period from events: `resume.saved`, `fill.completed`, `answer.drafted`, `match.viewed`, `job.saved`, `application.logged`, `inbox.connected`, `interview.practiced`, `autopilot.prepared`. |
| D7 | **Cohort retention** = week-of-signup cohorts × weeks since, from `product_event` (any event) — real once there are ≥ 4 weeks of events; before that the cell shows "—", never fabricated. |
| D8 | **Revenue follows entitlement, not the plan column** (12.5 rule) and MRR moves onto the catalog price rows at 18.5; until then the config prices stay. Add churn reason (Stripe cancellation survey mirror, A2.6) as a dimension. |
| D9 | **Privacy**: events carry `user_id` (nullable for anonymous), never free text, never field values, never URLs with query strings; deletion sets `user_id=NULL` (counts survive, the link doesn't), same as `ai_call`. Event names are an enum in code (`ProductEvents.java`), unknown names are refused at the client endpoint. |
| D10 | **BI export**: a nightly Parquet/CSV export of `metric_daily` + anonymised `product_event` to S3 (`kiwiply-analytics/`) is the "data warehouse" at this size (P2, A16). No external warehouse before Launch 2. |

## 2. Data model

```sql
CREATE TABLE product_event (
  id BIGINT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(40) NOT NULL, user_id BIGINT, anon_id CHAR(36),
  surface VARCHAR(10) NOT NULL,                  -- web|ext|api
  props JSON,                                    -- allow-listed keys only: ats, plan, feature, status, count, version
  occurred_at DATETIME NOT NULL, received_at DATETIME NOT NULL,
  INDEX (occurred_at), INDEX (name, occurred_at), INDEX (user_id, occurred_at)
);
CREATE TABLE metric_daily (day DATE NOT NULL, metric VARCHAR(40) NOT NULL, dimension VARCHAR(60) NOT NULL DEFAULT '', value DECIMAL(18,4) NOT NULL,
  PRIMARY KEY (day, metric, dimension));
CREATE TABLE user_cohort (user_id BIGINT PRIMARY KEY, signup_week DATE NOT NULL, plan_at_signup VARCHAR(20), surface VARCHAR(10));
```
Metrics (initial): `users.total`, `users.new`, `users.activated`, `users.dau`, `users.wau`, `users.mau`, `funnel.signed_up|verified|profile|first_fill|applied`, `feature.users.<feature>`, `fills.count|fields_found|fields_filled|fields_failed` by `ats`, `apps.count` by `status`, `revenue.mrr_cents`, `revenue.active_pro`, `revenue.new|churned|past_due`, `ai.cost_micros` by `feature`, `inquiries.new`, `bugs.new`, `email.sent|bounced` by `template`, `matches.sent|liked|dismissed`.

Event catalogue (server-written unless noted): `user.signed_up`, `user.verified`, `user.logged_in` (method), `profile.completed`, `resume.saved`, `resume.parsed`, `fill.completed` (from `fill_event`, counts only, no user link → `user_id` NULL on purpose), `fill.started` (client, ext), `answer.drafted`, `application.logged` (status), `job.saved`, `match.viewed|liked|dismissed`, `inbox.connected`, `subscription.started|renewed|cancelled|past_due`, `page.viewed` (client, route group only), `drawer.opened` (client).

## 3. API

```
POST /api/events  (auth or anon token; rate-limited 60/min)  body [{name, occurredAt, props}]  -> 202 ; unknown name -> 400 ; props filtered to allow-list
GET  /api/admin/analytics?from=&to=&plan=&surface=     -> tiles {value, previous} + series from metric_daily for: growth (new, dau), funnel, feature engagement, fills by ATS, apps by status, revenue, cohorts
GET  /api/admin/analytics/metric/{metric}?from=&to=&dimension=   -> generic series for any chart (one endpoint, many charts)
POST /api/admin/analytics/rollup/run?day=               -> OPS; recompute
GET  /api/admin/analytics/export.csv?metric=&from=&to=  -> HIGH audit ANALYTICS_EXPORT
```
Filters on board-14 (date range, plan, surface) become real; "acquisition channel" and "geography" stay disabled with a tooltip until their P2 stories.

## 4. Pipeline

```
service call ──> ProductEventRecorder.record(name, userId, props)   (same tx as the business write; @Async flush is NOT used: losing events silently is worse than 1 insert)
client ──> POST /api/events ──> validation ──> insert
00:20 UTC MetricRollupJob: for yesterday, every metric → metric_daily (idempotent upsert); hourly for today
AdminAnalyticsService reads metric_daily; the old live aggregates stay for backfill days and as a self-check (A11.6 compares and logs drift)
```

## 5. Failure modes

- Rollup missed a day → the job backfills up to 7 missing days on the next run; charts show a gap marker, not zero.
- Event volume spike (bot on `/api/events`) → rate limit + anon events capped at 1000/hour/IP; `product_event` partitioned by month when > 10 M rows (note in runbook; not needed at launch).
- Client clock wrong → `occurred_at` clamped to `received_at ± 1 h`.
- Table missing on an old deploy → recorder catches and logs; the business write never fails because of analytics.

## 6. Per-board real-vs-sample verdict (what A11 must deliver)

| Board | Chart | Today | Target |
|---|---|---|---|
| 21 Overview | growth bar/line | SAMPLE `GROWTH_*` | real `users.new` + `users.dau` |
| 21 Overview | platform health list | SAMPLE `PLATFORM_HEALTH` | real: actuator + job registry + HC checks (A10) |
| 21 Overview | tile deltas | SAMPLE | real previous-period |
| 9 Users | segments donut, role distribution, recent account actions, pending/suspended tiles | SAMPLE | real: segments from `activated`/flags/last event; roles from authorities; recent actions from `admin_audit_event`; pending = unactivated; suspended = BLOCKED flag |
| 14 Analytics | growth, funnel, engagement, cohorts | growth/engagement/cohorts SAMPLE, funnel real | all real (engagement with D6 features) |
| 14 Analytics | country, channels | SAMPLE | **decorative until P2** (needs data capture) |
| 18 AI | trend, alerts, daily limit | SAMPLE | real (ai doc) |
| 16 Job sources | performance, sync history | SAMPLE | real (`ingest_source_daily`) |
| 15 Email | open/click/bounce, campaigns, templates, automations | SAMPLE | open/click **decorative until Brevo webhooks**; bounce real from `mail_log`; campaigns = Brevo campaign list (read-only); templates/automations = real registry (email doc) |
| 12 Bugs | severity donut, crash trend, top recurring | SAMPLE | real from `bug_report` (`severity`, created per day, grouped by normalised message prefix) |
| 13 Inquiries | SLA chart, category mix, escalations | SAMPLE | real (first-response time needs `first_responded_at`, A8.2); escalations = priority HIGH + overdue |
| 11 System | all tiles/panels except health/info/loggers | SAMPLE | real (observability doc) |
| 10 Audit | high-risk/exports/access-review tiles, compliance strip | SAMPLE | real from the new audit columns (rbac doc) |
| 20 Customers | MRR tile + deltas, renewals/onboarding/churn-risk | MRR SAMPLE; panels derived live | MRR from `revenue.mrr_cents`; churn risk = rules (past_due, cancel_at_period_end, no event 14 d) |
| 17 Security | everything | SAMPLE | real (security doc) |

## 7. Tests

`ProductEventRecorderTest` (same-tx, allow-list filter, NULL user for fill), `MetricRollupJobTest` (fixture events → expected metric_daily; idempotent; backfill 7 days), `AdminAnalyticsResourceIT` (series shape; previous-period delta; filters), `EventsResourceIT` (unknown name 400; rate limit; anon cap), `AnalyticsDriftTest` (live vs rollup within 1 %), web: with `NEXT_PUBLIC_ADMIN_SHOW_SAMPLE=false` no `SampleTag` panel renders on `/admin/analytics`.

## 8. Mobile wireframe (390px) — analytics as a swipeable KPI deck

```
┌──────────────────────────────┐
│ Analytics   [30d ▾] [All ▾]  │
│ ┌──────────┐ ┌──────────┐    │
│ │ DAU  412 │ │ New  186 │    │
│ │ ↑18 %    │ │ ↑24 %    │    │
│ └──────────┘ └──────────┘    │
│ ◂ swipe for funnel / revenue ▸│
│ ╭──────────────────────────╮ │
│ │ ▁▂▃▃▅▆▅▇█ users.dau      │ │  <- one chart per card, full width
│ ╰──────────────────────────╯ │
│ Funnel  186 → 152 → 121 → 84 │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░ 33 %   │
└──────────────────────────────┘
```

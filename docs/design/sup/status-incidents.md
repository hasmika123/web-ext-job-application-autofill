# Design — Status page & incident communication (area `sup`, epic S7)

Status: decided 2026-10-11. The footer's "Status" link goes to `/contact`
(`web/src/components/marketing/nav.ts:131`). Gap G32 (`plat`) owns the monitors
(A10.1/A10.3/A10.5); this area owns **what users see**: the page, the banners, the words, the
per-ATS autofill status that no competitor publishes.

## 0. Summary

1. **Components, not servers.** Status is reported per thing a user feels: Web app · API · Extension
   sync · Inbox polling · Job ingest/matches · Autofill per ATS (Workday, Greenhouse, Lever, Ashby,
   …) · Email delivery · Billing (Stripe). Each has a state `OPERATIONAL · DEGRADED · OUTAGE ·
   MAINTENANCE` computed from (a) A10 health probes when they exist, (b) the per-ATS kill switch
   (A5.5) and fill-failure rate (S4.4), (c) a manual override by an incident.
2. **Incidents are written by humans**, short, timestamped updates in plain English (template:
   *what's affected · what you can do now · next update at*). Severity `MINOR · MAJOR · CRITICAL`.
   Post-mortem summary optional, public, blameless.
3. **Same incident drives three surfaces:** `/status` (public, no sign-in, works when the app is
   down because it is served from the marketing route and cached at the edge with stale-while-
   revalidate), an in-app banner, and an extension drawer banner through remote config — scoped to
   the affected adapter ("Workday autofill is degraded — fix in 0.66 rolling out").
4. **Subscribe** by email (Brevo double opt-in list "status", per component) and RSS/JSON feed.
5. **Honesty rules:** uptime numbers only once probes exist (never a hard-coded "99.9 %"); a manual
   DEGRADED set by support counts against the record like any other.

## 1. Data (MySQL, additive)

```
status_component   key VARCHAR(40) PK, name VARCHAR(80), group_ VARCHAR(20) (core|autofill|data|comms)
                   order_ INT, manual_state VARCHAR(12) NULL, manual_until DATETIME NULL
incident           id BIGINT PK, slug VARCHAR(80) UNIQUE, title VARCHAR(140), severity VARCHAR(10)
                   status VARCHAR(14) (INVESTIGATING|IDENTIFIED|MONITORING|RESOLVED)
                   components JSON (keys), started_at, resolved_at NULL, next_update_at NULL
                   postmortem_md TEXT NULL, created_by, INDEX(status, started_at)
incident_update    id, incident_id FK, status VARCHAR(14), body VARCHAR(2000), created_at, created_by
status_daily       component_key, day DATE, state_minutes JSON ({OPERATIONAL: 1430, DEGRADED: 10}), PRIMARY KEY(component_key, day)
status_subscriber  email, components JSON, confirmed_at NULL, token_hash, created_at   -- or Brevo list only
```

## 2. State computation

```
state(component) = max(severity) of
  manual_state if manual_until > now
  active incident states mapping (CRITICAL→OUTAGE, MAJOR→DEGRADED, MINOR→DEGRADED)
  probe state (A10): fail ≥ 3 consecutive → OUTAGE; p95 > SLO → DEGRADED
  autofill(ats): kill switch off → MAINTENANCE; site-report rate > 3× 7-day baseline → DEGRADED
```
Recomputed every minute by a scheduled job; result cached in `app_setting`-like key
`status.snapshot` (JSON) so `/status` and the banners read one row.

## 3. API

| Method | Path | Auth | Notes |
|---|---|---|---|
| `GET` | `/api/status` | public, cached 60 s | snapshot: components, active incidents, last 90 days per component |
| `GET` | `/api/status/incidents/{slug}` | public | timeline + post-mortem |
| `GET` | `/api/status/feed.{rss,json}` | public | last 20 incidents |
| `POST/PUT` | `/api/admin/status/incidents[/{id}]` | ADMIN | declare / update / resolve; audited `INCIDENT_UPDATE`; posting an update also pushes the banner and emails subscribers |
| `PUT` | `/api/admin/status/components/{key}` | ADMIN | manual override with expiry |
| `POST` | `/api/status/subscribe` | public, BFF 5/h/IP | double opt-in |

Extension: the existing remote-config payload (A5) gains `banners[]: {id, scope: adapter|all, text,
link, until}`; the drawer shows at most one, snoozable for 24 h; no new permission.

## 4. Failure modes

| Failure | Behaviour |
|---|---|
| API down ⇒ `/status` can't fetch | the page is pre-rendered with the last snapshot at build/ISR and shows "Last updated 12 min ago"; the banner on the marketing site switches to a static "We're looking into it" if the edge cache is older than 10 min |
| Incident forgotten open | `next_update_at` overdue ⇒ admin alert (A10) and the page says "Next update overdue" (honest) |
| False DEGRADED from a noisy site-report spike | baseline is 7-day median × 3 with a minimum of 10 reports; manual override can clear |
| Subscriber spam | double opt-in, Brevo list, unsubscribe in every mail |

## 5. Privacy

No user identifiers on the page; subscriber emails live in Brevo (already a subprocessor) and in
our table only as hash + token; unsubscribe is one click.

## 6. Cost

One scheduled job, one cached row, Brevo sends on incident updates only. No AI.

## 7. Tests

`StatusStateTest` (precedence of manual/incident/probe/autofill signals), `StatusResourceIT`
(snapshot shape, feed, subscribe double opt-in), web render tests for `/status` with a fixture
snapshot (390 px), extension `remote_banner.test.js` (scope filter, snooze), Playwright: declare
incident (mock) → banner appears in app within 60 s.

## 8. 390 px wireframes

```
┌──────────────────────────────┐  ┌──────────────────────────────┐  ┌──────────────────────────────┐
│ Kiwiply status               │  │ ⚠ Workday autofill degraded  │  │ ‹ Workday autofill degraded  │
│ ● All core systems normal    │  │ Fix in 0.66 rolling out.     │  │ Major · Investigating → Ident│
│ Core                         │  │ Review fields before submit. │  │ 09:40 Identified — a Workday │
│ ● Web app   ● API            │  │ [Details] [Snooze 24 h]  ✕   │  │ layout change broke step 2   │
│ ● Extension sync             │  │ (drawer banner, Workday only)│  │ dropdowns. Fix in 0.66.      │
│ Autofill                     │  │                              │  │ Next update: 12:00           │
│ ⚠ Workday · degraded  ›      │  │                              │  │ 08:55 Investigating — site   │
│ ● Greenhouse ● Lever ● Ashby │  │                              │  │ reports 4× baseline          │
│ Data & comms                 │  │                              │  │ [Subscribe to updates]       │
│ ● Inbox ● Jobs ● Email ● Pay │  │                              │  │                              │
│ Past 90 days ▁▁▁▁▂▁▁▁▁▁▁▁▁▁  │  │                              │  │                              │
│ [Subscribe] [RSS]            │  │                              │  │                              │
└──────────────────────────────┘  └──────────────────────────────┘  └──────────────────────────────┘
```

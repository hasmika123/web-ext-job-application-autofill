# Design — Product analytics: event pipeline, privacy, experiments (area `user`, epic U18)

Status: decided 2026-10-11 (Fable). Existing: GA4 helper (`web/src/lib/analytics.ts`, dark until
`NEXT_PUBLIC_ANALYTICS_ENABLED=true`), cookie-consent banner (PL.1), extension fill telemetry
(count-only, `fill_event`, 10.1), admin business analytics (A3 reads DB aggregates), `app_setting`.

## 0. Decisions

1. **First-party events are the source of truth for product analytics**; GA4 stays a marketing
   tool (landing/pricing, consent-gated) and is never used for signed-in behaviour.
2. **One endpoint, one table**: `POST /api/events` (batched, ≤ 50 per call) → `product_event`.
   Written by the web app (signed-in and anonymous pre-signup with a random `anon_id` cookie, first-
   party, 180 d) and later by the extension through `TrackingProvider` (fill telemetry already has a
   seam; U20.4 unifies the envelope). Never by the browser directly to Spring (BFF only).
3. **Privacy by schema**: events carry a **name from a fixed enum**, a ≤ 1 KB `props_json` validated
   against a per-event allow-list of keys (no free-form strings except enumerated values), `user_id`
   or `anon_id`, `surface`, `session_id` (rotates per 30 min idle), `app_version`, `ua_class`
   (mobile/desktop + browser family), `tz_offset`. **No URLs with query strings, no job titles typed
   by the user, no emails, no IPs.** Search terms are hashed (per-user SHA-256) for "repeat search"
   analysis and the raw string is kept only in a separate `search_term_daily` aggregate (term, count)
   with k ≥ 5 — never per user.
4. **Retention**: raw events 180 days; nightly rollups (`event_daily`: day, name, surface, plan,
   count, users) kept forever; `anon_id` → `user_id` stitched at signup (one update), then the anon
   cookie is dropped.
5. **Consent**: strictly-necessary + product analytics for signed-in users is covered by the ToS/privacy
   policy (legitimate interest, first-party, no third-party sharing) — stated in `/privacy` (U14.5).
   Anonymous marketing-page events obey the cookie banner like GA4 does (no consent → no `anon_id`
   cookie, events dropped client-side). A per-user **"Product analytics: off"** switch in Settings ›
   Privacy stops client sends and server rollups for that user (they are then counted only in totals
   derived from DB facts such as "applications created").
6. **Experiments** ride on ADMIN 9.B2 feature flags: a flag with `rollout_percent` buckets by
   `murmur3(user_id + flag_key) % 100`; the assigned variant is attached to every event as
   `exp:{key}=variant` props for the flag's `tracked_keys`. No third-party A/B tool.
7. **Funnels are defined in code, read in admin**: `FunnelDefinition` (ordered event names + window)
   evaluated by `AdminAnalyticsService` over `product_event` (A-area story reads this doc) —
   signup → verified → activated → first_save → first_apply → first_reply → paid.

## 1. Event taxonomy (v1; names are stable, snake_case; `surface` is web|ext|pwa)

| Area | Events (props) |
|---|---|
| Auth | `signup_started(method)`, `signup_completed(method)`, `email_verified(auto_session:bool)`, `login(method, new_device:bool)`, `passkey_registered`, `logout` |
| Onboarding | `onboarding_step(step:1..5, skipped:bool)`, `onboarding_completed(duration_s)`, `activated(path: jobs|resume|alert)`, `ext_link_sent` |
| Search | `search(q_hash, filters:[enum], results_bucket: 0|1-5|6-20|21+, took_ms_bucket)`, `search_relax_used(kind)`, `job_opened(source_kind, from: search|match|alert|assistant|dashboard)`, `job_saved(from)`, `job_hidden`, `job_feedback(signal)`, `job_scored(cached:bool)`, `apply_clicked(ats, has_extension:bool)` |
| Alerts/notifications | `alert_created(frequency, channels)`, `alert_paused`, `push_prompt_shown`, `push_permission(result)`, `notification_opened(kind, channel)`, `digest_opened(kind)` (via tokenised link) |
| Tracker | `application_created(source)`, `status_changed(from,to,source)`, `note_added`, `interview_added(kind, source)`, `ics_exported`, `inbox_suggestion(action)` |
| Inbox | `inbox_connect_started`, `inbox_connected`, `inbox_disconnected(reason)` |
| Profile/resume | `profile_completeness(bucket)`, `resume_uploaded(parsed_ai:bool)`, R-stories own builder events |
| AI | `assistant_message(tool_count, cost_bucket)`, `assistant_confirm(tool, approved)`, `ai_budget_hit(percent:80|100)` |
| Billing | `upgrade_sheet_shown(trigger: 402|nav|card)`, `checkout_started(price)`, `checkout_completed`, `portal_opened`, `plan_changed(from,to)` |
| Engagement | `streak_day(n)`, `goal_set(kind,n)`, `goal_met`, `recap_opened`, `referral_link_copied`, `referral_signup` |
| PWA/perf | `pwa_install_prompt(result)`, `pwa_installed`, `offline_shown(route)`, `web_vital(name, value_bucket, route)` |
| Errors | `client_error(route, code)` (no messages/stack), `api_error(status, route)` |

Each name maps to an allow-list of prop keys and value enums in `web/src/lib/events.ts` (TS) and
`ProductEventSchema` (Java) — both generated from one `docs/design/user/events.json`? Decision:
**the Java enum is the source**; the TS list is checked by a unit test that reads the Java file in CI
(simple regex) so they cannot drift.

## 2. Data model

```
product_event      id BIGINT PK, at TIMESTAMP(3), name VARCHAR(48), user_id BIGINT NULL, anon_id CHAR(26) NULL (ULID), session_id CHAR(26),
                   surface VARCHAR(8), plan VARCHAR(10) NULL, app_version VARCHAR(16), ua_class VARCHAR(24), tz_offset SMALLINT, props_json JSON NULL
                   INDEX (name, at), INDEX (user_id, at), INDEX (anon_id)      -- partition by month later if needed
event_daily        day DATE, name, surface, plan, count INT, users INT, PRIMARY KEY (day, name, surface, plan)
search_term_daily  day, term VARCHAR(80), count, PRIMARY KEY (day, term)      -- written only when count ≥ 5 at rollup
user_analytics_opt user_id PK, product_analytics BOOL DEFAULT TRUE, updated_at
ALTER TABLE user ADD COLUMN activated_at TIMESTAMP NULL, ADD COLUMN first_apply_at NULL, ADD COLUMN first_reply_at NULL  -- funnel milestones (also derived, kept for speed)
```
Rollup job nightly 03:10 UTC; raw purge after 180 d; both idempotent.

## 3. Client

`web/src/lib/events.ts`: `track(name, props)` validates (dev: throws; prod: drops + console.warn),
queues in memory, flushes every 5 s / 20 events / `visibilitychange` via `navigator.sendBeacon` to
`/api/events` (Next BFF adds user id from the cookie, validates again, forwards). Web vitals from
`web-vitals`-style `PerformanceObserver` (no dep: LCP/INP/CLS via `PerformanceObserver` directly).
The old `analytics.ts` keeps GA4 for marketing pages only.

Server: `ProductEventResource` (auth optional for anon), per-IP + per-user rate limit (600/10 min),
rejects unknown names/keys with 400 (counted in admin as "schema drift"), clamps string lengths.

## 4. Privacy analysis

- Lawful basis: legitimate interest for signed-in product analytics (first-party, no sharing, opt-out
  switch) — the policy text names the categories; marketing-page analytics stays consent-based.
- DSAR: a user's raw events (180 d) are included in the export as CSV; account deletion deletes
  `product_event` rows by `user_id` (anon rows stitched to the user too) and leaves only `event_daily` counts.
- No PII in props by schema; the BFF strips anything not on the allow-list before forwarding.
- Admin funnel views are aggregates; per-user timelines in admin exist only for the support
  "debug panel" (9.C4) and are reason-logged there.

## 5. Tests

- `ProductEventSchemaTest`: every name has an allow-list; TS list equals Java enum (CI regex test).
- `ProductEventResourceIT`: batch limits, unknown name 400, anon → user stitch at signup, opt-out drops.
- `EventRollupJobIT`: daily counts/users, k-anonymity for search terms, purge at 180 d.
- Web unit (vitest, added in U19.3): queue/flush/beacon; props validation; no event when opted out.

## 6. Rollout

U18.1 schema + endpoint + client lib (3 events: `login`, `search`, `job_saved`) → U18.2 full taxonomy
wired into each page as its epic lands (every story's AC names its events) → U18.3 rollups + funnel
definitions + the admin funnel tile (A-area consumes) → U18.4 privacy switch + DSAR + policy copy →
U18.5 experiments via flags.

# Runtime settings, feature flags, kill switches, announcements, extension remote config

Area `admin`. Stories: A5.*. Source: ADMIN-PLAN 9.B1/9.B2. Existing: `app_setting` table (20261011010000, key/value, **no service uses it** — `AppSettingService` was removed when the demo switch moved to `DEMO_ENABLED`; `AppSetting.java` + `AppSettingRepository.java` are dead code to revive).

## 1. Decisions

| # | Decision |
|---|---|
| D1 | **One typed, bounded settings registry in code** (`SettingDefinitions.java`): key, type (`BOOL|INT|DECIMAL|STRING|ENUM|JSON`), default (= the env value today), min/max or allowed values, description, area, risk. **Unknown keys are refused** — admin can change values, never invent settings. |
| D2 | **Env is the default; the DB row is the override.** `SettingsService.get(key)` = DB value if present and in bounds, else the env/property default. In-memory cache, 60 s TTL, plus an explicit bump on write (single instance today; a `settings_version` row makes multi-instance safe later). |
| D3 | **Every change is audited** (`SETTING_CHANGE`, risk from the definition) with before/after and a required reason for HIGH keys (kill switches, caps, min extension version). |
| D4 | **Feature flags are settings of type `FLAG`**: value = `{"on":bool,"pct":0-100,"allow":["login"],"deny":["login"]}`. Evaluation: deny → allow → pct bucket (`crc32(flag+login) % 100 < pct`) → on. Bucketing is stable per user, so a beta cohort doesn't flicker. |
| D5 | **Announcements are rows, not settings** (`announcement` table): audience (web, extension, both), level (info/warn), text, link, starts/ends, dismissible. The extension and web poll `GET /api/config/client` every 15 min (ETag). |
| D6 | **Extension remote config is data only** (CWS rule: no remote code): `ext.min_version`, `ext.ats.<family>.enabled` (per-ATS kill switch: the engine refuses to run the adapter and shows "Filling on X is paused"), `ext.rules_version_hint`. Delivered on the same `/api/config/client` endpoint as the announcement and the plan features (18.3 `GET /api/profile/version` gains `features[]`; `/api/config/client` is the unauthenticated sibling). |
| D7 | **Maintenance mode is a flag** (`ops.maintenance`): web shows a banner and blocks writes; API returns 503 `MAINTENANCE` for non-admin writes; admins keep full access. Reads keep working. |

## 2. Registry (initial keys)

| Key | Type | Default (env) | Bounds | Risk |
|---|---|---|---|---|
| `ai.enabled` | BOOL | `DOSSIER_AI_ENABLED` | — | HIGH |
| `ai.feature.{resume,answers,matches,interview,tailor,chat}.enabled` | BOOL | true | — | HIGH |
| `ai.model.{draft,pick,map,enrich,parse,match,interview}` | ENUM | current constants | allowed model list | MEDIUM |
| `ai.economy_model` | ENUM | flash-lite | list | MEDIUM |
| `ai.soft_cap_pct` | INT | 80 | 50–95 | MEDIUM |
| `ai.daily_cost_cap_cents` / `ai.monthly_cost_cap_cents` | INT | 4000 / 60000 | 500–50000 / 5000–500000 | HIGH |
| `ai.free_parses_per_month` | INT | 3 | 1–10 | MEDIUM |
| `ai.output_tokens_max.{task}` | INT | current | 256–8192 | MEDIUM |
| `jobs.match_threshold` | INT | 60 | 40–90 | MEDIUM |
| `jobs.candidates_per_user` | INT | 50 | 10–100 | MEDIUM |
| `jobs.posting_age_hours` | INT | 48 | 12–168 | LOW |
| `jobs.daily_target` | INT | 15 | 3–20 | LOW |
| `jobs.disable_after_failures` | INT | 5 | 2–20 | LOW |
| `inbox.poll_minutes` | INT | 15 | 5–120 | MEDIUM |
| `inbox.retention_days` | INT | 365 | 30–730 | HIGH |
| `ops.error_digest.to` / `ops.error_digest.interval_min` | STRING / INT | env | 5–120 | LOW |
| `ops.maintenance` | FLAG | off | — | HIGH |
| `ext.min_version` | STRING | current | semver | HIGH |
| `ext.ats.{workday,greenhouse,lever,ashby,smartrecruiters,icims,generic}.enabled` | BOOL | true | — | HIGH |
| `flag.autopilot` / `flag.interview_practice` / `flag.resume_builder_v2` | FLAG | off | — | MEDIUM |
| `ratelimit.{authenticate,inquiries,bug_reports,newsletter}.per_hour` | INT | current | 1–1000 | MEDIUM |
| `catalog.stripe.pct_bp` / `catalog.stripe.fixed_cents` | INT | 290 / 30 | — | LOW |
| `email.daily_send_cap` | INT | 250 | 50–10000 | MEDIUM |

Out of admin (decided): secrets, AI prompts, security rules, schema, adapter code.

## 3. Data model

```sql
-- reuse app_setting (setting_key PK, setting_value varchar(1000), updated_by, updated_date); add:
ALTER TABLE app_setting ADD COLUMN reason VARCHAR(500), ADD COLUMN previous_value VARCHAR(1000);
CREATE TABLE app_setting_history (id BIGINT AUTO_INCREMENT PRIMARY KEY, setting_key VARCHAR(100), old_value VARCHAR(1000),
  new_value VARCHAR(1000), actor_login VARCHAR(50), reason VARCHAR(500), changed_at DATETIME, INDEX (setting_key, changed_at));
CREATE TABLE announcement (id BIGINT AUTO_INCREMENT PRIMARY KEY, audience VARCHAR(10) NOT NULL, level VARCHAR(10) NOT NULL,
  title VARCHAR(120) NOT NULL, body VARCHAR(500), link VARCHAR(300), starts_at DATETIME NOT NULL, ends_at DATETIME,
  dismissible BOOLEAN NOT NULL DEFAULT TRUE, created_by VARCHAR(50), created_at DATETIME, archived_at DATETIME);
```

## 4. API

```
GET  /api/admin/settings?area=                  -> [{key,type,value,default,source:"env|db",min,max,allowed,description,risk,updatedBy,updatedAt}]
PUT  /api/admin/settings/{key} {value, reason?}  -> 400 OUT_OF_BOUNDS | UNKNOWN_KEY; HIGH keys need reason + fresh re-auth
DELETE /api/admin/settings/{key}                -> back to env default; audited
GET  /api/admin/settings/{key}/history
GET/POST/PUT /api/admin/announcements ; POST /{id}/archive
GET  /api/config/client?platform=web|ext&v=      -> no auth, ETag, 5-min cache: {announcements[], ext:{minVersion, ats:{...}}, flags:{public ones}, maintenance}
GET  /api/config/flags  (auth)                   -> flags evaluated for the caller: {autopilot:true,...}  (web + extension use this)
```
Server-side use: `settings.getInt("jobs.match_threshold")` replaces `JobBoardProperties`/`@Value` reads **one call site at a time**, each behind its own story AC ("env still works when the row is absent").

## 5. Failure modes

- Bad value typed → refused by bounds (D1); the UI shows the bounds inline.
- DB down → cache serves last values; after TTL, defaults from env; never a crash (settings reads are `try/catch` + fallback).
- A kill switch flipped by mistake → history + one-tap "revert to previous" (writes a new history row).
- Extension on an old version after `ext.min_version` bump → drawer shows "Update Kiwiply to keep filling" with the store link; it blocks *filling*, not reading.
- Percent flag + login-less extension context → extension calls `/api/config/flags` with its token; unauthenticated = `pct` treated as 0.

## 6. Security

Only ADMIN/OPS can ACT; FINANCE/SUPPORT can VIEW. `/api/config/client` is public and must never carry secrets or per-user data (test asserts the response schema). Maintenance mode exempts `/api/admin/**`, `/api/authenticate`, `/management/health`.

## 7. Tests

`SettingDefinitionsTest` (every key has bounds/defaults; env fallback), `SettingsServiceTest` (override wins, out-of-bounds refused, cache bump on write), `FlagEvaluatorTest` (deny > allow > pct > on; stable bucket), `AdminSettingsResourceIT` (HIGH requires reason; history row written; normal user 403), `ClientConfigIT` (ETag 304; no auth; schema), extension unit test (`ext.ats.workday.enabled=false` → adapter refuses with the paused message; min-version compare).

## 8. Mobile wireframe (390px) — flip a kill switch

```
┌──────────────────────────────┐
│ Settings › AI › Features     │
│ Job matching (AI)      [●on] │
│ ─ tap ─────────────────────▼ │
│ ┃ Turn OFF job matching?     │  <- bottom sheet
│ ┃ Users see "Matches paused".│
│ ┃ Reason (required)          │
│ ┃ [ Gemini 5xx spike       ] │
│ ┃ [ Turn off ]  [ Cancel ]   │  <- then re-auth sheet (HIGH)
└──────────────────────────────┘
```

## 9. Feature registry — everything is admin-configured (user decision 2026-10-11; stories A5.7–A5.9)

**Rule (CLAUDE.md, Expansion):** every feature's on/off switch, price, limit, cap, quota and default is
driven by config from the app admin settings page — never hard-coded. Code ships safe defaults; admin
decides. The settings registry (§1–§2), the flags (D4), the catalog (`catalog-margin-entitlements.md`) and
the extension remote config (D6) are the four stores; the **feature registry** binds them per feature.

| # | Decision |
|---|---|
| D8 | **One `FeatureDefinition` per feature** (closed, typed, in code): `key` (`<area>.<feature>`), area, description, **global switch** = setting `feature.<key>.enabled` (default from the story), **per-plan default** = the catalog entitlement (`FeatureKey`, B1.1), **per-org override** = `entitlement_grant` rows (ORG_ASSIGNMENT / ADMIN_COMP), **numeric limits** = settings (`<area>.<key>`) or entitlements with bounds, risk level. A gate that names an unregistered key fails `FeatureRegistryTest` (ArchUnit) — same pattern as `ShareMatrixTest`. |
| D9 | **Evaluation order** in `FeatureGate.require(key)` / `limit(key)`: global switch → flag (D4: deny > allow > pct > on) → plan entitlement (`EntitlementService`, still the only entitlement source of truth; Stripe webhooks the only writer of subscription grants) → org override → user control (consent / per-feature switch). Errors carry the key: `402 PLAN_REQUIRED {feature}`, `503 FEATURE_PAUSED {feature}`. |
| D10 | **Key naming across the roadmap.** Stories phrase every tunable as **setting `` `<area>.<key>` (default X) ``**, **entitlement `` `<key>` (catalog default …) ``**, **remote-config `` `ext.<key>` ``** or **flag `` `flag.<name>` ``**. Areas used: `ai`, `jobs`, `notify`, `tracker`, `user`, `engage`, `referral`, `analytics`, `uploads`, `storage`, `ratelimit`, `email`, `security`, `admin`, `support`, `help`, `mkt`, `public`, `seo`, `org`, `org.ops`, `services`, `catalog`, `billing`, `handoff`, `mob`, `builder`, `plat`, `ext`. The registry's **initial key list is generated from those mentions** (`docs/roadmap/areas/*.json`, `docs/resume-builder/stories.json`); `RoadmapSettingsParityTest` fails when a mentioned key is missing or a default disagrees. |
| D11 | **Prices are catalog values, never constants.** The CLAUDE.md prices (Pro $19.99 / $49.99 → $24.99 / $54.99 at Launch 2, Autopilot $39.99 / $99.99) are the **initial catalog seed** (B1.1, A3.1); every later price (Student, Lite, top-up, org items, services, Consultancy Ops) is created as a product and priced from the admin Catalog page (A3.4) behind the margin guard. |
| D12 | **Constants that stay hard** (rules, not settings): no auto-submit / no CAPTCHA bypass; the never-collected PII classes; the margin floors' **hard minimums** (80 % / 20 % — the floor itself is a setting that cannot go below them); the Autopilot ceilings (30 / day, 300 / period — `autopilot.apps_per_*` may be lowered, never raised, and the extension treats them as hard maxima remote config cannot lift); retention and notice **floors** (7 y financial records, 3 y billing consent, 30 / 45-day DSAR SLAs, 14-day material-change notice, 30-day price-change notice); security rules (lockout ladders, token TTLs, HMAC windows, CSP); k-anonymity minimums; UI/a11y constants (44 px, 390 px, 16 px) and engineering/test budgets (p95, Lighthouse, bundle sizes, CI thresholds); ops cron times on the box. |
| D13 | **One settings page** (A5.8): `/admin/settings` grouped by area, a Features tab showing global switch · per-plan matrix · per-org overrides · limits inline, search, history + revert; HIGH changes need a reason + re-auth. |
| D14 | **Every surface reads the evaluated config** (A5.9): `GET /api/config/me` (auth) and `/api/config/public`; web `useConfig()`, extension `JAF.config`, API `FeatureGate`. CI lint (`no-hardcoded-gate`, ArchUnit) refuses plan-name comparisons and numeric limits outside the config module. |

Evaluation sketch:

```
FeatureGate.require("ai.server")           // 402 PLAN_REQUIRED {feature:"ai.server", upgrade{...}}
FeatureGate.limit("matches.per_day")       // 3 on Free, 20 on Pro; org override wins if higher; admin comp highest
settings.getInt("notify.mobile_daily_cap") // 3 unless an admin changed the row (bounds 1–10)
flags.isOn("flag.ops_timesheets", login)   // off by default; pilot cohort via the allow list
```

Registry additions implied by the roadmap sweep (each with the story's default as the env default):
`feature.*.enabled`, `ai.cap.<feature>.daily`, `ai.cap.draft.per_fill`, `ai.cap.call_cost_micros`,
`ai.free_parse_reserved_pct`, `ai.answer_cache_ttl_days`, `ai.assistant_memory_retention_days`,
`ai.sample_retention_days`, `ai.alert.feedback_spike_pct`, `ai.budget.ops_scan_cents_per_consultant`,
`jobs.instant_matches`, `jobs.instant_max_age_hours`, `jobs.search_result_cap`, `notify.*`, `tracker.*`,
`user.next_action.*`, `engage.streak_*`, `referral.*`, `analytics.*`, `uploads.*`, `storage.*`, `ratelimit.*`,
`email.send_cap_alert_pct`, `security.event_retention_days`, `security.ip_block_hours`, `admin.*`, `support.*`,
`help.ai.*`, `mkt.*`, `public.stats_floor.*`, `public.ats_check.max_bytes`, `seo.index.*`, `org.*`, `org.ops.*`,
`services.*`, `catalog.margin_floor_*_pct` (hard minimums 80 / 20), `catalog.cap_hit_alert_pct`, `catalog.promo.*`,
`catalog.org_price_premium_warn_pct`, `billing.*`, `handoff.expiry_days`, `mob.review_prompt.interval_days`,
`builder.version_retention_auto`, `plat.alert.*`, `ext.*` (remote config, clamped); flags `flag.ats_check`,
`flag.help_ai`, `flag.matches_semantic`, `flag.ops_timesheets`, `flag.referrals`, `flag.review_prompt`,
`flag.share_resolve`.

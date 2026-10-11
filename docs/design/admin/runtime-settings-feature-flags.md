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

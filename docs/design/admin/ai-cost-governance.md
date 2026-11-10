# AI cost governance: budgets, per-feature cost, anomaly alerts, kill switches, abuse

Area `admin`. Stories: A4.*. Inputs: `ai_call` ledger (20260922020000), `ai_quota_override` → budget (20260922030000), `AiBudgetService`, `AdminAiUsageResource` (`GET /api/admin/ai-usage?period=`), the policy `dossier.ai.policy.disabled-tasks`, the global `DOSSIER_AI_ENABLED` (DEPLOY §10), locked limits in CLAUDE.md (Pro $3/mo · $8/qtr, Autopilot $6/mo · $16/qtr, Free = parse only).

## 1. Decisions

| # | Decision |
|---|---|
| D1 | **The `ai_call` ledger is the single truth for cost.** No separate counters: every chart, alert and budget reads `cost_micros` grouped by `login`, `task`, `model`, day. Add `feature` (coarser than `task`: `resume`, `answers`, `matches`, `interview`, `tailor`, `chat`) and `org_id` columns additively; `login` stays nullable for erasure. |
| D2 | **Three budget layers, each a hard stop:** per-user per-billing-period (catalog entitlement `ai.budget_cents_per_period`, or an `ADMIN_COMP` grant), **platform daily budget** (runtime setting `ai.daily_cost_cap_cents`, default $40), **platform monthly budget** (`ai.monthly_cost_cap_cents`, default $600). When the platform cap is hit, server AI returns 503 `AI_PAUSED` with a retry-after; Free resume parsing keeps a reserved 10 % slice so onboarding never breaks. |
| D3 | **Kill switches are runtime settings, not deploys:** `ai.enabled` (global), `ai.feature.<feature>.enabled` (per feature), `ai.model.<task>` (model routing), `ai.economy_model` (fallback when > 80 % of the monthly cap). They live in `app_setting` (see runtime-settings doc) with bounds and audit; env stays the default. |
| D4 | **Anomaly detection is rules, not ML:** per-user spend > 3× their trailing 7-day median *and* > $0.50 in 24 h; per-feature spend/hour > 2.5× the same hour last week; any user > 40 % of the daily platform cap; cost per call for a task > 2× its 30-day p95 (model drift / prompt bloat); error rate for the provider > 5 % in 15 min. Each fires an `ai_alert` row once per (rule, subject, day), emailed via the error-digest channel (`ErrorDigestService`) and shown on `/admin/ai`. |
| D5 | **Abuse = pattern + action, with a human in the loop.** Rules flag; admin acts (throttle to 50 %, pause server AI for the user, or block). Automatic action only for the platform cap and for a user exceeding their own budget (already a 402). |
| D6 | **The "cap-hit" metric is first class**: `% of paying users at 100 % of budget this period` on `/admin/ai` and `/admin/catalog`; > 5 % shows the red "decide with data" banner (ROADMAP 1207). |
| D7 | **Cost attribution per feature feeds the margin guard**: the catalog's worst case uses the budget, but the *actual* per-plan AI cost per user (`avg cost / paying user / period`) is shown next to it (A2.8 unit economics). |

## 2. Data model (additive)

```sql
ALTER TABLE ai_call ADD COLUMN feature VARCHAR(20), ADD COLUMN org_id BIGINT, ADD COLUMN success BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN latency_ms INT, ADD COLUMN provider VARCHAR(20) DEFAULT 'gemini';
CREATE INDEX ix_ai_call_feature_created ON ai_call(feature, created_at);
-- failed calls now get a row with success=false, cost_micros=0 (today only successful calls are written)

CREATE TABLE ai_daily_rollup (                 -- written by a 00:10 UTC job + on demand; the charts read this, not ai_call
  day DATE NOT NULL, feature VARCHAR(20) NOT NULL, model VARCHAR(80) NOT NULL, plan VARCHAR(20) NOT NULL,
  calls INT NOT NULL, failed INT NOT NULL, users INT NOT NULL, input_tokens BIGINT, cached_tokens BIGINT, output_tokens BIGINT,
  cost_micros BIGINT NOT NULL, p95_latency_ms INT,
  PRIMARY KEY (day, feature, model, plan)
);
CREATE TABLE ai_alert (
  id BIGINT AUTO_INCREMENT PRIMARY KEY, rule VARCHAR(40) NOT NULL, severity VARCHAR(10) NOT NULL,   -- LOW|MEDIUM|HIGH
  subject_type VARCHAR(20) NOT NULL, subject_id VARCHAR(191),                                        -- USER|FEATURE|PLATFORM|PROVIDER
  observed BIGINT, baseline BIGINT, message VARCHAR(500), created_at DATETIME NOT NULL,
  acked_by VARCHAR(50), acked_at DATETIME, action VARCHAR(30),                                       -- NONE|THROTTLED|PAUSED|BLOCKED
  UNIQUE (rule, subject_type, subject_id, created_day)  -- created_day DATE generated column
);
CREATE TABLE ai_user_control (                 -- the admin's per-user lever; replaces nothing, sits beside the budget
  login VARCHAR(50) PRIMARY KEY, mode VARCHAR(10) NOT NULL,            -- NORMAL|THROTTLED|PAUSED|BLOCKED
  reason VARCHAR(500), set_by VARCHAR(50), set_at DATETIME, expires_at DATETIME
);
```
`ai_quota_override` is folded into `entitlement_grant` (catalog doc) at 18.5; until then it stays and `AdminAiQuotaService` keeps clamping 0..100000 cents. Account deletion must delete `ai_quota_override` and `ai_user_control` rows by login (gap found in audit: `AccountDeletionService` has no `AiQuotaOverrideRepository`).

## 3. Cost model

Provider prices per model live in `app_setting` (`ai.price.<model>.input_per_mtok_micros` etc.) so a price change is an admin edit; `AiCallRecorder` computes `cost_micros` from them at call time (today the numbers are code constants — move them). Budget period = subscription billing period (15.5 rule, `AiBudgetService` sums per period). Worst-case platform spend = Σ paying users × budget; the dashboard shows "committed budget this month" vs. "spent", so the owner sees the exposure, not just the bill.

## 4. API

```
GET  /api/admin/ai/overview?from=&to=     -> tiles {calls, users, tokens, costMicros, capHitPct, platformDaily:{spent,cap}, platformMonthly:{spent,cap}}
                                             series [{day, calls, users, costMicros}] (from ai_daily_rollup), features[], models[], plans[]
GET  /api/admin/ai/users?period=&sort=cost -> paged {login, plan, calls, costMicros, budgetCents, pctOfBudget, control}
GET  /api/admin/ai/alerts?acked=false      -> ai_alert rows
POST /api/admin/ai/alerts/{id}/ack {action, reason}   -> MEDIUM audit AI_ALERT_ACK
PUT  /api/admin/ai/users/{login}/control {mode, reason, expiresAt}  -> HIGH if BLOCKED; audit AI_USER_CONTROL
GET  /api/admin/ai/settings                -> the ai.* runtime settings with bounds (delegates to /api/admin/settings?prefix=ai.)
PUT  /api/admin/settings/ai.feature.matches.enabled {value:false, reason}  -> HIGH audit SETTING_CHANGE (kill switch)
POST /api/admin/ai/rollup/run              -> OPS; recompute today's rollup
```
Enforcement point: the single AI gateway (`AiPolicy`/`AiDraftService` + `AiBudgetService.requireBudget`) checks, in order: global switch → feature switch → platform daily/monthly cap → user control → user budget. Each refusal has its own ProblemDetail code: `AI_DISABLED`, `AI_FEATURE_DISABLED {feature}`, `AI_PAUSED {retryAfter}`, `AI_USER_PAUSED`, `AI_BUDGET_EXHAUSTED {resetsAt}` (existing 402 path).

## 5. Alert pipeline

```
ai_call insert ──> (same tx) ──> AiAlertEvaluator.onCall(login, feature, cost)   -- cheap: compares to cached baselines
                                   │ fires → ai_alert row (dedup by UNIQUE) → ErrorDigestService.enqueue(AI_ALERT)
00:10 UTC job: ai_daily_rollup for yesterday; recompute baselines (7-day medians per user, hourly per feature) into memory cache
```
Email digest subject: `[Kiwiply] AI alert: <rule> for <subject>`, at most every 15 min (reuses the digest throttle). HIGH alerts (`PLATFORM_CAP_80`, `PLATFORM_CAP_100`, `PROVIDER_ERRORS`) send immediately.

## 6. Failure modes

- Rollup job missed → the overview falls back to a live `ai_call` aggregate for the missing days (bounded to 31 days) and shows a "rollup stale" chip; OPS gets a system-event.
- Provider price table missing a model → cost recorded as 0 and an alert `UNPRICED_MODEL` fires HIGH (silent under-counting is the worst outcome).
- Clock drift across billing periods → `AiBudgetService` already uses `current_period_end`; a user with no subscription row uses the calendar month.
- Alert storm (e.g. a new feature launches) → dedup per day + a per-rule mute from the UI (`ai_alert_mute` stored as a runtime setting `ai.alert.mute.<rule>` with an expiry).

## 7. Security / privacy

No prompts, no answers, ever (ledger rule, 20260922020000 comment). Per-user AI pages show spend + counts only; SUPPORT may VIEW, OPS/ADMIN may ACT. Blocking a user is HIGH and emails all admins. Erasure sets `login=NULL` on `ai_call` (existing), deletes `ai_user_control`, `ai_quota_override`.

## 8. Tests

`AiAlertEvaluatorTest` (each rule: fires at threshold, not below; dedup within a day), `AiGatewayOrderTest` (refusal order and codes), `AiDailyRollupTest` (sum equals ledger for a fixture day), `AdminAiResourceIT` (control PAUSED makes the next draft call 403 `AI_USER_PAUSED`; kill switch flips a feature; normal user forbidden), `AccountDeletionServiceTest` (override + control rows removed).

## 9. Rollout

1. Ledger columns + failed-call rows. 2. Rollup job + overview endpoint; `/admin/ai` charts switch from `AI_TREND_*` sample to real. 3. Platform caps + kill switches on runtime settings (needs A5.1). 4. Alerts + ack UI. 5. User controls. 6. 18.5 folds the override into grants.

## 10. Mobile wireframe (390px) — the AI triage card and a kill switch

```
┌──────────────────────────────┐
│ AI usage            Oct 11   │
│ Today  $12.40 / $40 ▓▓▓░░░░  │
│ Month  $287 / $600  ▓▓▓▓░░░  │
│ Cap-hit users  3.1 % (ok)    │
├──────────────────────────────┤
│ ⚠ HIGH  sophie.lee 3.2× her  │
│   7-day median · $1.42 today │
│   [Throttle] [Pause] [Ack]   │  <- 44px buttons; Pause opens re-auth sheet
├──────────────────────────────┤
│ Features                     │
│ Resume help   ● on   $5.10   │
│ Job matching  ● on   $3.20   │
│ Interview     ○ off  —       │  <- toggling = kill switch, reason required
└──────────────────────────────┘
```

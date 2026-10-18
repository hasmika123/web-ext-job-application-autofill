# Design — The AI gateway: one entry point, metering v2, budgets and caps (area `ai`, epic I0)

Status: decided 2026-10-11. Inputs: `AiBudgetService` (13.1b), `AiMeteringService` + `ai_call`
(13.1a), the seven services that call `AiProvider` today, `docs/design/admin/ai-cost-governance.md`
(A4: ledger columns, platform caps, kill switches, user controls, enforcement order), locked limits
(Pro $3/mo · $8/qtr; Autopilot $6/mo · $16/qtr; Free = parse only; nothing unlimited; ≥ 80 % margin).

## 0. Summary

1. **`AiGateway.call(AiRequest) → AiResponse` is the only way to reach a model.** The seven services
   stop re-implementing the check order; they build a typed request (task, prompt id, inputs, schema)
   and get back text/JSON + usage, or a typed refusal. New features (assistant, interview, cover letter)
   cannot bypass it because `AiProvider` becomes package-private to the gateway.
2. **Check order is fixed and tested** (from the admin design §4): global switch → feature switch →
   platform daily/monthly cap → user control (throttle/pause/block) → plan gate → per-feature daily cap
   → period budget → consent → cache → provider. Each refusal has one ProblemDetail code.
3. **Ledger v2 records every attempt**, success or not, with `feature`, `provider`, `prompt_version`,
   `latency_ms`, `cache_hit`, `org_id`, `request_id`. `ai_usage` (the legacy monthly counter) is retired;
   the Free parse count reads the ledger.
4. **Spend is materialised**: `ai_period_spend(login, period_start)` is upserted in the same
   transaction as the ledger row, so `decide()` is one indexed read, not a `SUM` over the ledger.
5. **Per-feature daily caps** are runtime settings (assistant 40 msgs, tailor 30, fit 60, interview 3
   sessions, draft 80 …) — the second line of defence under the period budget, so a single feature
   cannot drain the $3 in an afternoon and leave the others dead for the month.
6. **Budget resolution is pluggable**: personal plan → admin override → org grant (O3.3) → service
   product budget (20.1's $1.50 row). The gateway asks `BudgetResolver`, which today wraps
   `AiBudgetService.window()` and later reads `entitlement_grant` (A3.2) without touching callers.

## 1. Audience lens

Users never see this layer, but they feel it: a Pro user on a phone taps "Tailor" and either gets a
diff in < 6 s or a one-line honest reason ("You've used today's 30 tailors — resets at midnight" /
"This period's Kiwiply AI resets Nov 1 · repeats are free"). No dollars, no "credits", no dead ends:
every refusal sheet offers the deterministic alternative (lint, ATS checks, search) or BYO key.

## 2. Architecture

```
Caller (ResumeTailorService, JobFitService, AssistantService, …)
  └─ AiRequest { task, feature, promptId, promptVersion, inputs{}, schema?, login, orgId?, consent, cacheKey?, maxOutputTokens?, tools? }
       │
       ▼
AiGateway.call()
  1  policy.globalEnabled            → 503 AI_DISABLED
  2  policy.featureEnabled(feature)  → 503 AI_FEATURE_DISABLED {feature}
  3  platformCaps.check()            → 503 AI_PAUSED {retryAfter}      (A4.3; PARSE keeps a 10 % reserved slice)
  4  userControl(login)              → 403 AI_USER_PAUSED | AI_USER_BLOCKED; THROTTLED → economy model + half caps
  5  planGate(task, budget)          → 402 PRO_REQUIRED                 (Free: only PARSE passes)
  6  dailyCap(feature, login)        → 429 AI_DAILY_CAP {resetsAt}
  7  budget.decide()                 → 402 AI_BUDGET_EXHAUSTED {resetsAt} | model (economy at ≥ 80 %)
  8  consent                         → 200 {status: consentRequired}    (never before 5: lead with the real refusal)
  9  cache.lookup(cacheKey)          → hit: return, ledger row with cache_hit=true, cost 0
 10  router.resolve(task, decision)  → provider + model + fallback chain (model-routing-providers.md)
 11  provider.generate(...)          → AiResult | AiProviderException  (timeout per task; fallback on 5xx/429/timeout)
 12  validate(schema, bounds)        → AiOutputRejected → ledger success=false, cost recorded (provider billed us)
 13  ledger.record(...) + spend.upsert() + metrics + alertEvaluator.onCall()
 14  cache.store(...)
```

Thread model: synchronous for request/response tasks; `callStreaming()` returns a `Flux<AiEvent>` for
the assistant and interview practice (I9.6) with the same steps 1–10 up front and 12–14 on completion.

### 2.1 Codes (ProblemDetail `type`), status and what the client shows

| Code | HTTP | Client copy (web + extension share it via `@kiwiply/ui` `AiRefusal`) |
|---|---|---|
| `AI_DISABLED` | 503 | "Kiwiply AI is taking a short break." + deterministic chips |
| `AI_FEATURE_DISABLED` | 503 | "Resume tailoring is paused right now." |
| `AI_PAUSED` | 503 | "Kiwiply AI is busy — try again in {retryAfter}." |
| `AI_USER_PAUSED` / `AI_USER_BLOCKED` | 403 | "Kiwiply AI is paused on your account. Contact support." |
| `PRO_REQUIRED` | 402 | existing upgrade sheet (U15.1) |
| `AI_DAILY_CAP` | 429 | "You've used today's {n} {feature}. Resets at {time}." |
| `AI_BUDGET_EXHAUSTED` | 402 | "This period's Kiwiply AI is used up — resets {date}. Repeats of things you've already asked are free." + BYO hint in the extension |
| `consentRequired` | 200 status | the existing consent sheet |

## 3. Data model (additive Liquibase)

```sql
ALTER TABLE ai_call
  ADD COLUMN feature        VARCHAR(20)  NULL,          -- resume|answers|matches|interview|tailor|chat|inbox|embed
  ADD COLUMN provider       VARCHAR(20)  NOT NULL DEFAULT 'gemini',
  ADD COLUMN success        BOOLEAN      NOT NULL DEFAULT TRUE,
  ADD COLUMN failure_kind   VARCHAR(20)  NULL,          -- PROVIDER|TIMEOUT|SCHEMA|TRUTH_CHECK|EMPTY
  ADD COLUMN latency_ms     INT          NULL,
  ADD COLUMN cache_hit      BOOLEAN      NOT NULL DEFAULT FALSE,
  ADD COLUMN prompt_id      VARCHAR(40)  NULL,
  ADD COLUMN prompt_version INT          NULL,
  ADD COLUMN org_id         BIGINT       NULL,
  ADD COLUMN request_id     CHAR(26)     NULL;          -- ULID; the same id is in logs + metrics
CREATE INDEX ix_ai_call_feature_created ON ai_call(feature, created_at);
CREATE INDEX ix_ai_call_request ON ai_call(request_id);

CREATE TABLE ai_period_spend (                          -- materialised budget position
  login        VARCHAR(50) NOT NULL,
  period_start DATETIME    NOT NULL,                    -- the window start AiBudgetService computes
  period_end   DATETIME    NOT NULL,
  budget_micros BIGINT     NOT NULL,
  spent_micros  BIGINT     NOT NULL DEFAULT 0,
  calls         INT        NOT NULL DEFAULT 0,
  updated_at    DATETIME   NOT NULL,
  PRIMARY KEY (login, period_start)
);
-- upsert: INSERT … ON DUPLICATE KEY UPDATE spent_micros = spent_micros + VALUES(spent_micros), calls = calls + 1
-- rebuild job (02:30 UTC) recomputes from ai_call for yesterday's active users and logs any drift > $0.01.

CREATE TABLE ai_daily_use (                             -- per-feature daily caps
  login   VARCHAR(50) NOT NULL, day DATE NOT NULL, feature VARCHAR(20) NOT NULL,
  n INT NOT NULL DEFAULT 0, PRIMARY KEY (login, day, feature)
);

CREATE TABLE ai_feedback (                              -- "report this answer" (guardrails doc §6)
  id BIGINT AUTO_INCREMENT PRIMARY KEY, login VARCHAR(50) NULL, request_id CHAR(26) NOT NULL,
  task VARCHAR(12) NOT NULL, verdict VARCHAR(8) NOT NULL,  -- UP|DOWN
  reason VARCHAR(24) NULL,                                 -- WRONG_FACT|GENERIC|TOO_LONG|OFFENSIVE|OTHER
  sample_json JSON NULL,                                   -- only when the user opted in (I2.6)
  created_at DATETIME NOT NULL
);
```

`ai_usage` is dropped after one release of dual-running (`usedThisMonth` switches to
`COUNT(*) FROM ai_call WHERE login=? AND task='parse' AND success AND created_at >= monthStart`).
Erasure: `login = NULL` on `ai_call`/`ai_feedback` (existing rule), delete `ai_period_spend`,
`ai_daily_use`, `ai_quota_override`, `ai_user_control`, and the per-user caches (`ai_answer`, `job_fit`,
`resume_match`, `resume_tailor`, `resume_ai_proposal`) via one `AiDataErasure.eraseUser(login)` called
from `AccountDeletionService` (gap found in the audit).

## 4. API

Nothing new for users beyond the codes above. Internal:

```java
record AiRequest(AiTask task, String feature, String promptId, Map<String,Object> inputs,
                 AiSchema schema, String login, Long orgId, boolean consent, String cacheKey,
                 Integer maxOutputTokens, List<AiTool> tools) {}
sealed interface AiResponse permits AiOk, AiRefused, AiConsentRequired
record AiOk(String text, JsonNode json, AiUsage usage, boolean cached, String requestId, Meter meter)
record AiRefused(String code, int status, Instant resetsAt, Duration retryAfter, Meter meter)
record Meter(String metered, int used, int limit, Instant resetsAt, boolean economy)   // = AiBudgetService.Usage
```

`GET /api/ai/usage` (exists) gains `daily: [{feature, used, cap, resetsAt}]` and `economy: bool`.
`GET /api/ai/limits` is an alias used by the assistant design; same payload.

## 5. Budget math against the locked limits

Worst case is the number that matters for the margin guard: a Pro user who hits 100 % costs us exactly
the budget ($3 / $8; Autopilot $6 / $16). Daily caps bound the *shape*, not the ceiling:

| Feature | Model (primary → economy) | Tokens/call (in / out) | Cost/call | Daily cap | Worst day |
|---|---|---|---|---|---|
| tailor | Sonnet 5.5 → Haiku 5.5 | 3 000 / 1 200 | $0.018 → $0.0009 | 30 | $0.54 |
| fit | Haiku 5.5 / Flash-Lite | 2 500 / 500 | $0.0005 | 60 | $0.03 |
| draft/pick/map/enrich | Haiku 5.5 / Flash-Lite | 1 200 / 200 | $0.0002 | 80 | $0.02 |
| jobs (nightly) | Flash-Lite batch | 9 000 / 2 000 | $0.0017 | 1 | $0.002 |
| assistant | Haiku 5.5 | 3 400 / 400 | $0.0005 | 40 msgs | $0.02 |
| interview | Sonnet 5.5 → Haiku 5.5 | 6 × (2 500 / 400) | $0.05/session | 3 | $0.15 |
| cover letter | Sonnet 5.5 → Haiku 5.5 | 3 000 / 700 | $0.013 | 10 | $0.13 |
| parse | Flash-Lite / Haiku 5.5 | 8 000 / 2 000 | $0.0016 | 25 (Free 50/mo) | $0.04 |

A user hammering every cap every day spends ≈ $0.90/day → the $3 budget stops them on day 4 at the
economy model from ~day 3; realistic heavy use (5 tailors, 10 fits, 20 chats, 1 interview a day)
≈ $0.17/day ≈ $5/month on Sonnet for tailoring — which is why **tailor/cover/interview route to
Sonnet only below 50 % of the period budget** and to Haiku above (routing doc §3). Expected median Pro
spend stays ≈ $0.60/month; the budget is a ceiling, as 13.1 intended. Autopilot's $6 covers 30 prepared
applications/day × (map + 2 drafts + fit) ≈ $0.06/day.

## 6. State machine (a user's AI position within a period)

```
          ┌────────── reset at period_end / month start ──────────┐
          ▼                                                        │
       NORMAL ──spent ≥ 80 %──▶ ECONOMY ──spent ≥ 100 %──▶ EXHAUSTED ┘
          │                        │                          ▲
          └── daily cap hit ───────┴──▶ DAILY_CAPPED (per feature, resets 00:00 user tz, else UTC)
       any state ──admin control──▶ THROTTLED (economy + caps/2) | PAUSED | BLOCKED
```

## 7. Failure modes

| Failure | Behaviour |
|---|---|
| Provider timeout (per-task: 20 s short tasks, 60 s parse, 45 s tailor) | fallback chain (routing doc); if all fail → `AiOk` never produced, ledger `success=false, failure_kind=TIMEOUT`, cost 0, user sees "slow right now" |
| Output fails schema/bounds/truth checks | ledger `success=false, failure_kind=SCHEMA|TRUTH_CHECK`, **cost recorded** (we were billed), one automatic retry on the fallback model for SCHEMA only |
| `ai_period_spend` drift | nightly rebuild from ledger; drift > $0.01 → `ai_alert SPEND_DRIFT` |
| Two concurrent calls at 99 % | both pass `decide()`; both record; next call is EXHAUSTED. Acceptable overshoot ≤ one call (bounded by per-call max cost, §8) |
| Platform cap hit | `AI_PAUSED` for every task except PARSE within its reserved slice (A4 D2) |
| Unknown feature string | gateway rejects at build time: `feature` is an enum derived from `AiTask` (`AiTask.feature()`) |

## 8. Security / privacy / abuse

- No prompt or answer in the ledger (rule kept); `ai_feedback.sample_json` only with explicit opt-in.
- Per-call cost ceiling: `maxOutputTokens` by task + input token caps (I7.5) so one call can never exceed
  ~$0.05 (Sonnet tailor) — protects the budget from a runaway output.
- `request_id` lets support trace a complaint through logs → ledger → eval without reading content.
- Org attribution: when a MARKETER acts for a consultant (O10.4), `login` = marketer, `org_id` set, budget = marketer's; the consultant's ledger is untouched.
- Demo accounts: `DemoGuard` makes the gateway return `AiRefused(AI_FEATURE_DISABLED)` for writes-with-cost; cached demo answers stay.

## 9. Tests

`AiGatewayOrderTest` (every refusal in order; a Free user gets `PRO_REQUIRED` before `consentRequired`;
PARSE on Free passes to the quota), `AiPeriodSpendTest` (upsert concurrency with 50 threads = exact sum),
`AiDailyCapTest` (cap per feature, timezone reset), `AiLedgerV2Test` (failed call rows, cache_hit rows cost 0),
`AiDataErasureTest` (all nine tables), `AiResourceIT` additions (codes + `daily[]` in usage),
migration test: each of the seven existing services routed through the gateway keeps its existing
service-level tests green (`ResumeTailorServiceTest` etc. switch their fake provider to a fake gateway).

## 10. Rollout

I0.4 ledger columns (dual-write, no behaviour change) → I0.3 gateway with the seven callers migrated
one per commit (tailor first, parse last) → I0.5 materialised spend behind a flag `ai.spend.materialised`
with the nightly drift check → I0.6 daily caps (settings default high, tightened after a week of data)
→ I0.7 platform-cap hook when A4.3 lands → I0.8 org budgets when O3.3 lands → I0.9 erasure.

## 11. Mobile wireframe (390 px) — the refusal sheet and the meter

```
┌──────────────────────────────┐      ┌──────────────────────────────┐
│ Settings › Kiwiply AI        │      │  ▲ sheet                     │
│ This period   ▓▓▓▓▓▓▓░░░ 72% │      │  You've used today's 30      │
│ Resets Nov 1 · Economy mode  │      │  tailors.                    │
│ starts at 80%                │      │  Resets at midnight.         │
│                              │      │                              │
│ Today                        │      │  Meanwhile                   │
│ Tailor      12 / 30          │      │  [Run the ATS checks]        │
│ Job fit      4 / 60          │      │  [Compare keywords]          │
│ Chat        18 / 40          │      │  [Use my own API key] (ext)  │
│ Interview    1 / 3           │      │                              │
│                              │      │  Repeats of a tailor you've  │
│ Repeats are always free.     │      │  already run are free.       │
└──────────────────────────────┘      └──────────────────────────────┘
```

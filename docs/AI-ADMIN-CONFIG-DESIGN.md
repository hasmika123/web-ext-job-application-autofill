# Design — Admin "AI providers & routing": Gemini end to end now, local LLMs next

Status: **decided 2026-10-12** (Fable; build-ready for Sonnet). Branch base: `resume-builder` @ `9cd320c`.
Stories: **I1.9 – I1.17** in `docs/roadmap/areas/ai.json` (Phase 1 = I1.9–I1.14, Phase 2 = I1.15–I1.17);
touches A4.1 / A4.2 / A4.3 / A5.1 / A5.2 in `admin.json` (see §11 for what is absorbed or superseded).

Inputs read: `AiConfiguration`, `AiProperties`, `AiPolicy`, `AiPricing`, `AiProvider`, `GeminiAiProvider`,
`AiResult`, `AiTask`, `AiBudgetService`, `AiMeteringService`, `AiDraftService`, `AiResumeParseService`,
`ResumeAiService`, the five other callers (`JobFitService`, `JobMatchService`, `ResumeMatchService`,
`ResumeTailorService`, `InboxParser`), `ResumeBuilderSettingKeys` / `ResumeBuilderSettings` over `app_setting`,
`AdminAuditService`, `AdminAiUsageResource`, `AdminAiQuotaResource`, the admin web gate (`(admin)/layout.tsx`),
`admin-v3` components, `@kiwiply/ui`, `web/src/lib/{autosave,undo-toast}.ts`, `AiResourceIT`,
`docs/design/ai/model-routing-providers.md`, `docs/design/admin/{runtime-settings-feature-flags,ai-cost-governance}.md`,
`docs/design/ai/ai-gateway-metering-budgets.md`, DEPLOY.md §10, CLAUDE.md (locked decisions).

The user's ask, verbatim: *"lets build Admin place to configure AI to use and complete that full path configuring and
using the gemini for now and test it works.. then we will implement ollama and any other best local llm you suggest
for this app"*.

---

## 0. Summary (read this first)

1. **One new page, `/admin/ai/providers`** — provider cards (status, key present, base URL, models, **Test
   connection**), a per-task routing table (provider · model · fallback · max tokens · enabled), per-model pricing,
   the global kill switch, and a "recent calls & errors" panel read from the `ai_call` ledger. Notion-style autosave
   (inline ✓ + undo toast); destructive changes confirm with a reason.
2. **Runtime switching without restart.** The single `AiProvider` bean becomes **`AiRouter`** (same interface,
   same bean name) that resolves *provider + model per task per call* from runtime settings, with one-step fallback.
   The eight services that inject `AiProvider` **do not change**. `AiBudgetService` reads the same settings for
   the model it returns in `Decision.model()`, so the ledger records exactly what ran.
3. **Settings, not tables.** Everything non-secret lives in the existing `app_setting` seam, declared in a new
   `AiSettingKeys` registry (same `Key` record and bounds as `ResumeBuilderSettingKeys`), with a new
   `app_setting_history` table and an `AI_CONFIG_CHANGE` audit row per write — the exact shape A5.1 specifies, so
   A5.1 absorbs it by moving files, not by migrating data.
4. **Keys stay in env.** Admin sees *"Key present ✓ (DOSSIER_AI_API_KEY)"* or *"Key missing"* and can never type,
   view or test-type a key. Precedence for non-secret values: **runtime row › env › code default**, with one
   deliberate exception: `DOSSIER_AI_ENABLED=false` is a deployment-level master that the runtime switch cannot
   override (it can only lower, never raise).
5. **Proof on Gemini**: an IT that changes the PARSE route through the admin API and asserts the next
   `/api/ai/parse-resume` call hits the fake adapter with the new model and writes a ledger row carrying it; plus a
   live smoke (`web/scripts/ai-smoke.mjs`) that runs only when a key is present (read by the API from the
   gitignored `api/.env.ai.local`; the script never sees it) and skips cleanly otherwise.
6. **Phase 2 = `OpenAiCompatAiProvider`** (`id = openai_compat`) — Ollama first, also LM Studio, llama.cpp, vLLM,
   OpenAI, OpenRouter, Groq — with a docker profile for dev/demo, zero/amortised pricing, and eval-gated promotion
   of tasks to local. **Production stays on cloud** until there is a GPU box (the prod VPS is CPU-only and shared).

---

## 1. Scope split

### 1.1 Phase 1 — build now (stories I1.9 → I1.14, in that order)

| Story | What lands | Size |
|---|---|---|
| I1.9 | `AiSettingKeys` registry (families for `ai.route.<task>.*`, `ai.provider.<id>.*`, `ai.price.<model>.*`), `ResumeBuilderSettings.stored(key)`, `AiRuntimeSettings` (row › env › code), `AdminSettingsWriter` + `app_setting_history` + audit | M |
| I1.10 | `AiRouter` (the one `AiProvider` bean) + `AiProviderRegistry` (adapters are not beans) + one-step fallback + `AiResult.provider/latencyMs` + ledger columns `provider, latency_ms, success, error_kind` + failure rows + `AiTask.PROBE`; `AiBudgetService` reads `AiRuntimeSettings`; Gemini key moves from the URL query to the `x-goog-api-key` header | M |
| I1.11 | Admin API: `GET /api/admin/ai/config`, `PATCH` global / provider / route, `PUT`/`DELETE` price, `POST …/test` (rate-limited, audited), `GET …/calls`, `GET …/config/history`; ProblemDetail codes | M |
| I1.12 | Web page `/admin/ai/providers`: provider cards + Test connection + routing table, autosave with inline ✓ and undo toast, confirm dialogs; BFF routes; nav entry | M |
| I1.13 | Same page: pricing table, global kill switch, recent calls & errors panel; AI-usage page "Edit limits" becomes a link; 390 px layout | S |
| I1.14 | End-to-end proof: `scripts/dev/api-local.mjs` demo launcher reading `api/.env.ai.local`, `web/scripts/ai-smoke.mjs`, the "change then use" IT, DEPLOY.md §10 update | S |

### 1.2 Phase 2 — next (stories I1.15 → I1.17)

| Story | What lands | Size |
|---|---|---|
| I1.15 | `OpenAiCompatAiProvider` (`openai_compat`): base URL, optional key, `json_schema` / `json_object` / `none` structured-output modes with auto-detect on Test, CPU-grade timeouts, usage mapping, provider contract test shared with Gemini | M |
| I1.16 | Ollama dev/demo profile (`api/src/main/docker/ollama.yml` + pull script), local models seeded at $0 with optional amortised price, "Local" badge on the provider card, PDF-parse fallback to a cloud provider | S |
| I1.17 | Eval-gated promotion of tasks to local (`./gradlew aiEval -Pprovider=live -Pmodel=…` once I2.3 exists; interim 20-case checklist per task until then) + `docs/runbooks/ai-local-models.md` | M |

### 1.3 Task-by-task: quality needed, local fit, hardware, and what stays on cloud

Names to **re-check at build time** (model ids and quantisation tags change; the harness in I1.17 is the arbiter,
not this table). Sizes are Q4_K_M GGUF unless noted; RAM figures are for the weights + a 4–8 K context.

| Task | Output | Quality needed | Local candidate (dev / demo / GPU box) | Hardware for usable latency | Prod today |
|---|---|---|---|---|---|
| **PICK** (choose one option) | ≤ 20 tokens | Low: follow instructions, pick from a list | `qwen3:4b` or `llama3.2:3b` (≈ 2.5–3 GB) | CPU 8-core is fine (prompt ≈ 1 K tokens → 3–8 s); any GPU ≈ < 1 s | Cloud (Flash-Lite). First task to move local once a GPU box exists; CPU-only prod is too slow for an in-form wait |
| **MAP** (labels → canonical keys, JSON) | ≤ 300 tokens JSON | Medium: exact key names, valid JSON | `qwen3:8b` with `json_schema` (≈ 5 GB); `qwen2.5:7b-instruct` as the fallback name | CPU: 15–40 s (too slow for the drawer); GPU 8 GB VRAM: 2–4 s | Cloud. Local for dev/CI/demo |
| **ENRICH** (fill job type / workplace / salary) | ≤ 200 tokens JSON | Medium-low; batchable | `qwen3:8b`; `qwen3:4b` acceptable | Same as MAP; **nightly batch** tolerates CPU | Cloud now; best **second** local candidate because it can run as a nightly batch (I7.3 shape) |
| **DRAFT** (2–4 first-person sentences) | ≤ 400 tokens prose | Medium-high: grounded, no invented facts, natural English | `gemma3:12b` (≈ 8 GB) for prose quality; `qwen3:8b` acceptable | GPU 12 GB VRAM: 3–6 s; CPU: 40–90 s (demo-only) | Cloud |
| **PARSE** (resume → canonical JSON, PDFs inline) | up to 4 000 tokens JSON, PDF input | High: long structured output, layout understanding | Text path only: `qwen3:14b` (≈ 9 GB) with `json_schema`; **no local PDF reading** (router falls back to Gemini for `fileBase64` calls) | GPU 16 GB: 20–40 s; CPU: 5–10 min → unusable | **Cloud, and stays cloud** (free exception; Gemini reads PDFs) |
| **REWRITE** / **SUMMARY** (builder, Pro) | ≤ 3 000 tokens JSON with prose | High: tone control, truth checks must pass | `gemma3:12b` / `gemma3:27b` (≈ 17 GB), `qwen3:14b` | GPU 16–24 GB | Cloud (Flash-Lite today; Sonnet 5.5 per I1.3 when the second cloud provider lands) |
| **SUGGEST** (builder cards, Pro) | ≤ 3 000 tokens JSON | Medium-high | same as REWRITE | GPU 16 GB+ | Cloud |
| **FIT / MATCH / JOBS / INBOX** (scoring, classification) | 1 200–3 000 tokens JSON | Medium: schema-exact, calibrated scores | `qwen3:8b` for INBOX/FIT; `qwen3:14b` for JOBS (50 postings per call) | JOBS is nightly → CPU acceptable with a long timeout; INBOX is a 15-min poller → GPU preferred | Cloud; JOBS + INBOX are the **best batch candidates** for local on a GPU box |
| **EMBED** (I4.1, future) | vectors | Medium: retrieval quality, consistency | `nomic-embed-text` (768-dim, Matryoshka → 256) or `qwen3-embedding:0.6b`; `bge-m3` if multilingual matters | **CPU is fine** (ms per text) — ≈ 1 GB RAM | Not built yet. Recommend **local-first** for embeddings even in prod *if* the shared box can spare ≈ 1 GB; otherwise `gemini-embedding-001`. Decide in I4.1 with a memory check |
| **EVAL_JUDGE** (offline) | — | Highest | — | — | Cloud (Sonnet/Opus per I2.3); never local |

Honesty notes: (a) tokens/s and RAM above are typical for llama.cpp-backed runtimes on 2025-era hardware and vary
2× either way; (b) "quality needed" is Fable's judgement until I2.3 produces numbers; (c) the only *safe* claims are:
embeddings are cheap on CPU, 3–4 B models handle PICK, PDF parsing needs a cloud multimodal model, and nothing
user-facing should run on the shared prod VPS's CPU.

---

## 2. Secrets — what admin can and cannot do

| | Decision |
|---|---|
| Where keys live | **Env only**, as today: `DOSSIER_AI_API_KEY` (Gemini). Phase 2 adds `DOSSIER_AI_OPENAI_COMPAT_API_KEY` (optional: blank is valid for a local server). Read once at startup by `AiProviderRegistry`; never in `app_setting`, never in the extension bundle, never in a response body. |
| What admin sees | Per provider card: **"Key present ✓"** or **"Key missing"**, plus the env var *name* (`DOSSIER_AI_API_KEY`). Never the value, its length, prefix or hash. API field: `keyPresent: boolean`, `keyEnvVar: string`. |
| What admin can do | Enable/disable a provider, set base URL, timeout, the model list, per-task routes, fallback, max output tokens, prices, the global and per-task kill switches, economy model, soft-cap %, the Test rate limit. All in runtime settings with history + audit. |
| What admin cannot do | Type, paste, rotate, view or "test" a key. Adding/rotating a key = change the box's `.env` + restart the API (DEPLOY.md §10). The page says so in one line under the key status. |
| Precedence | **runtime row › env › code default** for every non-secret value. `GET /api/admin/ai/config` returns `{value, source: "db"|"env"|"default", envDefault}` for each field so the UI can show "overriding env" and offer "Reset to env". |
| The one exception | `DOSSIER_AI_ENABLED=false` (env) is a **deployment master**: when it is false, server AI is off regardless of the runtime `ai.enabled` row; the UI shows an amber note *"Server AI is off by deployment config (DOSSIER_AI_ENABLED=false). The switch below takes effect once that is on."* Rationale: an env master that can only *lower* keeps dev/CI/secretless deployments safe by default and cannot be flipped on from a stolen admin session. |
| Leak prevention | (1) Gemini key moves from `?key=` in the URL to the `x-goog-api-key` header, so no URL, exception message or access log ever carries it. (2) `AiKeyScrubber.scrub(String)` replaces every configured key value with `[redacted]` and is applied to every provider error message before it is logged, stored (`ai_call.error_kind` is a short enum, never a message) or returned by the Test endpoint. (3) The Test endpoint returns `error.kind` + a scrubbed, ≤ 200-char `error.message`. (4) The demo launcher loads `api/.env.ai.local` into the child process environment and prints only the **names** of the variables it loaded. (5) The smoke script never reads that file. |

---

## 3. Data model and settings keys

### 3.1 Tables (additive Liquibase, two changesets)

`20261013020000_ai_runtime_config.xml`

```sql
-- 1. history for every runtime-setting write (the A5.1 §3 DDL, verbatim, so A5.1 adopts it)
CREATE TABLE app_setting_history (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  setting_key VARCHAR(100) NOT NULL,
  old_value   VARCHAR(1000) NULL,          -- NULL = there was no row (value came from env)
  new_value   VARCHAR(1000) NULL,          -- NULL = row deleted (back to env)
  actor_login VARCHAR(50)  NOT NULL,
  reason      VARCHAR(500) NULL,
  changed_at  DATETIME     NOT NULL,
  INDEX ix_app_setting_history_key (setting_key, changed_at)
);

-- 2. the ledger learns what served the call and whether it worked (I0.4's columns, the subset Phase 1 needs)
ALTER TABLE ai_call
  ADD COLUMN provider   VARCHAR(20) NOT NULL DEFAULT 'gemini',
  ADD COLUMN latency_ms INT NULL,
  ADD COLUMN success    BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN error_kind VARCHAR(24) NULL;     -- TIMEOUT | HTTP_4XX | HTTP_5XX | RATE_LIMITED | EMPTY | BAD_JSON | UNCONFIGURED | DISABLED | TRANSPORT | UNKNOWN
CREATE INDEX ix_ai_call_provider_created ON ai_call (provider, created_at);
CREATE INDEX ix_ai_call_success_created  ON ai_call (success, created_at);
```

Ledger rule unchanged: never a prompt, never an answer. Failure rows have `cost_micros = 0` and token counts 0
unless the provider reported usage. `AiCallRepository.costSince` must add `AND success = true` (failures are free
by definition, but the guard makes the rule explicit). `spendByLogin` / `spendByTask` likewise.

`app_setting.setting_value` is `VARCHAR(1000)`: every key below fits (longest: a 30-entry model list ≈ 700 chars).

### 3.2 Settings keys — `AiSettingKeys` (new file `service/ai/AiSettingKeys.java`)

Same `Key` record as `ResumeBuilderSettingKeys` (key, type, defaultValue, min, max, allowed, description,
jsonCheck). **Code defaults below are the declared defaults; the env default (from `AiProperties` / `AiPolicy`) sits
between them at resolution time** (§3.3). `<task>` ranges over `AiTask.values()` (wire names); `<id>` over
provider ids (`gemini` now, `openai_compat` in Phase 2); `<model>` matches `[a-z0-9][a-z0-9._:/-]{1,60}`.

| Key | Type | Code default | Bounds / allowed | Risk | Note |
|---|---|---|---|---|---|
| `ai.enabled` | BOOL | `true` | — | **HIGH** | Global kill switch (effective = env master AND this) |
| `ai.economy_model` | STRING | `""` | blank or a model id | MEDIUM | Blank = no soft-cap downgrade (as `AiPolicy.economyModel`) |
| `ai.soft_cap_pct` | INT | `80` | 50–95 | MEDIUM | `AiPolicy.softCapPercent` |
| `ai.admin.test_per_hour` | INT | `30` | 1–120 | LOW | Test-connection calls per admin login per hour |
| `ai.calls.default_window_hours` | INT | `24` | 1–168 | LOW | Default window of the recent-calls panel |
| `ai.provider.<id>.enabled` | BOOL | `true` | — | **HIGH** when turning off | A disabled provider is skipped by the router (routes to it fail over or refuse) |
| `ai.provider.<id>.base_url` | STRING | per adapter | `https://…` (Phase 2: `http://` allowed only for `localhost`, `127.0.0.1`, `[::1]`, `*.localhost`, `host.docker.internal`, RFC-1918 hosts) | MEDIUM | `AiProperties.baseUrl` is the env default for `gemini` |
| `ai.provider.<id>.timeout_ms` | INT | gemini `30000` · openai_compat `120000` | 1 000–300 000 | LOW | Per-call HTTP timeout; parse calls use `max(timeout, 60000)` |
| `ai.provider.<id>.models` | JSON | gemini: the `AiPricing` default Gemini ids; openai_compat: `[]` | 0–30 distinct model ids | LOW | The dropdown list on the routing table; free text is still allowed |
| `ai.route.<task>.enabled` | BOOL | `true` | — | **HIGH** for `parse`; MEDIUM otherwise | Per-task kill switch (replaces `disabled-tasks` as the override) |
| `ai.route.<task>.provider` | ENUM | `gemini` | `gemini` · `openai_compat` | MEDIUM | |
| `ai.route.<task>.model` | STRING | `""` | blank or model id | MEDIUM | Blank = inherit env `dossier.ai.policy.models.<task>`, then `dossier.ai.model` |
| `ai.route.<task>.fallback_provider` | ENUM | `none` | `none` · `gemini` · `openai_compat` | MEDIUM | One-step failover on TIMEOUT / HTTP_5XX / RATE_LIMITED / TRANSPORT / UNCONFIGURED |
| `ai.route.<task>.fallback_model` | STRING | `""` | blank or model id | MEDIUM | Blank = the fallback provider's default model |
| `ai.route.<task>.max_output_tokens` | INT | per task (see below) | 64–16 384 | LOW | Replaces the constants in `GeminiAiProvider.generateBody`; `ai.output_tokens_max.rewrite` becomes an **alias** of `ai.route.rewrite.max_output_tokens` (added to `ALIASES`) |
| `ai.price.<model>.input_per_mtok_micros` | INT | from `AiPricing` defaults | 0–100 000 000 ($0–$100/MTok) | LOW | USD per million tokens, in micros (the I1.6 naming) |
| `ai.price.<model>.cached_per_mtok_micros` | INT | idem | 0–100 000 000 | LOW | |
| `ai.price.<model>.output_per_mtok_micros` | INT | idem | 0–100 000 000 | LOW | |

Per-task `max_output_tokens` code defaults (today's constants, made explicit): draft/pick/map/enrich **400**
(`AiProperties.maxOutputTokens`); match/fit **1 200**; tailor/jobs/inbox **3 000**; parse **4 000**
(`parseMaxOutputTokens`); rewrite/summary/suggest/cover/translate **3 000** (`ai.output_tokens_max.rewrite`'s
default); probe **16**.

**Families.** `AiSettingKeys.find(key)` resolves exact keys first, then the three families by regex
(`^ai\.route\.(<tasks>)\.(enabled|provider|model|fallback_provider|fallback_model|max_output_tokens)$`,
`^ai\.provider\.(gemini|openai_compat)\.(enabled|base_url|timeout_ms|models)$`,
`^ai\.price\.([a-z0-9][a-z0-9._:/-]{1,60})\.(input|cached|output)_per_mtok_micros$`), materialising a `Key` with
the family's type, bounds and description. `ResumeBuilderSettingKeys.find/require/canonical` consult
`AiSettingKeys` after their own map (two lines), so `ResumeBuilderSettings` reads AI keys unchanged.
`ResumeBuilderSettingKeysParityTest` keeps passing (it asserts presence, not exhaustiveness; if it asserts
exhaustiveness, scope it to keys not starting with `ai.`).

### 3.3 Precedence, implemented once — `AiRuntimeSettings` (new `service/ai/AiRuntimeSettings.java`)

```java
@Service
public class AiRuntimeSettings {
    // ResumeBuilderSettings gains:  public Optional<String> stored(String key)  → the stored value when present AND valid, else empty
    boolean globalEnabled()                     // props.isEnabled() && stored("ai.enabled").map(Boolean::parseBoolean).orElse(true)
    boolean providerEnabled(String id)          // stored(...).orElse(true)
    String  providerBaseUrl(String id)          // stored(...).orElse(env: props.getBaseUrl() for gemini / openaiCompat.baseUrl)
    int     providerTimeoutMs(String id)
    List<String> providerModels(String id)
    boolean taskEnabled(AiTask t)               // stored(ai.route.<t>.enabled).orElse(!policy.isDisabled(t))
    Route   route(AiTask t)                     // record Route(provider, model, fallbackProvider, fallbackModel, maxOutputTokens, enabled)
                                                //   model = stored(route.model) non-blank ? it : policy.modelFor(t, props.getModel())
    Optional<String> economyModel()             // stored(ai.economy_model) non-blank ? it : policy.hasEconomyModel() ? policy.getEconomyModel() : empty
    int     softCapPercent()                    // stored(...).orElse(policy.getSoftCapPercent())
    int     adminTestPerHour()
    Resolved<T> resolved(String key)            // {value, source: DB|ENV|DEFAULT, envDefault, codeDefault} — what GET /config returns
    void    invalidate()                        // delegates to ResumeBuilderSettings.invalidate()
}
```

Cache: the existing 60 s snapshot in `ResumeBuilderSettings` (one query serves every getter) plus
`invalidate()` on every write through `AdminSettingsWriter`. Single API instance today; the 60 s TTL bounds
staleness if a second instance ever appears (A5.1 adds the `settings_version` bump).

### 3.4 Writes — `AdminSettingsWriter` (new `service/AdminSettingsWriter.java`)

The generic write path A5.1 will expose; Phase 1 calls it only from the AI admin service.

```java
@Transactional
public WriteResult write(String key, String newValueOrNull, String reason, Risk risk) {
    Key k = ResumeBuilderSettingKeys.require(key);                     // 400 AI_CONFIG_UNKNOWN_KEY otherwise
    if (newValue != null && !ResumeBuilderSettings.isValid(k, newValue, mapper)) → AiConfigException(400, AI_CONFIG_OUT_OF_BOUNDS, {key, min, max, allowed})
    if (risk == HIGH && (reason == null || reason.isBlank())) → AiConfigException(400, AI_CONFIG_REASON_REQUIRED, {key})
    String old = repository.findById(k.key()).map(AppSetting::getValue).orElse(null);
    if (Objects.equals(old, newValue)) return NO_CHANGE;                 // idempotent: no history, no audit
    if (newValue == null) repository.deleteById(k.key()); else repository.save(new AppSetting(k.key(), newValue, actor, now));
    history.save(new AppSettingHistory(k.key(), old, newValue, actor, reason, now));
    audit.record(AdminAuditService.AI_CONFIG_CHANGE, AdminAuditService.TARGET_AI_SETTING, k.key(), reason,
                 "old=" + abbreviate(old, 400) + " new=" + abbreviate(newValue, 400));
    settings.invalidate();
    return CHANGED(old, newValue);
}
```

`AdminAuditService` gains constants `TARGET_AI_SETTING = "AI_SETTING"`, `AI_CONFIG_CHANGE`, `TARGET_AI_PROVIDER =
"AI_PROVIDER"`, `AI_PROVIDER_TEST`. Audit runs in the caller's transaction (existing rule: the row and the change
commit together). Re-auth for HIGH keys arrives with A0.5; until then HIGH = reason required.

---

## 4. Runtime switching without restart

### 4.1 Bean topology

```
AiConfiguration
  @Bean AiProviderRegistry registry(AiProperties, AiRuntimeSettings)   // builds adapters from ENV ONCE: gemini → GeminiAiProvider(key from env; baseUrl/timeouts read live from AiRuntimeSettings)
  @Bean AiProvider aiProvider(AiProviderRegistry, AiRuntimeSettings, AiMeteringService, MeterRegistry) → new AiRouter(...)
```

- **Adapters are not Spring beans.** `AiProviderRegistry` holds `Map<String, AiProvider>` (`gemini`, later
  `openai_compat`) and `keyPresent(id)`, `keyEnvVar(id)`. This keeps **exactly one** `AiProvider` bean, so every
  existing `@MockitoBean private AiProvider aiProvider` IT keeps working and the eight services keep their
  constructors.
- `GeminiAiProvider` gets a constructor that takes `Supplier<String> baseUrl` and `IntSupplier timeoutMs` (read per
  call from runtime settings) and an injectable `HttpClient` (for the contract test). `DisabledAiProvider` moves
  into the registry as the adapter for an unknown id.
- `AiProvider` interface: **unchanged** (`isConfigured`, `defaultModel`, `generate` ×2, `parseResume`). One
  default method added: `default String id() { return "unknown"; }` — adapters override. Nothing else.

### 4.2 `AiRouter` (new `service/ai/AiRouter.java`, implements `AiProvider`)

```
isConfigured()  = runtime.globalEnabled() && registry.ids().stream().anyMatch(id -> runtime.providerEnabled(id) && registry.get(id).isConfigured())
defaultModel()  = props.getModel()                                       // kept for compatibility; AiBudgetService no longer calls it
generate(task, model, q, ctx)            → generate(task, model, q, ctx, 0)
generate(task, model, q, ctx, maxOut):
   Route r = runtime.route(task)
   if (!runtime.globalEnabled() || !r.enabled())            → fail(task, r.provider(), m, DISABLED)      // AiProviderException("Task is disabled")
   String m = blank(model) ? r.model() : model               // the model AiBudgetService decided (economy or routed) wins
   int cap  = maxOut > 0 ? maxOut : r.maxOutputTokens()
   Attempt a = attempt(r.provider(), m, task, q, ctx, cap)
   if (a.ok) return a.result.withProvider(r.provider(), a.latencyMs)
   if (a.kind.retryable && r.fallbackProvider() != null && !r.fallbackProvider().equals(r.provider())) {
       String fm = blank(r.fallbackModel()) ? registry.get(r.fallbackProvider()).defaultModel() : r.fallbackModel()
       Attempt b = attempt(r.fallbackProvider(), fm, ...)
       if (b.ok) return b.result.withProvider(r.fallbackProvider(), b.latencyMs)
       throw b.exception
   }
   throw a.exception
parseResume(model, text, file, mime)      → same shape with task PARSE; a provider that cannot read files (Phase 2 local) throws UNSUPPORTED_INPUT, which is retryable → fallback provider (Gemini)
probe(providerId, modelOrBlank)           → used by the Test endpoint only: adapter.generate(AiTask.PROBE, model, "Reply with exactly: OK", "", 16) with a 15 s timeout; returns ProbeResult(ok, model, latencyMs, inputTokens, outputTokens, costMicros, errorKind, scrubbedMessage)

attempt(providerId, model, ...):
   AiProvider p = registry.get(providerId)
   if (!runtime.providerEnabled(providerId)) → kind DISABLED (retryable)
   if (!p.isConfigured())                   → kind UNCONFIGURED (retryable)
   long t0 = nanoTime(); try { result = p.generate(...); ok } catch (AiProviderException e) { kind = classify(e) }
   latency = ms since t0
   on failure: metering.recordFailure(currentLoginOrNull(), task, providerId, model, kind, latency)   // REQUIRES_NEW so the caller's rollback never loses it
   meters.timer("ai.call", task, provider, outcome).record(latency)
```

`classify(e)`: `HttpTimeoutException` → TIMEOUT; HTTP 429 → RATE_LIMITED; 5xx → HTTP_5XX; 4xx → HTTP_4XX
(not retryable: a bad model id or schema must surface, not hop providers — except 404 on a model, which is
`MODEL_NOT_FOUND`, not retryable, and is what I8.3 alerts on); empty answer → EMPTY (retryable once on the
fallback); unparsable JSON → BAD_JSON (not retryable here; services already retry once with a "return only JSON"
nudge); IO → TRANSPORT (retryable). `GeminiAiProvider` must carry the HTTP status on the exception
(`AiProviderException(String message, int httpStatus, Throwable cause)`) so the router can classify.

### 4.3 Disabled behaviour and kill switches

| Switch | Where it is read | What callers see |
|---|---|---|
| Env master `DOSSIER_AI_ENABLED=false` | the eight services' `enabled` field (unchanged) **and** `AiRuntimeSettings.globalEnabled()` | `{disabled:true}` / `DISABLED` statuses as today |
| Runtime `ai.enabled=false` | `AiRouter.isConfigured()` → false | Same `DISABLED` paths — no service changes, because every service already guards with `provider.isConfigured()`. `GET /api/ai/usage` is unaffected (meter still shows) |
| Per-task `ai.route.<task>.enabled=false` | `AiBudgetService.decide()` → `Verdict.TASK_DISABLED` via `runtime.taskEnabled(task)` (replaces `policy.isDisabled`) | Existing `TASK_DISABLED` handling (DISABLED status, 200 `{disabled:true}` or the builder's `FEATURE_PAUSED`) |
| Provider `ai.provider.<id>.enabled=false` | `AiRouter.attempt` | Route fails over if a fallback is set, else `AiProviderException` → the service's `ERROR` path (502 `{error}`) and a failure row `DISABLED`. The admin API refuses to disable a provider that a route uses **without** a configured fallback unless `force=true` (409 `AI_PROVIDER_IN_USE` listing the tasks) |
| Economy model past the soft cap | `AiBudgetService.decide()` via `runtime.economyModel()` / `softCapPercent()` | unchanged semantics |

`AiBudgetService` constructor: `AiPolicy policy, AiProvider provider` → `AiRuntimeSettings runtime` (the
`provider` parameter is dropped; `AiBudgetServiceTest` builds a fake `AiRuntimeSettings` over a `Map`). The
budget numbers (`proBudgetMicros`, `pro3moBudgetMicros`) **stay on `AiPolicy`/env** — they are locked product
decisions (CLAUDE.md) that A5.1/A3 move onto the catalog later, not this page.

### 4.4 Budget, metering and pricing read the model that actually ran

- `AiResult` gains two components: `String provider` and `int latencyMs`, with the existing 5-arg constructor kept
  (`provider = ""`, `latencyMs = 0`) and `withProvider(String, int)`. Every existing test compiles unchanged.
- `AiMeteringService.record(login, task, result)` writes `provider = blank(result.provider()) ? "gemini" :
  result.provider()`, `latency_ms`, `success = true`. `recordFailure(login, task, provider, model, kind, latencyMs)`
  writes `success=false, error_kind=kind, cost 0` in `REQUIRES_NEW`.
- `AiPricing` keeps its code defaults and gains a settings overlay: `rateFor(model)` first asks
  `AiRuntimeSettings.price(model)` (the three `ai.price.<model>.*` rows, all three present and valid → a `Rate`),
  else the longest-prefix code default, else the fallback rate. `costMicros` is unchanged. The "unpriced model"
  warning stays (I8.3 turns it into an alert).
- `AiBudgetService.decide()` returns `Decision.model()` from `runtime.route(task).model()` (or the economy model),
  so the ledger's `model` (what the provider reports as served, falling back to the requested id) and the admin
  page's route agree. The IT in §7.3 asserts exactly this chain.

---

## 5. Admin screens

Route `/admin/ai/providers` (server page `web/src/app/(admin)/admin/ai/providers/page.tsx` → client component
`web/src/components/admin-v3/ai/AiProvidersPage.tsx`). Admin-only via the existing `(admin)/layout.tsx` gate
(non-admin → 404; API `/api/admin/**` → ROLE_ADMIN). Nav: `AdminShell` gains `{ href: "/admin/ai/providers",
label: "AI providers", icon: <GearIcon/> }` directly under "AI usage". On `/admin/ai` the sample
`ComingSoonButton "Edit limits"` becomes `<Link href="/admin/ai/providers">Providers & routing →</Link>`.

Primitives: `AdminHero`, `AdminPanel`, `AdminStatTiles`, `StatusDot`, `DataTable`, `FilterSelect` from the admin
kit; `Switch`, `Select`, `Input`, `Button`, `Badge`, `Dialog`, `SavedTick`/`useSavedFlash`, `useToast`,
`Tooltip`, `ErrorState`, `TableSkeleton` from `@kiwiply/ui`; `undoToast` from `web/src/lib/undo-toast.ts`.
Icons from `@kiwiply/ui` only (no inline svg).

Autosave contract (Notion-style, DECISIONS #32): every control saves **on change** (Switch, Select) or **on blur /
Enter** (Input), one PATCH per control, serialised per row; while saving the control is `aria-busy`; success shows
`SavedTick` (✓, 1.2 s) beside the control and fires `undoToast(toast, { title, onUndo })` for 6 s that PATCHes the
previous value back; failure shows the server's `error` inline under the control (red 12.5 px text) and reverts
the control. No Save buttons anywhere on the page. A field whose `source === "db"` shows a small "overrides env ·
Reset" link that PATCHes `null` (→ env).

Confirm (Dialog) before: global switch **off**, any route **enabled → off** where task is `parse`, provider **off**,
and a route change that moves `parse` to a provider that cannot read PDFs (Phase 2). Dialog = title, one-sentence
consequence, **Reason (required)** input, `[Turn off]` danger + `[Cancel]`. Turning things **on** does not confirm.

### 5.1 Wireframe — 1440 px

```
┌─ PLATFORM ADMIN ────────────────────────────────────────────────────────────────────────────────────────────┐
│ AI providers & routing                                                              [ Server AI  ● ON ]     │
│ Which model answers each task, what it costs, and whether it's working. Keys stay in the server's env.      │
│ ⚠ Server AI is off by deployment config (DOSSIER_AI_ENABLED=false). The switch takes effect once that is on. │  ← only when env master is false
├─────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ [ Calls · 24 h  1 284 ] [ Failed · 24 h  7 (0.5 %) ] [ p95 latency  1.9 s ] [ Spend · 24 h  $0.41 ]           │  ← AdminStatTiles from GET /calls summary
├───────────────────────────────── Providers ─────────────────────────────────────────────────────────────────┤
│ ┌─ Google Gemini  ● Ready ───────────────────────────────┐ ┌─ OpenAI-compatible (Ollama…)  ○ Not configured ─┐ │
│ │ Enabled            [● on]                               │ │ Enabled            [○ off]                      │ │
│ │ Key                Key present ✓  DOSSIER_AI_API_KEY    │ │ Key                Not required for local ·     │ │  ← Phase 2 card; Phase 1 renders Gemini only
│ │                    Change it in the server's .env, then │ │                    DOSSIER_AI_OPENAI_COMPAT_API_KEY│ │
│ │                    restart the API.                     │ │ Base URL           [http://localhost:11434/v1  ] │ │
│ │ Base URL           [https://generativelanguage.google…]│ │ Timeout            [120000] ms                   │ │
│ │                    overrides env · Reset                │ │ Models             [qwen3:8b ×] [+ add]          │ │
│ │ Timeout            [30000] ms ✓                         │ │ Structured output  auto · json_schema            │ │
│ │ Models             [gemini-2.5-flash-lite ×] [gemini-2.5-flash ×] [+ add]                                   │ │
│ │ Used by            parse, draft, pick, map, enrich, … (12 tasks)                                            │ │
│ │ [ Test connection ]  Last test: 2 min ago · OK · gemini-2.5-flash-lite-001 · 412 ms · 9 in / 1 out · $0.00 │ │
│ └─────────────────────────────────────────────────────────┘ └─────────────────────────────────────────────────┘ │
├───────────────────────────────── Routing ───────────────────────────────────────────────────────────────────┤
│ Task              Provider      Model                      Fallback            Max tokens   Enabled   Source  │
│ Resume parsing    [Gemini ▾]    [gemini-2.5-flash-lite ▾]  [— none ▾][       ] [ 4000 ]     [● on]    env     │
│ Answer drafting   [Gemini ▾]    [gemini-2.5-flash-lite ▾]  [— none ▾][       ] [  400 ]     [● on]    env     │
│ Option picks      [Gemini ▾]    [gemini-2.5-flash-lite ▾]  [— none ▾][       ] [  400 ]     [● on]    env     │
│ Field mapping     [Gemini ▾]    [gemini-2.5-flash ▾] ✓     [— none ▾][       ] [  400 ]     [● on]    db ·Reset│
│ Job enrichment    …                                                                                           │
│ Resume match · Job fit · Resume tailoring · Daily job matches · Inbox reading · Rewrite · Summary ·           │
│ Suggestions · Cover letter · Translate                                                                        │
│ Economy model past [80] % of a user's budget: [— none ▾]                                                      │
├───────────────────────────────── Pricing (USD per million tokens) ──────────────────────────────────────────┤
│ Model                       Input      Cached input   Output     Source                                      │
│ gemini-2.5-flash-lite       [0.10]     [0.01]         [0.40]     default                                     │
│ gemini-2.5-flash            [0.30]     [0.03]         [2.50]     default                                     │
│ qwen3:8b (local)            [0.00]     [0.00]         [0.00]     db · Reset        ← Phase 2                  │
│ [+ Add a model price]   Unpriced models are costed at the dearest Flash rate (over-counted, never free).      │
├───────────────────────────────── Recent calls & errors ─────────────────────────────────────────────────────┤
│ [ Last 24 h ▾ ] [ All tasks ▾ ] [ All providers ▾ ] [ Failed only ☐ ]                          Refresh ↻     │
│ When        User          Task      Provider  Model                     Result        Latency   Tokens   Cost│
│ 12:04:11    sophie.lee    parse     gemini    gemini-2.5-flash-lite-001 OK            2 310 ms  3 1k/0.9k $0.0013│
│ 12:03:58    admin         probe     gemini    gemini-2.5-flash-lite-001 OK              412 ms  9/1      $0.0000│
│ 11:58:02    —             jobs      gemini    gemini-2.5-flash-lite     ✖ TIMEOUT     30 004 ms —        —    │
│ …                                                                                   Showing 100 of 1 284      │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Wireframe — 390 px (one column; every control ≥ 44 px tall; 16 px gutters; no horizontal scroll)

```
┌──────────────────────────────┐
│ ← Admin    AI providers      │
│ Server AI            [● ON]  │
│ Calls 24h 1 284 · Failed 7   │
│ p95 1.9 s · Spend $0.41      │
├─ Providers ──────────────────┤
│ Google Gemini      ● Ready   │
│ Key present ✓                │
│ DOSSIER_AI_API_KEY           │
│ Base URL  https://genera… ›  │  ← tap opens a BottomSheet with the input
│ Timeout   30000 ms        ›  │
│ Models    2 models        ›  │
│ [ Test connection        ]   │  ← 44 px, full width
│ OK · 412 ms · flash-lite-001 │
├─ Routing ────────────────────┤
│ Resume parsing      [● on]   │
│ Gemini · gemini-2.5-flash-lite│
│ Fallback none · 4000 tok   › │  ← tap opens a BottomSheet: provider, model, fallback, max tokens
│──────────────────────────────│
│ Answer drafting     [● on]   │
│ Gemini · gemini-2.5-flash-lite│
│ Fallback none · 400 tok    › │
│ … (one card per task)        │
├─ Pricing ────────────────────┤
│ gemini-2.5-flash-lite      › │
│ in $0.10 · cached $0.01 ·    │
│ out $0.40 · default          │
├─ Recent calls ───────────────┤
│ [24 h ▾] [All ▾] [Failed ☐]  │
│ 12:04 parse · gemini · OK    │
│ 2.3 s · $0.0013 · sophie.lee │
│ 11:58 jobs · gemini · TIMEOUT│
│ 30.0 s · —                   │
└──────────────────────────────┘

Confirm sheet (BottomSheet, 70 % snap) when turning Resume parsing OFF:
┌──────────────────────────────┐
│ Turn off resume parsing?     │
│ New users won't get the AI   │
│ parse during setup; the      │
│ heuristic parser still runs. │
│ Reason (required)            │
│ [ Gemini 5xx spike         ] │
│ [ Turn off ]   [ Cancel ]    │
└──────────────────────────────┘
```

### 5.3 Copy (verbatim)

| Where | Text |
|---|---|
| Hero subtitle | Which model answers each task, what it costs, and whether it's working. Keys stay in the server's env. |
| Env-master note | Server AI is off by deployment config (DOSSIER_AI_ENABLED=false). The switch takes effect once that is on. |
| Key present | Key present ✓ · `DOSSIER_AI_API_KEY` · Change it in the server's .env, then restart the API. |
| Key missing | Key missing · set `DOSSIER_AI_API_KEY` on the API and restart. This provider can't be used until then. |
| Provider status chips | ● Ready (enabled + key present + last test OK or no test yet) · ◐ Untested · ○ Not configured (key missing) · ○ Off (disabled) · ✖ Failing (last test failed) |
| Test button | Test connection · while running: Testing… · result line: OK · {served model} · {latency} ms · {in} in / {out} out · ${cost} — or — ✖ {kind}: {message} |
| Test rate-limited | You've run {n} tests this hour — try again after {time}. |
| Toggle global off (dialog) | Turn off server AI? / Every AI feature pauses for every user until it's back on. BYO keys in the extension keep working. / Reason (required) / [Turn off] [Cancel] |
| Toggle parse off (dialog) | Turn off resume parsing? / New users won't get the AI parse during setup; the heuristic parser still runs. / Reason (required) / [Turn off] [Cancel] |
| Toggle provider off (dialog) | Turn off {provider}? / {n} tasks route here: {list}. Those without a fallback will fail until you re-route them. / Reason (required) / [Turn off] [Cancel] |
| Provider in use (409) | {provider} still answers {tasks}. Set a fallback or re-route them first. |
| Undo toast (route) | {Task} now uses {model} on {provider} · [Undo] |
| Undo toast (switch) | {Task} turned off · [Undo] / Server AI turned off · [Undo] |
| Undo toast (price) | Price updated for {model} · [Undo] |
| Reset link | overrides env · Reset |
| Pricing footer | Unpriced models are costed at the dearest Flash rate (over-counted, never free). |
| Recent calls empty | No AI calls in this window. |
| Recent calls error | Couldn't load recent calls. [Retry] |
| Inline validation | Must be between {min} and {max}. / Not a model id (letters, digits, . _ : / -). / Must be an https:// URL (http:// only for localhost). |

---

## 6. API contracts

Base: `/api/admin/ai` (Spring, ROLE_ADMIN by `/api/admin/**` + `@PreAuthorize`). All responses JSON; errors are
ProblemDetail with a `code` property, like `ResumeDocProblemException` (new `AiConfigException` in the service layer,
`AiConfigProblemException` in `web.rest.errors`, mapped by `ExceptionTranslator`).

### 6.1 Endpoints

```
GET    /api/admin/ai/config
  → { envMasterEnabled: bool,
      global:   { enabled: R<bool> },
      economy:  { model: R<string>, softCapPct: R<int> },
      providers:[ { id:"gemini", label:"Google Gemini", kind:"cloud"|"local", enabled:R<bool>, keyPresent:bool, keyRequired:bool,
                    keyEnvVar:"DOSSIER_AI_API_KEY", baseUrl:R<string>, timeoutMs:R<int>, models:R<string[]>,
                    capabilities:["STRUCTURED_OUTPUT","FILES"], configured:bool, usedByTasks:["parse",…],
                    lastProbe: null | { at, ok, model, latencyMs, inputTokens, outputTokens, costMicros, errorKind } } ],
      routes:   [ { task:"parse", label:"Resume parsing", enabled:R<bool>, provider:R<string>, model:R<string>,
                    fallbackProvider:R<string>, fallbackModel:R<string>, maxOutputTokens:R<int>, risk:"HIGH"|"MEDIUM" } ],   // every AiTask except PROBE, in AiTask order
      prices:   [ { model, inputPerMtokMicros:R<int>, cachedPerMtokMicros:R<int>, outputPerMtokMicros:R<int> } ],       // code defaults ∪ db rows
      limits:   { testPerHour:R<int>, callsWindowHours:R<int> } }
  R<T> = { value:T, source:"db"|"env"|"default", envDefault:T|null, codeDefault:T }

PATCH  /api/admin/ai/config/global          { enabled: bool, reason?: string }                      → 200 config.global   (enabled=false ⇒ reason required)
PATCH  /api/admin/ai/providers/{id}         { enabled?, baseUrl?, timeoutMs?, models?, reason?, force?: bool }
                                            // a JSON null for a field deletes the row (back to env); enabled=false ⇒ reason required; 409 AI_PROVIDER_IN_USE unless force
                                            → 200 config.providers[id]
POST   /api/admin/ai/providers/{id}/test    { model?: string }                                      → 200 { ok, model, latencyMs, inputTokens, outputTokens, costMicros, error?: { kind, message } }
                                            // always 200 when the test RAN (ok=false carries the scrubbed error); 429 AI_TEST_RATE_LIMITED; 404 AI_PROVIDER_UNKNOWN; 409 AI_PROVIDER_NOT_CONFIGURED (key missing)
                                            // writes a ledger row task=probe login=<admin>; audits AI_PROVIDER_TEST
PATCH  /api/admin/ai/routes/{task}          { enabled?, provider?, model?, fallbackProvider?, fallbackModel?, maxOutputTokens?, reason? }
                                            // null deletes the row; enabled=false on parse ⇒ reason required; provider must be known AND configured (409 AI_PROVIDER_NOT_CONFIGURED)
                                            → 200 config.routes[task]
DELETE /api/admin/ai/routes/{task}                                                                  → 200 config.routes[task]  (all six rows removed → env)
PUT    /api/admin/ai/prices/{model}         { inputPerMtokMicros, cachedPerMtokMicros, outputPerMtokMicros } → 200 config.prices[model]
DELETE /api/admin/ai/prices/{model}                                                                 → 200 config.prices[model] (back to code default, or gone if none)
GET    /api/admin/ai/calls?hours=24&task=&provider=&failed=false&limit=100&before=<id>
  → { summary: { calls, failed, failedPct, p95LatencyMs, costMicros, byProvider:[{provider, calls, failed, p95LatencyMs}] },
      rows: [ { id, createdAt, login, task, provider, model, success, errorKind, latencyMs, inputTokens, cachedTokens, outputTokens, costMicros } ],
      nextBefore: id|null }
GET    /api/admin/ai/config/history?key=&limit=50
  → [ { id, key, oldValue, newValue, actorLogin, reason, changedAt } ]
```

Validation lives in `AdminAiConfigService` (new): key families, bounds, model-id regex, URL rule, provider
existence, "in use" check, reason-for-HIGH. Every successful write goes through `AdminSettingsWriter` (history +
audit + invalidate). A PATCH with several fields writes several rows in one transaction and returns the fresh
resolved view.

### 6.2 Error codes

| HTTP | `code` | When |
|---|---|---|
| 400 | `AI_CONFIG_UNKNOWN_KEY` | task / provider / field not in the registry |
| 400 | `AI_CONFIG_OUT_OF_BOUNDS` `{key,min,max,allowed}` | bounds or enum violated |
| 400 | `AI_CONFIG_REASON_REQUIRED` `{key}` | HIGH change without reason |
| 400 | `AI_MODEL_INVALID` `{model}` | model id fails the regex |
| 400 | `AI_URL_INVALID` | base URL rule |
| 404 | `AI_PROVIDER_UNKNOWN` | unknown provider id |
| 409 | `AI_PROVIDER_NOT_CONFIGURED` `{provider, keyEnvVar}` | routing to / testing a provider whose key is missing |
| 409 | `AI_PROVIDER_IN_USE` `{tasks[]}` | disabling a provider that routes use without fallback (no `force`) |
| 429 | `AI_TEST_RATE_LIMITED` `{retryAfterSeconds}` | more than `ai.admin.test_per_hour` tests by this admin in the hour |

### 6.3 Rate limit on Test

In-memory sliding window per admin login (`ConcurrentHashMap<String, Deque<Instant>>`), limit =
`ai.admin.test_per_hour` (default 30). Also a hard cap on the probe's output (`max_output_tokens = 16`) and a 15 s
timeout, so the worst case per hour per admin is 30 × ≈ 60 tokens ≈ $0.00005 on Flash-Lite. The probe is a real
call and is written to the ledger (task `probe`) so it is visible on the Recent calls panel and in AI usage.

### 6.4 BFF routes (Next, `web/src/app/api/admin/ai/…`, each forwards with `serverApiFetch` and shapes errors with a
shared `respond.ts` `passthrough` like `job-sources/respond.ts`; the page's initial data is fetched server-side)

```
GET    api/admin/ai/config/route.ts
PATCH  api/admin/ai/config/global/route.ts
GET    api/admin/ai/config/history/route.ts
PATCH  api/admin/ai/providers/[id]/route.ts
POST   api/admin/ai/providers/[id]/test/route.ts
PATCH, DELETE  api/admin/ai/routes/[task]/route.ts
PUT, DELETE    api/admin/ai/prices/[model]/route.ts
GET    api/admin/ai/calls/route.ts
```

Each BFF route validates shape only (types, allowed field names), never bounds — bounds are the API's job and the
API's `detail` is what the UI shows. `[model]` is URL-encoded (`qwen3:8b` → `qwen3%3A8b`).

---

## 7. End-to-end proof on Gemini

### 7.1 The claim being proved

1. An admin changes the **PARSE** (and **REWRITE**) model on `/admin/ai/providers`.
2. The next user call (`POST /api/ai/parse-resume`; `POST /api/resumes/{id}/ai/rewrite`) uses that model **with no
   restart**.
3. The `ai_call` row for that call carries the new `model` and `provider = gemini`, `success = true`, a latency.
4. "Test connection" on the Gemini card returns `ok:true` with a served model, latency and token counts, and a
   `probe` ledger row.

### 7.2 Local demo setup (key never handled by us)

- The user creates **`api/.env.ai.local`** (already covered by root `.gitignore`: `.env.*`), content:
  ```
  DOSSIER_AI_ENABLED=true
  DOSSIER_AI_PROVIDER=gemini
  DOSSIER_AI_API_KEY=<their key>
  ```
  Nothing in the repo reads this file except the launcher below, which passes it to the API process environment.
- **Launcher `scripts/dev/api-local.mjs`** (root `scripts/dev/`, new): parses `api/.env.ai.local` if present
  (KEY=VALUE lines; `#` comments), merges into `process.env` for the child only, spawns `./gradlew bootRun` in
  `api/` (Windows: `gradlew.bat`) with `SPRING_PROFILES_ACTIVE=dev` and any `--` args passed through. It prints
  `api-local: loaded DOSSIER_AI_ENABLED, DOSSIER_AI_PROVIDER, DOSSIER_AI_API_KEY from api/.env.ai.local` — **names
  only, never values**; it refuses to run with `NODE_ENV=production`; it never writes the values anywhere.
  `.claude/launch.json` gains `{ "name": "api-local", "runtimeExecutable": "node", "runtimeArgs":
  ["scripts/dev/api-local.mjs"], "port": 8080 }`. The web runs as today (`npm run dev -w web` with
  `DOSSIER_API_URL=http://127.0.0.1:8080`).
- The API logs at startup, through `AiProviderRegistry`: `AI providers: gemini (key present, enabled), …` — again
  presence only. The Spring `/management/env` actuator is ADMIN-gated already; the design adds
  `DOSSIER_AI_API_KEY` and `DOSSIER_AI_OPENAI_COMPAT_API_KEY` to `management.endpoint.env.keys-to-sanitize` (belt and
  braces).

### 7.3 Automated tests

| Test | Kind | Asserts |
|---|---|---|
| `AiSettingKeysTest` | unit | every family resolves for every `AiTask` and provider id; bounds/allowed as in §3.2; unknown key → null; model regex accepts `gemini-2.5-flash-lite`, `qwen3:8b`, `meta/llama-3.1-8b`, rejects spaces and `..` |
| `AiRuntimeSettingsTest` | unit (fake `AppSettingRepository`) | row › env › code for `model`, `enabled`, `base_url`, `soft_cap_pct`; invalid row → env; `resolved(key).source` correct; `invalidate()` makes the next read see a new row |
| `AdminSettingsWriterTest` | unit | validation errors by code; HIGH without reason refused; identical value → no history/audit; null deletes row and writes history with `new_value NULL`; audit details contain old/new |
| `AiRouterTest` | unit (fake registry, fake adapters) | route by task; `model` argument wins over route model; blank → route model; task disabled → exception + failure row `DISABLED`; provider disabled/unconfigured → fallback when set, exception when not; TIMEOUT/5xx/429 → fallback, 4xx → no fallback; result stamped `provider` + `latencyMs`; `parseResume` with `UNSUPPORTED_INPUT` falls back; probe returns tokens and cost |
| `AiBudgetServiceTest` (extended) | unit | reads `AiRuntimeSettings`; runtime `ai.route.parse.enabled=false` → `TASK_DISABLED`; runtime model overrides env model; economy model from runtime |
| `AiMeteringServiceTest` (extended) | unit | `record` writes provider/latency/success; `recordFailure` writes cost 0, `success=false`, `error_kind` |
| `AiPricingTest` (extended) | unit | settings overlay wins over code default; partial price rows (2 of 3) ignored → default; `costMicros` unchanged |
| `GeminiAiProviderTest` (extended) | unit | key sent as `x-goog-api-key` header, absent from the URL; 429/5xx/timeout map to `httpStatus`/exception kinds; `AiKeyScrubber` removes the key from messages |
| `AiProviderContractTest` (abstract) + `GeminiAiProviderContractTest` | unit with a stubbed `HttpClient` | for every `AiTask`: a request body is produced, a canned success response yields non-blank text and usage; empty candidates → EMPTY; 400 → HTTP_4XX; Phase 2 adds `OpenAiCompatAiProviderContractTest` with the same cases |
| `AdminAiConfigResourceIT` | IT (`@MockitoBean AiProviderRegistry` with a fake `gemini` adapter) | `GET config` 200 for ADMIN, 403 for USER; `PATCH routes/parse {model}` → `source:"db"` and a history row and an `AI_CONFIG_CHANGE` audit row; `PATCH routes/parse {enabled:false}` without reason → 400 `AI_CONFIG_REASON_REQUIRED`; `PATCH providers/gemini {enabled:false}` → 409 `AI_PROVIDER_IN_USE`, with `force` → 200; `POST providers/gemini/test` → 200 ok with a `probe` ledger row; 31st test in an hour → 429; `GET calls` returns the probe row; `DELETE routes/parse` → `source:"env"` |
| `AiRouteSwitchIT` (**the proof**) | IT (`@MockitoBean AiProviderRegistry`; fake adapter records the `model` it was called with) | as ADMIN: `PATCH routes/parse {model:"gemini-2.5-flash"}`; as a USER with consent: `POST /api/ai/parse-resume` → 200; the fake adapter saw `model == "gemini-2.5-flash"`; the newest `ai_call` row has `task=parse, model=gemini-2.5-flash, provider=gemini, success=true, latency_ms ≥ 0`. Then `PATCH routes/parse {model:null}` → next call uses the env model. Same for `rewrite` through `POST /api/resumes/{id}/ai/rewrite` on a Pro user (admin override via the existing `ai-quota` endpoint) |
| `AiResourceIT` (existing) | IT | unchanged and green — it mocks the one `AiProvider` bean (the router) |
| Web `AiProvidersPage.test.tsx` | vitest + RTL | renders config; changing a route model fires `PATCH /api/admin/ai/routes/map` and shows the ✓ and an Undo toast; Undo PATCHes the old value; toggling `parse` off opens the Dialog, Cancel does nothing, confirm with reason PATCHes `{enabled:false, reason}`; a 409 shows the `error` inline; key never appears in the DOM (`screen.queryByText(/AIza/)` is null with a fixture that puts a fake key in nowhere — the fixture simply has no key field, the assertion documents the rule) |
| Web `ai-config.routes.test.ts` | vitest | each BFF route forwards method/path/body and shapes 401/4xx/5xx like `job-sources` |

### 7.4 Live smoke — `web/scripts/ai-smoke.mjs` (I1.14)

Runs against the real API + web (`RB_API` / `RB_WEB` defaults as `rb-smoke.mjs`; same local-host guard; refuses
`NODE_ENV=production`). Credentials for an **admin** and a **test user** come from the gitignored
`web/.env.ai-smoke` (`AI_ADMIN_USER`, `AI_ADMIN_PASS`, `AI_USER`, `AI_PASS`); absent file → registers/activates a
test user the way `rb-smoke` does and requires the admin pair (exits 2 with a one-line instruction). **It never
reads `api/.env.ai.local`.**

Steps (each a `step()` row; exit 0 only if all pass, exit 0 with `SKIP` if the key is absent):

1. `POST /api/authenticate` (admin) → token.
2. `GET /api/admin/ai/config` → if `providers[gemini].keyPresent === false` or `envMasterEnabled === false`:
   print `SKIP: Gemini key not present on the API (set api/.env.ai.local and start with scripts/dev/api-local.mjs)`
   and exit 0.
3. `POST /api/admin/ai/providers/gemini/test` → expect `ok:true`, `latencyMs > 0`, `model` non-blank.
4. Read the current `routes[parse].model`; choose `ALT = providers[gemini].models` entry ≠ current (default
   `gemini-2.5-flash`), `PATCH /api/admin/ai/routes/parse { model: ALT }` → `source:"db"`.
5. As the test user: `PUT /api/admin/users/{user}/ai-quota {budgetCents: 100}` (admin, so the user is budgeted);
   `POST /api/ai/parse-resume { text: <fixture resume>, consent: true }` → 200 with `parsed.experience` non-empty.
6. `GET /api/admin/ai/calls?hours=1&task=parse&limit=5` → newest row: `model` starts with `ALT`, `provider ===
   "gemini"`, `success === true`.
7. `POST /api/ai/draft { task:"pick", question:"Pick one: A) Yes B) No. Answer B.", consent:true }` → 200 answer
   contains `B`; `GET calls?task=pick` newest row `provider gemini`.
8. `GET /api/admin/ai/config/history?key=ai.route.parse.model` → the change from step 4 with the admin as actor.
9. Cleanup: `DELETE /api/admin/ai/routes/parse` (→ `source:"env"`), `DELETE …/ai-quota`.

Prints the table and the three ledger rows (id, task, provider, model, latency, cost). No key, no prompt text, no
answer text is printed beyond a 40-char preview of the pick answer.

### 7.5 Manual check (2 minutes, after the smoke)

Open `/admin/ai/providers` → Gemini card shows **Key present ✓** and the last test → change **Resume parsing**
model → ✓ + undo toast → in another tab upload a resume on `/profiles` setup → Recent calls shows the parse on the
new model → click **Undo** on the toast (or Reset) → Recent calls on the next upload shows the env model. Then flip
**Server AI** off with a reason → `/api/ai/draft` returns `{disabled:true}` (extension shows "Kiwiply AI is off") →
flip on → works. Both flips appear on `/admin/audit` as `AI_CONFIG_CHANGE` with the reason.

---

## 8. Phase 2 design sketch — the OpenAI-compatible provider (Ollama first)

### 8.1 Adapter `OpenAiCompatAiProvider` (`id = "openai_compat"`, label "OpenAI-compatible (Ollama, LM Studio, llama.cpp, vLLM, OpenAI, OpenRouter, Groq)")

- **Env** (`AiProperties.openaiCompat.*`): `DOSSIER_AI_OPENAI_COMPAT_BASE_URL` (default
  `http://localhost:11434/v1`), `DOSSIER_AI_OPENAI_COMPAT_API_KEY` (optional; blank is **configured** for local
  hosts, **unconfigured** for non-local hosts — a cloud OpenAI-compatible host without a key is refused),
  `DOSSIER_AI_OPENAI_COMPAT_MODEL` (default `qwen3:8b`; re-check at build), `DOSSIER_AI_OPENAI_COMPAT_SCHEMA_MODE`
  (default `auto`). Runtime settings: the `ai.provider.openai_compat.*` family + `schema_mode` (ENUM `auto |
  json_schema | json_object | none`) + `extra_headers` is **not** offered (no secrets in settings).
- **Wire**: `POST {base}/chat/completions` with `messages[{role:system},{role:user}]`, `max_tokens` (the route's
  cap), `temperature 0.2` for structured tasks / `0.7` for DRAFT, `stream:false`. `Authorization: Bearer <key>`
  only when a key is present.
- **Structured output** per `schema_mode`: `json_schema` → `response_format: {type:"json_schema", json_schema:{name,
  schema, strict:true}}` (OpenAI, vLLM, llama.cpp server, LM Studio, recent Ollama); `json_object` →
  `response_format:{type:"json_object"}` plus the schema pasted into the system prompt as an instruction (older
  Ollama, Groq); `none` → instruction only. `auto` = try `json_schema`; on HTTP 400 mentioning `response_format`
  /`json_schema`, remember `json_object` for this process (`AtomicReference`) and retry once. **Test connection**
  reports the mode it settled on (`error.kind = SCHEMA_MODE_DOWNGRADED` is informational, `ok:true`).
  Schemas: the Gemini `responseSchema` constants are converted by a small `GeminiSchemaToJsonSchema` (uppercase
  type names → lowercase, `OBJECT` → `object`, plus `additionalProperties:false` for strict mode) until I1.5 makes
  schemas provider-neutral; I1.5 then deletes the converter.
- **Files**: `parseResume(fileBase64 != null)` throws `AiProviderException(UNSUPPORTED_INPUT)` → router falls back
  (→ Gemini). Text parses work. The routing table shows "text only" on the local provider for Resume parsing and the
  confirm dialog (§5) warns when `parse` is routed to it without a cloud fallback.
- **Usage mapping**: `usage.prompt_tokens` → inputTokens, `usage.completion_tokens` → outputTokens,
  `usage.prompt_tokens_details.cached_tokens` → cachedTokens when present (OpenAI); Ollama returns no cache field →
  0. `model` from the response's `model` field.
- **Timeouts for CPU inference**: provider default `timeout_ms = 120000`; the router uses `max(providerTimeout,
  routeParseMinimum 60000)` for PARSE; the admin UI shows a hint "Local CPU models can take 30–120 s; keep the drawer
  tasks (pick, map, draft) on a cloud provider unless a GPU is attached". Connect timeout 5 s so a stopped Ollama
  fails fast (`TRANSPORT` → fallback).
- **Capabilities** advertised: `STRUCTURED_OUTPUT` (mode-dependent), no `FILES`; `EMBED` comes with I4.1
  (`POST {base}/embeddings`, same adapter).

### 8.2 Docker profile for dev and demo (I1.16)

`api/src/main/docker/ollama.yml` (next to `mysql.yml` / `minio.yml`):

```yaml
services:
  ollama:
    image: ollama/ollama:<pin at build time>      # pin tag + digest like chromium in docker-compose.prod.yml
    ports: ["11434:11434"]
    volumes: ["ollama-models:/root/.ollama"]
    environment: [OLLAMA_KEEP_ALIVE=30m, OLLAMA_NUM_PARALLEL=1]
    # GPU (optional): uncomment the deploy.resources.reservations.devices block for NVIDIA
volumes: { ollama-models: {} }
```

`scripts/dev/ollama-pull.sh` / `.ps1`: `ollama pull qwen3:8b qwen3:4b nomic-embed-text` (names re-checked at
build). `scripts/dev/api-local.mjs` gains `--with-ollama` which `docker compose -f api/src/main/docker/ollama.yml
up -d` first and sets `DOSSIER_AI_OPENAI_COMPAT_BASE_URL=http://127.0.0.1:11434/v1`. **Not** added to
`docker-compose.prod.yml` (the shared box has no GPU and no spare memory — CLAUDE.md "co-hosted with BeeCompete").

### 8.3 Zero or amortised pricing per model

Local models are seeded in the pricing table at `$0 / $0 / $0` (`AiPricing` code defaults gain an entry list from
`AiProperties.openaiCompat.freeModels`, default = the pulled names above), so budgets treat them as free and the
margin guard's worst case is unchanged. An admin may enter an **amortised** price (e.g. electricity + GPU
depreciation ÷ expected monthly tokens) in the same three fields — it is just a price row. The pricing footer
gains: "Local models default to $0; enter an amortised rate if you want local use to count against budgets."

### 8.4 Eval-gated promotion of a task to local (I1.17)

A task's route may be moved to `openai_compat` **in production** only after:
1. `./gradlew aiEval -Ptask=<task> -Pprovider=live -Pmodel=<local model>` (I2.3) scores ≥ baseline − 2 on the
   composite score **and** 100 % on the deterministic truth checks for writing tasks;
2. p95 latency on the target hardware ≤ the route's timeout ÷ 2;
3. the change is made on the admin page with the eval run id in the **reason** field (so the history row cites the
   evidence).
Until I2.3 exists, the interim gate is `docs/runbooks/ai-local-models.md`: a 20-case checklist per task (inputs
from `api/src/test/resources/ai-evals/<task>/` once I2.2 lands; before that, the fixtures in the existing service
tests) run by hand on both providers, with the comparison table pasted into the PR. Order of promotion candidates:
EMBED (when built) → PICK → ENRICH → MAP → JOBS/INBOX (nightly) → never PARSE-with-PDF, never REWRITE/SUMMARY
without a GPU box and an eval win.

---

## 9. Decisions table

| # | Decision | Why |
|---|---|---|
| D1 | The single `AiProvider` bean becomes `AiRouter`; adapters live in `AiProviderRegistry`, not as beans | Zero changes to the eight callers and to every `@MockitoBean AiProvider` IT; one seam stays one seam |
| D2 | Settings in `app_setting` via `AiSettingKeys` families + `AiRuntimeSettings`; no `ai_provider` / `ai_route` tables | The seam exists, is typed and bounded, and A5.1 adopts the key list as is; tables would need their own admin CRUD and a later migration into settings |
| D3 | `app_setting_history` created now with A5.1's exact DDL; audit action `AI_CONFIG_CHANGE` | History + audit on every change is a CLAUDE.md requirement; A5.1 inherits, does not migrate |
| D4 | Precedence row › env › code, **except** `DOSSIER_AI_ENABLED=false` is a master that only lowers | Secretless/dev/CI deployments stay off by default; an admin session cannot turn AI on where the operator turned it off |
| D5 | Keys env-only; admin sees presence + env var name; no key entry UI | CLAUDE.md "API keys via env only; never commit secrets"; removes the whole class of key-in-DB leaks |
| D6 | Gemini key moves to the `x-goog-api-key` header; `AiKeyScrubber` on every error string | A key in a URL ends up in exception messages, logs and the Test response; the header form is supported and invisible |
| D7 | Phase 1 implements **one-step fallback** in the router; the circuit breaker stays in I1.4 | Fallback is small and is what makes the Ollama demo honest (local down → Gemini); the breaker needs I8 metrics |
| D8 | Ledger gains `provider, latency_ms, success, error_kind` now; failure rows written by the router | The "recent calls & errors" panel needs errors; these are I0.4's columns, taken early, same names |
| D9 | Per-task switches are `ai.route.<task>.enabled` (env `disabled-tasks` stays the default); feature-level `ai.feature.*` arrives with the gateway (I0.3/A4.3) | Mirrors what `AiPolicy` does today; feature grouping is a gateway concept |
| D10 | Budget sizes ($3/$8/$6/$16) stay on env/`AiPolicy`; not on this page | Locked product decisions; A3/A5.1 move them to the catalog with the margin guard, not an AI page |
| D11 | Test connection is a real, metered, audited, rate-limited call, recorded as task `probe` | Honest status, visible cost, abuse-bounded |
| D12 | `AiTask.PROBE` added (not reachable from `/api/ai/draft`) | The ledger's `task` column must name it; `fromWire` excludes it like the other internal tasks |
| D13 | Prices in settings use the I1.6 naming `ai.price.<model>.{input,cached,output}_per_mtok_micros`; `AiPricing` keeps code defaults underneath | I1.11 supersedes I1.6 without a rename later; micros avoid decimals in `varchar` |
| D14 | Production stays on Gemini (cloud); local models are for dev, CI, the demo, embeddings and nightly batches, pending a GPU box and an eval win | The prod VPS is CPU-only and shared; CPU inference is 30–120 s for 8 B models — unusable in a form |
| D15 | Phase 2 provider is one generic `openai_compat` adapter, one instance | Covers Ollama, LM Studio, llama.cpp, vLLM, OpenAI, OpenRouter, Groq; multiple instances (`openai_compat:<name>`) only if a real need appears |
| D16 | The admin page saves per control (autosave, ✓, undo) and never shows a Save button; HIGH changes confirm with a reason | Gen Z / Notion-style UX rule; CLAUDE.md audit rule |
| D17 | HIGH changes need a reason now; re-auth arrives with A0.5 | A0.5 is not built; blocking this page on it would be the wrong dependency |
| D18 | Web renders only Gemini in Phase 1; the provider card component is generic (`providers[]`) so Phase 2 is data, not UI work | — |

## 10. Non-goals (this design)

- No key management in the UI, ever (not even "paste to test").
- No per-org routing, no per-user model choice, no canary (I1.7), no budget-position tiers (I1.3), no breaker (I1.4),
  no provider-neutral schema classes (I1.5), no gateway (I0.3), no alerts (A4.4) — this design plugs into each.
- No prompt editing from admin (out of admin by decision; prompts are code, I2.1).
- No Anthropic provider here (I1.2 is unchanged and gains the registry as its home).
- No streaming, tools or embeddings in the adapters (I9.6, I4.1).
- No auto-promotion of tasks to local; promotion is a human, eval-backed admin change.
- No changes to the extension (BYO keys are I6.x; the drawer already handles `{disabled:true}`).

## 11. Roadmap reconciliation (what the new stories absorb or supersede)

| Existing | Effect |
|---|---|
| I1.3 routing table v2 | **Builds on** I1.9/I1.10: keeps mid/economy tiers by budget position, pin and canary; its key family stays `ai.route.<task>.*` (adds `mid`, `economy`, `pin`, `canary_model`, `canary_percent`). `deps` += I1.9, I1.10 |
| I1.4 fallback + breaker | One-step fallback lands in I1.10; I1.4 keeps the breaker, HALF_OPEN probe and the `PROVIDER_ERRORS` alert. `deps` += I1.10 |
| I1.6 pricing on settings | **Superseded by I1.11** (same keys; Anthropic rates are seeded by I1.2 when it lands) |
| I0.4 ledger v2 | Partially absorbed: `provider, latency_ms, success, error_kind` + failure rows land in I1.10; I0.4 keeps `feature, cache_hit, prompt_version, org_id, request_id` and the `ai_usage` retirement. `relates` += I1.10 |
| I8.2 provider health | The 5-min synthetic ping reuses `AiRouter.probe` and the card's `lastProbe`. `relates` += I1.11 |
| A4.1 AI usage (remaining) | "'Edit limits' toast → A4.3" becomes "→ I1.13 (link to /admin/ai/providers)" |
| A4.2 ledger columns + rollup | "Provider prices moved to runtime settings `ai.price.*`" is done by I1.11; the rest stays. `relates` += I1.10, I1.11 |
| A4.3 platform caps + kill switches | Global and per-task kill switches on runtime settings land in I1.11/I1.13; A4.3 keeps platform daily/monthly caps, `AI_PAUSED`, and the gateway order. `relates` += I1.11 |
| A5.1 settings registry | Absorbs `AiSettingKeys` (families), `ResumeBuilderSettings.stored()`, `AdminSettingsWriter` and `app_setting_history` by moving them under `SettingDefinitions`/`SettingsService`; nothing to migrate. `relates` += I1.9 |
| A5.2 env knobs → settings | The AI knobs (models, economy, soft cap, output caps, timeouts, disabled tasks) are done by I1.9; A5.2 keeps jobs/inbox/rate limits/digest/uploads/… `relates` += I1.9 |
| ADMIN-PLAN 9.B1 | The AI column of 9.B1 is delivered by Phase 1 |

## 12. Open question for the user (one)

**Q1.** For the demo, should the admin page also be reachable in the mock-API demo (`npm run dev:demo -w web`)
with a fake provider, or only against the real API? Default if unanswered: **real API only** (the mock API gets a
static `GET /api/admin/ai/config` fixture so the page renders, but no writes) — recorded in I1.12's AC.

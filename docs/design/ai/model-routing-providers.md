# Design — Model routing and provider abstraction (area `ai`, epic I1)

Status: decided 2026-10-11. Inputs: `AiProvider` / `GeminiAiProvider` / `AiConfiguration`
(provider is config, one branch per provider), `AiPolicy` (per-task env routing, economy model,
disabled tasks), `AiPricing` (code constants), user decision 2026-09-22 ("stay on gemini-2.5-flash-lite
until the Gemini API announces a shutdown; the successor is one env var away"), the budgets
(Pro $3/$8, Autopilot $6/$16), and current Anthropic list prices (checked 2026-10-11 via the `claude-api`
reference: Haiku 5.5 $0.10 / $0.50 per MTok, Sonnet 5.5 $2 / $10, Opus 5.5 $4 / $20; cache reads
≈ 10 % of input; Haiku rates apply to prompts ≤ 100 K tokens).

## 0. Summary

1. **Two providers, one seam.** `AnthropicAiProvider` joins `GeminiAiProvider` behind the same
   `AiProvider` interface (raw `java.net.http`, like Gemini — no new dependency; see open question
   I-Q1 on the official Java SDK). Selecting a provider per task is a routing-table entry, not a build.
2. **Route by task and by budget position.** Quality-sensitive writing (tailor, rewrite, summary, cover
   letter, interview feedback) runs on **Claude Sonnet 5.5** while the user is below 50 % of the period
   budget, **Claude Haiku 5.5** between 50–80 %, and the economy model (Haiku 5.5 or Gemini 2.5
   Flash-Lite, whichever is configured) above 80 %. Classification, mapping, picks, scoring, parsing
   and the assistant run on the economy tier always. **Claude Opus 5.5 never serves users** — it is the
   offline eval judge (prompt-registry-evals.md).
3. **Structured outputs are provider-neutral.** Each task owns one `AiSchema` (JSON Schema) that the
   gateway compiles to Gemini `responseSchema` or Anthropic `output_config.format`; the five schema
   string constants leave `GeminiAiProvider`.
4. **Fallback + circuit breaker.** 5xx / 429 / timeout → the task's fallback route (other provider, same
   tier); five failures in 60 s open the breaker for that provider for 2 min; `PROVIDER_ERRORS` alert.
5. **The routing table is a runtime setting** (`ai.route.<task>`) with env defaults (A5.2), so a model
   retirement, a price change or an outage is an admin edit with audit, not a deploy. A canary percent
   per task routes N % of calls to a candidate model for the eval harness to compare.
6. **Pricing lives in settings** too (`ai.price.<model>.{input,cached,output}`), seeded from
   `AiPricing` defaults plus the Anthropic rates; an unpriced model raises `UNPRICED_MODEL`.

## 1. Why Claude models now, when the 2026-09-22 decision said "stay on Flash-Lite"

That decision was about not *chasing* Gemini versions. It still holds for the economy tier: Flash-Lite
stays configured and nothing forces a switch. What changed is price parity — Haiku 5.5 input costs the
same as Flash-Lite ($0.10/M) and output is within 25 % ($0.50 vs $0.40) — so a second provider at the
same tier is now free insurance against a Gemini outage/retirement, and Sonnet 5.5 gives the writing
tasks a quality step that Flash-Lite cannot, at a cost the budget math absorbs (gateway doc §5). The
user's decision is extended, not reversed: **"one env var away" becomes one routing-table row.**

## 2. Provider contract (v2)

```java
public interface AiProvider {
    String id();                                   // "gemini" | "anthropic"
    boolean isConfigured();
    Set<Capability> capabilities();                // STRUCTURED_OUTPUT, TOOLS, STREAMING, FILES, CACHING, BATCH, EMBED
    AiResult generate(AiCall call) throws AiProviderException;          // call = model, system, messages, schema, tools, maxOutput, temperature, cacheHints, timeout
    Flux<AiEvent> stream(AiCall call);                                   // I9.6
    AiResult parseDocument(AiCall call, byte[] file, String mime);       // PDF/DOCX inline
    List<float[]> embed(String model, List<String> texts);               // embeddings doc; UnsupportedOperation if absent
}
```

`AiCall` is built by the gateway from the prompt registry (system + user template rendered) and the
task's `AiSchema`. Anthropic specifics the adapter hides: `max_tokens` required; `output_config.format`
for JSON; `tools` + `tool_choice: auto` for function calling (forced tool choice is rejected on 5.5
models — the assistant design never needed it); `cache_control` on the stable prefix; thinking left at
the model default with `output_config.effort: "low"` for classification/mapping and `"medium"` for
writing tasks (Sonnet 5.5 defaults to high — set explicitly; Haiku 5.5 defaults to medium). Gemini
specifics it already hides: `responseSchema`, `inline_data`, `thoughtsTokenCount` billed as output.

Token usage normalisation: `AiResult(inputTokens, cachedTokens, outputTokens)` stays; Anthropic maps
`cache_read_input_tokens → cachedTokens`, `cache_creation_input_tokens` priced at 1.25 × input.

## 3. Routing table (defaults; runtime-editable)

| Task | Primary (< 50 % budget) | Mid (50–80 %) | Economy (≥ 80 %, THROTTLED, Free parse) | Fallback provider | Max out | Timeout |
|---|---|---|---|---|---|---|
| TAILOR, REWRITE, SUMMARY, COVER, TRANSLATE | `claude-sonnet-5-5` | `claude-haiku-5-5` | `claude-haiku-5-5` ⇄ `gemini-2.5-flash-lite` | gemini | 3 000 | 45 s |
| INTERVIEW (feedback turns) | `claude-sonnet-5-5` | `claude-haiku-5-5` | economy | gemini | 700 | 30 s |
| ASSISTANT, ASSISTANT_SUMMARY | `claude-haiku-5-5` | same | economy | gemini | 700 | 20 s |
| DRAFT, PICK, MAP, ENRICH | economy | same | same | gemini/anthropic | 400 | 20 s |
| FIT, MATCH, JOBS, INBOX, EMBED-rerank | economy | same | same | other | 1 200–3 000 | 30 s |
| PARSE | `gemini-2.5-flash-lite` (PDF inline proven) | same | `claude-haiku-5-5` (PDF via document block) | anthropic | 4 000 | 60 s |
| EMBED | `gemini-embedding-001` (256-dim Matryoshka) | — | — | none (queue + retry) | — | 30 s |
| EVAL_JUDGE (offline) | `claude-opus-5-5` weekly / `claude-sonnet-5-5` per PR | — | — | — | 1 000 | 60 s |

Budget-position tiers use `AiBudgetService.Decision.used` (percent). Autopilot plans use the same
tiers against the larger budget. An admin `ai.route.<task>.pin=<model>` overrides the tiers (incident
lever). Orgs get the same table (no per-org routing in v1).

## 4. Data / settings

```
ai.enabled                       bool   (A4 D3)
ai.feature.<feature>.enabled     bool
ai.route.<task>.primary          string model id
ai.route.<task>.mid              string
ai.route.<task>.economy          string
ai.route.<task>.fallback         string provider id
ai.route.<task>.canary_model     string | blank
ai.route.<task>.canary_percent   int 0..20
ai.route.<task>.max_output       int
ai.route.<task>.timeout_ms       int
ai.price.<model>.input_per_mtok_micros / cached / output / cache_write
ai.provider.<id>.breaker.failures=5, window_s=60, open_s=120
```
All in `app_setting` (A5.1) with bounds and HIGH audit on `ai.enabled` / feature switches / pins; env
defaults keep dev/CI secret-free (blank Anthropic key = provider unconfigured = routes fall through to
Gemini; both blank = `DisabledAiProvider`, as today).

## 5. State machine — the circuit breaker per provider

```
CLOSED ──5 failures / 60 s──▶ OPEN ──after 120 s──▶ HALF_OPEN ──1 success──▶ CLOSED
                                                      └──1 failure──▶ OPEN
OPEN: router skips the provider; if the fallback is also OPEN → AiRefused(AI_PAUSED, retryAfter=open remaining)
```
Metrics `ai.breaker.state{provider}`; `ai_alert PROVIDER_ERRORS` HIGH when a breaker opens (A4.4).

## 6. Cost math (per 1 000 Pro users, median behaviour; see gateway doc §5 for caps)

| Scenario | Monthly platform cost | Note |
|---|---|---|
| All-Gemini today (Flash-Lite everything) | ≈ $600 ceiling if everyone hit 100 %; measured ≈ $0.40/user → $400 | from `ai_call` once rollups exist (A4.2) |
| Routing v2, median use | ≈ $0.60/user → $600 | Sonnet on ~5 tailors + 1 cover/month ≈ +$0.12/user |
| Routing v2, heavy user (caps) | $3 (stopped) | unchanged ceiling — the margin guard's worst case is the budget, not the model |
| Context caching on assistant/interview (I7.2) | −20–30 % of those features | stable prefix ≥ 1 024 tokens on Haiku 5.5 |
| Batch API for nightly JOBS + EMBED (I7.3) | −50 % on those | both providers offer 50 % batch |

Platform-wide monthly cap (A4 D2 default $600) stays the hard stop above all of this.

## 7. Failure modes

| Failure | Behaviour |
|---|---|
| Anthropic key blank | provider `isConfigured()=false`; routes needing it fall to Gemini silently; admin status card shows "anthropic: not configured" |
| Model id retired (404 from provider) | breaker counts it; `ai_alert MODEL_NOT_FOUND` HIGH with the task; admin pins a replacement |
| Schema compile mismatch (a JSON-Schema feature one provider rejects) | `AiSchemaTest` runs every task schema through both compilers in CI; runtime: 400 from provider → fallback provider + alert |
| Price missing for a new model | cost at fallback (dearest Flash) rate + `UNPRICED_MODEL` alert (admin design §6) |
| Canary model worse | eval compares canary vs primary per task weekly; canary never exceeds 20 % |
| `refusal` stop reason on a Claude model (safety classifier) | treated as `failure_kind=REFUSED`, no retry, user copy "Kiwiply AI couldn't help with that"; counted in evals |

## 8. Security / privacy

- Keys env-only, never in the bundle (rule kept); Anthropic key `DOSSIER_AI_ANTHROPIC_API_KEY`.
- **Data retention posture:** both providers on paid/API tiers with no training on inputs; document the
  retention windows on the transparency page (fairness doc §5). The current Options copy about the
  Gemini *free tier* training on inputs must be verified against the production key (I-Q3) and
  corrected either way (I1.8).
- Prompts never include EEO/self-ID fields (fairness doc §1); the provider adapters receive already
  minimised inputs.

## 9. Evals and tests

`AnthropicAiProviderTest` (request body shape, usage mapping, cache tokens, refusal mapping, tool call
parsing), `AiSchemaCompilerTest` (both providers × every task schema), `AiRouterTest` (tier by budget
percent, THROTTLED, pin, canary bucketing is stable per request id), `CircuitBreakerTest`,
`AiPricingSettingsTest` (settings override defaults; Anthropic rates), eval harness runs each writing
task on Sonnet vs Haiku vs Flash-Lite and records the quality delta that justifies the tiers (I2.3).

## 10. Rollout

I1.2 Anthropic provider behind blank key → I1.5 schema abstraction (no behaviour change on Gemini) →
I1.3 routing table on settings with today's values → I1.4 breaker/fallback → I1.6 pricing on settings →
flip TAILOR primary to Sonnet 5.5 for a 10 % canary → eval → 100 % → I1.7 canary tooling for the rest.

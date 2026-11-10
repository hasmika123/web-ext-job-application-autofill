# Design — Bring-your-own key and extension AI parity (area `ai`, epic I6)

Status: decided 2026-10-11. Inputs: `job-autofill/src/background/service-worker.js` (`callAnthropic`,
`draftAnswer`, picks, `mapFieldsViaModel`, enrichment — BYO first, server second), `src/lib/parser.js`
(`llmStructure` BYO parse), `entrypoints/options/OptionsApp.tsx` (key + server AI + consent switches),
`src/lib/storage.js` (`llmEnabled`, `apiKey` in `chrome.storage.local`), locked decisions (Free = BYO
only; server AI is Pro except one parse per resume; no new engine deps without asking; engine stays
vanilla JS on `window.JAF`), ROADMAP market cross-check ("your BYO-key free path is a differentiator —
keep it"), gaps **G6** (Pro free-text answers; Free sees the BYO path) and **G8** (Autopilot
ask-and-remember).

## 0. Summary

1. **BYO stays, and becomes a first-class provider in the extension.** `JAF.ai` (new engine module,
   vanilla) exposes `draft/pick/map/enrich/parse` with two backends: `byo` (user's key, direct to the
   provider from the service worker) and `server` (the Kiwiply gateway). The choice order is unchanged
   (BYO first when present) — it is the Free tier's AI.
2. **Two BYO providers, current models.** Anthropic (`claude-haiku-5-5` default, `claude-sonnet-5-5`
   optional) and Google (`gemini-2.5-flash-lite`). The hard-coded `claude-sonnet-4-6` goes; model ids
   come from the extension remote config (A5.5) with built-in defaults, so a retirement is a config
   push, not a store release.
3. **Same prompts, same checks.** The server publishes a versioned **prompt bundle** for the four
   extension tasks (registry doc §2); the extension caches it (24 h) and falls back to the built-in copy.
   `src/lib/ai-guard.js` ports the numbers/entities/dates truth checks (guardrails doc §3) so a BYO draft
   is flagged exactly like a server draft.
4. **Keys never leave the device.** Stored in `chrome.storage.local` (not `sync`), masked in the UI,
   excluded from bug reports and telemetry (`analytics.js` scrub list), cleared by "Disconnect & clear".
   A "Test key" button validates with a 1-token call and shows the provider's error verbatim.
5. **A local meter.** Options shows "this month on your key: ~N calls · ~$0.0X est." computed from
   usage fields the provider returns — nothing is uploaded. Server AI shows the existing % meter.
6. **Web stays server-only.** No BYO on kiwiply.com (locked: Pro gates server AI there; the extension is
   the Free user's AI surface). Pricing and Options copy say the same sentence (I6.6).

## 1. Audience lens

A student on Free already has a Claude or Gemini key from class or a hackathon. Pasting it should take
20 seconds, work on the next form, and never feel like a trap: clear "where this goes" copy, a test
button, a cost estimate, and the same honest `[check]` highlights paying users get.

## 2. Module layout (engine, vanilla, `window.JAF`)

```
src/lib/ai.js            JAF.ai.run(task, inputs) → picks backend; applies ai-guard; returns {text|json, sources, flags, backend, usage}
src/lib/ai-providers.js  JAF.aiProviders.anthropic / google — fetch wrappers (messages API / generateContent), usage parsing, error mapping
src/lib/ai-prompts.js    built-in prompt bundle (generated from the registry at build time: scripts/export-prompt-bundle.mjs) + bundle cache
src/lib/ai-guard.js      JAF.aiGuard.check(output, sources) → violations; flag(); numbers/entities/dates (no fuzzy lib — simple normalised includes + a 2k tools list)
src/lib/ai-meter.js      local usage counter per month (calls, tokens, est. cost by model rate table from remote config)
```
`service-worker.js` keeps the message types (`JAF_DRAFT`, `JAF_PICK`, `JAF_MAP_FIELDS`, enrich) and
delegates to `JAF.ai.run`. `parser.js` BYO parse calls `JAF.ai.run("parse")`. The `anthropic-dangerous-
direct-browser-access` header stays (it is the documented way for extensions); Gemini is called with
`?key=`. Both hosts are already in `wxt.config.ts` host permissions for Anthropic; `generativelanguage.
googleapis.com` is added in its own store release with a listing note (trust area G30 lists it).

## 3. Prompt bundle

```
GET /api/ai/prompts?for=extension&v=<engine version>   (public, cached 24 h, ETag)
→ { "version": 7, "prompts": { "draft.answer": {system, user, maxOutput}, "instruction.generic": …, "map.fields": …, "enrich.posting": … },
    "models": { "anthropic": ["claude-haiku-5-5","claude-sonnet-5-5"], "google": ["gemini-2.5-flash-lite"] },
    "rates": { "claude-haiku-5-5": {in:0.10,out:0.50}, … } }
```
Built-in copy is generated at build time from the same registry records (one script, one source of
truth); CI fails if the built-in bundle is older than the registry's latest version for those four
prompts. Templates use the same `{{slot}}` syntax and the same `Untrusted` delimiters.

## 4. Truth checks in the extension (`ai-guard.js`)

Sources for a draft = the profile fields the drawer sent as context (already minimised to the
allowlisted ProfileCard shape — the extension builds it from the mirror with the same key list, exported
as `JAF.profileCard`). Output sentences are split; numbers/dates/capitalised tokens not found in the
sources are flagged; the overlay highlights them and lists "from your profile: …" (G6). "Insert" is
allowed with flags visible; the user's own edits clear flags. No network, < 5 ms.

## 5. Settings (Options page, 390 px-aware)

```
┌──────────────────────────────┐
│ Kiwiply AI                   │
│ ● Use my own key (Free)      │
│   Provider  [Anthropic ▾]    │
│   Model     [Haiku 5.5 ▾]    │
│   Key       ••••••••••3f  👁  │
│   [Test key]  ✓ works        │
│   Stored on this device only.│
│   Sent only to api.anthropic │
│   .com. Never to Kiwiply.    │
│   This month: 41 calls ·     │
│   ~$0.02 est.                │
│ ○ Use Kiwiply AI (Pro)       │
│   ▓▓▓▓░░░░ 38% · resets Nov 1│
│   ☐ I consent to sending my  │
│     question + profile card  │
│ [Disconnect & clear key]     │
└──────────────────────────────┘
```
Rules: BYO and server AI can both be on (BYO wins, as today); a Free user with no key sees the Pro
upsell line, never a dead end; the consent checkbox copy is corrected once I1.8 settles the provider
tier (no "free tier may train" sentence if the production key is paid).

## 6. Autopilot ask-and-remember (G8) — the AI part

When 19.3 parks an item with `unknown_question`, the drawer shows the question; the user's answer is
stored as a learned answer (`field_cache` via the existing sync, provenance `autopilot`) **and** as a
run-scoped answer map so every later item in the run with the same normalised question (`JAF.ai`
`questionKey` = lowercase, punctuation-stripped, ≤ 12 words) is pre-answered without an AI call. For
free-text questions the drawer offers "Draft with Kiwiply" (server, Pro) or BYO — the same `JAF.ai.run`
path with sources and flags. Nothing is auto-inserted into attestation/consent boxes (19.2 rule).

## 7. Failure modes

| Failure | Behaviour |
|---|---|
| Key invalid / revoked | provider 401 → overlay "Your key was rejected — check Options"; falls back to server AI only if Pro + consent, else deterministic |
| Provider rate-limit (429) | one retry after `retry-after` (≤ 10 s), then the same fallback |
| Model id retired | remote config lists models; built-in default updated in the next release; the SW maps 404 → "pick another model in Options" |
| Bundle fetch fails | built-in prompts; a stale-bundle chip in Options after 7 days |
| Key leaks into a bug report | scrub list in `analytics.js`/bug-report composer tested with a fixture key |
| CORS/host permission missing (Gemini) | feature hidden until the host permission release is installed (`chrome.permissions.contains`) |

## 8. Security / privacy

Key at rest in `chrome.storage.local` (Chrome encrypts the profile at the OS level; no app-level crypto
— decision; obfuscation would be theatre). Never in `storage.sync`, never in the mirror, never in
telemetry, never sent to Kiwiply. The BYO request carries the same minimised ProfileCard as the server
path — no extra fields because it is "the user's own key". Page text is wrapped as `Untrusted` on the
device before it reaches either backend.

## 9. Tests (extension `npm test`, node + jsdom)

`ai.test.js` (backend order, Free/Pro fallbacks, question key), `ai-providers.test.js` (request shapes
for both providers with a fetch stub; usage parsing; error mapping), `ai-prompts.test.js` (bundle ETag,
cache, fallback, version check vs built-in), `ai-guard.test.js` (numbers/dates/entities, flags, 5 ms
budget), `ai-meter.test.js`, Options component test (mask, test-key states, both switches), scrub test
for the key in bug reports. Smoke test bumps `src/config/rules.js` version if rules change (ritual).

## 10. Rollout

I6.3 prompt bundle (server endpoint + build script, behaviour-neutral) → I6.2 BYO v2 (providers, model
select, test key; its own store release for the Gemini host) → I6.4 guard → I6.5 meter → I6.6 copy
alignment → I6.7 mapper telemetry → I9.8 ask-and-remember with Phase 19.

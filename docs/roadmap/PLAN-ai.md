# PLAN — area `ai` (AI platform: gateway, routing, prompts & evals, guardrails, embeddings, fairness, BYO key)

Written 2026-10-11. Machine-readable twin: `docs/roadmap/areas/ai.json` (10 epics, 75 stories:
4 done · 1 partial · 70 not started). Audit + competitive benchmark: `docs/roadmap/AUDIT-ai.md`.
Deep designs: `docs/design/ai/*.md` (7). This area owns the *platform* under every AI feature;
the features themselves stay with their areas (U8 assistant, U9 interview prep, R4/R5 builder AI,
U4 matching, O10 marketer, A4 cost governance) and consume what is built here.

## 1. The shape of the problem

Phase 13 built a real, honest AI foundation: a task-typed provider seam, cost metering into a ledger,
per-period budgets with a percent meter, kill switches, caches, and — for tailoring only — server-side
truth checks that stop the model inventing numbers. What it did not build is anything that would let
us claim **"the best AI in this space"** out loud: there is one provider with provider-shaped schemas,
prompts are string constants in eight files, there is not a single quality measurement, truth checks
protect one feature out of ten, retrieval is word overlap, scores are bare numbers, and the Free tier's
AI (the BYO key — a differentiator nobody else has) runs a retired model id with none of the checks.

The market (AUDIT §5) sells AI writing at $29–50/month and the two complaints that dominate every
competitor's one-star reviews are *"generic / hallucinated / needs heavy editing"* and *billing
surprises*. The locked decisions already answer the second. This plan answers the first with one idea:
**verifiable AI** — every generated sentence is grounded in the user's own data and says where it
came from; every score carries its evidence; every prompt has a measured quality number we can
publish; protected data provably never reaches a model. Price stays where it is; the budget math
(gateway doc §5, routing doc §6) absorbs a stronger writing model inside the $3/$8 and $6/$16 ceilings.

Nothing here re-litigates a locked decision: Free has no server AI except one parse per resume; BYO
key stays the Free path; nothing is unlimited; ≥ 80 % worst-case margin (the ceiling is still the
budget, whatever the model); no auto-submit; no scraping; the user sees a percent, never dollars.

## 2. Epics (what, why, order, risk)

| Epic | Priority | What | Why it matters | Main risk |
|---|---|---|---|---|
| **I0 AI gateway, metering & budgets** | P0 | One entry point with a fixed check order; ledger v2 (every attempt, feature, prompt version, latency, cache); materialised spend; per-feature daily caps; pluggable budget (plan / override / org grant) | A4's caps, kill switches and user controls need one enforcement point; every new feature inherits it; daily caps stop one feature draining the month | Migrating seven services — one per commit, tests moved not rewritten |
| **I1 Model routing & providers** | P0 | Anthropic provider (Haiku 5.5 / Sonnet 5.5) beside Gemini; routing by task *and budget position*; provider-neutral schemas; fallback + breaker; prices on settings; canaries | Outage/retirement insurance at price parity; a quality step for writing tasks; model moves become admin edits | Open question on the Java SDK dependency; schema features one provider rejects |
| **I2 Prompt registry & evals** | P0 | Prompts as versioned records; golden sets; harness with deterministic scorers + Sonnet/Opus judge; CI gate; nightly drift; opt-in samples | "Best" must be a number; competitor complaint #1 is unmeasured today | Golden sets must stay PII-free and vendor-neutral |
| **I3 Guardrails & truth checks** | P0 | `AiTruthChecks` library (numbers/entities/dates/relations); `Untrusted` input type; output validator; grounded drafting with sources (G6); content policy; 👍/👎; provenance chips | The product promise; protects R4/R5/U8/U9 before they exist | Over-strict entity matching → tune the dictionary, never the check |
| **I4 Embeddings & retrieval** | P1 | Posting/profile vectors in MySQL; two-stage retrieval; Free rules+vectors; feedback learning; dedup; synonym-aware keywords; hybrid search | Strong matches (16.1) and search quality; Jobscan's "literal keywords" and Jobright's 70–80 % are the gap | Embedding model drift; candidate set growth |
| **I5 Fairness, explainability & transparency** | P1 | Proven allowlist; reasons-with-evidence contract; bias evals; `/ai` page + chips + switches; audit export | Trust is the Gen Z buying criterion; AI-in-hiring law questions answered with data | Tolerance flapping — moving averages |
| **I6 BYO key & extension parity** | P1 | `JAF.ai` with Anthropic + Google on current models; shared prompt bundle; truth flags in the extension; local meter; copy alignment | Free's AI and a unique selling point; same quality as Pro minus the model | Store release for the Gemini host permission |
| **I7 Caching, batching & cost** | P1 | Cache v2 (TTL/invalidation); context caching; Batch API; token caps; unit economics | Keeps median Pro cost ≈ $0.60 while Sonnet handles writing | None new |
| **I8 Observability & ops** | P1 | Metrics; provider health + runbook; alert rules into A4; drift monitor; cost anomaly guard | A slow provider must not look like a slow app | Depends on A4.4/A10 |
| **I9 Feature kits** | P1 | Function calling + streaming in the seam; interview, cover-letter, rewrite/summary, translate engines; inbox v2; sponsorship (G13); interview-date extraction (G19); ghosting timelines (G16); JD-driven questions (G26); Autopilot ask-and-remember (G8) | The platform pieces other areas' stories list as deps; the competitive gaps tagged `I` | Scope creep into feature UI — kits stop at the service/DTO |

## 3. Recommended build order — the first 10

The skeleton proves: **a tailor runs through the gateway on Sonnet 5.5, passes a library truth check,
is scored by the eval harness, and the Free user's BYO draft gets the same flags.**

| # | Story | Why first |
|---|---|---|
| 1 | **I0.4** Ledger v2 columns + failed-call rows | Additive, behaviour-neutral; everything else stamps into it |
| 2 | **I2.1** Prompt registry with today's prompts (versions = 1) | Behaviour-neutral; unblocks evals, bundle, allowlist test |
| 3 | **I0.3** AiGateway + migrate the seven callers (tailor first) | The enforcement point A4 and every feature needs |
| 4 | **I3.2** AiTruthChecks library (tailoring migrated) | The product promise, reusable by R4/R5/U9 the week they start |
| 5 | **I2.2 → I2.3** Golden sets (parse/tailor/fit/map) + harness with baselines | From here every change is measured |
| 6 | **I1.2 → I1.5** Anthropic provider + provider-neutral schemas | Second provider at price parity; schemas leave the Gemini class |
| 7 | **I1.3 → I1.4** Routing table by budget position + fallback/breaker; Sonnet 5.5 canary on tailor | The visible quality step, insured |
| 8 | **I3.3 → I3.4 → I3.5** Untrusted input, output validator, grounded drafting with sources (G6) | Closes the injection surface and ships the first "from your profile" chip |
| 9 | **I6.3 → I6.2 → I6.4** Prompt bundle, BYO v2, extension truth flags | Free parity; retires the stale model id |
| 10 | **I5.1 + I5.3** Allowlist proof + explainability contract with the "Why?" sheet | Trust claims become tests; scores stop being bare numbers |

Then in parallel lanes (strict file ownership, one Sonnet agent each):
- **Lane A (retrieval):** I4.1 → I4.2 (10 % canary) → I4.3 → I9.8 sponsorship → I4.4 → I4.5 → I4.6 → I4.7 when U4.2 lands.
- **Lane B (kits):** I9.1 function calling → I9.6 streaming (for U8) · I9.4 rewrite/summary → I9.3 cover → I9.5 translate (for R4/R5) · I9.2 interview → I9.11 questions (for U9) · I9.7 inbox v2 → I9.9 invites → I9.10 timelines.
- **Lane C (quality/ops):** I2.4 CI gate → I2.5 adversarial → I5.2 bias → I8.1 metrics → I8.2 health → I8.3/I8.4/I8.5 → I2.6 samples → I2.7 process.
- **Lane D (budget/cost):** I0.5 spend → I0.6 daily caps → I0.10 copy kit → I7.1 → I7.5 → I7.2 → I7.3 → I7.4 → I0.7/I0.8/I0.9 as A4.3/O3.3 land.

Launch-critical (P0) before Pro is marketed on AI quality: I0.3–I0.6, I1.2–I1.5, I2.1–I2.4, I3.2–I3.5,
I5.1, I5.3, I6.2–I6.4. Phase-19 critical: I9.12 (G8) with I3.5 and I6.2.

## 4. Experience principles for Gen Z / Alpha / millennials

This audience grew up with AI that lies confidently, and they test it on day one. So: **receipts over
disclaimers** — a "from your profile: Role 1 · Skills" chip and a `[check]` highlight instead of a
paragraph saying "AI can make mistakes". **Reasons over scores** — "Why 88?" opens instantly with four
short lines and evidence, never a bare percent. **Limits with a date, never a wall** — every refusal is
one sentence, a reset time, and a free alternative to tap; "repeats are free" is said out loud; nothing
is called a credit. **Privacy on the first screen** — "never used to train, never sold, never shown to
employers" above the fold in Settings › Kiwiply AI, with per-feature switches that actually gate the
gateway. **Fast or it's broken** — first token < 2 s on chat, tailor diff < 6 s, truth checks in the
same request. **Free is real** — BYO key gets the same prompts and the same flags; the three daily
matches on Free are explained by rules, not by an upsell. **Thumbs are the review form** — 👍/👎 on every
AI output, and a 👎 "wrong fact" shows the sources, because explaining a mistake is the fastest way to
earn the next try. Millennials get the same product with more words available on tap, never by default.

## 5. How we beat the competition (the three moves)

1. **Verifiable AI, published.** Truth checks on every generated sentence with provenance, scores with
   evidence, and eval numbers on the transparency page ("98 % of tailor proposals passed every truth
   check last week"). Teal, Rezi, Jobright and Jobscan all carry "generic / hallucinated" as their top
   complaint and none publishes a quality metric.
2. **Semantic matching with reasons, Free included.** Embeddings + rules re-rank replace literal keyword
   matching (Jobscan's 92-review complaint) and opaque percentages (Jobright); Free gets three explained
   matches a day with zero AI spend; sponsorship tags take Jobright's wedge with international students.
3. **A free AI tier nobody else has, at half the paid price.** BYO key on current models with identical
   prompts and checks, Pro at $19.99 against $29–50, AI Interview Practice included rather than a $90–149
   tier, budgets shown as a percent with a reset date instead of credits that vanish.

## 6. Competitive-gap reconciliation (`COMPETITIVE-GAPS.md`, rows tagged `I`)

| Gap | Decision | Where |
|---|---|---|
| G6 Pro free-text answers with truth rules + cited profile items | **Accepted** (server drafting exists; grounding + sources are the gap) | I3.5 (+ I6.4 for Free/BYO) |
| G8 Autopilot ask-and-remember | **Accepted** for Phase 19 | I9.12 |
| G13 Sponsorship / work-authorisation signal | **Accepted** | I9.8 (+ embeddings doc §7) |
| G16 Auto-ghosted + expected-response timeline | **Accepted as statistics, not LLM** | I9.10 |
| G19 Interview date/time extraction from mail | **Accepted** (parsers first, AI when ambiguous) | I9.9 |
| G26 Company-and-role question set from the JD | **Accepted** | I9.11 |
| G23 LinkedIn profile optimizer | **Rejected for this area, for now.** The deterministic checklist is R/U work on pasted text; the AI rewrite is just the REWRITE task (I9.4) — no new platform story. Waits on the user's decision (§G.2 of the gap list); in-page DOM reading is out regardless (`linkedin.com` is not a host). |
| G38 "Search inside your assistant" (MCP / ChatGPT connector) | **Parked (P2).** Distribution, not platform; needs stable U4/U6 read APIs and a trust-area review of token scope. Revisit after Launch 2. |

## 7. Dependencies on other areas

- **A (admin):** A4.2 rollups (I7.4 reads them), A4.3 platform caps (I0.7 hooks), A4.4 alert pipeline
  (I8.3), A4.5 user controls (gateway step 4), A5.1 settings registry (I1.3, I1.6, I0.6), A5.5 extension
  remote config (I6.2 models), A3.2 grants (I0.8).
- **U (user):** U4.2 search endpoint (I4.7), U4.6 feedback UI (I4.4), U6.4 interview rows (I9.9),
  U8.1 assistant (consumes I9.1/I9.6), U9.3 (I9.2), U14.2 privacy panel (I5.4).
- **R (resume builder):** R0.1 `resume_ai_proposal` (I9.4 writes it), R4.1 (names `AiTruthChecks` —
  supplied by I3.2), R5.3 (I9.3), R5.4 (I9.5).
- **O (org):** O3.3 entitlement resolve (I0.8), O10.4/O10.9 marketer attribution (I0.8, I9.7).
- **E / T / P / M / S:** extension owns the Autopilot orchestrator I9.12 plugs into and the DOM fixtures
  I2.2 reuses; trust reviews the posture record (I5.5, I1.8); platform hosts the CI job (I2.4) and
  metrics (I8.1); marketing's honest-claims register carries the eval numbers and the BYO sentence (I6.6).

## 8. Status honesty

`done` (4): period budgets + kill switch, usage meter, task-typed seam + env routing, tailoring truth
checks. `partial` (1): BYO key (stale model, no checks). Everything else is not started; the designs
cite the exact files each story changes.

## 9. Top risks

1. **Gateway migration regressions** — mitigated by moving service tests onto a fake gateway and
   migrating one service per commit, tailoring first because it has the most tests.
2. **Sonnet cost on heavy users** — bounded by the budget-position tiers (Sonnet only below 50 %),
   daily caps and the per-call ceiling; the worst case is still the budget.
3. **Eval theatre** — judge scores drifting from user reality; mitigated by deterministic floors, the
   👎 rate per prompt version, and opt-in samples feeding synthetic cases.
4. **Over-strict truth checks** making rewrites feel timid — drop-rate metric with an alert; flag
   instead of drop on drafts/cover letters.
5. **Embedding vendor coupling** — model id stored per vector, re-embed job, Voyage as a configured fallback.
6. **Provider terms** — the "free tier may train" sentence must be verified and corrected (I1.8) before
   the transparency page claims otherwise.

## 10. Open questions for the user

1. **Anthropic Java SDK or raw HTTP?** The design defaults to raw `java.net.http` like Gemini (no new
   dependency). Adding `com.anthropic:anthropic-java` would give typed tools/streaming at the cost of a
   dependency; CLAUDE.md asks before new deps. Which?
2. **Default writing model:** confirm Sonnet 5.5 for tailor/cover/interview below 50 % of the budget
   (median Pro spend ≈ $0.60/month, ceiling unchanged), or keep everything on the economy tier until
   the eval harness shows the delta?
3. **Production provider tier:** is the live Gemini key on the paid API tier (no training on inputs)?
   The Options consent copy says the free tier may train; I1.8 corrects whichever way is true.
4. **Daily cap defaults** (assistant 40 msgs, tailor 30, fit 60, interview 3 sessions, draft 80):
   accept, or set higher for the first month and tighten from data?
5. **Publish eval numbers on `/ai`?** Recommended ("98 % passed every truth check"), but it is a
   commitment to keep the harness honest and public.
6. **Embedding vendor:** Gemini embedding (same key, 256-dim Matryoshka) vs Voyage (cheaper, second
   vendor). Default Gemini with Voyage configured as fallback — confirm.

# AUDIT — area `ai` (AI platform: routing, prompts, evals, guardrails, embeddings, fairness, metering)

Written 2026-10-11 against branch `product-roadmap`. Method: every class under `api/.../service/ai/*`,
every service that calls `AiProvider`, the `ai_*` Liquibase changelogs, the extension's AI paths
(`job-autofill/src/background/service-worker.js`, `src/lib/parser.js`, `src/content/field-mapper.js`,
`entrypoints/options/OptionsApp.tsx`), the web surfaces that show AI state, and the two design docs this
area must reconcile (`docs/design/user/ai-assistant.md`, `docs/design/admin/ai-cost-governance.md`).
State legend: **real** = code + tests + in production config · **partial** = exists but incomplete or
only for one task/provider · **missing** = nothing in the repo. Evidence paths are repo-relative.

Companions: `docs/roadmap/PLAN-ai.md`, `docs/roadmap/areas/ai.json`, `docs/design/ai/*.md`.

## 0. What is real underneath (the foundation every story builds on)

| Capability | State | Evidence | Notes |
|---|---|---|---|
| Provider seam | real (one provider) | `api/src/main/java/com/dossier/api/service/ai/AiProvider.java`, `GeminiAiProvider.java`, `config/AiConfiguration.java` | `generate(task, model, question, context)` + `parseResume(...)`; Gemini via `java.net.http`; a `DisabledAiProvider` stub when unconfigured. No Anthropic/OpenAI implementation despite the Javadoc promise. |
| Task typing | real | `service/ai/AiTask.java` | 10 tasks: DRAFT, PICK, MAP, ENRICH, PARSE, MATCH, FIT, TAILOR, JOBS, INBOX. `fromWire()` only admits the four extension tasks. |
| Per-task routing | partial | `service/ai/AiPolicy.java`, `application-prod.yml:196-206` | `dossier.ai.policy.models.<task>` env vars, `economy-model` (blank in prod → no economy switch), `disabled-tasks` kill switch. Static config: a change is a container restart. |
| Pricing | partial | `service/ai/AiPricing.java` | Gemini-only rates as **code constants** (checked 2026-09-22); longest-prefix model match; fallback rate over-counts unknown models. No Anthropic rates, no admin edit. |
| Budget decision | real | `service/AiBudgetService.java` (22 unit tests) | Pro budget per **billing period** ($3 monthly / $8 three-month) summed from `ai_call`; Free = parse count only (50/month); admin override in cents outranks the plan; soft cap 80 % → economy model; 100 % → EXHAUSTED. Decision re-sums the ledger on **every call** (`costSince`). |
| Metering | real | `service/AiMeteringService.java`, `changelog/20260922020000_ai_call.xml`, `20260623000000_ai_usage.xml` | Two writes per call: `ai_usage` monthly count (legacy) + `ai_call` row (login, task, model, tokens, cost_micros). **Successful calls only**; no `feature`, `success`, `latency_ms`, `provider`, `org_id`, `prompt_version`, `cache_hit`. Ledger never stores prompts/answers (good). |
| Gating order | partial | `service/AiDraftService.java:89-144`, `AiResumeParseService.java:62-99`, `ResumeTailorService.java:142-204`, `JobFitService.java:169-214`, `JobMatchService.java:351-393`, `inbox/InboxParser.java:152-156` | Each of 7 services re-implements: enabled → `budget.decide` → consent → cache → provider → `metering.record`. Order differs slightly per service (consent before/after cache). No single gateway. |
| Answer cache (extension tasks) | real | `service/AiAnswerCacheService.java`, `domain/AiAnswer.java` | Per (login × question hash × task). No TTL, no invalidation on profile change. |
| Per-feature caches | real | `domain/JobFit.java`, `ResumeMatch.java`, `ResumeTailor.java` (`20260922060000_resume_tailor.xml`) | Keyed by content hash of (JD × resume × facts); repeat asks are free. |
| Structured outputs | real (Gemini only) | `GeminiAiProvider.java:38-64,158-225` | JSON schemas for RESUME, TAILOR, INBOX, FIT, MATCH as string constants inside the provider — not portable to another provider. |
| Truth checks | partial (one task) | `service/ResumeTailorService.java:337-413` (14 tests) | TAILOR only: existing refs only, no new numbers, no hiring-company name, length cap, skills reorder-only, suggestions never applied, apply-by-ref from stored proposal. **Not applied** to DRAFT answers, FIT/MATCH reasons, JOBS reasons, or the resume parse. |
| Prompt-injection defence | partial | `ResumeTailorService.buildPrompt` (`<<< >>>` delimiters), `AiInputs.cleanJobDescription` (whitespace + cap only) | No instruction-line stripping, no "treat as data" rule for DRAFT page context, no unicode normalisation; the extension's DRAFT context is raw page text. |
| Bounded inputs | real | `service/AiInputs.java` | JD 200–8 000 chars, resume digest `BRIEF`/`DETAILED`, caps by **characters** not tokens. |
| Usage meter | real | `web/rest/AiResource.java:68` (`GET /api/ai/usage`), `web/src/components/settings/AiUsageMeter.tsx`, extension Options | Percent + reset date, never dollars (locked). |
| Admin AI page | partial | `web/rest/AdminAiUsageResource.java`, `web/.../admin/ai` | Totals, per task, per user, % of budget, 80 % list. Trend chart, tokens tile, limits, alerts = SAMPLE (see `AUDIT-admin.md` row `/admin/ai`). |
| Consent | real | `AiDraftService.run` (consent param), Options page copy | Copy says the Gemini **free tier** may train on inputs. Whether the production key is on the paid tier is not verifiable from the repo → open question I-Q3. |
| Extension BYO key | partial | `job-autofill/src/background/service-worker.js:41-66,79-112,149-215,485-520`, `src/lib/parser.js:57-104`, `entrypoints/options/OptionsApp.tsx:302-345` | Anthropic only, **model hard-coded to `claude-sonnet-4-6`** (two places), `anthropic-dangerous-direct-browser-access`, key in `chrome.storage.local`; prompts duplicated from the server's; no truth checks on BYO output; no key validation; takes priority over server AI (locked: Free = BYO only). |
| Tests | real | `AiBudgetServiceTest` (22), `ResumeTailorServiceTest` (14), `JobFitServiceTest` (11), `AiResumeParseServiceTest` (9), `JobMatchServiceTest` (8), `GeminiAiProviderTest` (6), `AiMeteringServiceTest` (3), ITs `AiResourceIT`, `ResumeTailorResourceIT`, `JobFitResourceIT`, `ResumeMatchResourceIT`, `JobMatchResourceIT`, `AdminAiUsageResourceIT` | All with fake providers — **zero quality/eval tests**; nothing measures whether an output is good. |

Not present anywhere: a prompt registry (prompts are string constants in 8 files) · evals or golden
datasets · embeddings/vectors (`grep -ri embedding|vector|cosine` → no hits in api/web/extension) ·
provider fallback or circuit breaker · Batch API or context caching · streaming · function calling ·
per-feature daily caps · platform caps (designed in A4.3, not built) · bias evaluation · explanations
beyond a ≤ 15-word `why` · an AI transparency page · an `ai_feedback` signal · latency/error metrics.

## 1. Feature-by-feature

| Feature | Task | State | Real today | Gaps | Evidence | Stories |
|---|---|---|---|---|---|---|
| Answer drafting (extension) | DRAFT | **partial** | Server proxy via `POST /api/ai/draft`, consent, cache, Pro gate; BYO path direct to Anthropic | No grounding check — the model may invent employers/years; page context is untrusted but unwrapped; 400-token cap only; no eval set | `AiDraftService.java`, `service-worker.js:79-112` | I3.5, I3.3, I2.2, I6.4 |
| Option picks / field mapping / enrichment | PICK, MAP, ENRICH | **partial** | Same proxy with `INSTRUCTION_SYSTEM_PROMPT`; mapping cached locally per host+label | Prompts live in the service worker, not the server; no mapping accuracy telemetry; no eval | `service-worker.js:149-215,485-520`, `field-mapper.js` | I6.3, I6.7, I2.2 |
| Resume parse | PARSE | **real** | Structured-output schema, PDF inline, Free quota, consent | Schema is Gemini-specific; no parse-accuracy eval; the one Free server-AI exception is unprotected when the platform cap hits (A4 D2 reserves 10 % — not built) | `GeminiAiProvider.parseResume`, `AiResumeParseService.java` | I1.5, I2.2, I0.7 |
| Resume ↔ job match (rank my resumes) | MATCH | **real** | One JSON call per (JD × resume set), cached | Keyword-only prompt; no embeddings; no reason grounding | `service/ResumeMatchService.java` | I4.6, I5.3 |
| Job-fit panel | FIT | **real** | Score, summary, matched/missing, red flags from 9 profile facts; cached | Score is a bare number + prose; no evidence refs; no bias eval; prompt string in service | `service/JobFitService.java:275-330` | I5.3, I5.2, I2.1 |
| Resume tailoring | TAILOR | **real** | Truth-checked proposals, apply-by-ref, new resume | Checks don't cover dates/entities; `acceptable()` not reusable by R4/R5; no eval; company-name rule by substring | `ResumeTailorService.java` | I3.2, I2.5 |
| ATS score | — | **real** | 15 deterministic checks + reuse of cached FIT | Synonym-blind keyword coverage | `service/AtsScoreService.java`, `AtsChecks.java` | I4.6 |
| Daily job matches (light) | JOBS | **real** | Nightly, opt-in, `JobPrefilter` word heuristics → ≤ 50 → one Flash-Lite call, ≥ 60 shown | Word-overlap prefilter misses synonyms and over-includes generic titles; no feedback learning; no Batch API; reasons ungrounded | `JobMatchService.java`, `jobs/JobPrefilter.java` | I4.1–I4.4, I7.3 |
| Inbox classification | INBOX | **real** | Rules first, model only for ambiguous mail, batch of ids | No eval set (the 50-mail fixture doesn't exist); no confidence threshold | `inbox/InboxParser.java`, `MailClassifier.java` | I9.7, I2.2 |
| Assistant (Ask Kiwiply) | — | **missing** | Design only (`docs/design/user/ai-assistant.md`) | Needs function calling in the provider, streaming, tool contracts — platform pieces this area supplies | — | I9.1, I9.6 |
| Interview practice (20.1) | — | **missing** | — | Rubric, cost ceiling, truth checks on feedback | ROADMAP 20.1 | I9.2 |
| Cover letter / rewrite / summary / translate (R4–R5) | — | **missing** | Design in `docs/RESUME-BUILDER-DESIGN.md` §3.5/§6.3 names `AiTruthChecks` and new `AiTask`s | The shared engines + truth checks are this area's deliverables | — | I3.2, I9.3–I9.5 |
| Budget + meter | — | **real** | See §0 | Decision re-sums ledger per call; no daily caps; no org budgets; override not deleted on account deletion (`AccountDeletionService` lacks `AiQuotaOverrideRepository`) | `AiBudgetService.java`, `AccountDeletionService.java` | I0.5, I0.6, I0.8, I0.9 |
| Admin governance | — | **partial** | Usage page | Owned by A4 (caps, kill switches, alerts, user controls); this area supplies the gateway hooks | `AdminAiUsageResource.java` | I0.3, I0.7, I8.3 |

## 2. Cross-cutting gaps (the reason this area exists)

| Topic | State | Why it matters | Stories |
|---|---|---|---|
| One gateway | missing — 7 services × their own order of checks | A4's platform caps, user controls and kill switches need one enforcement point; today each new feature copies 40 lines and drifts | I0.3 |
| Prompt registry + versioning | missing | Cannot A/B a prompt, cannot tell which prompt produced a complaint, cannot share prompts with the BYO path | I2.1, I6.3 |
| Evals | missing | "Best in class" is unmeasurable today; competitors' top complaint is generic/hallucinated output and we have no number for ours | I2.2–I2.5, I8.4 |
| Truth checks as a library | partial | R4/R5/U8/U9 all need them; the only implementation is private to tailoring | I3.2, I3.5 |
| Provider independence | partial | Gemini-only with Gemini-shaped schemas; a Gemini outage or price change is a product outage; Claude Haiku 5.5 is now price-competitive with Flash-Lite (input $0.10/M both; output $0.50 vs $0.40) | I1.2, I1.4, I1.5 |
| Embeddings | missing | Strong matches (16.1), search ranking (U4.2), synonym-aware ATS/keywords all want semantic retrieval; MySQL can hold vectors without new infra | I4.* |
| Fairness/explainability | missing | Scores shown to users with no evidence; no proof EEO never reaches a prompt (it doesn't today — `JobFitService.FACT_KEYS` is an allowlist — but nothing asserts it); AI-in-hiring law posture undefined | I5.* |
| Observability | missing | No latency/error metrics; a slow provider looks like a slow app | I8.* |
| Cost optimisation | partial | Caches exist; no context caching, no batch, no token-based caps | I7.* |

## 3. Reconciliation with the two design docs

- `docs/design/user/ai-assistant.md` assumes `GeminiAiProvider.generateWithTools` and `AiTask.ASSISTANT`/`ASSISTANT_SUMMARY`; it names Gemini 2.5 Flash-Lite. This area generalises that to the provider seam (I9.1) and the routing table (I1.3) so the assistant runs on whichever economy model routing picks (Haiku 5.5 or Flash-Lite); the daily message cap moves into the shared per-feature caps (I0.6). Nothing in the assistant design is contradicted.
- `docs/design/admin/ai-cost-governance.md` decides the ledger columns (`feature`, `org_id`, `success`, `latency_ms`, `provider`), platform caps, kill switches as runtime settings, anomaly rules and user controls. This area **implements the gateway side** (I0.3, I0.4, I0.7, I8.3) and adds `prompt_version` + `cache_hit` columns; admin keeps the pages, alert rules and controls (A4.2–A4.5). Enforcement order is taken verbatim from that doc §4.

## 4. Honest status counts for `areas/ai.json`

`done` (4): period budgets + kill switch (13.1b), usage meter (13.1c), task-typed seam + per-task env
routing (13.1a/b), tailoring truth checks (13.4). `partial` (1): the extension BYO key path (5.x — the
model id is stale and nothing checks its output). `not_started` (70). Total 75 stories in 10 epics,
including six stories folded in from `COMPETITIVE-GAPS.md` rows tagged `I` (G6, G8, G13, G16, G19, G26;
G23 and G38 are rejected/parked in `PLAN-ai.md` §6).

---

## 5. Competitive benchmark (checked 2026-10-11)

Sources are third-party reviews and vendor help pages found on 2026-10-11; several review sites sell
competing tools and prices moved during 2026, so each row carries the URLs used. Kiwiply's own prices
are the locked ones (Pro $19.99 / $49.99 per 3 months; Autopilot $39.99 / $99.99).

| Product | What it does best (AI) | AI tier pricing (reported) | Top complaints | Kiwiply: beats / must match / do not copy |
|---|---|---|---|---|
| **Teal** | Resume tailoring with missing-keyword highlights + match score; the tracker/extension is the most-praised part | Teal+ ≈ $29/mo, $79/qtr, $9–13/wk ([scoutify](https://scoutify.com/blog/teal-review), [loopcv](https://blog.loopcv.pro/teal-hq-review/amp/)) | "Too expensive"; AI output "generic, still needs editing"; weekly plan churn-bait ([resumecoach](https://www.resumecoach.com/reviews/tealhq-resume-builder-review/)) | **Beats:** price (Pro $19.99 vs $29), truth-checked diffs instead of free-text rewrites, inbox-fed tracker. **Match:** keyword gaps with *where to put the term* (I4.6). **Don't copy:** weekly plan (locked: no). |
| **Rezi** | AI bullet writing, strong on technical content; ATS score as the hook | Pro $29/mo; Lifetime $129–149 ([toolradar](https://toolradar.com/tools/rezi/pricing), [scoutify](https://scoutify.com/blog/rezi-review/)) | "ATS score is oversold"; rigid AI content; billing/cancel confusion ([scoutify](https://scoutify.com/blog/rezi-review/)) | **Beats:** our ATS score is deterministic + explained (15 checks) and never sold as a callback predictor (I5.3). **Match:** 2–3 alternatives per bullet (R4.2 via I9.4). **Don't copy:** "lifetime" AI access — breaks the ≥ 80 % margin floor. |
| **Jobscan** | Keyword-gap scanner against a JD; large user base; Trustpilot ≈ 4/5 | $49.95/mo, $89.95/qtr; Free 5 scans/mo ([loopcv](https://www.loopcv.pro/directory/jobscan/), [resumly](https://resumly.ai/answers/is-jobscan-worth-it)) | Match rate "overly literal — needs exact phrasing" (92 reviews on one aggregator); score-chasing; price; billing surprises ([jobshinobi](https://jobshinobi.com/compare/jobscan-resume-scanner-customer-reviews), [trustpilot](https://ie.trustpilot.com/review/jobscan.co?page=8)) | **Beats:** synonym-aware matching via embeddings (I4.6) so "IaC" ≈ "Terraform"; half the price. **Match:** unlimited scans on Pro (cached per JD×resume — already free on repeat). **Don't copy:** a single opaque "match rate %" without evidence. |
| **Jobright** | Job matching with compatibility score (reviewers estimate 70–80 % accurate); Orion copilot explains fit, preps interviews; agent that submits | Reported $29–39.99/mo, $89.99/qtr, $17.99/wk; no public pricing page ([scoutify](https://scoutify.com/blog/jobright-review), [resumly](https://resumly.ai/answers/jobright-review), [resumehog](https://resumehog.com/blog/posts/jobright-ai-review-2026-is-this-job-search-copilot-worth-it.html)) | Auto-renewal/cancellation complaints; 33 % price hike at checkout; "resume AI hallucinations"; US-only; generic on niche roles | **Beats:** grounded assistant with confirm-to-act and visible memory (U8 design), honest "no refunds, cancel anytime" stated plainly, matches explained with evidence (I5.3). **Match:** daily matches with score + reason (16.1 via I4.2). **Don't copy:** cloud auto-submit agent (locked: Autopilot never submits), hidden pricing. |
| **Final Round AI** | Live interview copilot + mock interviews (mock quality is the praised part, 4.7/5 on PH) | $90–149/mo (5 sessions), $25/mo annual billed $300 up front; 3-day refund strictly enforced ([loopcv](https://blog.loopcv.pro/final-round-ai-review/amp/), [resumehog](https://resumehog.com/blog/posts/final-round-ai-review-2026-pricing-refund-rules-and-real-time-value.html), [trustpilot](https://nl-be.trustpilot.com/review/finalroundai.com)) | 17 % one-star: billing, rebilling after cancel, no cancel button, AI glitches; live copilot treated as cheating by employers | **Beats:** AI Interview Practice is **included in Pro** (20.1), text-based, with rubric feedback (I9.2) — no $149 tier. **Match:** session summary + per-answer feedback. **Don't copy:** live in-interview copilot (ethics + detection risk), session credits that expire. |
| **Simplify (Copilot / Simplify+)** | Autofill + tracker free; Simplify+ adds tailoring, cover letters, application answers, AI email, Autopilot (20 auto-applies/wk) | $19.99/wk, $39.99/mo, $89.99/qtr; no annual ([help.simplify.jobs](https://help.simplify.jobs/articles/5623502-whats-included-in-simplify-features-and-pricing)) | AI writing behind the paywall; weekly plan; auto-submit draws ATS anti-bot scrutiny ([jobright blog](https://jobright.ai/blog/simplify-copilot-review-2026-features-pricing-and-top-alternatives/)) | **Beats:** Pro at half the monthly price; BYO-key Free path (nobody else has it); "safe autopilot" that stops before submit. **Match:** answers to application questions grounded in profile (I3.5), AI email drafts (U10 later). **Don't copy:** 20 auto-submits/week. |
| **Careerflow** | Free LinkedIn optimizer (its best-known hook); resume builder tailored to postings | Premium ≈ $23.99/mo (~$14.41/mo annual), higher tier ≈ $44.99 with mock interviews ([loopcv](https://blog.loopcv.pro/careerflow-review/amp/), [capterra](https://www.capterra.com/p/10015230/Careerflow-ai/)) | Free plan very limited (10 jobs, 1 resume); bugs; learning curve | **Beats:** Free with real autofill + BYO AI; 3 resumes on Free. **Match:** nothing required. **Don't copy:** LinkedIn optimizer (ROADMAP verdict: no). |
| **Huntr** | AI Review + AI Tailor on built resumes; tracker; mock interviews in one $40 plan | $40/mo, $90/qtr, $160/6 mo; free = limited tailoring ([huntr.co](https://huntr.co/product/resume-review), [toolquestor](https://toolquestor.com/vs/huntr-vs-wonsultingai)) | Expensive; AI credits don't roll over; tailoring only works on resumes built in Huntr; support/refunds hard | **Beats:** tailoring works on uploaded resumes (upload-first), proposals are diffs you accept; budget shown as % with a reset date, never "credits that vanish". **Match:** AI resume review (ATS score exists). **Don't copy:** builder lock-in. |

**What the market tells us (and what the plan does about it):**

1. **Everyone sells AI writing at $29–50/month and the #1 complaint is "generic / needs heavy editing / hallucinated".** Our bet is *verifiable* AI: every change is a diff with a provenance chip (I3.8), every claim is checked against the source document (I3.2, I3.5), every score carries evidence (I5.3), and we publish eval numbers (I2.3) — nobody in the table does.
2. **Billing surprises are the #2 complaint** (Jobright, Final Round, Jobscan, Huntr). Locked decisions already answer this (no trial, no refunds stated plainly, cancel keeps Pro to period end, % meter never dollars). This area's job is to make the **AI budget never feel like expiring credits**: a reset date on every meter, economy mode before a stop, caches so repeats are free (I0.10, I7.1).
3. **Nobody offers a bring-your-own-key free path.** Keep it, modernise it (Haiku 5.5 / Sonnet 5.5 choice, shared prompts, same truth checks — I6.*). It is the Free tier's AI and a trust signal.
4. **Match-score opacity** (Jobscan literal keywords, Jobright 70–80 %) is the gap embeddings + explanations close (I4.2, I4.6, I5.3).
5. **Do not copy:** live interview copilots, cloud auto-submit, weekly plans, lifetime AI, credits that expire, hidden pricing.

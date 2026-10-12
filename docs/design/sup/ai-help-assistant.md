# Design — AI help assistant (area `sup`, epic S6)

Status: decided 2026-10-11. Distinct from Ask Kiwiply (`docs/design/user/ai-assistant.md`, U8),
which is grounded in the **user's data**; this one is grounded in **help content and policies**
and exists to deflect tickets. Reconciled with admin AI cost governance
(`docs/design/admin/ai-cost-governance.md`): a new `AiTask.HELP` behind the same gateway.

## 0. Summary

1. **Retrieval first, model second.** Every question runs the help search (S1.2) first. If the top
   hit scores above a threshold, Free users get the **article answer card** (summary + "Open") with
   **no model call**. The model is only invoked (a) for Pro/Autopilot, or (b) on Free when the
   admin flag `help.ai.free_daily_cap` > 0 (default **0**, i.e. off — honours the locked "no server
   AI on Free" rule; the user can lift it as a second exception, open question).
2. **Grounded or silent.** The prompt contains only: the question, the top 5 article chunks, the
   policy facts sheet (plans, prices, "no refunds, cancel anytime", resume caps, what we store), and
   the user's plan + surface. If no chunk is relevant, the model must answer "I don't have that —
   message the team?" and the UI shows the ticket sheet pre-filled. Answers cite article slugs; the
   UI renders them as chips. The model never sees account data, tickets, resumes or the inbox.
3. **Budget: platform support line, not the user's AI budget.** `HELP` calls are metered in
   `ai_call` like every task but charged to a platform budget (`help.ai.monthly_cap_usd`, default
   $50) with the A4.3 kill switch. Rationale: support is a cost of doing business; counting it
   against the user's $3 Pro budget would punish people for asking how to cancel.
4. **Escalation is one tap** and carries the transcript into a `support_ticket` (kind QUESTION)
   with the AI's cited slugs, so staff see what was already tried.
5. **Every answer has 👍/👎** (S5 feedback_event, target `help_answer`), and 👎 asks "What was wrong?"
   (wrong · outdated · didn't understand · wanted a human). Weekly, the lowest-rated questions become
   article tasks (S9.3 knowledge gaps).

## 1. Retrieval

- Chunks: each article split by H2 (~150–400 tokens), embedded at **build time** by
  `scripts/build-help-index.mjs` when `HELP_EMBED=1` (Gemini embeddings via the gateway's provider;
  cost ≈ $0.01 per full rebuild). Stored in `help-embeddings.json` shipped with the deploy; no
  vector DB. Cosine similarity over < 1 000 vectors in-process is milliseconds.
- Fallback when embeddings are absent (dev/CI): the token index from S1.2 with the same interface.
- Threshold: cosine ≥ 0.78 ⇒ "answer card" without a model; 0.60–0.78 ⇒ model with chunks;
  < 0.60 ⇒ "don't know" without a model call.

## 2. Prompt + model policy

```
system: You are Kiwiply Help. Answer only from the SOURCES. If the answer is not there, say
"I don't have that in our help yet" and offer to message the team. Never invent prices, limits or
policies. Be brief (≤ 120 words), second person, no emoji. End with the slugs you used as [slug].
POLICY FACTS: <generated from catalog: plans, prices, caps, refunds, cancel, data retention>
USER: plan=<free|pro|autopilot>, surface=<web|extension>, route=<help-context tags>
SOURCES: [slug] chunk … (≤ 5)
```
Model: the economy tier from `AiPolicy` (same as 80 % routing in the user assistant); max 256 output
tokens; temperature 0.2. Streaming over SSE on the web (reuse the U8 transport), non-streaming in
the extension drawer (one JSON reply, keeps the content script simple).

## 3. API

| Method | Path | Auth | Notes |
|---|---|---|---|
| `POST` | `/api/help/ask` | optional | `{q, surface, route?, conversationId?}` → `{mode: card|answer|unknown, text?, cites[], conversationId, remaining?}`; 402 `PRO_REQUIRED` only when `mode` would need the model and the caller is Free with cap 0 (UI then shows the card/unknown path, never a paywall for help) |
| `POST` | `/api/help/ask/{conversationId}/escalate` | optional | creates the ticket with the transcript; returns `publicId` |
| `GET` | `/api/admin/help/ai` | ADMIN | spend MTD vs cap, questions/day, card-vs-model ratio, 👎 reasons |

Conversation memory: last 4 turns, server-side, 1-hour TTL, keyed by `conversationId` (random,
not the user id); anonymous allowed.

## 4. Guardrails

- Prompt injection via pasted text: user text is wrapped as data; the model cannot call tools; the
  only "action" is the escalate button rendered by the UI, never by the model.
- Policy hallucination: the facts sheet is generated from `web/src/lib/catalog.ts` + the API catalog
  (Phase 18) at build; an eval set of 40 policy questions must score 100 % on numbers before deploy
  (CI gate `npm run help:eval`, runs offline against recorded answers; live run is manual).
- Abuse: BFF 30/h/IP; API 200/day/IP; the kill switch returns `mode: unknown` instantly.
- Sensitive topics (scam, harassment, mental health): rules route to the safety hub / crisis
  resources article before any model call (`route_overrides.json`).

## 5. Failure modes

| Failure | Behaviour |
|---|---|
| Provider down / cap hit | `mode: card` if a card exists, else `unknown` with the ticket sheet; no error toast |
| Stale embeddings after a content change | build fails if an article's hash ≠ embedding hash (`HELP_EMBED` required on release builds) |
| Low-rated answers cluster | weekly digest to admin (S9.3) |
| Extension offline | drawer shows the bundled 10 FAQ answers; no "ask" box |

## 6. Privacy

Questions are stored 30 days for quality review, scrubbed (emails/phones/card patterns) at write,
not linked to the user id unless escalated (then they live on the ticket). The provider is sent
question + chunks + plan; no identifiers. Stated in the privacy policy paragraph (trust area).

## 7. Cost model

Assume 5 % of MAU ask ≥ 1 question/month, 2.5 questions each; 60 % resolved by cards (no model).
At 10 000 MAU: 500 × 2.5 × 0.4 = 500 model calls/month × ≈ 1 500 input + 200 output tokens on the
economy model ≈ **$1–2/month**. The $50 default cap is 25× headroom; at 100 k MAU it is still
< $20. This is cheaper than one ticket.

## 8. Tests

- `HelpRetrievalTest` (threshold bands; fallback index parity on 20 fixtures).
- `HelpAskResourceIT` (Free + cap 0 ⇒ never a model call; Pro ⇒ model with ≤ 5 sources; unknown
  path; escalate creates ticket with transcript; kill switch).
- `help-eval` fixture suite: 40 policy Qs, 20 how-to Qs, 10 out-of-scope Qs; asserts cites ⊆ index,
  no numbers outside the facts sheet.
- web/extension: answer card render, 👍/👎 posts, 390 px Playwright: ask → card → escalate.

## 9. Rollout

S6.1 retrieval + cards (no model) on `/help` → S6.2 `HELP` task + platform budget + Pro answers →
S6.3 drawer "Ask" (Pro) → S6.4 eval suite + admin spend view. Flag `help.ai.enabled` (A5.3) gates
S6.2+ for a beta cohort first.

## 10. 390 px wireframe

```
┌──────────────────────────────┐  ┌──────────────────────────────┐
│ Ask Kiwiply Help             │  │ ‹ Ask                        │
│ [How do I cancel?         ➤] │  │ You: Workday keeps skipping  │
│ ┌──────────────────────────┐ │  │ the "How did you hear" box   │
│ │ 📄 Cancel anytime (no    │ │  │ Kiwiply Help: That field is  │
│ │ refunds) — You keep Pro  │ │  │ a custom dropdown; open the  │
│ │ until the period ends.   │ │  │ drawer and tap Review to     │
│ │ Settings › Billing ›     │ │  │ pick it. If it stays empty,  │
│ │ Manage.        [Open ›]  │ │  │ tap "This site didn't fill". │
│ └──────────────────────────┘ │  │ [workday] [site-didnt-fill]  │
│ Was this it?  👍  👎          │  │ 👍 👎   [Message the team]   │
│ Or: [Message the team]       │  │ [Ask another…              ] │
└──────────────────────────────┘  └──────────────────────────────┘
Free sees the left card path only; the "Ask" box on Free routes to search + cards (no model).
```

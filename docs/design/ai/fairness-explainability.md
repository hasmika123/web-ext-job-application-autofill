# Design — Fairness, explainability and AI transparency (area `ai`, epic I5)

Status: decided 2026-10-11. Inputs: `JobFitService.FACT_KEYS` (the nine profile answers a red flag may
read — an allowlist, which is the right shape), `JobMatchService` (`why` ≤ 15 words), `AtsScoreService`
(15 named checks — already explainable), the `/welcome` EEO questions stored in `bio.payload`, the
assistant design's ProfileCard exclusions, U14.2 privacy panel, U14.5 policy updates, the `trust` area
(owns the legal reading of NYC LL144 / EU AI Act / Colorado AI Act — this doc defines the engineering
posture they can review), and gaps **G31** (never trained on / sold / shown to employers) and **G12**
(free explainable score).

## 0. Summary

1. **Protected data never reaches a prompt — proven, not promised.** One `AiInputAllowlist` builds
   every profile-derived input (ProfileCard, resume digest, embedding text, FIT facts). It is an
   allowlist of keys; EEO/self-ID (`eeo*`, `gender`, `race`, `veteran`, `disability`, `dob`, `age`,
   `pronouns`, `photo`), address line and phone are structurally excluded. A test serialises every
   prompt the registry can render with a fully-populated profile and asserts none of those values appear.
2. **Every score is a claim with evidence.** Scores return `{score, reasons[{text, evidence:{kind, ref}}],
   missing[], signals{}}`; the UI's "Why this score?" sheet renders them. No bare number ships. Free
   scores are rules-only and fully explained (G12); Pro adds the model's reason, which is truth-checked
   against the posting/resume (guardrails doc §3).
3. **Bias evals are part of the harness.** Paired-persona sets (identical qualifications; name,
   gender signals, age signals, school prestige, employment gap varied) run through FIT, MATCH, JOBS,
   TAILOR, DRAFT; score deltas must stay within tolerance (±3 points mean, no systematic sign) and
   tone/length deltas within 10 %. Failures block the prompt change like any eval regression.
4. **Transparency is a page and a chip.** `/ai` ("How Kiwiply uses AI") lists each feature: what we
   send, which model tier, where it runs, retention, whether it is on by default, how to turn it off.
   Every AI-made output carries a "Made with Kiwiply AI" chip. Settings › Kiwiply AI has per-feature
   switches and "Help improve" (off by default).
5. **Our scores are self-assessment tools, not hiring decisions.** We never rank *people* for an
   employer; organisations see consent-scoped readiness only (O6/O8 with k-anonymity). The engineering
   record (prompt + model version per score, bias-eval reports, audit export) exists so the trust area
   can answer LL144 / AI-Act questions with data rather than opinion.

## 1. Audience lens

This generation reads the privacy toggle before the feature. "Why 88?" must open instantly and read
like reasons, not a model card; "never shown to employers", "never used to train", "delete my chats"
are the three sentences they look for, in that order, on the first screen of Settings › Kiwiply AI.

## 2. The allowlist

```java
public final class AiInputAllowlist {
    static final Set<String> PROFILE_KEYS = Set.of("firstName", "headline", "summary", "skills", "targetTitles",
        "targetLocations", "seniority", "authorizedToWork", "requireSponsorship", "city", "state", "country",
        "willRelocate", "workPreference", "languages", "experience[*].{title,company,startDate,endDate,current,bullets}",
        "education[*].{school,degree,field,endDate}", "projects[*].{name,bullets}", "certifications[*].name");
    static final Set<String> NEVER = Set.of("eeoGender","eeoRace","eeoVeteran","eeoDisability","dob","age","pronouns",
        "photoUrl","addressLine","phone","email","lastName","linkedin","github","website","password","inboxCredentials");
    static ProfileCard card(Bio bio, Resume r);   // the only constructor callers may use
}
```
`firstName` is allowed (the assistant greets by name); `lastName`/contact are not needed by any task.
`authorizedToWork`/`requireSponsorship` are allowed because they drive user-protective red flags
(the user asked us to warn them) and never go to an employer-facing surface.

## 3. Explainability contract

```json
{ "score": 88,
  "reasons": [
    { "text": "Title matches your target (Frontend Engineer)", "evidence": { "kind": "title", "ref": "pref.targetTitles[0]" } },
    { "text": "6 of 8 skills they list are on your profile", "evidence": { "kind": "skills", "ref": "profile.skills", "matched": ["React","TypeScript","Next.js","Jest","GraphQL","CSS"] } },
    { "text": "Remote (US) — you asked for remote", "evidence": { "kind": "location", "ref": "pref.workPreference" } },
    { "text": "Mentions visa sponsorship", "evidence": { "kind": "sponsorship", "ref": "posting.sponsorship" } } ],
  "missing": ["Storybook", "Playwright"],
  "signals": { "title": 0.9, "skills": 0.75, "location": 1.0, "level": 1.0, "sponsorship": 1.0, "semantic": 0.82 },
  "model": { "reason": "close to your Loop Studio role; they want Next.js", "promptVersion": 3, "model": "claude-haiku-5-5" } }
```
Rules: ≤ 4 reasons, each ≤ 12 words, each with evidence; `missing` ⊆ posting terms; the model reason is
optional and truth-checked; `signals` are the rerank weights (embeddings doc §2) so "explain" is the
real computation, not a story about it. ATS score already returns its 15 checks — unchanged. FIT's
`matched/missing/redFlags` gain `evidence` refs.

## 4. Bias evals

Fixture: 12 base personas × variants {name set A/B/C (ethnicity-coded first names), gendered
pronouns in summary present/absent, graduation year 2024 vs 1998, "career break 2022–2023" present/absent,
state school vs Ivy}. Metrics per task: mean delta, max delta, sign test, length/tone delta (judge).
Tolerance: |mean| ≤ 3, max ≤ 8 on 0–100 scores; no variant systematically lower (p < 0.05 on 60 pairs
flags). Report `build/ai-evals/bias-<task>.json`; nightly on the production route; `ai_alert
BIAS_DRIFT` MEDIUM on breach. Note: names and pronouns are *not* in prompts by design (§2), so the
test mostly guards the resume-text channel (bullets mentioning "she", a sorority, a 1998 degree) and
the model's priors on it.

## 5. Transparency page `/ai` and the settings panel

| Feature | What we send | Model tier | Default | Off switch |
|---|---|---|---|---|
| Resume parse | the file you upload | economy | on (consent at upload) | don't upload |
| Answer drafting | question + profile card | economy / your own key | off | Settings › AI |
| Tailoring / cover letter | resume + job description | quality → economy | on request | — |
| Job fit / ATS keywords | resume digest + job description + 9 preference answers | economy | on request | — |
| Daily matches | profile summary + preferences (nightly) | economy | **off** | /matches switch |
| Inbox reading | subject + body of ambiguous job emails | economy | on with inbox | /settings/inbox |
| Ask Kiwiply | your messages + what a tool returns | economy | Pro | delete chats |
| Interview practice | role + job + your answers | quality → economy | on request | — |

Footer sentences (verbatim, also in U14.5 policy): *"Your data is never used to train AI models. We
never sell it. Nothing you generate is shown to employers unless you paste it into an application
yourself."* Provider retention ("inputs are retained by the provider for up to N days for abuse
monitoring and not used for training") filled in from the provider contracts (routing doc §8, I1.8).

## 6. Regulatory posture (engineering facts for the trust area)

- We provide **candidate-side decision support**; employers/orgs never receive a Kiwiply score about a
  person except consent-scoped readiness bands with k ≥ 5 (O7.3). → Not an "automated employment
  decision tool" in the NYC LL144 sense; the trust area confirms.
- Every stored score row carries `prompt_version`, `model`, `created_at` (ledger + feature tables) → an
  annual bias-audit export is one query (I5.5).
- Users can turn each feature off, delete generated content, and export it (DSAR includes chats,
  proposals, feedback).
- Minors: AI features follow the age gate the trust area sets; no separate model behaviour.

## 7. Failure modes

| Failure | Behaviour |
|---|---|
| A new profile key added without allowlist review | `AiInputAllowlistTest` enumerates `BioDTO` keys and fails on any key in neither list |
| Reason has no evidence | validator drops it; a score with zero reasons renders "Rules-only score" + the signals |
| Bias eval flaps near tolerance | 3-night moving average before alerting; the report is still published |
| Transparency table drifts from code | the table is generated from the prompt registry metadata (`dataSent`, `tier`, `defaultOn`) at build time |

## 8. Tests

`AiInputAllowlistTest` (NEVER keys absent from every rendered prompt; new keys fail), `ExplainContractTest`
(≤ 4 reasons, evidence present, missing ⊆ posting), `BiasEvalRunnerTest` (math on fixtures),
`TransparencyPageTest` (generated rows == registry), Playwright: "Why this score?" sheet at 390 px,
AI chip present on every AI output, per-feature switch persists.

## 9. Rollout

I5.1 allowlist + test (no UI) → I5.3 explain contract on FIT/matches (API) + "Why?" sheet (web) →
I5.2 bias eval in the harness → I5.4 `/ai` page + chips + settings panel (with U14.2) → I5.5 audit export
→ I5.6 explanation-quality eval.

## 10. Mobile wireframe (390 px) — "Why this score?" sheet

```
┌──────────────────────────────┐
│ ▲ Why 88?                    │
│ ✓ Title matches your target  │
│   Frontend Engineer          │
│ ✓ 6 of 8 skills on your      │
│   profile  React · TS · …    │
│ ✓ Remote (US) — you asked    │
│ ✓ Mentions visa sponsorship  │
│ Missing: Storybook,          │
│ Playwright  [Add to skills?] │
│ ─────────────────────────────│
│ Kiwiply AI adds: "close to   │
│ your Loop Studio role"       │
│ Made with Kiwiply AI · 👍 👎  │
└──────────────────────────────┘
```

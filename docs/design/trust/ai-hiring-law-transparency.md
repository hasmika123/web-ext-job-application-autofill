# Design — AI-in-hiring law and algorithmic transparency (area `trust`, epic T3)

Status: design 2026-10-11. Not legal advice; §5 is the list of questions for counsel (register L4).
Existing: `AiTask` (DRAFT, PICK, MAP, ENRICH, PARSE, MATCH, FIT, TAILOR, JOBS, INBOX), `AiPolicy`
(per-task model, budget, kill switch), `ai_call` ledger, `AiInputs` (bounded digests), `/privacy`
per-feature disclosure, `/terms` "AI can be wrong", extension options consent copy, the EEO firewall
by construction (`PRIVACY.md`, `Onboarding.tsx`), no auto-submit (locked), Autopilot "never ticks
attestation boxes" (locked), marketer no-submit (`marketer-workspace.md`).

## 0. Where Kiwiply sits in the law (working position, to be confirmed)

| Regime | Status 2026-10-11 | Our working position |
|---|---|---|
| **EU AI Act** Annex III 4(a) (recruitment/selection: targeted job ads, filtering applications, evaluating candidates) | Digital Omnibus (Reg. 2026/1744, in force 2026-07-27) moved stand-alone Annex III obligations to **2027-12-02**; Art. 50 transparency applies from **2026-08-02** | Kiwiply's AI acts **for the candidate**, not the employer: scoring *my* resume against a posting, ranking postings *for me*, drafting *my* answers. We are not placing ads for employers or filtering applicants for them. Likely outside 4(a) as a provider/deployer, but **job matching could be read as "targeted job advertisements"** and the org Marketer prepares applications for consultants — counsel must confirm. Art. 50: drafts are AI-generated text the user edits and submits; the "assistive / edited by a human" exemption likely applies, but we label drafts anyway (D2). |
| **NYC Local Law 144** (AEDT bias audits; employers/agencies) | enforcement ramping (first penalties late 2025 reported) | Binds employers/employment agencies using a tool to screen candidates. A candidate-side tool is outside; **the org Marketer (consultancies = employment agencies?) using AI to prepare applications is not screening candidates** — confirm. Never sell the scoring to employers without this analysis. |
| **California CPPA ADMT regs** (significant decisions incl. employment; effective 2027-01-01) | adopted 2025 | Our automated decisions are for the consumer's own use (which job to apply to) — not "significant decisions" made *about* them by a business. Confirm; keep the human-review statement. |
| **Colorado** SB 26-189 (replacement, effective 2027-01-01; litigation ongoing) | reported | Consumer notice obligation at most; watch (T8.1). |
| **Illinois AIVIA / HB 3773** (employer use of AI in hiring, 2026) | in force | Employer-side; none for us unless sold to employers. |
| **GDPR Art. 22** (solely automated decisions with legal/similar effect) | — | No decision with legal effect is made about the user; scores inform the user. Inbox-driven **status changes** (rules + AI) are reversible, user-visible — not Art. 22, but disclosed. |
| **EEOC / Title VII** | — | Protected attributes never feed ranking/scoring (D4); EEO answers are only ever placed into the employer's own voluntary form by the user. |

Conclusion for the plan: build for transparency and auditability now (cheap, differentiating), so
that if counsel says a feature is in scope, the register, logs and explanations already exist.

## 1. Decisions

| # | Decision |
|---|---|
| D1 | **AI feature register as code**: `AiFeature` enum (one per user-visible feature, mapped to one or more `AiTask`s) with `purpose`, `inputs` (DataClass refs), `outputs`, `decisionImpact` (INFORMATIONAL / SUGGESTS_ACTION / CHANGES_STATE), `humanReview` (ALWAYS — the user reviews before anything is submitted/saved), `disclosureKey` (copy id), `plan`, `defaultOn`. `AiFeatureDocSyncTest` renders the enum to a table and diffs it against `/privacy`'s AI section source (T0.3 markdown) and this file's §2 — drift fails the build. |
| D2 | **One `AiDisclosure` component** (`@kiwiply/ui`) on every AI output: badge "AI · review before you use it", a "Why?" affordance that opens the explanation, "What was sent" (the inputs list from the register), model/provider line ("Google Gemini, no-training tier"). Used by drafts (extension drawer + web), fit/match scores (U4.7, R5.2), tailor diffs (R4.2), inbox-driven status changes (U6.3 timeline shows "from your inbox · rule: offer keywords" or "· AI"). |
| D3 | **Explanations are structured, not prose**: FIT/MATCH return `reasons[]` (matched skills, missing keywords, rule hits) and the ranker's `?explain` output (U4.2) is user-visible in a short form ("Matched: React, remote, $ range · Missing: Kubernetes"). Scores never show without at least one reason. |
| D4 | **Sensitive-field firewall as a test**: a `SensitiveField` set (gender, ethnicity, race, veteranStatus, disabilityStatus, DOB/birthYear, sexualOrientation, religion, nationality beyond work-authorization, health, union, photo) with `SensitiveFirewallTest` asserting none of these keys appear in: `AiInputs` digests, `AiDraftService` context, `ProfileSuggestion` capture (extension `src/lib/*` suggestion filter), org DTOs (`ShareField`), `fill_event` payloads, `JobRanker`/`JobPrefilter` features, product events, the assistant tool outputs (U8). The extension side gets the same list in `src/config/rules.js` (`SENSITIVE_FIELDS`) and a unit test. |
| D5 | **Attestations are the user's**: the extension never ticks "I certify the information is true", "I agree to the background check", signature fields or date-signed fields; detector rules (`isAttestation(label)`) + `AttestationGuardTest` with real ATS fixtures (Workday, Greenhouse, iCIMS, Taleo); Autopilot (Phase 19) and Marketer act-for inherit the guard (`NoSubmitSurfaceTest`, O10.10). |
| D6 | **Provenance on every AI output**: `ai_call` already keeps task/model/cost; add `prompt_version` and `feature` (AiFeature) and store the `ai_call.id` on each persisted output (draft, report, tailor proposal, match score, inbox classification) so "why did this change?" is answerable and the export shows which model produced what. |
| D7 | **Fairness check for ranking/matching (P2, aggregate only)**: no protected attribute is a feature (D4). Quarterly, for users who opted in to EEO self-ID *and* to "help check fairness" (a separate switch, off by default), compare match-score and daily-match-count distributions across groups with k ≥ 100 per cell; publish the summary in the transparency report (T7.5). No per-user effect. |
| D8 | **Model/provider changes are material** when they change where data goes (provider, tier, region); a model swap within the same provider/terms is a changelog line. The register's `provider` field drives this via the legal versions (T0.3/T0.4). |
| D9 | **No employer-side sale** of scores, rankings or candidate data — ever, without a separate decision and the LL144/AI Act analysis. Stated on `/trust`. |

## 2. The register (initial content; the enum is the source of truth)

| AiFeature | AiTask(s) | Inputs | Output | Impact | Plan | Default |
|---|---|---|---|---|---|---|
| RESUME_PARSE | PARSE | resume text/file | structured profile fields (user reviews card by card, R1.4) | SUGGESTS_ACTION | all | on (opt-out) |
| ANSWER_DRAFT | DRAFT | question, short profile/resume summary | draft text (user edits) | SUGGESTS_ACTION | Pro | off |
| OPTION_PICK | PICK | question + options + summary | one option (user confirms) | SUGGESTS_ACTION | Pro | off |
| FIELD_MAP | MAP | field labels only | label→profile key | INFORMATIONAL | Pro | off |
| JOB_ENRICH | ENRICH | posting text | job type/workplace/salary fields | INFORMATIONAL | Pro | off |
| RESUME_MATCH | MATCH | JD + brief resume digests | ranked resumes + one-line reasons | INFORMATIONAL | Pro | off |
| JOB_FIT | FIT | JD + detailed digest + knock-out answers (work auth, sponsorship, location, relocation, work pref, start, notice) | match %, missing keywords, red flags | INFORMATIONAL | Pro | on click |
| TAILOR | TAILOR | JD + resume | reworded bullets (diff, user applies) | SUGGESTS_ACTION | Pro | on click |
| DAILY_MATCHES | JOBS | default-resume summary, location/work prefs, ≤50 postings | scores + reasons; Free gets rules-only | INFORMATIONAL | Pro (AI) / Free (rules) | opt-in |
| INBOX_CLASSIFY | INBOX | sender, subject, start of text (rules first) | application status proposal → applied automatically (reversible, logged) | CHANGES_STATE | Pro | opt-in (inbox connect) |
| ASSISTANT (U8) | DRAFT-class | user question + tool results | answers; write tools need confirm chips | SUGGESTS_ACTION | Pro | opt-in |
| INTERVIEW_PRACTICE (U9.3) | DRAFT-class | answers typed by the user | feedback | INFORMATIONAL | Pro | opt-in |

`INBOX_CLASSIFY` is the only CHANGES_STATE feature: the timeline entry names the rule or "AI", the
change is one tap to revert, and the email is linked — that is the human-oversight story.

## 3. Component (390 px)

```
┌──────────────────────────────┐
│ ✦ AI draft · review before   │
│   you use it         Why? ▾  │
│ "I led a team of four…"      │
│ ─ Why ─────────────────────  │
│ Sent: the question + a short │
│ summary of your profile and  │
│ resume (no name, no contact, │
│ no self-ID answers).         │
│ Model: Google Gemini, no-    │
│ training tier. Call #a8f2.   │
│ [ Use ] [ Edit ] [ Discard ] │
└──────────────────────────────┘
```

## 4. Failure modes

| Failure | Behaviour |
|---|---|
| A new AiTask is added without a register entry | `AiFeatureDocSyncTest` fails; `AiPolicy.isDisabled` treats unknown features as disabled |
| A sensitive key slips into a prompt builder | `SensitiveFirewallTest` fails (it builds a profile with every sensitive key set and asserts absence in the rendered prompt) |
| An ATS renames its attestation checkbox | guard is label-based + fixture-tested; the drawer also refuses any checkbox whose label contains certify/attest/acknowledge/signature; unknown → leave untouched (default is already "never tick what we don't recognise") |
| Explanation missing from the provider response | score hidden, "couldn't explain this one" shown; no bare numbers |
| Provider changes terms (training allowed) | register `provider.training=false` is a release-time assertion read from config; CI fails if `DOSSIER_AI_PROVIDER_TRAINING=true` is ever set outside dev |

## 5. Needs a lawyer (L4)

1. Is candidate-side matching/scoring an Annex III 4(a) system (provider duties from 2027-12-02)? If
   yes, which of risk management, logging, human oversight, accuracy docs apply at our size, and does
   the Marketer (consultancy) use change the answer?
2. Art. 50 marking for AI-generated drafts the user submits — does the edited/assistive exemption
   hold; do we need machine-readable marking?
3. NYC LL144: could an org (consultancy) using the Marketer be an "employment agency" deploying an
   AEDT? What wording keeps us out of "screening candidates"?
4. CPPA ADMT: confirm consumer-directed decisions are out of "significant decision"; required notice
   text if not.
5. GDPR Art. 22 and the inbox-driven status change; Art. 9 for resume text containing health/union
   data during parsing (lawful basis, explicit consent wording).
6. Default-on AI resume parsing (one call per resume) — consent vs contract basis, and the exact
   disclosure placement.
7. Fairness check (D7): any obligation created by *collecting* EEO for fairness monitoring; retention.

## 6. Tests

`AiFeatureDocSyncTest`, `SensitiveFirewallTest` (API) + `sensitiveFields.test.js` (extension),
`AttestationGuardTest` with ATS fixtures, `ProvenanceIT` (every persisted output has `ai_call_id`;
export shows model per output), `ExplanationPresentIT` (FIT/MATCH responses without reasons are
rejected), `InboxChangeRevertIT` (AI-classified status change is one-tap revertible and logged),
Playwright: AiDisclosure renders on draft/fit/tailor at 390 px with "What was sent".

## 7. Rollout

T3.1 register + sync test → T3.3 firewall test (fix anything it finds) → T3.4 attestation guard →
T3.2 disclosure component + explanations → T3.7 provenance → T3.5 counsel memo (parallel; blocked
on counsel) → T3.6 fairness check (P2, after U4.6 and EEO opt-in switch).

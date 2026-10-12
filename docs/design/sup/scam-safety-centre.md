# Design — Job-scam safety centre (area `sup`, epic S3)

Status: decided 2026-10-11. The one support feature none of the benchmarked products does well
inside the application flow. Why now: FTC job-scam losses tripled 2020→2023 and passed $220 M in
H1 2024; LinkedIn's 2026 Safety Pulse: Gen Z 32 % victims (Gen X 17 %), 32 % of Gen Z ignore warning
signs, 90 % of scam messages push off-platform (sources in `AUDIT-sup.md` §3).

## 0. Summary

1. **Three layers.** (a) **Learn** — public `/safety` hub with scam types, red flags, real examples
   and the country-specific "it happened, what now" checklist. (b) **Check** — a rule-based
   **"Is this legit?" checker**: paste a message/posting/email → scored red flags with plain
   explanations; no AI on Free (locked decision), Pro/Autopilot can ask the AI help assistant to
   explain in context. (c) **Warn** — the extension and the job store raise **signals** at the
   moment of risk: employer domain ≠ posting domain, SSN/bank/ID fields before an offer, pay-to-apply
   or equipment-purchase language, free-mail recruiter addresses, WhatsApp/Telegram redirects.
2. **Report in one tap** from any posting, the checker, or a message → `scam_report` (a
   `support_ticket` of kind SCAM_REPORT plus a structured row) → admin **Safety queue** with an
   owner and a 1-business-day first response for everyone. Confirmed scams feed a **blocklist**
   (domains, phone numbers, templates) that strengthens the warnings for everyone.
3. **Never shame, never block.** Warnings are "Heads up — 3 things look off" with reasons, a
   "Continue anyway" and "Report". We never prevent an application and never auto-submit anything
   (CLAUDE.md). The tone is the friend who read the message with you.
4. **Minors and schools**: safety content is public and ad-free; the checker stores nothing
   identifying; school orgs can pin the safety hub for members (hook only; org area owns the page).

## 1. Scam taxonomy (content + signal catalogue)

| Code | Type | Typical signals | Severity |
|---|---|---|---|
| FAKE_RECRUITER | Impersonated recruiter / company | free-mail domain, domain lookalike (`g00gle-careers.com`), no company page, pressure to move to WhatsApp/Telegram/Signal, interview by chat only | high |
| FAKE_POSTING | Job that doesn't exist (identity harvest) | asks SSN/ID/bank at application, "quick hire", salary far above market, duplicated across boards with different companies | high |
| TASK_SCAM | "Like videos / rate products" pay-per-task | crypto deposit to unlock, gamified dashboard, "VIP level", recruiters on text | high |
| CHECK_SCAM | Overpayment / equipment check | cheque to buy equipment from "our vendor", refund the difference | high |
| PAY_TO_APPLY | Fees for application/training/background check/visa | any payment before hire; "certificate required, buy here" | high |
| CV_WRITING_SCAM | Fake "your CV was rejected by ATS, pay to fix" | unsolicited, links to paid rewriters, often LinkedIn DMs | medium |
| REMOTE_TOO_GOOD | Unrealistic remote role | no interview, offer in < 24 h, vague duties | medium |
| MLM_RESHIP | "Package handler"/reshipping, "business opportunity" | work from home receiving parcels; pay for a starter kit | high |
| PHISHING | Credential harvest via fake portal | login page on a non-company domain, urgency, "verify your account" | high |

Each type has a hub page: what it looks like (anonymised real examples from reports), 3 checks,
what to do, "someone I know fell for this" (shareable card).

## 2. Rule-based checker (no AI, deterministic, testable)

Input: pasted text (≤ 5 000 chars) and/or a URL. Runs **client-side** in the browser (web and
extension) with the same `@kiwiply/scam-rules` module (plain JS, in `packages/`, shared by web and
the extension engine — the engine stays dep-free: the module has no deps and is copied into the
extension like `parser-core`).

Signals (each: id, weight, evidence snippet, explanation, type codes):
- `offplatform_move` (WhatsApp/Telegram/Signal/Google Chat invites) w3
- `payment_request` (fee, deposit, gift card, crypto, Zelle, Cash App, wire, "starter kit") w4
- `sensitive_early` (SSN, passport, bank/routing, driver's licence, photo of ID before offer) w4
- `freemail_recruiter` (gmail/outlook/yahoo sender for a named company) w2
- `domain_mismatch` (link/sender domain ≠ company's known domain; lookalike distance ≤ 2) w3
- `urgency` ("today only", "respond within 24 h", "position filled fast") w1
- `no_interview_offer` ("you're hired", "offer attached" with no interview mention) w2
- `too_good` (salary token > 2× median for the title where known; "$40/hr data entry") w1
- `chat_only_interview` (Telegram/Teams chat interview, "text interview") w2
- `check_overpayment` w4 · `reship` w3 · `cv_rejected_pay` w2

Score = Σ weights; bands: 0–2 "Looks normal", 3–5 "Be careful", ≥ 6 "Likely a scam". Output lists
each triggered signal with its evidence, the matched scam types, and the next step. Known-good
allowlist (the 219 ATS boards in `api/src/main/resources/config/job-sources.csv` + the ATS vendor
domains) suppresses `domain_mismatch` for legitimate ATS-hosted forms (`myworkdayjobs.com`,
`greenhouse.io`, `lever.co`, …).

Pro/Autopilot "Explain this" → S6 AI help task `HELP` with the signals as structured context; the
AI never decides the score, only rewrites the explanation for the user's situation. Free sees the
same signals with the canned explanations — the protection is identical, by design (core safety is
not a paid feature).

## 3. Warn layer (extension + job store)

- **Extension (content/adapters):** before the first fill on a page, run the checker on the visible
  page text + form field labels + URL (local, no network). Trigger only on `sensitive_early`,
  `payment_request`, `domain_mismatch` (≥ "Be careful"). Show a drawer banner: "Heads up — this form
  asks for your SSN before any offer. Legit employers ask after." [Why?] [Report] [Continue]. The
  autofill engine **never fills** SSN/bank/ID fields regardless (it has no such profile keys —
  assert in tests). Owned jointly with the `ext` area (adapters); this area owns the rules module +
  banner copy.
- **Job store (API, nightly ingest):** posting-level `risk_flags JSON` on `job_posting` (U4.1):
  `pay_to_apply`, `freemail_contact`, `offplatform_contact`, `duplicate_company_mismatch`. Flagged
  postings are **excluded from matches** and shown with a shield chip in search; the flag is
  computed by the same rules module (server-side Java port is overkill — run the JS rules in a
  tiny Node step of the ingest? No: the API is Spring. Decision: a **Java port of the regex table**
  generated from the same JSON signal catalogue `packages/scam-rules/signals.json`, with a
  contract test that both ports agree on the fixture set).
- **Inbox (Pro):** the inbox classifier (14.4a) gets a `SCAM_SUSPECT` label from the same signals on
  recruiter mail; shown as a chip in Messages with "Check this message" → checker pre-filled.

## 4. Report flow + data

```
scam_report
  id BIGINT PK, ticket_id FK support_ticket, user_id NULL, type VARCHAR(24) NULL (user-picked or null)
  channel VARCHAR(16) (posting|message|email|phone|other), source_url VARCHAR(2048) NULL
  company_claimed VARCHAR(200) NULL, contact_domain VARCHAR(253) NULL, contact_phone_hash CHAR(64) NULL
  evidence_text VARCHAR(5000) NULL (scrubbed), checker_score TINYINT NULL, signals JSON NULL
  money_lost BIT NULL, shared_sensitive BIT NULL           -- drives the "what now" checklist
  outcome VARCHAR(16) NULL (CONFIRMED|LIKELY|NOT_SCAM|UNCLEAR), reviewed_by, reviewed_at
  created_at, INDEX(outcome, created_at), INDEX(contact_domain)

scam_blocklist
  id BIGINT PK, kind VARCHAR(12) (domain|phone|template), value VARCHAR(253), value_hash CHAR(64)
  source VARCHAR(16) (report|manual|feed), confidence TINYINT, added_by, added_at, expires_at NULL
  UNIQUE(kind, value_hash)
```
Blocklist is served to the extension via the existing remote-config path (A5) as a hashed list
(bloom filter, ≤ 50 KB, refreshed daily) — the extension never sends the page to the server to
check it.

API: `POST /api/safety/reports` (optional auth, BFF 10/h/IP) · `GET /api/safety/checker-allowlist`
(cached) · `GET /api/admin/safety/reports?outcome` · `PUT /api/admin/safety/reports/{id}` (outcome,
blocklist add; audited `SAFETY_REPORT_REVIEW`) · `GET /api/admin/safety/blocklist` + `POST/DELETE`.

Report state: `NEW → REVIEWED(outcome)`; CONFIRMED with a domain/phone ⇒ blocklist proposal (admin
confirms; two confirmations from different reporters auto-propose with confidence 2).

## 5. "It happened — what now" (localised checklist)

Country from the browser locale / profile location (never stored by the checker): US (FTC
ReportFraud, IC3, IdentityTheft.gov, bank, DOL for UI fraud), UK (Action Fraud, bank, Cifas),
CA (Canadian Anti-Fraud Centre), AU (Scamwatch/ACSC), IN (cybercrime.gov.in), EU fallback (local
police + bank + the EU consumer centre). Steps mirror Indeed's nine but ordered by urgency: stop
contact → bank/card → freeze credit (if ID shared) → change passwords → report (us + authority) →
tell someone. Each step is one tap (tel:/https links) with a checkbox stored locally.

## 6. Failure modes

| Failure | Behaviour |
|---|---|
| False positive on a legitimate employer (e.g. small firm using Gmail) | band "Be careful" wording is hedged; allowlist of ATS domains; "This is legit" feedback lowers the signal weight in review (manual tuning, no auto-learning) |
| Real scam not caught | the hub says plainly the checker is a helper, not a verdict; "Report" always available |
| Reporter pastes someone else's PII | scrub regexes (emails, phones, card/SSN patterns) before storage; evidence capped |
| Blocklist poisoning via mass false reports | admin confirmation required; auto-propose needs 2 distinct reporters + no NOT_SCAM review |
| Extension banner on every page | fires once per host per 24 h; snoozable; never on allowlisted ATS domains |

## 7. Privacy & legal

Checker runs locally; nothing pasted leaves the device unless the user taps Report. Reports are
support tickets (same retention/anonymisation as `support-tickets.md` §6). We publish aggregate
counts ("312 scams reported this month, 41 domains blocked"), never reporter data. Accusing a named
company: hub examples are anonymised; the blocklist is internal (served hashed) and never
rendered as a public "scam companies" list — the `trust` area owns the defamation review.
Minors: no account needed for Learn/Check; Report asks only for an email if not signed in.

## 8. Cost

Zero AI on Free; Pro "Explain" ≈ 600 input + 200 output tokens on the economy model (≈ $0.0005
per call) charged to the platform **support** budget line (S6), not the user's AI budget. Content:
9 type pages + checklist = one Sonnet drafting session + a human review (`trust` area).

## 9. Tests

- `packages/scam-rules`: 60-fixture corpus (30 scams from public FTC/IC3/university examples
  rewritten, 30 legitimate recruiter mails/postings) — precision ≥ 0.9 on the "Likely" band,
  recall ≥ 0.8; snapshot of signals per fixture; scrubber unit tests.
- API: Java port contract test over the same fixtures; `ScamReportResourceIT` (anonymous needs
  email; scrubbing; admin review audited; blocklist uniqueness; auto-propose rule).
- Extension: `scam_banner.test.js` (fires on SSN field before offer, not on allowlisted ATS, once
  per host/day; engine never has an SSN key).
- web: Playwright 390 px: paste → score → report → "what now" checklist with US links.

## 10. Rollout

S3.1 rules module + fixtures → S3.2 `/safety` hub + checker page → S3.3 report flow + admin queue →
S3.4 extension banner (with `ext`) → S3.5 job-store risk flags (with U4.1) → S3.6 blocklist + remote
config → S3.7 inbox label (Pro) → S3.8 country checklist + share cards.

## 11. 390 px wireframes

```
┌──────────────────────────────┐  ┌──────────────────────────────┐  ┌──────────────────────────────┐
│ Is this job legit?           │  │ Result: Likely a scam  🔴 7  │  │ Heads up               ✕     │
│ Paste the message, posting   │  │ 3 things look off:           │  │ This form asks for your SSN  │
│ or link. Checked on your     │  │ ⚠ Wants to move to WhatsApp  │  │ and bank details before any  │
│ device — nothing is sent.    │  │   "message me on WhatsApp"   │  │ offer. Real employers ask    │
│ ┌──────────────────────────┐ │  │ ⚠ Asks for a deposit         │  │ after you're hired.          │
│ │ Hi! Your profile matched │ │  │   "$50 activation fee"       │  │ • Domain: hr-amazon-jobs.co  │
│ │ our remote data entry …  │ │  │ ⚠ Gmail address for "Amazon" │  │   (not amazon.com)           │
│ └──────────────────────────┘ │  │ What to do                   │  │ [Why?] [Report] [Continue]   │
│ [ Check it ]                 │  │ Don't pay. Don't send ID.    │  │ Kiwiply never fills SSN or   │
│ Examples: fake recruiter ·   │  │ [Report this] [Share card]   │  │ bank fields.                 │
│ task scam · pay to apply     │  │ Pro: [Explain for me ✨]     │  │                              │
│ 🛡 312 reports this month    │  │ Not a scam? [Tell us]        │  │                              │
└──────────────────────────────┘  └──────────────────────────────┘  └──────────────────────────────┘
"It happened — what now" is a checklist page: Stop contact ☐ · Call your bank ☐ (tel:) · Freeze
credit ☐ · Change passwords ☐ · Report to FTC ☐ (link) · Report to us ☐ · Tell someone ☐.
```

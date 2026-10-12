# Reconciliation — gap coverage, cross-area dedupe, consolidated decisions, build order

Written 2026-10-11 on `version2` (reset to `2d890f7`) by the reconciliation pass over all twelve roadmap
sources: `docs/roadmap/areas/{user,org,admin,ext,mkt,plat,ai,mob,pay,trust,sup}.json` and
`docs/resume-builder/stories.json`. Inputs: root `CLAUDE.md` (locked decisions are hard constraints),
`docs/HANDOFF-ROADMAP.md`, `COMPETITIVE-LANDSCAPE.md` (22 competitors, feature matrix),
`COMPETITIVE-GAPS.md` (G1–G44), every `PLAN-<key>.md` §"gaps folded in / rejected" and §"open
questions", and every `AUDIT-<key>.md` for what already exists.

**Source-of-truth rule used here (coordinator correction):** what *exists* comes from each area's
`AUDIT-<key>.md` and its `done` / `partial` stories, not from the "Existing coverage" column of
`COMPETITIVE-GAPS.md`. Where that column was stale (e.g. G1 said adapters exist "for Workday /
Greenhouse / Lever / Ashby / generic only" — `AUDIT-ext.md` §0 and E2.12 show Workable and Indeed
smartapply adapters also ship, plus the v0.37.0 QA fix pass), the matrix below credits the baseline
story and counts only the remainder as open.

What this pass changed (all validated: every JSON parses, **0 dangling ids**, generator `--list` runs):

| Area | Stories added | Stories edited (benchmark / AC / links) |
|---|---|---|
| User (U) | 4 — U13.4, U13.5, U6.10, U6.11 | 31 |
| Organization (O) | 4 — O10.11, O10.12, O10.13, O8.6 | 19 |
| App admin (A) | 0 | 29 (relates → owners) |
| Resume Builder (R) | 1 — R3.6 (+ `RESUME-BUILDER-STORIES.md` in sync, 46 stories) | 16 |
| ext / mkt / plat / ai / mob / pay / trust / sup | 1 — E10.7 (never-collected field classes, §0.5) | 12 / 24 / 7 / 8 / 5 / 17 / 19 / 17 |

No story's `status` was changed; two titles were corrected to match the no-collect rule (O4.1, O4.7 —
"tax-ID collection" → "no tax-ID collection", §0.5). 47 `supersedes` pointers now exist (43 new in this
pass, 4 were already in `pay.json`); `deps`/`relates` in 61 stories were re-pointed from a superseded
story to its owner. Totals: **885 stories, 144 epics**.

---

## 0. Already built — per area (so the existing work is visible)

Baseline stories roll up months of finished work into one S/M-sized `done` row each (E2.12 alone is six
adapters, E4.8 the whole capture chain), so **area progress % understates what exists**. One line per
area, citing the `done` (and the most important `partial`) story ids:

- **U user** — done U1.10 auth (password, Google, reset, activation, admin MFA), U2.8 Tier-A questions,
  U4.9 light daily matches (13.6), U6.9 tracker + inbox baseline (Phase 3, 14.4–14.6: IMAP, interview /
  reject / offer → status), U13.2 learned-answer suggestions (10.3), U14.6 settings baseline (account,
  billing card, AI meter, inbox, autofill prefs, delete, export), U15.4 billing (checkout, portal,
  webhook, gates, pricing), U20.2 save-a-job, U20.5 sync. Partial (UI on sample or client-only data):
  U3.1, U3.5, U4.3, U5.1, U6.3, U6.6, U6.7, U7.2, U7.6, U8.2, U9.1, U10.2, U11.1, U12.1, U13.1, U14.1,
  U14.3, U14.4, U15.2, U20.1.
- **O org** — done O14.1 sales-inquiry intake. Partial shells on sample data: O1.6, O1.7, O2.7, O4.6,
  O5.1, O7.4, O7.5, O8.1–O8.4, O12.1, O13.1, O14.2. **No organization model exists in the API** —
  O1.1–O1.5 are the foundation.
- **A admin** — done A0.0 admin gate, A0.1 email-OTP MFA, A1.1 user actions incl. GDPR delete, A1.2 AI
  override + session revoke, A6.1 job-source pool, A8.1 bug reports, A8.3 inquiries. Partial A1.3,
  A2.1, A4.1, A7.1, A10.0, A11.1, A12.1 (every chart/trend/delta is SAMPLE).
- **R resume builder** — nothing built; design, stories and decisions done (`R-design`).
- **E extension** (v0.65.0, ruleset v6) — done E0.5 release train, E1.7 28 unit suites, E2.12 adapters
  (Workday multi-step, Greenhouse, Lever, Ashby, Workable, Indeed smartapply, generic + v0.37.0 fixes),
  E3.7 fill engine (overlay, confidence tiers, field cache + twin + sync, post-fill audit 10.2, shadow
  DOM, group prompts), E4.8 capture chain + DRAFT/APPLIED auto-log + submit-detect + save-a-job,
  E5.10 drawer/options (resume fit, job fit, upload-on-the-fly, dark mode), E6.6 AI (BYO key, consented
  server proxy, option-validated picks, field mapper, EEO guard, 402), E8.7 count-only telemetry,
  E9.6 Edge + Firefox MV3 build + relay, E10.6 security baseline (scoped hosts, no remote code),
  E12.5 connect hand-off. 18 partial (E0.1 store resubmit, E2.6–E2.9 depth, E3.1–E3.5, E4.1, E4.6,
  E4.7, E6.2, E6.3, E9.1, E9.3, E10.5, E12.1). CWS v1 is **published and under review**.
- **M marketing** — done M2.1 /pricing, M3.2 robots/sitemap/OG, M4.7 contact form → inquiries, M9.2
  newsletter double opt-in, M10.1 store listing copy. Partial M0.2, M0.3, M0.5, M1.1 (landing v2 +
  /about + /organizations), M1.2, M2.3, M3.3, M3.4, M9.6, M10.4, M11.3.
- **P platform** — done P0.0 backup + restore-drill scripts (15.1a, never run on the box), P1.0 error
  digest (15.1b), P2.0 CI + GHCR + SSH deploy on merge to `main`, P5.0 S3 resume storage. Partial P2.7.
- **I ai** — done I0.1 period budgets / Free parse count / override / kill switch (13.1b), I0.2 usage
  meter (13.1c), I1.1 task-typed provider seam (13.1a), I3.1 tailoring truth checks (13.4). Partial I6.1.
- **N mobile** — done N0.7 existing mobile polish (44px, 2×2 tiles). Everything else not started.
- **B payments** — done B0.1 billing baseline (webhook-only writer, checkout, portal, /me), B0.2 402
  gates at ten sites, B0.3 deletion cancels Stripe, B0.4 renewal + no-refund copy (12.6), B0.7 MRR card,
  B8.1 AI budget per period + economy model, B11.1 plan on the version endpoint. Partial B4.3, B6.1,
  B8.2, B11.3.
- **T trust** — done T1.0 privacy baseline (JSON export, self/admin erasure, inbox retention, cookie
  banner, PRIVACY.md, 16+ terms). 14 partial (T0.2, T0.3, T1.2, T1.3, T1.4, T1.7, T2.1, T3.2, T3.3,
  T3.4, T3.7, T5.9, T6.1, T7.2).
- **S support** — nothing done; partial S1.3, S1.6, S2.3, S2.5, S2.6, S4.1 (bug widget + contact form).

---

## 0.5 Never collected — the product-wide no-PII rule

User rule (restated 2026-10-11): **Kiwiply does not take** — not collect, not accept, not extract from an
upload, not learn while filling, not sync, not export, not send to AI — any of: **SSN / ITIN, bank account
or routing numbers (incl. IBAN), tax IDs (EIN / VAT / …), passport / visa / I-9 / document numbers, date
of birth.** Card details exist only on Stripe-hosted pages; Stripe holds them under its own terms.

Every story in all twelve sources was searched for these terms and for anything that parses uploads,
imports, pastes or mail. Result:

| Story | Finding | Action in this pass |
|---|---|---|
| T1.1 Data map as code | only had the `dob/birth_*` column rule | **AC added**: `DataClass.NEVER_COLLECTED` deny-list; `DataMapTest` scans JPA entities, DTOs, Liquibase columns and the AiInputAllowlist for the name patterns and fails the build; a shared **`SensitivePatterns`** value-shape library (API + web + extension) that every upload/import/paste/mail path must call to detect-and-drop |
| T3.3 Sensitive-field firewall | covered EEO/DOB and work-auth document numbers | AC extended to the full never-collected set |
| **E10.7 (new)** | no extension story said the field cache / profile-learn / AI / telemetry skip these fields | **New P0 story**: NEVER field class in the schema — never learned, cached, synced, autofilled from memory, drafted or sent; one-time cache purge on upgrade; Autopilot parks NEEDS_YOU `sensitive_field`; server sync rejects deny-list labels |
| U13.4 My Answers bank | could have listed a learned SSN | AC: filtered at capture (E10.7) and at read |
| R1.4 onboarding upload/paste, R1.1 import, R3.6 parse check | resume text goes to the AI parser | AC: SensitivePatterns redaction before parsing; items matching are rejected (422 SENSITIVE_CONTENT); the review says "we removed N sensitive values" |
| I3.3 untrusted input, I5.1 AiInputAllowlist | no redaction step for these shapes | AC: redaction on every untrusted slot; NEVER list includes the classes; rendered-prompt test feeds fixtures |
| U10.1 inbox threads | recruiter mail bodies are stored (14.x) | AC: bodies pass through redaction before persistence |
| O2.5 org CSV import | T2.3 only rejected age columns | AC: whole file refused when any header/value matches the deny-list |
| O11.2 clients/vendors/placements, O11.3 timesheet attachments, O11.5 invoice records | "sensitive-text validator" was unspecified; attachments were opaque | AC: validator = SensitivePatterns; attachments image/PDF only, text layer scanned, rejected on a hit, **no OCR / extraction**; invoices carry no tax or bank identifiers |
| S2.4 screenshot attachments | — | AC: no OCR, never sent to AI, "do not include documents" notice, staff delete audited |
| **O4.1 / O4.7 org Stripe** | title and config implied **tax-ID collection** | **Changed**: `tax_id_collection` disabled on Checkout; Portal `customer_update.allowed_updates` excludes `tax_id`; titles corrected. *Nuance for the user:* a customer can still type a business tax ID into Stripe's own hosted pages — Stripe holds it, we never receive or mirror it |
| B3.1 checkout v2, B6.2 invoices, B3.2 billing consent | — | AC: no tax-ID collection or identifier custom fields; consent rows hold versions/timestamps/IP hash only |
| O11.6 payments/expenses, S3.4 heads-up banner, T2.1 age screen, T3.9 work-auth rules, O10.13 | already comply (categories only, no numbers, no birth date stored) | no change |
| O4.6 billing page | "Visa 4242" is sample copy being removed | no change |
| S4.2 site reports, E8.2 telemetry | already "never values, labels hashed / no labels" | no change |

Decision needed from the user: **none** — this is a rule, already applied. One follow-up for the
implementers: the existing `parseResumeWithAi` path (13.x, done) must gain the same redaction when R1.4
lands; until then the resume parser can see what a resume contains, though nothing from these classes is
mapped to a profile field today.

---

## 1. Gap coverage matrix (G1–G44)

Legend — **Built**: the part that already ships (baseline/done story) · **Owner**: the story that owns
the remainder · **Also**: supporting stories in other areas · **State**: covered / covered (added) /
partly covered / rejected / parked.

| Gap | Tag | Pri | Built (baseline) | Owner | Also | State |
|---|---|---|---|---|---|---|
| G1 ATS adapter expansion | E | P0 | E2.12 (6 adapters + generic, v0.37.0 fixes); hosts declared | E2.1 iCIMS, E2.2 SmartRecruiters, E2.3 Taleo, E2.4 BambooHR, E2.5 Jobvite, E2.6–E2.9 depth, E2.10–E2.11 new hosts | A5.5 kill switch; E2.13 LinkedIn decision record | covered; **LinkedIn Easy Apply fill rejected** by ext (LinkedIn UA §8.2 / Prohibited Software — save + deep-link instead); Indeed stays at the public smartapply flow |
| G2 DOM-fixture harness + published accuracy | E, M | P0 | E1.7 (28 jsdom suites, hand-built markup) | **E1.6** published report ← M0.6, S1.5; harness E1.1–E1.5 | S4.4 live per-ATS status (relates), S1.3 hosts the article | covered; publishing is decision **D24** |
| G3 Post-fill report | E | P1 | E3.7 (post-fill audit 10.2: required-but-empty card with Go) | E3.4 | S4.3 "did this fill work?" | covered |
| G4 JD snapshot + resume-version link | E, U | P0 | E4.8 capture chain; E4.6 partial (snapshot v1) | E4.6 (extension) + N1.2/N1.3 (phone) | **U6.1 AC edited** (resume_id + JD snapshot columns), **U6.3 AC edited** (shows both) | covered |
| G5 "Already applied / saved" badges | E | P1 | — | E5.7 | U20.3 (relates) | covered; narrowed to no LinkedIn host (**D40**) |
| G6 AI answers for free-text on Pro | I, E | P0 | E6.6 (consented server drafts exist; BYO on Free) | I3.5 grounding + sources (engine), E6.2 (UI), E6.1 default-on, E6.3 truth guardrails | I6.4 BYO guard | covered |
| G7 My Answers bank | U | P1 | U13.2 (suggestions), field cache (E3.7) | **U13.4 added** | E6.5 (extension read side, now deps U13.4), N3.1 phone copy sheet, E7.4 | covered (added) |
| G8 Autopilot ask-and-remember | E, I | P0 | — | **E7.4** ← I9.12 | U13.4 | covered; scope confirmation **D20** |
| G9 Try-it page | E, M | P1 | — | M1.8 (page) + E12.4 (drawer half, deps M1.8) | U2.7 (relates) | covered |
| G10 In-product review prompt | E, M | P1 | — | **E5.8** ← M10.5, S5.6 | N6.6 (store app, P2) | covered |
| G11 Firefox + Safari presence | E | P1 | E9.6 (Firefox MV3 build + relay, Edge same bundle) | E9.1–E9.5 | M10.4 site links, P2.7 pipeline, N3.2/N3.4 Android/iOS | covered; Safari = P2 spike (**D41**) |
| G12 Free explainable match score | U | P1 | U4.9 light daily matches | I4.3 + I5.3 (engine/contract); **U4.7 AC edited** (Free rules score + 3 reasons on every card) | U4.3 | covered; **D18** |
| G13 Sponsorship signal | U, I | P1 | — | I9.8 | **U4.5 AC edited** (preference + filter) | covered |
| G14 Share-target / save from any app | N, U | P0 | U20.2 (drawer save) | N1.1, N1.2, N1.3, N1.4, N6.3 | U17.1, U20.2 (relates), M1.7 | covered |
| G15 Scam signals + safety centre | S, U | P1 | — | S3.1, S3.2, S3.4, S3.5 | **U4.3 AC edited** (shield chip) | covered |
| G16 Auto-ghosted + expected timeline | U, I | P1 | U6.9 (inbox events) | I9.10 (statistics) | **U6.1 AC edited** (GHOSTED status), **U6.8 AC edited** (suggestion + one tap) | covered |
| G17 Contacts on applications | U | P2 | — | **U6.10 added** | U11.1, T1.2 | covered (added) |
| G18 Company page basics | U | P2 | U11.1 partial | **U11.1 AC edited** (ATS, open roles, median reply) | M5.6, I9.10 | covered |
| G19 Interview extraction from mail | I, U | P1 | U6.9 (14.4 classification) | I9.9 | **U6.4 AC edited** (confirm proposed rows) | covered |
| G20 "How an ATS sees it" parse preview | R | P1 | — | **R3.6 added** | R2.3 (templates must pass), M5.3 shares the extractor | covered (added) |
| G21 One-tap tailor + cover letter + attach | E, R | P0 | E5.10 (resume fit / job fit in drawer), I3.1 (13.4 tailor on web) | E5.9 | R5.1, R5.3, R5.5 (benchmarks added) | covered |
| G22 Application packet | U, R | P2 | — | **U6.11 added** | R5.3, R5.5, E5.9 | covered (added) |
| G23 LinkedIn profile optimizer | I, U | P2 | — | **U13.5 added** (paste-only, pending **D19**) | I9.4 rewrite | covered (added); ai area rejected an in-page version |
| G24 Resume health nudge | R | P2 | — | R7.5 | — | covered |
| G25 DOCX, share link, translate | R | P2 | — | R7.3, R7.2, R5.4 | — | covered |
| G26 JD-driven question set | U, I | P1 | U9.1 partial | I9.11 | **U9.4 AC edited** | covered |
| G27 "Never help you cheat live" | T, M | P1 | — | T3.8 | M0.7 (copy placement), I9.2 | covered |
| G28 Expert resume review service | O/S | P2 | — | O9.1–O9.10 | A13 → superseded by O9.5/O9.6; S10.4 routing | covered |
| G29 No-dark-patterns billing + 2-tap cancel | B, M | P0 | B0.4 (renewal + no-refund copy), B0.1 (portal cancel) | B5.1 cancel, B5.2 undo, B4.2 reminders, B3.5 receipts | M2.2 money block; **U15.2 AC edited** (deps B5.1); B11.3 ← U15.3 | covered; reminder timing **D-note C11** |
| G30 Permissions explainer + manifest drift CI | T, E, M | P0 | E10.6 (scoped hosts exist), T6.1 partial | **T6.2** ← M4.5 | E10.3 (extension CI half), S1.5, M1.9, M10.2, T6.4 | covered |
| G31 Never trained / sold / shown to employers | T | P0 | T1.0, E6.6 consent | **T1.6** ← I1.8; T7.2 label; T1.5 subprocessors | **U14.2 AC edited**; I5.4, E10.4, M0.7 | covered; provider tier **D11** |
| G32 Public status page | P | P1 | P1.0 error digest only | **P1.2** ← S7.2; A10.5 ← S7.1 | S7.3, S7.4, P7.2 | covered; vendor vs self-built **D32** |
| G33 /help with ATS guides | S | P0 | M4.7 contact form | **S1.1** ← M4.1; S1.3 ← M4.2, M4.6; S1.4 ← M4.4; S1.6 ← M4.3, U14.4 | S4.1 drawer help, M5.2 SEO guides, M5.1 shared renderer | covered; owner confirmation **D67** |
| G34 Student / campus channel | M, B | P1 | — | **B7.2** ← M7.1; M7.3 ← S8.3; M7.4 | A2.5 → B7.1 | covered; price **D2** |
| G35 Social share cards | U, M | P1 | — | M6.5 | **U16.3 AC edited**; N1.6, O6.6, S3.8 | covered |
| G36 Honest-claims register as CI gate | M, A | P1 | M0.2/M0.3 partial | M0.1 + M0.4 | T7.4 (trust rows, deps M0.1) | covered |
| G37 Referral reward within the floor | U, B | P1 | — | B7.5 (grant + cap) ← M6.2; M6.1 codes/landing; U16.4 UI (deps B7.5, M6.1) | M6.3 fraud/admin | covered; reward **D3** |
| G38 Assistant-side distribution (MCP / ChatGPT) | I | P2 | — | — | — | **parked** by the ai area (needs stable U4/U6 read APIs + trust review); revisit after Launch 2 |
| G39 Duplicate-submission guard | O | P1 | — | **O10.11 added** | E11.2 | covered (added) |
| G40 Bench availability + aging | O | P1 | — | **O10.12 added** | O11.2 | covered (added) |
| G41 Work-authorisation status | O, T | P2 | — | **O10.13 added** (pending **D29**) | T3.9 rules | covered (added) |
| G42 Cohort readiness distribution | O | P2 | O8.4 partial | **O8.4 AC edited** (band histogram, k ≥ 5) | O7.3 | covered |
| G43 Org-curated practice sets | O | P2 | — | **O8.6 added** | U9.1, I9.11 | covered (added) |
| G44 Honest /organizations contrast line | O, M | P1 | O14.2 partial | **O14.2 AC edited** | M0.1 register ids | covered |

**Still uncovered: none.** One gap is deliberately **parked** (G38). Two are accepted only in a narrowed
form by the owning area (G1 LinkedIn Easy Apply fill; G5 LinkedIn badges). Three new stories wait on
a user decision before anyone starts them (U13.5 → D19, O10.13 → D29, and the G12 Free score in U4.7 →
D18); they are `not_started`, not `blocked`, so the generator counts them normally.

---

## 2. Cross-area duplicates resolved (owner ← superseded)

The eight cross-cutting areas were planned in parallel. Each pair below was one feature written twice
(or three times). The **owner** carries `supersedes: [...]`; the superseded story keeps its text (nothing
was deleted) and gains `relates: [owner]`; every other story's `deps`/`relates` that pointed at a
superseded id now points at the owner.

| Theme | Owner ← superseded | Note |
|---|---|---|
| Help centre `/help` | S1.1 ← M4.1 · S1.3 ← M4.2, M4.6 · S1.4 ← M4.4 · S1.6 ← M4.3, U14.4 | sup owns `/help` (its scope in HANDOFF §0.1 and `docs/design/sup/help-center.md`); mkt keeps the SEO content engine (M5.1 renderer shared, M5.2 applicant guides are a different artefact). U14.4's help panel folds into the S1.6 in-app sheet. |
| Fill-accuracy table | E1.6 ← M0.6, S1.5 | ext produces `fixture-report.json` and the `/help` table; S4.4 (live site-report status) relates, not duplicates. |
| Permissions explainer + drift check | T6.2 ← M4.5 | E10.3 keeps the extension-repo CI half (manifest ↔ PRIVACY.md ↔ AMO); S1.5 hosts the page; T6.4 generates the store listings from it. |
| Store-review prompt | E5.8 ← M10.5, S5.6 | lives in the extension; S4.3's "never after an undo" rule is folded into E5.8's AC. N6.6 is the future store-app policy. |
| Status page + incidents | P1.2 ← S7.2 · A10.5 ← S7.1 | plat sources status from **external** monitors (a monitor on the box cannot report the box dying); the admin incident model is A10.5; S7.3 banners and S7.4 subscriptions relate. See contradiction C7. |
| No-training AI tier | T1.6 ← I1.8 | trust strengthened "where available" to a requirement with a DPA. |
| Billing honesty / lifecycle | B11.3 ← U15.3 · B7.1 ← A2.5 · B5.3 ← A2.6 · B5.4 ← A2.7 · B10.1 ← A2.2 · (existing) B1.1 ← A3.1 · B1.2 ← A3.2 · B2.1 ← A3.3 · B1.6 ← A3.5 | pay owns the engine; admin keeps the Catalog page (A3.4 → relates B1.5) and comps UI (A2.4 → relates B1.7). U15.2 keeps the plan panel UI and now depends on B5.1 for the in-app cancel. |
| Student discount / campus | B7.2 ← M7.1 · M7.3 ← S8.3 | the discount is a catalog product (pay); ambassadors are a mkt programme (S8.3's office hours relate). |
| Referral | B7.5 ← M6.2 | split: B7.5 grant + budget cap + anti-farming, M6.1 codes/landing/attribution, M6.3 fraud rules + admin page, U16.4 in-app UI. |
| Autopilot ask-and-remember | E7.4 ← I9.12 | the AI-proposed draft for the unknown question comes through I3.5. |
| Changelog / what's new | S5.4 ← M9.3 | E0.3 keeps release-note generation from commit prefixes. |
| 👍/👎 on AI outputs | I3.7 ← S5.2 | S5.1 stays the shared `ThumbsFeedback` primitive + `feedback_event`. |
| Product analytics pipeline | U18.1 ← A11.2 · U18.3 ← M8.2 · M8.1 ← A11.6 | one event table, one rollup; A11.3 keeps the admin metric endpoint (relates U18.3); E8.1 and M1.6 emit into U18.1. |
| Notification preferences | U7.3 ← A7.7 | the engine (U7.1) enforces server-side; admin had re-specified it. |
| Security program | P4.1 ← T5.2 (headers/CSP) · P4.5 ← T5.3 (supply chain) · P4.6 ← T5.7 (secrets rotation) · T5.1 ← P4.7 (security.txt + disclosure policy) | plat implements, trust owns the policy page; P2.6 CI hardening relates P4.5. |
| Privacy ops | T1.4 ← A9.5 (retention) · T1.5 ← A9.7 (subprocessors) · T0.2 ← A9.6 (legal versions + acceptance) | A9.4 privacy-request queue stays admin-owned; T1.8 is its email intake. |
| Backups go-live | P0.1 ← A10.1 | A10.3 is the admin page that reads the Healthchecks evidence. |
| Services marketplace admin | O9.5 ← A13.1, A13.2 · O9.6 ← A13.3 | org area wrote `services-marketplace.md`; B9.3 relates for refunds/payouts. |
| Support tickets vs bug reports | S9.2 ← A8.2 | the ticket model (S2.1) absorbs `bug_report`; A8.4 inquiries stay. |
| Extension accessibility | E5.5 ← T4.5 | T4.2 remains the CI gate across surfaces. |
| "What we send" transparency | E10.4 ← T6.3 | per-fill line in the drawer folds into the options panel story. |

Split-ownership pairs that are **not** duplicates (left as `relates`): try-it page (M1.8 page / E12.4
drawer); G6 (I3.5 engine / E6.2 UI); G4 (E4.6 extension / N1.2–N1.3 phone / U6.1 schema); trust
statements (T3.8 statement / M0.7 copy); claims register (M0.1 register + lint / T7.4 trust rows, now
`deps: [M0.1]`); share cards (M6.5 renderer / U16.3, N1.6, O6.6, S3.8 placements); announcements (A5.4 /
S7.3 incident-scoped / E5.6 drawer); incident process (P7.2 severities + postmortem / T5.5 breach
notification); send-install-link (U2.7 / M1.7 pre-signup / N2.5 QR); test infra (U19.3 / A15.1 / O15.5 /
M11.1 / N8.1); a11y (T4.2 gate / U19.1, O15.3, A15.3, M11.2, S10.2 passes).

Dangling ids fixed: ten area-letter `relates` in `pay.json` ("M", "T", "E", "N") → M2.3, T0.2, E5.11,
M2.2, T0.1, M7.4, N7.1. `R` stories that depend on an epic id (e.g. `R6.2: deps R2, R3, R4`) are valid —
the generator resolves epic ids.

---

## 3. Contradictions between areas (consolidated, not resolved here)

| # | Topic | Who says what | Where it bites |
|---|---|---|---|
| C1 | **Margin floor vs Managed Payments / Stripe fees** | `CLAUDE.md` locks ≥ 80 % worst-case *and* Managed Payments (2026-09-21). PLAN-pay §7.1: with Stripe Billing's 0.7 % counted Pro $19.99 is 79.0–79.9 %; with Managed Payments on, every plan ≈ 76 %. PLAN-org found org AI Interview $9.99 at 79–81 % depending on invoice shape; O3.6 allocates fees per invoice. ROADMAP recorded the prices as passing. | B2.1, B2.2, B0.6, B6.1, O3.1, O3.6 — the guard will refuse to publish today's prices under the strict reading |
| C2 | **Student discount** | PLAN-mkt: 15 % ($16.99, passes) or 20 % ($15.99 + $2.50 AI budget). PLAN-pay / B7.2: a separate **Pro Student product at $11.99/mo · $29.99/3 mo, $1.50 budget, 10 resumes**, academic-email verification, 12-month expiry. Gap doc floated "free Pro months via school email" — pay rejected *free* (a free month costs ≈ $3 of AI with no revenue). M7.3 nevertheless grants **free Pro-while-active to campus ambassadors**. | B7.2, M7.1 (superseded), M7.3, M7.4, S8.3 |
| C3 | **Referral reward** | U16.4: one month of Pro for both after the invitee's 7th active day. B7.5: 30 days both sides, monthly marketing budget cap, **3 credits/user/year**. PLAN-mkt: cap **12/year**, or the cheaper variant (+$3 AI budget for paying referrers). PLAN-user asks whether it fits the 80 % floor at all. | B7.5, U16.4, M6.1–M6.4 |
| C4 | **Push caps on phones** | U7.1 engine: per-user daily caps (engine default). N4.5: **≤ 3 pushes/day per phone device**, digest for the rest, device-tz quiet hours. PLAN-mob asks whether to match the engine's cap everywhere. | U7.1, U7.4, N4.5 |
| C5 | **Publishing per-ATS fill accuracy** | E1.6 publishes fixture-measured % with date + fixture count (fields filled on captured fixtures). S4.4 publishes a *live* per-ATS status from site-report rate + the kill switch. M0.6 wanted the table register-driven. Three different "accuracy" numbers could appear; and the gap doc (§G.4), PLAN-ext Q1 and PLAN-mkt Q5 all ask whether to publish at all, including bad numbers, and whether the store listing may cite them. | E1.6, S4.4, M0.4 claims-lint, M10.2 |
| C6 | **AI provider tier and the consent copy** | T1.6: Gemini paid API or Vertex (no-training + DPA) as a requirement. I plan: add an **Anthropic** provider (I1.2) and route tailor/cover/interview to Sonnet 5.5; asks SDK vs raw HTTP (CLAUDE.md: no new deps without asking). E6.1's consent sheet "names the provider (Google Gemini)"; the Options copy says the free tier may train (I1.8/T1.6 correct whichever is true). Extension BYO is Anthropic-only today (I6.1). | T1.6, I1.2, I1.3, I1.8, E6.1, M0.7, U14.2, A9.7/T1.5 |
| C7 | **Status page hosting** | P1.2: vendor-hosted `status.kiwiply.com` driven by external monitors. S7.2: self-built `/status` with `GET /api/status`, ISR snapshot, RSS/JSON feed, 90-day bars — "works when the API is down" (only true if hosted off-box). Resolved in §2 in favour of P1.2; the user should confirm (D32) because it is a ~$12/mo vendor decision. | P1.1, P1.2, S7.2–S7.4, A10.5 |
| C8 | **16+ vs 18+** | T2.1 / T1.0 / O6.7 / S8.1: 16+ with a neutral age screen and minor defaults (T2.4); PLAN-org Q2: hard 16+ for school/bootcamp orgs. PLAN-trust Q4 raises moving to **18+** like Simplify/Huntr. | T2.1, T2.3, T2.4, O6.7, O14.5, S8.1 |
| C9 | **Deletion window** | Current policy and B0.3: immediate, cannot be undone. T1.3 proposes **24 h deactivate-then-purge** with an emailed cancel link. | T1.3, A1.1, B0.3, U14.6 |
| C10 | **GA4 in the extension** | E8.6 (decided in ext): retire GA4 MP and drop the google-analytics.com host. T6.1 still frames it as a decision (drop vs opt-in with a first-run prompt). M8.4 keeps GA4 on the web with Consent Mode v2. | E8.6, T6.1, M8.4, T6.2 (host list) |
| C11 | **Renewal reminder timing** | G29 / U15.3: 3 days before. B4.2: **7 days before quarterly, 3 before monthly**. | B4.2 (owner), U15.3 (superseded) |
| C12 | **Autopilot on /pricing** | M2.1 (done) routes Autopilot to "Contact us"; B1.5 says Autopilot is **buyable from the catalog**. ROADMAP lists Autopilot as a self-serve tier. | B1.5, M2.3, M2.6 |
| C13 | **Org AI Interview price** | O3.1 seeds $9.99; PLAN-pay Q3: raise to $10.99 or cut the budget to $1.25; both designers prefer not to override the guard. | O3.1, B2.2 |
| C14 | **Catalog engine ownership (Phase 18)** | PLAN-org Q6 assumed admin (A3.1–A3.5); `pay.json` supersedes those with B1.1/B1.2/B2.1/B1.6 and leaves admin the Catalog page (A3.4). | B1.x, A3.4, O3.1 |
| C15 | **Free server AI** | `CLAUDE.md`: Free has no server AI except resume parsing. PLAN-sup Q1 proposes a second exception (3 grounded help answers/day); I0.7 reserves a 10 % PARSE slice; A plan asks whether a platform-cap breach pauses everyone or only paid features. | S6.2, I0.7, A4.3 |
| C16 | **Regional pricing** | B7.3 records "no PPP" (currency display only); B7.4 proposes Pro Lite bands ($8.99 / $9.99 / $12.99) after Launch 2. | B7.3, B7.4 |
| C17 | **Pause vs cancel-anytime** | Locked model is cancel-anytime-keep-period; B5.5 proposes a 2-month pause. | B5.5 |
| C18 | **Native shell timing** | N0.1: PWA-first, native gated on six metrics at +60 days; PLAN-mob Q1 offers App Store at Launch 2 regardless (then N6 → P1 and N7.3 first). | N6.x, N7.x, N3.4 |
| C19 | **Extension permission growth** | N2.4 wants the optional `notifications` permission; E7.6 adds `tabs` for Autopilot; both change the G30 explainer and the store listing (T6.2/T6.4) and each needs its own store release. | N2.4, E7.6, T6.2, T6.4, E0.4 |
| C20 | **AI-on-by-default for Pro vs per-feature switches** | E6.1: one-time consent sheet turns Kiwiply AI on for Pro; I5.4 / U14.2: per-feature switches in Settings. Compatible only if the sheet is the *initial* consent and the switches remain authoritative afterwards; E plan also asks whether Autopilot users may skip the sheet. | E6.1, I5.4, U14.2 |
| C21 | **Help renderer** | S1.1 (Markdown renderer for `/help`) and M5.1 (content pipeline for marketing) each specify a renderer; now `relates` — one renderer, two content roots. | S1.1, M5.1 |

---

## 4. Decisions the user must make (deduplicated from every PLAN's open questions + COMPETITIVE-GAPS §G)

Each line: **recommended default** · stories it blocks. Grouped by theme; the ten with the largest blast
radius are marked ★.

### A. Pricing & billing
- **D1 ★ Margin floor vs Stripe fees / Managed Payments (C1).** Default: (b) measure the floor *before*
  the 3.5 % Managed-Payments fee (treat it as tax/dispute handling, not a payment fee) so both locked
  decisions stand and Launch-1 prices pass as ROADMAP recorded; B2.1 shows both readings; revisit with the
  realised report B2.4 at Launch 2. Stricter alternative (a): Managed Payments off until Launch 2.
  Blocks B2.2, B0.6, B6.1, O3.6, O3.1 publish.
- **D2 ★ Student plan (C2).** Default: B7.2 — Pro Student product $11.99/mo · $29.99/3 mo, $1.50 AI
  budget, 10 resumes, academic-email verification, 12-month expiry; no free months; ambassadors (M7.3)
  get Pro-while-active capped at 20 seats and counted in the marketing budget. Blocks B7.2, M7.3, M7.4,
  S8.3, M1.10.
- **D3 ★ Referral reward (C3).** Default: B7.5 — 30 days of Pro both sides after the invitee's 7th active
  day, monthly marketing budget cap, 3 credits/user/year, anti-farming. Blocks B7.5, U16.4, M6.1–M6.4.
- **D4 Org AI Interview price (C13).** Default: $10.99 with the $1.50 budget (no guard override).
  Blocks O3.1, B2.2.
- **D5 Launch-2 price rise for existing subscribers.** Default: grandfather at $19.99/$49.99 (catalog
  default, zero churn risk). Blocks B4.2 price-change notice path.
- **D6 Regional pricing (C16).** Default: USD + Adaptive-Pricing currency display (B7.3) now; decide
  Pro Lite bands after B2.4 data. Blocks B7.4.
- **D7 Pause subscription (C17).** Default: no — cancel/resume only. Blocks B5.5.
- **D8 Autopilot self-serve on /pricing (C12).** Default: buyable from the catalog (B1.5). Blocks B1.5,
  M2.3, M2.6.
- **D9 Catalog engine ownership (C14).** Default: pay (B1.1–B1.7, B2.x) owns Phase 18; admin owns the
  Catalog page (A3.4) and comps UI (A2.4); org seeds rows (O3.1) + guard rules (O3.6). Blocks B1.1.
- **D10 Affiliate payouts.** Default: manual quarterly transfers recorded in the ledger, no payout rail
  until volume justifies Stripe Connect. Blocks M7.6.

### B. AI
- **D11 ★ Production provider tier (C6).** Default: Gemini **paid API** tier with the DPA (not Vertex);
  confirm whether the live key is already paid; T1.6/I1.8 then correct the consent + Options copy;
  consent sheet (E6.1) names every provider in the routing table. Blocks T1.6, E6.1, M0.7, U14.2, T1.5.
- **D12 Anthropic as a second provider.** Default: raw `java.net.http` (no new dependency), Sonnet 5.5
  for tailor / cover / interview below 50 % of the budget, economy tier above. Blocks I1.2, I1.3, I9.x.
- **D13 Caps.** Default: accept the per-feature daily caps (assistant 40, tailor 30, fit 60, interview 3,
  draft 80) and platform caps $40/day · $600/month; a platform-cap breach pauses **paid** server AI only
  and keeps the 10 % PARSE slice for Free onboarding. Blocks I0.6, I0.7, A4.3.
- **D14 Free server-AI exceptions (C15).** Default: keep the single exception (resume parsing);
  `help.ai.free_daily_cap = 0`, Free gets answer cards. Blocks S6.2 config.
- **D15 AI on by default for Pro (C20).** Default: yes, one consent sheet in the drawer as the initial
  consent, per-feature switches stay authoritative, Autopilot users may **not** skip it. Blocks E6.1.
- **D16 Publish eval numbers on /ai.** Default: yes ("98 % passed every truth check", dated). Blocks I5.4.
- **D17 Embedding vendor.** Default: Gemini embeddings (same key) with Voyage configured as fallback.
  Blocks I4.1.
- **D18 ★ Free explainable match score on every card (G12).** Default: yes — rules-only 0–100 + three
  reasons on Free, AI score layered on Pro. Blocks U4.7 (Free AC), I4.3, I5.3.
- **D19 LinkedIn optimizer (G23).** Default: paste-only checklist, P2; never read the LinkedIn DOM.
  Blocks U13.5.
- **D20 Autopilot ask-and-remember (G8).** Default: in Phase 19 scope; answers learned in a run go into
  the field cache like any learned answer and show in U13.4. Blocks E7.4, E7.5.

### C. Trust & legal
- **D21 ★ Minimum age (C8).** Default: stay **16+** with the neutral screen + minor defaults; hard 16+
  for school/bootcamp orgs. Blocks T2.1, T2.3, T2.4, O6.7, O14.5, S8.1.
- **D22 ★ Deletion window (C9).** Default: 24 h deactivate-then-purge with an emailed cancel link, then
  the deletion receipt. Blocks T1.3, A1.1 copy, U14.6 copy.
- **D23 ★ GA4 in the extension (C10).** Default: drop it (E8.6) under the 2026 CWS Limited-Use rule;
  first-party, unlinked, opt-out events only. Blocks T6.1, E8.6, T6.2.
- **D24 ★ Publish per-ATS fill accuracy (C5).** Default: publish E1.6's fixture-measured numbers with
  date + fixture count, bad ones included; the store listing may cite them; S4.4's live status is a
  separate "working today?" indicator, never called "accuracy". Blocks E1.6, S4.4, M10.2.
- **D25 Pen test.** Default: boutique engagement after A0.2 + U1.1, before Launch 1. Blocks T5.6.
- **D26 SOC 2.** Default: readiness only (no Type I in year one). Blocks T5.8.
- **D27 Subprocessor page before DPAs are signed.** Default: publish with a "DPA pending" column.
  Blocks T1.5.
- **D28 Privacy requests by email.** Default: the owner verifies identity with the T1.8 script; publish
  30 days (GDPR) / 45 days (CCPA). Blocks T1.8, A9.4.
- **D29 Work-authorisation field (G41).** Default: self-declared categories only, consultant-owned,
  FULL-scope, P2 after T3.9. Blocks O10.13.
- **D30 Comparison pages.** Default: yes — quote published prices/policies with source URLs and a
  checked date. Blocks M5.8.

### D. Platform & ops
- **D31 ★ Monitoring vendor + public status page (C7).** Default: UptimeRobot Solo (~$12/mo) + vendor
  status page on `status.kiwiply.com`, Healthchecks Supporter ($5/mo), ntfy.sh push — ≈ $17/mo;
  S7.2's self-built page stays superseded. Blocks P1.1, P1.2, P1.3.
- **D32 S3 Object Lock on the backup bucket.** Default: on (governance, 30 days). Blocks P0.6.
- **D33 Cloudflare orange-cloud.** Default: stay grey until the own server. Blocks P4.8.
- **D34 Own server.** Default: Hetzner (~$30/mo + encrypted volume), rehearsed on staging, before
  Phase 21. Blocks P6.3.
- **D35 Pre-2026-09 S3 orphans.** Default: delete 90 days after the first P5.5 sweep. Blocks P5.5.
- **D36 Code scanning.** Default: Semgrep OSS (free), CodeQL only if the repo goes public. Blocks P4.5.

### E. Extension
- **D37 Throwaway ATS accounts for captures** (iCIMS, Taleo, Oracle, second Workday tenant) on the
  synthetic persona. Default: yes; credentials in the password manager. Blocks E1.3, E2.1, E2.3, E2.10.
- **D38 Board badges scope.** Default: no LinkedIn host, no new `www.indeed.com` host. Blocks E5.7.
- **D39 Safari go/no-go spike.** Default: after Launch 2. Blocks E9.5, N3.4.
- **D40 Optional `notifications` permission (C19).** Default: yes, in its own store release with the
  explainer updated. Blocks N2.4, T6.4.

### F. Mobile
- **D41 Native shell (C18).** Default: metric gate at +60 days; no App Store at Launch 2. Blocks N6.x, N7.2.
- **D42 Resolver walled-host list** (LinkedIn, Indeed, Glassdoor, ZipRecruiter never fetched; Workday
  posting pages one cookieless GET for JSON-LD/OG). Default: as designed. Blocks N1.2.
- **D43 Firefox for Android experiment.** Default: fund one session. Blocks N3.2.
- **D44 Phone push cap (C4).** Default: ≤ 3/day per phone device, engine cap elsewhere. Blocks N4.5.
- **D45 US link-out from a future shell.** Default: status-only worldwide until the shell exists.
  Blocks N7.2.

### G. Growth & marketing
- **D46 One landing: `/` vs `/v3`.** Default: `/v3` (the board design), `/` 301s. Blocks M1.2.
- **D47 Placeholder testimonials, demo seed name (Jordan Lee vs Priya Sharma).** Default: remove
  testimonials until M0.8 consent exists; Priya Sharma. Blocks M0.2, O1.8.

### H. Support & community
- **D48 Inbound email → ticket.** Default: later, behind the flag. Blocks S2.8.
- **D49 SLA targets.** Default: Pro/Autopilot 1 business day, Free 2, site/scam reports 1. Blocks S10.1.
- **D50 Discord before Launch 1.** Default: wait for ≥ 1 000 weekly actives. Blocks S8.1–S8.4.
- **D51 `support@` identity.** Default: keep as the human fallback, route into tickets later. Blocks S1.7.
- **D52 Spanish pilot.** Default: safety hub + top-10 articles after U19.4's i18n decision. Blocks S10.3.
- **D53 Help centre owner (C-§2).** Default: sup (S1.x) owns `/help`; mkt owns SEO content. Blocks S1.1.

### I. Organizations
- **D54 FULL grants to a non-marketer coach in schools.** Default: no until Phase 22. Blocks nothing now.
- **D55 Ops add-on 23.0 points** ($99 + $4/active consultant, 7-year retention, pay visibility off,
  invoices never emailed by us). Default: as written. Blocks O11.1.
- **D56 Rename "Consultancy plan" → "Organizations".** Default: yes with O14.2. Blocks O14.2, M2.5.
- **D57 Shared jobs for schools in Phase 21.** Default: P1 in 21.3. Blocks O8.2.

### J. Admin & security
- **D58 Staff TOTP mandatory + separate break-glass login.** Default: yes / yes. Blocks A0.4, A0.5.
- **D59 Transactional email tracking.** Default: off; on only for Brevo campaigns. Blocks A7.2.
- **D60 Country / UTM at signup.** Default: capture (first-touch attribution, M8.1). Blocks M8.1, A11.6.

### K. User product
- **D61 Licensed aggregator.** Default: Adzuna (free tier + attribution) after the terms check. Blocks
  U4.4, A6.6.
- **D62 API dependencies** `webauthn-server-core` (Yubico) + `web-push`. Default: yes. Blocks U1.2, U7.4.
- **D63 Free alert cap.** Default: 2 alerts + push + weekly digest. Blocks U7.2.
- **D64 Apple sign-in timing; drop LinkedIn.** Default: Apple after launch; LinkedIn removed now.
  Blocks U1.8, U1.3.
- **D65 Lock-screen push text.** Default: generic text with opt-in for specifics (minors always
  generic). Blocks U7.4, N4.3.

---

## 5. Whole-product build order — the first 25 stories

Rule: P0 trust / ops / billing correctness first (things a regulator, a card network, a store reviewer or
a lost database would punish), then the competitive differentiators the audience tests in week one.
Every story's `deps` are `done` or appear earlier in this list (verified by script). Sizes are the
stories' own.

| # | Story | Area | Size | Why now |
|---|---|---|---|---|
| 1 | P0.1 Backups go-live (15.1c): bucket, IAM, Healthchecks, cron, first dump + drill | plat | M | Backups have never run on the box; prod data was already lost once (2026-09-17). Scripts exist (P0.0). |
| 2 | P1.1 External uptime monitors on web, API, readiness, TLS, DNS | plat | S | Nobody is told when the site is down today; feeds the status page later. |
| 3 | P6.1 Resource limits on every container | plat | S | Kiwiply shares the box with BeeCompete; a runaway container takes both down. |
| 4 | B2.1 MarginCalculator + FeeSchedule (per-invoice allocation) | pay | M | The margin-floor fee check behind D1; nothing with a price should publish before it exists. |
| 5 | B0.6 Live-keys launch gate (boot-time billing self-check) | pay | S | Catches a wrong webhook secret, tax mode or dead price id before the first real charge. |
| 6 | A0.2 Close the three admin auth gaps (Google bypass, stale roles on refresh, rate limiting) | admin | M | A revoked admin survives up to 90 days today; Google sign-in bypasses MFA. |
| 7 | P4.1 Security headers + nonce CSP (report-only → enforce) | plat | M | Table-stakes hardening (T5.2 folded in); cheapest pen-test findings to pre-empt. |
| 8 | P4.2 Actuator diet (`/management/info` leaks git/env) | plat | S | A known information leak in production. |
| 9 | T1.1 Data map as code (DataClass enum, never-collected deny-list, SensitivePatterns, RoPA) | trust | M | Prerequisite for every deletion/export/retention claim and the no-PII rule (§0.5); proves what we store and what we refuse. |
| 10 | E10.7 Never-collected field classes in the engine (never learned / cached / synced / filled from memory / sent) | ext | M | The user rule applied where it bites first: the field cache and profile-learn already run on every fill today. No deps. |
| 11 | T1.3 Deletion completeness (enumerated erasure, downstream purge, receipt) | trust | M | GDPR deletion gaps are real (`ai_quota_override` survives deletion, tickets/billing records unhandled). |
| 12 | T6.1 CWS 2026 Limited-Use conformance + GA4-in-extension decision | trust | M | Store policy risk on a listing that is already under review. |
| 13 | U18.1 Event pipeline (schema, `POST /api/events`, client lib) | user | M | One event table for web, extension and marketing; everything measured later depends on it (owner of A11.2). |
| 14 | E8.1 `TrackingProvider.track()` + first five extension events | ext | M | Replaces GA4 with first-party, count-only events through the seam. |
| 15 | E8.6 Retire GA4 Measurement Protocol; drop the google-analytics.com host | ext | S | Shrinks the permission list before the permissions explainer is published. |
| 16 | P2.1 SHA-pinned deploys + rollback | plat | M | A bad merge to `main` is a production deploy; rollback is a runbook today. |
| 17 | T1.6 AI provider on a no-training tier with a DPA + copy fix | trust | M | The "never trained on" promise (G31) must be true before it is said anywhere (D11). |
| 18 | B5.1 In-app one-tap cancel (no retention gate, cancellation number, confirmation email) | pay | M | G29: the single biggest one-star theme in the category; pure differentiator at low cost. |
| 19 | E1.1 Fixture scrubber + runner with the six captured ATS pages | ext | M | G2 harness; every adapter story after this ships with a fixture. |
| 20 | E1.6 Published fill-accuracy report → `/help` table | ext | S | G2 public numbers (D24); turns Simplify's Workday weakness into our proof. |
| 21 | E2.2 SmartRecruiters adapter + live shadow-DOM verification | ext | M | First new adapter (G1) on a host already in the manifest; no store re-review (deps E1.1 only). |
| 22 | U6.1 Tracker schema v2 (events, notes, interviews, GHOSTED, resume_id + JD snapshot) | user | M | Foundation for G4, G16, G19, G22 and the whole U6/U10/U12 chain. |
| 23 | E4.6 JD snapshot v2 + resume link on every save/fill | ext | S | G4 parity with Teal/Simplify/Huntr; the data R5.1/E5.9 tailoring reads. |
| 24 | T6.2 Permissions explainer + one source of truth + CI drift check | trust | S | G30: publish the scoped-permissions advantage over Simplify's `<all_urls>`. |
| 25 | S1.1 `/help` shell, Markdown renderer, six seed articles | sup | M | G33: `/help` is missing; hosts the accuracy table, permissions page and ATS guides. |

Immediately after these (next 10, in order): E1.2 capture-fixture action (unlocks E1.3 and the
account-gated adapters) · E3.4 post-fill report (G3) · I0.4 + I2.1 + I3.3 → I3.5
grounded drafting with E6.2 (G6) · N1.2 + N1.1 share target (G14) · U4.1 + U4.2 posting store + search
(unlocks G12, G13, G15) · S3.1 + S3.5 scam rules on cards (G15) · B1.1 + B1.2 catalog + entitlements
(Phase 18) · M0.1 + M2.2 honest-claims register + the money block · R0.1 → R0.7 Resume Builder walking
skeleton · U13.4 My Answers bank (G7) · E5.9 one-tap tailor (G21, after R5.1/R5.3).

---

## 6. Validation

```
node check-ids.mjs <root>      # every JSON parses; deps/relates/supersedes resolve to a story, epic or G-tag
files=12 parseErrors=0 stories=885 epics=144 refs=1895 dangling=0

node docs/roadmap/build-master-roadmap.mjs --list   # still runs (output in the commit message / handback)
```

The check script treats `G1`–`G44` in `relates` as benchmark tags (the cross-cutting designers used them
that way) and epic ids as valid dependency targets (the generator resolves them). Before this pass the
same check reported 10 dangling ids (all area-letter `relates` in `pay.json`).

Files touched by this pass: the eleven area JSONs, `docs/resume-builder/stories.json`,
`docs/RESUME-BUILDER-STORIES.md`, and this file. `build-master-roadmap.mjs` and `master-roadmap.html` were
left alone on purpose — the coordinator regenerates the page after the generator update lands.

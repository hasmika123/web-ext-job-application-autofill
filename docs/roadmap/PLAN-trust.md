# PLAN — area `trust` (Trust, legal & compliance)

Written 2026-10-11. Machine-readable twin: `docs/roadmap/areas/trust.json` (9 epics, 56 stories:
1 done · 14 partial · 3 blocked on counsel · 38 not started). Audit with the competitive benchmark:
`docs/roadmap/AUDIT-trust.md`. Deep designs: `docs/design/trust/*.md` (8). Cross-cutting: stories
cite the user/org/admin/resume stories they build on via `relates`; nothing here edits those files.
This plan is not legal advice; the lawyer-review register is `docs/design/trust/legal-review-register.md` §5.

## 1. The shape of the problem

A job seeker who installs Kiwiply hands over the most complete picture of themselves that exists
anywhere: resume, salary expectations, work authorization, EEO answers, every job applied to, and —
on Pro — their recruiter mail. Our audience (Gen Z and Gen Alpha first) has watched LinkedIn opt
people into AI training by default, seen auto-apply tools get accounts banned, and reads the
permissions tab before installing. They do not want a policy; they want to *see* what happens. The
locked decisions already give Kiwiply a stronger position than any product in the benchmark: no
auto-submit, no ads, no scraping, count-only telemetry, EEO answers that never leave the user's own
form, an inbox that is read-only on a dedicated account, an org model where the member owns the
sharing switch. The gap is that almost all of it is **true by construction and invisible**: nothing
records that the user accepted the terms, nothing tests that EEO never reaches the AI, the AI
provider is on a free tier whose terms let Google "improve its services" with our users' resumes,
the web sends no security headers, there is no way for a researcher to report a bug safely, no age
screen stands behind the 16+ rule, and the Chrome Web Store tightened Limited Use two months ago
with our GA4 host permission still in the manifest.

So the plan does three things: **turn promises into tests** (data map, erasure completeness,
sensitive-field firewall, attestation guard, manifest/policy sync — a `compliance` CI job), **fix the
handful of things that are actually behind the competition** (no-training AI tier with a DPA, GPC,
named subprocessors, acceptance records, headers, security.txt, age screen, CWS Limited Use), and
**show the user the evidence** (nutrition label where the resume is uploaded, a per-fill "what left
this page" panel, a personal "who looked at my data" ledger, a trust centre with dates). The
lawyer review (PL.1) stays a gate, and the register makes it a scoped engagement.

## 2. Epics

| Epic | Pri | What | Why it matters for the audience | Main risk |
|---|---|---|---|---|
| **T0 Legal foundation & lawyer review** | P0 | Versioned policies + changelog, acceptance recorded on four surfaces, material-change prompts, the register (L1–L15) | "What changed" in three bullets is the only policy they read; no "continuing = accepting" | Counsel availability; T0.5/T2.5/T3.5 blocked until then |
| **T1 Privacy operations** | P0 | Data map as code, async complete export, enumerated erasure + 24 h undo, retention catalogue, subprocessors + DPAs, **no-training AI tier**, GPC | Leaving cleanly is the test they run; "Google may use what we send" is the sentence that loses them | Gemini tier change touches AI cost (bounded by `AiPolicy`); the 24 h window is a product decision |
| **T2 Minors & age assurance** | P0 | Neutral 16+ screen storing no DOB, under-age handling, school/bootcamp assertions, high-privacy defaults for 16–17 | A parent-/school-facing story nobody in the market has; the org model sells to schools | Jurisdiction questions (L5); age screen adds one step to signup |
| **T3 AI-in-hiring law & transparency** | P0 | AI feature register as code, disclosure + "why" on every output, sensitive-field firewall test, attestation guard, provenance, counsel memo, fairness check (P2), integrity statement (G27), immigration-data rules (G41) | AI they can interrogate; the "never cheat live" line separates us from the toxic end of the category | Annex III classification for matching is a lawyer's call; build transparency regardless |
| **T4 Accessibility program** | P0 | One CI gate for every surface, ui contract, manual SR audits, extension drawer, statement, ACR | Accessibility is an audience expectation and a procurement document for schools | Baseline debt on day one — enforce after a report-only week |
| **T5 Security program** | P0 | security.txt + VDP, headers/CSP, scanning, /security, IR runbook, pen test, rotation, SOC 2 readiness, extension hardening | The first questions a researcher, a buyer or a journalist asks | Pen test waits on A0.2/U1.1; CSP can break Google/Stripe (report-only first) |
| **T6 Store data-use compliance** | P1 | 2026 Limited-Use review (drop GA4), one source of truth with drift check, permissions explainer (G30), per-fill panel, three stores from one text | They read the permissions tab; the panel is the feature no one else has | GA4 decision is the user's; a store rejection is the cost of waiting |
| **T7 Trust centre & transparency** | P1 | /trust hub, nutrition label (G31), access ledger, claims register, transparency report | Trust as evidence, not adjectives | Ledger value grows as A12.3/A1.5/O6 land; ship with AI calls + exports first |
| **T8 Regulatory watch & checks** | P1 | Quarterly watch log, `compliance` CI job | Deadlines met before they are news | None — small |

## 3. Recommended build order (first 10)

The skeleton proves one sentence end to end: **what we say about your data is tested, signed,
and visible to you.**

| # | Story | Why first |
|---|---|---|
| 1 | **T1.1** Data map as code + `DataMapTest` | Every export, erasure, retention and label story reads it; finds unclaimed tables on day one |
| 2 | **T1.3** Deletion completeness (+ T1.9 backups/logs wording) | Closes known gaps (`ai_quota_override`, Brevo, S3 versions); the receipt is the trust moment |
| 3 | **T5.2** Security headers / CSP (report-only → enforce) and **T5.1** security.txt + VDP | One session each; the first thing a pen test or questionnaire asks |
| 4 | **T6.1** CWS Limited-Use review + GA4 decision (user) + first-run card, then **T6.2** sync check + permissions page (G30) | Enforcement is already live (2026-08-01); the version bump ships both |
| 5 | **T1.6** AI provider on a no-training tier + DPA (user decides the tier) | The single biggest trust gap vs Simplify/Teal; unblocks "never train" as a claim (G31) |
| 6 | **T3.3** Sensitive-field firewall test + **T3.4** attestation guard | Turns the two most-quoted promises into failing tests before anything refactors them |
| 7 | **T0.2** Acceptance recording (signup, connect, org join) → **T0.3** versioned content + changelog | Evidence under the billing/AI terms; the changelog page is the readable policy |
| 8 | **T2.1** Age screen (no DOB) → **T2.4** minor defaults map | One step at signup; the defaults ride on U18.4/U16 switches as they land |
| 9 | **T3.1** AI feature register + doc-sync → **T3.2** AiDisclosure + "why" | The register feeds the policy block, the options copy and the per-output label |
| 10 | **T7.2** Nutrition label → **T1.5** subprocessors + DPAs → **T7.1** /trust hub | Show it where the resume is uploaded; name the providers; put the dates on one page |

Then in parallel lanes (strict file ownership, one Sonnet agent each):
- **Lane A (API/privacy):** T1.2 export v2, T1.4 retention job, T1.7 GPC mirror, T1.8 email requests, T3.7 provenance, T7.3 access ledger.
- **Lane B (web/legal):** T0.4 material-change prompt, T0.6 org/services kinds, T4.1 statement, T5.4 /security, T7.4 claims register, T3.8 integrity statement, T8.1 watch log.
- **Lane C (CI/platform):** T4.2 a11y gate, T4.3 ui contract, T5.3 scanning, T5.7 rotation calendar, T8.2 compliance job, T5.5 IR runbook + tabletop.
- **Lane D (extension):** T6.3 per-fill panel, T6.4 listing generation, T4.5 drawer a11y, T5.9 hardening.
- **After counsel:** T0.5, T2.5, T3.5; **after A0.2/U1.1:** T5.6 pen test; **P2:** T3.6 fairness, T5.8 SOC 2, T7.5 report, T4.6 ACR (before the org launch).

Launch-critical (P0) before Launch 1: T0.1–T0.3, T1.1, T1.3, T1.5–T1.7, T2.1, T3.1, T3.3, T3.4,
T4.2, T5.1–T5.3, T6.1–T6.2, T7.2. Before the org launch: T0.6, T2.3, T4.6, T5.6, T7.3.

## 4. Experience principles for Gen Z/Alpha/millennials (honest privacy)

**Show, don't assure.** The label sits under the upload button; the drawer shows what left the page;
Settings shows who looked. **Defaults are the policy.** For 16–17-year-olds the privacy-friendly
setting is simply the setting, and every switch explains itself. **Receipts for everything** — a
deletion receipt, a version and date next to "you agree", a call id on every AI answer. **No dark
patterns in consent**: equal buttons, GPC honoured silently, no "by continuing", a material change
gets a sheet with three bullets and an honest exit ("Export my data and leave"). **Say what we won't
do, in their words**: we never apply for you, we never sell or train on your data, we never help you
cheat live, we don't ask for `<all_urls>`. **Plain language survives the lawyer** — the register asks
counsel to confirm wording, not to replace it. **Mobile first**: every trust surface is drawn at
390 px, and the extension's disclosure lives in the 400 px drawer, not only in a store tab.

## 5. How we beat the competition

1. **Provider no-training by default for everyone** (T1.6) — Yoodli sells training exclusion as a
   paid feature; Simplify states it for providers; Teal trains its own models on career content. We
   make it the default on Free and prove it with a boot-time assertion and a claims-register test.
2. **The per-fill "what left this page" panel** (T6.3) and the **personal access ledger** (T7.3) —
   no competitor shows outbound data per page or who looked at your data. Both are generated from the
   real envelopes/logs, so they cannot drift from the truth.
3. **Scoped permissions as a published feature** (T6.2, G30) — Simplify's `<all_urls>` + `cookies` +
   `webRequest` earns "very high risk" ratings; our 15 ATS hosts + `activeTab` with a CI drift check
   is the contrast, on `/help/permissions` and in the listing.
4. **A minors posture** (T2) — 18+ by policy with no check (Simplify, Huntr) or no age at all (Teal)
   is the norm; a neutral screen that stores no birth date plus high-privacy defaults is a story we
   can tell parents and schools.
5. **Promises as tests** (T1.3, T3.3, T3.4, T7.4, T8.2) — the policy is in CI. When a competitor says
   "we never…", it is copy; when we say it, a job fails if it stops being true.
6. **"We never apply for you, and we never help you cheat live"** (locked + T3.8) — the two reputational
   sinkholes of the category (auto-apply's 2★ Trustpilot, Final Round's toxicity), stated as product.

## 6. Competitive-gap rows tagged T (from `COMPETITIVE-GAPS.md`, commit 0843de1)

| Gap | Decision | Where |
|---|---|---|
| **G27** "never help you cheat live" statement | **Accepted** | T3.8 (copy on Interview Prep, pricing, /trust; claims-register entry; manifest check for no capture permissions) |
| **G30** permissions explainer + CI drift check | **Accepted** | T6.2 (page from `PRIVACY.md` front-matter; `check-data-use.mjs`), T6.1 (inventory + GA4 decision) |
| **G31** never trained / sold / shown to employers — stated and enforced | **Accepted, strengthened** | T1.6 (provider no-training tier + DPA, not "where available"), T7.2 (label at upload), T1.5 (named providers), T7.4 (evidence), T3 D9 (no employer-side sale) |
| **G41** work-authorisation status on consultant profiles (T review) | **Accepted as rules, not a field build** | T3.9 defines the constraints (categories only, no document numbers, person-owned, FULL-only, reminders to the person); the field itself stays with the org area (O10) and P2 |

Rejected: none of the T-tagged rows. Not adopted here but referenced: G29 (billing honesty — `pay`
area; our T0.2 acceptance record is its evidence), G32 (status page — `plat`; /trust links to it),
G36 (honest-claims lint — `mkt`; our T7.4 register is its trust-claims source).

## 7. Dependencies on other areas

- **A (admin):** A9.4 privacy queue, A9.5 retention table, A9.6 legal versions, A9.7 subprocessors
  (this area supplies the content, tests and user side); A0.2 + A12.3 before the pen test and for
  the ledger's reasons; A1.5 support sessions feed the ledger; A5.4/A5.5 banners and remote config
  gate practice changes; A10.1/A10.5 feed /trust and the breach runbook.
- **U (user):** U14.2 renders the label and the privacy panel; U18.4 analytics opt-out; U1.5 step-up
  guards export/delete; U19.3 test infra for Playwright a11y; U20.4 event envelope for the per-fill panel.
- **O (org):** O6.* consent model and audits (ledger, org DPA), O2.1/O2.5 age assertion hooks,
  O14.5/O9.10 terms kinds, O10 for G41's field.
- **R (resume):** R0.6 sidecar for tagged PDFs and the ACR; R1.4 onboarding review is where the
  label shows before upload.
- **ext / mkt / plat / ai / pay (cross-cutting, not yet planned):** GA4 removal + event envelope
  (ext), honest-claims lint (mkt), status page + log retention + backups (plat), the AI tier/cost
  decision (ai, pay).

## 8. Status honesty

`done` (1): the privacy baseline (export JSON, erasure, inbox retention, cookie banner, PRIVACY.md).
`partial` (14): copy or code exists but is unrecorded, untested or incomplete; each AC says what
remains. `blocked` (3): T0.5, T2.5, T3.5 cannot finish without counsel — they are listed so the
roadmap shows the dependency instead of hiding it. Everything else is `not_started`.

## 9. Top risks

1. **Counsel never scheduled** — the register (T0.1) turns PL.1 into a one-week engagement with a
   cost; if it still slips, everything not marked blocked still ships and the policy stays plain.
2. **AI tier change cost** — bounded by `AiPolicy` budgets and kill switches; the Free parse is one
   cheap call per resume; confirm with the pay area before T1.6 merges.
3. **CSP breakage** — report-only week, nonce path, per-vendor allow-list in `csp.ts`.
4. **GA4 removal loses the admin installs tile** — first-party events (U20.4/A11.2) replace it.
5. **Age screen friction** — one question, no default, after the credential step; measured in U2.9.
6. **Test debt** — most "promise as test" stories need U19.3's Playwright/vitest infra for the web
   parts; API tests have Testcontainers today and carry the first wave.

## 10. Open questions for the user

1. **AI provider tier**: Gemini paid API or Vertex AI (both offer no-training terms + a DPA)? Any
   appetite to move DRAFT/TAILOR to a different provider under BYO-style terms? (T1.6)
2. **Deletion window**: keep "immediate and cannot be undone" (current policy) or adopt the 24 h
   deactivate-then-purge with an emailed cancel link (T1.3 D3)?
3. **Extension analytics**: drop GA4 from the extension (recommended under the 2026 Limited Use
   rule) or keep it opt-in with a first-run prompt and the host permission? (T6.1)
4. **16+ vs 18+**: stay at 16+ with the neutral screen and minor defaults (recommended; aligns with
   the org/school design) or move to 18+ like Simplify/Huntr? (T2.1, L5)
5. **Pen test budget and timing**: a boutique engagement after A0.2/U1.1, before or just after
   Launch 1? (T5.6)
6. **SOC 2**: readiness only (recommended) or commit to a Type I in year one for org deals? (T5.8)

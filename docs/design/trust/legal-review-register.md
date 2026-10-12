# Design — Legal documents, acceptance tracking and the lawyer-review register (area `trust`, epic T0)

Status: design 2026-10-11. Not legal advice: this document lists what exists, what is missing, and
the questions a lawyer has to answer. The legal entity is **AutomoraLab LLC**; PL.1 / ROADMAP 15.2
(lawyer review, governing law, DPAs) is still open by decision.

## 0. Decisions

| # | Decision |
|---|---|
| D1 | **Policies are versioned content in the repo**, not JSX prose: `web/content/legal/{privacy,terms,cookies,accessibility,vdp}/<version>.md` with front-matter `version`, `effective_at`, `material: true|false`, `summary` (plain-language "what changed"). The page renders the current version; `/privacy/changes` lists every version with its summary. The admin `legal_document` table (A9.6) points at these files by `body_url`; this area owns the content and the user-facing flow. |
| D2 | **Acceptance is recorded, once per document version, on four surfaces**: web signup (`surface=WEB_SIGNUP`), web re-acceptance sheet (`WEB_PROMPT`), extension connect (`EXT_CONNECT`, via `POST /api/extension/session` carrying the version it displayed), org join (`ORG_JOIN`, consent screen O6.2 records both the org consent version and the terms version). Passkey/Google/Apple sign-ups record it too (U1.3/U1.8 call the same endpoint). |
| D3 | **Material changes prompt, non-material changes inform.** Material = anything a lawyer marks as changing rights/obligations (price, refunds, AI data use, new recipients, governing law). Prompt = a bottom sheet on next sign-in that cannot be dismissed without "I agree" or "Export my data"; the extension never blocks a fill — it shows a one-line "Terms updated — review" link in the drawer (admin design §5). Email notice 14 days before `effective_at` for material versions (Brevo transactional, no tracking). |
| D4 | **"Continued use = acceptance" is replaced** by explicit acceptance for material versions; for non-material versions the changelog entry is the notice. (Lawyer to confirm the clause wording.) |
| D5 | **The register is one table, kept current**, reviewed at every launch gate and quarterly (T8.1). Every item has an owner, a priority and a status; nothing legal is "done" without a dated entry. |
| D6 | **No document claims more than the code does.** The doc-sync tests (T1.1, T3.1, T6.2, T8.2) fail the build when the privacy policy omits an `AiTask`, a subprocessor, a retention class or a manifest permission. |

## 1. Data model (additive; reconciles with A9.6)

```sql
-- A9.6 owns legal_document / legal_acceptance; this area adds:
ALTER TABLE legal_acceptance ADD COLUMN surface VARCHAR(12) NOT NULL DEFAULT 'WEB_SIGNUP';  -- WEB_SIGNUP|WEB_PROMPT|EXT_CONNECT|ORG_JOIN|API
ALTER TABLE legal_acceptance ADD COLUMN locale VARCHAR(10) NULL, ADD COLUMN ip_hash CHAR(64) NULL, ADD COLUMN user_agent_hash CHAR(64) NULL;
-- never the raw IP (consistent with login_attempt / data_share_event)
```

Acceptance rows are **kept after erasure with the login string only** (proof of consent, GDPR Art. 7(1);
same rule as `data_share_event`). The data export includes the user's acceptance history.

## 2. API

```
GET  /api/legal/current                         -> [{kind, version, effectiveAt, material, summary, url}]   (public, cached 5 min)
GET  /api/legal/pending                         -> [{kind, version, ...}] documents the signed-in user has not accepted (auth)
POST /api/account/accept-terms                  {kind, version, surface} -> 204 ; 409 if version is not current
POST /api/extension/session                     + {acceptedTerms: {terms: "2026.2", privacy: "2026.2"}} (optional field; recorded with surface EXT_CONNECT)
```
Web: `(app)/layout.tsx` calls `/api/legal/pending` once per session (cached in the session cookie
payload for 24 h) and mounts `LegalPromptSheet` when non-empty. Signup posts the acceptance with the
version it rendered (the version id is a prop of the signup page, so a stale tab cannot accept a
version it never showed).

## 3. State machine

```
legal_document:  DRAFT -> PUBLISHED(effective_at <= now) -> SUPERSEDED
user vs document: UNSEEN -> NOTIFIED(email, material only) -> ACCEPTED | EXPORTED_AND_LEFT
```
Grace: a material version is enforced only from `effective_at`; users who signed up between
publication and effectiveness accepted the new one at signup (the page always renders the latest
published version, and lists the effective date).

## 4. Wireframes (390 px)

```
Signup (bottom of card)                         Re-acceptance sheet (material change)
┌──────────────────────────────┐                ┌──────────────────────────────┐
│ [ Create account ]           │                │ We updated our terms         │
│ By creating an account you   │                │ Effective 1 Dec 2026         │
│ agree to the Terms (v2026.2) │                │ • Refund wording clarified   │
│ and Privacy Policy (v2026.2).│                │ • AI provider: no-training   │
│ What changed? ▸              │                │   tier, DPA signed           │
└──────────────────────────────┘                │ Read the full text ▸         │
                                                │ [ I agree ]                  │
                                                │ Export my data and leave ▸   │
                                                └──────────────────────────────┘
```

## 5. The lawyer-review register (needs a lawyer — flag, don't conclude)

| # | Document / question | Why it matters | Priority | Status 2026-10-11 |
|---|---|---|---|---|
| L1 | **Terms of Service** — governing law, venue, dispute resolution (arbitration? class waiver?), statutory-rights carve-outs, "changes" clause (D4), liability cap ($50 / 12-month fees), beta disclaimer | PL.1; no governing law today (`terms/page.tsx`) | P0 | OPEN |
| L2 | **Billing terms** — auto-renewal (FTC negative-option rule, California ARL, EU consumer withdrawal right vs "no refunds"), price-change notice, failed-payment handling | ROADMAP 12.6 wrote plain copy; "card-network chargebacks are not waived by a ToS line" | P0 | OPEN |
| L3 | **Privacy policy** — legal bases per processing activity, sensitive data (EEO self-ID = special category under GDPR Art. 9; CPRA "sensitive personal information"), international transfers (SCCs; AutomoraLab is US-based), EU/UK representative requirement (Art. 27) if offered to EU users, DPO need, CPRA categories + "Your Privacy Choices", retention table, children paragraph | Competitors (Simplify) already state these | P0 | OPEN |
| L4 | **AI data use** — default-on AI resume parsing disclosure (PROGRESS: "fold into PL.1"), Gemini tier/no-training terms, Art. 22 automated decision-making applicability (matching/scoring for the user's own use), EU AI Act Art. 50 transparency for AI-generated drafts submitted to employers | `ai-hiring-law-transparency.md` §5 | P0 | OPEN |
| L5 | **Minors** — 16+ vs 18+, per-country age of digital consent, COPPA posture (neutral age screen, actual-knowledge standard), UK Children's Code applicability to 16–17, US state minor laws, school/bootcamp org assertions | `minors-age-assurance.md` §6 | P0 | OPEN |
| L6 | **DPAs** — AWS (GDPR DPA incorporated in Service Terms — confirm), Brevo (DPA in dashboard — sign), Stripe (DPA in Services Agreement — confirm), Google (none on the free Gemini tier; paid tier/Vertex DPA — sign after T1.6), Cloudflare DNS (no personal data? confirm), licensed job aggregator (when chosen), Healthchecks/UptimeRobot (ops, no PII — confirm) | ROADMAP 15.2 | P0 | OPEN |
| L7 | **Vulnerability disclosure policy** — safe-harbour wording (CFAA / DMCA 1201 / state law), scope, no-bounty statement | `security-program.md` §2 | P1 | OPEN |
| L8 | **Org terms + DPA** (Kiwiply as processor for seat data vs controller for product data), 16+ assertion, no-submit, invite-consent warranty from the org | O14.5, `consent-data-sharing.md` §7 | P1 | OPEN |
| L9 | **Services terms** (human resume review, coaching: reschedule, no-show, revision, dispute, expert independent-contractor status) | O9.10, ROADMAP 20.5 | P1 | OPEN |
| L10 | **Inbox (IMAP) processing** — recruiter PII under legitimate interest, ownership warranty, dedicated-account rule as safeguard | ROADMAP "Legal shape for PL.1" | P1 | OPEN |
| L11 | **Accessibility** — EAA applicability (microenterprise exemption test: <10 staff *and* ≤ €2 M), ADA Title III exposure, accessibility statement wording | `accessibility-program.md` §5 | P1 | OPEN |
| L12 | **Breach notification matrix** — GDPR 72 h, UK, CCPA/state laws, store notifications, contractual (orgs) | `security-program.md` §4 | P1 | OPEN |
| L13 | **Marketing claims** — "never sell", "never train", "no auto-submit", "encrypted at rest", comparative claims vs competitors (T7.4, mkt honest-claims register) | FTC substantiation | P2 | OPEN |
| L14 | **Trademark** — "Kiwiply" word mark / logo; store listing names | — | P2 | OPEN |
| L15 | **Referral / promo rules** (U16.4), sweepstakes-style mechanics if any | — | P2 | OPEN |

Counsel brief (what we send with the register): the product description, the locked decisions
(CLAUDE.md), the current `/privacy`, `/terms`, `PRIVACY.md`, the data map (T1.1), the AI feature
register (T3.1), the subprocessor list (T1.5), and the questions above. Target: one review before
Launch 1 covering L1–L6; L7–L12 before the org launch; L13–L15 opportunistic.

## 6. Failure modes

| Failure | Behaviour |
|---|---|
| User refuses a material version | "Export my data and leave" → `GET /api/account/export` (T1.2 async) then `DELETE /api/account`; account stays read-only until then (no fills, no AI) |
| Extension older than the version prompt | drawer shows the link; API does not block; the next `/connect` records acceptance |
| Version published with a past `effective_at` by mistake | `legal_document` publish (A9.6, HIGH) refuses `effective_at < now + 14 d` for material versions |
| Content file and DB row disagree | `LegalContentSyncTest` reads front-matter and asserts the published rows exist with the same version/effective date |

## 7. Tests

`LegalAcceptanceIT` (signup records surface + version; stale version → 409; pending list empties
after accept; erased user keeps login-only row), `LegalPromptSheet` Playwright at 390 px (material
version → sheet; non-material → no sheet), `ExtensionSessionAcceptanceIT` (version recorded with
`EXT_CONNECT`), `LegalContentSyncTest`, export includes `legalAcceptances[]`.

## 8. Rollout

T0.1 register + counsel brief (docs) → T0.2 acceptance recording (signup, connect, org join) →
T0.3 versioned content + changelog page → T0.4 material-change prompt + email → T0.5 copy landing
after review (blocked on counsel) → T0.6 org/services hooks when O14.5/O9.10 build.

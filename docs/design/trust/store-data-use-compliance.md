# Design — Store data-use compliance: Chrome Web Store 2026 Limited Use, AMO, Edge, one source of truth (area `trust`, epic T6)

Status: design 2026-10-11. Existing: `job-autofill/PRIVACY.md` (listing source), `wxt.config.ts`
(Firefox `data_collection_permissions`, host permissions incl. `www.google-analytics.com`),
`src/lib/analytics.js` (GA4 Measurement Protocol from the service worker, default off unless CI
injects credentials, user opt-out), first-party count-only fill telemetry (`FillTelemetryService`,
unlinked), profile suggestions (opt-out), `/privacy` "Browser extension data use" paragraph with the
Limited Use link. **Chrome Web Store policy update (July 2026, enforced since 2026-08-01):** "Any user
data collected by an extension must now be strictly necessary to the extension's disclosed single
purpose"; collection for other purposes prohibited; prominent disclosure even for closely related
data; proactive notice to users when practices change.

## 0. Decisions

| # | Decision |
|---|---|
| D1 | **Drop third-party analytics from the extension.** GA4 is "collection for another purpose" under the tightened Limited Use reading; the risk (listing takedown) outweighs the value. Remove `www.google-analytics.com` from `host_permissions`, delete `src/lib/analytics.js`'s network path, keep the same `track()` API routed to the **first-party, unlinked** event endpoint (U20.4 unified envelope through `TrackingProvider`), still **opt-out in Settings**, still count-only. Firefox `optional: ["technicalAndInteraction"]` stays (that is the first-party counts). **Open question for the user** — if GA4 must stay, make it opt-*in* with a prominent first-run card and keep the host permission. |
| D2 | **Every network destination is justified by the single purpose**, in one table (`job-autofill/DATA-USE.md` generated, see D4): `api.kiwiply.com` (sync, consented AI proxy, count-only quality, suggestions), `api.anthropic.com` (BYO key only), ATS hosts (content script). Nothing else. |
| D3 | **Prominent disclosure in product, not only in the store**: first-run card in the drawer ("What Kiwiply sends and when" — three lines + a link), the Options page "Privacy" section mirrors `PRIVACY.md` headings, and the **per-fill "What left this page" panel** (D6). |
| D4 | **One source for three stores**: `PRIVACY.md` gains machine-readable front-matter (`destinations[]`, `permissions[]`, `dataCategories[]`, `cwsCertifications`, `amoRequired[]`, `amoOptional[]`); `scripts/check-data-use.mjs` (CI) asserts: every `host_permissions` entry ↔ a destination row; every manifest `permissions` entry ↔ a justification row; `data_collection_permissions` ↔ `amoRequired/Optional`; every destination appears in the web `/privacy` extension section (T0.3 markdown); the CWS "Privacy practices" answers are rendered from the front-matter into `STORE-LISTING.md` so the dashboard is copied from one text. Edge Add-ons uses the same. |
| D5 | **Change notice**: any change to the front-matter is a changelog entry (T0.3) and, if it adds a destination or data category, a **material** version (T0.4) plus an in-extension one-line notice on next open ("Our data practices changed — review") before the new behaviour activates (feature flag A5.5 remote config gates it). |
| D6 | **"What left this page" panel** (per fill, in the drawer): lists exactly what was sent for this page — "Profile sync: nothing new", "Fill-quality counts: 14 found / 12 filled / 2 empty — no values, no labels, no address", "Suggestions: 2 answers (salary, notice) to your account", "AI drafts: 1 question + profile summary → Google Gemini (consented)". Reads the same event envelope the code sends (no separate bookkeeping), so it cannot drift. This is the feature competitors don't have. |
| D7 | **No page content leaves the page except what the user initiates** (fill, save-a-job, draft) and the count-only telemetry; `websiteContent` in AMO terms covers the save-a-job capture (role/company/location/salary) and is disclosed as such. `src/lib/telemetry.js` keeps the fixed ATS family vocabulary (exists). |

## 1. Front-matter shape (`PRIVACY.md`)

```yaml
---
version: 2026.2
destinations:
  - host: api.kiwiply.com
    purposes: [sync, ai_proxy_consented, fill_quality_counts, profile_suggestions, product_events_unlinked]
    optOut: [fill_quality_counts, profile_suggestions, product_events_unlinked]
  - host: api.anthropic.com
    purposes: [ai_byo_key]
permissions: [storage, unlimitedStorage, scripting, activeTab, webNavigation, alarms]
dataCategories: [personallyIdentifyingInfo, authenticationInfo, websiteContent]
amoRequired: [personallyIdentifyingInfo, authenticationInfo, websiteContent]
amoOptional: [technicalAndInteraction]
cws: { sells: false, unrelatedUse: false, creditworthiness: false, limitedUse: true }
---
```

## 2. First-run card + per-fill panel (400 px drawer)

```
┌──────────────────────────────┐    ┌──────────────────────────────┐
│ Before your first fill       │    │ What left this page          │
│ • Fills from your profile,   │    │ ✓ Profile sync — nothing new │
│   on this page only          │    │ ✓ Quality counts — 14 found, │
│ • Sends count-only quality   │    │   12 filled, 2 empty. No     │
│   stats (opt out in Settings)│    │   values, labels or address. │
│ • Never submits for you      │    │ ✓ 2 suggestions → your       │
│ Full policy ▸  [ Got it ]    │    │   account (salary, notice)   │
└──────────────────────────────┘    │ – AI drafting: off           │
                                    │ Settings ▸                   │
                                    └──────────────────────────────┘
```

## 3. Failure modes

| Failure | Behaviour |
|---|---|
| A developer adds a `fetch` outside `tracking.js` | existing rule ("no fetch to the backend lives anywhere but this file") + `check-data-use.mjs` greps the built bundle for URLs and fails on any host not in `destinations` |
| Store reviewer asks for a justification we don't have | the table is the answer; the per-fill panel screenshot is attached to the listing |
| GA4 removal breaks the admin "extension installs" tile | A11 reads first-party events instead (U20.4) |
| Firefox requires a new data category | front-matter change → CI fails until `PRIVACY.md` + `/privacy` + manifest agree |

## 4. Tests

`check-data-use.mjs` in CI (manifest ↔ front-matter ↔ bundle URLs ↔ web policy section);
`panel-what-left.test` (the panel renders from the recorded envelope for a fixture fill; opt-outs
show "off"); `analytics.test.js` updated (no network to google-analytics; opt-out stops the first-party
path); `firstRunCard.test` (shown once, dismiss persists).

## 5. Rollout

T6.1 review + GA4 decision (user) + first-run card → T6.2 front-matter + sync script → T6.3 per-fill
panel → T6.4 listing generation for CWS/AMO/Edge. Version bump per the extension ritual.

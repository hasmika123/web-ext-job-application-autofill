# Design — Trust centre, privacy nutrition label, personal data-access ledger, transparency report (area `trust`, epic T7)

Status: design 2026-10-11. Related: U14.2 (Settings › Privacy "what we store, who sees it"), A1.5
(consented support "view as"), A1.8 (admin privacy summary), O6.* (org reads audited), T1 (data map),
T3 (AI register), T4/T5 (statement, security page). This area makes the facts **visible to the person
they are about**.

## 0. Decisions

| # | Decision |
|---|---|
| D1 | **`/trust` is a hub, not a brochure**: live facts rendered from code and tables — current legal versions + changelog, subprocessors with DPA status, retention table, AI feature register (what is sent, to whom), security controls + last pen test date, accessibility status, open incidents (none → "none in the last 90 days"), transparency report link, and the three promises the audience cares about in one line each: *we never apply for you · we never sell or train on your data · you can take it all and leave in two taps*. |
| D2 | **Privacy nutrition label** — one card, three columns (**We store · Who can see it · Never**), shown at signup (below the form), once in onboarding, and permanently at Settings › Privacy (U14.2 renders it). Content comes from the data map (T1.1): rows for Profile, Resumes, Applications, Inbox mail, AI reports, Usage counts. "Who can see it": You · Kiwiply staff (metadata; contents only with a logged reason you can see) · Your org (only what you chose) · Google Gemini (only the features you turn on, no training) · Stripe (billing only). "Never": advertisers, employers without your action, model training, data brokers. |
| D3 | **Personal data-access ledger** (`Settings › Privacy › Who looked at my data`): a user-readable feed of `admin_audit_event` rows targeting this user with PII-view reasons (A1.5/A12.3), org `SHARE_READ_FULL` reads (O6 D5), support "view as" sessions (start/end, pages), AI calls (feature, model, date — never the prompt), exports and deletion requests, legal acceptances. Read model: `GET /api/account/access-log?cursor=` joins the existing tables by login; no new write path. Delay: none (same request). This is the feature no competitor offers and the one that turns "admins only see metadata" from a sentence into evidence. |
| D4 | **Trust claims register** (`docs/design/trust/CLAIMS.md`, owned here, consumed by `mkt`'s honest-claims register): every trust claim on marketing/trust/store pages → the evidence (test name, design decision, policy section). A claim without evidence is not published. Initial claims: never auto-submit (`NoSubmitSurfaceTest`, locked), never sell (policy + no ad pixels: `CspIT` connect-src proves no ad hosts), never train (provider terms T1.6 + `DOSSIER_AI_PROVIDER_TRAINING=false` assertion), count-only telemetry (`FillTelemetryService` vocabulary test), EEO firewall (`SensitiveFirewallTest`), read-only inbox (`InboxReadOnlyTest` — IMAP client has no STORE/MOVE/EXPUNGE calls), delete everything (`ErasureCompletenessIT`). |
| D5 | **Annual transparency report** (first: 12 months after Launch 1; a page on `/trust`): privacy requests by kind and median days to complete, government/law-enforcement requests (count; "none" stated), security incidents and notifications, uptime, AI provider/tier changes, accessibility audits, the fairness summary (T3 D7) when it exists. Numbers from the A9.4 queue, A10.5 incidents, A10.3 uptime. |
| D6 | **No trust badges we did not earn**: no "GDPR compliant" seal, no "SOC 2" wording before a report exists, no "bank-level encryption". Plain statements with dates. |

## 1. API

```
GET /api/account/access-log?cursor=&kinds=ADMIN_VIEW,ORG_READ,SUPPORT_SESSION,AI_CALL,EXPORT,DELETE,LEGAL
     -> [{at, kind, actor: "Kiwiply support" | "<org name> (Rahul S.)" | "You", what, reason?, link?}]   (auth; 50/page)
GET /api/trust/summary          -> public: {legal:[...], subprocessors:[...], retention:[...], aiFeatures:[...], security:{lastPenTest, headersSince}, a11y:{status, checkedAt}, incidents90d}
```
`access-log` reads `admin_audit_event` (target_login = me and `reason` not null, or action in a
PII-view set), `org_audit_event` (`SHARE_READ_FULL`, member = me), `support_session` (A1.5),
`ai_call` (login = me, feature + model only), `privacy_request` (user = me), `legal_acceptance`.

## 2. Wireframes (390 px)

```
/trust (public)                                   Settings › Privacy (signed in)
┌──────────────────────────────┐                  ┌──────────────────────────────┐
│ Trust at Kiwiply             │                  │ Privacy                      │
│ We never apply for you.      │                  │ ┌ We store · Who sees · Never┐
│ We never sell or train on    │                  │ │ Profile  You, staff(meta) │
│ your data.                   │                  │ │ Resumes  You, Gemini(opt) │
│ Take it all and leave — 2    │                  │ │ Mail     You              │
│ taps.                        │                  │ │ Never: ads, employers w/o │
│──────────────────────────────│                  │ │ you, model training       │
│ Privacy policy  v2026.2  ▸   │                  │ └──────────────────────────┘│
│ What changed (3 Oct)     ▸   │                  │ Who looked at my data     ▸ │
│ Subprocessors (6, 5 DPAs) ▸  │                  │  • Support viewed your bug  │
│ Retention table          ▸   │                  │    report — 9 Oct, reason:  │
│ AI: what we send, to whom ▸  │                  │    "ticket #412"            │
│ Security · pen test Jan ▸    │                  │  • Acme (Rahul S.) opened   │
│ Accessibility · partial  ▸   │                  │    your board — 8 Oct       │
│ Incidents: none in 90 days   │                  │  • Job fit · Gemini — 8 Oct │
│ Transparency report 2027 ▸   │                  │ Your data (export/delete) ▸ │
└──────────────────────────────┘                  │ Analytics        (● off)    │
                                                  └──────────────────────────────┘
```

## 3. Failure modes

| Failure | Behaviour |
|---|---|
| A ledger row would expose another person (e.g. an admin's name) | actors are rendered as roles ("Kiwiply support"), org actors as the org + the paired member's display name the user already knows |
| Trust summary reads a table that doesn't exist yet (pre-A9.7) | each section degrades to the static markdown with a "manually maintained" note; never fakes a count |
| Claims register and marketing drift | `mkt` honest-claims lint links every claim id to a row here; CI fails on an unknown id |
| Support session rows missing because A1.5 isn't built | section shows "No support access has been granted" (true) |

## 4. Tests

`AccessLogIT` (each source table contributes a row; another user's rows never appear; cursor paging),
`TrustSummaryIT` (public, no admin fields, counts match tables), Playwright: nutrition label at 390 px on
signup + settings, `/trust` links resolve; `ClaimsRegisterTest` (every claim id has an evidence
reference that exists in the repo — test name or doc anchor).

## 5. Rollout

T7.2 nutrition label (static from the data map) → T7.1 `/trust` hub (static → live as A9.5/A9.7
land) → T7.3 access ledger (needs A12.3 reasons + O6 audits for full value; ships with AI calls +
exports first) → T7.4 claims register → T7.5 report after 12 months live.

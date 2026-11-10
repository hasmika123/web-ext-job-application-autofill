# PROPOSAL — Consultancy Ops 23.0: timesheets first (APPLIED, then PROMOTED)

Written 2026-10-11 for task 23.0. Designs at the time: `docs/design/org/timesheets.md` and
`docs/design/org/consultancy-ops.md`. **Status:**

> **APPLIED 2026-10-11.** The user answered D1, D2, D7 and D10; the rest take the recommended defaults
> and are marked *default, user may override*. §3 (the patch list) was applied to `docs/roadmap/areas/org.json`
> and reconciled with the reconciliation pass. Per the user's "everything is admin-configured" decision of
> the same day, **every number became a setting, entitlement or catalog value** in the stories.
>
> **PROMOTED 2026-10-11 (same day).** The user then decided "like resume builder the time sheets also should
> be an product level feature". The org epic and its fourteen stories were **removed from `org.json`** and
> re-planned as **product area H** (`docs/timesheets/stories.json`, 42 stories H0–H8, every epic P2):
> design `docs/TIMESHEETS-DESIGN.md`, backlog `docs/TIMESHEETS-STORIES.md`, decisions
> `docs/TIMESHEETS-DECISIONS.md`, on-ramp `docs/HANDOFF-TIMESHEETS.md`. The old → new id mapping is
> **DESIGN §13** (the only place the old ids still appear). The §3 patch list is therefore gone from this
> file — its content is in the stories file; git history keeps the applied text. The D-numbers below are
> still the ones the decisions file uses.
>
> | # | answer | applied as (product area H) |
> |---|---|---|
> | D1 | **(a) org add-on only** | every table `org_id`-first; no personal-scope variant |
> | D2 | **not set in the roadmap — priced later in admin config** | H7.1 creates catalog items `ops-addon-base` + `ops-addon-consultant` with **no price**; the "$99 + $4" draft is a worked example for the margin guard only; pilot free via an admin switch (`flag.ops_timesheets` + `opsPilot`, H0.2) |
> | D7 | **optional, off by default** | `ops_settings.ocr_enabled` default false, entitlement `ops.ocr` default off, suggestion-only (H3.4); the identifier scan is separate and mandatory (H3.3) |
> | D10 | **keep at P2** | every H epic is P2; the timesheets-first order lives in the deps only (H0.1 → … → H0.7 → H1 → H2 → H3 → H4 → H5 → H6 → H7 → H8) |
> | D3–D6, D8, D9, D11, D12 | *default, user may override* | recorded in `docs/TIMESHEETS-DECISIONS.md` with the story that applies each |

## 1. Decisions for the user (recommended default in bold; kept for the record)

| # | decision | options | recommended default | why |
|---|---|---|---|---|
| D1 | Who gets timesheets | (a) org add-on only; (b) also individual Pro/Autopilot contractors tracking their own hours | **(a) org add-on only for v0**; revisit (b) after the pilot | the value is the consultancy's copy + approval + proof; a solo contractor already has the client's VMS. (b) would need a personal-scope variant of every table and export and competes with Clockify's free tier |
| D2 | Pricing | (a) $99/org + $4 per active consultant as a draft; (b) a cheaper "Timesheets" entry item; (c) $0 base, $9/consultant | **set later in admin** (user) | the catalog + margin guard decide; at 10 consultants the draft is ~2× Clockify Standard and ~⅓ of JobDiva/Bullhorn-class tools; the gap is paid for by proof, OCR, flags and the consultant living in Kiwiply already |
| D3 | Retention | 7 y from `week_start` (org may lengthen) vs 7 y after org close | **7 y from `week_start`**, purge only when the org is CLOSED or the placement ended > 7 y ago (H7.2) | matches the US financial-record norm and is simpler to explain; never shorter |
| D4 | External approvers (client/vendor managers) ever get a link or login? | yes (magic-link approve) / **no** | **No** (H8.5 keeps a note only for a pilot shop with no client-side system) | the client already approves in its own VMS; a link would make us a party to the client relationship and a phishing surface |
| D5 | Payroll / invoicing export formats | generic CSV only; **generic + PAYROLL + BY_CLIENT CSV + PDF_PACK**; provider-specific templates | **the four layouts** (H0.6, H5.1, H5.2); provider presets later (H8.5) | record-only hand-off without pretending to integrate |
| D6 | What a paired MARKETER sees | nothing / **presence only** / hours | **presence only** (H1.4) | bench-vs-placed awareness is their job; hours and money are not |
| D7 | OCR of the client-approved proof | off entirely / **optional org toggle, suggestion-only, budgeted** / always on | **optional, off by default** (user; H3.4) | kills the re-keying pain while keeping "we don't read your attachments" true unless the org asks |
| D8 | Finance submitting a sheet *for* a consultant who left mid-week | never / **allowed, audited `OPS_TS_SUBMIT_FOR`, hours only** | **allowed** (H2.5) | trailing hours are real; it is hours, not money, and it is audited to the person |
| D9 | One-person shops | require a second admin / **`approval_required=false` with a visible "self-recorded" badge** | **the switch** (H2.5) | otherwise the smallest shops cannot use it at all |
| D10 | Priority and placement in the build order | **keep P2** / P1 | **P2** (user) | the order is in the deps; the product depends on the org walking skeleton which has not started |
| D11 | Identifier scan of proof uploads | (a) **mandatory scan before storage, refuse on detection, platform-paid**; (b) scan only when OCR is on; (c) attestation checkbox | **(a)** (H3.3) | the rule is "we don't take any of those"; (b) leaves OCR-off shops unprotected, (c) is a promise, not a control |
| D12 | Client-side crop/redact helper before upload | now / **later** | **later** (H8.5, after the pilot shows the refusal rate) | refusing is enough to keep the rule; a crop tool is convenience |

## 2. Minimum path to timesheets

### 2.1 What is truly required (and what is not)

| foundation | required for the walking skeleton (H0)? | why |
|---|---|---|
| O1.1 org core schema | **yes** (H0.1) | `org_member` is the consultant's identity in the org |
| O1.2 OrgAccessService + matrix (incl. `FINANCE`) | **yes** (H0.2) | every ops endpoint gates on it |
| O1.4 org_audit_event | **yes** (H0.1) | the paper trail is the product |
| O1.3 org endpoints | **yes** | an org must exist and have an OWNER |
| O2.2 email invites + join accept | **yes** (H0.3) | consultants must join (invite-only; no CSV/QR needed for 5–50 people) |
| O6.1 data_share tables + O6.2 consent screen | **yes, but thin** | the join flow ends at the consent screen; timesheets themselves are not scope-gated (H8.1 asserts it) |
| O1.5 OrgIsolationIT | **yes** (gate) | discovers the new routes automatically |
| O1.6 web gate | **yes** (H0.5) | the approver inbox lives in `/org`; the consultant surface lives in the user app |
| A5.1 settings registry, A5.3 flags | **yes** (H0.2) | every default reads from them; fall back to `application.yml` behind the same keys if they slip |
| O13.3 notification kinds + daily cap | **no for H0**, yes for H4 | reminders can land later |
| O3.1 / O3.2 catalog + assignments, O4.x billing, Phase 18 | **no** until H7.1 | the pilot is free behind the admin switch |
| O5.1 Team page | **no for H0** (H1.3 uses the members API) | H0.3 picks a consultant from `GET /members` |
| O10.x Marketer | **no** | the presence endpoint (H1.4) ships when O10.3 exists |
| P5.1 FileStorage local driver (plat) | **no for H0**, yes for H3.2 | if it slips, H3.2 uses `ResumeStorageService` behind an adapter with the same key shape |
| O6.5 GDPR hooks | **no for H0, yes before public launch** (H7.2) | erasure/export of timesheets |
| R0.6 Chromium PDF sidecar (resume builder) | **no for H0**, yes for H5.2/H6.2 | shared `PdfRenderer` |

### 2.2 Recommended order (v0 = free pilot with 2–3 consultancies)

| # | story | size | pts | lane |
|---|---|---|---|---|
| 1–7 | org walking skeleton O1.1 → O1.2 → O1.4 → O1.3 → O6.1 → O2.2 → O1.5 (`PLAN-org.md` §3) | | 13 | API-model |
| 8 | H0.1 schema v0 | M | 2 | API |
| 9 | H0.2 FINANCE + gate + settings | M | 2 | API |
| 10 | H0.3 placements-lite | M | 2 | API |
| 11 | H0.4 weekly sheet core v0 | L | 3 | API |
| 12 | H0.5 week view v0 + inbox v0 (needs O1.6) | L | 3 | web |
| 13 | H0.6 GENERIC CSV v0 | S | 1 | API |
| 14 | H0.7 smoke + handoff | S | 1 | web |
| 15–18 | H1.1 → H1.2 → H2.1 → H2.2 → H2.3 (rates, holidays, kinds, flags, corrections) | M S M M M | 9 | API |
| 19 | H2.4 week view full | L | 3 | web |
| 20–23 | H3.1 → H3.2 → H3.3 → H3.4 (never-collected gate, proof, scan, OCR) | M M M M | 8 | API |
| 24–25 | H3.5 proof UX · H3.6 approver inbox full | M M | 4 | web |
| 26–27 | H4.1 → H4.2 (needs O13.3) | S M | 3 | API |
| 28–29 | H5.1 → H5.3 (exports; H5.2 needs R0.6) | M M S | 5 | API + web |
| 30–32 | H8.1 first-run · H8.2 demo seed · H8.3 metrics | S S S | 3 | API + web |
| | **pilot-ready total (excl. org skeleton)** | | **≈ 49 pts** | |

Money (H6), billing/retention/admin (H7) and the rest of H8 follow the pilot. With Sonnet agents at roughly a
story-point a day per lane, the pilot slice is **≈ 4 calendar weeks after the org model starts**, ≈ 3 if
O1.x has already landed.

### 2.3 What the pilot deliberately leaves out
Stripe billing of the add-on, invoice generation, payments/expenses, profit, bill rates in any UI beyond
the FINANCE panel, CSV member import, QR join, provider-specific export templates, OCR auto-read default,
the crop helper.

## 3. Patch list — removed
Applied on 2026-10-11 and superseded the same day by the promotion to product area H. The full story text
lives in `docs/timesheets/stories.json`; the mapping from the applied ids to the new ones is
`docs/TIMESHEETS-DESIGN.md` §13.

## 4. Size summary
Product area H: 42 stories, 75 points (H0 11 · H1 7 · H2 10 · H3 12 · H4 4 · H5 5 · H6 11 · H7 7 · H8 8).

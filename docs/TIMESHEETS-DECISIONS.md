# Timesheets & Consultancy Ops — decisions

One page. Written 2026-10-11 when the product was promoted from the org area's Consultancy Ops epic to
product area **H**. Two tables: what the user already decided (not up for re-litigation), and the defaults
`docs/TIMESHEETS-DESIGN.md` assumes — each stands unless you say otherwise. The D-numbers are the ones
from `docs/roadmap/PROPOSAL-timesheets.md` so nothing has to be renumbered.

## Decided by the user (2026-10-11)

| # | Decision | Applied as |
|---|---|---|
| D1 | **Org add-on only.** No personal-scope variant for solo contractors (they already have the client's VMS; a personal variant would double every table and export and compete with Clockify's free tier). | Every table is `org_id`-first; every route is `/api/orgs/{id}/ops/**`; the consultant is an org MEMBER with a placement. Revisit after the pilot. |
| D2 | **Priced later in admin.** No price in the roadmap; the "$99/org + $4 per active consultant" draft is a worked example for the margin guard only. Pilot orgs run free behind an admin switch. | H7.1 seeds `ops-addon-base` + `ops-addon-consultant` with **no price**; `flag.ops_timesheets` + `opsPilot` gate v0 (H0.2); pilot orgs migrate to an `ADMIN_COMP` grant. |
| D7 | **OCR optional, off by default, suggestion-only.** | Entitlement `ops.ocr` default off; `ops_settings.ocr_enabled` default false; `ocr_auto_read` default false; budget entitlement `ops.ai_budget_cents_per_consultant` (50) pooled per org (H3.4). The identifier *scan* (H3.3) is separate, mandatory and platform-paid. |
| D10 | **Priority stays P2** for the whole product. | Every H epic is `P2`; the timesheets-first order is expressed only in story dependencies (H0 → H1/H2 → H3 → …). Promotion to a product area changed the *shape*, not the priority. |
| — | **Everything is admin-configured** (product-wide rule, same day). | Every price, cap, limit, day and threshold in the backlog is a setting key + default, a flag, a feature-registry entry or a catalog entitlement (DESIGN §11); `RoadmapSettingsParityTest` keeps the registry in sync. |
| — | **Never collect sensitive PII** (product-wide rule, same day). | DESIGN §5.12 table; `@NoSensitiveText` on every String field; `OpsNeverCollectedTest` build gate (H3.1); proof files refused before storage (H3.3). |
| — | **Timesheets are a product area, like the Resume Builder** (this promotion, "i think like resume builder the time sheets also should be an product level feature"). | Prefix H, `docs/timesheets/stories.json`, the four product docs, their own PROGRESS section; the org epic removed from `org.json`, mapping in DESIGN §13. |

## Defaults you may veto

| # | Decision | Recommended default | The alternative, and why it lost |
|---|---|---|---|
| D3 | **Retention anchor** | 7 years from `week_start` / record date, org may only lengthen, purge only when the org is CLOSED or the placement ended > N years ago (H7.2) | 7 years after the org closes — simpler to state but keeps everything of a long-lived org forever |
| D4 | **External approvers (client / vendor managers)** | **No** link, no login, ever. The client already approved in its own VMS; ours is the consultancy's acknowledgement | A magic-link approve would make us a party to the client relationship and a phishing surface; kept in H8.5 only for a pilot shop with *no* client-side system |
| D5 | **Export layouts** | GENERIC + PAYROLL + BY_CLIENT CSV + PDF_PACK (H0.6, H5.1, H5.2); provider presets (Gusto/ADP/QuickBooks) later as column maps (H8.5) | Generic CSV only — leaves the payroll person reshaping it every week |
| D6 | **What a paired MARKETER sees** | Presence only: client + dates + submitted/missing per week (H1.4) | Nothing (loses bench-vs-placed awareness, which is their job) / hours (not their business) |
| D8 | **Finance submitting a sheet *for* a consultant who left** | Allowed for leavers / ended placements, hours only, audited `OPS_TS_SUBMIT_FOR` (H2.5) | Never — trailing hours are real and would end up in a spreadsheet |
| D9 | **One-person shops** | `ops_settings.approval_required=false` with a visible "self-recorded" badge on every sheet, DTO, export and PDF (H2.5) | Require a second admin — the smallest shops could not use it at all |
| D11 | **Identifier scan of proof uploads** | (a) mandatory scan before storage, refuse on detection, platform-paid `ai.budget.ops_scan_cents_per_consultant` (25 ¢) × active consultants (H3.3) | (b) scan only when OCR is on — leaves OCR-off shops unprotected; (c) an attestation checkbox — a promise, not a control |
| D12 | **Client-side crop / redact helper** | Later (H8.5), after the pilot shows the refusal rate | Now — refusing already keeps the rule; a crop tool is convenience |
| 13 | **Walking skeleton first (H0), thin on purpose** | Gate + placements-lite + one sheet + one CSV + smoke, no proof/money/AI, before any other epic | Build the former single "timesheets core" story in one go — three sessions of work with nothing demonstrable until the end |
| 14 | **Consultant surface lives in the user app at `/timesheets`**; approver, placements and finance under `/org/ops/*` | Phone-first for the consultant; the org console already has the role gate | A separate consultant mini-app — a second shell to maintain |
| 15 | **Money records are the same product** (H6), not a second org epic | One design, one state machine for locks and reissue, one audit table | Keeping finances in `consultancy-ops.md` as a separate org epic — the lock/reissue coupling made it artificial |
| 16 | **Entitlement keys stay `ops.*`** beside the platform's `ops.*` *settings* (two registries) | Nothing to rename across pay/admin docs; H7.3 registers both and notes the namespace | Rename to `timesheets.*` before H7.1 seeds the catalog — cleaner, costs a doc sweep; say so if you want it |
| 17 | **PDF rendering reuses the Resume Builder's Chromium sidecar** (R0.6) via a shared `PdfRenderer` | One PDF engine in the stack | A Java PDF library — a second render tree for the pack and invoice |
| 18 | **Schema in six changesets by story**, not one big `ops_timesheets.xml` | Each story's migration ships with its tests; no unused tables in the skeleton | The proposal's single changeset — would land money tables months before H6 |
| 19 | **Disclaimer copy** "Records you entered. Not tax, legal or accounting advice." marked `pending legal review` | Ship the pilot with it; the trust area confirms before public launch | Block the pilot on legal — unnecessary for 2–3 free pilot shops |

No answers recorded yet beyond D1, D2, D7, D10 and the two product-wide rules. When the user answers an
open item, record it here under a dated "Answers recorded" heading (the Resume Builder file shows the shape).

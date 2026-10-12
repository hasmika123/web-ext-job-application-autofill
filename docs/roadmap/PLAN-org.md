# PLAN — area `org` (Organizations)

Written 2026-10-11 on `product-roadmap`. Machine-readable plan: `docs/roadmap/areas/org.json`
(15 epics, 113 stories; 1 done · 14 partial · 98 not started; 34 marked critical). Audit:
`docs/roadmap/AUDIT-org.md`. Designs: `docs/design/org/*.md` (nine documents, listed in §4).

## 1. Where we are, in one paragraph
The `/org/*` console looks finished and is entirely sample data; there is no organization table, no
membership, no org billing, no consent model and no org tests in the API. The only real org-adjacent
code is the sales-inquiry intake and the per-user billing/entitlement pipeline (which is excellent and
is the pattern we extend). The marketing page promises features (ATS sync, automation, approval
rules) that the locked decisions say we will not build. So this area is a **greenfield build behind
a finished-looking facade**, and the first job is the model, not the pages.

## 2. The epics and why they are ordered this way

| # | epic | priority | why it sits here |
|---|---|---|---|
| O1 | Organization model & tenancy | P0 | Everything else keys on `org_member` and the permission matrix; ROADMAP 21.0 makes isolation tests a gate. Also flips `/org` from "any session" to membership. |
| O6 | Consent, privacy & member side | P0 | Designed *with* O1, built right after: the visibility matrix is what makes every later page lawful. The audience's trust is the product; a bootcamp seeing a student's employer list by default would end us with that audience. |
| O3 | Catalog & entitlements for orgs | P0 | `org_assignment → entitlement_grant` is the mechanism by which an org actually gives anyone anything. Depends on Phase 18.1/18.2 (admin area). |
| O4 | Org billing | P0 | Setup fee gates activation; seat quantities drive invoices; webhook-only writes keep money honest. Extends `BillingWebhookService`, does not fork it. |
| O2 | Onboarding & invites | P0 | The "<2 minutes on a phone" promise and the single consent screen every join path ends at. Self-serve DRAFT orgs turn the marketing page into a funnel. |
| O5 | Team & members | P0 | The first real admin page: roster, roles, groups, support owners, assigning items. |
| O7 | Dashboard & analytics | P1 | Defined metrics + nightly rollups + k-anonymity; replaces the invented tiles with numbers an org can defend to its board. |
| O8 | Applications / shared jobs / interviews / resumes | P1 | Rewires the four remaining pages to consent-scoped data and deletes `sample-data.ts`. |
| O13 | Settings, notifications, security | P1 | Org profile/logo, digest/quiet-hours rules, audit viewer, an honest security tab, close-org. Notification kinds (O13.3) are needed earlier by O2/O4, so that story is pulled forward. |
| O14 | Marketing & sales | P1 | Honest `/organizations`, self-serve CTA, price calculator, inquiry→org conversion, org terms. |
| O9 | Human services marketplace | P1 | Phase 20; independent of orgs except org-bought services. Record-only payouts first. |
| O10 | Consultancy Marketer | P1 | Phase 22; needs O6 (FULL scope), O3/O4 (seats), the resume builder (`R0.1`, `R0.3`) and Phase 19 Autopilot for the queue path. The no-submit guarantee is structural and tested. |
| O15 | Mobile, a11y, performance, QA | P1 | Bottom tabs, cards, skeletons, dark mode, Playwright e2e in CI — runs alongside O5–O8, not after. |
| O12 | Integrations (honest) | P2 | Replace fiction with what is buildable without OAuth: Slack webhook, ICS, outbound webhooks, API key. |
| — | Timesheets & Consultancy Ops | P2 | **Promoted to product area H on 2026-10-11** (`docs/TIMESHEETS-DESIGN.md`, `docs/timesheets/stories.json`); its deps on O1.x/O2.x/O6.x/O13.x stay in this area. Record money, never move it. |

## 3. Recommended build order — the walking skeleton (first 10 stories)

Goal of the skeleton: a real org can be created, paid (billing stubbed in dev), invite one person
who joins through the consent screen, receives a Pro seat that unlocks the extension, and can revoke
sharing — with cross-tenant isolation proven in CI. No charts yet.

1. **O1.1** Org core schema
2. **O1.2** OrgAccessService + permission matrix (404 semantics)
3. **O1.4** org_audit_event
4. **O1.3** Org endpoints (create DRAFT, mine, patch, close, groups)
5. **O6.1** data_share + ShareField matrix test
6. **O2.2** Email invites + join preview/accept
7. **O1.5** OrgIsolationIT (route-discovered) — gate before any UI
8. **O1.6** Web gate on `/api/orgs/mine` + feature flag
9. **O3.2** org_assignment → entitlement_grant (needs Phase 18.1 tables; if the admin area has not landed them, build the two tables as part of this story and reconcile IDs)
10. **O4.1 → O4.3 → O4.4** Setup-fee checkout, org webhook handler, item quantities (counted as one block; O4.10's dev-activate flag lets the web flow run without Stripe keys)

Then: **O6.2** consent screen, **O2.1** create flow, **O2.3** join pages, **O5.1** team page,
**O4.5** dunning, **O13.3** notification kinds, **O2.7** checklist — at that point the console is
honest end-to-end and `sample-data.ts` starts shrinking page by page (O7, O8).

Parallelisable from day one by separate Sonnet agents with strict file ownership: API model (O1/O6),
billing (O4), web onboarding (O2.1/O2.3/O2.8), services (O9.1–O9.3), docs/terms (O6.7/O14.5).

## 4. Critical-area designs (what implementers follow)
- `docs/design/org/tenant-model.md` — tables, roles/permissions matrix, state machine, API, erasure, isolation tests, mobile shell.
- `docs/design/org/billing.md` — setup fee, Stripe mapping, proration rules, mirrors, webhook routing, entitlement resolution, margin guard numbers, failure modes.
- `docs/design/org/consent-data-sharing.md` — NONE/SUMMARY/FULL matrix, consent flows, GDPR/CCPA mapping, abuse controls.
- `docs/design/org/onboarding-invites.md` — the <2-minute create flow, join codes/QR, CSV, domain auto-join, checklist, etiquette, analytics events.
- `docs/design/org/analytics.md` — metric definitions as code, rollups, k-anonymity, dashboard/analytics wireframes.
- `docs/design/org/services-marketplace.md` — expert/order/payout model, state machine, matching, margins, expert-view limits.
- `docs/design/org/marketer-workspace.md` — pairing, marketer-made resumes with approval, job bank, marketer inbox, the structural no-submit guarantee.
- `docs/TIMESHEETS-DESIGN.md` — Timesheets & Consultancy Ops, now product area H (`docs/design/org/consultancy-ops.md` and `timesheets.md` are pointers to it).
- `docs/design/org/integrations.md` — honest inventory and the OAuth-free integrations we will build.

## 5. Top risks
1. **Phase 18 dependency.** Org billing and assignments assume the catalog/grant tables (18.1) and
   `EntitlementService` on grants (18.2), which belong to the admin area. If they slip, O3/O4 stall.
   Mitigation: O3.2 may create the two tables itself with the agreed names; coordinate story IDs.
2. **Consent reduces what admins see — and sales will push back.** SUMMARY hides employer names.
   This is the differentiator for the audience and the lawful default; hold the line, and put the
   consent story on the marketing page (O14.2).
3. **Stripe quantity/grant drift.** Mitigated by Stripe-before-grant ordering, webhook-only mirrors,
   and a reconciler that alerts instead of auto-fixing. Needs a test-clock dry run before Phase 21 ships.
4. **Hosting prerequisite.** ROADMAP 21.0 requires our own server with a passing restore drill before
   orgs ship (Phase 15 ops). Not in this area's stories; it is a release gate.
5. **Scope creep from the boards.** Interviews scheduling, approval rules, bulk AI on members, ATS
   sync and ROI tiles are *removed* by design. Expect requests to add them back; the answer is in
   the design docs' decision lists.
6. **Marketer flow legality.** The no-submit guarantee is tested structurally (O10.10), but terms
   and the consultant attestation copy need lawyer review together with services terms (20.5).

## 6. Open questions for the user (decisions needed; defaults proposed)
1. **Should a member be able to grant FULL to a non-marketer support owner (coach) in a school/bootcamp?**
   Default proposed: *no* until Phase 22 ships; the Coach hook stays dormant. Saying yes is one story
   (reuse O10.2 without the pairing requirement).
2. **Minimum age 16+ as a hard rule for SCHOOL/BOOTCAMP orgs?** Default: yes (GDPR Art. 8 ceiling);
   under-16 programmes are out of scope.
3. **Ops add-on 23.0 points to confirm:** price $99 + $4/active consultant; 7-year retention; consultant
   pay visibility default *off*; invoices are records only (never emailed by us). Default: all as written.
4. **Pricing-page label:** `TOPIC_LABELS.organization` is "Consultancy plan" today. Rename to
   "Organizations (schools, bootcamps, consultancies)" with self-serve? Default: yes with O14.2.
5. **Shared jobs (O8.2) for schools — in Phase 21 or deferred?** It is the only "opportunities"
   feature that fits non-consultancy orgs. Default: P1 in Phase 21.3 scope.
6. **Who owns Phase 18 stories (catalog engine)?** Confirm the admin area (`A*`) owns 18.1–18.5 and
   this area only seeds org rows and guard rules (O3.1, O3.6).

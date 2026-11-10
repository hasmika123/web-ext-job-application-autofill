# Accounts workspace: Offers, Submissions, and the offer-to-placement lifecycle

Status: built 2026-10-16 on `ent-offers-placements` (X9.8, X10.4, X10.6 partial). Gaps are listed in `qa/REAL-GAPS-B.md`.

## Rules this page keeps
- **E1 / consent.** An offer is a RECORD of what the client extended. Only the consultant accepts, declines or asks to negotiate, in their own workspace
  (`offers.respond`). There is no accept or decline route on the org side. Kiwiply signs nothing and sends nothing; the copy says so.
- **Record money, never move it.** Rate, salary and total compensation are plain numbers in minor units with a currency and a period. No bank, tax or identity
  column exists on any of these tables. Free text (`notes`, `benefits`, a withdraw reason, a termination reason) goes through the PII scanner.
- **Org from the host/token only; generic 404.** Every route is `/api/orgs/{orgId}/...`, organization id first in every query; no key, a foreign tenant and a missing
  id are the same 404.
- **Admin configured.** `org.offers.expiry_days` (default 14, 1 to 90, overridable per organization) sets the answer-by date when none is entered.

## States
Offer (stored `cws_offer.status`, shown state): `DRAFT` -> `PENDING_REVIEW` (shown **Extended**) -> `NEGOTIATION` (**Negotiating**) -> `ACCEPTED` | `DECLINED`;
`WITHDRAWN` (org); `EXPIRED` (nightly job, or shown at once when the deadline day has passed). Revising a negotiated offer sends it back to Extended.
Placement (shown): `UPCOMING` (stored `PENDING_START`) -> `ACTIVE` -> `ENDING` (stored ACTIVE + `notice_on`) -> `ENDED` (completed) or `TERMINATED` (stored ENDED +
`end_kind = TERMINATED` + `end_reason`). Older rows (no `end_kind`) stay "Completed".

## Flow
1. Account Manager (`offers.manage`): `POST /offers` (Draft, or `extend: true`), `PUT /offers/{id}`, `POST /offers/{id}/extend`, `POST /offers/{id}/withdraw`.
   The consultant is told through the existing OFFER notification category. Each change writes an offer event (actor kind MEMBER / CONSULTANT / SYSTEM) and one org audit row.
2. Consultant accepts: `PlacementHireService` creates the placement (PENDING_START when the start date is ahead, ACTIVE when today or past), records a HIRED event,
   and links `cws_offer.placement_id` / `talent_placement.offer_id`. If it cannot (no client linked, the consultant still has an open placement) the offer stays Accepted,
   says why, and `POST /offers/{id}/placement` retries.
3. `PlacementStartJob` (daily) turns PENDING_START into ACTIVE on the start date. `OfferExpiryJob` (nightly) expires open offers past their deadline.
4. `POST /placements/{id}/notice` (Ending until the end date) and `POST /placements/{id}/terminate` (reason required). `PlacementAvailabilitySync` keeps the consultant's
   availability in step (On a project, On notice, Available) and never overrides Not available.

## Submissions (records only)
`GET /api/orgs/{orgId}/submissions[/counts]` needs `submissions.record`; there is no write route. The consultant submits, the marketer records the fact on the Marketing
workspace, Kiwiply never submits.

## Pages
`/w/accounts/offers` (tiles, tabs Open / Drafts / Accepted / Closed / All, search, Record an offer dialog, detail drawer with the timeline; cards under the tablet
width) and `/w/accounts/submissions` (tiles, status tabs, search, table or cards). Both are listed in the Accounts menu (`workspaces.json`), which already named them.

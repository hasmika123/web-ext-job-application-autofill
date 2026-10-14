# Consultant workspace: Offers

Route `/w/consultant/offers` (root `data-consultant-offers`), board `design/enterprise-consultant/offers.webp`. The consultant reviews the offers made
to them, compares up to three side by side, and answers an open offer (accept, decline, ask to negotiate) for themselves.

## Rules this page keeps
- Own data only. Gate = `ConsultantHomeService.requireSelf` (Consultant role from data, own `consultant_profile`); anything else is the generic 404. The three
  writes additionally need `offers.respond` (`authorization.require`, `Beneficiary.SELF`).
- **Record-only.** Money is stored as minor units (`bigint`) plus a currency; there is no float, bank, tax or payment column. Nothing is signed, sent to a client,
  paid or submitted by Kiwiply. The accept dialog says so in plain words.
- **Accepting does not create a placement.** Gap: the offer -> placement hand-off (docs 35, "accepting an offer is the consultant's placement confirmation") belongs
  to the employer / ops side, which is not built here. `application_id` / `requirement_id` are stored (nullable) so that side can link them later.
- Free text (`response_note`: decline reason 0..300, negotiate note 3..300) goes through `SensitiveContent`; no PII columns.
- Effective status: an open offer (PENDING_REVIEW or NEGOTIATION) whose deadline day is before today (UTC) reads as **EXPIRED** everywhere (rows, tiles, filter,
  detail). The deadline day itself is still open. Expired offers cannot be accepted, declined or negotiated (409 `OFFER_EXPIRED`).

## Endpoints (`/api/orgs/{orgId}/me-workspace/offers`, all `@OrgPermissionRequired`)
| Verb + path | Notes |
|---|---|
| `GET ` | page: tiles, first filtered page, `compare` (every offer up to 50, newest first), `activity` (latest 8 events), `companies` (filter options). Query: `status, company, workMode, q, sort, page, size` |
| `GET /list` | the offers table only, same query. `status` PENDING_REVIEW\|NEGOTIATION\|ACCEPTED\|DECLINED\|EXPIRED, `workMode` REMOTE\|HYBRID\|ONSITE, `q` (<= 80, `%` and `_` stripped; matches company, role, package text), `sort` recent (default) \| deadline \| company \| start, `size` 1..50 (default 10), else 422 |
| `GET /{id}` | package, benefits text, response note, timeline, `canRespond`, `canNegotiate` |
| `POST /{id}/accept` | PENDING_REVIEW\|NEGOTIATION -> ACCEPTED; keeps an earlier negotiation note |
| `POST /{id}/decline` | body `{reason?}` (0..300, scanned); PENDING_REVIEW\|NEGOTIATION -> DECLINED |
| `POST /{id}/negotiate` | body `{note}` (3..300, scanned); PENDING_REVIEW -> NEGOTIATION only |

State-rule violations (already answered, wrong state) are 409 `OFFER_NOT_OPEN` with a plain message; past the deadline 409 `OFFER_EXPIRED`. Each success writes one
`cws_offer_event` (ACCEPTED / DECLINED / NEGOTIATING); a refused call writes none. The transition is one atomic `update ... where status in (...) and deadline ok`.

## Tiles
Total Offers, Pending Review, Accepted, Negotiation, Declined, all by effective status (an expired offer is counted in Total only). "vs last month": the value now
against how many of those same offers were created more than 30 days ago; no delta when that earlier count is 0 (the UI then shows nothing); equal counts show
"no change". Six weekly sparkline points. The board's first dropdown ("All Offers (n)") is the **sort** control (its first option is the default order and carries the
count); status / company / work mode are real filters.

## Real vs SAMPLE
- Real: every number, the filters / search / sort / paging, the compare table (client-side over the API's `compare` rows), the detail, the three responses and
  their events.
- **SAMPLE / demo-seeded stand-ins:** the offers themselves (employer / marketer side not built; `sample_data = true`, a Sample mark and a line under the filters),
  including their package text, benefits text and initial timeline. Seeder: `ConsultantWsOffersDemoSeeder` (5 offers per Anika / Ben / Sam: 2 pending, 1
  negotiation, 1 declined, 1 accepted, with events; skips a consultant who already has any offer; touches only its own tables).

## Tables (`20261103140000_ent_cws_offers.xml`, not registered in master.xml)
- `cws_offer`: org_id, consultant_id (composite FK consultant_profile), requirement_id (nullable composite FK client_requirement), application_id (nullable composite
  FK talent_application), client_name, role_title, package_summary(300), benefits_summary(500), base_salary_minor, total_comp_minor, currency, work_mode, start_date,
  offer_deadline, status, responded_at, response_note(300), sample_data, timestamps; `uk_cws_offer_org_id (org_id,id)`; index `(org_id, consultant_id, status, offer_deadline)`.
- `cws_offer_event`: org_id, consultant_id, offer_id (composite FK cws_offer), kind, label, occurred_at; indexes start with org_id.

## Code
API: `domain/ent/consultantws/CwsOffer`, `CwsOfferEvent`; `repository/ent/consultantws/CwsOfferRepository`, `CwsOfferEventRepository`;
`service/ent/consultantws/ConsultantOffersService`, `ConsultantOffersDTO`, `ConsultantWsOffersDemoSeeder`; `web/rest/ent/consultantws/ConsultantOffersResource`.
Web: `lib/ent/consultant-ws/offers.ts` (+ test), `components/ent/consultant-ws/OffersPage.tsx` (+ test), route `(tenant)/%5Ft/w/consultant/offers/page.tsx`, BFF
`app/api/orgs/[orgId]/me-workspace/offers/**` (`_bff/shared.ts`, `route.ts`, `list`, `[id]`, `[id]/accept|decline|negotiate`).
Tests: `ConsultantOffersResourceIT` (13 cases), `offers.test.ts`, `OffersPage.test.tsx`.

## OrgIsolationIT rows to add
```
GET  /api/orgs/{orgId}/me-workspace/offers                     Case.consultantRead()
GET  /api/orgs/{orgId}/me-workspace/offers/list                Case.consultantRead()
GET  /api/orgs/{orgId}/me-workspace/offers/{id}                Case.consultantRead()
POST /api/orgs/{orgId}/me-workspace/offers/{id}/accept         Case.consultantWrite(null, 200)
POST /api/orgs/{orgId}/me-workspace/offers/{id}/decline        Case.consultantWrite("{\"reason\":\"Hijacked decline\"}", 200)
POST /api/orgs/{orgId}/me-workspace/offers/{id}/negotiate      Case.consultantWrite("{\"note\":\"Hijacked negotiation\"}", 200)
```
`{id}` must be a `cws_offer` id of org A's consultant, in PENDING_REVIEW with a deadline in the future (the write cases need an open offer; e.g. a world helper that
saves one via `CwsOfferRepository`, like the submissions / opportunities helpers).

## Known gaps
- No placement is started on accept (employer / ops side). No notification to the marketer yet (the `ORG_OFFER` kind exists; nothing publishes it from here).
- Offers cannot be created or edited from the consultant side by design; only the demo seeder makes them until the employer side exists.
- Benefits are free text (`benefits_summary`), not structured; "Total Compensation" is the employer's recorded figure, not computed.
- The Applications page's Offers tile counts applications at stage OFFER and does not read this table; Home shows no offers (left as they are).

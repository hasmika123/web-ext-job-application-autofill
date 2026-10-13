# 35 — Offers → placements, extensions, redeployment, the Timesheets bridge

> Status: design, 2026-10-12 (Session D). Requirements §12–§13 ("placement distinct from application";
> extension or redeployment), ADR-011, **E2 answered 2026-10-12 (record-only finance)**. Build-ready for
> **X10.4, X10.6, X10.8**. Reuses: Timesheets product H (`docs/TIMESHEETS-DESIGN.md` §5: `ops_placement`
> (`consultant_member_id, client_id, vendor_id, title, start_date, end_date, hours_per_week_expected,
> proof_required, pay_type_label W2|1099|C2C|OTHER, status ACTIVE|ON_HOLD|ENDED`), `ops_placement_rate`
> (`effective_from, bill_rate_minor, pay_rate_minor`, unique (placement_id, effective_from)), `ops_client`,
> `ops_vendor`, flag `flag.ops_timesheets` + `opsPilot`/`ops.enabled`), `ShareField.PLACEMENT`
> (SUMMARY: member-declared "placed" flag + date), `NotificationService`, the mascot pose map (Session B).

## 1. Placement is not an application

An **application** is the consultant's own act on a board; a **candidate submission** is the org's
record of presenting them; a **placement** is the *engagement that resulted* — it has a client, a
bill-to party, dates, a rate record, extensions and a successor. Several applications can lead to
zero placements; one placement can exist with no application at all (vendor channel). Hence a
separate table with its own lifecycle, linked back through `offer_id` → `submission_id` → `match_id`
(→ `pipeline_application_link`), never the other way.

## 2. `placement` (final DDL)

| column | notes |
|---|---|
| id, org_id | |
| offer_id | FK offer (ACCEPTED) — NOT NULL in V2 (placements are created from accepted offers; "legacy" placements without an offer are entered through a DRAFT offer the AM accepts on the consultant's behalf **only with the consultant's one-tap confirmation**, see §4) |
| consultant_member_id, client_id (end client), via_client_id NULL (vendor), bill_to_client_id | who we invoice (records) |
| title (200), work_mode, location (300) | |
| start_date, end_date NULL, expected_end_date NULL | |
| status | PENDING_START · ACTIVE · ON_HOLD · EXTENDED · ENDED · TERMINATED |
| end_reason (40) NULL | COMPLETED · CLIENT_ENDED · CONSULTANT_LEFT · CONVERTED_FTE · REDEPLOYED · OTHER |
| extension_of_placement_id NULL, redeployment_of_placement_id NULL | chains (§3) |
| bill_rate_minor NULL, pay_rate_minor NULL, currency, rate_basis HOURLY\|DAILY\|MONTHLY | **snapshot records** from the offer; the effective-dated history lives in `ops_placement_rate` once bridged |
| ops_placement_id NULL | Timesheets bridge (§5) |
| consultant_confirmed_at NULL | the consultant's "yes, I started" (SUMMARY `PLACEMENT` flag source) |
| created_by_member_id, created_at, updated_at | |

Visibility: the consultant sees their placement (title, client, dates, pay rate when
`ops_settings.show_pay_to_consultant` or always for the offer's `pay_rate_minor` — the consultant
accepted that number); marketers (ASSIGNED) see everything except `bill_rate_minor`; AM/finance see all.
`bill_rate_minor` never appears in consultant or marketer DTOs (`PlacementDtoRedactionTest`).

## 3. State machine (in `PipelineTransitions`)

| from | to | actor | permission | guards | effects | notifications |
|---|---|---|---|---|---|---|
| — | PENDING_START | SYSTEM on `offer` ACCEPTED | — | consultant accepted | row; submission stays OFFERED; requirement `filled += 1` when ACTIVE | AM, marketer `ORG_PLACEMENT`; consultant `ORG_PLACEMENT` "Starts 3 Nov at Globex" |
| PENDING_START | ACTIVE | SYSTEM at `start_date` (daily job) **or** CONSULTANT ("I started") or AM | `placements.manage` / OWN | — | `consultant_profile.availability_status = ON_PROJECT`, `marketing_status = PAUSED`; Timesheets bridge (§5); the mascot celebration on the consultant's home and the marketer's home (38 §6) | org-wide `ORG_PLACEMENT` to marketer, AM, HR (lifecycle), finance (rates) |
| ACTIVE | ON_HOLD / ACTIVE | AM | `placements.manage` | | ops_placement ON_HOLD mirror | |
| ACTIVE | EXTENDED | AM | `placements.manage` | new `end_date` > old; optional new rates → a new `offer` (DRAFT→EXTENDED→ACCEPTED by the consultant) when **rates change**; dates-only extension needs no offer | the row **stays**; `placement_extension(id, placement_id, from_end_date, to_end_date, offer_id NULL, recorded_by, created_at)` logs each extension; status returns to ACTIVE after recording (EXTENDED is an event-state shown as a chip for 7 days) | consultant, marketer |
| ACTIVE / EXTENDED | ENDED | AM / SYSTEM at `end_date` + 3 days (confirm nudge first) | `placements.manage` | `end_reason` | availability → AVAILABLE with `available_from = end_date`, `bench_since`; marketing_status back to ACTIVE **only if the consultant confirms** ("Market me again?") ; ops_placement ENDED | consultant, marketer (bench alert), HR |
| ACTIVE | TERMINATED | AM | `placements.manage` | reason required | as ENDED | as ENDED + manager escalation (`escalations.manage`) |
| ENDED / TERMINATED | — (redeployment) | AM / MARKETER | `placements.manage` | a new placement with `redeployment_of_placement_id = this.id` is created from a new accepted offer; the chain is a query | | marketer "Redeployed Anika → Initech" |

Extension vs redeployment: *extension* = same client, same placement row, later end date (and
possibly new rates); *redeployment* = new placement (any client) that follows an ended one; the
**bench gap** = `new.start_date − old.end_date` is a metric (X10.7 "time-to-redeploy").

## 4. Consultant-side declaration (X10.6)

- The user app's existing member-declared "placed" flag (`ShareField.PLACEMENT`) is kept for
  non-pipeline placements (a consultant placed through their own efforts). In the consultant
  workspace, "I got placed" opens a sheet: pick a pipeline offer (if any) **or** declare freely
  (company label, start date). A free declaration does **not** create an org `placement` (the org
  would then be asserting a client relationship it doesn't have); it sets the SUMMARY flag and
  nudges the AM "Anika says she started at X — record a placement?".
- Accepting an offer (31 §7) is the consultant's placement confirmation; `consultant_confirmed_at`
  set at ACTIVE when they tap "I started".
- Celebration: one-time mascot card on the consultant's home ("Anika starts at Globex Monday —
  congrats"), on the marketer's assigned-talent card and on the Org Admin dashboard ticker; never
  shown again after dismiss (`localStorage` is not enough — `ui_dismissal(user_id, key)` already
  exists for cards? If not, `notification` with `groupKey=placement:{id}` and `read_at`).

## 5. Timesheets bridge (X10.8) — reuse H, don't rebuild

When a placement becomes ACTIVE **and** the org has Timesheets on (`flag.ops_timesheets` and
`opsPilot`/`ops.enabled`), `OpsPlacementBridge.ensure(placement)`:
1. `client_account.ops_client_id` ← find-or-create `ops_client(name = client.name)`; vendor likewise
   → `ops_vendor`.
2. `ops_placement` ← create with `consultant_member_id, client_id, vendor_id, title, start_date,
   end_date, pay_type_label` (from `offer.employment_label` → W2|1099|C2C|OTHER), `status ACTIVE`,
   `pipeline_placement_id` (**additive column on `ops_placement`**, nullable, indexed; Session H's
   changelog gets an `addColumn` from X10.8).
3. `ops_placement_rate` ← one row `effective_from = start_date` with the snapshot rates (FINANCE-only
   visibility rules of H apply from here on).
4. Later rate changes are made in H (`ops_placement_rate` history); the pipeline snapshot is not
   updated (it is the *offer* record). Status changes ACTIVE/ON_HOLD/ENDED mirror one way
   pipeline → ops; H never writes pipeline rows.
Without Timesheets on, the bridge is a no-op and finance pages (36) show the pipeline's snapshot
records only, with "Turn on Timesheets to track hours and invoices".

## 6. API summary (`/api/orgs/{orgId}`)

| method | path | permission |
|---|---|---|
| GET/POST | `/offers` · GET/PATCH `/offers/{id}` · POST `/offers/{id}/{extend|withdraw}` | `offers.manage` |
| POST | `/api/me/orgs/{orgId}/offers/{id}/{accept|decline}` `{note?, reason?}` | consultant (`offers.respond`) |
| GET | `/placements?status=&consultant=&client=` · `/placements/{id}` (chain + extensions + ops link) | `placements.view` |
| POST | `/placements/{id}/{start|hold|resume|extend|end|terminate}` | `placements.manage` |
| POST | `/placements/{id}/redeploy` `{offerId}` | `placements.manage` |
| GET | `/api/me/orgs/{orgId}/placements` · POST `/placements/{id}/started` · POST `/placements/declare` | consultant |
| GET | `/placements/{id}/timesheets` (proxy summary from H when bridged) | `placements.view` + `ops.*` rows |

## 7. Tests
`PlacementStateTest` (registry ↔ doc), `PlacementChainTest` (extension log; redeployment chain; bench
gap), `PlacementDtoRedactionTest` (bill rate never to consultant/marketer), `OpsPlacementBridgeTest`
(find-or-create client/vendor; rate row; no-op when off; one-way status mirror),
`PlacementAvailabilityEffectsTest` (ON_PROJECT/PAUSED; back to ACTIVE only on consultant confirm),
`OrgIsolationIT` lines, Playwright `placements.spec.ts` (offer accept at 390 → celebration; placements
board at 1440).

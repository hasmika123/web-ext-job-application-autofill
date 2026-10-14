# Page: Clients (`/w/admin/clients`)

> Branch `ent-clients` (cut from `ent-boards`). Board: `design/enterprise-more/clients.png`. Data: `client_account`, `client_contact`, `client_requirement`,
> `talent_application`, `talent_placement` of the talent foundation, plus the additive `20261020040000_ent_clients.xml` (below). Owner docs: 34, 38.

## What it does

Four KPI tiles (Total Clients, Active Requirements, New Clients This Month, Placements via Clients: value, honest "vs last month", 8-week sparkline),
the bee help card, four tabs (Client Directory, Contacts, Requirements, Activity), a searchable filterable sortable paged directory (table, grid
or phone cards), a right-hand drawer docked under the bee card (Overview / Contacts (n) / Requirements (n)), Add Client, Add Contact, Create
Requirement (the Jobs dialog with the client chosen), View Placements. State lives in the address (`?tab=&q=&industry=&health=&status=&sizeBand=&managerId=&sort=&page=&size=&view=grid&client=12&dtab=contacts`).

## Schema (additive, `20261020040000_ent_clients.xml`)

`client_account` gains `size_band`, `location`, `client_since`, `about` (all nullable); new `client_note(org_id, client_id, author_member_id, body, created_at)`
with composite tenant FKs. No phone, no date of birth, no document or bank number anywhere; a contact is a name, a title and a WORK e-mail.

## API (`OrgClientResource`, `/api/orgs/{orgId}/clients`)

| Call | Needs | Notes |
|---|---|---|
| `GET /` | `clients.view` | `q` (2-80: name, industry, account manager), repeatable `industry`, `health`, `status`, `sizeBand`, `managerId`, `sort` (name, industry, requirements, consultants, manager, health, activity; 400 `SORT_INVALID`), `dir`, `page`, `size` 1-100; `X-Total-Count` |
| `GET /summary` | view | four tiles + weekly series, facets, the health rule's two thresholds, `managerOptions` (only for a caller who may manage), `access` |
| `GET /contacts`, `/requirements`, `/activity` | view | the three other tabs (paged lists; the feed merges client, contact, note, requirement, application and placement rows) |
| `GET /{id}` | view | drawer: facts, health + reason, contacts, requirements, recent submissions, notes; `ETag` = version |
| `POST /` | `clients.manage` + `Idempotency-Key` (required) | 201; 409 `DUPLICATE_CLIENT` (case-insensitive); audit `CLIENT_CREATE` |
| `PATCH /{id}` | manage + `If-Match` (428/412) | autosave; unknown key 422; a no-op writes nothing; audit `CLIENT_STATUS` / `CLIENT_UPDATE` |
| `POST /{id}/contacts` | manage | consumer mail domains 422 `WORK_EMAIL_REQUIRED`, same e-mail 409 `DUPLICATE_CONTACT`; audit `CLIENT_CONTACT_ADD` |
| `PATCH /{id}/contacts/{cid}` | manage | name, title, email, role, status `ACTIVE`/`LEFT` (the Undo); audit `CLIENT_CONTACT_UPDATE` |
| `POST /{id}/notes` | manage | 1-1000 chars through the PII scanner; audit `CLIENT_NOTE_ADD` never carries the text |

Create Requirement posts to the Jobs API (`requirements.manage`). Every refusal (no key, other tenant, unknown or archived id, closed organization for a
write) is the generic **404**, never 403. Unknown JSON properties are refused. `OrgIsolationIT` has all eleven routes.

## The health rule (computed, never stored; `ClientHealth`)

Last activity = the newest of: the account's own change, a requirement posted or closed, an application moving, a placement starting or ending, a contact
added, a relationship note. "In flight" = an open requirement or a consultant currently placed. Thresholds are **organization settings**
(`org.clients.healthy_days` default 14, `org.clients.at_risk_days` default 45; org override in `org_setting`, global in admin Settings; at-risk is always above healthy).

- status INACTIVE or PROSPECT -> Neutral (not rated)
- quiet for at-risk days or more -> At Risk
- quiet for healthy days or less and in flight -> Healthy
- anything else -> Neutral

The drawer prints the rule's sentence for that client. The consumer mail list is the setting `org.clients.consumer_email_domains`.

## KPI formulas (`ClientKpis`, pure, unit tested)

Total = accounts not archived (last month = created 30+ days ago); Active Requirements = status OPEN (last month = open then); New This Month = created in the
last 30 days (last month = the 30 days before); Placements via Clients = every placement (last month = started 30+ days ago). No client older than a month = no
previous and no delta (never estimated); a zero previous gives the plain difference.

## Real vs empty-state

Everything on the page is read from rows and every button writes through the API. Honest gaps:

- No logos or photos exist: company tiles and avatars are initials; the bee card's banner is a soft gradient with the enterprise bee, not the board's office illustration.
- Row checkboxes only select (Copy names, Clear); there are no bulk status changes.
- `View Placements` and `Recent Submissions > View All` link to `/w/admin/placements?client=` and `/w/admin/applications?client=` only when the member's menu lists those pages (the Placements page is another branch).
- "Ask a question..." opens the shell's help list (no assistant yet).
- Demo extras: `ClientsDemoSeeder` (called after the talent seed, same switches) fills location/size/client-since/about, spreads account managers, adds notes and grows Acme to 24 clients (Beta 6) with contacts, requirements and ended placements. Real tenants get none of it.
- Sorting, filtering and paging are done in memory after aggregate queries (fine for hundreds of clients).

## Tests

API: `ClientHealthTest`, `ClientKpisTest`, `OrgClientResourceIT`, the clients rows of `OrgIsolationIT`, `TalentSchemaIT` (18 repositories). Web: `clients.test.ts`, `clients-bff.test.ts`,
`ClientsPage.test.tsx`; journey `e2e/journeys/tenant-clients.spec.ts` (`playwright.real-clients.config.ts`, desktop, 390 px phone, Beta cannot see Acme).
The journey writes: reset the database to run it again from the seed. Screenshots: `design/enterprise-more/built/clients-*.png`.

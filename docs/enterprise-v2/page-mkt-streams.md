# Marketing workspace: Job Streams (`/w/marketing/streams`)

Branch `mkt-streams` (off `ent-talent-marketer`). Board: `design/enterprise-marketer/streams.webp`. Permission `matches.run` (read and write). Rules: `mkt-page-brief.md`.

## What it is
Org-level configuration + history of job-source feeds (LinkedIn Jobs, Indeed, Dice, ZipRecruiter, Client Portal, Vendor Feed, ...). The page **records settings only**:
add / configure / pause / resume a stream, toggle a rule. It never calls or scrapes an external site (locked decision: ATS public job-board APIs plus one
licensed aggregator, never scraping) and nothing submits for a consultant (E1). The sync log is written by `MktStreamsService.recordSync(orgId, streamId,
openings, ok, message, at)`, the one method a future connector calls (writes the log row, updates the stream's `last_sync_at` / `new_openings` /
`openings_delta_pct`, sets status ERROR on a failed run of an active stream, back to ACTIVE on a good one, raises an ERROR alert on failure).

## Endpoints (`MktStreamsResource`, base `/api/orgs/{orgId}/mkt/streams`)
| Method + path | What |
|---|---|
| `GET` | the whole board in one call: `{kpis, streams:{items,total,page,size}, filters, activity, chart, alerts, rules}`. Query: `q`, `source`, `status` (ACTIVE/PAUSED/ERROR), `client`, `showInactive` (default false hides paused), `page`, `size` (cap 100), `sort` (`created|source|status|lastSync|openings`, `-` = desc), `days` (7 or 14, chart) |
| `POST` | add a stream `{sourceLabel, subtitle?, syncEveryMinutes (5-1440), keywords?, clientScope?}` -> 201 row |
| `PATCH /{streamId}` | configure (only the fields sent) |
| `POST /{streamId}/pause`, `/resume` | status PAUSED+inactive / ACTIVE+active |
| `PATCH /rules/{ruleKey}` | `{enabled?, value?}` for DEFAULT_KEYWORDS, CLIENT_MAPPING, DUPLICATE_DETECTION, AUTO_PUBLISH (creates the row if missing) |

Every call: `MktScope.resolve(me, "matches.run")` (generic 404 for non-members / flag off / no permission). Streams are not per-consultant data, so the
consultant scope set is not applied. Other-tenant stream id = 404. Writes are audited (`MARKETER_STREAM_CREATE|UPDATE|PAUSE|RESUME|RULE`, target `STREAM`),
free text goes through `SensitiveContent`. BFF: `web/src/app/api/orgs/[orgId]/mkt/streams/**` (shape checks only).

## Tables (`20261104020000_mkt_streams.xml`)
`mkt_job_stream` (the contract other pages read: id, org_id, source_label, subtitle, status ACTIVE/PAUSED/ERROR, active, sync_every_minutes, keywords text
(comma separated), client_scope, last_sync_at, new_openings, openings_delta_pct decimal(7,2), created_at, updated_at; unique (org_id,id)),
`mkt_stream_sync_log` (composite FK, synced_at, openings, status OK/FAILED, message), `mkt_stream_alert` (nullable composite FK to stream, severity
ERROR/WARNING, title, detail, raised_at, resolved_at), `mkt_stream_rule` (rule_key unique per org, value text, enabled, updated_at). Entities
`domain.ent.mkt.Mkt*`, repositories `repository.ent.mkt.Mkt*Repository` (every method takes `orgId` first).

## Numbers (all computed from rows; "now" = request time UTC)
- **Active Job Streams** = streams with `active`; vs last month = minus those created before now-30d; sparkline = 8 weekly buckets.
- **Sync Health** = OK share of the last 42 syncs; previous = the 42 before; delta in relative percent; no previous window = no chip.
- **New Openings Captured** = openings of OK syncs in the last 7 days vs the 7 before.
- **Stream Errors** = alerts raised in the last 30 days vs the 30 before (lower is better, chip is green when it falls).
- Table row: Openings = stream `new_openings`, delta = `openings_delta_pct` (set by `recordSync` against the previous OK run; omitted when unknown).
  Last Sync = `last_sync_at` ("Never" when empty). Keywords cell shows as many keywords as fit 32 characters, then `+n`.
- Sync Activity = newest sync-log rows (6 shown, "View all" expands to 20). Openings Captured = per-day sums of OK-sync openings per stream, stacked.
  Alerts = open alerts (4 shown, "View all" expands to 20). Rules always lists the four keys (off when no row).

## Demo data (`MktStreamsDemoSeeder`)
Starts on `ApplicationReadyEvent` (after `EnterpriseDemoBootstrap`, so no shared class was edited); same switches (`DEMO_ENABLED` + `ENT_DEMO_SEED`, never
prod); idempotent per org (skips when streams exist). Acme: the board's six streams, 14 days of one sync per stream per day (6 a day), two old FAILED
runs, 4 open alerts + 9 resolved ones from last month, the four rules. Beta Talent: three streams, no alerts.

## Web
`web/src/components/ent/marketer-ws/streams/` (`JobStreamsPage`, `StreamDialogs`), `web/src/lib/ent/marketer-ws/streams.ts` (+`streams-bff.ts`),
dev mock `web/scripts/mock-mkt-streams.mjs`, art `web/public/ent/marketer/streams/` (six logos + assistant photo, cropped from the board).
New shared visuals in `@kiwiply/ui` (`packages/ui/src/enterprise`): `StackedBarChart` (`BarChart` does not stack), `DatabaseIcon`, `FolderIcon`.

## Known gaps / deviations
- Nothing syncs yet (no connector): a stream added now shows "Never" and 0 openings until a connector calls `recordSync`. Demo rows are invented.
- The three KPI "vs ..." captions say what is really compared (`vs prior syncs`, `vs last week`) where the board repeats "vs last month".
- The tile "Stream Errors" counts alerts (demo: 4, the board shows 3); its delta chip uses lower-is-better colouring (green when it falls) where the board paints it red.
- Checkboxes select rows but there are no bulk actions (the board shows none). The Assistant's "Ask a question" opens the shared help panel.
- `OrgIsolationIT.COVERAGE` has no rows for the six new routes (the brief forbids editing that file); the owner must add them. Testcontainers ITs for the real stack were not written beyond the unit/MockMvc tests (see report).

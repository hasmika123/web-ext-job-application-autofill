# Marketing workspace page: Follow-ups (`/w/marketing/followups`)

Branch `mkt-followups` (off `ent-talent-marketer`). Board: `design/enterprise-marketer/followups.webp`. Permission `followups.manage` (ASSIGNED for a Marketing Specialist, ORG sees all).
The table and the service are shared on purpose: the Tasks page and the Home board's "Today's Follow-ups & Tasks" card read the same rows through `MktFollowupService`.

## Endpoints (`/api/orgs/{orgId}/mkt/followups`, every one through `MktScope.resolve(me, "followups.manage")`; non-members, flag off, missing permission, a consultant or row outside the caller's set: generic 404)
| Route | What |
|---|---|
| `GET ?window=THIS_WEEK\|LAST_WEEK\|THIS_MONTH&size=&q=` | The whole board in one call: `kpis[dueToday, overdue, completedToday, waiting]` (value, deltaPct or null, 8-day sparkline), `today`, `overdue`, `upcoming` (`{items,total,page,size}`), `insights`. |
| `GET /list?bucket=TODAY\|OVERDUE\|UPCOMING\|COMPLETED\|WAITING&page&size&q&sort=dueAt\|priority\|consultant[,desc]` | One bucket as a page (size cap 100). For the Tasks page. |
| `POST /` | Create a follow-up for one of the caller's consultants (optional application of that consultant, optional client). Record only. |
| `PATCH /{id}/status` | PENDING, IN_PROGRESS, SCHEDULED, NOT_STARTED, WAITING, COMPLETED (completing stamps `completed_at`, leaving it clears it). OVERDUE is derived and refused. Logs `STATUS_CHANGED`. |
| `POST /{id}/complete` | Shortcut for COMPLETED. |
| `POST /{id}/call` `{note, awaitingReply?}` | Logs `CALL_LOGGED`; `awaitingReply` parks the item as WAITING, otherwise a not-started item becomes IN_PROGRESS. |
| `POST /{id}/reminder` `{note?}` | Logs `REMINDER_SENT`: a recorded reminder REQUEST. **Nothing is emailed or messaged** (E1); the reply carries `emailed: false`. |

Writes audit as `MARKETER_FOLLOWUP_CREATE|STATUS|CALL|REMINDER` (target FOLLOWUP). Free text (title, detail, note) is trimmed, refused with angle brackets/control characters, and goes through `SensitiveContent` (422).
No `Idempotency-Key` (the ledger is used for bulk member actions only); every write is idempotent enough to repeat (status set, events append).

## Tables (`20261104010000_mkt_followups.xml`, contract other pages read)
- `mkt_followup`: id, org_id, consultant_id (composite FK consultant_profile), application_id null (FK talent_application), client_account_id null (FK client_account), title, detail (the "Alex Morgan - Java Developer" sub line), counterpart_label, channel PHONE/EMAIL/TEAMS/CHAT/NOTE, priority HIGH/MEDIUM/LOW, status PENDING/IN_PROGRESS/SCHEDULED/NOT_STARTED/WAITING/COMPLETED, due_at, completed_at, owner_member_id (the marketer, composite FK org_member), created_at, updated_at. Unique `(org_id,id)`, indexes start with org_id.
- `mkt_followup_event`: id, org_id, followup_id (composite FK), kind CALL_LOGGED/REMINDER_SENT/STATUS_CHANGED, note, occurred_at, by_member_id.

## Windows and formulas (UTC, "now" from the request clock)
- **Overdue** (derived): status is not COMPLETED and `due_at < now`. This includes WAITING items past their due time (chasing is due).
- **Today**: open (not COMPLETED, not WAITING) with `now <= due_at < end of the UTC day`. **Upcoming**: open with `due_at >= end of day`. Nothing is in two lists. WAITING items appear in no list until they pass their due time; they are counted by "Waiting on Response".
- Due Today vs last week = same moment last week (`due_at` from `now-7d` to the end of that day, any status). Overdue vs last week = items that were already overdue at `now-7d` (created then, due before it, not completed by then). Completed Today vs last week = completed from midnight to the same moment last week. Waiting has no history table: its delta is omitted (no chip). A delta with no previous value is null.
- Insights window: THIS_WEEK = last 7 days, LAST_WEEK = the 7 before, THIS_MONTH = last 30 days. Completed = `completed_at` in the window. Still Waiting = WAITING rows whose last change is in the window. **Response rate = completed / (completed + waiting)**. **Avg response time** = mean over completed items of hours from the first CALL_LOGGED/REMINDER_SENT event to `completed_at` (items with no outbound touch are skipped); null when nothing qualifies.

## Demo data (`MktFollowupsDemoSeeder`)
Runs on `ApplicationReadyEvent` (after `EnterpriseDemoBootstrap` seeded tenants and talent; no shared class edited), same switches as the other demo seeds (`DEMO_ENABLED`, `ENT_DEMO_SEED`, never prod). Per marketer with assignments, from that marketer's consultants: 12 due later today, 6 overdue, 14 upcoming, 18 completed today, 14 waiting, plus 24 completed over the last two weeks (with the reminder/call events behind the response time). Idempotent: an org that already has follow-ups is skipped. Titles/counterparts are the board's.

## Web
- Page `web/src/components/ent/marketer-ws/followups/` (`FollowupsPage`, `FollowupTable`, `FollowupsRail`, `ActionDialog`), lib `web/src/lib/ent/marketer-ws/followups.ts`, BFF `web/src/app/api/orgs/[orgId]/mkt/followups/**`, dev mock `web/scripts/mock-mkt-followups.mjs` (the board's rows), art `web/public/ent/marketer/followups/` (16 consultant faces and 6 client logos cropped from the board).
- Send Reminder / Log Call / Update Status (toolbar, Quick Actions and each row's menu) act on the checked rows (or the one row) through a small dialog; with nothing checked they ask for a selection. "View all" expands the card in place (the page asks for up to 100 rows). Due Time sorts the Today table.
- New shared visuals in `packages/ui/src/enterprise/followup-icons.tsx` (`HourglassIcon`, `TeamsIcon`) plus one export line.

## Real vs empty
Everything is real rows. An org with no follow-ups draws zero tiles, "You're all caught up.", "Nothing is overdue.", "No upcoming follow-ups." and "No follow-up activity in this window yet.". `avatarUrl` is always null from the real API (initials), the mock returns the board's cropped faces.

## Known gaps
- Waiting on Response has no delta (no status history). Quick Actions' Send Reminder subtitle reads "Request a reminder (nothing is emailed)" instead of the board's "Email client or consultant" because that would promise outbound mail the build must not send (E1).
- The page header search box is the shell's global search, not a follow-up filter (`q` is supported by the API).
- Day boundaries are UTC, not the org's time zone.
- `OrgIsolationIT.COVERAGE` was not extended (brief says not to edit that file): the owner should add the `/api/orgs/{orgId}/mkt/followups/**` rows.
- `MktFollowupsIT` (Testcontainers) is written and compiles but could not be run here (no Docker).

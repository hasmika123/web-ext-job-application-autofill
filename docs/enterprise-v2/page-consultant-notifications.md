# Consultant workspace: Notifications

Route `/w/consultant/notifications` (root attribute `data-consultant-notifications`), board `design/enterprise-consultant/notifications.webp`.
The consultant's own notification feed, tiles, per-category counts and delivery preferences. Branch `ent-talent-consultant`.

## What is real and what is not

- **Real:** every notification is derived from the signed-in consultant's own rows and persisted. Every number comes from `cws_notification`.
- **No SAMPLE data.** Nothing on this page is a placeholder. The producers of the other roles (marketer messages, applications events) are not
  built, so the **Applications** and **Messages** categories stay empty (their tabs show `(0)`) until those roles write notifications. This is
  honest, not hidden.
- **Nothing is ever sent.** No email, SMS or push is sent from here. The email / in-app switches are stored preferences only. **SMS cannot be
  switched on:** the API refuses it (422), the column is always false, no phone number is stored, and the UI shows "SMS isn't available yet" with the
  SMS control disabled and off.
- **No PII, no free text from the user.** The writes carry ids, a snooze time and booleans only, so there is nothing to run through the PII scanner.
  Titles and bodies are written by the generator from stored job titles, company names and dates.

## Endpoints (all under `/api/orgs/{orgId}/me-workspace/notifications`)

Gate for every route: `ConsultantHomeService.requireSelf` (Consultant role from data, permission `opportunities.respond`, own `consultant_profile`),
otherwise the generic 404. A notification that is not the caller's, belongs to another tenant, does not exist or is deleted is the same generic 404.
A batch that contains one foreign id changes nothing (all or nothing).

| Verb + path | Body | Result |
| --- | --- | --- |
| `GET ` | query `status` (ACTIVE default, ALL, UNREAD, READ, RESOLVED, SNOOZED), `category`, `priority`, `q` (80), `period` (TODAY, WEEK default, MONTH), `page`, `size` (1 to 50, default 10) | Runs `generateFor` first, then tiles, per-category tab counts, one page of the feed, by-category tiles for the period, preferences, `muted`. 422 on a bad parameter. |
| `POST /read` | `{ids:[..], read:true|false}` (1 to 50 ids) | `{changed}`; repeating changes nothing |
| `POST /resolve` | `{ids}` | `{changed}`; also marks read |
| `POST /snooze` | `{ids, until}` ISO instant, future, at most 14 days away | `{changed, until}`; 422 otherwise; 409 `NOTIFICATION_RESOLVED` for a resolved one |
| `POST /delete` | `{ids}` | `{changed}` soft delete |
| `DELETE /{id}` | none | `{changed}`; a second delete is 404 |
| `POST /mark-all-read` | none | `{changed}` (unresolved, unread, own) |
| `POST /mute-non-critical` | none | `{previous, prefs, muted}`: switches off JOB_MATCH, APPLICATION, MESSAGE, REMINDER; INTERVIEW, APPROVAL, OFFER stay on; `previous` feeds Undo |
| `PUT /preferences/{category}` | any of `{enabled, email, inApp, sms}` (only those present change) | `{prefs, muted}`; 422 for an unknown category or `sms:true` |
| `PUT /preferences` | `{items:[{category, enabled?, email?, inApp?}]}` | all or nothing (used by Undo after Mute) |

Permissions: the gate only (the page has no family permission of its own; `self.share_scope.set` is not needed).

### Rules worth knowing

- **Status of a row:** RESOLVED beats SNOOZED (snoozed_until in the future) beats READ beats UNREAD. `status=ACTIVE` (the page default) is the inbox:
  unread plus read, not resolved, not snoozed. `ALL` is everything that is not deleted. View Archived is `status=RESOLVED`.
- **Tab counts** follow the status, priority and search filters (not the category). `ALL` is their total.
- **Delete is soft** (`deleted_at`): the row leaves the feed and its source key stays, so the same source event is not turned into a new row.
- **Preferences drive generation:** a category that is switched off, or whose in-app channel is off, creates no new notification (existing ones stay).

## Generation: `ConsultantNotificationGenerator.generateFor(consultant)`

Idempotent: every source event has a key (`source_key`), unique per consultant, so it creates at most one row, deleted rows included. Runs at the start
of every `GET` (and from the seeder). A race with a second request only loses that call's generation (unique constraint, caught).

| Source (the consultant's own rows) | Category | Key | Priority | Action |
| --- | --- | --- | --- | --- |
| `requirement_match` created in the last 7 days, not DISMISSED / ASSIGNED (max 10) | JOB_MATCH | `match:{id}` | HIGH from score 85, else MEDIUM | View `/w/consultant/matches` |
| `requirement_match` ASSIGNED with no consultant response yet (`cws_opportunity_response` missing or NEW) | JOB_MATCH | `opp:{id}` | HIGH when due within 2 days, else MEDIUM | Respond `/w/consultant/opportunities` |
| `cws_submission` PENDING_APPROVAL | APPROVAL | `submission:{id}` | HIGH when due within 48 h, else MEDIUM | View `/w/consultant/submissions` |
| `talent_interview` SCHEDULED within 48 h | INTERVIEW | `interview:{id}` | HIGH | View `/w/consultant/interviews` |
| `cws_offer` open (pending review / negotiation) with a deadline within 7 days | OFFER | `offer:{id}` | HIGH within 3 days, else MEDIUM | View `/w/consultant/offers` |
| `cws_task` not DONE, due today or overdue | REMINDER | `task:{id}:{dueOn}` | HIGH if overdue or HIGH task, LOW if LOW task, else MEDIUM | Snooze (in place; the title links to `/w/consultant/tasks`) |
| `consultant_profile.profile_completeness` below 100 | REMINDER | `profile:incomplete` | LOW | Update `/w/consultant/profile` |

- The creation time is the event's own time for matches, opportunities and submissions (so "2 hours ago" is true); for interviews, offers, tasks and
  the profile it is the moment the notification was created.
- **Self-closing:** an unresolved notification whose source no longer applies (submission decided, task done, interview started, offer answered or
  past, profile complete) is resolved automatically on the next generation. Match notifications simply age and stay.
- `action_href` is validated by `CwsNotification.validHref` (`/w/consultant/...` internal paths only, optional plain query); the web side also
  re-checks it (`safeHref`) and never links anywhere else.

## Tiles

Unread, High Priority and Upcoming Reminders (unresolved REMINDER) are rebuilt "as of" a week ago from the rows' own timestamps (created, read,
resolved, deleted), so "+3 since last week" is a real comparison; a snooze in progress hides a row now but is not replayed into the past. Today
compares with yesterday ("+2 from yesterday"). Resolved This Week compares the last 7 days with the 7 before, as a percent that is **null (no delta
drawn) when the earlier value is 0**. Every tile has six sparkline points. Notifications by Category: counts created in the period (today / last 7
days / last 30 days) against the period before; the percent is null when the earlier count is 0 (the tile says "New this period" or "None yet").

## New tables (`20261103160000_ent_cws_notifications.xml`, not yet in master.xml)

- `cws_notification`: `org_id`, `consultant_id` (composite FK to `consultant_profile`), `category`, `title(160)`, `body(300)`, `priority`,
  `action_label`, `action_href`, `related_type`, `related_id` (no FK), `source_key` (unique with org and consultant), `read_at`, `resolved_at`,
  `snoozed_until`, `deleted_at`, `created_at`. Index `(org_id, consultant_id, created_at)`.
- `cws_notification_pref`: `org_id`, `consultant_id` (composite FK), `category`, `email`, `in_app`, `sms` (always false), `enabled`, `updated_at`;
  unique `(org_id, consultant_id, category)`.

Added beyond the brief's column list: `source_key` (the idempotency key) and `deleted_at` (soft delete, so a deleted notification is not regenerated).

## Code

- API: `domain/ent/consultantws/CwsNotification`, `CwsNotificationPref`; `repository/ent/consultantws/CwsNotificationRepository`,
  `CwsNotificationPrefRepository`; `service/ent/consultantws/ConsultantNotificationGenerator`, `ConsultantNotificationsService`,
  `ConsultantNotificationsDTO`, `ConsultantWsNotificationsDemoSeeder`; `web/rest/ent/consultantws/ConsultantNotificationsResource`.
- Web: `lib/ent/consultant-ws/notifications.ts` (+ test), `components/ent/consultant-ws/NotificationsPage.tsx` (+ test), route
  `app/(tenant)/%5Ft/w/consultant/notifications/page.tsx`, BFF `app/api/orgs/[orgId]/me-workspace/notifications/**` (shared helper in `_bff/shared.ts`).
- Tests: `ConsultantNotificationsResourceIT` (16 tests).

## Seeder

`ConsultantWsNotificationsDemoSeeder.seed()` (idempotent, `@Transactional`): for each consultant who is a real seat (Anika, Ben, Sam) in
`EnterpriseDemoSeeder.ACME_SLUG` / `BETA_SLUG` that has no notification yet, writes the default preference rows and runs `generateFor`. It reads the
other consultant-workspace tables, so **call it after the other consultant-workspace seeders** (matches, opportunities, submissions, interviews,
offers, tasks, profile). Nothing it writes is SAMPLE: the page also generates on its first GET, so Anika has data either way.

## OrgIsolationIT route rows to add (verb, path, valid body)

All under `/api/orgs/{orgId}/me-workspace/notifications`, `{nid}` = any notification id of the org:

- `GET ` (no body)
- `POST /read` `{"ids":[{nid}],"read":true}`
- `POST /resolve` `{"ids":[{nid}]}`
- `POST /snooze` `{"ids":[{nid}],"until":"<an ISO instant 5 hours from now>"}`
- `POST /delete` `{"ids":[{nid}]}`
- `DELETE /{nid}`
- `POST /mark-all-read`
- `POST /mute-non-critical`
- `PUT /preferences/JOB_MATCH` `{"enabled":false}`
- `PUT /preferences` `{"items":[{"category":"JOB_MATCH","enabled":false}]}`

## Known gaps

- Applications and Messages produce nothing yet (no producer in this branch); when the marketer / application-event modules exist they only need to
  write `cws_notification` rows with their own `source_key`.
- Email, SMS and push delivery do not exist (stored preferences only). Quiet hours, digests and per-category snooze defaults are not built.
- Tiles and tab counts are computed in memory from the consultant's own rows (tens, not thousands); deleted rows stay as tombstones with no purge job.
- A filter change made while a previous load is still in flight is dropped by the shared `useWorkspaceData` hook (it ignores overlapping loads); the
  next focus or write refresh corrects it. This is how every consultant page behaves.
- Home does not read this feed yet (a bell badge or Home card could use the Unread tile value); the shell bell is untouched.

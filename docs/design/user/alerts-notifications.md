# Design — Job alerts and the notification engine (area `user`, epic U7)

Status: decided 2026-10-11 (Fable). Builds on Phase 14.6 (in-app `notification` table + bell,
interview/offer email) and the job store in `job-search-matching.md`.

## 0. Summary

1. **An alert is a saved search with a delivery rule.** `job_alert` stores the same query object
   `GET /api/jobs/search` takes, plus frequency and channels. Evaluated after every ingest run.
2. **One notification engine for everything.** Every product event (alert hits, status change from
   the inbox, interview reminder, stale nudge, weekly recap, billing, security) goes through
   `NotificationService.publish(kind, user, payload)` → **policy** (preferences, plan, quiet hours,
   dedupe) → **fan-out** (in-app row always; email now / in the daily digest; web push now / batched).
3. **Three channels, one preference matrix.** In-app (always on), email (Brevo, exists), web push
   (VAPID, new). The user sets per-kind channels on `/settings/notifications`; defaults are quiet by
   design (Gen Z etiquette: push for things that need action, digest for everything else).
4. **Quiet hours + digest time are local-time, user-set** (default 22:00–08:00 and 08:30), stored
   with the IANA tz the browser reports. Push/email are deferred, in-app is immediate.
5. **Dedupe by key with a window.** `dedupe_key` per kind (e.g. `alert:{alertId}:{runId}`,
   `app:{id}:status:{to}`) and a 24 h window so a flapping inbox or two ingest runs never double-ping.
6. **Free vs Pro:** Free = 2 alerts, in-app + push, weekly email digest only. Pro/Autopilot = 15
   alerts, immediate email allowed, daily email digest at the chosen time, daily matches email
   (16.1). Push is free for us, so it is the Free tier's real-time channel.

## 1. Data model (additive)

### `job_alert` (new)
```
id BIGINT PK, user_id FK, name VARCHAR(80), query_json JSON NOT NULL  -- {q, loc, remote, type[], level[], salaryMin, company, ats[], hideAgencies}
frequency VARCHAR(10) NOT NULL (IMMEDIATE|DAILY|WEEKLY), channels TINYINT NOT NULL  -- bit 1 in-app, 2 email, 4 push
paused BOOLEAN DEFAULT FALSE, last_evaluated_at TIMESTAMP NULL, last_hit_at TIMESTAMP NULL, hits_total INT DEFAULT 0,
created_at, updated_at; INDEX (user_id, paused)
```
Limits: Free 2 / Pro 15 (runtime setting), `query_json` ≤ 2 KB, `name` defaults to the query summary ("UX intern · Remote").

### `job_alert_hit` (new)
```
alert_id FK job_alert ON DELETE CASCADE, posting_id FK job_posting ON DELETE CASCADE, run_id BIGINT, created_at, seen_at NULL
PRIMARY KEY (alert_id, posting_id)
```
Dedup per alert forever (a posting notifies once per alert). Purged with the posting.

### `notification` — alter (exists: id, user_id, kind, title, body, link, application_id, status, read_at)
`ADD COLUMN dedupe_key VARCHAR(120) NULL, ADD COLUMN payload_json JSON NULL, ADD COLUMN channels_sent TINYINT DEFAULT 1,
 ADD COLUMN email_state VARCHAR(10) NULL (SENT|DIGEST|SKIPPED|FAILED), ADD COLUMN push_state VARCHAR(10) NULL, ADD COLUMN scheduled_for TIMESTAMP NULL,
 ADD COLUMN group_key VARCHAR(80) NULL` — `group_key` collapses rows in the bell ("3 new for 'ux intern'").
`UNIQUE KEY uq_notification_dedupe (user_id, dedupe_key)` (NULL dedupe keys are allowed).

### `notification_preference` (new, 1:1)
```
user_id PK, matrix_json JSON NOT NULL,          -- {"ALERT_HITS":{"inapp":true,"email":"digest","push":true}, …} per kind; email ∈ off|now|digest
quiet_start TIME NULL DEFAULT '22:00', quiet_end TIME NULL DEFAULT '08:00', tz VARCHAR(48) DEFAULT 'UTC',
digest_hour TINYINT DEFAULT 8, digest_minute TINYINT DEFAULT 30, email_digest VARCHAR(8) DEFAULT 'DAILY' (OFF|DAILY|WEEKLY),
marketing_push BOOLEAN DEFAULT FALSE, updated_at
```

### `push_subscription` (new)
```
id PK, user_id FK, endpoint VARCHAR(512) UNIQUE, p256dh VARCHAR(128), auth VARCHAR(64), user_agent VARCHAR(200),
created_at, last_ok_at NULL, failures TINYINT DEFAULT 0, disabled_at NULL
```
410/404 from the push service → `disabled_at`; 5 failures → disabled.

### `digest_run` (new)
`id PK, user_id, kind (DAILY|WEEKLY), period_start, period_end, sent_at, item_count, mail_log_id NULL` — idempotency for digests.

### `notification_kind` — a Java enum, not a table
```
ALERT_HITS           new postings for an alert            default: inapp ✓ · email digest · push ✓ (immediate alerts only)
DAILY_MATCHES        today's matches ready (Pro)          inapp ✓ · email now (at digest time) · push off
APP_STATUS           an application changed status        inapp ✓ · email now for INTERVIEW/OFFER (exists), digest otherwise · push ✓ for INTERVIEW/OFFER
INBOX_SUGGESTION     "From your inbox" needs a decision   inapp ✓ · digest · push off
INTERVIEW_REMINDER   24 h and 1 h before an interview row  inapp ✓ · email now (24 h) · push ✓ (1 h)
STALE_NUDGE          no reply in N days (16.3)            inapp ✓ · digest · push off
WEEKLY_RECAP         Sunday recap (16.4 + streaks)        inapp ✓ · email weekly · push off
PROFILE_SUGGESTION   "we learned N things" (10.3e)        inapp ✓ · digest · push off
BILLING              renewal, card failed, cancelled      inapp ✓ · email now (legal) · push off   — email cannot be switched off
SECURITY             new device sign-in, password changed  inapp ✓ · email now · push ✓            — cannot be switched off
SYSTEM               announcements (9.B2)                 inapp ✓ · email off · push off
```

## 2. Engine

```
publish(kind, userId, {title, body, link, applicationId?, groupKey?, dedupeKey?, payload})
  1. dedupe: INSERT notification … ON DUPLICATE KEY → return (idempotent)
  2. policy = PreferenceResolver(user):  matrix[kind] ⊕ plan gates ⊕ kind.locked
  3. inapp: always (row exists). Bell unread count = COUNT(status='UNREAD'), grouped by group_key in the UI.
  4. email: policy.email == now  → if inQuietHours(user) and !kind.urgent → scheduled_for = quiet_end; else send via MailService (template per kind) → email_state
             policy.email == digest → email_state = DIGEST (picked up by DigestScheduler)
  5. push:  policy.push → if inQuietHours && !kind.urgent → scheduled_for; else PushSender.send(all active subscriptions) → push_state
  urgent kinds: INTERVIEW_REMINDER(1 h), SECURITY
Schedulers:
  DeferredSender        every 5 min: rows with scheduled_for <= now → send (email/push)
  DigestScheduler       every 15 min: users whose local time == digest time (± window) and email_digest != OFF
                        → collect email_state=DIGEST rows since last digest_run → one Brevo mail (sections per kind, ≤ 25 items, "and N more") → digest_run
  WeeklyRecap           Sunday 17:00 local (via the same local-time trick) → WEEKLY_RECAP (U16.3 builds the content)
  AlertEvaluator        after each ingest run: for each non-paused alert whose sources were touched:
                        run the search (same JobSearchService, posted since last_evaluated_at, limit 50, hard exclusions applied)
                        → new hits not in job_alert_hit → insert hits
                        → IMMEDIATE: publish(ALERT_HITS, group "alert:{id}", dedupe "alert:{id}:{runId}", "3 new for 'ux intern'")
                        → DAILY/WEEKLY: hits only; the digest/daily job publishes one grouped notification at digest time
```
Rate limits per user per day: push ≤ 10, immediate emails ≤ 5 (then rolled into the digest); the
cap is a runtime setting. Brevo daily cap (300 on free) is watched by 9.B5; `MailService` already
queues.

## 3. Web push

- Library: `nl.martijndwars:web-push` (Java, VAPID) — **new API dependency, confirm with the user**.
  Keys: `DOSSIER_VAPID_PUBLIC/PRIVATE` in env (box `.env` + password manager), public key exposed via
  `GET /api/push/vapid`.
- Service worker: `web/public/sw.js` (see `pwa-push.md`), `push` event → `showNotification(title,
  {body, icon, badge, data:{link}, tag: group_key})`; `notificationclick` → focus/open `link`.
- Subscribe: `POST /api/push/subscriptions {endpoint, keys}`; unsubscribe on sign-out and from
  Settings ("This device"). One row per browser.
- iOS: push only inside the installed PWA (16.4+); the settings page explains that in one line and
  offers "Add to Home Screen" first.
- Permission prompt etiquette: never on first load. Ask after the user **creates an alert** or
  **saves a second job**, with a pre-prompt sheet ("Get a ping when new UX intern jobs appear? ·
  Yes · Not now"); "Not now" snoozes 14 days.

## 4. API

```
GET    /api/profile/alerts                      → JobAlert[] (+ unseen hit count each)
POST   /api/profile/alerts {name?, query, frequency, channels}   402 ALERT_LIMIT {limit} when over the plan cap
PUT    /api/profile/alerts/{id} · POST …/{id}/pause · POST …/{id}/resume · DELETE …/{id}
GET    /api/profile/alerts/{id}/hits?since=     → JobCard[] (marks seen)
POST   /api/profile/alerts/preview {query}      → {count24h, count7d, sample[3]}   (used by the create sheet)
GET/PUT /api/profile/notification-preferences
GET    /api/notifications?group=1&cursor=       (exists; add grouping + cursor) · POST …/read-all · POST …/{id}/read
POST   /api/push/subscriptions · DELETE /api/push/subscriptions/{id} · GET /api/push/vapid
POST   /api/notifications/test {channel}        → sends a test push/email to the caller (settings page "Send a test")
```
Email templates (Brevo transactional via `MailService` + Thymeleaf like the existing ones):
`alert-hits`, `daily-digest`, `daily-matches`, `interview-reminder`, `weekly-recap`, each with an
unsubscribe-this-kind link (tokenised, no login — reuse the newsletter token pattern) and the
postal address footer (CAN-SPAM, exists for the newsletter).

## 5. State machines

Alert: `ACTIVE` ⇄ `PAUSED` (user) → deleted. The matcher ignores PAUSED. An alert that hits nothing
for 30 days gets a one-time in-app nudge "Loosen 'UX intern · Austin'? (0 in 30 days)".

Notification row: `UNREAD` → `READ` (tap, read-all) ; `channels_sent` bits set as each channel
succeeds; `email_state`/`push_state` ∈ `null → SENT|DIGEST|SKIPPED|FAILED|SCHEDULED`.

Push subscription: `ACTIVE` → `DISABLED` (410/404 or 5 failures or user removes) ; re-subscribe creates a new row.

## 6. Failure modes

| Failure | Behaviour |
|---|---|
| Brevo down | `MailService` already retries; `email_state=FAILED` with a retry at the next DeferredSender tick (max 3), then dropped into the next digest |
| Push endpoint 410/404 | subscription disabled silently; settings shows "This device: off" |
| Browser denies permission | UI records `pushDenied` in localStorage; never re-asks; settings explains how to re-enable |
| Timezone unknown | UTC; digest at 08:30 UTC; the settings page shows the detected zone and lets the user fix it |
| Ingest run touches 0 sources | AlertEvaluator no-op |
| An alert query errors (bad JSON) | alert marked `paused` with `error` reason shown in the UI |
| Digest with 0 items | not sent, no `digest_run` row |

## 7. Security & privacy

- Push payloads carry title/body/link only — **never** a company name + status pair that a lock
  screen would reveal? Decision: the lock-screen text is honest but minimal ("Interview update ·
  Kiwiply" when the user sets `lockScreenPrivate=true` in preferences; default off because the
  audience wants specifics). Stored in `matrix_json.lockScreenPrivate`.
- Email digests contain job titles/companies and the user's own application statuses — sent only to
  the verified account email. Unsubscribe links are per-kind and tokenised.
- `push_subscription` endpoints are secrets; never in DSAR export (they are device tokens, listed
  only as "N devices"). Deleted with the account.
- No notification content from inbox mail bodies — only the derived status and the sender company.

## 8. Cost

Push: $0 (browser push services). Email: Brevo free until ~250/day (ROADMAP 16.1 rule), then the
paid plan (~€15/mo). Alert evaluation: one SQL search per alert per run (≤ 15 alerts × users ×
4 runs/day; p95 < 100 ms each) — thousands of users fine on the box; above that, evaluate only
alerts whose `query_json.ats/loc` intersect the sources touched (already in the plan).

## 9. Tests

- `NotificationPolicyTest`: matrix × plan × locked kinds × quiet hours (tz boundaries, DST day).
- `NotificationServiceIT`: dedupe UNIQUE on replay; grouped bell payload; scheduled_for after quiet hours.
- `AlertEvaluatorIT`: hits once per posting; IMMEDIATE publishes grouped; DAILY only inserts hits; paused ignored; plan cap 402.
- `DigestSchedulerIT`: local-time selection (user in Asia/Kolkata at 08:30), one mail per period, 0 items → no mail.
- `PushSenderTest` with a fake transport: 410 disables; 5 failures disable; payload shape.
- Web Playwright: create alert from an empty search (preview counts), toggle pause, settings matrix
  save, pre-prompt sheet → permission flow mocked, "Send a test".

## 10. Rollout

1. U7.1 schema + engine refactor (publish/policy/fan-out) behind the existing kinds — no behaviour change (14.6 emails still go out).
2. U7.2 alerts CRUD + evaluator (in-app only).  3. U7.3 preferences page + quiet hours + digest.
4. U7.4 push (needs the PWA service worker, U17.1).  5. U7.5 email templates + per-kind unsubscribe.
Feature flag `notifications.push` (9.B2) gates the subscribe UI.

## 11. Mobile wireframes

```
┌──────────────────────────────┐  ┌──────────────────────────────┐  ┌──────────────────────────────┐
│ Job Alerts            + New  │  │ New alert                  ✕ │  │ Notifications      Mark read │
│ Active 3 · Paused 1          │  │ Search  [ux intern remote  ] │  │ ● 3 new for "UX intern" · 2h │
│ ┌──────────────────────────┐ │  │ Where   [Remote ✓][Austin]   │  │   Google, Stripe, Figma  ›   │
│ │🔔 UX intern · Remote     │ │  │ Type    [Intern ✓]           │  │ ● Google moved to Interview  │
│ │   3 new today · Daily    │ │  │ ──────────────────────────── │  │   via your inbox · 5h    ›   │
│ │   ✉ digest · 📱 push  (●)│ │  │ ~12 a day match this         │  │ ○ We learned 2 answers       │
│ ├──────────────────────────┤ │  │ ──────────────────────────── │  │   keep them? · yesterday ›   │
│ │🔔 Product design · Austin│ │  │ How often  (Instant)(Daily✓) │  │ ○ Weekly recap: 6 applied,   │
│ │   0 in 30 days — loosen? │ │  │ Where      [App ✓][Push ✓]   │  │   2 replies · Sun         ›  │
│ └──────────────────────────┘ │  │            [Email: digest ▾] │  │                              │
│ Free: 2 of 2 alerts · Pro 15 │  │ [ Create alert ]             │  │ Settings › Notifications     │
└──────────────────────────────┘  └──────────────────────────────┘  └──────────────────────────────┘
Settings › Notifications: a matrix list — one row per kind, three toggles (App · Email ▾ · Push),
Quiet hours 22:00–08:00 (tz auto), Digest at 08:30, "Send a test", "This device: push on".
```

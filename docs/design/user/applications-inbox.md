# Design — Applications tracker, timeline, interviews and inbox linkage (area `user`, epics U6, U10)

Status: decided 2026-10-11 (Fable). Builds on Phase 3 (tracker), 3.6 (job meta), 14.4/14.5/14.6
(inbox → status, dedup, notifications), 13.2–13.5 (resume fit/job fit/ATS score/tailor on the board).

## 0. Summary

1. **Keep `application` as the row; add three side tables**: `application_event` (status history +
   every meaningful change, with its source), `application_note` (free text), `interview` (date,
   kind, link, outcome). The DTO grows additively; the extension keeps writing exactly what it writes.
2. **Statuses gain `IN_REVIEW` and `WITHDRAWN`** (additive enum values). The inbox parser maps
   "application received / under review" mail to `IN_REVIEW`; forward-only rule unchanged
   (`DRAFT → SAVED → APPLIED → IN_REVIEW → INTERVIEW → OFFER`, with `REJECTED`/`WITHDRAWN` terminal
   and reversible only by the user). "Ghosted" is **derived** (APPLIED/IN_REVIEW with no event for
   21 days) — shown, never stored.
3. **The v3 page becomes the one tracker**: table on desktop, **swipeable cards on a phone**, a
   detail **bottom sheet** with tabs *Timeline · Notes · Emails · Resume · Interview*. The existing
   `ApplicationEmails`, `SuggestionsCard`, `ResumeFit`, `TailorDialog`, `AtsScoreDialog` components
   mount inside it (today they only render on the legacy board).
4. **Messages = recruiter mail threads from the user's own inbox** (CLAUDE.md: no Kiwiply mailbox,
   read-only IMAP). `/messages` lists threads grouped by application/company from `inbox_message`
   (headers + job-mail bodies already stored), with a "Reply in Gmail" deep link. **No in-app
   sending** (we never send mail). In-app messaging between users does not exist and is not planned.
5. **Interviews drive the dashboard, reminders and calendar export** (`.ics`, Google Calendar link —
   ROADMAP 16.5) and the Interview Prep hand-off ("Prep for Google Thursday").

## 1. Data model (additive)

```
ALTER TABLE application ADD COLUMN last_event_at TIMESTAMP NULL, ADD COLUMN next_action VARCHAR(160) NULL,
  ADD COLUMN next_action_at TIMESTAMP NULL, ADD COLUMN posting_id BIGINT NULL (soft ref to job_posting, no FK),
  ADD COLUMN cover_letter_resume_id BIGINT NULL;   -- R5.3 link
-- enum values IN_REVIEW, WITHDRAWN added in Java; the column is VARCHAR already

application_event  id PK, application_id FK CASCADE, kind VARCHAR(24) (CREATED|STATUS|NOTE|INTERVIEW|MAIL|RESUME|ATTACHMENT|FIELD),
                   from_status VARCHAR(12) NULL, to_status VARCHAR(12) NULL, source VARCHAR(12) (EXTENSION|WEB|INBOX|SYSTEM|ASSISTANT),
                   ref_id BIGINT NULL (note/interview/inbox_message id), summary VARCHAR(200), created_at
                   INDEX (application_id, created_at)
application_note   id PK, application_id FK CASCADE, body TEXT (≤ 4 000), pinned BOOLEAN, created_at, updated_at
interview          id PK, application_id FK CASCADE, user_id FK, kind VARCHAR(16) (PHONE|VIDEO|ONSITE|TECHNICAL|BEHAVIORAL|PANEL|OTHER),
                   starts_at TIMESTAMP NOT NULL, ends_at NULL, tz VARCHAR(48), location VARCHAR(200) NULL (URL or address), interviewer VARCHAR(120) NULL,
                   notes TEXT NULL, outcome VARCHAR(12) NULL (PENDING|PASSED|REJECTED|NO_SHOW), reminder_24h_sent_at NULL, reminder_1h_sent_at NULL,
                   source VARCHAR(12) (WEB|INBOX|ASSISTANT), inbox_message_id BIGINT NULL, created_at, updated_at
                   INDEX (user_id, starts_at)
```
Backfill migration: one `CREATED` event per existing application from `created_at`, and one
`STATUS` event from `applied_at` when status ≥ APPLIED (source SYSTEM).

Inbox linkage (exists): `inbox_message.application_id` (14.4), suggestions. **Add**
`inbox_message.thread_key VARCHAR(120)` (normalized `References`/`In-Reply-To` root or subject+sender
fallback) and `INDEX (user_id, thread_key, sent_at)` for `/messages`.

## 2. Status machine

```
DRAFT ──(submit-detect)──▶ APPLIED ──▶ IN_REVIEW ──▶ INTERVIEW ──▶ OFFER
SAVED ──(ext fill / "I applied")──▶ APPLIED                 │
   any ──(user)──▶ WITHDRAWN        any ──(inbox/user)──▶ REJECTED
Rules: inbox moves forward only (MailClassifier → MailMatcher → StatusChanged, exists) and never out of a terminal state;
       the user can set any status (an explicit WEB event); the extension writes DRAFT/APPLIED only (unchanged);
       every change writes application_event + updates last_event_at + NotificationService.publish(APP_STATUS) (exists for INTERVIEW/OFFER; now all, via the U7 policy).
Derived: GHOSTED = status ∈ {APPLIED, IN_REVIEW} ∧ last_event_at < now − 21 d  → stale nudge (16.3) and a grey "No reply · 3 w" chip.
Next step: the soonest future interview → "Oct 10, 10:00 · Video"; OFFER → "Review offer"; else next_action if set; else "—".
```

## 3. API (additive)

```
GET    /api/profile/applications?status=&q=&company=&sort=&cursor=&size=   (exists as a list; add filters, cursor paging, and `summary` counts per status)
GET    /api/profile/applications/{id}                                   → ApplicationDTO + {events[≤ 50], notes[], interviews[], mailCount, suggestions}
PATCH  /api/profile/applications/{id} {status|nextAction|nextActionAt|starred|archived|resumeId}   (exists; now writes events)
POST   /api/profile/applications/{id}/notes {body} · PUT …/notes/{nid} · DELETE
POST   /api/profile/applications/{id}/interviews {kind, startsAt, endsAt?, tz, location?, interviewer?, notes?} · PUT · DELETE · POST …/{iid}/outcome
GET    /api/profile/interviews?from=&to=                                → upcoming (dashboard, prep page)
GET    /api/profile/interviews/{id}/ics                                 → text/calendar (also a "Add to Google Calendar" URL built client-side)
POST   /api/profile/applications/bulk {ids[], action: ARCHIVE|STATUS|STAR, status?}   (≤ 50)
GET    /api/profile/applications/{id}/mail                              (exists) → add thread grouping
POST   /api/profile/applications/{id}/mail/link {inboxMessageId}        → manual link (writes a MAIL event; `MailMatcher` learns the sender domain for this company)
GET    /api/profile/messages?cursor=                                    → threads: {threadKey, company, applicationId?, subject, lastFrom, lastAt, count, unreadDerived}
GET    /api/profile/messages/{threadKey}                                → messages (headers + bodies when stored; attachments listed by name only, never fetched)
```
`ApplicationDTO` additions: `lastEventAt, nextStep{label, at}, ghosted:boolean, interviewsCount,
notesCount, mailCount, postingId`. Web BFF routes mirror 1:1 under `web/src/app/api/applications/**`.

## 4. UI

Desktop (board 3): the v3 table with real tabs (All · Applied · In review · Interviews · Offers ·
Rejected · Archived), toolbar filters wired to the API, row click → right-side detail panel (same
component as the phone sheet), bulk select → archive/status, "+ Add application" (company, title,
URL; URL paste pre-fills via the existing job-meta extractor when it is an ATS URL).

Phone (390 px):
```
┌──────────────────────────────┐   ┌──────────────────────────────┐
│ Applications      + Add  🔍  │   │ ═══                          │
│ [All 12][Applied][Interview] │   │ G  Software Engineer         │
│ ┌──────────────────────────┐ │   │    Google · Mountain View    │
│ │ G Software Engineer      │ │   │ ● Interview  ▾   ☆  ⋯        │
│ │   Google · ● Interview   │ │   │ Next: Oct 10 · 10:00 Video   │
│ │   Oct 10 · 10:00 Video   │ │   │ [Prep ✦] [Add to calendar]   │
│ │   ◔ ATS 84 · resume v3   │ │   │ ─ Timeline ─ Notes ─ Emails ─│
│ ├──────────────────────────┤ │   │  ● Interview  · from inbox   │
│ │ M Frontend Developer     │ │   │    "Interview invitation"    │
│ │   Microsoft · ● In review│ │   │    Sarah K. · 2d ago     ›   │
│ │   No reply · 3 w   [Nudge]│ │   │  ● Applied · via extension  │
│ └──────────────────────────┘ │   │    Oct 1                     │
│ swipe → next status · ← archive│ │  ● Saved · Sep 28            │
│ ⌂  ☰●  ✦  ♡  ⋯               │   │ [ + Note ] [ Open posting ↗ ]│
└──────────────────────────────┘   └──────────────────────────────┘
Swipe right = status picker sheet (not a blind advance); swipe left = archive with undo toast (5 s).
```
Messages page (phone): a thread list (company avatar tile, subject, snippet, time) → thread view
with bubbles by direction (from `[Gmail]/Sent Mail` = outgoing), "Reply in Gmail ↗", "Link to
application" if unmatched, and the Pro/connect empty state when no inbox is connected.

## 5. Failure modes

| Failure | Behaviour |
|---|---|
| Inbox suggests a status for an archived application | ignored (exists); surfaced in the Emails tab as "would have moved to …" |
| Interview in the past with PENDING outcome | dashboard asks "How did Google go?" (PASSED/REJECTED/skip) — one tap |
| Manual link to a message already linked elsewhere | 409 with the other application's name |
| `.ics` tz missing | UTC with a note; the UI always sends the browser tz |
| Bulk action partially fails | per-id result list; toast "11 of 12 archived" |
| Extension writes DRAFT for a job the user already tracks | `ApplicationKeys` dedup (exists) |

## 6. Privacy

Notes and interviews are user content: DSAR export + account delete cascade. Mail bodies remain
under the 14.x rules (job mail only, 12-month expiry, never attachments). `/messages` shows
sender names/addresses from headers — they are the user's own mail; no recruiter PII is copied
to any other table (the `interview.interviewer` field is user-typed or copied by the user's tap).

## 7. Tests

- `ApplicationEventIT`: every PATCH writes one event; forward-only inbox rule unchanged; backfill migration counts.
- `InterviewResourceIT`: CRUD, outcome, ics content type + VTIMEZONE, reminders scheduled (24 h / 1 h) through the U7 engine, idempotent `reminder_*_sent_at`.
- `MailThreadIT`: thread_key grouping from References/In-Reply-To, subject fallback, Sent direction, unmatched thread link → MAIL event + matcher hint.
- `GhostedDerivationTest`: 21-day boundary, terminal states excluded.
- Web Playwright (390 px): swipe → status sheet, archive undo, detail sheet tabs, add interview → appears on dashboard, messages thread opens Gmail link.

## 8. Rollout

U6.1 schema + events + statuses → U6.2 list API filters/cursor/summary → U6.3 detail sheet/panel
with timeline + notes → U6.4 interviews + ics + reminders → U6.5 mobile cards/swipe/bulk → U6.6
mount inbox components + manual link → U10.1 thread_key + messages API → U10.2 messages page.

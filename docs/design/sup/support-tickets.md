# Design — Support conversations (tickets) (area `sup`, epic S2)

Status: decided 2026-10-11. Replaces the fire-and-forget `bug_report` + mailto path with an object
the user can see, that the team can answer from the admin console, and that carries an SLA.
Admin queue work in A8.1–A8.5 is reused, not duplicated: a ticket **is** the row those queues show.

## 0. Summary

1. **One object: `support_ticket`** with typed `kind` (BUG · QUESTION · BILLING · ACCOUNT ·
   SITE_REPORT · SCAM_REPORT · IDEA · SALES). The existing `bug_report` and `sales_inquiry` tables
   are **kept** for history; new intakes write tickets, and the admin queues read a union view until
   A8.2/A8.4 switch to tickets fully (one migration story each side; this area owns the ticket side).
2. **Conversation, not a form.** `support_message` rows (user or staff), optional screenshot
   attachment (S3 via the `FileStorage` seam, ≤ 2 MB, image/* only), consented diagnostics stored
   as a JSON blob on the ticket (never in the message body).
3. **The reply reaches the user three ways:** in-app notification (`notification.kind =
   SUPPORT_REPLY`, exists table), email via Brevo (`MailService.sendEmail`) with a one-click
   "Reply on Kiwiply" link, and the **My requests** list in Settings → Help. Anonymous reporters
   (no account) get email only, with a signed magic link to the thread (`/support/t/{token}`).
4. **Published SLA, measured.** First response: Pro/Autopilot ≤ 1 business day, Free ≤ 2 business
   days, SITE_REPORT/SCAM_REPORT ≤ 1 business day for everyone. `first_response_due_at` is set on
   create; the admin queue sorts by it; the user sees "We reply within N business days — usually
   faster" and, after a reply, the actual time. A missed SLA is an admin alert (A10), not a user-facing
   apology.
5. **Close the loop visibly.** Statuses end in RESOLVED with a resolution kind (FIXED_IN_VERSION,
   ANSWERED, WONT_FIX, DUPLICATE, SPAM) and an optional release tag ("Fixed in extension 0.66");
   RESOLVED triggers a one-tap CSAT (😞 😐 😀) — S5.5.
6. **Inbound email is NOT a ticket source at launch.** The locked Inbox decision covers users'
   Gmail only; a support mailbox → ticket bridge needs Brevo inbound parsing and a spam story. It is
   S2.8, flagged optional, and the user decides (open question).

## 1. Data model (MySQL, additive)

```
support_ticket
  id BIGINT PK, public_id CHAR(8) UNIQUE          -- "KW-7F3A2Q", shown to the user
  user_id BIGINT NULL FK user, email VARCHAR(254) NULL     -- one of the two is required
  kind VARCHAR(16) NOT NULL, status VARCHAR(16) NOT NULL   -- see §3
  priority TINYINT NOT NULL DEFAULT 2 (1 high · 2 normal · 3 low)
  subject VARCHAR(160) NOT NULL, source VARCHAR(16) NOT NULL  -- web | extension | help | scam | admin
  plan_at_create VARCHAR(16), help_slug VARCHAR(120) NULL, ats VARCHAR(40) NULL
  diagnostics JSON NULL                                      -- consented: url, ua, ext_version, adapter, fill_event_id
  assignee_login VARCHAR(50) NULL, tags JSON NULL
  first_response_due_at DATETIME NOT NULL, first_responded_at DATETIME NULL
  resolved_at DATETIME NULL, resolution VARCHAR(20) NULL, resolution_ref VARCHAR(60) NULL
  csat TINYINT NULL, csat_comment VARCHAR(500) NULL
  access_token_hash CHAR(64) NULL                            -- magic link for anonymous threads
  created_at, updated_at DATETIME
  INDEX(status, first_response_due_at), INDEX(user_id, created_at), INDEX(kind, status)

support_message
  id BIGINT PK, ticket_id FK, author VARCHAR(8) NOT NULL (USER|STAFF|SYSTEM), author_login VARCHAR(50) NULL
  body VARCHAR(4000) NOT NULL, internal BIT NOT NULL DEFAULT 0   -- internal notes never leave the console
  created_at DATETIME, INDEX(ticket_id, created_at)

support_attachment
  id BIGINT PK, message_id FK, storage_key VARCHAR(255), mime VARCHAR(60), bytes INT, created_at

support_macro
  id BIGINT PK, name VARCHAR(80), kind VARCHAR(16) NULL, body VARCHAR(4000), updated_by, updated_at
```

Migration of history: `bug_report` rows are **not** copied; the admin "Bug reports" page gains a
"Legacy" tab (A8 side). New extension/web bug intakes POST tickets from S2.1 onward; the old
`POST /api/bug-reports` stays as a thin adapter that creates a `kind=BUG` ticket so the published
extension 0.65 keeps working until its next release.

## 2. API

| Method | Path | Auth | Notes |
|---|---|---|---|
| `POST` | `/api/support/tickets` | optional | `{kind, subject, body, email?, helpSlug?, ats?, diagnostics?, attachment?}`; BFF 10/h/IP; returns `{publicId, firstResponseDueAt}`; anonymous ⇒ email required + magic link mailed |
| `GET` | `/api/support/tickets` | user | my tickets (newest first, status chips) |
| `GET` | `/api/support/tickets/{publicId}` | user or magic token | thread (internal notes excluded) |
| `POST` | `/api/support/tickets/{publicId}/messages` | user or token | reply; reopens a RESOLVED ticket within 14 days |
| `POST` | `/api/support/tickets/{publicId}/csat` | user or token | `{score 1-3, comment?}` once |
| `GET` | `/api/admin/support/tickets?status&kind&assignee&overdue` | ADMIN/SUPPORT | queue; sorted by due |
| `PUT` | `/api/admin/support/tickets/{id}` | ADMIN/SUPPORT | status, priority, assignee, tags, resolution (+ref); audited `SUPPORT_TICKET_UPDATE` |
| `POST` | `/api/admin/support/tickets/{id}/reply` | ADMIN/SUPPORT | `{body, macroId?, internal}`; stamps `first_responded_at`; fan-out (§4); audited |
| `GET/POST/PUT` | `/api/admin/support/macros` | ADMIN | canned replies with `{{firstName}}`, `{{publicId}}` |
| `GET` | `/api/admin/support/metrics` | ADMIN | first-response p50/p90, open by kind, CSAT, overdue |

Roles: `SUPPORT` is the staff role from A0.3; until it exists, `ADMIN` only.

## 3. State machine

```
NEW ──staff reply──▶ WAITING_USER ──user reply──▶ WAITING_STAFF ──staff reply──▶ WAITING_USER
 │                        │                             │
 │ staff resolves         │ 7 days silent ⇒ auto        │ staff resolves
 ▼                        ▼                             ▼
RESOLVED(resolution) ◀────┴─────────────────────────────┘
 │ user replies ≤ 14 d ⇒ WAITING_STAFF (reopened, counter++)     │ 14 d ⇒ CLOSED (terminal)
SPAM (terminal, from NEW only, audited)
```
`first_responded_at` is set by the first STAFF non-internal message. Auto-resolve after 7 silent
days in WAITING_USER sends one "Still need help?" email first (day 5).

## 4. Fan-out on a staff reply

1. `support_message` row → 2. `notification` row (`SUPPORT_REPLY`, link `/settings/help?t=KW-…`) when
`user_id` → 3. email via `MailService.sendEmail` (template `support-reply`: staff first name, the
reply, "Reply on Kiwiply" button; subject `[KW-7F3A2Q] Re: <subject>`) → 4. extension: next
`/api/profile/version` poll carries `supportUnread: n` (additive field, mirrors the plan field
pattern) so the drawer can show a dot on "?".
Email send failures are logged against the ticket (`SYSTEM` message "Email delivery failed") and
retried once; the in-app copy is authoritative.

## 5. Failure modes

| Failure | Behaviour |
|---|---|
| Attachment upload fails | ticket still created; message says "screenshot didn't upload — reply to add it" |
| Anonymous reporter mistypes email | nothing we can do; the confirmation page shows the address back in large type before submit |
| Magic link leaked | token is per ticket, hashed at rest, 30-day expiry, read + reply only; revoked on resolve+14 d |
| Spam flood | BFF 10/h/IP, API-side 50/day/IP, honeypot field, `SPAM` resolution trains nothing (no ML) — just a list |
| Staff replies with PII of another user | macros only; internal notes are the only free-text that never leaves; review in audit |
| Ticket on a deleted account | §6 |

## 6. Privacy & retention

- Tickets are **user data**: GDPR export includes them (`AccountExportResource`), deletion
  anonymises (`user_id → NULL`, `email → NULL`, body kept 90 days for abuse review, then purged;
  attachments deleted immediately). Same cascade applied to `bug_report`/`sales_inquiry` (bug fix,
  S2.7).
- Diagnostics are consented, JSON, and shown back to the user in the thread ("What we attached").
- Staff see `plan_at_create`, not billing details; "view as" is A1.5 and separate.
- Retention: CLOSED tickets purged at 24 months; metrics keep aggregates only.
- No support content ever goes to an AI provider unless the AI help assistant (S6) is explicitly
  invoked by the user on their own thread.

## 7. Cost

Email: one Brevo transactional send per staff reply (~0). Storage: screenshots ≤ 2 MB, expected
< 1 GB/year. Staff time is the real cost — macros, help deflection (S1) and site reports with
diagnostics (S4) are what keep it down; the metrics endpoint shows deflection (tickets per 1 000
MAU) from day one.

## 8. Tests

- API: `SupportTicketServiceTest` (state machine, SLA due by plan/kind, reopen window, auto-resolve),
  `SupportTicketResourceIT` (anonymous requires email; magic token read/reply; user can't read
  another's ticket 404; admin reply stamps first_responded_at and audits; CSAT once),
  `SupportPrivacyIT` (deletion cascade anonymises; export includes tickets).
- web: My requests list + thread render tests; new-ticket sheet validation; Playwright 390px:
  report from the help sheet → ticket visible → admin reply (mock) → notification + thread.
- extension: `tracking.test.js` gains `createTicket` (seam method) + offline queue (one retry).

## 9. Rollout

S2.1 tables + create/list/get + legacy adapter → S2.2 My requests + thread UI → S2.3 contact page
"Help & support" path → tickets → S2.4 attachments → S2.5 new bug sheet (replaces the floating
widget on app/admin; marketing keeps a small footer link) → S2.6 admin reply + macros + fan-out →
S2.7 privacy cascade → S2.8 inbound email (optional).

## 10. 390 px wireframes

```
┌──────────────────────────────┐  ┌──────────────────────────────┐  ┌──────────────────────────────┐
│ Message us                 ✕ │  │ My requests                  │  │ ‹ KW-7F3A2Q · Bug · Open     │
│ What's it about?             │  │ ● KW-7F3A2Q  Workday didn't  │  │ We reply within 1 business   │
│ (Bug)(Question)(Billing)     │  │   fill · Open · reply due    │  │ day · usually faster         │
│ (Account)(Idea)(Scam)        │  │   tomorrow 14:00           › │  │ ┌─ You · 10:12 ─────────────┐│
│ Subject                      │  │ ○ KW-2B9KL1  Cancel question │  │ │ Workday dropdowns stayed  ││
│ [Workday didn't fill       ] │  │   Resolved · 😀            › │  │ │ empty on step 2  [img]    ││
│ Tell us what happened        │  │                              │  │ └───────────────────────────┘│
│ [                          ] │  │                              │  │ Attached: Workday · v0.65 ·  │
│ [📎 Add screenshot]          │  │                              │  │ fill 12/18 fields            │
│ ☑ Attach page + version      │  │                              │  │ ┌─ Sam (Kiwiply) · 11:40 ──┐ │
│   (what we attach ›)         │  │                              │  │ │ Fixed in 0.66, rolling    │ │
│ [ Send ]                     │  │                              │  │ │ out today. Mind trying?   │ │
│ Reply by email + in-app      │  │                              │  │ └───────────────────────────┘│
└──────────────────────────────┘  └──────────────────────────────┘  │ [Reply…            ] [Send]  │
                                                                    └──────────────────────────────┘
Resolved view adds: "Did this help? 😞 😐 😀" once, then "Thanks". Admin queue is A8.5's swipe list,
sorted by first_response_due_at, with the macro picker in the reply sheet.
```

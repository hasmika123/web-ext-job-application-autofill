# Email and notification operations: mail log, deliverability, suppression, templates, campaigns, notification etiquette

Area `admin`. Stories: A7.*. Existing: `MailService` (Brevo SMTP, `@Async`, fire-and-forget, **no mail log**), `email_subscriber` (double opt-in, Brevo list sync, CSV export, counts), `/admin/subscribers` page = board-15 "Email" with real subscribers tab and SAMPLE campaigns/templates/automations/open-click charts; in-app `notification` table (14.6) + `inbox_connection.notify_email`; Brevo free plan 300/day shared with BeeCompete (move to paid before ~250/day, ROADMAP 1014). Locked: no Kiwiply mailbox, we never send/move/delete the user's Gmail; marketing consent is separate from the account.

## 1. Decisions

| # | Decision |
|---|---|
| D1 | **Every transactional email gets a `mail_log` row** (template, recipient user/email-hash, subject, sent_at, provider message id, status) written by `MailService` before the SMTP call and updated by Brevo webhooks (`delivered`, `soft_bounce`, `hard_bounce`, `spam`, `opened`, `clicked`, `unsubscribed`). Never the body. The 9.C2 user timeline reads it. |
| D2 | **Suppression list is ours** (`email_suppression`: email_hash + reason `HARD_BOUNCE|SPAM_COMPLAINT|UNSUBSCRIBED_ALL|MANUAL`), checked by `MailService` **before** every send, for transactional *and* marketing. Hard bounce or complaint → suppressed automatically; account-critical mail (password reset, MFA code, legal) bypasses `UNSUBSCRIBED_ALL` but never `HARD_BOUNCE`. |
| D3 | **Templates are a registry in code with editable copy in the DB**: `TemplateRegistry` (key, purpose, category `ACCOUNT|BILLING|PRODUCT|MARKETING`, required variables, consent needed) + `mail_template_override` (subject/body override per key, versioned, preview, "send me a test"). Code owns structure and variables; admin owns wording. No free-form HTML editor: Markdown → our one layout. |
| D4 | **Campaigns run in Brevo; admin shows them read-only** via the Brevo API (campaign list, recipients, status, open/click), and the "Send campaign" button deep-links to Brevo with the chosen segment pre-synced. Segments = saved filters over `email_subscriber` ∪ users with marketing consent (`marketing_consent_at`), pushed to Brevo lists by the existing sync. Win-back (9.C5) = segment + promo code + Brevo. **No in-admin bulk sender** at this size (deliverability risk, 300/day cap). |
| D5 | **Automations = the transactional sequences we own** (welcome, verify reminder at +24 h, profile-nudge at +3 d, matches daily at the user's hour, interview/offer notifications, billing failed, renewal reminder T-3 d, cancellation confirmation, re-engagement at 30 d idle) listed with on/off (runtime flag per automation), schedule, sent-last-7-days and failure count. Each is a job in the registry (observability doc). |
| D6 | **Notification etiquette is enforced server-side, per user**: `notification_preference` (per kind: in-app/email/off; digest `INSTANT|DAILY|WEEKLY`; quiet hours start/end + timezone; marketing consent). The API's notification writer respects it; emails from automations are batched into a digest when the user picks DAILY. Admin sees aggregate opt-out rates per kind, never edits a user's preferences (the user does, on the web). |
| D7 | **Send cap guard**: `email.daily_send_cap` runtime setting (default 250); marketing/automation sends stop at the cap, account-critical continue; the Email page shows today's count vs cap and Brevo's plan cap; > 80 % alerts OPS. |
| D8 | **Deliverability health** on the page: bounce rate (7 d), complaint rate, suppression growth, DKIM/SPF/DMARC status (checked daily by DNS lookup of `kiwiply.com`), Brevo sender reputation if the API exposes it. Open/click rates appear only for templates where Brevo tracking is on (transactional tracking stays OFF for privacy except marketing). |

## 2. Data model

```sql
CREATE TABLE mail_log (id BIGINT AUTO_INCREMENT PRIMARY KEY, template_key VARCHAR(60) NOT NULL, category VARCHAR(12) NOT NULL, user_id BIGINT,
  email_hash CHAR(64) NOT NULL, subject VARCHAR(200), provider_message_id VARCHAR(120), status VARCHAR(16) NOT NULL,   -- QUEUED|SENT|DELIVERED|SOFT_BOUNCE|HARD_BOUNCE|SPAM|SUPPRESSED|FAILED
  error VARCHAR(500), sent_at DATETIME, status_at DATETIME, opened_at DATETIME, clicked_at DATETIME,
  INDEX (user_id, sent_at), INDEX (template_key, sent_at), INDEX (provider_message_id), INDEX (status, sent_at));
CREATE TABLE email_suppression (email_hash CHAR(64) PRIMARY KEY, reason VARCHAR(20) NOT NULL, source VARCHAR(20), created_at DATETIME NOT NULL, lifted_by VARCHAR(50), lifted_at DATETIME, note VARCHAR(300));
CREATE TABLE mail_template_override (id BIGINT AUTO_INCREMENT PRIMARY KEY, template_key VARCHAR(60) NOT NULL, version INT NOT NULL, subject VARCHAR(200), body_md TEXT,
  active BOOLEAN NOT NULL, created_by VARCHAR(50), created_at DATETIME, UNIQUE (template_key, version));
CREATE TABLE notification_preference (user_id BIGINT NOT NULL, kind VARCHAR(30) NOT NULL, channel VARCHAR(10) NOT NULL,   -- INAPP|EMAIL|OFF
  cadence VARCHAR(10) NOT NULL DEFAULT 'INSTANT', PRIMARY KEY (user_id, kind));
ALTER TABLE jhi_user ADD COLUMN quiet_start TIME, ADD COLUMN quiet_end TIME, ADD COLUMN tz VARCHAR(40), ADD COLUMN marketing_consent_at DATETIME, ADD COLUMN marketing_consent_source VARCHAR(40);
CREATE TABLE brevo_webhook_event (id VARCHAR(80) PRIMARY KEY, kind VARCHAR(20), message_id VARCHAR(120), email_hash CHAR(64), occurred_at DATETIME, received_at DATETIME);  -- idempotency, like stripe_event
CREATE TABLE segment (id BIGINT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(80), definition JSON, brevo_list_id VARCHAR(40), last_synced_at DATETIME, size INT, created_by VARCHAR(50));
```

## 3. API

```
POST /api/mail/webhook/brevo         (public, signature/IP-allowlist as Brevo supports; idempotent on event id)
GET  /api/admin/email/overview       -> {subscribers:{confirmed,pending,unsubscribed}, sentToday, cap, brevoCap, bounceRate7d, complaintRate7d, suppressed, dns:{spf,dkim,dmarc}}
GET  /api/admin/email/log?template=&status=&user=&from=&to=&page=
GET  /api/admin/email/suppressions?reason=&page= ; POST (manual) ; DELETE /{hash} {reason}  (HIGH: lifting a complaint)
GET  /api/admin/email/templates      -> registry + active override + last-7-day stats
PUT  /api/admin/email/templates/{key} {subject, bodyMd}  -> new version, inactive until published
POST /api/admin/email/templates/{key}/versions/{v}/publish   (MEDIUM; audited) ; POST .../test {to: self only}
GET  /api/admin/email/automations ; PUT /{key} {enabled}   (flag; HIGH for billing/legal automations)
GET  /api/admin/email/campaigns      -> Brevo API passthrough, cached 5 min
GET/POST /api/admin/email/segments ; POST /{id}/sync ; GET /{id}/preview-count
GET  /api/admin/email/preferences/summary -> opt-out % per kind, digest cadence mix, quiet-hours adoption
-- user side (for completeness; U* area owns the UI)
GET/PUT /api/account/notification-preferences ; POST /api/account/marketing-consent {granted}
```

## 4. Flows

Send: `MailService.send(templateKey, user|email, vars)` → suppression check → cap check (category-aware) → quiet hours (non-critical: defer to `quiet_end` via a `mail_deferred` queue processed by the registry job) → render (override or default) → `mail_log QUEUED` → SMTP → `SENT` + message id. Webhook → status update. Digest: automation events for a DAILY user accumulate in `notification` rows and one email at the user's hour.

## 5. Failure modes

- Brevo SMTP down → `FAILED` rows with error; retry job 3× over 1 h for non-critical, critical (MFA, reset) fail fast and the UI says "couldn't send, try again"; OPS alert when > 10 failures in 15 min.
- Webhook replay → `brevo_webhook_event` PK collision ignored.
- Cap reached mid-day → marketing/automation deferred to tomorrow with a system event; the page shows "deferred: 42".
- Override breaks a variable → publish refuses when a required variable is missing (rendering test at publish time).
- DNS check flaps → status shown with "checked at"; only two consecutive failures alert.

## 6. Security / privacy

Recipients stored as `email_hash` + `user_id`; the user page resolves the hash through the user, so the log can't be used to harvest emails. Lifting a spam-complaint suppression is HIGH and requires a note (legal risk). Marketing consent timestamp + source are the CAN-SPAM/ePrivacy evidence; the public postal address remains in every marketing footer (`NEWSLETTER_POSTAL_ADDRESS`). Transactional open/click tracking stays off.

## 7. Tests

`MailServiceSuppressionTest` (hard bounce blocks everything; UNSUBSCRIBED_ALL lets critical through), `SendCapTest` (category-aware), `QuietHoursTest` (defer to local morning; critical not deferred), `TemplateOverrideTest` (missing variable refuses publish; markdown renders in the layout), `BrevoWebhookIT` (idempotent; status transitions), `AdminEmailResourceIT` (log filters; lift suppression HIGH; test-send only to self), `NotificationPreferenceTest` (DAILY batches into one email).

## 8. Rollout

1. `mail_log` + suppression + webhook (no UI). 2. Email page: deliverability tiles + log real; campaigns read-only from Brevo; charts sample → hidden unless marketing tracking exists. 3. Templates/overrides. 4. Automations registry + flags. 5. Preferences + quiet hours + digest (shared with the U* area for the settings UI). 6. Segments + win-back (needs A2.5 promo codes).

## 9. Mobile wireframe (390px) — deliverability at a glance

```
┌──────────────────────────────┐
│ Email            today 184/250│
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░  74 %   │
│ Bounce 0.8 % · Complaints 0  │
│ SPF ✓ DKIM ✓ DMARC ✓ (09:00) │
├──────────────────────────────┤
│ Failing now                  │
│ ✖ billing.payment_failed     │
│   3 FAILED · Brevo 421       │
│   [Retry] [Open log]         │
├──────────────────────────────┤
│ Automations                  │
│ Welcome        ● on  412/7d  │
│ Matches daily  ● on  1,980   │
│ Re-engage 30d  ○ off         │
└──────────────────────────────┘
```

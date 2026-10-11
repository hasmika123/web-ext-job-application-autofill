# Org integrations — what is real, what we will build, what we will not (stories O12.*)

> Status: design, 2026-10-11. The current `/org/integrations` page (`web/src/components/org-v2/
> integrations/IntegrationsPage.tsx`, `sample-data.ts` → `INTEGRATIONS`, `AUTOMATION_FLOWS`,
> `API_ACCESS_ROWS`, `NOTIFICATION_ROUTES`) shows nine "Connected" apps (LinkedIn, Indeed,
> Greenhouse, Workday, Gmail, Outlook, Slack, Google Calendar, Google Drive), "Run Sync" buttons and
> "98 % Sync Health". None of it exists. Locked constraints: no scraping, inbox = user's own Gmail over
> IMAP (no OAuth, no Google API), ATS data only via public job-board APIs, server is the source of truth.

## 1. Honest inventory

| integration on the board | reality | decision |
|---|---|---|
| Gmail | **Real, per person**: `InboxConnection` (Phase 14) for members; marketer inbox (Phase 22.5). Not an "org integration" — the org never sees mail | Show as "Inboxes connected: 41 of 60 members" (count only) |
| Browser extension | **Real** — the actual integration with Workday/Greenhouse/Lever/Ashby *as fill targets* | Show "Extension connected: 52 of 60" (from `fill_event`/version pings) |
| Stripe | Real for billing (`billing.md`) | Lives on Billing, not here |
| Slack | Not built. Buildable without an OAuth app: **incoming webhook URL** the org pastes | **Build (P2)**: digest + alerts to one channel |
| Google Calendar / Outlook | Not built. No OAuth by decision | **Build read-only ICS feed (P2)**: a per-org (admin) and per-member (own) `webcal://` URL of interviews the viewer may see; subscribe in any calendar |
| Greenhouse / Workday / Indeed / LinkedIn "sync" | Not built; would need employer-side API credentials the *org* (a bootcamp/consultancy) does not have — these are the *employers'* ATSs | **Not planned.** Remove. Job-board public APIs feed job matches (Phase 16) product-wide, not per org |
| Google Drive | Not built; resumes live in Kiwiply/S3 | **Not planned** |
| "Automation flows", "Run Sync", "Configure Mapping", "Sync Health" | Fiction | Remove |
| API keys & webhooks | Not built | **Build (P2)**: org read-only API key for reports + outbound signed webhooks |
| Notification routing | Not built | **Build (P1, in settings)**: per-event channel = in-app / email digest / Slack |
| CSV import/export | Partially designed (`onboarding-invites.md` §3.2, `analytics.md` §4) | Build with those stories; list here as "Import & export" |

## 2. Decisions
1. The Integrations page is **rewritten as three honest sections**: *Connected* (extension, inboxes
   — counts), *Available* (Slack webhook, calendar feed, outbound webhooks, API key, CSV), *Coming /
   Not planned* (one line each with the reason: "We don't connect to employers' ATSs — your people
   apply there with the extension"). No stat tiles with invented percentages.
2. **No OAuth anywhere in org integrations** (consistent with the inbox decision). Slack via incoming
   webhook URL; calendars via ICS; our API via keys.
3. **Outbound only.** Kiwiply pushes events; it never pulls from an org's systems.
4. **Everything respects consent scope.** A webhook/ICS/API consumer gets exactly what the owning
   role could see in the UI — SUMMARY-level counts and states, never employer names unless FULL
   (and FULL is never exported; marketer-level data is not available via integrations).

## 3. Data model (`20261011080000_org_integrations.xml`)
- `org_slack_webhook`: `org_id PK, url_enc (SecretBox), channel_label, events_json ([DIGEST_WEEKLY,
  INVITE_ACCEPTED, PLACEMENT, BILLING_FAILED, SHARE_REVOKED]), last_sent_at, last_error, created_by_login`.
- `org_calendar_feed`: `id, org_id, member_id NULL (NULL = org-wide admin feed), token CHAR(32) UNIQUE,
  created_at, revoked_at`. URL `https://api.kiwiply.com/ics/{token}.ics`. Org-wide feed contains
  interviews only for members with FULL to the requesting admin — i.e., in practice **counts per day**
  as all-day "3 interviews" events; the member's own feed has their real interviews (user area).
- `org_webhook`: `id, org_id, url (https), secret_enc, events_json, active, failures_24h, created_at`;
  `org_webhook_delivery`: `id, webhook_id, event_id, status, attempts, last_code, next_at`. HMAC-SHA256
  `X-Kiwiply-Signature`, retries 1 m/10 m/1 h/6 h, disabled after 50 consecutive failures.
- `org_api_key`: `id, org_id, prefix CHAR(8), hash CHAR(64), scopes_json (reports:read, members:read),
  created_by_login, last_used_at, revoked_at`. Keys shown once; `Authorization: Bearer kp_org_…`;
  rate limit 60/min; same consent filtering as the UI.

## 4. Events (webhooks + Slack)
`member.invited`, `member.joined`, `member.activated`, `member.left`, `assignment.created`,
`assignment.ended`, `placement.declared` (member name only if SUMMARY; never employer), `invoice.paid`,
`invoice.payment_failed`, `share.revoked` (name, no reason), `digest.weekly` (the dashboard tiles).
Payload: `{id, type, orgId, occurredAt, data{…}}`; no emails of members in payloads (ids + display
names only).

## 5. API
```
GET  /api/orgs/{id}/integrations                         inventory with counts (extension, inboxes), configured items
PUT  /api/orgs/{id}/integrations/slack {url, events[]}   test message sent on save ; DELETE
POST /api/orgs/{id}/integrations/calendar-feed → {url}   ; DELETE (revoke)
POST /api/orgs/{id}/integrations/webhooks {url, events[]} → {secret (once)} ; PATCH ; DELETE ; GET /{id}/deliveries
POST /api/orgs/{id}/integrations/api-keys {scopes[]} → {key (once)} ; DELETE
--- public API (key auth) ---
GET  /api/v1/org/members?status  ; GET /api/v1/org/metrics/summary?period  (same DTOs/suppression as the UI)
```

## 6. Page (390 px)
```
┌──────────────────────────────┐
│ Integrations                 │
│ Connected                    │
│  🧩 Extension   52 of 60     │
│  ✉ Inboxes      41 of 60     │
│ Available                    │
│  Slack channel     [Connect] │
│  Calendar feed     [Create]  │
│  Webhooks (0)      [Add]     │
│  API key           [Create]  │
│  Import / export   [Open]    │
│ Not planned                  │
│  Employer ATS sync — your    │
│  people apply there with the │
│  extension; we don't connect │
│  to Greenhouse/Workday.      │
└──────────────────────────────┘
```

## 7. Security
Secrets encrypted with the existing `SecretBox`; webhook URLs must be https and not resolve to
private ranges (SSRF guard, re-resolved at send time); Slack test message on save; API keys hashed
(SHA-256), prefix shown; every creation/revocation audited (`INTEGRATION_*`); deliveries carry no
PII beyond display names.

## 8. Tests
`SlackWebhookSendTest` (stubbed HTTP, SSRF rejection), `IcsFeedTest` (admin feed = counts; revoked →
404), `WebhookSignatureTest` + retry schedule, `ApiKeyAuthTest` (scopes, rate limit, consent
filtering identical to UI DTO), web: page renders counts from the API and no sample rows remain
(`sample-data.ts` INTEGRATIONS deleted).

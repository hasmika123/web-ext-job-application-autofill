# Design — Privacy operations: data map, DSAR export, deletion, retention, subprocessors, GPC (area `trust`, epic T1)

Status: design 2026-10-11. Builds on `docs/design/admin/security-compliance-operations.md` (D5 privacy
queue, D6 retention table, D8 subprocessor table — admin-side) and `docs/design/org/consent-data-sharing.md`
§7. This document owns the **user side, the completeness guarantees and the published facts**.
Existing code: `AccountExportService`, `AccountDeletionService`, `InboxRetention`,
`UserService.removeNotActivatedUsers`, `CookieConsent.tsx`.

## 0. Decisions

| # | Decision |
|---|---|
| D1 | **The data map is code.** A `DataClass` enum (`api/.../privacy/DataClass.java`) lists every class of personal data with: tables/columns or S3 prefix, purpose, legal basis, retention class, recipients (subprocessors), export section, erasure strategy (DELETE / ANONYMISE / KEEP_LEGAL). `DataMapTest` walks every JPA entity for `user_id`/`login`/`email`/`user` columns and fails when a table is not claimed by a `DataClass`. The Records of Processing (GDPR Art. 30) document and the policy's retention table are rendered from this enum (`docs/design/trust/DATA-MAP.generated.md`, committed by a script). |
| D2 | **Export is complete and asynchronous.** `POST /api/account/export` creates a `privacy_request(kind=EXPORT, source=SELF)`, a job builds a ZIP (`export.json` per section + `resumes/*.pdf|docx` + `attachments/*` + `README.txt` explaining each file), stores it under `exports/<userId>/<requestId>.zip` (SSE-S3, 7-day lifecycle), emails a one-time link (signed, 7 days, step-up U1.5 to open). The existing synchronous JSON stays as `GET /api/account/export?format=json` for small accounts and the extension. |
| D3 | **Deletion stays immediate** (policy promise "Deletion is immediate and cannot be undone") but gains a **typed confirmation + step-up + 24 h undo window for the *login* only**: the account is deactivated and sessions revoked at once; the erasure job runs 24 h later unless the user signs in with the emailed "this wasn't me" link. Rationale: hijacked-account deletion is the realistic abuse; GDPR allows up to a month; Gen Z expects undo. Resumes, AI reports and inbox mail are not readable during the window (account is deactivated). **Open question for the user** — if rejected, keep immediate erasure and drop the window. |
| D4 | **Erasure is enumerated, not remembered.** `AccountDeletionService` iterates `DataClass.values()` and applies each class's strategy; `ErasureCompletenessIT` creates a user with one row in *every* class (fixture generated from the enum), erases, and asserts zero rows reference the user by id/login/email across all tables and S3 prefixes, then asserts the KEEP_LEGAL rows (Stripe events, audit, acceptance, data-share events) carry only the login string. Known gaps closed: `ai_quota_override`, Brevo contact + `email_subscriber`, `bug_report.email`, `sales_inquiry.email`, S3 object **versions** (delete markers + noncurrent versions via lifecycle 1 day), `refresh_token`, `admin_mfa_challenge`, `privacy_request` rows (anonymise to login). |
| D5 | **A deletion receipt**: after erasure the job emails the address once ("Your Kiwiply account and data were deleted on <date>. What survives: payment records at Stripe and in our ledger, our audit log with your username only, backups for up to 30 days.") and stores nothing else. |
| D6 | **Backups are in the policy.** Nightly dumps (A10.1) are kept 30 daily + 12 monthly; erased data can persist in backups for up to 30 days (monthly dumps are **excluded from the promise by being restore-only + purge-on-restore**: `verify-restore.sh` re-runs the erasure of users deleted since the dump — a `deleted_user_login` tombstone table, login + deleted_at only, 400 d). |
| D7 | **Retention catalogue** = `RetentionClass` enum referenced by `DataClass`; the admin table (A9.5) can shorten within bounds but never lengthen beyond the enum's `max_days`. Published on `/privacy#retention` and `/trust`. |
| D8 | **Subprocessors** = `subprocessor` table (A9.7) + public `/legal/subprocessors`; each `DataClass` lists which subprocessors receive it; `SubprocessorCoverageTest` asserts every recipient in the enum exists in the seed and every seeded subprocessor is referenced. Changes to the list email users who opted into "legal updates" and appear in the changelog (T0.3); adding a subprocessor that receives resume content is **material** (re-acceptance). |
| D9 | **Consent signals**: honour **Global Privacy Control** (`Sec-GPC: 1` header / `navigator.globalPrivacyControl`) as a decline for analytics on the web and as "do not sell/share" (we never do; record it anyway). The consent choice is mirrored server-side for signed-in users (`user_preference.analytics_consent`), so it follows the account across devices; `localStorage` remains the anonymous fallback. Cookie table rendered from a `cookies.ts` registry. |
| D10 | **Logs**: web/API access logs keep IP for 14 days (security basis), then only hashed; `login_attempt`/`security_event` store `ip_hash` + country. Error digests redact emails. Stated in the policy. |

## 1. Retention catalogue (initial values; `basis` is what the policy prints)

| RetentionClass | Days | Basis | Data classes |
|---|---|---|---|
| ACCOUNT_LIFETIME | while account exists | contract | profile, resumes, applications, notes, interviews, field cache, suggestions, AI reports, preferences, acceptances |
| INBOX_MAIL | 365 (by sent date) | user instruction / legitimate interest | inbox messages (exists: `InboxRetention`) |
| JOB_POSTINGS | 30 (U4.1; 7 today) | legitimate interest | postings, match scores |
| ASSISTANT_THREADS | 90 (U8.4) | contract | assistant memory |
| EXPORT_FILES | 7 | contract | export ZIPs |
| UNACTIVATED | 3 (exists) | contract | unactivated accounts |
| SECURITY_EVENTS | 400 | legitimate interest (security) | login_attempt, security_event, ip_block |
| ACCESS_LOGS_RAW | 14 | security | reverse-proxy / app logs with IP |
| AUDIT_LEGAL | never (export on request) | legal obligation | admin audit, legal_acceptance, data_share_event, Stripe events (login only after erasure) |
| BACKUPS | 30 daily + 12 monthly (purge-on-restore) | legal obligation / BCP | DB dumps |
| PRODUCT_EVENTS | 180 (U18.3) | legitimate interest (consent for analytics cookies) | product_event |
| SUPPORT | 365 after resolved / 730 after closed | legitimate interest | bug reports, inquiries |
| FILL_TELEMETRY | 400 | legitimate interest | fill_event (unlinked) |
| DELETED_TOMBSTONE | 400 | legal obligation | deleted_user_login |

## 2. API

```
POST /api/account/export                 -> 202 {requestId}        (step-up; one open request at a time → 409)
GET  /api/account/export/{requestId}     -> {status, readyAt, expiresAt, downloadUrl?}
GET  /api/account/export?format=json     -> existing synchronous JSON (unchanged shape + new sections)
DELETE /api/account                      {confirmLogin} -> 202 {purgeAt} (step-up) ; existing behaviour behind `?now=1` only if D3 is rejected
POST /api/account/delete/cancel?token=   -> 204 (within 24 h; emailed link)
GET  /api/legal/subprocessors            -> public list (A9.7)
GET  /api/legal/retention                -> public catalogue (from the enum + admin overrides)
PUT  /api/account/preferences            {analyticsConsent: GRANTED|DENIED|GPC}
```
Email-sourced requests (`privacy@kiwiply.com` → A9.4 queue): the support script verifies identity by
sending a one-time link to the account email (or, for non-users, by matching the inquiry/newsletter
record); the admin "execute" runs the same export/erasure code paths, so there is one implementation.

## 3. Export ZIP layout

```
kiwiply-export-<login>-<date>.zip
  README.txt                 what each file is, retention facts, how to ask questions
  account.json               login, email, names, created, legalAcceptances[], preferences, orgMemberships[] (O6.5)
  profile.json               bio payload + profile items (R1) + suggestions
  resumes.json + resumes/    metadata + original files (and built-resume PDFs)
  applications.json + attachments/   events, notes, interviews (U6.1), attachments
  jobs.json                  saved jobs, matches with scores/reasons, feedback, preferences
  ai.json                    answers, resume-match / job-fit / tailor reports, assistant threads (U8), ai_call rows for this login (task, model, cost, timestamp — never prompts)
  inbox.json                 connection (never the password), messages read, suggestions
  notifications.json
  events.json                product events for this user (U18.4)
  security.json              sessions, login attempts (hashed ip, country), passkeys (names only)
```

## 4. State machines

```
Export:   REQUESTED -> BUILDING -> READY(7 d) -> EXPIRED | FAILED(retry, never partial)
Deletion: REQUESTED(step-up) -> PENDING_PURGE(24 h, account deactivated, sessions revoked, Stripe cancelled now)
            -> PURGED(receipt sent, tombstone) | CANCELLED(link within 24 h; Stripe NOT auto-resubscribed — user is told)
```

## 5. Wireframe (390 px) — Settings › Privacy › Your data

```
┌──────────────────────────────┐
│ Your data                    │
│ What we store ▸  Who sees it ▸ (T7.2)
│──────────────────────────────│
│ Download everything          │
│ A ZIP with your profile,     │
│ resumes, applications, AI    │
│ reports and mail we read.    │
│ Ready in a few minutes.      │
│ [ Request download ]         │
│ Last export: 3 Oct · expired │
│──────────────────────────────│
│ Analytics cookies    (● off) │
│ Set by your browser's Global │
│ Privacy Control.             │
│──────────────────────────────│
│ Delete account               │
│ Deactivates now, erases in   │
│ 24 h unless you cancel from  │
│ the email we send.           │
│ [ Delete my account… ]  ⚠    │
└──────────────────────────────┘
```

## 6. Legal basis map (for the policy; lawyer confirms — L3)

| Processing | Basis (GDPR) | CPRA note |
|---|---|---|
| Account, profile, resumes, autofill, tracker | contract (Art. 6(1)(b)) | — |
| AI parsing (default on, opt-out) | contract + disclosed; **lawyer: consent vs contract**, and Art. 9 if the resume contains special-category data | sensitive PI limits |
| EEO self-ID | explicit consent (Art. 9(2)(a)), stored only for the user's own form filling | sensitive PI; "limit use" link |
| Pro AI features (draft, fit, tailor, matches, inbox) | consent (switches) | — |
| Inbox mail incl. recruiter data | user instruction (contract) for own data; legitimate interest for third-party senders, with 12-month deletion | — |
| Analytics cookies | consent (ePrivacy) | sale/share = none; GPC honoured anyway |
| Security logs, fraud | legitimate interest | — |
| Billing records | legal obligation | — |
| Org sharing | consent (O6) | user-directed disclosure |

## 7. Failure modes

| Failure | Behaviour |
|---|---|
| Export job dies mid-ZIP | request FAILED with error; retry button; partial file never linked |
| S3 delete fails during erasure | transaction aborts (existing behaviour); job retries hourly ×24 then pages admin (A10.5 incident) |
| User deletes while an org FULL share is active | share dropped first (`SHARE_REVOKED` to org admins), membership anonymised (O4.9/O6.5) |
| Brevo API down during erasure | contact deletion queued (`pending_external_erasure` rows, retried daily; user receipt says "within 30 days") |
| GPC header present but user explicitly accepted cookies earlier | GPC wins for the session; explicit later acceptance in Settings overrides (recorded) |

## 8. Tests

`DataMapTest` (every entity column claimed), `ErasureCompletenessIT` (fixture from the enum, zero
references after purge, KEEP_LEGAL rows login-only), `ExportCompletenessIT` (every DataClass with
`exportSection` appears; ZIP contains the resume bytes; link expires), `DeletionWindowIT` (deactivate
now, purge after 24 h, cancel link, Stripe cancelled immediately), `RetentionCatalogueTest` (admin
override within bounds; every RetentionClass referenced), `SubprocessorCoverageTest`,
`GpcIT` (header → DENIED, server mirror), Playwright: Your-data panel at 390 px.

## 9. Rollout

T1.1 data map + tests (no behaviour change) → T1.3 deletion completeness (fix gaps) → T1.2 export
v2 → T1.4 retention catalogue + jobs → T1.5 subprocessors + DPAs (parallel: T1.6 AI tier) → T1.7 GPC
+ consent mirror → T1.8 email-request script → T1.9 backups/logs wording.

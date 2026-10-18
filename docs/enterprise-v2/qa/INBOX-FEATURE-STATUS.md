# Inbox feature status (audit, 2026-10-16)

Read-only audit of the Gmail inbox module on `origin/version2`. Evidence is file or class names under `api/src/main/java/com/dossier/api/` unless a path says otherwise. Anything not confirmed by reading code or running tests is marked **unverified**. No product code was changed.

Locked model (CLAUDE.md): the user's own dedicated consumer Gmail, IMAP plus App Password, poll INBOX and Sent, headers plus body text only, never attachments, credentials encrypted at rest, Kiwiply never sends, moves or deletes mail. No Kiwiply address, forwarding, OAuth or Google API.

## 0. Headline

The module is real and fairly complete for its core promise: connect a Gmail, read it every 15 minutes, classify job mail by rules (AI only for the leftovers), move the matching application forward, suggest untracked jobs, notify, and purge on disconnect, offboarding or after 12 months. Three things the brief asks about are **not built**: interview schedule parsing (no date, time, zone, link or ICS handling anywhere), marketer inbox attribution (D4, deferred by decision), and a PII scan over stored mail. Two things are weaker than they look: the personal web app has no screen that lists or accepts suggestions (only BFF accept/dismiss routes exist), and multi-instance safety relies on a JVM-local flag.

## 1. Architecture

### 1.1 Connect flow
- **Page:** `web/src/components/settings/InboxConnect.tsx` (361 lines) at `/settings/inbox` (`web/src/app/(app)/settings/inbox/page.tsx`); reused in the consultant workspace by `InboxPage.tsx`. Three guided steps: use a Gmail just for job hunting, turn on 2-Step Verification (link to `myaccount.google.com/signinoptions/twosv`), create an app password (link to `apppasswords`), then address plus password.
- **API:** `InboxResource` (`/api/profile/inbox`: GET, POST, PUT `/notify`, DELETE); consultant copy `ConsultantInboxResource` (`/api/orgs/{orgId}/me-workspace/inbox`). Web reaches them through BFF routes (`web/src/app/api/inbox/*`, `web/src/app/api/orgs/[orgId]/me-workspace/inbox/*`).
- **Validation before Gmail is asked** (`InboxService.connect`): address must match `@gmail.com|@googlemail.com` (`NOT_GMAIL`; Workspace and other providers refused); password stripped of spaces and must be 16 lower-case letters (`APP_PASSWORD_FORMAT`, so a real Google password is never sent anywhere); at most 5 attempts per 15 minutes per user (`allowAttempt`, in-memory map, so per instance only).
- **Live check:** `ImapGateway.probe` (`JakartaImapGateway`) signs in, opens INBOX read-only, finds the Sent folder by the RFC 6154 `\Sent` flag with English-name fallbacks, signs out. Refusals are mapped to calm codes: `BAD_CREDENTIALS`, `APP_PASSWORD_REQUIRED`, `WEB_LOGIN_REQUIRED`, `IMAP_DISABLED`, `UNREACHABLE`.
- **Entitlement:** personal account needs Pro or Autopilot (`EntitlementService.requirePro`); enterprise account needs the org license feature `inbox.monitoring` (`InboxEntitlement`, decision O4, 402 `FEATURE_NOT_LICENSED`).
- **Encryption at rest:** `SecretBox`, AES-256-GCM, fresh 12-byte IV, 128-bit tag, stored as `v<keyVersion>:<base64(iv||ct||tag)>`, bound to `"inbox:"+userId` as associated data (a copied ciphertext in another row will not decrypt). Key from `DOSSIER_INBOX_KEY` through `InboxProperties` (`dossier.inbox.key`, base64 or 64 hex); `key-version` plus `retired-keys` allow rotation and `needsRotation` re-encrypts on the next sync. Used in exactly two places: `InboxService.connect` (encrypt) and `InboxSyncService.sync` (decrypt). Blank or malformed key means the inbox is off (`SecretBox.usable()`); `InboxKeyCheck` (ApplicationRunner, `secret_canary` row) detects a changed key at boot and sets MISMATCH instead of overwriting. The password is never returned by any view or export (`InboxService.View`, `exportCurrentUser`).
- **Disconnect and delete:** `InboxService.disconnect` runs `deleteAllForUser` (connection, folder state, every message, attempt counters); different Gmail on reconnect drops the old mail; account deletion cascades by FK (`ON DELETE CASCADE` on `inbox_message`, `inbox_folder_state`); enterprise offboarding step 450 `ConsultantInboxOffboardingHook` calls `purgeConnectedVia`.

### 1.2 Polling
- `InboxPoller.poll`, `@Scheduled(cron="0 */15 * * * *", zone=UTC)` (`dossier.inbox.poll-cron`). Loops `connections.findAll()` **sequentially in one thread**, one `InboxSyncService.sync(userId)` per due connection, plus an immediate `@Async` read after connect (`onConnected`, `Connected` event).
- **Folders:** INBOX and the account's Sent folder (`sent_folder` cached on the connection). One IMAP session, both folders `Folder.READ_ONLY`; nothing is flagged, moved, deleted or sent.
- **By UID, not date:** `inbox_folder_state(user_id, folder, uid_validity, last_uid)`. First read, or a changed UIDVALIDITY, is a backfill of the last 60 days (`backfill-days`), newest 500 (`max-per-folder`); then the position jumps to `UIDNEXT-1` so old mail is never pulled later. Ordinary reads take up to 500 new messages, oldest first.
- **Dedup:** SHA-256 of `mid:<Message-ID>` (so the same mail in Inbox and Sent is one row) else folder/validity/uid; unique `(user_id, dedup_key)`.
- **Backoff:** `InboxPoller.due`: 15-minute rounds; after `n` consecutive failures wait 15 min x 2^min(n,5), capped at 6 h. Three failures in a row set status ERROR; success resets.
- **NEEDS_RECONNECT:** an `AuthenticationFailedException` sets it with "Gmail stopped accepting the app password" and the poller never reads it again until the user reconnects. The page shows the state (`InboxConnect`).
- **Rate limits:** only the connect-attempt limiter above. No limit against Gmail's IMAP bandwidth caps, no per-minute spread of accounts.
- **Gating each round (`reconcile`):** ended org seat means purge; suspended enterprise account means skip (kept); entitlement lost means status NO_ENTITLEMENT and not read, restored automatically if the ground returns.
- **Scale and second instance:** there is no ShedLock or DB lock (grep: none in the API). The guard is `AtomicBoolean running`, JVM-local. Two API instances would both poll every account; duplicates are blocked only by the unique dedup key and by `parsed_at` being set per row, but two parsers racing on the same unparsed rows could both apply a status change and both emit `StatusChanged`. One instance is the production shape today (single box, DEPLOY.md), so this is latent, not live. A single thread reading every account in series, 15 s IMAP timeout (`timeout-ms`), means a few hundred accounts per round will exceed 15 minutes; `running` then skips the next round entirely. **Unverified** under load; no load test exists.

### 1.3 What is stored
- `inbox_connection` (address, `password_enc`, status, sent_folder, counters, `notify_email`, `connected_via_org_id`), `inbox_folder_state`, `inbox_message` (migrations `20260922100000`, `20260923010000`, `20260923020000`, `20261107010000`).
- `inbox_message`: headers for **all** mail (Message-ID, In-Reply-To, from, to/cc up to 50, subject, sent_at). **Body text only for job mail** (`JobMailRules.isJobMail`: known ATS/job-board sender domains, hiring-subject words, or a tracked company name in sender/subject). Body is `MailText.of`: plain part else HTML-to-text, quoted history cut, capped at 20,000 chars. Attachments never opened (`MailText.isAttachment`: disposition attachment or any file name), so bytes are never downloaded. Classification columns: category, classified_by (RULE, AI, UNSURE, NONE), application_id, status_change, company_guess, role_guess, suggestion (NEW, ACCEPTED, DISMISSED), parsed_at.
- **Retention:** `InboxRetention`, nightly 03:30 UTC, deletes by `sent_at` older than 365 days (`retention-days`). The status and notification it caused stay.
- **Data rights:** `InboxService.exportCurrentUser` puts the connection (no password) and every stored message, including body text, in the data export.
- **Note:** non-job mail still keeps headers (sender, recipient, subject) for 12 months. That is the decided model (2026-09-22) but is the main privacy surface; see section 7.

### 1.4 Privacy and visibility
- Personal: only the owner reads their own inbox through `/api/profile/inbox*`; every query is by `userId` from the session.
- Consultant workspace: `ConsultantInboxService` gates on `ConsultantHomeService.requireSelf` plus `applications.manage`; admins, marketers, account managers and platform admin get the generic 404. The org sees only the application's **stage**, via the existing mirror `LinkedApplicationProjection` tagged source INBOX (`SOURCE_INBOX`), never subject, sender, snippet or address. The `updates` list returns company, role, stage and a reading label, no mail text. No org-level count of connected mailboxes (deliberate, doc 18 section 10). Backed by CON-74 and CON-77 stories.

## 2. Classification

### 2.1 Pipeline (`InboxParser.parse`, runs after each sync; failures are logged and retried next time)
1. Sent mail: never classified; only linked to an application (to-address vs company) so later replies can follow the thread. Non-job mail: `classified_by=NONE`.
2. Job mail: `MailClassifier.read(subject, body, fromName)`, pure regex.
3. Rule result `ambiguous` goes to the model. **Is AI used? Yes, but only for unsettled mail**, through `AiProvider.generate(AiTask.INBOX, ...)` in batches of 20, at most 3 batches (60 mails) per sync, using `AiBudgetService.decide(login, INBOX)` and metered by `AiMeteringService`. Input per mail: from name and address, subject, first 1,200 characters of body (whitespace collapsed). Output JSON `results[id,category,company,role]`. Requires `dossier.ai.enabled` and a configured provider. If the budget is spent, AI is off, or the call fails, the mail is marked `UNSURE` and **changes nothing**. Free tier: there is no Free inbox (Pro or org license only), so "Free server AI" never applies. A consultant with the org add-on but no personal Pro plan has no AI budget, so their unsure mail is never read (documented gap, doc 18 section 10).
4. **PII scanner on stored text: none.** `SensitiveContent` (the scanner used for consultant free text) is not called anywhere in `service/inbox`. Body text is stored as received (job mail only). CLAUDE.md's no-sensitive-PII rule is honoured by *not extracting* fields, not by scanning; an offer letter or a mail quoting a date of birth would be stored verbatim. **Gap.**

### 2.2 Categories (`MailClassifier.Category`)
APPLIED (receipt), IN_REVIEW, INTERVIEW, ASSESSMENT, REJECTED, OFFER, ALERT (job-board digests), OTHER. Not distinguished: interview reschedule, cancel, recruiter outreach (a cold recruiter mail falls to OTHER/ambiguous or, if it says "love to chat", INTERVIEW), withdrawal, follow-up requests.
- Precedence: OFFER > REJECTED > INTERVIEW > ASSESSMENT > IN_REVIEW > APPLIED. Offer plus rejection phrases = ambiguous OTHER. Rejection with interview/assessment phrases = REJECTED but ambiguous (model). "Unfortunately" alone with nothing else = ambiguous. Receipts never read as IN_REVIEW even though they contain "will review your application".
- Phrase lists are English only and template-driven (Greenhouse, Lever, Ashby, Workday, iCIMS wordings); there are no per-ATS parsers. "ATS sender patterns" exist only as `JobMailRules.HIRING_DOMAINS` (about 55 domains) to decide *keep the body*, plus `MailMatcher` ignoring those domains as company evidence.
- **Confidence scores: none.** The only signal is `ambiguous` (boolean) and `classified_by`. There is no numeric confidence stored or shown.

### 2.3 Company and role extraction
`MailClassifier.companyFrom/roleFrom`: regex over subject then first 1,500 body chars ("applying to X", "role at X", "for the X position"), then the sender display name ("Acme Recruiting"). Capitalised-words heuristic, max 4-5 words, 120 chars. The model, when asked, may overwrite both. Real-email accuracy is **unverified**: unit tests use hand-written strings only (section 6).

## 3. Matching and status updates

- **Order (`InboxParser.parse` step 3):** (a) thread: `In-Reply-To` matches a stored message that already has an application (sent mail is linked for this reason); (b) `MailMatcher.match`: company key (`ApplicationKeys.company`) equals the extracted company, or appears in the sender's domain (non-ATS domains only), display name, or subject (key >= 4 chars). One application at that company wins; several need the role (extracted role equals the title, or the title appears in the subject); same role tracked twice prefers the one whose `email` equals the inbox address, else newest; still several (two Acme roles, no role) leaves it **unmatched on purpose**. Archived applications are never matched. No ATS requisition id or job-link matching exists.
- **Suggestion vs automatic:** a match is **automatic**: the application is updated without confirmation. If no application matches, and the category is APPLIED, INTERVIEW, ASSESSMENT or OFFER, and the company is not already tracked, the mail becomes a suggestion (`suggestion=NEW`). The name in the brief, `LINK_SUGGESTED`, does not exist in the code; suggestions are *new application* suggestions, not *link this mail to an existing application* suggestions. A mail that fails to match a tracked application simply stays unlinked, with no review queue.
- **Accept/dismiss:** `InboxMailService.accept` upserts through the board's own `ApplicationSyncService.upsertApplication` (so board dedup applies) at the stage the mail showed (INTERVIEW, OFFER, APPLIED, else SAVED), dated by the mail, source `inbox`; folds other open suggestions of the same company; dismiss hides that company's open suggestions. 409 if already handled. Routes: `GET /api/profile/inbox/suggestions`, POST `.../{id}/accept|dismiss` (`InboxMailResource`); consultant equivalents in `ConsultantInboxResource`.
- **Duplicates:** at read time by unique dedup key; at suggestion time by company key; notifications deduped by `(user, application, status)`.
- **Transitions (`MailMatcher.next`), forward only:** APPLIED/ASSESSMENT -> APPLIED only from DRAFT/SAVED; IN_REVIEW from DRAFT/SAVED/APPLIED; INTERVIEW from DRAFT/SAVED/APPLIED/IN_REVIEW; OFFER from anywhere except OFFER; REJECTED from anywhere except REJECTED and OFFER. WITHDRAWN is never overridden. **Backwards:** never to a lower stage. A REJECTED application stays REJECTED when a later interview invite arrives (left alone on purpose); a rejection never overwrites an OFFER; an OFFER arriving after REJECTED does move it to OFFER (a decision outranks), which is the one "reopen" path. An ASSESSMENT mail only moves SAVED to APPLIED; it does not set an "assessment" stage (the app has none).
- **Side effects of `act`:** a receipt or in-review mail sets `submissionConfirmed` and `appliedAt` (mail date); `m.statusChange` recorded on the message.
- **Audit ("by Inbox"):** `StatusChanged` event -> `ApplicationEventService.onStatusChanged` writes a timeline row with source INBOX, ref = message id, text "Moved to X - from an email", actor `ChangeActor.mail()` (actor kind MAIL, migration `20261110010000`). Web shows "updated by" (`ApplicationDetail.updatedBy.test.tsx`) and "from your inbox" on the consultant page.
- **Notifications:** `NotificationService.onStatusChanged` -> in-app `APP_STATUS` notice (deep link `/board?app=<id>`), only for mail newer than the in-app window (a first backfill stays quiet), and an email only for INTERVIEW and OFFER inside a shorter window, if the user's `notify_email` switch and notification preferences allow (`sendStatusChangeEmail`).
- **Safety note:** a wrong auto-REJECTED from a loose regex (for example "not selected", "closer fit" in a newsletter-like mail from an ATS domain) moves the card with no confirmation and no undo besides a manual edit. The mitigations are ambiguity routing and unmatched-on-ambiguity, not a confirm step. See section 7.

## 4. Interview schedules

**Not built.** Evidence: no code under `service/inbox` references dates, time zones, ICS or `text/calendar` (`MailText` keeps only plain or HTML text). The classifier only labels a mail INTERVIEW and moves the status. Nothing parses a date, time, zone, link (Zoom, Meet, Calendly) or location from a mail, no `Interview` row is ever created from mail, no reminder or reschedule or cancel is handled, and a cancel or reschedule mail would be read as INTERVIEW again (no state change).
- The pieces that exist elsewhere: `Interview` entity and `InterviewService` (CRUD, outcome, date-range feed, `.ics` export; PROGRESS "e2e-u6.4") already accept `source=INBOX` (`Interview.SRC_INBOX`, mapped to `ChangeActor.mail()` in `InterviewService`), so the target exists but nothing writes to it. Calendar views over interviews are fed only by what the user or the assistant enters. Time-zone correctness: n/a for mail; **unverified** for the manual path.

## 5. Where it surfaces

| Surface | Status | Evidence |
|---|---|---|
| Personal connect page | Built | `settings/inbox/page.tsx`, `InboxConnect.tsx`, `InboxResourceIT` |
| Personal application detail, Emails tab (mail per application, snippet, "read as") | Built | `EmailsTab.tsx` -> `board/ApplicationEmails.tsx` -> `GET /api/profile/applications/{id}/mail` |
| Personal status timeline "from an email / by Inbox" | Built | `ApplicationEventService.onStatusChanged`, `TimelineTab` |
| Personal suggestions (accept/dismiss) | **Partial: API and POST BFF only.** Web has `/api/inbox/suggestions/[id]/[action]` but no GET BFF and no component that lists suggestions (grep for `profile/inbox/suggestions` in `web/src` finds only that POST route). The PROGRESS 14.4b board panel appears to have been dropped in the v3 redesign. | **unverified** whether another page fetches server-side; none found |
| Consultant workspace Inbox page | Built | `(tenant)/_t/w/consultant/inbox/page.tsx`, `InboxPage.tsx`, `lib/ent/consultant-ws/inbox.ts`; stories CON-70..77 |
| Marketer attribution (D4, Phase 22.5) | **Not built, deferred** (decision O3; D4 default option b). `inbox_message` has no `attributed_member_id`; a marketer has no inbox page. | doc 18 section 10; 08-decisions D4, O3; ROADMAP 22.5 unchecked |
| Extension | **No inbox integration.** The only `inbox` mention under `job-autofill/` is `STORE-LISTING.md`. The extension neither shows suggestions nor reads status from mail; it sees mail-driven status only if it reads applications through sync. | grep |
| Demo | Built: `DemoImapGateway` + `inbox-demo.json` + `ConsultantInboxDemoSeeder`; sandbox shows a canned mailbox without a real Gmail | `ConsultantInboxDemoIT` |

## 6. Tests

### 6.1 API (JUnit; ITs run with `integrationTest`)
Unit: `MailClassifierTest` (8: confirmations, under-review vs receipt, rejections, interviews/assessments, offers, alerts, contradictions to model, company from sender name), `MailMatcherTest` (6), `InboxParserTest` (7: confirmation marks applied, oldest-first latest-wins, model settles unsure, model unavailable changes nothing, thread follow, untracked company suggested, personal mail untouched), `InboxSyncServiceTest` (8, GreenMail IMAP), `JakartaImapGatewayTest` (5), `InboxPollerTest` (4: backoff and due logic), `InboxPollerReconcileTest` (8: entitlement, seat ended, suspended), `InboxServiceTest` (9), `InboxServiceViaOrgTest` (7), `InboxEntitlementTest` (12), `InboxMailServiceTest` (2), `InboxRetentionTest` (1), `SecretBoxTest` (8), `InboxKeyCheckTest` (6), `DemoImapGatewayTest` (6), `LinkedApplicationProjectionInboxTest` (3, org sees stage only).
IT: `InboxResourceIT` (5), `InboxMailResourceIT` (4), `InboxDataIT` (2, export and erasure), `InboxKeyCheckIT` (1), `ConsultantInboxResourceIT` (15, privacy wall and entitlement), `ConsultantInboxDemoIT` (2). Static count of test methods: 129 across 22 classes.

### 6.2 Web
Vitest: `InboxPage.test.tsx` (10), `inbox.test.ts` (7). Playwright story `web/e2e/stories/consultant/inbox.story.ts` (8: CON-70..77, automated; CON-75 needs docker/MySQL and skips itself otherwise). Stories documented in `qa/stories/consultant.md`. There is no vitest for `InboxConnect.tsx` itself, `EmailsTab`/`ApplicationEmails`, or the personal BFF routes.

### 6.3 Run results
- **Unit tests (`gradlew test --tests *Inbox* *Imap* *MailClassifier* *MailMatcher* *SecretBox*`, under the build lock):** 111 tests ran, 110 passed, 1 failed. All 16 inbox unit classes listed above are in the result set and passed. The one failure is `ProfileAnalyticsServiceTest.responseByCompanyAppearsOnlyOnceAReplyCameThroughTheInbox`, picked up only because its method name contains "Inbox"; it failed with `TimeoutException: setUp() timed out after 15 seconds` (a load timeout on a busy machine, not an inbox assertion). Not re-run.
- **Integration tests (`integrationTest`):** **not run.** The first command stopped at the failing unit task, and a second `integrationTest --tests *Inbox* --tests *Imap*` waited about 60 minutes for the build lock (held by another job) and was skipped per the brief. The six IT classes (`InboxResourceIT`, `InboxMailResourceIT`, `InboxDataIT`, `InboxKeyCheckIT`, `ConsultantInboxResourceIT`, `ConsultantInboxDemoIT`) are therefore **unverified** in this audit.
- **Vitest and Playwright:** **not run.** `node_modules` is absent in this worktree and the disk had about 5.7 GB free, so `npm ci` was skipped. Test counts for the three web files (17 vitest cases, 8 story cases) come from reading the files, not from a run.

### 6.4 Untested or thinly tested paths
- Classification against **real** emails (no corpus, no fixtures from real ATS mails; CLAUDE.md's own rule "capture real DOM before writing selectors" has no inbox equivalent).
- Multi-instance poller, long rounds, many accounts; IMAP failure modes beyond auth/unreachable (quota, throttling, UIDVALIDITY change in a live Gmail).
- Interview anything (nothing built), reschedule/cancel, recruiter outreach.
- Personal accept/dismiss UI (nothing to test), and BFF personal routes.
- Backwards-transition edge cases: OFFER after REJECTED, REJECTED then interview, WITHDRAWN (partly in `MailMatcherTest`; confirm by reading).
- Non-English mail, HTML-only mail with quoted history, forwarded mail, mailing-list mail.
- PII in stored body (no scanner, no test).

## 7. Verdict

| Capability | Verdict | Evidence | What is missing | Risk |
|---|---|---|---|---|
| Guided connect, validation, rate limit | DONE | `InboxService`, `InboxConnect.tsx`, ITs | Per-instance attempt counter | Low |
| Encryption at rest, key canary, rotation | DONE | `SecretBox`, `InboxKeyCheck` | Rotation drill never run (unverified) | Low |
| Disconnect, account delete, offboarding purge | DONE | `deleteAllForUser`, FK cascade, hook | None found | Low |
| Poll INBOX + Sent by UID, read-only | DONE | `InboxSyncService`, `JakartaImapGateway` | None for the model; see scale | Low |
| Backoff, NEEDS_RECONNECT, entitlement stop | DONE | `InboxPoller.due/reconcile` | Alerting on stuck accounts | Low |
| Scale / second instance | PARTIAL | `AtomicBoolean` only, sequential loop | No ShedLock/DB lock, no parallelism, no metrics | Medium (latent) |
| Store headers + job-mail body, no attachments, 12-month retention | DONE | `MailText`, `JobMailRules`, `InboxRetention` | Headers of non-job mail kept 12 months | Medium (privacy) |
| PII scan of stored text | NOT BUILT | no `SensitiveContent` use in `service/inbox` | Scan/redact body before save or before AI | Medium |
| Rules classification | PARTIAL | `MailClassifier` | English only, regex, no confidence, no real-mail corpus | High (accuracy) |
| AI fallback for unsure mail | DONE | `InboxParser` (`AiTask.INBOX`, 20 per batch) | No AI for consultants without Pro; no prompt-injection note on mail body | Medium |
| Event types: received, in-review, interview invite, assessment, rejection, offer | DONE | `Category` | | Medium |
| Event types: reschedule, cancel, recruiter outreach, withdrawal | NOT BUILT | none | New categories | Low |
| Company/role extraction | PARTIAL | `companyFrom/roleFrom` | Heuristic; no requisition id, no ATS parsers | High |
| Matching (thread, company, role) | PARTIAL | `MailMatcher`, `InboxParser.thread` | No job-link/ATS-id; no "link this mail" suggestion or review queue; no `LINK_SUGGESTED` | Medium |
| Automatic status update, forward-only, audit "by Inbox", notifications | DONE | `MailMatcher.next`, `ApplicationEventService`, `NotificationService` | No confirm/undo for a wrong REJECTED | High (safety) |
| New-job suggestions: API accept/dismiss | DONE | `InboxMailService`, `InboxMailResourceIT` | | Low |
| New-job suggestions: personal UI | PARTIAL | only POST BFF | List + accept UI missing in v3 | Medium |
| Interview date/time/zone/link/location parsing | NOT BUILT | n/a | ICS and text parsing, `Interview` rows from mail (SRC_INBOX exists), reminders | High (promised value) |
| Consultant workspace Inbox (CON-70..77) | DONE | `InboxPage.tsx`, `ConsultantInboxService`, story | | Low |
| Org privacy wall (stage only) | DONE | `ConsultantInboxService`, CON-74/77 | | Low |
| Marketer attribution (D4 / 22.5) | NOT BUILT (deferred) | doc 18 s10 | Entire feature, needs user decision | n/a |
| Extension use of inbox | NOT BUILT | grep | Surface suggestions or status in the drawer (optional) | Low |
| Data export / GDPR deletion | DONE | `exportCurrentUser`, `InboxDataIT` | Export includes bodies verbatim (fine, user's own) | Low |
| Monitoring / admin health | PARTIAL | log lines only (`LOG.info/warn`); `ROADMAP 9.C4` debug panel unchecked | No metrics, no stuck-account alert | Medium |

### Build next, in priority order
1. **Real-email accuracy.** Collect a consented corpus (own test Gmail receiving real Greenhouse, Lever, Ashby, Workday, iCIMS, LinkedIn mails), write fixtures, measure precision of REJECTED/INTERVIEW per category, add a stored confidence and a route for medium-confidence mail into a confirm queue instead of auto-moving.
2. **Status-update safety.** Confirm-before-apply for REJECTED (and optionally OFFER), a one-click "undo, this was not about this job" on the timeline row, and a "needs review" list for unmatched or ambiguous-company mail (the missing `LINK_SUGGESTED` equivalent).
3. **Interview parsing.** Parse `text/calendar` parts and common text patterns into an `Interview` row (`source=INBOX`, time zone from the ICS `TZID`/offset, link, location), handle reschedule and cancel by UID of the event, and expose in the existing interviews calendar and `.ics` export. This is the biggest functional hole against the product promise.
4. **IMAP at scale.** DB-level lock or ShedLock per poll and per account, bounded worker pool, jitter across the 15 minutes, per-round duration metric, load test with GreenMail at N accounts; alert on NEEDS_RECONNECT and ERROR counts.
5. **Privacy and GDPR for stored mail.** Run `SensitiveContent` over body before save and before the AI excerpt, consider dropping headers of non-job mail after a short window, treat mail body as untrusted in the AI prompt (injection), document the retention in the privacy page (already stated per 14.7).
6. **Personal suggestions UI** (list + accept/dismiss), then marketer attribution only after the user answers D4.
7. **Monitoring.** Counters per outcome (OK, NEEDS_RECONNECT, FAILED), classification mix, AI spend for INBOX, surfaced in admin (ROADMAP 9.C4).

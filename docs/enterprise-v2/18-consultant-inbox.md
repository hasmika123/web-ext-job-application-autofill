# 18 — Consultant inbox (ent-inbox)

> Status: built on `version2`, 2026-10-14 (Sonnet). Scope decision (user, 2026-10-14): **consultants connect their OWN Gmail inside the organization
> workspace and get application tracking "the same as individuals"; the organization never sees credentials or mail.** Marketer inbox attribution
> (32 section 4, escalation D4) is **out of scope and deferred** (section 9). Decision record: **O3** in `08-decisions-for-user.md`.
> Prior art: Phase 14 of `ROADMAP.md` (personal inbox), `32-applications.md` section 4, `37-entitlement-hooks.md` row 8, `21-feature-catalog.md` (`inbox.monitoring`).

## 1. What it is

The Phase 14 inbox, unchanged in mechanism: the consultant makes a Gmail just for job hunting, turns on 2-Step Verification, creates an App Password,
pastes the address and the 16 letters, Kiwiply checks the pair against Gmail (sign in, open the inbox read-only, find Sent, sign out) and keeps it only
as `SecretBox` ciphertext. Every 15 minutes the poller reads Inbox and Sent (headers for all mail, text only for job mail, never attachments),
`InboxParser` reads it by rules (AI only for what the rules cannot settle) and moves the consultant's own applications forward or suggests new ones.
Kiwiply **never sends, moves or deletes** mail. Nothing about that changes for a person on kiwiply.com.

What is new is **who may use it and where**: a consultant who works in an organization workspace gets an **Inbox** page (`/w/consultant/inbox`, menu
entry "Inbox") and the same connection works when their *organization's license* includes the add-on `inbox.monitoring`, with no personal Pro plan.

## 2. Model

| Piece | Where | Note |
|---|---|---|
| `inbox_connection` | existing table, one per **user** | new column `connected_via_org_id BIGINT NULL` (+ index), additive migration `20261107010000_inbox_via_org.xml`. NULL = made on the personal plan. Carries no mailbox data; it is only the link that lets an offboarding purge the right connection. |
| `inbox_message`, `inbox_folder_state` | existing, per **user** | unchanged. Never has an `org_id`; no organization table points at them. |
| Status `NO_ENTITLEMENT` | `InboxConnection.NO_ENTITLEMENT` | the poller stopped reading because nothing includes inbox tracking any more. The connection is **kept** (so reading resumes by itself if the grant returns). |
| `InboxEntitlement` | `service/inbox` | the one question "may this person have an inbox?" (section 3). |
| `ConsultantInboxService` + `ConsultantInboxResource` | `service/ent/consultantws`, `web/rest/ent/consultantws` | the consultant's own routes under `/api/orgs/{orgId}/me-workspace/inbox` (section 5). |
| `ConsultantInboxOffboardingHook` | `service/ent/members` | offboarding step 450 (section 7). |
| `DemoImapGateway` + `demo/inbox-demo.json` + `ConsultantInboxDemoSeeder` | demo stack only | section 8. |

The user is the owner of the mailbox, as before. A person who is a consultant in two organizations has **one** connection; whichever workspace they
connected it from is recorded in `connected_via_org_id`.

## 3. Entitlement

**Either ground is enough** (`InboxEntitlement.decide`):

1. **Personal**: the person's own Pro or Autopilot plan (`EntitlementService.isPro`). Unchanged, including `PRO_REQUIRED` on `POST /api/profile/inbox`.
2. **Organization**: the person is an **ACTIVE** member of an organization in state ACTIVE or PAST_DUE, has an ACTIVE `consultant_profile` there, and their
   **live license** (`ACTIVE` or `CANCEL_AT_PERIOD_END`, started, not ended) holds a **live** `license_feature` `inbox.monitoring` whose window includes now.

The organization is **never taken from a client**: the workspace route carries `{orgId}`, which `OrgPermissionInterceptor` has already checked against the
host the request arrived on (04 section 3: the API resolves the tenant from the host alone; a tenant-bound token must match). `connect` passes that id to
`InboxService.connect(address, password, viaOrgId)`; the poller, which has no request, asks about every seat the person holds.
Not stacked (24 section 6 / ADR-018): the personal plan is asked first; the first grant wins.

`AuthorizationService` has no step-7 licence hook yet (X5.6); `InboxEntitlement` is that question for this one feature and is the single place to replace
when the hook lands (the call sites are `InboxService.connect`, `InboxPoller.reconcile` and `ConsultantInboxService.viewOf`).

Refusals: connecting without the add-on is **402 `FEATURE_NOT_LICENSED`** ("Your organization's license doesn't include inbox tracking. Ask your administrator to
add it."); the page shows the locked state instead of the form. Everyone who is not the consultant gets the **generic 404** (section 5).

## 4. Stopping: it must never keep reading silently

`InboxPoller.reconcile` runs for every connection each round and straight after a connect:

| Situation | Result |
|---|---|
| personal Pro **or** a live org grant | read (a `NO_ENTITLEMENT` connection returns to `CONNECTED`) |
| neither | status `NO_ENTITLEMENT`, `last_error` "Your organization no longer includes inbox tracking." (or "Inbox tracking is part of Pro." for a personal connection), **not read** |
| `NEEDS_RECONNECT` (Google refused the password) | left as is: the person must reconnect |
| made through org X and the seat in X is **gone** (REMOVED, LEFT, ERASED, or no seat) | **purged**: connection, password, folder states, every message |
| made through org X and the seat is only SUSPENDED | stopped, not purged (the person may come back) |
| a **personal-plan** connection | never purged by anything an organization does |

The page does not wait for the poller: `ConsultantInboxService.viewOf` computes the live truth on every read, so switching the add-on off shows "Your
organization no longer includes inbox tracking" on the next page load.

## 5. Routes (consultant only)

All under `/api/orgs/{orgId}/me-workspace/inbox`, gated by `ConsultantHomeService.requireSelf` (an ACTIVE seat with `opportunities.respond`, linked to an ACTIVE
consultant profile) **plus** `applications.manage` at SELF scope. Any other caller (org owner or admin, marketer, account manager, another tenant, the
platform `ROLE_ADMIN`, no account) gets the **same generic 404** as for an organization that does not exist.

| Verb + path | What |
|---|---|
| `GET` | the page: connection (never its password), `entitled`, `stoppedNote`, suggestions, the applications the mail is tracking (current stage + how the newest mail was read) |
| `POST` `{address, appPassword}` | connect through this organization's license; refusals as `{code, message}`: 400 `NOT_GMAIL` / `APP_PASSWORD_FORMAT`, 402 `FEATURE_NOT_LICENSED`, 422 `BAD_CREDENTIALS` / `APP_PASSWORD_REQUIRED` / `WEB_LOGIN_REQUIRED` / `IMAP_DISABLED`, 429 `TOO_MANY_ATTEMPTS`, 502 `UNREACHABLE`, 503 `UNAVAILABLE` |
| `DELETE` | disconnect: connection, encrypted password, folder states and every message are deleted |
| `PUT /notify` `{email}` | emails about interviews and offers on or off (409 when nothing is connected) |
| `GET /suggestions`, `POST /suggestions/{id}/accept`, `POST /suggestions/{id}/dismiss`, `GET /updates` | what the mail found and moved, the same actions as the personal board |

Web: BFF `web/src/app/api/orgs/[orgId]/me-workspace/inbox/**` (shape validation only), page `web/src/components/ent/consultant-ws/InboxPage.tsx` reusing
`InboxConnect` (the same four guided steps and the same sentences for each way Gmail can say no), menu entry `inbox` in `workspaces.json`.

## 6. The privacy wall

> The organization (admins, marketers, account managers, executives, the platform admin) sees **one thing** about a consultant's mailbox: the **stage** an
> application reached, through the existing status mirror, tagged with the source **INBOX**.

How that is enforced, in order of strength:

1. **Build rule** (`TechnicalStructureTest.organizationCodeNeverTouchesAPersonsMailbox`, ArchUnit): no class in `service.ent`, `service.dto.ent`, `service.org`,
   `web.rest.ent`, `web.rest.org`, `domain.ent` or `repository.ent` may depend on `InboxMessage`, `InboxConnection`, `InboxFolderState`, their repositories or
   `SecretBox`. The single exception is `ConsultantInboxService`, which answers the consultant about themself.
2. **Route wall**: every inbox route is consultant-only (section 5); `OrgIsolationIT` carries a row for each, so a new inbox route cannot ship without being attacked by
   every hostile caller; `ConsultantInboxResourceIT.noOneButTheConsultantReachesAnInboxRoute` does the same with real data in the mailbox.
3. **Content sweep** (`ConsultantInboxResourceIT.nothingAnOrganizationCanReadCarriesTheAddressASubjectASenderOrABody`): with a connected mailbox holding marker
   subjects, senders and bodies, every readable `/api/orgs/{orgId}/**` route is fetched as owner, admin and marketer and the audit trail is read: none contains the
   address, a marker, a sender or the code.
4. **No audit row**: connecting and disconnecting write no organization audit row (`connectingAndDisconnectingWritesNoOrganizationAuditRow`); an organization is not
   told that, or when, a consultant connects a mailbox.
5. **The mirror gets a stage and a label, not mail**: `PipelineApplicationLinker` hands `LinkedApplicationProjection.mirror(orgId, applicationId, status, source)` the
   event's source label. For `INBOX` the org application's `stage_source` reads `INBOX` and its event says "Followed the consultant's own application (source: INBOX)".
   No subject, sender, snippet or address can reach it because the mirror is never given any (`LinkedApplicationProjectionInboxTest`, `PipelineApplicationLinkerTest`).
   The mirror itself is the existing 32 section 2 path: it follows a linked application only where the consultant's consent (`DataShareService`) is FULL.
6. **Consultant-side wording**: "from your inbox" appears on the consultant's Inbox page only.
7. **Offboarding preview** lists nothing about a mailbox (`ConsultantInboxOffboardingHook.preview` is empty); the offboarding audit lists the hook key like every other step.

## 7. Offboarding

`ConsultantInboxOffboardingHook` (order 450, after consent, before resume links) purges a connection whose `connected_via_org_id` is that organization:
`InboxService.purgeConnectedVia` deletes the connection (the encrypted password), the folder states and every message. A connection made on the personal plan, or
through another organization, is untouched. If a seat ends by a path that does not run the hooks, the poller's `reconcile` does the same purge on its next round.
Reconnecting the **same Gmail** through an organization while it is already connected on the personal plan keeps it personal (an organization action never claims it).
Account deletion purges everything, as before.

## 8. Credential safety (restated, not weakened)

AES-256-GCM `SecretBox` bound to the user id; the app password is never returned by any API, never logged, never in an audit row, never in an export (the data
export carries the address and mail, not the password, as before); five connect attempts per quarter hour per person; a rejected password stops reading
(`NEEDS_RECONNECT`); the 16-letter format check and the Gmail-only check run before Gmail is asked, so a real Google password pasted by mistake is never sent
anywhere; disconnect and account deletion purge everything. The BFF forwards the password in the POST body only.

## 9. Demo and QA without a real mailbox

`ImapGateway` is the seam. `DemoImapGateway` is an in-memory read-only Jakarta Mail `Store` over the sample mailbox in `api/src/main/resources/demo/inbox-demo.json`.
It is a bean **only** when `dossier.demo.enabled=true` **and** the `prod` profile is not active (`@ConditionalOnProperty` + `@Profile("!prod")`; its constructor also
refuses prod), and `DemoImapGatewayTest` proves both. The fixed demo address and the code rules are test values read from that file: any 16 letters connect the demo
address; a code starting `zzzz` is refused as a wrong password; `yyyy` as "Gmail wants an app password"; every other address is refused. The mail goes through the real
sync, parser and board. On the demo stack a shared demo account may "connect" because there is no real mailbox behind it (`ImapGateway.isDemoSandbox`); on every other stack
`DemoGuard` still blocks demo accounts.

`ConsultantInboxDemoSeeder` (part of the enterprise demo bootstrap) adds the `inbox.monitoring` catalog row and puts the add-on on **Anika's** live license (Ben's is
left without it, for the "not included" story), and gives Anika two applications on her own tracker (Orbit Freight, Cedar Analytics) for the sample mail to move.
The stories are `web/e2e/stories/consultant/inbox.story.ts` (CON-70..CON-77, listed in `qa/stories/consultant.md`).

## 10. Deferred (not built)

- **Marketer inbox attribution (32 section 4, escalation D4)**: a marketer connecting their own Gmail so vendor replies attribute to candidate submissions as
  suggestions. Nothing in this design stores a marketer's mailbox or attributes mail to an org record; `inbox_message` has no `attributed_member_id`. D4 stays open.
- A **license-hook** step 7 in `AuthorizationService` (X5.6): `InboxEntitlement` is the placeholder (section 3).
- An admin **catalog/license editor** for the add-on: the add-on is toggled by data today (the demo seeder; billing admin pages when X5 lands).
- **AI reading of ambiguous mail for a consultant with no personal plan.** The rules settle most mail; what they cannot settle goes to the model only through the person's own AI budget (`AiBudgetService`), which a consultant who has the org add-on but no personal Pro plan does not have (`PRO_REQUIRED`). That mail is kept and marked unsure and is never acted on (a wrong "rejected" is worse than none). Charging that one call to the add-on (37 row 8: "AI classification calls as today") waits for the metering hooks (X5.6/X5.8).
- Org-level **reporting** on how many consultants have an inbox connected: deliberately absent (it would tell the organization who connects a mailbox).

# 63 - Prepare selected openings (contract v1)

Roadmap X12.2 (server and web) and X12.9 (extension). Two agents build against this one page: server and web here, the extension from the same contract.

**What it is.** On Assigned Openings (`/w/consultant/opportunities`) a consultant ticks several openings and presses **Prepare selected**. The browser extension opens one tab per job link and prefills the form from the consultant's own profile. It then waits. The consultant reviews, completes anything missing and presses Submit on the real site. When they submit, the existing submit detection and server linker (MKT-43) or the Gmail inbox creates or updates the application.

**Locks (CLAUDE.md, Autopilot).** It prepares, in the user's own browser, and stops before submit. Kiwiply never submits and never signs in as anyone. Attestation boxes are never ticked. Caps per day and per month. Everything is admin-configured. No sensitive PII is collected, stored or sent (event detail is scanned).

## 1. Settings (registry `EnterpriseSettingKeys`, admin Settings page)

| Key | Type | Default | Range | Meaning |
|---|---|---|---|---|
| `enterprise.autopilot.prepare.enabled` | BOOL | `false` | | Platform switch. Off = the feature does not exist (routes answer the generic 404; the status route says `enabled:false`). |
| `enterprise.autopilot.prepare.daily_cap` | INT | 30 | 1-1000 | Openings one consultant may prepare per UTC day. |
| `enterprise.autopilot.prepare.monthly_cap` | INT | 300 | 1-10000 | Openings one consultant may prepare per UTC calendar month. |
| `enterprise.autopilot.prepare.max_batch` | INT | 10 | 1-50 | Most openings in one request. |
| `enterprise.autopilot.prepare.session_minutes` | INT | 240 | 15-1440 | How long a session accepts events (added by this contract; nothing hard-coded). |

An organization may override each in `org_setting` (same pattern as `org.license.resumes_max`); for `enabled` an organization can only switch OFF what the platform allows. The caps count prepared items, per consultant.

**Entitlement seam.** `PrepareBatchEntitlement.check(orgId, memberId)` is the single gate; today it answers allowed unless the flag is off. A later subscription add-on plugs in here. Subscription code is not touched.

## 2. API (consultant only; org from the host/token; generic 404 for everyone else)

All under `/api/orgs/{orgId}/con/prepare`, behind `ConScope` (the consultant id is the caller's seat, never a request value).

- `GET /api/orgs/{orgId}/con/prepare/status` -> `{enabled, maxBatch, remainingToday, remainingMonth, dailyCap, monthlyCap}` (web only; added by this contract).
- `POST /api/orgs/{orgId}/con/prepare` body `{matchIds:[long]}` (`matchId` = the `requirement_match` id the Assigned Openings page already uses) -> 200
  `{sessionId, expiresAt, jobs:[{matchId, url, title, company}], skipped:[{matchId, reason}], remainingToday, remainingMonth}`.
  - Flag off: 404. A match that is not one of the caller's own ASSIGNED matches: the whole call is a generic 404.
  - Eligible: opportunity state ASSIGNED, VIEWED or INTERESTED (no opportunity row yet counts as ASSIGNED), job OPEN or IN_REVIEW, a usable https job URL. Others are listed in `skipped` with a reason: `NOT_ELIGIBLE` (declined, closed, applied, needs info), `JOB_NOT_OPEN`, `NO_URL`.
  - `matchIds` empty or more than `max_batch`: 400 (`VALIDATION`, `PREPARE_BATCH_TOO_LARGE`). Nothing eligible: 200 with `jobs:[]`, no session charged.
  - Caps: if the eligible count exceeds `min(remainingToday, remainingMonth)` the call is 409 `PREPARE_CAP_REACHED` with `{remainingToday, remainingMonth}` in the body; nothing is created.
  - Idempotent per (consultant, match) within the session: repeating the same request while an unexpired session already holds exactly those eligible matches returns that session and charges nothing.
  - Audited (`CONSULTANT_PREPARE_BATCH`, consultant actor). No PII beyond title and company of the job.
- `POST /api/orgs/{orgId}/con/prepare/{sessionId}/events` body `{matchId, event, detail?}` with `event` in `OPENED, PREFILLED, NEEDS_INPUT, SUBMIT_DETECTED, CLOSED, FAILED`; `detail` at most 200 characters, scanned for sensitive data (400 otherwise) -> 204. 404 for a session or match that is not the caller's. 409 `PREPARE_SESSION_EXPIRED` after `expiresAt`.
  - Item state: OPENED -> Opened, PREFILLED -> Filled, NEEDS_INPUT -> Needs your input, SUBMIT_DETECTED -> Submitted, CLOSED -> Closed, FAILED -> Failed. After Submitted the state does not go back; later events are still recorded.
  - `SUBMIT_DETECTED` only records. It never sets APPLIED. The application is created and linked by the existing path (extension saves the application, `PipelineApplicationLinker` links it; or the Gmail inbox). The session view shows `applied:true` once that has happened.
- `GET /api/orgs/{orgId}/con/prepare/{sessionId}` -> `{sessionId, expiresAt, items:[{matchId, url, title, company, state, detail, applied, updatedAt}]}` for the web progress panel (web only).

Extension allow-list (`ExtensionRoutes`, enterprise `ext=1` tokens, own org only): `POST .../con/prepare` and `POST .../con/prepare/{sessionId}/events`. The GET routes are not on it.

Tables (additive Liquibase `20261117010000_prepare_batch.xml`): `prepare_session`, `prepare_item` (unique per session and match), `prepare_event` (append only).

## 3. Web to extension handoff

```
{ type: 'KIWIPLY_PREPARE_BATCH', version: 1, sessionId, apiBase, orgId, jobs: [{ matchId, url, title, company }] }
```

**Channel.** The existing `externally_connectable` path (`chrome.runtime.sendMessage(EXT_ID, ...)`) works only on the platform hosts (`kiwiply.com`, `www`, `app`); an enterprise account lives on its tenant host, which the extension cannot list. So on the tenant host the web page posts the message to itself with `window.postMessage(msg, window.location.origin)`, the same page-to-relay pattern as `connect-relay.content.ts` (Firefox) and `extension-signal.ts`. **The extension agent adds a content-script bridge for tenant hosts** (it may register it dynamically for the connected organization's host, or match `*.kiwiply.com`; custom domains need the dynamic route) that:

1. accepts the message only when `event.source === window` and `event.origin === window.location.origin`;
2. checks the host is the tenant host of the extension's connected enterprise account and that `orgId` equals the account's org;
3. ignores `apiBase` unless it equals the extension's own configured API base (the web value is a hint, never trusted);
4. forwards to the background and replies to the page: `window.postMessage({ type: 'KIWIPLY_PREPARE_ACK', version: 1, sessionId, ok: true }, origin)`. `ok:false` with a short `reason` is allowed (for example not signed in to that organization). The web treats a missing `ok` as true.

The extension de-duplicates by `sessionId` (the web may resend after a reload), opens one tab per job, prefills from the signed-in consultant's own profile, reports `OPENED / PREFILLED / NEEDS_INPUT / SUBMIT_DETECTED / CLOSED / FAILED` to the events route with its `ext=1` token, never clicks Submit, never ticks attestation boxes, and enforces nothing the server did not already cap (the server is the source of truth for caps).

**Web behavior.** No ACK within 3 s: "Extension not detected" guidance (install or connect, reload) and a fallback **Open links one by one** that uses the existing Open job link. The batch action is desktop-only: on phones it is hidden with a note.

## 4. Web UI

Assigned Openings: a checkbox per eligible row and **Prepare selected (n)** (only when the feature is enabled and the viewport is a desktop one), remaining caps shown, and a plain reason on every row that cannot be selected (declined, applied, closed, needs your answer, no link). A confirm dialog says: "Kiwiply opens each job in a new tab and fills it from your profile. Nothing is submitted for you: you review, fix anything missing and press Submit yourself." After confirm, a progress panel lists each item as Waiting, Opened, Filled, Needs your input, Submitted, Closed (or Could not open) and polls the session.

## 5. Out of scope

Subscription gating (the seam is left), cloud auto-apply (never), the extension implementation (X12.9), org-admin UI for the org overrides.

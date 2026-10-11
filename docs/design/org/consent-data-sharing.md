# Consent and data sharing — what an org can see about a person (stories O6.*, O10.1)

> Status: design, 2026-10-11. Locked inputs: `ROADMAP.md` 21.1 `data_share` (`NONE|SUMMARY|FULL`),
> 21.3 ("counts only, and only with the member's consent"), 22.1 consent + instant revocation,
> "Prepare, never submit as someone else". GDPR Art. 6/7/13/17/20/30; CCPA/CPRA right to know/delete.
> Existing code: `AccountDeletionResource`/`AccountDeletionService` (erasure), `AccountExportResource`
> (export), `AdminAuditEvent` (audit shape), `Notification`.

## 1. Decisions

1. **The person owns the switch.** Scope is set by the member on the join screen, changeable any
   time from the user app (`/settings/organizations`), and **revocation takes effect on the next
   request** (no cache; `data_share` is one indexed read, like `EntitlementService`).
2. **Three scopes, exactly as locked:** `NONE`, `SUMMARY`, `FULL`. `SUMMARY` is the default the
   join screen proposes; orgs may set `settings.defaultShareScope = NONE` (a university that only
   wants seat counts). `FULL` can only be granted **to a named member** (a paired MARKETER in
   Phase 22; a COACH later), never to "the org".
3. **SUMMARY is counts and states, never names of employers or documents.** The matrix in §3 is
   the contract; the DTO (`§4`) is generated from it and tested against it so a new field cannot
   leak by accident.
4. **Lawful basis is consent for both SUMMARY and FULL** (not legitimate interest): the member is
   told what, who and why in one screen, the text version is stored with the grant, and withdrawing
   is as easy as granting (GDPR Art. 7(3)). Seat existence (`org_member` row, role, status) is
   contract/legitimate-interest data and is visible to admins regardless of scope — you cannot buy a
   seat for someone and not know you did.
5. **Every FULL read is audited** (`org_audit_event SHARE_READ_FULL`, target = member login,
   details = what: `board|resume:{id}|applications`). SUMMARY reads are not audited per row (they
   are aggregates) but exports are (`EXPORT`).
6. **Minimum age 16.** Kiwiply's terms require 16+ (GDPR Art. 8 ceiling). A `SCHOOL`/`BOOTCAMP`
   org asserts on creation that members are 16+; under-16 is out of scope (open question in PLAN).
7. **The org never gets the raw material.** No endpoint returns a member's answers cache
   (`field_cache`), AI answers, inbox messages, or the content of applications' custom answers to any
   org role — not even FULL. FULL = board (companies, roles, stages, dates, notes the member marks
   shareable), resumes (documents), job assignments, and interview dates.
8. **Marketer "no-submit" is structural**, see `marketer-workspace.md` §6: no API submits, the
   extension refuses an `act_for` context, attestation boxes are never ticked (Phase 19.2 detectors).

## 2. Data model (`20261011030000_org_data_share.xml`)

### `data_share`
| column | notes |
|---|---|
| id | |
| org_id, member_id | FK; `member_id` UNIQUE (one current scope per membership) |
| scope | `NONE` `SUMMARY` `FULL` |
| full_to_member_id | FK org_member NULL; required when `FULL` (the marketer/coach); when that pairing ends, scope drops to `SUMMARY` automatically |
| consent_version | VARCHAR(20) — the consent text version shown (`consent/org-share/v1`), text lives in the repo under `api/src/main/resources/consent/` |
| granted_at, updated_at | |

### `data_share_event` (append-only history, the accountability record)
`id, org_id, member_login VARCHAR(50), from_scope, to_scope, full_to_login NULL, actor VARCHAR(20)
(MEMBER|ORG_ADMIN|SYSTEM), reason VARCHAR(40) (JOIN|MEMBER_CHANGE|MEMBER_LEFT|REMOVED|PAIRING_ENDED|ERASED),
consent_version, ip_hash CHAR(64), user_agent_hash CHAR(64), created_at`. Keyed by login strings;
kept after erasure (Art. 7(1) proof of consent is a legal obligation; it contains no profile data).

## 3. Visibility matrix

| data about the member | NONE | SUMMARY | FULL (paired marketer/coach only) | who else |
|---|---|---|---|---|
| Seat: name as entered on invite, email, role, status, joined date, group, support owner, items assigned | ✓ | ✓ | ✓ | OWNER/ADMIN/FINANCE(billing cols) |
| Activated (accepted + ≥1 resume or ≥1 application or extension connected) | ✓ (yes/no) | ✓ | ✓ | |
| Counts per stage (saved/applied/interview/offer/rejected) in a period | | ✓ | ✓ | STAFF for own members |
| Last activity date (bucketed to the day) | | ✓ | ✓ | |
| Resume readiness: has resume (yes/no), ATS band (low/mid/high), last updated date | | ✓ | ✓ | |
| Interview count upcoming (number only) | | ✓ | ✓ | |
| Placement: "placed" flag + date (member-declared, §6) | | ✓ | ✓ | |
| Employer names, job titles, locations, salaries | | ✗ | ✓ | |
| Application detail (dates, stage history, next action, shareable notes) | | ✗ | ✓ | |
| Resumes (list + documents) | | ✗ | ✓ (and may create new ones, `marketer-workspace.md`) | |
| Interview calendar entries (when/where/type) | | ✗ | ✓ | |
| Job assignments / job bank | | ✗ | ✓ | |
| Answers cache, AI drafts, inbox mail, custom answers, private notes, login/security data | ✗ | ✗ | ✗ | platform admin only, audited reason |

Aggregates shown to an org (dashboard, analytics) include only members with scope ≥ SUMMARY and
are suppressed below **5 members** per cell (`analytics.md` §4) — a cohort of 3 would otherwise be
re-identifiable.

## 4. API shapes

```
GET  /api/orgs/{id}/members                       → MemberRowDTO (seat fields + summary fields nulled when scope < SUMMARY,
                                                     plus `shareScope` so the UI can explain the blanks)
GET  /api/orgs/{id}/members/{m}/summary           → MemberSummaryDTO (scope ≥ SUMMARY, else 404-shaped 403 → we return 403 SHARE_SCOPE here,
                                                     because the seat is known to exist; message tells the admin to ask the member)
GET  /api/orgs/{id}/members/{m}/board             → FULL only (paired); audited
GET  /api/orgs/{id}/members/{m}/resumes           → FULL only (paired); audited
--- member side (user app) ---
GET  /api/me/orgs                                 → [{org, role, scope, fullTo?, since, whatTheySee[] (rendered from the matrix)}]
PUT  /api/me/orgs/{orgId}/share                   {scope, consentVersion} → writes data_share + event; FULL requires an existing pairing
POST /api/me/orgs/{orgId}/leave
```
`MemberSummaryDTO` fields are generated from a single `ShareField` enum annotated with its
minimum scope; `ShareMatrixTest` renders the enum to a table and compares it with §3 of this file
(a doc/code drift fails the build).

## 5. Flows (390 px wireframes)

### 5.1 Join + consent (after sign-in/sign-up via the invite link)
```
┌──────────────────────────────┐
│  ◉ Acme Bootcamp invited you │
│  by Priya Nair · Cohort 26-B │
│                              │
│  You keep your account.      │
│  Acme pays for: Pro ✓        │
│                              │
│  What Acme can see           │
│  ┌──────────────────────────┐│
│  │ ● Progress summary (rec.)││
│  │   how many applications, ││
│  │   what stage, resume     ││
│  │   ready or not. Never    ││
│  │   company names or files.││
│  │ ○ Only that I joined     ││
│  └──────────────────────────┘│
│  [What exactly? ▾]           │
│                              │
│  Change this anytime in      │
│  Settings → Organizations.   │
│                              │
│  [ Join Acme Bootcamp ]  ▸   │
└──────────────────────────────┘
```
One tap default (SUMMARY), one alternative (NONE). FULL never appears here: it is only offered
when a marketer is paired (`marketer-workspace.md` §3) in its own screen that names the person.

### 5.2 Your organizations (user app `/settings/organizations`)
```
│ Acme Bootcamp        Member  │
│ Pays for: Pro · since Oct 3  │
│ They see: progress summary ▸ │
│ [Change]        [Leave org]  │
│ Mehta Staffing       Member  │
│ Pays for: Autopilot          │
│ They see: everything, shared │
│ with Rahul S. (marketer) ▸   │
│ [Stop sharing]  [Leave org]  │
```
"Stop sharing" on FULL → confirmation sheet "Rahul loses access right now. Your org admin is told
you stopped sharing (not why)." → `PUT share {scope: SUMMARY}`; the marketer's open tabs get 403 on
the next call; `Notification` to org ADMINs `SHARE_REVOKED` (member name, no reason).

### 5.3 Admin seeing a blank
Team row with `shareScope=NONE` shows "—" in progress columns and a chip "Not sharing"; tapping it
explains "Aarav chose to share only that he joined. You can ask him — we won't nudge him for you."
(No "request access" button: pressure from an employer or school is the thing we refuse to build.)

## 6. Placement declaration
The org's most-wanted metric ("placed") is personal. The member declares it: on an application in
`OFFER` the user app asks "Did you accept? 🎉" → `application.outcome = ACCEPTED, accepted_at`
(new nullable columns on `application`, additive) and, if scope ≥ SUMMARY, the org sees "placed"
+ date, **not** the employer unless FULL. A celebratory share card (image) is offered to the member
to post — social moment, their choice.

## 7. GDPR / CCPA mapping

| right | how |
|---|---|
| Information (Art. 13) | join screen + "What exactly?" sheet render the matrix; the consent text version is stored |
| Access / portability (Art. 15/20) | existing `GET /api/account/export` adds `organizations[]` with memberships, scopes, assignments, and the `data_share_event` history |
| Erasure (Art. 17) | existing `DELETE /api/account` → `tenant-model.md` §6; org aggregates are anonymous; `data_share_event`/`org_audit_event` keep the login string only (Art. 17(3)(b)/(e)) |
| Withdraw consent (Art. 7(3)) | `PUT /api/me/orgs/{id}/share` — one tap, no friction, no retention of FULL views (marketer-made resumes stay with the member, they own them) |
| Records of processing (Art. 30) | `data_share_event` + `org_audit_event` |
| Org as controller/processor | the org is an independent controller for seat data it enters (names, emails it uploads); Kiwiply is the controller of the member's product data and shares derived summaries with the org under the member's consent. The org terms (21.5) say so; the CSV upload step shows "only upload people you may invite". |
| CCPA "do not sell/share" | nothing is sold; sharing is user-directed (CPRA §1798.140(ah)(2)(A)); the privacy page lists orgs as a recipient category |
| Minors | 16+ terms; SCHOOL/BOOTCAMP creation asserts it; no separate flow |

## 8. Failure modes & abuse

- Admin uploads a CSV of people who never agreed to be contacted → invite email is a single
  message with "Not you? Ignore; we won't email again" and a per-org daily invite cap (1,000) plus a
  **bounce/complaint kill-switch**: >5 % complaints suspends the org's inviting (admin-queue alert).
- Marketer pairing ended but the UI still shows FULL data → every FULL endpoint re-checks pairing +
  scope per request; nothing cached client-side beyond the page.
- Member erased → marketer's job bank keeps `job_assignment` rows with `member_id` pointing at an
  `ERASED` membership (no user); the UI shows "Former member"; resumes were deleted with the account.
- Org tries `GET .../summary` on a NONE member → 403 `SHARE_SCOPE`, audited `SHARE_DENIED` (helps
  spot pressure patterns: many denials on one member → platform admin review).

## 9. Tests
- `ShareMatrixTest` (doc ↔ enum), `MemberSummaryScopeTest` (NONE/SUMMARY/FULL → fields present/null),
  `FullReadAuditTest`, `RevocationIsImmediateTest` (grant FULL, read ok, revoke, read 403 in the same
  second), `AccountExportIncludesOrgsTest`, `ErasureAnonymisesMembershipTest`, web: consent screen
  renders both options with ≥44 px targets at 390 px; "Stop sharing" sheet copy snapshot.

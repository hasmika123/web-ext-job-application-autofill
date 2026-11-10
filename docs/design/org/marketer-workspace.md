# Consultancy Marketer — pairing, workspace, job bank, inbox, the no-submit guarantee (stories O10.*)

> Status: design, 2026-10-11. Locked inputs: `ROADMAP.md` Phase 22 (all "Decisions locked for this
> phase" + tasks 22.1–22.6), Phase 19 (Autopilot queue, never ticks attestation), Phase 14 (inbox
> model), `CLAUDE.md` → "Prepare, never submit as someone else". Depends on `tenant-model.md`,
> `consent-data-sharing.md` (FULL scope), `billing.md` (Marketer seat $29.99, consultant ≥ Pro seat).

## 1. Decisions

1. **A marketer is `org_member.role = MARKETER` in a `CONSULTANCY` org, paired to ≤10 consultants
   by an org admin** (`marketer_assignment`). Pairing alone grants nothing: the consultant must set
   `data_share` to `FULL` naming that marketer. Until then the marketer sees the consultant as a
   seat with "waiting for consent".
2. **Everything the marketer makes belongs to the consultant.** Resumes are rows in the
   consultant's `resume` table with `kind=MARKETER_MADE`, `made_by_member_id`, `approved_at NULL`
   until the consultant approves; they count toward the consultant's cap; an unapproved resume cannot
   be selected by the extension, Autopilot, or a job assignment.
3. **The job bank is a batch of `job_assignment` rows**, one per (consultant, job), each with a
   resume (the batch default or an override), status `ASSIGNED → IN_QUEUE → APPLIED | SKIPPED`,
   ≤100 open per consultant. One notification per batch.
4. **The consultant always does the last mile**: Autopilot (own seat) or opens each link (Pro);
   submit-detect (existing extension `submitDetect`) marks the assignment `APPLIED`.
5. **No-submit is structural, not policy** (§6): there is no server endpoint that submits, no
   `act_as` token, no extension mode that runs on a marketer's session for a consultant, and the
   Phase 19.2 attestation detectors are a hard stop in every fill.
6. **The marketer's inbox is their own Gmail over IMAP** (Phase 14 model: text only, no attachments,
   12-month retention, never send/move/delete), attributed to consultants by rules first and AI
   second, charged to the marketer seat's $4/month budget.
7. **Marketer actions are audited at the person level** (`org_audit_event` with target = consultant
   login): resume created/edited, assignment batch, inbox attribution changes, FULL reads.

## 2. Data model (`20261011060000_marketer.xml`)

### `marketer_assignment`
`id, org_id, marketer_member_id, consultant_member_id, status (ACTIVE|ENDED), started_at, ended_at,
created_by_member_id`. Unique live pairing per consultant (generated `live_key` as in billing);
`CHECK` in service: marketer role = MARKETER with an active Marketer-seat grant; consultant has an
active Pro or Autopilot grant; count(active per marketer) ≤ `consultants.max` (10, from the catalog
entitlement).

### `resume` additions (user area table, additive)
`kind VARCHAR(20) DEFAULT 'OWN' (OWN|MARKETER_MADE|EXPERT_MADE)`, `made_by_member_id BIGINT NULL`,
`made_by_label VARCHAR(80) NULL` ("made by your marketer Rahul"), `approved_at DATETIME(6) NULL`,
`approval_required BOOLEAN DEFAULT false`. The resume builder (`R*`) renders the label and the
approve button; `ResumeResource` list returns `approved` so the extension/Autopilot can filter.

### `job_assignment`
| column | notes |
|---|---|
| id, org_id, consultant_member_id, marketer_member_id | |
| batch_id | FK `job_assignment_batch` (name, note, default_resume_id, created_at) |
| job_url VARCHAR(2048), job_url_hash CHAR(64) | unique per consultant (`(consultant_member_id, job_url_hash)`) |
| job_title, company, location, source (PASTE|MATCH|EXTENSION|BOARD) | captured via the existing `JobCapture` (JSON-LD/adapters) when the marketer pastes a link |
| job_posting_id NULL | FK to `job_posting` when the link resolves to a known posting (Phase 16 tables) |
| resume_id | must be the consultant's and approved (or approval pending — the queue waits) |
| status | `ASSIGNED` `IN_QUEUE` (Autopilot item created) `APPLIED` `SKIPPED` `EXPIRED` (job closed) |
| note VARCHAR(500) | marketer's note to the consultant |
| autopilot_item_id NULL, application_id NULL | set by the consultant's side |
| assigned_at, applied_at, skipped_at, skip_reason | |

### `autopilot_item` additions (Phase 19 table): `assignment_id NULL`, `resume_id NULL`.
### `inbox_message` additions: `attributed_member_id NULL`, `attribution (RULE_NAME|RULE_BOARD|RULE_THREAD|AI|MANUAL|NONE)`,
`needs_review BOOLEAN` — for the marketer inbox only (their own `inbox_connection` row, `owner_kind=MARKETER`).

## 3. Consent for FULL (consultant side, 390 px)
```
┌──────────────────────────────┐
│ Mehta Staffing paired you    │
│ with Rahul Sharma (marketer) │
│                              │
│ With your OK, Rahul can:     │
│  • see your board & resumes  │
│  • build resumes for you     │
│    (you approve each one)    │
│  • line up jobs for you      │
│  • read recruiter mail about │
│    you that reaches him      │
│ Rahul can never:             │
│  • submit an application     │
│  • sign in as you            │
│  • see your answers or inbox │
│                              │
│ Stop any time in Settings.   │
│ [ Allow Rahul ]  [Not now]   │
└──────────────────────────────┘
```
`PUT /api/me/orgs/{org}/share {scope: FULL, fullTo: rahulMemberId, consentVersion}`. "Not now"
leaves SUMMARY; the marketer sees "waiting for consent" and the admin can nudge *in person*.

## 4. Marketer workspace (web `/org/marketer/*`, nav for role MARKETER)

```
┌──────────────────────────────┐
│ Consultants ▾  Aarav M.  ●   │   switcher sheet: 5 consultants, consent + seat chips
├──────────────────────────────┤
│ Board  Resumes  Jobs  Mail   │   segmented control
│ ─── Jobs (bank) ───          │
│ Open 38 · Applied 12 · Skipped 2
│ [ + Add jobs ]  [Assign batch]│
│ ☐ Stripe · SWE II · Remote   │
│    resume: Backend v4 ▾      │
│ ☐ Notion · Platform Eng      │
│    resume: Backend v4 ▾      │
│ …                            │
│ Default resume: Backend v4   │
│ Note to Aarav: "Priority this │
│ week: fintech"               │
│ [ Assign 14 jobs → Aarav ]   │
└──────────────────────────────┘
```
- **Board** = read view of the consultant's applications (FULL), with marketer notes (separate
  `job_assignment.note`/`application_note` visible to both).
- **Resumes** = list + "New resume for Aarav" → the resume builder (`R*`) in *act-for* mode
  (`made_by_member_id`), AI tailoring charged to the marketer seat budget (`R5` tailoring with
  `budget_owner = marketer grant`). Approval badge per resume.
- **Jobs** = bank; "Add jobs" sheet accepts pasted links (one per line), picks from the
  consultant's job matches, or shows items saved from the extension's **"Save for consultant…"**
  (a drawer action that appears only when the signed-in extension user has role MARKETER — it
  creates `job_assignment` rows with `status=ASSIGNED` on the chosen consultant, `source=EXTENSION`).
- **Mail** = the marketer inbox (§5).

## 5. Marketer inbox (22.5)
- Connect: the same `InboxConnection` flow (address + app password, encrypted by `SecretBox`), with
  `owner_kind=MARKETER` and `org_id`. One per marketer.
- Attribution per message, in order: (1) consultant name or email in headers/body
  (`RULE_NAME`), (2) company/job already on a paired consultant's board (`RULE_BOARD`), (3) thread
  already attributed (`RULE_THREAD`), (4) AI classification only when 1–3 fail and ≥2 consultants are
  plausible (`AI`, charged to the marketer budget), else `needs_review=true`.
- On attribution with a status (`INTERVIEW|OFFER|REJECTED|…` via the existing inbox parser), update
  the consultant's application status (same code path as Phase 14.4 for the user's own inbox) and
  notify **both** (consultant `Notification` + marketer digest).
- "Needs review" list: one tap assigns to a consultant (`MANUAL`), re-training nothing (no model
  training on mail — it is text we hold for 12 months only).
- Everything about the marketer inbox is visible to the marketer only; consultants see the *effect*
  (status change, "from recruiter mail to Rahul") not the mail.

## 6. The no-submit guarantee (technical controls)

| control | where |
|---|---|
| No submit endpoint exists; `ApplicationSyncResource` records what the **extension observed**, it does not act | API |
| JWT has no `act_as`/impersonation claim; `OrgAccessService` resolves only the caller's own membership | API |
| Marketer resources are under `/api/orgs/{id}/marketer/**` and can **create** `job_assignment`, `resume(kind=MARKETER_MADE)`, notes — the allowed verbs are enumerated in `MarketerPermission` and tested | API |
| Extension: the drawer in a MARKETER session shows "Save for consultant…" only; autofill on a page runs with the **signed-in user's own profile** (the marketer's), never a consultant's; the engine never receives a consultant's `bio`/answers (no endpoint returns them to a marketer) | extension `src/lib/tracking.js` seam |
| Autopilot (19.2) runs only in the consultant's browser session with the consultant's token; `autopilot_item.assignment_id` just supplies job+resume | extension/API |
| Attestation/certification/consent checkbox detectors (19.2) stop the fill before the final page for **every** user; assigned jobs are not special | extension adapters |
| `job_assignment` → `APPLIED` only via submit-detect from the consultant's extension (`application_id` set), never by a marketer action | API |
| Consultant approves each marketer-made resume once (`approved_at`) — they attest its truth | API/web |
| Audit rows for every marketer write and FULL read; consultant can see "what Rahul did" timeline in Settings → Organizations | API/web |

## 7. Caps and budgets (from the catalog, not code)
`org.marketer`, `consultants.max=10`, `assignments.open_max=100` (per consultant),
`ai.budget_cents_per_period=400`, `inbox=true`. Assigned jobs count toward the consultant's own
Autopilot 300/month, 30/day. Exceeding `assignments.open_max` → 409 `ASSIGNMENT_CAP` with the count.

## 8. Failure modes
| failure | behaviour |
|---|---|
| consent revoked mid-batch | batch stays (rows are the consultant's); marketer loses the view; consultant keeps the assigned jobs and can skip them |
| resume unapproved when Autopilot reaches the item | item parks as `NEEDS_YOU` "approve the resume Rahul made" |
| job link dead | nightly check marks `EXPIRED`; marketer sees it; consultant's board hides it |
| duplicate job already on the consultant's board | assignment links to the existing application instead of creating a new one; marked `APPLIED` if already applied |
| marketer leaves the org | pairings `ENDED`; scopes drop to SUMMARY; open assignments stay |
| mail misattributed | consultant sees the status change with "from mail to Rahul — not you? Undo" → reverts status, sets `attribution=NONE`, flags for review |

## 9. Tests
`MarketerScopeTest` (sees only paired+consented consultants; another marketer's → 404),
`ApprovalGateTest` (unapproved resume unusable by extension/Autopilot/assignment), `AssignmentCapTest`,
`BatchNotificationTest` (one per batch), `InboxAttributionTest` (rule order, AI only when ambiguous,
budget charged to marketer), `NoSubmitSurfaceTest` (reflection: no route under `/api/orgs/**/marketer`
writes `application.status`; no claim named `act_as`), extension jsdom: "Save for consultant" only for
MARKETER role; autofill uses the marketer's own profile. Web: switcher, bank, approval badge at 390 px.

# 33 — Interviews: org coordination over the consultant's own calendar, `.ics`, AI interview prep

> Status: design, 2026-10-12 (Session D). Requirements §12 (coordinate interviews, attend, record
> feedback), §25 Interviews pages. Build-ready for **X9.5–X9.7**. Reuses: `interview` (person-owned:
> `kind` PHONE|VIDEO|ONSITE|TECHNICAL|BEHAVIORAL|PANEL|OTHER, `outcome` PENDING|PASSED|REJECTED|NO_SHOW,
> `source` WEB|INBOX|ASSISTANT, `tz`, `location`, `interviewer`, `notes`, unused `reminder_24h_sent_at`/`reminder_1h_sent_at`),
> `InterviewService.create/update/outcome/range/ics`, `IcsCalendar.interview(...)` (VCALENDAR
> METHOD:PUBLISH, VTIMEZONE, UID `interview-<id>@kiwiply.com`), `InterviewResource` (`/api/profile/...`),
> `ShareField.UPCOMING_INTERVIEW_COUNT` (SUMMARY) / `INTERVIEW_CALENDAR` (FULL), `AiRouter`/`AiBudgetService`,
> `ResumePrompts` record shape `Prompt(id, version, task, system, user, schemaId, Hints, changelog)`.

## 1. Two rows, one interview

| row | owner | purpose |
|---|---|---|
| `interview_slot` (org) | org | the coordination record: who proposed, with which client contact, status, outcome as the org knows it, feedback the org collects |
| `interview` (person) | consultant | the consultant's calendar entry on their own board; reminders; `.ics` download; their private notes |

The org never writes the person's row. When the consultant **confirms** a slot, the API creates
their `interview` row *under their own token* (`InterviewService.create(applicationId, body)` with
`source = "ORG"` — new 3-char constant `SRC_ORG`, column is `varchar(12)`), stores
`interview_slot.interview_id` — `interview.application_id` becomes **nullable** for this
(`dropNotNullConstraint` in the Phase-9 changelog `20261023010000_ent_applications.xml`, X9.5; 09 row 20),
because an org-coordinated interview may precede any application row — and from then on the two are reconciled one way: consultant edits
to time/outcome propagate to the slot (SYSTEM), org edits to the slot create a **re-propose** the
consultant confirms again.

## 2. `interview_slot` (final DDL)

`id, org_id, submission_id NULL, match_id NULL, consultant_member_id, interview_id NULL (person row),
kind (16, same vocabulary as `interview.kind`), round SMALLINT, starts_at, ends_at, tz (48),
location (200), video_url (500), with_contact_id NULL (client_contact), interviewer_label (120),
status, proposed_by_member_id, proposed_at, confirmed_at, cancelled_reason (40), outcome
(12: PENDING|PASSED|REJECTED|NO_SHOW|CANCELLED), outcome_recorded_by, feedback_json, prep_note (500),
created_at, updated_at`. At least one of `submission_id`/`match_id`. Index `(org_id, consultant_member_id, starts_at)`,
`(org_id, status, starts_at)`.

`feedback_json` shape (structured, no free-form PII): `{"client": {"rating": 1-5, "note": "<=300"},
"consultant": {"rating": 1-5, "went_well": "<=300", "improve": "<=300"}}` — both notes through
`SensitiveContent.check`. The consultant's feedback is visible to the marketer only when the
consultant marks it shareable (`feedback_json.consultant.shared = true`).

## 3. State machine (registered in `PipelineTransitions`, 31 §2)

```
PROPOSED ──confirm (consultant)──▶ CONFIRMED ──done (consultant | SYSTEM at ends_at+2h)──▶ DONE ──outcome──▶ (outcome set)
   │             └──decline (consultant, reason) ──▶ PROPOSED (re-propose by org) | CANCELLED
   └──cancel (org / consultant)──▶ CANCELLED                     CONFIRMED ──no-show (org)──▶ NO_SHOW
```

| from | to | actor | permission | guards | effects | notifications |
|---|---|---|---|---|---|---|
| — | PROPOSED | MARKETER / ACCOUNT_MANAGER (or SYSTEM suggestion from the consultant's board, §4) | `interviews.coordinate` | submission ∈ {SUBMITTED, SHORTLISTED} or match IN_PROGRESS; `starts_at` future; no overlapping CONFIRMED slot for the consultant (409 `SLOT_OVERLAP`) | row | consultant `ORG_INTERVIEW` "Sarah proposed an interview with Globex · Tue 14:00 — confirm?" (email now) |
| PROPOSED | CONFIRMED | CONSULTANT | `interviews.manage` (OWN) | — | create person `interview` (source ORG, `applicationId` = linked application or NULL — **`interview.application_id` becomes nullable** (additive) so an interview for a client submission with no board application still lands on the calendar); submission → INTERVIEWING (31 §5 adds `INTERVIEWING` between SHORTLISTED and OFFERED in the registry) | marketer/AM `ORG_INTERVIEW`; client contact: nothing (Kiwiply never emails outsiders) |
| PROPOSED | PROPOSED (re-propose) | org after a decline | `interviews.coordinate` | new time | history in `pipeline_event` | consultant |
| PROPOSED | CANCELLED | org / consultant | | reason | | other party |
| CONFIRMED | CANCELLED | org / consultant | | reason; person row deleted via `InterviewService.delete` **by the consultant only**; if the org cancels, the person row stays with a note "Acme cancelled" and the consultant removes it | | other party |
| CONFIRMED | DONE | SYSTEM (`ends_at + 2h`) or CONSULTANT | | | reminder "How did it go?" (`ORG_INTERVIEW`, dedupe `slot:{id}:feedback`) | consultant |
| CONFIRMED | NO_SHOW | org | `interviews.coordinate` | after `starts_at` | outcome NO_SHOW on slot; the consultant's row outcome unchanged (they own it) | consultant |
| DONE | DONE + outcome | org (`PASSED|REJECTED`) or SYSTEM from the consultant's own `interview.outcome` | | | submission → SHORTLISTED/REJECTED suggestion for the AM | both |

## 4. Suggestions from the consultant's board

When the consultant logs an interview on a **linked** application (`interview` row via web/inbox),
`InterviewSlotSuggester` (SYSTEM, FULL consent required — it reads `INTERVIEW_CALENDAR`) creates a
PROPOSED-by-system slot already CONFIRMED (the consultant made it) so the marketer sees it on the
org calendar. Without FULL, the org only sees `UPCOMING_INTERVIEW_COUNT` go up.

## 5. Calendar, `.ics`, reminders (X9.5)

- Consultant: existing `GET /api/profile/interviews/{id}/ics` works unchanged for the person row.
- Org: `GET /api/orgs/{orgId}/interviews/{slotId}/ics` (viewer with `interviews.coordinate` or FULL)
  → `IcsCalendar.event(uid, summary, description, starts, ends, tz, location)` — a new overload that
  takes plain values (the existing method only accepts an `Interview`); UID `slot-<id>@kiwiply.com`;
  no ATTENDEE lines (we never invite outsiders); METHOD:PUBLISH. The org calendar page offers a
  per-user **feed** only through O12.3 (ICS feed), not here.
- Reminders: `InterviewReminderJob` (every 10 min; ShedLock-ready) sends `INTERVIEW_REMINDER` (existing
  kind) 24 h and 1 h before for person rows **with any source**, writing the existing
  `reminder_24h_sent_at`/`reminder_1h_sent_at` columns — this fulfils the parked U7 intent for
  everyone, not only consultants; and `ORG_INTERVIEW` to the slot's proposer 24 h before (grouped).
- Org calendar page (`/w/{marketing|accounts|admin}/interviews` — one `OrgInterviewsPage` mounted in
  three workspaces, 16 §7 / 09 row 1; X9.6): week/agenda views built on the same `Calendar`
  primitive the user app uses (`@kiwiply/ui`), rows = slots at TEAM/ORG scope **with consent
  projection**: SUMMARY viewers see "Interview · Anika" blocks without client names; FULL viewers
  see client + contact.

## 6. AI interview preparation (X9.7, feature `interview.ai_prep`)

- New `AiTask.PREP("prep")` (≤ 12 chars wire). Prompt `InterviewPrompts.PREP_PLAN` (same `Prompt`
  record as `ResumePrompts`): inputs = opportunity/requirement text (org-owned or public posting
  description), the pinned approved resume text (`ResumeDocumentText`), the slot kind and round;
  output schema `{"focus": [..≤8], "questions": [{"q","why","star_hint"}..≤10], "stories_to_prepare": [..≤5], "red_flags_to_avoid": [..≤5]}`.
  No company research fetch (no scraping); only what the org and the consultant already hold.
- Entitlement: `EntitlementService.check(actor = consultant, beneficiary = consultant, feature =
  interview.ai_prep, quantity = 1)` → `usage_event`; the marketer may **request** a prep for the
  consultant (`POST …/slots/{id}/prep/request` → `ORG_INTERVIEW` nudge) but the generation runs
  only when the consultant opens it (their session, their consent to send resume text to the model,
  `consent=true` as the existing AI endpoints require). Org-curated practice sets (O8.6) appear
  alongside when the org published them.
- Text-only, as locked (no voice). Mascot encouragement copy from `38` §6 ("honest delight":
  one line, never on a NO_SHOW/REJECTED screen).
- Stored as `interview_prep(id, user_id, slot_id NULL, interview_id NULL, plan_json, model, created_at)`
  — person-owned, no `org_id`; the org never reads it (not in `ShareField`).

## 7. API summary

| method | path | who | notes |
|---|---|---|---|
| GET | `/api/orgs/{orgId}/interviews?from=&to=&consultant=&status=` | `interviews.coordinate` / `pipeline.view` | consent projection |
| POST | `/api/orgs/{orgId}/interviews` | `interviews.coordinate` | propose `{submissionId|matchId, kind, round, startsAt, endsAt, tz, location?, videoUrl?, withContactId?, prepNote?}` |
| POST | `…/interviews/{slotId}/repropose` · `/cancel` · `/no-show` · `/outcome {outcome, client feedback}` | org | |
| GET | `…/interviews/{slotId}/ics` | org viewer | §5 |
| GET | `/api/me/orgs/{orgId}/interviews` | consultant | proposed + confirmed |
| POST | `/api/me/orgs/{orgId}/interviews/{slotId}/confirm` · `/decline {reason}` · `/cancel` · `/done` · `/feedback {rating, wentWell, improve, shared}` | consultant | creates/updates the person row |
| POST | `/api/profile/interviews/{id}/prep` · GET `/prep` | consultant | §6, `@RequiresFeature("interview.ai_prep", SELF)` |
| POST | `…/interviews/{slotId}/prep/request` | marketer | nudge only |

## 8. Tests
`InterviewSlotStateTest` (registry ↔ doc), `SlotConfirmCreatesPersonRowTest` (source ORG, nullable
application), `SlotOverlapTest`, `IcsCalendarEventTest` (new overload; VTIMEZONE; no ATTENDEE),
`InterviewReminderJobTest` (idempotent via the two columns), `InterviewPrepServiceTest` (schema,
entitlement, consent flag, no org read path), `InterviewOrgViewTest` (SUMMARY hides client names),
Playwright `interviews.spec.ts` (propose → confirm at 390; org calendar at 1440).

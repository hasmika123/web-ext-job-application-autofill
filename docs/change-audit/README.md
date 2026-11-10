# Change audit — who changed it, and when (applications, and the rule for every shared record)

> Status: design, 2026-10-15 (Fable). Stories U6.12–U6.15 (`docs/roadmap/areas/user.json`) and X9.13–X9.15
> (`docs/roadmap/areas/ent.json`). Build order in §7. Decisions that need the user in §8.
>
> The user's requirement, verbatim: *"want to make sure any time some one changes the resume or job application ..
> need to log and show on the resume who modified last time.. and when modifed.."*
>
> The **resume** half is being built right now on `ent-resume-builder-b` (`Resume.updated_by_login`, `ResumeActors`,
> `ResumeActAs.authorOr`, "Last modified … by …" in `ResumeHeaderBar`). This document does **not** redesign it; it
> takes it as **the pattern** and applies the same shape to **job applications** (personal tracker and the organization
> pipeline), then states the cross-cutting rule for any record more than one person can change.

Related rules (CLAUDE.md): **E1** marketers record, consultants submit, Kiwiply never submits · **O4** enterprise accounts are
separate from personal accounts, never mixed · **O5/O6** an assigned marketer sees what the Org Admin chose per consultant
(`19b-marketer-visibility-per-assignment.md`) · never collect sensitive PII · everything admin-configured.

---

## 1. Current state — what each record records today

Legend: **who** = a person is named · **when** = a timestamp · **history** = an append-only list of changes.

| Record | Created (who / when) | Last modified (who / when) | History | Files |
|---|---|---|---|---|
| **application** (personal tracker) | no / `created_at` | no / `updated_at` | `application_event` (below) | `api/.../domain/Application.java`, `ApplicationPatchService.java`, `ApplicationSyncService.java` |
| **application_event** (the tracker timeline) | — | — | append-only: `kind`, `from_status`, `to_status`, **`source`** WEB / EXTENSION / INBOX / SYSTEM / ASSISTANT, `ref_id`, `summary` (≤ 200 chars), `created_at`. **No actor.** `WEB` is rendered as "by you" (`TimelineTab.tsx` `SOURCE` map) — true only while the owner is the only possible writer. | `domain/ApplicationEvent.java`, `service/ApplicationEventService.java` (the one writer), `web/src/components/app-v3/applications/TimelineTab.tsx` |
| **application_note** | no / `created_at` | no / `updated_at` | one `NOTE` event on create ("Note added"); **edit, pin and delete write nothing** (`ApplicationNoteService.update/delete`) | `domain/ApplicationNote.java`, `service/ApplicationNoteService.java` |
| **interview** | `user_id` (owner, not actor) / `created_at` | no / `updated_at` | `INTERVIEW` events on schedule / reschedule / remove / outcome, all hard-coded `SRC_WEB`; `interview.source` WEB / INBOX / ASSISTANT | `domain/Interview.java`, `service/InterviewService.java` |
| Silent fields on application | — | — | **`starred`, `nextActionAt`, `email`, `salary`, `location`, `jobType/jobMode`, attachment** change with no event at all (only `updated_at` moves) | `ApplicationPatchService.apply`, `ApplicationSyncService.update` |
| **talent_application** (org pipeline, 32 §3) | no (`marketer_member_id` is the owner, not the creator) / `created_at` | no / `updated_at`, `stage_changed_at` | `talent_application_event`: `event_type`, `from_stage`, `to_stage`, **`actor_member_id`** (null = system), `detail`, `occurred_at`. Every mutation also writes an `org_audit_event` row (`APPLICATION_CREATE/UPDATE/STAGE/STAGE_UNDO/NOTE`). | `domain/ent/talent/TalentApplication*.java`, `service/ent/applications/ApplicationCommandService.java` |
| **talent_application_note** | `author_member_id` / `created_at` | immutable | — | `domain/ent/talent/TalentApplicationNote.java` |
| **talent_interview** | no / `created_at` | no / `updated_at` | `talent_interview_event` with `actor_member_id` | `domain/ent/talent/TalentInterview*.java` |
| **mkt_submission** (31, E1 record) | `prepared_by_member_id` / `created_at` | no / `updated_at` | `mkt_submission_event` with `actor_member_id`, `field`, `from_value`, `to_value` (the best shape in the codebase) + `org_audit_event` | `domain/ent/mkt/MktSubmission*.java`, `service/ent/mkt/submissions/MktSubmissionsService.java` |
| **cws_submission** (consultant's view of a prepared package) | `marketer_member_id` (preparer) / `created_at` | no / `updated_at`, `decided_at` | — (demo-seeded stand-in while the marketer side settles) | `domain/ent/consultantws/CwsSubmission.java` |
| **pipeline_application_link** | `source` SUBMIT_DETECT / CONSULTANT / BOARD_SAVE / `linked_at` | `unlinked_at` | `mkt_opportunity_event` written by `PipelineApplicationLinkWork` (actor = system, by design) + `LINKER_*` audit rows | `domain/ent/mkt/MktPipelineApplicationLink.java`, `service/ent/consultant/PipelineApplicationLinkWork.java` |
| **resume** (pattern, being built) | `created_by_login` / `created_at` | **`updated_by_login`** / `updated_at` | `resume_doc_version.created_by_login` per version; act-for stamps the marketer through `ResumeActAs.authorOr` | `domain/Resume.java`, `service/ResumeActors.java`, `service/resume/ResumeActAs.java`, `web/.../resume-builder/ResumeHeaderBar.tsx`, `headerBar.ts` (`actorText`, `modifiedTitle`) |
| **job_data_event** (61 §3, prior art) | — | — | append-only ledger: `actor_kind` MEMBER / SYSTEM / EXTENSION / FEED + `actor_member_id`, `fields` (names only, never values) | `domain/ent/talent/JobDataEvent.java`, `service/ent/jobs/JobDataAuditService.java` |
| Security trails | `org_audit_event` (`actor_login`, `actor_role`, `beneficiary_login`, `risk`, `hostname_id`) · `admin_audit_event` (`actor_login`, `reason`) | both login-keyed, no FK, survive erasure | security trail, not a user-facing history | `domain/org/OrgAuditEvent.java`, `service/org/OrgAuditService.java`, `domain/AdminAuditEvent.java` |
| `AbstractAuditingEntity` (`created_by` / `last_modified_by` logins via `SpringSecurityAuditorAware`) | — | — | **only `User` extends it**; no tracker or pipeline entity does | `domain/AbstractAuditingEntity.java` |

### The gaps

1. **The personal tracker never names an actor.** `application_event.source` says *which channel*, not *who*. The moment anyone but the
   owner can write a personal application (X9.12 "Save for consultant…", act-for), "by you" becomes a lie.
2. **No `last_modified_by` on any application-side head record** (application, note, interview, talent_application, talent_interview,
   mkt_submission, cws_submission). The resume is the only record with one.
3. **Silent edits**: star, next-action date, note edit/pin/delete, attachment, and the extension's field syncs move `updated_at` with no history row.
4. **Interviews write `SRC_WEB` unconditionally**, even when the inbox parser or the assistant created them.
5. **Enterprise rows name a member id, never a person**: `actor_member_id` is resolved to a name only on the ent Applications page
   (`ApplicationNames`); the consultant's workspace reduces it to `YOU / MARKETER / TEAM` (`ConsultantApplicationsService.by`).
6. **No "what changed"** on the personal side (`summary` is prose); `mkt_submission_event` has `field/from/to` but nothing else does.
7. **Erasure**: tracker events have no actor to erase, and nothing defines what a name resolves to after the account is gone.
8. **Retention** of history is not configurable anywhere (only `enterprise.usage.retention_months` exists, and it is not enforced).
9. The synthetic enterprise login `ent#<orgId>#…` would leak through any login-based fallback (`ResumeActors.resolve` labels an
   unknown login *as the login*).

---

## 2. The rule

> **Every user-facing change records: the actor (user id + display name resolved at read), who it was done for (on-behalf-of),
> the source channel, the time, and what changed (field names, enum/short values only — never free text). Each record carries
> `created_by` / `updated_by` + `created_at` / `updated_at` for fast display. The record's history is append-only.**

Applies to: application, application_note, interview, talent_application, talent_interview, talent_application_note, mkt_submission,
cws_submission, and — by the resume branch — resume. Any future record that **more than one person can change** (offers, placements,
interview feedback, timesheets) follows the same columns and the same resolver; `ChangeAuditCoverageTest` (U6.12) lists the entities and
fails when a new table with an `updated_at` lacks an `updated_by_*`.

### 2.1 Data model decision: extend the record's own event table (no generic `change_log`)

| | **A. Extend `application_event`** (and the ent `*_event` tables) | **B. Generic `change_log(record_type, record_id, …)`** |
|---|---|---|
| Histories | one per record — the timeline the user already reads **is** the audit | a fifth ledger beside `application_event`, `talent_application_event`, `mkt_submission_event`, `job_data_event`; two truths per record |
| Readers | `TimelineTab`, `DetailDrawer`, `ActivityTimelinePage`, dashboard activity bars — all exist | none; every surface would need a second query and a merge |
| Writers | `ApplicationEventService.record` is already **the one writer** for the tracker; `ApplicationCommandService.record` for the pipeline | a new aspect/listener or a call in every service — the thing that drifts |
| "What changed" | add a `changes` column | native |
| Cross-record uniformity | by convention + `ChangeAuditCoverageTest` | by schema |
| Migration | additive columns + one backfill | new table, no backfill of the past |

**Decision: A.** Extend `application_event` (additive Liquibase) and keep the ent event tables, which already carry `actor_member_id`.
The event table of a record is its history; the head record carries the fast `updated_by`. No generic `change_log`. The org security
trail (`org_audit_event`) and the admin trail stay what they are — security logs with risk and reason — and are **not** shown as "history"
to end users.

### 2.2 Columns (all additive; nothing is dropped or renamed)

**Personal side** — keyed like the resume (login string, no FK) **plus** the user id (the requirement asks for the id; it also makes the
"you" check and the batch lookup a primary-key fetch).

```
application_event
  + actor_kind            VARCHAR(12) NOT NULL DEFAULT 'SYSTEM'   -- PERSON | EXTENSION | MAIL | ASSISTANT | SYSTEM
  + actor_user_id         BIGINT NULL                              -- the signed-in person; null for the four non-person kinds
  + actor_login           VARCHAR(50) NULL                         -- same person by login (survives the user row, like resume/audit)
  + on_behalf_of_user_id  BIGINT NULL                              -- act-for: the record's owner when actor ≠ owner; else null
  + changes               VARCHAR(1000) NULL                       -- JSON array, see 2.4
  (existing) source       WEB | EXTENSION | INBOX | SYSTEM | ASSISTANT  = the channel, unchanged

application, application_note, interview
  + created_by_user_id BIGINT NULL, created_by_login VARCHAR(50) NULL
  + updated_by_user_id BIGINT NULL, updated_by_login VARCHAR(50) NULL
  (existing) created_at, updated_at  = created / last-modified time
```

Names mirror the resume (`created_by_login` / `updated_by_login`), so one web helper reads both.

**Enterprise side** — member-keyed, as every ent event table already is:

```
talent_application, talent_interview, mkt_submission, cws_submission
  + created_by_member_id BIGINT NULL, updated_by_member_id BIGINT NULL     (updated_at exists)
talent_application_note
  + updated_by_member_id BIGINT NULL, updated_at TIMESTAMP NULL            (author_member_id = created_by)
talent_application_event, talent_interview_event, mkt_submission_event
  + actor_kind VARCHAR(12) NOT NULL DEFAULT 'PERSON'                        (SYSTEM rows: actor_member_id null — the linker)
  + changes    VARCHAR(1000) NULL
```

`on_behalf_of` is **not** stored on ent rows: the beneficiary is the record's own consultant (`consultant_id`), always.

**Backfill (one changeSet, idempotent):** existing `application_event` rows with `source` WEB or EXTENSION get `actor_kind = PERSON`,
`actor_user_id = application.user_id`, `actor_login = user.login` — safe because, before this design, only the owner could write a
personal application. INBOX → MAIL, ASSISTANT → ASSISTANT, SYSTEM → SYSTEM. Head records: `updated_by_* = owner` where `updated_at`
is set. Ent rows with a non-null `actor_member_id` → PERSON, else SYSTEM. (Decision D1.)

### 2.3 Who is the actor — attribution table

| Situation | `actor_kind` | actor | on_behalf_of | `source` | Shown as (to the owner) |
|---|---|---|---|---|---|
| Owner edits in the web app | PERSON | owner | — | WEB | "by you" |
| Owner clicks in the extension drawer (save a job, fill report "I applied") | PERSON | owner | — | EXTENSION | "by you via the extension" |
| Extension **submit-detect** (automatic APPLIED + `submissionConfirmed`) | EXTENSION | — | — | EXTENSION | "by the extension" |
| Inbox parser moved the status / created an interview | MAIL | — | — | INBOX | "by Kiwiply from your email" |
| Assistant / AI wrote a field | ASSISTANT | — | — | ASSISTANT | "by Kiwiply AI" |
| Migration, demo seed, retention job, `PipelineApplicationLinker` projections | SYSTEM | — | — | SYSTEM | "by Kiwiply" |
| **Marketer acts for a consultant** (X9.12 "Save for consultant…", any future act-for on the tracker) | PERSON | marketer | consultant (owner) | WEB | "by Sarah Chen (marketer)" |
| Marketer / admin edits a **talent_application** | PERSON (`actor_member_id`) | marketer | (consultant_id) | — | "by Sarah Chen (marketer)" / "(admin)" |
| Consultant's own tracker change mirrored into the org (`LinkedApplicationProjection`) | SYSTEM | — | — | — | "by Kiwiply (from Anika's tracker)" |

How the write knows: `ApplicationEventService.record` grows an `Actor` argument resolved once per request by a small
`ChangeActor` component — `SecurityUtils.getCurrentUserLogin()` → user, plus `TrackerActAs.current()` (U6.13/X9.15: the tracker twin of
`ResumeActAs`, same thread-local, same "the caller already proved access" contract) for on-behalf-of. The submit-detect case is the
existing branch in `ApplicationSyncService.update` (`"extension".equalsIgnoreCase(app.getSource()) && status == APPLIED &&
submissionConfirmed`) — it passes `actor_kind = EXTENSION`; every other extension write is PERSON. Inbox and assistant listeners pass
MAIL / ASSISTANT explicitly. Nothing is inferred from `source` at read time any more.

### 2.4 "What changed" — `changes`

A JSON array of `{ "f": "<field>", "from": "<short>", "to": "<short>" }`, ≤ 1000 chars, written by the service that knows the before/after:

- enum and short fields (`status`, `outcome`, `starred`, `archived`, `jobType`, `jobMode`, `resumeId`, `interview.kind`, `outcome`, `stage`,
  `approvalState`) carry `from` / `to`;
- **free-text fields carry the name only** (`{"f":"nextAction"}`, `{"f":"body"}`, `{"f":"notes"}`, `{"f":"salary"}`, `{"f":"email"}`) — the
  value stays on the record, never in the history (the no-PII rule; `SensitiveContent` already guards the record);
- dates carry ISO values (`nextActionAt`, `startsAt`);
- one event per request: a PATCH that changes status and next step writes **one** STATUS event whose `changes` lists both, instead of two rows.
  (`summary` stays the human line for the top field, exactly as today.)

### 2.5 Display name resolution — `ChangeActors`

One resolver for every surface (the tracker twin of `ResumeActors`; the ent side keeps `ApplicationNames.personName` and gains the same
fallbacks): batch by user id / member id, one query per page.

1. `first_name last_name` of the account, when set;
2. else the org seat's `display_label` (`org_member.display_label`) when the actor is an enterprise account;
3. else, for a **personal** login, the login (what `ResumeActors` does today);
4. **an enterprise login (`ent#…`) is never shown** — step 3 is skipped and the label is `"a member"`;
5. no user row / seat `ERASED` → **`"a former member"`** (org context) or **`"a deleted account"`** (personal context);
6. the actor is the viewer → `"you"` (the web decides, by comparing `actor.userId` with the session's user id — as `headerBar.actorText`
   does with the login).

**Relation tag** (org context only): the resolver returns `relation` ∈ `marketer | admin | consultant | member | system` computed against
the record's consultant: the consultant's assigned marketer → `marketer`; OWNER / ORG_ADMIN → `admin`; the record's own consultant →
`consultant`; any other seat → `member`. The web renders it as the small uppercase tag `TimelineFeed` already supports
(`actor.tag`, `packages/ui/src/enterprise/boards.tsx`).

DTO, everywhere: `ChangeActorDTO { userId, memberId?, label, relation?, kind }` with `kind` = `actor_kind`. The resume keeps its own
`ResumeActorDTO(login, label)`; the web helper `actorText` grows one overload so both render through the same function.

### 2.6 Accounts are never mixed (O4)

A personal application only ever names personal actors **or** an enterprise actor acting for its owner through `TrackerActAs` inside that
owner's org seat. `actor_login` of an enterprise account is stored (it is the audit key) but never rendered (2.5 step 4). An enterprise
record (`talent_*`, `mkt_*`, `cws_*`) names member ids of **that organization only**; `ApplicationNames.memberNames` already yields nothing
for a foreign id, so a cross-tenant id renders as "a member" and never as a name. Every read of history goes through the record's own
access check (owner / `TrackerUsers.application`, or the ent `ApplicationAccess` + tenant from the host) — a record of another org or
another person is the generic 404, history included.

---

## 3. Display

Gen Z / Notion style: quiet grey meta text, no labels shouting "AUDIT", absolute time on hover, "you" instead of your own name.
`@kiwiply/ui` only: `ClockIcon`, `Tooltip`, `StatusChip`, `MemberAvatar`, `TimelineFeed`, `DataTable`. No new primitive; one new helper
`actorText(actor, viewer)` in `web/src/lib/actors.ts` (moved up from `resume-builder/headerBar.ts`, re-exported there).

### 3.1 Application detail header (personal tracker, `ApplicationDetail.tsx`)

One meta line under the status chips, exactly where the resume puts "Last modified":

```
ClockIcon  Updated 2h ago by you                     ← title="Oct 15, 2026, 9:42 AM by you"
ClockIcon  Updated 2h ago by Sarah Chen (marketer)   ← an act-for write (consultant's own tracker, org lens)
ClockIcon  Updated 3d ago by the extension
ClockIcon  Updated 5d ago by Kiwiply from your email
```

- `updatedAt` / `updatedBy` come on the detail DTO; "you" when `updatedBy.userId === me.id`.
- Phone: the same line, tap → opens the **Timeline** tab (no hover on touch). A second, lighter line "Added Sep 30" (created) only in the
  ⋮ menu, like the resume's phone "About" block.
- After the user's own autosave the line reads "Updated just now by you" without a refetch (`savedIsNewer`, as `ResumeHeaderBar`).

**1440 (right-side `SideSheet`, 520 px)**

```
┌──────────────────────────────────────────────────────────────┐
│ Senior Backend Engineer · Stripe                      ☆   ✕  │
│ ┌──┐  San Francisco · $180k–$210k                             │
│ │St│  [● Interview]  [Gone quiet]                             │
│ └──┘  ◷ Updated 2h ago by Sarah Chen (MARKETER)   ← new line │
│        ^ hover: "Oct 15, 2026, 9:42 AM by Sarah Chen"         │
│ [↗ Open posting] [▣ Archive]                                  │
│ Where does this stand?                                        │
│ [Saved] [Applied] [In review] [Interview] [Offer] …           │
│ ───────────────────────────────────────────────────────────── │
│ Timeline · Notes · Emails · Resume · Interview                │
└──────────────────────────────────────────────────────────────┘
```

**390 (`BottomSheet`)**

```
┌──────────────────────────────┐
│ ━━━                          │
│ Senior Backend Engineer      │
│ Stripe                    ☆  │
│ [St] SF · $180k–$210k        │
│      [● Interview]           │
│      ◷ Updated 2h ago        │
│        by Sarah Chen MARKETER│  ← wraps to two lines; tap → Timeline tab
│ [Open posting] [Archive]     │
│ Where does this stand?       │
│ [Saved][Applied][In review]… │
└──────────────────────────────┘
```

### 3.2 List rows (`ApplicationsV3Page.tsx`)

Desktop `DataTable`: a new **Updated** column (`w-[14%]`, sorts by `updatedAt,desc`, which the sort menu already offers as "Recently
updated"):

```
Role / Company          Status        Applied   Updated                 Next step
Senior Backend Engineer [● Interview] Oct 2     2h ago                  Follow up with Sarah
Stripe · SF                                     by Sarah Chen MARKETER  Oct 17, 9:00 AM
Data Analyst            [● Applied]   Oct 9     3d ago                  —
Acme                                            by the extension
Product Designer        [● Saved]     —         5d ago                  —
Figma
```

- Second line = the actor, **only when it is not the viewer** (D2): a personal board would otherwise read "by you" on every row.
  System actors ("by the extension", "by Kiwiply from your email") do show — they are the information.
- Phone cards (U6.5) and the current phone list: the card's meta line becomes `Applied Oct 2 · Updated 2h ago by Sarah Chen`
  (truncating the name, never the time).
- Row payload: `updatedAt` already exists on `Application`; add `updatedBy: ChangeActorDTO | null` (one batch resolve per page in
  `ApplicationListService.enrich`).

### 3.3 Timeline / history entries (`TimelineTab.tsx`)

Each entry: **what** (bold, the existing `eventText`), then **who · how · when** in the muted line:

```
●  Moved to Interview
   👤 by Sarah Chen MARKETER · 2h ago                       (title: Oct 15, 2026, 9:42 AM)
○  Next step: Follow up with Sarah
   by you · 2h ago
○  Interview scheduled: Video, Oct 17
   ✉ by Kiwiply from your email · 5d ago
○  Moved to Applied
   ⚡ by the extension · 12d ago
○  Added to your tracker
   ⚡ by you via the extension · 12d ago
```

- The `SOURCE` map stops deciding "who": `label` becomes the *channel* suffix (`via the extension`, `from your email`) and the actor text
  comes from `actorText(e.actor, me)` + `e.actorKind`. Icon: the existing source icons; a person gets `MemberAvatar` (18 px) in org
  context, nothing in the personal context.
- `changes` renders as a quiet chip row under the line when it has more than the headline field: `status Applied → Interview · next step`
  (field names only for text fields). Collapsed by default behind "Details"; never for CREATED.
- Phone: the muted line shows `2h ago · Oct 15, 9:42 AM` (absolute inline, since there is no hover).
- Full history beyond `tracker.detail.eventsMax`: "Show all history" loads `GET …/events?page=` (U6.13).

### 3.4 Organization workspaces

**Consultant's My Applications** (`ent/consultant-ws/ApplicationsPage.tsx`, `ConsultantApplicationsService`): `TimelineEntry.by` turns from
`YOU | MARKETER | TEAM` into `ChangeActorDTO`; the page renders `by you`, `by Sarah Chen MARKETER`, `by Priya Raman ADMIN`, `by Kiwiply`.
The detail header gets the same "Updated 2h ago by …" line as 3.1.

**Org Applications page** (admin / marketing manager, `ent/applications/DetailDrawer.tsx`, `ApplicationsTable.tsx`) and the **marketer
workspace tracker** (`marketer-ws/applications/TrackerTable.tsx`):

```
1440 — DetailDrawer header                            1440 — ApplicationsTable row
┌───────────────────────────────────────────┐        Code   Consultant   Role @ Client   Stage        Updated
│ APP-0231 · Anika Shah → Stripe            │        0231   Anika Shah   Sr BE @ Stripe  [Interview]  2h ago
│ [● Interview]                             │                                                         by Sarah Chen MARKETER
│ ◷ Updated 2h ago by Sarah Chen MARKETER   │        0229   Dev Patel    Analyst @ Acme  [Applied]    1d ago
│   Created Sep 30 by Priya Raman ADMIN     │                                                         by Kiwiply
│ ───────────────────────────────────────── │
│ Activity                                  │
│  ● Stage Applied → Interview              │
│    [SC] Sarah Chen MARKETER · 2h ago      │
│  ○ Next action set                        │
│    [SC] Sarah Chen MARKETER · 1d ago      │
│  ○ Applied (from Anika's tracker)         │
│    Kiwiply SYSTEM · 12d ago               │
└───────────────────────────────────────────┘

390 — DetailDrawer as BottomSheet                     390 — table collapses to cards
┌──────────────────────────────┐                      ┌──────────────────────────────┐
│ ━━━                          │                      │ Anika Shah · Sr BE @ Stripe  │
│ APP-0231                     │                      │ [● Interview]                │
│ Anika Shah → Stripe          │                      │ Updated 2h ago · Sarah Chen  │
│ [● Interview]                │                      └──────────────────────────────┘
│ ◷ Updated 2h ago             │
│   by Sarah Chen MARKETER     │
│ Activity ▾                   │
└──────────────────────────────┘
```

The relation tag is what the consultant and the admin both see: **the same row, the same words** ("by Sarah Chen (marketer)"). The
feed already supports `actor.tag` in `TimelineFeed`; the only change is to pass `relation` instead of a hard-coded string.

---

## 4. Privacy and retention

### 4.1 Who can see the history

| Viewer | Personal application history | Org record history (`talent_*`, `mkt_*`, `cws_*`) |
|---|---|---|
| The owner / the consultant | always, in full | their own rows via the consultant workspace (`requireSelf`): stage events, who and when; the marketer's internal notes stay hidden (32 §3) |
| Assigned marketer | only through the org lens, only when the Org Admin ticked **`APPLICATIONS`** for that assignment (19b), only shared notes; unassigned → 404 | `pipeline.view` at ASSIGNED scope |
| Org Admin / Owner / Marketing Manager | the consented FULL/SUMMARY projection of 32 §3 — history rows only at FULL | `pipeline.view` + `member.view_full`; the org security trail needs `audit.view` |
| Another org, another user | 404, always (tenant from the host; owner check) | 404 |
| Platform admin | never through this path (break-glass X6.17 is its own, audited door) | same |

No new permission key: history inherits the gate of the record it belongs to (09 row 8: there is no `applications.view`).

### 4.2 Export

- The owner's DSAR export (`TrackerDataService` → T1.2) includes every application's events **with the actor label resolved at export
  time** and `actor_kind`, never `actor_login` of an enterprise account and never another person's user id (labels only).
- Org CSV exports of applications (X4.9 / X11.6 style, audited `EXPORT`) include `updated_at` and the actor label; exports are audited as today.

### 4.3 Erasure

- **The actor's account is erased**: rows are kept (no FK); `actor_user_id` / `actor_login` / `actor_member_id` stay as opaque keys;
  the resolver renders **"a former member"** (org context) / **"a deleted account"** (personal). `OrgMembershipPrivacyService.eraseFor`
  already clears the seat's `display_label`, so step 2 of the resolver finds nothing and step 5 applies. No name is ever snapshotted into
  a row — that is why a name cannot outlive its account.
- **The record's owner is erased**: the application and its events go with the account (`TrackerDataService`, existing), and the org-side
  projection follows the existing ERASED seat rules. The `org_audit_event` security trail stays, login-keyed, as it does today.

### 4.4 Retention (admin-configured, never hard-coded)

| Key | Default | Range | Effect |
|---|---|---|---|
| `tracker.history.retention_months` | **0 = for the life of the record** | 0–120 | `TrackerHistoryRetentionJob` (nightly, ShedLock) deletes `application_event` rows older than N months, never the newest row of a record and never the head record's `updated_by_*` |
| `enterprise.history.retention_months` | **0** | 0–120 | same for `talent_application_event`, `talent_interview_event`, `mkt_submission_event`; per-org override through `org_setting` when the registry supports it |

The retention job is the **only** deleter besides account erasure; the repositories keep exposing no `delete` for anyone else
(`OrgAuditEventRepository` pattern). The job writes one SYSTEM `org_audit_event` per org per run (`HISTORY_PURGED`, count only).

---

## 5. Stories

Full text lives in the roadmap JSONs (`node docs/roadmap/build-master-roadmap.mjs --list` shows them under U6 and X9). Summary:

| ID | Area / epic | Title | Size |
|---|---|---|---|
| **U6.12** | user / U6 | Change-audit schema on the tracker: actor_kind, actor, on-behalf-of, changes on `application_event`; created_by / updated_by on application, note, interview; backfill; `ChangeAuditCoverageTest` | M |
| **U6.13** | user / U6 | Every tracker change writes an attributed history row: `ChangeActor` + `TrackerActAs`, silent edits covered, `changes` summaries, `ChangeActors` resolver (never `ent#`, "a former member"), DTOs (`updatedBy` on detail + rows, `actor` on events), paged `GET …/events` | M |
| **U6.14** | user / U6 | "Updated … by …" on the application header, list rows and timeline entries (390 / 1440), `actorText` shared helper, system and act-for wording | M |
| **U6.15** | user / U6 | History privacy: export carries resolved labels, erasure renders "a former member" / "a deleted account", `tracker.history.retention_months` + `TrackerHistoryRetentionJob` | S |
| **X9.13** | ent / X9 | Enterprise records carry who/when: `updated_by_member_id` (+ created_by) on talent_application, talent_interview, talent_application_note, mkt_submission, cws_submission; `actor_kind` + `changes` on the ent event tables; relation in `ChangeActorDTO`; backfill | M |
| **X9.14** | ent / X9 | Org and consultant workspace display: "Updated … by Sarah Chen (marketer)" in the org DetailDrawer / table, marketer tracker, consultant My Applications timeline (names + relation instead of YOU/MARKETER/TEAM); erased seat → "a former member" | M |
| **X9.15** | ent / X9 | Act-for on the personal tracker: `TrackerActAs` used by X9.12 "Save for consultant…", on-behalf-of stamped, consultant sees "by Sarah Chen (marketer)", cross-tenant and unassigned → 404; `enterprise.history.retention_months` + purge for the ent event tables | M |

Each story carries persona, objective, functional, UI, backend, DB, APIs, permissions, deps, acceptance criteria, test cases (act-for,
system-source, cross-tenant 404, erasure), complexity and DoD in the JSON.

---

## 6. API summary

| Method · path | Change |
|---|---|
| `GET /api/profile/applications` (list v2) | rows gain `updatedBy: ChangeActorDTO \| null` (`updatedAt` exists) |
| `GET /api/profile/applications/{id}` | `createdBy`, `updatedBy`; `events[].actor`, `actorKind`, `onBehalfOf`, `changes` |
| `GET /api/profile/applications/{id}/events?page=&size=` | **new**: full paged history, newest first (owner only, 404 otherwise) |
| `PATCH /api/profile/applications/{id}`, notes, interviews, `POST /api/profile/applications` (sync) | unchanged contracts; every write stamps actor + updated_by and records a history row |
| `GET /api/orgs/{orgId}/applications`, `…/{id}` | `Row.updatedAt/updatedBy`; `Detail.createdBy/updatedBy`; `EventItem.actor` gains `relation`, `kind`, `changes` |
| `GET /api/orgs/{orgId}/me-workspace/applications/{id}` | `TimelineEntry.by` → `ChangeActorDTO` (relation included); `Detail.updatedBy` |
| `GET /api/orgs/{orgId}/mkt/applications` | rows gain `updatedAt/updatedBy` |
| Settings registry | `tracker.history.retention_months`, `enterprise.history.retention_months` (A5.1 registry, LOW risk) |

`OpenApiContractIT` regenerates `openapi.json` in every API story.

---

## 7. Build order

1. **U6.12** schema + backfill + coverage test (nothing user-visible yet; safe to deploy alone).
2. **U6.13** attributed writes, resolver, DTOs, paged history (the API truth; the old `SOURCE`-based "by you" keeps working meanwhile).
3. **U6.14** web: header, rows, timeline (390 / 1440 Playwright).
4. **X9.13** ent columns + relation + `actor_kind` (parallel with 3; same resolver rules).
5. **X9.14** ent web surfaces.
6. **X9.15** act-for on the tracker (`TrackerActAs`) — lands with or right after X9.12, which is the first real act-for writer.
7. **U6.15** export / erasure wording / retention job + settings.

Sonnet builds; one story = one commit = one PR into `develop` (the roadmap tracks status; `--set U6.12=done` etc.).

---

## 8. Decisions for the user

| # | Decision | Recommendation | Safe default (used if no answer) |
|---|---|---|---|
| **D1** | Backfill old `application_event` rows (WEB / EXTENSION) to the owner as actor? Before this design only the owner could write, so the attribution is true; the alternative shows "by Kiwiply" on all old history. | **Yes, backfill to the owner.** | backfill |
| **D2** | On list rows, hide "by you" (show the actor only when it is someone or something else)? The header always shows it. | **Hide "by you" in lists**, show system actors and other people. | hide |
| **D3** | Column naming: mirror the resume (`created_by_login` / `updated_by_login` + `_user_id`) or the requirement's words (`last_modified_by`)? | **Mirror the resume** — one web helper, one mental model. | mirror the resume |
| **D4** | Record `from → to` values in `changes` for enum/date fields (never for free text)? | **Yes** — it is what makes "what changed" answerable without reading prose. | yes |
| **D5** | History retention default: keep for the life of the record (0) or 24 months? | **0 (life of the record)** — a job search is a long story; admins can lower it. | 0 |
| **D6** | Relation tag wording for admins: "(admin)" or the role's display name ("Marketing Manager")? | **Fixed five words** (marketer / admin / consultant / member / system) — roles are data and rename; the tag must not. | fixed words |
| **D7** | Should the consultant see the Org Admin's edits on their own `talent_application` by name ("Priya Raman (admin)")? O6 says the admin sees everything of the consultant; symmetry says the consultant sees who touched their record. | **Yes, by name** — transparency is the point of this feature. | yes |

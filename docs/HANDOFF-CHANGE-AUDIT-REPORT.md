# Change audit: build report

Branch `change-audit`. Design: `docs/change-audit/README.md`. Stories U6.12, U6.13, U6.14, X9.13, X9.14, U6.15 are done; **X9.15 is partly built and `in_progress`** (blocked on X9.12). The user's requirement, "any time someone changes the resume or job application, log and show who modified it last and when", is met for job applications (personal tracker and the organization pipeline). The resume half is on `ent-resume-builder-b` and was not touched.

## Commits (one per story, in order)

| Story | Commit | What |
|---|---|---|
| U6.12 | `ae7db99d` | Tracker schema + backfill + `ChangeAuditCoverageTest` |
| U6.13 | `8b39cc31` | Attributed writes, resolver, DTOs, paged history |
| U6.14 | `32e444f5` | "Updated ... by ..." on the web (header, list, timeline) |
| X9.13 | `161485e5` | Enterprise columns, relation, backfill, DTOs |
| X9.14 | `6d42b42e` | Org + consultant workspace display |
| X9.15 (partial) | `f5b61db2` | Other agent: org retention + act-for gate + attributed save service |
| U6.15 | `589b9bcb` | Other agent: export labels, erasure, tracker retention |
| merge | `be03a13a` + one follow-up | `change-audit-u615` merged `--no-ff` |

## Needs the user

- **D8 (new, not in the design): an ArchUnit exception for E1.** `NoSubmitSurfaceTest.noOrgServiceDependsOnAServiceThatWritesAnApplication` forbids any org service from touching `ApplicationSyncService`. X9.15's `SaveForConsultantService` (a marketer SAVES a job, status SAVED, on an assigned consultant's tracker) must. I added ONE narrow exemption by class name, with a comment. It is a bookmark, never an application or a submission, gated by `TrackerActForGate`, and no HTTP route reaches it yet. This is a policy change to a guard rule. **Approved by the user 2026-10-15** (a bookmark only; the consultant still applies and submits; E1 holds).
- **X9.12 does not exist.** `POST /api/orgs/{orgId}/consultants/{memberId}/applications/save` (and its `OrgIsolationIT` COVERAGE row) is not built, so no HTTP path can call `SaveForConsultantService`. Also missing: the 19b `APPLICATIONS` visibility check (19b has no code; the seam is documented in `TrackerActForGate`).
- The design's D1 to D7 were taken as the recommended defaults.

## Migrations (additive, MARK_RAN-guarded, idempotent backfills)

- `20261110010000_change_audit_tracker.xml`: `application_event` + `actor_kind` (default SYSTEM), `actor_user_id`, `actor_login`, `on_behalf_of_user_id`, `changes` (+ index on actor_user_id); `application`, `application_note`, `interview` + `created_by_user_id/_login`, `updated_by_user_id/_login`. Backfill (D1): WEB/EXTENSION events to the owner as PERSON, INBOX to MAIL, ASSISTANT to ASSISTANT; head records to the owner.
- `20261110020000_change_audit_enterprise.xml`: `created_by_member_id` / `updated_by_member_id` on `talent_application`, `talent_interview`, `mkt_submission`, `cws_submission` (index `org_id, updated_by_member_id` on the first and third); `talent_application_note` + `updated_by_member_id`, `updated_at`; `actor_kind` (PERSON|SYSTEM) + `changes` on `talent_application_event`, `talent_interview_event`, `mkt_submission_event`. Backfill: no-actor events SYSTEM; head created_by/updated_by from the oldest/newest event's actor; preparers for submissions. No FKs; org_id untouched.
- U6.15 and X9.15 added no migration.

## Endpoints

- New: `GET /api/profile/applications/{id}/events?page=&size=` (full history, newest first, owner only, 404 otherwise). `api/openapi.json` regenerated (adds the route, `ChangeActorDTO`, `ChangeDTO`, the new DTO fields).
- Changed (additive fields only): tracker list/detail rows `createdBy`/`updatedBy`; `events[].actor/actorKind/onBehalfOf/changes`. Ent: Applications `Row.updatedAt/updatedBy`, `Detail.createdAt/createdBy/updatedAt/updatedBy`, `EventItem.by/changes`, `NoteItem.by`; consultant `TimelineEntry.actor/changes`, `Detail.updatedAt/updatedBy/createdBy`; mkt applications and mkt submissions `Row.updatedAt/updatedBy`; interview and consultant-submission `Detail.updatedAt/updatedBy/createdBy`. Ent Applications API accepts `sort=updated`.
- The export (`GET /api/profile/export`, U6.15) carries label-only actors. No other new routes. The act-for route is blocked (above).
- Settings (registry): `tracker.history.pageDefaultSize` (50), `tracker.history.pageMaxSize` (100), `tracker.history.noteEditWindowSeconds` (300), `tracker.history.retention_months` (0), `enterprise.history.retention_months` (0; per-org override through `org_setting`).

## What changed (files)

API, tracker (`api/src/main/java/com/dossier/api/`):
- New package `service/tracker/`: `ChangeActor` (static; person, act-for with on-behalf-of, extension, mail, assistant, system), `TrackerActAs` (twin of the resume act-for; nesting refused; always restored), `Changes` (typed `{f, from, to}` JSON; refuses free text by construction; 1000-char cap keeps the headline), `ChangeRecorder` (one event per request), `ApplicationSnapshot` (sync diff), `ChangeActors` (batch resolver: name, seat label, personal login, "a member" for `ent#`, "a former member" / "a deleted account").
- `ApplicationEventService` is still the one writer; it takes an Actor + Changes and stamps the head (`updated_at`, `updated_by_*`). Every caller migrated: `ApplicationPatchService`, `ApplicationSyncService`, `ApplicationNoteService`, `InterviewService` (`createFor(owner, id, body, source)` for inbox/assistant creators), `ApplicationAttachmentResource`, `ResumeTailorService` (resume link), the inbox listener, `TrackerDataService` (demo seed).
- Silent edits now recorded: star, next-step date, note edit/pin/delete (autosave bursts share one row), interview edit/outcome with the real source, attachment, sync detail fields. A request that changes nothing writes nothing and leaves `updated_at` alone. Submit-detect = EXTENSION, an explicit extension save = PERSON.

API, enterprise:
- `service/ent/applications/EntChangeActors` + `repository/ent/EntChangeActorRepository`: one batch per page; same words as the tracker; relation consultant | marketer | admin | member | system (fixed five words, D6). `ApplicationNames.personName` shares the words.
- `ApplicationCommandService`, `MktApplicationsService`, `InterviewCommandService`, `MktSubmissionsService`, `ConsultantSubmissionsService.decide` (via `CwsSubmissionRepository.transition(..., actorMemberId)`), `ConsultantWriteService`, `JobWriteService` stamp head + event (PERSON + `changes`). `LinkedApplicationProjection` rows are SYSTEM and clear the head's person.

Web:
- `web/src/lib/actors.ts` (NEW, tracker-side): `actorText`, `actorLine`, `relationTag`, `rowActorLine`, `safeLabel`, seat-aware `Viewer`. It also accepts the resume's `{login, label}` actor. **The resume header (`headerBar.ts`) can adopt it later (re-export `actorText`); I did not touch `headerBar.ts` or `resume-builder/**`.**
- Tracker: `UpdatedBy.tsx`, `ApplicationDetail`, `ApplicationsV3Page` (Updated column), `TimelineTab` (actor line, MARKETER chip, Details chips, Show all history), BFF route `/api/applications/[id]/events`, `/applications` page reads the account id.
- Org: `components/ent/applications/changeAudit.tsx`, `DetailDrawer`, `ApplicationsTable`, `interviews/DetailDrawer`, `marketer-ws/applications/TrackerTable`, `consultant-ws/ApplicationsPage` and `SubmissionsPage`; pages pass `selfMemberId` from the tenant session.
- Mock API (`web/scripts/mock-tracker.mjs`, `mock-api.mjs`) emits actors, `updatedBy`, `/events`, demo account id 101.

Other agent (from its commits):
- U6.15: `TrackerDataService` / `AccountExportService` export `actorKind`, `actor`, `onBehalfOf` labels and `changes` per event, and label-only `createdBy`/`updatedBy` per application (no user id, no seat, never `ent#`). Erasure needed no new rule (`ChangeActors` renders a gone actor correctly; `deleteAllForUser` only removes the leaver's own applications' events), proven by `TrackerExportActorIT`. `TrackerHistoryRetentionJob` (nightly, 500-row batches) deletes events older than N months except each application's newest; `ApplicationEventRepository` gained exactly `purgeableIds` + `deletePurgeable`. The web Privacy copy (`data-map.ts`) is static.
- X9.15 (partial): `enterprise.history.retention_months` + `EnterpriseHistoryRetentionJob` (per org, inside `TenantScoped`; one SYSTEM `HISTORY_PURGED` audit row per org per run; repositories gain `purgeableIds` + `deleteByOrgIdAndIdIn`; `OrganizationRepository.findAllOrgIds` added to the contract test and the `OrgIsolationIT` repo-check rows); `TrackerActForGate` (mirrors `ActForBuilderGate`: `member.act_for` ASSIGNED, ACTIVE seat with an account, active assignment, not yourself; every refusal the generic 404); `SaveForConsultantService` (the unchanged `upsertApplication` inside `TrackerActAs.run`; row is the consultant's, SAVED, source `org`; CREATED event actor = marketer, on_behalf_of = consultant; `MARKETER_SAVE_FOR_CONSULTANT` MEDIUM audit row).

## Tests

New (all green):
- Unit: `ChangeAuditCoverageTest` 4, `ApplicationEventTest` 3, `ChangesTest` 5, `TrackerActAsTest` 8, `ChangeActorsTest` 11, `ApplicationEventActorTest` 11, `EntChangeActorsTest` 10, `ApplicationNamesTest` 7, `TrackerHistoryRetentionJobTest` 4.
- Integration: `ChangeAuditMigrationIT` 3, `TrackerAttributionIT` 10, `ActForOnBehalfIT` 5, `SystemSourceAttributionIT` 7, `TrackerEventsPagingIT` 3, `ApplicationChangeAuditIT` 11, `EntChangeAuditMigrationIT` 3, `TrackerExportActorIT` 4, `TrackerHistoryRetentionJobIT` 4, `EnterpriseHistoryRetentionJobIT` 6, `SaveForConsultantIT` 5.
- Web: `actors.test.ts`, `TimelineTab.test.tsx`, `ApplicationDetail.updatedBy.test.tsx`, `changeAudit.test.tsx` (9), the Updated column in `ApplicationsV3Page.test.tsx`, a consultant timeline test, the events BFF route test; Playwright `e2e/journeys/tracker-updated-by.spec.ts` (1440 and 390, no horizontal scroll) green against the mock; `tracker.spec.ts` still green.
- Old tests updated to the one-event-per-request rule: `ApplicationTrackerResourceIT`, `InterviewResourceIT`, `ApplicationEventServiceTest`/`PublishTest`, constructors in `MktApplicationsServiceTest`, `MktSubmissionsServiceTest`, `MktSubmissionsIT`, `ResumeTailorServiceTest`.
- Final verification on the merged result: see the bottom of this file.

## Decisions I made (the design was silent)

1. **No generic bean for `ChangeActor`.** It is a static helper over the owner the caller already loaded plus `TrackerActAs`; no request-scoped component.
2. **Non-person writers leave `updated_by` empty.** The kind then comes from the newest event, so "by the extension" works with no extra head column.
3. **Autosave coalescing.** Edits to the same note by the same person within `tracker.history.noteEditWindowSeconds` (default 300; 0 = every save) share one "Note edited" row.
4. **One event per request** for PATCH, the sync upsert and PUT (`ChangeRecorder`); kind STATUS when the status moved, RESUME for a lone resume change, else FIELD. A no-op writes nothing and leaves `updated_at` alone (previously a refill always bumped it).
5. **Enterprise accounts in a personal context:** the shown `userId` is null (the internal id is not for a personal viewer), and a deleted enterprise actor is "a former member" even there.
6. **Additive DTOs.** `EventItem.actor` (marketer shape), `TimelineEntry.by` (YOU/MARKETER/TEAM) were kept and `by`/`actor` objects added next to them, so the web works at every commit; the design said "becomes". X9.14 moved the screens to the new fields; the old ones can be retired later.
7. **Mkt applications and submissions**: `updatedAt/updatedBy` are null below FULL consent.
8. **Settings** for page sizes and the note window were added to the registry rather than hard-coded.
9. **"Added <date>" in a phone ⋮ menu** (U6.14) was not built: the tracker detail has no ⋮ menu. The Timeline carries the created row.
10. **Sort by Updated** needed one API key (`sort=updated`) in X9.14 (the story said "Backend: None").
11. **`ConsultantApplicationsDTO.Update.by`** (the recent-updates list) stays YOU/MARKETER/TEAM; only the timeline and header got names.
12. **Cross-organization member id:** the FK `(org_id, actor_member_id)` means another tenant's seat cannot be stored on a row at all; `EntChangeActorsTest` covers what the resolver answers anyway ("a member", no id, no name).

## Not done / left

- **X9.15**: the route and 19b check (blocked, above). Its roadmap status stays `in_progress`.
- **X9.14**: Playwright 390/1440 for the org Applications and consultant My Applications pages. Those journeys run against the real Spring stack (not the mock), so I covered the strings in component tests and verified the tracker page layouts in the browser pane at 375 and 1440 (no horizontal scroll); the org/consultant pages were not viewed at 390 (the table has a card layout and the marketer table `min-w` grew to 1100px inside its own scroller).
- The marketer-workspace table (`TrackerTable`) is not routed to a page I could open; it is covered by types and compile only.
- Interview and submission "Updated" lines exist only on the org Interviews drawer and the consultant Submissions sheet; the consultant Interviews sheet and the marketer submissions board have the API fields but no web line yet.
- The resume header can adopt `lib/actors.ts` (see above).
- Pre-existing failures I did not cause and did not touch: `OrgInterviewResourceIT` (2 tests: a sensitive-content check on feedback, and an undo timeline count) and `MktJobsIT` (RESUME_NOT_APPROVED 409 in the assign flow, plus a 15 s timeout). They failed identically before any ent change of mine (OrgInterview) or fail in `OpportunityAssignmentService`, which I did not touch. A few tests time out under a loaded machine (`MktSubmissionsIT` seed, `JobDiscoveryPage`) and pass alone.
- Machine note: `web/.next` must be deleted after a `next dev` before `next build` (stale dev types), and `node scripts/sync-parser-core.mjs` is needed before `tsc`.

## Final verification (on the merged result, 2026-10-15)

- API `./gradlew test`: 2768 tests; the one failure (`NoSubmitSurfaceTest`, see D8) is fixed by the narrow exemption; green after.
- API integration (all green): the tracker, ent and U6.15/X9.15 ITs listed under Tests, `OrgApplicationResourceIT`, `MktApplications*IT`, `ConsultantApplications*IT`, `TrackerData*IT`, admin settings and account ITs, `OpenApiContractIT` (`api/openapi.json` regenerates unchanged), then `OrgIsolationIT` alone, last (8 min 34 s): green.
- Web: `tsc --noEmit` clean; eslint on the changed folders: 0 errors; full `npx vitest run`: 3756 passed, 3 skipped; `npm run build -w web`: compiled and generated all 164 pages.

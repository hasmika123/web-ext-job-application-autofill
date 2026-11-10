# REPORT: the Resume Builder inside the organization workspaces (Track B2)

Branch `ent-resume-builder-b` (cut from `origin/version2` at `48f1a7e6`). Spec: `docs/HANDOFF-ENT-RESUME-BUILDER-IN-ORG.md`, doc 30, doc 19, plus the two later coordinator requirements (one component with server-sent capabilities; "who modified last and when").

## 1. What now works

- **Consultant** (`/w/consultant/resumes`): "Create New Resume" (and the Quick Actions Create / Import / Use a Template) opens the SAME `NewResumeSheet` as the personal app: from profile, upload (parsed and scrubbed in the browser), copy, scratch. The editor opens at `/w/consultant/resumes/[id]` INSIDE the tenant shell (tenant host, org logo/colours/menu, no Kiwiply logo link). The resume is in her list at once (no manual linking) and on the assigned marketer's board. Edit opens the builder; Duplicate of a built resume is a real copy; she approves or sends back what a marketer made.
- **Marketer** (`/w/marketing/resumes`): "New resume for..." (picker limited to ASSIGNED consultants, one with no sign-in is shown but disabled), then the same chooser speaking about the consultant. The resume is saved under the **consultant's** account, author = marketer on every record, starts **PENDING**; the consultant approves. "Edit in the resume builder" in the board drawer (or "Edit it" in the toast) opens the SAME editor at `/w/marketing/resumes/[row]` in act-for mode, with "Pending consultant approval" next to the save state. A marketer's edit sends an approved resume back to PENDING.
- **Org license cap**: `org.license.resumes_max` (admin setting, default 25, per-organization override in `org_setting`) behind the existing `ProfileService` cap check. 402 `RESUME_LIMIT` with `plan: "ORGANIZATION"`. Personal Free/Pro/Autopilot caps are untouched and never apply in an org request; the org cap never applies to a personal request.
- **Org directory**: a `ResumeDocEvent` published by `ResumeDocService` / `ResumeMetaService` keeps `org_resume` (name, target, version, headline, summary, experience rows) in step with the builder. No Liquibase change was needed.
- **Who modified last and when**: see section 5.

## 2. One builder, role restrictions by capabilities (no variant)

`GET /api/profile/resume-builder/config` now carries `capabilities` (mode `personal | consultant | marketer-act-for`). The ONE `ResumeEditor` / `ResumeHeaderBar` / `ResumeSettingsSheet` / `EditorTopBar` / `NewResumeSheet` read it (and `BuilderEnv` for routes) and hide controls; the API enforces every restriction itself (`OrgResumePolicy`, `ActForBuilderGate`).

| flag | personal | consultant (org) | marketer act-for | server enforcement when not allowed |
|---|---|---|---|---|
| shareLinks (recruiter links, named people) | yes | only if the org setting `org.resumes.consultant_share_links` is on (default off) | never | 404 (`ResumeAccessService.requireShareable`; act-for: not allow-listed) |
| deleteResume | yes | no | no | 409 `MANAGED_BY_ORGANIZATION` (org) / 404 (act-for) |
| archiveResume | yes | no | no | same |
| setPrimary | yes | no (the My Resumes page sets the org primary) | no | 409 / 404 |
| rename | yes | yes | no | act-for: 404 |
| duplicate | yes | yes | no | act-for: 404 |
| versionRestore (save version, restore, Download menu) | yes | yes | no | act-for: 404 |
| downloadOriginal | yes | yes | no | act-for: 404 |
| ai (rewrite, suggestions, job match) | by plan | no (controls not drawn, no upsell) | no | 402 `FEATURE_NOT_LICENSED` (org) / 404 (act-for) |
| tailor | by plan | no | no | same |
| approvalNotice | none | none | "Pending consultant approval" | n/a |
| submit / apply | never | never | never | the builder has no such action in any mode |

Templates: the template picker stays on in every mode (templates are global admin settings; there is no per-license template entitlement in the code yet).

Act-for allow-list (`ActForBuilderGate`): GET/PUT `/doc`, PATCH `/doc/template`, PATCH `/doc/theme`, GET `/meta`, `/lineage`, `/doc/versions`, `/doc/versions/{n}/text`, `/doc/pdf-status`, POST `/doc/pdf-now`, GET `/api/profile/resume-builder/config`; each must name the resume the directory row points at. Everything else with the header is a generic 404.

## 3. Files

### API (main)
- `service/resume/ResumeActAs.java`: opens/closes the acting window (owner identity, marketer as author); `ResumeDocEvent.java`.
- `service/ent/resumes/`: `OrgResumeCap` (license cap, org from host / act-for scope / org route), `OrgResumeLinkService` (event listener: create/sync the directory link, projection, PENDING on marketer edits), `OrgResumePolicy` (mode, capabilities, 404/409/402 rules), `OrgResumeAuthors` ("modified by" for lists).
- `service/ent/mkt/resumes/`: `ActForBuilderGate`, `MktResumeBuilderService`, `MktResumeBuilderDto`.
- `config/ActForBuilderInterceptor.java`, `config/ActForWebConfiguration.java` (the act-for interceptor on `/api/profile/**`).
- `web/rest/ent/mkt/MktResumeBuilderResource.java` (3 routes), `ConsultantResumesResource` (+3: `built`, `approve`, `request-changes`).
- Edited: `ProfileService`, `ResumeEntitlements`, `ResumeDocService`, `ResumeMetaService`, `ResumeAccessService`, `ResumeActors`, `ResumeBuilderConfigService`/`DTO`, `ConsultantResumesService`/`DTO`, `MktResumesService` (409 `CONSULTANT_APPROVAL_REQUIRED`, 409 `EDIT_IN_BUILDER`, activity text), `ResumeBoardWriteService` (change-log lines, 409 for admin approve of a marketer-made resume), `ResumeBoardQueryService`/`ResumeBoardDTO` (`resumeId`, `updatedBy`), `ResumeAiResource`, `ResumeTailorResource`, repositories (`OrgResumeRepository`, `OrgResumeExperienceRepository`), `EnterpriseSettingKeys` (`org.license.resumes_max`), `api/openapi.json` (regenerated, own commit).
### API (tests)
`OrgResumeBuilderIT` (13), `ActForBuilderGateTest`, `OrgResumeCapTest`, `OrgResumeLinkServiceTest`, `ResumeActAsTest`, `ResumeActorsTest`; `OrgIsolationIT` COVERAGE rows for all 6 new org routes.

### Web: new files (and why none is a duplicate)
- `components/app-v3/resume-builder/builderEnv.tsx`: a context of routes/URLs/links (+ the act-for header installer); the personal app is its default value. It is how the existing components get their routes, not a second implementation.
- `lib/resume-editor-data.ts`: the editor page's server data loading, extracted FROM the personal `[id]/page.tsx` which now calls it too (one loader for personal, consultant, marketer).
- `app/(tenant)/%5Ft/w/consultant/resumes/[id]/page.tsx`: thin wrapper: loader + `BuilderEnvProvider` + the existing `ResumeEditor`.
- `app/(tenant)/%5Ft/w/[workspace]/resumes/[orgResumeId]/page.tsx`: thin wrapper for the act-for editor (same `ResumeEditor`).
- `components/ent/resumes/NewResumeForConsultant.tsx`: only the consultant picker; then mounts the existing `NewResumeSheet` with `actForEnv`.
- BFF `app/api/orgs/[orgId]/me-workspace/resumes/built`, `.../[resumeId]/approve`, `.../request-changes`, `mkt/resumes/consultants` (+`[consultantId]/sources`, `[consultantId]/built`): thin forwards to the new API routes (the editor itself keeps using the existing tenant-aware `/api/resumes/**`).
- Tests: `builderEnv.test.tsx`, `NewResumeSheet.org.test.tsx`, `ResumeHeaderBar.capabilities.test.tsx`, `NewResumeForConsultant.test.tsx`, `resume-editor-data.test.ts`, `org-resume-builder-routes.test.ts`.
### Web: edited
`NewResumeSheet` (env URLs, `subject`, `onCreated`), `ResumeEditor`, `EditorTopBar`, `ResumeHeaderBar`, `ResumeSettingsSheet`, `DocumentCanvas`/`SectionBlock`/`BulletList`/`canvasContext` (`aiVisible`), `CapDialog`, `model.ts`, `EnterpriseShell` (focus mode for the editor routes), `lib/api.ts` (forwards the act-for header), `resume-doc.ts` (`createBuilt(body, url)`), `resume-builder-config(.shared).ts` (capabilities), consultant `ResumesPage` (+ route `page.tsx`), board `ResumesPage`/`ResumesTable`/`ResumeDrawer`, `lib/ent/resumes.ts`, `lib/ent/consultant-ws/resumes.ts`; existing tests updated for the new second `createBuilt` argument / `limit` field.
### Docs
`docs/enterprise-v2/qa/stories/consultant.md` (CON-80..85, CON-67 reworded) and `marketing.md` (MKT-47, MKT-48): all BLOCKED (not yet run in a browser). No videos.

## 4. Tests
- Web: `npx vitest run` 313 files passed, 3735 tests passed, 3 skipped (0 failed; one unrelated `RolesPage` timing flake appeared once under load and passed alone); `tsc --noEmit` clean; eslint on all touched folders: 0 errors; `npm run build -w web` OK.
- API unit: `./gradlew test` 2716 passed, 0 failed.
- API ITs run: `OrgResumeBuilderIT` 13/13, `OrgIsolationIT` 10/10 (incl. the route registry and all new rows), `OpenApiContractIT`, `OrgResumeResourceIT` 17/17, `Resume*IT` (Doc 44, Meta 34, Access 25, Ai 22, BuilderConfig 9), `MktResumesIT`, `ConsultantResumesResourceIT`.
- **Pre-existing failures (identical on a clean checkout of `48f1a7e6`, proven in a throwaway worktree):** `ConsultantResumesResourceIT.renameAndVisibilityAreValidatedScannedForSensitiveDataAndOwnOnly` (the test's fixture rows get the entity default PENDING but assert APPROVED) and `MktResumesIT.aMarketerSeesFewerResumesThanTheAdminAndTheBoardNumbersAreReal` (admin page of 100 vs more seeded rows). `MktResumesIT.aMarketerCannotApproveTheirOwnRequestButTheAdminCan` is data-order flaky (passed on re-run).
- Not done: Playwright specs, browser verification of the new pages (no live stack was run; the pages are covered by component, route and Java integration tests), videos.
- Environment note: `web/.next/dev/types` is stale from an old `next dev` and breaks `next build` type-checking (`/%5Ft` layout route); I moved it aside for each build and put it back. It is git-ignored.

## 5. Who modified last and when
1. Every write records the real actor via `ResumeActAs.authorOr` (create, autosave/put, restore, AI apply, template/theme, import, meta rename: `resume.updated_by_login`, version `created_by_login`). Org-level changes (primary, rename/visibility, approve, send back, board decisions) now leave a `mkt_resume_event` line with the acting member (`PRIMARY_SET`, `DETAILS_CHANGED`, `DECIDED`, `APPROVED`, `MARKED_FOR_UPDATE`).
2. Header: "Last modified <time ago> by <name>" (absolute time on hover) in the one `ResumeHeaderBar`, every role; a marketer's edit reads "by Sarah Chen (marketer)" for the consultant.
3. Lists: consultant My Resumes rows, the Resumes board table (and its mobile cards) and the drawer show "by <name>" (`updatedBy` = the newer of the document's last writer and the row's change log).
4. History: the existing Versions menu / history sheet already lists each version's author and time (via `ResumeActors`), so no new history UI was built. In act-for mode the version chip is hidden (restore and save-version are not acting-for material).
5. `ResumeActors` never returns the `ent#` login as a label (name, else e-mail, else "Team member"); the JSON still carries `login` for the "you" comparison but no screen renders it.
6. Tests: `OrgResumeBuilderIT` (act-for edit: meta `createdBy/updatedBy`, consultant's list, admin board and version history all say "Sarah Chen (marketer)", no `ent#`; consultant's own actions say "Casey One" and log PRIMARY_SET / DETAILS_CHANGED), `ResumeActorsTest`, web header / consultant list / board row tests.

## 6. Decisions I made (please review)
1. **`PENDING` is the stored value for the handoff's `PENDING_APPROVAL`** (the three org surfaces already use APPROVED/PENDING/REJECTED).
2. **The existing `MktResumesResource.approve` is the org admin's, not the consultant's.** I added consultant-side `approve` / `request-changes` (`/me-workspace/resumes/{id}/...`) and made the admin's approve/reject of a builder-made `ORG_MANAGED` resume answer 409 `CONSULTANT_APPROVAL_REQUIRED` (seeded/metadata-only rows keep the admin flow). "Send back" = `REJECTED` + a `MARKED_FOR_UPDATE` line, so the marketer's board reads Needs update.
3. **Act-for mechanism is security sensitive and wants a second pair of eyes:** a request to the ordinary `/api/profile/**` builder routes with `X-Kiwiply-Act-For: <org_resume id>` runs as the consultant (a thread-scoped identity swap, closed in `afterCompletion`) after `ActForBuilderGate` checks host org, `resumes.edit_for`, ASSIGNED scope, a consultant with an account, not-self, an allow-list, and the resume id. The web sends the header by wrapping `window.fetch` while the act-for editor is mounted (so none of the editor's ~40 fetchers changed). The marketer create uses the same `ResumeActAs`.
4. **Org license**: the infrastructure from doc 24 (`EntitlementService.check`, feature catalog) is not merged, so the cap is an admin setting `org.license.resumes_max` with an org override, not read from `consultant_license` / `license_feature`; license status does not gate. Likewise AI is simply "not licensed" in an org (402) until the catalog can grant it.
5. **Answered 2026-10-15: org setting, default off; marketers never.** Whether a consultant inside an organization can create share links for org resumes is the registry key `org.resumes.consultant_share_links` (BOOL, default false, overridable per org in `org_setting`; the org admin turns it on at `/w/admin/settings`); a marketer acting for a consultant can never create one, whatever the setting; personal accounts are unchanged. **Off pauses existing links; on restores; confirm before off (user decision 2026-10-15):** switching the setting off makes every existing share link and named-person grant on that org's directory-linked resumes stop resolving at once, with the same generic not-found as any dead link (no hint it was paused); they are kept, not deleted, appear to the consultant as "Paused by your organization" (read-only, still revocable, no new ones), and come back by themselves when the setting is on again unless revoked or expired meanwhile. Pausing is evaluated live at resolve time (no rows are rewritten, no cache); the admin Settings switch asks "N active share links will stop working right away. You can turn sharing back on later to restore them." before turning off, and the ORG_SETTINGS audit row records old/new and `linksPaused` / `linksRestored`. (Original reasoning: doc 19 R3 says an enterprise account's resume never shows on kiwiply.com although doc 30 section 8 says links are owner-only; the user chose a switch.) Delete / archive / primary are still refused for directory-linked resumes (the directory row would dangle).
6. **The marketer's resumes page that users actually see** is `components/ent/resumes/ResumesPage` (the explicit `[workspace]/resumes/page.tsx` shadows the marketer-ws catch-all page, which is dead code). The new button and drawer link live there.
7. Consultant-made links are kind `PERSONAL_SHARED`, marketer-made / marketer-edited `ORG_MANAGED`; the consultant's own resumes are `APPROVED` at creation.
8. A marketer who is also the consultant acting for themself is treated as an ordinary own-create (gate: 404 for act-for-yourself).
9. In act-for mode the Download menu, Ctrl+S, rename, duplicate, versions and settings are not offered (they write as the owner or are not editing).

## 7. Questions / left over
- ~~Should consultants be allowed share links in an org (decision 5)?~~ Answered 2026-10-15 (org setting, default off). Should the license, once the catalog lands, decide AI and the cap per `license_feature`?
- The marketer-ws `ResumesPage` (dead behind the explicit route) and `MktResumesDto.Row` do not show `resumeId` / `updatedBy`; remove or wire that page.
- Browser (Playwright) specs for CON-80..85 / MKT-47..48 and a visual check of the editor inside the shell on phone width (the shell's focus mode hides the phone tab bar).
- No identity/login code was edited (`security/**`, `AuthenticateController`, `DomainUserDetailsService`, `UserService`, `AccountScopes` untouched). `OrgResumeCap` reads the tenant host context and `ResumeActors` reads seats only; after S4 (separate enterprise accounts) nothing here assumes a personal account exists. Question for that machine: enterprise accounts' `login` is `ent#...`; `ResumeActors` already hides it.


## 8. Security fixes (2026-10-15)

Branch `ent-actfor-fixes` (off `origin/version2`), review findings approved by the user. No identity code was edited (`security/**`, `AuthenticateController`, `DomainUserDetailsService`, `UserService`, `AccountScopes`); the token's `tid` is read from the JWT claims in `ActForBuilderInterceptor` through the existing public `TenantTokenBinding.tenantOf`.

| # | Severity | Finding | Fix | Tests |
|---|---|---|---|---|
| 1 | HIGH | Storage keys leaked in act-for responses; `r2ObjectKey` accepted from clients; loaders followed any stored key | (a) `ProfileService` ignores a client `r2ObjectKey` on create and on `PUT /api/profile/resumes/{id}` (server-assigned only). (b) `StorageKeys.isResumeKey/isUserKey`; `ResumeFileResource` (GET/DELETE/replace), `ProfileService.deleteResume`, `ResumeAccessService` PDF, `copyOriginalAside`, the PDF job's replaced object and account/demo/raw-CRUD erasure refuse a key outside the owner's prefix. (c) `ResumePublicView.withoutStorageKeys` is applied to every act-for document response (GET/PUT `/doc`, template, theme, 409 body); a save by an acting marketer keeps the stored photo and original; the web loader drops keys again. | `OrgResumeBuilderIT.anActingMarketerNeverSeesAStorageKey...`; `ResumeFileResourceIT` (poisoned pointer is never downloaded/deleted/replaced over; PUT/POST with a foreign key changes nothing: the personal-user regression); `StorageKeysTest`; `ResumePublicViewTest`; `resume-editor-data.test.ts` |
| 2 | HIGH | Marketer `copy` could clone any resume the consultant owns | `MktResumeBuilderService.requireCopySourceInDirectory`: needs an `org_resume` row with this org, this consultant and that resume, else the generic 404 (kind read exactly like `ResumeDocService`: trimmed, any case) | `OrgResumeBuilderIT.aMarketerCannotCopyAResumeTheOrganizationDirectoryDoesNotLinkForThatConsultant` |
| 3 | MEDIUM | Act-for / marketer-create on personal accounts | STRICT: owner must be an enterprise account of the host org (decision A1 in `enterprise-v2/08-decisions-for-user.md`); act-for 404, create 409 `CONSULTANT_HAS_NO_ACCOUNT`. `OrgResumeBuilderIT` fixtures now make consultants enterprise accounts (`org_id` set on the fixture user; no identity code needed) | `aConsultantWhoseAccountIsPersonalIsNeverActedForOrPreparedFor` |
| 4 | MED-LOW | Approve race | `approve` / `request-changes` need `versionNo` + `contentHash` of the row shown; mismatch is 409 `RESUME_CHANGED`, missing is 422. `ResumeRow.contentHash` is offered for rows awaiting the consultant; the web sends the reviewed version and reloads on a failure | `aConsultantsDecisionNamesTheVersionTheyReviewed...`; `ResumesPage.test.tsx`; `org-resume-builder-routes.test.ts` |
| 5 | LOW | Consultant-mode archive/primary bypass | `ProfileService.updateResume` calls `requireNotOrganizationManaged` when `archived` or `defaultResume` is true: 409 `MANAGED_BY_ORGANIZATION` | `aConsultantInTheOrganizationCannotArchiveOrMakePrimary...` |
| 6 | LOW | Gate checks | `ActForBuilderGate`: ACTIVE consultant profile, activated owner account on an ACTIVE seat (a suspended/offboarded seat is how an account is "pending erasure": the retention window starts when the seat leaves ACTIVE), token `tid` = host org (tid-less is 404) | `theActForGateAlsoNeedsAnActiveConsultant...`; `ActForThreadHygieneTest` (what the gate is handed) |
| 7 | LOW | Async leak | `ActForBuilderInterceptor` is an `AsyncHandlerInterceptor` (closes in `afterConcurrentHandlingStarted`); `ActForCleanupFilter` (outermost) clears `ResumeActAs` at request start and in a `finally`; `TechnicalStructureTest.builderControllersNeverReturnAsyncTypes` bans async return types on `/api/profile/**` controllers and the builder resources | `ActForThreadHygieneTest`, `anActForRequestLeavesNobodyActing...`, the ArchUnit rule |
| 8 | LOW | Web fetch wrapper too broad | `builderEnv.installActForFetch`: URL resolved against the page origin, same-origin only, tags `/api/resumes/<the act-for resume>/...` and the builder config only; pass-through once uninstalled; restored on unmount and when the row changes. `actForEditorEnv(row, resumeId)`. Passing the header through the editor's ~20 lib fetchers was not a contained change, so the global wrapper stays, narrowed | `builderEnv.test.tsx` |

**Not fixed / follow-up:** `OrgPermissionInterceptor` (~98) uses the path organization on a non-tenant host. Pre-existing, identity-adjacent, not changed here.

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
| shareLinks (recruiter links, named people) | yes | no | no | 404 (`ResumeAccessService.requireShareable`; act-for: not allow-listed) |
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
5. **Share links are off for consultants in an org** (doc 19 R3: an enterprise account's resume never shows on kiwiply.com) although doc 30 section 8 says links are owner-only (not forbidden for the owner). Delete / archive / primary are refused for directory-linked resumes (the directory row would dangle).
6. **The marketer's resumes page that users actually see** is `components/ent/resumes/ResumesPage` (the explicit `[workspace]/resumes/page.tsx` shadows the marketer-ws catch-all page, which is dead code). The new button and drawer link live there.
7. Consultant-made links are kind `PERSONAL_SHARED`, marketer-made / marketer-edited `ORG_MANAGED`; the consultant's own resumes are `APPROVED` at creation.
8. A marketer who is also the consultant acting for themself is treated as an ordinary own-create (gate: 404 for act-for-yourself).
9. In act-for mode the Download menu, Ctrl+S, rename, duplicate, versions and settings are not offered (they write as the owner or are not editing).

## 7. Questions / left over
- Should consultants be allowed share links in an org (decision 5)? Should the license, once the catalog lands, decide AI and the cap per `license_feature`?
- The marketer-ws `ResumesPage` (dead behind the explicit route) and `MktResumesDto.Row` do not show `resumeId` / `updatedBy`; remove or wire that page.
- Browser (Playwright) specs for CON-80..85 / MKT-47..48 and a visual check of the editor inside the shell on phone width (the shell's focus mode hides the phone tab bar).
- No identity/login code was edited (`security/**`, `AuthenticateController`, `DomainUserDetailsService`, `UserService`, `AccountScopes` untouched). `OrgResumeCap` reads the tenant host context and `ResumeActors` reads seats only; after S4 (separate enterprise accounts) nothing here assumes a personal account exists. Question for that machine: enterprise accounts' `login` is `ent#...`; `ResumeActors` already hides it.

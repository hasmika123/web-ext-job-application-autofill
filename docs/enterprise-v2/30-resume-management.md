# 30 — Resume management for organizations: directory, `org_resume`, consent-gated marketer edits, approval, readiness

> Status: design, 2026-10-12 (Session D). Implements ADR-006, ADR-009 and requirements §11.
> Build-ready for **X7.1–X7.7**. Reuses, never duplicates, the resume builder (`docs/RESUME-BUILDER-DESIGN.md`):
> `domain/Resume` (`kind UPLOADED|BUILT`, `role MASTER|TAILORED`, `status NEEDS_REVIEW|CONFIRMED`,
> `created_by_login`, `updated_by_login`, `share_with_org`), `domain/ResumeDoc` (`doc_version` @Version,
> `score`, `pdf_status`), `domain/ResumeDocVersion` (`version_no`, `reason` ≤ 16 chars, `name` ≤ 80,
> `created_by_login`), `service/ResumeDocVersionService.record/checkpoint`, `service/ResumeAccessService`
> (`Via.OWNER|USER|ORG`, `access()`, `sharedDoc()`, `sharedPdf()`), `service/resume/OrgResumeSharing`
> (`isFullPairedViewer`), `service/org/OrgShareResumeSharing.auditFullRead` (`SHARE_READ_FULL`),
> `domain/ResumeViewEvent` (`viewer_kind ORG|USER|LINK`, `what PAGE|PDF`), `AtsScoreService.forResume`,
> `service/resume/ProfileCompleteness.compute`, `ResumeTailorService`, `ResumePrompts`.

## 1. Principles

1. **Resumes stay person-owned.** `resume.user_id` never changes; there is no ownership transfer, no
   copy into org tables, no org export of document content beyond consent. The org gets a **link**
   (`org_resume`) that carries management rights and a per-org view.
2. **The builder is the only editor.** Marketer edits run the existing builder in *act-for* mode
   against the consultant's `resume_doc`; every save is a `resume_doc_version` with
   `created_by_login = marketer`. No parallel document format.
3. **The consultant attests.** Nothing a marketer wrote is used in a submission until the consultant
   approves that exact version (`org_resume.approved_version_no`). Approval is per version.
4. **Two classes of link, one table.** `PERSONAL_SHARED` (the consultant's own resume, visible under
   FULL) and `ORG_MANAGED` (created or edited for the org). The class is a property of the link, not
   of the resume; `resume.kind` (UPLOADED/BUILT) is untouched — the marketer-origin column proposed
   in `marketer-workspace.md` §2 is **not** added (it clashes with `ResumeKind`; `created_by_login`
   already names the author).
5. **Consent is the gate for reading and for editing, separately.** Reading needs FULL naming the
   viewer (`ResumeAccessService.Via.ORG`, unchanged). Editing needs FULL **and** `org_resume.edit_allowed`
   **and** `resumes.edit_for` (ASSIGNED) **and** either the consultant's blanket edit consent
   (`org_feature_consent(feature_key='consent.resume_edit')`) or a per-link grant. Consent kinds are
   the `ConsentKinds` constants (21 §2.5, 09 row 10): `consent.resume_edit`, `consent.resume_view_org`,
   `consent.ai_tailoring`, `consent.ai_optimization`, `consent.marketing_assist`; `consent.act_for` is
   the FULL pairing itself (no row).

## 2. Consultant directory (X7.1)

`GET /api/orgs/{orgId}/consultants?q=&availability=&marketing=&marketer=&license=&readiness=&page=`
(permission `consultants.view`; scope ASSIGNED for marketers, TEAM for managers, ORG for admins/HR/TA)
joins `org_member` (role includes CONSULTANT) × `consultant_profile` (overlay, X7.2) × `data_share`
projection × open `org_assignment` (PRIMARY/BACKUP names) × `consultant_license` status (Session C)
× readiness (§7). Row DTO `ConsultantRowDTO`:

| field | source | visible at |
|---|---|---|
| member id, name, photo (`jhi_user.image_url`), title, department, team | seat | NONE (seat data) |
| availability_status, available_from, marketing_status, bench_since, headline, skills (org-curated tags), preferred_locations, work_modes, rate_band_label | `consultant_profile` (org overlay — membership-scoped, so **not** consent-gated) | NONE |
| primary / backup marketer, manager | `org_assignment` | NONE |
| license status + feature chips | `consultant_license` | NONE for admins; the consultant's own row always |
| resume readiness (has resume, ATS band, last updated) | `ShareField.RESUME_READINESS` (computed, §7) | SUMMARY |
| experience summary (years, last title, top skills from the resume) | `ShareField.RESUMES` projection → `ResumeDocumentText` first 400 chars | **FULL** (paired viewer only) |
| stage counts, last activity, upcoming interviews, placement flag | existing `ShareField` SUMMARY fields | SUMMARY |

Consent blanks render as the honest "Anika hasn't shared this" chip with "Ask Anika" (cooldown
`org.consent.request_cooldown_days`). The directory never calls `ResumeAccessService` per row; the
summary is precomputed into `consultant_profile.resume_summary_json` by `ConsultantReadinessJob`
(hourly, and on resume save via `ResumeLifecycle` event) and projected at read time by scope.

`consultant_profile` (X7.2) final columns: as `03-domain-model.md` §2.3 plus `resume_summary_json`
(JSON, computed), `readiness_json` (JSON, §7), `readiness_score SMALLINT`, `photo_consent BOOLEAN DEFAULT FALSE`
(the directory shows the person's avatar only when they opted in; otherwise initials — a photo in a
staffing directory is a sensitive-ish signal and the person decides). Free text (`headline`, `skills_json`,
`notes`) passes `SensitiveContent.check`. The consultant edits their own overlay (`self.*` OWN);
marketers **propose** changes (`consultant_profile_proposal`: `field`, `proposed_value`, `by_member_id`,
`status PENDING|ACCEPTED|REJECTED`) that the consultant accepts with one tap — same pattern as
`PROFILE_SUGGESTION`.

## 3. `org_resume` (X7.3) — final DDL

| column | type | notes |
|---|---|---|
| id | BIGINT PK | |
| org_id | BIGINT NOT NULL | |
| resume_id | BIGINT NOT NULL FK resume | person-owned row |
| member_id | BIGINT NOT NULL FK org_member | the owner's seat in this org |
| managed_by_member_id | BIGINT NULL FK org_member | the marketer accountable for this link (defaults to the open PRIMARY) |
| kind | VARCHAR(20) NOT NULL | PERSONAL_SHARED · ORG_MANAGED |
| display_name | VARCHAR(80) NULL | org-facing name ("Anika — Java backend, Acme v3"); defaults to `resume.label` |
| approval_status | VARCHAR(20) NOT NULL | NOT_REQUIRED (PERSONAL_SHARED) · DRAFT · PENDING_APPROVAL · APPROVED · REJECTED · STALE |
| approved_version_no | INT NULL | the `resume_doc_version.version_no` the consultant approved |
| approved_at, approved_by_login | | consultant only |
| requested_at, requested_by_member_id | | the marketer who asked |
| rejection_note | VARCHAR(300) NULL | consultant → marketer |
| visibility | VARCHAR(20) NOT NULL DEFAULT 'ASSIGNED' | ORG (any `resumes.view_for` ORG holder) · ASSIGNED (assignees with FULL) · PRIVATE (owner + managed_by only) |
| primary_for_org | BOOLEAN NOT NULL DEFAULT FALSE | one per (org, member): generated `primary_key` UNIQUE |
| edit_allowed | BOOLEAN NOT NULL DEFAULT FALSE | set by the consultant (link-level edit consent) |
| last_marketer_edit_at, last_marketer_edit_by | | |
| created_at, created_by_member_id, updated_at | | |
| ended_at, end_reason | | LEFT · REMOVED · UNSHARED · ERASED — links end, rows stay for audit |

UNIQUE (org_id, resume_id) where `ended_at IS NULL` (generated `live_key`). Indexes
`(org_id, member_id, ended_at)`, `(org_id, approval_status)`, `(org_id, managed_by_member_id)`.

How links appear:
- **PERSONAL_SHARED** — created lazily by `OrgResumeLinkService.syncPersonal(orgId, memberId)` for
  every non-archived resume with `share_with_org = TRUE` when the consultant grants FULL, and on
  each resume create/archive via `ResumeLifecycle` events. Ends when the resume is archived, the
  consultant flips `share_with_org`, or consent drops below FULL (`end_reason = UNSHARED`).
- **ORG_MANAGED** — created by a marketer (`POST /resumes` "New resume for Anika": calls the builder's
  create path under the consultant's user with `created_by_login = marketer`, `source_kind = COPY`
  of the approved primary or `BLANK`, `role = TAILORED`, `label` as given) or by **promoting** a
  PERSONAL_SHARED link to ORG_MANAGED when the marketer first edits it (the link kind flips, the
  resume does not change owner).

## 4. Who may do what (permission × consent matrix)

| action | permission (scope) | assignment (step 9) | consent (step 10) | link condition |
|---|---|---|---|---|
| list links / metadata (name, status, version no, dates) | `resumes.view_for` | ASSIGNED/TEAM/ORG per role | **none** (metadata is seat-level: the org knows a managed resume exists) | visibility |
| open document / PDF / print | `resumes.view_for` | act-for kinds | FULL naming viewer (`Via.ORG`) **or** visibility ORG + `org_feature_consent('consent.resume_view_org')` | visibility |
| create ORG_MANAGED resume | `resumes.edit_for` (ASSIGNED) | PRIMARY/BACKUP/DELEGATE | FULL naming actor | — |
| edit (builder act-for) | `resumes.edit_for` (ASSIGNED) | PRIMARY/BACKUP/DELEGATE | FULL naming actor + (`org_feature_consent('consent.resume_edit', actor)` or link `edit_allowed`) | kind ORG_MANAGED (auto-promote) and status ≠ PENDING_APPROVAL |
| AI tailor for the consultant | `resumes.edit_for` + feature `ai.resume_tailoring` (beneficiary = consultant) | as edit | as edit + `org_feature_consent('consent.ai_tailoring')` (CONSENT dependency row `ai.resume_tailoring → consent.ai_tailoring`) | as edit |
| request approval | `resumes.approve_request` | as edit | — | status DRAFT/REJECTED/STALE |
| approve / reject | `resumes.manage` (OWN) — the consultant | — | — | status PENDING_APPROVAL |
| set primary_for_org | consultant (OWN) **or** `resumes.edit_for` with the consultant's blanket consent | | | status APPROVED or NOT_REQUIRED |
| set visibility | consultant (OWN); admins may only narrow | | | |
| download by HR/finance | never (not in any template) | | | |

Every non-owner document read goes through `ResumeAccessService.access()` → `Via.ORG` and records
`ResumeViewEvent(viewer_kind=ORG)` + `SHARE_READ_FULL` (existing). New: `Via.ORG` gains a second
qualifying path — `OrgResumeLinkService.canView(orgResume, viewerMembership)` for visibility ORG with
the `consent.resume_view_org` consent kind — implemented inside `OrgShareResumeSharing` so
`ResumeAccessService` itself does not change shape. Step 10 reads consent through the `ConsentGate`
interface (X5.6 ships it with the FULL-pairing-only default; X7.6 ships the `org_feature_consent`
implementation, 09 row 10). Every marketer write audits
`MARKETER_RESUME_CREATE | MARKETER_RESUME_EDIT | MARKETER_RESUME_TAILOR | MARKETER_APPROVAL_REQUEST`
with `beneficiary_login`.

## 5. Approval workflow (X7.4) — state machine of `org_resume.approval_status`

```
PERSONAL_SHARED: NOT_REQUIRED ──(marketer edits → auto-promote)──▶ ORG_MANAGED: DRAFT
DRAFT ──request (marketer)──▶ PENDING_APPROVAL ──approve (consultant)──▶ APPROVED
                                              └──reject (consultant, note)──▶ REJECTED ──edit──▶ DRAFT
APPROVED ──any new version (marketer or consultant)──▶ STALE ──request──▶ PENDING_APPROVAL
APPROVED ──consultant edits own resume──▶ STALE (same rule: a submission pins the approved version, not "latest")
```

- `approve` stores `approved_version_no = resume_doc.currentVersionNo` (the builder's latest
  `resume_doc_version` for the doc) and `approved_by_login = consultant`. The **approved version is
  immutable** by construction (versions are append-only); `ResumeDocVersionService` retention must
  never trim a version referenced by `org_resume.approved_version_no` (add the id set to
  `keepIds` the same way `checkpointResumeIds` protects checkpoints).
- The consultant's review screen shows the diff `approved_version_no → current` using the existing
  `GET /{id}/doc/versions/{n}/text` for both sides and a client-side word diff (`@kiwiply/ui`
  `DiffText`, existing primitive). Reject = `POST /{id}/doc/versions/{approved}/restore` is **offered**, not
  automatic ("Revert to the version you approved?").
- A submission (`candidate_submission.resume_version_no`) and an opportunity match
  (`opportunity_match.resume_id` + `resume_version_no`) may only reference an `org_resume` with
  `approval_status IN (APPROVED, NOT_REQUIRED)` and pin the version number → `ApprovalGateTest`.
- Notifications (`NotificationService.publish`): consultant `ORG_RESUME` "Sarah made a resume for you —
  review it" (dedupe `orgresume:{id}:req:{version}`), marketer `ORG_RESUME` on approve/reject, both
  `emailWorthy = true`.

## 6. Marketer edits via the builder (X7.5)

- Web route `/w/marketing/resumes/{orgResumeId}/edit` on the tenant host (file
  `(tenant)/_t/w/[workspace]/resumes/[orgResumeId]/edit/page.tsx`, 09 row 1) mounts the existing builder with
  `mode = "act-for"`: banner "Editing Anika's resume as Acme — she approves before use", the
  consultant's name on the autosave chip, AI panel visible only when the beneficiary's entitlement
  allows (`37-entitlement-hooks.md`). The builder calls the **same** `PUT /api/profile/resumes/{id}/doc`
  path family, but through the org BFF: `PUT /api/orgs/{orgId}/consultants/{memberId}/resumes/{resumeId}/doc`
  (annotated `@OrgPermissionRequired(value = {RESUMES_EDIT_FOR}, beneficiary = Beneficiary.PATH_MEMBER)` —
  there is no `@ActFor`; one `Beneficiary` enum serves both annotations, 05 §6 / 09 row 12), which
  runs steps 1–11 then delegates to `ResumeDocService.save(resume, body, actorLogin)` with
  `byLogin = marketer`. Versions record `reason = MARKETER` (new 8-char constant in
  `ResumeDocVersionService`; kind "named", never trimmed) with `name = "Edit by Sarah"`.
- AI actions (rewrite, summary, tailor) call the same `ResumeAiService` entry points with an explicit
  `beneficiaryLogin`; `AiRouter.generate(…, ctx)` takes the `AiCallContext(actorLogin, beneficiaryLogin, orgId, featureKey, usageEventId)`
  **owned by X5.8** (24 §7, 09 row 11) so failures and successes are booked to the beneficiary with the actor recorded (fixes the
  `recordFailure` → current-user caveat). The four additive `ai_call` columns (`beneficiary_login`, `org_id`,
  `feature_key`, `usage_event_id`) ship in X5.8's Phase-5 usage changelog; X7.5 only consumes them.
- Rate limits (`RATE_AI_PER_MIN`, `AI_CAP_RESUME_DAILY`) count against the **actor** (abuse control)
  while budget counts against the **beneficiary** (commercial rule, requirements §20).
- Marketer-made resume PDF: the existing PDF job (`pdf_status`) runs under the owner; the marketer
  sees "PDF updating…" like the owner does.

## 7. Readiness and completeness (X7.7)

`ConsultantReadiness.compute(memberCtx)` → `readiness_json`:

| check | source | weight |
|---|---|---|
| basic profile complete (name, phone, title, tz) | `jhi_user`, `NotificationPreference.tz` | 10 |
| career profile ≥ 60 % | `ProfileCompleteness.compute` (consent SUMMARY shows the band only) | 15 |
| ≥ 1 resume, ATS band ≥ mid | `ShareField.RESUME_READINESS` (band from `resume_doc.score` tertiles; `AtsScoreService` only when the consultant is Pro-entitled via the org) | 20 |
| an APPROVED or NOT_REQUIRED `org_resume` marked `primary_for_org` | `org_resume` | 20 |
| availability set and not UNAVAILABLE | `consultant_profile` | 10 |
| marketing_status ACTIVE | `consultant_profile` | 5 |
| license ACTIVE with ≥ 1 feature the org marketer uses (`marketing.assisted_applications`) | Session C | 10 |
| consent FULL naming the PRIMARY | `data_share` + `org_assignment` | 10 |

Score 0–100; `nextAction` is the highest-weight failing check phrased for the person who can fix it
(consultant vs marketer vs admin). Shown as the Readiness ring on the consultant card, the
marketer's "Needs you" list and the Org Admin dashboard tile "Ready to market: 12 of 18".
"Resume completeness" in the requirements = the builder's own `resume_doc.score` surfaced through
`RESUME_READINESS` — no second scorer.

## 8. View / download / print and audit

- View = `GET /api/orgs/{orgId}/consultants/{memberId}/resumes/{resumeId}/doc` → `ResumeAccessService.sharedDoc` semantics (scrubbed DTO via `ResumePublicView.scrub`), PDF = `/pdf` → `sharedPdf` (409 `PDF_NOT_READY` passthrough), print = the web print stylesheet over the same doc (no new endpoint). Download of the original upload (`/original`) is **owner-only**; orgs get the rendered PDF.
- Audit: `ResumeViewEvent` (`viewer_kind ORG`, `what PAGE|PDF`) + `org_audit_event SHARE_READ_FULL` on every read; marketer writes per §4; the consultant sees everything in Settings → Organizations → "What Acme did" (existing timeline; add resume rows).
- Share links (`resume_access` LINK) remain **owner-only**; a marketer cannot create a public link for a consultant (no endpoint; `NoSubmitSurfaceTest` sibling `MarketerVerbsTest` enumerates allowed verbs).

## 9. API summary (`/api/orgs/{orgId}`, every route in the `OrgIsolationIT` registry)

| method | path | permission | notes |
|---|---|---|---|
| GET | `/consultants` · `/consultants/{memberId}` | `consultants.view` | §2 |
| PATCH | `/consultants/{memberId}/profile` | OWN: `self.*`; marketer: creates proposals | overlay |
| POST | `/consultants/{memberId}/profile/proposals/{id}/accept|reject` | OWN | |
| GET | `/resumes?member=&status=&visibility=` | `resumes.view_for` | org-wide Resumes page |
| GET | `/consultants/{memberId}/resumes` | `resumes.view_for` | links + metadata |
| POST | `/consultants/{memberId}/resumes` | `resumes.edit_for` + FULL | new ORG_MANAGED (`{label, from: "primary"|"blank"|resumeId}`) |
| GET | `…/resumes/{resumeId}/doc` · `/pdf` · `/versions` · `/versions/{n}/text` | `resumes.view_for` + FULL | reads, audited |
| PUT | `…/resumes/{resumeId}/doc` | `resumes.edit_for` + edit consent | act-for save, If-Match `doc_version` |
| POST | `…/resumes/{resumeId}/ai/{rewrite|summary|suggest|tailor}` | `resumes.edit_for` + `@RequiresFeature` | §6 |
| POST | `…/resumes/{resumeId}/request-approval` | `resumes.approve_request` | DRAFT/REJECTED/STALE → PENDING |
| POST | `…/resumes/{resumeId}/primary` · `PATCH …/visibility` | consultant OWN or blanket consent | |
| — consultant side (`/api/me/orgs/{orgId}`) — | | | |
| GET | `/resumes` | self | links with status + diff pointers |
| POST | `/resumes/{orgResumeId}/approve` · `/reject {note}` | `resumes.manage` OWN | §5 |
| PATCH | `/resumes/{orgResumeId}` `{editAllowed, visibility, primaryForOrg}` | OWN | |
| PUT | `/share` `{scope, fullToMemberId, consentVersion}` | `self.share_scope.set` | **new HTTP route** for the existing `DataShareService.grant` (none exists today) |
| GET/PUT | `/feature-consents` | OWN | X7.6 |

## 10. Tests
`OrgResumeLinkServiceTest` (sync personal on FULL, end on unshare/archive/leave, promote on first edit),
`ResumeApprovalStateTest` (every transition in §5; STALE on any new version), `ApprovalGateTest`
(match/submission refuse non-approved; pinned version survives retention), `ActForBuilderIT`
(PUT doc as marketer: steps 4/9/10 refusals → 404/403; success writes version with `created_by_login`
and audit with beneficiary), `ResumeAccessOrgIT` (Via.ORG unchanged for FULL; visibility ORG path
needs the feature consent; HR cannot read), `ConsultantReadinessTest` (weights, nextAction audience),
`MarketerVerbsTest` (allow-list of verbs under `/api/orgs/**/resumes/**`), Playwright
`org-resumes.spec.ts` (directory at 390/1440, approve with diff, "Ask Anika" cooldown).

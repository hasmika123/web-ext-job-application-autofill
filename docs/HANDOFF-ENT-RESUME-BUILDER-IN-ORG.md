# HANDOFF — Resume builder inside the organization workspaces (Track B2), second machine

> Written 2026-10-15 for a Sonnet session on the SECOND machine. Self-contained: read it fully before touching code.
> Background reading, in this order: `CLAUDE.md`, `docs/enterprise-v2/30-resume-management.md` (sections 5-6: org resumes,
> marketer act-for edits, approval), `docs/HANDOFF-RESUME-BUILDER.md` (how the existing personal builder works),
> `docs/enterprise-v2/19-separate-enterprise-accounts.md` sections 0 and 3 (account model).

## 1. BRANCH RULES (read twice)

| Do | Don't |
|---|---|
| `git fetch origin` then `git switch -c ent-resume-builder-b origin/version2` | Never commit to or push `version2`, `develop` or `main`. |
| Commit ONLY on branch **`ent-resume-builder-b`** | Never force-push or rewrite pushed commits; never `git stash` (use a WIP commit). |
| Push often: `git push -u origin ent-resume-builder-b` | Don't open pull requests: the coordinator merges your branch into `version2`. |
| To sync with `version2` (only if told): `git fetch origin && git merge origin/version2`, resolve, push | Don't edit the login/identity code (`api/.../security`, `AuthenticateController`, `DomainUserDetailsService`, `UserService`, `AccountScopes`): another machine is changing it right now (separate accounts, phases S3/S4). |

Commits: `ent-resume: <subject>`, each ending with the line `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## 2. The goal (user decision)

Consultants and marketers in an organization currently cannot create resumes. We already have a full **Resume Builder** on
kiwiply.com; connect it into the organization workspaces instead of building a new one.

- **Consultant** (`/w/consultant/resumes`, web `web/src/components/ent/consultant-ws/ResumesPage.tsx`): the "Create resume"
  button (`data-create-resume`, line ~550) today only calls `soon("Creating a resume from scratch")`. Make it open the same
  new-resume flow as the personal app (`NewResumeSheet`: from profile / upload a file parsed in the browser / copy / scratch;
  plan or license cap checked first) and, after creating, the same editor (`/resume-builder/[id]`) running INSIDE the
  tenant shell (tenant URL, tenant branding, tenant menu), not a hop to kiwiply.com.
- **Marketer** (`/w/marketing/resumes`): a "New resume for <consultant>" action (consultant picker limited to the marketer's
  ASSIGNED consultants) that runs the same builder in **act-for mode**: the resume is saved under the consultant's account
  with `created_by_login = marketer`, starts as `PENDING_APPROVAL`, and the consultant must approve it (see doc 30 §5-6;
  `MktResumesResource` already has approval-request / approve / needs-update). A marketer can NEVER create a public share
  link for a consultant; nothing is ever submitted.
- **Account model (do not fight it):** enterprise and personal accounts are SEPARATE and never connected (decision O4). A
  resume made in an organization workspace belongs to the signed-in enterprise account only. Today the demo accounts are
  still shared with personal ones (S4 changes that on the other machine), so for now it "just works" with the demo data; never
  write code that assumes a personal account exists or that links the two worlds.
- **Visibility (decision O5):** an assigned marketer sees ALL resumes and applications of their consultants (no consent gate
  on reads); unassigned consultants stay a generic 404.
- **Limits:** the cap on resumes for an enterprise account comes from the organization license, not the Free/Pro/Autopilot
  caps (find how `EntitlementService`/`ResumeCap` decide today and add the org-license branch behind the existing check;
  keep personal behaviour unchanged).
- **No sensitive PII** ever (no SSN, bank, tax id, passport/ID numbers, DOB) in parsing, storage, AI prompts or the UI: the
  existing parser already scrubs these; keep it that way and add a test that an uploaded resume containing such values is
  scrubbed in the org flow too.

## 3. Where things are (verify, then reuse)

- Personal builder: `web/src/app/(app)/resume-builder/page.tsx` and `[id]/page.tsx`, components in
  `web/src/components/app-v3/resume-builder/*` (`NewResumeSheet`, editor, canvas, panels), shared parser in
  `packages/ui` (`ResumeUpload`) and `web/src/components/ent/resumes/UploadResumeDialog.tsx` (admin side upload dialog, a
  useful reference). Personal API/BFF: `web/src/app/api/resumes/**`, API `ResumeResource` and friends.
- Consultant org side: web `web/src/components/ent/consultant-ws/ResumesPage.tsx`, `ResumesSheets.tsx`,
  `web/src/lib/ent/consultant-ws/resumes.ts`; BFF `web/src/app/api/orgs/[orgId]/me-workspace/resumes/**`; page route
  `web/src/app/(tenant)/%5Ft/w/consultant/resumes/page.tsx`; API
  `api/src/main/java/com/dossier/api/web/rest/ent/consultantws/ConsultantResumesResource.java` (only list, primary,
  activity, duplicate today: NO create).
- Marketer org side: API `web/rest/ent/mkt/MktResumesResource.java` and `service/ent/mkt/resumes/MktResumesService.java`;
  BFF `web/src/app/api/orgs/[orgId]/mkt/resumes/**`.
- Tenant shell/routes: pages live under `web/src/app/(tenant)/%5Ft/w/**` behind the `proxy.ts` rewrite; menu entries come
  from `api/src/main/resources/config/ent/workspaces.json`. The API tenant-session wall lets user-scoped routes
  (the builder's `/api/resumes*`, `/api/profile/resumes*`, `/api/ai/*`) work with a tenant (`tid`) token; ORG routes need the
  right org from the host. Confirm the web BFF routes for the builder work with the TENANT host cookie (they may read the
  platform cookie only: if so, add tenant-aware BFF routes under `web/src/app/api/orgs/[orgId]/me-workspace/resumes/...`).
- Org directory: how an org learns about a resume (`org_resume` link, `ResumeAccessService`, `ResumeKind`). A resume
  created inside the organization workspace must appear in the consultant's org resumes list and the marketer's board
  without manual linking (read doc 30 §2-5 for the link rules).

## 4. Suggested order (small commits, tests first where practical)

1. Reproduce and read: run the consultant resumes page, find exactly why Create does nothing, list the files above.
2. Consultant create flow: tenant route(s) for "new resume" and the editor inside the shell; reuse the builder components
   (extract shared pieces into a common module only if you must; do not copy-paste the editor).
3. API: add what is missing (create/upload under the consultant's own scope; org-license resume cap; link into the org
   directory). Additive Liquibase only if a column is truly needed.
4. Marketer act-for create + pending approval + consultant approve path (reuse `MktResumesResource`/approval endpoints).
5. Stories text (do NOT record videos): add story descriptions to `docs/enterprise-v2/qa/stories/consultant.md` and
   `marketing.md` (CON-80.., MKT-4x ids not already used; grep first). Playwright specs only if you can run them locally
   against your own stack; recording is not part of this task.

## 5. Tests (all must pass before you finish)

- Web: `cd web && npx vitest run <the folders you touched>` plus the full `npx vitest run` once at the end (it can time
  out under load: re-run failing files alone before judging); `npx tsc --noEmit`; `npx eslint <changed files>`.
- API (only if you change `api/`): `cd api && ./gradlew test --offline --tests '*<yours>*'` and the integration tests for
  the resources you touch (`./gradlew integrationTest -x test --offline --tests '*<IT>*'`), plus
  `OpenApiContractIT` (regenerate `api/openapi.json` if DTOs/routes changed). Add rows for every new org-scoped route to
  `OrgIsolationIT` COVERAGE (it has a registry test that fails if a route is missing) and run `OrgIsolationIT` once at the
  end (15-25 min, `-x test`). Long commands: run in the background and read the log.
- Rules that always apply: no auto-submit; no sensitive PII; one design system `@kiwiply/ui` (no hand-rolled primitives, no
  inline `<svg>`); additive Liquibase only; no secrets in the repo; every org route org-scoped from the host (never trust a
  client org id), generic 404 for strangers, never 403.

## 6. Done when

A consultant can create (from profile, upload, copy, scratch) and edit a resume inside their workspace; a marketer can start
"New resume for <assigned consultant>" that lands as pending approval and the consultant can approve it; caps follow the
license; the tests above are green; everything is committed on `ent-resume-builder-b` and pushed. Then write a short report as
your final message AND as a committed file `docs/HANDOFF-ENT-RESUME-BUILDER-IN-ORG-REPORT.md`: what changed (files), test
counts, decisions you made, anything blocked or unclear, and what is left. Then stop and wait for the coordinator.

## 7. Context

- Decisions: O4 separate accounts, O5 assigned marketers see everything of their consultants (08-decisions-for-user.md).
- Track A (this repo's other machine, branch `version2`) is doing S3 host-scoped login and S4 account creation; the first
  machine's S7 (extension client) is already on `ent-accounts-b`. Your branch will be merged after those.
- If something conflicts with the spec or a hard rule, write the question in your report instead of improvising.

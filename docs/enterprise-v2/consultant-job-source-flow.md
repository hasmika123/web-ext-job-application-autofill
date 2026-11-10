# Consultant job source flow (decision 2026-10-13)

## The decision
Kiwiply does **not** load full job details from any job source. A marketer enters only a few details about a job, the **source link** (the posting URL) and some quick info. The consultant opens the link, applies on the source site with the Kiwiply browser extension (autofill), and Kiwiply then **tracks the application and its status** (extension submit-detect -> `TrackingProvider` seam -> My Applications). Kiwiply never submits and has no auto-apply. A full in-app job search is a **later phase**; until then the consultant pages work from the marketer-entered info plus the source link.

## The flow
1. Marketer (future role) adds a job: the usual few `client_requirement` fields, plus a row in `cws_job_source` (source link, source name, quick info).
2. Consultant sees the job on Job Discovery / Job Matches / Assigned Opportunities: the marketer's quick info and an **Open job link** button (new tab, `rel="noopener noreferrer"`; disabled with "Your marketer hasn't added the link yet" when there is no usable link).
3. Consultant applies on the source site with the extension.
4. The extension reports the application; it appears in **My Applications** with its status. The Applications page is unchanged and is not fed by anything in this task.

The in-app Apply flow (button, dialog, `POST /job-discovery/jobs/{requirementId}/apply`, the "Confirm application" follow-up task) was removed from Job Discovery.

## The table `cws_job_source`
Migration `api/src/main/resources/config/liquibase/changelog/20261103200000_ent_cws_job_source.xml` (registered in `master.xml`). A companion table; the shared `client_requirement` table and entity are untouched.

| Column | Notes |
|---|---|
| `org_id`, `requirement_id` | composite FK `(org_id, requirement_id)` -> `client_requirement (org_id, id)`; unique `(org_id, requirement_id)` (one row per job) |
| `source_url` varchar(500) | https only; validated on write (by the future marketer write) and on **read** |
| `source_name` varchar(80) | e.g. LinkedIn, Dice, Company site |
| `quick_info` varchar(500) | the marketer's short note (to be scanned by the PII guard on write) |
| `added_by_member_id` | nullable composite FK `(org_id, added_by_member_id)` -> `org_member (org_id, id)` |
| `sample_data` | true for demo stand-in rows; the UI shows the Sample mark |
| `created_at`, `updated_at` | |

No PII columns. Code: entity `CwsJobSource`, repository `CwsJobSourceRepository` (org-id-first finders, a bulk finder by requirement id list), read helper `ConsultantWsJobSourceReader` (loads source info for a list of jobs and holds `safeUrl`: https scheme, a real host with a dot, no credentials, no whitespace or control characters, at most 500 characters; anything else becomes `sourceUrl = null`). The web re-checks the link (`safeHttpsUrl`, a second line of defence) before it is ever rendered as an anchor.

## API
`sourceUrl`, `sourceName`, `quickInfo`, `sourceSample` are on the job DTOs of Job Discovery (`Job`, so list and detail), Job Matches (`MatchRow`, list and detail) and Assigned Opportunities (`Row`, list and detail). A job without a row has all four empty or false. No new endpoints; one removed (`POST /me-workspace/job-discovery/jobs/{requirementId}/apply`) together with its BFF route and its `OrgIsolationIT` row.

## Demo data
`ConsultantWsJobSourceDemoSeeder.seed()` (called last from `EnterpriseDemoBootstrap`): every OPEN requirement of the two demo orgs without a row gets `https://jobs.example.com/<org-slug>/<requirementId>`, a rotating source name and a short note, all `sample_data = true`. Idempotent per job (only jobs without a row are filled).

## What the marketer role must later write
- Create or update `cws_job_source` for a job it loads: validate `source_url` as https (use `ConsultantWsJobSourceReader.safeUrl`; reject, do not silently null), cap lengths, set `added_by_member_id` to the acting member's `org_member` id, scan `quick_info` with `SensitiveContent`, leave `sample_data = false`.
- Authorise with the marketer's own permission family (not `opportunities.respond`).
- Make a missing link visible in the marketer UI (the consultant sees the disabled button).

## Extension tracking handoff (documented gap; nothing in this task changes the extension)
The extension already detects submits and sends them through the `TrackingProvider` seam. Open items for a later task:
- Match a tracked application to the job the consultant opened (the source link host and path vs `cws_job_source.source_url`, or a Kiwiply job id carried through the link) so the application attaches to the right `client_requirement` and appears in My Applications with the right status.
- Decide whether the link carries a Kiwiply job id (a query parameter the extension reads) or the extension matches on URL.
- Status updates after the submit (interview, offer, rejection) arrive through the inbox and tracking work, not through these pages.

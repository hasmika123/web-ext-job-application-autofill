# Onboarding a consultancy (A2 + A3 + A7): build plan

> 2026-11-11. Gap list items **A2** (runbook), **A3** (bulk import) and **A7** (real accounts without the demo special case), from
> `BUILD-OUT-GAPS.md`. A real consultancy arrives with 50–150 consultants; adding them one by one was the only way in.

## User decisions (2026-11-11)
- **Invites:** a CSV import creates the consultant profiles and, in the **same Apply**, sends each ticked consultant (all by default) the normal
  invitation to join, with the Consultant role.
- **Resumes:** **not in bulk** for now. A resume lives in the consultant's own organization account (decision O4), which exists only once they
  accept the invitation. Consultants upload their own when they first sign in; marketers add more with "New resume for…" after that.

## A3: import consultants from a CSV
- **Where:** a new **Import** action on the Consultants page. The steps are Upload → Review → Apply, and nothing is written until Apply.
- **Who:** `consultants.edit` (the same key as "Add consultant"). Inviting needs `members.invite` as well; without it the invite column is off.
- **File:** a CSV with a header row. A template is downloadable from the dialog. Columns are matched by name, in any order, without case:
  `name` (required), `email` (required), `job title`, `location`, `work mode` (remote/hybrid/onsite), `years`, `skills` (separated by `;` or
  `|`), `department` (an existing department's name). The browser reads the file; the server checks every row. At most **500 rows** per import.
- **Check** (`POST /api/orgs/{orgId}/consultants/import/check`, writes nothing): one verdict per row.
  - `READY`, or `INVALID` with the field and the reason, the same rules as "Add consultant" (name length, email format, work mode, years 0–60,
    skills, department exists);
  - `DUPLICATE`: a consultant with that email already exists, or the email appears twice in the file;
  - `SENSITIVE`: a value looks like an ID, bank or tax number, so it is refused, by the product-wide scanner.
  - It also says whether each READY row would get an invitation (`invite`: `WILL_INVITE`), or why not (`NOT_ASKED`, `ALREADY_MEMBER`,
    `NO_PERMISSION`).
- **Apply** (`POST /api/orgs/{orgId}/consultants/import`, `Idempotency-Key`): rows are re-checked, and only READY rows are created. For a ticked row
  the invitation is sent **first** and the profile is created right after, so it links to the invited seat, the same rule "Add consultant" uses.
  When the person accepts, the profile is theirs.
  - One row's failure never stops the others.
  - Each row commits in its own transaction, so the `Idempotency-Key` uses `IdempotencyService.executeInSteps`: the work runs with no surrounding
    transaction (one database connection at a time) and the reply is stored after it. A retry with the same key returns the same summary; a
    repeat with a new key is harmless, because rows already added come back as "Already here".
  - The answer is a summary: added, invited, skipped (with reasons).
  - Each created consultant writes its normal `CONSULTANT_CREATE` audit row, each invitation its normal row, plus one `CONSULTANT_IMPORT` summary row.
- **Not in this build:** resumes in bulk (decision above), assigning marketers from the file (done after, on Marketing Assignments), CSV export, and
  requirement (job) import.

## A7: real enterprise accounts
An invited or directly created enterprise account carries its organization on the user row (`user.org_id`). The extension connect paths
(`AuthenticateController.connectsTo`), the account kind (`ProfileWorkspaces.accountOfCurrentUser`) and the workspace profile (#137) work from
that, and need no demo special case. The demo special case (`EnterpriseDemoSeeder.isEnterpriseDemoLogin`) is now only a fallback for the seeded
demo members, whose rows carry no organization. This build re-checks that in code and records it in the runbook; nothing changes.

## A2: the runbook
`docs/enterprise-v2/ONBOARDING-RUNBOOK.md`: every step from "create the organization" to "a consultant applies with Autopilot", saying who
does it (platform admin, Org Admin, the consultant), where in the product, and what is still a manual or developer step.

## Status (2026-11-11)
- **A3 built.** API: `ConsultantImportService` (`check`, `apply`), `ConsultantWriteService.checkCreate` (the create checks without writing),
  `POST .../consultants/import/check` and `POST .../consultants/import` on `OrgConsultantResource`; tests `ConsultantImportIT` and two
  `OrgIsolationIT` rows. Web: `lib/ent/consultant-import.ts` (CSV reader, template, client), `ImportConsultantsSheet`, the "Import from CSV"
  button on Consultants; tests for both.
- **A7 checked**: no code change (above).
- **A2 written**: `ONBOARDING-RUNBOOK.md`.

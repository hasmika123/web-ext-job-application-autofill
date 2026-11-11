# The resume chosen for a job (D3): build plan

> 2026-11-10. Gap list item **D3** (`BUILD-OUT-GAPS.md`). Before this, the demo pinned a tailored resume to one preset job in the browser only.
> Now a marketer can choose which of the consultant's resumes goes with an assigned job, and Prepare attaches exactly that resume.
> Design source: `31-talent-marketing.md` (the opportunity carries the resume chosen at assignment) and `30-resume-management.md` §5 (approval).

## Rules
- **What can be chosen:** one of the consultant's own live organization resumes (`org_resume`, not ended). It can be **approved**, or still
  **waiting for the consultant's approval** (a resume the marketer just made or tailored). A resume the consultant sent back
  (`REJECTED`) cannot be chosen.
- **Who chooses:** a marketer whose scope covers the consultant (`opportunities.manage`, the same wall as every other opportunity write). The
  choice can be cleared. Every change writes an opportunity timeline line and one audit row.
- **What Prepare uses:** the chosen resume **only once the consultant has approved it**. CLAUDE.md: the consultant approves marketer-made
  resumes, and nothing a marketer wrote is used until they do.
  - If it is still waiting, the Prepare dialog names it, links to it, and says that preparing approves it. The consultant's click approves
    that exact version (the existing approve call, with the version and content hash they were shown), then the batch starts.
  - Without a click, the server refuses that job with `RESUME_NEEDS_APPROVAL`.
- **No choice, or a choice the consultant rejected or ended:** the usual resume pick, as today.
- **The extension needs no change.** It already takes a `resumeId` per job and attaches exactly that resume.

## Slices (one commit each)

| # | Slice | What |
|---|---|---|
| P1 | API: the choice | Liquibase (additive): `mkt_opportunity.pinned_org_resume_id`, `pinned_by_member_id`, `pinned_at`. Marketer route `PUT /api/orgs/{orgId}/mkt/opportunities/{id}/resume` `{orgResumeId \| null}`. The opportunity detail shows it. Isolation registry row; tests. |
| P2 | API: consultant + Prepare | The consultant's Assigned Opportunities row carries the chosen resume (label, approval state, version + hash, who chose it). `ConPrepareService`: a job with an approved choice carries `resumeId` (the person-owned resume of that org resume); a waiting choice is skipped with `RESUME_NEEDS_APPROVAL`. Tests. |
| P3 | Web: marketer | "Resume for this job" on the opportunity sheet: a picker of the consultant's resumes, marked "Approved" or "Waiting for approval", plus Clear. |
| P4 | Web: consultant | The row note "Resume chosen by {marketer}" (+ "needs your approval" + View). The Prepare dialog approves waiting choices on the consultant's click, then passes each job's `resumeId` from the server. The demo-only pin in `PrepareBatch.tsx` gives way to the real one. |

## Status (2026-11-10, branch `ent-pinned-resume`)
All four slices are built. **API:** the migration `20261127010000_ent_opportunity_resume.xml`, `PinnedResumes`, `PUT mkt/opportunities/{id}/resume`, the
chosen resume on the detail and on the consultant's row, and Prepare's `resumeId` / `RESUME_NEEDS_APPROVAL`. **Web:** "Resume for this job" on the marketer's
review sheet, "Resume chosen by ..." on the consultant's row, and the Prepare dialog approving waiting choices on the consultant's click. The extension is
unchanged. The demo's preset tailoring (D2) still runs: its job takes the demo resume only when the server names none.

## Not in this build
Marketer tailoring for any job (D2, next), choosing a resume at assignment time inside the assign sheet (the sheet sets it right after),
and a resume per job in the extension's own Jobs tab.

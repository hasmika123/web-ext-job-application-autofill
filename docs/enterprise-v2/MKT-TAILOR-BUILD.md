# Marketer tailoring (D2): build plan

> 2026-11-11. Gap list item **D2** (`BUILD-OUT-GAPS.md`). The demo's "Tailor Anika's resume for this job" was a preset: one job, one
> consultant, fixed changes and scores. This makes it real for **any assigned job**. It builds on D3 (`PINNED-RESUME-BUILD.md`): the tailored
> resume is chosen for the job automatically.

## User decisions (2026-11-11)
- **Who pays:** the consultant's licence. Tailoring needs the `ai.resume_tailoring` add-on on the consultant's licence, and it spends that
  consultant's monthly AI budget (the design's doc 24 §8 example).
- **Consent:** none beyond approval, as today's "New resume for…": the tailored resume is never used until the consultant approves that exact
  version.
- **Score:** keyword coverage with no extra AI: the share of the job's key terms the resume covers, before and after. It moves live as the marketer
  keeps or skips each change.

## Rules
- **Who:** a marketer with `resumes.edit_for` (the act-for permission) and `opportunities.manage`, whose scope covers the consultant.
- **For what:** an **assigned** job. The source is one of the consultant's own resumes that can be chosen (`PinnedResumes`: approved or
  waiting). The default is the job's chosen resume, else the consultant's primary.
- **The consultant needs an organization account** (decision O4), as "New resume for…" does: otherwise 409 `CONSULTANT_HAS_NO_ACCOUNT`.
- **Truthfulness:** the existing engine's checks apply. Rewrites only rephrase existing bullets and the summary, never add a number the original
  lacks, and never name the target company. Missing keywords are only **suggested** ("Add only if true"). They are added to the skills only when
  the marketer ticks them, and the consultant approves the result.
- **The result:** a new resume in the consultant's account, made with act-for, so it lands `ORG_MANAGED` + `PENDING` for the consultant's
  approval and is chosen for the job. Prepare uses it once the consultant approves it (D3).
- **Never** submits anything, and never signs in as the consultant (E1).

## Slices
| # | Slice | What |
|---|---|---|
| T1 | API | `ResumeTailorService.proposeFor(owner, resume, job…)` charges the owner (the consultant). `KeywordCoverage` (pure): the job's terms (requirement skills + the engine's missing keywords), what the resume covers, and what each change adds. `TailoredDoc` (pure): writes the kept bullet/summary changes and the ticked additions into a builder document. `MktTailorService` + `MktTailorResource`: `POST mkt/opportunities/{id}/tailor` `{orgResumeId?}` → proposal with score; `POST mkt/opportunities/{id}/tailor/{proposalId}/save` `{keep[], additions[], label?}` → the new org resume, chosen for the job. Audit `MARKETER_RESUME_TAILOR`. Isolation rows; tests. |
| T2 | Web | "Tailor with AI" on the "Resume for this job" box; the tailoring sheet (steps, before/after cards with keep/skip, "Add only if true", the live keyword score, the name); on save, the review sheet shows the new resume as chosen, waiting for approval. |

## Status (2026-11-11, branch `ent-mkt-tailor`)
Both slices are built.
- **API:** `MktTailorService`, `KeywordCoverage`, `TailoredDoc`, `ResumeTailorService.proposeFor` / `stored`, and `MktTailorResource`. The save route is
  `.../tailor/{proposalId}/save`: the no-submit guard refuses "apply" in any organization route.
- **Web:** `TailorSheet` behind "Tailor with AI" on the review sheet's resume box.
- **The demo's preset tailoring card on Job Discovery stays** for the demo tenant. It runs only when the demo is on and the preset job matches.

## Not in this build
Tailoring from Job Discovery before the job is assigned, a consent toggle, the org-wide marketer AI pool, and AI fit scoring.

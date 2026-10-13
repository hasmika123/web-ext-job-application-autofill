# ADR-009 — Resumes stay person-owned; organizations get management rights through org_resume

- **Status:** Accepted (Phase 0, 2026-10-12)
- **Debate topic:** `02-architecture-debate.md` Part B §9
- **Reversibility:** see Consequences

## Context
Resume/ResumeDoc/ResumeDocVersion/ResumeAccess are user-owned with createdBy/updatedBy audit and Via.ORG reads. Requirements §11 need org-managed resumes, approval, visibility, primary resume, audit; CLAUDE.md: the server owns the record, the user confirms.

## Decision
- New table org_resume (org_id, resume_id, member_id, managed_by_member_id, kind PERSONAL_SHARED|ORG_MANAGED, approval_status DRAFT|PENDING_APPROVAL|APPROVED|REJECTED, approved_at, approved_version_no, visibility ORG|ASSIGNED|PRIVATE, primary_for_org BOOLEAN, edit_allowed BOOLEAN, created_at). Unique (org_id, resume_id).
- resume.user_id never changes. A marketer creating a resume for a consultant creates it under the consultant's user (createdByLogin = marketer) and an ORG_MANAGED link; the consultant must APPROVE before it is used in any submission.
- Marketer edits require: FULL pairing to that marketer, permission resumes.edit_for (ASSIGNED), link.edit_allowed, and produce a ResumeDocVersion with reason. The consultant sees the diff and may reject (reverts to the approved version).
- Leaving/removal deletes org_resume links (the org loses the view); the resume stays with the person. Org exports never include resume content beyond what consent allows.

## Consequences
Resume directory = org_resume ⨝ resume meta (consented). "Primary resume" is per org, not global.

## Security note
ResumeAccessService.access() gains an ORG_MANAGED branch; ResumeViewEvent.KIND_ORG audits reads as today.

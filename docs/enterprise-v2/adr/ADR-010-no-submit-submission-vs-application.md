# ADR-010 — Application authorization: marketers prepare and request; consultants authorize and submit; Kiwiply never submits

- **Status:** Accepted (Phase 0, 2026-10-12)
- **Debate topic:** `02-architecture-debate.md` Part B §10
- **Reversibility:** see Consequences

## Context
CLAUDE.md: no auto-submit ever; the Consultancy Marketer never submits and never signs in as a consultant; Autopilot stops before submit and never ticks attestation boxes. Requirements §12/§15/§32-D use "submit" for marketers.

## Decision
- Two objects. candidate_submission = a record that a consultant's approved resume was presented to a client/vendor requirement (who, when, which resume version, channel label, external reference). It is created by the marketer, requires the consultant's authorization (consent on the opportunity) and is never transmitted by Kiwiply. job_application = the consultant's own application on an ATS/job board (existing Application table), submitted only in the consultant's session.
- Marketer capabilities: prepare (resume, notes, opportunity), request authorization, record outcomes, schedule, follow up. Marketer prohibitions, enforced structurally: no endpoint under /api/orgs/** submits anything; the extension in a marketer session never loads a consultant's bio/answers; NoSubmitSurfaceTest stays in CI.
- "Marketing-Assisted Applications" (catalog feature) = the marketer may prepare opportunities and resumes for the consultant and see progress. "Approved Job Application Automation" = Autopilot batch-prepare for the consultant with their own extension; stops before submit; attestation boxes untouched.
- Duplicate guard: the same posting cannot be assigned twice in one org; the same consultant cannot be submitted to the same client requirement twice (unique keys), and a warning fires for the same employer within N days (setting).

## Consequences
The E2E-D scenario reads: Sarah assigns, Anika approves, Anika submits (or Sarah records a client submission), both track. Escalation E1 confirms.

## Security note
External job-board terms are respected because only the account holder acts in their own session.

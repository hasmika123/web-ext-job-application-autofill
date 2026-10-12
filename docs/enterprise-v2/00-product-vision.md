# 00 — Product vision: Kiwiply Enterprise V2

> Status: design, 2026-10-12. Source of intent: the user's master requirements (33 sections, 2026-10-12)
> reconciled against `CLAUDE.md`'s locked decisions. Where the two disagree, this document records the
> reconciliation and `08-decisions-for-user.md` carries the escalation. Design only — Sonnet builds.

## 1. One sentence
Every organization feels it is using its own professional talent platform — its domain, its logo,
its roles, its pipeline, its invoice — while Kiwiply runs **one shared deployment**, keeps **every
person's data their own**, and **never submits an application for anyone**.

## 2. Who it is for
- **Staffing agencies and IT consultancies** (the first buyer): a bench of consultants, a team of
  marketers who find requirements and prepare submissions, account managers who own clients, HR and
  finance who keep records, an owner who wants one dashboard.
- **Professional-services firms and outplacement providers** next; universities and bootcamps keep
  the existing org model (cohorts, consent, summary views) and gain branding and domains.
- **The person** inside every org: a consultant or employee who already has, or may later have, a
  personal Kiwiply account. Their resumes, applications, inbox and answers stay theirs.

## 3. What changes versus the org work already designed (`docs/design/org/*`)
The existing org design is a **buyer-of-seats** model: an org pays for items per person, gets a
consent-scoped view, and the marketer workspace prepares jobs for consultants. Enterprise V2 keeps
every one of those decisions and adds five things on top:

| Addition | What it means |
|---|---|
| **Tenancy by hostname** | `acme.kiwiply.com` and `careers.acme.com` resolve to Acme before anyone signs in. Unknown hosts fail safely. No fallback to another tenant or to the public site. |
| **Branded login-first portals** | One branded login component, one enterprise shell, runtime branding from the org record, the Kiwiply character used compactly and consistently. |
| **Configurable multi-role permissions** | Role templates (Org Admin, Marketing Specialist, Marketing Manager, HR, Finance, Account Manager, Talent Acquisition, Executive/Viewer, Consultant) with editable permission sets, several roles per person, scopes Own / Assigned / Team / Department / Org, backend-evaluated. |
| **Consultant-based subscriptions** | A required base license per consultant plus individually selected paid features from a platform catalog; presets as shortcuts; contracts and discounts; one invoice per org; usage metered and enforced. Admin/HR/Finance/Marketing seats do not consume consultant licenses. |
| **The talent-marketing pipeline** | Clients, requirements, opportunities, matches, submissions, applications, interviews, offers, placements as separate objects with state machines, ownership and approvals. |

## 4. What does not change (locked, and why it matters here)
- **No auto-submit, ever.** A marketer prepares, requests, records and follows up; the consultant
  authorizes and submits through their own session (extension or hand). "Marketing-assisted
  applications" and "approved application automation" mean *preparation and tracking*, never a
  Kiwiply-side submit. See ADR-010 and escalation E1.
- **We never collect sensitive PII.** HR and Finance modules are **records of work and money, not
  identity vaults**: no SSN/ITIN, bank or routing numbers, tax IDs, passport/visa/I-9 numbers, no
  DOB. Finance records money; it never moves it. See ADR-011 and escalation E2.
- **Everything admin-configured.** Prices, limits, caps, defaults and switches live in the catalog
  and the settings registry; code ships safe defaults.
- **Server is the source of truth; the extension is a read-only mirror** that creates resumes and
  learns answers — and, later, knows which workspace it is acting in.
- **One design system (`@kiwiply/ui`)**, one mascot, Notion-style autosave and undo, Gen Z-friendly
  but enterprise-professional.
- **Personal subscriptions are untouched.** Joining an org never cancels, merges or discounts a
  personal plan; benefits never combine automatically across workspaces.

## 5. Principles the design holds itself to
1. **Tenant first, then membership, then permission, then scope, then entitlement, then consent** —
   in that order, on every protected operation, on the server.
2. **Data belongs to people; orgs get views and rights.** Org-managed resumes are links and
   approvals on a person's resume, not copies.
3. **Money is immutable history.** Price versions never change; quotes expire; invoices snapshot.
4. **Additive only.** No destructive migration; every new capability is a new table or a new column
   with a default, behind a flag.
5. **Honest UI.** Nothing shows a number that is not real; nothing hides a permission check in a
   menu.
6. **Reversible decisions.** Each ADR says how to back out.

## 6. The six end-to-end journeys that define "done" (requirements §32)
A Org Admin onboarding on a custom domain · B one account, two workspaces · C licensing a
consultant with individually priced features · D marketer prepares, consultant approves, submits
and lands a placement · E a personal subscriber joins an org and nothing personal changes · F two
tenants on one deployment cannot see each other, and unknown hosts expose nothing.

## 7. Success measures (first 90 days after Phase 6)
- Time from org creation to a verified custom domain with branded login: < 1 working day
  (including the manual edge step while it exists).
- Zero cross-tenant findings from `OrgIsolationIT` and the negative Playwright suite, every CI run.
- Every invoice line traceable to a price version, a license change and an effective date.
- A consultant can always answer "what did my org's marketer do with my data?" from the timeline.

# HANDOFF - X9.12 (re-scoped): marketer "Save for consultant" + assigned jobs in the extension, second machine

> Written 2026-10-15 for a Sonnet session on the SECOND machine. Start ONLY when the coordinator says `version2` contains the
> merged change-audit branch (look for the merge commit "Merge change-audit" in `git log origin/version2`). Self-contained.
> Read first, in order: `CLAUDE.md` (O4 separate accounts; no auto-submit; E1: the consultant submits, Kiwiply never submits),
> `docs/enterprise-v2/07-backlog.md` section X9.12 (line ~5401; the OLD wording assumes a workspace selector and an
> `X-Kiwiply-Workspace` header, both superseded), `docs/enterprise-v2/19-separate-enterprise-accounts.md` sections 6 and 7.1
> (S6/S7: the extension connects ONE account at a time; enterprise accounts have `kind=ENTERPRISE`, `ext=1` and `tid` tokens),
> `docs/HANDOFF-ENT-ACCOUNTS-TRACK-B-REPORT.md` (the extension client you will extend), `docs/change-audit/README.md` and
> `docs/HANDOFF-CHANGE-AUDIT-REPORT.md` (the `SaveForConsultantService` and the act-for gate you will expose).

## 1. BRANCH RULES (read twice)

| Do | Don't |
|---|---|
| `git fetch origin` then `git switch -c ent-x912-b origin/version2` | Never commit to or push `version2`, `develop` or `main`. |
| Commit ONLY on **`ent-x912-b`**, push often: `git push -u origin ent-x912-b` | Never force-push; never `git stash` (WIP commits); no pull requests (the coordinator merges). |
| Sync only when told: `git fetch origin && git merge origin/version2` | Don't edit login/identity code, billing/Stripe/subscription code, marketer-visibility (O6) code beyond the seam below. |

Commits: `ent-x912: <subject>`, each ending with the line `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## 2. Goal and scope (re-scoped from backlog X9.12)

The extension already has the account chip, one-account-at-a-time storage and `modeOf(account)` (S7, merged). What is left of X9.12:

1. **API route** (the change-audit work built the service but no HTTP path): `POST /api/orgs/{orgId}/consultants/{memberId}/applications/save`
   calling `SaveForConsultantService` (a marketer SAVES a job with status `SAVED` on an assigned consultant's tracker; NEVER submits; the
   ArchUnit exception in `NoSubmitSurfaceTest` for exactly this service is accepted, decision D8, do not widen it). Rules: caller is an
   ENTERPRISE marketer with the right permission (find the permission key used by `TrackerActAsGate`/`TrackerActForGate`, doc 31/32);
   the consultant must be ASSIGNED to the caller (use `MktScope`; unassigned = generic 404, never 403); a seam method
   `MarketerAccess.allows(caller, consultant, APPLICATIONS)` returning true for assigned consultants for now (decision O6 builds the real
   per-assignment check later; document the seam in `TrackerActForGate`); idempotent per (consultant, posting) through the existing
   dedupe (`ApplicationKeys`); audit with the change-audit actor (act-for, on behalf of the consultant); rate limit; add the
   `OrgIsolationIT` COVERAGE row (the registry test fails if a route is missing) and an IT (`SaveForConsultantResourceIT`: assigned
   marketer saves; unassigned marketer 404; consultant (not marketer) 404; other tenant 404; duplicate save is idempotent; the saved
   application shows "Updated by <marketer> on behalf of <consultant>" in the tracker; no submit anywhere).
2. **Extension, marketer session** (`job-autofill/`, enterprise account with `marketer && !consultant`): the drawer offers ONLY a
   "Save for consultant..." action (pick one of the marketer's ASSIGNED consultants, via the existing mkt talent endpoint that is on the
   `ext=1` allow-list; extend `ExtensionRoutes` ONLY with the new save route and add it to `ExtensionRoutesTest`), calls the new route
   through the one `TrackingProvider` seam in `src/lib/tracking.js` (`saveForConsultant`), shows the result (saved / already saved /
   not assigned), and NEVER loads any consultant's bio or resumes (jsdom test). No autofill in a marketer session.
3. **Extension, consultant session** (enterprise account with `consultant`): the Jobs tab lists the jobs assigned to the consultant
   (`GET` of the existing consultant opportunities/matches endpoint on the allow-list: `con/opportunities`; find the DTO in
   `ConOpportunitiesResource`), the item carries `matchId`; opening a job starts the normal fill with the signed-in user's own
   profile. Reuse existing components; no new engine dependency.
4. Tests: `cd job-autofill && npm test` (extend `workspace.test.js`, `tracking.test.js`/`org_provider.test.js`, `no_submit.test.js` unchanged
   BLOCK_RE, `account_clear` style tests; a new `marketer_session.test.js`), `npm run typecheck`, `npm run build` (bump the extension
   version in `wxt.config.ts` AND `package.json`; `rules.js` only if rules change). API: `cd api && ./gradlew test --offline` and
   `./gradlew integrationTest -x test --offline --tests '*SaveForConsultant*' --tests '*OrgIsolationIT' --tests '*ExtensionWorldIT'
   --tests '*OpenApiContractIT' --tests '*NoSubmit*' --tests '*TechnicalStructureTest'` (ITs are not run by `test`; regenerate
   `api/openapi.json` with `OpenApiContractIT`; `OrgIsolationIT` must stay 10/10, 15-25 min, run once at the end; long commands in
   the background). Web: only if a DTO forces it.
5. Stories (descriptions only, no videos): add MKT-5x / CON-8x entries at the END of `docs/enterprise-v2/qa/stories/marketing.md` and
   `consultant.md` (grep the highest ids first).

## 3. Rules that always apply

No auto-submit and no submit-class clicks anywhere (E1: marketers prepare, request and record; the consultant submits); no sensitive PII;
no secrets; the engine stays vanilla JS on `window.JAF`, no new engine deps; one design system `@kiwiply/ui` (no inline `<svg>`); additive
Liquibase only (none expected); org from the host/token never from the client; generic 404 for strangers, never 403; every new org route
needs `OrgIsolationIT` COVERAGE rows.

## 4. Done when

The route, the marketer "Save for consultant..." action and the consultant assigned-jobs tab work with the tests above green, everything
is committed and pushed on `ent-x912-b`, and a report is written as the final message AND a committed file
`docs/HANDOFF-ENT-X9-12-REPORT.md` (what changed, tests with counts, deviations, open questions). Then stop and wait.

## 5. Decisions already made

O4 separate accounts; O5/O6 marketer visibility (O6 per-assignment check is queued, build only the seam now); D8 accepted by the user
2026-10-15 (the single ArchUnit exception for `SaveForConsultantService`).

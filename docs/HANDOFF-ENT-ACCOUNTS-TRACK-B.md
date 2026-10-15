# HANDOFF — Separate enterprise accounts, Track B (extension client, second machine)

> Written 2026-10-15. Read `CLAUDE.md` first (note: "Two kinds of account, never connected", decision O4), then
> `docs/enterprise-v2/19-separate-enterprise-accounts.md` (the plan; section 6 is YOUR spec, section 7 the phase table).

## START HERE

- **Branch:** create `ent-accounts-b` from `origin/version2` (`git fetch && git switch -c ent-accounts-b origin/version2`).
  Never push to `version2`, `develop` or `main`. Push only `ent-accounts-b` (`git push -u origin ent-accounts-b`).
  The other machine (Track A) keeps building S3 then S4 on `version2`; the coordinator merges your branch.
- **Your scope: S7, the extension CLIENT** (`job-autofill/`), built against the server contract in doc 19 section 6.2/6.3
  (`account` in `GET /api/profile/version`, one-time connect code, `ext=1` token). The server side (S6) does NOT exist yet;
  code against the documented contract and mock it in tests. Do not touch `api/` or `web/` (only `job-autofill/` and, if
  strictly needed, `packages/ui`). Do not run Gradle.
- **What S7 means** (doc 19 section 7, row S7): `workspace.js` `modeOf(account)` replaces the workspace selector; storage keys
  and account-change clearing by user id (signing in as a different account clears the local mirror and the answers cache
  so nothing crosses between a personal and an enterprise account); an account chip in the drawer with "Switch account"
  (switching = sign in to the other account, never both at once); the slim options page shows which account is connected;
  `tracking.js` / the `TrackingProvider` seam takes the account kind into its DTO handling; remove the `X-Kiwiply-Workspace`
  header and the `workspaces[]` selector (keep reading `workspaces` for one release if the server still sends it);
  bump `manifest.version` in `job-autofill/wxt.config.ts` + `job-autofill/package.json` (and `src/config/rules.js` only if
  rules change; the smoke test asserts it).
- **Hard rules that apply here:** engine code stays vanilla JS on `window.JAF` (no new engine deps); no auto-submit; the
  extension has no login of its own (web-connect handoff only); no sensitive PII ever; one design system `@kiwiply/ui` for
  any shared visual (never inline an `<svg>`); never commit secrets.
- **Tests:** `cd job-autofill && npm test` must be green (add tests for: account change clears storage; enterprise vs
  personal DTO handling; chip shows the right account; no data from the old account is readable after a switch; the
  old `workspaces[]` payload still parses). Install at the repo ROOT (`npm ci` in the root; npm workspaces).
- **Commits:** small, `ent-accounts: S7 …`, each ending with the line
  `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Update the S7 line in doc 19 section 7.1 and add one log line
  to `docs/enterprise-v2/progress-tracker.md`.
- **Done when:** S7 acceptance in doc 19 holds with a mocked server, `npm test` green, branch pushed, and a short report
  (what changed, tests, anything in the server contract that turned out unclear or missing, so Track A can fix S6).

## What comes next (do not start unless told)

After Track A lands S4, Track B takes S8 (lifecycle), S9 (web join/login copy) and S5 (entitlement guards) in that order;
Track A does S6 (extension server side) and S10 (seeds and migration tool). Dependencies: S5, S8, S9 need S4; S6 needs S3.

## Context you may need

- Decisions: O4 (separate accounts, same email allowed, extension one account at a time), O5 (assigned marketers see all of
  their consultants' resumes and applications; no consent gate).
- The two machines never share a database or a running stack. Use your own local setup (`docs/enterprise-v2/qa/03-test-data-and-environment.md`)
  only if you need the web app; S7 does not.

# HANDOFF — Separate enterprise accounts, Track B (extension client), second machine

> Written 2026-10-15 for a Sonnet session on a SECOND machine. Everything you need is in this file; read it fully
> before touching anything. Spec = `docs/enterprise-v2/19-separate-enterprise-accounts.md` (sections 0, 2.5, 6, 7).

## 0. The one-minute picture

Kiwiply now has two kinds of account that are **never connected**: a **personal** account (kiwiply.com) and an
**enterprise** account per organization (its own host, e.g. acme.kiwiply.com). The same email may have both. The
browser extension connects to **one account at a time**; the person switches by connecting the other account. No data
may cross between the two. Your job (phase **S7**) is the extension client side of that. Another machine ("Track A")
is building the server side (S3, S4, then S6) at the same time, so the server contract below does not exist yet:
you build against the contract and mock it in tests.

## 1. BRANCH RULES (read twice)

| Do | Don't |
|---|---|
| `git fetch origin` then `git switch -c ent-accounts-b origin/version2` | Never commit to or push `version2`, `develop` or `main`. |
| Commit ONLY on branch **`ent-accounts-b`** | Never force-push. Never rewrite pushed commits. |
| Push with `git push -u origin ent-accounts-b` after every few commits | Never run `git stash` (shared stash stack); use a WIP commit instead. |
| If told to sync: `git fetch origin && git merge origin/version2` into `ent-accounts-b` (merge, not rebase), resolve conflicts, push | Don't open pull requests; the coordinator merges your branch into `version2`. |

Commit message format: `ent-accounts: S7 <subject>` and end every message with the line
`Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## 2. Scope: ONLY phase S7 (`job-autofill/` extension client)

Touch only `job-autofill/` (and `packages/ui` only if you truly need a shared visual; never inline an `<svg>`).
Do NOT edit `api/`, `web/`, root docs other than the two doc lines in section 7, and do NOT run Gradle. First read
`job-autofill/ARCHITECTURE.md` (file map) and `CLAUDE.md` (extension rules: engine code is vanilla JS on
`window.JAF`, no new engine dependencies, no auto-submit, no login of its own in the extension, no sensitive PII).

### Files to change (from doc 19 section 2.5) and what to do in each

1. `job-autofill/src/lib/workspace.js` — replace `modeOf(workspaces, setting)` (and `selected`) with a pure
   `modeOf(account)`: `account.kind === "PERSONAL"` -> today's personal drawer; `ENTERPRISE` with
   `marketer && !consultant` -> the marketer facade; `consultant` -> fill + Jobs tab. Keep the rest of the file
   (trim capture, URL keys, matching, `surfacesOf`) unchanged. Add unit tests in `job-autofill/test/`.
2. `job-autofill/src/lib/storage.js` — the session record `trackingAuth` gains
   `{kind: "PERSONAL"|"ENTERPRISE", orgId, orgName, email, userId}`. Account-bound caches (`ACCOUNT_KEYS`/
   `ACCOUNT_SETTINGS`, `ws:<orgId>:*`, `learnedAnswersOwner`) must be cleared whenever the connected **userId**
   changes. Compare user ids, never emails or logins (two accounts can share an email). On upgrade delete the old
   `workspace` and `workspaces` keys. Never keep two sessions.
3. `job-autofill/src/lib/tracking.js` (the one `TrackingProvider` seam) — `profileVersion` now reads
   `account: {kind, orgId, name, consultant, marketer}` from `GET /api/profile/version`. Keep tolerating the old
   `workspaces[]` array for one release (old servers still send it): derive `account` from it when `account` is absent.
   Remove the `X-Kiwiply-Workspace` header entirely (the token identifies account and org; the header will not exist).
4. `job-autofill/entrypoints/panel/HomeView.tsx`, `workspace-actions.ts` (`readWorkspaceState`, `refreshWorkspaces`,
   `chooseWorkspace`), `AssignedJobs.tsx`, `MarketerView.tsx` — remove the Personal/Org `<select>` (`onPickWorkspace`).
   Show an **account chip** in the drawer header: `Personal`, or `<OrgName> · Enterprise`, with the email beneath and a
   **Switch account** action that opens the connect flow (see 5). Use `@kiwiply/ui` primitives.
5. `job-autofill/entrypoints/background.ts` (`onMessageExternal`), `entrypoints/connect-relay.content.ts`,
   `wxt.config.ts` (`externally_connectable`) — the session handoff message from kiwiply.com/connect now also carries
   `kind`, `orgId`, `orgName`, `email`, `userId`; store them in `trackingAuth`; when `userId` differs from the stored
   one, clear the previous account's caches first, then replace the session (no second session). Add NO new origin
   (custom tenant domains cannot be listed; the enterprise flow still ends on `https://kiwiply.com/connect?code=...`
   which the web side handles). "Switch account" simply opens `https://kiwiply.com/connect` (personal) or shows the
   instruction to use "Connect extension" in the enterprise workspace; the server bits arrive with S6.
6. `job-autofill/entrypoints/options/*` — "Account status" shows email + kind + organization name. Never show the
   synthetic login (it may look like `ent#<orgId>#...`).
7. Version bump ritual: `manifest.version` in `job-autofill/wxt.config.ts` AND `job-autofill/package.json`
   (same value); bump `src/config/rules.js` `version` only if rules change (the smoke test asserts it).

### Server contract you code against (doc 19 section 6.2, mock it in tests)

* `GET /api/profile/version` -> `{version, plan, account: {kind: "PERSONAL"|"ENTERPRISE", orgId|null, name|null,
  consultant: bool, marketer: bool}, workspaces: [...]}` (`workspaces` is `[]` for personal, one entry for enterprise,
  kept one release for old builds, then removed). `account` may be missing on an older server: fall back as in 3.
* Session handoff message (from the web connect page to the extension via `externally_connectable`): existing token
  fields plus `kind`, `orgId`, `orgName`, `email`, `userId`.
* The extension keeps calling `api.kiwiply.com`; an enterprise token carries `tid` and `ext=1`. No client change needed
  for that beyond sending the token like today.

## 3. Tests (all must pass)

`cd <repo root> && npm ci` (npm workspaces: install at the ROOT, never inside `job-autofill`), then
`cd job-autofill && npm test`. Add tests for: `modeOf(account)` for personal, consultant, marketer, both flags and a
missing account; switching from account A to account B (different userId) clears every account-bound cache and
leaves device settings (non-account settings) alone; same email but different userId still clears; the old
`workspaces[]`-only payload still yields a usable `account`; the chip text for personal and enterprise; no header
`X-Kiwiply-Workspace` is sent; the options page never renders an `ent#` login. Also run the extension build once:
`cd job-autofill && npm run build` (must succeed).

## 4. Rules that always apply

No auto-submit, no CAPTCHA bypass; never collect sensitive PII (no SSN, bank, tax, passport, ID numbers, DOB); no
secrets in the repo; the engine stays framework-free vanilla JS; one design system `@kiwiply/ui` (no hand-rolled
primitives, no inline `<svg>`); Capture real DOM before writing any ATS selector (not needed for S7). If something in the
spec is unclear or impossible, write the question into your report instead of improvising.

## 5. Done when

S7 works end to end with a mocked server, `npm test` and `npm run build` pass, everything is committed on
`ent-accounts-b` and pushed (`git push -u origin ent-accounts-b`), and you have written a short report as the final
message AND as a new file `docs/HANDOFF-ENT-ACCOUNTS-TRACK-B-REPORT.md` (committed on `ent-accounts-b`): what changed
(files), test counts, anything unclear or missing in the server contract (so Track A can fix S6), and what you would do
next.

## 6. After S7 (do NOT start unless the coordinator tells you; wait for a new message)

When Track A has landed S4 on `version2`, you will be told to `git fetch && git merge origin/version2` into
`ent-accounts-b`, and to take **S8** (offboarding/export/deletion), **S9** (web tenant join/login/forgot copy) and
**S5** (entitlement guards) from doc 19 section 7, still on `ent-accounts-b`. Track A does S6 (extension server side)
and S10 (seeds, migration tool). The coordinator merges `ent-accounts-b` into `version2`.

## 7. Bookkeeping

In `docs/enterprise-v2/19-separate-enterprise-accounts.md` section 7.1 add a line "S7 done (ent-accounts-b)" with the
test counts, and add one log line to `docs/enterprise-v2/progress-tracker.md` ("2026-10-15 - S7 extension client on
ent-accounts-b: ..."). Commit both on `ent-accounts-b`.

## 8. Context (decisions you should know)

* O4: enterprise and personal accounts are separate; same email allowed in both; the extension connects one account
  at a time (user decision 2026-10-14).
* O5: assigned marketers see all of their consultants' resumes and applications (server-side concern, not yours).
* The two machines never share a database or a running stack. You do not need the web app or the API for S7.

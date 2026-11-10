# HANDOFF-ENTERPRISE-ADMIN — Enterprise admin dashboard and pages, end to end (overnight run 2026-10-13)

## START HERE

**What was asked (user, 2026-10-13):** build the Enterprise Org Admin area from the six boards in `design/enterprise-admin/`
(dashboard, employees + detail sheet, invitations, teams, departments, roles & permissions) **connected end to end**: real Spring API +
MySQL + web, tenant host `acme.localhost`, one-click demo accounts per role. No sample numbers: every figure and row comes from the API.

**Where it is:** branch **`ent-admin`** (cut from `enterprise`, itself cut from `version2`). All six pages are built, merged, and were
exercised on the real stack by their own Playwright journeys. **Nothing is pushed; `main` and `version2` are untouched.**

| Page (route under `/w/admin/`) | Story | API |
|---|---|---|
| Dashboard `/` | X2.4 + X2.17 | `GET /api/orgs/{o}/dashboard` (+ alert dismiss) |
| Employees + detail sheet `/employees` | X4.3, X4.4, X4.6, X4.12 | `/members` (list, counts, detail, bulk, suspend/reinstate/offboard) |
| Invitations `/invitations` | X1.8, X1.15 | `/invitations` (list, counts, activity, bulk, resend, revoke) |
| Departments `/departments`, Teams `/teams` | X4.5 | `/groups` (tree, leads, moves, directory, structure) |
| Roles & Permissions `/roles` | X1.14, X4.1, X4.11 | `/roles`, `/permissions`, `/members/{id}/roles` |
| Shell, branded login, branding settings | X2.16, X2.3/X2.5/X2.13, X2.18 | `/api/me/tenant`, `/branding` |

## Run it (real stack)

See `docs/enterprise-v2/real-stack-runbook.md`. Short version: MySQL container `rb-demo-mysql` (port 33511), database `dossier_ent_demo`;
API `gradlew bootRun` with `DEMO_ENABLED=true ENT_DEMO_SEED=true APPLICATION_LIQUIBASE_ASYNC_START=false DOSSIER_TENANT_HOST_SECRET=<x>`
on port 18183; web = production build + `next start -p 3200` with the same secret and `TRUST_PROXY_HOST=false`
(**Next dev mode does not work inside git worktrees**). Open `http://acme.localhost:3200/login`, click **Demo accounts**, pick Sarah Chen
(Org Admin + Marketing Manager). `beta.localhost:3200` is the second tenant (isolation proof).
`DEMO_ALLOW_WRITES` must be **unset** in production-like runs; the journeys that write need it set (demo members are read-only otherwise).

## Verification state at hand-off
See `docs/enterprise-v2/progress-tracker.md` Log (latest entries) for the exact numbers. The last full runs on `ent-admin`
are recorded in `.verify-final-*.log` in the worktree (untracked).

## Needs the user (decisions and edge work)
- **Review (permission broadening):** `ORG_ADMIN` now holds every permission except `org.close` / `org.transfer_ownership` (doc 05 §3). A side effect: Owner
  and Org Admin read from role data also hold `member.view_full` and `member.act_for` (the old enum never gave them). Use is still gated by
  consultant consent and assignments. Confirm this is wanted (tracker, "Needs design review").
- **Open since the design pass:** D2 (Autopilot feed), E8 (break-glass), E21–E29 (`docs/enterprise-v2/08-decisions-for-user.md`); two matter before
  real money flows: E27 point-in-time DB backup, E28 least-privilege MySQL user.
- **Edge (yours to apply on the BeeCompete box):** E12 deny rule, `KIWIPLY_ASK_TOKEN`, no `X-Frame-Options: DENY` on tenant hosts (the branding
  live preview is an iframe), `DOSSIER_TENANT_HOST_SECRET` on both api and web before turning the enterprise flag on in prod.
- **Decide:** whether to push `ent-admin` / `enterprise`, and when to merge them into `version2`.

## Known gaps (not built; all recorded in the tracker)
Dashboard: activation checklist, team-performance and pipeline data (modules not built). Employees: CSV export, ownership transfer, session revoke,
consent request, offboarding wizard UI, "joined" filter. Invitations: CSV template, row detail drawer, idempotency key on invites. Groups: Undo of
moves, drag-and-drop, lead cleared when a lead leaves (offboarding hook). Roles: per-role audit view, role caps still constants. Shell: `/me`
(profile, notifications, security) pages 404, global search covers nav pages only. Sidebar items for later phases show "on the way".

## Rules that matter
Enterprise-only bee mascot (never in marketing/app/org/admin trees) · theme only via `--brand-*` variables · 404-not-403 for tenant/permission
failures · every new org route in the `OrgIsolationIT` registry · additive Liquibase with rollbacks · no sensitive PII · never machine-wide
`taskkill` · one gradle at a time per worktree · merge helper: `scratchpad/merge_into.sh` pattern (resolve tracker/roadmap bookkeeping, stop on code conflicts).

# HANDOFF-ENTERPRISE-ADMIN — Enterprise admin dashboard and pages, end to end (started 2026-10-13, overnight run)

## START HERE

**Goal (user, 2026-10-13):** build the Enterprise Org Admin area from the six boards in `design/enterprise-admin/`
(dashboard, employees, invitations, teams, departments, roles & permissions) **connected end to end**: real Spring API +
MySQL + web, tenant host `acme.localhost`, demo accounts per role. No sample numbers: every figure and row comes from the API.

**Branch map (all local, NOTHING pushed; `main` untouched)**

| Branch | What | State |
|---|---|---|
| `version2` | integration line, pushed earlier today up to `9596b4da` | stable |
| `enterprise` | Enterprise V2 build line (cut from `version2`): X1.1-X1.7, X1.10, X2.2, X2.3, X2.5, X2.6, X2.8, X2.10, X2.12, X2.13, X2.15, X2.18, Welcome Back login, bee kit | verified (see progress-tracker) |
| `ent-admin` | **this work**: admin shell + pages on top of `enterprise` | in progress |
| `ent-x*` | one branch per story/agent, merged into `ent-admin` (or `enterprise`) with `--no-ff` | transient |

**Order (each story: API first, then page):** X1.14 role writes · X1.8/X1.15 invitations · X1.12 real demo org + demo accounts ·
X2.16 shell · X2.4/X2.17 dashboard · X4.3/X4.12/X4.6 employees · invitations page · X4.5 departments + teams (API + pages) ·
X4.1/X4.11 roles page. Details and per-story decisions: `docs/enterprise-v2/progress-tracker.md`.

**Run the real stack:** `docs/enterprise-v2/real-stack-runbook.md` (written by X1.12). Web must be a production build + `next start`
(Next dev mode fails inside worktrees). Ports used by this work: API 18183, web 3200. Do not touch 3000/3100/18181/18182/8081/8082.

**Rules that matter:** enterprise-only bee mascot (never in marketing/app/org/admin trees); theme only via `--brand-*` variables;
404-not-403 for tenant/permission failures; every new org route in the `OrgIsolationIT` registry; additive Liquibase with rollbacks;
no sensitive PII; never machine-wide `taskkill`; local commits only.

**Decisions waiting on the user:** see `docs/enterprise-v2/08-decisions-for-user.md` (E21-E29, D2, E8). The edge Caddy change
(E12 deny rule, `KIWIPLY_ASK_TOKEN`, no `X-Frame-Options: DENY` on tenant hosts for the branding preview) is the user's to apply.

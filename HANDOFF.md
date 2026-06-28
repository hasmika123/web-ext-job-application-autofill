# HANDOFF.md — start here in a new chat

A fast orientation for picking this up cold, plus a **kickstart for what's immediately next**.
Canonical docs stay authoritative; this just points you at them and gets you moving.

## What this is
**Kiwiply** — a job-application autofill product in a monorepo:
- `/job-autofill` — MV3 browser extension (vanilla JS on `window.JAF`, no build step).
- `/web` — Next.js 16 + React 19 + TS + Tailwind v4 (the primary product; BFF for the API).
- `/api` — Spring Boot (JHipster-derived) + MySQL + Liquibase + S3.
- `/brand` — source logo/ATS art (originals; served copies live in `web/public` + `job-autofill/icons`).
- Root docs: `ROADMAP.md` (architecture), `PROGRESS.md` (task tracker + Log), `ADMIN-PLAN.md`
  (admin side), `DEPLOY.md` (ops), `CLAUDE.md` (working rules — read it).

**Live** at https://kiwiply.com (web), https://api.kiwiply.com (API), on an IONOS VPS
(Docker Compose + Caddy + AWS S3). **CI/CD auto-deploys on push to `main`** (build → GHCR →
VPS pull/restart). Email verification + password reset are live (Brevo SMTP). See the
`live-deployment` memory for URLs/ops.

## How to work here (the loop)
Per `CLAUDE.md`: read `PROGRESS.md` → **Current focus**; do ONE task; tests green; bump
versions if the extension changed; **one task = one commit** (`phaseN.x: subject`). Hard rules:
no auto-submit/CAPTCHA, never commit secrets, server is source of truth, capture real ATS DOM
before writing selectors.

**Build/test environments (important gotchas):**
- Web: `cd web && npm test` (tsc + eslint) and `npm run build` (strongest gate).
- Extension: `cd job-autofill && npm test`.
- API: builds with **JDK 17** (`JAVA_HOME="/c/Program Files/Java/jdk-17"`), e.g.
  `./gradlew compileJava` / a single `--tests` unit test. **Docker/MySQL aren't running
  locally**, so integration tests (Testcontainers) only run in **CI**. Plan accordingly.
- **Pushing `main` deploys to production.** Don't push unless asked. The extension is **not**
  auto-published — Chrome Web Store uploads are manual.

## Current state (2026-06-28)
- Branch `main`. **Several commits are local-only (NOT pushed)** — recent web validation, the
  admin planning docs, and this cleanup. `git log --oneline origin/main..HEAD` shows them.
  Pushing triggers a deploy; the user decides when.
- Everything through the rate-limit fix + Terms/cookie-consent/password-reset is **live**.
- Two throwaway prod accounts (`verifyfix…@example.com`, inactive) exist from earlier signup
  testing — harmless.

---

## ▶️ KICKSTART — Phase 9.A0: security gate (default-admin seed)

**Do this first; the whole admin side is gated behind it.** Full context: `ADMIN-PLAN.md`.

**The problem.** `api/.../config/liquibase/data/user.csv` + `user_authority.csv` are loaded by
the **initial changeset (`00000000000001`) which has no Liquibase `context`**, so the default
**`admin` / `admin`** account — with JHipster's *publicly known* bcrypt hash — is present in
**production**. That's an open door under any admin UI.

**Note the Liquibase subtlety:** changing the historical changeset's context does NOT remove
rows already loaded in prod (Liquibase won't re-run it). So this needs **two moves**:

1. **New migration** (additive changelog, like the others on `/api`) that, in prod, removes
   the risk: delete the default `admin` + `user` rows **or** deactivate + rotate them. Make it
   idempotent/safe on a fresh DB.
2. **Stop fresh installs from re-seeding prod**: gate the original seed `loadData` to
   `dev`/`faker` context (safe for new DBs; prod cleanup is handled by move #1).
3. **Bootstrap a real admin from env** (no secret in the repo): an `ApplicationRunner`/config
   that creates-or-promotes an admin from `ADMIN_EMAIL` + `ADMIN_PASSWORD_HASH` (a bcrypt hash
   supplied via env), or equivalent. Document the env vars in `DEPLOY.md` + `.env.example`.

**Acceptance criteria.**
- `admin` / `admin` can no longer authenticate against prod.
- A fresh DB does not seed the default admin/user into a prod profile.
- A real admin exists, sourced from env — **no password or hash committed**.
- `DEPLOY.md` + `.env.example` document the new env vars.
- Backend compiles on JDK 17; new logic has a test; CI green (ITs run there).

**Verify.** After deploy, confirm `POST /api/authenticate {admin/admin}` → 401, and the real
admin signs in. (Locally you can only compile + unit-test; the DB-backed check is CI/prod.)

**Commit.** `phase9.A0: <subject>`, one task = one commit. Don't push unless asked.

## After A0
**9.A1** — admin gate + shell + Users (reuse `/api/admin/users`) + audit-log foundation.
Then A2→A5 (AI/sessions/ops · analytics · **email subscription** · **bug reports**). The
ordered checklist is the **Phase 9** section of `PROGRESS.md`; the design + legalities are in
`ADMIN-PLAN.md`. Decisions already locked: PII = metadata + reason-gated; admin lives in an
in-app `/admin` route group.

# CLAUDE.md — Working rules for this repo

Claude Code reads this automatically every session. Keep it short.

## What this is
Dossier: MV3 browser extension (vanilla JS, no build step, everything on
`window.JAF`) that autofills job applications. Being productized into extension +
Spring Boot API + Next.js web app. Spec: `ROADMAP.md`. Task tracker: `PROGRESS.md`.
Admin-side plan: `ADMIN-PLAN.md`. Starting a new chat? Read `HANDOFF.md` first.

## The loop (do this every session)
1. Read `PROGRESS.md` → find **Current focus**.
2. Read ONLY the matching phase section of `ROADMAP.md` (not the whole file).
3. Do that one task. Stop when it's done — do NOT start the next task.
4. Update `PROGRESS.md`: check the box, move **Current focus** to the next task,
   add one line under **Log**.
5. **Commit and push this one task on its own.** One task = one commit = one push.
   Never batch multiple tasks into a commit. Message: `phase<P>.<N>: <subject>`
   (e.g. `phase0.1: local field-choice cache`). Then `git push`.

## Hard rules
- **No auto-submit, ever.** No CAPTCHA bypass. Legitimate use only.
- **Capture real ATS DOM before writing selectors.** Never guess tenant markup —
  it's the #1 failure mode. Use real `data-automation-id`s / option text.
- Extension code: vanilla JS on `window.JAF`, no build step, no new deps without asking.
- Server is the source of truth; the extension's local store is a **read-only mirror**
  (pull-only for autofill — edits happen on the web; only resume *creates* push back).
- Never commit secrets. API keys via env only; never ship a key in the extension bundle.

## Commands
- Extension tests: `cd job-autofill && npm test` (must be green before done).
- Backend (once it exists): `cd api && ./gradlew test`.
- Web (once it exists): `cd web && npm test`.

## Version-bump ritual (extension changes)
Bump `job-autofill/manifest.json` + `package.json`. If rules change, bump the
`version` in `src/config/rules.js` too (the smoke test asserts it).

## Layout (target monorepo)
`/job-autofill` extension · `/api` Spring Boot · `/web` Next.js · `/brand` source logo/ATS
art (originals only — served copies live in `web/public` + `job-autofill/icons`; see
`brand/README.md`) · root: ROADMAP/PROGRESS/ADMIN-PLAN/HANDOFF/CLAUDE.
When working in `job-autofill/`, read `job-autofill/ARCHITECTURE.md` for the file map.

## Locked decisions (persist across sessions — don't re-litigate)
- **DB = MySQL** (managed: Railway/Aiven; RDS/Aurora later). `dossier.jdl` is now
  documentation; schema changes are additive Liquibase migrations on `/api`.
- **Swappable backend:** all extension→backend calls go through the one
  `TrackingProvider` seam (`job-autofill/src/lib/tracking.js`); canonical DTOs only.
- **Client split:** web app = primary product (account, resumes, bio, board);
  extension = on-page agent (autofill, capture, submit-detect, save-a-job).
- **One account, web-connect auth:** the extension has **no separate login or
  profile/resume management** — those live on kiwiply.com. Sign-in is a single web
  sign-in; the web `/connect` page mints a separate extension token pair
  (`POST /api/extension/session` ← `web /api/extension/token`) and hands it over via
  `externally_connectable`. The extension's options page is **slim** (device settings +
  account status only). Don't reintroduce in-extension bio/resume editing.
- **Hosting = long-running containers, no serverless.** Web = Next `next start`
  (`output: 'standalone'`), **no Express**. API = Spring embedded Tomcat container.
  Resume upload = **Option A (Next-proxied), permanent**; Option B (presigned) is a
  serverless-only fallback. Vercel allowed, not assumed.
- **Pre-launch gate (1.11):** multi-tenant leak fix + basic GDPR/CCPA account/data
  deletion + basic refresh-token rotation/revocation. Fuller SSO/multi-tenancy/audit
  = Phase 8.
- **Deployed LIVE** on a self-managed **IONOS VPS** (Docker Compose + Caddy + **AWS S3**, not
  R2). Domain **kiwiply.com** (Cloudflare DNS, grey-cloud; apex canonical, www/app 301 to it;
  API at api.kiwiply.com). **CI/CD auto-deploys on merge to `main`** (build → GHCR → VPS pull).
  Deploy/ops in `DEPLOY.md`; URLs + gotchas in the `live-deployment` memory. Targets this VPS,
  not a PaaS.
- **Email verification is LIVE** (Brevo SMTP, sends from **no-reply@kiwiply.com**; domain
  authenticated). Signups self-activate via the emailed link → web `/account/activate`.
  **Still no auto-activate** — verification is the gate, kept that way by decision.

## Definition of done (every task)
Acceptance criteria met · tests added & green · PROGRESS.md updated · versions
bumped if extension changed · **committed and pushed as its own commit** (one task
per commit, see loop step 5). If blocked or going off-spec, stop and ask — don't improvise.

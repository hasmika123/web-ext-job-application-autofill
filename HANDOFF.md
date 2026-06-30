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

## Current state (2026-06-30)
- **Phase 9 (admin console/ops/comms) + all post-9 follow-ups are DONE and LIVE** on `main`/prod
  (admin console, analytics, email subscription + Brevo sync, bug reports, DSAR, admin MFA, per-
  application resume attachment + PDF preview, on-the-fly resume upload, etc.).
- **Extension reaches users only via a manual Chrome Web Store upload** — currently **unshipped**:
  ext **v0.28.0** + the connection-gate fix are on `main` but not yet uploaded to the CWS.
- **Active build-out: migrating the extension to a real UI platform (WXT/Vite).** Branch
  **`feat/extension-redesign`** (off `main`). Plan + task tracker: **`EXT-UI-PLATFORM-PLAN.md`**
  (phases W0–W6, incl. W5 UI overhaul). This **introduces a build step (WXT/Vite) for the
  extension** — intentionally superseding the old "no build step" rule *for the extension UI*; the
  autofill **engine stays as imported modules**. Goal: one shared React `ResumeUpload` form across
  web + extension, rendered in a side panel; then Simplify-scale UI.
- **Done so far:** `w0.1` — WXT installed (`wxt@^0.20.27`) + `job-autofill/.npmrc` shell fix, committed.
- **Branches:** `main` + `feat/extension-redesign` only (others cleaned up).

---

## ▶️ KICKSTART — W0.2 (WXT migration: config + entrypoints → parity)

Work on branch **`feat/extension-redesign`**. Full task list: **`EXT-UI-PLATFORM-PLAN.md`** (W0.2–W0.6).

**Goal of W0:** WXT builds the *current* extension with **no behavior change** (parity) before any
UI is rewritten — engine modules stay; WXT owns build + manifest + entrypoints.

**W0.2 steps:**
1. `job-autofill/wxt.config.ts` mirroring `job-autofill/manifest.json` exactly — `key`,
   `permissions`, `host_permissions`, `externally_connectable`, `content_scripts`,
   `web_accessible_resources`, `browser_specific_settings`, `action`/`options_page`, `icons`.
2. Create WXT `entrypoints/` and relocate popup/options/background/content — **start as plain
   HTML/JS (no React yet)**; React + the shared form come in W1/W3.
3. Confirm the `src/lib/*` IIFE engine modules import cleanly under Vite (side-effect imports
   attach to `globalThis.JAF`); keep `cd job-autofill && npm test` green.
4. Build + load unpacked; verify **parity**: autofill, save-a-job, options, connect handoff,
   bug report, on-the-fly upload.

**Watch-outs:** Node is v20 (WXT prefers v22 — sub-dep warning only, should build); **preserve the
manifest `key`** so the extension ID stays stable (keeps `/connect` handoff working); MV3 forbids
remote code (WXT bundles — fine); commit the build artifact per the plan; **don't push `main`**
(deploys); the extension ships via **manual CWS upload**.

**Commit convention:** `w0.x: <subject>`, one task = one commit, on `feat/extension-redesign`.

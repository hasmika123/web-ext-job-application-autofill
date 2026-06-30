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
- **Done so far:** `w0.1` — WXT installed (`wxt@^0.20.27`) + `.npmrc` shell fix. `w0.2` — **WXT now builds the
  whole extension at parity** (full W0 push): `wxt.config.ts` mirrors the manifest (key preserved → stable ID);
  `entrypoints/` for background/content/popup/options/review (engine imported as-is, no React yet); `vendor/`+`icons/`
  → `public/`; `wxt build` green; extension tests green (14); build output (`.output/`) gitignored (CI rebuilds + zips).
- **Branches:** `main` + `feat/extension-redesign` only (others cleaned up).

---

## ▶️ KICKSTART — W1 (shared UI package: React + Tailwind)

Work on branch **`feat/extension-redesign`**. Full task list: **`EXT-UI-PLATFORM-PLAN.md`** (W1.1–W1.4).

**W0 is DONE** — WXT builds the whole extension at **parity** (config + all entrypoints; engine imported
as-is; `wxt build` green; tests green; artifact committed). One manual gate remains before trusting W0
end-to-end (do this once, in Chrome): **load `job-autofill/.output/chrome-mv3` unpacked and walk parity** —
autofill on a real ATS, save-a-job, options/settings, the kiwiply.com `/connect` handoff, bug report, and the
on-the-fly resume upload (popup → review page → save / fill-&-attach). If anything regresses, it's almost
certainly a runtime-path issue (`executeScript` now injects `content-scripts/content.js`; `getURL` now points at
`options.html`/`review.html`; `vendor/`+`icons/` moved to `public/`).

**Then start W1 (shared UI package):** create `packages/ui` (workspace) with shared Tailwind tokens; make the
web app's `ResumeUpload` portable (inject `onSave`/`onCancel`/`track` — drop `next/*` + direct `fetch`); move it
+ primitives + `parser-core` types into `packages/ui`; wire both web (Next) and the WXT extension to consume it.
**Zero web behavior change.** See `EXT-UI-PLATFORM-PLAN.md` Phase W1.

**How to build/run the extension now:** `cd job-autofill && npm run dev` (WXT dev server, HMR) or
`npm run build` (→ `.output/chrome-mv3`). `npm test` still runs the engine suite. WXT prefers Node 22 but
v20.19.5 builds fine (above the >=20.12 floor).

**Watch-outs:** **preserve the manifest `key`** (already in `wxt.config.ts` — keeps the stable ext ID + `/connect`
handoff); MV3 forbids remote code (WXT bundles — fine); the build output (`.output/`) is **gitignored** — run
`npm run build` to load unpacked; CI rebuilds + zips (artifact decision revised — see the plan's Risks);
**don't push `main`** (deploys); the extension ships via **manual CWS upload** (W6.4), not auto-published.

**Commit convention:** `w<phase>.<n>: <subject>`, one task = one commit, on `feat/extension-redesign`.

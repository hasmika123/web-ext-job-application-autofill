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

## ▶️ KICKSTART — W3 (extension side panel renders the shared form)

Work on branch **`feat/extension-redesign`** (W0–W2 are **merged to `main` + LIVE**; the branch continues for W3+).
Full task list: **`EXT-UI-PLATFORM-PLAN.md`** (W3.1–W3.5).

**W2 is DONE + DEPLOYED.** `@kiwiply/ui` holds the portable `ResumeUpload` (services injected: `parseFile`/`onSave`/
`onUpdateProfile`/`track`/`toast`/`onRefresh`); the web app consumes it and is live (verified). CI has a
`web-docker` build+smoke job. The extension build is WXT (`job-autofill/`, entrypoints + `.output/chrome-mv3`).

**W3.1 is DONE** — `entrypoints/sidepanel/` is a React + Tailwind v4 surface; WXT auto-wired `side_panel` +
the `sidePanel` permission. `job-autofill/` is now a **workspace member** (`@wxt-dev/module-react` + react 19 +
`@tailwindcss/vite`); the panel imports `@kiwiply/ui/styles/tokens.css` and the tokens compile in (verified). The
body is a placeholder. Membership ripple is handled (web Dockerfile copies `job-autofill/package.json`; ext CI +
publish install workspace-root; `job-autofill/package-lock.json` removed). Build to load unpacked:
`cd job-autofill && npm run build` then load `.output/chrome-mv3`; the side panel opens via the toolbar/`chrome.sidePanel`.

**Next — W3 (the extension finally renders the shared React form):**
1. ✅ **W3.1** done (React sidepanel + sidePanel perm + workspace membership).
2. ✅ **W3.2** done — the side panel mounts the shared `<ResumeUpload>`. `sidepanel/`: `engine.ts` loads the
   JAF engine into the panel; `App.tsx` reads the handoff (`chrome.storage.local["pendingResumeReview"]` +
   IndexedDB temp file) and mounts the form; `panel.ts` provides `parseFile` (→ `JAF.parser`) + `onSave` (**save**
   flow). Extension `tsconfig.json` + `@types/chrome` + a `typecheck` CI gate added. Attach mode is stubbed.
3. ✅ **W3.3** done — `onSave`'s **attach** branch ported from `review.js` `attachAndFill` into `panel.ts`
   (capture → `pushDraft` → `uploadApplicationAttachment` → fill the job tab → focus). Both save + attach work.
4. ✅ **W3.4** done — popup `openReview` opens the side panel (`chrome.sidePanel.open` sync in the gesture,
   `activeTabId` pre-fetched) + writes the handoff; panel handles the race/re-upload via `storage.onChanged`.
   Dropped the popup pre-parse/pre-auth; **removed the vanilla review tab** (`entrypoints/review/`, `src/review/`).
5. **W3.5 (NEXT)** Polish the panel states (loading/empty/**error**/cancel) + close-on-done, then the **manual
   walkthrough in Chrome** (the panel is reachable now): `cd job-autofill && npm run build`, load
   `.output/chrome-mv3`, and on a real ATS use popup → **+ Upload a resume** → **Parse & add to list** (save mode:
   panel opens, parses, review, Save → resume appears in the picker) and **Parse, don't add to list** (attach mode:
   fills the job tab + attaches the PDF). Watch for: side-panel open needing a user gesture; the handoff race
   (should be covered); `window.close()` behavior in a side panel (the "done" view is the fallback).

**Possible W3.5 polish:** a toast/status surface (the form currently has no `toast` service wired → silent
success), and mode-aware copy (the shared Save button says "Save to my account" even in attach mode — a known
wrinkle to revisit in the W5 UI overhaul).
3. **W3.3** Extension `onSave` (logic from `src/review/review.js`): **save** → `createResume`+`uploadResumeFile`+pull;
   **attach** → capture→`pushDraft`→`uploadApplicationAttachment`→fill `jobTabId`. `parseFile` → the extension's
   `parser.js`. `onUpdateProfile` omitted (no in-app bio → contact panel hidden).
4. **W3.4** Popup upload options call `chrome.sidePanel.open({tabId})` + handoff; remove the vanilla `src/review/*`.
5. **W3.5** Loading/empty/error/cancel; verify both modes unpacked.

Keep web green (it's live). One W0 manual gate still open: load `job-autofill/.output/chrome-mv3` unpacked and walk
parity (autofill/save-a-job/options/`/connect`/bug/on-the-fly upload).

*(Prior W2.2 deploy gate — now satisfied — kept below for reference.)*

**W0/W1 DONE.** The shared form now lives in `@kiwiply/ui` and **web consumes it**: `ResumeUpload` moved into
`packages/ui/src` (self-contained primitives + `parser-core` types; parsing is the injected `parseFile` service).
`web/` is a workspace member (`workspaces: ["packages/*","web"]`); `next.config` has `transpilePackages:["@kiwiply/ui"]`
+ Turbopack/tracing rooted at the **repo root** (standalone output is monorepo-NESTED — the Dockerfile handles it);
`globals.css` has an `@source` for the package. Web **Dockerfile + CI** are workspace-aware (root `npm ci`, build
`-w web`) and a new CI **`web-docker`** job builds the image as a smoke test. Web `tsc`+`eslint`+`next build` green;
extension untouched.

**Next — W2.2 (verify + deploy gate):**
1. **Confirm CI is green on this branch** — especially the new **`web-docker`** job (the Docker image build is the
   one thing NOT testable locally; no Docker on the dev box). If it fails, it's almost certainly a nested-standalone
   path in `web/Dockerfile` (server is at `.next/standalone/web/server.js`; static → `web/.next/static`).
2. **Visual/behavior parity** of the resume upload+review form on `/resumes` (and the Add-application dialog on
   `/board`). It's auth-gated → needs the stack up (web + API + a signed-in user). It's a pure refactor (zero
   intended change); confirm the drop-zone, parse, review editor, skill chips, drag-reorder, and save all look/work
   the same.
3. **Merge the web change → it deploys** (CI/CD on merge to `main`). This is the W2 deploy gate.

Then **W3** (extension side panel renders the shared form) — that's where the **WXT half** of W1.4 happens
(job-autofill joins the workspace + imports `@kiwiply/ui`).

Still open from W0 (do once, in Chrome): **load `job-autofill/.output/chrome-mv3` unpacked and walk parity**
(autofill, save-a-job, options, `/connect`, bug report, on-the-fly upload). `.output/` is gitignored — `npm run
build` in `job-autofill/` to regenerate.

**How to build/run the extension now:** `cd job-autofill && npm run dev` (WXT dev server, HMR) or
`npm run build` (→ `.output/chrome-mv3`). `npm test` still runs the engine suite. WXT prefers Node 22 but
v20.19.5 builds fine (above the >=20.12 floor).

**Watch-outs:** **preserve the manifest `key`** (already in `wxt.config.ts` — keeps the stable ext ID + `/connect`
handoff); MV3 forbids remote code (WXT bundles — fine); the build output (`.output/`) is **gitignored** — run
`npm run build` to load unpacked; CI rebuilds + zips (artifact decision revised — see the plan's Risks);
**don't push `main`** (deploys); the extension ships via **manual CWS upload** (W6.4), not auto-published.

**Commit convention:** `w<phase>.<n>: <subject>`, one task = one commit, on `feat/extension-redesign`.

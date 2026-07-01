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

## ▶️ KICKSTART — W3 is CODE-COMPLETE → manual walkthrough, then W4

Work on branch **`feat/extension-redesign`** (W0–W2 are **merged to `main` + LIVE**; the branch continues for W3+,
accumulating on open **PR #22**). Full task list: **`EXT-UI-PLATFORM-PLAN.md`**.

**W2 DONE + DEPLOYED.** `@kiwiply/ui` holds the portable `ResumeUpload`; the web app consumes it and is live.
**W3 DONE (code).** The extension renders the SHARED React form in a Chrome **side panel** for BOTH on-the-fly
upload modes (save a library resume / attach-and-fill a job page). `job-autofill/` is a workspace member;
`entrypoints/sidepanel/` = React + Tailwind v4 (`engine.ts` loads `window.JAF`; `App.tsx` reads the popup handoff
+ owns the loading/empty/error/ready/done states; `panel.ts` = the extension services `parseFile`/`onSave`
save+attach). Popup opens the panel (`chrome.sidePanel.open`, gesture-safe) + hands off; the old `review.html` tab
is gone. Extension has a `typecheck` CI gate. All CI green on PR #22.

**▶️ IMMEDIATE GATE — the manual walkthrough (only you can do this; the panel needs a real Chrome):**
`cd job-autofill && npm run build`, load `job-autofill/.output/chrome-mv3` unpacked. On a real ATS: popup →
**+ Upload a resume** →
- **Parse & add to resumes list** (save): the side panel opens, parses, shows the review editor; **Save** → the
  resume appears in the popup picker.
- **Parse, don't add to list** (attach): fills the job page (review overlay) + attaches the PDF to the application.
Watch: the panel opening on click (gesture); the handoff landing (race handling); `window.close()` on done (the
"done" view is the fallback). Also re-confirm the W0 parity items (autofill / save-a-job / `/connect` / bug report).

**Then — pick the next phase (`EXT-UI-PLATFORM-PLAN.md`):**
- ✅ **W4 DONE** — popup + options + sidepanel are ALL React now (`entrypoints/*`: each = `index.html` + `main.tsx`
  → `engine.ts` (`window.JAF`) + `*App.tsx` (UI) + `actions.ts` (engine logic) + Tailwind `style.css`). `src/` is
  now **engine-only** (background/config/content/lib). The engine stays framework-free.
- **W5 (IN PROGRESS)** — the **UI overhaul** (`EXT-UI-PLATFORM-PLAN.md` W5.1–W5.7).
  - ✅ **W5.1 DONE** — `packages/ui` is now a real **design system**: tokens **light + dark** (dark is opt-in via
    `.dark`/`[data-theme=dark]`; `@theme inline` flips every utility automatically) and now the **single source**
    (web's `globals.css` imports the package tokens — no more inline dup; `next build` green). Full primitive set added
    (dependency-free, on the shared tokens): Button, Input, Select, Field, Card, Badge, Tabs, **Toast** (`ToastProvider`
    +`useToast` — the surface W3 deferred), Skeleton, Spinner, EmptyState, Dialog (focus trap), SidePanel shell,
    Tooltip, Menu. No surface consumes them yet (bundle tree-shakes them) → no version bump.
  - ✅ **W5.2 DONE** — the **popup** is redesigned on the system (`entrypoints/popup/PopupApp.tsx`): logo + Manage +
    gear header, `Field`+`Select` resume picker with meta `Badge`s, upload entry, an auto-advance **toggle switch**,
    accent/ghost `Button` actions with a `Spinner`, tokened status line + trust footer. Engine (`actions.ts`) untouched;
    fills edge-to-edge on `--paper` (dark-ready). No version bump (single ship bump at W6.4).
  - ✅ **W5.3 DONE** — the **options** page is redesigned (`entrypoints/options/OptionsApp.tsx`): a sticky sectioned
    **nav rail** beside `Card` sections, all controls unified (shared **`Switch`**, `Field`+`Input`, `Select`, `Button`,
    account `Badge`). Added the shared `Switch` primitive and retrofit the popup toggle to it. `#bug` deep-link + single
    Save preserved; `actions.ts` untouched.
  - ✅ **W5.4 DONE** — the **side-panel review** is polished and **both W3 wrinkles are closed**: the shared
    `ResumeUpload` got optional `saveLabel`/`savedToast` props → mode-aware copy (attach vs save); the side panel is
    wrapped in `ToastProvider` with a wired `toast` service (success no longer silent); panel states rebuilt on
    `EmptyState`/`Spinner`. The **injected on-page overlay** (`src/content/filler.js`, Shadow-DOM) got a token
    consistency fix only — a deeper on-page restyle needs a real ATS (do it during visual QA). Web unaffected.
  - **W5.5 (NEXT)** — state + interaction polish across all surfaces (loading/empty/error/success states, focus
    management, keyboard nav, transitions/micro-interactions, toasts). Then W5.6 a11y + wire **dark mode** across
    surfaces, W5.7 visual QA vs the web app (before/after screenshots in the PR).
  - Two wrinkles to close while redesigning: wire the new **Toast** into the side panel (success is currently silent →
    the "done" view covers it) + make the shared Save button copy mode-aware (reads "Save to my account" in attach mode).
- **Merge/ship:** PR #22 is open (accumulating W3+). Merging → deploys a web image rebuild (no web behavior change)
  + lands the extension changes in `main` (still unshipped — CWS upload is manual, W6.4). Reasonable to merge once
  the walkthrough passes, or to keep accumulating W5.
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

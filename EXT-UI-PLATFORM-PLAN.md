# EXT-UI-PLATFORM-PLAN.md — Extension UI platform (WXT) + shared review form

> **Branch:** `feat/shared-review-form` (all work for this build-out lives here).
> **Commit convention:** `w<phase>.<n>: <subject>` (e.g. `w0.2: WXT background entrypoint wraps the service worker`).
> One task ≈ one commit. PR per phase → CI → merge. Web phases deploy to prod; extension phases
> ride the eventual Chrome Web Store upload.
> Supersedes the narrower `SHARED-FORM-PLAN.md`. Companion to `ROADMAP.md` / `ADMIN-PLAN.md` / `PROGRESS.md`.

## Goal
Stand up a real **extension UI platform** so we can build rich UI at **Simplify scale and beyond**
— popup, options, side panel, injected on-page panels, shared state, all React + Tailwind and
**sharing components with the web app**. The first concrete payoff is **one shared resume-review
form** rendered in a right-side **Chrome Side Panel**; everything after builds on the same base.

## Strategy
Adopt **WXT** (Vite-based extension framework) as the build/UI foundation. **Keep the autofill
engine** — ATS adapters, `parser-core`, `schema`, `tracking`, `sync`, `job-capture`,
`app-tracking`, `field-cache`, content scripts, `rules` — **as imported modules** (they're good and
well-tested). WXT takes over the **build, manifest generation, and UI entrypoints**; UI converts to
React **incrementally**, starting with the new side panel — the existing popup/options keep working
throughout.

### Why WXT
Vite under the hood (aligns with the web's React/Tailwind stack → shared components drop in), file-based
entrypoints, **manifest generation**, **content-script UI with shadow-DOM** (how Simplify/Honey inject
panels), HMR, and **Chrome + Firefox from one codebase** (so the deferred Firefox parity becomes cheap).

## Decisions (2026-06-30, user-confirmed)
- **Framework = WXT** (Vite). Bundler-under-hood is Vite/esbuild; not hand-rolled.
- **Migration = engine stays, UI/build migrate** — incremental; engine modules imported, not rewritten.
- **Firefox = deferred** but near-free later via WXT's cross-browser build.
- **Shared UI = monorepo package** consumed by both web (Next) and the WXT extension.

## Architecture (target)
```
            ┌──────────────  packages/ui (or shared/)  ──────────────┐
            │  ResumeUpload + UI primitives + parser-core types       │  ← shared React + Tailwind
            └───────┬─────────────────────────────────────┬──────────┘
        web (Next)  │                                      │  extension (WXT / Vite)
                    ▼                                      ▼
   Resumes page + Add-app review            entrypoints/: popup · options · sidepanel · background · content
   onSave → /api/resumes/upload             sidepanel mounts <ResumeUpload onSave=…>
                                            engine modules (adapters/parser/tracking/sync) imported as-is
```
The form is **persistence-agnostic**: it emits `onSave(result)`. Web wires it to the upload route;
the extension wires it to `createResume`/`uploadResumeFile` or capture→`pushDraft`→`uploadApplicationAttachment`→fill.

## Locked-decision change (intentional)
The extension adopts a **build step / framework (WXT)**. The autofill **engine stays modular**; the
*build, manifest, and UI* are framework-managed. `CLAUDE.md` + `ARCHITECTURE.md` updated in W0.6 / W5.

---

## Phase W0 — Adopt WXT, port existing entrypoints **as-is** (lowest-risk foundation)
> WXT builds the *current* extension with **no behavior change** — popup/options/background/content
> all work unchanged, just relocated into WXT's structure with the manifest generated from config.
- [x] **W0.1** Add WXT to `job-autofill` (dev dep) + `wxt.config.ts` reproducing `manifest.json` (key, permissions, host_permissions, externally_connectable, content_scripts, icons, action, options→`options_ui{open_in_tab:true}`, web_accessible_resources, browser_specific_settings). *Toolchain landed in the prior `w0.1` commit; the config landed here in `w0.2`.*
- [x] **W0.2** `entrypoints/background.ts` — `defineBackground` wrapping `src/background/service-worker.js`; `importScripts` → ES side-effect imports of tracking/sync/app-tracking/analytics (bundled into one `background.js`). Logic unchanged.
- [x] **W0.3** `entrypoints/content.ts` — `defineContentScript` registering the existing bundle (rules→content-script, 18 files) in the SAME order, with the same matches / `all_frames` / `run_at`. Output: `content-scripts/content.js`.
- [x] **W0.4** `entrypoints/{popup,options,review}/` — plain HTML/JS entrypoints reusing the current popup/options/review files verbatim (no React yet); each `index.html` loads a `main.js` that side-effect-imports the libs in order, then the page script. `review` is an unlisted page (`getURL("review.html")`).
- [x] **W0.5** Engine modules importable under Vite confirmed (IIFEs self-attach to `globalThis`/`window` `.JAF` via side-effect imports); `cd job-autofill && npm test` stays **green (14 suites)**. Engine files untouched except removing the SW `importScripts` line (now done by the entrypoint).
- [x] **W0.6** `wxt build` produces a parity manifest + `.output/chrome-mv3` (gitignored — derivable from source; CI rebuilds + zips). Runtime-path fixes: popup/review `executeScript` → the bundled `content-scripts/content.js`; `getURL` → `options.html`/`review.html`; `vendor/` + `icons/` → `public/` (WAR-listed). `CLAUDE.md`/`ARCHITECTURE.md` updated. **Load-unpacked walkthrough (autofill/save-a-job/connect/bug/on-the-fly upload) is the one manual gate left — needs Chrome.**

## Phase W1 — Shared UI package (React + Tailwind)
> One source for the form + primitives, consumed by web and extension.
- [x] **W1.1** Create `packages/ui` (workspace) + the shared design tokens. **npm workspaces** at the repo root (`workspaces: ["packages/*"]`); `@kiwiply/ui` holds `styles/tokens.css` — the canonical brand palette + shape/elevation + Tailwind v4 `@theme inline` mapping, byte-identical to web's current inline tokens (zero-visual-change adoption). **Kept additive:** `web/` + `job-autofill/` are deliberately NOT workspace members yet (they still `npm ci` in isolation from their own lockfiles — verified `npm prefix`/`ci --dry-run` unchanged — so the LIVE web Docker/CI build is untouched). They join the workspace, consume the tokens, and get their Docker/CI install changes in **W1.4**. Root `package-lock.json` committed; root `node_modules/` gitignored.
- [x] **W1.2** Made `ResumeUpload` portable **in place** (still in `web/`). Injected a `ResumeUploadServices` prop set — `onSave(SaveInput)→SaveResult` (create/edit), optional `onUpdateProfile`, `track`, `toast`, `onRefresh` — and removed `useRouter` (`next/navigation`), the `track` import, `useToast`, and all three direct `fetch` calls; the component now owns only UX/flow. The exact web wiring (Next route handlers, GA4 `track`, toast, `router.refresh`) lives in a new `web/src/lib/use-resume-upload-services.ts` hook that both callers (`ResumesWorkspace`, `ApplicationBoard`'s `AddApplicationDialog`) spread. The "Detected contact"/base-profile panel is gated on `onUpdateProfile` (web passes it → unchanged; extension omits → hidden). **Zero web behavior change** — `tsc`+`eslint`+`next build` all green. No `next/image` was present. (Primitives/`parser-core`/`validate`/`cn` stay `@/` imports — they relocate in W1.3.)
- [ ] **W1.3** Move `ResumeUpload` + sub-parts + needed UI primitives + `parser-core` types into `packages/ui`.
- [ ] **W1.4** Wire WXT + web to consume `packages/ui` (Vite/Next both resolve the workspace package).

## Phase W2 — Web consumes the shared package (parity, **deploys**)
- [ ] **W2.1** `ResumesWorkspace` + Add-application review import `ResumeUpload` from `packages/ui`; wire web `onSave`/services.
- [ ] **W2.2** `npm test` + `npm run build` green; visual/behavior parity verified in preview. **(Web PR → deploy.)**

## Phase W3 — Extension side panel renders the shared form
> The on-the-fly upload opens a native right-side panel with the **real** form (React, in WXT).
- [ ] **W3.1** `entrypoints/sidepanel` (React) + `sidePanel` permission/config in `wxt.config.ts`.
- [ ] **W3.2** Side panel reads the handoff (parsed structure + file + `mode` + `jobTabId`) and mounts `<ResumeUpload initial mode onSave onCancel>`.
- [ ] **W3.3** Extension `onSave` (logic from `review.js`): **save** → `createResume` + `uploadResumeFile` + mirror pull; **attach** → capture → `pushDraft` → `uploadApplicationAttachment` → fill `jobTabId` → focus.
- [ ] **W3.4** Popup: both upload options `chrome.sidePanel.open({tabId})` + handoff. Remove `src/review/*` (the vanilla tab).
- [ ] **W3.5** Loading/empty/error/cancel states; close panel on done. Verify both modes unpacked.

## Phase W4 — Convert popup + options to React
> The functional port to React (so the visual overhaul in W5 has React surfaces to polish).
- [ ] **W4.1** Convert `popup` to React (resume picker, fill flow, upload choice) using shared primitives.
- [ ] **W4.2** Convert `options` to React (settings, account, bug report).
- [ ] **W4.3** (Future UI *features* slot in here as their own `w4.x` tasks; visual polish lives in W5.)

## Phase W5 — UI overhaul & design polish (Simplify-scale)
> Lift every extension surface to a polished, cohesive, Simplify-scale standard on the **shared
> design system**. Builds on the React conversion (W4) + `packages/ui` (W1). This is the "improve UI"
> track — visual/UX quality, not new plumbing.
- [ ] **W5.1** Grow `packages/ui` into a real **design system**: tokens (color/spacing/type/radius/shadow, light **+ dark**) shared with the web, and shared primitives (Button, Input, Select, Field, Card, Badge, Tabs, Toast, Skeleton, EmptyState, Dialog, SidePanel shell, Tooltip, Menu). One source for web + extension.
- [ ] **W5.2** Redesign the **popup** into a polished home surface — clear hierarchy, resume picker, primary actions, status, upload entry — tuned to the fixed popup width.
- [ ] **W5.3** Redesign the **options/settings** app — sectioned nav, account, AI, filling, bug report — with consistent cards/controls.
- [ ] **W5.4** Polish the **side-panel review** (shared form) and the **injected on-page autofill panel** for visual consistency with the web app.
- [ ] **W5.5** State + interaction polish across all surfaces: loading/empty/error/success states, focus management, keyboard nav, transitions/micro-interactions, toasts.
- [ ] **W5.6** **Accessibility** pass (roles, labels, contrast, focus traps) and **dark-mode** support across surfaces.
- [ ] **W5.7** Visual QA against the web app for cohesion; before/after screenshots in the PR.

## Phase W6 — Firefox parity, cleanup, docs, ship
- [ ] **W6.1** Firefox build via WXT (sidebar/injected panel for the side-panel surface); test.
- [ ] **W6.2** Remove dead vanilla assets; prune unused CSS.
- [ ] **W6.3** Update `ARCHITECTURE.md`, `PROGRESS.md`, this plan's checkboxes.
- [ ] **W6.4** Bump extension version, full test pass (web + extension), package, **CWS upload**.

---

## Key risks & decisions
- **Engine modules under Vite:** they self-attach to `globalThis.JAF` via IIFEs. Load via side-effect imports; the node test suite is unchanged (files untouched). Validate in W0.5 before going further.
- **Manifest `key`:** preserved in `wxt.config.ts` so the extension ID stays stable (unpacked == published) — keeps the `/connect` handoff + any ID-based config working.
- **MV3 no remote code:** everything is bundled/packaged (WXT/Vite output) — compliant.
- **CWS artifact (decision revised 2026-06-30):** the WXT build output (`.output/`) is **gitignored, not committed** — it's deterministic from source + lockfile, so committing it only adds hashed-chunk churn + `vendor/` duplication. **CI rebuilds and produces the release zip** (`publish-extension.yml`); reproducibility comes from CI artifacts on `ext-v*` tags, not from git. *(Supersedes the earlier sf0.0 "commit artifact" decision, which was sized for the old no-build extension where source == loadable artifact.)*
- **Incremental safety:** W0 ships the *same* extension on WXT (parity) before any UI is rewritten; popup/options stay vanilla until W4.
- **Gate fix in flight:** the connection-gate fix (`5d2342a`) rides this branch; cherry-pick to `main` sooner if you want it in prod before this build lands.
- **Bundle size / Tailwind:** share tokens with web `globals.css`; tree-shake; acceptable for panels.

## Definition of done (build-out)
WXT builds the extension (engine intact, parity verified); `packages/ui` holds one `ResumeUpload` +
a shared **design system** consumed by web + extension; the on-the-fly upload reviews in a right-side
panel using that form (both modes); **every extension surface is overhauled to a polished, cohesive,
Simplify-scale standard (W5) — consistent tokens, dark mode, accessibility**; web parity deployed;
extension shipped via a CWS upload; docs updated. The platform is ready for further Simplify-scale
UI in `entrypoints/` + `packages/ui`.

## Log
- 2026-06-30 · Re-cast from `SHARED-FORM-PLAN.md` to a WXT platform plan (framework = WXT, engine stays). Decisions locked.
- 2026-06-30 · **w0.1** done — WXT installed (`wxt@^0.20.27`) + `job-autofill/.npmrc` shell fix. Next: **W0.2** (`wxt.config.ts` mirroring the manifest + relocate entrypoints → parity).
- 2026-06-30 · **w0.2 (full W0 parity push)** done — `wxt.config.ts` mirrors the manifest exactly (key preserved → stable ext ID); `entrypoints/` for background/content/popup/options/review (engine imported as-is, no React); `vendor/`+`icons/`→`public/`. `wxt build` is green and the generated manifest is at parity (permissions, hosts, externally_connectable, content_scripts→one bundled file, WAR, `options_ui.open_in_tab`). Extension test suite green (14). Build output (`.output/`) gitignored — derivable from source; CI rebuilds + zips (artifact decision revised, see Risks). Engine files untouched (only the SW `importScripts` line moved to the entrypoint; popup/review `executeScript`+`getURL` paths repointed at WXT outputs). **Left:** the manual load-unpacked walkthrough in Chrome, then **W1** (shared UI package). No version bump — build-system change, no shipped behavior change, nothing published (CWS upload stays manual at W6.4).
- 2026-06-30 · **w1.1** done — npm workspaces at the repo root (`workspaces: ["packages/*"]`) + `@kiwiply/ui` with `styles/tokens.css` (canonical brand tokens, byte-identical to web's inline copy). Additive only: web + extension are NOT workspace members yet (verified their isolated `npm ci` is unchanged → live web build untouched); they consume the tokens + join the workspace + get Docker/CI changes in **W1.4**. Next: **W1.2** — make web's `ResumeUpload` portable (inject `onSave`/`onCancel`/`track`; drop `next/*` + direct `fetch`), zero web behavior change.
- 2026-06-30 · **w1.2** done — `ResumeUpload` is now presentational: injected `ResumeUploadServices` (`onSave`/`onUpdateProfile`/`track`/`toast`/`onRefresh`), dropped `useRouter`/`useToast`/`track`-import/3×`fetch`; web wiring centralized in `use-resume-upload-services.ts` and spread by both callers; base-profile panel gated on `onUpdateProfile`. `tsc`+`eslint`+`next build` green; zero web behavior change. Next: **W1.3** — move `ResumeUpload` + sub-parts + the UI primitives it needs + `parser-core` types into `@kiwiply/ui`.

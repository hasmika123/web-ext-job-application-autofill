# SHARED-FORM-PLAN.md — One resume-review form, shared web ⇆ extension

> **Branch:** `feat/shared-review-form` (all work for this build-out lives here).
> **Commit convention:** `sf<phase>.<n>: <subject>` (e.g. `sf1.3: ResumeUpload saves via onSave callback`).
> One task ≈ one commit. PR per phase → CI → merge. Web phases deploy to prod; extension
> phases ride the eventual Chrome Web Store upload.
> Companion to `ROADMAP.md` / `ADMIN-PLAN.md` / `PROGRESS.md`.

## Goal
Make the rich resume parse/review/edit form **one React component** used everywhere — the web
Resumes page, the web Add-application review, and the **extension** (rendered in a right-side
**Chrome Side Panel**). Today the extension hand-codes a separate vanilla form that drifts from
the web one; this unifies them at the **code** level (Approach 2 — bundled shared component),
not via a runtime iframe of the website.

## Why this approach (vs the alternatives)
- **Chosen — bundle a shared React component:** true single source; fast; **offline-capable**;
  no cross-origin / cookie / CSP fragility; native feel; MV3-compliant (packaged, no remote code).
  This is what mature extensions (Grammarly, 1Password, Simplify, Loom) actually do.
- **Rejected — iframe the hosted web app:** fastest to stand up but network-dependent, couples the
  extension to web uptime/deploys, and fights third-party-cookie/CSP rules. An MVP shortcut.
- **Rejected — two hand-written copies / web component rewrite:** duplication that drifts, or a
  large rewrite for little gain since the app is already React.

## Architecture (target)
```
                ┌───────────────  packages/review-form  ───────────────┐
                │  <ResumeUpload initial mode onSave onCancel services> │  ← ONE component
                └───────┬───────────────────────────────────┬──────────┘
        web build (Next)│                                    │ extension build (esbuild bundle)
                        ▼                                    ▼
   web: Resumes page + Add-app review            ext: chrome.sidePanel host page
   onSave → /api/resumes/upload (BFF)            onSave → createResume+uploadResumeFile
                                                  or → capture+pushDraft+uploadApplicationAttachment+fill
```
The form is **dumb about persistence**: it emits a result via `onSave(result)`. Each host wires
`onSave` to its own data layer. No iframe, no postMessage, no cross-origin.

## Locked-decision change (intentional, this build-out)
The extension gains a **scoped build step** for shared UI only (the side-panel form bundle). The
rest of the extension stays vanilla `window.JAF`, no build. `CLAUDE.md` + `ARCHITECTURE.md` updated
in SF0.5 / SF5.2.

---

## Phase SF0 — Toolchain & shared-package foundation
> Stand up the workspace + extension bundler with **no behavior change** yet.
- [ ] **SF0.1** Workspace tooling: npm workspaces at repo root (`web`, `job-autofill`, `packages/*`); scaffold `packages/review-form`.
- [ ] **SF0.2** Extension UI bundler: esbuild config compiling `packages/review-form` → `job-autofill/src/bundled/review-form.{js,css}` (packaged, no remote code → MV3-compliant). Add `npm run build:ext-ui`.
- [ ] **SF0.3** Artifact strategy: build the bundle during extension packaging; decide commit-the-artifact (reproducible CWS zip) vs build-in-CI. **Recommend:** build in CI **and** commit the artifact so the unpacked/dev load needs no build.
- [ ] **SF0.4** CI: add the ext-UI build so a broken shared component fails CI.
- [ ] **SF0.5** Docs: update `CLAUDE.md` locked decision (scoped build step) + `ARCHITECTURE.md`.

## Phase SF1 — Make `ResumeUpload` portable
> Decouple the form from web-only APIs via injected services/props. **Zero web behavior change.**
- [ ] **SF1.1** Audit `ResumeUpload` for web-only deps: `useRouter`, `next/image`, `next/link`, `track` (analytics), `useToast`, direct `fetch("/api/...")`, `@/lib/*`. Produce the list.
- [ ] **SF1.2** Adapter/props contract: `{ initial, mode, onSave(result), onCancel, services?: { track?, toast?, navigate? } }`. Replace direct imports with injected services (defaulted for web).
- [ ] **SF1.3** Save path: component calls `onSave(result)` / `onCancel` instead of POSTing + `router.refresh()` itself.
- [ ] **SF1.4** Replace `next/image` / `next/link` with plain `<img>` / anchor (or tiny adapters).
- [ ] **SF1.5** CSS/tokens: ship compiled CSS with the bundle (Tailwind build scoped to the component, or a token stylesheet); keep `--ink` etc. in sync with web `globals.css`. Verify parity.
- [ ] **SF1.6** Move `ResumeUpload` + sub-parts + shared `parser-core` types + needed UI primitives into `packages/review-form`.

## Phase SF2 — Web consumes the shared package (parity)
> Prove the extraction: the web app uses the shared component everywhere, identical behavior.
- [ ] **SF2.1** `ResumesWorkspace` imports `ResumeUpload` from `packages/review-form`; wire web `onSave`/services.
- [ ] **SF2.2** Add-application embedded review uses the shared component.
- [ ] **SF2.3** `npm test` + `npm run build` green; visual/behavior parity verified in preview. **(Web PR → deploy.)**

## Phase SF3 — Extension Chrome Side Panel renders the bundled form
> On-the-fly upload opens a native right-side panel with the **real** form.
- [ ] **SF3.1** Manifest: add `"sidePanel"` permission + `side_panel.default_path` = `src/sidepanel/sidepanel.html`.
- [ ] **SF3.2** `sidepanel.html` + bootstrap: load the bundle; read the handoff (parsed structure + file + `mode` + `jobTabId`); mount `<ResumeUpload initial mode onSave onCancel services>`.
- [ ] **SF3.3** Extension `onSave` (logic moved out of `review.js`):
  - mode **save** → `createResume` + `uploadResumeFile` + mirror pull.
  - mode **attach** → capture job → `pushDraft` → `uploadApplicationAttachment` → fill `jobTabId` → focus it.
- [ ] **SF3.4** Popup: both options `chrome.sidePanel.open({tabId})` + handoff; remove the new-tab path.
- [ ] **SF3.5** Delete `src/review/review.html` + `review.js` (replaced by the bundled form).
- [ ] **SF3.6** Loading / empty / error / cancel states; close panel on done.

## Phase SF4 — Firefox parity (conditional)
> Firefox has no `chrome.sidePanel`. Manifest targets gecko, so decide scope.
- [ ] **SF4.1** Decide: Firefox in scope now, or defer (log the decision).
- [ ] **SF4.2** If in scope: render the **same bundle** via `sidebar_action` or an injected shadow-DOM panel (content script).
- [ ] **SF4.3** Browser-conditional open logic in the popup.

## Phase SF5 — Cleanup, docs, ship
- [ ] **SF5.1** Remove dead vanilla-form assets; prune now-unused `options.css` resume styles.
- [ ] **SF5.2** Update `ARCHITECTURE.md`, `PROGRESS.md`, and this plan's checkboxes.
- [ ] **SF5.3** Bump extension version (→ **v0.29.0**), full test pass (web + extension), package, **CWS upload**.

---

## Key risks & decisions
- **MV3 "no remote code":** the bundle must be packaged (no CDN/eval). Bundling is compliant — and is *why* iframing the live site was a poor fit.
- **Bundle size:** React + the form in the side panel; tree-shake, acceptable for a panel.
- **CSS strategy:** compiled CSS shipped with the bundle; tokens kept in sync with web `globals.css`.
- **CWS artifact:** the built bundle must be in the packaged zip → build before packaging (CI builds; recommend committing the artifact for reproducible zips + no-build dev loads).
- **Migration safety:** web keeps working at every step — SF2 swaps imports *with parity* before SF3 touches the extension.
- **Gate fix in flight:** the connection-gate fix (`5d2342a`) rides this branch; cherry-pick to `main` sooner if you want it in prod before this build lands.

## Open questions (resolve before SF0)
- **Bundler:** esbuild (tiny, fast, recommended) vs Vite (more features). 
- **Firefox:** in scope now (SF4) or Chrome-first and defer?
- **Artifact:** commit the built bundle, or build-only-in-CI?

## Definition of done (build-out)
One `ResumeUpload` component in `packages/review-form`, consumed by the web app and the extension
side panel; the extension's on-the-fly upload (both options) reviews in a right-side panel using
that form; web parity verified + deployed; extension shipped via a CWS upload; docs updated.

## Log
- 2026-06-30 · Plan created on `feat/shared-review-form` (branched off the gate-fix branch; old branch deleted).

# Kiwiply UI Redesign — Handoff for a fresh Claude Code chat

> **Read this first**, then `redesign/REDESIGN-PLAN.md` (the full spec), then open
> `redesign/mockups.html` in a browser (click every screen; resize to ~360px). This file is the
> on-ramp: what the redesign is, what's already verified, the locked decisions, and the exact first
> task. The branch for this work is **`ui-redesign-phase-0`**.

## 1. What this is (and isn't)
Kiwiply (currently codenamed "Dossier") is a **feature-complete, live** product — MV3 browser
extension + Spring Boot API + Next.js web app, deployed at **kiwiply.com** (Phases 0–7 done; see
root `PROGRESS.md`). This redesign is **presentation only**: it restyles, re-flows, and re-brands
the surfaces that already work. **It must not change backend behavior or the API contract.** Every
redesigned page keeps the existing data/save/delete/status flows working underneath.

The core problem it solves: the **web app (the primary product) is still the unmodified Next.js
starter** — Geist font, black/white, no shared layout, no nav, no brand. The extension already has
an identity. The redesign gives the web app a real identity + app shell and unifies both surfaces
under one brand, **Kiwiply**, with a warm "editorial / kiwi" visual system.

## 2. The redesign package (all in `redesign/`)
- **`REDESIGN-PLAN.md`** — the spec. Phased **R0 → R7**, each task with acceptance criteria written
  to paste into Claude Code. This is the source of truth for *what* to build.
- **`mockups.html`** — a clickable prototype (8 screens: landing, auth, dashboard, profile,
  resumes, board, settings, extension). It carries the **exact CSS to port**: the token block
  (`--accent`, `--ink`, `--paper`, `--line`, `--brown`…) and the component classes (`.btn`,
  `.btn-accent/primary/ghost`, `.card`, `.input`, `.switch`, `.chip`, `.chips`, `.chipinput`,
  `.badge`, `.pill`). Port these 1:1 into Tailwind/components.
- **`logo.svg`** (kiwi mark + green "kiwi" / charcoal "ply" wordmark) + **`logo.png`** raster
  fallback. Already copied to **`web/public/logo.svg`** and **`web/public/logo.png`**.
  `_logo_preview.png` is just a preview thumbnail.

## 3. Verified integration points (checked against the live code — trust these)
The plan's claims were re-verified in this repo; build on them:
- **`web/src/app/globals.css`** is the Geist starter: `--background:#fff / --foreground:#171717` +
  a `@media (prefers-color-scheme: dark)` block. **R0.1 rewrites this entirely** with the kiwi
  tokens and drops the dark media query.
- **Per-page nav headers exist** in `web/src/app/{board,profile,resumes,settings,privacy}/page.tsx`
  (hand-rolled `<header>`/`<nav>` rows). **R1.1 deletes these** in favor of the `(app)` shell.
- **Login redirect:** `web/src/app/login/page.tsx:31` does `router.push("/settings")`. **Change to
  `/dashboard`** (R1.2/R3.1).
- **Cookies:** `web/src/lib/auth.ts:12-13` — `ACCESS_COOKIE="dossier_access"`,
  `REFRESH_COOKIE="dossier_refresh"`. Renamed in R7.1 (see decisions).
- **Extension provider:** `job-autofill/src/lib/tracking.js` exports `createDossierProvider()`
  (used by `job-autofill/src/lib/sync.js:16`). Renamed in R7.1.
- **No backend dependency:** the Next route handlers in `web/src/app/api/**` are the BFF (hold the
  JWT in httpOnly cookies, proxy to Spring). The redesign never needs to touch the Spring API.
  (See REDESIGN-PLAN §10 — keep Spring Boot; do **not** "rewrite the backend in React".)

## 4. Locked decisions (answered by the user for this handoff)
1. **Branch = `ui-redesign-phase-0`** (this branch).
2. **Internal rename = FULL** (REDESIGN-PLAN R7.1): purge user-facing "Dossier" **and** rename code
   identifiers — `createDossierProvider` → `createKiwiplyProvider` (extension: `tracking.js` +
   `sync.js`) and cookies `dossier_access`/`dossier_refresh` → `kiwiply_access`/`kiwiply_refresh`
   (web: `auth.ts` + everywhere they're set/read). Do this as **one coordinated, well-tested
   commit (R7.1)**, not mixed into UI commits. **It forces a one-time re-login** for existing users
   (old-named cookies stop being read). *Scope note:* the cookies live only in the web app
   (`auth.ts` + the auth route handlers); the Spring API authenticates via the `Authorization:
   Bearer` header (no `dossier_*` cookie), and the extension stores tokens in `chrome.storage`
   (its own keys) — so verify with a grep before renaming, but the cookie change is effectively
   web-only and the identifier change is extension-only.
3. **Pricing = Free only / "Pro coming soon"** (R2.2). `/pricing` shows Free as the live tier with a
   "Pro coming soon" teaser; Settings → Billing is a placeholder. No Stripe/billing work.
4. **Dark mode = ship light-only now** (R6.5 deferred). Drop the `prefers-color-scheme` auto-flip;
   design the warm palette for light surfaces only. A real `[data-theme="dark"]` toggle can come
   later.

### Still open (sensible defaults — confirm with the user when you reach them)
- **Google sign-in (R3):** default = **stub the button** (visible, disabled/"coming soon") until
  OAuth is wired. Don't block auth on it.
- **Knockout/light wordmark (§11.1):** the supplied `logo.svg` is for light surfaces; the charcoal
  "ply" disappears on the dark hero/auth panel. Default = **generate a light wordmark** (or use the
  prototype's CSS two-tone stand-in: green "kiwi" + cream "ply") during **R0.3**.
- **`og-image.png`, `mark.svg`, `app/icon.png`, regenerated extension icons** (R0.3 / §2.3) still
  need producing from the kiwi mark.

## 5. How to start (the loop)
Follow root `CLAUDE.md` exactly. **One task = one commit = one push.** Commit prefix
**`redesign.<phase>.<n>:`** (e.g. `redesign.R0.1: kiwi tokens + fonts`). Update root `PROGRESS.md`
(the **Redesign (Phase R)** section, added in this handoff) each task. Keep `npm test` green
(web: `cd web && npm test` = tsc+eslint, plus `npm run build`; extension: `cd job-autofill &&
npm test`). **Bump `manifest.json` + `package.json` only when extension code changes** (Phase R5);
web/marketing changes don't bump.

**Work the phases in order — R0 first; everything depends on it:**

> **FIRST TASK — R0.1 (tokens + fonts).** Rewrite `web/src/app/globals.css`: replace the Geist /
> black-white defaults and the `prefers-color-scheme` block with the REDESIGN-PLAN §3.1 tokens as
> CSS vars **and** Tailwind v4 `@theme` colors (`--color-accent`, `--color-ink`, `--color-paper`,
> `--color-line`, …). Load **Fraunces** (display) + **Inter** (body) via `next/font`.
> *Accept:* a sample page renders in the kiwi palette; no `--foreground`/`--background` refs remain;
> `npm run build` green. Then R0.2 (UI primitives from the mockup) and R0.3 (brand assets).

Phase order recap (full detail in REDESIGN-PLAN §8): **R0** foundations (tokens, `components/ui/`
primitives, brand assets) → **R1** app shell + IA (route groups `(marketing)`/`(app)`, sidebar +
mobile drawer, new `/dashboard`) → **R2** marketing (landing, pricing, privacy reskin + real
contact email) → **R3** split-screen auth (redirect → `/dashboard`) → **R4** core app screens
(profile, resumes, board incl. JD card-detail, settings) → **R5** extension re-token + polish
(bumps versions) → **R6** cross-cutting (toasts, skeletons, empty states, validation, a11y) →
**R7** internal rename (decision 2) + responsive QA (§9, 360→1440px).

## 6. Machine gotchas (this environment)
- **npm spawns fail** with a poisoned `COMSPEC`. Before any npm command:
  `export COMSPEC="C:\\Windows\\System32\\cmd.exe"; export npm_config_script_shell="C:\\Windows\\System32\\cmd.exe"`.
  (`web/.npmrc` pins the script-shell so installs work.)
- **Next 16 specifics** are in `web/CLAUDE.md` (async `cookies()`, route groups, Turbopack default,
  `eslint` not `next lint`, `proxy.ts` not `middleware.ts`). Read it before touching the web app.
- The web `next build` is the strongest gate; it can take ~1–2 min (run in background, watch output).

## 7. Branch note
This branch (`ui-redesign-phase-0`) currently holds the **redesign package + this handoff +
the PROGRESS Phase R tracker** — i.e. the prep, not the implementation. Start R0.1 here. If you
prefer per-phase branches, branch off this; otherwise carry the whole redesign on this branch and
merge to `main` when a coherent chunk (e.g. all of R0–R1) is done and verified. Don't merge
half-finished phases to `main` (it auto-deploys to prod).

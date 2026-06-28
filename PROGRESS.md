# Dossier — Build Progress & Prompt File

> Single source of truth for *where the build is* and *what to do next*.
> Companion to `ROADMAP.md` (the spec) and `CLAUDE.md` (conventions).
> Update the checkboxes and **Current focus** every time a task finishes.

## How to use this file (the loop)

**Preferred — drive Claude Code directly (cheapest, no drift):**
> Open Claude Code in the repo and paste:
> *"Read `CLAUDE.md`, `ROADMAP.md`, and `PROGRESS.md`. Pick up the task under
> **Current focus**. Follow the conventions. When done, check the box, update
> **Current focus** to the next task, and write a one-line note under **Log**."*

**Optional — use a Cowork chat to expand a task into a richer prompt:**
> Paste this file into Cowork and say: *"Generate a Claude Code prompt for the
> Current focus task, using the template at the bottom."* Then paste the result
> into Claude Code. Use this only when a task is fuzzy and needs breaking down —
> not for every task (it costs extra context for little gain).

**Credit-saving rules:** keep tasks small; give explicit acceptance criteria;
name the files that matter; run `/clear` in Claude Code between unrelated tasks;
let `CLAUDE.md` carry the standing context so you never re-explain it.

---

## Current focus
> ✅ **Phase 5 server-side AI is OFF HOLD — now live-capable on `gemini-2.5-flash-lite` (free tier).**
> The `gemini-2.0-flash` `limit: 0` was per-model; `gemini-2.5-flash-lite` has free-tier quota
> (verified with a live call). Done this pass: default model → `gemini-2.5-flash-lite` (code + docs),
> extension "Use Dossier AI" toggle **re-enabled** (no longer "coming soon"), DEPLOY §10 flipped to
> LIVE. ext v0.19.2. **User action to finish going live:** on the VPS set
> `DOSSIER_AI_MODEL=gemini-2.5-flash-lite` + `DOSSIER_AI_ENABLED=true` (key already in `.env`) and
> recreate the api container — see `DEPLOY.md` §10.
>
> 🎉 **Kiwiply UI/UX redesign is COMPLETE (R0–R7).** All phases done on **`ui-redesign`** (foundations,
> app shell, marketing, auth, core app screens, extension rebrand, cross-cutting polish, internal
> rename + responsive QA). Extension at **v0.21.4**. Spec: `redesign/REDESIGN-PLAN.md`.
> **The one remaining step is the go-live decision: merge `ui-redesign` → `main`** (auto-deploys the
> whole redesign to prod). ⚠️ This is the deferred big one — it ships the rebrand live AND **forces a
> one-time re-login** (R7.1 cookie rename). Before merging, confirm the live verifications below.
> **Pending LIVE verifications (need a running stack / Chrome — the user's step):** (a) reload the
> unpacked extension and eyeball popup/options/overlay in the kiwi palette; (b) sign in and walk the
> gated pages (dashboard/profile/resumes/board/settings) at 360/768/1024/1440px; (c) the email setup
> (Brevo/Cloudflare) per the `email-architecture` memory.
> *Deferred (needs backend, not presentation-only — NOT in this redesign):* (1) default-resume flag →
> popup picker (R4.2 "Default" badge); (2) board card **notes** + **status history** (R4.3 slide-over) —
> no `notes`/audit columns in the DTO. Both are backend features for a later pass.
> **Branch loop (see `redesign-branch-loop` memory):** redesign lives off `ui-redesign` (cut from
> `main`); each phase on its own `phase-N` branch — on phase switch, merge it into `ui-redesign`,
> delete it (local+remote), cut the next off `ui-redesign`. Live branches are only `main`,
> `ui-redesign` (holds R0–R2), and the current **`phase-3`**. Never merge the redesign to `main`
> until pages are reskinned (~end of R4). One task = one commit, prefix `redesign.<phase>.<n>:`.
> Decisions locked: full internal rename (R7.1) · pricing Free/"coming soon" · light-only.
>
> *(`main` is unchanged — Phases 0–7 done + live at https://kiwiply.com. The redesign does NOT touch
> the backend/API. The pre-launch items below — PL.1 privacy contact, PL.2 rate limiting — still
> stand on `main` and fold naturally into R2.3 / a later task.)*
>
> **Pre-launch + external work (on `main`, not features):**
> - **PL.1** — ✅ Terms of Service page + GDPR cookie-consent banner DONE (held locally). Remaining:
>   registered legal entity/address + hosted policy URL + lawyer review (governing-law/indemnity).
> - **PL.2** — ✅ per-IP rate limiting on auth endpoints DONE (held locally). Optional: Caddy edge
>   throttle + body-size cap + `/api/ai/draft` limit.
> - **Also landed (held locally, not in the checklist):** a full **password-reset flow** (web
>   `/forgot-password` + `/reset-password` UI + BFF over the existing Spring init/finish endpoints;
>   reset emails repointed to the web `/reset-password?key=` page).
> - **Live verifications (user, can't be done from here):** Firefox `web-ext lint`/`run`, Edge sideload.
> - **External/blocked:** CWS listing (Google verification pending) → then Edge Add-ons + Firefox AMO
>   (same zip); flip analytics on at launch (`*_ANALYTICS_ENABLED=true`).
> - **7.3 Safari** and **Phase 8 (enterprise: SSO, multi-tenancy, audit)** remain when needed.
>
> Pick the next focus deliberately — likely **PL.1/PL.2** as the real pre-launch gate. Read the
> **Pre-launch checklist** above and the relevant ROADMAP phase.
>
> *Context:* product LIVE at https://kiwiply.com. On `main`. Extension at v0.20.0.

## Status legend
`[ ]` not started `[~]` in progress `[x]` done · Each task is sized for one
focused Claude Code session.

---

## Pre-launch checklist (do BEFORE the public Chrome Web Store listing goes live)
> Not phase-ordered — these are gates that must clear before real users / a public CWS
> listing. Pull any into a focused session when launch nears. The 1.11 gate already shipped
> the multi-tenant fix, account/data deletion, and refresh-token rotation; these are what's left.

- [ ] **PL.1 Legal — Privacy policy + Terms of Service + legal review.** ✅ DONE so far: web `/privacy`
  contact is a real monitored address (`support@kiwiply.com`, routed Cloudflare→Gmail — see
  `email-architecture` memory / DEPLOY §9.1); the extension `PRIVACY.md` contact was swapped
  `privacy@dossier.app`→`support@kiwiply.com` (R5.1); an interim **beta disclaimer** is live (footer +
  signup + a "Beta service" section in `/privacy`: as-is/as-available, no warranties, limitation of
  liability "to the extent permitted by law").
  - ✅ **DONE — Terms of Service (held locally, not yet pushed).** `/terms` page
    (`web/src/app/(marketing)/terms/page.tsx`) covering acceptable use (legitimate personal
    applications only; **no auto-submit / CAPTCHA bypass / scraping** — mirrors the hard rule),
    eligibility/account, user responsibility (you send every application yourself), beta/"as is"
    disclaimer, limitation of liability, termination, changes + notice, and contact; linked from the
    footer + signup alongside the Privacy Policy. Also added a **GDPR cookie-consent banner**
    (`CookieConsent.tsx`) — analytics is now opt-in (gtag loads only after Accept; essential auth
    cookies are exempt), with privacy-policy wording updated to match. **Still TODO before public
    launch:** a **governing-law/jurisdiction + indemnity** clause and a lawyer's review (folds into the
    "Still TODO" below).
  - **Still TODO (the rest):** a **registered legal entity/address** (the ToS + privacy policy need a
    real legal "we"), a stable **hosted policy URL** for the CWS listing, and a **lawyer's review** of
    both the Privacy Policy and the Terms of Service — **extra-important given the AI data-use language**
    (web `/privacy` "AI answer drafting" + extension `PRIVACY.md` "Optional AI answer drafting" + the
    Gemini free-tier training/human-review disclosure). Both files carry inline TODO markers.
- [x] **PL.2 Basic rate limiting / abuse protection.** ✅ DONE — per-IP **fixed-window limiter in the
  Next BFF** (`web/src/lib/rate-limit.ts`) on the auth routes: login (10/5min), signup (5/hr),
  forgot-password (5/hr), reset-password (10/hr) → **429 + Retry-After**. **Why the BFF, not Spring:**
  these flows go browser → Next → Spring over the internal Docker network, so Spring sees ONE IP for
  every user — a Spring-side per-IP limit throttled *all* signups on a shared bucket (shipped, broke
  signup with 502s, hotfixed). The BFF is the only layer with the real client IP (Caddy's **last**
  X-Forwarded-For hop; spoof-resistant since Caddy is the single edge proxy / Cloudflare is grey-cloud).
  In-memory + per-instance (web app is a single container — move to a shared store if scaled out). The
  Spring `RateLimitFilter` (+ unit-tested `FixedWindowRateLimiter`) is kept but **off by default**
  (`RATE_LIMIT_ENABLED`), available only for any *directly-hit* (non-proxied) endpoints. **Optional
  follow-ups:** Caddy edge `rate_limit` + body-size cap, and a `/api/ai/draft` throttle.

---

## Phase 0 — Quick wins, no backend (start now, parallel)
- [x] **0.1 Local field-choice cache.** When the user corrects a filled value or
  picks a custom-dropdown option, persist `{field_key, context_hash, value}` in
  IndexedDB and prefer it on the next fill. No backend. Add jsdom tests.
- [x] **0.2 New ATS adapter: Workable.** Copy
  `lever.js`, implement `matches/plan/fileInput`, register in `manifest.json` +
  `CONTENT_FILES`. Capture real DOM first (the dossier rule). Add tests.
- [x] **0.3 Repo hygiene for Claude Code.** Add `CLAUDE.md` (build/test cmds, DOM-
  capture rule, version-bump ritual). Decide monorepo layout (`/extension`,
  `/api`, `/web`). *Met by existing setup: `CLAUDE.md` (build/test cmds + capture-DOM
  rule + version-bump ritual) and decided layout `/job-autofill`·`/api`·`/web`; added
  `.gitignore` to keep `node_modules/` out of git.*

## Phase 1 — Backend + Accounts (keystone)
- [x] **1.0 STACK DECISION** — DECIDED: Spring Boot via JHipster 8 bootstrap
  (backend-only) + **MySQL** (Railway/Aiven managed) + Cloudflare R2 + Next.js web
  app. Generate the backend from `dossier.jdl` (db type = mysql).
  *Resolved — do not pause here.*
- [x] **1.1 Backend skeleton.** Generate/scaffold API, MySQL, Liquibase,
  Docker. Health endpoint green locally. *Generated from `dossier.jdl` into `/api`
  (JHipster 8, Spring Boot, JWT, MySQL, gradle); builds green on JDK 17. Verified
  end-to-end: MySQL via docker compose → `./gradlew bootRun` → Liquibase migrated →
  `/management/health` returns `{"status":"UP"}` (app started in 28s).*
- [x] **1.2 Auth.** JWT register/login/refresh; `users` table; password hashing.
  *Register (`POST /api/register`), login (`POST /api/authenticate`), `jhi_user`
  table + BCrypt come from JHipster. Added a stateless **access + refresh** flow:
  `/authenticate` now returns `{accessToken (15m), refreshToken (30d)}`; new
  `POST /api/refresh` mints a fresh access token. A `token_type` claim + a strict
  resource-server decoder ensure a refresh token can't be used as an access token.
  Full backend suite (unit + integration) green on JDK 17.*
- [x] **1.3 Data model.** `bios`, `resumes`, `applications`, `field_cache`,
  `ai_answers` tables + migrations (see ROADMAP schema). *Entities + Liquibase
  changelogs generated from `dossier.jdl` (1.1); verified all columns/FKs match the
  ROADMAP sketch. Added a migration with the access-pattern indexes the generator
  omits: unique `bio(user_id)`, unique `field_cache(user_id,field_key,context_hash)`,
  unique `ai_answer(user_id,question_hash)`, and `application(user_id,status)`. Full
  `test`+`integrationTest` green (migration applies on a fresh Testcontainers MySQL).*
- [x] **1.4 Resume storage.** Cloudflare R2 upload/download; `resumes.r2_object_key`.
  *Built an S3-compatible storage layer (R2 is S3-compatible): `StorageProperties`
  (env-config) + `S3Client` (AWS SDK v2) + `ResumeStorageService`/`S3ResumeStorageService`
  (store/load/delete, per-user object keys) + `ResumeFileResource` (upload/download/
  delete, owner-scoped, persists `r2ObjectKey`). Dev uses MinIO (`src/main/docker/
  minio.yml`); real R2 creds via env at deploy. New `S3ResumeStorageServiceIT` drives
  a MinIO Testcontainer (round-trip verified); full `test`+`integrationTest` green.*
- [x] **1.5 Profile + resume sync endpoints.** `/profile`, `/resumes` CRUD.
  *Added the user-scoped sync API the extension/web consume: `ProfileService` +
  `ProfileResource` — `GET/PUT /api/profile` (single bio per user, upsert) and
  `GET/POST/PUT/DELETE /api/profile/resumes` (current-user-scoped; ownership checks
  return 404, never leaking other users' rows; delete also removes the R2 blob).
  `ProfileResourceIT` covers upsert/single-bio, resume CRUD, and cross-user isolation;
  full `test`+`integrationTest` green. **Follow-up (security):** the raw generated
  `/api/bios` + `/api/resumes` CRUD are NOT user-scoped (multi-tenant leak) — lock
  down or remove during the 1.10 privacy/hardening pass.*
- [x] **1.6 `TrackingProvider` abstraction.** Define the provider interface +
  canonical DTOs (the one network seam); implement `DossierApiProvider`. No
  `fetch()` to the backend outside this layer. Endpoint/auth are config, not
  constants. (See ROADMAP "Pluggable tracking backend".) *Added `src/lib/tracking.js`
  (`JAF.tracking`): `TrackingProvider` contract + `createDossierProvider({baseUrl,
  fetch,tokenStore})` → auth (register/login/refresh/logout), profile pull/push,
  resume CRUD, with canonical bio/resume↔DTO mapping and 401→refresh→retry. App/
  field-cache methods declared but throw `NotSupportedError` (Phase 3/4). Endpoint =
  `settings.apiBaseUrl`. 22 jsdom tests (mock fetch); loaded in popup+options; v0.8.0.*
- [x] **1.7 Extension login + sync layer.** Login screen; pull on login, push on
  change via `TrackingProvider`; local store becomes offline cache. *Added
  `src/lib/sync.js` (`JAF.sync`: pullAll/pushBio/pushResume/pushAll/syncNow,
  serverId-matched resume merge) + an **Account tab** in the options page (backend
  URL config, sign in / create account / sign out, Sync now). Sign-in pulls
  profile+resumes into the local cache; saving bio/resume pushes (best-effort,
  stays working offline); delete removes the server row too. 15 jsdom sync tests;
  manifest gains `http://localhost:8080` host perm for dev; v0.9.0. Create-account
  needs JHipster activation (use a seeded account locally). **Verified end-to-end in
  Chrome against a live backend:** sign in (user/user) → pulled bio+resume → edited
  bio → push landed server-side. Two fixes surfaced: storage config prefix
  `application.storage`→`dossier.storage` (was breaking startup) and dev CORS
  allowing `chrome-extension://*` (was 403'ing the extension).*
- [x] **1.8 Extend tracking schema (additive migration).** On the EXISTING backend
  — do NOT regenerate the app. Hand-written Liquibase changelog: `Application` +=
  `location` (String), `externalJobId` (String), `submissionConfirmed` (Boolean);
  `ApplicationStatus` += `DRAFT`; `Resume` += `archived` (Boolean, default false).
  Update `dossier.jdl` to match (documentation only). Index `application(user_id,
  external_job_id)` for dedup. Migration applies on a fresh Testcontainers MySQL.
  *Added fields by hand to `Application`/`ApplicationDTO`, `Resume`/`ResumeDTO`, the
  `ApplicationStatus` enum (DRAFT first), and changelog `20260622000000_extend_
  tracking_schema.xml` (+ dedup index). MapStruct auto-maps the new fields. `dossier.jdl`
  already carried these (planning pivot). New `TrackingSchemaIT` (2) round-trips the
  fields + DRAFT through MySQL; full `test`+`integrationTest` green.*
- [x] **1.9 OpenAPI contract published.** Confirm the springdoc OpenAPI spec covers
  auth + sync + the new tracking fields; this is the contract a third-party backend
  implements to be Dossier-compatible. (Do AFTER 1.8 so the contract is complete.)
  *Added `OpenApiConfiguration` (api-docs profile) declaring the `bearer-jwt` security
  scheme; annotated the custom `AuthenticateController`/`ProfileResource` with `@Tag`/
  `@Operation`/`@SecurityRequirement`; set the API identity (title "Dossier API") via
  `jhipster.api-docs.*` (the lever JHipster's customizer actually honors). New
  `OpenApiContractIT` boots under `api-docs` as ADMIN, asserts `/v3/api-docs` covers the
  auth flow, the `/api/profile`(+`/resumes`) sync API, the bearer scheme, and the 1.8
  tracking fields (`location`/`externalJobId`/`submissionConfirmed`/`archived` + `DRAFT`),
  and writes the published snapshot to `api/openapi.json`. Full `test`+`integrationTest` green.*
- [x] **1.10 Web app — management surface.** Next.js: signup/login/settings PLUS
  resume upload+review+archive and bio editor. **First extract `parser.js` into a
  shared module** (it's plain browser JS — pdf.js+mammoth) so the web app parses
  in-browser; the extension imports the same module. Web app = primary product;
  extension = on-page companion.
  - [x] **1.10a Shared parser module.** Extracted the pure text→structure logic into
    `job-autofill/src/lib/parser-core.js` (UMD-lite: `JAF.parserCore` as a `<script>`
    AND `module.exports` for `require()` — no build step). `parser.js` now keeps only
    the extension I/O (pdf.js/mammoth/LLM) and delegates structuring. Self-sufficient
    `splitSkills` bundled so standalone parsing matches the extension. New
    `test/parser_core.test.js` proves consumption via plain `require()` (no jsdom/JAF);
    extension suite green; ext v0.10.0.
  - [x] **1.10b Next.js app scaffold.** `/web` scaffolded (Next 16 App Router, React 19,
    TypeScript, Tailwind v4, `@/*` alias). Dossier landing page; `src/lib/config.ts`
    server-side API base-URL seam (`DOSSIER_API_URL`, proxied — never exposed to the
    client) + `.env.example`; `turbopack.root` pinned (monorepo lockfile inference);
    project-local `web/.npmrc` to dodge the global npm shell misconfig. `npm test`
    (`tsc --noEmit && eslint`) + `npm run build` green.
  - [x] **1.10c Auth — cookie route handlers + login/signup/settings.** httpOnly-cookie
    auth: Next route handlers proxy `/api/authenticate`+`/api/refresh`+`/api/register`+
    logout (`src/app/api/auth/*`); `lib/auth.ts` (cookie helpers, async `cookies()`) +
    `lib/api.ts` (server fetch with bearer); login + signup (activation-aware) pages;
    gated `/settings` server component reading `/api/account`. `tsc`+`eslint`+`next build`
    green. **Verified live end-to-end** against the running backend: bad-creds→401,
    `user`/`user`→cookies set, `/settings` renders the real account, refresh/logout work,
    unauth `/settings`→307 `/login`.
  - [x] **1.10d Resume upload+review+archive (imports `parser-core`) + bio editor.**
    **Upload design (PERMANENT): Option A — parse in-browser (web app's own pdf.js+mammoth
    → `parser-core`), then proxy the file + parsed JSON through a Next route handler to the
    existing Spring upload endpoint (R2/MinIO).** This is the final design, not a stopgap:
    the web app runs as a long-running container (`next start`), which has no serverless
    body limit, and Option A keeps the established BFF rule (browser → Next → Spring; the
    browser never calls Spring or R2 directly). **Refinements:** stream the upload through
    the route handler (don't buffer the whole file in memory) and enforce a max size
    (~10MB) at the Next layer. *Option B (presigned direct-to-R2) is NOT planned — keep it
    only as a fallback if the web app is ever moved to a serverless host; see 2.1.*
- [x] **1.11 Privacy, deletion & security hardening (pre-launch gate).** Everything
  here must land before any public release. *DONE: multi-tenant leak fix, account/data
  deletion (backend+web), refresh-token rotation+revocation, privacy disclosure.*
  - ✅ **DONE — Privacy disclosure.** Web `/privacy` policy page (what's collected, in-browser
    parsing, storage/sharing, retention + self-service deletion, GDPR/CCPA rights, cookies),
    linked from the landing footer + signup. Extension `job-autofill/PRIVACY.md` = the Chrome
    Web Store data-use disclosure (single purpose, per-permission justification, not-sold
    certifications). *Pre-launch TODO: legal review + set a real contact address/entity +
    hosted policy URL in the CWS listing.*
  - ✅ **DONE — Multi-tenant leak fix (carried from 1.5).** The generated `/api/bios`,
    `/api/resumes`, `/api/applications`, `/api/ai-answers`, `/api/field-caches` CRUD
    controllers were NOT user-scoped — any authenticated user could read every user's
    rows. Locked all five to ADMIN via class-level `@PreAuthorize`; the user-scoped
    `/api/profile`(+`/resumes`) sync API and the owner-scoped `ResumeFileResource`
    (`/api/resumes/{id}/file`) stay open. New `EntityCrudLockdownIT` asserts USER→403 /
    ADMIN→200 on all five; generated ITs updated to run as ADMIN. Full suite green.
  - **GDPR/CCPA data deletion (carve-out, not enterprise).** Resumes are sensitive PII,
    so a basic **"delete my account + all my data"** path (DB rows + R2 blobs) and a
    privacy policy that states retention/deletion are a near-term legal obligation once
    there are real users. Ship a minimal version here; full audit-log/retention tooling
    is Phase 8.4. *✅ DONE (backend + web) — `DELETE /api/account` erases blobs + all owned
    rows + the user (`AccountDeletionService`/`Resource`/`IT`); web Danger-zone
    `DeleteAccountButton` → proxy `DELETE /api/account` → clears cookies → redirect.
    Live-verified end-to-end. The privacy-policy text is the separate disclosure sub-item.*
  - ✅ **DONE — Refresh-token rotation + revocation (carve-out, not enterprise).** Added a
    `refresh_token` denylist: tokens carry a `jti`, `/api/refresh` rotates (spent token →
    fresh one in the same family) with reuse-detection (replay revokes the family),
    `POST /api/logout` revokes, account deletion clears tokens. Web + extension clients
    persist the rotated token. Live-verified. Fuller session control (forced logout
    everywhere, device list) is Phase 8.3.
  - **Forward notes (cheap now, save a rewrite later):** (1) funnel all data access
    through a single "current principal" abstraction so adding org/tenant scoping in
    Phase 8.2 isn't a table-by-table retrofit; (2) move secrets to the host's secret
    store (Railway/Render) rather than plain env files — near-free, defers KMS to 8.4.

## Phase 2 — Deployment + CI/CD
> **Hosting model (locked):** both apps run as **long-running containers**, no
> serverless assumed. **Web** = Next's own server via `next start` (build with
> `output: 'standalone'` for a lean image); **no Express / custom server**. **API** =
> Spring Boot embedded Tomcat in a container (already how it runs; standalone-WAR
> stays a possible option, not the default). Host on Railway / Render / Fly / a VPS.
> Vercel is allowed but not assumed — and if the web app is ever moved to a
> serverless host, the resume upload must switch to Option B (presigned) because of
> the ~4.5MB body limit.
- [x] **2.1 Environments.** *DONE — built, deployed, and **LIVE in production** on the IONOS
  VPS (2026-06-22): `https://app.132-148-79-209.sslip.io` (+ `api.`), HTTPS via Caddy/LE,
  resumes in AWS S3; signup→login→profile→resume-upload all verified in the browser. Deploy +
  ops runbook in `DEPLOY.md`; see the `live-deployment` memory for URLs/ops/gotchas.* **Decided
  stack:** self-managed IONOS
  Linux VPS, Docker Compose (MySQL + API + web) behind **Caddy** (auto-HTTPS via
  Let's Encrypt), **sslip.io** for real TLS on the bare IP (no domain yet), **AWS S3**
  private bucket for resume files (our `ResumeStorageService` already speaks S3). Shipped:
  multi-stage `api/Dockerfile` + `web/Dockerfile` (root context so the parser-core sync
  works; drops the Windows `.npmrc`), `docker-compose.prod.yml`, `Caddyfile`, `.env.example`,
  `DEPLOY.md` runbook, root `.gitignore` (protects `.env`). Prod config wired: env-required
  JWT secret (fails fast without it), `jhipster.cors` for the extension origin, `dossier.storage`
  S3 block (path-style off). Verified: both images build, full stack boots on the prod
  profile, Liquibase migrates, `/management/health` UP reachable web→api over the internal
  network. *Not testable locally (deploy-time): Caddy/Let's Encrypt + a real S3 upload.*
  *Option B (presigned direct-to-R2) stays dropped — Option A (Next-proxied) is permanent.*
- [x] **2.2 Pipeline.** GitHub Actions. **`ci.yml`** runs extension + web (tsc/eslint/build)
  + API (unit + integration on Testcontainers) on every PR/push — **first run green on the
  runners**. **`deploy.yml`** on merge to `main` builds the api/web images, pushes to GHCR,
  and SSHes the VPS to `pull` + restart (build off-box to spare the VPS). The deploy job is
  gated on `vars.DEPLOY_ENABLED=='true'` and the `VPS_*` secrets — **build/push runs now;
  auto-deploy turns on once the user adds the secrets + flips the flag (steps in `DEPLOY.md`
  §7).** Compose now carries `image: ghcr.io/...` alongside `build:` so both pull and local
  build work.
- [x] **2.3 Extension auto-publish.** `publish-extension.yml` — packages the extension into a
  CWS-ready zip (manifest at root + `src`/`vendor`/`icons`; runtime files only), uploads it as a
  build artifact (always), and publishes to the Chrome Web Store when enabled. Trigger: manual or
  an `ext-v*` tag; runs the extension test suite as a gate. **Gated/dormant** (`vars.PUBLISH_EXTENSION`
  + `CWS_*` secrets) — the first listing must be uploaded by hand (CWS API only *updates*), then
  automated updates flip on. Setup in `DEPLOY.md` §8. Action pinned `@v6.0.0` (the `@v5` moving
  tag doesn't exist). **Extension prod-prepped (v0.12.0):** defaults to `https://api.kiwiply.com`
  + host permission. Zip artifact built & verified. **Pending external:** Google dev-account
  verification → first manual listing → review → set `CWS_*` secrets + `PUBLISH_EXTENSION`.
- [x] **2.4 Email verification (SMTP) — GATE before public signups.** Wired JHipster's
  activation-email flow to env-driven SMTP (**Brevo** now, provider-agnostic via `MAIL_*`):
  prod `spring.mail.*` + `jhipster.mail.{base-url,from}`, with `MAIL_BASE_URL` auto-derived to
  `https://app.<SSLIP_HOST>` so the activation link points at the web app. Added the web
  **`/account/activate`** page (reads `?key=`, calls public `GET /api/activate`, shows
  verified/invalid). Signup UX already showed "check your email". `.env.example` + compose +
  `DEPLOY.md` §9 (Brevo setup). **Verified:** web build green; **prod profile boots with the
  mail config** (no YAML/binding error → safe to auto-deploy). Live email round-trip pending
  the user's Brevo creds. No auto-activate (locked decision). **Completes Phase 2.**

## Phase 3 — Application Tracking (the tracker fills itself as you apply)

> **Pinned decision (3.2):** create the DRAFT entry on **every fill**, not only on
> "complete-looking" fills. It's simpler and we never miss an application. To keep
> the board from getting cluttered, two safeguards: (1) **dedup** — re-filling the
> same job updates the same entry instead of adding a new one; (2) abandoned DRAFTs
> are **easy to dismiss/delete** on the board. Do not gate entry-creation on guessing
> whether the user finished.

- [x] **3.0 Backend: applications API + provider methods.** User-scoped
  applications CRUD (upsert keyed on `externalJobId`/`jobUrl`); implement
  `pushApplication`/`listApplications` in `tracking.js` and add `updateApplication`
  (status/confirm) + `archiveResume` to the provider contract + backend. *Done at
  `/api/profile/applications` (the bare `/api/applications` is the ADMIN-locked
  generated CRUD; this matches the existing `/api/profile/*` user-scoped convention).
  `ApplicationSyncService`/`Resource`: GET list, POST upsert (dedup ext→url, never
  reverts a non-DRAFT entry to DRAFT on re-fill, owner-checked resume linkage), PUT
  partial update (status/confirm/edits), DELETE (dismiss a draft). No migration —
  columns + dedup index already landed in 1.8. Extension `tracking.js` implements
  all five provider methods + `applicationToDto`/`dtoToApplication` mappers; base
  contract still throws `NotSupportedError`. `ApplicationSyncResourceIT` (9 cases:
  upsert/dedup-by-ext, dedup-by-url, no-DRAFT-downgrade, required-fields, partial
  update, resume-ownership, delete, cross-user isolation) + 15 new tracking jsdom
  tests; full backend `test`+`integrationTest` + extension suite green. ext v0.13.0.*
- [x] **3.1 Job-detail capture chain.** Add `captureJob()` to adapters; extractor
  order = `schema.org/JobPosting` JSON-LD → adapter `captureJob()` → generic
  `<meta>`/heuristics. Returns a canonical `JobCapture` DTO (company, role, location,
  jobUrl, externalJobId, atsPlatform, jobDescription). Tests per strategy. *Done:
  `src/lib/job-capture.js` (`JAF.jobCapture`) — `fromJsonLd` (schema.org/JobPosting:
  title/hiringOrganization/jobLocation/description/identifier; handles `@graph`, array
  `@type`, PropertyValue ids, strips HTML), per-adapter `captureJob({loc})` (Lever/
  Greenhouse/Ashby/Workable/Workday — externalJobId + atsPlatform from the **public URL
  shape only**, no tenant DOM guessing per the dossier rule), and generic `og:`/meta/
  canonical fallback. Merged per-field (JSON-LD wins descriptive; adapter authoritative
  for id+platform). Registered in manifest + popup `CONTENT_FILES`. 31 jsdom tests
  (each strategy + merge precedence). ext v0.14.0. **Not yet wired into fill/save —
  that's 3.2/3.3.**
- [x] **3.2 Auto-log + submission detection.** On fill: upsert a **DRAFT** entry with
  the captured job + the resume the user picked (dedup on externalJobId/jobUrl; see
  pinned decision above). If the extension sees the confirmation (`webNavigation`
  success page or DOM success signal) → flip to **APPLIED**, `submissionConfirmed=true`,
  set `appliedAt`. No auto-submit. (Submission-detection module on the content side.)
  *Done: `src/lib/app-tracking.js` (`JAF.appTracking`, SW-safe pure logic) — DRAFT
  assembly (company/role fallbacks so a fill always logs), `pushDraft`/`confirmSubmission`,
  + conservative `isSuccessUrl`/`hasSuccessSignal` heuristics. On fill commit the filler
  captures the job + picked resume → `JAF_LOG_FILL` to the **service worker** (owns the
  network + survives the post-submit nav), which upserts the DRAFT and remembers it
  per-tab (persisted). APPLIED flip via the SW's `webNavigation.onCompleted` (success
  URL) or the content `submit-detect.js` watcher (`JAF_SUBMIT_DETECTED`, in-page
  confirmation copy). Best-effort/silent (no backend/sign-in ⇒ no-op); 30-min confirm
  window; tab-close cleanup. popup threads the resume `{serverId,label}`. SW
  `importScripts` tracking/sync/app-tracking. 31 jsdom tests. ext v0.15.1 (incl. a
  hardening fix: the auto-log retries without the resume link if a stale serverId 404s,
  so a fill always logs). **Live smoke-tested end-to-end on a real ATS (2026-06-23):
  fill → DRAFT, confirmation nav → APPLIED — passed.***
- [x] **3.3 Save-a-job.** One click in the popup → **SAVED** entry via the capture
  chain (no resume attached). *Done: popup "Save this job" button → injects the content
  libs, asks the top frame for a capture (`JAF_CAPTURE_JOB` handler in content-script.js)
  → routes to the SW (`JAF_SAVE_JOB` → `appTracking.pushSaved`, status SAVED, no resume).
  Generalized `buildApplication(capture,resume,status)` (DRAFT default) + `pushSaved`.
  Works without a resume selected; silent "sign in to save" if no session. 38 jsdom tests;
  full extension suite green. ext v0.16.0.*
- [x] **3.4 Web Kanban board + "Did you submit?" nudge.** Next.js board (Draft →
  Saved → Applied → Interview → Offer → Rejected). DRAFT / `submissionConfirmed=false`
  entries show a "Did you submit?" prompt → Yes = APPLIED, No = keep/drop. Manual
  status edits on the board. *Done: gated `/board` page (server-fetches
  `/api/profile/applications`) + `ApplicationBoard` client component (6 columns, per-card
  status `<select>` to move, delete with confirm, and the "Did you submit?" nudge on
  DRAFT cards → Yes = APPLIED+`submissionConfirmed`+`appliedAt`, Not-yet = dismiss).
  Mutations via a new `/api/applications/:id` proxy (PUT status/confirm, DELETE; whitelisted
  fields, owner-scoped 404) → `router.refresh()`. Board nav links added to resumes/profile/
  settings. `tsc`+`eslint`+`next build` green (`/board` + `/api/applications/[id]` registered).
  Web-only (no version bump).*
- [x] **3.5 Resume archive guard.** Deleting a resume referenced by any application
  (esp. APPLIED) is blocked with a **nudge to archive instead** (`archived=true`);
  archived resumes are hidden from the active picker but keep their tracker links.
  Enforce server-side (referential check) + surface the nudge in the web UI. *Done:
  backend `ProfileService.deleteResume` counts referencing applications
  (`ApplicationRepository.countByResumeId`) → **409** with an archive nudge if any
  (account-deletion path unaffected); `ProfileResourceIT` covers blocked-delete +
  archive-instead. Web: `DELETE /api/resumes/:id` proxy passes the 409 `detail` through;
  `ResumeList` gets a Delete button that shows the nudge on 409. Extension: `dtoToResume`
  syncs `archived` (stripped from `parsedJson`), popup picker hides archived resumes.
  All three suites green. ext v0.16.1. **Completes Phase 3.***

## Phase 4 — Field cache (cloud sync)
- [x] **4.1 Promote local cache to `field_cache` API**; last-write-wins +
  `hit_count` ranking; sync across devices. *Done: user-scoped
  `/api/profile/field-caches` (GET list + `POST /sync` batch upsert keyed on
  `fieldKey`+`contextHash`, last-write-wins on value by `updatedAt`, `hitCount`=max —
  idempotent) via `FieldCacheSyncService`/`Resource`; `FieldCacheSyncResourceIT` (5).
  Extension: `field-cache.js` `exportAll`/`importEntries` (same merge locally),
  `tracking.js` `syncFieldCache` + `fieldCacheToDto`/`dtoToFieldCache` (epoch-ms↔ISO
  conversion), `sync.js` `syncFieldCache` folded into `syncNow(provider,storage,cache)`,
  options "Sync now" passes `JAF.fieldCache` (namespaced by bio email). Backend +
  extension suites green. ext v0.17.0. **Completes Phase 4.***

## Phase 5 — AI Integration (server-side)
> ✅ **OFF HOLD (2026-06-24) — live-capable on `gemini-2.5-flash-lite` (free tier).** The
> `gemini-2.0-flash` `limit: 0` was per-model; `gemini-2.5-flash-lite` has free-tier quota (verified
> live). Default model updated (code + docs), extension toggle re-enabled, DEPLOY §10 flipped to LIVE.
> Final go-live = set `DOSSIER_AI_ENABLED=true` + `DOSSIER_AI_MODEL=gemini-2.5-flash-lite` on the VPS.
- [x] **5.1 Metered `/ai` proxy** on server key (free-tier quota + rate limit). *Done + LIVE-capable.
  `POST /api/ai/draft` (`AiResource`/`AiDraftService`) — provider-agnostic `AiProvider` seam
  + `GeminiAiProvider` (Google Gemini free tier, `dossier.ai.*` env config, key server-only).
  **Opt-in + explicit consent** (free tier may use inputs to improve Google's services),
  per-user monthly quota (`ai_usage` table). Extension: Options "Use Dossier AI" toggle +
  consent checkbox; SW `draftAnswer` routes to the proxy via `tracking.aiDraft` when enabled
  (BYO-key first). Privacy policies (web + extension) disclose it. `AiDraftServiceTest` +
  `AiResourceIT` + tracking jsdom test; all suites + web build green. ext v0.18.0.*
- [x] **5.2 Keep BYO-key path** as the unlimited free option. *Preserved: the SW's BYO-key
  path (direct to Anthropic with the user's own key) is untouched and takes priority over the
  metered server path.*
- [x] **5.3 Cache answers** in `ai_answers` by `question_hash`. *Done: `AiAnswerCacheService`
  — `questionHash()` (normalize: lowercase / collapse whitespace / strip trailing punctuation →
  SHA-256 hex, mirrors the extension's local-cache key), `lookup(login,hash)`, and a
  `REQUIRES_NEW` `store(...)` so a rare duplicate-race unique-constraint violation rolls back only
  the cache insert, not the caller's draft+quota. `AiDraftService` checks the cache **before the
  quota gate** → a repeat question returns instantly with no provider call and no quota charge (and
  isn't blocked when over quota); fresh drafts are stored. `AiAnswerRepository.findOneByUserLoginAnd
  QuestionHash`; response gains `cached:true/false`. Backed by the existing unique index
  `ux_ai_answer_user_qhash(user_id,question_hash)` — no migration. `AiDraftServiceTest` (+3 cache
  cases) + new `AiAnswerCacheServiceTest` (7); compiled + unit tests green on JDK 17. **Completes
  Phase 5.** Backend-only (no extension bump).*

## Phase 6 — Google Analytics
- [x] **6.1 Extension events** via GA4 Measurement Protocol from the service
  worker (send immediately — SW dies after ~30s idle). *Done: `src/lib/analytics.js`
  (`JAF.analytics`, SW-safe) — GA4 Measurement Protocol `track(name,params)`, one POST per
  event (no batching), no-ops when unconfigured or opted out, PII-guarded `sanitize()` (coarse
  scalars only), random `gaClientId`. Measurement id + api secret empty in source (no key in
  bundle); set at config time or via `settings.ga*`. SW `importScripts` it + fires
  `extension_install`/`autofill`/`save_job`/`answer_draft`/`application_submitted`. Options gets a
  "Share anonymous usage analytics" opt-out (on by default); manifest + host perm
  `www.google-analytics.com`; extension `PRIVACY.md` discloses it (section + cert + permission row).
  `test/analytics.test.js` (27); full suite green. ext v0.19.0.*
- [x] **6.2 Web app** gtag.js + funnel events. *Done: `web/src/lib/analytics.ts` (`track()`
  no-op-safe helper + typed `window.gtag`) + `web/src/components/Analytics.tsx` (loads gtag.js via
  `next/script`, **only** when `NEXT_PUBLIC_GA_MEASUREMENT_ID` is set — renders nothing otherwise),
  mounted in the root layout. Funnel events fired at the real success points: `sign_up` (signup),
  `login` (login), `resume_saved` (upload), `board_viewed` (board mount). No PII — coarse params
  only. Measurement ID is a PUBLIC `NEXT_PUBLIC_` env (gtag needs no secret); blank = analytics off.
  Web `/privacy` updated: new "Analytics" section + amended "Cookies" (first-party analytics
  cookies, no ad cookies) — consistent with the extension `PRIVACY.md`. `web/.env.example` documents
  the var. `npm test` (tsc+eslint) + `next build` green. **Completes Phase 6.***

## Phase 7 — Other browsers
- [x] **7.1 Edge** (near-free on MV3). *Done: audited every `chrome.*` API the extension uses
  (`storage`/`runtime`/`tabs`/`webNavigation`/`scripting`/`action`) — all Edge-supported, no
  Chrome-exclusive APIs → **runs unchanged, same bundle, no code change**. New `job-autofill/
  BROWSERS.md` (compatibility matrix + Edge sideload `edge://extensions` + Edge Add-ons submission
  via Microsoft Partner Center, same zip). DEPLOY §8 + ARCHITECTURE reference it. Docs-only (no
  version bump). Live sideload verification is a ~2-min user step.*
- [x] **7.2 Firefox** (`browser_specific_settings.gecko` + AMO). *Done (manifest + docs): targets
  **Firefox 121+** (supports MV3 `background.service_worker` so our `importScripts` SW runs, and
  exposes `chrome.*` callback aliases so no `browser.*` rewrite/polyfill is needed). Added a
  `browser_specific_settings.gecko` block (id `dossier@kiwiply.com`, `strict_min_version 121.0`) to
  `manifest.json` — Chrome ignores it, so **one manifest + one zip serve Chrome, Edge, and
  Firefox/AMO**. BROWSERS.md documents the approach, a **required live `web-ext lint`/`web-ext run`
  verification pass** (the background SW is the bit most likely to differ on Firefox), an event-page
  contingency if `service_worker` is rejected, and AMO submission. ext v0.20.0; 14 suites green.
  **Runtime verification on a real Firefox is the user's gate before publishing to AMO.***
- [ ] **7.3 Safari** (Apple `safari-web-extension-converter` + Xcode — deferred, done last).

## Phase 8 — Enterprise & Compliance (after the consumer product + deployment are real)
> Deferred B2B/enterprise work. The *consumer-grade* slices of these areas were
> pulled into 1.11 (data deletion, basic refresh-token rotation/revocation); this
> phase is the fuller, org-selling version. Easy to reorder earlier if a B2B deal
> demands it.
- [ ] **8.1 SSO.** SAML/OIDC (Okta, Azure Entra ID, Google Workspace); later SCIM
  provisioning + MFA.
- [ ] **8.2 Multi-tenancy.** Org/tenant model + strict tenant isolation (builds on the
  1.11 leak fix + the "current principal" abstraction) + org admin console.
- [ ] **8.3 Session control.** Revocable sessions, refresh-token rotation at scale,
  forced logout / device list (extends the basic rotation shipped in 1.11; covers both
  auth surfaces — extension Bearer + web httpOnly cookie).
- [ ] **8.4 Audit & compliance.** Audit logging; PII retention/deletion tooling;
  GDPR/CCPA + SOC 2 groundwork; secrets in a vault/KMS; deeper RBAC.

## Phase 9 — Admin, ops & comms
> Full plan + legalities in **`ADMIN-PLAN.md`**. Locked decisions: PII = metadata + reason-gated;
> location = in-app `/admin` route group; order A0→A5. Commit prefix `phase9.<n>:`. Overlaps Phase 8
> (MFA/audit/RBAC) — build the consumer-grade slices here, the enterprise versions in 8.
- [ ] **9.A0 Security gate (do FIRST).** The default `admin`/`admin` (+`user`/`user`) seed loads with
  **no Liquibase context** → present in PROD with JHipster's public bcrypt hash. Gate the seed to
  `dev`/`faker` (or migrate-delete in prod) + bootstrap the real admin from env (`ADMIN_EMAIL` /
  `ADMIN_PASSWORD_HASH`). Verify `admin/admin` no longer logs in on the VPS.
- [ ] **9.A1 Admin gate + shell + Users + audit foundation.** `(admin)` route group gated on
  `ROLE_ADMIN` (via `/api/account` authorities; Spring `/api/admin/**` is the real enforcement);
  admin shell; Users list/detail reusing `/api/admin/users` (activate/deactivate, reset, roles,
  force-logout via `RefreshTokenService`, delete via `AccountDeletionService`); `AdminAuditEvent`
  foundation (log every admin action + reason-gated PII access).
- [ ] **9.A2 AI usage + sessions/security + system/ops dashboards.** `ai_usage` views + quota override;
  refresh-token families + revoke; actuator health/metrics/loggers (read-only).
- [ ] **9.A3 Business-analytics overview.** Signups, activation rate, DAU/WAU, funnel, resumes/apps.
- [ ] **9.A4 Email subscription.** `email_subscriber` (double opt-in, tokenized unsubscribe) + Brevo
  list sync; public opt-in (footer + separate signup checkbox); admin list/export. Consent recorded;
  unsubscribe + sender address in every email.
- [ ] **9.A5 Bug report.** `bug_report` capture (web help menu + extension popup, context w/ consent,
  optional screenshot) → `POST /api/bug-reports` (rate-limited); admin triage queue.
- [ ] **9.X Cross-cutting.** MFA for admins; `/privacy` + `/terms` updates (admin access, marketing
  email, diagnostic data); DSAR export-a-user's-data.

## Redesign (Phase R) — Kiwiply UI/UX (parallel track, branch `ui-redesign-phase-0`)
> Presentation-only rebrand + visual system + app shell — **no backend/API changes**. Spec:
> `redesign/REDESIGN-PLAN.md`; prototype: `redesign/mockups.html`; on-ramp: `redesign/HANDOFF.md`.
> Locked decisions: **full internal rename** (cookies + identifiers, R7.1, forces one re-login) ·
> pricing **Free / "Pro coming soon"** · **light-only** (no dark mode this pass). Commit prefix
> `redesign.<phase>.<n>:`. Bump extension versions only in R5.
- [x] **R0 Foundations.** ✅ R0.1 kiwi tokens + Fraunces/Inter in `globals.css` (Geist + dark
  media query dropped) · ✅ R0.2 `components/ui/` primitives (ported from `mockups.html`) · ✅ R0.3
  brand assets (starter SVGs deleted; `mark.svg` + `app/icon.svg` favicon + `app/opengraph-image.tsx`;
  metadata title/OG/Twitter set; `Wordmark`/`BrandLockup` for dark surfaces).
- [x] **R1 App shell & IA.** ✅ R1.1 route groups `(marketing)`/`(app)` + sidebar + mobile drawer +
  gate-session-once (per-page nav deleted) · ✅ R1.2 new `/dashboard` (KPIs, setup checklist, quick
  actions, recent-activity feed); login redirect → `/dashboard`.
- [x] **R2 Marketing.** ✅ R2.1 landing rebuild (charcoal hero + product-peek, how-it-works,
  features, pricing teaser) · ✅ R2.2 `/pricing` (Free live + "Pro coming soon" + Teams contact;
  Settings→Billing placeholder) · ✅ R2.3 privacy reskin (kiwi tokens, Kiwiply naming) + real
  contact `support@kiwiply.com`.
- [x] **R3 Auth.** ✅ R3.1 split-screen `/login`+`/signup` — shared `AuthScreen` (charcoal brand
  panel + testimonial, tabbed Sign in/Create account, kiwi-token forms, stubbed "Continue with
  Google") + branded `/account/activate` card. Login→`/dashboard`; signup→check-email; flows
  unchanged.
- [x] **R4 Core app screens.** ✅ R4.1 Profile — sub-nav + strength meter + skills chips + EEO
  collapsible + autosave · ✅ R4.2 Resumes — drag-drop drop-zone + variant cards (file icon, status
  badge, "used in N applications", archive/delete) + friendly 409 archive-guard callout (upload/
  parse/archive/delete flows unchanged; page now also fetches applications for usage counts) · ✅ R4.3
  Board — tools (search / filter-by-resume / sort) + **drag-drop between columns** (optimistic; select
  kept as a11y fallback) + accent "Did you submit?" nudge + **JD card-detail slide-over** (shows the
  captured `jobDescription` — already in the DTO, no backend change) · ✅ R4.4 Settings — section
  sub-nav (scroll-spy: Account / AI & drafting / Autofill / Privacy & data / Billing), kiwi-reskinned
  type-to-confirm danger zone, AI/autofill surfaced informationally ("in the extension" — those live
  in chrome.storage, not the backend). Existing save/delete/status flows still pass.
- [x] **R5 Extension (bumps versions).** ✅ R5.1 re-token (kiwi palette in popup.css/options.css +
  overlay Shadow-DOM `CSS_TEXT`; AI-badge now charcoal-on-lime; green left border) + Kiwiply rename
  (manifest name/tooltip, popup/options `.brand` + copy, overlay brand + note, Workday re-run msg,
  `PRIVACY.md` + contact→`support@kiwiply.com`); ext **v0.21.0**; 14 suites green. Internal ids
  (`createDossierProvider`, `dossier`/`dossier-fieldcache` IDB, gecko id) deferred to R7.1 · ✅ R5.2
  popup polish (kiwi-mark + two-tone wordmark lockup; clickable bio-warn; colored file-status +
  green success status; ext v0.21.1) · ✅ R5.3 options polish (sticky save bar; AI settings grouped
  into one "AI answer drafting" card — BYO key vs Kiwiply AI; finished the re-token: fixed blue chips
  → `--accent-soft`, gold drop-zone/badge → kiwi; ext v0.21.2) · ✅ R5.4 overlay polish (fill→advance
  micro-states "Filling…"/"Advancing…"; **"↻ regenerate draft"** affordance on AI rows — re-asks the
  SW via new `JAF.assist.draft`, item keeps question+context; kept green left border + "never clicks
  Submit" note + Shadow-DOM isolation; ext v0.21.3). No "Dossier" in UI; Shadow DOM isolation preserved.
- [x] **R6 Cross-cutting.** ✅ R6.1 Toasts — `ToastProvider` + `useToast()` + bottom-right viewport
  (mounted in root layout) on the R0.2 `Toast` primitive; wired to replace inline "Saved" text
  (ResumeUpload save → success toast; ResumeList archive/restore/delete → toasts) · ✅ R6.2 Skeletons —
  route-segment `loading.tsx` fallbacks (dashboard/board/resumes/profile/settings) matching each
  page's layout, built on the R0.2 `Skeleton` primitive · ✅ R6.3 Empty states — unified the empty
  board + empty resume list onto the R0.2 `EmptyState` primitive (icon/title/description + action) +
  added a "no matches" state for filtered board results · ✅ R6.4 Validation — inline email/URL/
  required errors via the `Field` error slot + `aria-invalid` Inputs: auth forms (login/signup, block
  submit on error; signup email-format + min-length) and the profile editor (advisory email/URL on
  blur, never blocks autosave); new dependency-free `lib/validate.ts` · ✅ R6.6 a11y — global
  `:focus-visible` accent ring (for elements without their own), `--muted` darkened `#73746E`→`#686962`
  (clears WCAG AA on `--paper`), Escape-to-close + focus-on-open for the board slide-over (already
  `role=dialog`) and Escape for the mobile drawer; board stays keyboard-movable via the per-card status
  `<select>`. **R6.5 dark mode DEFERRED** (locked light-only). **Completes Phase R6.**
- [x] **R7 Internal rename + responsive QA.** ✅ R7.1 identifier + cookie rename (one tested commit):
  extension `createDossierProvider`→`createKiwiplyProvider` (`tracking.js`/`sync.js`/test/ARCHITECTURE;
  ext v0.21.4), web cookies `dossier_access`/`dossier_refresh`→`kiwiply_*` (`auth.ts` string values
  only — route handlers go through helpers). Forces a one-time re-login. IDB names (`dossier`/
  `dossier-fieldcache`) + gecko id intentionally kept (data/infra). · ✅ R7.2 responsive QA — public
  pages (landing/pricing/privacy/login/signup) verified **0px horizontal overflow at 360px** (and
  clean to 1440px) via the preview; auth brand panel correctly collapses to form-only on mobile;
  marketing nav links hide < sm leaving the CTAs. Gated pages audited statically against §9
  (drawer+top-bar < lg, `overflow-x-auto` sub-navs, `sm:grid-cols-2` forms, board intentional scroll,
  `w-full max-w-md` slide-over) — live pass pending a running stack. **Completes Phase R7 + the whole
  redesign (R0–R7).**

---

## Log
> One line per completed task: date · task · note.
- 2026-06-28 · admin-side plan drafted · New `ADMIN-PLAN.md` (admin console, ops, legalities) + a
  **Phase 9** section (9.A0→9.A5 + cross-cutting) here and a pointer in `ROADMAP.md`. Locked: PII =
  metadata + reason-gated; in-app `/admin`; A0 (default-admin seed fix) first. Includes the upcoming
  **Email Subscription** (9.A4) and **Bug report** (9.A5). Planning only — no code yet.
- 2026-06-28 · input validation + length caps across the web forms · Centralized limits/validators in
  `lib/validate.ts` (`LIMITS`, `isUsername`, `isPhone`; `isEmail`/`isUrl` now length-bounded). Signup:
  username pattern (letters/digits/`._-@+`, ≤50, mirrors JHipster login), email format+254, password
  4–100 — enforced in the form AND the signup BFF (defense-in-depth). Login/forgot/reset: `maxLength`
  caps + reset password 4–100. BioEditor: phone validation + per-field `maxLength` (names 100, email 254,
  url 2048, address 200) + skill length cap. ResumeUpload: resume name capped 100 (UI) and ≤200 in the
  upload + PUT BFF routes (matches ResumeDTO `@Size(max=200)`); experience/education/summary/bullet caps.
  Profile payload already capped (100KB). `tsc`+`eslint`+`build` green. Held locally.
- 2026-06-28 · **rate-limiting incident + fix (deployed)** · The Spring per-IP limiter shipped at 20:0x
  broke **all** signups (502 "Couldn't create the account.", no verification email) because login/
  signup/reset proxy browser→Next→Spring over the internal network → Spring sees one IP for everyone →
  shared `/api/register` bucket hit 429 → BFF maps non-201/400 to 502. **Hotfix:** Spring limiter default
  → OFF (`RATE_LIMIT_ENABLED:false`). **Real fix:** moved limiting to the Next BFF (`lib/rate-limit.ts`),
  keyed on the real client IP (Caddy's last X-Forwarded-For hop), wired into all four auth routes.
- 2026-06-28 · **earlier items pushed to origin** (CI + Deploy green): Terms, cookie consent, password
  reset, the (now-disabled) Spring rate limiter, smaller logo, docs, + the held extension UI batch.
- 2026-06-28 · marketing top-bar logo trimmed `height=34`→`30` (`(marketing)/layout.tsx`); footer/app-shell
  logos unchanged. Web build green.
- 2026-06-28 · PL.2 per-IP rate limiting (API) · `RateLimitFilter` (runs ahead of Spring Security,
  `@ConditionalOnProperty dossier.rate-limit.enabled`, default on) delegating to a pure, clock-injected
  `FixedWindowRateLimiter`; limits login/register/reset-init/reset-finish → 429 + Retry-After. In-memory,
  per-instance (single container). Disabled in the test profile. New `FixedWindowRateLimiterTest` (5)
  passes on JDK17; `compileJava`/`compileTestJava` green. ITs run in CI (need Docker).
- 2026-06-28 · password-reset flow (web + email wiring) · Backend init/finish already existed; added web
  `/forgot-password` + `/reset-password` pages + forms + `AuthCardShell`, BFF routes (`/api/auth/forgot-
  password` never leaks email existence; `/api/auth/reset-password`), and a "Forgot password?" link on
  login. Fixed a latent bug: reset/creation **emails** linked to a 404 web path — repointed both
  templates (+ test copies) to `/reset-password?key=`. `tsc`+`eslint`+`build` green.
- 2026-06-28 · PL.1 cookie consent (web) · `CookieConsent.tsx` replaces always-on `<Analytics/>`; gtag
  loads only after Accept (banner only shown when analytics is configured; reads choice via
  `useSyncExternalStore`). Privacy policy updated (analytics now opt-in). `build` green.
- 2026-06-28 · PL.1 Terms of Service (web) · `/terms` page + footer/signup links; signup blurb now cites
  Terms + Privacy. `build` green.
- 2026-06-28 · extension UI batch (held local) · softer rounded corners across popup/options/overlay
  (v0.24.2), popup polish (v0.24.3), resume-picker width clamp + name truncation (v0.24.4), and EEO
  answers always included with the popup/options toggle removed (v0.24.5). `npm test` green each.
- 2026-06-26 · extension↔web integration: kill the duplicate options page (branch `ui-redesign`,
  ext 0.22.0→**0.23.0**) · The extension no longer manages profile/resumes/account — kiwiply.com is the
  single source of truth. **(A)** API `POST /api/extension/session` mints a separate extension token
  pair (own refresh family); web `GET /api/extension/token` + a gated `/connect` page hand it off.
  **(B)** manifest `externally_connectable` (kiwiply.com) + SW `onMessageExternal` store the session —
  single web sign-in, no extension login. **(C)** options page rebuilt **slim** (device settings +
  connected account only; bio editor / resume manager / login / sync-now / rules-url / danger-zone
  removed) → local store is a **read-only mirror**. **(D)** popup "Manage"→dashboard, new Settings link,
  pulls the mirror on open (throttled) + one-time push of local-only resumes (no data loss); resume
  *create* push kept for the future ad-hoc-resume feature; first-install opens kiwiply.com/connect.
  **(E)** docs + locked-decision updates. API compiles (JDK17), web `npm test`+build green, ext
  `npm test` green. PENDING ops: set `NEXT_PUBLIC_KIWIPLY_EXTENSION_ID`, publish the extension (manual
  CWS), optionally pin the manifest `key`; users re-connect once. Plan: `distributed-brewing-lynx.md`.
- 2026-06-26 · real ATS logos in hero marquee (branch `ui-redesign`) · Swapped the hand-made cream
  monogram SVGs for the **real brand logos** (user-added `*-dark-mode.svg` at repo root). Rasterized
  each to a compact transparent PNG at 88px tall via sharp (`web/public/ats/*.png`, ~5–17KB each, ~53KB
  total vs ~3MB of source SVG); pointed the marquee `ATS` array at them and deleted the old placeholders.
  Verified on the landing page: all 5 load, correct aspect ratios, legible on the dark hero, contained to
  the left column, 0 overflow. `npm run build` green.
- 2026-06-26 · full-page editable resume review (branch `ui-redesign`) · Rebuilt `ResumeUpload`: after a
  parse, the review now opens as a **full-page overlay** (`fixed inset-0 z-[150]`, below toasts' z-200)
  with an **✕ / Esc** to exit back to the Resumes page. Everything is **editable** — contact, summary,
  skills (chips + base-overlap coloring), experience (title/company/location/dates/current + editable
  **bullets**, add/remove), education (school/degree/field/dates/gpa/location, add/remove). **Detected
  contact** is a **collapsible** section with an "Update base profile" button (top-right) that merges
  the detected contact into the base profile via `PUT /api/profile`, **enabled only when a detected
  value differs** from the base. Fixed the **name + Save** alignment (shared `items-stretch` row). The
  Resumes page now passes the full `baseProfile` bio (was just `baseSkills`). `npm test` + build green.
  NOTE: gated page + needs a file upload to exercise — verified build/lint/code-review; live visual
  pending a logged-in upload.
  still docking ~64px above the viewport bottom (fields peeked in the gap). Root cause: the earlier
  `lg:h-dvh`/`overflow-auto` made **main** the scroll container, so `sticky bottom-0` docked at main's
  content box — above its `lg:pb-16`. Fix: reverted to **window scroll** + a **sticky sidebar**
  (`lg:sticky lg:top-0 lg:h-dvh` on the aside, `lg:items-start` on the grid; dropped main's
  `overflow-auto`/`lg:h-dvh`, added `min-w-0`). Sidebar still stays visible on long pages; the opaque
  save bar now docks flush to the viewport bottom with no field beneath it. `npm test` + build green.
- 2026-06-26 · hero marquee containment (branch `ui-redesign`, batched) · The ATS marquee's wide
  `w-max` track was inflating the left hero grid column's min-content, blowing out the `1.05fr/.95fr`
  split and pushing the right-hand product visual off-screen. Fixed with **`min-w-0` on the left
  column** (+ `w-full min-w-0 max-w-full` on the marquee box) so the column holds its fr share and the
  marquee's `overflow-hidden` clips to it. Verified locally: marquee width == left column, right visual
  within viewport, **0 horizontal overflow at 1280/768/375**, animation intact. `npm run build` green.
- 2026-06-26 · board empty stages + profile save-bar dock (branch `ui-redesign`, batched for one deploy)
  · **Board** now always renders the six stage columns (empty) instead of a full-screen empty state — a
  dashed hint banner explains how they fill, and the tools row is hidden until there are entries.
  **Profile save bar** was translucent (`color-mix … transparent` + backdrop-blur), so fields showed
  through it while scrolling — made it a solid **opaque `bg-app-bg` docked footer** (z-10 + top shadow)
  so content scrolls hidden behind it. `npm test` + `npm run build` green. Web-only.
- 2026-06-26 · base skills vs resume skills (branch `ui-redesign`) · Established **base skills** as a
  distinct layer from per-resume extracted skills. Profile: the Skills section is relabeled **Base
  skills** ("always applied, on top of whichever resume you choose") and the resume-autofill no longer
  pulls skills into it (fills profile fields only — keeps the base list curated/bare). Resumes: the
  upload review now **color-codes extracted skills** — green = already a base skill, brown = new in this
  resume — with a legend (the page passes `bio.skills` from `/api/profile` into `ResumeUpload`).
  `npm test` + `npm run build` green. Web-only. Interpretation noted: separating the layers means the
  profile autofill intentionally stopped importing skills — flag if you wanted it to keep doing so.
  (`BioEditor`): added **"Autofill from your resume"** (in-browser `parseResume`, fills empty fields +
  merges skills, keeps existing entries); promoted **EEO/demographics** from a collapsible to its own
  always-visible section placed **before Skills**; flagged required fields (firstName/lastName/email)
  with a `*` + legend and added required/email/URL validation (advisory — autosave still never blocks);
  the save status now shows a **spinner + "Saving…"** and a **green check + "All changes saved"**.
  **AppShell**: sidebar is now full-height & internally scrollable on lg (`lg:h-dvh`, nav always
  visible on long pages) instead of scrolling away; added a **collapsible icon-only rail** (toggle
  persisted via `localStorage` through `useSyncExternalStore` to avoid a setState-in-effect; grid
  reflows `236px↔76px`); `SignOutButton` gained an icon-only collapsed mode. Fixed the **board icon**
  (bars now sit on a baseline — was upside-down) and the **settings gear** (swapped to the Lucide path
  that fits the 24×24 box — was clipping). `npm test` + `npm run build` green. NOTE: profile/dashboard
  are auth-gated; verified build/lint/SSR-no-500 + code review, but a live visual pass needs a
  logged-in session (no local backend here). Web-only — no extension change.
  hand-built "filler" brand text/CSS marks with the **actual logo assets** everywhere: web favicon now
  `app/icon.png` (from logo-icon), dark auth panel + activate page use the kiwi `logo-icon.png`, auth
  mobile brand uses the full `logo.svg`. Removed the stray top-bar logo I'd added on auth and pinned the
  **Back** control to the light section's top-left corner (absolute → no added height). Hero gained a
  continuous **ATS logo marquee** (new monochrome SVGs in `web/public/ats/` for Workday/Greenhouse/
  Lever/Ashby/Workable, two-track `@keyframes marquee`, reduced-motion-safe) replacing the static band;
  top nav swapped Privacy→Pricing (`/#pricing`). Extension: popup + overlay use the real `logo.png`
  lockup, options rail uses the kiwi icon, popup + overlay panel got **rounded corners**, chrome-bar
  icons regenerated from `logo-icon.png` (sharp 16/48/128), `icons/*` added to web_accessible_resources;
  ext version 0.21.4→**0.22.0**. Verified in a browser (marquee animating + correct aspect, auth
  desktop/mobile, favicon, asset 200s, no console errors). `npm test` (ext + web) + `npm run build` green.
  standalone `/pricing` route — pricing now lives only on the landing `#pricing` section; dropped the
  top-nav Pricing tab; footer + settings "See plans" point at `/#pricing`; removed the dead "See full
  pricing →" link. Landing: new **ATS logo-wall** band (monogram tiles for Workday/Greenhouse/Lever/
  Ashby + "many more") replacing the plain hero name list; Pro card drops the "— /mo" and gains a
  **Custom job recommendations** feature. Header/footer **logo enlarged** (28→34 / 22→26). Footer:
  removed the "data stays yours…/Privacy Policy" sentence so the beta disclaimer sits on **one line**.
  Auth: **Back-to-home** control + real Kiwiply logo on the login/signup form side at every breakpoint.
  Privacy: fixed a JSX whitespace mash ("notuse"→"not use"). Verified in a browser (logo wall, 404 on
  `/pricing`, one-line footer, signup back+logo at mobile+desktop, privacy spacing). `npm test` +
  `npm run build` green. Web-only — no extension change, no version bump.
- 2026-06-25 · beta tag + disclaimer (post-redesign, branch `beta-tag`→`ui-redesign`) · New
  `BetaBadge` ui primitive (light + dark tone); shown next to the wordmark in the marketing header +
  footer, the app sidebar (desktop + mobile top bar), and the auth brand panel + mobile lockup. Legal:
  a footer **beta disclaimer** ("as is"/"as available", may change/be interrupted, your data stays
  exportable/deletable), a one-line beta note on the signup agreement text, and a new **"Beta
  service"** disclaimer section leading the `/privacy` policy (as-is, no warranties, limitation of
  liability "to the extent permitted by law"). Verified in a browser (header badge, footer disclaimer,
  privacy section). `npm test` + `npm run build` green. NOTE: not a substitute for a full Terms of
  Service + legal review (still part of PL.1). Web-only.
- 2026-06-25 · redesign.R7.2 (responsive QA) — **completes Phase R7 + the whole redesign (R0–R7)** ·
  Drove the public pages (landing/pricing/privacy/login/signup) at 360px in the preview: **0px
  horizontal overflow** on every page; the auth split-screen brand panel correctly collapses to
  `display:none` (form-only) on mobile; landing nav links hide < sm leaving the CTAs; re-checked at
  1440px (only the scrollbar, no overflow). Gated pages audited statically against §9 (mobile drawer +
  top bar < lg, `overflow-x-auto` sub-navs, `sm:grid-cols-2` form grids, board's intentional
  horizontal scroll, `w-full max-w-md` slide-over) — a live pass is pending a running stack. No
  overflow fixes needed. Redesign is feature-complete on `ui-redesign`; only the go-live
  `ui-redesign`→`main` merge remains (user decision). Branch `phase-7`.
- 2026-06-25 · redesign.R7.1 (internal rename) · One coordinated, tested commit. **Extension:**
  `createDossierProvider`→`createKiwiplyProvider` across `tracking.js` (def+export+comments), `sync.js`
  (call), `tracking.test.js` (13 calls), and `ARCHITECTURE.md`; ext **v0.21.4**; 14 suites green.
  **Web:** the auth cookie names `dossier_access`/`dossier_refresh`→`kiwiply_access`/`kiwiply_refresh`
  — changed the two string values in `auth.ts` only (route handlers go through its helpers; grep
  confirmed no other refs). **Forces a one-time re-login** for existing users (old cookies stop being
  read). Intentionally **kept** the `dossier`/`dossier-fieldcache` IndexedDB names (renaming orphans
  users' local resume/field-cache data) and the gecko addon id (published identity) — infra, not UI.
  `npm test` (web tsc+eslint) + `npm run build` + extension suite all green. Branch `phase-7`.
- 2026-06-25 · redesign.R6.6 (a11y) — **completes Phase R6** · Added a global `:where(a,button,summary,
  [role=button],[role=switch],[tabindex]):focus-visible` accent outline in globals.css (specificity-0
  so component focus styles still win; form controls keep their own), darkened `--muted`
  `#73746E`→`#686962` to clear WCAG AA (4.5:1) on `--paper` for small secondary text, and added
  **Escape-to-close + focus-on-open** to the board JD slide-over (already `role=dialog aria-modal`) and
  **Escape** to the app-shell mobile drawer. Board remains keyboard-operable via the per-card status
  `<select>` (the DnD a11y fallback). **R6.5 dark mode deferred** (locked light-only). `npm test` +
  `npm run build` green. Branch `phase-6`. Web-only.
- 2026-06-25 · redesign.R6.4 (validation) · Added inline form validation through the `Field` error
  slot (+ `aria-invalid` on Inputs), no new deps — new `lib/validate.ts` (`isEmail`/`isUrl`). **Auth**
  (`AuthScreen`): login + signup validate on blur/submit and **block submission** on error (required;
  signup adds email-format + min-4 password). **Profile** (`BioEditor`): advisory email + URL checks
  shown after blur — never blocks the autosave (freeform draft). **Verified in a browser**: empty
  signup submit → 3 required errors + aria-invalid, submission blocked; "notanemail" → "Enter a valid
  email address". `npm test` + `npm run build` green. Branch `phase-6`. Web-only.
- 2026-06-25 · redesign.R6.3 (empty states) · Unified the full-list empties onto the R0.2
  `EmptyState` primitive: the **empty board** (🗂️ "Your board fills itself" + an "Upload a resume to
  start" ghost CTA) and the **empty resume list** (📄 "No resumes yet") now use it instead of ad-hoc
  dashed divs. Also added a **"no applications match your search or filter"** state when the board's
  tools filter everything out (distinct from the truly-empty board). Dashboard recent-activity keeps
  its lighter inline empty (it sits inside a panel card). `npm test` + `npm run build` green. Branch
  `phase-6`. Web-only.
- 2026-06-25 · redesign.R6.2 (skeletons) · Added route-segment `loading.tsx` fallbacks for the five
  server-fetched app pages (dashboard, board, resumes, profile, settings), each built on the R0.2
  `Skeleton` primitive and shaped to its page's real layout (KPI grid, 6 kanban columns, drop-zone +
  list, sub-nav + form grid, sub-nav + cards) so the shell stays put while the page streams. Skeleton
  imported directly (`@/components/ui/Skeleton`) to keep the client toast barrel out of these server
  fallbacks. `npm test` + `npm run build` green (22 routes). Branch `phase-6`. Web-only.
- 2026-06-25 · redesign.R6.1 (toasts) — **Phase R6 begins (web)** · Added the toast **system** on top
  of the R0.2 `Toast` primitive: `ToastProvider` (context + queue, auto-dismiss 4s, bottom-right
  `aria-live` viewport, slide-in via a `toast-in` keyframe in globals.css) + a `useToast()` hook,
  exported from the ui barrel and mounted in the root layout (wrapping children under `<Analytics>`).
  Wired it to replace inline "Saved" text: ResumeUpload save → green success toast (removed the inline
  box + `savedLabel` state); ResumeList archive/restore/delete → success toasts (were silent). 409
  archive-guard stays an inline callout (contextual, not transient). `npm test` + `npm run build`
  green; landing renders with the viewport mounted. Branch `phase-6`. Web-only.
- 2026-06-25 · redesign.R5.4 (overlay polish) — **completes Phase R5** · The review overlay (Shadow
  DOM) gets sharper fill micro-states — the Fill button reads **"Filling…"** then **"Advancing…"**
  (auto-advance) — and a **"↻ regenerate draft"** button on AI-assisted rows: it re-asks the service
  worker for that question (new `JAF.assist.draft` export; assisted items now carry `question`+`context`),
  shows "Drafting…" in the value cell, and swaps in the new answer (or restores the old on
  error/disabled). Added `.row.assisted`/`.regen` styles to the inline `CSS_TEXT`. Kept the green left
  border, the "never clicks Submit" note, and Shadow-DOM isolation. ext **v0.21.3**; 14 extension
  suites green (exit 0). **Phase R5 done.** Branch `phase-5`. *Live reload-in-Chrome check is the user's step.*
- 2026-06-25 · redesign.R5.3 (options polish) · Made the **save bar sticky** (`.actionbar` sticky
  bottom + blurred backdrop — stays reachable on the long bio/settings tabs). **Grouped the AI
  settings** into one "AI answer drafting" card with two clearly-labeled sub-options — *Bring your own
  key* (Anthropic) vs *Kiwiply AI · no key needed* (Gemini + consent) — all input ids unchanged so
  options.js is untouched. Finished the extension re-token: defined `--accent-soft` (skill **chips were
  rendering blue** via a `#eef1ff` fallback) + `--brown-soft`, and swapped the remaining gold/navy
  hexes (drop-zone, "needs review" badge, drawer scrim, mini-add) to kiwi. Date controls were already
  Month/Year dropdowns (re-tokened in R5.1). ext **v0.21.2**; 14 extension suites green (exit 0).
  Branch `phase-5`. *Live reload-in-Chrome check is the user's step.*
- 2026-06-25 · redesign.R5.2 (popup polish) · Popup header now shows the **brand lockup** — a CSS
  kiwi mark (brown disc + lime + charcoal ✓) + two-tone wordmark (green `kiwi` via `--accent-deep` +
  ink `ply`). Clearer states: the bio-warn is now clickable (→ Manage) with sharper copy; resume meta
  shows the file status colored (green `file ✓` / brown `no file`); and `setStatus` gained a green
  **success** state used for "Review panel open" + "Saved". `popup.css` got the lockup/`--brown`/meta/
  status styles. ext **v0.21.1**; 14 extension suites green (exit 0). Branch `phase-5`. *Live
  reload-in-Chrome check is the user's step.*
- 2026-06-25 · redesign.R5.1 (extension re-token + rename) — **Phase R5 begins (extension)** ·
  Re-tokened the extension to the kiwi palette: `popup.css` + `options.css` `:root` swapped to §3.1
  values (green text uses `--accent-deep` for legibility), and the **overlay's Shadow-DOM `CSS_TEXT`**
  (filler.js) rewritten with kiwi tokens declared on `:host` (mirrors web globals.css — never inherits
  page CSS), green left border, and the **AI badge fixed to charcoal-on-lime** (cream-on-lime was
  unreadable). Renamed every user-facing "Dossier"→"Kiwiply": manifest `name` + toolbar `default_title`,
  popup/options `.brand` + all options copy/toggles ("Kiwiply AI"), overlay brand + auto-advance note,
  the Workday "re-run" message, and `PRIVACY.md` (incl. contact `privacy@dossier.app`→`support@kiwiply.com`,
  PL.1). **Internal identifiers left for R7.1** (`createDossierProvider`, the `dossier`/`dossier-fieldcache`
  IDB names, the gecko addon id) + dev docs (README/BROWSERS/ARCHITECTURE). Versions bumped
  `manifest.json` + `package.json` → **0.21.0** (ruleset unchanged → smoke green); 14 extension suites
  green (exit 0). Branch `phase-5`. *Live reload-in-Chrome verification is the user's step.*
- 2026-06-25 · redesign.R4.4 (settings sub-nav) — **completes Phase R4** · Restructured `/settings`
  into a **section sub-nav** (new client `SettingsNav` with IntersectionObserver scroll-spy, mobile
  pill row) + five cards: **Account** (read-only info + link to Profile), **AI & drafting** and
  **Autofill behavior** (surfaced informationally with an "in the extension" tag — these settings
  live in `chrome.storage`, not the backend, so functional web toggles would need a user-prefs
  store = out of presentation-only scope), **Privacy & data** (policy link + data-request email +
  the danger zone), **Billing** (Free-plan placeholder → /pricing). Reskinned `DeleteAccountButton`
  to kiwi tokens (type-to-confirm DELETE logic preserved; now uses the `Input` primitive + danger
  card). Widened to `max-w-4xl`. `npm test` + `npm run build` green (gated page — live visual pending
  a running stack). **Phase R4 done; R5 moves to the extension.** Web-only.
- 2026-06-25 · redesign.R4.3 (board reskin) · Rebuilt `ApplicationBoard` on kiwi tokens: **board
  tools** (search over company/role/location, filter-by-resume, sort recent/company), **HTML5
  drag-and-drop** between the 6 columns with optimistic local state reconciled to the server on
  `router.refresh()` (the `<select>` stays as the a11y/fallback control), the **"Did you submit?"
  nudge** restyled as the signature accent callout, and a **card-detail slide-over** (right sheet +
  scrim, full-width on mobile) surfacing the captured **job description** (`jobDescription` was
  already in `ApplicationDTO` — added to the web type, no backend change), resume sent, ATS,
  dates + a status `<select>`/delete. Richer empty state. status/confirm/delete mutations unchanged
  (`/api/applications/:id`). Lint fix: render-phase prop→state sync instead of setState-in-effect.
  `npm test` + `npm run build` green (gated page — live visual pending a running stack). Web-only.
- 2026-06-25 · redesign.R4.2 (resumes reskin) · `ResumeUpload` gets a real **drag-and-drop
  drop-zone** (click/keyboard/drop → same in-browser parse), reskinned review cards (contact/summary/
  skills/experience/education) on kiwi tokens; flow (parse → POST `/api/resumes/upload`) unchanged.
  `ResumeList` rebuilt as **variant cards** (DOC file icon, status badge Needs-review/Ready via the
  `Badge` primitive, "Added … · used in N applications", Archive/Restore + Delete) with a friendly
  **brown 409 archive-guard callout** + inline "Archive instead" (was a raw red error). Resumes page
  now also fetches `/api/profile/applications` to compute per-resume usage counts; widened to
  `max-w-3xl`. Archive (PUT)/delete (DELETE, 409 guard)/upload flows all preserved. `npm test` + `npm
  run build` green (gated page — live visual pending a running stack). Web-only.
- 2026-06-25 · redesign.R4.1 (profile reskin) — **Phase R4 begins** · Rebuilt `BioEditor` onto the
  kiwi system: left **section sub-nav** (Identity & contact / Location / Links / Work auth / Skills /
  EEO) with IntersectionObserver scroll-spy + mobile horizontal-scroll pill row; **profile-strength
  meter** (derived from core fields); grouped sections with Fraunces section titles; **skills chip
  editor** (`bio.skills`, Enter/comma to add, backspace/×  to remove); **EEO** moved into an opt-in
  `<details>` collapsible — all keys + option values mirror the extension's `options.js` exactly (no
  guessing). **Autosave** (1.5s debounce) + a sticky save bar with saved/unsaved status; the merge-
  over-`initialBio` PUT `/api/profile` flow is unchanged so unmanaged fields survive. Profile page
  widened to `max-w-4xl`. `npm test` + `npm run build` green (gated page — live visual pending a
  running stack). Web-only.
- 2026-06-25 · redesign.R3.1 (split-screen auth) — **completes Phase R3** · New shared
  `components/auth/AuthScreen.tsx` (client) drives both `/login` + `/signup` (now thin wrappers):
  split-screen with a charcoal brand panel (BrandLockup cream wordmark + value prop + testimonial,
  hidden < lg, mobile lockup instead), a tabbed **Sign in / Create account** toggle (navigates between
  the two routes), kiwi-token forms built on the `Input`/`Field` primitives, a **stubbed "Continue
  with Google"** (disabled, multicolor G), and the signup check-email done-state. Login →
  `/dashboard`; the POST flows to `/api/auth/{login,signup}` are unchanged. Reskinned
  `/account/activate` as a branded card (Mark + Verified/Action-needed status pill, kiwi tokens,
  Kiwiply naming). `npm test` + `npm run build` green; verified via DOM eval (screenshot tool hung on
  the full-bleed route — layout confirmed correct: gradient panel, exact-viewport height, no overflow).
  Branch `phase-3`. Web-only.
- 2026-06-25 · redesign.R2.3 (privacy reskin + real contact) — **completes Phase R2** · Reskinned web
  `/privacy` onto the kiwi system (Fraunces section headings, `text-ink-soft`/`text-muted` body,
  green `accent-deep` links — dropped all `text-foreground/*`), renamed every user-facing "Dossier"
  → "Kiwiply" (verified zero "dossier" mentions in-page), and replaced the placeholder
  `privacy@dossier.app` with the real monitored **`support@kiwiply.com`**. `metadata` title → "Privacy
  Policy" (template adds "· Kiwiply"). Dropped the redundant inline back-link (marketing shell header
  owns nav). **Visually verified** in a browser (mailto + no-Dossier check via eval). Also documented
  the kiwiply.com **email architecture** (admin-owned Brevo → no-reply@; support@/contact-us@ →
  Gmail; reply-as via Brevo SMTP; Cloudflare DKIM/SPF/DMARC) in `DEPLOY.md §9.1` + new
  `email-architecture` memory; PL.1 contact item part-resolved. `npm test` + `npm run build` green.
- 2026-06-25 · redesign.R2.2 (pricing) · New `(marketing)/pricing/page.tsx` — three tiers (**Free**
  live w/ "Start here" badge + Get started; **Pro** "Coming soon" w/ disabled "Notify me at launch";
  **Teams** Custom → `mailto:hello@kiwiply.com`) per the locked Free-only/Pro-coming-soon decision,
  plus a 4-item FAQ (free forever, BYO key, no auto-submit) and a closing CTA. Added a **Plan /
  Billing placeholder** card to `(app)/settings` (Free badge + "See plans →" → /pricing; no Stripe).
  Resolves the R1.1 transient — header/footer `/pricing` links now land. `metadata` title set.
  **Visually verified in a browser** (desktop screenshot: 3-col tiers + FAQ grid). `npm test` + `npm
  run build` green (`/pricing` prerendered). Web-only.
- 2026-06-25 · redesign.R2.1 (landing rebuild) — **Phase R2 begins** · Rebuilt
  `(marketing)/page.tsx` on the kiwi system: full-bleed **charcoal hero** (eyebrow tag, Fraunces
  headline, lede, dual CTA, trust strip) + a **product-peek** card mocking the review-autofill
  overlay (field/value rows, green checks, AI badge); **how-it-works** (3 steps), **features** (4
  cards), and a **pricing teaser** (Free live + Pro "coming soon" per the locked decision) linking to
  `/pricing`. Header/footer come from the `(marketing)` shell. **Visually verified in a real browser**
  (`next start` + screenshots, desktop): hero 2-col, steps 3-col, features 2×2, pricing 2-col. Caught
  + fixed a tailwind-merge bug — the dark-surface "ghost" CTA inherited `text-ink` (charcoal-on-
  charcoal, invisible); gave it an explicit class. Added `.claude/launch.json` (local-only preview
  config, untracked). `npm test` + `npm run build` green. Branch `phase-2`. Web-only.
- 2026-06-25 · redesign.R1.2 (dashboard) — **completes Phase R1** · New `(app)/dashboard/page.tsx`
  (server-rendered, parallel fetch of account+applications+resumes+profile): KPI row (applications /
  interviews / response-rate / drafts-to-confirm, all derived from real application statuses), a
  "Finish setting up" activation checklist (contact details, resume, work-auth — verifiable items
  drive the % ; extension-install shown as a tip), quick actions (resume/profile/board), and a
  recent-activity feed (newest-first, relative time, status pills incl. the brown "Draft — confirm?"
  nudge) with an empty state. Login redirect switched `/settings` → `/dashboard`
  (`login/page.tsx`). Read-only — the board still owns mutations. `npm test` (tsc+eslint) + `npm run
  build` green (`/dashboard` registered, dynamic). Web-only.
- 2026-06-25 · redesign.R1.1 (route groups + app shell) · Split web routes into Next route groups
  `(marketing)` (`/`, `/privacy`) and `(app)` (`/board`, `/profile`, `/resumes`, `/settings`) — URLs
  unchanged. New `(app)/layout.tsx` gates the session **once** (replacing the four per-page
  `hasSession()` checks) + fetches the account for the sidebar chip; `AppShell` client component =
  persistent left sidebar (5 nav items w/ stroke icons + active state via `usePathname`), user chip +
  sign-out, mobile top bar + hamburger + off-canvas drawer + scrim (persistent ≥lg, drawer below).
  New `(marketing)/layout.tsx` = sticky branded header (Logo + nav + Sign in/Get started) + footer.
  Deleted every hand-rolled per-page `<header><nav>` row; app pages now return a `<div>` (shell owns
  `<main>`), colors moved to kiwi tokens. Light token-pass on the landing (CTAs→`buttonVariants`,
  eyebrow→`Tag`, Kiwiply copy) — full rebuild is R2.1. Added `lib/cn`-based `AppShell`. `npm test`
  (tsc+eslint) + `npm run build` green (groups compile, URLs intact). Branch `phase-1`. Web-only.
  *Transient: `/dashboard` + `/pricing` nav links 404 until R1.2/R2.2 (same branch, not deployed).*
- 2026-06-25 · redesign.R0.3 (brand assets) — **completes Phase R0** · Deleted the create-next-app
  starter assets (`next/vercel/window/globe/file.svg` + `app/favicon.ico`). Authored a vector
  `mark.svg` (kiwi disc + lime + charcoal check, from the prototype `.kmark`) and wired it as the
  App-Router favicon `app/icon.svg`. Added `app/opengraph-image.tsx` (`next/og` `ImageResponse`,
  1200×630 charcoal-hero card with the mark + two-tone wordmark + tagline — check drawn as inline
  SVG to dodge a dynamic-font fetch; verified the rendered PNG). Set root `metadata`: `metadataBase`
  (kiwiply.com), title template, OpenGraph + Twitter card. Added `Wordmark` + `BrandLockup` ui
  primitives (two-tone serif lockup for dark surfaces where the raster logo's charcoal "ply" would
  vanish). `npm test` + `npm run build` green. Web-only.
- 2026-06-25 · redesign.R0.2 (UI primitives) · Built `web/src/components/ui/` ported 1:1 from
  `mockups.html`: `Button` (primary/accent/ghost/danger + `buttonVariants()` for link-as-button),
  `Input`+`Field` (label/error/hint slot, 16px on mobile to dodge iOS zoom, `aria-invalid` styling),
  `Select` (native, custom caret), `Card`, `Badge`+`Pill`, `Tag`, `Switch` (controlled, `role=switch`),
  and new `Toast`/`Skeleton`/`EmptyState`, plus `Logo` (next/image lockup) + `Mark` (CSS kiwi mark).
  All Tailwind-utility based on the R0.1 `@theme` tokens (no copied class strings); barrel `index.ts`;
  tiny dependency-free `lib/cn.ts` joiner. `npm test` (tsc+eslint) + `npm run build` green. Web-only.
- 2026-06-25 · redesign.R0.1 (kiwi tokens + fonts) — **Phase R begins** · Rewrote
  `web/src/app/globals.css` with the §3.1 Kiwiply palette as CSS vars + a Tailwind v4 `@theme inline`
  block (bg-paper/text-ink/border-line/text-accent-deep/font-display/…); dropped the Geist /
  black-white defaults and the `prefers-color-scheme: dark` media query (light-only this pass). Wired
  **Fraunces** (display) + **Inter** (body) via `next/font` in `layout.tsx` (replacing Geist), body =
  Inter on warm `--app-bg`, h1–h3 = Fraunces; metadata title/description → Kiwiply. No
  `--foreground`/`--background` refs remain. `npm run build` + `npm test` (tsc+eslint) green. Web-only
  (no extension bump). Branch `ui-redesign-phase-0`.
- 2026-06-24 · 7.2 (Firefox support) · Targets Firefox 121+ (MV3 `service_worker` background +
  `chrome.*` callback aliases → no `browser.*` rewrite/polyfill). Added `browser_specific_settings.
  gecko` (id `dossier@kiwiply.com`, min 121.0) to the manifest — Chrome ignores it, so one manifest
  + one zip serve Chrome/Edge/Firefox. BROWSERS.md documents it + the **required live `web-ext`
  verification** (background SW is the likely Firefox difference) + an event-page contingency + AMO
  submission. ext v0.20.0; smoke test only asserts ruleset version, 14 suites green. Runtime Firefox
  verification is the user's gate before AMO.
- 2026-06-24 · 7.1 (Edge support) — **Phase 7 begins** · Audited the extension's `chrome.*` usage
  (`storage`/`runtime`/`tabs`/`webNavigation`/`scripting`/`action`) — all Edge-supported, no
  Chrome-exclusive APIs → runs unchanged on Edge (same MV3 bundle, no code change). New
  `job-autofill/BROWSERS.md`: compatibility matrix + Edge sideload (`edge://extensions`) + Edge
  Add-ons submission (Microsoft Partner Center, same zip from `publish-extension.yml`). DEPLOY §8 +
  ARCHITECTURE point to it. Docs-only (no version bump); live sideload check is a quick user step.
- 2026-06-24 · 5.3 (server-side answer caching) — **completes Phase 5** · `AiAnswerCacheService`:
  `questionHash()` (normalized SHA-256, mirrors the extension local-cache key), `lookup`, and a
  `REQUIRES_NEW` `store` (a duplicate-race rolls back only the cache insert). `AiDraftService` checks
  the cache **before the quota gate** — a repeat question returns instantly, no provider call, no
  quota charge, not blocked when over quota; fresh drafts get stored. New repo finder
  `findOneByUserLoginAndQuestionHash`; response gains `cached`. Backed by the existing unique index
  (no migration). `AiDraftServiceTest` +3 cache cases + `AiAnswerCacheServiceTest` (7); backend
  compiled + unit tests green on JDK 17 (ITs run in CI). Backend-only.
- 2026-06-24 · Phase 5 taken **OFF HOLD** · A live call confirmed `gemini-2.5-flash-lite` has
  free-tier quota (the earlier `limit: 0` was specific to `gemini-2.0-flash`). Default model →
  `gemini-2.5-flash-lite` in `AiProperties.java` + `application-prod.yml` + root `.env.example`;
  extension "Use Dossier AI" toggle + consent **re-enabled** (removed the "coming soon" disabled
  state); `DEPLOY.md` §10 flipped from ON HOLD to LIVE (model + gotcha updated); ARCHITECTURE +
  PROGRESS un-held. ext v0.19.2. Extension suite green. Go-live = `DOSSIER_AI_ENABLED=true` +
  `DOSSIER_AI_MODEL=gemini-2.5-flash-lite` on the VPS (key already set). Next: 5.3 answer caching.
- 2026-06-24 · 6.x (analytics master switch — both layers) · Added an explicit on/off switch
  decoupled from the credentials so analytics can be **staged but dark** until launch. Web:
  `NEXT_PUBLIC_ANALYTICS_ENABLED` (default false) — gtag loads only when ID set AND switch true.
  Extension: `DEFAULT_ANALYTICS_ENABLED` (default false) flipped true at inject time by the CI
  `EXT_ANALYTICS_ENABLED` repo variable; per-device dev override `settings.gaEnabled`; user
  `analyticsOptOut` still applies on top. `inject-ga.js` handles the flag (verified ON + staged-OFF);
  analytics test +4 (31); extension suite + web build green. ext v0.19.1. Going live = set
  `NEXT_PUBLIC_ANALYTICS_ENABLED=true` (web) / `EXT_ANALYTICS_ENABLED=true` + republish (extension).
- 2026-06-24 · 6.2 (web analytics) — **completes Phase 6** · `web/src/lib/analytics.ts` (`track()`
  no-op-safe + typed `window.gtag`) + `web/src/components/Analytics.tsx` (loads gtag.js via
  `next/script` only when `NEXT_PUBLIC_GA_MEASUREMENT_ID` is set), mounted in the root layout.
  Funnel events at real success points: `sign_up`, `login`, `resume_saved`, `board_viewed` (coarse
  params, no PII). Measurement ID is a public `NEXT_PUBLIC_` env (gtag needs no secret); blank = off.
  Web `/privacy` got an Analytics section + amended Cookies (first-party analytics cookies, no ad
  cookies), consistent with the extension `PRIVACY.md`; `web/.env.example` documents the var.
  `npm test` (tsc+eslint) + `next build` green. Web-only (no extension bump).
- 2026-06-24 · 6.1 (CI injection) · `.github/scripts/inject-ga.js` + `publish-extension.yml` step
  substitutes `GA_MEASUREMENT_ID`/`GA_API_SECRET` (GitHub secrets) into the bundled `analytics.js`
  at package time — source stays secret-free, only the artifact carries them. JSON-escaped, fails
  loudly if the constants move, syntax-checks the result, and no-ops when the secrets are absent
  (build still succeeds). DEPLOY.md §8 documents the two secrets. Verified locally then restored.
- 2026-06-24 · 6.1 (extension analytics) — **Phase 6 begins** · `src/lib/analytics.js`
  (`JAF.analytics`, SW-safe): GA4 **Measurement Protocol** from the service worker —
  `track(name,params)` fires one POST per event immediately (SW dies ~30s idle, no batching),
  no-ops when unconfigured / opted out; PII-guard `sanitize()` (coarse scalars only, drops
  objects), random `gaClientId`. No telemetry key in the committed bundle (ids empty in source;
  set via config/`settings.ga*`). SW `importScripts` + events `extension_install` / `autofill` /
  `save_job` / `answer_draft` / `application_submitted`. Options opt-out toggle (on by default);
  manifest host perm `www.google-analytics.com`; extension `PRIVACY.md` discloses analytics
  (section + data-use cert + permission row). `test/analytics.test.js` (27); full suite green.
  ext v0.19.0. Branch `phase-6`. Next 6.2: web gtag.js + funnel + sync web `/privacy`.
- 2026-06-24 · Phase 5 merged to `main` + put **ON HOLD ("coming soon")** · Merged `phase-5`→`main`
  (`e0a3f4b`) so the AI infra is deployed but inert. Live prod test surfaced the trial Gemini **free
  tier = `limit: 0`** (project has no free-tier grant; needs billing→paid tier, which is also
  privacy-better since paid inputs aren't used for training). Decision: **hold the feature**, keep
  the infrastructure. Extension Options "Use Dossier AI" toggle + consent now show **"coming soon"
  (disabled)**; prod stays `DOSSIER_AI_ENABLED=false`. Docs: `DEPLOY.md` §10 rewritten (hold status,
  free-tier gotcha, re-enable + rotate/disable steps), PROGRESS Current focus / Phase 5 updated.
  BYO-Anthropic-key path unaffected. ext v0.18.1 (UI-only).
- 2026-06-23 · 5.1b (AI proxy — extension wiring) — **completes 5.1 (+5.2 preserved)** · Options
  "Use Dossier AI" toggle + consent checkbox (`serverAiEnabled`/`serverAiConsent`); `tracking.js`
  `aiDraft({question,context,consent})` → `POST /api/ai/draft`; SW `draftAnswer` restructured to
  try BYO-key (Anthropic direct) first, then the server proxy when enabled+consented+signed-in,
  surfacing quota-exceeded; cached locally on success. tracking jsdom test for aiDraft + base
  stub; full extension suite green. ext v0.18.0.
- 2026-06-23 · 5.1a (server-side AI proxy — backend) · **Phase 5 begins.** Decision: Google Gemini
  **free tier** to start (provider-agnostic, swap later), AI drafting **opt-in + consent** (free tier
  may use inputs to improve Google's services). `POST /api/ai/draft`: `AiProvider` seam +
  `GeminiAiProvider` (plain java.net.http), `dossier.ai.*` env config, per-user monthly quota
  (`ai_usage` table + migration), consent/disabled/quota gating (`AiDraftService`). Key stays
  server-side (never bundled). ArchUnit fix: services take primitives/@Value, not the config class.
  Privacy policies (web `/privacy` + extension `PRIVACY.md`) + `.env.example` + compose updated.
  `AiDraftServiceTest` (6) + `AiResourceIT` (2); full backend `test`+`integrationTest` + web build
  green. Next 5.1b: extension consent UI + route drafting to the proxy.
- 2026-06-23 · 4.1 (field cache cloud sync) — **completes Phase 4** · user-scoped
  `/api/profile/field-caches` (GET + `POST /sync`): batch upsert keyed on `fieldKey`+`contextHash`,
  last-write-wins on value by `updatedAt`, `hitCount`=max (idempotent across re-syncs).
  `FieldCacheSyncService`/`Resource` + `FieldCacheSyncResourceIT` (5). Extension: `field-cache.js`
  `exportAll`/`importEntries`, `tracking.js` `syncFieldCache` + ms↔ISO mappers, `sync.js`
  `syncFieldCache` folded into `syncNow`, options "Sync now" passes `JAF.fieldCache` (bio-email
  profile). Backend+extension suites green; OpenAPI contract regenerated. ext v0.17.0.
- 2026-06-23 · 3.5 (resume archive guard) — **completes Phase 3** · backend
  `ProfileService.deleteResume` → **409** + archive nudge when any application references the
  resume (`ApplicationRepository.countByResumeId`); `ProfileResourceIT` (blocked-delete +
  archive-instead). Web: `DELETE /api/resumes/:id` proxy (passes the 409 detail through) +
  `ResumeList` Delete button surfacing the nudge. Extension: `dtoToResume` syncs `archived`
  (stripped from parsedJson), popup picker hides archived resumes. Backend+web+extension suites
  green. ext v0.16.1.
- 2026-06-23 · phase-3 → main merge · merged 3.0–3.3 to `main` (no-ff, `b434ffe`) → CI/CD
  auto-deploys the applications API to prod (additive, no new migration). `phase-3` fast-forwarded
  to match; 3.4+ continues there.
- 2026-06-23 · 3.4 (web Kanban board) · gated `/board` (server-fetches the user's applications) +
  `ApplicationBoard` client component: 6 columns (Draft→Saved→Applied→Interview→Offer→Rejected),
  per-card status `<select>` move, delete-with-confirm, and the "Did you submit?" nudge on DRAFT
  cards (Yes → APPLIED + `submissionConfirmed` + `appliedAt`; Not-yet → dismiss). New
  `/api/applications/:id` proxy (PUT whitelisted status/confirm, DELETE; owner-scoped 404) →
  `router.refresh()`. Board nav links on resumes/profile/settings. `tsc`+`eslint`+`next build`
  green. Web-only (no version bump).
- 2026-06-23 · 3.3 (save-a-job) · popup "Save this job" button → injects content libs → asks the
  top frame for a capture (`JAF_CAPTURE_JOB`) → SW `JAF_SAVE_JOB` → `appTracking.pushSaved` →
  **SAVED** entry (no resume). Generalized `buildApplication(capture,resume,status)` + `pushSaved`;
  popup.css `.ghost` button. Works with no resume selected; silent "sign in to save" otherwise.
  38 jsdom tests; full suite green. ext v0.16.0.
- 2026-06-23 · 3.2 (auto-log + submission detection) · `src/lib/app-tracking.js`
  (`JAF.appTracking`, SW-safe): DRAFT assembly (company/role fallbacks so every fill logs),
  `pushDraft`/`confirmSubmission`, conservative `isSuccessUrl`/`hasSuccessSignal`. Fill commit →
  filler captures job + resume → `JAF_LOG_FILL` to the **service worker** (owns network, survives
  post-submit nav) → upsert DRAFT, remember per-tab (persisted). APPLIED flip via SW
  `webNavigation.onCompleted` (success URL) or content `submit-detect.js` (`JAF_SUBMIT_DETECTED`,
  in-page confirmation copy). Best-effort/silent (no backend/sign-in ⇒ no-op); 30-min window;
  tab-close cleanup. popup threads resume `{serverId,label}`; SW `importScripts` tracking/sync/
  app-tracking. 31 jsdom tests; full extension suite green. ext v0.15.1. **Live smoke-tested
  end-to-end on a real ATS (fill → DRAFT → confirmation → APPLIED) — passed**; that pass surfaced
  a hardening fix (auto-log retries without the resume link if a stale serverId 404s). **No
  auto-submit** — detection only.
- 2026-06-23 · 3.1 (job-detail capture chain) · `src/lib/job-capture.js` (`JAF.jobCapture`):
  canonical `JobCapture` via JSON-LD (`schema.org/JobPosting` — title/org/location/description/
  identifier; `@graph` + array `@type` + PropertyValue ids, HTML stripped) → per-adapter
  `captureJob({loc})` (Lever/Greenhouse/Ashby/Workable/Workday: externalJobId + atsPlatform from
  the **public URL shape only** — no tenant-DOM guessing, the dossier rule) → generic `og:`/meta/
  canonical. Per-field merge (JSON-LD wins descriptive; adapter authoritative for id+platform).
  Registered in manifest + popup CONTENT_FILES. 31 jsdom tests; full extension suite green.
  ext v0.14.0. Not yet wired into fill/save (3.2/3.3).
- 2026-06-23 · 3.0 (applications API + provider methods) — **Phase 3 begins** · user-scoped
  tracker API at `/api/profile/applications` (bare `/api/applications` is the ADMIN-locked
  generated CRUD; new endpoint follows the `/api/profile/*` convention). `ApplicationSyncService`/
  `Resource`: GET list · POST **upsert** (dedup `externalJobId`→`jobUrl`; re-fill never reverts a
  non-DRAFT entry to DRAFT; resume linkage owner-checked → 404) · PUT partial update (status/
  confirm/edits) · DELETE (dismiss a draft). No migration (1.8 already added the columns + dedup
  index). Extension `tracking.js` implements `pushApplication`/`listApplications`/`updateApplication`/
  `deleteApplication`/`archiveResume` + canonical `applicationToDto`/`dtoToApplication`; base
  contract still throws `NotSupportedError`. `ApplicationSyncResourceIT` (9) + 15 new tracking
  jsdom tests; full backend `test`+`integrationTest` + extension suite green. ext v0.13.0.
- 2026-06-23 · post-2.4 go-live polish · **Custom domain kiwiply.com** (Cloudflare DNS, grey-cloud;
  apex canonical, www/app 301; api.kiwiply.com) — replaced sslip.io, all on Let's Encrypt. Fixed a
  Caddy single-file-bind-mount deploy bug (force-recreate). **Email now sends from no-reply@kiwiply.com**
  (Brevo domain-authenticated). **Extension v0.12.0 prod-ready** (defaults to api.kiwiply.com + host
  perm). CWS dev account created (verifying ~1-2 days); publish workflow action pinned `@v6.0.0`; zip
  artifact built. Docs synced (CLAUDE.md, DEPLOY.md, .env.example, live-deployment memory).
- 2026-06-23 · 2.4 (email verification) — **completes Phase 2** · env-driven SMTP (Brevo, swappable):
  prod `spring.mail.*` + `jhipster.mail.{base-url,from}`; `MAIL_BASE_URL` auto-derives to the web
  app so activation links land on the new `/account/activate` page (calls `GET /api/activate`).
  `.env.example` + compose `MAIL_*` + `DEPLOY.md` §9. Web build green; **prod jar boots with the
  mail config** (verified before it can auto-deploy). Live email test pending user's Brevo creds.
- 2026-06-23 · 2.2 auto-deploy ACTIVATED + 2.3 scaffolded · Walked the user through enabling
  auto-deploy (deploy SSH key on the VPS, `VPS_*` secrets, packages public, `DEPLOY_ENABLED`);
  merged phase-2→main and ran Deploy — **build→GHCR→VPS pull succeeded hands-off**, site verified
  UP with data intact. Then 2.3: `publish-extension.yml` (zip → artifact → CWS publish, gated on
  `PUBLISH_EXTENSION`+`CWS_*`); CWS setup in `DEPLOY.md` §8. VPS is now on `main`, docker rootless.
- 2026-06-22 · 2.2 (CI/CD) · `ci.yml` (extension + web + API suites on PR/push) — **first run
  green on the runners**; `deploy.yml` (merge to main → build api/web images → push GHCR → SSH
  the VPS to pull+restart), deploy job gated on `DEPLOY_ENABLED` + `VPS_*` secrets so build/push
  runs now and auto-deploy flips on after the user's one-time setup (`DEPLOY.md` §7). Compose
  carries `image: ghcr.io/...` next to `build:`. Strategy chosen with the user: build off-box,
  VPS pulls (spares the modest VPS). Next: 2.3 extension auto-publish.
- 2026-06-22 · 2.1 **DEPLOYED LIVE** · stood the stack up on the IONOS VPS end-to-end with the
  user (SSH walkthrough): Docker install (focal/EOL workaround), code on `claude`, `.env`,
  `compose up --build`, freed port 80 from a pre-installed server, Caddy got LE certs for
  `app/api.132-148-79-209.sslip.io`. Verified signup→login→profile→resume-upload→S3 in the
  browser. Gotchas (now in `live-deployment` memory): no SMTP ⇒ new signups land `activated=0`
  (manually activated for testing); login uses username not email; DB is `dossierapi`
  (lowercased). **Decision:** email verification (SMTP) is the gate before public signups — NOT
  auto-activate. Docs synced (IONOS, live status).
- 2026-06-22 · 2.1 (Environments) · **Phase 2 begins.** Decided stack with the user:
  self-managed IONOS VPS + Docker Compose (MySQL + API + web) behind Caddy (auto-HTTPS),
  sslip.io for TLS on the bare IP (no domain yet), AWS S3 private bucket. Shipped multi-stage
  Dockerfiles (web builds from repo root for the parser-core sync; drops Windows `.npmrc`),
  `docker-compose.prod.yml`, `Caddyfile`, `.env.example`, `DEPLOY.md`, root `.gitignore`. Prod
  config: env-required JWT secret, CORS for the extension, S3 storage block. **Verified:** both
  images build; full stack boots on the prod profile; Liquibase migrates; health UP web→api over
  the internal network. Live VPS deploy + Caddy/LE + real S3 upload are the user's deploy-time steps.
- 2026-06-22 · 1.11 (privacy disclosure) — **completes 1.11 + Phase 1** · web `/privacy`
  policy page (collection, in-browser parsing, storage/sharing, retention + self-service
  deletion, GDPR/CCPA rights, cookies), linked from landing footer + signup consent line;
  extension `PRIVACY.md` = Chrome Web Store data-use disclosure (single purpose, permission
  justifications, not-sold certifications). Content only; `tsc`+`eslint`+`next build` green
  (`/privacy` static). Pre-launch TODO noted: legal review + real contact/entity + hosted
  policy URL. Next: Phase 2 (deployment).
- 2026-06-22 · 1.11 (refresh-token rotation + revocation) · auth was stateless JWT with no
  revocation. Added a `refresh_token` denylist (migration + `RefreshToken`/repo/
  `RefreshTokenService`): refresh tokens carry a `jti`; `/api/refresh` now ROTATES (spends
  the presented token, issues a fresh one in the same family) with **reuse detection**
  (replaying a spent token revokes the whole family); new `POST /api/logout` revokes; account
  deletion clears tokens. Clients updated to persist the rotated token: web refresh/logout
  routes + extension `tracking.js` (logout calls `/api/logout`); ext v0.11.0. New
  `RefreshTokenRotationIT` (+deletion/refresh ITs updated, sliced auth test gets a mock
  service). **Live-verified via web**: refresh rotates the cookie → old token 401 → reuse
  revokes the family → logout revokes. Full backend suite + web build + 24 ext tests green.
- 2026-06-22 · 1.11 (account/data deletion — web button) · `DELETE /api/account` Next
  proxy (forwards to Spring, then clears the httpOnly session cookies) + `DeleteAccountButton`
  (Danger zone on /settings; type-DELETE-to-confirm guard → redirect home). **Live-verified
  end-to-end via the web layer**: login→upload→proxy DELETE 200 with Set-Cookie expiring
  both cookies → user-2 rows + MinIO blob gone → re-login 401 → admin untouched.
  `tsc`+`eslint`+`next build` green. Completes the GDPR/CCPA deletion path (backend+web);
  only the privacy-policy text remains (separate disclosure sub-item).
- 2026-06-22 · 1.11 (account/data deletion — backend) · `AccountDeletionService` +
  `DELETE /api/account` (`AccountDeletionResource`): erases the current user's resume
  blobs (object storage), then all their rows (resume/bio/application/ai_answer/
  field_cache), then the user — one transaction, blobs first so a storage failure aborts
  cleanly. `AccountDeletionResourceIT` seeds all five entity types + asserts user+rows
  gone (rolled back). **Live-verified** (API↔MySQL↔MinIO): upload→delete→204, MinIO blob
  gone, user-2 rows+authority-join gone, re-auth 401, admin untouched. Full suite green.
  Web "Delete account" button is the next slice. Backend-only (no version bump).
- 2026-06-22 · 1.11 (multi-tenant leak fix) · the generated entity-CRUD controllers
  (`/api/bios`, `/api/resumes`, `/api/applications`, `/api/ai-answers`,
  `/api/field-caches`) were only `.authenticated()` — any user could read every user's
  rows. Locked all five to ADMIN with class-level `@PreAuthorize`; user-scoped
  `/api/profile`(+`/resumes`) and owner-scoped `ResumeFileResource` untouched. New
  `EntityCrudLockdownIT` (USER→403, ADMIN→200); the five generated ITs now run as ADMIN.
  Full `test`+`integrationTest` green. Backend-only (no version bump).
- 2026-06-22 · 1.10d / 1.10 DONE · bio editor. `PUT /api/profile` proxy + `BioEditor`
  (contact/identity + work-auth fields, matching the extension's canonical bio keys);
  `/profile` page server-fetches the bio and seeds the form; cross-surface nav links.
  Editor **merges over the existing payload** so fields it doesn't manage (extension
  EEO answers) survive a save. **Live-verified**: page renders seeded bio → edit
  firstName → save persists, ethnicity+gender preserved, single-bio upsert (no dupes)
  → unauth 401 → bad-body 400. `tsc`+`eslint`+`next build` green. Completes 1.10 — the
  web management surface (auth + resumes + bio) is done. Next: 1.11 hardening gate.
- 2026-06-22 · 1.10d (in progress) · resume list + archive. Backend: `updateResume`
  is now a partial/PATCH-like update (null field = leave as-is) and honors `archived`,
  so a single-flag toggle can't wipe label/parsedJson; new `ProfileResourceIT` case
  proves archive+preserve through Testcontainers MySQL. Web: `PUT /api/resumes/:id`
  proxy (archive-only), `ResumeList` (active/archived sections, restore), page
  server-fetches the list + `router.refresh()` after save/archive. **Live-verified**:
  upload→list renders→archive (DB `archived=1`, parsed JSON preserved)→unarchive→
  bad-body 400→unauth 401. `tsc`+`eslint`+`next build` green. Remaining 1.10d: bio editor.
- 2026-06-22 · 1.10d (in progress) · in-browser parse+review (`resume-parse.ts`,
  `ResumeUpload`) then save via **Option A** proxy (`/api/resumes/upload` → Spring
  create-row + owner-scoped file upload, 10MB cap, rollback-on-failure). **Live
  round-trip verified clean-slate** (web↔API↔MinIO): login sets httpOnly cookies →
  upload 200 → DB `resume` row (`status=NEEDS_REVIEW`, object key, parsed JSON) →
  MinIO object **byte-identical** to source → unauth upload 401 (no orphan row).
  Remaining 1.10d: resume list + archive, bio editor.
- 2026-06-20 · 0.1 Local field-choice cache · `JAF.fieldCache` (IndexedDB, per-profile);
  `preferCached` on read + `watch` learns corrections; wired into filler; 19 jsdom tests; v0.7.0.
- 2026-06-20 · 0.2 Workable adapter · selectors captured from real ENFOS/TP-Link forms
  (firstname/lastname/email/phone/address/city/postcode/country + resume file input by
  accept); registered in manifest + CONTENT_FILES; 16 jsdom tests + live-DOM check; v0.7.1.
  Note: SmartRecruiters oneclick-ui is open-shadow-DOM — deferred (needs shadow traversal).
- 2026-06-20 · 0.3 Repo hygiene · already satisfied by existing `CLAUDE.md` + decided
  monorepo layout; added `.gitignore`. Phase 0 complete; Phase 1 gated on Neon account.
- 2026-06-20 · 1.1 Backend skeleton · generated `/api` from `dossier.jdl`
  (fixed JDL `maxlength N`→`maxlength(N)`); JHipster 8 / Spring Boot / JWT / MySQL /
  gradle; builds green on JDK 17. Verified live: docker MySQL → `bootRun` → Liquibase
  migrated → `/management/health` `{"status":"UP"}`. Phase 1.1 done.
- 2026-06-21 · 1.2 Auth · stateless access+refresh JWT pair (`token_type` claim;
  strict resource-server decoder rejects refresh-as-access; permissive decoder for
  `/api/refresh`). `/authenticate` → `{accessToken,refreshToken}`; new `/api/refresh`.
  Updated AuthenticateControllerIT + new RefreshTokenControllerIT (8 cases). Full
  `./gradlew test integrationTest` green (Testcontainers, ryuk disabled locally).
- 2026-06-21 · 1.3 Data model · verified generated schema vs ROADMAP; added
  `20260621030000_added_indexes.xml` (unique bio/field_cache/ai_answer lookup keys +
  application user+status index). Full suite green. Backend test runs on this OneDrive
  checkout: `-Dorg.gradle.vfs.watch=false` avoids a build/ delete-lock.
- 2026-06-21 · 1.4 Resume storage · S3-compatible blob layer (AWS SDK v2) for R2;
  StorageProperties/StorageConfiguration + ResumeStorageService + ResumeFileResource
  (upload/download/delete, owner-scoped). MinIO for dev/tests; `S3ResumeStorageServiceIT`
  (4 cases) round-trips against a MinIO Testcontainer. Full suite green. Fixes en route:
  ArchUnit (inject bucket via @Value, not the config class), anonymous creds when no key,
  `@Value` default so the test profile resolves the bucket.
- 2026-06-21 · 1.5 Profile + resume sync · user-scoped `ProfileService`/`ProfileResource`
  (`/api/profile` single-bio upsert + `/api/profile/resumes` CRUD, ownership=404).
  `ProfileResourceIT` incl. cross-user isolation; full suite green. Flagged: raw generated
  `/api/bios`+`/api/resumes` aren't user-scoped — harden in 1.10.
- 2026-06-21 · 1.6 TrackingProvider · `src/lib/tracking.js` — sole backend network seam;
  `createDossierProvider` (auth + profile + resume CRUD, DTO mapping, 401-refresh-retry),
  endpoint via `settings.apiBaseUrl`. 22 jsdom tests; extension v0.8.0.
- 2026-06-21 · 1.7 Login + sync · `src/lib/sync.js` (pull/push orchestration) + options
  Account tab (sign in/up/out, Sync now; pull-on-login, push-on-save). 15 jsdom tests;
  localhost host perm; extension v0.9.0. **Verified end-to-end in Chrome** (sign in →
  pull → edit → push). Fixes found via live run: `dossier.storage` config prefix
  (startup), dev CORS `chrome-extension://*` (403). Backend runs with profile
  [dev, api-docs] → Swagger already on (helps 1.8).
- 2026-06-21 · 1.8 Extend tracking schema · additive migration on the existing backend
  (Application +location/externalJobId/submissionConfirmed, status +DRAFT, Resume
  +archived; dedup index). Entities/DTOs/enum by hand; `20260622000000_extend_tracking_
  schema.xml`; `TrackingSchemaIT` round-trips fields+DRAFT through MySQL; full suite green.
- 2026-06-21 · 1.10c Web auth · httpOnly-cookie session via Next route handlers proxying
  Spring auth (`/api/auth/{login,logout,refresh,signup}`); `lib/auth.ts`+`lib/api.ts`;
  login + activation-aware signup pages; gated `/settings` (reads `/api/account`). Next 16
  async `cookies()`. `tsc`+`eslint`+`next build` green; **verified live e2e** (login→cookies
  →gated settings→refresh→logout→unauth redirect, all green against the running backend).
- 2026-06-21 · 1.10b Web app scaffold · `/web` Next 16 App Router + React 19 + TS +
  Tailwind v4 (TS+Tailwind+httpOnly-cookie auth chosen). Dossier landing; `lib/config.ts`
  server-only API base-URL seam + `.env.example`; `turbopack.root` pinned; `web/.npmrc`
  shell pin. `npm test` = `tsc --noEmit && eslint` + `next build` both green. Auth next (1.10c).
- 2026-06-21 · 1.10a Shared parser module · extracted `parser-core.js` (pure
  heuristicStructure/parseBio/splitSkills; UMD-lite — `JAF.parserCore` + `module.exports`,
  no build step) out of `parser.js` (now I/O-only, delegates). `test/parser_core.test.js`
  proves plain-`require()` consumption (no jsdom/JAF) — the web app imports the same file.
  Bundled self-sufficient `splitSkills` so standalone parsing matches the extension.
  Extension suite green; v0.10.0. Remaining 1.10: Next.js app (gated on stack confirm).
- 2026-06-21 · 1.9 OpenAPI contract · `OpenApiConfiguration` (bearer-jwt scheme) +
  `@Tag`/`@Operation`/`@SecurityRequirement` on the custom auth/profile controllers +
  API identity via `jhipster.api-docs.*` (title "Dossier API"). `OpenApiContractIT`
  asserts `/v3/api-docs` (ADMIN-gated, api-docs profile) covers auth + sync + the 1.8
  tracking fields + DRAFT + bearer scheme, and publishes `api/openapi.json`. Note: the
  test classpath shadows main `application.yml`, so the api-docs title is mirrored in the
  test yml too. Backend-only (no extension bump). Full `test`+`integrationTest` green.

---

## Reusable Claude Code prompt template
Copy, fill the blanks, paste into Claude Code.

```
Context: Read CLAUDE.md and ROADMAP.md first. This is task <ID> from PROGRESS.md.

Goal: <one sentence — the outcome, not the steps>

Scope / files: <which files or folders are in play; "create new under …">

Constraints:
- Follow existing conventions (vanilla JS on window.JAF for the extension; no build step).
- Capture real ATS DOM before writing selectors (dossier rule).
- No auto-submit, ever.

Acceptance criteria:
- [ ] <observable result 1>
- [ ] <observable result 2>
- [ ] Tests added/updated and `npm test` (and backend tests if applicable) green.

When done: bump versions per the ritual, check the box in PROGRESS.md, update
Current focus to the next task, and add a Log line. Do NOT start the next task.
```

## Worked example — ready to run (Task 0.1)
```
Context: Read CLAUDE.md and ROADMAP.md first. This is task 0.1 from PROGRESS.md.

Goal: Learn and reuse the user's per-field answers so repeat fills are instant and
respect prior corrections — fully local, no backend.

Scope / files: src/lib/ (new e.g. field-cache.js), src/content/filler.js
(read cache before fill, write cache on user correction), test/ (new suite).

Constraints: vanilla JS on window.JAF; IndexedDB via the existing storage layer;
no network; no auto-submit.

Acceptance criteria:
- [ ] On fill, if a cached value exists for {field_key, context_hash}, it is preferred.
- [ ] When the user edits a filled field or picks a custom-dropdown option, the
      choice is persisted.
- [ ] Cache is namespaced per profile and survives reloads.
- [ ] jsdom tests cover hit, miss, and overwrite; `npm test` green.

When done: bump manifest + package versions, check 0.1 in PROGRESS.md, set Current
focus to 0.2, add a Log line. Do NOT start 0.2.
```
```
```

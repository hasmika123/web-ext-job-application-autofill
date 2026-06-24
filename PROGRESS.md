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
> **Phase 7 — other browsers.** ✅ **7.1 Edge** + ✅ **7.2 Firefox** done (manifest + docs). The
> extension now targets Chrome, Edge, and **Firefox 121+** from **one manifest + one zip**: Edge is
> pure Chromium; Firefox needs only a `browser_specific_settings.gecko` block (Chrome ignores it) and
> relies on FF's MV3 `service_worker` background + `chrome.*` aliases (no `browser.*` rewrite). Both
> documented in `job-autofill/BROWSERS.md`. ext v0.20.0.
>
> **⚠️ Open verification (user step):** Firefox needs a live `web-ext lint` + `web-ext run`/sideload
> pass before AMO publish — confirm the **background service worker runs** on a real Firefox (the bit
> most likely to differ). Edge sideload is a similar quick check. Neither is testable from here.
>
> **Next: Task 7.3 — Safari** (Apple `safari-web-extension-converter` + Xcode/Mac — the deferred,
> bigger lift). Or treat Phase 7 as effectively done for the consumer browsers (Chrome/Edge/Firefox)
> and revisit Safari later. Read the **Phase 7** section of ROADMAP.md.
>
> *Context:* Phases 2–6 done + Phase 5 complete; product LIVE at https://kiwiply.com. Working branch
> `phase-7`. CWS listing still pending Google verification. Extension at v0.20.0.

## Status legend
`[ ]` not started `[~]` in progress `[x]` done · Each task is sized for one
focused Claude Code session.

---

## Pre-launch checklist (do BEFORE the public Chrome Web Store listing goes live)
> Not phase-ordered — these are gates that must clear before real users / a public CWS
> listing. Pull any into a focused session when launch nears. The 1.11 gate already shipped
> the multi-tenant fix, account/data deletion, and refresh-token rotation; these are what's left.

- [ ] **PL.1 Privacy policy — real contact + legal review.** Replace the placeholder contact
  (`privacy@dossier.app`) with a real address/entity, host the policy at a stable URL, and get
  a legal pass. **Extra-important now that the AI data-use language is in there** (web
  `/privacy` "AI answer drafting" section + extension `PRIVACY.md` "Optional AI answer drafting"
  + the Gemini free-tier training/human-review disclosure). Both files carry inline TODO markers.
- [ ] **PL.2 Basic rate limiting / abuse protection.** Today there is **no general
  request throttling** — only a per-user *monthly* AI quota (`ai_usage`) and refresh-token
  reuse-detection. Before public signups, add coarse abuse protection so nobody can hammer the
  API into the ground or brute-force auth: per-IP rate limits on `/api/authenticate`,
  `/api/register`, `/api/account/reset-password`, and `/api/ai/draft` (login/signup/AI are the
  sharp edges), plus a global ceiling. Cheapest path: **Caddy `rate_limit`** at the edge (no app
  change) and/or **bucket4j** in Spring for per-principal limits. Pair with a small request
  body-size cap at Caddy. (The 10MB resume cap and AI `maxOutputTokens` already bound those two.)

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

---

## Log
> One line per completed task: date · task · note.
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

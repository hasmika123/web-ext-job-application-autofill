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
> **Phase 1 · Task 1.10 — Web app · management surface.** Next.js: signup/login/
> settings PLUS resume upload+review+archive and bio editor. **First extract
> `parser.js` into a shared module** (plain browser JS — pdf.js + mammoth) so the web
> app parses in-browser and the extension imports the same module. Web app = primary
> product; extension = on-page companion. Also lock down the raw `/api/bios`+
> `/api/resumes` controllers if touched (multi-tenant leak; full hardening is 1.11).

## Status legend
`[ ]` not started `[~]` in progress `[x]` done · Each task is sized for one
focused Claude Code session.

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
- [~] **1.10 Web app — management surface.** Next.js: signup/login/settings PLUS
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
    green. **Live sign-in smoke-test pending** (backend was down) — verify before 1.10d.
  - [ ] **1.10d Resume upload+review+archive (imports `parser-core`) + bio editor.**
- [ ] **1.11 Privacy rewrite + multi-tenant hardening.** New privacy policy + Chrome
  Web Store data-use disclosure to match the cloud model. *Required before any public
  release.* **Also harden here (carried from 1.5):** the generated `/api/bios` and
  `/api/resumes` controllers are NOT user-scoped — any authenticated user can read
  every user's rows. Lock them down (admin-only or remove) so only the user-scoped
  `/api/profile`(+`/resumes`) sync API is exposed. **Must not ship public without this.**

## Phase 2 — Deployment + CI/CD
- [ ] **2.1 Environments.** API on Railway (staging + prod); web on Vercel.
  *Carry-over: prod `jhipster.cors` is currently empty (CORS off) — must allow the
  published extension's `chrome-extension://<id>` origin (and the web app origin)
  for the deployed API, mirroring the dev fix from 1.7.*
- [ ] **2.2 Pipeline.** GitHub Actions: run `npm test` + backend tests → build →
  deploy backend on merge to `main`.
- [ ] **2.3 Extension auto-publish.** Build + zip + upload via Chrome Web Store API.

## Phase 3 — Application Tracking (the tracker fills itself as you apply)

> **Pinned decision (3.2):** create the DRAFT entry on **every fill**, not only on
> "complete-looking" fills. It's simpler and we never miss an application. To keep
> the board from getting cluttered, two safeguards: (1) **dedup** — re-filling the
> same job updates the same entry instead of adding a new one; (2) abandoned DRAFTs
> are **easy to dismiss/delete** on the board. Do not gate entry-creation on guessing
> whether the user finished.

- [ ] **3.0 Backend: applications API + provider methods.** User-scoped
  `/api/applications` CRUD (upsert keyed on `externalJobId`/`jobUrl`); implement
  `pushApplication`/`listApplications` in `tracking.js` and add `updateApplication`
  (status/confirm) + `archiveResume` to the provider contract + backend.
- [ ] **3.1 Job-detail capture chain.** Add `captureJob()` to adapters; extractor
  order = `schema.org/JobPosting` JSON-LD → adapter `captureJob()` → generic
  `<meta>`/heuristics. Returns a canonical `JobCapture` DTO (company, role, location,
  jobUrl, externalJobId, atsPlatform, jobDescription). Tests per strategy.
- [ ] **3.2 Auto-log + submission detection.** On fill: upsert a **DRAFT** entry with
  the captured job + the resume the user picked (dedup on externalJobId/jobUrl; see
  pinned decision above). If the extension sees the confirmation (`webNavigation`
  success page or DOM success signal) → flip to **APPLIED**, `submissionConfirmed=true`,
  set `appliedAt`. No auto-submit. (Submission-detection module on the content side.)
- [ ] **3.3 Save-a-job.** One click in the popup → **SAVED** entry via the capture
  chain (no resume attached).
- [ ] **3.4 Web Kanban board + "Did you submit?" nudge.** Next.js board (Draft →
  Saved → Applied → Interview → Offer → Rejected). DRAFT / `submissionConfirmed=false`
  entries show a "Did you submit?" prompt → Yes = APPLIED, No = keep/drop. Manual
  status edits on the board.
- [ ] **3.5 Resume archive guard.** Deleting a resume referenced by any application
  (esp. APPLIED) is blocked with a **nudge to archive instead** (`archived=true`);
  archived resumes are hidden from the active picker but keep their tracker links.
  Enforce server-side (referential check) + surface the nudge in the web UI.

## Phase 4 — Field cache (cloud sync)
- [ ] **4.1 Promote local cache to `field_cache` API**; last-write-wins +
  `hit_count` ranking; sync across devices.

## Phase 5 — AI Integration (server-side)
- [ ] **5.1 Metered `/ai` proxy** on server key (free-tier quota + rate limit).
- [ ] **5.2 Keep BYO-key path** as the unlimited free option.
- [ ] **5.3 Cache answers** in `ai_answers` by `question_hash`.

## Phase 6 — Google Analytics
- [ ] **6.1 Extension events** via GA4 Measurement Protocol from the service
  worker (send immediately — SW dies after ~30s idle).
- [ ] **6.2 Web app** gtag.js + funnel events.

## Phase 7 — Other browsers
- [ ] **7.1 Edge** (near-free on MV3). **7.2 Firefox** (`browser.*` polyfill +
  store submission). **7.3 Safari** (Apple converter — defer).

---

## Log
> One line per completed task: date · task · note.
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
  async `cookies()`. `tsc`+`eslint`+`next build` green; live sign-in smoke-test still pending.
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

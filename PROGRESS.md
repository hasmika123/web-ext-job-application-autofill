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
> **Phase 1 · Task 1.8 — OpenAPI contract published.** Confirm the API exposes a
> springdoc OpenAPI spec (JHipster default) at `/v3/api-docs` + Swagger UI, covering
> the auth + `/api/profile` sync endpoints — the contract a third-party backend
> implements to be Dossier-compatible. *(Note: `/v3/api-docs` is ADMIN-gated by
> default — decide whether to expose it publicly or document how to reach it.)*

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
  needs JHipster activation (use a seeded account locally).*
- [ ] **1.8 OpenAPI contract published.** Confirm the API exposes a springdoc
  OpenAPI spec; this is the contract a third-party backend implements to be
  Dossier-compatible.
- [ ] **1.9 Web app shell.** Next.js: signup/login/settings against the API.
- [ ] **1.10 Privacy rewrite.** New privacy policy + Chrome Web Store data-use
  disclosure to match cloud model. *Required before any public release.*
  **Also harden here (carried from 1.5):** the generated `/api/bios` and
  `/api/resumes` controllers are NOT user-scoped — any authenticated user can read
  every user's rows. Lock them down (admin-only or remove) so only the user-scoped
  `/api/profile`(+`/resumes`) sync API is exposed. **Must not ship public without this.**

## Phase 2 — Deployment + CI/CD
- [ ] **2.1 Environments.** API on Railway (staging + prod); web on Vercel.
- [ ] **2.2 Pipeline.** GitHub Actions: run `npm test` + backend tests → build →
  deploy backend on merge to `main`.
- [ ] **2.3 Extension auto-publish.** Build + zip + upload via Chrome Web Store API.

## Phase 3 — Application Tracking
- [ ] **3.1 Auto-log on submit.** Extension posts company/role/URL/ATS/JD/resume to
  `/applications`.
- [ ] **3.2 Kanban dashboard.** Next.js board (Saved → Applied → Interview →
  Offer/Rejected).
- [ ] **3.3 Save-without-applying + job-board capture** (Simplify/Teal hook).

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
  localhost host perm; extension v0.9.0. End-to-end browser check still recommended.

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

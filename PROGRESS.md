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
> ▶️ **Go-to-market build — next: Phase 12, Stripe billing (2026-09-21).** **Phase 11 is COMPLETE**
> (ext v0.52.9): the web signals the extension on every change/sign-in/sign-out, `GET
> /api/profile/version` gives a cheap fingerprint, the extension checks it on a 15-minute alarm, on
> window focus and on drawer open — pulling only when it moved — and `ARCHITECTURE.md` → **Sync
> model** documents the whole shape. **Phase 12 is planned to build depth** (ROADMAP Phase 12: locked
> decisions + 12.0–12.7 with contracts, file placement, edge cases and named tests). **12.1–12.4 are DONE**
> — schema, `EntitlementService`, the gateway seam,
> `GET /api/billing/me`, the webhook, checkout + portal, `/pricing`, `/billing/success`,
> Settings › Billing, the sidebar Pro pill and the extension's plan badge. Everything still runs
> keyless (blank `STRIPE_SECRET_KEY` ⇒ `billingEnabled:false`, checkout/portal → 503).
> The gates are live too (ext v0.54.0): server AI, cross-device answer sync and the 4th resume are
> all Pro, each refused with a 402 the clients turn into an upgrade prompt. **12.5 is DONE** —
> `/admin/analytics` has a Revenue card (MRR, active Pro, new/churned this month, past due).
> **12.6 is DONE** — the ToS has a Billing section and the Privacy Policy names Stripe.
> **PHASE 12 IS COMPLETE.** 12.7's run happened on 2026-09-21 and found **eight bugs**, all fixed
> with tests — including double billing and a webhook that could revoke Pro from a paying
> customer. One piece is deliberately carried to **15.4**: a real failed renewal and lapse, which
> need a Stripe test clock. **10.1 is DONE** (ext v0.56.0) — count-only fill telemetry per ATS
> and an `/admin/analytics` panel ranking ATS worst-first. **10.2 is DONE** (ext v0.57.0) — after
> a fill, "N required fields still need you" with jump-to links, and auto-advance waits for them.
> **10.3 is planned** as five steps, 10.3a–e (user-approved defaults 2026-09-22, see ROADMAP 10.3).
> **10.3a is DONE** (ext v0.58.0) — six job-preference fields (salary, notice, start date, work
> preference, relocate, "how did you hear") are canonical, matched by rules and editable on the web.
> **10.3b is DONE** — `/welcome`: six one-tap questions a new user sees once after first sign-in.
> **10.3c is DONE** — `/api/profile/suggestions`: learned answers become suggestions, only an accept
> writes the profile. **10.3d is DONE** (ext v0.59.0) — after a fill, the extension reports answers to
> profile questions there. **10.3e is DONE** — the dashboard's "We learned N things about you — keep
> these?" card. **10.3 IS COMPLETE.** **13.1 is planned** as 13.1a–c (user-approved defaults
> 2026-09-22, see ROADMAP 13.1). **13.1a is DONE** (ext v0.60.0) — every AI call names its kind and
> is recorded with its tokens and cost; three bugs fixed. **13.1b is DONE** (ext v0.61.0) — Pro AI is a
> $5/month cost budget with a soft cap, per-task models and kill switches; the admin override is a
> budget. **13.1c is DONE** (ext v0.62.0) — users see "% of this month's Kiwiply AI used" (web
> Settings + extension Options); the admin AI page shows real cost per user and per feature.
> **13.1 IS COMPLETE.** Model stays **gemini-2.5-flash-lite** (user decision 2026-09-22, until the
> Gemini API announces a shutdown). **13.2 is DONE** (ext v0.63.0) — "Best match: Backend v3 · 84%"
> in the drawer and a "Resume fit" section on the board. **13.3 is DONE** (ext v0.64.0) — the job-fit
> report (match, missing keywords, red flags) in the drawer and per resume on the board.
> **13.4 is DONE** — "Tailor for this job" on the board: reviewed rewordings saved as a new resume,
> with the truthfulness checks on the server. **13.5 is DONE** — an ATS score out of 100 with
> "fix first" advice on the Resumes page, and with the job's keyword coverage in the board's job-fit
> panel. **13.6 is planned** as 13.6a–c (user decisions 2026-09-22: seed list + users' companies;
> ordinary overnight calls, Batch API waits for 16.1). **13.6a is DONE** — 217 verified job boards,
> a nightly read keeping 48-hour-fresh postings, and an admin Job sources page. **13.6b is DONE** —
> opt-in nightly matching: preferences from the profile + resume, a pre-filter to ≤ 50, one metered
> Flash-Lite call per user. **13.6c is DONE** — the `/matches` page: the switch (with what it sends),
> today's list, save to board / dismiss. **13.6 IS COMPLETE — so is Phase 13.** **Next: Phase 14** —
> the inbox over IMAP (14.1 connect flow). 12.0's Stripe sandbox exists; a real end-to-end run against it is **12.7**.
> The plan to a sellable Pro tier is
> fully written: `ROADMAP.md` **Phases 10–17** (decisions, pricing, margin, legal shape,
> Free-vs-Pro table, competitor cross-check) and the task lists below (**Phase 11–17**). Build
> order: **11 Sync → 12 Billing → 10.1–10.3 → 13 Pro AI → 14 Inbox → 15 Launch 1 → 16 → 17
> Launch 2**; 10.4–10.6 run continuously, ordered by 10.1 telemetry. Work on branches off
> **`develop`**, PR into `develop`; only the user promotes to `main`.
> **Store status:** the extension's **v1 is published on the Chrome Web Store and under review**
> (uploaded 2026-09-21 — the `main` build at the time, believed **0.52.2**; confirm the number in
> the CWS dashboard). It gets resubmitted in **15.3** with the Pro build. Ext on `develop`:
> **v0.52.6**. Ops gaps (backup / monitoring / restore drill) are scheduled in **15.1** by
> decision — don't pull them earlier.
>
> ✅ *(Superseded 2026-09-21 — kept for the human-gated items it lists.)* **Extension → Chrome Web Store prep (2026-09-17). Everything that can be done from here is
> done; the remaining gates need a real Chrome and the user.** Ext **v0.51.1**. Landed: **W6.0**
> manifest hygiene (env-aware manifest — no dev-only or unused permissions in the store zip;
> session-handoff gate derived from the manifest; `test/connect_handoff.test.js`), **W6.2** (the
> unreachable remote-ruleset path removed), `W5-QA.md` **rewritten** for the surfaces we actually
> ship, **`job-autofill/STORE-LISTING.md`** (listing copy, privacy-tab answers, reviewer notes,
> 1280×800 shot list), web `/privacy`+`/terms` naming **AutomoraLab LLC**, and the stale-doc sweep.
> **Blocked on the user:** walk `W5-QA.md` in Chrome (W5.7, light + dark) · live re-verify autofill,
> especially **SmartRecruiters** (its shadow-DOM fix shipped in v0.37.0 and has never been tested on
> a real form) · five screenshots · a seeded reviewer test account · the CWS developer account · then
> **`DEPLOY.md` §8 in order** — the `NEXT_PUBLIC_KIWIPLY_EXTENSION_ID` redeploy is the step that
> breaks sign-in for every store user if skipped. Still deferred by decision: PL.1 lawyer review
> (entity now settled), DPAs with Brevo + AWS S3.
> **W6.1 Firefox parity is DONE** (ext **v0.52.0**): its own MV3 build, the connect-relay that
> makes sign-in possible at all on Firefox, AMO's `data_collection_permissions`, `web-ext lint`
> clean. **Also blocked on the user:** a live Firefox smoke test (`BROWSERS.md`) before any AMO
> submission. **W6.3 docs sweep is DONE.** The only remaining W-task is **W6.4** (package +
> upload), which is gated entirely on the human steps above — there is no further code work
> queued for the extension.
>
> ✅ **Phase 3.6 — Job-details extraction v2 MERGED (2026-07-03, PR #28, merge commit `4586822`)**:
> capture provenance (`sources`), structured salary (`salaryParsed {min,max,currency,period}`),
> conservative description-text jobType/jobMode heuristics, and an **opt-in** AI gap-fill tier
> (`settings.jobAiEnabled`, default OFF, own Options toggle) that only fills what the deterministic
> chain left empty. Extension **v0.48.0 → v0.49.0**. Tasks 3.6.1–3.6.3 are all done; the only
> open item is the deliberately deferred **3.6.4** (server salary columns + board filter/sort),
> plus the unscheduled follow-ups (cross-board dedup, adapter-rot telemetry, provenance badges).
> *(Was marked "IN REVIEW" here until 2026-09-17 — it had in fact merged the same day it was
> written; the branch is gone.)*
>
> ✅ **Phase 5.5 — Fill-engine matching upgrades MERGED (2026-07-03, PR #27, merge commit `49bbf36`)**,
> four user-directed upgrades to the autofill engine's matching pipeline (see the Phase 5.5 entry below
> for the full task breakdown + files touched). Extension **v0.44.0 → v0.48.0**, ruleset v4 → v5. No
> loose ends — all 4 CI checks green, no legal/ops follow-up needed.
>
> ✅ **Phase 5.4 — AI-assisted resume parsing MERGED (2026-07-02, PR #26)**, extending the Phase 5
> Gemini seam from answer-drafting to structured resume parsing (see the Phase 5.4 entry below for
> the full task breakdown). **Live on prod as-is** — no new env vars needed, reuses `DOSSIER_AI_*`.
> **Two loose ends:** (1) legal — the terms/privacy policy don't yet disclose default-on AI resume
> parsing; fold into **PL.1**. (2) a live end-to-end parse against real Gemini hasn't been manually
> verified yet (recommend one check post-deploy: upload a two-column or scanned PDF on
> kiwiply.com/resumes with the "Parse with AI" checkbox on).
>
> ▶️ **PHASE 9 COMPLETE (A0–A5 + 9.X).** A0–A5 are LIVE on prod; **9.X (privacy/terms, DSAR export,
> admin email-OTP MFA) DONE on `admin-buildout`**, shipping via the 9.X PR (CI → merge). The admin
> console, comms, and cross-cutting compliance are all built.
> **Pick the next focus deliberately** — candidates: remaining pre-launch (PL.1 lawyer review + legal
> entity/hosted policy URL), **7.3 Safari**, or **Phase 8** (enterprise SSO/multi-tenancy/audit/session
> at scale). **Standing user actions (not code):** ✅ admin MFA enabled on the VPS; ✅ Brevo list sync +
> postal address configured (A4.4 deployed, PR #14); ✅ admin email → `admin@kiwiply.com`, Cloudflare-routed
> to `admin.kiwiply@gmail.com`. **Remaining:** backfill existing confirmed subscribers into the Brevo list
> (`/admin/subscribers` CSV → import); lawyer review of `/privacy`+`/terms` (PL.1); **DPAs with Brevo + AWS
> S3** (accept/sign in their dashboards); the first manual Chrome Web Store upload (now at ext
> **v0.51.1** — follow `DEPLOY.md` §8 in order and use `job-autofill/STORE-LISTING.md` for the
> listing copy); screenshots for bug reports if wanted.
> Everything below is prior context (live + complete unless noted). New chat → read `HANDOFF.md`.
>
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

### Phase 3.6 — Job-details extraction v2 (MERGED 2026-07-03, PR #28, merge commit `4586822`)

> **Direction:** keep the deterministic capture chain as tier 1 (free, instant, private);
> make it queryable + provenance-aware; add AI only as an **opt-in gap-filler** behind its
> own toggle (default OFF) — never as the primary extractor, never overriding what the
> page states. Full spec: ROADMAP "Phase 3.6".

- [x] **3.6.1 Capture v2 — structured salary + provenance + text heuristics.**
  `captureJob()` now returns (1) `salaryParsed {min,max,currency,period}` — parsed from
  schema.org amounts (`moneyParsed`) or the matched salary string (`parseSalaryText`);
  the prerequisite for board salary filters. (2) `sources` — every field tagged with its
  extractor (`jsonld|adapter|board|generic|text`). (3) Conservative DESCRIPTION-text
  fallbacks: `jobTypeFromText` (exactly one type keyword in the text wins; two = ambiguous
  = no call) and `jobModeFromText` (work/role/location-bound phrases only — "hybrid
  cloud"/"onsite interviews" never match). *Done: `job-capture.js`;
  `job_capture_v2.test.js` (41 tests); existing capture/tracking suites untouched + green.*
- [x] **3.6.2 Opt-in AI job-detail enrichment (default OFF).** New `src/lib/job-enrich.js`
  (`JAF.jobEnrich`, SW-safe pure core: gap detect / JSON-only prompt / strict enum+number
  validation / gap-only merge with `sources=ai`) + SW `enrichCapture()` wired into
  `logFill` and `saveJob`. Sends ONLY the posting's public description text (never
  profile/resume data); fills ONLY missing jobType/jobMode/salary; deterministic values
  always win. Two-tier model chain reused from drafting (BYO Anthropic key first, else
  the consented Kiwiply AI relay — gated on `serverAiEnabled`+`serverAiConsent`+signed-in).
  Per-posting cache (identity + description hash, 40-entry LRU) ⇒ ≤1 AI call per job.
  New setting `jobAiEnabled` (default false) + Options → AI → "Job-detail enrichment"
  toggle. `job_enrich` analytics outcomes (enriched/cached/quota/unparseable). *Done:
  `job_enrich.test.js` (30 tests); full suite + typecheck green; ext v0.48.0 → v0.49.0.*
- [x] **3.6.3 Docs.** This entry + ROADMAP Phase 3.6 + ARCHITECTURE.md (`job-capture.js`
  v2 fields, new `job-enrich.js` module).
- [ ] **3.6.4 Server structured salary (later).** Additive Liquibase migration:
  `salary_min/salary_max/salary_currency/salary_period` columns on `application`,
  DTO + mappers, extension sends `salaryParsed`, board gains salary filter/sort.
- [ ] **3.6.5 Cross-board dedup (later → re-homed to 14.5, required by the inbox).** Same posting saved from LinkedIn + the ATS
  currently makes 2 entries; dedup on normalized company+title(+fuzzy location) at
  upsert time (plain string match — no embeddings; cheap and good enough).
- [ ] **3.6.6 Adapter-rot telemetry (later → folded into 10.1).** Anonymous per-tier extraction-miss counts
  (which extractor/field came up empty — no page content, no PII) so Workday-style
  markup changes surface in analytics before user reports.
- [ ] **3.6.7 Provenance in the UI (later).** Review overlay / save-a-job editor show a
  small source badge per field (`sources`), e.g. an "AI" chip on enriched values —
  mirrors the existing AI badge on mapped fields.

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

### Phase 5.4 — AI-assisted resume parsing (2026-07-02, PR #26, merged)
> Same `AiProvider`/Gemini seam as 5.1–5.3, extended from answer-drafting to structured
> resume→JSON parsing — the fix for accuracy on multi-column, scanned, and otherwise
> "unusual" resumes that the regex-only heuristic parser (`parser-core.js`) can't reliably
> structure. One parse = one AI credit on the **same monthly quota** as drafts (no new
> quota table). No new provider/account — reuses the configured Gemini key end to end.
- [x] **Provider seam**: `AiProvider.parseResume(text | fileBase64, fileMimeType)` +
  `GeminiAiProvider` implementation using Gemini's `responseSchema` structured output, so
  the model returns the canonical resume JSON (summary/skills/experience/education/
  languages/projects) plus a `bio` contact block directly — no prompt-engineered JSON
  parsing/repair. Accepts either extracted text **or the original PDF** (base64, ~5MB,
  PDF-only) — sending the file lets Gemini read the layout itself instead of trusting
  extraction, which is what actually fixes two-column sidebars and scanned pages.
  New `dossier.ai.parse-max-output-tokens` config (default 4000 — a full resume needs
  far more room than a 2-4 sentence draft).
- [x] **Metered endpoint**: `POST /api/ai/parse-resume` (`AiResumeParseService` +
  `AiResource`) — same gating shape as `/draft`: feature enabled + provider configured,
  explicit consent, per-user monthly quota. Validates exactly one of text/file is
  present, size-caps both, PDF-only for file mode.
- [x] **Shared pre-processing** (`job-autofill/src/lib/parser-core.js`, used by both
  extension and web): `cleanForLlm()` — ligature/typographic normalization,
  de-hyphenation of line-wrapped words, page-number and repeated-header/footer removal,
  whitespace collapse, 30k-char cap (fewer tokens, cleaner signal) — and `looksGarbled()`
  — detects failed text extraction (mojibake, symbol soup, near-empty output) so the
  caller sends the original PDF instead. 16 new parser-core tests.
- [x] **Web integration**: "Parse with AI for best accuracy" checkbox on the shared
  `ResumeUpload` component (new optional `aiParse` prop), wired through a new
  `/api/ai/parse-resume` Next proxy (JWT stays server-side) and
  `parseResumeWithAi()` in `resume-parse.ts` — extracts text in-browser, cleans it,
  sends text (or the PDF file when `looksGarbled`) to the server, and **falls back to
  the local heuristic parser on any failure** (disabled/quota/network/5xx) so the
  upload flow never blocks. **Defaults ON** (2026-07-02 product decision — opt-out
  remembered per browser via a `useSyncExternalStore` localStorage hook); the embedded
  Add-Application upload honors the same stored choice.
- [x] **Extension integration**: `aiParseResume` added to the `TrackingProvider` seam
  (`tracking.js`) and `parser.js`'s `parse()` gets a 3-way precedence — **BYO-key
  (Anthropic) → Kiwiply server AI → local heuristic** — reusing the existing Options
  "Use Dossier AI" toggle + consent checkbox (copy updated to cover resume parsing).
  ext **v0.45.0**.
- [x] **Verification**: 8 new API unit tests + full `integrationTest` suite green
  (Testcontainers/MySQL); extension suites green (parser-core 56, tracking 58); web
  `tsc`+`eslint` clean; WXT build clean. `api/openapi.json` contract snapshot
  regenerated (had gone stale since 5.1a). All 4 CI jobs green on the merge PR.
  ⚠️ **Not yet done**: a live end-to-end parse against real Gemini (blocked on a local
  key at implementation time) — worth one manual check post-deploy.
- [ ] **Legal follow-up (not yet done)**: terms & privacy policy must disclose
  default-on AI resume parsing (resume content → Gemini free tier; Google may use
  inputs to improve its services) — fold into the **PL.1** lawyer-review item.

### Phase 5.5 — Fill-engine matching upgrades (2026-07-03, PR #27, merged)
> User-directed: after a full analysis of the autofill engine's matching logic (canonical-field
> scanner, ruleset, AI assist), four upgrades were picked as highest-value while keeping the engine's
> direction (deterministic-first, AI only where determinism can't work, everything reviewed in the
> overlay, cost-effective — no LLM-per-field, no vision/agentic filling). Branch
> `feat/fill-engine-upgrades`, one commit per task. Extension **v0.44.0 → v0.48.0**; ruleset **v4 → v5**.
> Not done (flagged, deferred pending a product/privacy decision): a crowd-learning pipeline that
> promotes real corrections into new ruleset versions (needs backend + a call on label telemetry
> leaving the device), and relaxing the generic scanner's one-element-per-field cap (repeated blocks
> like two references) — riskiest change for modest benefit.
- [x] **5.5.1 W3C `autocomplete` token signal.** Valid autocomplete field tokens (`given-name`,
  `email`, `postal-code`, …) map straight to canonical fields in the generic scanner and outrank
  keyword matching — a standardized, zero-cost, high-precision signal it previously ignored.
  **Workday hosts excluded** (its autocomplete attributes are unreliable — user call), via a
  data-driven `autocomplete.distrust` host list in the ruleset (`src/config/rules.js`, **v5**,
  remote-updatable — no extension release needed to add more distrusted hosts). Guard: a generic
  `url` token never steals a linkedin/github-labeled field. `src/content/adapters/base.js`
  (`autocompleteField`, `autocompleteTrusted`); new `autocomplete_confidence.test.js` (18). ext v0.45.0.
- [x] **5.5.2 Signal-tier scoring + match confidence in the overlay.** `labelParts(el)` tiers every
  label signal (automation-id 300 > label/aria 200 > placeholder/name/id 100); keyword hits score per
  tier so a real `<label>` beats a placeholder hit for the same field — fixes cross-contamination from
  the old flat-string concatenation. Matches backed only by weak signals carry `confidence:"low"` and
  render **UNCHECKED with a "?" marker** in the review overlay (opt-in instead of un-noticing a wrong
  fill); a field-cache hit (user confirmed before) keeps the row checked regardless. `base.js`,
  `filler.js`, `field-cache.js`; +10 tests. ext v0.46.0.
- [x] **5.5.3 Cached AI field-mapper fallback** for fields the deterministic rules miss entirely —
  the biggest capability jump. Leftover labeled elements resolve from a local host+label cache
  (`chrome.storage.local`); only NOVEL labels go to the service worker in one batched `JAF_MAP_FIELDS`
  message, mapped to the canonical vocabulary through the **same consent gates as answer drafting**
  (BYO key → dedicated JSON-only prompt; server AI → tolerant JSON-from-prose parse; both off ⇒ silent
  no-op). Only labels leave the page, never values; sensitive demographic keys are never LLM-mappable;
  results (incl. "unknown") are cached, so any given page costs **at most one model call ever per
  device**. Mapped rows carry an AI badge. New `src/lib/field-map.js` (pure prompt/parse core, SW-safe)
  + `src/content/field-mapper.js` (DOM half) + `field_mapper.test.js` (28). ext v0.47.0.
- [x] **5.5.4 AI picks for constrained screening questions.** `assist.js` (previously textareas only)
  now also handles native selects/radio groups whose label reads like a screener ("Years of
  experience…", "Willing to relocate?", notice period, etc.): the SW (`JAF_PICK`) is sent the question
  **plus the page's literal option list**; the reply is validated by `fieldMap.matchOption`
  (word-boundary, unique-or-null, UNSURE ⇒ no fill) so the filled value is only ever an option the page
  actually offers — hallucination-proof by construction. EEO/demographic questions are hard-excluded
  from AI answering (`EEO_RE` guard). Picks are cached per question+options, reviewable and
  regenerable like drafts; radio picks fill via a new `"choice"` kind in `base.js`.
  `assist_picks.test.js` (23). ext v0.48.0.
- [x] **Verification**: full extension suite (19 test files, ~500 assertions) + `npm run typecheck` +
  `npm run build` all green throughout; merged main's concurrent Phase 5.4 work (resume parsing) with
  a straightforward conflict resolution (PROGRESS.md log entries combined, version numbers reconciled
  to the higher `0.48.0`). All 4 CI jobs (API tests, extension jsdom, web typecheck+lint+build, web
  Docker build+smoke) green on the merge PR.

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
- [ ] **8.4 Audit & compliance.** *(Two slices pulled forward by the inbox: secrets-at-rest → 14.2,
  retention/deletion → 14.7. The rest stays here.)* Audit logging; PII retention/deletion tooling;
  GDPR/CCPA + SOC 2 groundwork; secrets in a vault/KMS; deeper RBAC.

## Phase 9 — Admin, ops & comms
> Full plan + legalities in **`ADMIN-PLAN.md`**. Locked decisions: PII = metadata + reason-gated;
> location = in-app `/admin` route group; order A0→A5. Commit prefix `phase9.<n>:`. Overlaps Phase 8
> (MFA/audit/RBAC) — build the consumer-grade slices here, the enterprise versions in 8.
- [x] **9.A0 Security gate (do FIRST).** ✅ DONE (on branch `admin-buildout`). Three moves:
  (1) **gated the seed** — moved `user.csv`+`user_authority.csv` loadData out of the contextless initial
  changeset into `20260628000000_seed_dev_default_users.xml` (`context="dev or test"`), so a fresh PROD DB
  never gets the public-hash accounts; `authority.csv` (ROLE_* rows) stays contextless (prod needs them);
  `validCheckSum=ANY` on the initial changeset so existing DBs accept the modified checksum. (2) **prod
  cleanup** — `20260628000100_remove_default_admin_seed.xml` (`context="prod"`) deletes the seeded
  `admin`/`user` rows, matching BOTH login AND the exact public bcrypt hash (surgical: can't touch a real
  admin). (3) **env-bootstrap real admin** — `AdminBootstrap` ApplicationRunner creates/promotes an admin
  from `ADMIN_EMAIL`+`ADMIN_PASSWORD_HASH` (bcrypt hash, env only — nothing committed); runs every boot
  (change hash+restart to rotate); defensive (bad value logs+skips, never crashes startup). Prod Liquibase
  set **synchronous** (`async-start:false`) so the runner is ordered after migrations. Env wired in
  `application-prod.yml`+compose; documented in `.env.example`+`DEPLOY.md §2.1`. `AdminBootstrapTest` (6) +
  full unit suite + `compileJava` green on JDK 17 (ITs run in CI; the existing-prod checksum/cleanup path
  is by-design, not CI-testable on a fresh DB). **User verifies on the VPS after deploy:** `admin/admin`
  → 401, real admin signs in.
- [x] **9.A1 Admin gate + shell + Users + audit foundation.** ✅ DONE on `admin-buildout` (A1.1–A1.5,
  NOT merged to main yet). `(admin)` route group gated on `ROLE_ADMIN` (Spring `/api/admin/**` is the
  real enforcement); distinct dark admin shell; Users list + detail reusing `/api/admin/users` with
  actions (activate/deactivate, reset, grant/revoke admin, force-logout via `RefreshTokenService`,
  full GDPR delete via `AccountDeletionService.deleteUserAccountByLogin`) — self-action guards +
  type-to-confirm delete; immutable `AdminAuditEvent` trail (every action audited) + read-only audit
  viewer. Backend unit+ArchUnit green (JDK 17), ITs in CI; web tsc/eslint/build green. **Live view +
  end-to-end verification need a deploy (merge to main) or the local stack — user step.**
- [x] **9.A2 AI usage + sessions/security + system/ops dashboards.** ✅ DONE on `admin-buildout`
  (A2.1–A2.4). AI-usage view (`/admin/ai`, monthly aggregate) + per-user quota override (wired into
  `AiDraftService` as override-or-default); per-user sessions (refresh-token families + revoke) on the
  user-detail page; read-only `/admin/system` over the actuator (health/build/runtime/log levels).
  Backend unit+ArchUnit green (JDK 17), new ITs in CI; web tsc/eslint/build green. (Standalone
  "Security" nav left as a future aggregate dashboard.)
- [x] **9.A3 Business-analytics overview.** ✅ DONE on `admin-buildout`. `/admin/analytics` + Overview
  KPI strip over `GET /api/admin/analytics`: total/activated users + activation rate, signups 7d/30d,
  active users 7d/30d (session-activity proxy), funnel (signup→activate→profile→started→applied),
  apps-by-status, resumes/apps totals. (No login-event table, so "active" = refresh-token activity,
  labelled.) Backend unit+ArchUnit green, IT in CI; web build green.
- [x] **9.A4 Email subscription.** ✅ DONE on `admin-buildout` (A4.1–A4.3). `email_subscriber` (double
  opt-in, consent source+timestamp, tokenized one-click unsubscribe); public opt-in (footer form +
  separate **unticked** signup checkbox) → `POST /api/newsletter/*` (permitAll, rate-limited BFF) +
  `/newsletter/{confirm,unsubscribe}` pages; admin `/admin/subscribers` list (status filter/counts) +
  CSV export. Confirm + unsubscribe links in every email. **Brevo API list sync deferred** (CSV export
  for manual import initially); **physical postal address** still needed before real campaigns (CAN-SPAM).
- [x] **9.A5 Bug report.** ✅ DONE on `admin-buildout` (A5.1–A5.4). `bug_report` model + public
  `POST /api/bug-reports` (auth-optional, rate-limited BFF; diagnostic context only with consent;
  best-effort email notice to support@) + admin triage queue (`/admin/bug-reports` list/detail,
  status/severity/notes, audited). Web capture = a **floating circular button** (bottom-right, global,
  not a footer link). Extension popup "Report" via the TrackingProvider seam (ext v0.25.0). *Screenshots
  deferred (per decision); Brevo not involved here.*
- [x] **9.X Cross-cutting.** ✅ DONE on `admin-buildout` (9.X.1–9.X.3). `/privacy`+`/terms` updated
  (admin access, marketing email, diagnostic data); self-service **DSAR export** ("Download my data" →
  `GET /api/account/export`, structured data + resume metadata); **admin email-OTP MFA** — gated OFF by
  default (`ADMIN_MFA_ENABLED`), no-email = no-lockout, web two-step login. **Phase 9 COMPLETE.**
  Standing follow-ups: ✅ MFA enabled on VPS; ✅ Brevo list sync + postal address configured (A4.4
  merged/deployed, PR #14); ✅ admin email → admin@kiwiply.com routed to admin.kiwiply@gmail.com.
  **Remaining (need the user):** backfill confirmed subscribers into Brevo (CSV import); lawyer review of
  privacy/terms (PL.1); DPAs with Brevo + AWS S3; bug-report screenshots; manual CWS upload of ext v0.25.0.

## Phase 10 — Fill quality & the self-building profile (the Pro-plan gate)
> Spec: `ROADMAP.md` → **Phase 10**. Makes the autofill itself good enough to charge for.
> Sequencing is deliberate: measure → cheap visible win → profile spine → the adapter grind.
> Do NOT start 10.4 before 10.1 ships — adapter effort without telemetry is guesswork.

- [x] **10.1 Fill telemetry per ATS.** One event per fill: `{ats, fieldsFound, fieldsFilled,
  userCorrected, requiredLeftEmpty}`. Counts only — no field values ever leave the page (same
  line the field mapper holds: labels may leave, values never). Surface as an `/admin/analytics`
  panel ranking ATS by failure rate. **This is what directs 10.4.**
- [x] **10.2 Post-fill audit.** After a fill, scan for required-but-empty controls and report
  "N required fields still need you" with jump-to links. Converts the silent-miss failure mode
  into a handled one; cheapest large win in the phase.
- **10.3 Self-building profile (3 tiers).** Tier A = ≤6 onboarding questions (work auth +
  sponsorship, desired comp, start/notice, remote-or-relocate; EEO offered but skippable).
  Tier B = derived from the resume parser. Tier C = **learned while applying** — a *suggested*
  profile value, reviewed on the web, never silently overwritten. Extends the pull-only locked
  decision (see CLAUDE.md, user decision 2026-09-21). Split into five steps (plan 2026-09-22):
  - [x] **10.3a Job-preference fields.** `desiredSalary`, `noticePeriod`, `earliestStartDate`,
    `workPreference`, `willingToRelocate`, `referralSource` in `schema.js` + rules + `MAPPABLE` +
    the web profile. **`experience[]`/`education[]` stay on each resume** (user decision
    2026-09-22) — they already exist there and a profile copy would drift. **No Tier-C long-tail
    fields** — they're unbounded and the field cache handles them better.
  - [x] **10.3b Onboarding (Tier A).** `/welcome`, shown once after the first sign-in, "Skip for
    now" always visible: optional resume upload, then ≤6 questions (work auth, sponsorship,
    salary, start/notice, remote/relocate, EEO optional). The dashboard checklist links to it.
  - [x] **10.3c Suggestions API.** `profile_suggestion` table + send/list/accept/dismiss. Free
    and Pro alike (the Pro-only answer sync is untouched). Canonical keys only, never EEO,
    capped pending count, in export + deletion. Accepting writes the bio (so the version moves).
  - [x] **10.3d Extension capture (Tier C).** Watch canonical-field inputs even when the bio has
    no value, plus user corrections of filled ones; send a suggestion on commit. A blank bio
    field is suggested at once; a *change* only after the same new value on 2 applications.
    "Learn from my applications" device setting, on by default.
  - [x] **10.3e Web review.** Dashboard card "We learned N things about you — keep these?" with
    Keep / Edit / Dismiss; a dismissed value isn't suggested again.
- [ ] **10.4 ATS coverage.** Adapters for the 5 uncovered manifest hosts (iCIMS, Taleo,
  SmartRecruiters, BambooHR, Jobvite); depth for Greenhouse (61 lines / 6 selectors), Lever
  (46), Ashby (49). Capture real tenant DOM first. Generalize multi-step orchestration beyond
  Workday/Indeed.
- [ ] **10.5 AI posture for Pro.** Server AI on by default for paying users (metered, Phase 5
  proxy); BYO key stays the free unlimited path. Today both the mapper and drafter are off by
  default, so most users never see the layer that closes the long tail.
- [ ] **10.6 Defend it.** Real-DOM regression fixtures per ATS in CI (Workday/Workable/Indeed
  have the shape; Greenhouse/Lever/Ashby have none) + an answer library on the web
  (view/edit/delete learned answers — also the GDPR "see and correct" duty).

## Phase 11 — Sync: signal + version check (Launch 1)
> Spec: `ROADMAP.md` → Phase 11. Signal when you can, version-check when you can't, pull only on change.
- [x] **11.1 Web→extension change signal.** ✅ DONE (ext **v0.52.7**). `web/src/lib/extension-signal.ts`
  `notifyExtension("changed"|"signedOut")` — fire-and-forget, Chrome direct / Firefox via the connect-relay —
  called after profile save (BioEditor, upload-services), every resume mutation (ResumeList: archive, delete,
  star, default; upload-services: save, set-default), sign-in (password + MFA) and sign-out (SignOutButton,
  AdminShell). SW: `KIWIPLY_SYNC` routed through the same origin gate as the handoff; `changed` pulls the
  mirror in the background (storage.js now loaded there), stamps `__lastPull`, broadcasts
  `KIWIPLY_MIRROR_UPDATED` → open drawer repaints; `signedOut` revokes best-effort then always clears.
  32 assertions in `test/sync_signal.test.js` (both transports, the gate, offline revoke, unknown event).
  *Web side is covered by tsc + eslint only — the web workspace has no unit runner; adding one is a separate
  decision.*
- [x] **11.2 `GET /api/profile/version`.** ✅ DONE (ext **v0.52.8**) — exactly as specified below;
  `ProfileVersionResourceIT` 4/4 green locally against Testcontainers MySQL, `tracking.test.js` 62/62.
  `200 {"version":"<16 hex>"}`, Bearer, **never 404**.
  A **hash** of exactly what a pull returns (bio `updatedAt`+`payload`, resumes sorted by id with
  `id|label|status|archived|starred|defaultResume|createdAt|r2ObjectKey|parsedJson`), SHA-256 → 16
  hex — because `Resume` has no `updatedAt` and a counter would need a migration and could still
  miss a path. API: `service/ProfileVersion.java` (pure hasher) + `ProfileService.profileVersion()`
  + `ProfileResource` `GET /version` + `vm/ProfileVersionVM`. Ext: `TrackingProvider.profileVersion()`
  (base NotSupported; Kiwiply provider GETs it → string|null). Tests: `ProfileVersionResourceIT`
  (empty → 200/16 hex; stable; moves on PUT profile, resume create, archive toggle, delete; another
  user's change doesn't move mine) · `tracking.test.js` (path + mapping). Ext version bump.
- [x] **11.3 Extension version checks.** ✅ DONE (ext **v0.52.9**) — built as specified below.
  `checkAndPull` in `src/lib/sync.js`; alarm + `windows.onFocusChanged` + `runVersionCheck` in the
  SW (both guarded, so the mock-`chrome` suites and any context without those APIs still load);
  drawer `refreshMirror` now calls `checkAndPull`. `alarms` added to the manifest **and** to the
  permission-justification tables in `PRIVACY.md` + `STORE-LISTING.md` (the listing requires a row
  per shipped permission). 37 assertions in `sync.test.js`, 48 in `sync_signal.test.js`.
  **Behaviour note:** removing the 90 s throttle also un-throttles `syncLearnedAnswers`, so the
  field-cache push+merge now runs on every drawer open (user-initiated, best-effort) instead of at
  most once per 90 s. Original spec below:
  `JAF.sync.checkAndPull(provider, storage, settings)` —
  GET version, compare `settings.__profileVersion`, pull only on mismatch/first run, store version +
  `__lastPull`; provider error → no pull, keep old version. Callers: `chrome.alarms` `"kiwiply-sync"`
  / 15 min (created on `onInstalled` + `onStartup`; **add `"alarms"` permission** in `wxt.config.ts`) ·
  `chrome.windows.onFocusChanged` in the SW, ≤ 1 check / 60 s · drawer `refreshMirror` replaces the
  90 s throttle + `pullAll` with `checkAndPull` (keep the one-time resume-migration push). Pulls that
  changed the mirror broadcast `KIWIPLY_MIRROR_UPDATED`. 11.1 `changed` keeps pulling unconditionally
  but then fetches + stores the version. Tests: `sync.test.js` (first run / hit / miss / error) ·
  SW test for alarm registration + `onAlarm` · `tracking.test.js`. Ext version bump.
- [x] **11.4 Docs.** ✅ DONE — `ARCHITECTURE.md` gained a **Sync model (Phase 11)** section (the three
  mechanisms, the offline rule, the revoke backstop, the no-WebSockets reason) and two stale lines were
  corrected: the `background.ts` entry no longer duplicates 11.1 and the mirror note no longer says
  "the popup pulls … (throttled)" — there is no popup and no throttle. `HANDOFF.md` points at it.
  Original spec: `ARCHITECTURE.md` "Sync model" section (signal → version → alarm; revoke path:
  1.11 rotation kills a stale token at its next refresh, `signedOut` clears at once; no WebSockets —
  MV3 SW idles out after 30 s). `HANDOFF.md` one line. Docs-only commit.

## Phase 12 — Billing & entitlements: Stripe (Launch 1 — the gate comes before the gated features)
> Spec: `ROADMAP.md` → Phase 12 + the Free/Pro table. `isPro()` in the API is the ONLY source of truth.
> **Planned to build depth 2026-09-21 — read the Phase 12 block in `ROADMAP.md` first**; it holds
> the locked decisions (Stripe is the truth and only webhooks write the mirror · `past_due` stays
> Pro until period end · 402 `PRO_REQUIRED` · no trial · resume cap counts non-archived · admin
> quota override outranks the gate · plan rides on `/api/profile/version` · `stripe-java` behind
> one `StripeGateway`). Build in order; each task is its own commit.
- [ ] **12.0 Stripe account setup (human).** Test mode first: Product "Kiwiply Pro" with Prices
  $19.99/month + $44.99/3 months; Stripe Tax on; Customer Portal configured (cancel at period end,
  update card, invoices; no plan switching); webhook endpoint `https://api.kiwiply.com/api/billing/
  webhook` on `checkout.session.completed`, `customer.subscription.{created,updated,deleted}`,
  `invoice.{paid,payment_failed}`. `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MONTHLY`,
  `STRIPE_PRICE_3MO` → password manager + box `.env`; `docker-compose.prod.yml` passthrough. Local:
  `stripe listen --forward-to localhost:8080/api/billing/webhook`.
- [x] **12.1 Schema + entitlement + gateway (API, no UI).** ✅ DONE — built as specified, plus two
  things the spec didn't anticipate: `StripeProperties` lives in `service/billing/`, not `config/`
  (ArchUnit's `TechnicalStructureTest` forbids services reaching into `..config..`), and
  `ProRequiredException` is a **pair** — a service-layer `RuntimeException` plus the
  `web.rest.errors` ProblemDetail, mapped in `ExceptionTranslator`, exactly like
  `EmailAlreadyUsedException` (same layering rule). Also: no raw-JSON fallback for
  `current_period_end` — Gson isn't on the compile classpath, and stripe-java 29 exposes it on the
  subscription item, so it's read there and `null` (⇒ lapsed) when absent, which can only cost Pro,
  never grant it. `DEPLOY.md` §11 documents the four secrets. 14 unit assertions +
  `BillingResourceIT` 5/5; full API suite green. Original spec:
  Liquibase `20260921000000_subscription.
  xml`: `subscription` (one row per user — `user_id` unique; `stripe_customer_id`/`stripe_subscription_id`
  unique nullable; `plan`, `status` verbatim from Stripe, `price_id`, `current_period_end`,
  `cancel_at_period_end`, `last_event_at`, timestamps) + `stripe_event` (`id` = `evt_…` **PK** as the
  idempotency key, `type`, `received_at`, `processed_at`, `status ok|failed|duplicate`, `error`).
  `EntitlementService.isPro/plan/requirePro(→ 402 PRO_REQUIRED)`; `StripeGateway` interface +
  `StripeGatewayImpl` (only importer of `com.stripe.*`); `StripeProperties` with **billing disabled when
  the key is blank** (`/me` says so, checkout/portal → 503 `BILLING_DISABLED`); `GET /api/billing/me` →
  `PlanDTO`. Tests: `EntitlementServiceTest` status × period matrix · `BillingResourceIT` `/me`.
- [x] **12.2 Webhook — the only writer.** ✅ DONE — built as specified, with three deviations worth
  knowing. (1) `StripeEvent` implements `Persistable<String>`: without it Spring Data treats an
  assigned String id as "existing", turns `save()` into a merge, and a **replay would silently
  update its own row instead of colliding** — the PK-as-idempotency-key claim was decorative until
  this. (2) Transactions are driven by explicit `TransactionTemplate`s, not `@Transactional`: the
  three steps are self-invoked from `handle()`, where Spring's proxy skips the annotation entirely.
  (3) `checkout.session.completed` is **exempt from the ordering drop** — it writes identity
  (customer↔user), not mutable state, so applying it late is harmless while skipping it would
  orphan the subscription from its account. Also hardened `dataObject()` against Stripe
  API-version drift (`getObject()` returns empty — or NPEs on an event with no `api_version` —
  whenever the dashboard's version differs from the SDK's, which would silently strip state from
  every webhook). `StripeGatewaySignatureTest` 4/4 + `BillingWebhookIT` 9/9; full API suites green.
  Original spec: `POST /api/billing/webhook` permitAll, raw `String` body,
  signature verified (bad → 400, nothing recorded). One transaction: insert `stripe_event` (duplicate →
  200 `duplicate`, stop) · drop events older than `last_event_at` · apply by type (bind customer↔user on
  `checkout.session.completed` via `client_reference_id`; upsert from the `subscription` object on
  `customer.subscription.*`; `invoice.paid` → active; `invoice.payment_failed` → `past_due` + Brevo
  "update your card" email) · handler exception → `failed` + **500 so Stripe retries**. Tests
  (`BillingWebhookIT`): signed fixture → upsert · wrong secret → 400 · replay → duplicate, row unchanged
  · older `created` ignored · `deleted` → canceled, Free after period end · `payment_failed` → past_due,
  still Pro, one email on a `MailService` spy.
- [x] **12.3 Checkout + portal + web.** ✅ DONE (ext **v0.53.0**) — see the Log entry for the three
  course corrections. Original spec: API `POST /api/billing/checkout {price}` (creates/reuses
  customer; hosted session with `client_reference_id=userId`, promo codes, automatic tax, success/cancel
  URLs; Pro → 409) + `POST /api/billing/portal` (no customer → 404). Web BFF `api/billing/{checkout,
  portal,me}`; public **`/pricing`** (Free/Pro table + prices; Upgrade → checkout or `/signup?next=`;
  disabled → "coming soon"); **`/billing/success`** polls `/me` ≤ 20 s until PRO, never errors;
  **Settings › Billing** replaces the placeholder (pill, renewal/"cancels on", Manage billing, Upgrade);
  `AppShell` Pro pill; plan fetched once in the `(app)` layout. Extension: `ProfileVersionVM.plan`;
  `checkAndPull` + the `changed` path store `settings.plan` on every answer; `tracking.js` surfaces 402
  with `.status/.code`; options badge + upgrade link. Tests: `BillingResourceIT` (URL + stored customer,
  reuse, 409, 404, 503) · `tracking.test.js` 402 · `sync.test.js` plan stored on unchanged check · web gate.
- [x] **12.4 The gates.** `requirePro()` at: `AiDraftService` + field-map/pick routes (**unless** an
  admin quota override exists; new `Status.PRO_REQUIRED` → SW message "Pro feature — upgrade, or add
  your own key"; `AiResumeParseService` untouched; `dossier.ai.pro-monthly-quota` default 2000) ·
  `POST /api/profile/field-caches/sync` (extension already best-effort → silent) ·
  `ProfileService.createResume` when Free and non-archived count ≥ 3 → 402 `RESUME_LIMIT {limit,
  count}`, with the upgrade CTA inline in web `ResumeUpload` and the extension upload flow. Tests:
  `AiDraftResourceIT` (Free → PRO_REQUIRED · Free+override drafts · Pro drafts · parse-resume Free ok) ·
  `FieldCacheSyncResourceIT` (Free 402 / Pro 200) · `ProfileResourceIT` (4th create Free 402 · archived
  don't count · Pro 201).
- [x] **12.5 Admin revenue panel.** `overview().billing {activePro, monthlyCount, threeMonthCount, mrr,
  newThisMonth, churnedThisMonth, pastDue}` from `subscription` (MRR = monthly×19.99 + 3-mo×44.99÷3);
  one card on `/admin/analytics`. Test: `AdminAnalyticsResourceIT` with two seeded rows.
- [x] **12.6 Copy + legal hooks (→ 15.2).** Auto-renew disclosure on `/pricing` + checkout CTA; portal =
  click-to-cancel (FTC + CA ARL); ToS Billing section (prices, renewal, no trial, **refund policy =
  "no refunds, cancel anytime"** — decided 2026-09-21, stated plainly rather than buried; statutory
  withdrawal rights and chargebacks still override it, for 15.2's lawyer to confirm), price-change
  notice. Docs-only commit.
- [x] **12.7 End-to-end in Stripe test mode — RUN 2026-09-21.** Walked end to end against the
  sandbox. Everything in the checklist verified except a **real failed renewal and a real lapse**,
  which need a test clock and are deferred to **15.4** by decision — a clock can only be attached
  when the customer is created, and the run's customer already existed. The run found **eight
  bugs**; see the Log.

## Phase 13 — Pro AI (Launch 1 — needs 12 + 10.3)
> Spec: `ROADMAP.md` → Phase 13. Build 13.1 first; every feature inherits it.
- **13.1 Credit metering, routing, caching, batch.** Cost-based credits into a monthly Pro
  budget (~$5 model cost) with a visible meter; soft cap → cheaper model, hard cap → top-up.
  Routing: mapping/picks/classification → Flash-Lite, job-fit/tailoring → Flash. Cache per
  (resume × JD); context-cache the resume prefix; batch overnight jobs; bounded inputs; per-feature
  kill switch; model names config-driven (Flash-Lite retires 2026-10-16). Split (plan 2026-09-22):
  - [x] **13.1a Track real cost.** Each call names its task; tokens + cost into the `ai_call`
    ledger; task-specific instructions; three bugs fixed (Pro parse cap, prod model default,
    lost-update counter).
  - [x] **13.1b Budget + routing.** Model per task and prices in config; Pro monthly cost budget
    ($5 default) — 80 % → cheapest model, 100 % → stop until reset; per-feature kill switch; admin
    override becomes a budget override; pick Flash-Lite's successor (user confirms).
  - [x] **13.1c Usage meter.** "% of this month's AI used" + reset date in Settings › Billing and the
    extension; admin AI page shows cost per user and total.
  - *Moved by decision:* top-up → Phase 16; resume-prefix context cache + (resume × JD) cache →
    13.2/13.3; overnight batch → 13.6.
- [x] **13.2 Resume recommendation per job.** Score stored resumes vs captured JD; "best match:
  X — NN %" in drawer + board.
- [x] **13.3 Job-fit panel** on the posting: match %, missing keywords, red flags. Cached.
- [x] **13.4 Resume tailoring to JD.** Diffed bullet rewrites, truthfulness guardrails, saved as a
  NEW resume version via the `TrackingProvider` seam.
- [x] **13.5 ATS resume score** *(Launch 1, user decision).* 0–100 per resume: deterministic
  structure/dates/contact/measurable-results checks + one Flash-Lite keyword read vs the captured
  JD; cached per (resume × JD); shown on the resumes page + inside the job-fit panel.
- [x] **13.6 Daily job matches — LIGHT** *(Launch 1, user decision; strong version = 16.1).*
  Greenhouse + Lever + Ashby public job-board APIs only; prefs = Tier A + resume-inferred
  role/seniority/location; ≤ 48 h + dedup; Flash-Lite scoring in an overnight batch, ≤ 50
  candidates/user/day; match %; **in-app list only**, dismiss hides; empty list allowed.
  - [x] **13.6a Sources + nightly read.** `job_source` pool (217-board verified seed list + boards
    users applied on + admin adds), nightly read of the public APIs, ≤ 48 h + dedup, 7-day keep,
    admin Job sources page.
  - [x] **13.6b Matching.** Preferences (Tier A + resume role/seniority/location) → deterministic
    pre-filter to ≤ 50 → one Flash-Lite call per Pro user per night (metered) → `job_match` rows.
  - [x] **13.6c Matches page** `/matches` (Pro): match %, reason, open / save to board / dismiss;
    empty list allowed; Free sees the upsell.

## Phase 14 — Inbox over IMAP (Launch 1 — needs 12)
> Spec: `ROADMAP.md` → Phase 14. Mirrors Sales-App `integrations/email/imap`. **No Kiwiply address,
> no forwarding, no OAuth.** Dedicated consumer Gmail + App Password; poll INBOX + Sent.
- [ ] **14.1 Connect flow** `/settings/inbox`: guided steps (2-Step Verification → App Password),
  test connection, disconnect. Consumer Gmail only.
- [ ] **14.2 Credentials encrypted at rest** (server-side key; the 8.4 secrets slice, now required).
- [ ] **14.3 IMAP poller.** UID-incremental sync + backfill on connect; headers + body text only,
  **no attachments**; rate-limited; per-user error state surfaced in settings.
- [ ] **14.4 Parser → status.** Deterministic ATS sender/subject templates → applied / interview /
  rejected / offer; Flash-Lite only on ambiguous mail; match by company + role + sending address;
  unmatched → *suggested* application.
- [ ] **14.5 Cross-board dedup** *(re-homed from 3.6.5 — required so auto-updates don't double
  count).* Normalized company + title (+ fuzzy location) at upsert.
- [ ] **14.6 Notifications.** In-app + email to the user's real address on status change.
- [ ] **14.7 Retention & deletion** *(the 8.4 slice).* Mail rows expire (12 months default); purge
  on disconnect + account delete; DSAR export includes mail; read-only guarantee in product copy.

## Phase 15 — Launch 1
- [ ] **15.1 Ops hardening** *(scheduled here by decision — not earlier).* Nightly off-box
  `mysqldump` → S3 with retention · uptime + error monitoring with alerting · **restore drill
  performed and logged**.
- [ ] **15.2 Legal — PL.1 completion.** Lawyer review of privacy + terms covering billing
  (auto-renew, click-to-cancel, refunds), IMAP mail processing, AI data use, governing law + entity.
  DPAs with Brevo + AWS S3.
- [ ] **15.3 Store.** CWS resubmit with the Pro build · AMO first submission · listing copy for
  the Free/Pro split · `NEXT_PUBLIC_KIWIPLY_EXTENSION_ID` redeploy.
- [ ] **15.4 Launch checklist.** Pricing live, Stripe live keys + webhook verified, billing support
  path, W5-QA walked (light + dark), SmartRecruiters live check, Firefox smoke.
  - **Test-clock run (carried over from 12.7, user decision 2026-09-21: "A now, B before live
    keys").** The one thing the 12.7 run could not do: a **real failed renewal and a real lapse**.
    A Stripe test clock can only be attached when the customer is created, so seed a fresh user's
    `subscription` row with a clock customer id *before* their first checkout — `startCheckout`
    reuses an existing `stripe_customer_id` forever, which is what makes that work (SQL in
    `DEPLOY.md` §11.1 §G). Then attach a failing card (`4000 0000 0000 0341`) and advance past the
    renewal: expect `past_due` → **still Pro** → email → lapse to Free at period end, with every
    resume intact.

## Phase 16 — Between launches (after Launch 1, before Launch 2)
- [ ] **16.1 Daily job matches — STRONG** *(builds on 13.6; refine before build).* Adds: all six
  ATS sources (+ Workable, SmartRecruiters, Recruitee) with aggregator fallback; full quality
  gates (ATS-verified tenant, agency/spam filter); like / dismiss / applied **feedback loop** that
  re-ranks; **daily email** at the user's chosen time; explicit preference editing.
- [ ] **16.2 Analytics.** Response / interview rate by resume, ATS, role.
- [ ] **16.3 Reminders + stale nudges.** "No reply in N days" → nudge; follow-up dates on cards.
- [ ] **16.4 Weekly digest** email.
- [ ] **16.5 Calendar export** (`.ics` / Google Calendar link) for interviews.
- [ ] **16.6 Cover-letter generator** *(Launch 2, user decision).* Profile + resume + captured JD
  → Flash, cached per (resume × JD), saved with the application; 13.4 truthfulness guardrails.
- [ ] **16.7 Resume builder + templates** *(Launch 2, user decision — on top of upload-first).*
  Build from the structured profile (10.3 schema) into ATS-friendly templates, PDF export, save
  as a new resume.

## Phase 17 — Launch 2
- [ ] **17.1 Price → $24.99 / $54.99**; grandfather existing subscribers one cycle.
- [ ] **17.2 Adapter depth milestone** from 10.4 (telemetry-chosen ATS at target fill rate).
- [ ] **17.3 Listing refresh** with matches + analytics; 13.5 candidates if confirmed.

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
- 2026-09-22 · **13.6c matches page** · `/matches` (nav "Job matches"), Pro. The switch comes first
  because it is the consent: its caption says what's sent nightly and to whom. Today's list = undecided
  matches scoring ≥ 60, best first — title (links to the posting), company · location · workplace,
  match % with a meter, the model's reason, posted date; **Save to board** (the server builds a SAVED
  application from the stored posting — description included, so resume fit / job fit / tailoring /
  ATS score work on it; the board's usual dedup on the ATS job id then link; the browser sends only
  the match id) · **View posting** · **Not for me** (dismissed for good). Switching on refreshes the
  page for a minute while the first match runs; empty list and each last-run status (no resume,
  nothing new, budget spent, paused, failed) get a plain sentence; Free sees what it is + "Part of
  Pro". API: `GET /api/profile/job-matches`, `POST /{id}/save|dismiss` (404 for others'). Titles and
  locations capped to the board's 200 chars. Checked in the browser (list, save, off, empty, Free,
  375 px). No ext change.
- 2026-09-22 · **13.6b job matching** · Pro, **opt-in** (`job_match_setting`, off by default: it sends
  the resume summary + preferences to Gemini nightly without a click, so the user says yes once — the
  switch is `PUT /api/profile/job-matches/settings`, its UI is 13.6c; switching on matches at once).
  `MatchPreferences` from what users already gave: city/state/country, work preference, relocation,
  sponsorship, the latest two titles, seniority (title words, else years), years (overlaps merged),
  skills. `JobPrefilter` (no AI) → ≤ 50: not seen or tracked; a location segment they can work in
  (remote in their country or naming none, their city/state, anywhere in their country if they'll
  relocate); a telling title word in common, or a generic one ("engineer") plus 3 of their skills; ≤ 1
  level away. **Checked on 154 real fresh postings**: first pass leaked SF hybrid jobs to a Brooklyn
  remote user — **Ashby sets `isRemote: true` on hybrid jobs** (OpenAI, Sentry, Notion), so a stated
  workplace type now wins (parser + filter) — and "Technical Support Engineer"-type titles; after the
  fixes 3 right-fit jobs for Brooklyn, 1 for London. One call (`AiTask.JOBS`, MATCH-shaped schema,
  3000 output tokens) scores them with a ≤ 15-word reason; metered; every posting sent gets a
  `job_match` row (0 if the model skipped it) so nothing is paid twice; ≥ 60 is shown. 04:00 UTC
  (`DOSSIER_JOBS_MATCH_CRON`), skipped if matched OK in the last 20 h; admin "Match now". Deleted with
  the account; privacy page says what's sent. No ext change.
- 2026-09-22 · **13.6a job sources + nightly read** · Decisions (user): the pool = a **verified seed list
  + companies users apply to**; scoring (13.6b) uses ordinary overnight calls, not the Batch API. The
  public APIs are per company (no global feed), so the pool is the design: `job_source` (ats, board
  token, company, origin SEED/DISCOVERED/ADMIN, last read, failures) and `job_posting` (public fields,
  plain-text description ≤ 8000 chars, `dedup_key` = SHA-256 of company|title|location). **Seed:**
  375 candidate slugs probed live on all three ATSs → 223 answered with open jobs → **6 dropped after
  checking the real company** (Greenhouse "archer" is a vet clinic, "palmetto" an animal hospital,
  "wise" a field-sales board…) → **217** in `config/job-sources.csv` (128 Greenhouse, 75 Ashby, 14
  Lever), names from Greenhouse's own board name where it has one. **Discovery:** Greenhouse / Lever /
  Ashby links on any application add that board (company only, never who). **Read** (02:00 UTC,
  `DOSSIER_JOBS_ENABLED`, on in prod, off in dev/CI): one request at a time with a pause and a named
  User-Agent; Greenhouse's list has no descriptions so only fresh postings get a detail call; keeps
  `first_published`/`createdAt`/`publishedAt` ≤ 48 h (Greenhouse's `updated_at` is ignored — it moves
  on every edit); skips known ids and duplicates; 5 failed nights in a row switch a board off.
  Parsers written against captured responses and checked live (Stripe 682 open / 33 fresh, Ramp 151 /
  5, OpenAI 817 / 35). Admin **Job sources** page: counts, last run, add (live-checked), switch off,
  read now. Privacy page says how users' companies join the pool. No ext change.
- 2026-09-22 · **13.5 ATS resume score** · Pro. `AtsChecks`: **15 deterministic checks, weights summing
  to 100** — summary present/length, skills listed/not stuffed, roles present/labelled/dated/dates
  consistent, bullets on the 3 latest roles, bullet length, **measurable results** (≥ ⅓ of bullets
  carry a number, % or amount), **action verbs** (≥ ½ open with one, no "Responsible for…"), no
  first person, education, a file on record. Each failed check says what to aim for. No AI, no
  storage — recomputed on request. Against a tracked job the score is **70 % structure + 30 %
  keyword coverage**, and coverage (covered ÷ covered + missing) comes from **13.3's cached job-fit
  report**, so the ROADMAP's "one Flash-Lite read, cached per (resume × JD)" is that same call — no
  second one. `GET /api/profile/resumes/{id}/ats-score`, `POST /api/profile/applications/{id}/ats-score`;
  402 on Free. Shared `AtsReport` in `@kiwiply/ui`. Web: **"ATS score"** in each resume's ⋯ menu
  (dialog; Free sees the upsell) and under the job-fit report on the board. "Contact" check swapped
  for "has a file": stored resumes keep no contact block (contact lives on the profile). No ext change.
- 2026-09-22 · **13.4 resume tailoring** · `ResumeTailorService` (task `tailor`, JSON-schema output):
  rewrites of a resume's **existing** bullets (by ref, `e0b1`) and summary, plus a reorder of its
  **own** skills, for one application's job. **Truthfulness is enforced by the server, not asked
  for:** unknown refs dropped; a rewrite with a **number its original doesn't have** dropped (commas
  normalized — "1,200" = "1200"); one naming the hiring company dropped; summary numbers must
  appear somewhere on the resume; skills rebuilt from the resume's own list; missing job keywords
  come back only as "add if true" suggestions, never applied. Checked proposals stored in
  `resume_tailor`, pinned to the source resume by id + content hash and cached per (JD × resume).
  **Saving** (`POST /api/profile/tailor/{id}/apply`) takes refs only — never text — rebuilds the
  resume from the stored proposal, creates a **new** resume (the original untouched), optionally
  links it to the application, and **refuses (409) if the source changed since**. Board: "Tailor for
  this job" per scored resume opens a before/after dialog — untick, rename, save or copy. The new
  resume has no PDF yet (the resume builder, 16.x, will). Privacy page updated. Tests:
  `ResumeTailorServiceTest` (14), `ResumeTailorResourceIT` (3). Browser-checked the dialog flow.
- 2026-09-22 · **13.3 job-fit panel** · Ext **v0.64.0**. `JobFitService`: one resume against one job
  (task `fit`, JSON-schema output) → score, a one-line summary, ≤ 12 requirements the resume shows,
  ≤ 10 it's **missing**, ≤ 5 **red flags**. Red flags may read exactly nine profile answers
  (work auth, sponsorship, city/state/country, relocate, work preference, start date, notice) —
  never name, contact or EEO — so "no sponsorship" is flagged only for someone who needs it.
  Cached in `job_fit` per (JD × resume content × those answers), report only; deleted with the
  account. Pro-gated + metered; the ROADMAP's Flash routing is `DOSSIER_AI_MODEL_FIT` (unset →
  Flash-Lite). `POST /api/ai/job-fit` + `POST /api/profile/applications/{id}/job-fit` (linked
  resume by default). Shared input bounding moved to `AiInputs` (13.2 uses it too). New
  **`JobFitReport`** in `@kiwiply/ui` (+ `AlertIcon`) — red flags first, then missing, then covered
  — used by both surfaces. **Drawer:** a "Check fit" card for the selected resume under the best
  match (on click; resets when the resume changes). **Board:** "See gaps & red flags" per scored
  resume. **One number per resume:** the report shows 13.2's ranking score (drawer) or none (board),
  after the browser check showed the same resume at 84 % and 71 %. Privacy page + PRIVACY.md say
  what's sent. Tests: `JobFitServiceTest` (11), `JobFitResourceIT` (4), provider +3.
- 2026-09-22 · **13.2 resume recommendation per job** · Ext **v0.63.0**. `ResumeMatchService`: one
  Flash-Lite call (task `match`, JSON-schema output) scores every live resume (≤ 10, default first)
  against a job description, best first with a ≤ 12-word reason. Inputs bounded per 13.1: each
  resume as a digest (summary ≤ 500 chars, ≤ 40 skills, ≤ 6 roles with one bullet, ≤ 3 degrees), JD
  ≤ 8000 chars; under 200 chars it isn't scored (a page summary). **Cached per (JD × resumes'
  content)** in `resume_match` (scores + reasons only, never the text), so asking again is free
  and any edit misses cleanly; deleted with the account. Pro-gated + metered through
  `AiBudgetService`; an unusable reply is an error but still metered (the provider billed us).
  `POST /api/ai/resume-match` (drawer) and `POST /api/profile/applications/{id}/resume-match`
  (board, owner-only). **Drawer:** after the picker loads, a Pro user with Kiwiply AI on sees
  "Best match: Backend v3 · 84%" with **Use** — it suggests, never auto-selects; without AI on, a
  hint to turn it on; nothing on non-job pages. **Board:** a "Resume fit" section in the detail
  panel — one click (the caption discloses Gemini) scores all resumes with bars and reasons, and
  **Link this resume** links one; Free sees the Pro line. `Meter` gained `neutral` (a full fit
  isn't a warning). Privacy page + PRIVACY.md updated. Tests: `ResumeMatchServiceTest` (12),
  `ResumeMatchResourceIT` (4), provider +3. Browser-checked the board section's three states.
- 2026-09-22 · **13.1c AI usage meter** · Ext **v0.62.0**. `GET /api/ai/usage` (from `AiBudgetService.usage`):
  Pro/override → `{metered:"budget", used:<percent>, limit:100, resetsAt, economy}`, Free →
  `{metered:"count", used:<parses>, limit}` — never dollars, and not blanked by a kill switch. Web
  Settings › AI & drafting and the extension's Options › AI show it: "32% of this month's Kiwiply AI
  used · Resets October 1" (reset shown in UTC, it's a UTC month boundary), amber past 80 % with a
  "lighter model" note when the economy model is on, red when used up. New `Meter` primitive in
  `@kiwiply/ui` (role="meter"). The admin AI page is now **cost**-based from the `ai_call` ledger:
  total, calls, users, average, per feature and per user (dearest first, with % of the Pro budget;
  deleted accounts' kept spend shown as one row). Tests: budget +3 (meter), `AiResourceIT` +3,
  `AdminAiUsageResourceIT` rewritten for cost, provider +2. Browser-checked the meter's four states
  at desktop + phone width. **13.1 complete.** Model decision: stay on 2.5 Flash-Lite.
- 2026-09-22 · **13.1b AI budget + routing** · Ext **v0.61.0**. New `AiBudgetService` makes one decision
  per call, before the provider: **kill switch** per task → **Pro gate** → Free resume-parse
  **count** → otherwise a **cost budget** from the `ai_call` ledger for the UTC calendar month ($5
  Pro default; `AiPolicy`, `dossier.ai.policy.*`). Past 80 % every task moves to the economy model
  (if one is set); at 100 % AI stops until the 1st, and the reply says when (`resetsAt`). Each task
  can run on its own model (`models.<task>`). The **admin override is now a monthly budget in
  cents** (column renamed; existing grants carried over as $5, $0 stays "none"); the admin control
  edits it in dollars. The extension says "You've used this month's Kiwiply AI — it resets on
  October 1" instead of "(100/100)". Pricing: 3.x Flash/Flash-Lite added, 2.5 cache rates
  corrected. **Model check:** the 2026-10-16 retirement is Vertex AI's — the Gemini API we call has
  no date for 2.5 Flash-Lite yet; successor `gemini-3.1-flash-lite` costs 2.5×/3.75×. Default
  unchanged pending the user's call. Tests: `AiBudgetServiceTest` (13), draft/parse tests reworked
  (12/9), `AiResourceIT` +2 (spent budget stops AI; last month's spend doesn't count), admin tests
  moved to cents, SW +4.
- 2026-09-22 · **13.1a AI cost tracking** · Ext **v0.60.0**. Every AI request now says what it's for
  (`task`: draft / pick / map / enrich; parse on its own endpoint; absent = draft, so old builds
  still work) and gets instructions written for it — picks, mapping and enrichment no longer get
  the drafting prompt's "2-4 sentences". The Gemini response's `usageMetadata` is read (thinking
  billed as output, cache hits split out) and every successful call lands in a new **`ai_call`
  ledger** with its model, tokens and cost in micro-dollars (`AiPricing`, `dossier.ai.pricing.*`,
  Flash-Lite + Flash built in; an unpriced model is costed high and logged). Bugs fixed: **Pro users
  were capped at the Free 50 for resume parsing**; the **prod compose defaulted to
  `gemini-2.0-flash`** (limit:0) and never passed the Pro quota / output cap / base URL through; the
  **monthly counter lost updates** under concurrency (now one MySQL upsert). Account deletion drops
  the month's count and strips the login from the ledger (spend kept, person gone). Tests:
  `GeminiAiProviderTest` (6), `AiMeteringServiceTest` (3), draft/parse service tests reworked
  (14/10), `AiResourceIT` +4, deletion IT extended, extension provider +2.
- 2026-09-22 · **10.3e suggestions review** · The dashboard shows **"We learned N things about you —
  keep these?"** above the setup checklist, only when there's something to review. Each row names
  the field and shows the value, or *old → new* for a change. **Keep** writes it to the profile;
  **Edit** adjusts it first (a dropdown for list fields like notice period, so the value stays one
  forms offer); **Dismiss** means never again. Keeping signals the extension to pull and refreshes
  the checklist; a row already decided in another tab just disappears. Proxy route
  `POST /api/suggestions/:id/(accept|dismiss)` validates the id, the action and the edit. The
  suggestions fetch is best-effort — a failure means no card, never a broken dashboard.
  Browser-checked at desktop and phone width against a stubbed API (a phone-width overlap of
  buttons over the value was found and fixed). **10.3 complete.**
- 2026-09-22 · **10.3d extension capture** · Ext **v0.59.0**. `profile-learn.js`: after a fill, the
  extension watches the page's **profile questions** — the fill's canonical items (a later change is
  a candidate change) plus high-confidence ones the profile is blank for (the answer fills it) —
  and reports committed answers, debounced and de-duplicated, as `JAF_LEARNED_ANSWERS`. The SW
  reduces the page to a **per-install salted SHA-256** (so the server can count distinct
  applications without ever seeing, or being able to look up, the address) and POSTs
  `/api/profile/suggestions` via the tracking seam. Never EEO, checkboxes or placeholder-only
  guesses; Yes/No questions report "Yes"/"No" however worded. **"Learn from my applications"**
  in Settings (on by default; separate from the analytics opt-out); signed-out sends nothing;
  only our content scripts are heard. PRIVACY.md + the web privacy page disclose it.
  `profile_learn` (26) + SW (13) + provider (3) tests.
- 2026-09-22 · **10.3c suggestions API** · `profile_suggestion` table + `ProfileSuggestionService` +
  `/api/profile/suggestions` (`POST` learned answers, `GET` the ones worth showing, `POST
  {id}/accept` with an optional edit, `POST {id}/dismiss`). Free and Pro alike. Only the 22
  canonical non-sensitive profile keys — **EEO and resume text are never stored**. A blank field
  is suggested at once; a change needs the same value on **2 different applications** (an opaque
  per-application hash, never a URL; seen twice on one application counts once). One suggestion
  per field, newest wins; what the profile already says is never suggested; decided is decided
  (a dismissed value never returns). Accept writes the bio over its other keys (so the extension's
  version moves) and drops the field's other undecided values; it refuses (409) to write over an
  unreadable profile rather than wipe it. Pending capped at 50. In account export and deletion
  (FK, no cascade — the deletion test now covers it). `ProfileSuggestionServiceTest` (6, unit) +
  `ProfileSuggestionResourceIT` (11).
- 2026-09-22 · **10.3b onboarding** · `/welcome`: one question per screen — work authorization,
  sponsorship, salary, notice, work preference + relocation, and EEO self-ID (optional, says so).
  Every question skippable, **"Skip for now"** always on screen, each step saves as you go. The
  dashboard (the post-login landing page) sends a user there **once** — until they finish or
  skip (`onboardedAt` in the bio) — and never if they'd already answered work authorization or if
  the profile fetch failed (an API hiccup must not bounce a full profile into onboarding);
  `?next=` flows like `/connect` are untouched. The last screen points to **Upload your resume**
  when there isn't one (Tier B). New `ChoiceGroup` primitive in `@kiwiply/ui` (radio-group
  semantics, arrow keys, one tab stop); answer lists moved to `lib/profile-options.ts`, shared
  with the profile editor. Browser-checked at desktop and phone width against a stubbed save.
- 2026-09-22 · **10.3a job-preference fields** · Ext **v0.58.0**, rules **v6**. Desired salary, notice
  period, earliest start date, work preference, willing to relocate and "how did you hear about
  us" are canonical fields: matched by phrase rules (not bare words — "Current salary", a
  work-history "Start date" and "relocation assistance" stay unmatched), in the AI mapper's
  vocabulary, and editable under **Job preferences** on the web profile. Filling got three
  guards: a number box takes the number out of "$120,000"/"120k", a date picker only takes a
  real date ("Immediately" is left for the user), and a radio group of choices picks the named
  option — a non-Yes/No value is **never coerced into "No"** any more (the old path would have
  answered a Yes/No question with "No" for "Hybrid", or unticked a checkbox). `profile_fields`
  tests (43). Experience/education stay per resume (user decision).
- 2026-09-22 · **10.2 post-fill audit** · Ext **v0.57.0**. When a fill leaves required fields empty, the
  modal panel becomes a small non-modal card — *"2 required fields still need you"* — naming each
  field by its label (a radio group by its question); **Go →** scrolls to it, focuses it and
  outlines it; items tick off as the user fills them, and the card closes itself once all are
  done. **Auto-advance now waits** while any are missing (the page would refuse the step and the
  user would be left guessing why). Reuses 10.1's scan, so the admin count and the user's list
  can't disagree; the scan now also treats a label ending in `*` as required. Nothing here leaves
  the page. Tests: `required_gaps.test.js` (30: asterisk rules, naming, the card, jump-to,
  tick-off, auto-advance paused *and* unchanged when nothing is missing). **Verified in a
  browser** on a mock application form running the real extension scripts: card, jump-to below
  the fold, tick-off, and auto-advance held.
- 2026-09-22 · **10.1 fill telemetry per ATS** · Ext **v0.56.0**. One count-only event per autofill run —
  ATS family, adapter, fields found / filled / failed, required left empty — plus a later
  signal the first time the user changes a field we filled. First-party into a new `fill_event`
  table (**no user id**: it measures the engine, not people), feeding a **Fill quality by ATS**
  panel on `/admin/analytics` ranked worst-first by gap rate (fills that left a required field
  empty), then fill rate, then volume — the list 10.4 takes its adapter work from. **The privacy
  line is enforced twice:** the content script reduces the hostname to a fixed family before
  anything leaves the page (so the five uncovered hosts are distinguishable without a company's
  careers domain ever being sent), and the server maps anything outside the vocabulary to
  `other` and clamps every count. Honours the existing analytics opt-out; disclosed in
  `PRIVACY.md` and the web privacy policy. New: `fill-telemetry.js`, `required-audit.js` (10.2
  reuses it), a correction hook on `fieldCache.watch`, `FillTelemetryResource`
  (`POST /api/telemetry/fills`, `…/{id}/correction`, both always 204). Tests:
  `fill_telemetry.test.js` (47, incl. an end-to-end run of the real overlay),
  `sync_signal` +6, `tracking` +4, `FillTelemetryServiceTest` (9), `FillTelemetryResourceIT` (11),
  `AdminAnalyticsResourceIT` +2. **Not verified locally:** the integration tests and the admin
  panel in a browser — Docker Desktop was off, so neither MySQL nor the API could run; CI runs
  the ITs. `api/openapi.json` will pick up the new endpoints on the next local IT run.
- 2026-09-22 · **Pre-launch review follow-ups — the two open decisions, plus two more bugs** · Ext
  **v0.55.0**. User decisions: *clear the extension on sign-out* and *fix the timezone*.
  **(1) Sign-out means this browser forgets the account.** Before, sign-out dropped only the
  tokens: the drawer kept the previous user's profile and resumes (and would autofill with
  them), and a shared computer's next user inherited everything, learned answers included.
  `JAF.storage.clearAccountData()` is now the one definition of account-vs-device data — bio,
  resumes + files, learned answers, AI drafts/picks, the plan badge, and `trackingPending`
  (whose application ids would otherwise be attributed to the next account). Device settings
  stay (BYO key, auto-advance, theme, label/job caches). Both paths use it; the options page now
  confirms first and says plainly that on Free, learned answers exist only in this browser.
  Connecting a *different* account over one that never signed out also clears first (only when
  both names are known — a guess would cost a Free user their only copy). **Web sign-out keeps
  learned answers** (user decision, option B): on Free they're the only copy and web sign-out is
  routine, so they stay — with an owner marker, since the session holding the username is gone —
  and are wiped the moment a different account connects. The options-page sign-out confirms
  and clears everything. **(2) A pull prunes
  resumes deleted on the web** — they used to linger in the picker until reinstall; local-only
  (unpushed) resumes are never touched, and a failed list prunes nothing. **(3) Dates render in
  the viewer's zone and hydrate cleanly.** All web dates were formatted on the UTC/en-US box —
  a 02:53 UTC renewal read "October 22" while Stripe said the 21st — and the board and resume
  list mismatched on hydration for anyone off UTC or en-US. Now a fixed form on the server and
  during hydration, the viewer's own afterwards (`lib/dates.ts` pure, the hook in its own
  client-only module so Server Components can import the formatter — the Next build caught that,
  typecheck and lint don't). **(4) A cancelled subscription said "Renews on".** An immediate
  cancel leaves `canceled` + `cancelAtPeriodEnd:false`, and the card fell through to "Renews on"
  for a subscription that will never renew; now "Cancelled — you keep Pro until …". Tests:
  `account_clear.test.js` (21, new), `sync.test.js` +3 prune cases, `sync_signal` +4. The web
  has no unit runner, so the formatter was exercised directly under two machine time zones.
  **Not done:** a live-browser check of the board and resume dates — Docker Desktop wasn't
  running, so the API couldn't boot.
- 2026-09-22 · **Pre-launch review of Phases 11–12 — five more bugs, all fixed** · Ext **v0.54.1**.
  A read-through of everything the 12.7 run could not reach, risk-ordered: money path, gates, web
  and extension surfaces, sync. **(1) Account deletion was broken for every user who had ever
  started a checkout** — `subscription.user_id` is a foreign key with no cascade and
  `AccountDeletionService` never touched the row, so `DELETE /api/account` (and the admin path)
  threw for exactly the users who pay. Worse, had the row been deleted, the Stripe subscription
  would have kept renewing an account with no login left to cancel from. Deletion now cancels the
  subscription in Stripe first (immediately — there will be no account to enjoy the remainder,
  and the refund policy already covers it), then drops the row, then the user; a Stripe refusal
  aborts the deletion rather than orphaning a billing subscription. **(2) A failed webhook apply
  was never retried:** the event was recorded as `ok` before applying, so our own 500 asked
  Stripe to retry and the retry was waved through as a duplicate — one transient DB error and the
  event that would have made someone Pro was gone. `record()` now re-admits a row marked
  `failed`. **(3) The payment-failed email could be dropped** when the matching
  `subscription.updated` (past_due) arrived first and made the `invoice.payment_failed` stale:
  the write was correctly skipped, and the email went with it. The email is now decided by the
  row's state, not by which event wrote it. **(4) Every failed checkout leaked a Stripe customer:**
  `startCheckout` is transactional, so a session failure rolled back the customer id we had just
  saved. `noRollbackFor = BillingException` — the 502 still propagates, the binding stays.
  **(5) Extension sign-out left the plan badge and version marker behind**, so on a shared
  machine the next person saw the previous user's "Pro" pill until their first check; both now
  leave with the session. **Two product decisions deliberately left open** (see the review
  message of 2026-09-22): the extension mirror is never cleared on sign-out and a pull never
  prunes resumes deleted on the web — a shared-machine leak and a stale picker, but clearing
  would also drop a Free user's device-local learned answers; and renewal dates render in the
  server's timezone, so the production box will show "October 22" where the portal says the 21st.
  **Checked and clean:** signature over the raw body, webhook `permitAll` with CSRF off, the
  entitlement rule, all three gates, token refresh on every pull path, archived resumes filtered
  from the picker, the fingerprint covering every field a web edit can change, web routes passing
  error codes through, the success page never erroring. Tests: `AccountDeletionResourceIT` +2
  (subscribed user deletes and stops being billed · keyless server still deletes),
  `BillingWebhookIT` +2 (failed apply re-applied on retry · stale payment_failed still emails),
  `BillingResourceIT` +1 (failed session keeps the customer), `sync_signal.test.js` +4.
- 2026-09-21 · **12.7 the end-to-end Stripe run — eight bugs, all fixed** · The point of this task
  was to find what reading the code could not, and it did. **Verified live:** checkout → 402-free
  session → payment → webhook → Pro within seconds; `checkout.session.completed` arriving **after**
  `customer.subscription.created` and still binding correctly (the out-of-order case 12.2 was
  designed for, seen against real Stripe delivery rather than a fixture); renewal date in Settings;
  portal cancel → "cancels on"; **cancelling does NOT revoke access** — Stripe keeps
  `current_period_end` at the paid-through date, so the ToS promise ("you keep Pro until then")
  holds; lapse → Free with **all four resumes intact** and a 5th refused **402 `RESUME_LIMIT`
  {limit:3,count:4}**; `POST /field-caches/sync` → **402 `PRO_REQUIRED`** while `GET` stays 200.
  **The eight bugs:** (1) Stripe config values were not trimmed — one trailing character in a
  pasted key produced a 502 whose only real explanation lived inside a Stripe exception, and .NET
  trims headers so probing the key from PowerShell *succeeded*, pointing the diagnosis the wrong
  way. (2) `automatic_tax[enabled]=false` was sent unconditionally, which **Managed Payments
  rejects** — and Stripe enables Managed Payments by default on new accounts, so our default
  config was invalid against a default Stripe account. Now sent as `true` or omitted, never
  `false`. (3) `managedPayments` was a boolean that could only turn MoR *on*, the state it was
  already in, with no way to turn it *off* — despite its own comment promising otherwise. Now
  tri-state, unset by default. (4) The API started happily with billing on and **no webhook
  secret**: checkout works, the customer is charged, nothing ever activates. Now an ERROR at
  startup — the last moment to say so before money moves. (5) A **racing duplicate delivery
  returned 500**: the constraint violation was caught inside the transaction, which was already
  rollback-only, so the commit threw. Self-healing via Stripe's retry, which is why nobody noticed.
  (6) **Double billing.** `startCheckout` guarded on our mirror, which is only as current as the
  last webhook — one lost delivery and a second checkout sails through. It produced **one customer,
  two active subscriptions, two invoices, two charges**, live. It now asks Stripe. (7) Worse: a
  webhook for **any** subscription on a customer was applied to the single row we mirror, so
  cancelling a stray subscription **revoked Pro from a customer still paying** for a different one.
  Only a live subscription may take a row over now. (8) A log line that said "no subscription row
  … yet" immediately after correctly logging that the customer *was* bound. **Docs the run
  fixed:** the product needs a `tax_code` (mandatory under Managed Payments — undocumented, and it
  surfaces as a 502 pointing nowhere); `stripe listen` needs `--events` from CLI v1.51; the webhook
  secret is ~70 chars and must not be hand-copied; `stripe events resend` cannot reach the CLI
  listener; `stripe trigger` cannot fake a failed payment (by design, since fix 7); and the runbook
  now carries PowerShell as well as bash. **Six of the eight would have behaved identically in
  production, and three of them take money without delivering Pro.**
- 2026-09-21 · **12.7 runbook written (the run itself is still owed)** · Docs only. `DEPLOY.md`
  **§11.1** is the step-by-step for the end-to-end sandbox run: local stack, `stripe listen`
  first (its `whsec_` is per-session), API with sandbox keys, sign in as the seeded `user`/`user`
  so no verification email is needed, then the run itself. Three things the plan didn't
  anticipate, found while writing it and worth knowing before you start: **(1)** MinIO has to be
  up even for a billing test, because the resume-cap step uploads three real files and the web
  upload route rolls the row back if the file upload fails; **(2)** `stripe trigger
  invoice.payment_failed` creates a *brand-new* customer, so it never touches your row — use
  `--override invoice:customer=cus_…`, and locally expect the payment-failed email to fail to
  send, which is correct (a mail failure must not fail a webhook); **(3)** a **test clock can only
  be attached when the customer is created**, and checkout creates its own customer — so seed the
  `subscription` row with a clock customer id *before* the first checkout, which works because
  `startCheckout` reuses an existing `stripe_customer_id` forever. The SQL is in the runbook.
- 2026-09-21 · **12.6 billing copy + legal hooks** · Docs/copy only, no extension change. The ToS
  **Fees** placeholder ("free to start during beta") became a real **Billing and subscriptions**
  section at `/terms#billing`: prices, auto-renew, **no free trial**, self-service cancellation
  that takes effect at period end, **"no refunds, cancel any time"** with an explicit
  statutory-rights carve-out, failed-payment retries, advance notice of price changes (new price
  applies from the next renewal only), and Stripe as processor with "we never see your card
  number". The Privacy Policy gained a matching **Payments** section plus a `Billing` line in
  *What we collect*. Two contradictions the new copy exposed were fixed rather than left for the
  lawyer: **Termination** and **Retention and deletion** both promised deletion of *everything*,
  which is not true of transaction records we must keep for tax — both now carve that out and say
  it contains no profile/resume/application data. `/pricing` and Settings › Billing now link to
  `/terms#billing` (the point-of-sale copy stays inline — the FTC negative-option rule wants the
  terms next to the button, and a link is not a substitute). Both pages dated **September 2026**.
  Verified by rendering `/terms`, `/terms#billing` (anchor lands 96px down, clear of the header)
  and `/privacy` in the browser; web typecheck, lint and build clean. The wording still goes to a
  lawyer in **15.2** — the statutory-rights line and a governing-law clause are the open items.
- 2026-09-21 · **12.5 admin revenue panel** · No extension change. `AdminAnalyticsService.overview()`
  gained `billing {activePro, monthlyCount, threeMonthCount, mrr, newThisMonth, churnedThisMonth,
  pastDue}`, folded in memory from `subscription` — one row per paying user, and the Pro rule is
  `EntitlementService.isProFor`, a Java predicate that must not be duplicated in SQL. Three
  decisions worth remembering: **revenue follows the entitlement rule, not the `plan` column**, so
  the card can never bill us for someone being served Free; **`past_due` still counts as revenue**
  (they are still Pro while Stripe retries) but is surfaced separately as risk; and **churn is
  "the paid period ended this month"**, not "cancelled this month" — cancelling in March for a
  period ending in May is a May loss. MRR normalises the 3-month plan to a third of its price. The
  plan amounts are new config (`dossier.stripe.amount-monthly` 19.99 / `amount3mo` 44.99) rather
  than constants, because Stripe owns the real price and we don't mirror the amount on the row —
  so the Launch-2 rise is a deploy, not a code change, and the only thing that lies if they drift
  is this one card. A Pro row on an unrecognised price counts as a user but contributes no
  revenue, and the web card shows the gap rather than hiding it. Tests: `AdminAnalyticsResourceIT`
  +5 (empty → 0 not an error · one of each plan → 34.99 · lapsed → no revenue + churn · past_due →
  revenue + flagged · unknown price → no revenue). `api/openapi.json` re-published.
- 2026-09-21 · **12.4 the gates — Free tier redefined** · Ext **v0.54.0**. Three `requirePro()`
  calls, all at the service boundary rather than in a controller, so both upload paths and all
  three AI callers are covered by one check each. (1) `AiDraftService` — new
  `Status.PRO_REQUIRED`, mapped by `AiResource` to **402 `PRO_REQUIRED`**; drafting, field mapping
  and option picks all ride `/api/ai/draft`, so gating it gates all three. An **admin quota
  override outranks the plan gate** and supplies the quota; Pro gets the new
  `dossier.ai.pro-monthly-quota` (2000). `AiResumeParseService` is deliberately untouched — it is
  how a profile builds itself. The gate is checked **before consent**, so a Free user is told the
  useful thing instead of being sent to tick a box that still wouldn't let them through.
  (2) `POST /api/profile/field-caches/sync` — Pro; `GET` is not, because a downgrade must never
  hide data you already own. The extension already treats this call as best-effort, so a 402 is a
  silent no-op. (3) `ProfileService.createResume` — 402 `RESUME_LIMIT {limit,count}` at 3
  **non-archived** resumes, so archiving is how you make room and a lapsed Pro user loses nothing.
  Clients: the SW turns a `PRO_REQUIRED` into "Kiwiply AI is a Pro feature — upgrade, or add your
  own key" (true: a BYO key still takes priority); `SaveResult` gained an optional `cta`, so the
  cap shows an inline upgrade link in web `ResumeUpload` (→ `/pricing`) and the extension's
  on-the-fly upload (→ kiwiply.com/pricing). Clients branch on `code` and display `detail` —
  `title` is overwritten with the HTTP reason phrase by `ExceptionTranslator`. Tests:
  `AiDraftServiceTest` (+4: PRO_REQUIRED, outranks consent, override drafts, Pro quota) ·
  `AiResourceIT` (Free 402 · Pro drafts · override drafts · parse-resume still free — not
  `@Transactional`, and asks for a bigger pool, because a successful draft's `REQUIRES_NEW` answer
  cache needs a second connection and the shared test config pins Hikari to one) ·
  `FieldCacheSyncResourceIT` (Free 402 / Pro 200 / list still works on Free) · `ProfileResourceIT`
  (4th create 402 with counts · archived don't count · Pro uncapped) · `tracking.test.js` 71.
- 2026-09-21 · **12.3 checkout, portal and every surface that shows a plan** · Ext **v0.53.0**.
  API: `POST /api/billing/checkout` (creates the Stripe customer once then reuses it forever, so
  invoices stay on one customer) and `POST /api/billing/portal` — the portal is the click-to-cancel
  path rather than a screen we build. Neither ever marks anyone Pro; only the webhook does, because
  a return URL can be skipped, replayed or forged. Web: public `/pricing`, `/billing/success` that
  polls until the webhook lands and **has no error state** (the payment already succeeded — telling
  someone who just paid that something failed would be alarming and untrue), Settings › Billing
  with renewal/"cancels on" dates and the auto-renew + no-refund terms stated inline, and a Pro
  pill in the sidebar fed by ONE plan fetch in the `(app)` layout. Extension: the plan now rides on
  `GET /api/profile/version`, so an upgrade is noticed inside the 11.3 check the extension already
  runs — no new round-trip and no stale JWT claim — and `ApiError` lifts `code` out of the
  ProblemDetail so callers branch on `PRO_REQUIRED` rather than a message.
  Three course corrections: **one source of truth for "is billing on"** — `EntitlementService` now
  asks `StripeGateway`, not `StripeProperties`, because `/me` and the endpoints it gates were
  reading different things and could have disagreed; **Managed Payments and Stripe Tax are config
  flags, both default off** (MoR was hardcoded on, which would have forced tax setup before
  anything worked, and the economics change with volume); and `checkAndPull` **records the plan on
  every answered check, not just on a pull** — an upgrade changes no bio and no resume, so a
  plan-only change would otherwise never be seen. Tests: `BillingResourceIT` 10/10 against a
  stubbed gateway (customer created once and reused, unknown plan refused, already-Pro → 409,
  portal 404 without a customer, billing-disabled → 503 while `/me` still answers),
  `tracking.test.js` 67 (version+plan shape, 402 `code` surfacing, null-code stays null),
  `sync.test.js` 41 (plan recorded on an unchanged check, a missing plan doesn't wipe the known
  one, and the pre-12.3 bare-string shape still works). Full API, extension and web gates green.
- 2026-09-21 · **12.2 the Stripe webhook — the only writer of subscription state** · API only.
  `POST /api/billing/webhook`, unauthenticated by necessity (Stripe has no session with us) but
  **not unprotected**: the raw body is verified against the webhook secret before anything is
  read, and the body is taken as a `String` because the signature covers the exact bytes sent.
  Status codes are chosen for Stripe's retry logic, not a browser — 400 unverified (nothing
  recorded), 200 applied-or-duplicate, **500 to ask for a retry**, with the event marked `failed`.
  Three things the plan didn't foresee: **`StripeEvent` had to implement `Persistable`** or Spring
  Data would treat the assigned id as "existing", make `save()` a merge, and let a replay quietly
  *update* its own row — the PK-as-idempotency-key claim was decorative until this; **transactions
  are explicit `TransactionTemplate`s**, because the three steps are self-invoked from `handle()`
  where `@Transactional` is silently skipped by the proxy; and **`checkout.session.completed` is
  exempt from the out-of-order drop**, since it writes identity (customer↔user) rather than
  mutable state — applying it late is harmless, skipping it would orphan the subscription from its
  account. Separately hardened `dataObject()` against Stripe API-version drift: `getObject()`
  returns empty (or NPEs, for an event with no `api_version`) whenever the dashboard's version
  differs from the SDK's, which would have silently stripped the state out of every webhook after
  a routine upgrade on either side. Tests: `StripeGatewaySignatureTest` 4/4 — valid, wrong secret,
  tampered-after-signing, no secret configured — and `BillingWebhookIT` 9/9, which signs its
  fixtures exactly as Stripe does (HMAC-SHA256 over `t.payload`) so the real verification runs:
  forged delivery leaves no trace, binding, state mirroring, replay changes nothing, a stale event
  can't resurrect a cancelled subscription, cancellation stays Pro until the period ends, a failed
  charge emails and keeps Pro, `invoice.paid` restores active silently, and an event for an unknown
  customer is a quiet 200. Full API unit + integration suites green.
- 2026-09-21 · **12.1 billing schema, entitlement service and the Stripe seam** · API only, no UI,
  no extension change. `subscription` (one row per user, Stripe's `status` stored verbatim) +
  `stripe_event` (**the `evt_…` id is the PK — that IS the idempotency**, so a Stripe retry
  collides on insert instead of re-applying). `EntitlementService.isProFor(status, periodEnd, now)`
  is a pure static so the rule is testable as a matrix: `active`/`trialing` → Pro even if our
  mirrored period end looks stale (a delayed renewal webhook must never downgrade someone who is
  paying); `past_due`/`canceled` → Pro **until** the period ends (Smart Retries are still running;
  cancelling means "don't renew", not "cut me off"); everything else, including any status Stripe
  adds later, → Free. `StripeGateway` isolates the SDK — `StripeGatewayImpl` is the only class
  importing `com.stripe.*`. **Blank `STRIPE_SECRET_KEY` disables billing** and that is a valid
  running state, which is how develop, CI and prod run today. Two course corrections the plan
  didn't foresee, both forced by `TechnicalStructureTest`'s layering rule: `StripeProperties` moved
  `config/` → `service/billing/`, and `ProRequiredException` became a service/web pair mapped in
  `ExceptionTranslator`, mirroring `EmailAlreadyUsedException`. Dropped the raw-JSON fallback for
  `current_period_end` (Gson isn't on the compile classpath); it reads from the subscription item
  and `null` means lapsed, so a missing value can only cost Pro, never grant it. `DEPLOY.md` §11
  documents the four secrets and that a keyless server is fine. 14 unit assertions,
  `BillingResourceIT` 5/5, full API unit + integration suites green.
- 2026-09-21 · **Phase 12 planned to build depth (Stripe billing & entitlements)** · Docs only.
  Same treatment Phase 11 got before Opus built it: ROADMAP Phase 12 now opens with the locked
  decisions — **Stripe is the truth and only webhooks write our `subscription` mirror** (the
  checkout return page can be skipped, replayed or faked); **`past_due` stays Pro until
  `current_period_end`** (Smart Retries run in that window; downgrade at period end); gated calls
  fail **402 `PRO_REQUIRED`** not 403; **no free trial**; the resume cap counts **non-archived**
  and never deletes; the **admin quota override outranks the gate** (support escape hatch);
  **the plan rides on `/api/profile/version`** so the extension learns it inside the 11.3 check
  with no new round-trip and no stale JWT claim; **`stripe-java` behind one `StripeGateway`** so
  tests stub it and nothing else imports Stripe. Then 12.0 (human Stripe setup, test mode first,
  exact events list) → 12.1 schema (`subscription` one-row-per-user + `stripe_event` with the
  event id as PK = idempotency) + `EntitlementService` + gateway + **billing-disabled-when-key-
  blank** so develop/CI run keyless → 12.2 the webhook as the only writer (raw body, signature,
  duplicate short-circuit, out-of-order drop by `last_event_at`, 500-so-Stripe-retries) → 12.3
  checkout/portal/pricing/success/settings + extension plan badge → 12.4 the gates (AI drafting
  + mapping/picks unless overridden; field-cache sync; resume cap at `createResume`) → 12.5
  admin MRR panel → 12.6 auto-renew / click-to-cancel / refund copy → 12.7 the Stripe-test-mode
  end-to-end run with a test clock. Every task names its tests.
- 2026-09-21 · **11.4 sync-model docs — Phase 11 complete** · Docs only, no version bump.
  `ARCHITECTURE.md` gained a **Sync model (Phase 11)** section: the three refresh mechanisms
  (instant web signal → version check → what triggers a check), the offline rule that a failed
  check keeps the stored marker, the revoke backstop (1.11 rotation kills a stale token at its
  next use if the `signedOut` signal never arrives), and why there are no WebSockets — MV3 tears
  the worker down after ~30 s idle, so a persistent connection would reconnect constantly and
  still miss events while dead. Two stale lines fixed while in there: the `background.ts` entry
  duplicated the 11.1 detail and now points at the new section, and the read-only-mirror note
  still said "the popup pulls `JAF.sync.pullAll` on open (throttled)" — there has been no popup
  since W4 and no throttle since 11.3. `HANDOFF.md` points at the section.
- 2026-09-21 · **11.3 extension version checks — the 90 s throttle is gone** · Ext **v0.52.9**.
  The drawer used to guess at staleness with a 90 s timer, which both skipped refreshes that were
  needed and allowed ones that weren't. `JAF.sync.checkAndPull` now GETs the 11.2 fingerprint and
  pulls only on a mismatch or first run; a failed check pulls nothing **and keeps the stored
  marker**, so going offline neither thrashes the mirror nor makes the next check look like a
  first run. Three callers: a `chrome.alarms` `kiwiply-sync` every 15 min (re-created on
  `onInstalled` *and* `onStartup`, since alarms don't survive an update — new **`alarms`**
  permission), `windows.onFocusChanged` guarded to one check per 60 s, and the drawer's
  `refreshMirror`. Both SW listeners are feature-guarded, so contexts without `chrome.alarms` /
  `chrome.windows` still load. The 11.1 `changed` signal keeps pulling unconditionally but now
  records the version it pulled under, or the next alarm would re-fetch the same data. `alarms`
  also added to the `PRIVACY.md` + `STORE-LISTING.md` justification tables. Side effect worth
  knowing: `syncLearnedAnswers` sat behind the same throttle, so the field-cache push+merge now
  runs on every drawer open. 37 assertions in `sync.test.js`, 48 in `sync_signal.test.js`; full
  suite, typecheck and build green, and the built manifest carries the permission.
- 2026-09-21 · **11.2 `GET /api/profile/version`** · Ext **v0.52.8**. The fingerprint the extension
  will poll (11.3) to re-pull only on change. It's a **hash of exactly what a pull returns**, not a
  counter: `Resume` has no `updatedAt` (only `createdAt`), so a counter would need a migration plus
  a touch on every write path and could still miss one — the IT's archive-toggle case is precisely
  the change a `createdAt` scheme would have missed. `service/ProfileVersion.java` (pure SHA-256 →
  16 hex over bio `updatedAt`+`payload` and every resume DTO sorted by id) + `ProfileService.
  profileVersion()` + `ProfileResource GET /version` + `vm/ProfileVersionVM`; **never 404** so an
  empty profile still compares. Ext: `TrackingProvider.profileVersion()` (base NotSupported; Kiwiply
  GETs → string|null). `ProfileVersionResourceIT` 4/4 (empty → stable 16 hex; moves on bio PUT,
  resume create/archive/unarchive/delete; another user's row doesn't move mine) — first local run
  failed only because Docker couldn't pull Testcontainers' `ryuk` image; passed on retry.
  Same day, the rest of Phase 11 (11.3 alarms + focus + drawer `checkAndPull`, 11.4 docs) was
  specified to build depth in ROADMAP/PROGRESS so it can be implemented without re-deriving.
- 2026-09-21 · **11.1 web → extension change signal** · Ext **v0.52.7**. The extension's mirror only
  refreshed when the drawer opened (90 s throttle), and a web sign-out never reached it. Now the web
  fires `notifyExtension("changed"|"signedOut")` after every profile/resume mutation, sign-in and
  sign-out — Chrome direct via `externally_connectable`, Firefox via the existing connect-relay —
  and the background handles `KIWIPLY_SYNC` through the **same origin gate** as the connect handoff
  (an ATS content script or a foreign origin is ignored). `changed` pulls the mirror in the SW
  (which now loads `storage.js`), stamps `__lastPull`, and broadcasts so an open drawer repaints;
  `signedOut` revokes best-effort and always clears the session. `connect/page.tsx` now imports the
  shared `EXT_ID`. 32 new assertions; full suite, typecheck, build and the web gate green.
- 2026-09-21 · **Go-to-market plan written — Phases 11–17** · Docs only. Everything decided in the
  planning session is now build-ready: **Free + Pro** ($19.99 / $44.99-per-3-months at Launch 1 →
  $24.99 / $54.99 at Launch 2, no annual), Free = no server AI except resume parsing, 3 resumes;
  **sync** = web→ext signal + `/api/profile/version` + alarms; **billing** = Stripe with `isPro()`
  in the API as the only truth; **Pro AI** = credit metering/routing/caching first, then resume
  recommendation, job-fit panel, tailoring (~90 % gross margin at Gemini rates); **inbox** = the
  user's dedicated consumer Gmail over IMAP + App Password, mirroring Sales-App — **no Kiwiply
  address, no forwarding, no OAuth**, poll inbox + sent, no attachments, encrypted creds,
  read-only. Two launches: ops hardening + PL.1 legal + store resubmit sit in **Phase 15** right
  before Launch 1 (by decision, not earlier); **daily job matches** (public ATS job-board APIs,
  ≤ 48 h, match %, feedback loop), analytics, reminders, digest and calendar
  sit in **Phase 16** before Launch 2. 3.6.5 and the 8.4 secrets/retention slices re-homed into
  14; 3.6.6 folded into 10.1. Competitor cross-check (Simplify, Teal, Jobright, Huntr,
  Careerflow) recorded with verdicts — job matches → build, ATS score + cover letter →
  candidates. CWS v1 published and under review.
  **Follow-up decisions the same day:** job matches split into a **light 13.6 (Launch 1)** and a
  **strong 16.1 (Launch 2)**; **ATS resume score → 13.5, Launch 1**; **cover-letter generator →
  16.6** and **resume builder + templates → 16.7**, both Launch 2 (the builder reverses the
  earlier "no", layered on upload-first).
- 2026-09-21 · **Phase 10 planned — fill quality & the self-building profile** · Docs only.
  Review of the engine found the gap behind "it's not filling enough": a **23-field**
  vocabulary, 6 adapters (5 manifest hosts — iCIMS, Taleo, SmartRecruiters, BambooHR, Jobvite
  — on the generic scanner with none), Greenhouse at 61 lines / 6 selectors vs Workday's 479,
  AI **off by default**, and no measurement or post-fill check anywhere. Logged as ROADMAP
  Phase 10 + PROGRESS tasks 10.1–10.6, ordered measure → post-fill audit → profile spine →
  adapter grind, so coverage work is directed by telemetry rather than guessed. Core user
  decision recorded: **the profile builds itself** — ≤6 onboarding questions for what a resume
  can't supply, resume parsing for the bulk, and the rest learned from real applications via
  the field cache promoting answers to suggested profile values. That adds a second write-back
  path, so CLAUDE.md's pull-only locked decision gained an explicit Exception 2.
- 2026-09-21 · **overlay row layout: badges grouped, label column widened** · Ext **v0.52.6**.
  Cosmetic follow-up to the cross-site work, caught by rendering the real overlay and looking
  at it. A row carrying both a `?` and a `reused` badge broke *between* them and stranded one
  on its own line. Badges now render inside a single nowrap `.badges` group (also replacing
  the four-deep inline ternary chain in `rowHtml` with a readable builder). The label column
  then went **110px → 152px** (manual rows 128 → 170, keeping the two row types aligned),
  which fits `Notice period ? reused` on one line and drops a row of height off most long
  questions. That space comes straight out of the value column, which ellipsises — so `.val`
  now carries a `title` with the FULL value (the truncated text was previously unrecoverable,
  even before this change). Width chosen by rendering 110/132/152 side by side. No behaviour
  change: checked state and every badge condition are untouched.
- 2026-09-21 · **learned answers now reuse across ATS sites** · Ext **v0.52.4**. The cache
  keyed every answer by `hash(host|label)`, so the same question on a different ATS was a
  clean miss — reuse only ever worked within one host, which is not what "remember my
  answers" means to a user filling ten applications across five sites. Each answer is now
  written twice: the host-scoped row, plus a host-agnostic twin `contextHash("", label)`.
  Reads try the host row FIRST (`lookup()` returns `{value, scope}`), so a deliberate
  site-specific answer is never overridden by the general one; only a miss falls through to
  the twin. A carried-over hit sets `item.cachedCrossSite` → a "reused" badge in the review
  overlay, and deliberately does NOT promote a low-confidence DOM match to checked, since
  two soft signals don't make a hard one. Not retroactive: a hash is one-way, so answers
  learned before this build have no twin until the user confirms them once more.
- 2026-09-21 · **learned-answer cache: shared store + the sync that was never called** ·
  Ext **v0.52.3**. Phase 4.1 built `JAF.sync.syncFieldCache` and the server endpoint, but
  **nothing in the shipped extension ever called it** — the only sync call sites use
  `pullAll`, so learned answers never left the device. Two defects behind that: (1) the
  cache stored to **IndexedDB from a content script**, which is the *page's* origin — so
  answers learned on greenhouse.io were invisible to every other ATS host *and* to the
  drawer (an extension-origin iframe) that has to push them; (2) the drawer's engine
  didn't load `field-cache.js` at all, so the documented `syncNow(…, cache)` path would
  have silently no-opped on its `typeof cache.exportAll` guard. Fixed by moving the store
  to a single **`chrome.storage.local`** key shared by every context (serialized
  read-modify-write so concurrent fills don't clobber), draining the old per-origin IDB
  rows once per host (`migrateLegacy`), loading the module in `panel/engine.ts`, and
  calling `syncFieldCache` from `refreshMirror` on the existing 90s throttle — not
  `syncNow`, which would re-push every resume on each drawer open. Learned answers now
  survive a site-data clear, reach the server, and come back on the user's other devices.
- 2026-09-21 · **ops — document the rebuilt production accurately (no backup, no monitoring)** ·
  Doc-only pass after the 2026-09-17 rebuild. `DEPLOY.md` §5 had claimed a "cron nightly"
  database backup; verified on the box that **no backup exists** (both crontabs empty, no timer,
  no dump on disk) — the old file described an intention everyone read as a fact, and that is
  precisely what turned the loss of the old VPS into permanent loss of all user data. Now labelled
  NOT SET UP and still owed, alongside a new note that there is **no monitoring** either (nothing
  reports a dead box; the old VPS's death was noticed by accident). §7 rewritten: it still told
  you to use `VPS_USER=adhya` and omitted `DEPLOY_PATH`, so following it would misconfigure CI —
  split into §7.1 live values, §7.2 rebuild-from-scratch, §7.3 the three traps that each cost a
  failed deploy (`DEPLOY_ENABLED` is snapshotted at run *creation* so flipping it cannot rescue a
  queued run; never delete a branch the production checkout sits on; fail2ban bans your whole
  public IP on failed root password attempts, recover via the KVM console). Windows specifics
  captured too (no `ssh-copy-id` in PowerShell, its pipe appends `
` and corrupts
  `authorized_keys`, and Git Bash MSYS rewrites `/root/...` into `C:/Program Files/Git/root/...`).
  `MIGRATION.md` §7 marked as history with a pointer to DEPLOY.md §7.1 / §10.4, and its
  aftermath checklist corrected. No code, no version bump.
- 2026-09-19 · **ci — stop main pushes cancelling each other's CI** · `ci.yml` used `group:
  ci-${{ github.ref }}` with `cancel-in-progress: true`, and on a push to main `github.ref` is
  always `refs/heads/main` — so every merge cancelled the previous merge's CI run. Hit for real:
  PR #54 and #53 merged 24s apart, #54's CI was cancelled, and `37c6e10` sits in main with a
  `cancelled` status and no verdict. Fixed by splitting the group by event: pushes key on
  `github.sha` (unique per commit, `cancel-in-progress: false`), PRs keep the per-PR group and
  the cancel (superseding an old PR commit is the point). Flipping `cancel-in-progress` alone
  would NOT have fixed it — GitHub still cancels a *pending* run when a newer one joins the
  group, so 3 rapid merges would still lose the middle commit's verdict; the group has to be
  unique. `deploy.yml` left as-is on purpose: its queue-and-supersede is correct when you only
  want the newest code on the box. CI config only — no app code, no version bump.
- 2026-09-18 · **web — robots.txt + sitemap.xml (search-engine submission)** · The live site
  404'd on both `/robots.txt` and `/sitemap.xml`, so there was nothing to submit to Google Search
  Console or Bing Webmaster Tools, and a 404 robots invites crawlers into the auth-gated app
  shell and the single-use `/account/activate` + `/newsletter/*` token links. Added the App
  Router convention files `web/src/app/robots.ts` and `web/src/app/sitemap.ts`, plus
  `web/src/lib/site.ts` holding the canonical origin (was hardcoded in `layout.tsx`) and the
  `NON_INDEXABLE_PATHS` disallow list. Sitemap = `/`, `/privacy`, `/terms` only, with
  hand-maintained `lastModified` (a build-time `new Date()` would claim every page changed on
  every deploy). Verified both routes serve 200 with the right content types on a dev server.
  Web-only — no extension version bump. **Still owed by the user (console work, not code):**
  verify the `kiwiply.com` domain property in Search Console via a Cloudflare DNS TXT record,
  submit `sitemap.xml`, then import the property into Bing Webmaster Tools.
- 2026-09-17 · **docs — correct the Phase 3.6 status** · **Current focus** still announced Phase 3.6
  as "IN REVIEW (branch `feat/job-extraction-v2`)". It had merged the same day it was written —
  PR #28, merge commit `4586822`, 2026-07-03 — and tasks 3.6.1–3.6.3 were already `[x]` a few
  hundred lines below, so the file contradicted itself. Surfaced while deleting merged branches:
  the branch it named was fully in `main` with zero commits outside it. Status corrected in both
  places; the only genuinely open item is the deferred **3.6.4** (server salary columns). Log
  entries and "work was done on branch X" notes left intact — those are history, not status.
- 2026-09-17 · **w6.3 — docs sweep** · `job-autofill/README.md` rewritten (it branded the product
  Dossier, documented an in-extension bio/resume manager removed by locked decision, a hosted-
  ruleset setting deleted in W6.2, and "All data stays on your device. No server."); `HANDOFF.md`
  current-state + kickstart replaced (it said "no build step" and pointed at a merged branch);
  `CLAUDE.md`, `ARCHITECTURE.md`, `DEPLOY.md` §4, `brand/README.md`, `BROWSERS.md` and a
  `wxt.config.ts` comment corrected for the post-WXT layout. Every file path named in
  `ARCHITECTURE.md`/`README.md` verified to exist. Docs only — no version bump.
- 2026-09-17 · **w6.1 — Firefox parity** · Firefox supports neither `externally_connectable` nor
  web-page `runtime.sendMessage` (bug 1319168), and that handoff is the extension's only sign-in
  path — so the previously-documented "Firefox support" would have shipped an add-on nobody could
  sign into. Added a Firefox-only connect-relay content script + ping/handoff protocol on web
  `/connect`, landing in the background through the same origin gate plus a `sender.tab` check.
  Firefox builds are now MV3; `strict_min_version` 121 → 140; declared
  `gecko.data_collection_permissions`, without which AMO rejects a new extension at signing.
  `web-ext lint` 0 errors. Tests 28 → 52 cases across both transports. Chrome's manifest
  unchanged. ext **v0.51.1 → v0.52.0**. Live Firefox smoke test still outstanding.
- 2026-09-17 · **docs — correct the stale facts a new session would act on** · CLAUDE.md claimed
  `job-autofill` is "standalone, not yet a workspace member" (it joined in W3, and
  `publish-extension.yml`'s root `npm ci` depends on that — "fixing" the array to match would have
  broken releases); HANDOFF.md and PROGRESS.md named v0.28.0 / v0.25.0 as the pending CWS upload,
  ~25 versions stale; both `package.json` descriptions were pre-WXT. Historical Log entries left
  intact.
- 2026-09-17 · **w6.2 — drop the unreachable remote-ruleset update path** · `rules-store.js` could
  fetch/validate/adopt a hosted ruleset, but nothing called it, no UI exposed `settings.rulesUrl`,
  and W6.0 had already removed the host permissions it needed. Removed `checkForUpdates`/`init`/
  `reset`/`info` + the storage override; kept `getActive`/`site`/`match`. Behaviour-neutral. ext
  **v0.51.0 → v0.51.1**.
- 2026-09-17 · **web — name AutomoraLab LLC as the operator in `/privacy` + `/terms`** · Both pages
  carried a TODO that the policies needed a registered entity; the CWS listing points its Privacy
  Policy URL at `/privacy`, so a reviewer reads it. Verified rendered in a dev server (JSX
  whitespace collapsing had eaten a space on the first pass). Lawyer review still outstanding.
- 2026-09-17 · **store — `job-autofill/STORE-LISTING.md`** · CWS listing copy (limits verified
  mechanically), privacy-tab answers, login-gated reviewer notes, and a five-shot 1280×800
  screenshot list. Only claims the five ATS verified live in `AUTOFILL-QA.md`.
- 2026-09-17 · **w5.7 — rewrite `job-autofill/W5-QA.md`** · The one manual gate still walked
  `popup.html` + `sidepanel.html`, deleted in v0.30.0/0.31.0. Rebuilt against the shipped surfaces
  (drawer home, drawer review, on-page fill overlay, options tab) from the real components. Not yet
  walked — that's the user's step.
- 2026-09-17 · **w6.0 — extension manifest hygiene for the Chrome Web Store** · Pre-publish audit
  of `job-autofill/` found dev-only and unused entries in the shipped manifest. `wxt.config.ts`'s
  `manifest` is now a function of the build env: the production zip no longer carries
  `localhost:8080`/`127.0.0.1:8080` host permissions or the `localhost:3000`
  `externally_connectable` origin (dev builds still do), the two unused `githubusercontent` host
  permissions are gone (`rules-store.js`'s remote fetch has no caller), `key` is Chrome-only and
  `browser_specific_settings` Firefox-only. The service worker's session-handoff gate derives its
  accept-list from the manifest instead of hardcoding an origin — new `test/connect_handoff.test.js`
  (28 cases). `PRIVACY.md` records the legal entity **AutomoraLab LLC** + the real privacy URL and
  its permission table matches the manifest again; `DEPLOY.md` §8 has the ordered first-upload
  runbook. ext **v0.50.5 → v0.51.0**. Full detail in `EXT-UI-PLATFORM-PLAN.md` (W6.0).
- 2026-07-04 · **ui+web — usage pill, expand/collapse gating, menu width** · Resume cards: the
  "used in N applications / not used yet" meta text is now a distinct rounded pill (standardized
  wording, filled `bg-paper-2` chip) so it isn't missed. Edit dialog: Expand all / Collapse all
  disable (greyed, in place) when there's nothing left to do — computed from the *visible* sections'
  open states; section-to-section gap tightened `gap-5`→`gap-4` (resume-name card included). Shared
  `Menu` popover min-width `184px`→`9rem` so both the board and resume ⋯ menus hug their content
  (~10px slack, no wrapping); font (13px) + icons (16px) already unified via the one component. web
  tsc/eslint/build green; ext tests + build green; ext → 0.50.5.
- 2026-07-04 · **ui+web — board/resumes card polish + one shared dropdown** · Upgraded the shared
  `Menu` primitive to a portal popover (flip-up near the viewport bottom, heading + separator
  entries, `disabled` trigger) and routed BOTH the board's ⋯ menu and the resume cards' menu
  through it — same UI, unchanged behavior (board keeps Star / Move-to-stage / Archive / Delete).
  Board: per-card star is now the shared round SVG star button (matches resumes) and the bulk bar
  gained "Select all (N)". Resumes: the select checkbox now swaps in place of the DOC tile on hover
  (not beside it); the Default tag moved to card-level, vertically centered. Edit dialog: Expand/
  Collapse pill moved up onto the ✕ row (vertically centered); Cancel/Save restyled to the detail-
  panel's outlined look. Also fixed a pre-existing class-conflict that rendered the *starred* star
  muted instead of green on both surfaces. web tsc/eslint/build green; ext tests + build green; ext → 0.50.4.
- 2026-07-04 · **ui+web — resume cards declutter + review-header segmented control** · Resume
  cards: per-row Edit/Set-as-default/Archive/Delete consolidated into a ⋯ menu (shared Menu
  primitive, matching board cards) with star as the only visible quick action; "Set as default"
  text link removed from the meta line; Default tag is a quieter borderless chip with a check;
  the select checkbox hides until card hover (always visible on touch/while selecting); "Select
  all" moved from the toolbar into the bulk bar. Review dialog: Expand/Collapse all restyled as a
  bordered segmented pill on the subtitle line. Drop-zone reverted to the original tall centered
  box + original page spacing. web tsc/eslint/build green; ext tests + build green; ext → 0.50.3.
- 2026-07-04 · **ui+web — resumes page & review-dialog polish pass 2** · Edit-resume review is
  full-page again (dropped the scrim/centered-card look from the prior pass; kept the sticky
  header/pinned-footer structure), with Expand all/Collapse all moved into the header next to the
  title. Drop-zone is a bit taller and sits closer to the page subtitle (tighter header gap). The
  AI-parse checkbox's long disclosure paragraph is removed (label only). Sort control drops the
  "Sort:" label, sits right next to search, and now shows the board's arrows-up-down leading icon.
  web tsc/eslint/build green; ext tests + build green; ext → 0.50.2.
- 2026-07-04 · **ui+web — resumes page & review-dialog restructure** · The shared ResumeUpload
  review is now a real dialog: scrim + centered panel (full-bleed under `sm`, so the extension
  drawer keeps its full-screen layout), fixed header (title/subtitle/close), scrollable body, and
  a pinned footer where Cancel/Save and the dup-name/save errors always stay in view; body scroll
  locks behind it and section headers got count badges. Resumes page: slimmer horizontal drop-zone
  (icon + copy + Browse button), header count pill, section headers with count + hairline, subtle
  row hover elevation. web tsc/eslint green; ext tests + build green; ext → 0.50.1.
- 2026-07-03 · **web — board card tags + panel/sort tweaks** · Cards now show a job-type tag and
  all tags are tinted green (accent-soft/accent-deep); the salary line is dropped from cards. The
  detail panel's "View original posting" moved from under the details into the header as an icon
  link left of the star (hidden when no URL). The sort dropdown's expanded menu now matches the
  trigger width. Draft nudge reworded to "Did you finish applying?" with an "Applied" primary
  button (Continue unchanged). tsc + eslint + `next build` green; web-only (no version bump).
- 2026-07-03 · **web — board card/panel refinements (12 fixes)** · Star/bookmark grouped tight
  beside the ⋯ menu; CardMenu flips upward when near the viewport bottom (+ height cap/scroll) so
  Rejected/Archived menus stay on-screen; Applied cards now carry the same detail set (salary +
  chips) as Interview/Offer; pipeline is 3 equal columns; Saved+Draft shelf cards share one 280px
  width; a Remote job no longer shows duplicate location+mode chips; Saved shelf starts collapsed.
  Detail panel: every field always renders (— when empty), the "Download resume" button is gone,
  and the sort control is a compact custom dropdown (styled, rounded menu) replacing the native
  select. Nudge shrunk to a one-line "Did you apply?" with one-line Yes / Continue↗ (or Not yet)
  buttons. tsc + eslint + `next build` green; web-only (no version bump).
- 2026-07-03 · **web — attention-first board layout** · User-picked reorg: Saved shelf of wide
  300px bookmark tiles (salary shown) on top, Draft tray of compact 240px cards (collapsed),
  pipeline grid narrowed to Applied/Interview/Offer with `1fr/1.15fr/1.15fr` tracks — Interview
  and Offer get larger "rich" cards (bigger avatar/type + salary line), Applied stays dense —
  and Rejected/Archived collapse into slim one-line `BoardRow` lists (still drag targets /
  greyed). Card sizing now varies by stage on purpose. Loading skeleton matched. tsc+eslint+
  build green; web only.
- 2026-07-03 · **web — board scrollbars + toolbar declutter** · `.scroll-slim` (thin, line-tinted
  scrollbars via standard `scrollbar-width/color` + webkit fallback) on all stage-section and
  panel scrollers. Toolbar condensed to search · Filters popover · sort · Add: starred/job-mode/
  job-type/resume filters live in the popover (active-count badge, Clear all), sort gains
  Oldest first + Recently applied, and an active-filter summary line ("Showing X of Y · Clear
  filters") appears under the row. tsc+eslint+build green; web only.
- 2026-07-03 · **web+api — board saved-vs-stage semantics + panel fixes** · SAVED is now a
  bookmark, not a stage: bookmark icon (un-save = delete w/ confirm) replaces the star on saved
  cards/panel (no starring saved jobs, incl. bulk + menu), stage pickers (stepper, move-to menus)
  drop Saved, saved cards get "Apply now ↗" and the draft nudge's "Not yet" becomes "Continue
  applying ↗" (both open the posting). Server: SAVED exempt from the draft-downgrade guard, so
  the extension's fill-log flips a saved job to DRAFT (new IT). Draft row collapsed by default.
  Panel: salary row always shown ("—" when empty), resume dropdown replaced by a lazy collapsible
  preview (iframe only mounts—and the file is only fetched—on expand; re-linking moved into the
  Edit form). Verified against a mock-data harness; web tsc+eslint+build green; api compiles
  (ITs run in CI). Web+api only (no ext version bump).
- 2026-07-03 · **web — application board UI polish** · Board page: pipeline stat chips in the
  header (tracked/applied/interviews/offers), search icon, bordered stage sections, "drag a card
  here" hints in empty funnel columns, layout-matched loading skeleton. Cards: company-initial
  avatar (deterministic brand tint) that swaps to the multi-select checkbox on hover/pick,
  location + job-mode chips, softer resting shadow with hover lift. Detail panel: avatar header
  with source host, clickable stage-pill stepper (replaces the footer status select), card-style
  details list, full-width posting/download action buttons, Archive/Delete footer. tsc + eslint +
  `next build` green; web-only (no version bump).
- 2026-07-03 · **3.6.1–3.6.3 Job-details extraction v2** · Capture chain upgraded: `salaryParsed`
  {min,max,currency,period} (schema.org amounts or parsed from the matched string), per-field
  provenance (`capture.sources`), conservative description-text jobType/jobMode fallbacks, and an
  OPT-IN AI gap-fill tier (`jobAiEnabled`, default OFF, own Options toggle) — `job-enrich.js` pure
  core + SW `enrichCapture()` on logFill/saveJob, BYO-key → Kiwiply-AI chain, per-posting cache,
  never overrides deterministic values. 71 new jsdom tests; suite + typecheck green; ext v0.49.0.
  Follow-ups tracked as 3.6.4–3.6.7 (server salary columns, dedup, rot telemetry, source badges).
- 2026-07-03 · **engine — AI picks for constrained screening questions** · Batch 4/4. `assist.js`
  now also handles selects/radio groups whose label reads like a screener ("Years of experience…",
  "Willing to relocate?"): the SW (`JAF_PICK`) sends question + the LITERAL option list; the reply is
  validated by `fieldMap.matchOption` (word-boundary, unique-or-null, UNSURE ⇒ no fill) so the fill is
  only ever an option the page offers. EEO/demographic questions are never AI-answered; picks are
  cached per question+options, reviewable + regenerable like drafts; radio picks fill via a new
  `"choice"` kind. `assist_picks.test.js` (23); suite + typecheck + `npm run build` green; ext v0.48.0.
- 2026-07-03 · **engine — cached AI field-mapper fallback** · Batch 3/4. Fields the deterministic
  rules miss now get ONE batched model call: `field-mapper.js` collects leftover labeled elements,
  resolves each from a local host+label cache, and sends only novel labels to the SW
  (`JAF_MAP_FIELDS`), which maps them to the canonical vocabulary through the SAME consent gates as
  drafting (BYO key → dedicated JSON prompt; server AI → tolerant JSON-from-prose parse; both off ⇒
  silent no-op). Only labels leave the page; sensitive keys never LLM-mappable; results (incl.
  "unknown") cached so a page costs ≤1 call ever per device. AI badge on mapped rows. New
  `lib/field-map.js` (pure core) + `field_mapper.test.js` (28); typecheck green; ext v0.47.0.
- 2026-07-03 · **engine — signal-tier scoring + match confidence in the overlay** · Batch 2/4.
  `labelParts(el)` tiers every label signal (automation-id 300 > label/aria 200 > placeholder/name/id
  100); keyword hits score per tier, so a real `<label>` beats a placeholder for the same field. Matches
  backed only by weak signals carry `confidence:"low"` and render UNCHECKED (with a "?" marker) in the
  review overlay — the user opts in instead of un-noticing a wrong fill. A field-cache hit marks the row
  user-confirmed (stays checked). +10 tests; ext v0.46.0.
- 2026-07-03 · **engine — W3C `autocomplete` signal in generic scanner** · On branch
  `feat/fill-engine-upgrades` (user-directed engine upgrades, batch 1/4). Valid autocomplete field
  tokens (given-name, email, postal-code, …) map straight to canonical fields and outrank keyword
  matching — except on distrusted hosts (Workday, per user: its autocomplete attrs are unreliable),
  listed as DATA in the ruleset (`autocomplete.distrust`, ruleset v5). Guard: an `url` token never
  steals a linkedin/github-labeled field. New `autocomplete_confidence.test.js` (18) green; ext v0.45.0.
- 2026-07-02 · **AI parsing default ON (user decision)** · Web "Parse with AI" checkbox now defaults
  ON (explicit opt-out remembered per browser). ⚠️ LEGAL FOLLOW-UP: the terms & privacy policy must
  disclose default-on AI resume parsing (resume content → Gemini free tier; Google may use inputs) —
  fold into the lawyer-review item (PL.1). Extension parsing remains opt-in via Options.
- 2026-07-02 · **AI resume parsing (user-directed)** · Branch `feat/llm-resume-parse`. Server-side
  resume parsing on the existing Gemini seam: `AiProvider.parseResume` (structured-output
  responseSchema, text or original-PDF mode for scanned/multi-column resumes) + metered
  consent-gated `POST /api/ai/parse-resume` (one parse = one AI credit). Shared `cleanForLlm`
  + `looksGarbled` preprocessing in parser-core. Web: opt-in checkbox (remembered) on
  ResumeUpload → server-first parse w/ heuristic fallback via Next proxy. Extension: `aiParseResume`
  on the TrackingProvider + parser.js precedence BYO-key > Kiwiply AI > heuristic (v0.45.0).
  All test suites green (api unit, parser-core 56, tracking 58, web tsc/eslint).
- 2026-06-30 · **phase9.A4.4 MERGED + DEPLOYED** · PR #14 merged → Brevo list sync + newsletter postal
  address live on prod. Ops done this session: admin MFA enabled on VPS; Brevo `BREVO_API_KEY`/`BREVO_LIST_ID`
  + `NEWSLETTER_POSTAL_ADDRESS` set; admin email → `admin@kiwiply.com` (Cloudflare-routed to
  `admin.kiwiply@gmail.com`). **Phase 9 admin buildout fully complete + deployed.** Remaining = non-code:
  subscriber backfill, lawyer review (PL.1), DPAs (Brevo + S3), CWS upload of ext v0.25.0.
- 2026-06-29 · **phase9 MERGED + DEPLOYED (9.X)** · PR #13 merged → privacy/terms + DSAR export live;
  admin email-OTP MFA shipped dormant. **Phase 9 (A0–A5 + 9.X) fully on prod.**
- 2026-06-29 · **phase9.A4.4 — Brevo list sync + postal address** · On branch `admin-buildout`.
  `BrevoContactService` (java.net.http) mirrors confirmed subscribers to a Brevo contact list and
  blacklists on unsubscribe — best-effort, OFF unless `BREVO_API_KEY`+`BREVO_LIST_ID` set (local DB
  stays source of truth). Wired into `NewsletterService` confirm/unsubscribe; confirm email footer now
  carries `NEWSLETTER_POSTAL_ADDRESS` (CAN-SPAM). Env in prod.yml+compose+`.env.example`.
  `BrevoContactServiceTest` (3) + updated `NewsletterServiceTest` + unit/ArchUnit green on JDK 17.
- 2026-06-29 · **phase9.X.3 — admin email-OTP MFA (gated OFF)** · On branch `admin-buildout`. After a
  correct password, an admin (when `dossier.admin.mfa-enabled`=true) is emailed a 6-digit code and
  completes sign-in at `POST /api/authenticate/mfa`; `/authenticate` returns `{mfaRequired,mfaToken}`.
  `AdminMfaChallenge` (single-use, expiring, attempt-limited; bcrypt code hash) + `20260629000400`
  migration + `AdminMfaService`. **Ships OFF** (`ADMIN_MFA_ENABLED` env, default false → zero login
  impact on deploy); an admin with no email is never challenged (no lockout); recover by flipping the
  flag back. Web two-step login (login BFF passes `mfaRequired` through; new `/api/auth/login/mfa` +
  OTP step in `AuthScreen`). `AdminMfaServiceTest` (8) + `AuthenticateMfaIT` (3, @Transactional) +
  existing auth ITs still green (MFA off in tests); web build green. **Completes Phase 9.X and all of
  Phase 9.** Enable steps in `.env.example`/`application-prod.yml`.
- 2026-06-29 · **phase9.X.2 — self-service data export (DSAR)** · On branch `admin-buildout`.
  `AccountExportService` assembles the current user's data (account, bio, resume metadata,
  applications, field cache, AI answers — structured only, no file bytes) reusing the user-scoped
  services; `GET /api/account/export` (auth, inherently self-scoped). Web: "Download my data" on
  Settings → CSV/JSON-download BFF (attaches bearer + download headers). `AccountExportResourceIT` (2,
  @Transactional) + unit/ArchUnit green; web build green. 9.X.3 next: admin email-OTP MFA.
- 2026-06-29 · **phase9.A5 MERGED + DEPLOYED** · PR #12 merged → bug reports (floating web widget +
  extension popup + admin triage + support@ notice) shipping to prod. Phase 9 core (A0–A5) all live.
- 2026-06-29 · **phase9.X.1 — privacy/terms updates** · On branch `admin-buildout`. `/privacy`: new
  sections "How our team accesses your data" (metadata-default, reason-logged + audited PII contents),
  "Marketing emails" (separate double-opt-in consent, unsubscribe), "Bug reports & diagnostic data"
  (consent-gated context); "Your rights" now mentions downloading a copy of your data. `/terms`: new
  "Communications" section (service vs marketing email, diagnostic data, admin access → Privacy Policy).
  Content-only; `npm test`+`build` green. (Lawyer review still pending — PL.1.) 9.X.2 next: DSAR export.
- 2026-06-29 · **phase9.A5.4 — extension "Report a bug" (ext v0.25.0)** · On branch `admin-buildout`.
  Popup header "Report" link → inline form (type/message/consent) submitting via the TrackingProvider
  seam (`submitBugReport` on `createKiwiplyProvider` + base contract stub; auth-optional, attaches the
  bearer when connected, `source=extension`, appVersion from manifest, url/userAgent only on consent).
  Versions bumped 0.24.5→0.25.0 (manifest + package). Extension suite green (tracking 47→49). **Completes
  Phase 9.A5 and the Phase 9 core (A0–A5).**
- 2026-06-29 · **phase9.A5.3 — admin bug-report triage queue** · On branch `admin-buildout`.
  `/admin/bug-reports` (status tabs + counts + table) → `/admin/bug-reports/[id]` detail (message +
  context grid) + `BugTriageControl` (status/severity/notes → BFF PUT, audited server-side). Bug-reports
  nav + Overview card → Live. `npm test`+`build` green. A5.4 last: extension popup "Report a bug".
- 2026-06-29 · **phase9.A5.2 — web bug-report widget** · On branch `admin-buildout`. Global floating
  circular "report a bug" button (bottom-right, mounted in the root layout) → dialog (type, message,
  optional email, **ticked-but-optional** consent to attach this page's URL + browser info); submits to
  rate-limited BFF `POST /api/bug-reports` (forwards the bearer when signed in). `npm test`+`build`
  green. A5.3 next: admin triage queue; A5.4: extension popup button.
- 2026-06-29 · **phase9.A4 MERGED + DEPLOYED** · PR #11 merged → double-opt-in newsletter + Pro
  "Notify me" → footer form are LIVE on prod.
- 2026-06-29 · **phase9.A5.1 — bug-report backend** · On branch `admin-buildout`. `BugReport` entity
  (+ `BugCategory`/`BugSeverity`/`BugStatus` enums + `20260629000300_bug_report` migration + repo);
  `BugReportService` (submit: NEW report, login from principal if present, diagnostic context only when
  consented, message capped; best-effort email notice to `support@kiwiply.com` (config
  `dossier.bug-report.notify-email`); admin triage status/severity/notes — audited `BUG_TRIAGE_UPDATE`).
  Public `POST /api/bug-reports` (permitAll, auth-optional) + admin `AdminBugReportResource`
  (list/counts/get/PUT). `BugReportServiceTest` (6) + `BugReportResourceIT` (2) + `AdminBugReportResourceIT`
  (3, all @Transactional); unit/ArchUnit green on JDK 17. A5.2 next: web floating bug-report widget.
- 2026-06-29 · **phase9.A4.3 — admin subscriber list + CSV export** · On branch `admin-buildout`.
  `AdminSubscriberResource` (ADMIN): paginated list (status filter), per-status counts, CSV export
  (tokens never exposed via `AdminSubscriberDTO`). Web `/admin/subscribers` (status tabs w/ counts,
  table, pagination, Download CSV) + CSV-download BFF (attaches the admin bearer + download headers).
  Email nav → `/admin/subscribers` + Overview card → Live. `AdminSubscriberResourceIT` (3,
  @Transactional) + unit/ArchUnit green; web tsc/eslint/build green. **Completes Phase 9.A4** (model +
  double opt-in + public flow + admin list/export). Brevo API sync deferred (CSV export for manual
  import); physical postal address still needed before real campaigns (CAN-SPAM).
- 2026-06-29 · **phase9.A4.2 — newsletter public web flow** · On branch `admin-buildout`. Footer
  `NewsletterSignup` (double opt-in, generic "check your email") on the marketing footer; rate-limited
  BFF `POST /api/newsletter` + `/confirm` + `/unsubscribe` (proxy Spring); top-level `/newsletter/
  confirm` + `/newsletter/unsubscribe` pages (`NewsletterAction` runs the token action on mount, shows
  result); separate **unticked** marketing opt-in checkbox at signup (fire-and-forget, source=signup,
  never blocks signup). `npm test`+`build` green. A4.3 next: admin subscriber list + CSV export.
- 2026-06-29 · **phase9.A3 + system-fix MERGED + DEPLOYED** · PR #10 merged → A3 analytics + the
  `/admin/system` field fix (git/build-time were empty in the image → show Version/App/Profiles; JVM
  memory sums jhimetrics pools) are LIVE on prod.
- 2026-06-29 · **phase9.A4.1 — newsletter backend (double opt-in)** · On branch `admin-buildout`. New
  `EmailSubscriber` entity (PENDING/CONFIRMED/UNSUBSCRIBED) + `20260629000200_email_subscriber`
  migration + repo; `NewsletterService` (subscribe → PENDING + confirm-token email; confirm; one-click
  tokenized unsubscribe; consent source+timestamp; generic responses to avoid enumeration); public
  `NewsletterResource` (`POST /api/newsletter/{subscribe,confirm,unsubscribe}`, permitAll in
  SecurityConfiguration; reached via the BFF which rate-limits). Confirm email via existing MailService
  (SMTP) with confirm + one-click unsubscribe links. `NewsletterServiceTest` (7) + `NewsletterResourceIT`
  (4, @Transactional) + unit/ArchUnit green on JDK 17. A4.2 next: web public (footer form + confirm/
  unsubscribe pages + signup opt-in checkbox); A4.3 admin list/export; Brevo list sync deferred (CSV
  export for manual import initially).
- 2026-06-29 · **phase9.A3 — business-analytics overview** · On branch `admin-buildout`. Backend
  `AdminAnalyticsService`/`AdminAnalyticsResource` (`GET /api/admin/analytics`, ADMIN, read-only DB
  aggregates): total/activated users + activation rate, signups 7d/30d, active users 7d/30d (proxy =
  distinct refresh-token activity, labelled), total resumes/apps, a signup→activate→profile→started→
  applied funnel, and apps-by-status. Repo counts added (User `countByActivatedIsTrue`/
  `countByCreatedDateAfter`, Application `countByStatus`/`countDistinctUsers[ByStatus]`, RefreshToken
  `countDistinctActiveUsersSince`). Web `/admin/analytics` (KPI cards + funnel bars + status bars) +
  headline-KPI strip on the Overview; Analytics nav/card → Live. `AdminAnalyticsResourceIT` (2,
  @Transactional) + unit/ArchUnit green on JDK 17; web tsc/eslint/build green. **Completes A3.** A4 next.
- 2026-06-29 · **phase9.A2.4 — system/ops dashboard** · On branch `admin-buildout`. Read-only
  `/admin/system` over the already-exposed, ADMIN-gated actuator (health components, build/git,
  runtime from jhimetrics, log levels) — fetched server-side via `serverApiFetch` with the admin
  bearer; rendered defensively (missing fields → "—"). No backend change. Nav + Overview card → Live.
  `npm test`+`build` green. **Completes Phase 9.A2** (AI usage · quota override · sessions · system).
- 2026-06-29 · **phase9.A2.3 — sessions/security (per-user)** · On branch `admin-buildout`. Backend
  `AdminSessionService`/`AdminSessionResource`: `GET /api/admin/users/{login}/sessions` groups the
  user's refresh tokens into families (created/expires/count/active) + `POST …/sessions/{familyId}/
  revoke` (ownership-checked, audited SESSION_REVOKE); repo `findByUserId`. Web `SessionsList` on the
  user-detail page (active sessions + per-session Revoke) + BFF `DELETE …/sessions/[familyId]`.
  `AdminSessionServiceTest` (4) + `AdminSessionResourceIT` (3, @Transactional) + unit/ArchUnit green
  on JDK 17; web tsc/eslint/build green. (Standalone "Security" nav stays Soon — this is the per-user
  control; an aggregate dashboard is later.) A2.4 (system/ops) is the last A2 item.
- 2026-06-29 · **phase9.A2.2b — AI quota override (web)** · On branch `admin-buildout`. `AiQuotaControl`
  on the user-detail page (set a per-user monthly quota or Clear to revert to the global default;
  shows effective quota) + BFF `PUT/DELETE /api/admin/users/[login]/ai-quota`; detail page now
  server-fetches the current override. `npm test`+`build` green. **Completes A2.2.** A2.3 next:
  sessions/security (refresh-token families + revoke).
- 2026-06-29 · **phase9.A2.2a — per-user AI quota override (backend)** · On branch `admin-buildout`. New
  `AiQuotaOverride` entity (login PK) + `20260629000100_ai_quota_override` migration + repo;
  `AiDraftService` now resolves the monthly quota as override-or-global (additive, defaults to the
  global). Admin `AdminAiQuotaService` (set/clear, clamped 0..100k, audited AI_QUOTA_SET/CLEAR) +
  `AdminAiQuotaResource` (GET/PUT/DELETE `/api/admin/users/{login}/ai-quota`). Updated
  `AiDraftServiceTest` for the new ctor; `AdminAiQuotaServiceTest` (7) + `AdminAiQuotaResourceIT`
  (4, @Transactional); full unit suite + ArchUnit green on JDK 17. A2.2b next: web quota control.
- 2026-06-29 · **phase9.A1 MERGED + DEPLOYED** · PR #8 (A1.1–A1.5 + 2 CI-caught fixes: non-transactional
  ITs corrupting the shared seed; a deactivate 500 from building a DTO after an EM-clearing revoke)
  merged to `main` after CI green; Deploy workflow succeeded → admin console LIVE at kiwiply.com/admin.
  `admin-buildout` re-synced to `main`.
- 2026-06-29 · **phase9.A2.1 — admin AI-usage dashboard** · On branch `admin-buildout`. Read-only
  `GET /api/admin/ai-usage?period=YYYY-MM` (ADMIN-gated) aggregating the `ai_usage` meter: default
  quota, total drafts, active-user count, per-user counts (busiest first, capped 200). Repo gained
  `findByPeriodOrderByDraftCountDesc`/`countByPeriod`/`sumDraftsForPeriod`. Web `/admin/ai` (stat
  cards + per-user table + prev/next month + over-quota highlight); nav + Overview card → Live.
  `AdminAiUsageResourceIT` (3, @Transactional) + unit suite + ArchUnit green; web tsc/eslint/build
  green. Doesn't touch the live `AiDraftService`. A2.2 next: per-user quota override (write path).
- 2026-06-29 · **phase9.A1.5 — admin audit-log viewer** · On branch `admin-buildout`. Read-only
  `/admin/audit` server-paginated table (reuses `GET /api/admin/audit`): when/actor/action/target/
  reason, newest first. Flipped the shell "Audit log" nav + Overview card to Live. `npm test`+`build`
  green. **Completes Phase 9.A1.** Next: A2.
- 2026-06-29 · **phase9.A1.4b — admin user detail + actions (web)** · On branch `admin-buildout`.
  `/admin/users/[login]` detail page (account metadata grid) + `UserActions` (client): activate/
  deactivate, grant/revoke admin, send password reset, force-logout, and type-the-login-to-confirm
  permanent delete. Self-harming actions disabled in the UI (server guards too). BFF
  `POST/DELETE /api/admin/users/[login]` whitelists the verbs and passes Spring's status/message
  through; toasts on result + `router.refresh()`. Users-list rows now link to the detail page.
  `npm test`+`build` green. Live view needs the stack (user step). **Completes the core of A1**
  (audit viewer UI optional next).
- 2026-06-29 · **phase9.A1.4a — admin user actions (backend)** · On branch `admin-buildout`. New
  `AdminUserActionService` + `AdminUserActionResource` (`/api/admin/users/{login}/…`): activate,
  deactivate (also revokes refresh tokens), grant/revoke-admin, reset-password (emails a reset link),
  force-logout, and DELETE `/data` = full GDPR erase. Self-action guards (can't deactivate/demote/
  force-logout/delete yourself → 400); every action audited via `AdminAuditService`. Added by-user
  finders (`findByUserId`) to the 5 data repos + `AccountDeletionService.deleteUserAccountByLogin`
  (target-scoped erase, leaves the live self-delete path untouched) + `RefreshTokenService.
  revokeAllForUser`. `AdminUserActionServiceTest` (12) + `AdminUserActionResourceIT` (6, CI); full
  unit suite + ArchUnit green on JDK 17. A1.4b next: web user-detail page + actions UI + BFF.
- 2026-06-29 · **phase9.A1.3 — admin Users list** · On branch `admin-buildout`. `/admin/users`
  server-paginated table reusing Spring `GET /api/admin/users` directly via `serverApiFetch` (read in
  a server component — no BFF route; those come with the A1.4 mutations). `UsersTable` (client) adds a
  page-scoped quick filter (labelled, since the backend list has no search yet); columns login/name/
  email/status/roles/joined; prev/next pagination off `X-Total-Count`. Flipped the shell "Users" nav
  to active + Overview Users card → Live/linked. `npm test`+`build` green. A1.4 next: user detail +
  actions (activate/deactivate, reset, roles, force-logout, delete) wired to the audit log.
- 2026-06-29 · **phase9.A1.2 — web admin gate + shell** · On branch `admin-buildout`. New `(admin)`
  route group with a gate layout (no session→/login; 401/403→/login; authed-but-not-ROLE_ADMIN or
  API-down→404, fail-closed — real enforcement stays Spring's `/api/admin/**`). Distinct dark
  `AdminShell` (charcoal sidebar + "Admin" badge, `BrandLockup` for the dark surface, inline dark
  sign-out) with the full planned nav (Overview live; Users/AI/Security/Analytics/Email/Bug/System/
  Audit shown as muted "Soon" so no broken links). `/admin` Overview placeholder (section grid;
  noindex). `npm test` (tsc+eslint) + `next build` green. Live view needs the stack (user step). A1.3
  next: Users list + BFF.
- 2026-06-29 · **phase9.A1.1 — audit-log foundation (backend)** · On branch `admin-buildout` (NOT
  merged; admin build-out accumulates until a coherent chunk ships). New immutable `AdminAuditEvent`
  entity (+ `20260629000000_admin_audit_event` migration, indexed by created/actor/target),
  `AdminAuditService` (records actor from the security context in the caller's tx; action-key
  constants for A1.4; paginated read + actor filter), `AdminAuditEventDTO`, repository, and read-only
  `GET /api/admin/audit` (ADMIN-gated). `AdminAuditServiceTest` (4) + `AdminAuditResourceIT` (3,
  CI-only); full unit suite + ArchUnit green on JDK 17. A1.2 next: web `(admin)` gate + shell.
- 2026-06-28 · **phase9.A0 — security gate (default-admin seed)** · On branch `admin-buildout`. Killed
  the public-hash `admin`/`admin`+`user`/`user` seed in prod: gated the user loadData to `dev`/`test`
  (new `20260628000000_seed_dev_default_users.xml`, `validCheckSum=ANY` on the initial changeset), added a
  prod-only cleanup migration that deletes the seeded rows matched by login+exact-hash, and added an env
  `AdminBootstrap` runner that creates/promotes a real admin from `ADMIN_EMAIL`+`ADMIN_PASSWORD_HASH`
  (bcrypt, env-only). Prod Liquibase → synchronous so the runner runs after migrations. Wired
  prod.yml+compose+`.env.example`+`DEPLOY.md §2.1`. `AdminBootstrapTest`+full unit suite green on JDK 17.
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

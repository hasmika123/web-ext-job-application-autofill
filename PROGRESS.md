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
> 📄 **Resume Builder + Common Profile is designed (branch `resume-builder`, 2026-10-11)** — see the
> *Resume Builder* section below (its own Current focus: **R1.1 Profile items API**) and `docs/HANDOFF-RESUME-BUILDER.md`.
>
> ⏱ **Timesheets & Consultancy Ops is designed as its own product area H (2026-10-11, on `version2`; build branch
> `timesheets` not yet cut)** — see the *Timesheets* section below (its own Current focus: **H0.1 Schema v0**, not
> started — P2, org add-on; blocked on the org model O1.x) and `docs/HANDOFF-TIMESHEETS.md`.
>
> 🌱 **The app v2 + enterprise admin work lives on the `version2` branch and awaits the user's review
> (landing v2 V2.0–V2.6, app0–app2, auth, org1–org2, landing v3 `/v3` and the appqa pass, all done
> 2026-10-11).** It covers the signed-in app redesign (`/dashboard`, `/jobs`, `/saved`, `/ai-apply`,
> `/applications`, `/interviews`, `/resume` + coming-soon pages), the split-screen auth pages, the
> enterprise admin at `/org/*` (sample data, any signed-in user, unindexed) and the alternate landing at
> `/v3` (unindexed). Nothing else is queued from it: do not merge `version2` into `develop` / `main` until
> the user asks. Before promoting: replace every `PLACEHOLDER` / `SAMPLE` data file (landing stats,
> testimonials, partners; `app-v2/sample-data.ts`, `org-v2/sample-data.ts`), swap the board-extracted
> artwork in `web/public/v2/` (and `app/`) for real renders (see that folder's README), and wire the
> Apple / LinkedIn sign-in buttons or drop them. The product-phase focus below is unchanged.
>
> 🧭 **Expansion plan locked 2026-10-05** (ROADMAP → *Expansion build, Phases 18–23*). It adds
> Autopilot, services, organizations, the consultancy Marketer role and an optional Ops add-on
> (timesheets + finances); there is no Coach tier. **New Launch-1 task 15.5 (re-price
> Pro: $49.99 / 3 mo, AI budget $3 / mo · $8 / quarter per billing period, 25-resume cap) must land
> before 15.4's live keys.** **15.5 is DONE in code (2026-10-05, ext v0.65.0)** — one human step left:
> create the $49.99 3-month Price in Stripe test mode and point `STRIPE_PRICE_3MO` at it (DEPLOY.md
> §11). The current focus below is unchanged.
>
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
> today's list, save to board / dismiss. **13.6 IS COMPLETE — so is Phase 13.** **Phase 14 is planned**
> (user decisions 2026-09-22, ROADMAP "Phase 14 plan"): env AES-256-GCM key; bodies kept only for job
> mail; poll every 15 min; email only for interview/offer; order 14.2 → 14.1 → 14.3 → 14.5 → 14.4 →
> 14.6 → 14.7. **14.2 is DONE** — AES-256-GCM `SecretBox` + a startup key canary. **14.1 is DONE** — the
> connect flow at `/settings/inbox`. **14.3 is DONE** — the poller reads Inbox + Sent every 15 min.
> **14.5 is DONE** — one application per job across boards. **14.4 is split**: **14.4a is DONE** — mail
> read into status changes (rules first, Flash-Lite only when unsure). **14.4b is DONE** — "From your
> inbox" suggestions on the board + each application's Emails. **14.4 is complete.** **14.6 is DONE** —
> in-app notifications + emails for interviews and offers. **14.7 is DONE** — 12-month mail expiry,
> inbox in the data export, the read-only promise in Terms. **PHASE 14 IS COMPLETE.** **15.1 is planned**
> as 15.1a–c (user decisions 2026-09-23: a separate backup bucket with an upload-only key;
> UptimeRobot + Healthchecks.io; an in-house error email digest; a weekly automated restore drill plus
> one by hand). **15.1a is DONE** — `scripts/ops/backup-db.sh` + `verify-restore.sh` + the cron file,
> tested in CI against a real MySQL; the runbook is DEPLOY.md §5.1–§5.3. **15.1b is DONE** — the API
> emails the admin a digest of server errors (each kind once, counted), at most every 15 minutes.
> **Next: 15.1c** — go live on the box + the restore drill by hand; it needs the bucket, the IAM user,
> Healthchecks.io + UptimeRobot (the user's to create) and `develop` promoted to `main`. Before the inbox
> goes live: `DOSSIER_INBOX_KEY` on the box (DEPLOY.md §12). **Before 14.1 ships to prod: generate `DOSSIER_INBOX_KEY`** (DEPLOY.md §12). 12.0's Stripe sandbox exists; a real end-to-end run against it is **12.7**.
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
> Everything below is prior context (live + complete unless noted). New chat → read `docs/HANDOFF.md`.
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

### Phase 9.B — Admin expansion (brainstorm 2026-10-05; full table in `ADMIN-PLAN.md` → 9.B)
- [ ] **9.B1 Runtime settings.** An `app_setting` table (typed, bounded, audited, env = default).
  It covers AI models, caps and kill switches; job-matching knobs; inbox knobs; rate limits; the
  error digest. *(After Launch 1, with 18.)*
- [ ] **9.B2 Feature flags + banner + extension remote config.** Flags (global, % of users, per
  user), a site and drawer banner, extension minimum version, per-ATS kill switch (data only).
  *(Before 19.)*
- [ ] **9.B3 Support toolkit.** Entitlement explainer, comps (`ADMIN_COMP`), AI budget
  reset/extend, Stripe promo codes, subscription view. *(With 18.)*
- [ ] **9.B4 Unit economics + cost alerts.** Margin per product vs the 80 % floor, % of users at
  their AI cap, churn and conversion, alert emails. *(With 18.)*
- [ ] **9.B5 Scheduled jobs + health.** Run now / pause, last run; backup and drill status;
  Brevo quota, bounces and complaints. *(Soon after Launch 1.)*
- [ ] **9.B6 Legal versions + acceptance.** Publish a new version; record who accepted which
  version and when. *(Before 20.)*
- [ ] **9.B7 Admin roles.** Super-admin / support / finance / expert manager. *(Before 20.)*
- [ ] **9.B8 Abuse controls.** Block or flag users, disposable-email blocklist, Autopilot misuse
  flags. *(With 19.)*

### Phase 9.C — Customers, support & retention (planned 2026-10-05; full table in `ADMIN-PLAN.md` → 9.C)
- [x] **9.C1 Customers page + billing timeline** *(must ship before 15.4's live keys; done 2026-10-06).*
  `/admin/customers` (plan, status, renewal, total paid, Stripe link; filters for failed,
  cancelling and new). A billing timeline + admin notes on each user page. Additive
  `stripe_event.customer_id` + `customer_note`.
- [ ] **9.C2 Full timeline.** Sent-email log (`mail_log`), bug reports, inquiries and admin plan
  changes on the user's timeline.
- [ ] **9.C3 Support access ("view as").** The user grants 24 h; read-only, bannered, audited,
  auto-expiring. **No log-in-as.**
- [ ] **9.C4 Debug panel.** Extension version, sync, inbox health, AI usage, recent errors; a
  consented "support session" fill capture (labels only, never answers).
- [ ] **9.C5 Offers & retention.** Comps, Stripe promo codes (margin shown vs the floor),
  win-back to consented users, cancellation reasons.
- [ ] **9.C6 CRM sync (custom CRM, confirmed 2026-10-06).** Signed webhooks (HMAC, replay-safe,
  retried, failures resendable from admin) + a key-protected read-only export for reconcile;
  contract in `docs/crm-sync.md`. No product data (resumes, answers, mail) leaves Kiwiply.
- [ ] **9.C7 Account fixes.** Resend verification, verified email change, clear rate-limit
  lock, revoke extension connections.

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
  "the popup pulls … (throttled)" — there is no popup and no throttle. `docs/HANDOFF.md` points at it.
  Original spec: `ARCHITECTURE.md` "Sync model" section (signal → version → alarm; revoke path:
  1.11 rotation kills a stale token at its next refresh, `signedOut` clears at once; no WebSockets —
  MV3 SW idles out after 30 s). `docs/HANDOFF.md` one line. Docs-only commit.

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
> **Build order (user-approved 2026-09-22): 14.2 → 14.1 → 14.3 → 14.5 → 14.4 → 14.6 → 14.7.**
> Decisions: env AES-256-GCM key (`DOSSIER_INBOX_KEY`); headers of all mail, body only for job mail;
> every 15 min; email the user only for interview/offer. Pro only.
- [x] **14.1 Connect flow** `/settings/inbox`: guided steps (2-Step Verification → App Password),
  test connection, disconnect. Consumer Gmail only.
- [x] **14.2 Credentials encrypted at rest** (server-side key; the 8.4 secrets slice, now required).
  AES-256-GCM, `DOSSIER_INBOX_KEY`, key version on each ciphertext, startup canary. *First.*
- [x] **14.3 IMAP poller.** UID-incremental sync + backfill on connect; headers + body text only,
  **no attachments**; rate-limited; per-user error state surfaced in settings. UIDVALIDITY per
  folder, `\Sent` by special-use flag, one connection per sync, backoff, GreenMail tests; every
  15 min; backfill 60 days / ≤ 500 per folder; body kept only for job mail.
- [x] **14.4 Parser → status.** *(split: 14.4a engine ✅, 14.4b board UI ✅)* Deterministic ATS sender/subject templates → applied / interview /
  rejected / offer; Flash-Lite only on ambiguous mail; match by company + role + sending address;
  unmatched → *suggested* application.
- [x] **14.5 Cross-board dedup** *(re-homed from 3.6.5 — required so auto-updates don't double
  count).* Normalized company + title (+ fuzzy location) at upsert.
- [x] **14.6 Notifications.** In-app + email to the user's real address on status change.
- [x] **14.7 Retention & deletion** *(the 8.4 slice).* Mail rows expire (12 months default); purge
  on disconnect + account delete; DSAR export includes mail; read-only guarantee in product copy.

## Phase 15 — Launch 1
- [ ] **15.1 Ops hardening** *(scheduled here by decision — not earlier).* Nightly off-box
  `mysqldump` → S3 with retention · uptime + error monitoring with alerting · **restore drill
  performed and logged**.
  - [x] **15.1a Backup + restore-drill scripts.** Nightly dump → separate bucket (upload + read,
    no delete; 30 daily + 12 monthly by lifecycle), the weekly restore into a throwaway container,
    Healthchecks.io pings, the cron file, DEPLOY.md §5.1–§5.3; CI job "Ops scripts".
  - [x] **15.1b Error digest.** The API emails the admin new ERROR logs, grouped and counted, at most
    every 15 minutes, through the Brevo mail it already has.
  - [ ] **15.1c Go live + the drill by hand.** *(Needs you: the bucket + IAM user, Healthchecks.io +
    UptimeRobot accounts, `develop` promoted to `main`.)* Install the cron file, the first backup,
    the first restore drill — logged in DEPLOY.md.
- [ ] **15.2 Legal — PL.1 completion.** Lawyer review of privacy + terms covering billing
  (auto-renew, click-to-cancel, refunds), IMAP mail processing, AI data use, governing law + entity.
  DPAs with Brevo + AWS S3.
  - **Drafted for the lawyer (2026-10-05, in `/terms`):** a liability cap (the greater of 12 months'
    fees or US$50); "Services we rely on" (extension stores, Google, job sites, Stripe, AWS, Brevo);
    and the remedy when a Pro feature is down more than 7 days in a row (extend or partial refund,
    our choice). The lawyer confirms the wording, especially against EU and California consumer law.
- [ ] **15.3 Store.** CWS resubmit with the Pro build · AMO first submission · listing copy for
  the Free/Pro split · `NEXT_PUBLIC_KIWIPLY_EXTENSION_ID` redeploy.
- [x] **15.5 Re-price Pro** *(expansion decision 2026-10-05; land before 15.4's live keys).* ✅ Code done
  2026-10-05 (ext v0.65.0). **Human step:** a new $49.99 3-month Price in Stripe (test now, live at
  15.4); archive the $44.99 one; `STRIPE_PRICE_3MO` → the new id.
  - 3-month price $44.99 → **$49.99**: a new Stripe Price in test and live, plus
    `dossier.stripe.amount3mo`.
  - Pro AI budget $5/month → **$3/month · $8 per 3-month period**, with `AiBudgetService`
    summing over the subscription's billing period instead of the calendar month.
  - Pro resume cap unlimited → **25** non-archived (402 `RESUME_LIMIT`).
  - Update `/pricing`, the ToS Billing section and the MRR math to match.
- [x] **15.6 Full catalog on `/pricing` + "Contact us"** *(user decision 2026-10-05).*
  - Free/Pro keep checkout. Autopilot, Organization (+ the per-person menu), Consultancy, the
    Consultancy Ops add-on and the 4 human services are shown in full with Contact us.
  - `/contact` → `POST /api/inquiries` → a `sales_inquiry` row + an email to support@ → admin
    `/admin/inquiries` (status + note, audited).
  - Content lives in `web/src/lib/catalog.ts` until Phase 18.
- [ ] **15.4 Launch checklist.** Pricing live, Stripe live keys + webhook verified, billing support
  path, W5-QA walked (light + dark), SmartRecruiters live check, Firefox smoke.
  - **The user's live-mode launch checklist is DEPLOY.md §11.4** (user decision 2026-10-06: the Kiwiply
    Stripe account was set up directly in live mode; a short sandbox block still comes first for the Pro check
    and the test-clock run). Tick it off right before launch; the items below are what it points at.
  - **MUST PASS before live Stripe keys go in — every Pro promise, checked on production (user
    decision 2026-10-05).** Payments stay off until the extension is approved on the Chrome Web
    Store, because three of the six Pro promises run through it. Pro comes only from a subscription
    (the admin AI override unlocks AI alone), so: put Stripe's **test-mode** keys on production, buy
    Pro on a test account with Stripe's test card, then on **kiwiply.com and the store-installed
    extension** walk every line of the pricing page's Pro list and record pass/fail:
    1. Kiwiply AI for autofill, with no API key (extension).
    2. Resume recommendation: the best match in the drawer and Resume fit on the board.
    3. Job-fit panel (drawer + board) and the ATS score (Resumes page + board).
    4. Resume tailoring: a tailored resume saved as a new resume.
    5. Inbox tracking: connect a test Gmail; a reply moves a card (needs `DOSSIER_INBOX_KEY`).
    6. Unlimited resumes (a 4th saves) and cross-device answer sync (two browsers).
    Plus the bonus Pro feature, daily job matches (opt in; matches the next morning). Then the
    **Free side**: a Free account is refused each of the above with an upgrade prompt, and keeps
    autofill, tracking, AI resume parsing and 3 resumes. Any failure blocks launch until fixed.
    Only after a clean pass: swap in the live keys and make the one real purchase.
  - **When Gemini moves to the paid tier** (user: before go-live), update `/privacy` → *AI features*:
    drop "Because we currently use Gemini's free tier, Google may use…" and say paid-tier inputs aren't
    used to train Google's models. Same for the extension's AI consent text and `PRIVACY.md`.
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
  - **Pulled forward (user, 2026-10-05): first build after Launch 1, before Phase 18.** 10–20 jobs
    a day; 👍/👎 re-ranking (not model fine-tuning); a preference form (titles, location/remote,
    salary floor, seniority, must/never keywords, excluded companies); ATS APIs + one licensed
    aggregator API, no scraping; marketers see each consultant's matches (22.3).
    **Locked 2026-10-05:** Free = 3 rule-ranked matches a day, in-app only, no AI · Pro/Autopilot
    = 10–20 AI-scored + email + 👍/👎 · consultancies included in the Pro seat · one licensed
    aggregator after a cost check · a paid Brevo plan before about 250 emails a day.
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

## Phase 18 — Catalog & entitlements engine (after Launch 1; before 19–21)
- [ ] **18.1 Schema.** Tables `product`, `product_price` (immutable rows), `product_entitlement`,
  `bundle_item` (built, unused at launch) and `entitlement_grant`.
- [ ] **18.2 `EntitlementService` on grants.** Features + limits, highest value wins.
  `isPro()`/`requirePro()` become wrappers, and `PLAN_REQUIRED {feature}` is added. A migration
  test proves Free and Pro behave exactly as before.
- [ ] **18.3 Features on the version endpoint.** `{version, plan, features[]}`; the extension
  gates on features.
- [ ] **18.4 Admin catalog page.** Publish prices to Stripe. The **margin guard** refuses
  anything below 80 % (subscriptions) or 20 % (services) worst case without a logged override.
- [ ] **18.5 Re-home hard-coded config** (AI budget, resume caps, Stripe price ids, MRR) onto the catalog.

## Phase 19 — Autopilot (ships with Launch 2)
- [ ] **19.1 Queue.** `autopilot_run` / `autopilot_item`, plus "Prepare N" on the web. The
  server enforces 300 per month and 30 per day.
- [ ] **19.2 Extension orchestrator.** A dedicated window, at most 3 tabs at a time, throttled.
  Fills, then stops at the final page. **Never submits and never ticks attestation or consent boxes.**
- [ ] **19.3 "Needs you" handling.** Sign-in walls, CAPTCHAs, unknown required questions, failed
  uploads and an exhausted AI budget park the item with a reason.
- [ ] **19.4 Review queue.** In the drawer and on the web; submit-detect logs each submission.
- [ ] **19.5 Store release.** The `tabs` permission in its own release (CWS re-review, listing
  copy, privacy note) + QA on all adapters.
- [ ] **19.6 Selling it.** Catalog rows, pricing page, Stripe prices ($39.99 / $99.99).

## Phase 20 — Services
- [ ] **20.1 AI Interview Practice (text).** Included in Pro and Autopilot; an org-only
  standalone item with a $1.50/month budget.
- [ ] **20.2 Service orders.** `service_order` + Stripe one-time Checkout + a 10 % subscriber
  discount. Items: human resume review $79 · resume rewrite $199 · mock interview $129 ·
  coaching $119.
- [ ] **20.3 Expert side.** Vetted experts, admin assignment, a consented client view,
  deliverable upload, booking link.
- [ ] **20.4 Payouts.** A payout ledger (manual first, Stripe Connect later) + an admin services page.
- [ ] **20.5 Service terms** go to lawyer review.

## Phase 21 — Organizations (after moving to our own server)
- [ ] **21.0 Prerequisites.** Own server + restore drill passing; org-scoped access with
  cross-org isolation tests.
- [ ] **21.1 Schema.** `organization`, `org_member`, `org_assignment` (writes grants) and
  `data_share` (SUMMARY at launch).
- [ ] **21.2 Org billing.** A $499 setup fee (nothing activates until it's paid), plus per-person
  items: Pro $24.99 · Autopilot $49.99 · AI Interview Practice $9.99 · services at list price.
  Monthly invoice, prorated adds, removals at period end.
- [ ] **21.3 Org admin console.** Members, CSV invite, assign any item to any person, invoices,
  a consented summary report.
- [ ] **21.4 Member side.** The account stays the person's. Leaving ends org grants at the end
  of the period, and nothing is deleted.
- [ ] **21.5 Selling it.** A sales page and order form; SSO only when a school deal needs it.
## Phase 22 — Consultancy: the Marketer role (after 21; needs 19 + 14)
- [ ] **22.1 Roles + pairing.** The `MARKETER` role and `marketer_assignment` (≤ 10 consultants
  per marketer), plus the consultant's consent screen (`data_share` FULL). Isolation tests.
- [ ] **22.2 Marketer workspace.** Consultant switcher; read view of each consultant's dashboard
  and board; build and edit their resumes. The consultant approves each one once before use.
- [ ] **22.3 Job bank + assignment.** The marketer gathers jobs (pasted links, matches, the
  extension's "Save for consultant…"), sets a resume per job and assigns the batch.
  `job_assignment` rows; at most 100 open per consultant; one notification per batch.
- [ ] **22.4 Consultant side.** Autopilot consultants: assigned jobs feed the queue with their
  resume. Pro consultants: an "Assigned jobs" list, and the extension pre-selects the resume. The
  consultant submits, and submit-detect marks the assignment APPLIED.
- [ ] **22.5 Marketer inbox.** The marketer's own dedicated Gmail (Phase 14 model). Each message
  is matched to a consultant and updates that consultant's board; unmatched mail goes to "Needs
  review" for one-click assignment.
- [ ] **22.6 Selling it.** Marketer seat $29.99/mo (org-only, $4 AI budget); managed consultants
  need at least Pro.

## Phase 23 — Consultancy Ops add-on: timesheets + finances (optional; after 22)
> **2026-10-11:** 23.0 is done and the whole phase now lives in the *Timesheets* product section below
> (product area H, `docs/TIMESHEETS-DESIGN.md`). The tasks under this heading are superseded by H0–H8.
- [ ] **23.0 Brainstorm → locked spec** *(must come first).* Timesheets, placements (bill/pay
  rates), invoices, payments, expenses, the profit view, the `FINANCE` role, retention, the legal
  check, the final price (proposed $99 per org + $4 per active consultant per month).
  **Locked already:** we record money and never move it; no bank numbers, SSNs or tax IDs; CSV/PDF
  export; 2 GB per org.
- [ ] **23.1–23.n** — written after 23.0 (expected order: timesheets → placements → invoices +
  payments → profit dashboard).

- *Coach tier: **not built** (user decision 2026-10-05). The hook is org type `COACH` + role
  `COACH` + `data_share` FULL; see ROADMAP.*

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

## Resume Builder (branch `resume-builder`, off `version2`)
> Design 2026-10-11: `docs/RESUME-BUILDER-DESIGN.md` (the design), `docs/RESUME-BUILDER-STORIES.md`
> (45 stories, R0–R7), `docs/RESUME-BUILDER-DECISIONS.md` (vetoable defaults), on-ramp
> `docs/HANDOFF-RESUME-BUILDER.md`. Pulls ROADMAP 16.7 (builder + templates) and 16.6 (cover letter)
> forward and completes the profile half of 10.3. Commit prefix `rb<epic>.<n>:`; one story per commit.
> Locked by the design: `bio.payload` wrapped not migrated (`profile_item` for career lists);
> `resume_doc` JSON beside `resume` with `parsed_json` re-derived on every save (extension, matcher,
> tailor, ATS unchanged); templates are code in `@kiwiply/ui`; PDF = Chromium printing the same HTML;
> all builder AI is Pro via `AiBudgetService`, suggest → diff → accept.
>
> **Design v2 (2026-10-12)** re-plans everything after R0 to the user's v3 boards (layout only; templates come later) and the 2026-10-12 requirements: template capability model, dynamic left side-nav + right side-nav (Print layout / PDF view), save = DB + async PDF through `FileStorage`, resume metadata + access control, start chooser, Save / Save & Download, resume header bar, My Resumes + org Resumes & Profiles pages. 68 stories (R0 done, R1 kept, R2–R8 new); build order at the top of `docs/RESUME-BUILDER-STORIES.md`.
>
> **R2.0 (settings seam), R2.7 (document schema v2), R2.9 (`SideSheet`), R2.10 (editor shell) and R1.1 (profile items API) are done and merged on this line.**
> **R2.0 (settings seam), R2.7 (document schema v2), R2.8 (template capability model), R2.9 (`SideSheet`) and R1.1 (profile items API) are done on this line.**
>
> **Current focus (this branch): R3.6 parse check "How an ATS sees it"** (STORIES v2 R3.6; the overnight build is merged, green and proven end to end: R2.x editor line, R3.3 PDF view + Save, R3.4 template switch safety net, R3.7-R3.13, R2.6 My Resumes + chooser, header menu Duplicate / Download original; then R3.2 pull from profile) — on the parallel track R1.1, R1.2, R1.4, R1.5 and R1.6 are **done** (next there: R1.3 drag-reorder, which can reuse `common/SortableList.tsx` from R2.2). Decisions awaiting the user: `docs/RESUME-BUILDER-DECISIONS.md` v2 rows marked "needs user OK" + §C dependency approvals (`docx`, `@axe-core/playwright`).
- [x] **R0 Foundations (walking skeleton)** — ✅ R0.1 schema · ✅ R0.2 document contract (Java) · ✅ R0.3 doc
  endpoints (ETag/If-Match) · ✅ R0.4 `@kiwiply/ui` resume package + Modern template + vitest · ✅ R0.5 web
  editor skeleton + autosave · ✅ R0.6 PDF via Chromium sidecar → FileStorage · ✅ R0.7 smoke against the real API + handoff.
- [ ] **R1 Common Profile builder** — ✅ R1.1 items API + completeness + SensitivePatterns · ✅ R1.2 `/profiles` real tabs ·
  R1.3 drag-reorder · ✅ R1.4 onboarding wizard (upload / paste → card review) · ✅ R1.5 start-fresh flow · ✅ R1.6 headline/summary + provenance.
- [ ] **R1b Onboarding v2** (`docs/ONBOARDING-V2-DESIGN.md`) — ✅ R1.7 dashboard card + no redirect + `/welcome` into the flow · ✅ R1.8 API (draft table, `/api/profile/onboarding`,
  meta markers, settings, purge, coverage) · ✅ R1.9 web draft sync (state v2, `useDraftSync`, BFF, mock API, status pill, banners, card reads the server) · ✅ R1.10 shell + screens · ✅ R1.11 prefs + payoff · ✅ R1.12 entry points + proof · R1.13 (optional) extension link.
- [ ] **R2 Editor to the boards** — ✅ R2.0 settings seam + config · ✅ R2.7 schema v2 + marks + upgrader · ✅ R2.8 template
  capability model · ✅ R2.9 `SideSheet` + UI state · ✅ R2.10 editor shell (top bar, dynamic left pane, section tabs, rail) ·
  ✅ R2.4 Pick Template + Customize · ✅ R2.1 document canvas · ✅ R2.11 mark toolbar · ✅ R2.12 Add Section panel · ✅ R2.2 Swap Section (dnd-kit) ·
  ✅ R2.5 Resume Score + Insights · ✅ R2.6 My Resumes page + start chooser.
- [ ] **R3 Save pipeline, metadata header, sharing, print/PDF** — ✅ R3.7 async PDF pipeline · ✅ R3.9 metadata model ·
  ✅ R3.11 access control (people, links, `/r/[token]`, views, org pairing) · ✅ R3.10 resume header bar · ✅ R3.12 Resume settings
  sheet · ✅ R3.8 Print layout · ✅ R3.3 PDF view + Save / Save & Download · ✅ R3.13 thumbnails + template gallery · ✅ R3.4 switch
  safety net · R3.6 parse check · R3.2 pull from profile · R3.5 extension chip (optional ext bump).
- [ ] **R4 AI assist (Pro)** — ✅ R4.1 `ResumeAiService` + `AiTruthChecks` + prompts + rewrite · ✅ R4.2 diff UI + Rewrite with
  AI · ✅ R4.6 AI Suggestions tab · R4.3 summary generation · R4.7 evals.
- [ ] **R5 Job Match BETA, tailoring, cover letter, translate** — R5.6 job target API + `JdExtract` · R5.7 match engine
  (TS) · R5.8 Tailor panel + Job Match tab · R5.9 tailored versions · R5.1 AI tailor on copies · R5.2 keyword placements ·
  R5.3 cover letter · R5.4 translate · R5.5 board hand-off.
- [ ] **R6 Polish** — R6.1 phone · R6.2 a11y · R6.3 performance · R6.4 states · R6.5 CI (vitest, PDF smoke, parse-check gate, axe).
- [ ] **R7 Photo, templates, growth** — R7.4 photo · R7.1 second template (user designs) · R7.2 share-link polish ·
  R7.3 DOCX (needs approval) · R7.5 health nudge · R7.6 Autopilot hook.
- [ ] **R8 Org dashboard: Resumes & Profiles** — R8.1 consent-scoped org resume API + isolation tests · R8.2 the page +
  audited viewer · R8.3 marks, saved views, bulk, assign (after O1/O6/O10 foundations).

---

## Timesheets & Consultancy Ops (product area H; build branch `timesheets`, off `version2` — not yet cut)
> Design 2026-10-11: `docs/TIMESHEETS-DESIGN.md` (the design), `docs/TIMESHEETS-STORIES.md` (42 stories,
> H0–H8, rendered from `docs/timesheets/stories.json` — the status source of truth), `docs/TIMESHEETS-DECISIONS.md`
> (decided: D1 org add-on only · D2 priced later in admin · D7 OCR off by default · D10 **P2**; vetoable defaults),
> on-ramp `docs/HANDOFF-TIMESHEETS.md`. Promoted from the org area's Consultancy Ops epic (ROADMAP Phase 23) to a
> product area like the Resume Builder; old → new ids in DESIGN §13. Commit prefix `ts<epic>.<n>:`; one story per
> commit. Locked by the design: record money, never move it · never collected (no SSN/bank/tax/document numbers or
> DOB anywhere; proof files refused before storage; `OpsNeverCollectedTest` build gate) · every number a setting
> with a default · weekly sheets per placement, minutes in storage · approved sheets immutable, corrections supersede
> · one-step approval, no external approvers · OCR optional and off · all files through `FileStorage`, no presigned
> URLs · the consultant surface at `/timesheets` in the user app, everything else under `/org/ops/*`.
>
> **Current focus (this product): H0.1 Schema v0** — **not started — P2, org add-on.** Blocked on the org
> walking skeleton (O1.1 → O1.5, O2.2, O6.1 in `docs/roadmap/areas/org.json`) and A5.1/A5.3; do not start before
> `OrgIsolationIT` is green. Then H0.2 → H0.5 (the ★ five), then H0.6–H0.7 to close the walking skeleton
> (gate → placement → one sheet submitted and approved → one CSV → smoke).
- [ ] **H0 Walking skeleton** — H0.1 schema v0 · H0.2 FINANCE + gate + settings · H0.3 placements-lite · H0.4 weekly
  sheet core v0 · H0.5 week view + inbox v0 (390 px) · H0.6 GENERIC CSV v0 · H0.7 smoke + handoff.
- [ ] **H1 Placements, clients & rates** — vendors + effective-dated rates · holidays + lifecycle · placements UI ·
  marketer presence.
- [ ] **H2 Weekly entry, phone-first** — day kinds + prefill + copy-last-week · flags engine · withdraw / correct /
  locks · week view full UX + PWA · submit-for + self-recorded.
- [ ] **H3 Proof & the never-collected gate** — `@NoSensitiveText` + `OpsNeverCollectedTest` · proof via FileStorage ·
  identifier scan + refusal · optional OCR (off) · proof UX · approver inbox full.
- [ ] **H4 Reminders & notifications** — OPS_TS_* kinds · reminder job (quiet hours, cap, idempotent) · consultant prefs.
- [ ] **H5 Exports** — async jobs + GENERIC/PAYROLL · BY_CLIENT + PDF pack (Chromium sidecar) · export UI + Disclaimer.
- [ ] **H6 Money records (record only)** — money schema · invoice records · payments + expenses · profit view · finance UI.
- [ ] **H7 Billing, retention, erasure & admin** — catalog items (no price) + derived quantity · retention + erasure ·
  Admin › Ops page + settings keys · audit completeness.
- [ ] **H8 Pilot, onboarding & growth** — first-run screen · demo consultancy · pilot metrics · zero-setup onboarding ·
  post-pilot bucket (crop helper, provider presets, OCR auto-read).

---

## Log
- 2026-10-12 · **e2e-o1.7: OrgChip real + switcher sheet + role-aware nav + real bell (web)** · The top-bar chip is now `OrgSwitcher`: it shows the real org name and status pill and opens "Your organizations" - a `BottomSheet` of 56 px rows on a phone, a `Menu` from `md` up - listing every org the caller administers (a plain MEMBER seat is not listed) with role and status, a tick on the open one and "Create a workspace"; picking one posts `/api/orgs/current` (the BFF only writes `kiwiply_org` for an org the caller administers), toasts and `router.refresh()`es. The sheet is portalled into the `.theme-v2` wrapper because the sticky bar has a backdrop blur, which makes a `fixed` descendant lay out inside the 64 px bar (found by the Playwright journey). Nav is data (`org-nav.ts`) filtered by `permissions[]`: owner/admin see all ten pages; a support owner sees Dashboard, Team, Applications, Interviews and Resumes; finance sees Dashboard, Analytics and Billing; a marketer the people pages plus Job Opportunities. A path outside the role renders a calm "That page isn't part of your role" instead of the page; the Settings entry in the account menu follows `org.settings.manage`. The role under the name is real ("Support owner" for STAFF). The static bell is replaced by the shared `NotificationBell` (per-user notifications until O13.3 adds org kinds; no badge when nothing is unread). On a phone the bar is menu, chip (name truncates, pill hidden), bell, account; touch targets 44 px. Tests: web `OrgShell.test.tsx` (13: nav per role, switcher sheet/menu, failure, Escape, 44 px rows), Playwright switcher at 390 and nav for owner / support owner / finance.
- 2026-10-12 · **e2e-o1.6: the org console gate is real (web)** · `(org)/layout.tsx` keeps the session probe + flag redirect (`requireOrgSession`), then reads `GET /api/orgs/mine` and the httpOnly `kiwiply_org` cookie (`lib/org.ts` `loadOrgGate`, pure `decideOrgGate` in `lib/org-types.ts`): zero memberships -> `/org/new`; only plain MEMBER seats (or only closed orgs) -> `/dashboard?toast=org_member`; one admin-ish seat -> render; several -> the cookie picks (a stale or forged value falls back to the first org by name). It then reads `GET /api/orgs/{id}` and hands `{org, role, permissions[]}` to `OrgShell`, which provides them to every page through `useOrg()`; no page reads an org id from the client, and `orgFetch(path)` calls `/api/orgs/{current}{path}` through `forward()` for server code. API 5xx shows a Retry (`OrgLoadError`), never a guessed redirect; a 404 from `mine` (flag flipped since the web last asked) goes to `/dashboard`. The create flow lives outside the gate in its own route group (`(org-flow)/org/new`, placeholder until O2.1) so "no orgs -> /org/new" cannot loop. `QueryToast` (mounted in `(app)/layout.tsx`) turns `?toast=org_member` into one toast and strips the parameter; unknown keys show nothing. BFF: `GET /api/orgs/mine`, `GET|PATCH /api/orgs/[orgId]` (id must be numeric), `POST /api/orgs/current` (checks the id against `mine`, then sets the cookie), `GET /api/config/public`; logout also clears `kiwiply_org`. `OrgChip` and the role label read the real org (the `ORG` sample constant is deleted). Mock: new `scripts/mock-orgs.mjs` (stateful orgs, roles, groups, create with the real validations, demo logins read-only) and fixture `org-roles` (`MOCK_FIXTURE` now takes a comma list; Playwright runs `fresh,org-roles`). Tests: web `layout.test.tsx` (11), `org-types.test.ts` (7), `orgs.routes.test.ts` (7), Playwright `org-console.spec.ts` gate block (5).
- 2026-10-12 · **rb-fix: PdfView/PrintLayoutView bars register with useBottomBar** · The sticky Download PDF bar (PDF view) and the Download / Print bar (Print layout) now call `useBottomBar` like the other bars, so the floating bug-report button and toasts lift above them on phones. A test per view fakes a sticky bar at the window's bottom edge and asserts `--kiwi-bottom-inset` is published and cleared on unmount.
- 2026-10-12 · **ui: AA danger text token** · Error copy used `text-danger` = `--color-danger` (coral #F05252 under theme-v2), 3.5:1 on white / 3.2:1 on paper-2, below WCAG AA. New `--color-danger-text` (`text-danger-text`): `#B42318` under theme-v2 (6.6:1 white, 6.0 paper-2, 5.8 coral-soft, 5.0 on a 16 % coral tint), `#A23B2E` on the base light theme, `#F08A7E` on dark (5.3:1 on paper-2; the bright #E0685A was 3.8). All error TEXT in web + extension uses it; icons (AlertIcon in JobFitReport / ErrorState / PdfView, menu icons), borders, fills and hover colours stay on the bright `--color-danger`. `dangerTextContrast.test.ts` computes the ratios from the CSS files.
- 2026-10-12 · **rb-fix: first PDF export after start no longer 503s (cold sidecar vs a 10 s one-shot connect)** · Root cause: every print connects to the Chromium sidecar, which launches a fresh Chromium for each connection; the first launch after a restart/idle takes ~14 s (1.3 s warm; also `socket hang up` while the sidecar still boots), but `openBrowser` made ONE `connectOverCDP` attempt capped at `min(timeoutMs, 10 s)` and mapped any failure to 503 `PDF_UNAVAILABLE`, so the first export (and every worker job queued behind it) failed until Chromium was warm. Fix in `lib/pdf.ts`: patient connect (`resume.pdf.connectTimeoutMs` 30 s per try, `connectAttempts` 5, doubling `connectBackoffMs` 500 ms, all inside `connectBudgetMs` 60 s; nothing is cached between calls), the print ceiling now starts AFTER the connect, and `instrumentation.ts` warms the sidecar once on boot (`warmPdfBrowser`, `resume.pdf.warmup`, never blocks or throws). New env vars are in docker-compose.prod.yml, .env.example and DEPLOY.md. Proof: against a FRESH sidecar container, the old behaviour (10 s, 1 attempt, no warm-up) fails the first export 503 and 14 more PDF rows; the fix passes all of them twice from a cold start. Unit tests simulate a 14 s cold connector, a failing first connect, the budget, no negative caching and the warm-up.
- 2026-10-12 · **rb1.12: Onboarding v2 — the polish and the proof** · Entry points: the start chooser's empty profile card says "Build my profile · 2 min" (`BUILD_PROFILE_HREF` = `/profiles/setup?return=%2Fresume-builder%3Fnew%3Dprofile`) and `/resume-builder?new=profile` opens the chooser on "Use my profile" (read by the list page, taken off the address); My Profiles empty states say "Set up in 2 min" (`?entry=profiles`); the dashboard card links `?entry=card`; `/profiles?tab=preferences` gains `SetupPreferences` ("I'm a … · Change", saved on pick with the quiet tick, and "Show the setup card again" = `PATCH card RESET`). `entryFrom()` maps `?entry=` / `from=welcome` / `return` / `utm_source=ext` / `path` to `onboarding_started.entry`. Funnel: `lib/onboarding/events.ts` is the only place the 14 event names are spelled (`ONBOARDING_EVENTS`) and `trackOnboarding()` types every property (counts, switches, fixed words; never content or names); fixed a real bug on the way: the review step's `kept`/`skipped` counts overwrote `skipped: boolean` (now `kept` + `skippedCards`); vitest spy asserts the ordered spine of the whole mock flow and that no event holds content. A11y/motion: focus-to-h1 and the review card focus compare against the screen last shown (a dev double-run no longer steals focus on load), the screen slide is clipped by a wrapper that stays put (the moving box used to show a 2 px sideways scroll for 180 ms), Toast fades under reduced motion and its dismiss ✕ is 44 px on a phone, cookie buttons 44 px; `@kiwiply/ui` `Menu` with a button trigger is now THE button (no `span role=button` wrapping a `<button>`: axe nested-interactive, and two tab stops); contrast tokens: `--color-v2-muted` #6E7294→#646989, `--color-accent-deep` #3E8F0E→#2F7A06, nav-active text #1E6FF5→#1A64E0 (all now AA). Phone bugs: new `useBottomBar` in `@kiwiply/ui` (a sticky/fixed bottom bar publishes `--kiwi-bottom-inset` on `<html>`; used by the onboarding `StepFooter`, the editor's phone tab bar, `BioEditor`'s save bar and the cookie banner): the bug-report button lifts above it (`max(6rem, inset + 1rem)`) and `Toast` is full width with a 16 px gutter above it on phones, so neither covers the primary action. Proof: `@axe-core/playwright` 4.13.0 (dev dep, pinned) + `web/e2e/journeys/onboarding-v2.spec.ts` (hello→payoff at 390, 360×640 and 1440 with axe 0 serious/critical, no sideways scroll, no word-per-line h1, 44 px targets on phones, primary action not covered at centre/edge/corners; keyboard-only run; entry points; resume on card 3; other-device conflict; offline; reduced motion) + `web/e2e/fixtures/audit.ts`; the mock gives fixture accounts their own bio/unfinished onboarding/0 resumes so journeys never touch the demo data; `rb-smoke.mjs` gains the DESIGN §17 onboarding rows (needs the real stack; not run here).
- 2026-10-12 · **design: admin AI providers & routing (Gemini end-to-end) + local LLM plan** · `docs/AI-ADMIN-CONFIG-DESIGN.md` (build-ready): `/admin/ai/providers` page (provider cards + Test connection, per-task routing, pricing, global kill switch, recent calls), `AiRouter` as the one `AiProvider` bean resolving provider+model per task from `app_setting` via `AiSettingKeys`/`AiRuntimeSettings` (row › env › code; `DOSSIER_AI_ENABLED=false` stays a deployment master), keys env-only (presence + env var name, never the value), `app_setting_history` + `AI_CONFIG_CHANGE` audit (A5.1's DDL), ledger gains provider/latency/success/error_kind, proof = `AiRouteSwitchIT` + `web/scripts/ai-smoke.mjs` (skips without a key; key read only by the API from gitignored `api/.env.ai.local`). Phase 2 = `OpenAiCompatAiProvider` (Ollama first) + docker profile + $0 pricing + eval-gated promotion; prod stays cloud until a GPU box. Stories I1.9–I1.17 in `ai.json` (I1.11 supersedes I1.6; A4.1/A4.2/A4.3/A5.1/A5.2 reconciled); roadmap regenerated, 0 dangling ids.
- 2026-10-12 · **e2e: E2E-U14.0 — Settings panels are real, no inert rows (Wave 1, lane B)** · `/settings`: the Notifications tab is E2E-U7.0's `NotificationsPanel`; "Time zone: Automatic (from your browser)" is a real `TimeZoneField` select saved to `notification_preference.tz` (shows the browser's zone until the first change, then the saved one; the Account and Notifications panels share one record and one autosave); `SoonRow` and every "Coming soon" badge are deleted (a test greps the page and panels for them). New `PrivacyPanel` renders the typed `lib/data-map.ts` (12 entries: what / why / who sees it / how long, plus the "never collected" list, from the Privacy Policy) with Download my data and the typed-confirmation Delete account (demo accounts get the note instead). New `HelpPanel`: Report a problem opens the one global bug-report dialog (`BugReportWidget` listens for `kiwiply:open-bug-report`, so there is no second report form), Email us, links, and the keyboard shortcuts that really exist (Resume Builder: undo/redo, Ctrl/Cmd+S, Alt+1..4/D/P/V/S; Esc). Playwright `settings.spec.ts` journey (switch autosaves and survives a reload, locked rows, tz select, Privacy, Help opens the dialog, demo account read-only at 390 with no sideways scroll). Checked in a real browser against the mock at 1440, 390 and 360: no horizontal scroll, no word-per-line wraps. Tests: `panels.test` 9; web vitest 1611 + 3 skipped, ui 523, build green.
- 2026-10-12 · **e2e: E2E-U7.0 — notification preferences v0 + `NotificationService.publish` (Wave 1, lane A)** · Additive Liquibase `20261013040000`: `notification_preference` (one row per user: `matrix_json`, `quiet_start/end`, `tz`, reserved digest columns; FK cascade) and `notification.dedupe_key/group_key/inapp_muted` + unique `(user_id, dedupe_key)`. `NotificationKind` enum (APP_STATUS = the old `STATUS_FROM_MAIL`, read both ways; INTERVIEW_REMINDER, PROFILE_SUGGESTION, BILLING, SECURITY, SYSTEM; BILLING/SECURITY locked on, urgent). `NotificationPolicy` (pure: switch x lock x quiet hours on the user's wall clock, DST-safe) + `NotificationPreferenceService` + `GET/PUT /api/profile/notification-preferences` (`{matrix, quietStart, quietEnd, tz, stored, emailEnabled, quietDefaults, kinds[]}`; 422 unknown kind / bad time / bad zone / SENSITIVE_CONTENT; demo PUT 403; keyed by the JWT user, no id in the path). Defaults come from `app_setting` through the settings seam: `notifications.defaults` (JSON matrix), `.email.enabled` (kill switch), `.quiet.defaultEnabled/StartHour/EndHour`, `.defaultTz`. `NotificationService.publish(kind, userId, Payload)` is idempotent on the dedupe key, honours the matrix, stores a muted row when in-app is off (the bell skips it), emails via the new generic `notificationEmail` template (APP_STATUS keeps its richer interview/offer email); `onStatusChanged` is now a caller of `publish`. The Inbox page's `notify_email` switch and the APP_STATUS email switch stay one (both directions). Erased and exported with the account (`notificationPreferences`). Web: BFF `/api/notification-preferences` (via `forward`), `NotificationPrefsProvider` (one `useAutosave`, SavedTick, Undo toast when something goes off, first change of a never-saved record adopts the browser zone), `NotificationsPanel` (per-kind In-app/Email switches, locked rows say why, quiet hours + time zone; no Save button), the three `SoonRow`s are gone; mock-api handler + reset control. Tests: `NotificationPolicyTest` 14, `NotificationServiceTest` +3, `NotificationServiceIT` 6, `NotificationPreferenceResourceIT` 17 (defaults, admin-configured defaults, locked kinds, every 422, demo 403, user B cannot read or change A's and an id in the path is 404, inbox-switch sync, export), deletion IT; web `NotificationsPanel.test` 14, `route.test` 6, lib 8. api unit 1158 + IT 828 green, web vitest 1611 + 3 skipped, ui 523, build green; `api/openapi.json` regenerated (the committed copy was stale: 77 -> 172 paths).
- 2026-10-12 · **rb1.11: Onboarding v2 questions one per screen + finish + payoff** · `prefs` is `PrefsFlow`: ONE of the unanswered application questions per screen, in the persona's order (`prefOrder`; student hides salary behind "Show all questions" on the last screen, EEO always last, collapsed, never pre-selected), student / first job asked "When could you start?" with Right away / After I graduate + a month (stored as the nearest notice option plus `earliestStartDate`), first job's salary hint, the persona tip on the first screen; each Continue is a merge `PUT /api/profile` of just that question's keys (+ `notifyExtension("changed")`, `prefDone` in the draft), Skip writes nothing, a failed write keeps the answer and says "Couldn't save that answer. Try again.". The last Continue / Skip (or the core confirm when nothing is left) calls `POST /finish` (no Finish button; "Couldn't wrap up. Try again." keeps the saved answers) and shows `PayoffStep`: "You're set, {name}.", "Kiwiply can now autofill ~N fields for you." (N from the finish response, else the local `autofillCoverage`; 0 gives "Kiwiply is ready to learn as you apply."), profile strength, one confetti burst (none under reduced motion or when switched off), mascot-clap, and the admin's `payoffActions` in order: Build a resume (`?return=` honoured, same-origin only via `safeReturn`), Install the extension (hidden when `detectExtension` answers within 300 ms, a laptop line on a phone), Find jobs (count only for real matches). `?step=prefs` (the `/welcome` redirect) opens the questions with persona null, or the payoff at once when none are left. `PreferencesStep`, `FinishStep` removed (`Onboarding.tsx` and the old `/welcome` wizard were already gone since R1.7; `/welcome` stays a redirect). Events `onboarding_pref_answered` (never the value), `onboarding_finished`, `onboarding_payoff_action`; `profile_setup_completed` removed. Checked in the browser at 360 / 390 / 1440 through hello, source, review, recap, skills, you, every question and the payoff.
- 2026-10-12 · **rb1.10: Onboarding v2 shell + screens — one thin progress bar, mascot, `hello` persona, `source` upload hero with the lock badge, paste copy, one card per screen with Skip undo, skills, `you` = "Save my profile" core confirm, "Your profile so far"** · `/profiles/setup` is rebuilt in place (DESIGN §5.0 - §5.10, DECISIONS #33): `OnboardingShell` (‹ Back, `SaveStatusPill`, ⋯ menu "Change who I am" / "Start over" (confirm) / "Exit", ✕ Exit to the dashboard, ONE 4 px `ProgressBar` with "~2 min" then "about N min left" computed from `config.onboarding.stepSeconds` and never rising, focus to the new `<h1>` + a polite "Step i of n", slide / crossfade in `globals.css`); `PersonaStep` (four 56 px chips, `PATCH` persona), `SourceStep` (the drop zone is one real button, drag-and-drop on a laptop, OS picker on a phone, expanding lock line, `ParseConsent`, persona-ordered Paste / Start fresh chips, the §5.3 error strings), `PasteStep` copy (≥ 80 chars, clipboard Paste button), `ReviewScreen` (counter, Keep / Skip / Edit / swipe / arrows, Skip → Undo toast, Keep all the rest, the recap as its own screen), `SkillsStep`, `IdentityStep` whose primary "Save my profile" is the core confirm (one import + one PUT, `imported` retry guard), `ProfileSoFar`; `lib/onboarding/{persona,progress,device}.ts`; the old `Stepper`, `PathPicker`, `UploadStep`, `ReviewCards` are gone. `@kiwiply/ui`: `ProgressBar`, `useReducedMotion` (SwipeCard + ConfettiBurst use it), `Button accent-soft`, `ChoiceGroup size="lg"`, `Toast` pauses on hover/focus. Events `onboarding_started / persona_set / path_chosen / step_completed / core_confirmed / dismissed(exit)`; `profile_setup_step|started` removed. Until R1.11 the questions are still the one-screen `PreferencesStep` and Continue runs the old finish. Mock API: `PUT /api/profile` and `POST /api/profile/items/import` now write in memory so the flow can be walked. Checked in the browser at 360 / 390 / 1440: no horizontal scroll, no word-per-line wraps.
- 2026-10-12 · **e2e: U19.3 — Playwright harness + mock fixtures + CI job (Wave 1, lane K)** · `@playwright/test` 1.64.0 (the version `playwright-core` already pinned) in `web`; `web/playwright.config.ts` starts `npm run dev:demo` with `MOCK_FIXTURE=fresh` (ports `E2E_PORT`/`E2E_MOCK_PORT`, default 3100/8180; `PW_CHROMIUM_PATH`/`PW_CHANNEL` pick an existing browser); `e2e/auth.setup.ts` signs `demo`, `demo-org` and the fixture account in once (storage state, git-ignored). The mock API gains `MOCK_FIXTURE=<name>` (`scripts/fixtures/<name>.mjs`): `fresh` adds a brand-new NON-demo login (`fresh.user`, test password in the fixture) whose per-user lists are all empty, plus `POST /api/authenticate` for fixture logins. Journeys: `smoke.spec.ts` opens the 20 user routes + 10 org routes at 390 and 1440 (no console/page errors, no horizontal overflow; only the browser's bare "Failed to load resource" status lines are ignored) and `fresh-account.spec.ts` (U0.5's test: empty states on jobs/applications/saved/alerts/messages/explore/interview-prep/analytics/assistant/dashboard/profiles, no sample text). CI: new job `web-e2e` (`npx playwright install --with-deps chromium`, `npm run test:e2e -w web`, report artifact on failure). `npm run test:e2e -w web`: 60 smoke + 11 fresh-account + 3 setup passed locally. vitest 1252 + 3 skipped, ui 508, build green.
- 2026-10-12 · **e2e: U0.5 — the sample-data gate: real accounts never see a sample row (Wave 1)** · `app-v3/sample-data.ts` content now flows only through `samples(name, enabled)` (`app-v3/samples.ts`): a list comes back `[]`, any other sample `null`, unless the account is a demo login AND the build set `NEXT_PUBLIC_BOARD_SAMPLES=1` (`lib/samples.ts` `samplesEnabled`; the plan's `&&`, the story's wording said "or"; `npm run dev:demo` sets the flag, no production build does). The `(app)` layout wraps children in `SamplesProvider` (client pages call `useSamples()`; server pages pass `samplesEnabled(account.login)`). Each page renders an honest `EmptyState` for a real account: Dashboard (zeros + inline empty cards; a brand-new account's profile checklist is 0 %, not the sample 78 %), Jobs, Applications, Saved, Alerts (no Create button: nothing could be saved), Messages, Explore, Interview prep, Analytics, Assistant (no canned reply), and Profiles' fake title/location/About/skills/versions and the hard-coded job-preference literals (now "Not set"). `loadJobs` no longer falls back to `SAMPLE_JOBS`. Tab labels, filter option lists, page sizes and types stay plain imports (chrome, not rows). Tests: `lib/samples.test.ts`, `app-v3/samples.test.tsx` (every page closed vs open, dashboard for a new account); the Playwright `fresh-account.spec.ts` lands with its harness in U19.3. web vitest 1252 + 3 skipped, ui 508, build green.
- 2026-10-12 · **e2e: E2E-U0.0 — the page kit (Wave 1, lane K)** · One kit so every page story behaves the same (APP-E2E-PLAN §2.3–§2.4). `@kiwiply/ui` gains `SaveStatusChip` (+ `SaveStatus`; the builder's chip moved up, its old path is a re-export), `BottomSheet` (SideSheet's phone sibling: 70 % / full snap, drag the grip down to close, Esc, focus trap, body scroll lock, reduced-motion fade), `ListSkeleton`/`TileSkeleton`/`TableSkeleton`, `ErrorState` (Couldn't load X, Retry, request id), and `EmptyState` gains `variant="page"|"inline"` + `mascot`. Web: `lib/autosave.ts` (the resume controller made generic `createAutosave<T>`, `state/autosave.ts` is a typed shim; new `useAutosave(value, save, {debounceMs=600, onConflict})` -> `{status, savedAt, retry, keepMine, takeTheirs}`, saves a pending change on unmount), `lib/undo-toast.ts` (6 s, one Undo), `lib/list-query.ts` (`useListQuery`: URL-synced, keeps the previous page, `optimistic()` + rollback, error with request id); ESLint rule `kiwiply/icon-button-needs-label` (`web/eslint-rules/`, RuleTester-tested; the whole app already passes). API: `ListPage<T>` + `ListQuery` in `service/dto` (size clamp 50, sort whitelist -> 400 `SORT_INVALID`, q <= 120 -> 400 `QUERY_TOO_LONG`, limits injectable for the settings seam). Tests: ui 508, web vitest 1227 + 3 skipped, `ListQueryTest` 12; build green.
- 2026-10-12 · **e2e: O1.8 demo org seed (`demo-bootcamp` + the Priya Sharma persona)** · `DemoOrgSeeder` (service.org), called from `DemoAccountService.resetData()` and `ensureSeeded()`: an ACTIVE bootcamp `demo-bootcamp` ("Demo Bootcamp", created by and owned by `demo-org`), cohorts "Cohort 26-A" / "Cohort 26-B", two STAFF support owners (Marcus Webb, Elena Rossi), twelve synthetic members (9 sharing SUMMARY, 2 sharing NONE, 1 INVITED), each active one with 2 to 6 applications across the board, and the `demo` job seeker as a MEMBER sharing SUMMARY. Consent goes through `DataShareService.grant`, so each share has its event and audit row like real traffic; the synthetic people are NOT activated `jhi_user` rows on `example.com` (no sign-in, no password reset). Per D47 the demo job seeker is now Priya Sharma (account name, profile, resume labels; an existing account follows on the next `ensureAccounts`). Guards, checked first on every call: the demo is on (`DEMO_ENABLED`), the org flag is on, and the `prod` Spring profile is NOT active (production also has both switches off by default); an org that holds the slug but was not created by `demo-org` is never adopted, and `demo-bootcamp` is now a reserved slug. Idempotent: a fully seeded org is recognised with two counts and returns at once; a half-seeded one is completed (matched by slug, login and seat) and a member's own later sharing choice is never overwritten. `web/scripts/fixtures/demo-org.json` is the same table: `DemoOrgSeederIT` diffs it against the seed and `mock-api.mjs` serves it under `GET /api/orgs/mine`, `/api/orgs/1`, `/api/orgs/1/groups` for `demo-org` and `demo` (honouring `MOCK_ORGS_ENABLED`). Not seeded (nothing reads them yet): inbox messages linked to applications. DEPLOY.md documents it. Tests: `DemoOrgSeederIT` (9: counts, scopes, applications 2-6, support owners, second run changes nothing, half-seeded repair, slug squat refused, flag off seeds nothing, real org API access and 404 for strangers, fixture diff), `DemoOrgSeederTest` (7: prod / demo-off / flag-off / missing accounts touch nothing, table shape), `DemoAccountServiceTest` updated for Priya.
- 2026-10-12 · **e2e: O1.5 `OrgIsolationIT` (the tenancy CI gate)** · `api/src/test/.../web/rest/org/OrgIsolationIT` discovers every `/api/orgs/{orgId}/**` route from the real `RequestMappingHandlerMapping` and FAILS LOUDLY when one is not listed in its `COVERAGE` registry (the message names the line to add: a body to attack the route with, the status of a legitimate call and the audit action it writes; a stale entry fails too, and a route without `@OrgPermissionRequired` or a declared HTTP method fails at discovery). Org A has an owner, admin, staff, member, marketer, finance and a suspended, an invited and a departed seat plus one row of every org table (group, invite batch, join code, domain, audit line, a member's `data_share` and its event); org B has an owner and a member. Every route is called with A's ids by B's owner and member, a platform `ROLE_ADMIN` who belongs to no org, a person with no org, a login that does not exist, each of A's non-active seats, and every role of A that lacks the permission the route needs; also by B's owner using his OWN org id with A's row ids, and with malformed ids (never a 500). Each answer must be the same generic 404 (`NOT_FOUND`, no "forbidden"/"permission"/"role" in the body), and a before/after snapshot of A (org row, groups, seats, shares, invite/join/domain rows, audit and share-event counts) must be identical. Legitimate owner calls in a world of their own assert the status and exactly one audit row per mutating route (none for reads). Repositories: every method of every `repository.org` interface must be named by a cross-tenant check in `repositoryChecks()` (a new interface or method fails until covered; the checks call each with B's org id and A's row ids and assert nothing comes back and a delete removes nothing). Consent: a member with no share is NONE (seat fields only) to their own org's staff, SUMMARY never shows employers, documents or the calendar, FULL reaches only the one named marketer and ends on the next call after revoke, B's marketer and A's staff/admin/owner/finance are never FULL viewers, and an unpaired `auditFullRead` writes nothing. CI already runs it (`./gradlew test integrationTest`). Tests: `OrgIsolationIT` (10).
- 2026-10-12 · **e2e: O1.3a org creation caps (abuse limits, admin-configured)** · The O1.3 follow-up flagged an abuse risk: nothing limited how many orgs one person creates or how many groups an org holds. Both are now admin settings on the interim seam (declared in `ResumeBuilderSettingKeys`, bounds 1..100 and 1..500, never unlimited; an invalid or out-of-bounds stored value falls back to the default): `org.limits.createdPerUser` (default 3; counts every org the person created, closed ones included, because a closed org still holds its slug) enforced in `OrgService.create` before anything is written, and `org.limits.groupsPerOrg` (default 50) enforced in `OrgGroupService.create` after the duplicate-name check. Exceeding either is `422 ORG_LIMIT_REACHED` with `limit` (`orgsCreatedPerUser` / `groupsPerOrg`) and `max` in the body, no row and no audit line written. `OrganizationRepository.countByCreatedByUserId` is scoped by the creating person (allow-listed in `OrgRepositoryContractTest` next to `findMine`). Tests: `OrgLimitsIT` (7: defaults, 3 orgs then 422, per person, closed counts, admin raises/lowers it live, bad stored value never means unlimited, 50 groups then 422, per-org and room after a delete).
- 2026-10-12 · **e2e: E2E-O1.9 org feature flag + `GET /api/config/public`** · `OrgFeatureFlag` (service.org): the admin setting `feature.orgs.enabled` (declared default false, read through the interim `ResumeBuilderSettings` seam, new `getStoredBool` tells "admin stored a value" from "use the default") wins; otherwise the `dossier.orgs.enabled` property decides (env `ORGS_ENABLED`: false in `application.yml` and `docker-compose.prod.yml`, true under the dev profile and in the test suite). It fails closed if the settings cannot be read. `OrgsEnabledFilter` (registered ahead of Spring Security) answers EVERY `/api/orgs/**`, `/api/join/**` and `/api/me/orgs/**` request with the byte-identical problem body of an org that does not exist (404, `NOT_FOUND`) while the flag is off, signed out or in, after normalising the path (`;x`, `//`, `.`/`..` segments cannot dodge the prefix); `OrgPermissionInterceptor` re-checks the flag as a second wall. `PublicConfigResource` `GET /api/config/public` -> `{orgs, demo}` (permitAll, `Cache-Control: public, max-age=300`; `PublicConfigDTO` is a record of two primitive booleans, asserted by reflection so it can never carry per-user data). Web: `lib/public-config.ts` (`getPublicConfig()`, 5-minute cache, fails closed to orgs off), `(org)/layout.tsx` redirects to `/dashboard` while off, `AppShell` -> `AccountMenu` hides "Kiwiply for Organizations" unless `orgsEnabled`; the mock API serves `/api/config/public` (`MOCK_ORGS_ENABLED=false` turns it off). The two org abuse-cap keys (`org.limits.createdPerUser`, `org.limits.groupsPerOrg`) are declared in the same registry edit and used by e2e-o1.3a. `api/openapi.json` regenerated. Tests: `PublicConfigResourceIT` (7), `OrgsEnabledFilterTest` (6), `OrgFeatureFlagTest` (4), `OrgPermissionInterceptorTest` (+1), web `public-config.test.ts` (4), `AccountMenu.test.tsx` (3).
- 2026-10-12 · **e2e: O6.1 data_share + data_share_event + ShareField matrix (what a member shares with their org)** · Additive Liquibase `20261013020000_org_data_share`: `data_share` (one current scope per seat: `member_id` UNIQUE, scope NONE / SUMMARY / FULL, `full_to_member_id`, `consent_version`) and the append-only `data_share_event` (keyed by login strings, no FK to a person, so it survives erasure; scopes, actor MEMBER / ORG_ADMIN / SYSTEM, reason JOIN / MEMBER_CHANGE / MEMBER_LEFT / REMOVED / PAIRING_ENDED / ERASED, consent version, ip / user-agent hashes). `DataShareService`: `grant` / `revoke` take the CALLER's own `OrgMembership` so only the member changes their row (no org role can); FULL must name an ACTIVE same-org seat whose role holds `member.view_full` and never oneself; a scope other than NONE needs a consent text that ships (`consent/org-share/v1.md`, `OrgShareConsent`); each change writes one event and one `SHARE_SCOPE_CHANGED` audit row, an identical call writes nothing; reductions are always allowed, increases are refused in a CLOSED org. `scopeOf(orgId, memberId)` is uncached (revocation is immediate) and never wider than reality: NONE when the seat is not ACTIVE, the org is not live (ACTIVE / PAST_DUE) or the seat is of another org; a FULL whose named person lost the seat degrades to SUMMARY. `endFor` (left / removed) and `endPairingsTo` (FULL to SUMMARY, `PAIRING_ENDED`) are the hooks for the flows to come. `ShareField` is the visibility matrix of the consent doc §3 (`ShareMatrixTest` parses the doc table and diffs every cell), `MemberSummaryDTO` is projected through it (a hidden field is absent, not null; private data is visible at no scope). `OrgShareResumeSharing` is the bean the `OrgResumeSharing` seam waited for (`pairingOf`, `isFullPairedViewer`, `ownersSharingFullWith`, `auditFullRead` writes `SHARE_READ_FULL`), so the ORG path of `ResumeAccessService` now works. Erasure: the seat's `data_share` row is deleted with one `ERASED` event, and an erased marketer drops every FULL share that named them to SUMMARY; the export gains `organizations[].dataShare` (current choice + full history, no hashes). No endpoints yet (the member-side `PUT /api/me/orgs/{id}/share` is O6.2). Tests: `DataShareServiceIT` (17), `ShareMatrixTest` (4), `MemberSummaryScopeTest` (5), `DataShareEventRepositoryNoDeleteTest` (2).
- 2026-10-12 · **e2e: O1.3 org endpoints — create DRAFT, mine, get, patch, close, groups CRUD (+ erasure and export of org seats)** · `OrgResource` under `/api/orgs`: `POST` (`@OrgUnscoped`; DRAFT org + OWNER seat + one `ORG_CREATE` audit row; slug derived from the name or given, 409 `SLUG_TAKEN` with a `suggestion` such as `acme-2` for a taken or reserved slug; COACH type 422 `RESERVED_VALUE`; name scanned by `SensitiveContent`; `sizeBand` / `country` validated), `GET /mine` (`@OrgUnscoped`; ACTIVE seats only, role + status + `memberCount` = ACTIVE seats of every role, by name), `GET /{orgId}` (any ACTIVE member: `{org, me{memberId, role, permissions[]}, memberCount, status}`; `settings` only for `org.settings.manage`, `billingEmail` only for `billing.view`), `PATCH /{orgId}` (OWNER/ADMIN; name, website, sizeBand, country, timezone, billingEmail and a PARTIAL `settings` object validated by the typed `OrgSettings` record, unknown keys 422; the slug is never patched; one `ORG_SETTINGS` row naming the changed fields, none when nothing changed; a CLOSED org is 409 `ORG_NOT_EDITABLE`), `POST /{orgId}/close` (OWNER only; soft CLOSED + `closedAt`, `ORG_CLOSE` audit row, publishes `OrgService.OrgClosedEvent` as the hook for O4.9, idempotent). `OrgGroupResource` under `/api/orgs/{orgId}/groups`: list (`member.view_summary`), create / patch / delete (`groups.manage`), unique name per org (409 `GROUP_NAME_TAKEN`, case-insensitive), delete detaches members (FK SET NULL), `GROUP_CREATE/UPDATE/DELETE` audit rows, foreign group ids 404. Writes are refused for the shared demo accounts. Account erasure (both paths) now runs `OrgMembershipPrivacyService.eraseFor`: every seat of the user in any state is anonymised to ERASED (`user_id`, invite email / token, label, support owner cleared), `MEMBER_ERASED` is audited keyed by the login, and an org whose last ACTIVE OWNER left moves to SUSPENDED; `GET /api/account/export` gains `organizations[]`. `OrgHandlerGuardIT` walks the real `RequestMappingHandlerMapping` and fails for any `/api/orgs/**` handler without `@OrgPermissionRequired` / `@OrgUnscoped`. Tests: `OrgResourceIT` (28), `OrgGroupResourceIT` (13), `OrgMembershipPrivacyIT` (8), `OrgHandlerGuardIT` (2), `OrgSettingsTest` (9), `OrgSlugsTest` (6), `AccountExportResourceIT` (+organizations). Full suites green: api unit 1118, integration 798.
- 2026-10-12 · **e2e: O1.2 OrgAccessService + role/permission matrix (OWNER ADMIN STAFF MEMBER MARKETER FINANCE; COACH reserved)** · `OrgPermission` (25 keys, the wire form the web gates on, e.g. `members.invite`) and `OrgRole.grants()/permissions()/can()/scopeOf()` transcribe tenant-model.md §4 cell by cell, qualifiers kept as `OrgScope` (STAFF `MEMBER_ROLE_ONLY` / `OWN_MEMBERS`, ADMIN `BELOW_ADMIN_ROLES`, MARKETER `OWN_CONSULTANTS` / `PAIRED`, FINANCE `BILLING_AND_OPS_ROWS`, MEMBER `OWN_HOURS`, `SELF`, OWNER leave `SELF_AFTER_TRANSFER`); the `ops.*` row's MEMBER "own hours" cell is its own `ops.own_hours`. No permission exists for submitting, signing in as a member or reading answers / inbox. `OrgAccessService.require(orgId, permission)` / `requireAll` / `requireMember` / `resolve` resolve the caller to their ACTIVE `org_member` row and return an `OrgMembership` record (org, member, user, login, role, org status, `can`, `scopeOf`, `permissionKeys`); EVERY failure (not a member, INVITED/SUSPENDED/LEFT/REMOVED/ERASED seat, role without the permission, missing org, bad id, no signed-in user, reserved COACH seat) throws the same generic `OrgNotFoundException` (404, "Not found", never "forbidden"); platform `ROLE_ADMIN` is never consulted. `@OrgPermissionRequired` (+ `@OrgUnscoped` for the two org-less handlers, create and mine) and `OrgPermissionInterceptor` (registered on `/api/orgs/**` by `OrgWebConfiguration`) run the check from the `{orgId}` path variable BEFORE the handler, hand the membership over as a request attribute, and fail closed on an unannotated handler. `OrgAuditService.record(OrgMembership, ...)` overload added. Tests: `OrgPermissionMatrixTest` (181: every role x permission cell + the embedded table diffed against tenant-model.md §4), `OrgAccessServiceTest` (14), `OrgPermissionInterceptorTest` (8), `OrgResourceGuardTest` (2, incl. a violating-fixture meta-test), `OrgAccessServiceIT` (4).
- 2026-10-12 · **e2e: O1.4 OrgAuditService (append-only org audit trail)** · `OrgAuditService.record(orgId, actorRole, action, targetType, targetLogin, targetId, details)` appends an `org_audit_event` row in the caller's transaction, actor taken from the security context (`system` when none) and keyed by login strings so the trail survives erasure; a second overload takes an explicit actor + `ipHash` for jobs, webhooks and erasure; `details` is truncated to the 2000-char column; `hashIp` is SHA-256 hex, never the address. All action keys of tenant-model.md §2.7 exist as constants (`BILLING_` / `MARKETER_` / `OPS_` are fixed prefixes owned by their areas) plus `ORG_CLOSE`, `GROUP_CREATE/UPDATE/DELETE` for O1.3. `OrgAuditEventRepository` is `save` + reads only (bare `Repository` marker, no delete/update/@Modifying). Tests: `OrgAuditServiceTest` (7), `OrgAuditRepositoryNoDeleteTest` (3), `OrgAuditServiceIT` (2), and the shared helper `OrgAuditAsserts` (`assertOneNewRow` / `assertNoNewRow`) that every mutating org endpoint test uses from O1.3 on.
- 2026-10-12 · **e2e: O1.1 org core schema (organization tenant model, Wave 1 lane C)** · Additive Liquibase `20261013010000_org_core` creates the seven tables exactly as `docs/design/org/tenant-model.md` §2: `organization`, `org_member`, `org_group`, `org_invite_batch`, `org_join_code`, `org_domain`, `org_audit_event`. `org_member` carries the two STORED generated unique keys (`active_key` = one live row per email per org, `active_user_key` = one live membership per user per org; LEFT/REMOVED/ERASED free the slot so a re-invite works). `organization.created_by_user_id` is ON DELETE SET NULL; `org_member.user_id` cannot be (MySQL refuses SET NULL on a base column of a stored generated column), so account erasure nulls it explicitly (wired in O1.3). No sensitive PII in any column. JPA entities in `domain.org`, enums `OrgType/OrgStatus/OrgRole/OrgMemberStatus/OrgGroupKind` in `domain.enumeration`; repositories in `repository.org` extend only the bare `Repository` marker (no `findById`, no `findAll`) and every method takes `orgId` first, except `findMine(userId)` and two allow-listed slug lookups on the tenant root. COACH is rejected 422 `RESERVED_VALUE` for type and role (`OrgRules`); `OrgException`/`OrgNotFoundException` (generic 404) + `OrgProblemException` in `ExceptionTranslator`. Tests: `OrgSchemaIT` (15: round trips, generated keys, duplicate email/user rejected, INVITED -> LEFT -> re-invite, group unique per org, group delete detaches members), `OrgRepositoryContractTest` (5, reflection), `OrgRulesTest` (5).
- 2026-10-12 · **rb1.9: Web draft sync — state v2 + v1 upgrade, `useDraftSync` (local mirror, debounce, beacon, offline, conflict), BFF routes, mock API, status pill, resume banner, card reads the server** · Onboarding progress is never lost (DESIGN §7, DECISIONS #32/#33g). `SetupState` is v2 (`hello, source, review?, skills, you, prefs, done`; `persona`, `stepsDone/Total`, `subProgress`, `coreConfirmedAt`, `prefsDone`, `updatedAt`) with `upgradeDraft`/`migrateV1Draft` for the old `sessionStorage` draft; `lib/onboarding/{api,mirror,server,useDraftSync,coverage,bff}.ts`: every change goes to a `localStorage` mirror at once, a 600 ms trailing-debounced `PUT /api/profile/onboarding/draft` (one in flight, `baseUpdatedAt`), a `sendBeacon` flush when the page is hidden/closed, offline retry (2 s -> 30 s, cap 5 min, and on `online`), a 409 -> "Use that" / "Keep mine" (a 409 against our own earlier write is recognised by its stamp and is not a conflict), and a load-time reconcile of server draft / mirror / v1 draft by `updatedAt` (60 s skew favours the server). The application-question answers are never in the draft. BFF `app/api/profile/onboarding/{route,draft,finish}` (thin proxies, POST alias of the draft PUT for the beacon, rate limits). `ProfileSetup` shows `SaveStatusPill` ("Saving…" after 300 ms, "Saved", "Offline — saved on this device" + Retry; announcements throttled to 10 s), `ResumeBanner`, `ConflictBanner`, calls `POST /finish` after the profile is confirmed; `FinishProfileCard` + the dashboard read `GET /api/profile/onboarding` (server-evaluated `card.show/state`, `stepsDone/Total`), snooze/dismiss are `PATCH`, and the R1.7 `localStorage` memory is migrated once. `autofillCoverage` + the four shared fixtures + the schema parity test. `mock-api.mjs` serves the five routes (in-memory draft per login, 409/413/422, `/mock/onboarding/{offline,edit-elsewhere,reset}` controls) and `config.onboarding`. Sign-out clears the mirror. The new shell and screens are R1.10.
- 2026-10-12 · **e2e-u6.4: Interviews — CRUD, outcome, date-range feed, `.ics` export (API + BFF + mock + `lib/interviews.ts`; the Interview tab waits for U6.3)** · API: `POST /api/profile/applications/{id}/interviews` (201), `PUT .../{iid}` (partial: absent = unchanged, `null` clears endsAt / tz / location / interviewer / notes), `DELETE .../{iid}` (204), `POST .../{iid}/outcome {outcome: PENDING|PASSED|REJECTED|NO_SHOW}`, `GET /api/profile/interviews?from=&to=&outcome=` (soonest first, each row carries its application's `company` / `roleTitle`; `from` / `to` are ISO instants or dates, a date `to` includes that whole day in UTC; default from now for `tracker.interviews.defaultRangeDays`; capped by `tracker.interviews.maxRangeDays` and `listMax`), `GET /api/profile/interviews/{id}/ics` (`text/calendar`, attachment `interview-<id>.ics`). `InterviewService` / `InterviewResource`; body `{kind, startsAt, endsAt?, tz?, location?, interviewer?, notes?}` read as JSON; refusals are 422 `TRACKER_INVALID {path, message}` (kind, ISO times, endsAt after startsAt and within `tracker.interview.maxDurationHours`, IANA `tz`, lengths: location 200 / interviewer 120 / notes `tracker.interview.notesMaxChars`), 422 `TRACKER_LIMIT` (`tracker.interviews.maxPerApplication`) and 422 `SENSITIVE_CONTENT {path, class}` on location / interviewer / notes (on edits too). Rows carry the user id and are found by id AND owner AND application, so another user's application or interview is 404 on every route including `.ics` and never appears in a range (`InterviewResourceIT` proves each). Logging, rescheduling, removing and an outcome change write an INTERVIEW timeline event (field edits do not: they autosave); logging does NOT move the application's status (the user's explicit choice) and the next step on the list / detail is the soonest future interview. `IcsCalendar` (pure) writes the event in the interview's own zone with a `VTIMEZONE` built from the JDK zone rules (yearly rules as RRULE over month days + weekday, one fixed component for zones without DST), UTC form for no / UTC / bare-offset zones (a missing zone says so in the description), 75-octet folding that never splits a character, TEXT escaping, `URL` when the place is a link, default length `tracker.interview.defaultDurationMinutes`. Web: BFF `app/api/interviews` (range), `app/api/interviews/[id]/ics` (named attachment), `app/api/applications/[id]/interviews[/[iid][/outcome]]`; `lib/interviews.ts` (types, tagged-result fetchers, `icsHref`, `googleCalendarUrl` built client side, `needsOutcome` for the dashboard's "How did it go?"); `mock-tracker.mjs` already speaks all of it (incl. a UTC `.ics`). NOT built (owners): the Interview tab / `InterviewForm.tsx` (autosave per field, `SavedTick`, "Add to calendar" = `icsHref` + `googleCalendarUrl`, outcome chips via `needsOutcome`) belongs to the U6.3 detail sheet; the dashboard's interviews card is U3.1 (`GET /api/interviews`); reminders (`INTERVIEW_REMINDER`, 24 h / 1 h, `notify.interview_reminder_hours`) arrive with U7.1 (the `reminder_*_sent_at` columns are untouched here); inbox-proposed interviews ("Confirm interview?" cards, I9.9) are not built. Tests: api `IcsCalendarTest` (10), `InterviewResourceIT` (15); web `lib/interviews.test.ts` (10), `interviews.routes.test.ts` (10). Full suites green: api unit 918, integration 778 (the first full run hit `OpenApiContractIT`'s 15 s timeout while a web build shared the machine; it passed alone), web 1278 + build.
- 2026-10-12 · **e2e-u6.2: Applications list API v2 — filters, sort, paging, tab counts, detail, PATCH, notes, bulk, activity (API + BFF + mock; no web page)** · `GET /api/profile/applications` keeps the old plain array (now newest update first, it was unordered) when the request names none of `page, size, sort, q, status, company, archived, ghosted`, and otherwise answers one page `{items, total, page, size, summary}` (the shared list shape of the plan §2.4): `status` is a CSV of statuses (422 `TRACKER_INVALID` for an unknown one), `q` searches company / role / location (LIKE wildcards escaped), `company` is an exact case-insensitive match, `archived=false|true|all` (default false), `ghosted=true`, `sort=field[,asc|desc]` over `updatedAt createdAt appliedAt lastEventAt nextActionAt company roleTitle status` with the id as tie-break (400 `SORT_INVALID {allowed}`); `summary` = `ALL, DRAFT, SAVED, APPLIED, IN_REVIEW, INTERVIEW, OFFER, REJECTED, WITHDRAWN, GHOSTED, ARCHIVED` and follows `q` / `company` but not the status / archived filters (it is the tab counts). Items carry the derived `ghosted`, `nextStep{label, at}`, `notesCount`, `interviewsCount`, `mailCount`, loaded with one grouped query each per page. `GET .../{id}` = the application + `events` (newest first, `tracker.detail.eventsMax`), `notes` (pinned first), `interviews`, `mailCount`, `suggestions` (inbox readings that would have moved an ARCHIVED application: mail never moves one, the Emails tab offers them); `PATCH .../{id}` reads the body as JSON so absent = leave and `null` = clear: `status` (a move to APPLIED..OFFER also dates it and confirms the submission), `nextAction` (<= 160, sensitive-checked) / `nextActionAt`, `starred`, `archived`, `resumeId` (404 for a resume that is not yours), `outcome` ACCEPTED (stamps `acceptedAt`, D-7) / DECLINED / null; every real change writes its WEB timeline event; `POST /bulk {ids, action: ARCHIVE|UNARCHIVE|STATUS|STAR|UNSTAR, status?}` -> `{done, failed:[{id, reason: NOT_FOUND}]}` (an id that is not yours is a per-id result, not an error; 422 `TRACKER_LIMIT {limit}` past `tracker.bulk.maxIds`); `POST/PUT/DELETE .../{id}/notes[/{nid}]` (create writes a NOTE event, edits do not; body checked by `SensitiveContent` -> 422 `SENSITIVE_CONTENT {path: body}`, `tracker.note.maxChars` / `tracker.notes.maxPerApplication`); `GET .../activity?days=&tz=` -> dense `[{day, count}]`, oldest first, days named in the caller's zone, default / cap from settings. Every row is looked up by id AND owner (`TrackerUsers`), so another user's application, note or id in a bulk call is 404 / NOT_FOUND, never 403; `ApplicationTrackerResourceIT` proves it for every verb. No business number is a literal: page size, size cap, search length, ghosted window, bulk cap, note limits, activity days are `tracker.*` settings. The shared `ListPage` / `ListQuery` of E2E-U0.0 are not on this base, so the page is `ApplicationListPage` (same JSON shape; swap it for `ListPage<ApplicationDTO>` when U0.0 merges). BFF (style B, `lib/tracker-proxy.ts`): `GET /api/applications` (query forwarded untouched), `GET/PATCH /api/applications/[id]`, `GET /api/applications/activity`, `POST /api/applications/bulk`, `POST /api/applications/[id]/notes`, `PUT/DELETE .../notes/[nid]`; the PUT / POST status whitelists gain `IN_REVIEW` and `WITHDRAWN`. `mock-api.mjs` gains `scripts/mock-tracker.mjs` (in memory, same contract and refusals, seeded history / notes / interviews). U6.3 (detail sheet) owns every page: it can build on `app/api/applications/**` as is and must delete `V3_APPLICATION_ROWS` / `V3_APPLICATION_SAMPLE_COUNTS`. Tests: api `ApplicationTrackerResourceIT` (20: paging, size clamp, filters, summary, sort whitelist, ghosted, tenant isolation on every verb, detail, PATCH, outcome, bulk partial failure + caps, notes incl. sensitive and caps, activity); web `tracker.routes.test.ts` (18). Full suites green: api unit 908, integration 763; web 1278 (+ lint / tsc); mock exercised end to end with a smoke script.
- 2026-10-12 · **e2e-u6.1: Tracker schema — events, notes, interviews, `IN_REVIEW` / `WITHDRAWN` (APP-E2E Wave 1, lane A)** · The applications tracker gets a memory. Liquibase `20261013030000_application_events` (additive): `application_event` (kind CREATED/STATUS/NOTE/INTERVIEW/MAIL/RESUME/ATTACHMENT/FIELD, from/to status, source EXTENSION/WEB/INBOX/SYSTEM/ASSISTANT, ref id, summary <= 200; FK cascade, index `(application_id, created_at)`), `application_note` (body LONGTEXT, pinned), `interview` (user FK + application FK, kind, `starts_at`/`ends_at`, `tz`, location, interviewer, notes, outcome, the two `reminder_*_sent_at` idempotence markers, source, `inbox_message_id`; index `(user_id, starts_at)`) and seven `application` columns (`last_event_at` = the ghosted clock, `next_action`/`next_action_at`, `outcome`/`accepted_at`, `cover_letter_resume_id`, `posting_id`); backfill changesets give every row a CREATED event and every applied row a STATUS event (source SYSTEM) and start `last_event_at` at `updated_at`. Statuses `IN_REVIEW`, `WITHDRAWN` (varchar column, Java only). `ApplicationEventService` is the one writer (`record`, `recordCreated`, `recordStatus`, back-dated `recordAt`; the ghosted clock only moves forward), called by `ApplicationSyncService.upsert/update` (CREATED, STATUS, archive/restore, resume change; source from the payload's `source`, the extension's confirm-submission shape counts as EXTENSION) and, via an `@EventListener` on `InboxParser.StatusChanged`, by inbox moves (source INBOX, ref = the mail); `JobMatchService.save` also carries `postingId`. Inbox: `MailClassifier.Category.IN_REVIEW` ("under review" mails; a receipt with that boilerplate stays APPLIED), `MailMatcher.next` puts IN_REVIEW between APPLIED and INTERVIEW and never moves mail out of WITHDRAWN; the AI prompt names the category. Derived, never stored: `ApplicationDerivations` (ghosted = applied or in review, not archived, no event for MORE than `tracker.ghostedAfterDays` days; next step = soonest interview, "Review offer", the user's next action). `TrackerDataService`: erased with the account (both deletion paths) and exported (`applicationEvents`, `applicationNotes`, `interviews`), and seeds the demo account's history (CREATED/APPLIED/moved events, 2 notes, 5 interviews, relative to now). `ApplicationDTO` gains additive NON_NULL fields (`lastEventAt`, `nextAction[_At]`, `outcome`, `acceptedAt`, `postingId`, derived `nextStep`/`ghosted`/counts, filled by the v2 endpoints of U6.2); 17 `tracker.*` keys in `ResumeBuilderSettingKeys` (page size, caps, ghosted window, activity days, note / interview limits). `api/openapi.json` regenerated (it had not been since phase 12.5, so the diff also carries the resume-builder endpoints). Extension: unchanged code; `tracking.test.js` pins that unknown statuses pass through the read-only mirror and server-owned tracker fields are never sent back (no version bump: no shipped file changed). Tests: api `ApplicationEventServiceTest`, `GhostedDerivationTest`, `MailMatcherTest`/`MailClassifierTest` (+IN_REVIEW, WITHDRAWN), `ApplicationEventIT` (events per write, sources, backfill SQL run against legacy rows), `TrackerDataLifecycleIT` (both erasures + export), `DemoAccountServiceTest`; unit 908, integration 743 green.
- 2026-10-12 · **rb4.6: AI Suggestions tab — `SUGGEST` task + prompt, suggestion cards (count badge, carousel, Apply Suggestion / Preview, See all, Refresh)** · The board's right-rail "AI Suggestions (4)" card is real. API: `ResumeAiService.suggest(resumeId, consent, refresh)` over the same `callModel` gate as rewrite/summary (feature switch, `AiBudgetService.decide`, consent, cache, daily cap + per-minute rate, `AiMeteringService.record`, JSON retry) with the existing `resume.suggest v1` prompt (slots: `max` = `resume.ai.suggestMax`, `gaps` = the failing Resume Score groups of `score_json` in words, `keywords`/`jd` = none until R5.6); each card is stored as its own OPEN `suggest` proposal (`kind`, `title` <= 60, `body` <= 160, its changes) pinned to the content hash; every change goes through `AiTruthChecks` REWRITE (a violating change is dropped and counted, a card left with none is dropped, a line is offered by one card only, link / sensitive text in a title or body drops the card); cache key `suggest|v1|contentHash|jdHash` (the same document is answered from the stored cards at zero cost, `refresh: true` skips the cache and the fresh set dismisses the cards it supersedes); `suggestions(resumeId)` reads the open cards with no AI call (carousel order summary > bullets > keywords > skills > section, `stale` per card, `staleAt` = last change + `resume.ai.suggestStaleMinutes`); after any apply the other open cards are re-pinned to the new hash when their lines still read as before (applying one card leaves the carousel usable). `POST/GET /api/profile/resumes/{id}/ai/suggestions` (`ProposalListResult`), BFF `app/api/resumes/[id]/ai/suggestions`. Web: `rail/{AiSuggestionsTab,SuggestionCard,SuggestionsSheet,useSuggestions}`: card with count badge + "See all", carousel (`aria-roledescription`, arrow buttons with tooltips, one dot per card, Left/Right keys, swipe, no auto-advance), "Apply Suggestion" (server apply then one `text/replaceMany` step + "Applied N changes - Undo" toast, via the R4.2 flow: `useRewriteFlow` gains `quickApply`, `preview`, `onSettled`) and "Preview" (the same `ProposalDiff`, titled "AI suggestion", no mode picker); empty "Get suggestions", stale "Resume changed - Refresh" (buttons wait), nothing-to-improve / kept-your-facts-safe / quota / disabled / error notices, Free = the one locked card with See Pro (no request, no badge); opening the tab only READS stored cards, auto-refresh is off by default (DECISIONS #8) and when on waits `suggestStaleMinutes` of quiet. Events `resume_ai_suggestions_requested`, `_shown{count, cached}`, `_see_all`, `resume_ai_suggestion_preview`, `resume_ai_locked_click{task: suggest}`. `mock-api.mjs` fakes the cards (`GET /__mock/ai?plan=pro&mode=...` applies; version-pinned, re-pinned on apply). Tests: api `ResumeAiServiceTest` 39 (+14), `ResumeAiResourceIT` 22 (+7); ui 484; web 1240 (new: `ResumeEditor.suggestions`, `AiSuggestionsTab`, `resume-ai` fetchers). Browser check against the mock (own tab): Free lock; Pro empty -> Get suggestions -> carousel -> Preview diff -> Apply -> toast, count badge falls, See all, 1440 and 375.
- 2026-10-12 · **web: favicon set regenerated from the v2 mascot logo** · The June favicon set (`1b82f0b`) was cut from the OLD kiwi-slice mark; `app/favicon.ico` (16/32/48 PNG-in-ICO, tighter crop for 16/32), `app/icon.png` (192, transparent) and `app/apple-icon.png` (180, white tile, ~12% padding) are now cropped from the mascot half of `public/v2/logo-v2.png` (box x -6..239, y -6..239 on the 764x234 lockup, transparent padding; no wordmark). The `mascot-*.png` poses are a different (winking, big-headphones) render, so not used. Extension icons (`job-autofill/icons/**`) still use the old logo.
- 2026-10-12 · **rb1.8: Onboarding v2 API — `onboarding_draft` table, `OnboardingResource`, meta markers, settings + config, purge, deletion/export, `AutofillCoverage`** · The server half of the happy first run (DESIGN §8–§11, DECISIONS #33a–g). Liquibase `20261012110000_onboarding_draft` (one row per user: `v`, `step`, `persona`, `steps_done/total`, `state_json` LONGTEXT, `created_at/updated_at/expires_at`, FK cascade, index `idx_onboarding_draft_expires`) + `OnboardingDraft` / `OnboardingDraftRepository`. `OnboardingService` + `OnboardingResource` under `/api/profile/onboarding`: `GET` (`?include=state`; status NONE/DRAFT/FINISHED with FINISHED read through from `meta.onboarding.finishedAt` OR `payload.onboardedAt`, the persona, the draft summary, the card decision and `completeness{score, promptBelow, resurfaceBelow}`), `PUT /draft` (upsert with `baseUpdatedAt` -> 409 `DRAFT_CONFLICT{serverUpdatedAt}` unless `force`, 413 `DRAFT_TOO_LARGE{max}`, 422 `DRAFT_INVALID{path}`, 422 `SENSITIVE_CONTENT{path, class}` from `SensitiveContent` over every string of `state`, `expires_at = updated_at + ttlDays`), `DELETE /draft` (204), `PATCH` (persona enum / null, 422 `PERSONA_INVALID`; card SNOOZE / DISMISS / RESET), `POST /finish` (idempotent: `finishedAt`, `payload.onboardedAt` only when blank, draft deleted, completeness via `ProfileItemService`, `coverage`). `OnboardingCardRules` (pure, the §6 table; a dismissed card that returns is counted once per showing via `resurfacedAt`). `ProfileMeta` gains `OnboardingMeta` / `OnboardingCard` accessors (unknown keys survive). 14 `onboarding.*` / `feature.onboarding_v2.enabled` keys in `ResumeBuilderSettingKeys` (typed, bounded, parity-tested against DESIGN §11) + `ResumeBuilderConfigDTO.Onboarding`. `OnboardingDraftPurgeJob` (03:50 UTC), `ResumeBuilderDataService.deleteOnboardingDraft` (called by `deleteAllForUser`, so both deletion paths), export key `onboardingDraft`. `AutofillCoverage` (31 schema keys, 5/exp max 3, 4/edu max 2, skills 1; groups sum to the total; fixtures `api/src/test/resources/onboarding/coverage-*.json` for the web twin). Draft and marker writes touch neither `bio.payload` nor `bio.updatedAt`: the extension's `ProfileVersion` does not move (IT proves it). Demo logins: writes 403. Tests: api `OnboardingServiceTest`, `OnboardingCardRulesTest`, `AutofillCoverageTest` (incl. schema.js key parity), `ProfileMetaTest`, `OnboardingDraftPurgeJobTest`, `ResumeBuilderSettingsTest` (+bounds of all 14), `ResumeBuilderSettingKeysParityTest` (+§11), `ProfileVersionTest`, `OnboardingResourceIT`, `AccountDeletionServiceIT` (+draft), `ResumeBuilderConfigResourceIT` (+`onboarding`). No web/extension change (R1.9 adds the BFF + types).
- 2026-10-12 · **rb1.7: Dashboard `FinishProfileCard` + no onboarding redirect + `/welcome` redirected into the flow (Onboarding v2, DESIGN §4/§6)** · The dashboard no longer redirects anyone to `/welcome` (`needsOnboarding` deleted from `profile-options.ts`; `ONBOARDED_KEY` stays); `/welcome` is a server `redirect("/profiles/setup?step=prefs&from=welcome")` and `components/onboarding/Onboarding.tsx` is gone (`preferences.tsx` stays). `BuildProfileCard` (+ test) is replaced by the client `FinishProfileCard` in the same first slot: not started (mascot-wave, "Let's get you job-ready", Start) / in progress (mascot-laptop, "Finish your profile", "{done} of {total} done · about {m} min left", `Meter`, Continue) decided from the local v1 draft (`loadDraft(sessionStorage)`), ⋯ `Menu` (44 px `IconButton`) with snooze (3 days default) / dismiss remembered per login in `localStorage` `kiwiply.onboarding.card.v1`, toasts per §5.14, events `onboarding_card_shown` (once per session) and `onboarding_dismissed`. Show rule: hidden when `onboardedAt` is set and `completeness.score >= profile.setup.promptBelowPercent`, or when the score is unknown. The non-React parts live in `web/src/lib/onboarding-card.ts` (declared defaults of `onboarding.estimateMinutes/snoozeDays/stepSeconds` until R1.8/R1.9 carry them on the builder config). `ProfileSetup` takes `initialStep="prefs"` from `?step=prefs` (prefs-only run: the questions then done, Back goes to the path picker; a draft in the tab wins). Tests: `FinishProfileCard.test.tsx` (11), `welcome.test.ts`, `dashboard.test.tsx` (never redirects: empty / 404 / full bio), `ProfileSetup.test.tsx` (+2). Browser-checked on the mock (new user: card, snooze + dismiss persist, `/welcome` lands in the setup flow; 1440 + 375).
- 2026-10-12 · **rb4.2: Diff UI — `ProposalDiff` + `AiDisclosure`, "Rewrite with AI" on section headers and per bullet, modes, lock states** · The board's "Rewrite with AI" is real. `@kiwiply/ui` gains `AiDisclosure` ("AI · review before you use it", Why?, what was sent, model, call id, "Made with Kiwiply AI" chip). `web/.../resume-builder/ai/`: `RewriteMenu` (Pro: the five modes - Stronger, Shorter, More formal, Plain language, Fix grammar - and a "sends your resume text" line; Free: the same button as a lock with the Pro chip opening a card with See Pro; an empty block's pill is off with the reason), `ProposalDiff` (right sheet, fullscreen on a phone: per change a word diff via `DiffText`, Why, checkbox, other wordings as radios, an `[add a number]` warning that blocks Apply until another wording is chosen or the change is unticked, "Formatting on this line will be reset", a mode picker that re-asks, the meter line, `AiDisclosure`; Dismiss / Apply N selected; Up / Down walk the checkboxes, Ctrl/Cmd+Enter applies; loading, 402 lock card, error + Try again, quota / daily cap / disabled / nothing-to-change copy with a "Run the Resume Score tips" chip), `useRewriteFlow` (flush, ask, review, apply: the server applies first, then ONE `text/replaceMany` reducer step so a single Undo takes it back, `src: "ai"`, and the autosave `reset`s to the server's version so nothing is saved twice; the sheet closes with an "Applied N changes - Undo" toast, no confirm), `OpenRewriteBar` (an open proposal after a refresh or a closed sheet is offered again; Review / Discard), `aiRefs` (rewritable lines, longest first, ref resolution). Section headers carry the pill (Summary, Experience, Education, Projects, Custom, Achievements; up to `config.ai.rewriteMaxRefs` lines, longest first); every bullet gets a control ("Rewrite this bullet"; a lock on Free); the Insights F4 tip gets "Trim the longest bullets" (mode Shorter on the 4 longest bullets; a Pro-lock link on Free). `lib/resume-ai.ts` holds the fetchers (tagged results: 402 = locked, 409 PROPOSAL_STALE / PROPOSAL_CLOSED, 422 PLACEHOLDER_REMAINS, 429, 502) and every refusal sentence. Events: `resume_ai_rewrite_requested`, `resume_ai_apply`, `resume_ai_dismiss`, `resume_ai_locked_click`. `mock-api.mjs` fakes deterministic proposals (`MOCK_PRO=1`, `GET /__mock/ai?plan=free|pro&mode=ok|quota|daily|fail|nothing|disabled|slow`). Tests: ui 474 (AiDisclosure +3), web 1155 (new: ProposalDiff, RewriteMenu, ResumeEditor.ai integration, resume-ai, aiRefs, TipsSheet.trim, reducer replaceMany). Browser check against the mock: Free lock + See Pro; Pro Summary and bullet diff, Apply, Undo toast, Undo, Dismiss, quota state, 1440 and 375.
- 2026-10-12 · **web: favicon set (ico + png + apple) and "Kiwiply | Page" titles everywhere** · Tab icon: `app/favicon.ico` (16/32/48, PNG-in-ICO), `app/icon.png` (192, was a 238 KB 512), `app/apple-icon.png` (180, white tile), all cut from the tight-cropped kiwi mark (`/favicon.ico` used to 404, so tabs showed a globe); `proxy.ts` matcher also skips `apple-icon.png`. Root title template is now `Kiwiply | %s` (default `Kiwiply | Find jobs. Apply faster. Get hired.`); six titles that already said Kiwiply were trimmed (about, for-organizations, inbox settings, billing success, newsletter confirm/unsubscribe) so none doubles or ends `· Kiwiply`. The resume editor tab is `Kiwiply | <resume name>` via `generateMetadata` sharing a `React.cache` doc loader with the page (no second API call). Guarded by `src/app/titles.test.ts`.
- 2026-10-11 · **design: Timesheets promoted to a product area (H)** · The user asked for timesheets to be a product-level feature like the Resume Builder. Removed the Consultancy Ops epic and its fourteen stories from `docs/roadmap/areas/org.json` (foundation deps O1.x/O2.x/O6.x/O13.x stay there) and re-planned them as product area **H** in `docs/timesheets/stories.json` (9 epics H0–H8, 42 stories, 75 pts, every epic P2 per D10; ★ H0.1–H0.5; walking skeleton H0.1–H0.7 = gate → placement → one sheet submitted/approved → CSV → smoke). Wrote `docs/TIMESHEETS-DESIGN.md` (absorbs `docs/design/org/timesheets.md` + `consultancy-ops.md`, which are now pointers; §13 = old→new id map), `docs/TIMESHEETS-STORIES.md`, `docs/TIMESHEETS-DECISIONS.md`, `docs/HANDOFF-TIMESHEETS.md`; re-pointed RECONCILIATION, PROPOSAL-timesheets, PLAN/AUDIT-org, competitive docs, tenant-model, trust.json T1.1, org.json O4.8/O10.12. Validation: 13 files, 921 stories, 152 epics, 0 dangling ids, 0 cycles, 0 old-id tokens in JSON. Generator wiring (Products group, drop the Add-ons spotlight) is a follow-up. No product code.
- 2026-10-12 · **rb-ux: Notion-style autosave feedback — status chip, inline ticks, undo toasts, Save version in the Version menu (+ tooltips on every icon-only control)** · User decision (DECISIONS #32, "i go with genZ and like other apps like notion style"): no Save button anywhere. One `SaveStatusChip` next to "Resume Builder" at every width (Saving… / Saved ✓ / Saved N minutes ago; loud amber "Not saved — retrying" and "Offline — changes will save when you're back" with Retry; `useOnline`). The top-bar Save + Save ▾ are gone; **Version ▾ → Save version…** (header, also ⋮ for the phone) opens an inline name field (default "Version N · Oct 12") and goes through the editor's `checkpointDoc` (named checkpoint + PDF now); Ctrl/⌘+S saves a version with the default name and toasts "Version N saved". New `SavedTick` + `useSavedFlash` in `@kiwiply/ui`: a ~1 s ✓ beside the edited field (after autosave settles), the header chips (rename, type, visibility, primary, recruiters, version) and the Add Section / Pick Template buttons. Undo toasts replace confirms for visibility (Private with no grants, organization on/off), primary (hands primary back; the page now passes `primaryResumeId`), recruiter links on, archive, template switch; confirms stay for delete, recruiter links off, Private with specific people, remove everyone, restore. `useLeaveGuard`: `beforeunload` + a confirm on client-side link clicks while unsaved. Tooltip pass: `@kiwiply/ui` `Tooltip` rebuilt (400 ms hover or keyboard focus, Esc, never on touch, portal so the rail's scroll box no longer clips it — that was the missing rail-strip tooltips) and applied to every icon-only control of the editor and the list (top bar, `RailStrip` incl. "AI Suggestions (4)", section/item controls and grips, mark toolbar, rename pencil, sheet ✕, chip ✕, card actions, view toggle, `KebabMenu`). Not built: a "Rename" action on the Ctrl+S toast (no version-rename endpoint). Web only; API untouched.
- 2026-10-12 · **rb4.1: `ResumeAiService` + `AiTruthChecks` (I3.2 shape) + new `AiTask`s + prompts-as-records + rewrite/summary endpoints + apply/dismiss** · The one checked-proposal service for the builder's Pro AI. `AiTask` gains `REWRITE/SUMMARY/SUGGEST/COVER/TRANSLATE` (`isResumeBuilder()`, not reachable via `fromWire`); `AiProvider.generate(.., maxOutputTokens)` (default method; Gemini applies it and asks for JSON for the builder tasks); `AiPolicy.models` keys documented in DEPLOY.md 10.1 + env wiring (`DOSSIER_AI_MODEL_REWRITE/SUMMARY/SUGGEST/COVER/TRANSLATE`). `service/ai/guard/AiTruthChecks` (`Violation(kind, token, sentence)`, `check(output, Sources, Profile)`, `flag`, `checkReason`; profiles REWRITE / SUMMARY / TAILOR / COVER / TRANSLATE) extracted from `ResumeTailorService.acceptable/numbers` (which now delegates; behaviour-identical TAILOR profile, tests moved) and extended: numbers normalised (`1,200` = `1.2k`, `[add a number]` allowed once per rewrite alternative), month+year dates, capitalised entities against the source with an alias file (`ai/tool-aliases.txt`) + Jaro-Winkler 0.92, hiring company / promises / identity claims, length caps from settings, `SensitivePatterns` on the output, instruction echo. `service/ai/prompts/Prompt` (I2.1 record shape) + `ResumePrompts` (`rewrite.bullets`, `summary.generate`, `resume.suggest`, `keywords.place`, `translate.doc`, `cover.letter`, all v1; the three invariants in every system prompt; `{{jd|untrusted}}` renders through `AiInputs.untrusted`). `AiInputs` is public and gains digest v2 (`resumeDigestV2`: refs by document id, basics reduced to the headline, hidden and marks stripped, `forModel` redaction + delimiter stripping). `service/ai/engines/ResumeAiService`: `rewrite(resumeId, refs, mode, consent)`, `summary(resumeId, tone, consent)`, `apply(pid, keep, alternatives)`, `dismiss(pid)`, `openProposals(resumeId)`; one private `callModel` = switch (`ai.feature.resume.enabled`) -> `AiBudgetService.decide` (402 `PRO_REQUIRED` for Free; override outranks the plan) -> consent -> cache (OPEN proposal, key `sha256(task|mode|promptVersion|contentHash|refs|jdHash|tone|language)`, served free even when the budget is spent) -> `ai.cap.resume.daily` (counted on `ai_call`, `quotaExceeded` + `cap: daily`) and `resume.rate.aiPerMin` (429 `RATE_LIMITED`) -> render -> `AiProvider.generate` (`ai.output_tokens_max.rewrite`) -> `AiMeteringService.record` for every call incl. the one JSON retry -> truth checks (violating alternative/change dropped, counters `ai.truth.checked/dropped{task}`; all dropped -> `nothingToChange`) -> `resume_ai_proposal` (ai_call_id kept, open ones trimmed to 200). `ResumeDocService.applyAiTexts` (text replaced by ref, marks cleared, `src: ai`, summary section created when missing, version rows: previous state kept + `AI_APPLY`, 409 `PROPOSAL_STALE`); apply also 409 `PROPOSAL_CLOSED`, 400 `KEEP_EMPTY/UNKNOWN_REF/BAD_ALTERNATIVE`, 422 `PLACEHOLDER_REMAINS`. `ResumeAiResource`: `POST /api/profile/resumes/{id}/ai/{rewrite,summary}`, `GET .../ai/proposals`, `POST /api/profile/ai/proposals/{pid}/{apply,dismiss}`. BFF: `app/api/resumes/[id]/ai/{rewrite,summary,proposals}`, `app/api/ai/proposals/[pid]/{apply,dismiss}` (+ `lib/resume-ai-proxy.ts`). Tests: api `AiTruthChecksTest` (17), `PromptInvariantsTest` (6), `ResumeAiServiceTest` (28), `ResumeAiResourceIT` (15), `GeminiAiProviderTest` (+2); web `ai.routes.test.ts` (9).
- 2026-10-12 · **rb2.2-ux: Swap Section panel shows item content and the canvas follows every move (user feedback, DECISIONS #31)** · `state/itemLabel.ts` is the one `itemLabel(kind, item, index)` -> `{primary, secondary, name, text, empty}` (title over company · dates, "Present", empty fields fall back to the next field, then muted-italic "Untitled role n"; unit-tested for every kind) behind the panel rows, `itemHeading` and so every canvas grip / menu / arrow `aria-label`. New `moveLink.ts` (module-level keyed store + `useLinkTarget`): hover / focus on a panel row rings the canvas item (`data-link`), focus / click / drag start scrolls it into view, and after ANY move (panel menu, drag, keyboard drag, canvas arrows, canvas menu, canvas drag; items and sections) the canvas item scrolls into view and flashes green 1.2 s with its panel row (`rb-flash` in `globals.css`, static outline under reduced motion); the move is announced by label (panel status line, drag live region via the new `SortableRoot` `groupLabel` / `onCarry`, canvas status line when the panel is closed). Drop announcement is now "Moved X to position n of m in Experience."

- 2026-10-12 · **fix: resume and account deletion remove every stored file (thumbs, originals, PDFs)** · Privacy (GDPR/CCPA gate). `StorageKeys` (now public) is the one inventory of what the API writes to `FileStorage`: `resumes/` (uploads + built PDFs, the resume's own slot), `resume-originals/` (`meta.originalFileKey`), `resume-photos/`, `resume-thumbs/` (R3.13) - all `<prefix>/<userId>/<resumeId>-...` - and `application-attachments/<userId>/<applicationId>-...`; `userPrefixes(userId)` / `resumePrefixes(userId, resumeId)` list them and the new `StoredFileEraser` lists-then-deletes each prefix (so a replaced or orphaned object nothing points at goes too). Single-resume delete (`ProfileService.deleteResume`, plus the admin-only raw `ResumeServiceImpl.delete`) and `ResumeBuilderDataService.deleteAllForUser` (first call of BOTH `AccountDeletionService` paths) run it before rows are removed, inside the deleting transaction, so a storage failure rolls back. Before this only `resume.r2ObjectKey` and application attachments were deleted: thumbnails, kept-aside originals and photos survived both a resume delete and an account delete. The key builders now use the `StorageKeys` constants. The synchronous export still marks READY without a thumbnail on purpose (only the PDF worker's browser can screenshot; DESIGN 8.10 asks for the thumbnail from the PDF job, not for READY to imply one). Tests: `StorageKeysTest` (4: every public prefix constant is in `userPrefixes`, builder keys fall under the inventory, eraser scoped to resume/user and not to resume 70 or another user), `AccountDeletionServiceIT` (both paths: nothing left under any user prefix, a stranger's file kept), `ResumePdfJobIT` (resume delete removes PDF, thumbnails incl. an orphan, original, photo; sibling kept).
- 2026-10-12 · **rb3.13: Card thumbnails from the PDF job (server PNG via `FileStorage`, cached by render hash) + template gallery `/resume-builder/templates`** · The PDF worker takes ONE `page.screenshot` of the first page right after `page.pdf()` in the same Chromium page (`printPdfWithThumb`: viewport = one page at 96 dpi, `deviceScaleFactor = width / pageWidth`, screen media so it looks like the editor; a failed shot yields no thumb and never fails the PDF) at the width Spring hands over on the claim (`ClaimedJob.thumbWidth` = setting `resume.thumb.width`), and posts it as the optional `thumb` part of `POST /api/internal/resumes/{id}/pdf`. Spring stores it (PNG magic + size checked) at `resume-thumbs/<userId>/<resumeId>-<renderHash>.png` through `FileStorage` only when the PDF itself was stored (a stale render discards both), deletes the old object, and writes `resume_doc.thumb_key` / `thumb_hash` by bulk update (the document version never moves). `GET /api/profile/resumes/{id}/thumbnail` (`ResumeThumbnailResource` / `ResumeThumbnailService`): owner only, ETag = render hash, 304 on `If-None-Match`, `Cache-Control: private, max-age=86400`, 404 when none / not yours / uploaded; BFF `GET /api/resumes/[id]/thumbnail` keeps ETag + cache headers. `ResumeDTO.thumbHash` on the list; the card shows `/thumbnail?v=<thumbHash>` (a new render is a new address), keeps the previous picture while the PDF is PENDING / RUNNING / STALE / FAILED, falls back to the template's static picture until the first one (or if it fails to load), and an uploaded file keeps its file tile. Gallery page: every ENABLED template (registry ∩ `resume.templates.enabled`, in the admin's order) with picture, name, description, capability chips from the RESOLVED capabilities (ATS Friendly · Photo · 2 columns · Bold only / Rich text / Plain text, so admin overrides show) and "Use this template" -> `/resume-builder?template=<id>`, where My Resumes opens the start chooser with that template preselected (cap checked first, parameter cleared, unknown id ignored); the Popular Templates "View all" is now a link (the last `DESIGN-PENDING (R-list)` marker is gone, `useSoon` deleted). Events `resume_template_gallery_viewed`, `resume_template_picked{id}`. Tests: `ResumePdfJobIT` (+6: width on the claim, stored under the hash and replaced, kept / bad PNG ignored, stale discards, served with ETag + 304 + 404s, list carries `thumbHash`, worker posts the part over HTTP), `pdf.test` (+5), `pdf-jobs.test` (+2), `ResumeCard.test` (5), `TemplateGallery.test` (8), `thumbnail.route.test` (4), `MyResumesPage` (+4), `adapter`; `rb-smoke` now asserts a real thumbnail after every READY (46/46 against Spring + MySQL + the Chromium sidecar: PNG on disk, ETag, 304, `thumbHash` in the list); browser-checked on that stack at 1440 and 375.
- 2026-10-12 · **rb3.12: Resume settings sheet — name / target / tags, primary, visibility (organization, people, links, activity), about, danger zone** · `ResumeSettingsSheet` is the third right-sheet view (`uiState.rightView: "settings"`, new reducer action `rightView/open`) per DESIGN 10.12: (1) Name (required, 200) / Target role (80) / Tags (10 x 24) over `PATCH …/meta`, debounced 500 ms, serialized, flushed on blur / close; (2) Primary switch (promotes; off is disabled with "Pick another resume as primary to turn this off"); (3) Visibility card with the computed summary ("Private — only you" / "Shared with 2 people · 1 link · your marketer Rahul"), My organization row (scope copy + Change sharing, and at FULL the "Include this resume" switch), People (list, + Add person by email with optional end date; 404 -> "They need a Kiwiply account — send them a link instead"), Links (hidden when `features.shareLinks` is off; create with label / end date / Allow PDF download defaults from the settings, address + Copy that announces "Link copied", PDF-download switch, Revoke confirms), Activity ("Viewed N times · last by …" + See all = `ViewsSheet` over `GET …/views`); (4) About (source line, created / modified with who, last PDF, live score, "Made by your marketer … · Approve" placeholder, Download original only when the original is kept); (5) Archive / Unarchive and Delete with confirms (the primary's 409 `PRIMARY_REQUIRED` and an application's 409 are said in words). Entry points wired: header ⋮ and every "Manage in Resume settings", `Alt+S`, the list card ⋮ "Settings" (`/resume-builder/<id>?view=settings`), phone Download menu and the Layout tab's fifth "Settings" segment (fullscreen). The header bar and the sheet share one metadata object (`syncedMeta` / `onMetaChange`), so a rename or a share shows in both at once. Dialogs and the views sheet are portalled out of the transformed sheet (`BodyPortal`). API: builder config `share` gained `maxGrants`, `linkDefaultDays`, `allowDownloadDefault`. Tests: `ResumeSettingsSheet.test.tsx` (30), `ui.test` / `headerBar.test` / `ResumeEditor.test` (+7) / `MyResumesPage.test`, config IT; browser-checked on the real stack (Spring + MySQL + web) at 1440 and 375.
- 2026-10-12 · **rb-integrate: overnight end-to-end proof (real MySQL + Chromium sidecar + Spring + web)** · `web/scripts/rb-smoke.mjs` now covers the overnight flow; **42/42 PASS** (PASS: account · sign in · clean slate · GET profile/version · POST built · GET doc+ETag · PUT edit If-Match · stale If-Match 409 · ProfileVersion moved · PATCH template · export PDF 200 · page count · r2ObjectKey · file on disk identical · exportedHash==renderHash + READY · [profile] create · edit+Save checkpoint · PDF READY + file in storage · cached PDF (x-resume-pdf-cached) + TXT · reload = saved content + READY · rename + primary via meta (PDF stays READY) · share link public page+pdf 200, 404 after revoke · [copy] create · edit+Save · READY + file · cached PDF+TXT · reload · delete · [scratch] create (empty) · edit+Save · READY + file · cached PDF+TXT · reload · delete · [upload] create (parsed structure) · attach original: meta.hasOriginal false->true + original downloads · edit+Save · READY + file · cached PDF+TXT · reload · Duplicate at the Free cap 402 RESUME_LIMIT · Duplicate after freeing a slot -> '(copy)'.) Browser walkthrough in a fresh in-app tab at 1440 on a production build (`next start`; `next dev`'s HMR websocket never hydrates in the pane): sign in -> My Resumes -> New resume -> all four sources (scratch, upload of a TXT fixture parsed to 1 role / 1 school / 5 skills, copy, profile) -> editor: name, headline, Summary + Experience via Add Section, bold (Ctrl+B), Swap Section (Experience above Summary), Pick Template spacing Spacious, score 21 -> 63, header rename + Set as primary, Save, PDF view shows the stored PDF (`?view=pdf` deep link also opens it), Save & Download PDF (`Walkthrough-Resume.pdf`), reload: everything persisted (docVersion 7, PDF READY, name, bold, order, spacing, primary); header ⋮ Download original (`Lin_Walkthrough_CV.txt`) and Duplicate (402 cap message at 3 live resumes). Bug found by the smoke: the R0 assertion `exportedHash == contentHash` predates R3.7 (the stored hash is the render hash now); the step asserts `exportedHash == renderHash` + `pdf.status == READY`. The list's legacy `pdfOutOfDate()` fallback (exportedHash vs contentHash) is only used when the API sends no `pdf` state.
- 2026-10-12 · **merge rb3.4 + rb1.6 (`451e137`, on `9ba5c24`) into resume-builder** · Landed after the gap commit at the coordinator's request. `ResumeDocService`/`ResumeDocResource` keep `setTheme`, `restore` AND R3.4's `TemplateThemeDefaults` template switch; the reducer's `EditAction` excludes `presentation/`, `server/` and `template/` actions; `themeEdit` imports both `clampStep` and `hiddenContent`/`hiddenNotice`; the `classic` ITs keep ONE fix (`enableTemplates("modern", "classic")`, the duplicate `enableClassic` helpers and calls were removed) and `ResumeDocResourceIT` gains R3.4's `@MockitoBean TemplateThemeDefaults`; the dashboard shows R1.4's `BuildProfileCard` (config `promptBelow`) and R1.6's `ProfileProgressCard`, which now takes the same `promptBelow` instead of the removed `SETUP_PROMPT_BELOW` constant (test updated to read the config default).
- 2026-10-12 · **rb-integrate: header menu Duplicate + Download original** · The header ⋮ now does what the list card does: **Duplicate** saves pending edits, calls `duplicateResume` (`POST /doc/duplicate`), opens the copy and says a plan cap (402) instead of hiding it; **Download original** appears when the new `ResumeMetaDTO.hasOriginal` is true (`ResumeDocService.hasOriginal`, from `meta.originalFileKey`) and fetches `GET /api/resumes/:id/original`. Tests: `ResumeSourcesIT` (hasOriginal false before / true after the file is attached), `ResumeHeaderBar.test` (3 new), mock API carries `hasOriginal`.
- 2026-10-12 · **merge rb3.10 (resume header bar, `9869b39`) into resume-builder** · Config DTO/service/web types now carry `list`, `pdf`, `share`, `versions` and `features.shareLinks` together (`resume-builder-config.ts` stays the re-export of the shared module); `ResumeDocService` keeps `setTheme` AND `restore`, `ResumeDocResource` keeps `PATCH /doc/theme` AND `POST /doc/versions/{n}/restore`; `ResumeEditor` renders `ResumeHeaderBar` in place of the interim name field, `ensureSaved` is the R3.3 `flushAll` (presentation + autosave), `adoptServerDoc` dispatches `server/replace`, the reducer excludes `server/*` from `applyEdit`; the list card menu is R2.6's (Open/Duplicate/Rename/Set as Primary/Archive/Delete; its exact-list test stands), so R3.10's "Settings…/Tailor to job… (Coming soon)" list entries were not carried (they live in the header ⋮) and its two Set-as-Primary list tests are ported to the `patchResumeMeta` seam; the mock API has one meta handler (R3.10's, with R2.6's PRIMARY_REQUIRED/archive rules folded in) next to R2.6's sources and R3.11's access mocks.
- 2026-10-12 · **merge rb2.6 (My Resumes + start chooser, `d946222`) and rb3.3 (PDF view + Save / Save & Download, `0d06ad5`) into resume-builder** · Config DTO/service/web types carry BOTH `list{quickTips,virtualizeAbove}` (R2.6) and `pdf{waitMs,viewAutoRefresh}` (R3.3) next to R1.4's wider `profile`; `ResumeFileResource` takes the settings AND `ResumeDocService`; the list keeps R2.6's page with R3.11's "Shared with me" tab and R2.5's score badge (green/amber, `data-score-badge`, built resumes only); the SideSheet `relative`->`absolute` overlay fix landed once (both tests kept); `ResumeEditor` keeps R2.5's tips + R3.3's `PdfView`/checkpoint hooks, and `?view=pdf` (R2.6) now opens the real PDF view (new test); the mock API serves the builder config with `list` + `pdf`.
- 2026-10-12 · **merge rb3.11 (Access control, `386c440`) into resume-builder** · Only `ResumeMetaResourceIT` conflicted: kept merge 6's coherent fix (`enableTemplates("modern", "classic")` + the single `@AfterEach` settings-cache invalidation) and dropped R3.11's duplicate `AppSettingRepository` / `ResumeBuilderSettings` fields, `dropSettingsCache` and inline enable. `master.xml` carries every changelog in timestamp order (`20261012060000` meta, `20261012070000` access, ...).
- 2026-10-12 · **rb3.10: Resume header bar — name + rename, Master/Tailored type menu, ⋮, Created/Modified, Visibility ▾, Primary, Shared with Recruiters ▾, Version ▾ + Compare** · `ResumeHeaderBar` replaces the interim "Resume name" input (the name is `resume.label`: rename = `PATCH meta`; the editor's `title/edit` is no longer used by the UI). Row 1 name + ✎ + type menu (children / Open master / Pull changes / Make this a master) + ⋮ in the DESIGN order; row 2 Created · Last modified (relative, absolute+by in the tooltip) · Visibility ▾ (People > Org > Private, confirm on Private) · Primary pill / Set as primary · Shared with Recruiters ▾ (On creates a link, Off confirms and revokes, Copy / Allow PDF download / Revoke / + Another link up to `share.maxLinks`) · Version ▾ (last 10, Compare, Restore with confirm, Save as version…, All versions). Responsive per 10.16 (short labels at 1024–1279, scrolling chips below, 390 px About in the ⋮). New `@kiwiply/ui` `Popover` + `DiffText`, `lib/diff.ts` word diff, `VersionCompareSheet` / `VersionsSheet` / `SyncDiffSheet`, BFF routes for lineage / detach / checkpoint / versions / restore / sync-master / link PATCH, reducer action `server/replace`. API: `POST …/doc/versions/{n}/restore`, `PATCH …/access/{id}` (`allowDownload`), config `features.shareLinks` + `share.maxLinks` + `versions.retentionAuto`. List card ⋮: real Set as Primary, plus Settings… / Tailor to job… (Coming soon). Tests: UI 426, web 472, ITs for restore / link PATCH / config.
- 2026-10-12 · **rb3.11: Access control — `resume_access` grants (people, links), public `/r/[token]` page + PDF, view audit, org FULL-pairing read, shared-with-me** · Additive Liquibase `20261012070000_resume_builder_access.xml` (`resume_access` incl. an `allow_download` column the design's DTO needs; `resume_view_event`; both FK-cascade with the resume). `ResumeAccessService`: `canRead`/`access` (owner → active USER grant → org FULL pairing, only through the optional `OrgResumeSharing` seam that the org area's `data_share` will implement; without it no org ever reads and the org row is hidden), `grantUser` (404 `USER_NOT_FOUND`, 409 `ALREADY_GRANTED`, 422 `ROLE_NOT_AVAILABLE`/`LIMIT`/`NOT_SHAREABLE`/`ACCESS_INVALID`/`SENSITIVE_CONTENT` on labels), `createLink` (403 `FEATURE_DISABLED`, 422 `LIMIT`), `revoke`, view recording (LINK viewers anonymous; org reads also call the seam's audit), `setRecruiterSharing`, `setVisibilityPrivate`. Endpoints: `…/access`, `…/access/link`, `…/access/{id}`, `…/views`, `shared-with-me`, `shared/{id}/doc|export`, public `GET /api/public/resumes/{token}` + `/pdf` (permitAll, per-visitor+token and per-visitor-miss rate limits from `resume.rate.publicPerMin`, `noindex`, `no-store`, same plain 404 for unknown/revoked/expired/feature-off, 409 `PDF_NOT_READY` unless the stored PDF is current). `ResumeMetaDTO.visibility`/`recruiterSharing` now real; `PATCH meta {visibility:"PRIVATE"}` and `{recruiterSharing}`. Nightly `ResumeViewEventPurgeJob` (`resume.views.retentionDays`); account deletion/export cover the new tables (export omits tokens). Web: RSC `/r/[token]` (read-only `ResumePreview`, noindex, Download only when allowed and the PDF is current), `/r/[token]/pdf`, `/resume-builder/shared/[id]`, "Shared with me" list tab, BFF `meta`/`access`/`access/link`/`access/[id]`/`views`/`shared-with-me`/`shared/[id]/doc|export`, `/r/` in robots.txt, mock-api access endpoints. Also fixed `ResumeMetaResourceIT.versionsListCarriesByAndKindNewestFirst` (needed the R2.8 template gate opened).
- 2026-10-12 · **merge rb2.2 (Swap Section panel, `f20222c`) into resume-builder** · `ResumeEditor` renders `<SwapSectionPanel doc caps dispatch>` next to the Add Section and Pick Template panels and passes `reorder={leftOpen && ui.leftPanel === "swap"}` to `DocumentCanvas` beside the `theme` prop; `SectionBlock` imports both R2.11's mark toolbar/scope and R2.2's `SortableGroup`/`SortableItem`. `npm ci` after the new `@dnd-kit` deps.
- 2026-10-12 · **rb2.2: Swap Section panel — `@dnd-kit` drag of sections and items (pointer/touch/keyboard), ↑ ↓ everywhere, canvas grips** · `panels/SwapSectionPanel.tsx` per DESIGN 10.3.3: Personal Information pinned first (disabled handle + "Your header always comes first"), one row per section (handle, kind icon, title, ⋮ Move up / Move down, chevron that opens its entries; Experience + Education open at first), entries with a right-side handle, greyed + undraggable rows for sections the template does not draw ("Hidden in this template"), green Tip box. New `common/SortableList.tsx` (`SortableRoot` / `SortableGroup` / `SortableRow` + the flat `SortableList`, reused by R1.3): mouse + touch + keyboard sensors, a drag restricted to its group (items never leave their section), top-left collision + a same-group keyboard coordinate getter (tall open sections move reliably), plain-English announcements ("Picked up Work Experience, position 3 of 9."), Escape cancels the drag without closing the sheet; drop dispatches the existing `section/move` / `item/move` (one history entry each, autosaved, undoable), button moves announce through a polite status line, events `resume_section_reordered` / `resume_item_reordered` `{via: drag|buttons}`. Canvas item rows get a grip while the panel is open (`CanvasReorder` / `SortableItem` / `itemGrip`, same `item/move`). `@kiwiply/ui`: `DragHandle` (grip button, 44 px on touch) + `InfoIcon`. Deps added to `web`: `@dnd-kit/core` 6.3.1, `@dnd-kit/sortable` 10.0.0, `@dnd-kit/utilities` 3.2.2. Tests: `SwapSectionPanel.test.tsx` (11), `SortableList.test.tsx` (2), `DragHandle.test.tsx` (2), reducer one-history-entry move test; web 354 + ui 409 green, build green.
- 2026-10-12 · **merge test fix `e0231ab` into resume-builder** · The template-switch ITs enable their templates explicitly and `ResumeMetaResourceIT`, `ResumePdfJobIT`, `ResumeDocResourceIT`, `ResumeBuilderConfigResourceIT` invalidate the settings cache `@AfterEach`, so they no longer depend on test order (`versionsListCarriesByAndKindNewestFirst` and `templateSwitchIsACheckpointWithNoSettleDelay` pass in the full `integrationTest` run).
- 2026-10-12 · **merge rb2.5 (Resume Score + Insights, `54d4143`) into resume-builder** · API: `ResumeDocService.applyScore` runs before `applyContent` in `put` (R3.9's `previousHash` / version recording untouched), `toDto` sets both R3.7's `renderHash`/`pdf` and R2.5's `score`; `ResumeDocRepository.BuiltMetaRow` + `findBuiltMetaByUserId` carry `themeJson` + `pdf*` + `score`; `ResumeDTO` has both `pdf` and `score` (list DTO, `ProfileService` sets both); `ResumeMapper.toDto` ignores both. Web: `ResumeEditor` keeps R3.7's `requestPdfNow` unmount/pagehide hooks, R3.8's Print layout and R2.12's Add Section next to R2.5's Insights/Tips (`goToTip` opens Add Section for `add:<KIND>` refs via `openAddFor`); the list `ResumeDto` gains `score` beside the R3.9/R3.7 fields and the adapter fills both `pdfState` and `score`. The score's `pages` input stays `null` (F4 passes): DESIGN 11.2 only says "measured page count" and R3.8 measures pages only while its view is open, so nothing is wired.
- 2026-10-12 · **rb2.5: Resume Score engine (score.ts, ruleset v1) + Insights tab (ring, band copy, checklist, View tips) + BFF persists the score** · `packages/ui/src/resume/score-rules.ts` (the DESIGN 11.3 rule table: ids, groups, default weights, tip copy, `ACTION_VERBS` >= 150, `CLICHES`, `DUTY`, `METRIC`, `DEFAULT_SCORE_CONFIG`) + `score.ts` `scoreResume(doc, ctx, config)` (six groups, weighted boolean rules, K5 n/a without a job, vacuous rules per the table, bands from settings, a `target.ref` + tip per rule, `failingRules`, `toPersistedScore`); the DESIGN 11.6 vectors hold exactly (empty 13, strong 100 on both profiles, mid 62, ATS-clean mid 66, job 95). `Meter variant="ring"` + `MascotCheer` in `@kiwiply/ui`. Web: `InsightsTab` (ring, band copy, one line per group incl. the ATS line on ATS templates, "View tips ->", "N of M ATS checks need attention", live region), `TipsSheet` (failing rules by group, "Go to" -> `goToField` or Add Section for a missing section), `useScoreReport` (debounced 150 ms), `RailCard`; `RightRail` takes the `insights` prop. BFF `PUT /api/resumes/[id]/doc` scores with the same function (stored template + theme, settings cached 60 s, optional body `pages`, a browser-sent `score` is dropped) and forwards `{doc, theme?, score}`; Spring stores `score_json`/`score` without evaluating (<= 4 KB, unknown ruleset ignored, malformed 422), `ResumeDocDTO.score`, `ResumeDTO.score`, the list card shows "N% score". Fixed `SideSheet` (a right-hand overlay sheet was parked at the left edge: `relative` vs `absolute`). Events `resume_score_viewed` / `resume_tips_opened`. Tests: ui 434+, web 375+, `ResumeDocResourceIT` +5.
- 2026-10-12 · **merge rb2.11 (MarkedTextarea + mark toolbar, `2fa7e81`) into resume-builder** · Auto-merged cleanly with the canvas (`DocumentCanvas` keeps R2.1-integration's `theme` prop, `SectionBlock` carries R2.11's `MarkScope` / toolbar mount, `BulletList` is the `MarkedTextarea` version); only the docs conflicted. Suites re-run green.
- 2026-10-12 · **rb2.11: `MarkedTextarea` + mark toolbar (B/I/U/•/1./🔗) — capability-aware, keyboard shortcuts, link popover** · The Summary and every bullet are now `MarkedTextarea`s (DESIGN 10.6, DECISIONS #1: two layers, no rich-text dependency): a mirror `<div>` draws `ResumeRichText` (the template's own `RichText`, new `verbatim` prop so the mirror lines up character for character) behind a transparent textarea; typing / paste / IME re-base marks with `shiftMarks` over the common prefix / suffix (the caret settles repeats such as `aa`, and deletions); Ctrl/Cmd+B / I / U / K act only for the marks `allowedMarks(caps)` allows (a disallowed key is left to the browser); bold in the mirror is a thickened stroke, not a wider face, so caret and wrapping stay exact. `MarkToolbar` (`role="toolbar"`, roving tab stop, arrow / Home / End) renders only `controlStates(...).toolbar` buttons (ATS_STRICT = B; DESIGN_FREE = all six; none = no bar), pressed from `isCovered`; • / 1. set the summary's `list` or the focused bullet's item `listStyle`; `LinkPopover` (URL input, Apply / Remove link, `^(https?://|mailto:)` via `isLinkHref`). `MarkScope` binds one toolbar to the focused field of a block: the Summary's lives in its header slot (`data-slot="mark-toolbar"`), an item's floats over its bullets while one has focus. A formatting change is its own undo step (`summary/edit` / `bullet/edit` take `format: true`, never coalesced). `@kiwiply/ui`: `BoldIcon` / `ItalicIcon` / `UnderlineIcon` / `ListOrderedIcon`, `clearMark` + `markAt`, `ResumeRichText` export. Tests: `MarkedTextarea.test.tsx`, `MarkToolbar.test.tsx`, `MarkFormatting.test.tsx`, `marks.test.ts` (+2 groups), `RichText.test.tsx` (+1); `npm test -w packages/ui` 412, `npm test -w web` 391, `npm run build -w web` green; browser-checked at 1440 / 375 against the mock API (ATS: bold only; design-free profile: six buttons, link, undo).
- 2026-10-12 · **merge rb2.12 (Add Section panel, `a4d7bbd`) into resume-builder** · `ResumeEditor` renders R2.12's `AddSectionPanel` (doc, caps, limits, dispatch, focusKind, `onAdded` closes an overlay/fullscreen sheet) next to R2.4's `PickTemplatePanel`; `ResumeEditor.test` drops the "Add Section arrives with R2.12" and "Pick Template arrives with R2.4" placeholder cases (both panels are real now).
- 2026-10-12 · **rb2.12: Add Section panel - Already added / Add to resume rows, Custom Section with title, capability states, mascot Pro tip** · `panels/AddSectionPanel.tsx` fills R2.10's shell per DESIGN 10.3.1: the board's eleven rows in order (icon tile from `KIND_META`; Personal Information is always "Already added"), each "Already added" / "+ Add to resume" / disabled with the reason from `controlStates(doc, caps).addSection` ("Not in this ATS template", "Limit reached (ATS)", plus "Section limit reached" from `config.limits.sections`). Add dispatches `section/add` with a fresh `s_` id (one history entry), then scrolls the canvas to the new block and focuses its first field (after the sheet's own focus handling); the row flips to Already added and a polite live region announces it; on overlay/fullscreen sheets (phone/tablet) it also closes the sheet so the new section shows. Custom Section expands an inline "Section name" field (Enter adds, Esc cancels): required, and `controls.customTitlePattern` is enforced when `caps.custom == "limited"` with the hint "Keep it a plain heading so ATS parsers recognise it". `focusKind` (the R2.10 hook) now focuses that row's button when the panel opens, once. Footer mascot card "Pro tip!" uses the board art `mascot-wave-laptop` via `AppArt` (no new SVG, so no `MascotCheer` doodle). `ResumeEditor` passes doc/caps/limits/dispatch; the placeholder test for Add Section became a real one. Tests: `AddSectionPanel.test.tsx` (17) + one editor integration test. Start from scratch (DECISIONS #29) already opens this panel via `useUiState({ openAdd })` on an empty document.
- 2026-10-12 · **merge rb3.8 (Print layout view, `3bd7cda`) into resume-builder** · `ResumeEditor` keeps R3.7's pdf hooks, R2.1's `DocumentCanvas` and R2.4's presentation and gains R3.8's `toggleView` / `PrintLayoutView` / `Alt+P`; the placeholder-blocks imports (`sectionTitle`) R3.8 still carried are dropped (the canvas replaced those blocks). `EditorTopBar` takes both `pdf`/`onPdfRetry` (R3.7) and `rightView`/`onToggleView`/`printLayout` (R3.8).
- 2026-10-12 · **rb3.8: Print layout view — right side-nav with client-side pagination, page boxes, over-target banner + Fit to one page, Print button with print stylesheet** · `views/PrintLayoutView.tsx` in the right `SideSheet` (`uiState.rightView="print"`): the document renders once in page 1, `lib/paginate.ts` (`paginate(contentHeightPx, theme, caps)` over `fit.ts#pageCount`) gives N clipped page boxes ("Page i of N", dashed breaks, margin guides, hidden-content chips on top), footer Download PDF · Print · page count · template name; banner "Over 1 page - Compact spacing or shorter bullets will fit it" when pages > Page Length capped by `maxPages`, **Fit to one page** runs `fitToPages` over off-screen renders (`lib/fitLadder.tsx`) and stores the rung via a new `fit` theme change (PATCH /doc/theme), ladder end shows "Still N pages - hide a section or shorten bullets" + the three longest items (`lib/longestItems.ts`). Print = `lib/printResume.ts` (`#rb-print-root` portal under body, `body[data-rb-printing]`, cleared on `afterprint`) + `packages/ui/styles/resume-print.css`. Download menu enables Print layout (aria-pressed on the button, `Alt+P`, feature `printLayout`), PDF view stays disabled until R3.3; phone Preview tab hosts it with zoom buttons + pinch. `PrinterIcon` + `MinusIcon` in `@kiwiply/ui`; `SideSheet` skips `inert` subtrees for first focus. Tests: paginate, longestItems, PrintLayoutView (10), ResumeEditor right-sheet (8), EditorTopBar, themeEdit, SideSheet; `npm test -w packages/ui` 407, `npm test -w web` 359 + build green; browser-checked at 1440 / 1280 / 375.
- 2026-10-12 · **merge rb2.1 + rb2.4 (Pick Template + Document canvas, `9ba5c24`) into resume-builder** · Config conflict: R2.1 split the builder config into `resume-builder-config.shared.ts` (client-safe types + defaults, re-exported by the server-only `resume-builder-config.ts`); the cleanup's `profile.*` fields (`bioValueMaxChars`, `bioSummaryMaxChars`, `setupPromptBelowPercent`, `uploadMaxBytes`) moved into `.shared`'s type + defaults.
- 2026-10-12 · **rb3.3: PDF view pane + Download ▾ (Save & Download PDF/TXT, cached export) + Save button wired to checkpoints + mobile fallback** · `views/PdfView.tsx` in the right `SideSheet` (Alt+V / Download ▾ → PDF view, segmented with Print layout when both `features.printLayout` and `features.pdfView` are on): flushes the autosave, asks `GET /export?format=pdf&cached=1` (the stored PDF when current, else a synchronous render that also stores it), shows it in `<iframe title="PDF preview">` from a Blob URL (mounted after the sheet's slide: Chromium's viewer paints black when framed mid-transform); states loading / generating / ready / error (503 `PDF_BUSY` copy + Retry) and a derived **stale** ("Document changed since this PDF · Refresh", by identity of doc / theme / template; `resume.pdf.viewAutoRefresh` re-makes it after a typing pause); Download saves the shown blob; `navigator.pdfViewerEnabled === false` → "Open PDF" / "Download"; "How an ATS sees it" tab = placeholder (R3.6). **Save** (top bar, `Ctrl/⌘+S`): flush → BFF `POST /api/resumes/[id]/doc/checkpoint {name?}` (R3.9, queues the PDF at once) → button "Saved" for 2 s, status "Saved just now · PDF updating…" (`usePdfStatus.follow`); reads Save only while something changed since the last checkpoint or the stored PDF is NONE / FAILED / STALE, else "Saved" disabled; Save ▾ → **Save as version…** name prompt (≤ 80). Download ▾: Print layout · PDF view · **Save & Download PDF** (checkpoint → `waitForStoredPdf` ≤ `resume.pdf.waitMs`, polling at the server's `pollMs` → stored download, else the sync export) · **Save & Download plain text** · Save & Download DOCX (soon, R7.3); a view footer's "Download PDF" stays a plain flush + export (no version). API: `GET …/resume-builder/config` gains `pdf {waitMs, viewAutoRefresh}`. Fixes: the phone Preview tab respected only one of the two feature switches (now: first enabled view; no tab when both are off), and `SideSheet` overlay mode had `relative` beating `absolute` (the overlay sat at the left edge instead of its own side). Analytics `resume_pdf_view_opened{status}`, `resume_download{format, cached}`. Tests: `PdfView.test.tsx` (13), `ResumeEditor.test.tsx` (+17), `EditorTopBar.test.tsx`, `resume-doc.test.ts` (checkpointDoc, waitForStoredPdf), `usePdfStatus.test.tsx`, checkpoint route test, `SideSheet.test.tsx`, `ResumeBuilderConfigResourceIT`; web 581, ui 423, full API suite green; **browser-checked against real Spring + MySQL + local Edge** at 1440 / 375 (edit → Save → "PDF updating…" → READY → PDF view shows the stored PDF → edit → stale → Refresh; Save & Download PDF and TXT; reload keeps content and PDF state).
- 2026-10-12 · **rb1.6: Headline + summary on the profile; provenance chips everywhere; dashboard hook** · `BioEditor`'s Identity section gains **Headline** (60 chars, `LIMITS.headline`) and **Summary** (textarea, cap = the builder setting `limits.summaryChars`, 2000 by default, with a live counter); both are plain bio keys saved through the profile PUT (stamped `user`) and scanned with the shared SensitivePatterns before saving (a refused value shows the message and keeps the saved one). `SourceChip` beside every bio field that has a recorded source (a value edited but not yet saved reads "You added"); the sources come from the new `GET /api/profile/provenance` (`ProfileItemService.bioProvenance`, `ProfileMeta.provenanceOf`) - kept off `GET /api/profile`, which the extension reads and which must never carry `meta_json` (`metaJsonNeverReachesTheExtension`). Dashboard: `ProfileProgressCard` "Profile 62% — next: Write a short summary" -> the tab where it is done (above 40 %, below it the R1.4 setup card stays; the suggestions card is unchanged).
- 2026-10-12 · **rb3.4: Template switch safety net — server applies `meta.defaults` to untouched theme keys, TEMPLATE_SWITCH row, undo restores template + theme, what-changes toast** · `PATCH …/doc/template {templateId, theme?}`: `ResumeDocService.setTemplate` applies the new template's theme defaults to every key not in `theme._touched` (`TemplateThemeDefaults.apply`, the Java twin of `themeAfterSwitch`; per-template entries in `TemplateThemeDefaults.BUILT_IN`, parity with the TS `meta.defaults` pinned by the shared fixture `template-defaults.json`), returns the stored theme, writes the TEMPLATE_SWITCH row (template + theme after the change) and queues the PDF with no settle delay; an explicit `theme` in the body is stored verbatim (the editor's undo/redo). Editor: reducer `template/switch` / `template/undo` / `template/forget` + `templateUndo`/`templateRedo` stacks anchored on the document snapshot, so `history/undo` (Ctrl/Cmd+Z, menus, toasts) undoes typing first, then the switch, restoring template AND theme; `usePresentation` PATCHes only the template on a switch (no second theme PATCH), adopts the server's theme, saves the restored pair on undo/redo; the switch toast says what the template hides AND which theme keys it defaulted, with an Undo action; the Pick Template card's "Hides: …" line and the toast come from one function (`previewSwitch`). The settings cache is dropped after each `ResumeDocResourceIT` test and the two classic-template ITs enable classic themselves (they were order-dependent).
- 2026-10-12 · **rb2.1: Document canvas — header block, every section kind, item rows, reducer actions (basics/section/item/skills/move), empty states** · The centre of the editor is the board's document: `DocumentCanvas` (editor skin, `controlStates(doc, caps)` decides the photo slot / rename / toolbar buttons, a focus-after-render queue, 422 error ring) over `HeaderBlock` (name, headline, contact row with `MapPinIcon`/`PhoneIcon`/`MailIcon`, link rows with `LinkedInIcon`/`GlobeIcon`/`LinkIcon`, "+ Add link" <= 8, photo slot only when `caps.photo` = disabled "Add photo - Coming soon"), `SectionBlock` (kind icon tile, uppercase heading, rename only when `caps.headings == "free"` (CUSTOM always), `+ Add <thing>`, up/down, the menu (Rename / Hide / Undo / Redo / Delete section), trash with an "Undo" toast, Summary toolbar slot + disabled "Rewrite with AI" stub, hidden section = collapsed header with Show), `ItemRow` (EXPERIENCE / CUSTOM / EDUCATION / PROJECTS timeline rows with dates, location, Present, bullets; compact CERTIFICATIONS / LANGUAGES / ACHIEVEMENTS / INTERESTS rows; controls Edit, Down, the menu Move up / Move down / Duplicate / Hide / Delete, trash; hidden item = "Hidden - Show"; empty-section placeholder adds an item on first focus, not on render), `SkillsRow` (group + `ChipInput` <= 40), `BulletList` (Enter / Backspace / Ctrl+Arrow), `DateField` (shows "Mar 2022", accepts how people write it, only valid values reach the doc). Reducer (`state/reducer.ts`, `types.ts`): `basics/field`, `basics/link.*`, `section/{add,remove,hide,rename,move}`, `item/{add (kind-aware),duplicate,hide,move,field (every kind)}`, `skills/*`, `bullet/move`, `list/set`, `text/replace`; limits come from `config.limits` carried in the state (the two `config-literal-ok` escapes for `MAX_BULLET_CHARS` / `MAX_SUMMARY_CHARS` are gone: the defaults read `DEFAULT_BUILDER_CONFIG.limits`); marks follow text edits (re-based on edit, split across Enter, joined on Backspace-merge) so a typed-into bullet never yields a mark past its text; `state/paths.ts` maps a 422 `path` to a field id, `ResumeEditor` toasts "Couldn't save: ..." and the field gets `aria-invalid` until the next edit (`autosave` `onFailed(message, path)`). `@kiwiply/ui`: `PhoneIcon`, `ArrowUpIcon`, `ArrowDownIcon`, `ChipInput` gets the `aria-describedby` "n of max" count. `resume-builder-config.ts` split: types + `DEFAULT_BUILDER_CONFIG` live in `resume-builder-config.shared.ts` (client-safe, re-exported), `getBuilderConfig` stays server-only. `SectionEditor` (+ test) replaced by the canvas; the mock API's resume 3 now has every section kind. Tests: `reducer.canvas.test.ts`, `paths.test.ts`, `dates.test.ts`, `DocumentCanvas.test.tsx`, `SectionBlock.test.tsx`, `ItemRow.test.tsx`, `ResumeEditor.test.tsx` (+2), `ChipInput.test.tsx` (+1); `npm test -w packages/ui` 407, `npm test -w web` 340, `npm run build -w web` green; browser-checked at 1440 / 1280 / 375 against the boards.
- 2026-10-12 · **rb2.6: "My Resumes" page to the board + "New resume" start chooser (four sources) + source/import/duplicate/original endpoints** · API: `POST /api/profile/resumes/built` takes `source` (`profile` default · `scratch` = header from bio only · `upload {structured, bio?, fileName, keep?}` via `ResumeDocumentSeeder.fromStructured` (user's bio wins) with a per-kept-entry `SensitiveContent` scan -> 422 `SENSITIVE_CONTENT {path}` naming `structured.experience[i]` · `copy {fromResumeId}` via new `ResumeDocumentIds.regenerate`, `source_kind=COPY`, `parent_resume_id`, "<from> (copy)", theme/template kept, no target, photo bytes copied to a new key; a source with no document (an uploaded file) is built from its parsed structure); the plan cap is checked FIRST (`ProfileService.assertCanCreateResume`, 402 before any parse/scan/copy); `POST .../doc/duplicate` (= copy), `POST .../doc/import` (uploaded -> built in place, `source_kind=IMPORT`, 409 `ALREADY_BUILT`, original copied to `resume-originals/...` so the PDF job cannot delete it), `GET .../original`, `ResumeFileResource` stores the first file of an UPLOAD/IMPORT built resume under `resume-originals/` and sets `meta.originalFileKey` (`ResumeDocService.noteOriginalFile`; a content PUT can never set or drop that key); the builder config gains `templates.popular` + `list {quickTips, virtualizeAbove}`. Web: `NewResumeSheet` (Dialog / fullscreen SideSheet; four radio cards, upload drop zone + consent + review counts + KeepMask checklist + redaction line, copy list, "Name it" step with the template line; Create -> editor; the original is attached BEFORE the editor opens), `new-resume/model.ts`, `lib/profile-setup/parse.ts#parseFileForResume`, `lib/resume-list-api.ts`, BFF `doc/duplicate`, `doc/import`, `meta` (GET/PATCH), `original`, `file` (POST); My Resumes: cap check before the chooser, status menu (Status + Type groups), sorts + Score / Last Exported, score badge (optional field, R2.5), target / Tailored tags, real duplicate / view (`?view=pdf`) / AI (`?tab=ai`, Free = lock to /pricing) / rename / set primary / archive / unarchive / delete, template strip = registry ∩ enabled in popular order -> chooser with the template preselected, Quick Tips from settings, empty state with the four sources, a page at a time above `virtualizeAbove`, 390 px Filters sheet; editor reads `?view` / `?tab`. Mock API serves all of it (`MOCK_RESUME_LIMIT`). Removed every `DESIGN-PENDING (R-list)` marker except the template gallery's "View all" (R3.13). Tests: api `ResumeSourcesIT` (18), `ResumeDocumentIdsTest` (3), `ResumeDocumentSeederFromStructuredTest` (4), config IT; web `NewResumeSheet` 21, `MyResumesPage` 43, `model` 14, `resume-list-api`, `BottomCards`, parse, createBuilt; browser-checked on the mock at 1440 / 1024 / 375 (all four sources create a resume and open the editor; scratch opens Add Section).
- 2026-10-12 · **merge rb2.1 (Document canvas) into resume-builder** · The `ResumeEditor` placeholder card is now `<DocumentCanvas>`; it takes the stored theme (`theme` prop) and carries R2.4's presentation on its root: `canvasThemeStyle` gives `--rb-doc-accent` (section headings), `--rb-doc-font-*` (re-pointed at the app's `--font-body` / `--font-display` tokens, so every canvas field follows the font pair) and the new `--rb-doc-density` (Spacing + fit ladder scale the canvas rhythm); `HiddenContentBar`, `usePresentation`, R3.7's pdf hooks and R2.1's `errorField`/limits all live in `ResumeEditor`. Reducer: R2.4's `presentation/*` actions are excluded from R2.1's `EditAction`.
- 2026-10-12 · **merge rb2.4 (Pick Template + Customize) into resume-builder** · `ResumeDocService.setTheme` now also stamps `updatedByLogin` (R3.9) and calls `markPdfPending(d, false)` (R3.7: a theme change changes the render hash, so it settles like a content save; no version row); the editor feeds a saved template/theme PATCH into `usePdfStatus` so "PDF updating…" follows it. New `ResumePdfJobIT` + `ResumeEditor` tests for it.
- 2026-10-12 · **rb2.4: Pick Template panel + Customize Template (accent · font · spacing · page length) + `PATCH /doc/theme` + hidden-content notice + live thumbnails** · API: `PATCH /api/profile/resumes/{id}/doc/theme {theme}` (`ResumeDocService.setTheme`, `ResumeThemeValidator` = the `sanitizeTheme` twin: bounded fields only, known keys re-written in a fixed order, unknown keys dropped, derived `size`/`density`/`margin` discarded, <= 8 KB, 422 `THEME_INVALID {path,message}`; no `If-Match`, bumps `doc_version` -> ETag, no version row, ProfileVersion unchanged). Web: BFF `app/api/resumes/[id]/doc/theme/route.ts`; `lib/resume-doc.ts` `patchTemplate` / `patchTheme` (tagged `PatchResult`); `panels/PickTemplatePanel.tsx` (cards from `config.templates.enabled`, any number, the active one always shown; `TemplateCard` draws the user's own document through each template via `PageFrame` max scale 0.22, `Selected` / `ATS Friendly` chips from the resolved capabilities, `Hides: ...` line from `hiddenContent()` before the switch; Customize Template: Accent swatches from `config.theme.accentPalette` (disabled + hint per `controlStates`), Font Family `Select` of the allowed pairs only, Spacing + Page Length `ChoiceGroup` (Two Pages only when `maxPages == 2`), Date style when both are allowed); `HiddenContentBar.tsx` (chips + Why? tooltips under the section tabs); `usePresentation` + `state/presentation.ts` (optimistic, serialised PATCHes, theme debounced 500 ms and coalesced, rollback + toast on refusal, hidden-content toast + `resume_template_switched` / `resume_theme_changed` events); autosave gains `hold()` / `release(version)` so a content PUT never carries the version a PATCH just bumped; reducer `presentation/set|version`; the placeholder canvas follows the allowed accent / font (`canvasThemeStyle`, until R2.1); mock API serves the theme PATCH. Decisions: see the rb2.4 commit message. Tests: api `ResumeThemeValidatorTest` (21) + `ResumeDocResourceIT` (34, +2 theme tests, +1 ownership assertion); web unit 323 + 3 skipped (new: `PickTemplatePanel` 15, `HiddenContentBar` 5, `themeEdit` 12, `presentation` 7, theme route 4, `resume-doc` patch 4, autosave hold 4, reducer 4, editor integration 6); ui 406; `npm run build -w web` green; browser-checked on the mock at 1440 / 1280 (rail collapses) / 375. No extension change.
- 2026-10-12 · **rb1.5: Onboarding — "Start fresh" guided flow** · `PathPicker`'s Start fresh is on (`freshEnabled`/`onFresh`, `?path=fresh` opens it). `FreshFlow` (`components/app-v3/profiles/setup/`) is one question per screen with one labelled answer and a visible Next, in DESIGN v1 2.3 order: what are you looking for (chips) -> headline (starters per goal) -> add a job or a school (study first for an internship / first job) -> role: title, company, start, end (+ "I still work here"), What / How / Result (each answer is a bullet) or school: name, degree, start, end -> "Add another?" -> skills (`ChipInput` + suggestions from the headline and role titles) -> links -> lands on the SAME `ReviewCards` (marked "You added"), skills, identity (headline + links prefilled), preferences, finish. The state machine, validation and draft builder are pure in `lib/profile-setup/fresh.ts` (Back keeps answers; each answer is checked for never-collected values, required fields, date shape/order, and the configured limits - short answers use `profile.bio.valueMaxChars`, bullets `limits.bulletChars`); `SetupState.fresh` keeps the answers so Back from the review and a reload return to them. Everything it imports is `USER` provenance (`keptItems`/`skillItems`/`languageItems` take the base provenance), headline + links are written through the profile PUT as the person's own, never as `parsed`. `profile-options.ts` gains `FRESH_GOALS`, `HEADLINE_SUGGESTIONS`, `SKILL_FAMILIES` + `suggestSkills()` (headline -> skill chips). `headline` joins the identity keys + the identity card. New `@kiwiply/ui` `MonthPicker` (+ `isMonthValue`). Tests: fresh state machine 19, FreshFlow 6 (a11y: every step has a named control + Next), ProfileSetup +2, profile-options 5, MonthPicker 5; `npm test -w web` + `-w packages/ui` + build green; browser-checked against the mock API at 1440 and 375 (no horizontal overflow).
- 2026-10-12 · **rb-config-cleanup: remaining hard-coded limits to the settings seam** · Four new `ResumeBuilderSettingKeys` (DESIGN 15.2 table + parity test): `profile.bio.valueMaxChars` (500, 50-2000) and `profile.bio.summaryMaxChars` (2000, 200-10000) replace `ProfileItemService.MAX_BIO_VALUE/SUMMARY` and the web twins in `lib/profile-setup/draft.ts` (now a `BioLimits` argument to `toDraft` / `planIdentity` / `parse*ForSetup`); `profile.setup.promptBelowPercent` (40, 0-100) replaces `SETUP_PROMPT_BELOW` (`BuildProfileCard` takes `promptBelow`, the dashboard reads it from the builder config); `profile.upload.maxBytes` (10485760, 1 MB-10 MB, the multipart transport ceiling) replaces the 10 MB constants in `UploadStep` and the `/api/resumes/upload` BFF route and is now also enforced by `ResumeFileResource` (413). All four ride `GET /api/profile/resume-builder/config` as `profile.{bioValueMaxChars,bioSummaryMaxChars,setupPromptBelowPercent,uploadMaxBytes}` (`ResumeBuilderConfigDTO.Profile`, `ResumeBuilderConfig`, `DEFAULT_BUILDER_CONFIG`). New `lib/format-bytes.ts` for the "max 10 MB" copy. Tests: `ProfileItemResourceIT.theBioValueCapsComeFromTheSettings`, `ResumeFileResourceIT.theUploadSizeCapComesFromTheSetting`, config IT + web default test extended, a configured-limits clipping test, `format-bytes`; `npm test -w web` 319, ui 417, API `test` 657 + `integrationTest` 563 green.
- 2026-10-12 · **merge rb3.7 (async PDF pipeline) into resume-builder** · Ported R3.7 onto the R2.10 top bar/editor (`pdf`/`onPdfRetry`, `usePdfStatus`, unmount + `pagehide` `requestPdfNow`), R3.9's list DTO/adapter (adapter prefers `pdf.status`), `export` route serves `?format=txt` (R2.10) and `?format=pdf&cached=1` (R3.7); `ResumeMetaService.checkpoint` now queues the PDF immediately and `ResumeMetaDTO.pdf` is the real pipeline status; both Liquibase changelogs in order.
- 2026-10-12 · **rb3.9: Resume metadata model — name truth flip, created/updated by, target/tags, exactly-one primary, role + lineage columns, meta endpoints, checkpoint endpoint** · Additive Liquibase `20261012060000_resume_builder_meta.xml` (`resume` + `created_by_login` backfilled to the owner, `updated_by_login`, `target` (backfilled from `doc.meta.target`), `tags_json`, `share_with_org` default true, `role` default MASTER, `ix_resume_user_primary`; `resume_doc_version.created_by_login`). `resume.label` is now the name's truth: `ResumeDocService` mirrors `meta.title`/`meta.target` from the resume on every write (a client PUT cannot rename; it is overwritten), R0.3's label<-title sync is gone; `updated_by_login` stamped on doc/template/file/legacy-update/meta writes. `ProfileService.ensurePrimary` keeps exactly one `is_default` among non-archived resumes (create, archive/unarchive, delete, primary change); deleting a master detaches its tailored children (`ResumeLineageService`). `ResumeMetaResource`: `GET/PATCH …/meta` (name ≤ 200, target ≤ 80, tags ≤ 10 × 24 lower-cased deduped, 409 `PRIMARY_REQUIRED`, 422 `META_INVALID`), `GET …/lineage`, `POST …/detach` (409 `NOT_TAILORED`), `POST …/doc/checkpoint {name?}` (MANUAL/NAMED), `GET …/doc/versions` (rows with `by`/`kind`), `GET …/doc/versions/{n}/text`. New `ResumeDocVersionService` writes the version history DESIGN 8.2 specifies (creation snapshot, coalesced AUTOSAVE rows via `resume.versions.coalesceMinutes`, TEMPLATE_SWITCH, retention `resume.versions.retentionAuto`). List DTO (`/api/profile/resumes`) now carries `updatedAt`, `primary`, `target`, `tags`, `role`, `lifecycle` (derived ARCHIVED/DRAFT/ACTIVE), `createdBy`/`updatedBy`, `shareWithOrg`; `ProfileVersion` unchanged (tags/target/created_by/role do not move it; rename/primary do). Web: the My Resumes adapter reads `lifecycle` (Draft tab fills), `primary`, `updatedAt`, real `tags` and `target` (searchable); the kind-chip fallback remains only for an API without `tags`. Still `DESIGN-PENDING (R-list)`: card menu actions (BFF `/api/resumes/[id]/meta` + wiring), duplicate/view/AI, start chooser, template gallery. PDF immediate-on-checkpoint is a marked hook for R3.7. Tests: `ResumeMetaResourceIT` (31), unit `ResumeTagsTest`/`ResumeLifecycleTest`/`ResumeMetaMirrorTest`/`ResumeDocVersionPolicyTest`, `ProfileVersionTest` +3, `ResumeDocResourceIT` label/target mirror, web `adapter.test.ts`/`MyResumesPage.test.tsx` extended.
- 2026-10-12 · **rb2.10: Editor shell to the boards — full-bleed layout, top bar (actions, Save, Download ▾, status copy), section tabs, left/right `SideSheet` wiring, right rail tabs** · `/resume-builder/<id>` is full-bleed (`AppShell` steps aside via `isEditorPath`; `[id]/layout.tsx` + `loading.tsx`; `page.tsx` fetches doc, builder config, AI usage line, `profileUpdatedAt` in parallel, job target/proposals empty). `EditorTopBar` rebuilt (logo, "Resume Builder", `statusLabel` v2 copy, four `aria-pressed` panel toggles with the green active state, disabled Save stub, Download ▾ `Menu`: Print layout / PDF view / DOCX disabled "Coming soon", PDF, plain text via new BFF `GET /api/resumes/[id]/export?format=txt`; ✕ with the unsaved guard; Alt+1..4 / Alt+D; undo/redo off the bar). `ResumeEditor` rewired onto `useUiState` + both `SideSheet`s (panel shells `AddSection`/`PickTemplate`/`SwapSection`/`TailorPanel`), `SectionTabs` (nav + `UnderlineTabs`, scroll-spy, More ▾), `RightRail` (`Tabs variant="underline"`, new in `@kiwiply/ui`) + **rail collapse (#28)**: `computeLayout` adds `railCollapsed` (left sheet pushes beside a 56 px `RailStrip` from 1024 up; `rail/expand` action), phone bottom tab bar + tablet Insights bar + `history.pushState` Back handling. `SwapIcon` added to `@kiwiply/ui`. `SectionsRail` removed; `PreviewPane` kept for R3.8. Tests: EditorTopBar, ResumeEditor (panels, rail collapse, phone, downloads), SectionTabs, useBuilderLayout (4 named rail-collapse tests), ui.test, export-txt.route, ui Tabs; `npm test -w packages/ui` 299, `npm test -w web` 266 + build green; browser-checked at 1440/1280/1024/768/375 against the boards.
- 2026-10-12 · **rb2.8: template capability model** · `TemplateCapabilities` (DESIGN 6.2) in `packages/ui` `types.ts` + `capabilities.ts` (`ATS_STRICT` / `DESIGN_FREE`, `isAtLeastAsStrictAs`, `tightenCapabilities`, `planSections`, `hiddenContent` + `hiddenNotice`, `controlStates` for the 6.4 matrix, `allowedMarks`); `TemplateMeta.capabilities` replaces `atsSafe`/`supports` (registry test enforces); `resolveCapabilities(id, overrides)` in `registry.ts` (tighten-only, `console.warn` once, `ats` demote-only); the shared renderer applies the profile (marks filtered, sections/custom limit, standard headings, skill-group collapse, summary list / numbered bullets, `Photo` slot, `date` style, `themeCss(theme, caps)` ink accent + allowed font) and `ResumePreview` takes `caps` + `photoSrc`; Theme v2 (`spacing` presets, `showPhoto`, `FIT_LADDER` as deltas, `sanitizeTheme` maps v1 sliders, `ibm-plex` removed); Modern re-declared as `ATS_STRICT` (so it now draws ink instead of the accent, bold only, standard headings, range dates); test-only `templates/__test__/designFree.tsx`; Java `TemplateCapabilities` record + `ResumeDocService` gates create/PATCH template by `resume.templates.enabled` (422 for disabled) and starts from `resume.templates.default`; README rewritten. Tests: `capabilities.test.ts` (golden parity with Java, strictness, tighten-only, DESIGN 6.6 hidden-content + control-state vectors), `designFree.test.tsx` (render vectors x both profiles), `registry.test.ts`, `theme.test.ts`, `fit.test.ts` (seven v1 triples), `TemplateCapabilitiesTest`, `ResumeDocResourceIT` (disabled template 422, configured default).
- 2026-10-12 · **rb1.4: Onboarding wizard — `/profiles/setup` path picker, Upload + Paste steps, card-by-card review, finish** · New route `web/src/app/(app)/profiles/setup/page.tsx` (loads the flat bio + builder config; `?path=upload|paste` opens an input) → `ProfileSetup` (`components/app-v3/profiles/setup/`): `PathPicker` (3 cards; Start fresh shows "Coming soon" until R1.5), `UploadStep` / `PasteStep` (reuse the `parseResumeWithAi` / heuristic pipeline and the `ResumeUpload` consent checkbox + stored choice), `ReviewCards` (Keep / Edit via the existing `ItemForm` / Skip, `SwipeCard` gestures on touch, arrow keys + buttons always, recap), `SkillsStep` (chip cloud + suggestions + languages), `IdentityStep` (prefilled from `ParsedBio`; the profile's own value is kept and the card asks before the resume's replaces it), `PreferencesStep` (the unanswered `/welcome` questions; `Onboarding` now shares `onboarding/preferences.tsx`), `FinishStep` (meter + `nextAction` + one `ConfettiBurst`, none under reduced motion). Nothing persists until Finish: one `POST /api/profile/items/import` then one `PUT /api/profile` (preferences, typed identity, `onboardedAt`); a failed PUT retries without importing twice; the draft (parsed content only) lives in `sessionStorage` and is offered back. Never-collected values: the extracted / pasted text goes through `scanSensitive`/`redactSensitive` BEFORE parsing (`lib/profile-setup/sensitive.ts`), the original PDF is never sent to the AI parser (`parseResumeWithAi(file, {prepareText, textOnly})`; `parseTextWithAi`; `parseText`), parsed strings are cleaned a second time, and the review + finish say "we removed N sensitive values - we never collect those". New `@kiwiply/ui` primitives `Stepper`, `SwipeCard`, `ConfettiBurst`. Entry points: dashboard `BuildProfileCard` (profile < 40 %), `/profiles` empty states (Experience / Education / Projects link to the setup), `/profiles/setup` itself. Analytics `profile_setup_started|step|parsed|completed` (counts only). Tests: web 255 (+51: draft/import/state/sensitive 24, parse 6, `ReviewCards` 7, `ProfileSetup` 6, input steps 6, card 2), ui 415 (+11), tsc/eslint/build green; browser-checked against the mock API at 1440 and 375.
- 2026-10-12 · **rb2.0-fix: scope the no-literal rule instead of exempting files** · `web/eslint.config.mjs` no longer exempts files: the inline-`<svg>` ban applies to every file again (the builder block now sets only the new rule `resume-builder/no-config-literal`, so it no longer replaces `no-restricted-syntax`); the no-literal rule is a local inline rule (no dependency) that flags a numeric literal >= 100 in `components/app-v3/resume-builder/**` (tests excluded) unless the line, or the line above, carries `// config-literal-ok: <reason>` (empty reason does not count). The 20 literals that tripped it each got a reason (layout/art sizes, unit conversions, schema constants, editor-local autosave/undo constants without a DESIGN 15.2 key); `MAX_BULLET_CHARS`/`MAX_SUMMARY_CHARS` mirror `resume.doc.limits.*` and are marked as such, live-config threading into the reducer is R2.1 ("limits clamp").
- 2026-10-12 · **rb1.2: `/profiles` hub — real tabs: Experience, Education, Skills, Projects, More with inline item cards** · BFF `web/src/app/api/profile/items/{route,[id]/route,reorder/route,import/route}.ts` + `…/completeness/route.ts` (thin proxies via `forward`; Spring's 413/422 bodies relayed), `lib/profile-items.ts` (types, `ItemApiError`, browser fetchers; client-safe) + `lib/profile-items-server.ts` (page readers). `/profiles` (RSC) now reads bio + items + completeness + builder config + resumes and honours `?tab=` (`overview|personal|work|education|skills|projects|more|preferences`; the completeness `nextAction.href` lands on the right tab; `tabs.ts`). Tabs: Work Experience / Education / Projects / More (certifications, languages, awards, other) are `SectionTab`s of `ItemCard`s (collapsed summary, `SourceChip`, Edit → inline `ItemForm`, Hide/Show, Delete with an Undo toast — the DELETE is sent when the 6 s window closes or the page unmounts) and `+ Add`; Skills = `SkillsChips` (named groups, `ChipInput`, debounced autosave, creates a group on its first chip) with the bio editor's "Base skills" kept underneath; Personal Info / Preferences keep `BioEditor`. `ItemForm`: required fields, `YYYY`/`YYYY-MM` dates, bullet count + length from the builder settings (`limits.bullets`/`bulletChars`, never literals), never-collected values refused client-side (`scanSensitive`) and the API's `SENSITIVE_CONTENT` / `ITEM_LIMIT` / `ITEM_TOO_LARGE` shown on the field; Add disables with a message at `profile.maxItemsPerUser`. Overview: meter + tiles read the server completeness (`buildTiles`, Projects tile = count since the meter has no projects part), a "Next:" line from `nextAction`, "Multiple Profiles" → **Targets** (built resumes, linking to the editor). `derive.ts` reduced to formatting (`deriveProfile`, `buildTiles`). `@kiwiply/ui`: new `ChipInput`, `SourceChip`, and an `action` button on `Toast`. `web/scripts/mock-api.mjs` serves the profile items + completeness in memory. Tests: web 204 (+33: `itemSchema` incl. tiles/`?tab=`, `ItemForm` validation + Enter-adds-bullet, `SkillsChips`, `useProfileItems` undo), ui 227 (+8), tsc + `npm run build -w web` green; `eslint` shows only the 13 pre-existing no-literal errors (see rb1.1-fix). Browser: own tab on the in-memory mock, 1440 / 1024 / 768 / 375 — no horizontal overflow at any width, tab row scrolls, every control in the new lists/forms ≥ 44 px at 375.
- 2026-10-12 · **rb3.7: async PDF pipeline — render hash, PENDING/RUNNING/READY/FAILED on the resume, coalesced per-resume jobs, stored through FileStorage** · Liquibase `20261012050000_resume_builder_pdf_jobs.xml` (`pdf_status/requested_at/lease_until/worker/attempts/next_attempt_at/error`, `thumb_key/thumb_hash`, `ix_resume_doc_pdf_queue`, READY backfill for resumes that already have a PDF). API: `ResumeRenderHash` (`sha256(contentHash|templateId|canonical theme)`, TS twin `resumeRenderHash` in `@kiwiply/ui`, same golden vector), `ResumeDocService.markPdfPending` (settle `resume.pdf.settleMs`; immediate on template switch / pdf-now) called from create, PUT and template PATCH, `ResumePdfJobService` (`claim` = `SELECT … FOR UPDATE SKIP LOCKED` + lease, `store` discards a stale render hash and stores through `FileStorage` with the old object deleted, `fail` BUSY no attempt / exponential backoff / FAILED after `maxAttempts`, expired lease reclaimable and counted, Micrometer counters + timer + gauge, WARN when the oldest pending is > 10 min), every job-state write a bulk update so the editor's ETag never moves; `InternalTokenFilter` (constant-time `X-Internal-Token` vs `DOSSIER_INTERNAL_TOKEN`, blank = deny all) on its own filter chain `InternalSecurityConfiguration` for `/api/internal/**`; `InternalResumePdfResource` (claim/fail/doc/photo/pdf, hidden from OpenAPI), `GET …/doc/pdf-status`, `POST …/doc/pdf-now`, `GET /api/admin/resume-pdf-jobs/stats`, `ResumeDocDTO.pdf/.renderHash`, `ResumeDTO.pdf` (STALE derived). Web: `lib/pdf-jobs.ts` worker + `instrumentation.ts` (`RESUME_PDF_WORKER=1`), BFF `doc/pdf-status` + `doc/pdf-now`, `export?format=pdf&cached=1` serves the stored file when current else renders + stores (and records the render hash), editor top-bar suffix "· PDF updating…" / "· PDF couldn't be made · Retry" (`usePdfStatus`, `PdfStatusSuffix`), flush + `pdf-now` on leaving the editor, list chips "PDF updating…" / "PDF failed". Settings added: `resume.pdf.busyRetryMs`, `.statusPollMs`, `.statusWindowMs` (DESIGN 15.2 row). Ops: compose `DOSSIER_INTERNAL_TOKEN` (api + web) + `RESUME_PDF_WORKER`, `.env.example`, `DEPLOY.md` §14.1. Tests: `ResumePdfJobIT` (25), `RenderHashTest` (4), `InternalTokenFilterTest`, `pdf-jobs.test.ts` (12), `export.route.test.ts`, `EditorTopBar.test.tsx`, `usePdfStatus.test.tsx`, editor/list/adapter additions; `./gradlew test integrationTest` green (659 + 584), ui 300, web 248 (+3 skipped), `npm run build -w web` green. Verified for real (Spring + MySQL + web worker + local Edge): create → pending → pdf-now → READY → file in storage → cached export serves it → edit → READY in 21 s with the old object deleted, internal routes 401 without the token; in the browser the top bar showed "Saved · just now · PDF updating…" for ~20 s then cleared.
- 2026-10-12 · **rb1.1-fix: profile item limits from the settings seam** · R1.1 had hard-coded 16 KB per item / 500 live items per user / 200 items per import in `ProfileItemService`; they are now typed, bounded settings in `ResumeBuilderSettingKeys` (`profile.item.maxBytes` 16384 · 1024-65536, `profile.items.maxPerUser` 500 · 50-5000, `profile.import.maxItems` 200 · 10-1000), read per call through `ResumeBuilderSettings`, listed in DESIGN §15.2 (the parity test covers them) and exposed to the web as `profile {itemMaxBytes, maxItemsPerUser, maxImportItems}` on the builder config (`resume-builder-config.ts` defaults updated). `ProfileItemResourceIT` gains three tests that lower each setting and hit the 413/422 path with the setting's value; config IT + settings unit test extended. `packages/ui` barrel now exports the SensitivePatterns twin (`scanSensitive`, `scanSensitiveField`, `redactSensitive`, `redactSensitiveField`, `SENSITIVE_LABELS`, `SENSITIVE_REDACTED`, types) for R1.2 (+ `index.sensitive.test.ts`). `./gradlew test integrationTest` green (598 + 551), `npm test -w packages/ui` 219. Note: `npm test -w web` lint is red at the base for 13 numeric-literal errors in files this commit does not touch (`state/ui.ts`, `list/ResumesHero.tsx`, `list/templateThumbs.ts`: R2.0's no-literal rule meets R2.9/list-shell pixel constants); tsc + vitest are green.
- 2026-10-12 · **rb2.7: document schema v2 — marks, photo object, INTERESTS, list styles, `tailoredFrom`; upgrader + fixtures (Java + TS)** · Additive Liquibase `20261012040000_resume_builder_v2_doc.xml` (`resume_doc` schema_version / photo_key / parent_resume_id / parent_hash_at_copy / source_kind / score_json / score + `ix_resume_doc_parent`; `resume_ai_proposal` title / body / kind / ai_call_id + `ix_resume_ai_proposal_open`); `ResumeDocumentValidator` v2 (schema 2, INTERESTS, marks rules, `list`/`listStyle`, project dates, `basics.photo` owner-prefix, `tailoredFrom` server-only via `Options`, injectable `Limits` with the R0 defaults); `ResumeDocumentUpgrader` (v1 → v2) + TS `upgradeDocument`; `ResumeDocService` upgrades on read/409 and on PUT (stores v2, `schema_version = 2`, mirrors `photo_key`, echo-only `tailoredFrom`), DTO `schemaVersion`; canonicaliser sorts `marks` by (s, e, t); projector/text v2 rules (list summary lines, literal `1. ` numbered bullets, ` (href)` after a link mark, one-line INTERESTS; marks never reach `parsed_json`, so v1-equivalent content leaves `ProfileVersion` unmoved); TS `marks.ts` (`toggleMark`/`shiftMarks`/`isCovered`/`sortMarks`), `RichText` (nesting b > i > u > a, `allowed` filter) used by bullets, summary and achievements, `resume.css` strong/em/u. Golden fixtures `full-v2.{json,structured.json,txt,hash.txt}`, `full-v1-upgraded.json`, `caps-doc.json` in both trees (Java and TS byte-identical); the `invalid-*` fixtures moved to schema 2.
- 2026-10-12 · **rb1.1: Profile items API — CRUD, reorder, import (seed from default resume), completeness + the shared SensitivePatterns library** · `ProfileItemResource` (`/api/profile/items` GET/POST/PUT/DELETE, `/reorder`, `/import`, `GET /api/profile/completeness`) over `ProfileItemService`: ownership 404 on every verb, soft delete, positions, `ensureSeeded` copies the default resume's `parsed_json` once (`bio.meta_json.seededFromResumeId`; redacts first; creates an empty `{}` bio row as the marker), import merges by normalised title+org (user data wins; bullets/skills unioned; one transaction, refused whole on a sensitive value; an import counts as seeding), `PUT /api/profile` stamps `meta.provenance[key]='user'` (accepted suggestions `learned`), completeness per v1 2.4 cached in `meta_json.completeness` without touching `bio.updatedAt` (profile version unmoved; `Bio.metaJson` is server-only, not in `BioDTO`). `SensitivePatterns` (Java `service/privacy` + TS `packages/ui/src/sensitive-patterns.ts`, 8 classes, label-gated + shape rules, key-as-label `scanField`, `redact`) run on one shared corpus (`corpus.json`, 79 cases); every item string -> 422 `SENSITIVE_CONTENT {path, class}`. Tests: SensitivePatternsTest 11, CompletenessTest 10, ProfileSeedAndMergeTest 8, ProfileItemResourceIT 24, sensitive-patterns.test.ts 164. Not exported from the `@kiwiply/ui` barrel yet (R1.2/R1.4 add the export they use).
- 2026-10-12 · **rb2.0: settings seam + builder config endpoint** · `ResumeBuilderSettingKeys` (every DESIGN §15.2 key once: type, default, bounds, description; `resume.pdf.waitMs` added) + `ResumeBuilderSettings` (typed getters over `app_setting`, whole-table 60 s cache, `invalidate()`, bad/out-of-bounds value → default + one WARN) + `ResumeEntitlements` + `GET /api/profile/resume-builder/config` (§9.1 + `resumes{count,max}`; ETag = sha256 of the body, 304, `private, max-age=60`); `ResumeDocService` validates with the configured limits (`ResumeDocumentValidator.Limits` + `validate(doc, Limits)`, `validate(doc)` keeps the defaults); web `lib/resume-builder-config.ts` (`getBuilderConfig`, `DEFAULT_BUILDER_CONFIG`), BFF `/api/resumes/builder-config`, ESLint rule forbidding numeric literals ≥ 100 in the builder UI (six R0 files grandfathered in `eslint.config.mjs`). DESIGN §9.1/§10.8/§15.1/§15.2/§6.3 aligned. Tests: `ResumeBuilderSettingsTest`, `ResumeBuilderSettingKeysParityTest` (reads §15.2), `ResumeDocumentValidatorLimitsTest`, `ResumeBuilderConfigResourceIT`, `resume-builder-config.test.ts`.
- 2026-10-12 · **rb2.9: `SideSheet` primitive (left/right slide-in, push/overlay/fullscreen) + editor UI state (`ui.ts`)** · `@kiwiply/ui` `SideSheet` (DESIGN §10.3 props; push = `<aside role=region>` reserving `width` and `inert` when closed, overlay/fullscreen = `role=dialog aria-modal` + focus trap, scrim on overlay only, first-control focus on open with the ✕ last in DOM order, Esc closes, focus returns to `returnFocusTo`, 200 ms `translateX` / reduced motion = no transform + 80 ms opacity, body scroll lock in fullscreen only; exported from the barrel). `web/.../state/ui.ts`: `UiState` + `uiReducer` (`panel/toggle|close`, `rightView/toggle|close`, `rail/tab`, `layout/set`, `section/active`, `phone/tab`, plus `ui/hydrate`), `computeLayout` (space-aware push: centre >= 560 px with the 360 px rail; < 768 fullscreen, 768-1023 overlay, 1024-1279 left may push / right overlays, >= 1280 both may push at >= 1840 px), "two modal sheets never coexist, newest wins", `localStorage["rb.ui.v1"]` persistence of `leftPanel` + `railTab` (try/catch, per-field validation) via `useUiState` (defaults first, restore after mount); `useBuilderLayout(ref, dispatch)` (`ResizeObserver` -> `layout/set`). Additions beyond the story text: `layout.width` and `UiState.newest` (needed to derive modes and pick the older sheet to close). Tests: `SideSheet.test.tsx` (13), `ui.test.ts` (17), `useBuilderLayout.test.tsx` (3); ui 54 / web unit 139 green, `npm run build -w web` green. Nothing is wired into a page yet (R2.10). No API/extension change.
- 2026-10-12 · **design: Resume Builder v2 — full build-ready design to the v3 boards** · Rewrote `docs/RESUME-BUILDER-DESIGN.md` (v2, 2 375 lines): `ResumeDocument` schema v2 (JSON Schema; inline marks as offset ranges, photo object, INTERESTS, list styles, `tailoredFrom`; Java + TS upgrader with golden fixtures), theme v2 (spacing presets, ladder as deltas), **template capability model** (`TemplateCapabilities`, `ATS_STRICT`/`DESIGN_FREE`, tighten-only admin overrides, editor control matrix, lossless switching + hidden-content notice, test vectors), storage (per-story Liquibase, render hash, **async PDF pipeline** with a leased queue + web worker + internal token, metadata with one truth per field, master→tailored lineage, `resume_access`/`resume_view_event`, lifecycle, thumbnails, org marks), every API + BFF endpoint, the editor UI region by region (`SideSheet` primitive, dynamic left side-nav, canvas, `MarkedTextarea`, right rail, Print layout / PDF view side-nav, Resume settings, start chooser, Save / Save & Download, the resume header bar, phone layout, My Resumes and consent-scoped org Resumes & Profiles pages), deterministic **Resume Score** engine (TS, ruleset v1, weights as settings, vectors 13/100/62/66), **Job Match** engine (`JdExtract` + match formulas, `MatchReport`, vectors 75/88, AEDT posture), AI features table (prompt ids, schemas, truth profiles, caches, caps, evals), export incl. proposed `docx`, 60+ settings keys, never-collected table, security, analytics, performance budgets, test strategy, cross-area seams (§21). `docs/RESUME-BUILDER-DECISIONS.md` v2 (29 rows, "needs user OK" marked; deps needing approval: `docx`, `@axe-core/playwright`). `docs/RESUME-BUILDER-STORIES.md` + `docs/resume-builder/stories.json` re-planned: 68 stories (R0 done, R1 kept, R2–R8 new, 3 superseded tombstones), build order R2.0 → … → R8.3, both roadmap generators green (dangling ids 0). Handoff START HERE → R2.0. No product code.
- 2026-10-11 · **rb-list-shell: My Resumes page shell to the v3 board** · `/resume-builder` now follows `design/resume-builder-v3/user-my-resumes.webp` (hero + New Resume, All/Active/Drafts/Archived tabs with counts, search, status + sort filters, remembered grid/list toggle, cards with thumbnail/chip/dates/tags/four actions + kebab, Popular Templates, Quick Tips). Everything the design may still change is isolated in `web/src/components/app-v3/resume-builder/list/adapter.ts` (DTO -> `ResumeCardModel`); unbuilt controls say "Coming soon" and are marked `DESIGN-PENDING (R-list)`. Edit + New Resume work as before. `CopyIcon` added to `@kiwiply/ui`; mock-api seeds built/archived/stale-PDF resumes. Left-nav promo card not built (the shell's PlanCard is not per-page).
- 2026-10-11 · **rb0.7: walking-skeleton smoke against the real API + handoff refresh** · `web/scripts/rb-smoke.mjs` (dev only; refuses NODE_ENV=production and non-local hosts; no deps) run against real Spring (dev profile, MySQL 9.2.0, local storage driver, demo on) + the pinned browserless/chromium v2.57.0 sidecar + `next dev` with `PDF_BROWSER_URL`. Demo accounts can't be used (DemoGuard makes them read-only), so it registers + activates a throwaway local account through the API's own flow; creds only in gitignored `web/.env.rb-smoke`. Result **14/14 PASS**: account · web sign-in · GET /api/profile/version · POST built resume (201) · GET doc + ETag · PUT edit with If-Match (ETag 1->2, contentHash moved) · stale If-Match -> 409 DOC_VERSION_CONFLICT · ProfileVersion changed after the PUT · PATCH template modern->modern 200 · export 200 application/pdf (20381 bytes) · PDF pages >= 1 (1, matches the header) · resume.r2ObjectKey set · file exists under the local storage root, byte-identical to the download · exportedHash == contentHash. No skeleton bug found (first-run failures were all script-side: no summary section on a fresh profile, section-id format, `/api/resumes/:id` is ADMIN-only). Not covered: classic/compact (only Modern is registered in the web), the standalone production build, the S3 driver.
- 2026-10-11 · **rb0.6: PDF export via Chromium sidecar, stored through FileStorage** · Compose `chromium` service (`ghcr.io/browserless/chromium:v2.57.0@sha256:6bac628b…`, internal network only, no ports, 1 GB / 1.5 cpu / 512 MB shm, `curl /pressure` healthcheck, `restart: unless-stopped`; shared-edge overlay untouched) + `PDF_BROWSER_URL` and `RESUME_PDF_*` env on web; DEPLOY.md §14 "PDF service". `web/src/lib/pdf.ts`: `renderResumeHtml` (`ResumePreview` markup + inlined `resume.css` + base64 fonts), `printPdf` (playwright-core CDP, JS disabled + network aborted in the print page, 1 concurrent + queue of 10 -> `PdfBusyError`/503, 20 s timeout), `exportResumePdf` (counts the PDF's own pages, steps the fit ladder down <= 3 times in auto mode, logs `resume.fit.mismatch`); config keys named like the future admin settings (`resume.pdf.timeoutMs|maxConcurrent|queueMax|maxFitSteps`, env `RESUME_PDF_*`). Local dev without the sidecar launches Edge/Chrome. `POST /api/resumes/[id]/export {format:"pdf"}` streams the PDF, uploads it to `POST /api/resumes/{id}/file` (FileStorage) and calls the new `POST /api/profile/resumes/{id}/export-recorded {hash}` (bulk update of `exported_at`/`exported_hash`, so `doc_version` and the editor's ETag are untouched). `ResumeDTO` now carries `contentHash`/`exportedHash`/`exportedAt` for BUILT resumes; the list shows "PDF out of date". Editor top bar has Export PDF (flushes autosave first). Tests: `pdf.test.tsx` (25: html snapshot, queue/503, timeout, ladder stepping), `pdf.browser.test.tsx` (real Chromium, `PDF_SMOKE=1`; one-page fixture = 1 page via Edge and via the sidecar image), editor/resume-doc tests, `ResumeDocResourceIT` +3 (ownership 404, sets fields, version unchanged, malformed hash 422). Dep: `playwright-core@1.64.0` (web).
- 2026-10-11 · **p5.1: FileStorage seam, prerequisite for R0.6** · `service/storage/FileStorage` (store/load/open/stat/exists/delete/list, opaque keys, no SDK types) with `LocalFileStorage` (default driver: root dir from `dossier.storage.local.root`, traversal-safe keys, temp+fsync+atomic move, `.meta` sidecar, 0700) and the old S3 code refactored into `service/storage/s3/S3FileStorage` (the only AWS-SDK user, ArchUnit-enforced). `dossier.storage.driver=local|s3` (default `local`; S3 keys unchanged, so prod switches by config). Resume + attachment resources, account deletion (now also removes application attachments), demo wipe and profile service all go through it; a missing object is a 404, not a 500. `docker-compose.prod.yml` gets an `uploads` volume at `/srv/uploads`; S3_* no longer required. Tests: `FileStorageContract` run against local and S3Mock, `LocalFileStorageTest`, `ResumeFileResourceIT`. R0.6 must store its PDF via `FileStorage` through `/api/resumes/{id}/file`.
- 2026-10-11 · **rb0.5: resume editor skeleton — live preview, autosave with ETag, conflict dialog** · BFF `web/src/app/api/resumes/{built,[id]/doc,[id]/doc/template}/route.ts` (thin proxies via `lib/resume-doc-proxy.ts`: forward auth, `If-Match` in / `ETag` out, Spring error bodies verbatim incl. 409 `DOC_VERSION_CONFLICT`, 422, 413, 428, 402 `RESUME_LIMIT`). `/resume-builder/[id]` (RSC: doc + plan) -> `ResumeEditor` client island over `state/{types,history,reducer,autosave,ids,clock}.ts`: undo/redo history (cap 100, typing coalesced per field within 1 s), reducer (edit summary / experience fields / bullets with Enter = split, Backspace on empty = delete, Backspace at start = merge up; add/remove experience; rename; server-limit clamps), autosave controller (800 ms debounce, one request in flight, `If-Match`, backoff retry on network/5xx, pauses on 409), `ConflictDialog` (keep mine / take theirs), status "Saved · just now / Saving… / Not saved — retrying", Ctrl/⌘Z + Shift, `beforeunload` guard, flush on tab hide. Sections rail (list only), `PreviewPane` = `ResumePreview` inside the new `@kiwiply/ui` `PageFrame` (scaled to the pane, page-count badge), `UndoIcon`/`RedoIcon` added to ui. Phone = Edit/Preview bottom tabs. `/resume-builder` list keeps the board layout (hero + resumes strip) but is real: "New resume" POSTs `/api/resumes/built` and redirects; 402 shows the upgrade copy (Free: See Pro; Pro: archive); `ResumeBuilderPage.tsx`, the old sample `SectionEditor` and the `RB_*` sample data are gone. vitest + Testing Library + jsdom added to `web` (`npm run test:unit -w web`; `npm test -w web` = tsc + eslint + unit): 84 tests (reducer, history, autosave, SectionEditor keys, ResumeEditor integration, `resume-doc` fetchers). `npm test -w packages/ui` 41 (PageFrame). `web/scripts/mock-api.mjs` now serves the doc endpoints in memory (ETag/If-Match/409/422/402) + `POST /mock/resumes/<id>/edit-elsewhere` to force a 409. Note: web pins react 19.2.4 while the hoisted copy is newer; `web/vitest.config.ts` aliases both to the hoisted one. No API/extension change.
- 2026-10-11 · **rb0.3: resume doc endpoints with ETag/If-Match** · `ResumeDocResource` under `/api/profile/resumes` + `ResumeDocService`: `POST /built` (via `ProfileService.createResume(dto, kind)` so the Free 3 / Pro 25 cap applies -> 402 `RESUME_LIMIT`; document seeded by the new `ResumeDocumentSeeder` from non-hidden `profile_item` rows, else bio header only), `GET /{id}/doc` (ETag `"<docVersion>"`, version starts at 1), `PUT /{id}/doc` (If-Match required -> 428 `IF_MATCH_REQUIRED`; stale -> 409 `DOC_VERSION_CONFLICT {serverVersion, doc}`; validator -> 422 `DOC_INVALID {path, message}` / 413 `DOC_TOO_LARGE`; one transaction writes `resume_doc`, `resume.parsed_json`, `resume.label`=`meta.title`, `resume.updated_at`), `PATCH /{id}/doc/template` (`KNOWN_TEMPLATE_IDS` = modern/classic/compact, unknown -> 422), `GET /{id}/doc/text`. Other users' ids are 404 on every verb. Template switch leaves `ProfileVersion` unchanged; a content save moves it. `AUTOPILOT_RESUME_LIMIT = 50` added, gated as Pro until Phase 18. `ResumeDTO.templateId` filled for BUILT resumes in list/update (one narrow query, skipped when none are built). `POST /api/profile/resumes` now forces `kind=UPLOADED`; deleting a resume also clears its version/proposal rows. `ExceptionTranslator` maps the new service-layer `ResumeDocException`. Tests: `ResumeDocResourceIT` (19). No extension change.
- 2026-10-11 · **rb0.4: @kiwiply/ui resume package** · `packages/ui/src/resume/`: `types` (ResumeDocument v1, Theme, TemplateMeta), `doc` (tolerant readers = the Java helpers), `json` (byte-exact writer, canonical form, Web-Crypto `contentHash`), `project` + `text` (ports of `ResumeDocumentProjector`/`Text`; equal the copied golden fixtures `*.structured.json`/`*.txt`/`*.hash.txt` byte for byte), `fit` (7-step ladder, `resolveTheme`, `pageCount`, `fitToPages`), `theme` (defaults, sanitising, scoped CSS-variable block + `@page`), `registry`, `templates/{shared,modern}.tsx`, `ResumePreview` (no hooks), `styles/resume.css` (`.rz-*` only), fonts Inter + Source Serif 4 Latin variable woff2 self-hosted in `packages/ui/fonts/` (SIL OFL, licences included), `thumbs/modern.png` (Chrome screenshot of the full fixture). vitest + jsdom + Testing Library added to `packages/ui` only (`npm test -w packages/ui`: 36 tests incl. Modern x {full,sparse} HTML snapshots and a two-render determinism check); `.gitattributes` pins the fixture copies to LF. `npm test -w web` + `npm run build -w web` green. No API/extension change.
- 2026-10-11 · **rb0.2: ResumeDocument validator, canonical hash, projections** · Pure Java under `service/resume/`: `ResumeDocument` (Jackson tree helpers, `Kind`, strict parse, `trimWs`/`oneLine`), `ResumeDocumentValidator` (first failure as `{path,message}` + `tooLarge`; schema=1, known kinds, one per kind except CUSTOM, `[a-z]_[A-Za-z0-9]{6,12}` ids unique doc-wide, <=40 items / <=12 bullets / <=600 chars / <=2000 summary / <=256 KB, `YYYY`/`YYYY-MM`, integers only), `ResumeDocumentCanonical` (sorted keys, trimmed strings, SHA-256 `contentHash`), `ResumeDocumentProjector.toStructured` (-> the six-key `StructuredResume` the extension reads: `languages[].proficiency`, `projects[].name`, `endDate` blank when `current`; hidden excluded), `ResumeDocumentText.render`, and `ResumeDocumentJson` (a `JSON.stringify`-identical writer so Java and TS agree byte for byte). Porting rules are in the class comments of `ResumeDocumentJson`/`Canonical`/`Projector`/`Text`. Golden fixtures `api/src/test/resources/resume-doc/{full,sparse}.{json,structured.json,txt,hash.txt}` + 10 `invalid-*.json` (R0.4 copies them byte-for-byte; `.gitattributes` pins them to LF); the full-doc hash was cross-checked against an independent Node implementation. Tests: 76 new (validator 50, canonical 10, projector 9, text 7); full `test` 516 green. No endpoints, no extension change.
- 2026-10-11 · **rb0.1: resume_doc + profile_item schema** · Additive Liquibase `20261012010000/020000/030000_resume_builder_*` (`profile_item`; `resume_doc` + `resume_doc_version` + `resume_ai_proposal`; `bio.meta_json`, `resume.kind` default `UPLOADED`, `resume.updated_at`) included from `master.xml`; entities `ProfileItem`/`ResumeDoc` (`@Version docVersion`, `@MapsId` on resume)/`ResumeDocVersion`/`ResumeAiProposal` + enums `ProfileSection`/`Provenance`/`ResumeKind` + owner-scoped repositories; `Resume` gains `kind` (defaulted in `@PrePersist`) and `updatedAt` (`@PrePersist`/`@PreUpdate`); `ResumeDTO` gains optional `kind`/`templateId` (mapper passes `kind`, leaves `templateId` null until a builder service fills it; `ProfileVersion` hash unchanged, pinned by new `ProfileVersionTest`). New `ResumeBuilderDataService` erases the four tables (before the user's resumes) in both `AccountDeletionService` paths and feeds `profileItems`/`resumeDocs` into `AccountExportService`. Tests: new `ResumeBuilderSchemaIT` (10), `AccountDeletionServiceIT` (3, self-serve + admin erase + export), `ProfileVersionTest` (2); full `test` 438 + `integrationTest` 487 green (Testcontainers MySQL). `bio.meta_json` is column-only for now (no `Bio` field) so nothing can clobber it. No extension change.
- 2026-10-11 · **design: Resume Builder + Common Profile (branch `resume-builder`)** · Wrote `docs/RESUME-BUILDER-DESIGN.md` (goals/personas, common profile wrap-not-migrate with `profile_item` + provenance, `ResumeDocument` v1 + `resume_doc`/versions/proposals schema, template registry in `@kiwiply/ui` with lossless switching + 7-step page-fit, Chromium-sidecar PDF through the existing file endpoint, Pro-only AI via `AiBudgetService` with the 13.4 suggest→diff→accept pattern generalised, API/BFF contracts, wireframes, risks, 4 open questions), `docs/RESUME-BUILDER-STORIES.md` (45 stories R0–R7, ★ first five = R0.1–R0.5, walking skeleton R0.1–R0.7), `docs/RESUME-BUILDER-DECISIONS.md`, `docs/HANDOFF-RESUME-BUILDER.md`. No product code.
> One line per completed task: date · task · note.
- 2026-10-11 · **app3a App v3 shell + Dashboard + Job Search** · Shell verified (13-item nav, blue pill, PlanCard, Hi-First menu, all legacy routes redirect; /jobs/[id] now opens the Job Search panel). `app-v3/home/*` Dashboard (real counts, activity, status, recent, recommended, profile strength; sample interviews/alerts) and `app-v3/jobs/*` Job Search (filter rail, list, detail panel, pagination); HeroBand note/aside layering fixed. tsc+eslint green; checked in browser at 1440/1024/375.
- 2026-10-11 · **demo Demo selector on /login + local mock (branch `worktree-agent-aebb348a4abddfc89`)** · `DemoCard` is now a radio-card picker (job seeker / organization admin, each with a blurb and "You'll see", one "Open demo" button, 44px targets). `web/scripts/mock-api.mjs` is a dependency-free stand-in for the Spring API (demo on, both accounts, read-only 403 `DEMO_READ_ONLY` on writes, no DB); `npm run dev:demo -w web` starts it plus `next dev`. Dev-only by construction (separate script, refuses `NODE_ENV=production`). Verified in the browser: both accounts land on `/dashboard` / `/org` with the Demo badge. DEPLOY.md 12.1 "Local demo".
- 2026-10-11 · **app3qa App v3 QA pass (branch `version2`)** · Folded `local-{b,c,d}/HeroBand` into the shared `HeroBand` (new `mascot` look), merged `sample-data.{a,b,c,v3d}.ts` into one, deleted unused v2 page folders + dead components, `/profile` is a real server redirect; `npm test -w web` + `npm run build -w web` green; smoke of all 14 signed-in routes at 1440/1024/375 clean, old routes redirect. Handoff updated.
- 2026-10-11 · **app3 (stopped) App v3 second-generation pages — handoff** · Work paused for another machine: `app3c` (assistant/alerts/messages) complete; `app3a`/`app3b`/`app3d` snapshotted as `-wip` commits and merged; tsc+eslint green. Resume from `docs/HANDOFF-V2.md` §2.
- 2026-10-11 · **demo Demo accounts, switchable from the internal admin (branch `version2`)** · API: `app_setting` key/value table (Liquibase `20261011010000`, seed `demo.enabled=false`) + cached `AppSettingService`; `DemoAccountService` creates `demo` / `demo-org` (Free, `ROLE_USER`) at startup and seeds Jordan Lee (profile, 2 file-less resumes, 8 applications); public `GET /api/public/demo`, `POST /api/authenticate/demo` (same `TokenIssuer` pair as a password login), password login for a demo account refused with 403 `DEMO_DISABLED` while off, Google never maps to a demo account; `DemoGuard` -> 403 `DEMO_READ_ONLY` on profile/password/delete/export/billing/inbox/resume upload+delete/AI parse; admin `GET/PUT /api/admin/settings/demo` + `POST .../reset`, audited. Web: "Just looking? Try the demo" card on `/login` (server-fetched, absent when off or the API is down) + "or try the demo first" on `/signup`; Demo badge + note in both account menus, a fetch toaster for refused writes, `/settings` hides export/delete/billing for demo; `/admin/system` "Demo accounts" card (switch, accounts, last changed, reset with confirm). DEPLOY.md section 12.1. Tests: 3 new unit classes + `DemoAuthenticateIT` (15, real MySQL).
- 2026-10-11 · **honest-claims Marketing copy states real support only (branch `version2`)** · Trust strip on `/` and `/v3` now shows "Works today" (LinkedIn, Workday, Greenhouse, Lever, Ashby, Workable, each with a check) and "On the roadmap" (Indeed, Glassdoor, ZipRecruiter, Handshake, Wellfound, muted with "Soon" chips, link to `/#roadmap`); new `sections/Roadmap.tsx` (Available now / In progress / Planned) fed by `partners-data.ts` (real data, edit when support changes). Numeric stats bands (`/` and `/v3`) replaced by four value tiles with no numbers; hero ticks, footer trust row, final CTA, `/v3` Apply heading, About story/CTA copy no longer claim counts, "all major job sites" or "thousands". Testimonials untouched (still placeholder, still contain "5x").
- 2026-10-11 · **appqa App v2 QA pass (branch `version2`)** · Build gate was already green (no fixes needed). Folded `app-v2/local`, `org-v2/common-local` and `common-local2` into `app-v2/common` (PageHero eyebrow/decor/note placement/size, StatTile sublabel/compact/chip, SectionCard icon/subtitle/onClick, DataTable `inCard`, Donut legend modes, Pagination blue + open-ended, UnderlineTabs id|value + padded + pill counts; new PillTabs, Funnel, BrandTile, KebabMenu, CheckList, FilterSelect, IconTile, ActivityTimeline, QuickActionTiles, RailLayout, ToolbarButton, StatRow) and merged `sample-data.pages.ts` / `sample-data.2.ts` into the two `sample-data.ts` files; before/after geometry diff of 19 routes at 1440. Route smoke at 1440 / 1024 / 375 (no overflow, no console errors, every link 200): org top bar overflowed at 375 (chip's `inline-flex` beat `hidden`; chip now in the drawer), org settings textarea counter overlapped text, org/app page titles added (`X · Organization`, no more double suffix), `AppleIcon` / `LinkedInIcon` / `CrownDoodle` added to `@kiwiply/ui` and used (auth social row, v3 tiles and wordmark, signup + v3 crowns), text glyph icons replaced. `/v3` swaps the shared header/footer via `ChromeGate` (no injected `<style>`); `/org/` + `/v3` in `NON_INDEXABLE_PATHS`; signup now forwards `firstName`/`lastName` to Spring's register DTO.
- 2026-10-11 · **v3 Landing v3 at `/v3`** · Alternate landing built to `design/app-v2/landing-v3-{desktop,mobile}.webp` (spec section 7): own header + footer, hero with CSS floating cards, partner wordmarks, six pillars, stats band, 4 steps, one-platform phone mock, apply with AI, individuals / organizations, stories, results, CTA band, FAQ (`<details>`). Copy and numbers in `marketing/v3/placeholder-data.ts` (`PLACEHOLDER`); `robots: noindex`.
- 2026-10-11 · **org2 Enterprise admin: analytics, AI resume support, integrations, billing, settings** · Five `/org/*` pages from the spec section 6 transcriptions (HTML/CSS charts: grouped bars, clip-path funnel and lines, conic donuts; billing and settings tabs). Sample data only.
- 2026-10-11 · **org1 Enterprise admin shell + dashboard, team, applications, opportunities, interviews** · `(org)` route group (session gate like `(app)`; no org model yet so any signed-in user can open `/org`), `OrgShell` (236px sidebar, 64px top bar with the real account name, drawer below lg), `OrgPageHero`, five pages from the spec 6.x boards. Sample data only.
- 2026-10-11 · **auth Login / signup / forgot / reset to the boards** · Split-screen "Kiwiply Bright" auth: brand panel + 24px card, Google (real) / Apple / LinkedIn (toast "Not available yet") row, org card; login keeps MFA / `next` logic; signup is Full name + Confirm password with a derived username and the newsletter opt-in.
- 2026-10-11 · **app2 Saved jobs, AI apply, applications, interviews, resume builder, coming-soon pages** · Six signed-in pages transcribed from the boards, real applications / resumes mapped where an API exists (sample rows when empty), "Coming soon" toasts for the Autopilot buttons; `ComingSoonPage` for AI Tools, Insights, Messages, Company Research, Networking, Learning.
- 2026-10-11 · **app1 App shell, Home, Job search, Job detail + shared primitives** · New `.theme-v2` signed-in shell (232px sidebar, 64px top bar, Upgrade card hidden on Pro, avatar menu with "Kiwiply for Organizations"), `app-v2/common` primitives + sample data, Home / Job Search (list + split panel) / Job detail to the boards; `/board` and `/matches` redirect to `/applications` and `/jobs`.
- 2026-10-11 · **app0 App v2 design spec** · `web/APP-V2-SPEC.md` (scope, binding rules, shared primitives, app / auth / enterprise / landing v3 specs, §6 transcriptions of eight enterprise boards), boards in `design/app-v2/`, sixteen cutouts in `web/public/v2/app/`.
- 2026-10-11 · **v2.2y Landing v2: fluid hero down to tablet widths** · Copy-left / art-right from 768px up; the 820x700 art canvas scales with its container.
- 2026-10-11 · **v2.6 Landing v2: QA + fix pass** · /organizations hero (card above, team tucked under its bottom edge, mascot in front; stray "· 2 min" dot gone) and CTA band (bottom-anchored `hero-copilot` cutout); /about tools grid (mock frames no longer collapse, AI Autofill rebuilt as a form mock, Interview Readiness visible again) and hero portrait (tint is its own layer, right edge faded); `org-team` / `about-team` refreshed to the re-cut `hero-team.png`; /organizations now uses the shared `Eyebrow` / `Handwritten` / `SectionHeading` (local copies deleted); dead `web/public/ats/` removed; root title, OG image and sitemap dates updated; `public/v2/README.md` inventory; tablet (1024/768) + mobile pass on `/`, `/about`, `/organizations`, `/pricing`. `npm test -w web` + build green.
- 2026-10-11 · **v2.3y Landing v2: pricing links** · Remaining pricing links point at `/pricing`.
- 2026-10-11 · **v2.3x Landing v2: body, footer and /pricing to the mock** · Landing body, footer and `/pricing` rebuilt to the board in exact-board mode (spec 13); partners row + `PLACEHOLDER` data files.
- 2026-10-11 · **v2.2x Landing v2: header and hero carousel to the mocks** · Header, hero carousel and the feature strip rebuilt to the boards; transparent people/mascot cutouts (`hero-headphones.png`, re-cut `hero-team.png`) in `web/public/v2/`.
- 2026-10-11 · **demo Demo switch moved to server config (branch `version2`)** · `demo.enabled` is now the `dossier.demo.enabled` property (env `DEMO_ENABLED`, default false), read directly (no DB, no cache); the admin PUT switch, `AppSettingService` and the DEMO_ENABLE/DISABLE audit writes are gone (reset stays in admin, audited); startup with it off revokes demo refresh tokens. `/admin/system` shows a read-only Enabled/Disabled pill; mock reads `MOCK_DEMO_ENABLED`. **Prod: set `DEMO_ENABLED=true` in the box `.env` if the demo should be on (the old DB row is ignored).**
- 2026-10-10 · **v2.5x Landing v2: /organizations to the board** · `/organizations` rebuilt (hero with overview card, features, how it works, reporting, visibility, CTA band); all numbers and quotes live in `organizations/placeholder-data.ts` (`PLACEHOLDER`).
- 2026-10-10 · **v2.4x Landing v2: /about to the board** · `/about` rebuilt (hero, story, mission, who we serve, tools grid, values, promise, testimonials, CTA); fictional copy in `about/placeholder-data.ts` (`PLACEHOLDER`).
- 2026-10-10 · **v2.3 Landing v2: page body** · Landing sections 3-12 per spec 7: `Pillars` (`#pillars`, `#autofill` alias on the autofill tile), `InboxTracking`, `JobMatches`, `Resumes`, `Dashboard`, `HowItWorks`, `ForIndividuals`, `ForOrganizations` + `FinalCta`; shared `SectionHeading`/`FeatureTile`/`Section`; pure-HTML mocks (`InboxMock`, `MatchesMock`, `ResumeMock`, `DashboardMock`, `OrgTableMock`) all fictional with an Example badge; empty `TESTIMONIALS`; old How/Features markup removed; root metadata updated to the v2 positioning. Pro chip only on AI-drafted answers (core autofill is free). Pricing/Services untouched. Shots in `design/landing-v2/shots/v2.3-*.png`. `npm test -w web` + build green.
- 2026-10-10 · **v2.2 Landing v2: hero carousel + trust strip** · Four-slide `HeroCarousel` (client; autoplay 7s with hover/focus/hidden-tab/reduced-motion pause, dots, arrows, keys, touch swipe, inert inactive slides, live announcer) fed by `hero-slides.tsx` data + server `HeroArt` (photo/mascot slots, fictional-sample `FloatingCard`s, doodles, handwriting); `Eyebrow`, `Handwritten`, `FloatingCard`, `family.ts`, ATS `TrustStrip` replace the old charcoal hero + marquee on `/`.
- 2026-10-10 · **v2.1 Landing v2: theme + shell** · `theme-v2.css` (scoped `.theme-v2`), Button `--radius-button` + `lg`, 25 new icons + `doodles.tsx`, Jakarta/Caveat fonts, new `MarketingHeader` (click dropdowns, mobile sheet) + `MarketingFooter` + `nav.ts`, `Mascot`/`Photo` slots with fallbacks (`public/v2/README.md`), `DEMO_VIDEO_URL`. Old landing body untouched; `npm test -w web` + build green.
- 2026-10-10 · **v2.0 Landing v2 design (branch `version2`)** · User-supplied mockups (hero carousel, landing, About, Organizations, mobile) saved to `design/landing-v2/`; design locked in `web/LANDING-V2-SPEC.md` (scoped "Kiwiply Bright" theme, honest-copy rules, components, carousel behaviour, phases V2.1–V2.6). Stays on `version2` until the user asks to promote.
- 2026-10-06 · **Fix: resume upload failing in production** · Reported right after the promotion: "Couldn't
  upload the file". Cause: the box's **S3 key is invalid** (AWS `InvalidClientTokenId`) — every resume file
  upload fails at storage; the user replaces it in IAM + `.env` (DEPLOY.md §1 policy). Two code gaps found on
  the way, fixed here: (1) `ExceptionTranslator` logged every unexpected 5xx at DEBUG, so production logs and
  the error digest never saw this — 5xx now log at ERROR, 4xx stay DEBUG; (2) Spring's multipart default is
  **1MB per file** while the web promises 10MB, so most PDFs would still fail with a working key —
  `spring.servlet.multipart` is now 10MB / 11MB. Tests: the 500 and 403 cases in `ExceptionTranslatorIT`
  (run locally on Docker, 10/10), `UploadLimitsTest` reads the main `application.yml` (the test classpath
  shadows it). A separate Gemini 503 ("high demand") at 18:17 was Google's side and temporary.
- 2026-10-06 · **15.3 store listing copy (Free/Pro)** · `job-autofill/STORE-LISTING.md` rewritten for
  both stores. Chrome description: what's free, what Pro adds in the extension (Kiwiply AI drafting, best
  resume per posting, gap check, 25 resumes, answer sync) and on the web, the two prices, "cancel any
  time"; drafting through Kiwiply is now described as Pro. Still no ATS vendor names (the 0.52.2
  rejection); highest word repetition 5 with plurals merged. New **Firefox (AMO)** section: name, summary,
  tags, support, payment disclosure, and the source-code upload (whole-repo `git archive`, since the
  extension imports `packages/ui`; Node 22 build steps). Screenshots 4–5 become the two Pro features;
  reviewer note states the test account's plan. Shooting the screenshots and submitting stay the user's.
- 2026-10-06 · **Landing polish** · The hero's review-autofill preview uses a made-up person (Jordan,
  jordan.lee@example.com) instead of the founder's name; "Everything you need to apply faster" uses
  `@kiwiply/ui` icons (User, FileText, Ai, Board) in accent tiles instead of emoji.
- 2026-10-06 · **Pricing + Services on the landing page; /pricing retired** · User request. Landing
  `#pricing`: Free · Pro · Autopilot · **Consultancy** (was "Organization": $499 setup, then per person);
  each card shows 4 short highlights and opens a pop-up with the full breakdown (grouped short lines,
  limits, Pro's renewal terms, Consultancy's per-person table); "Compare plans side by side" opens a
  Free/Pro/Autopilot table. New `#services`: Expert help (review, rewrite, mock interview, coaching) and
  **For consultancies** add-ons (Marketer seats, Consultancy Ops) in the same cards. Cards are CSS-subgrid
  items, so eyebrow/name/tagline/price/note/list/buttons share rows across a row of cards (checked: equal
  offsets, 1366 px and 375 px). `/pricing` is a 308 to `/#pricing` (Stripe's cancel URL, the extension and
  emails still link it); site links, header (+ Services) and sitemap point at the sections. Contact-form
  topic keys unchanged (API allowlist); labels now "Consultancy plan" / "Marketer seats". Pro's prices moved
  to `lib/prices.ts` so client code can import them. `OfferCard.tsx` removed.
  Follow-up (same day): the consultancy add-ons (Marketer seats, Consultancy Ops) moved **into the
  Consultancy pop-up** instead of separate cards; Services is the 4 expert services. The Consultancy pop-up
  is its own, wider layout (896 px): cost in three tiles, how it works in 3 steps, a per-person table that
  says what each plan gives, what's included by who benefits, then the two add-ons side by side with an
  "Ask about…" link each.
- 2026-10-06 · **Stripe live-mode launch checklist** · The user set Kiwiply's Stripe account up in **live**
  mode ahead of launch and will do the rest right before it. DEPLOY.md §11.4 records it: **A** a short sandbox
  block (the pre-launch Pro check and the test-clock run can't be done in live mode), **B** verify the live
  setup, then the keys in order: secret key (or a restricted key with only Customers / Checkout Sessions /
  Customer portal / Subscriptions write), the two live price IDs, the live webhook (only after the deploy), all in
  the password manager before the box's `.env`. Nothing from Stripe is on the box, so billing stays off.
- 2026-10-06 · **Kiwiply-only billing + its own Stripe account** · User decision: Kiwiply moves to
  **its own Stripe account** under AutomoraLab LLC (the LLC's account serves other businesses);
  setup in DEPLOY.md §11.2 (account, branding + `KIWIPLY` statement descriptor, product with
  $19.99 / $49.99 prices, portal, webhook, keys, tidy-up). Code safety check (§11.3): customers,
  Checkout Sessions and subscriptions are tagged `metadata.app=kiwiply`; a completed checkout binds
  only when its customer is the one Kiwiply created for that user (saved before checkout), never when
  tagged for another app; subscription events tagged for another app are ignored. Found while
  checking the shared account: another app's checkout carrying one of our user ids as
  `client_reference_id` would have given that user Pro. 3 new `BillingWebhookIT` cases; the existing
  ones now seed the customer the way `startCheckout` does.
- 2026-10-06 · **9.C1 Customers page + billing timeline** · `/admin/customers` lists everyone who has
  ever subscribed:
  - **Columns:** status group (Active / Payment failed / Cancelling / Lapsed), billing (Monthly /
    Every 3 months), renews / ends date, total paid, an "Open ↗" link to the Stripe dashboard
    (test or live, chosen by the key).
  - **Tabs:** with counts, plus New this month.
  - **Each user page** gains a **Billing** section: summary + a timeline of Stripe events
    ("Payment received $19.99", "Subscription updated: active, set to cancel at period end",
    failed applies flagged) merged with **admin notes** (append-only, audited
    `CUSTOMER_NOTE_ADD`).
  - **API:** Liquibase `20261006010000` (additive). `stripe_event` gains `customer_id`, `user_id`,
    `amount_cents`, `currency`, `detail`, `occurred_at`, written by the webhook (who/what at
    record; the user is resolved after apply, so a just-bound checkout counts), with
    `StripeWebhookEvent` carrying the invoice amount and currency. New `customer_note` table
    (FK user). `CustomerAdminService` + `/api/admin/customers` (list/filter, counts,
    `/{login}` detail, `POST /{login}/notes`).
  - **Account deletion:** removes notes and detaches the user's Stripe events (amounts kept, the
    person dropped).
  - **Web:** Customers page, `CustomerBilling` + `CustomerNoteForm` on the user page, notes
    BFF, nav entry, new `CreditCardIcon` in `@kiwiply/ui`.
  - **Tests:** `CustomerAdminServiceTest` (9, green on JDK 17); `AdminCustomerResourceIT`, a new
    `BillingWebhookIT` case and an `AccountDeletionResourceIT` case run in CI.
  - **Note:** total paid counts from this change on. Nothing is lost: live payments aren't on yet.
- 2026-10-05 · **15.5 Re-price Pro** · Ext **v0.65.0**. **Price:** 3 months $44.99 → **$49.99**
  (`/pricing`, Settings › Billing, ToS, the MRR figure via `dossier.stripe.amount3mo`; the Stripe Price
  itself is the user's step). **AI budget per billing period:** `AiBudgetService` now measures Pro from
  the period's start to its renewal — `current_period_end` minus 1 month, or 3 on the 3-month Price —
  at **$3** (monthly) / **$8** (3-month) (`DOSSIER_AI_PRO_MONTHLY_BUDGET_USD` / `…_3MO_…`); it resets
  at renewal, not the 1st. An admin override and Free parsing stay calendar-month. An unknown Price
  counts as monthly (the smaller window); no usable period end falls back to the month. **Resume cap:**
  Pro **25** live resumes (402 `RESUME_LIMIT`, now with `plan`); resumes over a cap stay readable and
  fillable. Web + extension show an upgrade link only to Free; Pro is told to archive one. Every
  "this month's Kiwiply AI" became "your Kiwiply AI … resets on {renewal}". Tests: 6 new budget-window
  tests, the Pro-cap IT, and the MRR / budget ITs moved to the new numbers.
- 2026-10-05 · **15.6 full catalog on /pricing + Contact us** · `/pricing` now lists every plan and
  service, each with its scope, limits and price: Free + Pro (checkout, unchanged) + Autopilot,
  then for organizations Organization ($499 setup + per-person menu), Consultancy (Marketer seats)
  and Consultancy Ops (Custom), then the 4 human services. Everything but Free/Pro says **Contact
  us** → `/contact?topic=…`. API: `sales_inquiry` (Liquibase `20261005010000`), public `POST
  /api/inquiries` (permitAll, topic allowlist → "other", email check, best-effort email to
  support@), admin `GET /api/admin/inquiries`(+`/counts`) + `PUT /{id}` (audited `INQUIRY_UPDATE`).
  Web: `lib/catalog.ts`, `OfferCard`, `ContactForm`, a rate-limited BFF (5/h/IP), admin Inquiries
  page + nav (new `MessageIcon` in `@kiwiply/ui`); header/footer Pricing → `/pricing`, + Contact;
  sitemap gains /pricing + /contact. Tests: `SalesInquiryServiceTest` (11, green on JDK 17) +
  `SalesInquiryResourceIT` / `AdminSalesInquiryResourceIT` (CI). No extension change.
- 2026-10-05 · **Customers & support admin plan (planning only)** · ADMIN-PLAN gains **9.C**:
  - 9.C1 Customers page + billing timeline + notes (before 15.4).
  - Sent-email log, support access as a user-granted read-only "view as" (no log-in-as).
  - A debug panel with a consented support-session fill capture.
  - Offers (comps, promo codes, win-back to consented users, cancellation reasons).
  - Account fixes.
  - A one-way sync to the user's existing CRM, with admin staying the source of truth.
- 2026-10-05 · **Terms + privacy: every AI feature disclosed** · Terms *AI features* now names them all
  (resume reading on every plan; Pro: Kiwiply AI in the extension, resume fit, job fit, tailoring,
  job matches, inbox), says AI can be wrong and the user is responsible for what they submit, that
  scores are estimates, and a fair-use AI allowance per billing period (fits 15.5's budget).
  **Privacy fix:** *How resume parsing works* said resumes stay in the browser until saved — untrue
  since AI parsing went default-on (2026-07-02); it now says the text goes to Gemini, once per resume,
  and how to untick it. *AI features* opens with the provider + free-tier caveat for all of them and
  adds what Kiwiply AI in the extension sends (draft, pick, map, enrich). Closes the PL.1 note in
  the `ai-parse-default-on` memory. For the 15.2 lawyer review.
- 2026-10-05 · **Job search pulled forward (planning only)** · 16.1 (strong daily matches) becomes
  the first build after Launch 1: 10–20 jobs a day, 👍/👎 re-ranking, a preference form, ATS APIs +
  one licensed aggregator (no scraping), daily email, and consultancy marketers see each
  consultant's matches. The 13.6 light version (Greenhouse/Lever/Ashby, in-app) is already live
  code. Decisions locked with the user's recommended defaults (ROADMAP 16.1).
- 2026-10-05 · **Admin expansion brainstorm (planning only)** · ADMIN-PLAN gains **9.B**: an
  `app_setting` table (typed, bounded, audited, env = default) replaces the restarts needed for
  every AI, job-matching, inbox and rate-limit change. Also feature flags + banner + extension
  remote config (min version, per-ATS kill switch), a support toolkit (comps, promo codes,
  entitlement explainer), unit economics vs the 80 % floor with alerts, a scheduled-jobs page,
  legal version acceptance, admin roles, and abuse controls. Prompts, secrets and security rules
  stay out of admin.
- 2026-10-05 · **Consultancy additions (planning only)** · ROADMAP *Expansion build* gains
  **Phase 22, the Marketer role.** A marketer oversees 4–5 (at most 10) consultants, builds their
  resumes (each approved once by the consultant), assigns job banks with a resume per job, and
  receives recruiter mail that updates the consultants' boards. The consultant always runs the
  fill and submits. Seat price $29.99. It also gains **Phase 23, the optional Consultancy Ops
  add-on** (timesheets, bill/pay rates, invoices, profit; we record money and never move it). Its
  draft scope and proposed price ($99 per org + $4 per consultant) wait on a 23.0 brainstorm.
- 2026-10-05 · **Pre-launch review of the develop → main promotion** · DEPLOY.md §13. `main` is at
  `4de5b60` (PR #56); ~130 commits ahead. 16 changesets, all additive except the 0-row
  `ai_quota_override` rename; every new setting defaults safely and the box's `.env` has every required
  one (checked by name); no startup check can stop the API; 106 GB disk, clean fast-forward, UTC.
  Two things to know: **take a manual backup first** (15.1's automation only arrives with this
  deploy), and **rollback = old images + that dump**, because old code can't read the renamed
  column. Memory is tight on the shared box (3.7 GB, ~1.1 GB free + swap): watch the first nights.
  Runbook, smoke check and what starts running on its own are in §13.
- 2026-10-05 · **Expansion plan (planning only, no code)** · ROADMAP gains *Expansion build
  (Phases 18–21)*: Autopilot ($39.99 / $99.99), services (human + AI Interview Practice; no voice),
  and organizations (a $499 setup fee + per-person items at +25 % over individual prices; no
  packages yet). One catalog + entitlements engine sits under all of it, with an 80 % worst-case
  margin floor and caps on everything. There is no Coach tier, but the org model keeps a hook for
  it. New 15.5 re-prices Pro before live keys. CLAUDE.md go-to-market decision updated.
- 2026-10-05 · **Terms protections + the live Pro check** · Terms: a liability cap (greater of 12
  months' fees or US$50), a "Services we rely on" section (extension stores, Google, job sites,
  Stripe, AWS, Brevo), and the remedy when a Pro feature is down more than 7 days in a row (extend
  or partial refund, our choice), all marked for the 15.2 lawyer review. 15.4 gains a must-pass
  step: every Pro promise checked on production, with the store-installed extension, before live
  keys. Payments stay off until the Chrome Web Store approves the extension (user decision).
- 2026-09-23 · **15.1b server-error email digest** · `service/ops/`: an `ErrorDigestAppender` on the
  root logger feeds every ERROR into an `ErrorDigest` — one line per kind (logger + message template
  + root exception) with a count, first/last time, a sample (clipped at 500 chars) and the top of the
  stack plus the root cause; 50 kinds per email, the rest counted (and that count capped, so a flood
  can't leak memory). `ErrorDigestService` checks every minute and emails at most every 15 min, so a
  quiet day's first error arrives within a minute and an outage is 4 emails an hour. Subject
  `[Kiwiply prod] N server errors (K kinds) since HH:MM UTC`. Recipient `DOSSIER_ERROR_DIGEST_TO`,
  else `ADMIN_EMAIL` (a property of its own — Compose passes the empty var, which defeats a nested
  placeholder); neither = off, nothing collected (dev, tests). Its own errors never feed the next
  digest; a broken digest can't break logging. In-house by decision: no new processor for 15.2.
- 2026-09-23 · **15.1a backup + restore-drill scripts** · Planned 15.1 as a–c (user decisions:
  separate bucket + upload-only key, UptimeRobot + Healthchecks.io, in-house error digest, weekly
  automated drill + one by hand). `scripts/ops/backup-db.sh` — one consistent `mysqldump` (the app
  keeps serving), refused if cut short (no trailer / no tables), uploaded as
  `daily/dossier-<date>.sql.gz` with its sha256 (plus `monthly/` on the 1st), last 3 kept on the box,
  Healthchecks start/success/fail pings. `verify-restore.sh` — newest backup, sha256 check, fails if
  older than 2 days, restores into a throwaway `mysql:9.2.0` with no network, checks users +
  changelog + every live table older than the backup, logs each table's row count. The AWS CLI runs
  in a container (nothing installed on the shared box); `.env` is read, never sourced; keys pass by
  name, never on a command line. `kiwiply-ops.cron` → `/etc/cron.d` (BeeCompete's crontabs
  untouched); `scripts/ops/aws/` has the IAM policy + lifecycle JSON. CI job **Ops scripts**:
  shellcheck, 31 checks against a fake docker, and a real MySQL dump → restore round trip.
- 2026-09-23 · **14.7 inbox retention & data rights** · `InboxRetention` deletes stored mail 365 days
  after it was sent (`DOSSIER_INBOX_RETENTION_DAYS`), nightly at 03:30 UTC — what the mail did (status,
  notifications) stays, it's the user's board. Purge on disconnect and account deletion were built
  with 14.1/14.3. **Data export** now has `inbox` (the connection — address, status, dates, email
  switch; never the password, not even encrypted — and every message as stored: headers, kept text,
  what it was read as, the application and status it touched) and `notifications`. **Read-only
  guarantee** in the Terms (new "Connected inbox" section: your own account, dedicated to job hunting;
  Kiwiply only reads, never sends/moves/flags/deletes; it can misread — check what matters; how to cut
  it off) and on the Inbox page; privacy page states the 12 months. The bulk delete clears the
  persistence context (else a same-transaction read still sees deleted rows). Terms' "AI features"
  section predates Phase 13 — left for the 15.2 lawyer review. No ext change. **Phase 14 complete.**
- 2026-09-23 · **14.6 notifications** · Every status change from mail (`StatusChanged`) → an in-app
  `notification` ("Acme · Backend Engineer — Moved to Interview"), linking to `/board?app=ID` (the
  board now opens that application's panel). **Email only for Interview and Offer** (user decision) to
  the account's own address via Brevo (`mail/statusChangeEmail`), with an off switch on the Inbox
  page (`inbox_connection.notify_email`, on by default). **No backfill flood:** mail older than 7 days
  notifies no one (the board still updates); only mail from the last 48 h is emailed; one notice per
  application + status, ever. Sidebar bell with an unread badge; opening the list marks all read —
  and reloads only after the server has, so a focus refresh can't bring the count back (found in the
  browser check). New shared `BellIcon` in `@kiwiply/ui`. Deleted with the account. Privacy page
  updated. No ext change.
- 2026-09-23 · **14.4b inbox on the board** · "From your inbox" above the board (Pro): jobs the mail
  shows that aren't tracked — company · role · what the mail was (confirmation / interview invite /
  assessment / offer) · date · subject; **Add to board** lands it at the stage the mail showed, dated
  by it, through the board's own upsert (dedup applies), folding in that company's other suggestions;
  when the mail didn't name the role it's asked for first; **Dismiss** hides the company's
  suggestions. Each application's panel gets **Emails**: the matched mail newest first — sender (or
  "You"), date, what it was read as, "→ moved to Interview" when it moved the status, "not sure what
  this means" for UNSURE mail, and a short snippet on click (job mail only has text). Hidden when
  there's none. API: `GET /api/profile/inbox/suggestions`, `POST …/{id}/accept|dismiss` (409 once
  handled, 400 without a role), `GET /api/profile/applications/{id}/mail` (404 for others'). Checked
  in the browser. No ext change.
- 2026-09-23 · **14.4a inbox parser** · After each read, new mail oldest-first. `MailClassifier` (rules,
  from the wording ATS templates use): APPLIED / INTERVIEW / ASSESSMENT / REJECTED / OFFER / ALERT /
  OTHER, plus the company and role the mail names. **Only mail the rules can't settle** (nothing
  matched, or a contradiction like "unfortunately I need to move our interview") goes to Flash-Lite
  (`AiTask.INBOX`, enum-constrained JSON, ≤ 20 per metered call, ≤ 3 calls a read); if the model can't
  be asked it's marked UNSURE and **changes nothing** — a wrong "rejected" is worse than none.
  Matching (`MailMatcher`): a reply follows its thread (sent mail is linked for this), else the
  company (as `ApplicationKeys` compares it) in what the mail names / the sender's own domain / their
  display name / the subject; two roles at one company need the role to decide, else it's left
  unmatched rather than guessed. Status moves forward only; rejections and offers win; a confirmation
  also confirms the submission and dates the application. Each change publishes `StatusChanged`
  (for 14.6). A confirmation / invite / test / offer from an untracked company is marked a suggestion
  (for 14.4b). ALERTs (job-board digests) change nothing. Privacy page updated. No ext change.
- 2026-09-23 · **14.5 cross-board dedup** · The board's upsert (every path: extension fills, manual add,
  save-from-matches) now finds the existing entry by ATS job id, then by **link without tracking noise**
  (`gh_src`, `utm_*`, `www.`, trailing slash), then — new — by **company + title + a compatible
  location** among entries that aren't archived and are < 180 days old (a re-try a year later is a new
  application). `ApplicationKeys` is the one "same job" definition (14.4 will reuse it for mail):
  "Acme, Inc." = "ACME" = "Acme.com"; "Sr. Backend Engineer II (Remote)" = "Senior Backend Engineer 2";
  locations clash only when both name places with no place word in common ("New York" vs "New Delhi"
  clash — shared words like "new"/"san" don't count), so one title in two cities stays two
  applications. On a company+title match the first board's job id and link are kept, so fills from
  either board keep landing on the same entry; status never goes back to DRAFT. Existing duplicates
  aren't merged retroactively (prod data restarted 2026-09-17 — little to merge). No ext change.
- 2026-09-23 · **14.3 inbox poller** · Every 15 min (`DOSSIER_INBOX_POLL_CRON`), one inbox at a time,
  one IMAP session each, read-only; and once straight after connecting (after commit, async). Per
  folder (Inbox + Sent): **UID-incremental with UIDVALIDITY** (`inbox_folder_state`) — first read /
  renumbered folder = backfill of 60 days, newest 500, then the position jumps to the folder's end;
  ordinary reads take ≤ 500 new, oldest first. `inbox_message`: headers for every message; **body
  text only for job mail** (`JobMailRules`: an ATS / job-board sending domain, a tracked company in
  the other party's domain/name/subject, or a hiring subject) — `MailText` prefers text/plain, else
  HTML→text, cuts quoted history, caps 20k, and **never opens attachment parts** (so IMAP never
  downloads them). Same message in Inbox and Sent kept once (Message-ID hash). A rejected password →
  NEEDS_RECONNECT, no more reads; other failures back off (30 min → 6 h), ERROR after 3. Non-Pro
  users' inboxes are skipped, not deleted. Rotated keys re-encrypt on use. A disconnect racing a read
  leaves nothing behind (checked before saving). Connecting a different Gmail drops the old mail.
  Settings shows messages read. Tests: 8 against GreenMail (backfill window, attachment never stored,
  quoted history cut, increments, UIDVALIDITY, rejected password, backoff, the race) + poller timing.
- 2026-09-23 · **14.1 inbox connect flow** · Pro. `/settings/inbox` (+ an Inbox card on Settings):
  three guided steps with direct Google links (a Gmail just for job hunting — set it on the profile;
  2-Step Verification; an App password named "Kiwiply") — **links, not screenshots**: Google's pages
  change and we'd need a real account to capture them. Then address + app password → the API
  **checks them against Gmail before storing anything** (sign in, open INBOX read-only, find Sent by
  its `\Sent` flag, sign out) and keeps the password only as `SecretBox` ciphertext bound to the
  user. Refused before Gmail is asked: a non-`@gmail.com` address (Workspace blocks password sign-in)
  and anything that isn't 16 letters — so a real Google password pasted by mistake is never sent
  anywhere. Gmail's refusals are told apart (wrong password / needs an app password / sign in via
  browser / IMAP off / unreachable), each with its own fix. 5 tries per 15 min per user. Disconnect
  deletes it (and says to delete the app password in Google too). `ImapGateway` over Jakarta Mail
  (already on the classpath); **GreenMail** tests sign in to a real in-memory IMAP server. Account
  deletion + privacy page covered. Integration tests share one runtime-generated key (`TestInboxKey`)
  — separate random keys per context would trip the startup canary on the shared test DB.
- 2026-09-22 · **14.2 inbox credential encryption** · `SecretBox`: AES-256-GCM, a fresh 12-byte IV per
  value, 128-bit tag, and **associated data binding each value to its row** (`inbox:<userId>` — a
  ciphertext copied into another user's row won't decrypt). Stored as `v<version>:<base64>` so the key
  can rotate (`retired-keys` read old values; `reencrypt` moves them forward). Key only from
  `DOSSIER_INBOX_KEY` (base64 or hex, 32 bytes); none/bad = inbox **off**, never a weaker fallback.
  `InboxKeyCheck` (startup, every profile): a canary row in `secret_canary`, written on first boot,
  read back every boot — a different key marks the box MISMATCH (inbox refuses to run, nothing
  overwritten) and logs both fingerprints; it never stops the API. DEPLOY.md §12 says how to make,
  store and rotate the key. Tests generate keys at runtime — none committed. No ext change.
- 2026-09-22 · **Phase 14 planned** · Read Sales-App's IMAP integration (Node/imapflow — a model, not
  a port): keep its env AES-256-GCM key, `\Sent` special-use lookup, Message-ID dedup and
  per-connection error listener; fix its date-based sync (→ UID + UIDVALIDITY), connection per
  message (→ one per sync), endless retries (→ backoff + stop on a rejected password) and missing
  tests (→ GreenMail). User decisions: env key; bodies only for job mail; 15-minute polling; email
  only for interview/offer; 14.5 dedup moves ahead of 14.4. Docs only.
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
  since W4 and no throttle since 11.3. `docs/HANDOFF.md` points at the section.
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
  ruleset setting deleted in W6.2, and "All data stays on your device. No server."); `docs/HANDOFF.md`
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

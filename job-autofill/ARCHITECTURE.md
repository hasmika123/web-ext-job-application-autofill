# job-autofill — Architecture & file map

> Reference for the extension. Read this when working in `job-autofill/` so you
> don't have to rediscover the codebase. Conventions live in root `CLAUDE.md`;
> cross-browser support/porting notes live in `BROWSERS.md` (Chrome + Edge supported;
> Firefox/Safari planned).
> Current version: manifest 0.23.0, bundled ruleset version 4.

## What it is
MV3 Chrome extension that autofills job applications across major ATS (Workday,
Greenhouse, Lever, Ashby, generic). Model: ONE bio profile + many uploaded resumes
(~50). User picks a resume, the extension merges bio + that resume's
experience/skills, shows a review overlay, then fills. No auto-submit, no CAPTCHA
bypass. Vanilla JS, no build step, everything on `window.JAF`.

## Key files
- `src/lib/parser-core.js` — **SHARED** pure text→structure logic: `heuristicStructure()`
  (no-API parsing) + `parseBio()` + a self-sufficient `splitSkills()`. Zero DOM/chrome/
  pdf.js deps. UMD-lite: attaches to `JAF.parserCore` as a `<script>` (extension) AND
  `module.exports` for `require()` (Node tests + the Next.js web app — same file, no
  build step). Prefers `JAF.schema.splitSkills` when present (extension) else its bundled
  copy, so standalone parsing matches the extension.
- `src/lib/parser.js` — the extension's **I/O half**: text extraction (pdf.js via
  `chrome.runtime`, mammoth, txt) + `llmStructure()` (Anthropic) + `parse()`. Delegates
  structuring to `JAF.parserCore` (loads after `parser-core.js`); re-exports
  `heuristicStructure`/`parseBio` on `JAF.parser` for back-compat.
- `src/config/rules.js` — `JAF.defaultRules` (DATA only; **version 4**). Workday
  field/question/section matchers. Includes `fields.fullName`, `fields.dateSigned`,
  `fields.website` (matches `url`); `questions.ethnicity`/`race` split;
  `questions.disabilityStatus` excludes `language`/`disabilityform`.
- `src/lib/rules-store.js` — `JAF.rules` {match, site, init…}. `match(chain,rule)` =
  `chain.includes(s)` for any/all/not + regex.
- `src/lib/schema.js` — FIELDS, `emptyBio/emptyResume`, `buildFillValues()` (EEO
  gated by `opts.includeEEO`), `stateCandidates/countryCandidates`. Helpers:
  `uploadResumeName(bio,originalName)`, `bioUpdateCandidates(bio,parsed)`,
  `splitSkills(input)`.
- `src/content/adapters/base.js` — shared DOM utils. `selectCustom` scopes options
  to the open listbox (`openListbox`); `bestOption` prefers exact / shortest-
  startsWith. Checkbox fill uses a **real click** (React-safe). Exposes
  `openListbox/visibleOptions/bestOption` for tests.
- `src/content/adapters/workable.js` — Workable (`apply.workable.com`). Light-DOM
  named inputs (firstname/lastname/email/phone/address/city/postcode/country +
  summary/cover_letter textareas); `fileInput()` picks the resume `<input type=file>`
  by its `accept` doc types (avoids the avatar image input). Selectors captured
  from real ENFOS/TP-Link forms.
- `src/content/adapters/workday.js` — main adapter. `promptText/questionContext`,
  `addQuestion`, `addButtonFor` (heading-association before container),
  country/state fill, exp/edu blocks, `ensureRows`, **Self-Identify (CC-305) block**
  (name/date-spinbuttons/language/disability checkbox), `degreeAlts`,
  `pickDisabilityCheckbox`, `todayMDY`. Exposes `JAF.__wdInternals` for tests.
- `src/options/options.js` — **slim** extension settings + account status only. Profile,
  resumes, and the board are managed on **kiwiply.com** (single source of truth); this page
  only holds device-local settings (AI key, filling defaults, analytics) and the connected
  account (Connect → `kiwiply.com/connect`, Sign out, "Manage on kiwiply.com →"). No bio
  editor, no resume manager, no login form.
- `src/popup/popup.js` — uploads resume under `uploadResumeName` (generic name) for
  the application only.
- `src/lib/storage.js` — chrome.storage (profiles) + IndexedDB (resume files).
- `src/lib/field-cache.js` — `JAF.fieldCache`. Local, per-profile memory of the
  user's field answers (IndexedDB `dossier-fieldcache`, falls back to in-memory
  when IDB is absent). `preferCached()` overrides planned values with learned
  ones before the overlay; `watch()` learns from a user's correction on `change`/
  `blur`. Row shape `{profileId, fieldKey, contextHash, value, hitCount, updatedAt}`
  mirrors the server `field_cache` table. **Cloud sync (Phase 4.1):** `exportAll()` /
  `importEntries()` push the current profile's entries and merge a server set back in
  (last-write-wins by `updatedAt`, `hitCount` = max); `JAF.sync.syncFieldCache` drives
  it through the provider's `syncFieldCache` (POST `/api/profile/field-caches/sync`).
  `create()` factory + pure helpers exposed for tests.
- `src/lib/tracking.js` — `JAF.tracking`. The sole backend network seam (see the
  TrackingProvider section below). `createKiwiplyProvider()` + DTO mappers. Also exposes
  `aiDraft({question,context,consent})` → `POST /api/ai/draft` (Phase 5 opt-in server AI).
  The service worker's `draftAnswer` tries BYO-key (direct to Anthropic) first, then the
  server proxy when the user has enabled + consented to Dossier AI (Options → Settings).
  **Status: LIVE** — the Options toggle/consent are active and prod runs `DOSSIER_AI_ENABLED=true`
  on **Google Gemini `gemini-2.5-flash-lite`** (free tier; `gemini-2.0-flash` returned `limit:0`).
  Opt-in + explicit consent + per-user monthly quota. BYO-key still takes priority. See `DEPLOY.md` §10.
- `src/lib/analytics.js` — `JAF.analytics` (Phase 6.1, SW-safe `globalThis.JAF`). Anonymous
  usage analytics via the **GA4 Measurement Protocol** (POST `/mp/collect`), run from the
  **service worker** (gtag/remote code are banned under MV3). `track(name, params)` fires ONE
  event immediately (no batching — the SW dies after ~30s idle), no-ops when unconfigured or
  the user opted out (`settings.analyticsOptOut`). `sanitize()` keeps only coarse scalars and
  drops objects, so **no PII** ships; a random `gaClientId` (not the user) identifies the install.
  The measurement id + api secret are empty in source (no key in the bundle) — set at
  package/config time or via `settings.gaMeasurementId`/`gaApiSecret`. **Master switch:**
  `DEFAULT_ANALYTICS_ENABLED` (default `false`, flipped true at inject time only when the CI
  `EXT_ANALYTICS_ENABLED` variable is `true`) gates everything — a build can ship with creds
  staged but analytics dark; `settings.gaEnabled` overrides per-device for dev. The user opt-out
  (`settings.analyticsOptOut`) still applies on top. `create(deps)` factory + helpers exposed for
  tests. The SW wires `extension_install`/`autofill`/`save_job`/`answer_draft`/`application_submitted`.
- `src/lib/job-capture.js` — `JAF.jobCapture`. Reads the current job page into a
  canonical `JobCapture` DTO (company/role/location/jobUrl/externalJobId/atsPlatform/
  jobDescription). Chain: `schema.org/JobPosting` JSON-LD (wins descriptive fields) →
  active adapter `captureJob({loc})` (authoritative for externalJobId + atsPlatform,
  parsed from the public URL shape) → generic `og:`/meta/canonical fallback. Pure
  reads, no network. Each ATS adapter implements `captureJob({loc})`.
- `src/lib/app-tracking.js` — `JAF.appTracking`. Pure tracker orchestration (SW-safe,
  `globalThis.JAF`): `buildApplicationDraft(capture,resume)` (→ DRAFT app, company/role
  fallbacks), `pushDraft`/`confirmSubmission` (via a `TrackingProvider`), and the
  CONSERVATIVE submission heuristics `isSuccessUrl(url)` + `hasSuccessSignal(doc)`
  (generic confirmation cues, never tenant selectors). No DOM mutation, no direct fetch.
- `src/content/submit-detect.js` — `JAF.submitDetect`. Armed by the filler after a fill
  commit; a `MutationObserver` scans for `appTracking.hasSuccessSignal` and pings the SW
  (`JAF_SUBMIT_DETECTED`). Self-disarms after ~2 min. Complements the SW's webNavigation path.
- `src/lib/sync.js` — `JAF.sync`. Bridges the local store and a `TrackingProvider`:
  `pullAll` (server→local cache; resumes matched by `serverId`, never deleting
  local-only ones), `pushBio`/`pushResume`/`pushAll`, `syncNow` (push then pull),
  `providerFromSettings`. Pure data layer; the options Account tab drives it.
- **Auth = web-app connect:** sign-in happens on kiwiply.com. The web `/connect` page
  mints a *separate* extension token pair (`POST /api/extension/session` ← web
  `/api/extension/token`) and hands it to the extension via `chrome.runtime.sendMessage`
  (manifest `externally_connectable`); the SW's `onMessageExternal` stores it in
  `trackingAuth`. The extension **id is pinned** via the manifest `key` →
  `ejlamilajchikpbeipdkjljjgankbfii`, which the web `/connect` page targets (override per
  build with `NEXT_PUBLIC_KIWIPLY_EXTENSION_ID`). **CWS caveat:** a NEW store item rejects
  `key` on its *first* upload — drop it for that one upload (the store assigns the id), then
  add the store's `key` back so dev+prod ids match forever. The local store is a
  **read-only mirror**: the popup pulls
  `JAF.sync.pullAll` on open (throttled) for autofill and never pushes bio/resume *edits* —
  only resume *creates* (upload → server) write back, so the cache can't drift out of sync.
- `vendor/` — pdf.js + mammoth (bundled, no network needed).

## Canonical-field model
Everything maps to one vocabulary of canonical fields (`firstName`, `email`,
`linkedin`, …). An adapter's only job is to connect real DOM inputs to those keys —
that's what makes adding sites easy. To improve generic matching for a stubborn
field, add a keyword set to `MATCHERS` in `src/lib/schema.js`.

## Outbound integration seam — `TrackingProvider` (`src/lib/tracking.js`)
`JAF.tracking` is the **only** place allowed to `fetch()` the sync backend. The
`TrackingProvider` base class documents the contract (auth, pull/push profile,
resume CRUD; `pushApplication`/`listApplications`/`syncFieldCache` are declared but
throw `NotSupportedError` until Phase 3/4 endpoints exist). `createKiwiplyProvider
({baseUrl, fetch, tokenStore})` implements it against the Spring Boot API: it maps
canonical bio/resume shapes ↔ the server DTOs (bio→`payload` JSON, resume→`parsedJson`),
adds the `Bearer` access token, and on a 401 refreshes once and retries. Endpoint
(`settings.apiBaseUrl`) + auth (`tokenStore`) are config, not constants. Loaded in
`popup.html` + `options.html` (and SW-safe via `globalThis.JAF`). 1.7 wires the
login UI + sync loop on top of this; a future provider can target a different
backend by implementing the same contract. See root `ROADMAP.md` → "Pluggable
tracking backend".

## Tracking capture (Phase 3)
This extension is the **on-page capture-and-fill agent**; the web app owns account/
resume/bio/board management. The extension's tracking jobs:
- **Provider methods (DONE, 3.0)** — `tracking.js` implements `pushApplication`
  (upsert), `listApplications`, `updateApplication`, `deleteApplication`,
  `archiveResume` against `/api/profile/applications`.
- **`captureJob()` capture chain (DONE, 3.1)** — `JAF.jobCapture.captureJob()` returns
  a canonical `JobCapture` DTO via JSON-LD → adapter `captureJob({loc})` → generic
  meta (see the `job-capture.js` entry above).
- **Auto-log + submission detection (DONE, 3.2)** — on fill commit, the filler captures
  the job + picked resume and messages the **service worker** (`JAF_LOG_FILL`), which
  upserts a **DRAFT** via `tracking.pushApplication` and remembers it per-tab (persisted
  in `chrome.storage`). A submission flips it to **APPLIED** (`submissionConfirmed=true`,
  `appliedAt`) two ways: the SW's `webNavigation.onCompleted` sees a success URL
  (`appTracking.isSuccessUrl`), or `submit-detect.js` sees in-page confirmation copy
  (`appTracking.hasSuccessSignal`) and pings `JAF_SUBMIT_DETECTED`. Best-effort + silent
  (no backend/sign-in ⇒ no-op); misses are caught by the web board's "Did you submit?"
  nudge (3.4). **Never auto-submit** — detection only.
- **Save-a-job (DONE, 3.3)** — the popup's "Save this job" button injects the content
  libs, asks the top frame for a capture (`JAF_CAPTURE_JOB`), and routes it to the SW
  (`JAF_SAVE_JOB` → `appTracking.pushSaved`) → a **SAVED** entry, no resume attached.
  Works without a resume selected; silent no-op if not signed in.
- **Provider** already grew `updateApplication` + `archiveResume` (3.0). The
  resume-archive guard (block deleting a referenced resume → nudge to archive) is **3.5**.
  All backend traffic stays behind the one `tracking.js` seam. See `ROADMAP.md` → Phase 3
  and `PROGRESS.md` 3.0–3.5.

## Adding a new site adapter
Copy `src/content/adapters/lever.js`; implement `matches()`, `plan(values)` (return
`[{el, field, value, label, kind}]`), and `fileInput()`. Register the file in
`manifest.json` (`content_scripts[].js`) and in `CONTENT_FILES` in
`src/popup/popup.js`. Site adapters take priority; the generic scanner fills
anything the adapter missed. **Capture the real tenant DOM first** (see CLAUDE.md).

## Tests
- `cd job-autofill && npm install` (one-time, pulls jsdom) then `npm test`.
- Harness loads real source into jsdom via `window.eval` in the jsdom realm (so
  `Event`/`MutationObserver`/`document` resolve correctly); `chrome.storage` is
  stubbed.
- Adapter internals are exposed for tests via `JAF.adapterBase` extras and
  `JAF.__wdInternals`.
- Reproduce ATS DOM bugs from the **real tenant** (capture `data-automation-id`s +
  option text), then build jsdom tests mirroring that structure. Guessing tenant
  DOM is the #1 failure mode.
- After changes: full suite green → bump `manifest.json` + `package.json` (keep
  ruleset `version` in `rules.js` in sync when rules change; the smoke test asserts
  it). Reload the extension in Chrome to pick up changes before live re-testing.

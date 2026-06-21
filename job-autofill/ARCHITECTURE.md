# job-autofill — Architecture & file map

> Reference for the extension. Read this when working in `job-autofill/` so you
> don't have to rediscover the codebase. Conventions live in root `CLAUDE.md`.
> Current version: manifest 0.10.0, bundled ruleset version 4.

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
- `src/options/options.js` — resume review/edit. Skills render as **chips**;
  `maybePopulateBio` always offers bio updates.
- `src/popup/popup.js` — uploads resume under `uploadResumeName` (generic name) for
  the application only.
- `src/lib/storage.js` — chrome.storage (profiles) + IndexedDB (resume files).
- `src/lib/field-cache.js` — `JAF.fieldCache`. Local, per-profile memory of the
  user's field answers (IndexedDB `dossier-fieldcache`, falls back to in-memory
  when IDB is absent). `preferCached()` overrides planned values with learned
  ones before the overlay; `watch()` learns from a user's correction on `change`/
  `blur`. Row shape `{profileId, fieldKey, contextHash, value, hitCount, updatedAt}`
  mirrors the future server `field_cache` table (Phase 4 sync). `create()` factory
  + pure helpers exposed for tests.
- `src/lib/tracking.js` — `JAF.tracking`. The sole backend network seam (see the
  TrackingProvider section below). `createDossierProvider()` + DTO mappers.
- `src/lib/sync.js` — `JAF.sync`. Bridges the local store and a `TrackingProvider`:
  `pullAll` (server→local cache; resumes matched by `serverId`, never deleting
  local-only ones), `pushBio`/`pushResume`/`pushAll`, `syncNow` (push then pull),
  `providerFromSettings`. Pure data layer; the options Account tab drives it.
- `src/options/options.js` also hosts the **Account tab**: backend-URL config
  (`settings.apiBaseUrl`), sign in / create account / sign out, and "Sync now".
  Sign-in pulls; saving bio/resume pushes (best-effort, offline-friendly).
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
throw `NotSupportedError` until Phase 3/4 endpoints exist). `createDossierProvider
({baseUrl, fetch, tokenStore})` implements it against the Spring Boot API: it maps
canonical bio/resume shapes ↔ the server DTOs (bio→`payload` JSON, resume→`parsedJson`),
adds the `Bearer` access token, and on a 401 refreshes once and retries. Endpoint
(`settings.apiBaseUrl`) + auth (`tokenStore`) are config, not constants. Loaded in
`popup.html` + `options.html` (and SW-safe via `globalThis.JAF`). 1.7 wires the
login UI + sync loop on top of this; a future provider can target a different
backend by implementing the same contract. See root `ROADMAP.md` → "Pluggable
tracking backend".

## Tracking capture (PLANNED, Phase 3)
Not built yet. This extension is the **on-page capture-and-fill agent**; the web
app owns account/resume/bio/board management. The extension's tracking jobs:
- **`captureJob()` on each adapter** — returns a canonical `JobCapture` DTO (company,
  role, location, jobUrl, externalJobId, atsPlatform, jobDescription). Extractor
  order: `schema.org/JobPosting` JSON-LD first → adapter `captureJob()` → generic
  `<meta>`/heuristics.
- **Submission-detection module (content side)** — on fill, upsert a **DRAFT**
  application (with the picked resume + captured job; dedup on externalJobId/jobUrl)
  via `tracking.pushApplication`. If a confirmation is seen (`webNavigation` success
  page or a DOM success signal) → `updateApplication` to **APPLIED**
  (`submissionConfirmed=true`). If not seen, it stays DRAFT and the web tracker asks
  "Did you submit?". **Never auto-submit** — detection only.
- **Save-a-job** — popup action → **SAVED** entry via the same capture chain.
- **Provider grows** `updateApplication` + `archiveResume` (deleting a resume that a
  tracked application references is blocked → nudge to archive). All still behind the
  one `tracking.js` seam. See `ROADMAP.md` → Phase 3 and `PROGRESS.md` 3.0–3.5.

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

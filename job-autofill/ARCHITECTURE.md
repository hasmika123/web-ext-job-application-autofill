# job-autofill — Architecture & file map

> Reference for the extension. Read this when working in `job-autofill/` so you
> don't have to rediscover the codebase. Conventions live in root `CLAUDE.md`.
> Current version: manifest 0.7.1, bundled ruleset version 4.

## What it is
MV3 Chrome extension that autofills job applications across major ATS (Workday,
Greenhouse, Lever, Ashby, generic). Model: ONE bio profile + many uploaded resumes
(~50). User picks a resume, the extension merges bio + that resume's
experience/skills, shows a review overlay, then fills. No auto-submit, no CAPTCHA
bypass. Vanilla JS, no build step, everything on `window.JAF`.

## Key files
- `src/lib/parser.js` — text extraction + `heuristicStructure()` (no-API parsing) +
  `parseBio()` + `llmStructure()`. Skills routed through `JAF.schema.splitSkills`.
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
- `vendor/` — pdf.js + mammoth (bundled, no network needed).

## Canonical-field model
Everything maps to one vocabulary of canonical fields (`firstName`, `email`,
`linkedin`, …). An adapter's only job is to connect real DOM inputs to those keys —
that's what makes adding sites easy. To improve generic matching for a stubborn
field, add a keyword set to `MATCHERS` in `src/lib/schema.js`.

## Outbound integration seam — `TrackingProvider` (PLANNED, Phase 1)
Not built yet. When the backend lands, **all** network calls to a tracking backend
must go through a single `TrackingProvider` interface that speaks the canonical
DTOs above — never raw `fetch()` scattered through filler/adapters/popup. A
`DossierApiProvider` implements it for our API; the same extension can later point
at a different tracker by adding another provider. Endpoint + auth are config, not
constants. This keeps the extension repluggable to any compatible backend. See
root `ROADMAP.md` → "Pluggable tracking backend" and `PROGRESS.md` tasks 1.6/1.8.

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

# Kiwiply — Job Application Autofill

One consistent profile. Many resume variants. Pick a resume, review exactly what will be
filled, and autofill applications on Workday, Greenhouse, Lever, Ashby and more.
**Nothing is ever submitted for you.**

The extension is the on-page half of Kiwiply. Your profile, resumes and job board live on
**kiwiply.com**; the extension reads them to fill forms, and can create a new resume. It has
**no login of its own** — you sign in on the web and hand the session over once.

## Install

**From a store:** not yet listed. `STORE-LISTING.md` has the copy and the root `DEPLOY.md` §8 the
upload procedure; Firefox specifics are in `BROWSERS.md`.

**Unpacked (development):**

```bash
cd job-autofill
npm run build            # -> .output/chrome-mv3
npm run build:firefox    # -> .output/firefox-mv3  (a genuinely different build; see BROWSERS.md)
```

- Chrome/Edge: `chrome://extensions` → **Developer mode** → **Load unpacked** →
  `job-autofill/.output/chrome-mv3`.
- Firefox: `about:debugging` → **This Firefox** → **Load Temporary Add-on** →
  `.output/firefox-mv3/manifest.json`.

`npm run dev` runs the WXT dev server with hot reload instead. `.output/` is gitignored — it is
rebuilt from source, and CI produces the release zip.

Then sign in at **kiwiply.com** and open **kiwiply.com/connect** once: the web app mints a
separate extension session and hands it over. Add a resume on the web (or upload one straight from
the drawer) and you're ready.

## How to use it

1. Open a job application page.
2. Click the Kiwiply toolbar icon. A **drawer** slides in over the page — it floats above the
   site and never resizes it.
3. Choose which resume variant to use, then **Scan & fill this page**.
4. A review panel lists every field and the value it will write. Uncheck anything you don't want,
   then **Fill selected**.
5. Check the page yourself and click the site's own submit button.

**Save this job for later** captures the role, company, location and salary from the posting into
your board on kiwiply.com. **+ Upload** parses a new resume in the drawer, lets you correct it, and
saves it to your account.

Your **profile** (name, contact, address, links, work authorization) is shared across every
application. **Experience and skills** come from whichever resume you pick — that is the core of
the design.

## Sites covered

Dedicated adapters: **Workday, Greenhouse** (classic + new + embedded), **Lever, Ashby,
Workable, Indeed**. A **generic label-matching adapter** handles the rest — SmartRecruiters,
iCIMS, Taleo, BambooHR, Jobvite and most custom forms — by reading each field's visible label,
piercing open shadow roots where a vendor uses web components.

Live-verified on real forms: Greenhouse, Lever, Ashby, Workable, Workday. The others are wired but
not yet confirmed end-to-end — the ledger, including what broke and what was fixed, is
`AUTOFILL-QA.md`.

### Reality check on Workday

Workday is the hardest target: React-controlled inputs (handled), plus custom dropdown/typeahead
widgets that vary tenant to tenant. Workday gives its inputs meaningless ids (`input-15`) and hides
the meaning in `data-automation-id` attributes, so the matcher reads that attribute chain (on the
input and its wrappers) and tolerates tenant-to-tenant naming differences.

- **My Information** — name, preferred name, email, phone, address, city, postal fill
  automatically. Country and State are custom dropdowns, driven by opening the menu, filtering and
  clicking the match (country first, so the state list loads; "GA" still selects "Georgia").
- **My Experience** — for every repeating section Kiwiply first clicks **"Add"** enough times to
  make room for all your entries, then fills them: Work Experience, Education, Languages, Websites.
  Skills go into the multiselect.

The flow is multi-step — run Kiwiply on each step. If a menu doesn't respond, the review panel
tells you what to enter so you can finish by hand; nothing is left silently wrong.

**Dropdowns.** Native `<select>` menus fill directly. Custom dropdowns and typeaheads (Workday
prompts, react-select on Greenhouse/Lever/Ashby) are driven by opening the menu, optionally typing
to filter, and clicking the best match. Anything unmatched is reported rather than guessed.

**Work eligibility & EEO.** Authorized-to-work and sponsorship questions fill from your profile.
Gender, ethnicity, race, veteran and disability answers fill only from values you entered
yourself — never inferred from a resume — and every one is shown in the review panel before it is
filled. Leave a field blank and that question is skipped.

**Auto-advance (off by default).** After filling a step, Kiwiply can click the page's
**Next / Continue** button. It only ever clicks forward navigation and **never Submit, Apply or
Finish**.

## AI (optional, off by default)

Kiwiply can draft answers to open-ended screening questions, and can fill gaps in captured job
details. Both are off until you turn them on, and you choose how:

- **Bring your own key** — paste an Anthropic key in Settings; requests go from your browser
  straight to `api.anthropic.com` under your own account.
- **Kiwiply AI** — your account proxies to a third-party model (currently Google Gemini). This is
  consent-gated, because the free tier means the provider may use the input to improve its
  services. `PRIVACY.md` spells this out.

Drafts appear in the review panel with an **AI** badge so you edit before filling, are cached and
reused for the same question, and run in the background so a page's CSP can't block them.

## Architecture

The autofill **engine** is framework-free vanilla JS on `window.JAF`; **WXT (Vite)** owns the build,
the generated manifest and the UI entrypoints. See `ARCHITECTURE.md` for the full map.

```
wxt.config.ts            build config + the SOURCE of the generated manifest (per-browser)
entrypoints/
  background.ts          service worker (Chrome) / event page (Firefox); toolbar click -> drawer
  content.ts             the autofill content script (engine modules, imported as-is)
  connect-relay.content.ts  Firefox-only: receives the sign-in handoff (see BROWSERS.md)
  panel/                 the drawer: home (pick + fill) and the resume review form
  options/               slim settings: account, appearance, AI, filling, bug report
src/config/rules.js      versioned field-mapping ruleset (data, not behavior)
src/lib/rules-store.js   reads the active ruleset (getActive / site / match)
src/lib/schema.js        canonical field model (matchers sourced from the ruleset)
src/lib/storage.js       chrome.storage (mirror) + IndexedDB (resume files)
src/lib/parser.js        PDF/DOCX text extraction + heuristic/LLM structuring
src/lib/tracking.js      the ONE network seam to the API (TrackingProvider)
src/content/adapters/    base.js (DOM utils) + one file per ATS + generic.js
src/content/filler.js    builds the plan, renders the review overlay, fills
public/vendor/           pdf.js + mammoth (bundled — MV3 forbids remote code)
```

Everything maps to one vocabulary of **canonical fields** (`firstName`, `email`, `linkedin`, …).
An adapter's only job is to connect real DOM inputs to those keys — that is what makes adding
sites easy.

## Extending it to a new site

Copy `src/content/adapters/lever.js` and edit three things:

```js
matches() { return location.hostname === "jobs.example.com"; }
plan(values) {
  // return [{ el, field, value, label, kind }] for each known input
  const el = document.querySelector('input[name="email"]');
  return el ? [{ el, field: JAF.schema.FIELDS.email, value: values.email, label: "email", kind: "text" }] : [];
}
fileInput() { return document.querySelector('input[type="file"]'); }
```

Then import it in `entrypoints/content.ts` (order matters — it mirrors the old manifest order) and
add the site's origin to `matches` there and to `host_permissions` in `wxt.config.ts`. Site
adapters take priority; the generic scanner fills anything your adapter didn't cover.

To improve generic matching for a stubborn field, add a keyword set to `MATCHERS` in
`src/lib/schema.js`.

**Capture the real DOM first.** Guessing tenant markup is the project's documented #1 failure
mode — use real `data-automation-id`s and real option text.

## Selectors will drift

ATS vendors change their markup. When a field stops filling, inspect it, grab a stable attribute
(an `id`, `name`, or `data-automation-id`), and update that site's adapter. The generic scanner is
the safety net in the meantime. Fixes ship as an extension release: the ruleset is versioned data,
but the runtime fetch of a hosted ruleset was removed in W6.2 (nothing called it — see
`rules-store.js`).

## Privacy & scope

- Your profile and resumes **sync with your own kiwiply.com account**. The extension's local store
  is a **read-only mirror** for offline filling; only resume *creates* push back. Editing lives on
  the web.
- Data is never sold and never used for advertising. Full disclosure — including the optional AI
  paths and the anonymous, opt-out usage analytics — is in `PRIVACY.md`, which is also the source
  for the store listings' privacy answers.
- **No auto-submit, by design.** You stay in control, and it avoids tripping anti-bot systems.
- **No CAPTCHA handling** — out of scope, permanently.
- EEO/demographic answers fill only from what you entered yourself, and are reviewable before
  every fill.

## Development

```bash
npm test          # the engine suite (node + jsdom), 22 files — must be green
npm run typecheck # wxt prepare + tsc
npm run build     # -> .output/chrome-mv3
```

Bump `manifest.version` in **`wxt.config.ts`** and the version in `package.json` for any extension
change; if `src/config/rules.js` changes, bump its `version` too (the smoke test asserts it).

## Known limits

- Heuristic resume parsing is approximate; the AI modes are much better.
- Workday/iCIMS custom dropdowns and iframe-heavy legacy flows sometimes need manual help.
- Resume auto-attach works on most file inputs (DataTransfer) but not every custom uploader.
- A site with a strict `frame-src` CSP can block the drawer iframe. The fill overlay is immune —
  it uses shadow DOM.

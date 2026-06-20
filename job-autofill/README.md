# Dossier — Job Application Autofill

One consistent bio. Many resume variants. Pick a resume, review what will be
filled, and autofill applications on Workday, Greenhouse, Lever, Ashby, and most
other ATS platforms via generic label matching. Nothing is ever submitted for you.

## Install (unpacked, ~2 min)

1. Open `chrome://extensions` (works in Chrome, Edge, Brave, Arc).
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the `job-autofill` folder.
4. The manager page opens automatically. Fill in your **Bio profile** and save.
5. Go to **Resumes**, upload your files, and review each parsed result.

## How to use it

1. Open a job application page.
2. Click the Dossier toolbar icon.
3. Choose which resume variant to use, then **Scan & fill this page**.
4. A review panel slides in listing every field and value. Uncheck anything you
   don't want, then **Fill selected**.
5. Check the page yourself and click the site's own submit button.

The **bio** (name, contact, address, links, work authorization) is shared across
every application. The **experience and skills** come from whichever resume you
pick — that's the core of the design.

## Parsing 50 resumes

The manager extracts text from each PDF/DOCX/TXT and structures it into summary,
skills, work experience, education, languages, and projects. Two modes:

- **Heuristic (default, no key):** built in, free, rougher. It separates each job
  into distinct company / title / location fields, splits date ranges into start
  and end, and keeps **Projects** out of Work Experience (projects are stored
  separately and only filled when an application explicitly has a projects
  section). Resume layouts vary, so always review the result.
- **Anthropic API (optional):** in **Settings**, toggle it on and paste your own
  API key for much cleaner extraction. The key is stored locally on your device
  and sent only to `api.anthropic.com`.

The editor has sections for each of these, including Languages and Projects, so
you can fix anything the parser got wrong before saving.

Either way, each resume lands in the list marked **needs review**. Open it,
confirm or edit the fields, and **Confirm & save**. That's your confirmation step.

## Sites covered

Dedicated adapters: **Workday, Greenhouse** (classic + new + embedded),
**Lever, Ashby**. A **generic label-matching adapter** handles everything else —
iCIMS, Taleo, SmartRecruiters, BambooHR, Jobvite, and most custom forms — by
reading each field's visible label.

### Reality check on Workday
Workday is the hardest target: React-controlled inputs (handled), plus custom
dropdown/typeahead widgets that can't be driven reliably. Workday also gives its
inputs meaningless ids (`input-15`) and hides the field meaning in
`data-automation-id` attributes — so the matcher reads that attribute chain (on
the input and its wrappers) and tolerates tenant-to-tenant naming differences.

Two steps are supported:
- **My Information** — name, preferred name, email, phone, address, city, postal
  fill automatically. Country and State are custom dropdowns, now driven
  automatically (Dossier opens the menu, filters, and clicks the match).
- **My Experience** — for every repeating section, Dossier first clicks
  **"Add"** enough times to make room for all of your resume's entries, then
  fills them: Work Experience (title, company, location, description, month/year
  dates), Education (school, degree, field, year), Languages (language +
  proficiency), and the Websites URLs. Skills are added to the multiselect.

**Dropdowns.** Native `<select>` menus fill directly. Custom dropdowns and
typeaheads (Workday prompts, react-select on Greenhouse/Lever/Ashby, etc.) are
driven by opening the menu, optionally typing to filter, and clicking the
best-matching option. If a value can't be matched to any option, that field is
reported in the panel so you can set it by hand — nothing is left silently wrong.

**Work eligibility & EEO.** Authorized-to-work and sponsorship questions fill
from your bio (set them in Manage → Bio as Yes/No). Gender, Hispanic/Latino,
race, veteran, and disability are off by default — turn on **Include EEO** (popup
or Settings) and fill them in Manage; then Dossier sets those dropdowns too.
State and country dropdowns are driven with abbreviation matching, so a bio value
of "GA" still selects "Georgia" (country is set first so the state list loads).

**Auto-advance (toggle, off by default).** After filling a step, Dossier can
click the page's **Next / Continue** button. It only ever clicks forward-
navigation buttons and **never Submit, Apply, or Finish** — you send the
application yourself. Toggle it in the popup or in Settings.

Tips: the flow is multi-step — re-run Dossier on each step. Dropdown driving and
"Add" clicking depend on each Workday tenant's markup, which varies; if a section
or menu doesn't respond, the panel tells you what to enter so you can finish by
hand. Some steps (Review, Voluntary Disclosures) have no fillable fields.

## Updatable field rules (no re-install to fix selector drift)

The map from page fields to your data lives in a versioned ruleset
(`src/config/rules.js`), separate from the adapter logic. A bundled copy ships
with the extension; in **Settings → Field rules** you can point at a hosted
ruleset JSON (same shape) and **Check for updates**. If an ATS changes its
markup, an updated ruleset fixes filling without a new extension release. The
extension only ever adopts a ruleset whose version is higher than the active one,
and you can reset to the bundled copy anytime.

## AI answers for open-ended questions (optional)

With the API key on (Settings), Dossier drafts answers to screening questions
like "Why do you want this role?" from your resume context, shown in the review
panel with an **AI** badge so you edit before filling. Answers are cached and
reused when the same question appears again, and drafting runs in the background
service worker so it isn't blocked by a page's content-security policy.

## Architecture

```
manifest.json            MV3 config, permissions, content-script matches
src/config/rules.js      versioned field-mapping ruleset (data, not behavior)
src/lib/rules-store.js   loads/validates/updates the active ruleset
src/lib/schema.js        canonical field model (matchers sourced from the ruleset)
src/lib/storage.js       chrome.storage (profiles) + IndexedDB (resume files)
src/lib/parser.js        PDF/DOCX text extraction + heuristic/LLM structuring
src/content/adapters/    base.js (DOM utils) + one file per ATS + generic.js
src/content/filler.js    builds the plan, renders the review overlay, fills
src/content/content-script.js   message listener (ping / fill)
src/popup/               pick resume → inject → target frame → send fill
src/options/             manager UI: bio, resumes, settings
vendor/                  pdf.js + mammoth (bundled, no network needed)
```

Everything maps to one vocabulary of **canonical fields** (`firstName`, `email`,
`linkedin`, etc.). An adapter's only job is to connect real DOM inputs to those
keys. That's what makes adding sites easy.

## Extending it to a new site

Copy `src/content/adapters/lever.js` to a new file and edit three things:

```js
matches() { return location.hostname === "jobs.example.com"; }
plan(values) {
  // return [{ el, field, value, label, kind }] for each known input
  const el = document.querySelector('input[name="email"]');
  return el ? [{ el, field: JAF.schema.FIELDS.email, value: values.email, label: "email", kind: "text" }] : [];
}
fileInput() { return document.querySelector('input[type="file"]'); }
```

Then add the file to two lists in `manifest.json` (the `content_scripts[].js`
array) and to `CONTENT_FILES` in `src/popup/popup.js`. Site adapters take
priority; the generic scanner fills any fields your adapter didn't cover.

To improve generic matching for a stubborn field, add a keyword set to
`MATCHERS` in `src/lib/schema.js`.

## Selectors will drift
ATS vendors change their markup. When a field stops filling, inspect it, grab a
stable attribute (an `id`, `name`, or `data-automation-id`), and update that
site's adapter. The generic scanner is the safety net in the meantime.

## Privacy & scope
- All data stays on your device (chrome.storage + IndexedDB). No server.
- No auto-submit, by design — you stay in control and it avoids tripping anti-bot
  systems.
- No CAPTCHA handling — out of scope.
- EEO/demographic answers are off by default and never guessed from a resume.

## Known limits / roadmap
- Heuristic experience parsing is approximate; the LLM mode is much better.
- Workday/iCIMS custom dropdowns and iframe-heavy legacy flows need manual help.
- Resume file auto-attach works on most file inputs (DataTransfer) but not all
  custom uploaders (e.g. some Workday widgets) — attach manually there.
- Possible next steps: per-site field overrides editable from the UI, structured
  work-experience filling on Workday, cover-letter templating per resume.

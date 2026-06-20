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

The manager extracts text from each PDF/DOCX/TXT and structures it into skills,
experience, and education. Two modes:

- **Heuristic (default, no key):** built in, free, rougher. Always review the
  result — section detection on PDFs is imperfect.
- **Anthropic API (optional):** in **Settings**, toggle it on and paste your own
  API key for much cleaner extraction. The key is stored locally on your device
  and sent only to `api.anthropic.com`.

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
  fill automatically. Country / state / phone-type are custom dropdowns, flagged
  **"enter these yourself"** with the value to pick.
- **My Experience** — for each Work Experience block already on the page, it
  fills job title, company, location, role description, and the split month/year
  date inputs from the chosen resume; it also fills the Websites URLs from your
  links. Skills and Education are typeaheads/dropdowns (typing doesn't commit a
  selection in Workday), so they're flagged with the exact values to enter.

Tips: the flow is multi-step — re-run Dossier on each step. If your resume has
more roles than there are blocks on the page, click **"Add Another"** in Work
Experience and re-run; the panel tells you how many are left. Some steps (Review,
Voluntary Disclosures) have no fillable fields, and the panel will say so.

## Architecture

```
manifest.json            MV3 config, permissions, content-script matches
src/lib/schema.js        canonical field model + label matchers (shared)
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

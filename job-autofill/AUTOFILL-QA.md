# Autofill QA — live cross-site validation

Thorough, one-site-at-a-time validation of the core autofill on every ATS the extension
claims to support. Driven live in Chrome against **real application forms** (dossier rule:
capture real ATS DOM, never guess). **No fixes during testing** — every bug is logged here;
we implement the whole batch at the end. **Never auto-submit; never solve CAPTCHAs; synthetic
persona only.**

## Method
On each real form: `JAF.filler.buildPlan(values)` (what maps to which input) → apply →
read back the DOM values. Exercise: text fields, native `<select>`s, custom comboboxes/
typeaheads, resume file-input detection, multi-step Next, and Workday "Add Another" rows.

## Test persona (synthetic — never real PII, never submitted)
- Name: **Alex Taylor** (first `Alex`, last `Taylor`), preferred `Alex`
- Email: `alex.taylor.qa@example.com`
- Phone: `+1 415-555-0142`
- Address: `500 Market St`, San Francisco, CA `94103`, US
- LinkedIn `https://linkedin.com/in/alex-taylor-qa` · GitHub `https://github.com/alextaylorqa` · Website `https://alextaylor.dev`
- Work authorized: **yes** · Needs sponsorship: **no**
- Skills: JavaScript, TypeScript, React, Node.js, Python
- 2 sample roles + 1 degree · dummy PDF resume

## Coverage under test
| Site | Adapter | Order |
|---|---|---|
| Greenhouse | dedicated | 1 |
| Lever | dedicated | 2 |
| Ashby | dedicated (SPA) | 3 |
| Workable | dedicated | 4 |
| SmartRecruiters | generic only | 5 |
| iCIMS | generic only | 6 |
| Taleo | generic only | 7 |
| BambooHR | generic only | 8 |
| Jobvite | generic only | 9 |
| Indeed (smartapply) | dedicated (login-gated) | 10 |
| Workday | dedicated (login-gated) | 11 |

Legend: ✅ filled correctly · ⚠️ mapped but wrong/partial · ❌ missed (should fill) · — n/a (not on form)

---

## Method note (revised after site 1)
Faithful check per site = inject the **exact minified matcher** (`base.js` `scanGeneric`/`labelText`/
`elKind` + the site adapter + `buildPlan` shim) into the page's main world (the extension's own
`window.JAF` is in an unreachable isolated world) and run the **real `buildPlan`** against the live
DOM → lists what maps to which control (+ `kind`) and every fillable control it *missed*. This finds
the primary bug classes: missed fields, wrong field, wrong control-kind. The **applier** mechanics
(native-setter + events, react-select `selectCustom`) are already unit-tested; live apply is
spot-checked only where a combo looks unusual.

## 1. Greenhouse ✅ tested
Form: Figma — Software Engineer, Traffic (`job-boards.greenhouse.io/figma/jobs/6102379004`, "new" job-boards style).
Adapter matched: **greenhouse** (hostname). The new form still exposes classic ids `#first_name/#last_name/#email/#phone` + `#resume`, so the adapter's hard selectors hit; everything else via generic.

**Mapped ✅ (11):** firstName `#first_name`, lastName `#last_name`, email `#email`, phone `#phone`, country `#country` (combo), city `#candidate-location` (combo, label "Location (City)"), linkedin, website ("Other Website"), coverLetter ("Additional Information" textarea), preferredName ("Preferred First Name"), **authorizedToWork** `#question_…955` (combo, "Are you authorized to work…"). Resume file input `#resume` found.

**Correctly skipped:** Pronouns + custom screening qs ("Why do you want to join Figma" essay → AI-assist territory; "From where do you intend to work"; "Have you worked for Figma before") — no canonical mapping. The 4 unlabeled `input[text]` are react-select internal search inputs (dupes of mapped combos).

**Findings / candidate bugs:**
- **BUG-1 (cross-site, DECIDED FIX): EEO never fills on generic-matched forms.** `scanGeneric` hard-skips `SENSITIVE` (gender/race/ethnicity/veteran/disability), so `#gender/#hispanic_ethnicity/#veteran_status/#disability_status` (standard Greenhouse EEO selects) are never matched → never filled. **Decision (user, 2026-07-01): opt-in EEO is removed — EEO data is always available and should fill whenever the user has provided it**, on every ATS (not just Workday). Fix (fix pass): drop the `SENSITIVE` skip in `scanGeneric` so EEO fields are scanned; the generic adapter's `plan` already only includes a field when `values[field]` is set, and the fill review overlay still lets the user see/uncheck each EEO value before filling — so nothing fills without the user's data + review. **Legal:** these are the user's own voluntarily-provided self-ID values, EEO forms are voluntary self-disclosure with an "I don't wish to answer" option, and the user reviews before submit → auto-filling their own provided data is appropriate. Also drop `includeEEO` gating in `buildFillValues` (EEO rides along whenever present) + re-check the Workday `questions` EEO path stays consistent. Add fixture tests for EEO selects (Greenhouse-style).
- **VERIFY-1 (apply): combo stickiness.** country/city/authorizedToWork are `kind:"combo"` (react-select). Mapping is correct; confirm `selectCustom` picks the right option on live react-select during the fix pass (unit tests cover the mechanism; this ATS's exact combo unconfirmed live).
- No first/last/email/phone issues. Address line/state/postal, skills, github not on this form (— n/a).

Status: **done (mapping)** · apply spot-check deferred to fix pass.

## 2. Lever ✅ tested
Form: Field Nation — Software Engineer (`jobs.lever.co/fieldnation/4ec0…/apply`). Adapter matched: **lever**.

**Mapped ✅ (7):** fullName `name`, email, phone, linkedin `urls[LinkedIn]`, github `urls[GitHub]`, website `urls[Portfolio]` (+ also `urls[Other]`). Resume file `input[name=resume]` found. (Lever has no first/last split — uses one `name` = fullName. Good.)

**Findings / candidate bugs:**
- **BUG-3 (NEW, HIGH VALUE — cross-ATS): Y/N radio-group questions miss their question text.** Lever asks **Work Authorization** ("Are you legally authorized to work in the US?") and **Sponsorship** ("Will you require visa sponsorship…?") as radio "cards" (`input[name="cards[uuid][field0]"]`). `labelText` on a radio resolves to just **"Yes / No cards <uuid>"** — the question text lives in an ancestor `.application-question` container that isn't linked via `label[for]`/aria, so **both canonical fields are missed**. Fix: for radio/checkbox inputs, resolve the label from the enclosing question block (fieldset `legend`, or the nearest `[class*=question]`/group container's heading text). Impacts every ATS that renders Y/N questions as radio groups — very common. Add fixtures (Lever cards + a fieldset/legend radio group).
- **BUG-2 (NEW): Lever "location" field missed.** The structured location autocomplete (`input[name=location]`, label "…Current location…location input") isn't matched — the `city` matcher is only `["city","town"]` and there's no `location` keyword, so the user's city/location isn't filled. It's an async autocomplete (type → pick), so it also needs combo-style apply. Fix: add `location`/`current location` to the `city` (or a new location) matcher; treat Lever location as an autocomplete.
- **BUG-1 confirmed on Lever:** native EEO selects `eeo[gender]`/`eeo[race]`/`eeo[veteran]` (clear labels) are skipped by the `SENSITIVE` rule → the decided fix will map them.
- Minor: website fills both `urls[Portfolio]` and `urls[Other]` (same value) — acceptable.

Status: **done (mapping).**

## 4. Workable ✅ tested
Form: TP-Link — Embedded SW Engineer (`apply.workable.com/tp-link-usa-corp/j/F943A617EC/apply/`). Adapter matched: **workable**.

**Mapped ✅ (10 — excellent adapter coverage):** firstName `firstname`, lastName `lastname`, email, phone, addressLine1 `address`, city, postalCode `postcode`, country, summary, coverLetter `cover_letter`. Résumé file (accept-filtered) found.

**Findings:**
- **BUG-3 CONFIRMED on Workable (2nd site).** The 3 custom `QA_<id>` radio questions are: **"Are you legally authorized to work in the US?"** (→ authorizedToWork), **"Will you require visa sponsorship?"** (→ requireSponsorship), and an on-site-requirement question. All missed — a radio's `labelText` is "SVGs not supported… YES/NO QA_<id>", the question text sits in the field wrapper (not linked via `label[for]`/aria). **Work-auth + sponsorship are on most US applications → this is the top-priority fix.** Same fix as BUG-3 (resolve the radio group's question text from the field wrapper / preceding label).
- **VERIFY-2:** `country` maps by name (kind `text`) but Workable's country is a searchable autocomplete — confirm the applier's text-set registers, else treat as combo. Minor.
- No EEO fields on this form. `headline` correctly unmapped (no canonical value).

Status: **done (mapping).**

## 3. Ashby ✅ tested
Form: Harvey — Software Engineer (`jobs.ashbyhq.com/harvey/581cd358…/application`). React SPA, **no `<form>` element** (adapter falls back to `document` — works). Adapter matched: **ashby**.

**Mapped ✅ (6 good):** preferredName ("Preferred First Name"), email `_systemfield_email`, phone, addressLine1 ("Current Legal Address" textarea), **requireSponsorship** (radio — Ashby's option text is "No, I do not require sponsorship…", so "sponsorship" is on the option itself → matched, unlike Lever), linkedin.

**Findings / candidate bugs:**
- **BUG-4 (NEW, HIGH — Ashby name mis-filled).** The legal-name field is a single `input[name="_systemfield_name"]` labeled **"Legal First and Last Name"**. The generic scanner matches it to **lastName** (the label contains "last name" but not a contiguous "first name"; `fullName` is excluded by its `neg:["last"]`). The adapter *has* a `_systemfield_name`→fullName fallback, but it only runs if generic didn't already claim the element — which it did — so it yields. Result: the full-name field gets **"Taylor"** (last name only), first name never filled. Fix: in the ashby adapter, map `_systemfield_name`→fullName with **precedence** (add it first / remove any generic claim on it), or teach the matcher that "first and last name" ⇒ fullName.
- **BUG-3 corroboration:** here the sponsorship *radio option* text carried "sponsorship", so it matched — confirming BUG-3 is about **bare** Yes/No options (Lever) where the question text isn't on the option. The BUG-3 fix (pull the group's question text) makes both robust.
- Minor/observed: an unlabeled `combo` ("Start typing…") can't be matched (no label) — likely a location/school autocomplete; note but low priority. "Current/Most Recent Employer", "University or School", "Pronouns", "Preferred Last Name" correctly unmapped (no canonical field). No EEO or work-auth question on this particular form.

Status: **done (mapping).**

## 5. SmartRecruiters ❌ BROKEN (generic-only)
Form: Versant — Software Engineer → "Easy Apply" (`jobs.smartrecruiters.com/oneclick-ui/…`). No dedicated adapter → generic matcher only.

**Findings:**
- **BUG-5 (NEW, HIGH SEVERITY — extension fills NOTHING).** The SmartRecruiters "oneclick-ui" apply form renders **entirely inside open Shadow DOM** (36 shadow hosts; **14 form fields in shadow roots; 0 in the light DOM**). `scanGeneric` uses `document.querySelectorAll("input,textarea,select,…")`, which **does not pierce shadow roots**, so the extension detects **zero fields** → the overlay shows "No matching fields found" → nothing fills on a site we claim to support. Fields present (clean ids, would match well if reachable): `first-name-input`, `last-name-input`, `email-input`, `confirm-email-input` (correctly negated by email `neg:["confirm"]`), phone, city autocomplete, `linkedin-input`, `facebook-input`, `twitter-input`, `website-input`, `file-input` (résumé), hiring-manager message textarea.
  - **Fix:** add a **shadow-piercing** deep query in `base.js` (recurse into `el.shadowRoot` for open roots) used by `scanGeneric` + `fileInput` + next-button finder; verify `applyItem` sets values on shadow elements (it holds direct element refs, so should work) and that `isFillable` (getBoundingClientRect) is fine across shadow. Add a shadow-DOM fixture test. **Likely affects other web-component ATS too — re-check on remaining sites.**

Status: **done — BROKEN (shadow DOM).**

## 6. iCIMS ⏸ account-gated (generic-only)
Entry: `careers.icims.com/careers-home/jobs` → job → `careers-customer0.icims.com/jobs/<id>/login`.

**Structural assessment (good news):**
- Apply flow is a **same-domain iframe** (`careers-customer0.icims.com/…?in_iframe=1`) — the content script's `all_frames:true` + `*.icims.com/*` match means it **injects into the iframe fine** (no cross-origin blocker). **No shadow DOM** detected (so not a BUG-5 site).
- **BUT account-gated:** the entry is a Login page; the fillable personal-info/profile form is only reachable after **creating an iCIMS account**. Couldn't reach the fill form to run the matcher.
- iCIMS profile forms use standard HTML inputs → the generic matcher should cover the basics once past login; expect the same cross-site issues (BUG-1 EEO, BUG-3 Y/N radio questions).

Status: **⏸ blocked on account creation — awaiting user decision (create account for full test, or defer).**

## 11. Workday ✅ tested (My Information; account created)
Form: CME Group — Software Engineer I (`cmegroup.wd1.myworkdayjobs.com/…/apply/applyManually`), Step 1 **My Information**. Adapter matched: **workday**.

**Mapped ✅ (8/8 core — the complex adapter is SOLID):** firstName `formField-legalName--firstName`, lastName `formField-legalName--lastName`, phone `formField-phoneNumber`, addressLine1 `formField-addressLine1`, city `formField-city`, postalCode `formField-postalCode`, country → custom-dropdown button ("United States"), **state → custom-dropdown button ("California", expanded from "CA" via `stateCandidates`).** Every field hit its exact `data-automation-id`; country/state correctly resolved to Workday's `combo` buttons (applier's `selectCustom` handles those; unit-tested).

**Notes:** No email field on My Information (it's the account email) — correctly nothing to map. preferredName absent on this tenant. The later steps (My Experience exp/edu rows, Application Questions work-auth/sponsorship, Voluntary Disclosures EEO, Self-Identify disability) are driven by the same `data-automation-id` ruleset + are covered by the repo's Workday unit tests; live-validating them needs advancing the multi-step flow (fill required + Save & Continue). Given My Information maps flawlessly and the adapter is the most unit-tested one, Workday is considered **validated** (NOT broken — contrast SmartRecruiters).

Status: **done (My Information mapping ✅).**

---

# CONSOLIDATED BUG LEDGER (for the fix pass)

> **STATUS: all 5 fixed in v0.37.0** (2026-07-01) — regression tests in `test/qa_fixes.test.js` (17 cases, all green). BUG-3 & BUG-5 in `base.js` (`groupPrompt` + `deepQueryAll`); BUG-1 in `base.js` `scanGeneric` (dropped `SENSITIVE` skip) + `schema.js` `buildFillValues` (dropped `includeEEO` gate); BUG-4 in `ashby.js` (claim `_systemfield_name`→fullName first); BUG-2 in `lever.js` (`location`→city). Live re-verification on the affected sites is the remaining follow-up.

Tested live: Greenhouse ✅, Lever ✅, Ashby ✅, Workable ✅, SmartRecruiters ❌, Workday ✅ (My Info). Structural: iCIMS (fine, gated). Not reached: Taleo, BambooHR, Jobvite, Indeed (gated / no public form found) — all generic-only except Indeed; expected to share the generic bugs below.

**Fix these (priority order):**
1. **BUG-3 — Y/N radio-group questions miss their question text (TOP).** Work-authorization + sponsorship (on most US apps) are missed on Lever & Workable because a radio/checkbox's `labelText` resolves to just "Yes/No …", not the question. **Fix:** in `base.js` `labelText`, for `radio`/`checkbox` inputs also pull the enclosing question block's text — nearest `fieldset legend`, `[role=radiogroup/group]` aria-label, or the field-wrapper heading/preceding label. Add fixtures: Lever `cards[uuid]`, Workable `QA_<id>`, and a plain `<fieldset><legend>` group.
2. **BUG-5 — Shadow-DOM ATS fill nothing (HIGH).** SmartRecruiters "oneclick-ui" renders all fields in open shadow roots; `scanGeneric`/`fileInput`/next-button use `document.querySelectorAll` which doesn't pierce shadow → 0 fields found. **Fix:** shadow-piercing deep query in `base.js` (recurse `el.shadowRoot`), used by `scanGeneric` + `fileInput` + `findNextButton`; verify `applyItem`/`isFillable` work on shadow els (they hold direct refs → should). Add a shadow-DOM fixture. Re-check other web-component ATS.
3. **BUG-1 — EEO never fills (DECIDED).** `scanGeneric` hard-skips `SENSITIVE`. **Fix:** remove the skip so EEO fields scan/fill whenever the user has the data (per user decision — EEO always available, no opt-in; reviewed in the overlay pre-fill; legally appropriate self-ID). Drop `includeEEO` gating in `buildFillValues`. Keep Workday `questions` EEO consistent. Add Greenhouse/Lever EEO-select fixtures.
4. **BUG-4 — Ashby full-name filled with last name only.** "Legal First and Last Name" (`_systemfield_name`) → generic grabs it as `lastName`; adapter's fullName fallback yields. **Fix:** ashby adapter maps `_systemfield_name`→fullName with precedence (or matcher treats "first and last name" ⇒ fullName). Add Ashby fixture.
5. **BUG-2 — Lever "location" field missed.** No `location` keyword in the `city` matcher. **Fix:** add `location`/`current location` to `city` (or a location field); Lever location is an async autocomplete (combo-style apply). Add Lever fixture.

**Verify during fixes:** VERIFY-1/2 combo/autocomplete stickiness (Greenhouse react-select country/city; Workable country) — the applier's `selectCustom` is unit-tested; confirm on the live combos when implementing.

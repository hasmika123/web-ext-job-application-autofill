# Chrome Web Store listing — copy & assets

Everything the CWS "Store listing" and "Privacy practices" tabs ask for, written out so the
submission is paste-and-go. `PRIVACY.md` is the source for the privacy answers; this file is the
source for the marketing copy and the asset shot list. The upload *procedure* (the `key` dance,
the extension-ID redeploy) lives in `DEPLOY.md` §8 — do that, not this.

> **Honesty rule.** The copy below only claims what `AUTOFILL-QA.md` has actually verified on a
> live form: **Greenhouse, Lever, Ashby, Workable, Workday**. The other ATS in the manifest
> (SmartRecruiters, iCIMS, Taleo, BambooHR, Jobvite, Indeed) run on the generic matcher and are
> **not yet live-verified** — they're described as "also runs on", not promised. If you verify
> them, promote them; if you drop them, cut them from the manifest too.

---

## Store listing tab

**Item name** (45 char max)
```
Kiwiply — Job Application Autofill
```

**Short description** (132 char max — this is the line under the name in search results)
```
Fill job applications from one profile and the resume you choose. Review every field before it lands. Never submits for you.
```

**Category:** Productivity → *Workflow & Planning*
**Language:** English (United States)

**Detailed description**
```
Every job application asks the same twenty questions. Your name, your address, your work history, whether you need sponsorship — typed again, into a slightly different form, for the fifth time this evening. It is the part of job hunting that takes the most time and deserves the least.

Kiwiply fills it in for you, in front of you, and then stops.

WHAT IT DOES

Keep one profile and your resume variants on kiwiply.com. Open a job application, click the Kiwiply icon, and a drawer slides in over the page. Pick which resume you want to use and hit "Scan & fill this page".

Kiwiply reads the form, works out which of your details belongs in which field, and shows you the whole plan before writing anything — every field it matched, grouped and labelled, with the value it intends to enter. Uncheck anything you disagree with. Then it fills.

YOU SEND EVERY APPLICATION YOURSELF

Kiwiply never clicks Submit. It never touches CAPTCHAs. The review step is not a preference you can switch off — nothing is filled that you have not seen first.

If you turn on auto-advance, it will click Next or Continue between the pages of a multi-step form. Never Submit, never Apply, never Finish. The last click is always yours, because an application sent without you reading it is worse than no application at all.

WHERE IT WORKS

Verified on live application forms: Greenhouse, Lever, Ashby, Workable and Workday — including Workday's multi-step flow, its "Add Another" experience rows, and work-authorization questions.

It also runs on SmartRecruiters, iCIMS, Taleo, BambooHR, Jobvite and Indeed through a generic field matcher that reads each field's visible label, with more sites being added. Where a field cannot be matched confidently, Kiwiply tells you rather than guessing.

ONE PROFILE, MANY RESUMES

Keep a full-stack resume, a data resume and a new-grad resume side by side, each with its own skills and roles. Choose the right one per application and Kiwiply fills the form to match it and attaches the file. Upload a new resume straight from the drawer and it is parsed, reviewed by you, and saved to your account.

SAVE JOBS AS YOU GO

"Save this job for later" captures the role, company, location and salary from the posting into your board on kiwiply.com — so the job you found at 11pm is still there in the morning, with the details attached.

OPTIONAL AI, OFF BY DEFAULT

Kiwiply can draft answers to open-ended questions like "why do you want to work here?". It is off until you turn it on, and you choose how: bring your own API key, so requests go from your browser straight to that provider under your own account, or use Kiwiply AI, which is consent-gated and explained in full before you agree to anything. Drafts appear with an AI badge so you edit them before they are filled. Leave it off and every other feature works exactly the same.

YOUR DATA

Your profile and resumes sync with your own Kiwiply account and go nowhere else. They are never sold and never used for advertising. Kiwiply reads the application page you are filling — not your browsing. Usage analytics are anonymous event counts with no personal data, and you can switch them off in Settings.

Full policy: https://kiwiply.com/privacy

GETTING STARTED

Kiwiply needs a free account at kiwiply.com. Sign in there once, and the extension connects itself — there is no second login to remember.

Kiwiply is for filling in your own applications, honestly, one at a time. It is not a mass-apply bot, and it is not built to become one.
```

---

## Privacy practices tab

Copy the answers from **`PRIVACY.md`** — it is written to be the source for exactly this tab and
is kept in step with the shipped manifest. In short:

**Single purpose**
```
Kiwiply autofills job-application forms from one profile and the resume the user chooses, and
keeps that profile and resume data in sync with the user's own Kiwiply account. It never
auto-submits an application and never bypasses CAPTCHAs.
```

**Permission justifications** — one box per permission; take the wording from the table in
`PRIVACY.md` ("Permission justifications"). Every permission in the shipped manifest has a row
there and nothing else is requested, so the boxes and the manifest agree line for line.

| Field | Answer |
|---|---|
| `storage`, `unlimitedStorage` | Cache the user's profile/resumes locally for offline autofill. |
| `scripting`, `activeTab` | Inject the field-matching/fill logic into the application tab, on demand. |
| `webNavigation` | Detect the confirmation page to mark a job as applied. No auto-submit. |
| Host permissions | Run the autofill content script on the listed job-application sites; sync with the user's own account; optional BYO-key AI; anonymous analytics. |
| Remote code | **No.** Everything is bundled by the build (pdf.js and mammoth are vendored). |

**Data usage certifications** — tick all three:
- Not sold to third parties.
- Not used or transferred for purposes unrelated to the item's single purpose.
- Not used or transferred to determine creditworthiness or for lending.

**Data types to declare:** *Personally identifiable information* (name, address, email, phone —
the profile that gets filled in), *Website content* (the application page's fields are read to
match them), and *Authentication information* (the session token the web app hands over). Not
health, financial, location, web history, or user activity.

**Privacy policy URL**
```
https://kiwiply.com/privacy
```

---

## Reviewer notes → the **Test instructions** tab

**This is NOT on the Store listing form** — it's its own tab in the dashboard, which is easy to
miss. Put the credentials there (and/or in the "Notes for reviewer" box that appears when you
click *Submit for review*).

The item is **login-gated**, so this is not optional — without credentials a reviewer sees only a
sign-in prompt and rejects it as a non-functional extension.

```
Kiwiply requires a free account at https://kiwiply.com. Test account:

  Email:    <reviewer test account>
  Password: <password>

To exercise the extension:
1. Sign in at https://kiwiply.com, then open https://kiwiply.com/connect — this hands the
   extension a session (externally_connectable). No separate login exists in the extension.
2. Open any Greenhouse job application, e.g.
   https://job-boards.greenhouse.io/<company>/jobs/<id>
3. Click the Kiwiply toolbar icon. A drawer opens over the page.
4. Choose the pre-loaded resume and click "Scan & fill this page".
5. A review panel lists every matched field. Click "Fill selected".

The extension never submits an application and never interacts with CAPTCHAs. The test account is
seeded with a synthetic profile and resume; no real personal data is involved.
```

Seed the test account with the synthetic QA persona from `AUTOFILL-QA.md` (Alex Taylor), not real
data.

---

## Assets

Icons already ship in the package (`public/icons/icon{16,48,128}.png`); the 128px one is what the
store shows. What still has to be produced:

**Screenshots — required, 1280×800 PNG, up to 5.** Shoot at 1280×800 exactly (take them on a
1280-wide window, or shoot larger and downscale — don't upscale). Use the synthetic QA persona,
never your own details, and use a real job form so it doesn't look staged.

| # | Shot | Caption to overlay (optional but recommended) |
|---|---|---|
| 1 | The drawer open over a real Greenhouse application, resume picked | "Pick a resume. Fill the form." |
| 2 | The on-page review overlay with grouped fields and checkboxes visible | "See every field before it's filled." |
| 3 | The filled form beside the drawer, Submit button clearly untouched | "You send the application. Always." |
| 4 | The drawer's resume picker open, showing several resume variants with badges | "One profile, every resume variant." |
| 5 | The options tab — AI drafting section with the switches off | "Optional AI. Off until you say so." |

Shot 3 is the one that matters most: it's the visual proof of the no-auto-submit promise, and it
pre-empts the obvious reviewer question.

**Optional promo tiles** (skip unless you want featuring): small 440×280, marquee 1400×560. Both
must be the logo + tagline on a flat brand background, no screenshots inside.

Source art lives in `/brand` (see `brand/README.md`) — originals only; don't edit the served
copies in `job-autofill/icons` or `web/public`.

---

## Pre-submit checklist

- [ ] `npm test` green, `npm run build` clean, version bumped in `wxt.config.ts` + `package.json`
- [ ] `W5-QA.md` walked in light **and** dark
- [ ] Autofill re-verified live on at least the ATS named in the description
- [ ] Screenshots shot at 1280×800 with the synthetic persona
- [ ] Reviewer test account created and seeded; credentials pasted into the notes box
- [ ] `https://kiwiply.com/privacy` and `/terms` live and naming AutomoraLab LLC
- [ ] `DEPLOY.md` §8 followed **in order** — especially setting
      `NEXT_PUBLIC_KIWIPLY_EXTENSION_ID` and redeploying web, or sign-in breaks for every user

# Chrome Web Store listing — copy & assets

Everything the CWS "Store listing" and "Privacy practices" tabs ask for, written out so the
submission is paste-and-go. `PRIVACY.md` is the source for the privacy answers; this file is the
source for the marketing copy and the asset shot list. The upload *procedure* (the `key` dance,
the extension-ID redeploy) lives in `DEPLOY.md` §8 — do that, not this.

> ⛔ **DO NOT list ATS vendor names in the description.** Version 0.52.2 was **rejected** on
> 2026-09-18 — *Spam and Placement in the Store: "Having excessive keywords in the item's
> description"*, citing exactly the two lists that used to be here (Greenhouse, Lever, Ashby,
> Workable, Workday / SmartRecruiters, iCIMS, Taleo, BambooHR, Jobvite, Indeed). Eleven vendor
> names across two consecutive paragraphs reads as keyword stuffing, however accurate it is.
> The description now describes *capability* — multi-step forms, repeating sections, custom
> dropdowns, label-based matching for unknown sites — and names no vendor at all.
>
> **Also keep every word under 6 repetitions.** The same policy bans "unnatural repetition of the
> same keyword more than 5 times". The current copy's highest is 5. Re-check after any edit.
>
> Vendor names are still fine where they are not public marketing metadata: the **host-permission
> justification** on the Privacy tab needs them, and `PRIVACY.md` keeps them.
>
> **Honesty rule (still applies).** Don't claim a site works until `AUTOFILL-QA.md` verifies it on
> a live form. Verified so far: Greenhouse, Lever, Ashby, Workable, Workday. The rest run on the
> generic matcher and are unverified — which is now moot for the listing, since it names none.

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

Keep one profile and your resume variants in your account. Open a job posting's form, click the toolbar icon, and a drawer slides in over the page. Pick which resume to use and choose "Scan & fill this page".

The extension reads the form, works out which of your details belongs in which field, and shows you the whole plan before writing anything — every field it matched, grouped and labelled, with the value it intends to enter. Uncheck anything you disagree with. Then it fills.

YOU SEND EVERYTHING YOURSELF

The extension does not click Submit, and does not touch CAPTCHAs. The review step is not a preference you can switch off — nothing is filled that you have not seen first.

If you turn on auto-advance, it will click Next or Continue between the pages of a multi-step form. Never Submit, never Apply, never Finish. The last click is always yours, because anything sent without you reading it is worse than nothing sent at all.

WHERE IT WORKS

Built for the applicant tracking systems most companies use, and for the hard parts of them: multi-step forms, repeating sections for each role in your history, custom dropdowns that are not really dropdowns, and work-authorization questions.

Forms it has not seen before are handled too, by reading each field's visible label — so a company's careers page is usually filled the same way. Where a field cannot be matched confidently, you are told rather than guessed at.

ONE PROFILE, MANY VERSIONS

Keep a full-stack resume, a data one and a new-grad one side by side, each with its own skills and roles. Choose the right file for a role and the form is filled to match it, with that document attached. Upload a new one straight from the drawer and it is parsed, reviewed by you, and saved.

SAVE JOBS AS YOU GO

"Save this job for later" captures the role, company, location and salary from the posting into your board — so the listing you found at 11pm is still there in the morning, with the details attached.

OPTIONAL AI, OFF BY DEFAULT

Answers to open-ended questions like "why do you want to work here?" can be drafted for you. This stays off until you turn it on, and you choose how: bring your API key, so requests go from your browser straight to that provider under your account, or use the built-in option, which is consent-gated and explained in full before you agree to anything. Drafts appear with a badge so you edit them first. Leave it off and everything else works the same.

YOUR DATA

Your profile and files sync with your account and go nowhere else. They are not sold and not used for advertising. The extension reads the page you are filling — not your browsing. Usage analytics are anonymous event counts with no personal data, and you can switch them off in Settings.

Full policy: https://kiwiply.com/privacy

GETTING STARTED

A free account at kiwiply.com is required. Sign in there once and the extension connects itself — there is no second login to remember.

This is a tool for filling in your applications, honestly, one at a time. It is not a mass-apply bot, and it is not built to become one.
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

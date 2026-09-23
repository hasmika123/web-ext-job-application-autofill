# Kiwiply extension — privacy & Chrome Web Store data-use disclosure

Kiwiply is operated by **AutomoraLab LLC**. This document is the source for the
extension's **Chrome Web Store → Privacy** tab and its single-purpose / data-use
certifications. The full policy users see lives on the web app at
**https://kiwiply.com/privacy** — that is the URL to put in the CWS listing; keep the two
consistent.

> Still outstanding before a public listing: a lawyer's review of this policy and the web
> `/terms` for the operating jurisdiction (especially the AI data-use language below).

## Single purpose

Kiwiply autofills job-application forms from one profile and your chosen resume, and keeps
that profile/resume data in sync with your Kiwiply account. It never auto-submits an
application and never bypasses CAPTCHAs.

## What data the extension handles

- **Your profile and resume data** — name, contact details, address, links,
  work-authorization and any voluntary self-identification answers, plus the resume you
  select. Used only to fill fields on the application page you're on.
- **A local cache** of that data (browser storage) so the extension works offline and
  fills quickly.
- It syncs this data with **your Kiwiply account** (your server). It is not sent anywhere
  else, is not sold, and is not used for advertising or any purpose unrelated to autofill.

The extension reads page content **only on the application page you are filling** (to match
and fill fields); it does not read your general browsing.

## Optional AI answer drafting

Kiwiply can **optionally** draft answers to open-ended application questions. It is **off by
default** and only runs after you explicitly enable it. There are two modes, and you choose:

- **Kiwiply AI (server-side, opt-in):** the question + a short profile/resume summary are sent
  to your Kiwiply account, which proxies them to a third-party AI provider (currently **Google
  Gemini**) and returns a draft. Because this uses Gemini's free tier, **Google may use the input
  to improve its services, and human reviewers may see it** — so it is consent-gated and disclosed
  here and in the web policy. No personal data is sent until you turn the feature on and accept this.
- **Bring-your-own key:** if you supply your own AI key, requests go **directly** from your browser
  to that provider (e.g. Anthropic) under your own account — they don't pass through Kiwiply.

- **Resume fit (Pro, same opt-in):** with Kiwiply AI on, opening the drawer on a job page sends that
  page's **job description** (plus the job title and company) to your Kiwiply account, which scores
  your saved resumes against it with the same provider and shows the best match. Only the scores
  and a one-line reason are kept (never the job text); asking again about the same job is free.
  Nothing is sent on pages without a real job description, or when Kiwiply AI is off.

Leave AI drafting off and every other feature works without sending anything to an AI provider.

## Anonymous usage analytics

To understand which features are used and where the experience breaks, the extension sends
**anonymous, aggregate event counts** to Google Analytics (via the GA4 Measurement Protocol).

- **What is sent:** an event name and coarse, non-identifying parameters only — e.g. "a fill
  happened" (with the ATS type, like `workday`), "an answer was drafted", "a job was saved",
  "an application was submitted" — tagged with a random analytics ID generated on your device.
- **What is NEVER sent:** your name, contact details, bio, resumes, the answers you draft, your
  account/email, the specific jobs or companies, or the URLs/pages you visit.
- **Opt out anytime:** Settings → uncheck **"Share anonymous usage analytics."** When off, nothing
  is sent. We honour the choice immediately.

## Fill-quality counts (first-party)

When you're signed in, each autofill run also reports a handful of **counts** to your Kiwiply
account's server (`api.kiwiply.com`) so we can see which job sites the autofill handles badly and
fix those first:

- **Sent:** which ATS the page belongs to, as a fixed family name (`workday`, `icims`, …, or
  `other`); which built-in adapter handled it; how many fields were found, filled, and failed;
  how many **required** fields were still empty afterwards; and, later, how many of the filled
  fields you changed.
- **Never sent:** any field value, any field label, or the page's address. A company's own
  careers site is reported only as `other` — the reduction happens in the extension before
  anything leaves the page, and the server enforces the same vocabulary again.
- **Not linked to you:** the server stores these counts with a random per-fill id and **no
  account reference**, so they can't be traced back to you (and have nothing to erase on account
  deletion).
- **Opt out:** the same **"Share anonymous usage analytics"** setting turns this off too.

## Learning from your applications (profile suggestions)

When you're signed in, after you run an autofill Kiwiply notices the answers you give to
**profile questions** on that page — the ones your Kiwiply profile could hold, like desired salary,
notice period, work authorization or your city — and sends them to **your own Kiwiply account**
as **suggestions**. You see them on kiwiply.com ("we learned 3 things about you — keep these?")
and nothing changes in your profile unless you keep one.

- **Sent:** the profile field and the answer you gave, plus a code that only tells the server
  whether two answers came from the **same application or a different one**. That code is a hash of
  the page address salted with a random value that never leaves your browser, so it can't be
  turned back into the address or matched against known job pages.
- **Never sent:** the page's address, other questions on the page, **EEO / self-identification
  answers** (those are only ever set on kiwiply.com), or anything from a page you didn't autofill.
- **Kept:** in your account until you keep or dismiss the suggestion. A dismissed value is
  remembered only so it's never suggested again. Included in your data export; erased with your
  account.
- **Turn it off:** Settings → **"Learn from my applications"**. It's separate from the analytics
  opt-out.

## Permission justifications

| Permission | Why |
|---|---|
| `storage`, `unlimitedStorage` | Cache your profile/resumes locally for offline autofill. |
| `scripting`, `activeTab` | Inject the field-matching/fill logic into the application tab you're on, on demand. |
| `webNavigation` | Detect the application's success/confirmation page to mark a job as applied (no auto-submit). |
| `alarms` | Check every 15 minutes whether your profile changed on kiwiply.com or another device, so the extension fills with current details. It asks for a short version marker first and only downloads your profile when that changed. Collects nothing new. |
| Host access to ATS domains (Workday, Greenhouse, Lever, Ashby, Workable, iCIMS, Taleo, SmartRecruiters, BambooHR, Jobvite) | Run the autofill content script on those job-application sites. |
| `api.anthropic.com` | **Optional** AI assistance for free-text answers — used **only if you supply your own API key**. No key, no calls. |
| `www.google-analytics.com` | Send **anonymous** usage event counts (no personal data) so we can improve the extension. Opt out in Settings. |
| `api.kiwiply.com` | Sync your profile/resumes with your own Kiwiply account, (only if you opt in) proxy AI drafting, report count-only fill-quality stats (opt out in Settings), and send answers you gave to profile questions as suggestions you review (turn off in Settings). |

The published build requests nothing beyond this table. Local-development hosts
(`localhost`) are added only to development builds, never to a released one.

On **Firefox** the same disclosure is additionally declared *in the manifest*, which AMO requires
and Firefox shows in the install prompt (`browser_specific_settings.gecko.data_collection_permissions`):
**required** — `personallyIdentifyingInfo`, `authenticationInfo`, `websiteContent`; **optional** —
`technicalAndInteraction` (the anonymous analytics above). Keep the two in step. The Firefox build
also carries a content script on kiwiply.com only, to receive the sign-in handoff that Firefox
cannot deliver the way Chrome does — it reads nothing from the page (see `BROWSERS.md`).

## Data-use certifications (Chrome Web Store)

- We do **not** sell user data.
- We do **not** use or transfer user data for purposes unrelated to the item's single purpose.
  Third-party transfers are limited to: (1) the **opt-in AI answer drafting** described above (to
  the AI provider, to generate your answer — off by default, explicit consent), and (2) **anonymous
  usage analytics** to Google Analytics (event counts only, no personal data; opt out in Settings).
- We do **not** use or transfer user data to determine creditworthiness or for lending.

## Deletion

Profile and resume data can be deleted at any time from your Kiwiply account
(Settings → Delete account), which erases your data on the server, including stored resume
files. Removing the extension clears its local cache.

## Contact

AutomoraLab LLC — support@kiwiply.com

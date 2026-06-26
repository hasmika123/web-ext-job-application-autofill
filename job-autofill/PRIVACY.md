# Kiwiply extension — privacy & Chrome Web Store data-use disclosure

This document is the source for the extension's **Chrome Web Store → Privacy** tab and
its single-purpose / data-use certifications. The full policy users see lives on the web
app at `/privacy`; keep the two consistent.

> Before publishing: set the hosted Privacy Policy URL in the CWS listing, and have the
> policy reviewed for your jurisdiction.

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

## Permission justifications

| Permission | Why |
|---|---|
| `storage`, `unlimitedStorage` | Cache your profile/resumes locally for offline autofill. |
| `scripting`, `activeTab` | Inject the field-matching/fill logic into the application tab you're on, on demand. |
| `webNavigation` | Detect the application's success/confirmation page to mark a job as applied (no auto-submit). |
| Host access to ATS domains (Workday, Greenhouse, Lever, Ashby, Workable, iCIMS, Taleo, SmartRecruiters, BambooHR, Jobvite) | Run the autofill content script on those job-application sites. |
| `api.anthropic.com` | **Optional** AI assistance for free-text answers — used **only if you supply your own API key**. No key, no calls. |
| `www.google-analytics.com` | Send **anonymous** usage event counts (no personal data) so we can improve the extension. Opt out in Settings. |
| `raw.githubusercontent.com`, `gist.githubusercontent.com` | Fetch updated field-matching rules (no personal data is sent). |
| `localhost:8080` | Local development against a dev backend; not used in production. |

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

support@kiwiply.com

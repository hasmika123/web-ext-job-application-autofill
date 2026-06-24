# Dossier extension — privacy & Chrome Web Store data-use disclosure

This document is the source for the extension's **Chrome Web Store → Privacy** tab and
its single-purpose / data-use certifications. The full policy users see lives on the web
app at `/privacy`; keep the two consistent.

> Before publishing: set the hosted Privacy Policy URL in the CWS listing, and have the
> policy reviewed for your jurisdiction.

## Single purpose

Dossier autofills job-application forms from one profile and your chosen resume, and keeps
that profile/resume data in sync with your Dossier account. It never auto-submits an
application and never bypasses CAPTCHAs.

## What data the extension handles

- **Your profile and resume data** — name, contact details, address, links,
  work-authorization and any voluntary self-identification answers, plus the resume you
  select. Used only to fill fields on the application page you're on.
- **A local cache** of that data (browser storage) so the extension works offline and
  fills quickly.
- It syncs this data with **your Dossier account** (your server). It is not sent anywhere
  else, is not sold, and is not used for advertising or any purpose unrelated to autofill.

The extension reads page content **only on the application page you are filling** (to match
and fill fields); it does not read your general browsing.

## Optional AI answer drafting

Dossier can **optionally** draft answers to open-ended application questions. It is **off by
default** and only runs after you explicitly enable it. There are two modes, and you choose:

- **Dossier AI (server-side, opt-in):** the question + a short profile/resume summary are sent
  to your Dossier account, which proxies them to a third-party AI provider (currently **Google
  Gemini**) and returns a draft. Because this uses Gemini's free tier, **Google may use the input
  to improve its services, and human reviewers may see it** — so it is consent-gated and disclosed
  here and in the web policy. No personal data is sent until you turn the feature on and accept this.
- **Bring-your-own key:** if you supply your own AI key, requests go **directly** from your browser
  to that provider (e.g. Anthropic) under your own account — they don't pass through Dossier.

Leave AI drafting off and every other feature works without sending anything to an AI provider.

## Permission justifications

| Permission | Why |
|---|---|
| `storage`, `unlimitedStorage` | Cache your profile/resumes locally for offline autofill. |
| `scripting`, `activeTab` | Inject the field-matching/fill logic into the application tab you're on, on demand. |
| `webNavigation` | Detect the application's success/confirmation page to mark a job as applied (no auto-submit). |
| Host access to ATS domains (Workday, Greenhouse, Lever, Ashby, Workable, iCIMS, Taleo, SmartRecruiters, BambooHR, Jobvite) | Run the autofill content script on those job-application sites. |
| `api.anthropic.com` | **Optional** AI assistance for free-text answers — used **only if you supply your own API key**. No key, no calls. |
| `raw.githubusercontent.com`, `gist.githubusercontent.com` | Fetch updated field-matching rules (no personal data is sent). |
| `localhost:8080` | Local development against a dev backend; not used in production. |

## Data-use certifications (Chrome Web Store)

- We do **not** sell user data.
- We do **not** use or transfer user data for purposes unrelated to the item's single purpose.
  The only third-party transfer is the **opt-in AI answer drafting** described above (to the AI
  provider, to generate your answer) — off by default and only with your explicit consent.
- We do **not** use or transfer user data to determine creditworthiness or for lending.

## Deletion

Profile and resume data can be deleted at any time from your Dossier account
(Settings → Delete account), which erases your data on the server, including stored resume
files. Removing the extension clears its local cache.

## Contact

privacy@dossier.app  <!-- TODO(launch): replace with a monitored address -->

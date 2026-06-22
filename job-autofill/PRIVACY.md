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

- We do **not** sell or transfer user data to third parties outside the approved use cases.
- We do **not** use or transfer user data for purposes unrelated to the item's single purpose.
- We do **not** use or transfer user data to determine creditworthiness or for lending.

## Deletion

Profile and resume data can be deleted at any time from your Dossier account
(Settings → Delete account), which erases your data on the server, including stored resume
files. Removing the extension clears its local cache.

## Contact

privacy@dossier.app  <!-- TODO(launch): replace with a monitored address -->

# Design — Minors and age assurance (area `trust`, epic T2)

Status: design 2026-10-11. Inputs: `/terms` "at least 16 years old (or the age of digital consent
where you live)", `consent-data-sharing.md` D6 ("Minimum age 16; SCHOOL/BOOTCAMP org asserts members
are 16+; under-16 out of scope"), PLAN-org open question "hard 16+ rule for school/bootcamp orgs
(default yes)". Laws in play (not legal advice; register items L5): **COPPA** (US, under 13; amended
rule effective 2025-06-23, compliance 2026-04-22; FTC 2026-02-25 policy statement on age-verification
data), **GDPR Art. 8** (16 default, member states 13–16), **UK Children's Code** (under 18 = child),
US state minor-privacy laws, Chrome Web Store / AMO (no separate rule beyond the policy).

## 0. Decisions

| # | Decision |
|---|---|
| D1 | **Minimum age stays 16 everywhere** (the GDPR ceiling; no per-country lowering). Simpler than 13–16 by country, and matches the org design. Under 16 is out of scope — no parental-consent flow is built. |
| D2 | **A neutral age screen at signup**, COPPA-style: one question, "What year were you born?" rendered as a year picker with no default and no hint of the threshold; stored **only** as `age_gate = {confirmed_at, method: BIRTH_YEAR|ORG_ASSERTION|SSO_CLAIM, under_18: bool}`. The birth year itself is **not stored** (data minimisation); `under_18` is derived once (16–17 band) for the high-privacy defaults (D5). Under 16 → polite refusal screen, no account created, the email is **not** retained (a hashed, 24 h rate-limit key only, so the same device can't just retry). |
| D3 | **Social and passkey sign-ups ask the same question** before the account becomes usable (U1.3/U1.8 flows add the screen); Google/Apple age claims are not relied on. |
| D4 | **Orgs**: creating a `SCHOOL` or `BOOTCAMP` org requires the typed assertion "Everyone I invite is 16 or older" (O2.1), stored on the org with the admin's login and time; CSV import rejects a `dob`/`age` column outright (we never want it) and the invite email states the 16+ rule; a member who fails the age screen on join is not added, and the org admin sees "Could not join (age)" with no further detail. |
| D5 | **High-privacy defaults for 16–17** (`under_18 = true`), in the spirit of the UK Children's Code even where it may not bind us: analytics consent **DENIED by default and not prompted**, product events limited to the activation funnel, newsletter opt-in hidden, referral/share cards hidden, streak/goal nudges off by default (U16), push pre-prompt only after the user starts an alert themselves, no "Use my location" (U2.3 typeahead only), public profile (U13.3) unavailable, AI assistant memory (U8.4) off by default. The user can switch each on in Settings; the switch explains why it was off. At 18 nothing auto-flips (we don't know the birthday) — the account keeps its choices. |
| D6 | **Actual-knowledge handling**: a report that an account holder is under 16 (parent, school, user) goes to the A9.4 privacy queue as `kind=DELETE, source=EMAIL, reason=UNDERAGE`; support verifies with the reporter (for a parent: a reply from the account email or a document check by phone, never stored), suspends the account on receipt, and erases within 5 business days (COPPA for under 13: as soon as verified). Runbook in `docs/design/trust/privacy-ops.md` §2 flow + this doc §4. |
| D7 | **No age-verification vendor, no ID upload, no face estimation.** If a jurisdiction we serve mandates verification for 16+, we geo-block signup there rather than collect IDs (decision to revisit with counsel). |
| D8 | **Copy**: the terms keep "16 or older"; the privacy policy gains a "Children" paragraph (we don't knowingly collect from under-16; how to report); the age screen says only "We need this to set up your account." |

## 1. Data model (additive)

```sql
ALTER TABLE jhi_user ADD COLUMN age_confirmed_at DATETIME NULL, ADD COLUMN age_method VARCHAR(16) NULL, ADD COLUMN under_18 BOOLEAN NULL;
CREATE TABLE underage_refusal (email_hash CHAR(64) PRIMARY KEY, refused_at DATETIME NOT NULL);   -- 24 h, purged nightly
ALTER TABLE organization ADD COLUMN age_assertion_by VARCHAR(50) NULL, ADD COLUMN age_assertion_at DATETIME NULL;   -- O1.1 adds the table
```
No DOB column, ever (`DataMapTest` blacklist: any column named `dob`, `birth_*` fails the build).

## 2. API

```
POST /api/register                       + {birthYear}   -> 201 | 400 AGE_REQUIRED | 403 UNDERAGE (body carries no detail beyond the code)
POST /api/account/age-gate               {birthYear}      -> 204 (for existing/SSO accounts without age_confirmed_at; (app) layout gates on it)
GET  /api/account                        + {under18: bool, ageConfirmed: bool}
POST /api/orgs                           + {ageAssertion: true}   (SCHOOL|BOOTCAMP only; 400 without)
```
Rules: `birthYear` must be a 4-digit year ≤ current year; age = currentYear − birthYear computed with
a conservative rule (treat as not yet had the birthday → age − 1); `UNDERAGE` when age < 16;
`under_18` when 16 ≤ age < 18. Demo accounts seed `age_confirmed_at` (adult).

## 3. Wireframes (390 px)

```
Signup — step after email/password (or after Face ID)     Refusal
┌──────────────────────────────┐                          ┌──────────────────────────────┐
│ One more thing               │                          │ Sorry — not yet              │
│ What year were you born?     │                          │ Kiwiply is for people 16 and │
│ [ Select year ▾ ]            │                          │ older. We haven't saved      │
│ We need this to set up your  │                          │ anything you typed.          │
│ account. We don't store it.  │                          │ [ Back to kiwiply.com ]      │
│ [ Continue ]                 │                          └──────────────────────────────┘
└──────────────────────────────┘
```
No "are you over 16?" checkbox (leading), no default year, no visible threshold.

## 4. Under-age report runbook (support)

1. Receive at `privacy@` / support form → queue row `UNDERAGE`, suspend account (`activated=false`,
   sessions revoked) within one business day.
2. Verify: ask the reporter for the account email; send the account a notice; if the reporter is a
   parent and the holder disputes, counsel decides (L5). Never collect or store ID documents.
3. Erase via the standard path (T1.3); receipt to the reporter: "deleted" only.
4. Record in the queue (login string, dates, outcome). Metrics on the admin privacy page.

## 5. Failure modes & abuse

| Failure | Behaviour |
|---|---|
| User lies about the year | we have a neutral screen and no actual knowledge — the standard posture; on a report, D6 |
| Org invites a 15-year-old | join screen's age gate refuses; the org sees the neutral status; org assertion is on record (their warranty, L8) |
| Existing accounts (pre-T2.1) without `age_confirmed_at` | gated once on next sign-in (`POST /api/account/age-gate`); refusal → immediate self-deletion path with the under-16 copy |
| Extension connect for an un-gated account | `/connect` shows the age step before minting the token |
| Rate-limit key collision for refused emails | hashed + 24 h only; false positives just delay a retry |

## 6. Needs a lawyer (L5)

- Is 16+ the right floor for the US market given competitors at 18+ and the org model with schools?
  (Our view: 16+ with D5 defaults is a stronger protection than an unenforced 18+.)
- COPPA: does the neutral-screen posture meet the "actual knowledge" standard for a general-audience
  service; does the FTC's 2026 age-verification policy statement affect storing `under_18`?
- UK Children's Code: are we "likely to be accessed by children" (16–17)? If so, D5 is the
  conformance story — confirm the list.
- GDPR Art. 8: do we need parental-consent language for 16–17 in any member state we serve? (No —
  16 is the ceiling — but confirm the "age of digital consent where you live" terms wording.)
- US state laws (e.g. minors' data / social-media-style duties): any that reach a job-search tool for
  16–17-year-olds?
- School orgs: FERPA touchpoints when a US school uploads a roster (names/emails only).

## 7. Tests

`AgeGateIT` (15 → 403 no account, no email stored; 16 → `under_18=true` + defaults; 18 → adult;
missing → 400; existing account gated once), `UnderageDefaultsTest` (every D5 default read from one
`MinorDefaults` map; Settings shows the explanatory copy), `OrgAgeAssertionIT` (SCHOOL without
assertion → 400; CSV with `dob` column → 400), `DataMapTest` (no DOB columns), Playwright: signup
year picker at 390 px has no default and the refusal screen appears.

## 8. Rollout

T2.1 age screen + columns + gate → T2.4 minor defaults (needs U18.4 opt-out and U16 switches to
exist; ships the map first) → T2.3 org assertion (with O2.1) → T2.2 runbook + queue reason → T2.5
copy after counsel.

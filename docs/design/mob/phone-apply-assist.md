# Design — Applying on the phone without the extension (area `mob`, epic N3)

Status: decided 2026-10-11. Honest scope: **the extension cannot run on iOS, and on Android only
Firefox runs it.** This doc is what a phone user gets when they decide to apply on the phone
anyway (73 % of Gen Z say they would), without pretending to autofill. Reconciles the onboarding
design's "Phone users get the full product minus autofill" line.

## 0. Decisions

1. **"My answers" — a copy sheet, not a fake autofill.** A compact screen (`/answers`, also a
   bottom sheet from any job row) listing the user's profile values grouped the way ATS forms ask
   for them, each a one-tap **copy** with a "copied" tick. The user switches between the ATS tab
   and Kiwiply; iOS/Android keep both alive. It reuses the same canonical fields the extension
   fills (`job-autofill/src/lib/field-map.js` keys → `bio.payload`), so what we copy is exactly
   what we would have filled.
2. **Learned answers are in the sheet too** (`profile_suggestion` + field cache): "Why do you want
   to work here?" drafts, work authorisation, salary expectation — the long-tail answers that
   make phone applying slow.
3. **Resume into the ATS file picker.** "Share resume PDF" uses `navigator.share({files})` where
   supported (iOS 15+, Chrome Android) so the user can drop the PDF into Files/Drive or straight
   into the ATS upload control; fallback: download. Resume Builder export (R-epics) supplies the
   PDF; until then the stored upload (`ResumeFileResource`) is the file.
4. **Firefox for Android gets the real drawer (experiment).** The manifest already allows it
   (`gecko_android` floor 142). The panel iframe becomes responsive (≤ 420 px → full-width sheet
   anchored at the bottom, 60 vh, drag to expand). If it works on three real ATS pages at 390 px
   we say "Autofill on Android: Firefox" in the store listing and `/help`; if not, the
   experiment ends with a note and no promise.
5. **Safari iOS extension only inside the native shell (P2).** Apple ships web extensions on iOS
   through an app; it is N3.4, gated by N6, and would reuse the WXT build with a Safari target.
   Not promised anywhere until it exists.
6. **Mark "applied on phone" in one tap.** After copying answers, the sheet offers "I applied" →
   the application moves to `APPLIED` with `source_detail = PHONE_MANUAL`; the inbox linkage
   (Pro) then tracks replies like any other application.

## 1. "My answers" sheet — content model

| Group | Fields (canonical keys) | Source |
|---|---|---|
| Contact | first, last, email, phone, city, state, country, postcode | `bio.payload` |
| Links | linkedin, github, portfolio, website | `bio.payload` |
| Work | current title, company, years, notice period, salary expectation, start date | `bio.payload` + learned |
| Eligibility | work authorisation, sponsorship, relocation, remote preference | `bio.payload` (Tier-A `/welcome`) + learned |
| EEO (optional) | gender, race, veteran, disability — each "Decline to self-identify" by default | `bio.payload` (10.3 Tier-A EEO) |
| Learned | the user's accepted learned answers with their label ("Why this company?") | `profile_suggestion` (10.3), field cache |
| Resume | default resume name · [Share PDF] · [Copy summary] | `ResumeResource` |

Nothing new is stored. Copy events are counted (N8.3 `answer_copied {group}`) with no values.

## 2. API

None new. Reads `GET /api/profile`, `GET /api/profile/suggestions`, `GET /api/profile/resumes`,
`GET /api/profile/resumes/{id}/file` (exist). `PATCH /api/applications/{id}` (exists) for
"I applied".

## 3. Extension on Firefox for Android (N3.2)

- `job-autofill/entrypoints/panel/` CSS: `@media (max-width: 480px)` → the iframe host
  (`background.ts` injects it) sets `position: fixed; inset: auto 0 0 0; height: 60vh; width:
  100%` and a drag handle; the drawer's internal layout already stacks.
- `wxt.config.ts`: keep the Android floor; add `"browser_specific_settings.gecko_android"` note
  in the AMO listing only after the smoke passes.
- Toolbar action on Firefox Android lives in the "…" menu → Extensions; copy in `/help` shows the
  three taps.
- Smoke (real device, N8.2): Greenhouse, Lever, Workday fixtures at 390 px; fill ≥ 80 % of the
  desktop field count; no overlay breaks the page's own submit button (we never press it).

## 4. Failure modes

| Failure | Behaviour |
|---|---|
| `navigator.share({files})` unsupported | "Download PDF" fallback; iOS < 15 and desktop Firefox |
| Clipboard write blocked | inline "select all" text field as fallback (`execCommand` path) |
| User copies EEO values into a non-EEO field | the sheet labels groups loudly; EEO group is collapsed by default |
| Firefox Android fill breaks a page | per-ATS kill switch (A5.5) applies to the Android build the same way |
| The user expects autofill on iPhone Safari | onboarding + `/help/on-your-phone` say exactly what works where; the sheet's header reads "No autofill on iPhone yet — copy in one tap" |

## 5. Privacy and security

Values are rendered only to the signed-in user; copy is client-side; no values in events.
EEO stays optional and collapsed. Nothing is cached in the SW (HTML is never cached).

## 6. Cost

$0.

## 7. Tests

- Web (vitest): grouping from a fixture `bio.payload` matches `field-map.js` keys (contract test
  importing the engine's map, like the parser-core share); copy handler fallback.
- Playwright iPhone project: open a job → "My answers" → copy email → clipboard holds it (with
  `clipboard-read` permission in the context); "I applied" moves the row.
- Extension `npm test`: the panel's responsive CSS snapshot at 390 px; fill harness fixtures
  unchanged (the DOM-fixture harness is the ext area's, we only add a 390 px viewport run).

## 8. Rollout

N3.1 sheet (web) → N3.3 share PDF → N3.2 Firefox-Android experiment (one session, go/no-go
recorded in PROGRESS) → N3.4 only inside N6.

## 9. Wireframes (390 px)

```
My answers (sheet, 85 vh)
┌──────────────────────────────────────┐
│ ═══                                  │
│ My answers · copy in one tap         │
│ No autofill on iPhone yet.           │
│                                      │
│ CONTACT                              │
│ Email   priya@…         [ Copy ]     │
│ Phone   +1 415 …        [ Copy ✓ ]   │
│ City    San Francisco   [ Copy ]     │
│ LINKS                                │
│ LinkedIn  in/priyas     [ Copy ]     │
│ ELIGIBILITY                          │
│ Work auth  Yes, no sponsorship       │
│                          [ Copy ]    │
│ LEARNED ▾                            │
│ "Why Figma?"  (3 lines) [ Copy ]     │
│ RESUME                               │
│ Priya_Design_2026.pdf  [ Share PDF ] │
│                                      │
│ [ I applied to this job ]            │
└──────────────────────────────────────┘
```

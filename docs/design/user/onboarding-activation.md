# Design — Onboarding & activation funnel (area `user`, epic U2)

Status: decided 2026-10-11 (Fable). Extends 10.3b `/welcome` (Tier-A questions) and the Resume
Builder onboarding (R1.4/R1.5: Upload · Paste · Start fresh with card-by-card review). Locked
constraints: email verification stays the gate; ask the bare minimum, derive the rest; no
in-extension profile editing; the extension cannot install on a phone.

## 0. Summary

1. **Activation = "first value in session 1"**: the user sees **3 relevant jobs** and has either a
   resume/profile seed or an alert. Measured as `activated_at` on the user (U18 events feed it;
   admin funnel reads it).
2. **Five screens, phone-first, each one question**: *What are you looking for* → *Where* →
   *Resume (upload / paste / later)* → *Instant matches* (3 cards, from today's postings, no AI) →
   *Get pinged* (create the alert + push pre-prompt). The six Tier-A `/welcome` questions move to
   **after** first value, as a dashboard checklist card ("2 minutes: answers forms ask every time").
3. **Verification is instant**: the activation link signs the user in on the same device (one-time
   `activationKey` → token pair), the "Almost there" screen has an *Open Gmail/Outlook* deep link, and
   resend is one tap. Sign-up with Google skips verification (email is verified by Google already —
   `GoogleAuthController` exists).
4. **The extension is a desktop step, offered at the right moment**: on a phone, "Send the install
   link to your laptop" (one email) and the phone path continues with jobs + alerts + profile; on
   desktop, an inline "Add to Chrome" card appears after the first saved job.
5. **Progress is honest and small**: a 4-dot progress, "Skip" on everything except the first
   question, autosave on each tap, and a single celebration at the end (mascot + "You're set").

## 1. Funnel and metrics

```
landing → signup_started → signup_completed (account) → email_verified (or google) → onboarding_q1 … q5
→ first_value (3 jobs shown + (resume|alert)) = activated → day-1 return → day-7 return
→ first_save → first_apply (extension or "I applied") → first_reply (inbox) → first_interview
```
Targets for the first cohort (phone-heavy): signup → verified ≥ 70 %; verified → activated ≥ 60 %;
activated → day-7 return ≥ 35 %. Every step is a product event (U18) with `surface=web|ext`.

## 2. Screens (390 px) — one question each, chips first, text second

```
S1  What are you looking for?                   S2  Where?
┌──────────────────────────────┐                ┌──────────────────────────────┐
│ ●○○○○                 Skip   │                │ ○●○○○                 Skip   │
│ What are you looking for?    │                │ Where do you want to work?   │
│ [UX design][Software eng.]   │                │ (● Remote)                   │
│ [Data][Marketing][Nursing]   │                │ [📍 Use my location]         │
│ [Sales][Teaching][+ type…]   │                │ ┌──────────────────────────┐ │
│ Level  (Intern)(Entry)(Mid)  │                │ │ Austin, TX           ✕   │ │
│ Type   [Full][Part][Intern✓] │                │ └──────────────────────────┘ │
│                              │                │ [+ add another]              │
│ [ Next → ]                   │                │ [ Next → ]                   │
└──────────────────────────────┘                └──────────────────────────────┘
chips = the top 40 title clusters from job_posting (U4) + free text; writes job_preference

S3  Your resume (optional)                      S4  Instant matches (the "aha")
┌──────────────────────────────┐                ┌──────────────────────────────┐
│ ○○●○○                 Later  │                │ ○○○●○                        │
│ Add a resume so forms fill   │                │ 🥝 3 jobs for you right now  │
│ themselves                   │                │ ┌──────────────────────────┐ │
│ [ 📄 Upload PDF/DOCX ]       │                │ │ G UX Design Intern       │ │
│ [ 📋 Paste LinkedIn text ]   │                │ │   Remote · today   [Save]│ │
│ [ ✍️ Build from scratch ]    │                │ ├──────────────────────────┤ │
│ We read it once, you confirm │                │ │ … 2 more                 │ │
│ each item. Nothing is shared.│                │ └──────────────────────────┘ │
│ [ Next → ]                   │                │ Saved jobs live in Applications│
└──────────────────────────────┘                │ [ Next → ]                   │
Upload → R1.4 card review (Keep/Edit/Skip)      └──────────────────────────────┘
                                                 = JobSearchService best-3, posted ≤ 72 h, no AI
S5  Get pinged                                   Done
┌──────────────────────────────┐                ┌──────────────────────────────┐
│ ○○○○●                 Skip   │                │ 🎉 You're set, Priya         │
│ New "UX design · Remote"     │                │ ✓ 3 jobs waiting             │
│ jobs — want a daily ping?    │                │ ✓ Alert: UX design · Remote  │
│ [ Yes, daily ]  [ Instant ]  │                │ ○ Resume — 2 min             │
│ (creates the alert; then the │                │ ○ Answers forms ask (6 taps) │
│  push pre-prompt sheet)      │                │ ○ Chrome extension (laptop)  │
│ [ Not now ]                  │                │ [ Go to dashboard ]          │
└──────────────────────────────┘                └──────────────────────────────┘
```
Desktop: the same five steps centred in a 560 px card with the mascot at the right; S5 adds the
"Add to Chrome" card when the UA is Chrome/Edge/Firefox and no extension is detected
(`extension-signal.ts` ping with a 300 ms timeout).

## 3. Data & API

- `user_onboarding` (new, 1:1): `user_id PK, step TINYINT (0..5), completed_at NULL, skipped_json JSON,
  source VARCHAR(16) (WEB|EXT|PHONE), activated_at NULL, ext_link_sent_at NULL, updated_at`.
  (`bio.payload.onboardedAt` stays for the Tier-A questions — `ONBOARDED_KEY` in `profile-options.ts`.)
- `GET/PUT /api/profile/onboarding` (step + answers batched: writes `job_preference` via U4 API, creates the alert via U7 API).
- `GET /api/jobs/instant?limit=3` → the S4 list (no auth differences; Free and Pro identical, no model).
- `POST /api/account/send-extension-link` → Brevo mail "Install Kiwiply on your laptop" (rate 3/day).
- `GET /api/account/activate?key=` (exists) → **add** `POST /api/account/activate/session {key}` that
  activates **and** returns a token pair once (key consumed; 10-minute window after first use for the
  "opened on another device" case → falls back to the sign-in link, which exists).
- The `(app)` layout redirects to `/welcome` when `user_onboarding.completed_at IS NULL` and
  `step < 4` (resumable; "Skip all" sets completed).

## 4. Rules

- Never block on a resume. Never ask for phone/address/EEO before first value (10.3 Tier-A stays
  opt-in, after). Never show the 6-question `/welcome` before S4.
- Everything is autosaved per tap; back works; closing the tab resumes at the same step.
- Copy ≤ 12 words per heading; one line of reassurance about privacy on S3 only.
- Google sign-up lands on S1 immediately (no verification). Email sign-up: "Almost there" with
  *Open Gmail* / *Open Outlook* buttons (mailto app deep links), resend after 30 s, change-email link.
- Phone users get the full product minus autofill; the dashboard's extension card says so plainly
  ("Autofill works on your laptop — we emailed you the link").
- Demo accounts skip onboarding (seeded as completed).

## 5. Failure modes

| Failure | Behaviour |
|---|---|
| Instant matches return < 3 | show what exists + "we'll find more overnight" and still create the alert |
| Resume parse fails | S3 offers paste / later; the R1.4 review handles partial parses |
| Activation key expired (3 d) | "Link expired — send a new one" (exists for sign-in link; add to the session variant) |
| Push permission denied on S5 | alert stays with in-app + digest; no re-prompt |
| Returning user with onboarding half done | resume at the step; dashboard checklist mirrors the remaining items |

## 6. Tests

- `OnboardingResourceIT`: step persistence, idempotent PUT, completed gate, activate/session one-time key, rate limit on extension link.
- `JobInstantIT`: 3 rows ≤ 72 h honouring `job_preference`, deterministic order.
- Web Playwright (390 px): the five steps end-to-end on the mock API (`scripts/mock-api.mjs` gains the new routes), skip paths, Google path lands on S1, resume at step 3 after reload, events fired in order.
- Analytics assertion: every step emits `onboarding_step {step, skipped}` and `activated` once.

## 7. Rollout

U2.1 activation-session link + Open-mail buttons → U2.2 schema + onboarding API → U2.3 S1–S2
(preferences) → U2.4 S3 (resume paths, reuses R1.4) → U2.5 S4 instant matches → U2.6 S5 alert + push
pre-prompt → U2.7 dashboard checklist + extension link email → U2.8 funnel events + admin funnel tile.

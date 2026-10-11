# PLAN — area `user` (job-seeker dashboard, auth, account, web↔extension)

Written 2026-10-11 (Fable). Machine-readable twin: `docs/roadmap/areas/user.json` (21 epics,
110 stories: 9 done · 20 partial · 81 not started). Audit: `docs/roadmap/AUDIT-user.md`. Deep
designs: `docs/design/user/*.md`. Resume Builder epics R0–R7 are a dependency, not re-planned here.

## 1. The shape of the problem

The signed-in app on `version2` is a faithful render of the boards with **real data on the spine**
(account, profile, resumes, applications, billing, AI meter, inbox, notifications, Pro matches)
and **sample rows on the limbs** (search, alerts, assistant, messages, interview prep, explore,
saved, parts of dashboard/analytics). Everything underneath that is real was built desktop-first
for a product that lives in a Chrome extension. The audience we are now designing for — Gen Z and
Gen Alpha on a phone, millennials second — meets Kiwiply on a 390 px screen where the extension
cannot even install. So the plan has two threads that must land together:

1. **Make the limbs real** — a job store people can actually search, alerts that fire, an assistant
   that answers from their data, a tracker with memory, messages from their own inbox.
2. **Make the phone the first-class surface** — bottom tabs, sheets, swipes, passkeys, push, PWA,
   a five-screen onboarding that ends in three real jobs, and honest privacy.

Nothing here re-litigates a locked decision: no server AI on Free (except parsing), no scraping,
no Kiwiply mailbox, no auto-submit, Stripe is the truth, one design system.

## 2. Epics (what, why, order, risk)

| Epic | Priority | What | Why it matters for the audience | Main risk |
|---|---|---|---|---|
| **U0 Mobile shell & foundation** | P0 | Bottom tabs, BottomSheet/SwipeRow primitives, dark mode, skeletons/empty states, kill the sample fallbacks | Every other epic renders into this; without it the phone experience stays a shrunken desktop | Primitives must land before page work or four agents re-implement sheets |
| **U1 Auth & security** | P0 | CSRF + backoff, passkeys, step-up, devices page, email change, Apple; drop LinkedIn | Passkeys are the lowest-friction sign-in on a phone and the strongest; trust cues | New API deps (Yubico webauthn) need the user's OK |
| **U2 Onboarding & activation** | P0 | Instant verification, 5 one-question screens → 3 real jobs + an alert, checklist, phone→laptop link, funnel | The first minute decides retention | Depends on U4.2 (instant jobs) and U7.2 (alert) — order matters |
| **U3 Dashboard** | P0 | Real tiles, interviews, matches, next-best-action, profile strength, streak | "What do I do now?" in five seconds | Mostly glue; wait for U6/U7 APIs |
| **U4 Job search & matching** | P0 | Posting store v2, FULLTEXT search + explainable ranker, 6 ATS + aggregator, preferences, feedback, Free/Pro matches, Score | The product's centre of gravity for a phone user who can't autofill | Aggregator licence/cost; search quality needs real fixtures |
| **U5 Saved jobs** | P1 | Real SAVED applications with states, nudges, collections | Save on the phone, apply on the laptop | Small |
| **U6 Applications tracker** | P0 | Events/notes/interviews schema, list v2, detail sheet, swipes, ics/reminders, inbox linkage | The tracker that fills itself is the differentiator; memory makes it stick | Status enum change touches the extension/inbox rules — additive only |
| **U7 Alerts & notifications** | P0 | One engine (policy, quiet hours, digest, dedupe), alerts as saved searches, prefs page, web push, templates | The reason to come back; etiquette is a trust feature | web-push dep; Brevo volume |
| **U8 AI Assistant** | P1 | Tool-using grounded agent, SSE chat, confirm-to-act, memory, hand-offs | "Ask Kiwiply" is the native UI for this audience; Pro value | Cost (daily cap), injection (confirm gate) |
| **U9 Interview Prep** | P1 | Question bank, sessions, AI text mock (20.1), hand-off from interviews | Converts anxiety into reps | Content curation effort |
| **U10 Messages** | P1 | Inbox threads grouped per application, Reply in Gmail | Honest take on "messaging" under the IMAP decision | Expectation management (no sending) |
| **U11 Explore** | P2 | Companies from the store, roles/paths, guides | Browsing mode; low priority | Content |
| **U12 Analytics** | P1 | Real funnel + rates by resume/ATS/company; honest empty state | Insight only the inbox can power | Needs U6.1 events |
| **U13 Profiles integration** | P1 | Hub wiring to R1, visibility, links; public profile P2 | One profile, targeted resumes | Depends on R1.1/R1.2 |
| **U14 Settings, privacy & data** | P0 | Phone IA, Privacy panel ("what we store, who sees it"), account, help, policy updates | Honest privacy is the trust that unlocks a resume upload | Copy must match reality — every switch real |
| **U15 Billing flows** | P0 | 402 upgrade sheet in place, plan/usage meters, billing notifications | Convert at the moment of intent, honestly | None new (Stripe exists) |
| **U16 Engagement** | P1 | Weekly goal, forgiving streak, Sunday recap + share card, referrals | Momentum and social growth, tastefully | Referral reward margin (A-area guard) |
| **U17 PWA, push, offline, perf** | P1 | Manifest/SW/offline, install etiquette, Lighthouse budgets, snapshots | App-like on a phone; speed is the feature | SW mistakes (never cache HTML) |
| **U18 Product analytics** | P0 | First-party schema-validated events, rollups, funnels, opt-out, experiments | We cannot tune the phone funnel blind | Privacy by schema; keep it small |
| **U19 A11y, i18n, QA/CI** | P0 | axe in CI, 44 px, reduced motion, vitest + Playwright, visual smoke, string extraction | "Tests green" must mean something for web stories | Test infra first (U19.3) |
| **U20 Extension ↔ web** | P0 | Connect v2, extension-aware cards, unified events | Two surfaces, one product | Small extension bumps |

## 3. Recommended build order — walking skeleton (first 10 stories)

The skeleton proves the phone path end to end: **sign up with a passkey → five screens → three real
jobs → an alert → a push the next morning → save → it shows on the laptop drawer.**

| # | Story | Why first |
|---|---|---|
| 1 | **U19.3** Test infrastructure (vitest + Playwright + mock fixtures) | Every later story's "tests green" depends on it; one session |
| 2 | **U0.2** BottomSheet + SwipeRow primitives, then **U0.1** bottom tabs | The grammar every page uses; prevents four re-implementations |
| 3 | **U4.1** Posting store v2 (schema, enrichment, gates, retention) | The data the whole phone product stands on; pure API |
| 4 | **U4.2** Search endpoint + ranker | Unblocks search page, instant matches, alerts, assistant tools |
| 5 | **U7.1** Notification engine (publish → policy → fan-out) | Unblocks alerts, interviews, security, billing notices; no UI change yet |
| 6 | **U4.3** Job Search page on real search, 390 px first | First visible "it's real" moment |
| 7 | **U7.2** Alerts CRUD + evaluator | The retention loop |
| 8 | **U2.2 → U2.3 → U2.5 → U2.6** Onboarding state, steps 1–2, instant matches, alert step (U2.1 can run in parallel) | The first minute |
| 9 | **U6.1 → U6.2** Tracker schema + list v2 | Memory for the tracker; dashboard/saved/analytics read it |
| 10 | **U18.1** Event pipeline with the first three events | So the skeleton is measured from day one |

Then in parallel lanes (strict file ownership, one Sonnet agent each):
- **Lane A (API):** U4.4 sources, U4.5 preferences, U4.6 feedback + Free/Pro matches, U6.4 interviews, U1.2 passkeys API, U8.1 assistant service.
- **Lane B (web pages):** U6.3/U6.5 tracker sheet + swipes, U5.1 saved, U3.1–U3.3 dashboard, U7.3 prefs page, U1.3 passkeys UI.
- **Lane C (platform):** U17.1 PWA/SW → U7.4 push, U1.1 CSRF/backoff, U0.3 dark mode, U0.4 skeletons/empties, U0.5 kill samples.
- **Lane D (AI/Pro):** U8.2–U8.4 assistant, U9.1–U9.3 interview prep, U4.7 score, U15.1 upgrade sheet.

Launch-critical (P0) before the phone cohort is invited: U0, U1.1–U1.5, U2, U3.1–U3.4, U4.1–U4.6,
U6.1–U6.6, U7.1–U7.4, U14.1–U14.2, U15.1–U15.2, U18.1–U18.4, U19.1/U19.3, U20.1.

## 4. Dependencies on other areas

- **R (Resume Builder):** R1.1 completeness + R1.2 editors feed U3.5/U13.1; R1.4 card review is reused
  by U2.4; R5.1/R5.3 are the assistant's hand-offs (U8.5).
- **A (admin):** 9.B1 runtime settings (ingest cadence, aggregator quota, daily caps), 9.B2 flags
  (assistant beta, push), 9.B5 scheduled-job health, 9.C3 support access (U14.2), funnel tiles over
  U18.3, margin report for referral comps (U16.4), job-sources page columns (U4.1).
- **O (organizations):** none required for this area; U13/U8 data models keep `user_id` ownership so
  the Marketer role (Phase 22) can act through the org model later.

## 5. Status honesty

`done` (9): auth baseline, Tier-A `/welcome`, light matches 13.6, tracker baseline, settings
baseline, billing baseline, learned-answer suggestions, save-a-job sync, sync model. `partial`
(20): board pages standing on sample or client state (search, alerts, assistant, messages, saved,
interview prep, explore, analytics, dashboard parts, profiles hub, settings panels, connect,
billing panel, bell grouping, inbox-on-v3). Each partial story's AC says exactly what remains.

## 6. Top risks

1. **Search quality on day one.** FULLTEXT + rules is explainable but only as good as the enrichment
   and gates; the aggregator pick decides coverage. Mitigation: real fixtures, `?explain=1`, U4.6 feedback early.
2. **Notification volume and Brevo caps** once alerts fire for thousands of users — digest-first
   defaults and the 9.B5 watch are the guard.
3. **AI cost creep** from the assistant and interview practice inside a $3 budget — daily caps,
   output caps, economy model at 80 %, and the admin per-feature cost view.
4. **New dependencies** (Yubico webauthn, web-push) — flagged for approval; raw WebAuthn on the web
   side avoids a web dep.
5. **Web test debt**: no unit/e2e tests exist today; U19.3 must be first or every "tests green" is a fib.
6. **Sample-data trust gap**: until U0.5 lands, a real account can see fake rows — ship U0.5 with
   the first page that goes real.

## 7. Open questions for the user

1. **Licensed aggregator**: Adzuna (free tier, attribution) vs Jooble vs Careerjet — pick after the
   cost/terms check; recorded in ROADMAP 16.1 before U4.4.
2. **Dependencies**: OK to add `webauthn-server-core` (Yubico) and `web-push` to the API? (Web side stays dep-free.)
3. **Free-tier alert cap**: 2 alerts with in-app + push and a weekly email digest — or push off on Free?
4. **Apple sign-in now or after launch** (needs the Apple Developer account and a Services ID)? LinkedIn button removal confirmed?
5. **Referral reward** = one month of Pro for both, granted after the invitee's 7th active day — acceptable against the 80 % floor, or a smaller reward?
6. **Lock-screen privacy default** for push: show specifics ("Google moved to Interview") by default, or generic text with an opt-in for details?

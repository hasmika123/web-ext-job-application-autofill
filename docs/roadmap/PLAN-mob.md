# PLAN — area `mob` (mobile app & PWA: capture on the phone, apply on the laptop)

Written 2026-10-11. Machine-readable twin: `docs/roadmap/areas/mob.json` (9 epics, 44 stories:
1 done · 43 not started). Audit + competitive benchmark: `docs/roadmap/AUDIT-mob.md`. Deep
designs: `docs/design/mob/{platform-decision,share-target-and-handoff,phone-apply-assist,
mobile-push-offline,store-payments}.md`. This area owns the mobile *delivery* of things the user
area already plans (U17 PWA/SW, U7.4 push, U2.7 install link, U20 extension↔web) and adds what
nobody planned: the share sheet, the phone→laptop queue, the honest phone-apply path, store rules.

## 1. The shape of the problem

The audience finds jobs on a phone (93 % of Gen Z have searched on one; discovery is TikTok,
Instagram, LinkedIn) and fills long applications on a laptop (75 % of Gen Z, HireClix 2025;
Glassdoor: mobile applicants finish 53 % fewer applications and take 80 % longer). Kiwiply's engine
is a browser extension that **cannot exist on iOS** and is untested on Android. Every competitor
with a phone app (Teal, Huntr, JobRight) ships a tracker or a feed on the phone and leaves the
hand-off to the user's memory. So the mobile plan is not "build an app"; it is **close the loop**:

1. **Capture anywhere** — the share sheet (Android now, iOS via paste/Shortcut, native later)
   turns any link into a saved job with its description, honestly resolved (no scraping).
2. **Send to laptop** — a flag on the application the extension drawer shows as "From your
   phone", with a badge, a once-a-day nudge, an evening digest, and QR pairing on first install.
3. **Be a good phone citizen** — installed-app polish, iOS-aware push with badges and actions,
   quiet caps, offline reads and an outbox, and an honest "My answers" sheet for the people who
   apply on the phone anyway.
4. **Decide native by numbers** — PWA-first; a Capacitor/TWA shell only when the gate says iOS
   users are hitting the wall, and never with in-app purchase.

Locked decisions honoured: Stripe is the truth (no IAP); no auto-submit (the queue opens pages,
the user submits); no scraping (we resolve one user-shared URL via public ATS APIs/OG and never
fetch walled hosts); one design system; the extension stays a desktop product in copy.

## 2. Epics

| Epic | Priority | What | Why it matters for the audience | Main risk |
|---|---|---|---|---|
| **N0 Platform decision & mobile baseline** | P0 | ADR + gate, viewport/theme/safe-area head, standalone rules, keyboard/touch, phone-aware CTAs | Installed-app feel; no dead "Add to Chrome" on a phone | Sheets/back behaviour needs a `packages/ui` change early |
| **N1 Share to Kiwiply** | P0 | share_target + `/share`, URL resolver with JD snapshot (G4/G14), dedupe/undo, iOS paste + Shortcut, outbox, share-out | The capture moment is in another app; two taps or it is lost | Resolver is an SSRF surface; iOS has no share target |
| **N2 Send to laptop** | P0 | hand-off state + API, drawer "From your phone", web action + states, nudges, QR pairing, Autopilot hook | The only phone→laptop loop in the category | Touches the extension (small bumps) and the engine kinds |
| **N3 Apply on the phone** | P1 | "My answers" copy sheet, resume PDF via share, Firefox-Android experiment, Safari ext (P2) | Honest help for the 73 % willing to apply on a phone | Must never read as fake autofill |
| **N4 Mobile push & badges** | P1 | iOS install gate, badges, actions, liveness, caps + mute | Quiet, actionable pings are a trust feature (Indeed/LinkedIn's one-star theme) | Depends on U7.4/U17 landing first |
| **N5 Offline & flaky networks** | P1 | net layer, snapshots + outbox, cellular budgets | Transit scrolling on bad data | Keep writes read-only except the outbox |
| **N6 Native shell (gated)** | P2 | gate review, Capacitor/TWA, iOS Share Extension, native push, biometrics/widget, listings | iOS share sheet + reliability + store credibility | Apple 4.2; only worth it with the native extras |
| **N7 Store payment compliance** | P1 | purchaseSurface resolver + config, US link-out, checklist | Stripe stays the one truth; no 30 % cut; no double billing | Legal position moves (Apple appeal, Google settlement) |
| **N8 Mobile QA & analytics** | P1 | Playwright phone projects, device smoke, event taxonomy, admin tiles | "Tests green" must include a phone; the gate needs numbers | U19.3/U18.1 are prerequisites |

## 3. Recommended build order — first 10

The skeleton proves: **share a job from the LinkedIn app on Android → it is in Saved with its
description → "Send to laptop" → the drawer badge shows 1 → Open & fill → Applied ✓ on the phone.**

| # | Story | Why first |
|---|---|---|
| 1 | **N0.2** mobile head + safe-area tokens (with U17.1 manifest/SW) | Everything installed depends on it; half a session |
| 2 | **N1.2** `POST /api/jobs/resolve` (API only, flagged) | The honest resolver is the riskiest piece (SSRF, ATS parsers); pure API, testable alone |
| 3 | **N1.3** share save + dedupe + description snapshot | Makes any save rich (G4) — the drawer and `/share` both benefit |
| 4 | **N1.1** `share_target` + `/share` + Save sheet | First visible phone win (Android) |
| 5 | **N2.1** hand-off model + API + count on `/api/profile/version` | The loop's spine; no UI yet |
| 6 | **N2.2** extension badge + "From your phone" | The laptop half, one extension bump |
| 7 | **N2.3** web "Send to laptop" + states | Closes the loop end to end |
| 8 | **N0.3** standalone-mode rules (deep links, OAuth/Stripe round-trips, history-backed sheets) | Needed before we invite installed users; fixes JobRight's class of bug |
| 9 | **N8.1 + N8.3** Playwright phone projects + the mobile event taxonomy | So the skeleton is tested on phone profiles and measured for the gate |
| 10 | **N1.4** iOS paste-a-link + Shortcut | Brings iPhone to parity on capture without waiting for N6 |

Then in parallel lanes (strict file ownership):
- **Lane A (web/platform):** N0.4 inputs, N0.5 touch, N5.1 net layer, N4.1 iOS gate + N4.2 badge
  (after U7.4), N1.5 outbox, N5.2 snapshots (after U17.4).
- **Lane B (API/extension):** N2.4 nudges (after U7.1), N2.5 QR pairing (after U2.7), N4.4 liveness,
  N4.5 caps, N3.2 Firefox-Android experiment (one session, go/no-go).
- **Lane C (product):** N3.1 "My answers", N3.3 resume share, N1.6 share-out, N0.6 phone page,
  N7.1 purchaseSurface (before any shell talk), N7.3 checklist.
- **Gate (+60 days after N1/N2):** N6.1 review → N6.2–N6.6 + N7.2 only on green.

## 4. Experience principles for Gen Z / Gen Alpha / millennials (mobile)

**The phone is the remote control, the laptop is the engine, and we say so.** Gen Z and Alpha
grew up with the share sheet, badges, Face ID and TikTok links; they expect Kiwiply to be *in* the
share sheet (not "copy the link and open our site"), to show an honest receipt ("Opened on your
MacBook at 10:42"), and to stay quiet (≤ 3 pings a day, mute from the notification). They punish
fake affordances — a permission prompt that cannot work on iOS, an "Add to Chrome" button on a
phone, an app that pretends to autofill — faster than missing features, so every phone surface
states what works where ("No autofill on iPhone yet — copy in one tap"). Millennials bring the
laptop habit and the longer forms; for them the queue, the evening digest and the QR install are
the bridge back to the device where they finish things. Across all three: dark mode and edge-to-edge
by default, two-tap flows, undo instead of confirm dialogs, offline that degrades honestly, no
prices hidden on the open web, and never a store-only paywall.

## 5. How we beat the competition on mobile

1. **Share-sheet capture with an honest resolver (G14 + G4).** Teal and Huntr need their extension
   or an in-app browser; Huntr's own reviews say you cannot create entries from LinkedIn/Indeed on
   the phone. We take the system share from any app, resolve the URL through public ATS APIs,
   keep the description, and never scrape.
2. **The phone→laptop queue (nobody has it).** "Send to laptop" + the drawer's "From your phone"
   turns the 53 %-fewer-completions problem into our funnel: find on the phone, finish where
   completion is high. Autopilot later takes the queue as its batch order — still never submits.
3. **Quiet, actionable push.** Indeed/LinkedIn earn one-star reviews for alert spam; we cap per
   device, respect device quiet hours, badge honestly, and put "Mute this alert" on the
   notification itself.
4. **Honest iOS.** JobRight's top complaint is deep links that forget the app is installed; our
   standalone rules (N0.3), install-gated push (N4.1) and subscription liveness (N4.4) exist to
   avoid exactly that class of bug. Where iOS cannot do something (share target), we say so and
   offer the Shortcut.
5. **One price list, one checkout.** No IAP, no store-only pricing, no second entitlement source;
   the shell (if ever) links out where lawful and otherwise just shows your plan.

## 6. Competitive-gap rows (`COMPETITIVE-GAPS.md`, commit `0843de1`)

Tagged **N**: only **G14** (share target, P0) — accepted; it is the spine of N1 (N1.1, N1.2, N1.3,
N1.4) and N6.3, cited in each story's `benchmark`.

Untagged rows this area folds in because the mobile delivery is ours: **G4** (JD snapshot) into
N1.2/N1.3 — a phone save stores the description like a drawer save will; **G35** (social share
cards) into N1.6 — `navigator.share({files})` with 1080×1920/square and counts-not-companies by
default; **G11** (Firefox/Safari presence) into N3.2 (Firefox Android experiment) and N3.4
(Safari iOS inside the shell); **G10** (in-product review prompt) into N6.6 — only meaningful once
a store app exists, so it is P2 and gated. **G7** (My Answers bank, U) is referenced from N3.1 as
the web editor whose phone-apply twin we build; no duplicate story.

Rejected / not taken here: none tagged N were rejected. Two near-misses deliberately left to
their owners: **G29** (in-app cancel, B/M) — a phone concern too, but it is billing-engine work;
N7.1 only guarantees the shell shows the same honest block. **G30** (permissions explainer, T/E/M)
— the Firefox-Android listing (N3.2) will link to it rather than duplicate it.

## 7. Dependencies on other areas

- **User (U):** U17.1/U17.2 manifest, SW, install prompts (N0.2/N1.1/N4.* build on them); U7.1/U7.4
  engine + web push (N2.4, N4.*); U2.7 install-link email (N2.5 adds QR); U5.1/U6.1 real Saved and
  tracker schema (N1.3/N2.3 write to them); U18.1/U18.3 events (N8.3/N8.4); U19.3 test infra (N8.1);
  U20.1/U20.3 connect states and extension-aware cards (N0.6/N2.3).
- **Extension (E):** N2.2/N2.4/N3.2/N3.4 change `job-autofill/` — small bumps; the TrackingProvider
  seam gains three hand-off methods (canonical DTOs only). The ext area's DOM-fixture harness is
  reused at a 390 px viewport.
- **Admin (A):** A5.1 runtime settings (mobile caps, `linkoutStorefronts`, `minShellVersion`),
  A5.3 flags (`share.resolve`, `notifications.push` per platform), A11.4 analytics tiles (N8.4),
  A3.3 margin guard per-surface fee column (N7.1).
- **Pay (B) / Trust (T):** N7 defers legal interpretation to the trust area's lawyer list and keeps
  billing mechanics untouched; privacy labels (N6.6) come from the trust privacy register.
- **Resume Builder (R):** R3.3 export feeds N3.3 (share the PDF).

## 8. Status honesty

`done` (1): N0.7, the mobile polish already on `version2` (44 px controls, tiles, padding) — verified
by eye only. Everything else is `not_started`; the five design docs exist but no manifest, SW,
share route, resolver, hand-off column, push, shell or mobile test exists in the code.

## 9. Top risks

1. **Resolver abuse.** `POST /api/jobs/resolve` fetches a user-supplied URL — SSRF guard, host
   allow/deny, caps and rate limits are AC, not nice-to-haves; walled hosts are never fetched.
2. **iOS parity gap.** Until N6, iPhone capture is paste/Shortcut; if iOS is > 60 % of mobile
   users the gate should be reviewed early (N6.1 can run at +30 days).
3. **Push plumbing order.** N4 cannot start before U7.4 + U17.1; schedule them in the user lane
   first or N4 idles.
4. **Legal drift on store payments.** Apple's appeal and Google's settlement can change the US
   link-out position; `linkoutStorefronts` is a runtime setting so the response is a flip.
5. **Extension scope creep.** The drawer's "From your phone" must stay a list + Open & fill; no
   batch behaviour outside Autopilot (N2.6, flagged).
6. **Emulation blind spots.** Share sheets, clipboard bubbles, push permission and the Shortcut are
   not emulable — N8.2's human checklist is part of the definition of done for N1/N4.

## 10. Open questions for the user

1. **Native shell appetite:** accept the metric gate (platform-decision.md §4) as the trigger, or
   do you want an App Store presence at Launch 2 regardless (then N6 moves to P1 and N7.3 must be
   done first)?
2. **Resolver policy:** confirm the walled-host list (LinkedIn, Indeed, Glassdoor, ZipRecruiter)
   is never fetched, and whether Workday posting pages (public, no API) may be fetched for
   JSON-LD/OG — the design says yes, one GET, no cookies.
3. **Firefox for Android:** fund the one-session experiment (N3.2)? If it works we will say
   "Autofill on Android: Firefox" in the listing; if not, nothing changes.
4. **Phone push defaults:** ≤ 3 pushes/day per phone device and digest for the rest — or match the
   engine's 10/day everywhere?
5. **Extension notifications permission:** OK to request the optional `notifications` permission
   for the once-a-day "jobs from your phone are waiting" nudge (N2.4)? It changes the store
   listing's permission list (G30 page must mention it).
6. **US link-out from a future shell:** if the shell ships, do you want US link-out (Stripe, lawful
   today, revisit quarterly) or status-only worldwide from day one (simplest, zero legal exposure)?

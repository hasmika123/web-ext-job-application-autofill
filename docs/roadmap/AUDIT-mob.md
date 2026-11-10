# AUDIT — area `mob` (mobile app & PWA, share-to-Kiwiply, send-to-laptop, push, store rules)

Written 2026-10-11 against local `version2` (`f679549`). Method: every mobile-relevant file in
`web/` (root layout, `public/`, app shell, CSS, workflows), the extension manifest in
`job-autofill/wxt.config.ts`, the `mobile:` polish commits, the user-area designs this area must
reconcile with (`docs/design/user/pwa-push.md`, `onboarding-activation.md`,
`alerts-notifications.md`) and the user stories U0/U2.7/U7.4/U17/U20. State legend: **real** = shipped
+ tests · **partial** = exists but incomplete or unverified on a device · **missing** = nothing in
the code. Evidence paths are relative to the repo root.

Companion: `docs/roadmap/PLAN-mob.md`, `docs/roadmap/areas/mob.json`, `docs/design/mob/*.md`.

## 0. The one-paragraph verdict

Kiwiply on a phone today is a **responsive website with a signed-in shell**: the layout holds at
390 px, controls are 44 px, stat tiles stack 2×2, floating widgets no longer cover content. That is
all. There is **no manifest, no service worker, no install path, no share target, no push, no
offline page, no phone→laptop hand-off, no native shell and no store presence**. The extension —
the product's engine — **cannot install on iOS at all and is untested on Firefox for Android** even
though the manifest declares a Gecko-Android floor. A phone user can search (sample data), save
(sample data), and read their tracker, but cannot capture a job from Safari, cannot be pinged, and
has no way to push a job to the laptop where the fill actually happens. Every competitor with a
mobile app (Teal, Huntr, JobRight) is in the same "tracker-only on the phone" boat; none of them
has solved the phone→laptop apply hand-off. That gap is this area's opportunity.

## 1. What exists today (reusable foundation)

| Capability | State | Evidence | Notes |
|---|---|---|---|
| Responsive signed-in shell (sidebar → off-canvas drawer below `lg`) | **real** | `web/src/components/app-shell/AppShell.tsx:146-160`, `:239-247` (scrim), `:293` (`pb-24` bottom padding) | No bottom tab bar (U0.1 owns it); drawer is the only phone nav |
| 44 px shared controls, 2×2 stat tiles, tabs/kebab/links on phones | **real** | commits `58af9fe` (shared 44px controls), `f057de9` (shell/stat tiles/floating widgets), `a275c37`, `2226f27` (user pages), `792c800` (admin), `2a62116`/`2653462` (org) | Visual polish only; never verified on a real device (`docs/HANDOFF-V2.md` §2: touch interactions unverified) |
| Fluid type/space scales with viewport ladder | **real** | `web/src/app/globals.css:43-45` | Fine on phones; no `env(safe-area-inset-*)` anywhere |
| Viewport meta | **partial** | Next App Router default (`width=device-width, initial-scale=1`); no `viewport` export in `web/src/app/layout.tsx` | Missing `viewport-fit=cover`, `theme-color` (light/dark), `apple-mobile-web-app-*`, `apple-touch-icon` |
| App icons | **partial** | `web/src/app/icon.png`, `web/public/{logo,mark}.svg`, `web/public/logo-icon.png` | No 192/512/maskable set, no `apple-touch-icon`, no monochrome badge icon |
| Web → extension signal + `/connect` hand-off | **real** (desktop only) | `web/src/lib/extension-signal.ts`, `web/src/app/connect/page.tsx`, `job-autofill/src/background/service-worker.js:311-316,396` | On a phone `/connect` ends in `no-extension`; no "open this on your laptop" state (U20.1 partial) |
| Extension polls the server every 15 min + `GET /api/profile/version` carries `plan` | **real** | `job-autofill/src/background/service-worker.js:436-464` (`SYNC_ALARM`), `api/.../web/rest/ProfileResource.java:58-73`, `ProfileVersionVM.java` | The natural carrier for a "jobs waiting from your phone" count (N2.1) |
| Save-a-job from the drawer → `applications` row `SAVED` | **real** | `job-autofill/src/lib/app-tracking.js:56-71` (`buildApplication`, `source: "extension"`), `api/.../ApplicationSyncResource.java:40-63` | Upserts dedupe on `externalJobId`/`jobUrl` — reusable for share-target saves |
| Firefox build declares an Android floor | **partial** | `job-autofill/wxt.config.ts:109` (`gecko_android: { strict_min_version: "142.0" }`) with the comment "Android is not a target we test" | The drawer is a fixed 400 px iframe; never opened on a phone |
| Save-a-job page (`/saved`) | **partial** | `web/src/components/app-v3/saved/SavedV3Page.tsx` | Sample data; U5.1 makes it real |
| Email the extension install link to the laptop | **missing** (designed) | `docs/design/user/onboarding-activation.md` §"The extension is a desktop step" → U2.7 `POST /api/account/send-extension-link` | Not built; this area adds the QR / one-time-link variant and the queue (N2.5) |
| Notifications (in-app bell + interview/offer email) | **real** | `web/src/components/app-shell/NotificationBell.tsx`, `api/.../NotificationService` | No push, no prefs, no badges — U7.* owns the engine; this area owns the mobile delivery rules |
| Cookie consent + bug-report widget on every page | **real** | `web/src/components/{CookieConsent,BugReportWidget}.tsx`, `web/src/app/layout.tsx:66-70` | Bug widget is draggable and can float over content on phones (`docs/HANDOFF-V2.md` §6) |
| CI | **real** | `.github/workflows/ci.yml` (web `tsc + eslint`, API tests) | No mobile emulation, no Lighthouse, no device smoke |

## 2. Feature-by-feature

| Feature | State | Evidence | Gap → stories |
|---|---|---|---|
| Installable PWA (manifest, SW, offline page) | **missing** | `web/public/` has only logos and `v2/` art; no `manifest.webmanifest`, no `sw.js`, no `/offline` route | U17.1 builds it (user area). This area adds the mobile head (`viewport-fit`, `theme-color`, Apple metas, maskable icons) → **N0.2**, and standalone-mode behaviour (external links, OAuth/Stripe round-trips, back) → **N0.3** |
| Install prompts (Android card, iOS sheet) | **missing** | — | U17.2. iOS 26 now opens *any* Home-Screen site as a web app by default, so the iOS sheet copy must change ("Add to Home Screen" is enough) → noted in **N0.2** AC |
| **Share to Kiwiply** (phone share sheet → save a job) | **missing** | no `share_target` in any manifest; no `/share` route; no URL resolver in the API | **N1.1–N1.5** (critical; `docs/design/mob/share-target-and-handoff.md`). iOS Safari has no Web Share Target → iOS gets a paste-link path + a Shortcut recipe (**N1.4**) until a native share extension (**N6.3**) |
| Posting URL → metadata (title, company, ATS) without scraping | **missing** | `job-autofill/src/lib/job-enrich.js` enriches *in the page* (content script); the API has nothing for a bare URL | **N1.2** `POST /api/jobs/resolve` using the same public ATS board APIs the ingest already calls (`api/.../service/jobs/*`) + OG/JSON-LD for the rest; never fetches behind a login |
| **Send to laptop** (queue a job on the phone, fill it on the desktop) | **missing** | `applications` has `status` + `source` only (`job-autofill/src/lib/app-tracking.js:70-71`); no hand-off state, no extension inbox, no desktop nudge | **N2.1–N2.5** (critical; same design doc). Extension gains a "From your phone" list in the drawer home, badge count on the existing 15-min alarm |
| Apply on the phone (no extension possible on iOS) | **missing** | Phone users get "Autofill works on your laptop" (onboarding design §"Phone users") and nothing else | **N3.1** "My answers" copy sheet (honest assist), **N3.2** Firefox-for-Android drawer, **N3.3** share the resume PDF into the ATS file picker, **N3.4** Safari iOS extension (P2, needs N6) |
| Web push on phones | **missing** | U7.4 plans VAPID + `push_subscription`; `pwa-push.md` §2 has the SW handlers | This area owns the *mobile* rules: iOS install gate (**N4.1**), Badging API (**N4.2**), notification actions (**N4.3**), subscription liveness on iOS (**N4.4**), per-platform etiquette caps (**N4.5**) |
| Offline | **missing** | — | U17.1 offline page + U17.4 snapshots (P2). This area adds the share-target **outbox** (**N1.5**), a network-aware fetch layer + low-data mode (**N5.1**, **N5.3**) and snapshots for Saved + queue (**N5.2**) |
| Native app (App Store / Play) | **missing** | no `ios/`, `android/`, `capacitor.config.*`, `expo` anywhere | **Decision: PWA-first; native shell gated on metrics** (`docs/design/mob/platform-decision.md`) → **N6.1–N6.6** (P2) |
| App-store payment rules | **n/a today** (no store app) but **must be decided before N6** | Billing is Stripe Checkout + Portal, webhooks-only mirror (`api/.../BillingResource`, `BillingWebhookResource`, `EntitlementService`) | **N7.1–N7.3**: the PWA keeps Stripe untouched; a shell never sells via IAP; US link-out only where lawful; status-only elsewhere (`docs/design/mob/store-payments.md`) |
| Mobile QA (emulation, devices, events) | **missing** | `ci.yml` has no browser jobs; `HANDOFF-V2.md` §2 lists touch, dark mode, real devices as never verified | **N8.1–N8.4** |
| Marketing on phones ("Add to Chrome" CTA on a phone is a dead end) | **partial** | `(marketing)` pages are responsive; CTA is the Chrome Web Store everywhere | **N0.6** "On your phone" page + the honest phone CTA (mkt area owns the pages; this story is the mobile-specific slice) |

## 3. Cross-cutting findings

1. **iOS is a different product surface.** No Web Share Target, no `beforeinstallprompt`, push only
   inside the installed web app (iOS/iPadOS 16.4+), no browser extensions outside Safari. Every
   mobile story needs an explicit iOS path; the designs mark it.
2. **The hand-off is the whole game.** HireClix 2025: 75 % of Gen Z *fill applications* on a
   desktop while 93 % *search* on a phone (Sellick). The product's phone job is "find and queue",
   the laptop's job is "fill and submit". Nobody in the benchmark connects the two.
3. **Nothing on the phone is measured.** No install, display-mode, share, hand-off or push-platform
   events exist (U18.1 is the pipeline; N8.3 the mobile taxonomy). The native-shell gate (N6.1)
   cannot be decided without them.
4. **Stripe is the truth, and that is compatible with the stores** as long as the PWA sells and a
   future shell never does (US link-out is lawful today under the Epic injunction; elsewhere the
   shell shows plan status only). No IAP mirror, no second entitlement source.
5. **The extension on Android is a cheap experiment.** Firefox for Android runs add-ons; the
   manifest already allows it. One session to make the drawer fit 390 px and smoke-test it decides
   whether "autofill on Android" is a real feature or a footnote.

## 4. Competitive benchmark (checked 2026-10-11)

Sources are web search + store listings fetched on 2026-10-11; store ratings move, so treat the
numbers as a snapshot. Where a claim could not be verified from a primary page it is marked.

| Product | What it does best on mobile | Mobile complaints / gaps | Kiwiply: beat / match / don't copy |
|---|---|---|---|
| **Teal** (web + Chrome ext + iOS/Android app; Teal+ ≈ $29/mo) — [tooliverse review](https://tooliverse.ai/tools/teal), [Teal vs Huntr 2026](https://cloudcolleague.com/blogs/job-hunting/teal-vs-huntr/), [Chrome listing](https://chrome.google.com/webstore/detail/teal%E2%80%99s-job-search-tracker/opafjjlpbiaicbbgifbejoochmmeikep) | The smoothest "save a job from any site" flow via the extension; ATS keyword gap analysis; app syncs the tracker | Store reviewers: the mobile app "is mostly just for tracking", no resume editor on mobile, free AI credits run out fast (secondary sources) | **Match** one-tap save (ours = share sheet, no extension needed). **Beat** with send-to-laptop and a resume-on-the-phone path via the Resume Builder (R-epics). **Don't copy** credit-metered free AI — our free tier is BYO key + parsing only, stated plainly |
| **Huntr** ("Job Search Browser" iOS, 4.7★ / 359 ratings; Android; Pro ≈ $40/mo) — [App Store](https://apps.apple.com/app/id1372389812), [techyorker](https://techyorker.com/products/huntr/) | In-app multi-site job browser with one-tap save; map view; tasks/notes/interviews | Reviews: mobile "only useful for managing existing entries", cannot delete on mobile, cannot create from LinkedIn/Indeed; last store update 2024-09 | **Beat** on capture (share target from *any* app incl. LinkedIn/Indeed) and on hand-off. **Match** notes/tasks on the phone (U6.*). **Don't copy** the in-app browser — it is a sandboxed web view that cannot autofill and reads as a workaround |
| **Simplify** (Chrome/Firefox/Edge ext + web; `COMPETITIVE-LANDSCAPE.md` §2.1 reports an iOS app — my store check on 2026-10-11 found no listing, so treat it as unverified) — [simplify.jobs/autofill](https://simplify.jobs/autofill), [Chrome listing](https://chrome.google.com/webstore/detail/pbanhockgagggenencehbnadejlgchfc), [JobRight's review of Simplify](https://jobright.ai/blog/simplify-copilot-review-2026-features-pricing-and-top-alternatives/) | Best-in-class one-click autofill + auto-logging on submit; the benchmark for the extension itself | Little or no phone surface; if the iOS app exists it is a job board + tracker, not a fill tool | **Beat** by existing on the phone with a working queue to the laptop. **Match** auto-logging (exists: submit-detect). **Don't copy** "one-click apply" marketing that drifts toward auto-submit — locked: no auto-submit |
| **JobRight** (iOS "AI Job Search" 4.8★ / ≈1.6K ratings; Android; free + labelled premium; US-only) — [App Store](https://apps.apple.com/app/id6738236788), [careery review](https://careery.pro/blog/ai-job-search/jobright-ai-review) | A real mobile *product*: one feed from boards + company sites, match scores, instant alerts, tracker, dark mode, multiple resumes with instant analysis; "Orion" AI copilot | Reviews: app does not recognise it is installed when opened from email links (deep-link bug); Trustpilot: autofill inserts wrong data; US only | **Match** the feed + match score + alerts on the phone (U4/U7 own the data; this area owns delivery). **Beat** on deep-link hygiene (N0.3) and on the honest hand-off. **Don't copy** US-only coverage or an AI chatbot as the primary mobile UI |
| **LinkedIn** (mobile ≈ 57–74 % of traffic, sources conflict) — [market.us](https://market.us/statistics/social-media/linkedin/), [waalaxy](https://blog.waalaxy.com/en/linkedin-statistics/), [unstar complaint analysis](https://unstar.app/blog/linkedin-indeed-glassdoor-ziprecruiter-job-search-apps-ranked-2026) | Easy Apply on the phone; alerts; the share sheet everyone already uses to send jobs to friends | 1–3★ reviews across the big apps: ghost/stale jobs 24 %, applications vanish without reply 18 %, misleading salary 14 % (unstar; methodology unverified) | **Beat** on honesty: freshness badges, "no reply in N days" nudges (U5.2/U6), and the tracker that fills itself from the inbox. **Match** being a share-sheet target *of* LinkedIn. **Don't copy** notification volume |
| **Indeed** (70 % of its job-search traffic is mobile per Indeed's own recruiting pages) — [in.indeed.com](https://in.indeed.com/hire/mobile-recruiting), [bestjobsearchapps complaints](https://bestjobsearchapps.com/articles/en/8-best-job-finder-apps-for-us-job-seekers-and-employers-in-2026) | Indeed Apply from any device; huge inventory | Reviewers report notification bugs, spam email, outdated listings, "employer has moved on" | **Beat** with quiet-by-default push (≤3/day on mobile, quiet hours) and a one-tap "mute this kind". **Match** alert speed. **Don't copy** email volume |
| **Glassdoor** (2019: 58 % of users search on phones; mobile applicants complete 53 % fewer applications and take 80 % longer) — [glassdoor blog](https://www.glassdoor.com/blog/mobile-job-search-2/) | Company reviews + salaries at the moment of saving | Same stale-listing complaints as the group | The 53 %/80 % numbers are the reason send-to-laptop exists: finish on the device where completion is high |
| **Password managers (1Password, Bitwarden) as the mobile-autofill reference** — [1Password community](https://www.1password.community/1password-at-home-31/safari-on-ios-ignores-autofill-collection-12683) | Safari-only iOS extensions + system AutoFill; the only proven "fill a form on iOS" pattern | Firefox-for-Android autofill breakages reported through 2026 | The template for N3.4 (Safari iOS extension inside a native shell) — later, gated |

**Platform facts the plan relies on (checked 2026-10-11):**
- iOS 26 opens any Home-Screen site as a web app by default (switchable) — [heise](https://heise.de/-10749652), [WebKit WWDC25](https://webkit.org/?p=16993). Web Push for Home-Screen web apps since 16.4, user-gesture prompt only — [iClarified](https://www.iclarified.com/89346/apple-announces-web-push-for-web-apps), [OneSignal iOS web push](https://documentation.onesignal.com/docs/ios-web-push).
- Web Share Target: experimental, "limited availability", installed PWAs only; Chromium on Android/desktop, not Safari — [MDN share_target](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/share_target).
- Apple, US storefront since May 2025: external purchase links/buttons allowed without the entitlement and (for now) without commission; Ninth Circuit (2025-12-11) upheld contempt but remanded the zero-commission remedy; Apple still appealing — [512pixels](https://512pixels.net/2025/05/apple-updates-app-review-guidelines/), [AppleInsider](https://appleinsider.com/articles/26/03/30/the-epic-vs-apple-case-wont-get-a-rehearing-for-app-store-fees), [Adapty](https://adapty.io/blog/can-you-use-stripe-for-in-app-purchases/). Stripe: link out to the system browser, never a WebView — [Stripe guide](https://stripe.com/es/guides/how-app-developers-can-reduce-fees-and-create-an-optimized-checkout). Bare web wrappers risk Guideline 4.2 — [Apple forums](https://developer.apple.com/forums/thread/115230), [capgo](https://capgo.app/blog/how-to-put-a-web-app-on-the-app-store/).
- Google Play, US: no Play Billing requirement, external links allowed (policy 2025-10-29; programs 2025-12-09; fee reporting deadline 2026-12-01; revised Epic settlement 2026-03-04) — [Google Play policy page](https://support.google.com/googleplay/android-developer/answer/15582165?hl=en); reported fee structure 10 % on the first $1M — [shopifreaks](https://www.shopifreaks.com/google-starts-cutting-play-store-fees-to-a-flat-10-service-fee-on-the-first-1m-and-allows-external-payment-links-making-good-on-its-epic-games-settlement/) (press, not policy text).
- Who applies where: 75 % of Gen Z fill applications on a desktop (HireClix 2025 job-seeker survey via [pin.com](https://www.pin.com/blog/genz-candidate-hiring-process-behavior/)); `COMPETITIVE-LANDSCAPE.md` §5 cites Appcast's ~65 % of applications completed on mobile (an employer-side career-site benchmark skewed to hourly roles) — the two measure different things and both hold: discovery and quick-apply on the phone, long ATS forms on the laptop. 93 % of Gen Z have searched on a phone, 73 % willing to apply on one ([HR Review / Sellick](https://hrreview.co.uk/?p=121558)); 46 % of Gen Z got a job or internship via TikTok (Zety 2025 via [SHRM](https://www.shrm.org/in/topics-tools/news/how-social-media-is-redefining-job-hunting-gen-z)) — vendor surveys, modest samples.
- Gap list input (`docs/roadmap/COMPETITIVE-GAPS.md`, commit `0843de1`): **G14** (share-target, tagged N) is the spine of N1; **G4** (JD snapshot) is folded into the share save; **G35** (social share cards) into N1.6; **G11** (Safari presence) into N3.4; **G10** (store review prompt) applies only once a native shell exists (N6.6). See `PLAN-mob.md` §6 for accepted/rejected rows.

**Where Kiwiply wins (summary):** (1) capture from any app via the share sheet with zero extension;
(2) the only phone→laptop apply queue in the category; (3) quiet, actionable push; (4) honest
"what works on your phone" instead of a tracker-only app pretending to be the product.
**Where we must match:** instant alerts, dark mode, match scores on the phone, deep links that
open the installed app. **What we don't copy:** in-app job browsers, IAP-metered AI credits,
notification spam, auto-submit.

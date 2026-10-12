# AUDIT — area `ext` (browser extension & application-tracking engine)

Written 2026-10-11 against local `version2` (= `product-roadmap` + the roadmap docs). Method: every
file under `job-autofill/` (engine `src/`, WXT `entrypoints/`, `test/`, the store/privacy docs), the
API resources the extension calls, and the web pages it hands off to. State legend: **real** = shipped
code + tests · **partial** = built but unverified live / missing a half · **missing** = planned only.
Evidence paths are relative to the repo root. Extension version at audit: **0.65.0** (`job-autofill/
wxt.config.ts`, `package.json`); bundled ruleset **v6** (`src/config/rules.js`).

Companions: `docs/roadmap/PLAN-ext.md`, `docs/roadmap/areas/ext.json`, `docs/design/ext/*.md`.

## 0. What is real underneath (the engine as shipped)

| Capability | State | Evidence | Notes |
|---|---|---|---|
| WXT/Vite build, generated manifest as a function of build env, pinned `key`, dev-only hosts dropped in prod | real | `job-autofill/wxt.config.ts`, `entrypoints/{background,content}.ts`, `.github/workflows/publish-extension.yml`, `.github/scripts/check-manifest-limits.mjs` | CI zips on `ext-v*` tags; CWS auto-publish gated on `PUBLISH_EXTENSION` var |
| Canonical-field engine: 23 + 6 (10.3a) fields, phrase matchers, tiered label signals (autocomplete > automation-id > label > meta), confidence | real | `src/lib/schema.js`, `src/config/rules.js`, `src/content/adapters/base.js` (`labelParts`, `TIER`, `scanGeneric`) | Low-confidence rows render unchecked in the overlay |
| Dedicated adapters: Workday (479 lines, multi-step, exp/edu rows, CC-305 self-ID), Greenhouse (61), Lever (46), Ashby (49), Workable (68), Indeed smartapply (100) + generic label scanner | real | `src/content/adapters/*.js` | Greenhouse/Lever/Ashby are thin: hard selectors for name/contact only, the rest is generic |
| Generic-only hosts in the manifest: iCIMS, Taleo, SmartRecruiters, BambooHR, Jobvite | partial | `entrypoints/content.ts` `matches`, `wxt.config.ts` `host_permissions` | No adapter; SmartRecruiters shadow DOM fixed (BUG-5, `deepQueryAll`), the rest never live-tested (`AUTOFILL-QA.md` §6–9) |
| Shadow-DOM piercing, radio/checkbox group prompts, EEO always fills when the user has data, Ashby full-name precedence, Lever location → city | real | `base.js` `deepQueryAll`/`groupPrompt`, `test/qa_fixes.test.js` (17 cases) | v0.37.0 fix pass; live re-verification on the affected sites still open |
| Review overlay (shadow DOM): per-row checkbox, AI / reused / `?` badges, salary pill, "never submits" copy, auto-advance (Next/Continue only) | real | `src/content/filler.js` (`renderOverlay`, `findNextButton`), `W5-QA.md` §3 | Overlay is light-only by design; no provenance badges yet (3.6.7) |
| Post-fill audit: required-but-empty card with Go → focus/outline, auto-advance pauses | real | `src/content/required-audit.js`, `filler.js` `showGaps` | Native `required`/`aria-required`/trailing `*` only; custom widgets unseen |
| Fill telemetry (count-only, ATS family reduced in-page, no user id) → `fill_event`; admin "Fill quality by ATS" | real | `src/lib/fill-telemetry.js`, `api/.../FillTelemetryResource.java` (`POST /api/telemetry/fills`, `/fills/{id}/correction`), `20260922000000_fill_event.xml`, `web/src/components/admin-v3/analytics/AnalyticsPage.tsx` | No per-field-class failure breakdown; no adapter-rot alert; corrections miss radio groups |
| Field cache (local + cross-site twin + server sync, last-write-wins) | real | `src/lib/field-cache.js`, `FieldCacheSyncResource.java`, `test/field_cache.test.js` | Sync is Pro-gated by decision |
| AI layer: BYO Anthropic key → consented Kiwiply AI (Gemini); drafts, constrained picks (option-validated), field-mapper fallback; EEO never AI-touched; 402 `PRO_REQUIRED` surfaced | real | `src/content/assist.js`, `src/lib/field-map.js`, `src/content/field-mapper.js`, `src/background/service-worker.js` (`draftAnswer`, `pickAnswer`), `test/assist_picks.test.js`, `test/field_mapper.test.js` | All three default OFF; 10.5 ("on for Pro by default") not done |
| Job capture chain (JSON-LD → adapter → board host → og/meta), structured salary, provenance, opt-in AI enrichment | real | `src/lib/job-capture.js`, `src/lib/job-enrich.js`, `test/job_capture*.test.js` | Board capture = LinkedIn/Indeed/Dice by URL shape only (no DOM, no fill) |
| Auto-log DRAFT on fill + submit detection (success URL via `webNavigation`, in-page success copy via `MutationObserver`, 30-min window, per-tab pending in storage) → APPLIED | real | `src/lib/app-tracking.js` (`isSuccessUrl`, `hasSuccessSignal`), `src/content/submit-detect.js`, `service-worker.js` (`logFill`, `confirmForTab`, `CONFIRM_WINDOW_MS`) | Generic cues only — no per-ATS confirmation selectors, no precision measurement; misses rely on the web "Did you submit?" nudge |
| Save-a-job from the drawer (any site with JSON-LD/og, `activeTab`) → SAVED | real | `entrypoints/panel/SaveJobDialog.tsx`, `home-actions.ts` `commitSaveJob`, `service-worker.js` `saveJob` | Done (U20.2) |
| Profile-learn (10.3d): learned answers → `/api/profile/suggestions` with per-install salted context hash | real | `src/content/profile-learn.js`, `service-worker.js` `recordLearnedAnswers`, `test/profile_learn.test.js` | Multi-step path change can double-count one application |
| Drawer (injected iframe, floats, never resizes the page): resume picker, resume-fit (Pro), job-fit (Pro), scan & fill, save, upload-on-the-fly → shared `ResumeUpload`, connect prompt, trust footer | real | `entrypoints/panel/{App,HomeView,home-actions,services}.tsx`, `lib/panel-frame.ts` | No popup, no native side panel (decided) |
| Options (slim): account status, appearance (light/system/dark), AI switches + consent, filling defaults, analytics opt-out, learn-from-applications, bug reporter | real | `entrypoints/options/{OptionsApp.tsx,actions.ts}` | Matches the locked "no in-extension profile" rule |
| Sync model: web signal (`KIWIPLY_SYNC`), 15-min alarm + focus-gated version check, `KIWIPLY_MIRROR_UPDATED` broadcast, revoke on `signedOut` | real | `src/lib/sync.js`, `service-worker.js`, `test/sync*.test.js` (335 + 463 lines) | Done (U20.5) |
| Connect handoff: `externally_connectable` (Chrome/Edge) + Firefox connect-relay content script; origin gate derived from the manifest; `sender.tab` check | real | `entrypoints/connect-relay.content.ts`, `test/connect_handoff.test.js` (52 cases), `BROWSERS.md` | Firefox path never smoke-tested live |
| Edge: same bundle, audited API surface | real | `BROWSERS.md` §Edge | No Edge Add-ons listing yet |
| Firefox 140+ MV3 build, `data_collection_permissions`, `web-ext lint` 0 errors | partial | `wxt.config.ts` (`browser_specific_settings`), `package.json` `build:firefox` | Needs the live smoke test + AMO source-archive submission |
| GA4 Measurement Protocol analytics (master switch, opt-out, PII sanitizer) | real | `src/lib/analytics.js`, `.github/scripts/inject-ga.js` | Dark unless CI injects creds |
| Design system on every React surface, dark mode, reduced motion, live regions | real | `EXT-UI-PLATFORM-PLAN.md` W5.1–W5.6, `packages/ui` | W5.7 visual walk still unchecked |
| Store collateral: listing copy, privacy tab answers, reviewer notes, shot list, pre-submit checklist | real (docs) | `job-autofill/STORE-LISTING.md`, `PRIVACY.md`, `DEPLOY.md` §8 | v1 **published and under review** on CWS (PROGRESS "Store status"); 15.3 resubmit with the Pro build pending |
| Tests: 28 node/jsdom suites (adapters, cache, tracking, sync, capture, telemetry, learn, handoff) run in CI | real | `job-autofill/package.json` `test`, `test/harness.js`, `.github/workflows/ci.yml` | **No real-DOM fixture snapshots per ATS**; no browser-level e2e (Playwright + loaded extension); no Firefox CI |

Not present anywhere: real-tenant HTML fixtures as regression tests · adapters for the 5 generic-only
hosts · SuccessFactors / Oracle Recruiting / Taleo-Enterprise hosts (telemetry already names them as
families) · per-ATS submit-confirmation selectors or a measured precision for submit-detect · an
in-drawer "Did you submit?" resolution · remote config (min version, per-ATS kill switch, announcements)
· an error/exception reporter · a unified product-event envelope from the extension · the Autopilot
orchestrator (Phase 19) · marketer hooks (O10.7/O10.8) · Safari · Edge Add-ons listing · uninstall
survey/feedback · an extension-side "what we send" transparency panel · keyboard shortcut to open
the drawer · an answer library view (10.6, web) · Playwright e2e with the built extension.

## 1. Feature-by-feature

| Feature | ROADMAP / plan ref | State | Real today | Gap | Evidence | Stories |
|---|---|---|---|---|---|---|
| Store presence (CWS) | 15.3, W6.4 | **partial** | v1 listed, under review; CI packaging + manifest-limit check; publish workflow ready | Pro-build resubmit, screenshots, reviewer account, W5.7 walk, `NEXT_PUBLIC_KIWIPLY_EXTENSION_ID` redeploy; no release-notes discipline; no rollback plan | `PROGRESS.md` §Store status, `STORE-LISTING.md` §Pre-submit, `DEPLOY.md` §8 | E0.1–E0.5 |
| Firefox (AMO) | 7.2 / W6.1 | **partial** | build + lint + relay | live smoke, AMO submission with source archive, Firefox CI job | `BROWSERS.md` §Firefox | E9.1–E9.3 |
| Edge Add-ons | 7.1 | **partial** | same zip works | no Partner Center listing; no Edge smoke in release checklist | `BROWSERS.md` §Edge | E9.4 |
| Safari | 7.3 | missing | — | converter + Xcode; deferred by decision | `ROADMAP.md` Phase 7 | E9.5 (P2) |
| Real-DOM fixture harness | 10.6 | **missing** | jsdom tests hand-build markup from captured ids (Workday/Workable/Indeed) | no snapshot capture tool, no per-ATS fixture folder, no fill-rate assertion, no rot alert | `test/harness.js`, `test/workable.test.js`, `test/indeed.test.js` | E1.1–E1.6 (critical) |
| ATS coverage: iCIMS, Taleo, SmartRecruiters, BambooHR, Jobvite | 10.4 | **missing** (generic only) | hosts matched; generic scanner runs | no adapters, no captured DOM (iCIMS/Taleo account-gated), SmartRecruiters apply spot-check pending | `AUTOFILL-QA.md` §5–9 | E2.1–E2.5 |
| ATS depth: Greenhouse / Lever / Ashby | 10.4 | **partial** | contact + links + resume file | no experience/education blocks, custom-question groups, Greenhouse "demographic questions" step, Ashby multi-section, Lever cards | `src/content/adapters/{greenhouse,lever,ashby}.js` | E2.6–E2.8 |
| Workday depth | 10.4 | **partial** | My Information validated live; later steps unit-tested only | My Experience/Application Questions/Voluntary Disclosures never live-validated end to end; tenant variants | `AUTOFILL-QA.md` §11, `src/content/adapters/workday.js` | E2.9 |
| New ATS families (SuccessFactors, Oracle Recruiting Cloud, Taleo Enterprise, Phenom, Eightfold, Paylocity, ADP) | 10.4 (unscheduled) | missing | telemetry families exist for SF/Oracle | no hosts, no adapters; each is a host-permission (store re-review) change | `src/lib/fill-telemetry.js` `FAMILIES` | E2.10–E2.11 |
| Multi-step orchestration (generic) | 10.4 | **partial** | Workday + Indeed only; `findNextButton` generic | no generic "fill → audit → next → refill" loop; no step memory | `filler.js` auto-advance branch | E3.1 |
| Combo/autocomplete apply reliability | AUTOFILL-QA VERIFY-1/2 | **partial** | `selectCustom` unit-tested | react-select/async typeaheads unconfirmed live (Greenhouse country/city, Workable country, Lever location) | `base.js` `selectCustom`, `test/autocomplete_confidence.test.js` | E3.2 |
| Required-audit for custom widgets | 10.2 | **partial** | native controls only | custom listboxes / Workday buttons without native inputs invisible | `required-audit.js` header comment | E3.3 |
| Provenance + confidence in the overlay | 3.6.7 | missing | badges for AI/reused/low | no "from JSON-LD / adapter / generic" cue; no per-row "why this value" | `filler.js` `badges()` | E5.3 |
| Submit detection precision | 3.2 | **partial** | generic URL regex + confirmation copy | no per-ATS confirmation rule, no precision metric, no inbox-confirmation fallback into the same row, no drawer "Did you submit?" | `app-tracking.js` `SUCCESS_URL`/`SUCCESS_COPY`, `service-worker.js` `confirmForTab` | E4.1–E4.4 (critical) |
| Tracker events from the extension | U6.1 (design) | missing | DRAFT/APPLIED upserts only | no `application_event` source=EXTENSION rows, no resume-used/attachment events | `docs/design/user/applications-inbox.md` §1 | E4.5 |
| Board capture (LinkedIn/Indeed/Glassdoor/Google Jobs) → Save | 3.3 | **partial** | URL-shape recognition + JSON-LD/og | no LinkedIn job-detail DOM capture when JSON-LD is absent; no Glassdoor/ZipRecruiter/Wellfound; **no LinkedIn Easy Apply fill by decision** | `job-capture.js` `boardCapture` | E4.6 |
| Drawer UX (job-page state, fit, actions) | W5 | real | picker, fit, fill, save, upload | no page-state header ("Greenhouse · 14 fields"), no keyboard shortcut, no learned-answers peek, no "open on web" deep links per application, no announcements | `entrypoints/panel/HomeView.tsx` | E5.1–E5.6 |
| AI on by default for Pro | 10.5 | missing | all AI switches default OFF | Pro users never discover the mapper/drafter; consent flow for Gemini still needed | `OptionsApp.tsx` AI card, `PRIVACY.md` | E6.1–E6.4 |
| Answer library (view/edit/delete learned answers) | 10.6 | missing | server `field_cache` + suggestions | no web page; extension shows nothing | `FieldCacheSyncResource.java` | E6.5 (web-owned, ext read) |
| Telemetry v2 / unified events | U20.4, A11.2 | missing | fill counts only | no `fill.started`/`drawer.opened` product events, no field-class failure counts, no error reporter | `docs/design/user/analytics-events.md` §0.2 | E8.1–E8.4 (critical) |
| Remote config (min version, per-ATS kill switch, announcements) | A5.4, A5.5 | missing | — | a broken adapter cannot be paused without a store release (1–7 days) | `rules-store.js` (remote ruleset removed in W6.2) | E8.5–E8.6 |
| Autopilot orchestrator | 19.2–19.5 | missing | — | queue consumer, window/tabs, throttle, needs-you, attestation detector, `tabs` permission release | `ROADMAP.md` Phase 19 | E7.1–E7.7 (critical) |
| Marketer hooks | O10.7, O10.8 | missing | — | role on version endpoint, Save-for-consultant, assignment APPLIED | `docs/roadmap/areas/org.json` O10 | E11.1–E11.2 |
| Web ↔ ext hand-off | U20.1, U20.3 | **partial** | connect works; signal works | no extension-aware web cards, no install funnel events, no uninstall URL/survey, no update notes | `web/src/app/connect/page.tsx`, `web/src/lib/extension-signal.ts` | E12.1–E12.4 |
| Security & privacy posture | PRIVACY.md, W6.0 | real | origin gate, no remote code, count-only telemetry, salted context hash, key never in bundle | no automated "no submit click" proof test, no CSP on panel pages, PRIVACY ↔ manifest drift check is manual, no transparency panel | `PRIVACY.md`, `wxt.config.ts` | E10.1–E10.5 |
| Browser e2e (Playwright + built extension) | — | missing | — | nothing exercises the real drawer/overlay in a browser; W5.7 is manual | `W5-QA.md` | E1.5 |

## 2. Cross-cutting gaps

| Topic | State | Evidence | Stories |
|---|---|---|---|
| Release train (version bump ritual, changelog, `ext-v*` tag, staged rollout, rollback) | partial — ritual exists, no changelog/rollout/rollback | `CLAUDE.md` §Version-bump ritual, `publish-extension.yml` | E0.3, E0.4 |
| Store policy drift (permissions ↔ PRIVACY ↔ AMO `data_collection_permissions`) | manual | `PRIVACY.md`, `wxt.config.ts` comments | E10.3 |
| Host-permission growth = re-review risk | each new ATS host triggers CWS re-review; `tabs` (Autopilot) is a new warning | `wxt.config.ts` `host_permissions` | E2.10, E7.6, design `store-release-engineering.md` |
| Accessibility of the on-page overlay | unverified (focus trap, SR announcement of "N fields ready") | `W5-QA.md` §6 | E5.5 |
| Performance (content script on every ATS page, `all_frames:true`) | unmeasured; Simplify's top Firefox complaint is memory/slowdown | `entrypoints/content.ts` | E3.6 |
| CAPTCHA posture | never touched (Indeed last step avoided) — no explicit detector that *stops* auto-advance | `src/content/adapters/indeed.js` | E7.4, E10.2 |
| LinkedIn Easy Apply | **deliberately not built** (LinkedIn User Agreement §8.2 bans automation; account restrictions) — capture/save only | `job-capture.js` `boardCapture` | plan §4 "do not copy" |

## 3. Competitive benchmark (checked 2026-10-11)

Nine products that define user expectations for an autofill/tracking extension. Ratings and prices are
as found on the dates below; most third-party reviews are vendor-written, so the primary store pages
are weighted highest.

| Product | What it does best | Pricing (as found) | User complaints | Kiwiply verdict |
|---|---|---|---|---|
| **Simplify Copilot** — [CWS listing](https://chromewebstore.google.com/detail/simplify-copilot-autofill/pbanhockgagggenencehbnadejlgchfc) · [Firefox](https://addons.mozilla.org/en-US/firefox/addon/simplify-jobs/) · [autofill page](https://simplify.jobs/autofill) · [help](https://help.simplify.jobs/articles/1749022-installing-and-setting-up-copilot) | Breadth: "100+ ATS / 100,000+ career sites", Workday/Lever/Greenhouse named; **600k CWS users, 4.9★ (3.8k ratings), v3.1.8 updated 2026-10-01**; free unlimited autofill; tracker + AI resume behind the same account; review-before-submit stated in help | Free autofill; Simplify+ premium (price not published on the pages fetched) | Firefox build "in beta, best-effort", **4.2★ / 147** there with 23 one-stars: slowdowns, memory, login problems, dropdowns not filling when a degree option is missing; a 2026 hands-on ([jobhire.ai](https://jobhire.ai/blog/simplify-jobs-review)) measured ~90 % on Greenhouse/Lever, ~70 % on Workday, ~0 on long government forms | **Must match:** coverage breadth on the top-10 ATS, 4.9★ polish, free core autofill. **Beat:** a *measured* fill rate per ATS surfaced to the user, required-gap audit, honest Firefox (ours is MV3 140+ with a real sign-in path), count-only telemetry with no user id |
| **Teal** — reviews via [resumly](https://resumly.ai/answers/teal-review), [resumehog](https://resumehog.com/blog/posts/teal-hq-review-april-2026-is-the-job-tracker-worth-your-time.html), [tooldirectory](https://tooldirectory.ai/tools/teal) | Save-a-job from 40+ boards with salary/keyword extraction; the most polished tracker; CWS ~4.9★ / ~3.1k ratings / ~200k users (third-party figures) | Free tracker; Teal+ quoted anywhere from $9/wk to $29/mo to $79/qtr (sources disagree) | Premium price; resume exports some ATS misread; AI credits restrictive; mobile lags desktop; "no autofill" per one reviewer (contradicted by another) | **Match:** one-click save with salary + keywords (we have JSON-LD salary + provenance; add keyword chips). **Beat:** our tracker fills itself from the fill + submit-detect + inbox; Teal's needs manual status changes |
| **Huntr** — [loopcv directory](https://www.loopcv.pro/directory/huntr/), [apply-mate roundup](https://apply-mate.com/blog/best-chrome-extensions-for-job-seekers) | Kanban board + clipper + "unlimited autofill"; strong on the pipeline view | Free to 100 jobs; Pro ~$40/mo (or ~$30/mo quarterly) | Price; autofill "struggles with custom forms" at smaller companies; surface-level resume tools | **Beat on price** (Pro $19.99 → $24.99) and on the long tail: our generic scanner + AI mapper + learned answers are the custom-form answer |
| **JobRight (Agent + autofill)** — [atsverification review](https://atsverification.com/blog/jobright-ai-review-2026/), [Trustpilot](https://ca.trustpilot.com/review/jobright.ai?page=7), [loopcv](https://www.loopcv.pro/directory/jobright/) | Matching + autofill across Workday/Greenhouse/Lever/Taleo/iCIMS; ~100k users, 4.6★ (third-party) | Turbo reported $39.99/mo (up from $29.99), **no public pricing page** | Agent **fabricated** an accomplishment in an application answer; resume AI invents skills; ~72 % of one-star reviews cite billing/cancel problems (one analysis) | **Do not copy:** hidden pricing, dark-pattern cancel, un-grounded AI answers. **Beat:** drafts grounded only in the profile (`draftAnswer` system prompt), option-validated picks, plain "cancel anytime" |
| **Careerflow** — [Capterra](https://www.capterra.com/p/10015230/Careerflow-ai/), [toolsforhumans](https://www.toolsforhumans.ai/ai-tools/careerflow), [jobright review](https://jobright.ai/blog/careerflow-review-2026-features-pricing-and-user-experience/) | LinkedIn profile optimizer + tracker + job autofill; good onboarding | Free (10 tracked jobs); $8.99/wk · $23.99/mo · $54.99/qtr · $172.99/yr (Feb 2026) | Restrictive free plan; ATS parsing inaccurate; bugs/steep setup | **Match:** quarterly price point ($54.99 at Launch 2 is identical). **Beat:** no weekly-plan upsell; free tier keeps full autofill |
| **LazyApply** — [loopcv review](https://blog.loopcv.pro/lazyapply-review/), [Trustpilot](https://ca.trustpilot.com/review/lazyapply.com?page=3), [scale.jobs on bans](https://scale.jobs/blog/lazyapply-risk-profile-banned-linkedin) | Raw throughput: "apply to thousands with one click" on LinkedIn/Indeed/ZipRecruiter; lifetime pricing | Lifetime/one-off plans | **Trustpilot ~2.4★**, ~56 % one-star: wrong info submitted, irrelevant jobs, refunds ignored, support silent; on a "blacklisted LinkedIn plugins" list; LinkedIn account restrictions | **Deliberately not copied:** no auto-submit, no LinkedIn automation, no CAPTCHA bypass, no "lifetime" pricing. Autopilot (Phase 19) prepares and stops before submit |
| **Sonara** — [jobright review](https://jobright.ai/blog/sonara-review-2026-pros-cons-and-what-users-actually-experience/) | Cloud auto-apply that "recommends a minimum of 100 applications" | Subscription | Volume-first; users don't see what was sent; ATS fraud signals now flag volume anomalies | **Do not copy:** cloud auto-apply (locked out by CLAUDE.md). Our batch runs in the user's own browser and parks "needs you" items instead of guessing |
| **JobCopilot / EasyJobs / FastApply (long tail)** — [extensionauditor](https://extensionauditor.com/scan/jobcopilot-bnnacanndojemikeabbdejlamlecikcn), [extscope](https://www.extscope.org/extension/bgadbfbglghghbbiaifneokpapebncmk), [fastapply blog](https://blog.fastapply.co/best-auto-apply-chrome-extensions-2026) | Niche: cheap auto-apply, "anti-bot bypass" advertised by at least one vendor ([autoapply](https://autoapply.duckdns.org/)) | $10–30/mo | 3.6★ with 49 ratings (EasyJobs); tiny user bases; policy risk | **Do not copy** any "anti-bot bypass". Expect CWS to tighten on this class; staying clean is a listing asset |
| **Workday 2026R1 recruiter side** — [Workday 2026R1 TA review](https://community-content.workday.com/en-us/public/feature-release/workday-success-plans--feature-release-reviews/2026R1-Feature-Release-Review-Webinars/2026R1-Talent-Acquisition.html), [kognitiv summary](https://kognitivinc.com/blog/2026r1-decoded-the-features-that-actually-matter-for-your-roadmap), [crosschq](https://support.crosschq.com/knowledge/workday-connector-for-applicantx) | Not a competitor — the counter-party: "advanced signal data for fraudulent application detection" (network/location signals, lock personal info after submit); partners (CrossChq, Persona, Gem) add fraud engines | — | Recruiters now get volume-anomaly and identity signals | **Design constraint:** humanlike pacing, one profile = one real person, never submit, never ticks attestations — and tell the user why (the "trust footer" earns its place) |

Policy context: LinkedIn's User Agreement §8.2 bars bots/automated methods and its Prohibited
Software policy names browser extensions ([scoutify](https://scoutify.com/blog/linkedin-auto-apply/),
[linkedinpreview guide](https://linkedinpreview.com/blog/linkedin-automation-guide-2026)); CWS's
single-purpose and deceptive-behaviour policies are the listing risk for auto-apply tools
([Chrome policy update](https://developer.chrome.com/blog/policy-update-2sv?hl=es)).

**Where Kiwiply beats the field today:** count-only telemetry with no user id (no competitor states
this); a required-gap audit after every fill; learned answers that become reviewed profile suggestions;
a BYO-key AI path that is free and leaves the browser directly; a sign-in that never lives in the
extension; MV3 Firefox with a real session handoff.

**Where Kiwiply must match before it can claim "best":** ATS breadth (5 generic-only hosts, no
SuccessFactors/Oracle), a public per-ATS fill-rate number backed by fixtures, a 4.9★ store listing
with screenshots, Edge/Firefox listings, keyboard/overlay accessibility, and a visible "N fields ready
/ 2 need you" state the moment the drawer opens.

**What Kiwiply will not copy:** auto-submit of any kind, LinkedIn Easy Apply automation, CAPTCHA or
anti-bot bypass, hidden pricing, weekly-plan upsells, lifetime deals, un-grounded AI answers.

## 4. Honest status counts for `areas/ext.json`

**done** = shipped code + tests in `job-autofill/test` (baseline stories: engine, adapters as they
stand, capture, submit-detect v1, save-a-job, field cache, AI layer, telemetry 10.1, audit 10.2,
profile-learn, sync, connect, Edge, manifest hygiene, design system). **partial** = built but unverified
live or missing its other half (CWS resubmit, Firefox smoke, W5.7 walk, thin adapters, combo apply,
generic-only hosts, submit-detect precision, board capture). **not_started** = everything else
(fixture harness, new adapters, remote config, telemetry v2, Autopilot, marketer hooks, Safari).

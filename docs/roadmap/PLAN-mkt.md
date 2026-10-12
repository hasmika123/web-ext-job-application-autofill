# PLAN — area `mkt` (marketing site & growth)

Written 2026-10-11 (Fable, on the user's "best product in this space" brief). Machine-readable twin:
`docs/roadmap/areas/mkt.json` (12 epics, 82 stories: 5 done · 11 partial · 66 not started; 8 critical).
Audit with the competitive benchmark: `docs/roadmap/AUDIT-mkt.md`. Deep designs: `docs/design/mkt/*.md`
(honest-claims register, SEO + content engine, help center, referral programme, growth funnel,
pricing page, campus/creator programmes). Market inputs: `COMPETITIVE-LANDSCAPE.md`,
`COMPETITIVE-GAPS.md` (gap ids `G…` are cited in stories' `benchmark` fields).

## 1. The shape of the problem

Kiwiply's marketing site is a finished render of the boards: bright, mascot-led, mobile-safe, with
a real pricing page, a real contact queue and a double-opt-in newsletter. Underneath, four pages
still render **fabricated social proof** (testimonials, "1M+ jobs aggregated", "248 organizations"),
the footer promises Blog · Guides · Help · Status · Press that do not exist, the only "Help Center" is
a `mailto:`, no page says the three things competitors are being hammered on (you submit; cancel
keeps what you paid; your data is never sold or trained on), and nothing records where a signup came
from. There is no referral, creator or campus programme, and no content a search engine would rank
Kiwiply for.

The benchmark (`AUDIT-mkt.md` §4) says the category is won on three fronts the product already
earns but the site does not yet *say* or *show*:

1. **Honesty as positioning.** Billing is the #1 one-star theme at Teal, Simplify, JobRight and
   Jobscan; invented metrics are everywhere; auto-apply bots sit at 2★. Our locked rules (public
   prices, no weekly, no trial, no refunds-cancel-anytime, nothing unlimited, you submit, scoped
   permissions) are a campaign waiting to be printed.
2. **Content only we can write truthfully.** How each ATS application form really works (we capture
   the DOM), what questions applications actually ask (learned-answer labels), which ATS a company
   uses (job sources), measured fill accuracy per ATS. Huntr/Jobscan/Teal rank on generic resume
   content; none of them can write ours.
3. **Programmes that fit the floor.** Affiliates at 30 % of the first three months (Huntr/Rezi's
   bar), a referral that pays only for retained users in Pro-time rather than cash, campus
   ambassadors on Pro-while-active, and a student discount only if the margin guard says yes.

So the plan has three threads that land in order: **make the site true (M0, M2, M1)** → **make it
findable and helpful (M3, M4, M5)** → **make it grow and measure it (M8, M6, M7, M9, M10, M11)**.
Nothing here re-litigates a locked decision: no auto-submit, no scraping, no server AI on Free
except parsing, no trial, no annual, no weekly, Stripe is the truth, one design system, Gmail-IMAP only.

## 2. Epics (what, why, order, risk)

| Epic | Priority | What | Why it matters for the audience | Main risk |
|---|---|---|---|---|
| **M0 Honest claims & QA gate** | P0 | Register as data + `<Claim>`, placeholder purge, footer truth, claims-lint in CI, one support matrix, public fill-accuracy table, trust statements, testimonial consent | This audience screenshots and fact-checks; one caught lie is the whole brand | Register discipline must survive future "exact-board" requests — the lint is the backstop |
| **M1 Positioning, landing & conversion** | P0 | One landing, real differentiators + "why you press submit", real footage, live thresholded numbers, conversion events, phone path, `/try`, `/extension`, audience pages | First screen decides install; most arrive on a phone from a social link | `/` vs `/v3` is the user's call (M1.2) |
| **M2 Pricing & honest money** | P0 | The money block, full comparison table, Offer JSON-LD, org calculator, 402 arrival | Billing honesty is the biggest open goal in the market (G29) | Copy must match the ToS (T-area wins conflicts) |
| **M3 SEO foundation** | P0 | Route registry, JSON-LD, canonical/OG, chunked sitemaps + IndexNow, llms.txt, Lighthouse + link checks, 404/redirects, thresholds | Without this the content engine leaks value | Keep programmatic pages noindex until thresholds (M3.8) |
| **M4 Help center** | P0 | `/help` shell + search + FAQ, 20 articles with real screenshots, contextual links, feedback, permissions explainer, per-ATS "what we fill" | "Browse our Help Center" is a mailto today; G30/G33 | Ownership split with `sup` (public site = mkt; in-app/AI/safety = sup) |
| **M5 Content engine** | P1 | Pipeline, ATS guides, free ATS check, question guides, keyword finder, companies/jobs pages, examples hub (R7), comparisons, blog | The unique-content moat; Huntr's 3,500 pages is the bar, ours are truer | Needs U4.1 for programmatic pages; authoring effort |
| **M6 Referral & sharing** | P1 | Codes, `/r/`, attribution, qualifier + Pro-time grants, fraud, admin, placements, social share cards | Share-after-a-win growth that this audience actually does | Reward amount = open question (floor) |
| **M7 Campus, creator, partners** | P1 | Affiliates (30 %/3 mo, disclosure, recorded payouts), ambassadors, `/campus`, `/press`, student discount (decision) | Creators and campuses are where Gen Z hears about tools | Student discount vs 80 % floor (15 % passes, 20 % does not) |
| **M8 Growth analytics** | P0 | First-touch attribution, funnel rollups, admin Growth page, cookieless counts + Consent Mode v2, experiments, install funnel | We cannot tune the phone funnel blind; A11.6 waits on this | No second event pipeline — U18 owns product events |
| **M9 Lifecycle email** | P1 | Welcome series, `/changelog`, monthly update, dormant nudges, newsletter on content | Retention from day 0; honest "build in public" | Brevo free cap (A7 watch) |
| **M10 Store & distribution** | P1 | Listing from the register, screenshot pipeline, AMO/Edge presence, review prompt, launch kit | 4.8–4.9★ listings are the entry ticket (G10, G11) | AMO needs the Firefox smoke test first |
| **M11 Site quality** | P1 | Playwright smoke 390/768/1440, axe + accessibility page, image pipeline, cache headers, i18n-ready strings | Speed and accessibility are the first impression on a phone | Playwright dep shared with U19.3 |

## 3. Recommended build order — first 10

The skeleton proves: **a visitor lands on a page with only true claims → sees the money rules →
finds help → tries the form → installs → we know where they came from.**

| # | Story | Why first |
|---|---|---|
| 1 | **M0.1** Register as data + `<Claim>` | Everything else renders through it; one session |
| 2 | **M0.2 → M0.3** Purge fabricated proof; fix footer/contact destinations | The site must be true before it is promoted; small |
| 3 | **M0.4** claims-lint in CI (`CLAIMS_STRICT` on deploy) | Makes 1–2 permanent |
| 4 | **M2.2 → M2.3** Money block + full comparison table | The cheapest differentiator in the market (G29) |
| 5 | **M3.1 → M3.3 → M3.7** Route registry + JSON-LD, canonical/OG, 404/redirects | Foundation for help and content; unblocks M1.2 |
| 6 | **M5.1 → M4.1** Content pipeline, then `/help` shell + FAQ | Kills the mailto; the FAQ leaves `/v3` |
| 7 | **M8.1** First-touch attribution (cookie + `user_acquisition`) | Every later channel is measured from day one; pure plumbing |
| 8 | **M1.3 → M1.9** Hero on the real differentiators + `/why-you-submit`; `/extension` with permissions | The trust story said out loud (G30) |
| 9 | **M4.2 → M4.5 → M10.3** Twenty articles, permissions explainer, the screenshot pipeline that feeds them | Real pictures everywhere (store, help, landing) |
| 10 | **M1.8 + M1.6** `/try` practice form + conversion events | First value in 30 s (G9), measured |

Then in parallel lanes (strict file ownership, one Sonnet agent each):
- **Lane A (content):** M5.2 ATS guides (Workday first) → M5.4 question guides → M5.8 comparisons → M5.9 blog.
- **Lane B (API growth):** M5.3 free ATS check → M6.1–M6.3 referral engine → M7.2/M7.6 affiliates → M8.2/M8.3 funnel + admin page.
- **Lane C (site platform):** M3.4 sitemaps/IndexNow → M3.6 Lighthouse/links → M11.1/M11.2 smoke + axe → M11.3 images → M8.4 cookieless counts.
- **Lane D (distribution):** M10.2 listing generation → M10.4 AMO/Edge → M10.5 review prompt → M9.1 welcome series → M9.3 changelog.
- **After U4.1:** M5.6 companies/jobs pages (gated by `seo.indexProgrammatic`).
- **After the user's decisions:** M1.2 (`/` vs `/v3`), M7.1 (student discount), M6.2 reward amount.

Launch-critical (P0) before promotion of `version2`: M0.1–M0.5, M0.7, M1.2, M1.3, M1.6, M1.9, M2.2–M2.4,
M3.1–M3.3, M3.7, M4.1, M4.2, M4.5, M8.1, M8.4.

## 4. Experience principles for Gen Z / Gen Alpha / millennials (marketing & growth)

**Say the true thing, large.** This audience arrives from a TikTok or a group chat, on a phone,
already suspicious: they have seen "apply to 1,000 jobs" bots fail their friends and "3X more
interviews" on every landing page. So the hero says what only Kiwiply does in words a 19-year-old
would repeat ("it knew I got rejected before I opened the email"; "you press submit, always"), the
money rules are the large print, and every number is live or absent. **Show, don't claim:** real
drawer footage, a practice form that fills in 30 seconds, a measured accuracy table with a date.
**Phone first, laptop honest:** the site never pretends autofill works on the phone; it sends the
laptop link and keeps the phone user moving (matches, save, track). **Help before the help
request:** two-tap answers, real screenshots, contextual links from the exact screen. **Growth
through wins, never nags:** share cards designed for the formats they post, with privacy on by
default; a referral offered after a good fill, once; one monthly email; no pop-ups, no exit-intent,
no weekly plans, no trial countdowns. For millennial buyers (career-centre leads, consultancy
owners) the same honesty reads as compliance: consent-scoped visibility, prices above individual
on purpose, a calculator instead of "contact sales for pricing".

## 5. How we beat the competition (marketing moves)

1. **Honesty as the campaign (M0, M2, M1.3).** Print the rules competitors get one-starred for
   breaking: public prices, no weekly/trial/refund tricks, cancel keeps the period, you submit, scoped
   permissions, data never sold/trained/shown to employers, AI never invents. Nobody in the matrix
   says all of this; most say the opposite in their reviews.
2. **Content nobody else can write (M5.2, M5.4, M5.6, M0.6).** Per-ATS application guides from
   captured DOM with engine-generated field blocks; application-question guides from aggregated
   labels; company pages that say which ATS they use; a measured, dated fill-accuracy table. Huntr's
   3,500 generic examples cannot answer "what does Workday ask on step 3".
3. **A free tool that is actually free (M5.3).** Teal's and Jobscan's hooks need an account or a
   trial; ours runs 15 deterministic checks with no sign-in, keeps nothing, and says what a score means.
4. **Programmes that pay for retention, not signups (M6, M7).** Pro-time rewards after 7 active
   days, affiliates at the market's 30 % with disclosure rules, ambassadors on Pro-while-active, a
   student price only if the guard passes — all bounded, all auditable, none a lifetime deal.
5. **Live numbers or none (M1.5).** `<LiveStat>` from `fill_event`/`application`/`job_posting`
   with floors replaces every "1M+" in the category with something a journalist can verify.
6. **Measured from the first visit (M8).** First-touch attribution server-side, cookieless route
   counts, Consent Mode v2 — privacy by construction that still answers "which TikTok sent them".

## 6. Gap list reconciliation (`COMPETITIVE-GAPS.md`, rows tagged `M`)

| Gap | Decision | Where |
|---|---|---|
| G2 fill-accuracy harness + public numbers | **Accepted (publishing side)** | M0.6, M4.6; E owns the harness |
| G9 try-it page | **Accepted** | M1.8 |
| G10 review prompt | **Accepted** | M10.5 |
| G27 "never help you cheat live" | **Accepted** | M0.7 (+ pricing row in M2.3) |
| G29 no-dark-patterns billing page | **Accepted** | M2.2; in-app two-tap cancel stays with B/U15.2 |
| G30 permissions explainer + manifest drift check | **Accepted** | M4.5, M1.9 |
| G34 student/campus channel | **Accepted as a decision** — discount via the catalog only if the guard passes (15 % passes, 20 % needs a smaller student AI budget); ambassadors and `/campus` regardless | M7.1 (blocked on Q1), M7.3, M7.4 |
| G35 social share cards | **Accepted** | M6.5 |
| G36 register as CI gate | **Accepted** | M0.1, M0.4 |
| G44 honest `/organizations` bench-sales contrast | **Not duplicated** — covered by O14.2; mkt supplies the register ids (`org-placement`, `org-sso-2fa` banned) through M0.1 | — |
| G33 `/help` with ATS guides (tagged S) | **Taken for the public site** — the indexable shell, search, FAQ, per-ATS pages; `sup` authors in-app support, AI support and the Safety section in the same directory | M4.1–M4.6 |
| G11 Firefox/Safari presence (tagged E) | **Partly taken** — store links/support matrix on the site; the AMO submission and Safari go/no-go stay with E | M10.4, M0.5 |
| G14 share-target (N/U) · G32 status page (P) · G15 safety centre (S) | **Not taken** — mkt only links to them from the footer/help once they exist | M0.3 |

## 7. Dependencies on other areas

- **U (user):** U18.1/U18.3 event pipeline and rollups (M1.6, M6.2, M8.2 degrade gracefully until
  then); U4.1 posting store (M5.6); U16.3/U16.4 recap and referral surfaces (M6.4, M6.5); U15.1–U15.3
  billing flows (M2.2 lines flip to `ships`); U19.3 Playwright setup (M11.1 brings a minimal config if
  it lands first); U20.1 connect states (M1.9); U14.5 policy edits (referrals, attribution, counts).
- **A (admin):** A5 runtime flags (`referrals.enabled`, `seo.indexProgrammatic`, kill switches),
  A3.1 DB catalog (M2.6, M7.1), A8 inquiry categories (M4.2 coverage), A11.1/A11.6 Growth tiles,
  A12 audit for admin actions, A16 margin lines (referral/partner cost).
- **O (org):** O14 marketing claims on `/organizations`; O6 consent preview linked from `/campus`.
- **R (resume):** R1.4 card review receives the free-check hand-off (M5.3); R7 example data (M5.7).
- **E (ext):** DOM-fixture harness output (M0.6), field export (M5.2, M4.6), `/try` fill + redirect
  (M1.8), drawer help links (M4.3), review prompt (M10.5), AMO smoke test (M10.4).
- **S (sup):** shares `web/content/help/**`; owns Safety, in-app panel, AI support.
- **T (trust):** policy wording wins on conflicts (money block, trust statements, permissions page,
  student 16+ rule, affiliate 18+ terms).
- **P (plat):** shared edge Caddy cache rules (M11.4), status page link, IndexNow deploy step.
- **B (pay):** in-app cancel and renewal reminders that flip M2.2 lines; student coupon mechanics.

## 8. Status honesty

`done` (5): pricing page (15.5/15.6), contact → inquiries (15.6), newsletter double opt-in,
robots/sitemap/OG baseline, store-listing copy (15.3). `partial` (11): landing/about/organizations
built on placeholder copy, `/` vs `/v3` undecided, footer/contact destinations, support matrix as
data, comparison table partly in `catalog.ts`, canonical/OG single image, hand-maintained sitemap,
newsletter capture only in the footer, AMO/Edge listings pending, board-extracted images. Each
partial story's AC says exactly what remains.

## 9. Top risks

1. **Honesty regressions under "exact-board" pressure.** Mitigation: the lint fails the deploy with
   `CLAIMS_STRICT`; placeholder arrays must be empty or consent-backed.
2. **Thin programmatic pages indexed early.** Mitigation: thresholds + the `seo.indexProgrammatic`
   flag default off + the weekly coverage runbook.
3. **Free ATS check abuse or cost.** Mitigation: no AI, 5/IP/day, 5 MB, 10 s timeout, kill switch,
   nothing persisted (asserted in IT).
4. **Referral/affiliate cost vs the floor.** Mitigation: Pro-time not cash, caps, qualification after
   7 active days, admin cost lines, `commission_bps` adjustable without code.
5. **Authoring effort** (20 help articles, 5 guides, 30 question pages, 5 comparisons). Mitigation:
   generated skeletons (field blocks, labels, register facts) + one human pass each.
6. **Two pipelines drift** (GA4 vs first-party). Mitigation: one adapter in `analytics.ts`, Consent
   Mode v2, no PII in either.

## 10. Open questions for the user

1. **Student discount (G34):** a catalog-held verified-student price for Pro — 15 % ($16.99, passes
   the 80 % floor) or 20 % ($15.99) with a student AI budget of $2.50 — or stay at list price with
   ambassadors and `/campus` only?
2. **Referral reward:** confirm **one month of Pro for both sides after the invitee's 7th active day**
   (worst case ≈ $26.60 when the referrer pays; cap 12/year), or the cheaper variant (+$3 AI budget
   for paying referrers)?
3. **Landing page:** keep `/` (carousel) or `/v3` (board) as the one landing? The other 301s.
4. **Affiliate payouts:** manual quarterly PayPal/bank transfers recorded in the ledger (no payout
   rail) — acceptable until volume justifies Stripe Connect?
5. **Public fill-accuracy numbers (G2 / §G.4):** publish per-ATS measured accuracy with date and
   fixture count, including when a number is bad?
6. **Comparison pages:** OK to publish "Kiwiply vs Simplify/Teal/Huntr/Jobscan/JobRight" pages that
   quote their published prices and policies with source URLs and a checked date?

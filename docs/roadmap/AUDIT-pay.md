# AUDIT — area `pay` (payments, plans & billing engine)

Written 2026-10-11 against `version2` (`f679549`). Method: read every file that touches money —
`api/.../service/billing/*`, `BillingService`, `EntitlementService`, `AiBudgetService`, `AccountDeletionService`,
`BillingResource`, `BillingWebhookResource`, `AdminCustomerResource`, the Liquibase changelog, the web
`lib/billing.ts`, `lib/catalog.ts`, `lib/prices.ts`, `components/billing/*`, `components/pricing/*`,
`app/api/billing/*`, the extension's `src/lib/tracking.js` + options/panel plan reads — plus `ROADMAP.md`
Phase 12/15/18 and the "Cost controls" block, `PROGRESS.md` Phase 12/15 and the two sibling designs
(`docs/design/org/billing.md`, `docs/design/admin/catalog-margin-entitlements.md`). State legend:
**real** = data + API + tests · **partial** = exists but incomplete or config-only · **missing**.

Companion: `PLAN-pay.md`, `areas/pay.json`, `docs/design/pay/*.md`.

## 0. What is real underneath (Phase 12 is complete and well built)

| Capability | State | Evidence | Notes |
|---|---|---|---|
| Subscription mirror (one row per user), Stripe event log (PK = event id) | **real** | `api/src/main/resources/config/liquibase/changelog/20260921000000_subscription.xml`, `domain/Subscription.java`, `domain/StripeEvent.java` | No period *start*, no amount, no invoice rows |
| Webhook as the only writer; idempotency, ordering, retry-on-failed, cross-app guard, foreign-subscription guard, out-of-order `payment_failed` still emails | **real** | `service/billing/BillingWebhookService.java` (440 lines), `BillingWebhookIT` (16 tests) | Best-tested code in the API |
| `EntitlementService.isPro/plan/requirePro` as a pure status × period function; `past_due`/`canceled` entitled to period end | **real** | `service/EntitlementService.java`, `EntitlementServiceTest`, `BillingResourceIT` | Plan-name based; Phase 18 (grants/features) not started |
| Checkout (hosted, `client_reference_id`, promo codes allowed, `managed_payments`/`automatic_tax` handling), portal, `/api/billing/me`; double-checkout guard via live Stripe lookup; customer id survives a failed session | **real** | `service/BillingService.java`, `service/billing/StripeGatewayImpl.java`, `web/rest/BillingResource.java` | Only `monthly`/`3mo`; price ids from env (`StripeProperties.priceMonthly/price3mo`) |
| `StripeGateway` seam — the only class importing `com.stripe.*` | **real** | `service/billing/StripeGateway.java`, `StripeGatewayImpl.java`, `StripeGatewaySignatureTest`, `StripeAutomaticTaxTest`, `StripePropertiesTest` | Needs ~10 more methods for switch/cancel/invoices/reconcile |
| Billing disabled when the key is blank (503 `BILLING_DISABLED`); loud ERROR when enabled without a webhook secret | **real** | `StripeProperties.isEnabled`, `StripeGatewayImpl` ctor | Not a boot failure in prod — a checklist item today |
| Pro gates → 402 `PRO_REQUIRED` / `RESUME_LIMIT` at 10 service sites | **real** | `AiDraftService`, `ProfileService` (resume cap), `FieldCacheSyncService`, `InboxService`, `JobMatchService`, `JobFitService`, `ResumeMatchService`, `ResumeTailorService`, `AtsScoreService`, `AiResource` | Plan-based; no `feature` in the error body |
| AI budget per **billing period** (15.5), % not dollars, admin override by calendar month | **real/partial** | `service/AiBudgetService.java` (lines 118–136), `ai/AiPolicy.java`, `application-prod.yml:196` | Period *start* is guessed ("Stripe's periods are whole calendar months" fallback) — wrong for mid-month renewals; fixed by the invoice mirror |
| Plan on `GET /api/profile/version`; extension stores it on every check; 402 surfaced with `.status/.code` | **real** | `job-autofill/src/lib/tracking.js:26,350–393`, `entrypoints/options/OptionsApp.tsx`, `entrypoints/panel/home-actions.ts` | `features[]` not yet |
| Account deletion cancels the subscription immediately and forgets the user's events | **real** | `service/AccountDeletionService.java:133–139` | Financial records are deleted, not pseudonymised (B6.4) |
| Payment-failed email (one, Brevo) with portal link | **partial** | `BillingWebhookService.sendPaymentFailedEmail` | No cadence, no in-app banner, no lapse email |
| Web: `/pricing` (full catalog, renewal + no-refund note), `/billing/success` poller, Settings billing card (renews/cancels-on/past_due copy), upgrade button, portal button, BFF routes | **real** | `web/src/components/pricing/PricingSections.tsx:156–160`, `components/billing/{BillingCard,UpgradeButton,ManageBillingButton,SuccessPoller}.tsx`, `app/api/billing/{checkout,me,portal}/route.ts` | Prices hard-coded in `lib/prices.ts`; catalog in `lib/catalog.ts` (Autopilot/org/services sold via "Contact us") |
| Admin: customers list + billing timeline + notes, revenue card (MRR from config amounts) | **real** | `web/rest/AdminCustomerResource.java`, `service/CustomerAdminService.java`, `components/admin/CustomerBilling.tsx`, `AdminAnalyticsService` (12.5) | Refunds/disputes "happen in Stripe" by design (A2.3) |
| ToS Billing section + privacy names Stripe (12.6) | **real** | `web/src/app/(marketing)/terms`, PROGRESS 12.6 | Lawyer review pending (15.2); no EU withdrawal wording; no consent records |
| Stripe sandbox end-to-end run (12.7) — eight bugs found and fixed | **real** | PROGRESS.md 12.7 log | Failed renewal + lapse **never exercised** (needs a test clock, carried to 15.4) |

**Not present anywhere:** catalog tables / grants / feature keys (Phase 18) · Autopilot checkout · plan
switching · in-app cancel (portal only) · reactivate · renewal reminders · dunning cadence · lapse experience
· invoice/receipt list · consent records · tax mode decision for the live account · margin calculator ·
promo-code governance · student/regional prices · referral grants · top-ups · reconciler/replay tooling ·
test-clock harness in CI · billing events in product analytics · org/service billing scopes.

## 1. Flow-by-flow

| Flow | State | Real today | Missing | Evidence | → stories |
|---|---|---|---|---|---|
| Discover prices (`/pricing`) | **real** | all offers, honest renewal note, compare table | prices not from the catalog; no student/regional strip; no per-country currency; "Contact us" for Autopilot | `PricingSections.tsx`, `lib/catalog.ts` | B1.5, B7.3, B7.2 |
| Hit a gate → upgrade | **partial** | 402 codes; `UpgradeButton` redirects to `/pricing` (leaves the page) | server-chosen `upgrade{product}` in the 402; in-app sheet (U15.1); `returnTo` | `BillingService.startCheckout`, `UpgradeButton.tsx` | B3.3, B3.1 |
| Checkout | **real** | hosted Stripe, promo field on, `client_reference_id`, tax flags | catalog price ids; Autopilot; consent collection + records; EU withdrawal checkbox; Link/Apple/Google Pay confirmed on the live account; `cancel_url` back to origin | `StripeGatewayImpl.createCheckoutSession` | B3.1, B3.2 |
| Become Pro | **real** | webhook binds + upserts; success poller | invoice mirror (amount, period start, "Pro since"); our receipt email; grants | `BillingWebhookService` | B4.1, B3.5, B1.3 |
| Renewal | **partial** | Stripe renews silently | 7-day/3-day reminder; receipt; price-change notice | — | B4.2 |
| Payment fails | **partial** | `past_due` + one email; still Pro | day 3/7 emails; in-app banner; portal deep link to card update; push | `BillingWebhookService.onPaymentFailed` | B4.3 |
| Lapse | **partial** | clock-based downgrade; data kept | "what changed" screen; lapsed email; extension line; `lapsed_at` | `EntitlementService.isProFor` | B4.4 |
| Cancel | **partial** | portal (cancel at period end); card copy says "cancel any time from here" | **in-app one-tap cancel** with number + email; undo/resume; reason chips after; no retention gate (**G29**) | `BillingService.openPortal`, `BillingCard.tsx:77` | B5.1–B5.3 |
| Resubscribe / reactivate | **partial** | lapsed user can check out again (customer reused) | resume a cancel-pending subscription without checkout | `BillingService.startCheckout` | B4.5, B5.2 |
| Switch plan (Pro↔Autopilot, monthly↔3-mo) | **missing** | — | upgrade-now prorated, downgrade at period end, preview | — | B3.4 |
| Invoices & receipts | **missing** | portal has them | in-app list, PDF links, business details, our receipt | — | B6.2, B3.5 |
| Tax | **partial** | flags exist (`managedPayments` null, `automaticTax` false), tax code by hand | a recorded decision for the live account; `tax_code` from the catalog; startup assertion | `StripeProperties.java:61–82` | B6.1 |
| Margin guard | **missing** | three inconsistent spreadsheets in docs | one calculator with the real fee schedule (Billing 0.7 %, MoR 3.5 %, intl, disputes) | `docs/design/pay/fee-model-and-margin-guard.md` §1 | B2.1–B2.4 |
| Catalog & entitlements | **missing** | env-var prices, YAML budgets, plan names | Phase 18 engine | ROADMAP 1247–1276 | B1.1–B1.7 |
| Discounts | **missing** | `allow_promotion_codes=true` on every checkout with **no governance** — any coupon created in the Stripe dashboard applies to Pro | guarded promo codes; student plan; regional prices; referral grants; stacking rules (**G34**, **G37**) | `StripeGatewayImpl.java:98` | B7.1–B7.6 |
| AI budget economics | **partial** | per-period budget; meter | period start from the mirror; top-ups (P2); budget on `/me` | `AiBudgetService.java:132–136` | B8.2–B8.4 |
| Org & services billing | **missing** | designs only (O4.*, O9.*) | shared gateway methods, scope router, one-time checkout, refunds | `docs/design/org/billing.md` | B9.1–B9.4 |
| Ops | **partial** | event log with status/error; customer timeline | nightly reconciler; failed-event alert; replay; billing metrics; test-clock harness; analytics events | `StripeEvent`, `CustomerAdminService` | B10.1–B10.5 |
| Extension & mobile | **partial** | plan on version; 402 mapping; options badge; "Upgrade on kiwiply.com" | `features[]`; feature-coded 402 → upgrade link with return; no in-extension purchase rule written down | `tracking.js`, `OptionsApp.tsx` | B3.6, B11.2, B11.3 |

## 2. Findings worth acting on

1. **The margin floor is not met at Launch-1 prices once Stripe's real fees are counted.** The ROADMAP's
   table uses 2.9 % + 30 ¢ only. Stripe Billing adds 0.7 % on recurring volume; with it Pro monthly is
   **79.9 %** and Pro quarterly **79.8 %** (fee doc §3.1). **If Managed Payments is on** (the recorded
   user decision of 2026-09-21), every plan lands at **75–77 %**. Nobody has recorded which state the
   live account (DEPLOY.md §11.4) is in. → open question 1; B0.6 asserts the state at boot.
2. **`allow_promotion_codes=true` with no promo governance** means a coupon created by hand in Stripe
   would silently sell Pro below the floor. No coupon on Pro can pass at $19.99 (fee doc §3.5). → B7.1/B7.6
   (per-price `accepts_promos`, default false).
3. **The AI budget period start is guessed.** `AiBudgetService` falls back to a calendar month because the
   mirror has no `current_period_start`; a user renewing on the 20th gets a budget window that is wrong by
   up to three weeks. → B4.1 (invoice mirror) + B8.2.
4. **Cancel is portal-only.** Honest, but one detour more than the benchmark's best, and the #1 complaint
   theme (Teal, Jobscan, Jobright: "charged after I cancelled"). → B5.1/B5.2 (G29).
5. **A failed renewal and a lapse have never run anywhere** (12.7 could not attach a test clock). → B0.5
   now, B10.4 forever (scenario harness in CI).
6. **No consent records.** California's 2025 ARL amendments require records of the renewal consent for
   3 years; EU withdrawal needs an explicit acknowledgement. The checkout collects nothing beyond Stripe's
   default. → B3.2, B6.3.
7. **Financial records are deleted on account deletion** (`stripeEventRepository.forget`), which conflicts
   with record-keeping duties; invoices do not exist on our side at all. → B6.4.
8. **The org AI Interview Practice price ($9.99) is at 79–81 % depending on invoice shape** — the org
   designer's "per-invoice allocation" rescue holds only under optimistic assumptions. → open question 3.
9. **Two Stripe prices, two env vars, three display constants** (`prices.ts`, `catalog.ts`,
   `StripeProperties.amountMonthly/amount3mo`) must be changed together at Launch 2 — the catalog (B1.5/B1.6)
   collapses them into one row.

## B. Competitive benchmark (pricing, trials, refunds, cancellation) — checked 2026-10-11

Sources are the vendor page where it could be fetched, otherwise the best third-party page; prices change
often — verify before quoting publicly. Cross-reference: `docs/roadmap/COMPETITIVE-LANDSCAPE.md` (22
profiles) and the gap list `COMPETITIVE-GAPS.md` (rows G29, G34, G37 are tagged `B`).

| Product | Free | Paid plans (per period) | Trial | Refund policy | Cancellation | Source |
|---|---|---|---|---|---|---|
| **Teal (Teal+)** | yes (builder, tracker, limited AI) | **$13/week · $29/month · $79/3 months**; no annual | none documented | none published; one reviewer found a 14-day window on the site vs "2 days" from support | in-app; help article (2023) — reviews report charges after cancelling | [frontdeskreview](https://frontdeskreview.com/software/resume-builders/teal.md) (vendor page 403), [Trustpilot](https://ie.trustpilot.com/review/tealhq.com?page=2) |
| **Jobscan** | 5 scans/month | **$49.95/month · $89.95/3 months** (~$29.98/mo) | "3 Month Plan with Trial"; card pre-authorised | only within **2 days** of the billing period start, unused, **minus 3.5 %**, case by case; no pro-rata | account page; "cancellation does not issue refunds automatically"; reviews: charged after cancelling | [jobscan.co/cancellation-policy](https://www.jobscan.co/cancellation-policy) (vendor), [Trustpilot](https://es.trustpilot.com/review/jobscan.co) |
| **Rezi** | 1 resume, 1 AI interview, 3 PDFs | **$29/month**; quarterly offered (price not on the docs page); **Lifetime $149** | none | 30-day money-back claimed by reviewers, not on the vendor docs page | "cancel whenever"; access to period end | [rezi.ai docs](https://www.rezi.ai/rezi-docs/rezi-subscription-plans-explained) (vendor) |
| **Simplify+** | Copilot free | $19.99/week · $39.99/month · $89.99/3 months (reviews; `/pricing` 404) | none | **non-refundable once activated**; pro-rated refund only for an *unintended renewal* reported within **24 h**, minus processing fees; "dissatisfaction with AI content is not grounds" | self-serve, period end | [simplify.jobs/refund-policy](https://simplify.jobs/refund-policy) (vendor, updated 2026-08-26) |
| **Jobright (Turbo)** | yes | **$39.99/month** (up from $29.99) · ~$17.99/week · ~$89.99/quarter; **no public pricing page** | none | none published | monthly, "no contract"; billing/cancel complaints "in 72 % of one-star reviews" (single source) | [resumehog](https://resumehog.com/blog/posts/jobright-ai-review-2026-is-this-job-search-copilot-worth-it.html), [careery](https://careery.pro/blog/ai-job-search/jobright-ai-review) |
| **Final Round AI** | yes (goals, materials) | "Pro $25+/mo" on the page (annual billing behind "save up to 40 %"); reviewers: $249.99/3 months, $500/year forced at checkout | **no free trial** (vendor page) | 3-day money-back; refunds denied for "substantial usage" | reviews: rebilled after cancellation request; disputes | [finalroundai.com/pricing](https://www.finalroundai.com/pricing) (vendor), [Trustpilot](https://nl-be.trustpilot.com/review/finalroundai.com) |
| **Huntr** | 100 jobs, base resumes, unlimited autofill | **$40/month · $90/3 months · $160/6 months** (unlimited AI credits) | **no free trial** (vendor page) | not stated | self-serve, period end | [huntr.co/pricing](https://huntr.co/pricing) (vendor) |
| **Careerflow** | 1 resume, ~10 jobs | Premium $8.99/wk · $23.99/mo · $54.99/qtr · $172.99/yr; Plus $19.99/wk · $44.99/mo · $119.99/qtr · $299.99/yr | none | refund request within **7 days of the original purchase** (not the renewal); weekly non-refundable; forgotten-cancel charges non-refundable | Stripe portal; cancel ≥ 24 h before renewal | [help.careerflow.ai](https://help.careerflow.ai/en/articles/10581224-refund-and-cancelation-policy) (vendor) |
| **Kickresume** | 4 templates, no AI | $24/mo · $18/mo quarterly ($54) · $8/mo yearly ($96); **free Premium for students** via schools | — | 14-day guarantee | self-serve | [kickresume.com/pricing](https://www.kickresume.com/en/pricing/) (vendor) |
| **LazyApply** | none | $99 / $149 / $999 **per year**, annual only; lifetime deals on StackSocial | none | "within 30 days / before 100 applications"; ~25 % of reviews cite refund failures | — | [saasworthy](https://www.saasworthy.com/product/lazyapply/pricing), [remotejobassistant](https://remotejobassistant.com/blog/lazyapply-review) |
| **Resume.io** | TXT only | **$2.95 7-day trial → $29.95 / 4 weeks** | trial trap | "thousands of complaints about unexpected charges" | difficult (reviews) | `COMPETITIVE-LANDSCAPE.md` §resume builders |
| **Kiwiply (locked)** | real Free (autofill, tracker, parsing, 3 resumes) | **Pro $19.99/mo · $49.99/3 mo** (→ $24.99/$54.99 at Launch 2); **Autopilot $39.99 · $99.99/3 mo**; no weekly, no annual | **none** | **"no refunds, cancel anytime"** — keep the paid period; statutory rights override | portal today → **in-app one tap** (B5.1) | `CLAUDE.md`, `ROADMAP.md` 1124–1132 |

### Practices and complaints (what the market taught us)

- **Weekly plans are the revenue trick and the complaint engine.** Teal $13/wk (= $676/yr if forgotten),
  Simplify $19.99/wk, Careerflow $8.99–$19.99/wk, Jobright $17.99/wk. Kiwiply has none (locked) — say so
  on `/pricing` in one screenshot-able block (G29).
- **Refund windows measured in hours or days with fees** (Jobscan 2 days −3.5 %, Simplify 24 h for
  mistaken renewals −fees, Careerflow 7 days from first purchase only, Final Round 3 days). Kiwiply's "no
  refunds" is *clearer* than any of them — the differentiator is "you keep what you paid for" + reminders
  before renewal, not a refund window.
- **"Charged after I cancelled"** is the recurring one-star story (Teal, Jobscan, Jobright, Final Round).
  Root cause in every case: cancellation lives somewhere other than where the user is, and nothing
  confirms it in writing. Kiwiply: in-app cancel, cancellation number, confirmation email, undo (B5.1/B5.2).
- **Hidden prices** (Jobright `/pricing` 404, AIApply amounts at checkout only) — published prices and a
  public catalog endpoint (B1.5) are a trust asset.
- **Lifetime deals** (Rezi $149, Big Interview $299, LazyApply) — incompatible with "nothing is unlimited"
  and the floor; the quarterly plan is Kiwiply's long-search option (discount doc D9).
- **Students**: Kickresume gives Premium free through schools; Big Interview/Yoodli are free via campus
  licences; none of Teal/Jobscan/Huntr/Rezi publish a student price. A verified **$11.99 Pro Student** that
  passes the floor (discount doc §3) is open ground (G34).
- **Regional pricing**: nobody in the set does PPP; all charge USD. Stripe Adaptive Pricing (currency
  display, buyer pays the conversion) is a free first step; true regional prices need a smaller-budget
  product (discount doc §4).
- **Regulatory backdrop**: FTC click-to-cancel vacated 2025-07-08 (8th Cir.) but California's amended ARL
  (effective 2025-07-01) requires same-channel cancellation, express consent, 3-year consent records and
  renewal reminders; EU/UK 14-day withdrawal for digital services unless waived explicitly. Kiwiply's
  locked terms already comply in spirit; B3.2/B6.3 make them provable.

### Where Kiwiply beats / must match / should not copy

| | |
|---|---|
| **Beats** | a real Free tier (not a trial-shaped one); no weekly plan; published prices; "keep what you paid for"; in-app cancel with a number and an undo (B5); renewal reminders (B4.2); a margin-guarded catalog that makes *every* discount honest (B2/B7); a student plan that is a product, not a coupon (B7.2) |
| **Must match** | Autopilot purchasable by checkout, not "Contact us" (B3.1); plan switching in-app (B3.4); invoices/receipts in-app (B6.2); Apple/Google Pay/Link at checkout (B3.1); currency display for non-US buyers (B7.3); a 30-day-style money-back? **no** — matched instead by the reminder + undo, and by the statutory-refund path where the law requires it (B6.3) |
| **Should not copy** | weekly plans; $2.95 trial traps; refund windows with fees; retention gates in the cancel flow; lifetime/unlimited plans; hidden prices; "usage voids refund" clauses; annual-only billing (LazyApply, Final Round's forced yearly) |

## 3. Honest status counts for `areas/pay.json`

**done** (7): billing baseline, gates, deletion-cancels, copy/legal baseline, admin revenue card, per-period
AI budget, plan on the version endpoint. **partial** (4): dunning email, tax flags, AI period start, billing
notifications baseline. **not_started**: everything else (49). Counted after writing the plan; see
`PLAN-pay.md` §5.

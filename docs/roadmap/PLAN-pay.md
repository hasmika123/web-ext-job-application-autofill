# PLAN — area `pay` (payments, plans & billing engine)

Written 2026-10-11. Machine-readable twin: `docs/roadmap/areas/pay.json` (12 epics, 60 stories: 7 done ·
4 partial · 49 not started). Audit + competitive benchmark: `docs/roadmap/AUDIT-pay.md`. Deep designs:
`docs/design/pay/{fee-model-and-margin-guard, subscription-lifecycle, checkout-upgrade-cancel-flows,
discounts-regional-student, tax-invoicing-compliance, catalog-entitlements-engine}.md`. Every locked
pricing decision in `CLAUDE.md` is treated as a hard constraint; where the numbers disagree with the floor
the disagreement is an open question (§7), never a recommendation.

## 1. The shape of the problem

Phase 12 built the hardest part right: Stripe is the truth, the webhook is the only writer, the gates are
server-side, the copy is honest, and the 12.7 sandbox run found and fixed eight bugs. What exists is a
**single-product billing baseline** (Pro, two prices from env vars) with **no engine around it**: no
catalog, no feature keys, no grants, no invoices on our side, no reminders, no dunning beyond one email, no
in-app cancel, no plan switching, no discounts governance, no reconciler, and a margin "guard" that lives
in three documents with three different fee models. Meanwhile the catalog already *sells* Autopilot, org
seats, services, a Marketer seat and an Ops add-on — through "Contact us".

The audit's sharpest finding is about money, not code: **with Stripe's real fees (Billing 0.7 % on
recurring volume; Managed Payments 3.5 % if the live account has it on) the locked Launch-1 prices sit at
or under the 80 % floor** — 79.0 % for Pro monthly with the baseline schedule, ~76 % with Managed Payments.
The ROADMAP's margin table used 2.9 % + 30 ¢ only. Nothing in this plan changes a price; it builds the
calculator that reports the honest number and hands the decision to the user (§7, question 1).

The second finding is about trust: the entire competitive set is **losing one-star reviews to billing**
— weekly plans, trial traps, 24-hour refund windows with fees, cancellations that do not stick. Kiwiply's
locked terms (monthly/quarterly only, published, no trial, keep what you paid for) are already better than
every competitor's; the plan makes them *provable* (consent records, cancellation numbers, reminders before
every charge, in-app cancel with undo) and *visible* (one screenshot-able block, G29).

## 2. Epics (what, why, order, risk)

| Epic | Priority | What | Why it matters | Main risk |
|---|---|---|---|---|
| **B0 Launch-1 baseline & hardening** | P0 | Keep 12.x green; test-clock lapse run; boot-time assertion of webhook secret, tax mode, Managed Payments, price ids | The one path never exercised is "a renewal fails"; the live account's fee state is unknown | Needs a human with Stripe access (B0.5) |
| **B1 Catalog & entitlements (Phase 18)** | P0 | Tables + seed reusing today's Stripe prices; `resolve()` on grants with a shadow period; webhook writes grants; features on `/version`; public catalog feeds `/pricing` | Autopilot, students, regions and orgs are impossible without it; Launch 2 becomes a row edit | Shadow mismatches must reach zero before the flip |
| **B2 Margin guard & unit economics** | P0 | One calculator with the real fee schedule; publish guard; cap-hit watch; realised margin from invoices | The floor is a locked rule with no enforcement; the numbers in the docs are optimistic | Will show Launch-1 prices under the floor — a decision, not a bug |
| **B3 Checkout, upgrade sheet, switching** | P0 | Catalog-driven checkout for any price; consent collection + EU checkbox; wallets; 402 → in-place sheet; Pro↔Autopilot switch with preview | Autopilot is "Contact us" today; upgrading leaves the page | Stripe Checkout custom fields cannot gate on country before the address step |
| **B4 Lifecycle: invoices, renewals, dunning, lapse** | P0 | Invoice mirror + period start; 7-day/3-day reminders; 3-step dunning with one-tap card update; "what changed" at lapse; resume | Surprise renewals are the #1 complaint; the AI budget window is currently guessed | Notification engine (U7.1) is a dependency |
| **B5 Cancel & win-back** | P0 | Two-tap in-app cancel with number + email + undo; reasons after; one consented win-back | The review-defining moment (G29) | None technical; discipline not to add a retention gate later |
| **B6 Tax, invoices, legal** | P1 | Tax mode as config + startup assertion; invoices in-app; EU withdrawal + statutory-refund path; pseudonymised financial records | Compliance is cheap now, expensive after a complaint | Lawyer availability (15.2) |
| **B7 Discounts, students, regional** | P1 | Discounts as products; Pro Student $11.99 with .edu verification; currency display at launch; regional Pro Lite later; referral grants; stacking rules | Students are the audience; coupons cannot pass the floor at Launch-1 prices | Verification abuse; regional prices need the realised report first |
| **B8 AI budget economics & top-ups** | P1 | Period start from invoices; pooled quarterly budget; usage on `/me`; guard-checked top-up gated on cap-hit data | "Nothing is unlimited" must also be "nothing is wrong by three weeks" | Top-up only exists if the data says so |
| **B9 Org & services hooks** | P1 | Scope router; one-time checkout/invoices/refunds in the one gateway; quantity ops; payout hook | O4/O9 stories become business logic | Must land before any org checkout exists |
| **B10 Ops, reconciliation, observability** | P0 | Nightly reconciler (alerts, never writes); replay tool; billing metrics from invoices; FakeStripeGateway scenario harness in CI; analytics events | A missed webhook must not last longer than a night; the lapse path becomes a permanent test | Harness effort (one session) |
| **B11 Extension & mobile surfaces** | P1 | Features not plan names; one web `/upgrade` route; no in-extension/in-app purchase; billing kinds in the notification engine | One place where money changes hands | Store-rule reconciliation sits with the mobile area |

## 3. Recommended build order — the first 10

The skeleton proves: **buy Autopilot by checkout → see the real margin → a renewal fails and the plan
lapses in CI → cancel in two taps with a number → the extension gates on features**.

| # | Story | Why first |
|---|---|---|
| 1 | **B0.5** Test-clock run (failed renewal → lapse) | The only unproven path before live keys; its event stream becomes the CI fixture |
| 2 | **B2.1** MarginCalculator + fee schedule | Produces the honest number the user must decide on; pure code, one session, no UI |
| 3 | **B0.6 + B6.1** Boot-time billing self-check + tax mode setting | Records what the live account actually does; blocks half-configured billing in prod |
| 4 | **B4.1** Webhook v2: invoice mirror + period start | Every later story (receipts, budgets, reminders, realised margin, grants) stands on it |
| 5 | **B1.1 → B1.2** Catalog schema/seed (reusing Stripe price ids) → `resolve()` in shadow | The engine; shadow mode makes it a no-risk deploy |
| 6 | **B1.3 + B1.4** Grants from the webhook; features on `/version` + `/me` v2 | Flip the entitlement truth to grants; the extension/web learn features |
| 7 | **B5.1 → B5.2** In-app cancel with number + undo | The G29 moment; independent of the catalog, can run in a parallel lane |
| 8 | **B3.1 → B3.3** Checkout v2 (any catalog price, consent) → 402 bodies + sheet contract (with U15.1) | Autopilot becomes buyable; upgrading stops leaving the page |
| 9 | **B4.2 → B4.3** Renewal reminders → dunning cadence (needs U7.1) | Zero surprise charges |
| 10 | **B10.4 + B10.1** Scenario harness in CI → nightly reconciler | Makes the lifecycle a permanent test and catches missed webhooks |

Then in parallel lanes (strict file ownership, one Sonnet agent each):
- **Lane A (engine):** B1.5 public catalog + `/pricing`, B1.6 re-home config, B1.7 override migration, B8.2 period window, B2.2 publish guard, B9.1 scope router, B9.2 gateway methods.
- **Lane B (money UX, web):** B3.4 switch sheet, B3.5 success + receipt, B4.4 lapse sheet, B5.3 reasons, B6.2 invoices, B8.4 meters (with U15.2).
- **Lane C (compliance & ops):** B3.2 consent records, B6.3 legal pack, B6.4 records on deletion, B10.2 replay, B10.3 metrics, B10.5 events, B11.3 notification kinds.
- **Lane D (growth, after Launch 1):** B7.1 promo governance, B7.2 Pro Student, B7.3 currency display, B7.5 referral grants, B7.6 stacking; B7.4 regional and B8.3 top-up wait for B2.4's realised report.

Launch-critical (before live keys): B0.5, B0.6, B6.1, B2.1 (the number), B5.1 (cancel in-app), B4.2
(reminders) — plus the user's decision on open question 1.

## 4. How we beat the competition (from the benchmark, `AUDIT-pay.md` §B)

1. **Billing honesty as a feature, not a footnote.** No weekly plan, no trial, published prices, "keep
   what you paid for", reminders before every charge, a cancellation number and an undo. Every competitor
   in the set is losing one-star reviews on exactly this (Teal, Jobscan, Jobright, Simplify, Final Round,
   Resume.io). Make it screenshot-able on `/pricing` and in the cancel flow (G29; marketing area owns the
   campaign copy).
2. **A margin-guarded catalog that makes every discount honest.** Nobody else can offer a verified
   $11.99 student plan *and* say truthfully that it pays for itself; we can, because discounts are products
   with their own budgets and the guard refuses anything else. Lifetime deals (Rezi, LazyApply) are the
   competitors' answer to long searches; ours is the quarterly plan plus a reminder before it renews.
3. **Published prices and a public catalog endpoint** where Jobright's `/pricing` 404s and AIApply hides
   amounts until checkout.
4. **Reactivation that respects paid time** — resume a cancelled plan without a new checkout, switch
   Pro↔Autopilot without a second subscription, lapse without losing a byte.
5. **Compliance as proof, not promise** — consent records, EU withdrawal acknowledgement, statutory-refund
   path, pseudonymised financial records: the things a regulator or a card network asks for, already there.

**Gap rows tagged `B` and how they were handled:** G29 → B5.1/B5.2 (cancel), B4.2 (reminders), B3.5
(receipts), the "how billing works" block in B5.1's AC. G34 → B7.2 (student plan as a product) with the
decision in §7. G37 → B7.5 (referral as a grant with a budget cap; U16.4 keeps the UI). **Rejected:** none
outright; two were narrowed — G34's "free Pro months via school email" is rejected as *free* (a free month
costs $3 of AI with no revenue; the student *price* is the honest version), and G29's "renewal reminder 3
days before" is widened to 7 days for quarterly plans (3 days is right for monthly).

## 5. Status honesty

`done` (7): B0.1 baseline, B0.2 gates, B0.3 deletion cancels, B0.4 copy/legal, B0.7 revenue card, B8.1
per-period budget, B11.1 plan on version. `partial` (4): B4.3 dunning (one email), B6.1 tax flags (exist,
undecided), B8.2 period window (end known, start guessed), B11.3 billing notices (hard-coded matrix).
Everything else is `not_started`, including the whole of Phase 18 — the ROADMAP lists it as "after Launch
1" and nothing in the code anticipates it.

## 6. Experience principles for Gen Z / Alpha / millennials (money edition)

This audience has been burned by $2.95 trials that became $29.95, and they say so on TikTok. They do not
read ToS; they screenshot. So: **the price with the date on the button** ("$49.99 today, then $49.99 every
3 months from Jan 11"), never a tooltip. **Cancel in two taps** from the same screen you subscribed on, a
cancellation number they can paste into a complaint they will never need to write, and an **undo** until
the last day. **Reminders before every charge**, with the cancel link in the email. **Apple Pay / Google
Pay / Link** so a phone checkout is a thumbprint. **Lapsing never deletes anything** — say it on the screen
with the real counts. **No fake urgency, no countdowns, no "only 3 left", no pre-ticked boxes, no retention
offer blocking the exit.** A **student price that is real** (verified, honest about its smaller allowance)
rather than a coupon with an asterisk, and **prices in their currency** so a Berlin or Bangalore student is
not doing mental FX. Dark mode and 390 px for every sheet, because the plan panel is where they will look
when the card declines at 11 pm.

## 7. Open questions for the user

1. **The floor vs Stripe's real fees (decide before live keys).** With Stripe Billing's 0.7 % counted, Pro
   $19.99 is 79.0–79.9 % worst-case (depending on how international cards and disputes are blended); with
   **Managed Payments on** (your 2026-09-21 decision) every plan is ~76 %. Options: (a) keep prices, turn
   Managed Payments off, use Stripe Tax only where registered, and accept Pro monthly at ~79 % until
   Launch 2; (b) measure the floor *before* the 3.5 % MoR fee (treat it as tax/dispute handling, not a
   payment fee) — then Launch-1 prices pass as the ROADMAP recorded; (c) move to the Launch-2 prices
   ($24.99/$54.99) at Launch 1. B2.1 ships the calculator either way; B6.1 records the tax mode.
2. **Launch-2 price rise for existing subscribers:** grandfather at $19.99/$49.99 (the catalog's default,
   zero churn risk) or migrate everyone with a 30-day notice at their next renewal (B4.2 has the path)?
3. **Org AI Interview Practice at $9.99** sits at 79–81 % depending on invoice shape. Raise to **$10.99**,
   lower its budget to **$1.25**, or publish with an override? (Org designer and this plan both prefer not
   to override.)
4. **Pro Student** at **$11.99/mo · $29.99/3 mo** with a $1.50 budget and 10 resumes, verified by academic
   email (SheerID later) — approve the product and the v1 verification method? (G34; 12-month
   re-verification; graduates keep their price until they lapse.)
5. **Regional Pro Lite** needs ≥ $8.99 to clear the floor because of Stripe's 30 ¢ fixed fee; is a
   $8.99/$9.99/$12.99 three-band scheme after Launch 2 acceptable, or do we stay USD-only with currency
   display (B7.3) and revisit with the realised report?
6. **Pause** (B5.5): offer "pause for up to 2 months" (no billing, no access, card kept) or keep the model
   to cancel/resume only? The benchmark has no pause; it is a kindness, not a parity need.

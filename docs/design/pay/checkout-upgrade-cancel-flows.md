# Checkout, upgrade sheet, plan switch, cancel & lapse — the money UX (B3.*, B5.*, B11.*)

> Area `pay`. Status: design, 2026-10-11. Locked: Stripe Checkout + Portal; no trial; no annual; "no refunds,
> cancel anytime" stated plainly; Free/Pro/Autopilot and the prices in `CLAUDE.md`. Shared with the user
> area: U15.1 (upgrade sheet) and U15.2 (plan panel) own the web components; this doc owns the contract,
> the copy rules and the server endpoints they call. Benchmarks and complaints: `AUDIT-pay.md` §B.

## 1. Principles (what "honest money UX" means in pixels)

1. **The price you see is the price you pay, with the date.** Every CTA that charges shows one line:
   *"$49.99 today, then $49.99 every 3 months from Jan 11. Cancel any time, one tap. No refunds for
   partial periods."* Not in a tooltip, not in the ToS — on the button's own card.
2. **Cancel is as easy as subscribe** — one tap inside the app, no phone call, no survey before the
   confirmation, no "are you sure" chain, no retention offer in the path (one *after* the fact is allowed:
   "Changed your mind? Resume any time before {date}"). We give a **cancellation number** and an email
   that says exactly when the last day is and that nothing more will be charged.
3. **Never charge a surprise.** Reminder before every renewal (7 d quarterly, 3 d monthly); the renewal
   email arrives with a receipt and the same one-tap cancel.
4. **A lapse never loses data** — the first screen after lapsing says so with specifics.
5. **No fake urgency, no fake scarcity, no pre-ticked boxes, no "free" that isn't.** The checkbox for
   immediate access (EU withdrawal) is unticked and in plain words.
6. **Phone-first.** Everything below is designed at 390 px; checkout itself is Stripe's hosted page, which
   is already mobile-first and supports Link, Apple Pay and Google Pay — we just turn them on.

## 2. Checkout v2 (B3.1)

`POST /api/billing/checkout {product: "PRO"|"AUTOPILOT", interval: "MONTH"|"QUARTER", returnTo?: "/jobs?job=…"}`
(replaces `{plan: monthly|3mo}`; the old body keeps working one release for the extension).

Session parameters (through `StripeGateway.createCheckoutSession(CheckoutSpec)`):
- `mode=subscription`, `customer` (created once, as today), `client_reference_id=userId`, `metadata.app`.
- `line_items[0].price` = `product_price.stripe_price_id` from the catalog (B1.5); 404 `UNKNOWN_PRICE` for
  a draft/retired price — never the env var again after B1.6.
- `allow_promotion_codes=true` only when the catalog says the price accepts promos (B7.6) — at Launch-1
  Pro prices it is **false** because no promo passes the floor (`fee-model-and-margin-guard.md` §3.5).
- `consent_collection.terms_of_service=required` + `custom_text.terms_of_service_acceptance` =
  the renewal sentence (§1.1) with the link to `/terms#billing`; `custom_text.submit` = "Subscribe —
  renews until you cancel"; **`consent_collection.payment_method_reuse_agreement`** so the saved card
  consent is explicit. Stripe stores the acceptance on the session; B3.2 mirrors it.
- `payment_method_types` unset (Stripe chooses: card, Link, Apple Pay, Google Pay, and for EU buyers SEPA/
  iDEAL where Stripe deems them subscription-safe); `billing_address_collection=auto`; `tax_id_collection`
  only for ORG scope.
- `automatic_tax` / `managed_payments` exactly as today (`wantsAutomaticTax`), driven by B6.1's decision.
- `success_url=/billing/success?session_id={CHECKOUT_SESSION_ID}&returnTo=…`, `cancel_url` = the page the
  user came from (`returnTo`) rather than `/pricing` — backing out must land where they were.
- **EU/UK buyers:** `custom_fields[0]` = checkbox *"Start my subscription now. I understand I lose the
  14-day right to withdraw once access begins."* (unticked, required) — only shown when the customer's
  country (from the session's `customer_details` on a second pass, or our geo hint) is EU/UK. Where Stripe
  Checkout cannot gate on the country before address entry, the box shows for everyone with the EU wording
  prefixed "If you are in the EU/UK:"; the trust area's lawyer confirms the wording (relates T area, 15.2).

Server rules kept: already-subscribed → 409 (mirror *and* live check); billing disabled → 503; demo → 403.
New: `product=AUTOPILOT` while on Pro → **not** a checkout, redirect the client to `POST /switch` (B3.4):
the response is `{switch: true}` and the web opens the switch sheet instead.

## 3. Consent records (B3.2) — California ARL + EU + our own receipts

Table `billing_consent`: `id, user_id, stripe_session_id UNIQUE, product_code, price_id, amount_cents,
interval, terms_version (A9.6), consent_tos_at, consent_payment_reuse_at, withdrawal_waiver (bool),
ip_hash, user_agent_hash, locale, created_at`. Written from `checkout.session.completed`
(`consent.terms_of_service=accepted`, `consent.payment_method_reuse_agreement`, `custom_fields`). Kept
**3 years after the subscription ends** (California: records for at least three years or one year after
the contract ends, whichever is longer — <https://www.cooley.com/news/insight/2025/2025-06-04-california-automatic-renewal-law-amendments-take-effect-on-july-1-2025>,
fetched 2026-10-11), exported in the DSAR as "billing consents", deleted after retention by A9.5's job.
The acknowledgement email (B3.5 receipt) repeats the terms the user accepted — the "durable medium" copy.

## 4. The upgrade sheet contract (B3.3 ↔ U15.1)

Every 402 carries `{code, feature, limit?, count?, resetsAt?, upgrade: {product, interval, amountCents,
checkoutPath}}` — the server decides *which* product unlocks the feature (from `product_entitlement`), the
client only renders. Codes: `PRO_REQUIRED` (legacy, = `PLAN_REQUIRED feature=ai.server`),
`PLAN_REQUIRED`, `RESUME_LIMIT`, `ALERT_LIMIT`, `AI_BUDGET` (no upgrade object — "resets {date}"; Autopilot
users see no upsell at all), `AUTOPILOT_DAILY_CAP`, `AUTOPILOT_MONTHLY_CAP`.

```
┌──────────────────────────────┐  390 px — UpgradeSheet (bottom sheet, U0.2)
│  ━━                          │
│  Tailor this resume with     │
│  Kiwiply AI                  │
│  Part of Pro.                │
│  ✓ AI picks + tailors resumes│
│  ✓ Inbox updates your board  │
│  ✓ Daily matches             │
│                              │
│  ( Monthly $19.99 ) (•3 months $49.99  save 17%) │
│                              │
│  $49.99 today, then $49.99   │
│  every 3 months from Jan 11. │
│  Cancel any time, one tap.   │
│  No refunds for partial      │
│  periods.                    │
│ ┌──────────────────────────┐ │
│ │     Continue to payment  │ │  → POST /checkout {returnTo: here}
│ └──────────────────────────┘ │
│   Not now                    │
│  Student? Regional price?    │  → /pricing#discounts (B7.*, when live)
└──────────────────────────────┘
```
Events (U18.1 taxonomy, published by the sheet): `upgrade_sheet_shown {feature}`, `checkout_started
{product, interval, feature}`, `checkout_abandoned` (return via cancel_url), `subscription_started` (from the
webhook, server-side — the only trustworthy conversion event).

## 5. Success & receipt (B3.5)

`/billing/success` keeps the 1.5 s poll (≤ 20 s) on `/api/billing/me`; v2 shows **what to do next** based
on `returnTo` ("Back to the job" button) and the "Pro since" date; on timeout the existing "Payment
received, activating…" copy stays (never an error). Our receipt email (`RECEIPT` notice) goes out on
`invoice.paid`: amount, period, next renewal date + amount, the cancel sentence, the hosted invoice link,
support address. Stripe's own receipt emails stay **off** (two receipts confuse; ours carries the terms).

## 6. Plan switch sheet (B3.4)

```
┌──────────────────────────────┐
│  ━━   Switch to Autopilot    │
│  Today  you pay $23.33       │  ← prorated difference (from gateway.previewProration)
│  Then   $39.99/month from    │
│         Jan 11               │
│  Autopilot adds: bulk-prepared│
│  applications (300/mo), AI   │
│  interview practice, 50 res. │
│ ┌──────────────────────────┐ │
│ │  Switch now · $23.33     │ │  → POST /switch
│ └──────────────────────────┘ │
│  Not now                     │
└──────────────────────────────┘
Downgrade variant:   "Your plan switches to Pro on Jan 11. You keep Autopilot until then. Nothing is refunded."
Interval variant:    "From Jan 11 you'll pay $49.99 every 3 months instead of $19.99 monthly."
```
`POST /api/billing/switch/preview {product, interval}` → `{effective: now|periodEnd, chargedTodayCents,
nextAmountCents, nextAt}` (via Stripe's upcoming-invoice preview with the proposed item). The Stripe
Customer Portal keeps plan switching **off** (one place, ours, with our copy).

## 7. Cancel (B5.1–B5.3) — the flow we want quoted in reviews

```
Settings › Plan                                   Confirmation (same screen)
┌──────────────────────────────┐                 ┌──────────────────────────────┐
│ Pro · renews Jan 11 · $49.99 │                 │ ✓ Cancelled                  │
│ [ Manage card & invoices ]   │                 │ Pro stays on until Jan 11.   │
│ [ Switch plan ]              │                 │ Nothing more will be charged.│
│ [ Cancel plan ]  ──────────► │                 │ Cancellation no. KW-7F3A2    │
└──────────────────────────────┘                 │ We emailed this to you.      │
Cancel sheet                                     │ [ Resume plan ]  (until Jan 11)│
┌──────────────────────────────┐                 │                              │
│ ━━  Cancel Pro?              │                 │ Optional — why? (1 tap)      │
│ You keep Pro until Jan 11,   │                 │ (Got a job 🎉)(Too pricey)   │
│ then your plan becomes Free. │                 │ (Not using it)(Missing X)    │
│ Everything stays: resumes,   │                 │ (Other)                      │
│ board, answers. No refund    │                 └──────────────────────────────┘
│ for the rest of the period.  │
│ ┌──────────────────────────┐ │
│ │  Cancel plan             │ │  → POST /cancel  (one tap, no reason required)
│ └──────────────────────────┘ │
│  Keep Pro                    │
└──────────────────────────────┘
```
Rules: the sheet has **exactly one** confirmation; the reason chips are *after* the cancel and skippable;
"Got a job" shows a small congratulation and feeds the placement metric; no discount offer is shown in
this path (an offer, if the user ever approves one, is a B5.4 win-back email after lapse, not a gate).
`POST /api/billing/cancel` → `gateway.setCancelAtPeriodEnd(id, true)` → mirror flips on the webhook, but
the response already carries `{endsAt, cancellationNumber}` from Stripe's returned object; the
`CANCEL_CONFIRMED` email goes from the request path with the number (dedupe key stops the webhook sending
it again). The Stripe Portal keeps its own cancel (same effect) for people who prefer it.

## 8. Lapse — "What changed" (B4.4)

```
┌──────────────────────────────┐
│ Your Pro plan ended Jan 11   │
│ Everything you made is here: │
│ • 7 resumes (3 editable,     │
│   4 read-only until you      │
│   archive or upgrade)        │
│ • your board, notes, answers │
│ Paused: Kiwiply AI, inbox    │
│ tracking, daily matches.     │
│ [ Restart Pro · $19.99/mo ]  │
│ [ Stay on Free ]             │
└──────────────────────────────┘
```
Shown once (`lapse_notice_pending`), dismissible, never a modal over a task; the extension drawer shows a
single line with the same two actions (`job-autofill/entrypoints/panel`).

## 9. Past-due banner (B4.3)

Top of every app page while `status=past_due`: *"We couldn't take your payment. You're still Pro — retrying
on {nextAttemptAt}. [Update card]"* → `POST /portal {flow: payment_method_update}`. Extension options page:
same line. Day-7 variant adds the lapse date.

## 10. Where purchases can start (B11.2)

Web only. The extension and any mobile/PWA surface deep-link to `kiwiply.com/pricing` or straight to
`/api/billing/checkout` through the web (the extension opens `https://kiwiply.com/upgrade?feature=…` which
renders the sheet then checkout) — never an in-extension form, never an in-app purchase. If a native app
ever ships, this stays "reader app" style: no price shown that the store cannot see, account management on
the web. Store-rule reconciliation is the mobile area's (`relates N`).

## 11. Copy register (single source: `web/src/lib/billing-copy.ts`, reused by email templates A7.4)

| key | text |
|---|---|
| `renews` | Renews {interval} until you cancel. Cancel any time, one tap, in Settings › Plan. |
| `noRefund` | No refunds for partial periods — you keep {plan} to the end of the period you paid for. |
| `today` | {amount} today, then {amount} every {interval} from {date}. |
| `cancelled` | {plan} stays on until {date}. Nothing more will be charged. Cancellation no. {number}. |
| `lapsed` | Your {plan} plan ended {date}. Everything you made is still here. |
| `pastDue` | We couldn't take your payment. You're still {plan} — retrying on {date}. |

## 12. Tests

API: `BillingResourceIT` (checkout v2 bodies, 404 draft price, switch redirect, cancel → number + one email,
resume, lapse ack). Web (U19.3 harness): Playwright — 402 fixture → sheet → checkout stub → success poll;
cancel flow is one confirmation and reachable in ≤ 3 taps from any app page; axe on every sheet; 390 px
snapshots light/dark. Copy test: every CTA that starts a charge renders `today` + `renews` + `noRefund`
(a lint-style test over the component tree, so a future screen cannot forget).

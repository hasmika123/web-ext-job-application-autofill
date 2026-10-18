# 05 — Customer UX: pricing page, add-on picker, checkout, My plan (individuals); org plan, per-seat configurator, cost preview, invoices (enterprise)

> Status: design, 2026-10-15 (Fable). `@kiwiply/ui` only (`MoneyText`, `PriceDelta`, `FeatureChip`,
> `AllowanceMeter`, `StatePill` + `BILLING_STATE_MAP`, `Meter`, `Switch`, `Stepper`, `BottomSheet`,
> `Toast`, `EmptyState`, `AnimatedNumber`, `SaveStatusChip`, `Card`, `Button`, `Tabs`). Every number is a
> DTO field (`PlanQuoteDTO`, `PublicCatalogDTO`, `PlanDTO v3`, `LicenseQuoteDTO`); the web formats with
> `Intl.NumberFormat`, never computes. Copy register extends `web/src/lib/billing-copy.ts`
> (`checkout-upgrade-cancel-flows.md` §11). Gen-Z/Notion rules: autosave + ✓ + undo for **non-money**
> settings; **money changes go through quote → confirm, never autosave**; no pre-ticked paid items; the
> price with its date on every charging button; one confirmation, no retention gates.
> Existing pieces reused: `PricingSection`/`OfferCard`/`RenewalNote` (`web/src/components/pricing/
> PricingSections.tsx`), `UpgradeButton`, `BillingCard`, `SuccessPoller`, `AiUsageMeter`, `PlanCard`.
> The enterprise pages of `28-billing-pages-ux.md` stay; §5–§8 below add the plan layer to them.

## 1. Honesty rules (apply to every screen here)
1. Nothing paid is ever pre-selected; a preset chip **visibly** ticks items and shows the new total before
   anything else happens.
2. Every charging button carries `today` + `renews` + `noRefund` from the copy register
   ("$29.97 today, then $29.97 every month from Nov 15. Cancel any time, one tap. No refunds for partial periods.").
3. Removals say "works until {date} · no refund" inline, at the toggle.
4. Totals animate (`AnimatedNumber`) and are `aria-live`; the quote expiry is visible ("price valid 14:32").
5. Annual is on (S-01): the Yearly tab shows for every plan that lists YEAR (hidden only if the admin
   switch is off); the toggle default is Monthly; the annual card says "billed $215.89 once a year ·
   ≈ $17.99/mo · save $23.99" from DTO fields, and "changes apply at your next renewal" (S-04).
6. A sunset plan the user is on is explained, never hidden.

## 2. Pricing page `/pricing` (generated from `GET /api/catalog/public`)

**1440**
```
┌ Kiwiply                                                                          [Sign in] [Get the extension] ┐
│ Plans                                        ( Monthly ● )( 3 months )( Yearly · save 10 % )                     │
│ ┌────────── Free ──────────┐ ┌───────── Pro  Most popular ─────────┐ ┌────────── Autopilot ──────────┐          │
│ │ $0                       │ │ $19.99 /mo                           │ │ $39.99 /mo                     │          │
│ │ Everything you need to   │ │ $49.99 / 3 months on the 3-month tab │ │ $99.99 / 3 months              │          │
│ │ apply                    │ │ ✓ Kiwiply AI autofill                 │ │ ✓ Everything in Pro            │          │
│ │ ✓ Autofill on every ATS  │ │ ✓ AI tailors + scores resumes         │ │ ✓ Prepares 300 applications/mo │          │
│ │ ✓ Board, capture, profile│ │ ✓ Inbox updates your board            │ │   (you click Submit)           │          │
│ │ ✓ 3 resumes, AI-parsed   │ │ ✓ Daily matches · 25 resumes          │ │ ✓ 50 resumes                   │          │
│ │ [Start free]             │ │ Add-ons (optional)  ⓘ                 │ │ Add-ons (optional)             │          │
│ │                          │ │  ☐ Extra AI credits   $4.99 /mo  ×[1] │ │  ☐ Extra AI credits  $4.99     │          │
│ │                          │ │  ☐ Extra resumes +10  $1.99 /mo  ×[1] │ │  ☐ Extra resumes +10 $1.99     │          │
│ │                          │ │ Total $19.99 /mo                      │ │ Total $39.99 /mo               │          │
│ │                          │ │ [Go Pro — $19.99/mo]                  │ │ [Go Autopilot — $39.99/mo]     │          │
│ │                          │ │ Renews monthly until you cancel…      │ │ …                               │          │
│ └──────────────────────────┘ └──────────────────────────────────────┘ └────────────────────────────────┘          │
│ [Compare everything]   Students? Pricing for your country? (when those plans are published)                      │
│ Organizations → one line + [See organization pricing] (04-style org section: seat base + add-ons table, setup fee)│
│ Expert services (one-time) … unchanged ServicesSection                                                            │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```
- Cards = published `plan` rows with `public=true` for `audience=INDIVIDUAL`, ordered by `sort_order`; the
  add-on rows are the version's OPTIONAL components **with a published price for the selected interval**
  (others are omitted, not greyed). Ticking an add-on re-renders "Total" from `catalog.totals` returned by
  the public endpoint (the endpoint returns per-combination totals for ≤ 8 add-ons; beyond that the page
  calls `POST /api/billing/quotes` anonymously — see 09 §3.1 `anonymous=true`).
- The interval tabs come from the union of `intervals_json` across public plans; a plan missing an interval
  shows "not available yearly".
- Signed-in Pro: the Pro card says "You're on Pro — manage add-ons" → `/settings/plan`.
- Stripe off: buttons disabled "Payments open soon" (exists). Sunset plan: not rendered.

**390** — cards stacked, interval control as a segmented control under the title; add-on rows inside each
card; the CTA is sticky at the card bottom; "Compare" opens the existing `CompareDialog` as a `BottomSheet`.

## 3. Checkout with add-ons (new subscriber)
Tapping the CTA with add-ons ticked → `POST /api/billing/quotes {planKey, interval, addons[]}` →
**Review sheet** (`BottomSheet` on 390, dialog on 1440):
```
┌──────────────────────────────┐
│ ━━  Pro · monthly            │
│ Pro                 $19.99   │
│ Extra AI credits ×2  $9.98   │
│ ───────────────────────────  │
│ Total              $29.97/mo │
│ $29.97 today, then $29.97    │
│ every month from Nov 15.     │
│ Cancel any time, one tap.    │
│ No refunds for partial       │
│ periods. Taxes added by      │
│ Stripe where applicable.     │
│ price valid 14:32            │
│ [ Continue to payment ]      │  → POST /api/billing/quotes/{id}/checkout → Stripe Checkout (line items = quote)
│   Back                       │
└──────────────────────────────┘
```
Yearly variant adds "billed once a year · ≈ $26.97/mo · you save $35.97". The success page (`SuccessPoller`,
exists) polls `/api/billing/me` until `plan_version_id` is set; it lists the add-ons that are now active.
Errors: `409 QUOTE_STALE` → "Prices changed — here is the new total" (auto re-quote, button re-enabled);
`410 QUOTE_EXPIRED` → re-quote; `409 ALREADY_SUBSCRIBED` → "You already have a plan — change it in My plan";
`503 BILLING_DISABLED` → existing copy.

## 4. My plan `/settings/plan` (replaces the Billing card's plan part; `BillingCard` keeps card/portal)

**1440**
```
┌ My plan                                                                                                     ┐
│ ┌────────────── Pro · monthly ──────────────┐ ┌──────────── Usage this period ───────────┐ ┌──── Billing ────┐│
│ │ ACTIVE ● renews Nov 15 · $29.97/mo        │ │ AI budget      ▓▓▓▓▓▓▓░░░ 72 %  resets Nov 15│ │ Visa ···4242   ││
│ │ Pro v2 (you keep this version)            │ │ Resumes        21 of 25                   │ │ [Manage card]  ││
│ │ Included: AI autofill · Tailoring · Inbox …│ │ Tailorings     27 of 40 left              │ │ [Invoices]     ││
│ │ Add-ons                                   │ │ Matches        18 of 20 today             │ │                ││
│ │  Extra AI credits  ×[2]  $9.98/mo  [−][+] │ └───────────────────────────────────────────┘ │ Cancel plan    ││
│ │  Extra resumes +10 ×[0]  $1.99/mo  [+]    │ Impact preview (appears on any change)        └────────────────┘│
│ │ Interval  (Monthly ●)(3 months)(Yearly)   │ ┌─────────────────────────────────────────────┐                │
│ │ Plan      [Switch to Autopilot…]          │ │ Current   $29.97/mo                          │                │
│ │                                           │ │ Proposed  $24.98/mo   Δ −$4.99/mo            │                │
│ │                                           │ │ Extra AI credits ×2 → ×1: works until Nov 15 │                │
│ │                                           │ │ · no refund                                  │                │
│ │                                           │ │ Today: $0 · Next invoice Nov 15 ~$24.98      │                │
│ │                                           │ │ price valid 14:58     [Confirm change]       │                │
│ └───────────────────────────────────────────┘ └─────────────────────────────────────────────┘                │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```
- `[−]`/`[+]`/interval/plan controls do **not** change anything: they build a pending change set and call
  `POST /api/billing/quotes` (debounced 400 ms); the Impact preview renders the `PlanQuoteDTO`; `[Confirm
  change]` → `POST /api/billing/quotes/{id}/confirm` with `Idempotency-Key` → toast "Plan updated · Undo
  removal" (undo = cancel the pending removal; adds are not undoable — they were charged, the toast says
  so). Adds show "Today, prorated: up to $2.41" (22 §6 wording).
- Interval switch shows "From Nov 15 you'll pay $215.89 once a year instead of $19.99 monthly" (monthly →
  yearly at period end) or, on an annual plan, "Your plan switches to monthly on Oct 20, 2027 (end of your
  term). Nothing is refunded." (S-04).
- Plan switch opens the B3.4 switch sheet with the quote's numbers (upgrade now prorated / downgrade at
  period end); add-ons that the new plan includes are listed as "included from Nov 15 — the add-on line
  ends then".
- Cancel = the B5.1 flow unchanged (one tap, number, undo).
- Sunset plan banner: "Pro v1 is no longer offered. You keep it while subscribed. [See what Pro v3 offers]"
  → quote old vs new, confirm at period end.

**390** — one column; the Impact preview is a sticky bottom bar ("Proposed $24.98/mo · Δ −$4.99 · [Review]")
opening a `BottomSheet` with the full preview and the confirm button. Usage meters stack under the plan card.
Empty (Free user): plan card says Free, included list, "Upgrade" → `/pricing`; no add-on controls (02 §7.4).
Error: inline retry; quote errors as §3. Loading: `Skeleton` cards.

## 5. Enterprise — Org plan overview `/w/admin/subscription` (extends 28 §1)
Adds to the Subscription Overview a **Plan card**: plan name + version ("Org Standard v1"), interval
(Monthly or Yearly — `billing.intervals.org` includes YEAR), setup fee status, platform fee (if any), seat base
price, presets available, `[Change interval…]` and `[Compare with current version]` (when a newer version
exists: quote old vs new, opt-in). Next invoice tile shows, on annual terms, "Next renewal Oct 20, 2027 ·
$867.56 · prorated adds billed as they happen". Everything else as 28 §1 (tiles, pending changes with
undo, usage top 5, contract, PAST_DUE banner).

## 6. Enterprise — per-seat configurator (extends 28 §2–§3)
- **Single seat** (28 §3 Configure Consultant License) is unchanged in layout; the picker lists only the
  org plan version's `SEAT_OPTIONAL` components (others cannot appear), prices per the org's interval, with
  the annual unit and "≈ $x/mo" when yearly; presets from the plan; `QuoteSummary` as 28 §7 plus
  `monthlyEquivalentMinor` and `savingsMinor` rows on yearly terms.
- **Bulk** (28 §3 bulk mode / X6.13): selection bar → `[Apply preset ▾]` `[Add feature ▾]` `[Remove
  feature ▾]` `[Transfer seat…]` (new: pick the target consultant; the sheet says "Anika's license ends now;
  Lin gets the same features; $0 today; no change to your invoice") → one BULK quote → per-member accordion.
- **Seat matrix** (new, 1440 only; 390 falls back to cards): `/w/admin/licenses?view=matrix` — rows =
  consultants, columns = seat components, cells = ☑/☐/◐(pending), column footer = count × unit = line
  total, right rail = `QuoteSummary`. Toggling cells accumulates one quote (debounced); `[Review & confirm]`
  as 28 §3. Keyboard: arrow keys move, space toggles; each cell is a labelled checkbox ("AI Job Matching for
  Anika Rao, $4.99 per month").
```
1440 — seat matrix
│ Consultant   │ Base ✓ │ AI Match $4.99 │ Tailor $7.99 │ Inbox $4.99 │ Mkt $6.99 │ Interview $9.99 │ Autopilot $19.99 │ $/mo    │
│ ◯ Anika Rao  │   ☑    │       ☑        │      ☑       │     ☐       │    ☐      │       ☐         │        ☐         │ $27.97  │
│ ◯ Priya Nair │   ☑    │       ☐        │      ☐       │     ☑       │    ☑      │       ☑ ⁻ Dec 5 │        ☐         │ $36.96  │
│ ◯ Dev Patel  │   ☑    │       ☐        │      ☐       │     ☐       │    ☐      │       ☐         │        ☐         │ $14.99  │
│ ◯ Lin Zhou   │   ☐    │  (license Lin first — ticking any cell adds the base, shown)                              │ —       │
│ totals       │ 3×14.99│ 1×4.99         │ 1×7.99       │ 1×4.99      │ 1×6.99    │ 1×9.99          │ 0                │ $79.92  │
```

## 7. Enterprise — cost preview and invoices
- `QuoteSummary` (28 §7) gains: `Interval`, `Monthly equivalent`, `Savings vs monthly` (yearly only),
  `Plan version` line when the quote moves the org to a new version, `Transfers (no charge)`.
- Billing & Invoices (28 §4) unchanged; invoice line snapshots carry `plan_version` and the interval; a
  yearly term shows one recurring invoice per year plus proration invoices as they happen, each explained
  ("Prorated: Autopilot prepare for Dev, Jan 20 – Oct 19, 2027").

## 8. Empty, loading, error states (every page here)
| Page | Empty | Loading | Error |
|---|---|---|---|
| /pricing | catalog unreachable → the last good cached catalog (ISR 5 min); none ever → "Pricing is being updated" + Free CTA | skeleton cards | same as empty (never a blank page) |
| checkout review | — | quote spinner in the sheet, button disabled | QUOTE_STALE/EXPIRED re-quote; others inline |
| My plan | Free user card | skeletons | inline retry; quote errors inline |
| Org overview plan card | no plan (legacy org) → "Your organization is on legacy seats — ask Kiwiply" (E22) | tile skeletons | inline |
| Seat matrix | no consultants → Employees link | table skeleton | inline; `STRIPE_ITEM_LIMIT` card (28 §3) |

## 9. Extension and mobile
No purchase surface in the extension (B11.2). The drawer and options read `features[]` from
`/api/profile/version` (06 §6) and show add-on-driven meters (credits) with the same % wording; the
upgrade/add-on deep link is `kiwiply.com/settings/plan?add={featureKey}&return=…` which opens My plan with
that add-on pre-highlighted (**not** pre-ticked).

## 10. Playwright
`web/e2e/pricing-addons.spec.ts`: Monthly/3-month tabs; tick two credits → total; review sheet copy test
(today + renews + noRefund present); checkout stub → success lists add-ons; My plan: −1 credit → preview Δ
→ confirm → toast with Undo → undo restores; interval switch copy; annual toggle absent when the mock says
`annualEnabled=false`, present with savings when true; 390 and 1440; axe on every sheet.
`web/e2e/ent-seat-matrix.spec.ts`: matrix toggles → one quote → confirm → chips on the consultant page;
transfer seat → $0; yearly org fixture shows monthly equivalent.

# 28 — Billing pages UX: Subscription Overview, Consultant Licenses, Configure License, Billing & Invoices, Feature Usage, Platform Pricing Admin

> Status: design, 2026-10-12 (Session C, Fable). Requirements §24 + §26. Build-ready for **X6.1–X6.5**
> (org pages, inside Session B's enterprise shell, `(tenant)` route group) and **X6.9/X6.10** (platform
> admin pages, admin page kit). Components: `@kiwiply/ui` primitives only (`Card`, `Badge/Pill/Tag`,
> `Button`, `IconButton`, `Tabs`, `Switch`, `Meter`, `ProgressBar`, `EmptyState`, `BottomSheet`,
> `Toast`, `Skeleton`, `TableSkeleton`, `AnimatedNumber`, `SaveStatusChip`, `Stepper`) and, for the
> platform-admin pages, the admin kit (`web/src/components/admin-v3/common`: `AdminHero`,
> `AdminStatTiles`, `AdminFilterBar`, `AdminTable`, `AdminTabs`, `ReasonSheet`, `ConfirmTypedSheet`,
> `HistoryDrawer`, `PersonCell`, `HBarList`, `BarLineChart`, `chips`). Money is formatted with
> `Intl.NumberFormat(locale, {style:'currency', currency})` from `*Minor` fields — the web never
> adds two prices. Tenant theme tokens only (no hex). Autosave/undo rules from the Gen-Z memory
> apply to settings; **money changes are never autosaved** — they go through the quote → confirm flow.

## 0. Shared pieces (add to `packages/ui` first — Session B alignment)
- `MoneyText` (`minor`, `currency`, `tone`, `strike`) · `PriceDelta` ("+$19.97/mo") · `FeatureChip` (name + allowance tooltip, states: active, pending-removal (dashed), pending-add (dotted)) · `AllowanceMeter` (Meter with "27 of 40 left · resets Dec 5") · `QuoteSummary` (the impact preview block, §7) · `CostConfirmSheet` (§9) · `StatusPill` map: ACTIVE green, PENDING amber, SUSPENDED grey, CANCEL_AT_PERIOD_END amber-outline, ENDED grey, PAST_DUE red, NONE grey.
- Data hooks (`web/src/lib/ent/billing.ts`): `useOrgSubscription`, `useLicenses(filter)`, `useLicense(id)`, `useOrgCatalog`, `useQuote()`, `useConfirmQuote()`, `useOrgBilling`, `useUsage(by, period)`. All call the BFF proxy; mocks in the mock API (`acme` fixtures: A/B/C/D consultants from 22 §9).

## 1. Subscription Overview — `/{tenant}/admin/subscription` (`billing.view`)
Nav: Org Admin → Subscription. Finance sees the same page.

**390**
```
┌──────────────────────────────┐
│ ‹ Subscription        ACTIVE●│  ← StatusPill; PAST_DUE shows a red banner below the title:
│ Acme Consulting · USD        │     "Invoice #1042 overdue · nothing switched off until Dec 5 · [Pay now]"
│ ┌────────────┐┌────────────┐ │
│ │ 24         ││ 18         │ │  AnimatedNumber tiles: Consultants · Licensed
│ │ consultants││ licensed   │ │
│ └────────────┘└────────────┘ │
│ ┌────────────┐┌────────────┐ │
│ │ 6          ││ $1,274.49  │ │  Unlicensed · Monthly recurring (MoneyText)
│ │ unlicensed ││ /month     │ │
│ └────────────┘└────────────┘ │
│ Next invoice  Dec 5 · ~$1,391.20│  "~" + tooltip "includes $116.71 prorated additions · taxes added by Stripe where applicable"
│ ───────────────────────────── │
│ Pending changes (3)        ›  │  list: "Remove Interview Prep · Priya · Dec 5 · [Undo]"
│ Feature usage              ›  │  HBarList top 5 features: used/allowance, click → Feature Usage
│ Contract: Acme 2026  ends Jun 30│
│ [Manage licenses]             │  primary Button → Consultant Licenses
└──────────────────────────────┘
```
**1440**: three columns — left: 4 stat tiles in a 2×2 grid + "Recurring by preset" HBarList; middle: Next invoice card (estimate, date, breakdown table by product: qty × unit = line, discount line, prorations, "Taxes: calculated by Stripe"), Pending changes list with Undo; right: Billing status card (account status, payment method via portal, contract summary), Feature usage top-5.
Empty states: no licenses yet → `EmptyState` with the mascot *pointing* pose: "No consultant licenses yet. Pick a consultant to start — you'll see the exact price before anything is billed." [Choose a consultant]. Billing not enabled (flag UI-off) → "Billing is being set up for Acme — licenses can be configured, nothing is billed yet" (grey Pill `SETUP`).
Loading: `TileSkeleton` ×4 + `ListSkeleton`. Error: inline card with retry; never a redirect.

## 2. Consultant Licenses — `/{tenant}/admin/licenses` (`licenses.view`; actions need `licenses.manage`)
**390** — cards; **1440** — table.
```
390                                           1440 (AdminTable-like, built from @kiwiply/ui Card+grid, sticky header)
┌──────────────────────────────┐              │ ☐ │ Consultant      │ Marketer │ Features              │ Status │ $/mo    │ Next change     │ ⋯ │
│ ‹ Consultant licenses   [+]  │              │ ☐ │ ◯ Anika Rao     │ Sarah K. │ [Base][AI Match][Tailor]│ ACTIVE │ $27.97  │ —               │ ⋯ │
│ [🔍 search] [Filters ▾] [Sort]│              │ ☐ │ ◯ Priya Nair    │ Sarah K. │ [Base][Email][Mkt][Int⁻]│ ACTIVE │ $36.96  │ −Interview Dec 5│ ⋯ │
│ 18 licensed · 6 unlicensed   │              │ ☐ │ ◯ Dev Patel     │ —        │ [Base]                 │ ACTIVE │ $14.99  │ —               │ ⋯ │
│ ┌──────────────────────────┐ │              │ ☐ │ ◯ Lin Zhou      │ Tom B.   │ (no license)           │ —      │ —       │ [License]       │   │
│ │ ◯ Anika Rao       ACTIVE │ │              bulk bar (appears on selection): "3 selected · [Apply preset ▾] [Add feature ▾] [Remove feature ▾] [Suspend] [Cancel]" → one BULK quote
│ │ marketer: Sarah K.       │ │
│ │ [Base][AI Match][Tailor] │ │
│ │ $27.97/mo        [Configure]│
│ └──────────────────────────┘ │
│ ┌──────────────────────────┐ │
│ │ ◯ Priya Nair      ACTIVE │ │
│ │ [Base][Email][Mkt][Int ⁻]│ │   ⁻ = pending removal chip (dashed) with "until Dec 5"
│ │ $36.96/mo → $26.97 Dec 5 │ │
│ └──────────────────────────┘ │
│ ┌──────────────────────────┐ │
│ │ ◯ Lin Zhou   no license  │ │
│ │ [License Lin]            │ │
│ └──────────────────────────┘ │
└──────────────────────────────┘
```
Filters (AdminFilterBar pattern, Gen-Z compact chips): status, feature, team/department, marketer, "unlicensed only", "pending changes". Sort: name, price, next change, status. Search by name/email (debounced 300 ms). Row `⋯`: Configure · History · Suspend · Cancel · Reactivate (per state). Bulk actions open the same Configure flow in **bulk mode** (§3) → one quote. Empty: "No consultants match" / no consultants at all → link to Employees (invite with the CONSULTANT role). The consultant's avatar/name uses `PersonCell`-equivalent from `packages/ui` (Session B provides `MemberAvatar`).

## 3. Configure Consultant License — `/{tenant}/admin/licenses/{memberId}` (`licenses.manage`)
Stepper on 390 (Summary → Features → Review); two panes on 1440 (left: picker; right: sticky QuoteSummary).
```
390                                              1440
┌──────────────────────────────┐                 ┌───────────────────────────────┬───────────────────────────┐
│ ‹ Anika Rao                  │                 │ Anika Rao · Consultant · Sarah K. (marketer) · ACTIVE since Oct 5   │ Impact preview            │
│ ◯ Consultant · assigned Sarah│                 │ Presets: [Job Search Essentials][Resume & AI ✓][Talent Marketing][Interview][Full]           │ Current  $27.97 /mo       │
│ Base license  $14.99  ✓ req. │                 │ ☑ Base license                 $14.99  required                        │ Proposed $37.96 /mo       │
│ Presets ▸ [Resume & AI ✓][…] │                 │ ☑ AI Job Matching              $4.99   300 matches / period            │ Δ  +$9.99 /mo             │
│ ───── Features ─────         │                 │ ☑ AI Resume Tailoring          $7.99   40 tailorings · consent needed ⓘ│ Today (prorated) up to $4.83│
│ ☑ AI Job Matching   $4.99    │                 │ ☐ Resume Optimization          $3.99   40 / period                      │ Next invoice Dec 5 ~$1,296.03│
│   300 matches/period         │                 │ ☐ Advanced Versions            $1.99   50 versions                      │ Contract: −$2.00 (Acme 2026)│
│ ☑ AI Resume Tailoring $7.99  │                 │ ☐ Email Monitoring             $4.99   consultant connects Gmail ⓘ      │ Effective: now / Dec 5     │
│   40 tailorings · consent ⓘ  │                 │ ☐ Marketing-Assisted Apps      $6.99   60 preparations · consent ⓘ      │ Taxes: by Stripe ⓘ        │
│ ☐ Interview Prep    $9.99    │                 │ ☐ Interview Prep               $9.99   20 sessions                       │ [Review & confirm]        │
│ ☐ Autopilot prepare $19.99   │                 │ ☐ Autopilot prepare            $19.99  300 ops/period · 30/day · needs AI Job Matching (+$4.99) ⓘ│ quote expires in 14:32 │
│   needs AI Job Matching ⓘ    │                 │ ☐ Extra AI credits  ×[1]       $4.99/unit (max 4)                        │                           │
│ ☐ Extra AI credits ×[1] $4.99│                 └───────────────────────────────┴───────────────────────────┘
│ ───────────────────────────  │
│ Proposed $37.96/mo  (+$9.99) │  ← sticky bottom bar (useBottomBar): current → proposed, Δ, [Review]
└──────────────────────────────┘
```
Rules: toggling calls `POST …/quotes` (debounced 400 ms) and the preview re-renders from the DTO (never computed client-side); a `Spinner` + `SaveStatusChip`-style "Updating price…" while pending; the "Review & confirm" button is disabled until the quote returns and shows the countdown from `expiresAt` (re-quote automatically at 0). Unchecking the base = "Cancel license" (separate destructive action with its own sheet). Dependencies: a TECHNICAL paid dep shows "needs X (+$)" and checking the feature pre-checks X visibly; a COMMERCIAL dep opens the cost confirmation (§9) before the quote line is accepted; INTEGRATION/CONSENT show ⓘ "licensed, but Anika must connect/consent before it works". Removing: unchecking an active feature shows "works until Dec 5 · no refund" inline.
Review step: full `QuoteSummary` (§7) + "Confirm changes" (primary) → `ConfirmSheet` with the final numbers + "You're confirming $9.99/mo more and up to $4.83 today" + confirm button; success → Toast "Anika's license updated · Undo removal" (undo = cancel pending removal, only for removals), and the page shows the new state. Errors: `QUOTE_STALE` → inline "Prices changed, we refreshed the preview" (auto re-quote); `STRIPE_ITEM_LIMIT` → card with the retired prices list and a "Refresh prices" action; `DEPENDENCY_UNCONFIRMED` → re-open §9.
Bulk mode: header "3 consultants selected"; the picker shows mixed states as `◐` (some have it); the QuoteSummary lists per-consultant lines in an accordion; the confirm sheet totals the batch.

## 4. Billing & Invoices — `/{tenant}/admin/billing` (`billing.view`; portal/contacts need `billing.manage`)
Tabs (`Tabs`): **Account** · **Invoices** · **Contract** · **Contacts**.
- Account: status pill, currency, collection method, payment method (brand/last4 from Stripe, never stored) [Change in Stripe portal], tax status ("Taxes calculated by Stripe where applicable" or "Not calculated" per C3), billing mode shown only to platform admins.
- Invoices: list from `org_invoice` (number, date, amount, status Pill paid/open/void, [PDF ⤓] → `invoice_pdf_url`); row expands to `org_invoice_line` snapshot (product, qty, unit, line; discount line; prorated items with "Prorated: Interview Prep for Priya (Nov 20–Dec 5)"); credits (C1) shown as their own rows "Credit applied by Kiwiply — {reason}". Payment history = `paid_at` rows.
- Contract: name, reference, dates, renewal, "promotions stack: no", "volume tiers: yes", min committed (informational), [Download contract summary] (PDF generated server-side from the rows, no upload).
- Contacts: billing emails (ChipInput, autosave, undo toast — not money).
390: tabs become a segmented control; invoice rows are cards with the PDF button on the right. Empty: no invoices yet → "Your first invoice arrives on Dec 5". Setup fee not paid → the whole page is the setup-fee card (billing.md §2 flow: [Pay by card] [Request an invoice]).

## 5. Feature Usage — `/{tenant}/admin/usage` (`usage.view`; consultants see their own at `/{tenant}/me/features`)
Tabs: **By consultant** · **By feature** · **By team** · **History**. Period selector (current, previous, custom from `usage/history`).
- By consultant: rows (PersonCell, team) × feature `AllowanceMeter`s; AI budget as a percent `Meter` ("72 % of AI budget") — never dollars; consent-less members show counts only.
- By feature: `HBarList` used vs pool/allowance totals, remaining, overage count (0 until X12), "resets Dec 5".
- By team: grouped totals with k≥3 suppression for team views under 3 members (org analytics rule).
- History: `BarLineChart` per feature across periods.
390: one tab at a time, meters stacked. Empty: "No usage this period yet"; feature not licensed anywhere → hidden. Consultant's own page ("My Available Features"): FeatureChips with meters, "Ask your admin for…" card for unlicensed features (`FEATURE_NOT_LICENSED` 402 handler), consent toggles for features with CONSENT deps (`org_feature_consent`), integration cards ("Connect your Gmail to start Email Monitoring").

## 6. Platform Pricing Admin — `/admin/pricing` (ROLE_ADMIN; admin page kit)
`AdminHero` ("Pricing · catalog v17 · published Oct 12 by jk") + `AdminTabs`: **Catalog** (products + prices, `AdminTable`, margin column with the floor tick, drafts in amber) · **Features** (feature definitions, allowances, AI budgets, dependencies editor with the kind selector and cycle check) · **Presets** (feature multi-select, mirrors selector, the above-individual check result live) · **Volume tiers** · **Discounts** (`org_discount`) · **Contracts** (`AdminTable` by org; detail = rows editor + `HistoryDrawer` from `contract_event`) · **Publish** (diff of pending drafts, margin re-check table, `ReasonSheet` → publish; version list with snapshots) · **Change history** (`catalog_change` + `admin_audit_event`).
Price editor = Phase 18 §10 mobile wireframe (live margin guard) with the ORG kind formulas (21 §5). Every write goes through `ReasonSheet`/`ConfirmTypedSheet` (publish types the version number). 390: tabs scroll horizontally; tables become card lists (`useNarrow`).
Org billing operations (X6.10) live under the existing admin customer pages: `/admin/orgs/{id}/billing` — setup-fee status, invoices, items vs licenses (reconciler drift list with resolve+reason), billing mode switch, credits (flagged), suspend/reactivate with reason, test-clock controls in test mode.

## 7. `QuoteSummary` (the Subscription Impact Preview block; every §19 field)
```
Current base fee          $44.97  (3 × $14.99)
Current features          $44.95  (AI Match, Tailor, Email, Mkt, Interview)
Proposed additions       +$27.96  (Tailor → Dev · Job Search Essentials → Lin)      [expand lines]
Proposed removals         −$9.99  (Interview Prep · Priya · effective Dec 5)
Contract pricing          −$6.00  Acme 2026   ·  Volume tier (3+ consultants) −$0.00
──────────────────────────────────────────
Current recurring         $79.92 /mo
Proposed recurring        $99.89 /mo         Δ +$19.97 /mo
Effective                 now (additions) · Dec 5 (removals)
Today, prorated           up to $14.48       ⓘ "final amount is calculated at confirmation and can only be lower"
Estimated next invoice    ~$114.37 on Dec 5  ⓘ "Taxes are calculated by Stripe at invoice time where applicable"
Licensed consultants      3 → 4
Quote valid for           14:32
```
Values come 1:1 from `LicenseQuoteDTO` (22 §8): `currentBaseFeeMinor`, `currentFeatures[]`, `proposedFeatures[]`, `proposedRemovals[]`, `contractDiscountsMinor`, `volumeTier`, `currentRecurringMinor`, `proposedRecurringMinor`, `deltaMinor`, `effectiveAt`/`periodEndAt`, `prorationEstimateMinor`, `nextInvoiceEstimateMinor`, `nextInvoiceAt`, `taxEstimateMinor`/`taxNote`, `licensedCountNow/After`, `expiresAt`.

## 8. Empty, loading, error states (every page)
| Page | Empty | Loading | Error |
|---|---|---|---|
| Overview | no licenses → mascot card + CTA; billing off → SETUP pill card | tile + list skeletons | inline retry card |
| Licenses | no consultants → "Invite consultants" link; no matches → clear filters | `TableSkeleton` / card skeletons | inline retry |
| Configure | member not a consultant → "Lin isn't a consultant yet — give them the Consultant role first" | picker skeleton + disabled bar | quote errors inline (§3) |
| Billing | setup fee unpaid → setup-fee card; no invoices → date of first invoice | tab skeletons | inline |
| Usage | no usage → "Nothing used yet this period" | meter skeletons | inline |
| Pricing admin | empty catalog → "Create the first product" | kit skeletons | kit error |
404 from the BFF (outsider, wrong tenant) renders the shell's "not part of your role" state — never a redirect (05 §7).

## 9. The cost-confirmation dialog (never silently add a paid feature)
Triggered when a quote returns `requiresConfirmation[]` (COMMERCIAL dep) or when a preset would add paid lines the admin did not tick explicitly.
```
┌──────────────────────────────────────────────┐   BottomSheet on 390, centred dialog on 1440
│ Autopilot prepare needs AI Job Matching       │
│                                               │
│ Adding Autopilot prepare for Anika also adds: │
│   • AI Job Matching     $4.99 /mo             │
│   • Autopilot prepare   $19.99 /mo            │
│ ───────────────────────────────────────────── │
│ New monthly total for Anika   $52.95 (+$24.98)│
│ Today, prorated               up to $12.06    │
│                                               │
│ [Cancel]                 [Add both — $24.98/mo]│   ← the primary button names the amount; nothing is checked until tapped
└──────────────────────────────────────────────┘
```
Accepting adds `ai.job_matching` to `confirmedCommercialDeps` and re-quotes; the picker then shows both lines checked with a "confirmed together" link. Declining leaves both unchecked. The same sheet is used for bulk ("for 3 consultants · $74.94/mo").

## 10. Accessibility and responsiveness
Every money change has a text equivalent (`aria-live="polite"` on the proposed total); meters carry `aria-valuetext` ("27 of 40 tailorings left"); the sticky bottom bar respects `useBottomBar` insets; reduced motion disables `AnimatedNumber`; contrast of tenant tokens validated by Session B's rules; keyboard: feature rows are checkboxes with labels including the price.

## 11. Playwright (over the mock API; `web/e2e/ent-billing.spec.ts`, X6.11)
E2E-C journey (§32 C): licenses page → Configure Anika → base → AI Job Matching → AI Resume Tailoring → prices displayed → preview totals equal the mock quote → confirm → entitlements effective (consultant page shows the two chips) → Interview Prep unavailable (402 card). Plus: COMMERCIAL dep dialog; pending removal + undo; PAST_DUE banner; billing-off empty state; 390 and 1440 viewports.

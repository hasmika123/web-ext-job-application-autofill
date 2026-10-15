# 04 — Plan builder (platform admin UX): create, version, publish, grandfather, sunset

> Status: design, 2026-10-15 (Fable). Platform admin, `ROLE_ADMIN` (+ admin permission `catalog.manage`;
> publish is HIGH → `ReasonSheet` + re-auth). Built with the admin page kit
> (`web/src/components/admin-v3/common`: `AdminHero`, `AdminStatTiles`, `AdminTabs`, `AdminFilterBar`,
> `AdminTable`, `ReasonSheet`, `ConfirmTypedSheet`, `HistoryDrawer`, `AutosaveInput`, `PlanChip`,
> `HBarList`) and `@kiwiply/ui` primitives (`MoneyText`, `PriceDelta`, `FeatureChip`, `Meter`, `Switch`,
> `Stepper`, `BottomSheet`, `Toast`, `EmptyState`, `SaveStatusChip`). Money is formatted from `*Minor`
> fields; **the web never adds two prices** — every total, margin and lever is a DTO field from
> `GET /api/admin/plans/{id}/versions/{v}/preview` (09 §1). Tenant/admin theme tokens only.
> Extends `28 §6` (Platform Pricing Admin) with a **Plans** tab; the Catalog / Features / Presets /
> Volume tiers / Discounts / Contracts / Publish / History tabs stay as designed there.

## 1. Where it lives
`/admin/pricing` → `AdminTabs`: **Plans** (new, first) · Catalog · Features · Presets · Volume tiers ·
Discounts · Contracts · Publish · History. Deep links: `/admin/pricing/plans`, `/admin/pricing/plans/{planKey}`,
`/admin/pricing/plans/{planKey}/v/{n}` (editor), `…/v/{n}/publish`. Nav entry added to `AdminShell` under
"Business" (the only nav change).

## 2. Plans list — 1440
```
┌ AdminHero  Pricing · catalog v17 · published Oct 12 by jk                      [New plan ▾ Individual · Organization] ┐
│ AdminStatTiles: 5 plans · 3 published · 1 draft · 1 sunset   │ Subscribers on old versions: 212 (PRO v1)  [Review] │
│ AdminFilterBar: [🔍 key or name] [Audience ▾] [Status ▾] [Interval ▾] [Currency ▾]                                 │
│ AdminTable                                                                                                           │
│ Plan            Audience    Status      Live version   Subscribers (by version)   Monthly    Quarterly  Annual  Margin worst │
│ Free            Individual  PUBLISHED   v1             4,120                      $0         —          —       —      │
│ Pro             Individual  PUBLISHED   v2 (v1: 212)   1,038                      $19.99     $49.99     off     80.6 % ✓│
│ Autopilot       Individual  PUBLISHED   v1             87                         $39.99     $99.99     off     81.3 % ✓│
│ Pro Student     Individual  DRAFT       v1 draft       —                          $11.99     $29.99     —       80.3 % ✓│
│ Org Standard    Organization PUBLISHED  v1             14 orgs · 231 seats        seat $14.99 —          off     94.7 % ✓│
│ Org Consultancy Organization SUNSET→Org Standard v1  2 orgs                       …                                     │
│ row ⋯: Open · New version · Compare versions · Sunset… · Duplicate as…                                               │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```
**390**: `AdminHero` compact, tiles 2×2, filters as chips, rows as cards (`useNarrow`): name + `PlanChip`,
status `StatePill`, live version, subscribers, one price line ("$19.99/mo · $49.99/3 mo"), margin tick.
Empty: "No plans yet — create Free first" (`EmptyState`, kit). Error: kit error card with retry.

## 3. Plan editor (a version in DRAFT) — 1440
Two panes: left = composition; right = sticky **Preview** (totals, margin, impact). Everything on the left
is autosaved to the DRAFT version (`AutosaveInput` + `SaveStatusChip` ✓/undo — a draft is not money);
**nothing reaches customers until Publish**.

```
┌ ‹ Plans   Pro · v3 DRAFT  (live: v2 since Oct 12 · 1,038 subscribers)                 [Discard draft] [Publish…] ┐
│ ┌──────────────────────── Composition ────────────────────────────┬──────── Preview (server-computed) ─────────┐ │
│ │ Identity                                                        │ Interval  [Monthly ▾]  Currency [USD ▾]     │ │
│ │  Key PRO (locked)  Name [Pro        ]  Badge [Most popular ▾]    │ ─────────────────────────────────────────── │ │
│ │  Public ☑  Audience Individual  Intervals ☑ Month ☑ Quarter ☐ Year│ Base price            $19.99   80.6 % ✓   │ │
│ │  (Year disabled: billing.annual.enabled = off  ⓘ)               │ Included AI cap       $3.00 / period        │ │
│ │ Base price (product PRO)                                        │ Optional add-ons                            │ │
│ │  Monthly  [$ 19.99]  Quarterly [$ 49.99]  Year  —               │   Extra AI credits     $4.99 ×1…4  82.2 % ✓ │ │
│ │  AI budget cap / period  [$ 3.00] monthly · [$ 8.00] quarterly  │   Extra resumes (+10)  $1.99 ×1…3  96.5 % ✓ │ │
│ │ Included services (12)                        [+ Add service]   │   Priority support     — no price → hidden  │ │
│ │  ☑ Kiwiply AI autofill       2000 ops / period   ai $1.50 share │ Worst case: base + all add-ons at max       │ │
│ │  ☑ Resume library            [25] resumes        (limit)        │   $35.94 / mo  · AI $6.00 · fee $1.34      │ │
│ │  ☑ AI resume tailoring       [40] tailorings     ai $1.25 share │   margin 79.6 % ✗  ← lever: credits ≥ $5.49 │ │
│ │  ☑ Inbox monitoring          1 connection                       │ ─────────────────────────────────────────── │ │
│ │  ☑ AI interview practice     [20] sessions                      │ Impact if published                        │ │
│ │  … (FeatureChip rows, drag to reorder; ⓘ = description)         │  1,038 on v2 keep v2 (grandfathered)        │ │
│ │ Optional add-ons (3)                          [+ Add add-on]    │  New sign-ups get v3 from [Oct 20 ▾]        │ │
│ │  ☐ Extra AI credits   product FEAT_AI_CREDITS  max qty [4]      │  Catalog version → v18                      │ │
│ │     Monthly [$4.99] Quarterly [$14.97] Year —  disc —           │  Stripe prices to create: 2 (quarterly rows)│ │
│ │  ☐ Extra resumes (+10) product FEAT_RESUME_PACK  max [3]        │ Checks: deps ✓ · prices ✓ · margin ✗ (1)    │ │
│ │  ☐ Priority support   product FEAT_SUPPORT  (no price yet ⚠)    │ [Run all checks]                            │ │
│ │ Presets (shortcuts)  [Power user: credits ×2, resumes ×1] [+]   │                                             │ │
│ │ Eligibility  Countries [all]  Verification [none ▾]             │                                             │ │
│ └─────────────────────────────────────────────────────────────────┴─────────────────────────────────────────────┘ │
│ Change history (HistoryDrawer: catalog_change rows for this version)                                              │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```
Rules:
- **Key and audience are immutable** after the first publish (new plan instead).
- Adding a service opens a searchable sheet over `feature_definition` filtered by audience; picking one with
  a TECHNICAL dependency outside the plan pre-adds the dependency visibly ("needs Resume library — added").
- Allowance fields show the service default as placeholder; blank = default; `0` only for `usage_unit=none`.
- Price fields write **draft `product_price` rows** (never edit a published row; a changed amount = a new
  row, old one retired at publish — ADR-013). The margin tick next to each price is live (debounced
  `GET /api/admin/catalog/margin`, 300 ms).
- Year column is disabled with the tooltip until `billing.annual.enabled`; when enabled it shows the
  **derived** amount from the discount (`plan` default, per-add-on override field) and an "explicit" toggle
  to type an amount instead; the implied discount and the lever `maxDiscountBp` are shown.
- Preview is 1:1 the `PlanPreviewDTO` (09 §1.4); the margin section lists every check of 03 §7.2 with
  ✓/✗ and levers. A ✗ does not block editing; it blocks **Publish** without an override reason.
- Impact block: subscribers per live version, what happens to each (grandfathered), effective date
  picker (`effective_from ≥ now`, ≤ 90 days), Stripe objects to be created, catalog version bump.

**390** — `Stepper`: 1 Identity → 2 Base & prices → 3 Included → 4 Add-ons → 5 Review. Sticky bottom bar
(`useBottomBar`): "Worst case 79.6 % ✗ · [Review]". Each step is one scroll; service rows are `FeatureChip`
cards with the allowance input inline; the Preview is a `BottomSheet` opened from the bar.
```
┌──────────────────────────────┐
│ ‹ Pro · v3 draft   (3 of 5)  │
│ Included services (12)       │
│ ┌──────────────────────────┐ │
│ │ ☑ Resume library         │ │
│ │   allowance [25] resumes │ │
│ │   limit key resumes.max  │ │
│ └──────────────────────────┘ │
│ ┌──────────────────────────┐ │
│ │ ☑ AI resume tailoring    │ │
│ │   [40] tailorings · $1.25│ │
│ └──────────────────────────┘ │
│ [+ Add service]              │
│ ──────────────────────────── │
│ Worst case 79.6 % ✗  [Review]│
└──────────────────────────────┘
```

## 4. Publish flow (HIGH)
`[Publish…]` → `ConfirmTypedSheet`: shows the diff vs the live version (added/removed/changed services,
allowances, prices, intervals, discounts), the full check table, the effective date, the subscriber impact
("1,038 stay on v2; nothing changes for them; new sign-ups from Oct 20 get v3"), the Stripe objects to
create (idempotency keys `price-{id}` shown), and requires typing the **version number**; a ✗ check adds a
required override reason (≥ 20 chars). On confirm: one transaction (02 §7, 21 §7): `catalog_publish` row
(version N), draft prices → active with `effective_from`, derived YEAR rows created, replaced prices
retired with `effective_until`, `plan_version.status=PUBLISHED`, previous version `SUPERSEDED` (still
servable to its subscribers), `snapshot_json` + hash, `catalog_change` + `admin_audit_event`
(`PLAN_PUBLISHED`, HIGH). Stripe Prices are created **before** the commit with the idempotency keys;
Stripe off → publish refused `503 BILLING_DISABLED` (drafts stay editable; Phase 18 D3).
Toast: "Pro v3 published · live Oct 20 · [View]". Failure: inline card per step; nothing half-published.

## 5. Grandfathering (never silently re-price)
- A subscription references its `plan_version_id`; publishing never touches it. Existing subscribers keep
  prices, allowances and included services **exactly** (invariant test `GrandfatherTest`).
- "Migrate subscribers" is a separate, explicit admin action on a SUPERSEDED version:
  `[Offer migration…]` → choose target version, message, and whether the move is **opt-in** (customer
  confirms a quote — default) or **scheduled at renewal with 30-day notice** (B4.2's price-change notice,
  legal minimum; only for price *decreases* or equal prices without a decision — **S-03** for increases).
  The customer always sees a quote with old vs new lines before anything changes; the move applies at
  period end; nothing is prorated or refunded.
- The Plans list shows "Subscribers on old versions" so an old version is never forgotten; a version with
  0 subscribers and `effective_until` past can be **archived** (`RETIRED`, read-only forever).

## 6. Retiring a plan
`[Retire…]` opens the **retirement wizard** of `11-plan-retirement.md` §11 (scope → impact → successors →
notices and default outcome → review with typed confirm). The lifecycle (`RETIRING` → `RETIRED`), the
per-subscriber effective dates, the notice schedule, the closest-match successors, the subscriber choices
and the Free-with-read-only-lock default (user decision S-19) are all specified there; this page only links
to it. `RETIRED` is reached when no subscription references any version (`PlanRetireGuard`).

## 7. Presets and bundle shortcuts
Plans tab → a version's "Presets" row editor: name, add-on list with quantities; shown to customers as
one-tap chips that visibly tick the add-ons (05 §3). A preset carries **no price** (S-05 default); if the
user later allows bundle discounts, `preset.bundle_discount_bp` appears here and runs through the guard like
a derived price.

## 8. Versions compare
`/admin/pricing/plans/{key}/compare?a=2&b=3`: two-column diff of `snapshot_json` (services, allowances,
prices per interval/currency, discounts, eligibility), subscriber counts, margin per interval. Read-only.

## 9. Org plan editor differences
Same editor with roles `SEAT_BASE` (one, required, product kind BASE_LICENSE), `SEAT_INCLUDED`,
`SEAT_OPTIONAL`, `FEE` (setup fee required for ORG — E3; platform fee optional; modules with
`quantity_basis`). Seat rules block: min/max seats, presets (`license_preset` rows filtered to this plan),
"above individual" check results per preset (21 §5). Preview shows `seat_total` for the base seat and for
each preset, `org_recurring` for a sample roster (A/B/C from 22 §9 — admin can type a roster: "5 base, 3
Resume & AI, 1 Full"), setup fee, and the annual column when `billing.intervals.org` includes YEAR.

## 10. States and errors
| State | Rendering |
|---|---|
| no plans | `EmptyState` "Create Free first" |
| draft with failing checks | editor open; Publish shows the failing count; override path |
| Stripe off | banner "Stripe is not configured — drafts only" (kit `LivePill` off) |
| concurrent edit | `409 VERSION_CONFLICT` → "jk changed this draft 2 min ago — reload" (optimistic `updated_at`) |
| publish partial failure | never: single transaction; a Stripe create that succeeded without a commit is reconciled by the catalog reconciler (Phase 18 §6) and shown in History |
| loading | kit skeletons; preview `TileSkeleton` |

## 11. Accessibility
Every price input has `aria-describedby` with its margin result; the preview totals are `aria-live=
"polite"`; margin ticks have text equivalents; keyboard reorder of services (↑/↓) ; reduced motion disables
`AnimatedNumber`.

## 12. Playwright (`web/e2e/admin-plans.spec.ts`, over the mock API)
Create Pro v3 draft → add "Extra AI credits" with a price → preview shows margin ✓ → set the add-on to
$3.99 → ✗ with lever → raise to $5.49 → ✓ → Publish types "3" → History shows `PLAN_PUBLISHED` →
`/pricing` (mock) renders v3 add-on → Sunset "Org Consultancy" → pricing page hides it; 390 and 1440.

# 09 — APIs: admin catalog & plan builder, public catalog, personal quotes/checkout/change, org plan, entitlements

> Status: design, 2026-10-15 (Fable). Conventions of `40-api-specs.md`: `problem+json` with `code`;
> `Idempotency-Key` header (UUID) on every money write; money as `*Minor` longs + `currency`; timestamps ISO
> UTC; pagination `page/size`; admin writes marked HIGH need the `ReasonSheet` body `{reason}` (≥ 20 chars)
> and re-auth. Existing routes keep working unchanged (`GET /api/billing/me`, `POST /api/billing/checkout
> {plan: monthly|3mo}` one release as an alias, `/portal`, `/webhook`). Org license routes are 20 §7 and
> stay; §4 adds the plan-level ones.

## 1. Platform admin — catalog and plans (`ROLE_ADMIN` + `catalog.manage`; reads `catalog.view`)

### 1.1 Services (feature definitions)
| Method & path | Body / response | Errors | Notes |
|---|---|---|---|
| `GET /api/admin/catalog/services?audience=&category=&q=` | `[ServiceDTO]` = every `feature_definition` column + `limits[]`, `dependencies[]`, `products[]` (with active prices per audience/interval/currency), `usedByPlans[]` | | |
| `POST /api/admin/catalog/services` (HIGH) | `ServiceDTO` without key-derived fields → 201 | `409 FEATURE_KEY_EXISTS`, `422 ALLOWANCE_REQUIRED`, `422 KEY_FORMAT` | key immutable after create |
| `PUT /api/admin/catalog/services/{key}` (HIGH) | same | `422 DEPENDENCY_CYCLE`, `409 VERSION_CONFLICT` (`updatedAt` mismatch) | allowance changes apply to new periods |
| `PUT /api/admin/catalog/services/{key}/dependencies` (HIGH) | `[{requiresFeatureKey, kind, note}]` full replacement | `422 DEPENDENCY_CYCLE` | |
| `POST /api/admin/catalog/services/{key}/retire` (HIGH) | `{reason}` | `409 SERVICE_IN_LIVE_PLAN {planKeys}` | |

### 1.2 Products and prices (Phase 18 §4 + 21 §8, unified)
| Method & path | Body / response | Errors |
|---|---|---|
| `GET /api/admin/catalog` | `{products[], prices[], services[], presets[], tiers[], floors, feeModel, catalogVersion}` | |
| `POST /api/admin/catalog/products` (HIGH) | `{code, name, kind, soldTo, featureKey?, quantityBasis?, roleKey?}` → 201 | `409 PRODUCT_CODE_EXISTS`, `422 KIND_REQUIRES_FEATURE` |
| `POST /api/admin/catalog/prices` | `{productId, audience, interval, amountMinor, currency, payoutMinor?, subscriberDiscountBp?, acceptsPromos?, countrySet?, annualSource?: EXPLICIT, derivedDiscountBp?}` → 201 draft + `margin{bp, floorBp, ok, levers}` | `422 INTERVAL_NOT_ENABLED {interval}` (YEAR while annual off; ORG+QUARTER), `422 MARGIN_BELOW_FLOOR` (informational on draft) |
| `POST /api/admin/catalog/prices/{id}/publish` (HIGH) | `{effectiveFrom?, overrideReason?}` | `422 MARGIN_BELOW_FLOOR {marginBp, floorBp, levers}`, `503 BILLING_DISABLED`, `409 PRICE_ACTIVE_EXISTS` |
| `POST /api/admin/catalog/prices/{id}/retire` (HIGH) | `{effectiveUntil?}` | `409 LAST_ACTIVE_PRICE_IN_LIVE_PLAN` |
| `GET /api/admin/catalog/margin?kind=&audience=&interval=&amountMinor=&aiBudgetCents=&quantity=&payoutMinor=&discountBp=&currency=` | `{worst{marginBp, costMinor, lines[]}, typical{marginBp, aiP50Cents}, floorBp, ok, headroomBp, levers{minPriceMinor, maxAiBudgetCents, maxDiscountBp}}` | |
| `GET /api/admin/catalog/fee-model` · `PUT` (HIGH) | `{model: SIMPLE\|SCHEDULE, schedule{...}, version}`; PUT returns `reevaluation[]` (prices now below floor) | `422 OUT_OF_BOUNDS` |
| `GET /api/admin/catalog/versions` · `GET /versions/{n}` | `catalog_publish` rows + snapshot | |

### 1.3 Plans
| Method & path | Body / response | Errors |
|---|---|---|
| `GET /api/admin/plans?audience=&status=` | `[PlanSummaryDTO{planKey, name, audience, status, public, liveVersion{version, effectiveFrom}, draftVersion?, subscribersByVersion{v: n}, pricesByInterval{MONTH: minor…}, marginWorstBp, successorPlanKey?}]` | |
| `POST /api/admin/plans` (HIGH) | `{planKey, name, audience, description?, badge?, public?, sortOrder?, eligibility?}` → 201 `PlanDTO` with version 1 DRAFT | `409 PLAN_KEY_EXISTS`, `422 KEY_FORMAT` |
| `PUT /api/admin/plans/{planKey}` (HIGH) | name, description, badge, public, sortOrder, eligibility (key/audience immutable) | `409 VERSION_CONFLICT` |
| `GET /api/admin/plans/{planKey}` | `PlanDTO{…, versions[PlanVersionDTO]}` | |
| `POST /api/admin/plans/{planKey}/versions` (HIGH) | `{from?: version}` → 201 new DRAFT copied from `from` (default: live) | `409 DRAFT_EXISTS` |
| `GET /api/admin/plans/{planKey}/versions/{v}` | `PlanVersionDTO` (§1.4) | |
| `PATCH /api/admin/plans/{planKey}/versions/{v}` | partial: `intervals[]`, `annualDiscountBp`, `aiBudgetCapCents`, `baseProductId`, `seatRules`, `presets[]`, `summary` — DRAFT only, autosave | `409 NOT_DRAFT`, `422 INTERVAL_NOT_ENABLED`, `409 VERSION_CONFLICT` |
| `PUT /api/admin/plans/{planKey}/versions/{v}/components` | full list `[{featureKey, role, productId?, allowanceOverride?, limitOverrides?, maxQuantity?, componentDiscountBp?, sortOrder, marketingLabel?}]` → `PlanVersionDTO` | `422 PLAN_DEPENDENCY_MISSING {featureKey, requires}`, `422 ROLE_INVALID_FOR_AUDIENCE`, `422 DUPLICATE_COMPONENT`, `422 ALLOWANCE_REQUIRED` |
| `GET /api/admin/plans/{planKey}/versions/{v}/preview?interval=&currency=&roster=` | `PlanPreviewDTO` (§1.4) — all totals, margin checks, impact | |
| `POST /api/admin/plans/{planKey}/versions/{v}/publish` (HIGH, typed confirm = version number) | `{effectiveFrom?, overrideReason?, confirmVersion}` → `PlanVersionDTO` PUBLISHED | `422 PLAN_PRICE_MISSING {featureKey, interval, currency}`, `422 PLAN_DEPENDENCY_MISSING`, `422 MARGIN_BELOW_FLOOR {checks[]}`, `422 PRESET_BELOW_INDIVIDUAL`, `503 BILLING_DISABLED`, `409 NOT_DRAFT`, `412 CONFIRM_MISMATCH` |
| `POST /api/admin/plans/{planKey}/versions/{v}/discard` | DRAFT → deleted | `409 NOT_DRAFT` |
| `GET /api/admin/plans/{planKey}/compare?a=&b=` | `{diff[], subscribers{a, b}, marginByInterval{a, b}}` | |
| `POST /api/admin/retirements` … `/{id}/start` · `/cancel` · `/complete` · `/coverage` · `/notices/preview` · `/items` (HIGH on start/cancel) | the retirement lifecycle — bodies and errors in `11-plan-retirement.md` §2, §5, §11 and stories K10.1–K10.3 (replaces the earlier `/sunset` route) | `410 PLAN_RETIRING`, `422 SERVICE_RETIRING`, `422 PRICE_INCREASE_REQUIRES_CONSENT`, `409 RETIREMENT_IN_PROGRESS`, `422 PRODUCT_RETIRED` |
| `GET /api/billing/retirement/me` · `POST /api/billing/retirement/me/choice` | subscriber side of a retirement (11 §6; K10.4) | `409 QUOTE_STALE`, `410 QUOTE_EXPIRED` |
| `POST /api/admin/plans/{planKey}/versions/{v}/migrations` (HIGH) | `{targetVersion, mode: OPT_IN\|AT_RENEWAL_WITH_NOTICE, message, noticeDays≥30}` → 202 `MigrationDTO{id, affected, scheduledFor}` | `422 PRICE_INCREASE_REQUIRES_DECISION` (S-03), `409 TARGET_NOT_LIVE` |
| `GET /api/admin/plans/{planKey}/subscribers?version=&page=` | `[{login (admin only), since, interval, addons[], state}]` | |
Idempotency: `POST …/publish`, `…/sunset`, `…/migrations` take `Idempotency-Key`; replay returns the same result (200) and never publishes twice (`catalog_publish` is keyed by version).

### 1.4 DTO shapes
```jsonc
// PlanVersionDTO
{ "planKey":"PRO", "version":3, "status":"DRAFT", "audience":"INDIVIDUAL", "intervals":["MONTH","QUARTER"], "annualDiscountBp":null,
  "aiBudgetCapCents":300, "baseProduct":{"id":12,"code":"PRO","prices":[{"id":41,"interval":"MONTH","currency":"USD","amountMinor":1999,"active":true,"stripePriceId":"price_…"}, …]},
  "components":[{"featureKey":"resume.library","role":"INCLUDED","name":"Resume library","allowanceOverride":25,"unit":"resumes","limitKey":"resumes.max","aiBudgetCents":0},
                {"featureKey":"ai.credits_extra","role":"OPTIONAL","productId":77,"maxQuantity":4,"prices":[{"interval":"MONTH","amountMinor":499,"marginBp":8216,"ok":true}],"componentDiscountBp":null}],
  "presets":[{"key":"POWER_USER","name":"Power user","addons":[{"featureKey":"ai.credits_extra","quantity":2}]}],
  "seatRules":null, "snapshotHash":null, "effectiveFrom":null, "updatedAt":"…", "updatedBy":"jk" }
// PlanPreviewDTO (server-computed; the web renders it)
{ "interval":"MONTH", "currency":"USD",
  "baseMinor":1999, "includedAiCapCents":300,
  "optional":[{"featureKey":"ai.credits_extra","unitMinor":499,"maxQuantity":4,"marginBp":8216,"ok":true,"levers":{...}}],
  "worstCase":{"totalMinor":3594,"aiCents":600,"feeMinor":134,"marginBp":7960,"ok":false,"levers":{"minPriceMinor":{"ai.credits_extra":549}}},
  "annual": {"enabled":false} | {"enabled":true,"discountBp":1000,"baseYearMinor":21589,"monthlyEquivalentMinor":1799,"savingsMinor":2399,"checks":[…]},
  "seats": null | {"seatBaseMinor":1499,"presets":[{"key":"RESUME_AI_SUPPORT","seatTotalMinor":2896,"aboveIndividualOk":true}],"roster":{"lines":[…],"orgRecurringMinor":7992,"setupFeeMinor":49900}},
  "checks":[{"id":"deps","ok":true},{"id":"prices","ok":true},{"id":"margin","ok":false,"failing":[{"featureKey":"…","interval":"MONTH","marginBp":7960,"floorBp":8000}]}],
  "impact":{"subscribersByVersion":{"2":1038,"1":212},"grandfathered":true,"newSignupsFrom":"2026-10-20T00:00:00Z","catalogVersionAfter":18,"stripeObjectsToCreate":[{"kind":"price","productCode":"FEAT_AI_CREDITS","interval":"QUARTER"}]} }
```

## 2. Public catalog (no auth)
| Method & path | Response | Notes |
|---|---|---|
| `GET /api/catalog/public?audience=INDIVIDUAL&country=DE` | `{catalogVersion, currency, intervals[], annualEnabled, plans:[{planKey, name, badge, description, public, intervals[], prices{MONTH:{amountMinor}, QUARTER:{…}, YEAR?:{amountMinor, monthlyEquivalentMinor, savingsMinor, savingsBp}}, included:[{featureKey,name,description,allowance,unit}], optional:[{featureKey,name,description,maxQuantity,prices{…}}], presets[], eligibility{verification?, countries?}, sunset:false}], totals:{PRO:{MONTH:{"ai.credits_extra:2":2997,…}}}, orgs:{plans:[{planKey, seatBase{…}, seatOptional[], setupFee{…}, intervals[]}]}}` | `Cache-Control: max-age=billing.public_catalog.cache_seconds`; only PUBLISHED + `public` + effective now; drafts and SUNSET never appear; `totals` precomputed for ≤ `billing.plan.max_optional_addons` add-ons at quantity 1–2 |
| `GET /api/catalog/public/plans/{planKey}` | one plan | `404` for non-public |

## 3. Personal billing (authenticated, personal accounts only — enterprise token → `404`)

### 3.1 Quotes
| Method & path | Body | Response / errors |
|---|---|---|
| `POST /api/billing/quotes` | `{kind: CHECKOUT\|CHANGE, planKey?, interval?, addons:[{featureKey, quantity}], promoCode?, anonymous?: true}`; CHANGE infers plan/interval from the subscription unless given | 200 `PlanQuoteDTO` (§3.2); `422 ADDON_NOT_IN_PLAN {featureKey}`, `422 QUANTITY_LIMIT {max}`, `422 INTERVAL_NOT_AVAILABLE`, `422 DEPENDENCY_UNCONFIRMED`, `409 ALREADY_SUBSCRIBED` (CHECKOUT with a live subscription), `410 PLAN_SUNSET {successor}`, `422 PROMO_INVALID`, `503 BILLING_DISABLED` is **not** raised here (quotes work without Stripe) |
| `GET /api/billing/quotes/{id}` | | 200 / `404` (not the caller's) / `410 QUOTE_EXPIRED` |
| `POST /api/billing/quotes/{id}/checkout` | `{returnTo?}` | 200 `{url}` (Stripe Checkout); `409 QUOTE_STALE {reason}`, `410 QUOTE_EXPIRED`, `409 ALREADY_SUBSCRIBED`, `503 BILLING_DISABLED`, `403` demo |
| `POST /api/billing/quotes/{id}/confirm` (`Idempotency-Key` required) | `{confirmedCommercialDeps?: []}` | 200 `ChangeBatchDTO{batchId, changes[{kind, featureKey, quantityFrom, quantityTo, effectiveAt, prorationMinor, status}], proposedRecurringMinor, nextInvoiceAt}`; `409 QUOTE_STALE`, `410 QUOTE_EXPIRED`, `400 IDEMPOTENCY_KEY_REQUIRED`, `409 CANCEL_PENDING` (resume first), `503 BILLING_DISABLED` |
| `DELETE /api/billing/changes/{changeId}` | | cancel a PENDING scheduled removal/downgrade → 200; `409 NOT_PENDING` |

### 3.2 `PlanQuoteDTO`
```jsonc
{ "quoteId": 901, "kind":"CHANGE", "status":"OPEN", "createdAt":"…", "expiresAt":"…", "currency":"USD", "catalogVersion":17,
  "plan":{"planKey":"PRO","version":2,"name":"Pro"}, "interval":"MONTH", "intervalChange":null | {"from":"MONTH","to":"YEAR","effectiveAt":"period end"},
  "current":{"lines":[{"featureKey":null,"kind":"BASE","name":"Pro","quantity":1,"unitListMinor":1999,"unitEffectiveMinor":1999},{"featureKey":"ai.credits_extra","kind":"ADDON","quantity":2,"unitListMinor":499,"unitEffectiveMinor":499}],"recurringMinor":2997},
  "proposed":{"lines":[…],"recurringMinor":2498,"monthlyEquivalentMinor":2498,"savingsMinor":0,"savingsBp":0},
  "deltaMinor":-499, "additions":[], "removals":[{"featureKey":"ai.credits_extra","quantityFrom":2,"quantityTo":1,"effectiveAt":"2026-11-15T00:00:00Z","note":"works until Nov 15 · no refund"}],
  "requiresConfirmation":[], "autoAdded":[],
  "prorationEstimateMinor":0, "nextInvoiceEstimateMinor":2498, "nextInvoiceAt":"2026-11-15T00:00:00Z", "effectiveAt":"now",
  "taxEstimateMinor":null, "taxSource":"NONE", "taxNote":"Taxes are calculated by Stripe at invoice time where applicable.",
  "aiBudgetPct":null, "promo":null | {"code":"X","description":"…","appliesTo":["BASE"]}, "warnings":[], "inputsHash":"…" }
```

### 3.3 Plan read (v3, superset of today's `PlanDTO`)
`GET /api/billing/me` → `{plan:"PRO", status, currentPeriodEnd, cancelAtPeriodEnd, billingEnabled, hasCustomer,` **+** `planKey, planVersion, planName, interval, currency, currentPeriodStart, recurringMinor, addons:[{featureKey, name, quantity, unitMinor, endsAt?}], features:[…], limits:{…}, usage:{aiPct, aiResetsAt, resumes:{used,max}, meters:[{featureKey, used, allowance, resetsAt}]}, scheduled:{kind, at, planKey?, interval?}?, pastDue:{attempt, nextAttemptAt}?, lapse:{at, from}?, sunset:{successorPlanKey}?, firstPaidAt}`.
`GET /api/billing/invoices` → `[{number, status, amountPaidMinor, currency, periodStart, periodEnd, paidAt, hostedUrl, pdfUrl, lines:[{kind, description, quantity, unitAmountMinor, amountMinor, proration}]}]` (≤ 36).
`POST /api/billing/checkout {plan: monthly|3mo}` → alias: builds a CHECKOUT quote for PRO at that interval and returns `{url}` (one release).
`GET /api/profile/version` → `{version, plan, features[], limits{}, aiPct, periodEnd, account}` (additive).

### 3.4 Entitlements
`GET /api/entitlements/me` → `EntitlementSetDTO{planKey, planVersion, interval, periodStart, periodEnd, features:[{featureKey, name, source, quantity, allowance, used, remaining, resetsAt, limits[]}], capabilities[], limits{}, aiPct, state}` (personal; org members use `GET /api/orgs/{orgId}/members/{memberId}/entitlements`, 20 §7). `GET /api/entitlements/check?feature=` → `{allowed, reasonCode, details, upgrade?}` (no reservation; for UI hints).

## 4. Organization plan (tenant; `@OrgPermissionRequired`)
| Method & path | Permission | Body / response |
|---|---|---|
| `GET /api/orgs/{orgId}/plan` | `billing.view` | `{planKey, version, name, interval, currency, setupFee{paid, paidAt, amountMinor}, platformFee{amountMinor}?, seatBase{featureKey, unitListMinor, unitEffectiveMinor}, seatOptional:[{featureKey, name, unitListMinor, unitEffectiveMinor, allowance, dependencies[]}], presets[], intervalsAvailable[], annual:{enabled, discountBp, monthlyEquivalentMinor?, savingsMinor?}, newerVersion:{version, summary}?, sunset?}` |
| `POST /api/orgs/{orgId}/plan/quotes` | `billing.manage` | `{op: CHANGE_INTERVAL\|MIGRATE_VERSION, interval?, targetVersion?}` → `LicenseQuoteDTO` (BULK) with `intervalChange`/`versionChange`; same errors as 20 §7 |
| `POST /api/orgs/{orgId}/licenses/quotes` | `licenses.manage` | **exists (20 §7)**; `QuoteLine.op` gains `TRANSFER {licenseId, targetMemberId}`; `GET …/licenses/catalog` returns only the plan version's SEAT components |
| `GET /api/orgs/{orgId}/licenses/matrix?teamId=&page=` | `licenses.view` | `{components[], rows:[{member, licenseId?, cells:{featureKey: ON\|OFF\|PENDING_REMOVE\|PENDING_ADD}, seatTotalMinor}], totals{featureKey: {count, lineMinor}}, orgRecurringMinor}` |
All routes join the `OrgIsolationIT` coverage registry; 404 for outsiders.

## 5. Error code registry (new codes only; existing ones unchanged)
`PLAN_KEY_EXISTS` 409 · `PLAN_PRICE_MISSING` 422 · `PLAN_DEPENDENCY_MISSING` 422 · `ROLE_INVALID_FOR_AUDIENCE` 422 · `DUPLICATE_COMPONENT` 422 · `INTERVAL_NOT_ENABLED` 422 · `INTERVAL_NOT_AVAILABLE` 422 · `NOT_DRAFT` 409 · `DRAFT_EXISTS` 409 · `VERSION_CONFLICT` 409 · `CONFIRM_MISMATCH` 412 · `PLAN_SUNSET` 410 · `SUCCESSOR_REQUIRED` 422 · `SUCCESSOR_NOT_PUBLISHED` 409 · `PRICE_INCREASE_REQUIRES_DECISION` 422 · `SERVICE_IN_LIVE_PLAN` 409 · `LAST_ACTIVE_PRICE_IN_LIVE_PLAN` 409 · `ADDON_NOT_IN_PLAN` 422 · `PROMO_INVALID` 422 · `CANCEL_PENDING` 409 · `NOT_PENDING` 409 · `PLAN_REQUIRED` 402 · `PRICE_ACTIVE_EXISTS` 409. Existing: `MARGIN_BELOW_FLOOR`, `QUOTE_STALE`, `QUOTE_EXPIRED`, `DEPENDENCY_*`, `QUANTITY_LIMIT`, `CURRENCY_MISMATCH`, `ALREADY_SUBSCRIBED`, `BILLING_DISABLED`, `PRO_REQUIRED`, `RESUME_LIMIT`, `FEATURE_*`, `SUBSCRIPTION_STATE`, `STRIPE_ITEM_LIMIT`.

## 6. Idempotency summary
| Write | Key |
|---|---|
| publish plan version | `Idempotency-Key` header; server key `plan-publish-{planKey}-{v}` |
| Stripe product / price create | `prod-{code}` / `price-{rowId}` |
| checkout session | `co-{quoteId}` |
| confirm change | header → `personal_subscription_change.batch_id`; Stripe `sc-{batchId}-items`, `sc-{changeId}-pro`, `sc-{batchId}-schedule` |
| org quote confirm | 20 §4 rule 8 (`lc-{…}` keys) |
| migration run | `mig-{migrationId}-{subscriptionId}` per subscriber |

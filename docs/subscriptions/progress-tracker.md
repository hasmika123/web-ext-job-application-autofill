# Subscription Module — progress tracker

> Statuses: **Not Started → In Progress → Code Complete → Testing → Completed / Blocked** (requirements §30).
> Keep this file and `docs/roadmap/areas/sub.json` in sync on every transition (`node docs/roadmap/build-master-roadmap.mjs --set K1.1=in_progress`
> edits the JSON and regenerates the HTML; then update the row here with the commit SHA and the test names).
> Every Completed row must reference actual code and tests. Design docs: `README.md` in this folder.
> Last update: 2026-10-16 (customer web stream, branch sub-web-customer: K5.1, K5.3 web, K5.5, K9.4 done, K5.6 web half; catalog stream: K3.4, K1.1 to K1.4, K2.1 built on branch sub-catalog; BillingSchemaIT fails after the 15th of any month for a reason that predates this branch: BillingDemoSeeder makes the current month invoice due on day 15 and the test expects one overdue invoice).

## Phase gates
| Phase | Gate | Status |
|---|---|---|
| S0 Foundations | additive changelogs on a prod-like dump; legacy readers byte-identical; price ids reused | Not Started |
| S1 Resolver in shadow | ShadowCompareTest green + zero prod mismatches over one release; shadow flipped; features on /version | Code complete (branch sub-resolver2); the one-release wait and the flip remain |
| S2 Plans and builder (incl. annual rows K9.1, K9.3) | PRO v2 + AUTOPILOT v1 published from admin with monthly, quarterly and yearly prices; env-var prices deleted | Not Started |
| S3 Individual add-ons and annual UX (K9.2, K9.4, K9.6) | credits bought yearly and removed end to end; interval switch; harness green; zero drift for a week; tax mode decided (S-09) | Not Started |
| S4 Retirement lifecycle | scenario R in CI and test account; NoEarlyLossIT green; default retire-to-Free | Not Started |
| S5 Enterprise plan layer and org annual (K9.5) | E2E-C with seats from the plan version on monthly and yearly terms; transfer and switch-all | Not Started — waits on X5.4 / X6.12 |

## Decisions
**Answered (user, 2026-10-15):** S-01 annual ON · S-03 no existing subscribers · S-17 · S-19 Free + read-only lock · S-20 retire-to-Free default.
**Open and able to pause a story:** S-09 tax mode before the first yearly invoice (K9.6 self-check) · S-11 fee model (K3.2 default SIMPLE) · S-21 alternative retirement outcomes (K10.9). Full table: `decisions-for-user.md`.
**`CLAUDE.md` amendment for S-01** is applied (commit bfc1adac, 2026-10-15).

## Stories
| id | title (short) | status | owner | commit | tests | notes |
|---|---|---|---|---|---|---|
| K1.1 | Widen feature_definition/product + services API | Completed | API | 31338bd9 | ServiceServiceTest (8), AdminCatalogServicesResourceIT (5), LiquibaseAdditiveTest (3), BillingSchemaIT (pre-existing day-of-month failure, see header) | catalog_change created here; ROLE_ADMIN only (B-07) |
| K1.2 | Doc-21 tables if absent + dependency editor | Completed | API | fccd204e | FeatureDependencyTest (6), CatalogTablesPreconditionIT (2, both orders), AdminCatalogRulesResourceIT (5) | shared with X5.2; tables in 20261101011000_sub_catalog_doc21.xml; X5.2 must guard its createTable (B-09) |
| K1.3 | product_price + catalog_publish/change + CatalogService | Completed | API | 1030e53e | CatalogResourceIT (10) | supersedes B1.1/A3.1 table half; no Stripe object until K1.5 (PriceStripeSync seam); future-dated publish via CatalogActivationJob |
| K1.4 | Seed individual services (no prices) + FeatureKeys test | Completed | API | 5dc1f895 | FeatureKeyRegistryTest (6), CatalogSeedIT (5) | dependency graph + limits + presets seeded here, not in K1.2 |
| K1.5 | Stripe product/price at publish + CatalogReconcileJob | Completed | API | 1b52a491 | CatalogStripePublisherTest (6), CatalogReconcilerTest (5), StripeGatewayListPricesTest (3) | silent with a blank key (P-02); wiring b2805aa7: AdminCatalogMarginResourceIT (5) |
| K1.6 | Re-home hard-coded config | Not Started | API | | | last in S2 |
| K2.1 | plan tables + seeds + subscription backfill | Completed | API | 1fbb1dde | PlanSeedTest (6), PlanSeedIT (6), SubscriptionBackfillIT (3), LegacyReadersUnchangedIT (3), BillingResourceIT/BillingWebhookIT/EntitlementServiceTest unchanged | no price rows: only FREE v1 PUBLISHED (B-01); backfill non-strict by default (B-02) |
| K2.2 | PlanService invariants + publish | Completed | API | 304b3c78 | PlanPublishIT (23), PlanPublishStripeIT (4), PlanSnapshotTest (4) | integrity job skips seed snapshots (P-16) |
| K2.3 | PlanPreviewDTO | Completed | API | 80211c4e | PlanPreviewIT (6) | roster G1 = 7992 |
| K2.4 | Grandfathering invariants + PlanRetireGuard | Completed | API | 331518df | GrandfatherIT (4) | version-migration primitive FUTURE (S-03); retire/archive service-only (P-14) |
| K2.5 | Admin plans API | Completed | API | bf49b805 | AdminPlansResourceIT (7), OpenApiContractIT | api/openapi.json regenerated |
| K3.1 | PricingEngine v2 + golden S1 | Completed | API | cf2f93aa | MinorTest, PricingEngineGoldenTest (S1-S3, G1-G14), PricingEnginePropertyTest, PricingArchTest, AnnualDerivationTest, DependencyRulesTest | pure engine in service/pricing; CatalogPort adapter and PricingInputsLoader wired by the coordinator |
| K3.2 | MarginCalculator v2 + levers | Completed | API | fdd7602b | MarginCalculatorTest, MarginGuardCompositionTest, FeeModelSettingsTest | calculator only (no route yet: GET /api/admin/catalog/margin and fee-model are separate wiring); levers exact, see decisions E-1..E-4 |
| K3.3 | Personal QuoteService | Completed | API | d161e58a | PersonalQuoteIT (9), PersonalBillingSettingKeysTest (3) | CHECKOUT, CHANGE, ANONYMOUS; promo codes refused (P-1); the catalog adapter is the plans stream's, ITs use an in-memory double |
| K3.4 | Settings registry keys | Completed | API | 2cdef444 | BillingSettingKeysTest (7); SettingDefinitionsTest, SettingsServiceTest unchanged and green | first in S0; BillingSettingKeys; 03 section 2 + 08 section 7 parity test; out-of-bounds stays 400 (B-06) |
| K4.1 | Plans list page | Not Started | Web | | | |
| K4.2 | Plan editor | Not Started | Web | | | |
| K4.3 | Preview pane | Not Started | Web | | | |
| K4.4 | Publish flow | Not Started | Web | | | |
| K4.5 | Compare / subscribers / migration sheet | Not Started | Web | | | |
| K4.6 | Org plan editor | Not Started | Web | | | |
| K4.7 | Fixtures + Playwright admin-plans | Not Started | Web | | | |
| K5.1 | Public catalog + /pricing from it | Completed | API, Web | c0db3ca7 (API), a6b8c161 (web) | CatalogPublicIT (8), OpenApiContractIT, CatalogPricing.test (9), subscription.test (13) | branch sub-web-customer; lib/catalog.ts + prices.ts kept as the fallback when the catalog has no sellable plan (not deleted); supersedes B1.5 |
| K5.2 | subscription_addon + change tables; webhook | Completed | API | 8a8e0384 | AddonCheckoutIT webhook cases, PersonalAddonWritersTest (2) | live_seq is NULL when closed (P-9); the mirror ignores non-catalog prices |
| K5.3 | Checkout from a quote | Completed | API, Web | 89d17949 (API), a1b23010 (web) | AddonCheckoutIT (7), BillingResourceIT unchanged (13), ReviewSheet.test (2), CatalogPricing.test review-sheet cases | web half: review sheet, success page with add-ons, /billing/cancelled (set STRIPE_CANCEL_URL to it; the default /pricing still works) |
| K5.4 | Change flow + applier + retry | Completed | API | 8baf7871 | AddonChangeIT (10) | retry job + settle; undo is Stripe-first (P-3) |
| K5.5 | My plan page | Completed | Web | b0f2197e, 657c2aa7 | MyPlan.test (8), plan-state.test (7) | /settings/plan; sunset banner renders only if GET /api/billing/me sends `sunset` (it does not yet) |
| K5.6 | Plan / interval switch | In Progress | API, Web | b0f2197e (web) | MyPlan.test switch cases | web half done (interval tabs, switch sheet, S-04 sentences) and mocked in web/scripts/mock-billing.mjs; API half NOT built: a CHANGE quote with another planKey or interval answers 422 PLAN_SWITCH_UNSUPPORTED (PersonalQuoteService.resolveChange), the page explains it |
| K5.7 | PlanDTO v3, invoices, entitlements/me | Completed | API | c5051619 | PersonalEntitlementsIT (3), PersonalInvoiceServiceTest (4), LegacyReadersUnchangedIT (3, six-key compare) | source of entitlements/me is provisional until K7.1; invoices read the mirror port (K8.3) else Stripe |
| K5.8 | Playwright pricing-addons + lint | Not Started | Web | | | |
| K6.1 | Enterprise links + org plan read | Not Started | API | | | waits on X5.4/X6.12 |
| K6.2 | Seat TRANSFER | Not Started | API | | | |
| K6.3 | Org interval/version quotes | Not Started | API | | | |
| K6.4 | Org plan card | Not Started | Web | | | |
| K6.5 | Seat matrix + bulk transfer | Not Started | API, Web | | | |
| K6.6 | QuoteSummary / invoice line extensions | Not Started | Web, API | | | |
| K7.1 | PlanResolver + EntitlementSet + shadow | Completed | API | 88879ed7 | PlanResolverTest (18), GrantWriterGuardTest (3), EntitlementServiceShadowTest (8), EntitlementServiceTest unchanged (14) | pure core + PlanResolver; shadow on by default; sub_resolver changelog holds all resolver-stream tables |
| K7.2 | AI budget window from the set | Completed | API | 0801ec55 | AiBudgetPeriodTest (5), AiBudgetServiceTest unchanged (26) | legacy window decides while shadowed; ai_call feature columns written on both paths |
| K7.3 | Migrate 14 call sites | Completed | API | c0da177c | AtsScoreServiceTest, InboxServiceTest, InboxServiceViaOrgTest, InboxEntitlementTest (stub renames only), BillingResourceIT, BillingWebhookIT | @RequiresFeature/AuthzCoverageTest not built (R-2) |
| K7.4 | features[] on /version + extension | Completed | API, Ext | e01e0677 | ProfileVersionWorkspacesTest (8), ProfileResourceIT (11), OpenApiContractIT | API half only; extension half open |
| K7.5 | Personal usage ledger | Completed | API | 97117c49 | UsageLedgerPersonalTest (8), AllowanceResolverTest (4), UsageSweeperJobTest (1) | no caller reserves yet (R-7) |
| K7.6 | PLAN_REQUIRED upgrade object + UpgradeSheet | Not Started | API, Web | | | |
| K7.7 | Regression gate | Completed | API | 6df1b6ae | ShadowCompareTest (2), PlanResolverTest no-leak test, LegacyReadersUnchangedIT (3) | flip checklist in README; IT form of E13/E14 waits on K5.2 (R-8) |
| K8.1 | Webhook scope router | Completed | API | 5840f3f6 | BillingScopeRouterTest (5), BillingWebhookIT unchanged (17) | account-kind guards + webhook routing; UserBillingHandler moved unchanged; OrgBillingWebhookHandler no-op seam; stripe_event.scope/org_id (replayed_* deferred to K8.5) |
| K8.2 | StripeGateway growth | Completed | API | ea3e4762 | StripeGatewayImplTest (12), StripeWebhookEventParseTest (4) | shared with X6.6: org-only methods (createOrgCustomer, coupons, createInvoiceForPrices, refunds) still X6.6 |
| K8.3 | Personal invoice mirror | Completed | API | bc26b990 | InvoiceMapperTest (3), InvoiceMirrorTest (7), BillingWebhookIT (17) | owns invoice/invoice_line; K5.7 reads them |
| K8.4 | No-data migration + runbook (S-03) | Completed | API | 9698e284 | BackfillPeriodStartJobTest (4), CatalogSeedIT, PlanSeedIT, SubscriptionBackfillIT | runbook in README; no PRO price rows (R-9) |
| K8.5 | Personal reconciler + replay | Not Started | API | | | |
| K8.6 | FakeStripeGateway harness + runbook P | Not Started | API | | | human step: test clocks |
| K8.7 | Billing-disabled parity | Not Started | API, Web | | | |
| K9.1 | YEAR rows + guard + golden S2/S3 | Completed | API | da26e84c, 304b3c78 | AnnualPriceDeriverTest (5), PlanPublishIT yearly cases | derived rows at plan publish under the guard |
| K9.2 | Annual proration / term rules (personal) | Not Started | API | | | phase S3 |
| K9.3 | Monthly sub-windows on annual | Not Started | API | | | phase S2 |
| K9.4 | Annual customer UX | Completed | Web | a6b8c161, 657c2aa7 | CatalogPricing.test (yearly tab, hide when off), ReviewSheet.test (yearly variant), MyPlan.test (interval sentence) | Yearly tab, "billed once a year / about x per month / save y" from DTO fields, S-04 term-end sentences; Playwright fixtures: MOCK_ANNUAL=0 toggles the mock |
| K9.5 | Org annual | Not Started | API, Web | | | phase S5 |
| K9.6 | Annual operations runbook + self-check | Not Started | API | | | phase S3; S-09 tax mode |
| K10.1 | Retirement model + states + effective dates | Not Started | API | | | |
| K10.2 | SuccessorAdvisor | Not Started | API | | | |
| K10.3 | Notice schedule + copy | Not Started | API | | | |
| K10.4 | Subscriber choices API | Not Started | API | | | |
| K10.5 | RetirementJob: Free fallback + locks | Not Started | API | | | S-19 answered |
| K10.6 | Read-only lock evaluation | Not Started | API | | | |
| K10.7 | Enterprise retirement | Not Started | API, Web | | | after K6 |
| K10.8 | Stripe mechanics for retirements | Not Started | API | | | |
| K10.9 | Admin retirement wizard + progress | Not Started | Web | | | |
| K10.10 | Customer "plan is changing" + lock UX | Not Started | Web, Ext | | | version bump |
| K10.11 | Retirement regression gate | Not Started | API, Web | | | |

## Log
- 2026-10-15 — Fable: design complete (`docs/subscriptions/01`–`11`, `decisions-for-user.md`); area `sub` (prefix K, 67 stories) added to the master roadmap; nothing built.
- 2026-10-15 — Fable: user decisions applied — S-01 annual ON (K9 into phases S2/S3/S5), S-03 no existing subscribers (K8.4 no-data migration, K2.4 primitive FUTURE, shadow gate test-based), S-20 retire-to-Free default (K10.1/K10.9). `CLAUDE.md` amendment left for the user's session.
- 2026-10-16 - resolver stream (sub-resolver2): K7.1 to K7.5, K7.7, K8.3, K8.4 built; shadow stays on; open questions R-1 to R-9 in decisions-for-user.md.
- 2026-10-16 - sub-addons2: K3.3, K5.2, K5.4, K5.7 done and the K5.3 API half done (quotes, add-on tables and webhook mirror, confirm/applier/undo, PlanDTO v3, invoices, entitlements/me, checkout from a quote); open items P-1..P-11 in decisions-for-user.md.

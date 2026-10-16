# Subscription Module — progress tracker

> Statuses: **Not Started → In Progress → Code Complete → Testing → Completed / Blocked** (requirements §30).
> Keep this file and `docs/roadmap/areas/sub.json` in sync on every transition (`node docs/roadmap/build-master-roadmap.mjs --set K1.1=in_progress`
> edits the JSON and regenerates the HTML; then update the row here with the commit SHA and the test names).
> Every Completed row must reference actual code and tests. Design docs: `README.md` in this folder.
> Last update: 2026-10-16 (catalog stream: K3.4, K1.1 to K1.4, K2.1 built on branch sub-catalog; BillingSchemaIT fails after the 15th of any month for a reason that predates this branch: BillingDemoSeeder makes the current month invoice due on day 15 and the test expects one overdue invoice).

## Phase gates
| Phase | Gate | Status |
|---|---|---|
| S0 Foundations | additive changelogs on a prod-like dump; legacy readers byte-identical; price ids reused | Not Started |
| S1 Resolver in shadow | ShadowCompareTest green + zero prod mismatches over one release; shadow flipped; features on /version | Not Started |
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
| K1.5 | Stripe product/price at publish + CatalogReconcileJob | Not Started | API | | | |
| K1.6 | Re-home hard-coded config | Not Started | API | | | last in S2 |
| K2.1 | plan tables + seeds + subscription backfill | Completed | API | 1fbb1dde | PlanSeedTest (6), PlanSeedIT (6), SubscriptionBackfillIT (3), LegacyReadersUnchangedIT (3), BillingResourceIT/BillingWebhookIT/EntitlementServiceTest unchanged | no price rows: only FREE v1 PUBLISHED (B-01); backfill non-strict by default (B-02) |
| K2.2 | PlanService invariants + publish | Not Started | API | | | |
| K2.3 | PlanPreviewDTO | Not Started | API | | | |
| K2.4 | Grandfathering invariants + PlanRetireGuard | Not Started | API | | | version-migration primitive FUTURE (S-03) |
| K2.5 | Admin plans API | Not Started | API | | | |
| K3.1 | PricingEngine v2 + golden S1 | Completed | API | cf2f93aa | MinorTest, PricingEngineGoldenTest (S1-S3, G1-G14), PricingEnginePropertyTest, PricingArchTest, AnnualDerivationTest, DependencyRulesTest | pure engine in service/pricing; CatalogPort adapter and PricingInputsLoader wired by the coordinator |
| K3.2 | MarginCalculator v2 + levers | Completed | API | fdd7602b | MarginCalculatorTest, MarginGuardCompositionTest, FeeModelSettingsTest | calculator only (no route yet: GET /api/admin/catalog/margin and fee-model are separate wiring); levers exact, see decisions E-1..E-4 |
| K3.3 | Personal QuoteService | Not Started | API | | | |
| K3.4 | Settings registry keys | Completed | API | 2cdef444 | BillingSettingKeysTest (7); SettingDefinitionsTest, SettingsServiceTest unchanged and green | first in S0; BillingSettingKeys; 03 section 2 + 08 section 7 parity test; out-of-bounds stays 400 (B-06) |
| K4.1 | Plans list page | Not Started | Web | | | |
| K4.2 | Plan editor | Not Started | Web | | | |
| K4.3 | Preview pane | Not Started | Web | | | |
| K4.4 | Publish flow | Not Started | Web | | | |
| K4.5 | Compare / subscribers / migration sheet | Not Started | Web | | | |
| K4.6 | Org plan editor | Not Started | Web | | | |
| K4.7 | Fixtures + Playwright admin-plans | Not Started | Web | | | |
| K5.1 | Public catalog + /pricing from it | Not Started | API, Web | | | supersedes B1.5 |
| K5.2 | subscription_addon + change tables; webhook | Not Started | API | | | |
| K5.3 | Checkout from a quote | Not Started | API, Web | | | |
| K5.4 | Change flow + applier + retry | Not Started | API | | | |
| K5.5 | My plan page | Not Started | Web | | | |
| K5.6 | Plan / interval switch | Not Started | API, Web | | | |
| K5.7 | PlanDTO v3, invoices, entitlements/me | Not Started | API | | | |
| K5.8 | Playwright pricing-addons + lint | Not Started | Web | | | |
| K6.1 | Enterprise links + org plan read | Not Started | API | | | waits on X5.4/X6.12 |
| K6.2 | Seat TRANSFER | Not Started | API | | | |
| K6.3 | Org interval/version quotes | Not Started | API | | | |
| K6.4 | Org plan card | Not Started | Web | | | |
| K6.5 | Seat matrix + bulk transfer | Not Started | API, Web | | | |
| K6.6 | QuoteSummary / invoice line extensions | Not Started | Web, API | | | |
| K7.1 | PlanResolver + EntitlementSet + shadow | Not Started | API | | | supersedes B1.2 |
| K7.2 | AI budget window from the set | Not Started | API | | | |
| K7.3 | Migrate 14 call sites | Not Started | API | | | |
| K7.4 | features[] on /version + extension | Not Started | API, Ext | | | version bump |
| K7.5 | Personal usage ledger | Not Started | API | | | |
| K7.6 | PLAN_REQUIRED upgrade object + UpgradeSheet | Not Started | API, Web | | | |
| K7.7 | Regression gate | Not Started | API | | | |
| K8.1 | Webhook scope router | Not Started | API | | | |
| K8.2 | StripeGateway growth | Not Started | API | | | shared with X6.6 |
| K8.3 | Personal invoice mirror | Not Started | API | | | |
| K8.4 | No-data migration + runbook (S-03) | Not Started | API | | | |
| K8.5 | Personal reconciler + replay | Not Started | API | | | |
| K8.6 | FakeStripeGateway harness + runbook P | Not Started | API | | | human step: test clocks |
| K8.7 | Billing-disabled parity | Not Started | API, Web | | | |
| K9.1 | YEAR rows + guard + golden S2/S3 | Not Started | API | | | phase S2 (S-01 ON) |
| K9.2 | Annual proration / term rules (personal) | Not Started | API | | | phase S3 |
| K9.3 | Monthly sub-windows on annual | Not Started | API | | | phase S2 |
| K9.4 | Annual customer UX | Not Started | Web | | | phase S3 |
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

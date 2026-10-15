# HANDOFF - Subscription foundation (X5), second machine, AFTER the resume builder

> Written 2026-10-15 for a Sonnet session on the SECOND machine. Start this ONLY when the coordinator tells you the resume
> builder branch (`ent-resume-builder-b`) is merged. Self-contained: read fully before touching code.
> Read first, in order: `CLAUDE.md` (Go-to-market and Organizations bullets, O4 separate accounts), then
> `docs/enterprise-v2/20-consultant-license-model.md`, `21-feature-catalog.md`, `22-pricing-calculation.md`,
> `23-contract-discounts.md`, `24-entitlements.md`, `25-usage-metering.md`, `29-personal-subscription-regression.md`, and the
> X5 stories in `docs/enterprise-v2/07-backlog.md` (X5.1 ... X5.16) plus the X5 rows in `progress-tracker.md`.

## 1. BRANCH RULES (read twice)

| Do | Don't |
|---|---|
| `git fetch origin` then `git switch -c ent-subscription-b origin/version2` (version2 must already contain the S5 account guards and the resume builder merge; check `git log origin/version2` for `ent-accounts: S5`) | Never commit to or push `version2`, `develop` or `main`. |
| Commit ONLY on **`ent-subscription-b`**, push often: `git push -u origin ent-subscription-b` | Never force-push; never `git stash` (use WIP commits); no pull requests (the coordinator merges). |
| Sync only when told: `git fetch origin && git merge origin/version2` | Don't edit login/identity code (`security/**`, `AuthenticateController`, `UserService` account creation) - another track owns it. |

Commits: `ent-subscription: X5.n <subject>`, each ending with the line `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## 2. Goal (user decision 2026-10-15)

Build the subscription FOUNDATION that serves BOTH individual and enterprise subscriptions with ONE engine: the catalog, the
pricing engine, and a single entitlement check (`EntitlementService.check/require` with a PERSONAL or ORG context). Personal
subscriptions (Free/Pro/Autopilot, live, Stripe) must behave EXACTLY as today (gate: `PersonalSubscriptionUnchangedIT`).
Enterprise accounts are separate from personal accounts (O4): an enterprise account never has a personal plan, a personal
account never gets an org license. Nothing is sellable until the platform admin publishes prices: the catalog ships WITHOUT prices.

## 3. Scope: the X5 foundation stories, in this order (one commit series each)

X5.1 catalog tables (product, product_price versions, product_entitlement, bundle items) -> X5.2 feature_definition + limits +
dependencies + license_preset (seed, no prices) -> X5.3 MarginCalculator (>= 80% gross margin worst case for every
subscription, >= 20% for services; BASE_LICENSE / FEATURE / ORG_MODULE) -> X5.5 PricingEngine (list -> contract -> one discount
-> volume tier -> effective, half-even rounding per currency) -> X5.7 usage_event ledger + usage_counter (reserve/commit/release,
idempotency keys, TTL) -> X5.6 `EntitlementService.check/require` with `EntitlementContext (PERSONAL | ORG)` and the 11-step
order of doc 24 (the only gate) -> X5.16 `@RequiresFeature(beneficiary = ...)` -> X5.8 migrate the eight `isPro()` callers to
`EntitlementService.require` with context-aware behaviour (personal unchanged) -> X5.9 `PersonalSubscriptionUnchangedIT` (the
12-step scenario in doc 29) + `WriterRegistryTest`. STOP after X5.9 and report. Later (do NOT start): X5.4 consultant licenses and
lifecycle, X5.11 org modules, X5.12 bulk operations, X5.13 admin Catalog page, X5.14 license lifecycle job, X5.15 contracts and
discounts, X5.10 E2E-C scenario, and all X6 (org billing, Stripe org subscription, Org Admin and platform pricing pages).
If a dependency listed in the backlog for one of your stories needs an unbuilt story (e.g. X5.6 wants licenses), build the smallest
seam (an interface plus a null/empty implementation) and document it; do not pull the later story in.

## 4. Rules that always apply

Additive Liquibase only (new changeset files registered in `master.xml`); everything admin-configured (settings registry /
catalog / flags, never hard-coded prices or limits; code ships safe defaults, admin decides); the catalog ships WITHOUT prices;
`EntitlementService` is the only entitlement source of truth (the 11-step order in doc 24); Stripe is the truth for billing and
only webhooks write the subscription mirror (do not touch Stripe code in X5); no sensitive PII; no secrets; tenant isolation:
org from the host, generic 404 for strangers, never 403; every new org-scoped route needs `OrgIsolationIT` COVERAGE rows
(`OrgIsolationIT` must stay 10/10, run once at the end, 15-25 min, `-x test`); `TechnicalStructureTest` must stay green.

## 5. Tests (all must pass before you finish)

`cd api && ./gradlew test --offline` (unit) and the integration tests for what you touch via
`./gradlew integrationTest -x test --offline --tests '*<IT>*'` (ITs are NOT picked up by `test`): at least the new X5 ITs,
`PersonalSubscriptionUnchangedIT`, the billing/Stripe ITs (grep `*Billing*IT`, `*Subscription*IT`, `*Entitlement*IT`),
`ConsultantInboxResourceIT`, `AccountResourceIT`, `OpenApiContractIT` (regenerate `api/openapi.json` if DTOs/routes change),
`TechnicalStructureTest`, then `OrgIsolationIT` once. Long commands: run in the background and read the log. Web changes (only if a
story needs them; X5.1-X5.9 are API-heavy): `cd web && npx vitest run <folders>` + `npx tsc --noEmit`.

## 6. Done when

X5.1 to X5.9 are implemented with tests green, committed and pushed on `ent-subscription-b`, and you have written a report as the
final message AND a committed file `docs/HANDOFF-ENT-SUBSCRIPTION-FOUNDATION-REPORT.md`: what changed (files and tables), test
counts, the seams left for later stories, any conflict with the spec, and what you would build next. Then stop and wait.

## 7. Context

* Decisions: O4 separate accounts; O5/O6 marketer visibility (queued AFTER this work; do not touch marketer code).
* Queue: account separation S5-S11 (coordinator machine), resume builder in org workspaces (you, before this), THIS foundation,
  then O6.
* If anything conflicts with a hard rule or the docs, write the question into the report instead of improvising.

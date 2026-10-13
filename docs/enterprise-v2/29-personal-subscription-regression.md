# 29 — Existing personal subscription: regression plan (`PersonalSubscriptionUnchangedIT`, scenario E)

> Status: design, 2026-10-12 (Session C, Fable). Implements ADR-018 and requirements §22/§32-E.
> Build-ready for **X5.9**. The gate is a CI job like `OrgIsolationIT`: it runs on every PR and any
> red means the enterprise change touched personal billing.

## 1. Invariants (each is an assertion, not a hope)
1. The `subscription` table is written **only** by `BillingWebhookService`'s personal path — before and after Phase 5/6. Proof: `WriterRegistryTest` scans the main source set for `SubscriptionRepository.save|delete` and asserts the only caller classes are `BillingWebhookService` and the existing erasure path.
2. `EntitlementService.isProFor/isPro/plan/requirePro` keep their signatures and produce identical results for the existing fixture matrix (`EntitlementServiceTest`, unchanged file, still green).
3. `GET /api/billing/me`, `POST /api/billing/checkout`, `POST /api/billing/portal`, `POST /api/billing/webhook` behave exactly as `BillingResourceIT`/`BillingWebhookIT` already assert (files unchanged).
4. Joining an org, receiving a license, using an org feature, losing the license and leaving the org **never change** a user's `subscription` row (byte-for-byte), their `PlanDTO`, or their `GET /api/profile/version.plan`.
5. In the PERSONAL context, `check()` never reads `consultant_license`/`license_feature`/`org_*`; in the ORG context it never reads `subscription` (Mockito `verifyNoInteractions` + a JPA statement inspector in the IT asserting no `FROM subscription` SQL).
6. A personal Stripe event (customer without `kiwiply_scope=org`) is routed to the personal handler only; an org event never calls `SubscriptionRepository`.
7. `AiBudgetService.decide(login, task)` for a personal user returns identical `Decision`s before/after (fixture table), and `ai_call` rows from personal calls have NULL `org_id`/`beneficiary_login`/`feature_key`.
8. Erasing an account still cancels the personal subscription immediately (existing behaviour) and ends org licenses now (new) — both asserted.

## 2. `PersonalSubscriptionUnchangedIT` (Testcontainers MySQL, Stripe disabled, flags on for `acme`)
Fixture: user `anika` with a mirrored personal `subscription` (`status=active`, `plan=PRO`, `current_period_end=+20d`, `stripe_customer_id=cus_p1`, `stripe_subscription_id=sub_p1`), org `acme` ACTIVE with a published draft catalog (21 §6 numbers), org `beta` ACTIVE.

| step | action | assertions |
|---|---|---|
| E0 | snapshot `subscription` row S0, `PlanDTO` P0, `/api/profile/version` V0 | — |
| E1 | anika joins acme (invite accept) with the CONSULTANT role | `subscription` == S0; `plan(anika)` == P0; no `license` rows yet |
| E2 | acme admin quotes + confirms BASE + `ai.job_matching` + `ai.resume_tailoring` for anika | `consultant_license` ACTIVE; `subscription` == S0; `GET /api/billing/me` as anika == P0; `GET /api/profile/version` == V0 (no `workspaces[]` until Phase 9 flag) |
| E3 | anika calls an org feature on acme's host (`POST /api/orgs/{acme}/consultants/{anika}/resumes/{r}/tailor`) | 200; `usage_event` committed with `org_id=acme`; `ai_call.org_id=acme, beneficiary_login=anika`; `subscription` == S0 |
| E4 | anika calls the same personal feature on kiwiply.com (`POST /api/resumes/{r}/tailor`) | gated by `isPro` → 200 as Pro; `ai_call.org_id` NULL; personal AI window used, org window untouched (`usage_event` count unchanged) |
| E5 | anika calls an org feature she is **not** licensed for (`interview.ai_prep`) on acme | 402 `FEATURE_NOT_LICENSED`; her personal Pro does **not** rescue it (no stacking) |
| E6 | anika calls `ai.resume_tailoring` on **beta** (member there, unlicensed) | 404 (`NOT_MEMBER` if not a member) or 402 `FEATURE_NOT_LICENSED` (if member): acme's license never applies at beta |
| E7 | acme removes both features (effective period end) then cancels the license; `LicenseLifecycleJob` runs with the clock at `period_end + 1s` | license ENDED; org feature → 402; `subscription` == S0; P0 unchanged |
| E8 | anika leaves acme | memberships ended; `subscription` == S0; `/api/profile/version` == V0 |
| E9 | personal webhook `customer.subscription.updated` (status `past_due`) for `sub_p1` | personal path applied as today (`BillingWebhookIT` expectations); zero `org_*` rows touched (row counts before/after) |
| E10 | org webhook `invoice.payment_failed` for acme's customer | acme PAST_DUE; anika's `subscription` row untouched; `plan(anika)` still Pro |
| E11 | Free user `dev` (no subscription row) licensed at acme with BASE + `interview.ai_prep` | org feature 200 at acme; personal `interview` feature 402 `PRO_REQUIRED` on kiwiply.com (org license never leaks into the personal workspace) |
| E12 | erase anika's account | personal subscription cancelled via `gateway.cancelSubscription` (existing); acme license ENDED(`MEMBER_ERASED`) now |

Every step asserts `subscription` equality with S0 by comparing all columns except `updated_at`
(which must also be unchanged — included). The IT also runs the existing personal suites in the same
Gradle task (`./gradlew test --tests '*PersonalSubscription*' --tests 'BillingResourceIT' --tests 'BillingWebhookIT' --tests 'EntitlementServiceTest'`), which the CI job `personal-billing-regression` requires.

## 3. Web and extension checks
- `web/e2e/personal-billing-unchanged.spec.ts` (mock): `/billing` page and `/pricing` render exactly as before for a personal Pro user who is also an acme consultant (snapshot of the plan card); no org wording appears on kiwiply.com personal pages.
- Extension: `job-autofill` tests unchanged; `sync.js checkAndPull` still reads `plan` from `/api/profile/version`; the `workspaces[]` field (Phase 9) is additive and ignored by older builds (a unit test feeds the new payload to the current parser).

## 4. Data guards
- Liquibase changesets of Phases 5–6 never touch `subscription`/`stripe_event` columns except the additive `stripe_event.org_id` (changelog review checklist + `LiquibaseAdditiveTest` that parses the XML and refuses `dropColumn|renameColumn|modifyDataType|dropTable`).
- `SubscriptionRepository` gains no new query methods in this programme (reviewed in PR).

## 5. Scenario E (requirements §32-E) — the manual/Playwright script for QA
1. Sign up `anika` on kiwiply.com, subscribe to Pro (test card) → `/billing` shows Pro.
2. Accept acme's invite (tenant host) → lands on the consultant workspace; `/billing` on kiwiply.com still shows Pro, no org wording.
3. Acme admin licenses her (E2E-C) → on acme's host "My Available Features" shows Base, AI Job Matching, AI Resume Tailoring; Interview Prep "Ask your admin".
4. On kiwiply.com: her Pro features behave as before; nothing mentions Acme; `/billing` unchanged; the Stripe test customer `cus_p1` has no new invoices.
5. Acme's Stripe customer has the org subscription with items; acme's invoice lists lines — never her personal plan.
6. Acme cancels her license → at period end her acme features stop; her Pro continues; she leaves acme → unchanged Pro.

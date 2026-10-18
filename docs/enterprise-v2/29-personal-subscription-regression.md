# 29 — Existing personal subscription: regression plan (`PersonalSubscriptionUnchangedIT`, scenario E)

> Status: design, 2026-10-12 (Session C, Fable). Implements ADR-018 and requirements §22/§32-E.
> Build-ready for **X5.9**. The gate is a CI job like `OrgIsolationIT`: it runs on every PR and any
> red means the enterprise change touched personal billing.

> **Two-world model (O4, 2026-10-14; `19-separate-enterprise-accounts.md`; scenario updated in S11).** Nobody "joins"
> an organization with a personal account any more. Anika keeps her personal account (`anika`, Pro) and, when Acme
> invites the same email, gets a **separate enterprise account** (`anika.acme`, `org_id = acme`, own password, never a
> `subscription` row). The regression is therefore: creating, licensing, using, offboarding and erasing the enterprise
> account must leave every personal row, plan and call exactly as it was, and neither account can see or use the
> other. "Never stacked" is now structural (an enterprise account has no plan; a personal plan grants nothing there).

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
Fixture: personal user `anika` (and, from E1, the enterprise account `anika.acme` for the same email) with a mirrored personal `subscription` (`status=active`, `plan=PRO`, `current_period_end=+20d`, `stripe_customer_id=cus_p1`, `stripe_subscription_id=sub_p1`), org `acme` ACTIVE with a published draft catalog (21 §6 numbers), org `beta` ACTIVE.

| step | action | assertions |
|---|---|---|
| E0 | snapshot `subscription` row S0, `PlanDTO` P0, `/api/profile/version` V0 | — |
| E1 | acme invites `anika`'s email with the CONSULTANT role; she accepts on `careers.acme.com` and chooses a new password | a new enterprise account `anika.acme` (`org_id = acme`) and its `org_member` exist; the personal `anika` row, `subscription` == S0, `plan(anika)` == P0; no `license` rows yet; the invite and the accept responses say nothing about a personal account (R7) |
| E2 | acme admin quotes + confirms BASE + `ai.job_matching` + `ai.resume_tailoring` for the enterprise account | `consultant_license` ACTIVE for `anika.acme`; `subscription` == S0; `GET /api/billing/me` as personal anika == P0; `GET /api/profile/version` as personal anika == V0 |
| E3 | `anika.acme` calls an org feature on acme's host (`POST /api/orgs/{acme}/consultants/{anika.acme}/resumes/{r}/tailor`) | 200; `usage_event` committed with `org_id=acme`; `ai_call.org_id=acme, beneficiary_login=anika.acme`; `subscription` == S0 |
| E4 | personal `anika` calls the same personal feature on kiwiply.com (`POST /api/resumes/{r}/tailor`) | gated by `isPro` → 200 as Pro; `ai_call.org_id` NULL; personal AI window used, org window untouched (`usage_event` count unchanged) |
| E5 | `anika.acme` calls an org feature she is **not** licensed for (`interview.ai_prep`) on acme | 402 `FEATURE_NOT_LICENSED`; `isPro(anika.acme)` is false: the personal Pro of the other account cannot rescue it |
| E6 | `anika.acme`'s token is sent to **beta**'s host, and the personal `anika` token to acme's host | `401 TOKEN_WRONG_WORLD` / `TOKEN_TENANT_MISMATCH` and `TOKEN_WRONG_WORLD`: no account reaches another world or organization; acme's license never applies at beta |
| E7 | acme removes both features (effective period end) then cancels the license; `LicenseLifecycleJob` runs with the clock at `period_end + 1s` | license ENDED; org feature → 402; `subscription` == S0; P0 unchanged |
| E8 | acme offboards `anika.acme` | membership LEFT, enterprise account disabled (login refused with the generic error), refresh tokens revoked; the personal `anika` can still sign in on kiwiply.com; `subscription` == S0; `/api/profile/version` == V0 |
| E9 | personal webhook `customer.subscription.updated` (status `past_due`) for `sub_p1` | personal path applied as today (`BillingWebhookIT` expectations); zero `org_*` rows touched (row counts before/after) |
| E10 | org webhook `invoice.payment_failed` for acme's customer | acme PAST_DUE; anika's `subscription` row untouched; `plan(anika)` still Pro |
| E11 | Free personal user `dev` (no subscription row) and an enterprise account `dev.acme` licensed with BASE + `interview.ai_prep` | org feature 200 for `dev.acme` at acme; personal `interview` feature 402 `PRO_REQUIRED` for personal `dev` on kiwiply.com (an org license never leaks into the personal world) |
| E12 | erase `anika.acme` (organization action), then erase personal `anika` (account deletion) | the first ENDs acme's license (`MEMBER_ERASED`) and leaves personal rows and the personal subscription untouched; the second cancels the personal subscription via `gateway.cancelSubscription` (existing) and touches no enterprise row |

Every step asserts `subscription` equality with S0 by comparing all columns except `updated_at`
(which must also be unchanged — included). The IT also runs the existing personal suites in the same
Gradle task (`./gradlew test --tests '*PersonalSubscription*' --tests 'BillingResourceIT' --tests 'BillingWebhookIT' --tests 'EntitlementServiceTest'`), which the CI job `personal-billing-regression` requires.

## 3. Web and extension checks
- `web/e2e/personal-billing-unchanged.spec.ts` (mock): `/billing` page and `/pricing` render exactly as before for a personal Pro user whose email also has an acme enterprise account (snapshot of the plan card); no org wording appears on kiwiply.com personal pages.
- Extension: `job-autofill` tests unchanged; `sync.js checkAndPull` still reads `plan` from `/api/profile/version`; the extension holds one account at a time (19 §6), so there is no `workspaces[]` field in the personal payload; the personal payload is byte-identical for a person who also has an enterprise account.

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

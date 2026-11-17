# Real consultant licences (B1 + B2): build plan

> 2026-11-10. **User decision: no money yet.** An admin gives or removes a consultant's licence and add-ons, and the change works at once. Nothing is
> billed. A price shows only when the organization has a contract price; otherwise the page says "Price not set — nothing is billed yet".
> Price quotes, confirm, Stripe and the period rollover come later and sit on top of the same writer (`LicenseChangeApplier` seam, DD-14).
> Design sources: `20-consultant-license-model.md`, `24-entitlements.md` §3 step 7 and §7, `25-usage-metering.md` §6, `deferred/org-billing-pages.md`.

## What exists
- **Tables:** `consultant_license` (keyed by `consultant_id`, `member_id` optional), `license_feature`, `license_change`, `feature_definition` (`ai_budget_cents`), and catalog `product` rows for the base licence and every add-on. No prices.
- **Readers:** `PlanResolver.resolveOrg`, `InboxEntitlement`, `PrepareBatchEntitlement`. Each one reads the licence tables itself.
- **Missing:** any writer outside the demo seeders. Enterprise AI ignores licences: `isPro` is false, only an admin override opens `AiBudgetService`, and `OrgResumePolicy.requireAiLicensed` always answers 402.
- **Permissions:** `licenses.view` and `licenses.manage` already exist.

## Slices (one commit each)

| # | Slice | What changes | Tests |
|---|---|---|---|
| L1 | **One licence reader** `OrgLicenseGate` | `has(orgId, consultantId, featureKey)`, `liveFeatures(...)`, `aiBudgetCents(...)` (Σ `ai_budget_cents` × quantity, or `ai_budget_override_cents`). Live = licence ACTIVE/CANCEL_AT_PERIOD_END in its dates, member ACTIVE, org ACTIVE/PAST_DUE, feature row live in its dates. `InboxEntitlement` and `PrepareBatchEntitlement` delegate to it. | gate unit matrix; existing inbox/prepare tests stay green |
| L2 | **AI for licensed enterprise consultants** | `AiBudgetService.window`: enterprise login → seat → licence AI budget, calendar-month window (the admin override still outranks it). `OrgResumePolicy.requireAiLicensed` + builder AI read the licence (`ai.resume_tailoring` / `resume.optimization`). ProfileResource keeps reading PRO from the budget. | budget window tests; 402 when unlicensed, OK when licensed |
| L3 | **Licence admin API** `OrgLicenseResource` | `GET /api/orgs/{orgId}/licenses` (rows), `/{id}`, `/{id}/history`, `/catalog` (base + add-ons, contract price or "not set"); `POST /licenses` (give a licence + add-ons), `POST /{id}/features`, `DELETE /{id}/features/{key}`, `POST /{id}/suspend`, `/reactivate`, `/end` (reason). Writes `license_change` APPLIED, amount 0 unless a contract price exists, audit `LICENSE_CHANGE`. One live licence per consultant. | `OrgLicenseServiceTest`, `OrgLicenseResourceIT` (Finance reads, cannot change; other org 404); `OrgIsolationIT` registry rows |
| L4 | **Consultant Licenses page** `/w/admin/licenses` | Table (consultant, marketer, add-on chips, status, price or "not set"), Configure sheet (toggle add-ons, suspend, end), empty state. Removes `licenses` from `ADMIN_NOT_BUILT`. The Consultants drawer's License dialog links here. | vitest page + sheet; mock fixture |
| L5 | **Loose ends** | A member who leaves or is removed has the licence ended now (offboarding hook). The consultant's My Features shows their real add-ons (on or off). The demo seeders write through the service. | offboarding test; features page test |

## Status (2026-11-10, branch `ent-licences`)

| Slice | State |
|---|---|
| L1 | done: `OrgLicenseGate`; the inbox and Prepare gates read through it |
| L2 | done: `EnterpriseLicenseAccess`; the AI budget of an enterprise account is its licence's AI add-ons, an admin override still outranks it; builder AI and tailoring and the builder config follow the licence |
| L3 | done: `OrgLicenseService` + `OrgLicenseResource` (`/api/orgs/{orgId}/licenses`), keyed by consultant id; registered in `OrgIsolationIT` |
| L4 | done: `/w/admin/licenses` (`LicensesPage`, Configure sheet), BFF, menu item for `licenses.view` without the billing module |
| L5 | done: `LicenseOffboardingHook` (step 500, end reason `MEMBER_LEFT`); My Features shows each card on or "Not in your plan" from the licence, and never shows uncounted credits. **Not done:** the demo seeders still write licence rows directly (they still work, because the gate reads the same rows) |

**What a new organization needs now:** an Org Admin opens Licenses, gives each consultant a licence, and switches on the add-ons. AI help
(`ai.resume_tailoring`, `resume.optimization`, `ai.job_matching`, `interview.ai_prep` and the other AI add-ons add their `ai_budget_cents` to
the consultant's monthly AI budget), the inbox (`inbox.monitoring`) and Autopilot prepare (`automation.approved_apply`, plus the org opt-in)
work at once. The demo's per-consultant admin AI-quota override is no longer needed.

## D1 + D7 (2026-11-17, branch `ent-ai-licence-usage`): AI for consultants, and real usage on My Features

**Decisions (user, 2026-11-15):** organization-paid AI is for **separate enterprise accounts only** (`ent#` logins; a personal login's AI is never
the organization's), and the licence's AI add-ons make **one pooled monthly budget** that every AI task draws from.

- **Refusal:** an enterprise account without AI on its licence gets 402 `FEATURE_NOT_LICENSED` ("AI help isn't part of your licence. Ask your
  organization's admin to add an AI add-on.", `canSelfServe: false`) from draft, job fit, resume match, tailoring and the builder AI
  (`ProRequiredException.forAi`). A personal account still gets `PRO_REQUIRED`. The extension shows the same advice: the drafting note,
  the job-fit message and the service worker's refusal.
- **Spend is the organization's:** every AI call of an enterprise account is written to the ledger as `usage_scope = ORG` with its `org_id`
  (`AiMeteringService.stamp`). `AiCallRepository.orgCostSince` sums it.
- **My Features:** no made-up allowance. AI Resume Tailoring counts `tailor` calls; Resume Optimization counts `fit`, `rewrite`, `summary` and
  `suggest` calls, both "this month, from your AI budget". Interview Prep is uncapped. A new `ai` block (`percentUsed`, `resetsAt`, `economy`)
  feeds an "AI budget this month" card, for enterprise accounts with a budget only.
- **Feature Usage:** `aiBudgetPercent` is the organization's AI spend this month against the sum of its consultants' AI budgets. A consultant
  signed in with a personal login shows no AI percent.
- **Tests:** `EnterpriseAiRefusalTest`, `ConsultantFeaturesServiceTest`, `OrgUsageReadServiceTest`, `ConsultantFeaturesResourceIT`; web
  `FeaturesPage`, `features`, `BillingPages`; extension `assist_picks`. Extension 0.74.0.
- **Left:** the demo organization still runs in shared mode, so its consultants keep the admin AI override (`web/scripts/demo-setup.mjs`).
  Moving it to separate accounts touches about 44 files that sign in as `demo-ent-acme-*`, so it is its own task.

## Not in this build
Price quotes, confirm and idempotency keys, Stripe, invoices, period rollover, bulk/CSV licence changes, org modules (marketer seat), the usage ledger and allowances.

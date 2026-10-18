# 37 — Entitlement hooks: every licensed feature the talent domain invokes

> Status: design, 2026-10-12 (Session D). ADR-021 (`EntitlementService.check(EntitlementRequest{context,
> actorLogin, beneficiaryLogin, featureKey, quantity, idempotencyKey}) → EntitlementDecision`), ADR-016
> (`usage_event` RESERVED→COMMITTED|RELEASED), 05 §2 (11 steps), 05 §6 (`@RequiresFeature(key,
> beneficiary = PATH_MEMBER|SELF, quantity)`). **Session C owns the service, the catalog rows, allowances
> and pool modes; this doc owns the call sites.** E3 answered 2026-10-12: base license + add-ons.
> Existing code: `AiBudgetService.decide(login, task)` → `AiRouter.generate` → `AiMeteringService.record(login, task, result)`;
> `EntitlementService.isPro/requirePro` (personal). Feature keys from `03-domain-model.md` §2.2 `feature_definition`.

## 1. The rule

Every operation below runs **one** `EntitlementService.check` (via `@RequiresFeature` on the handler or
an explicit call in the service for non-HTTP entry points) **before** the work and commits the
reservation after. Beneficiary = the consultant whose license pays, unless the table says the actor
pays their own. "Pool" = `feature_definition.pool_mode` default (E18: per consultant unless admin sets ORG_POOL).
AI calls additionally pass `AiCallContext(actorLogin, beneficiaryLogin, orgId, featureKey, usageEventId)`
to `AiRouter.generate(…, ctx)` so `ai_call` carries `beneficiary_login/org_id/feature_key/usage_event_id` —
the context, the overloads and the columns are **owned by X5.8** (24 §7, 09 row 11); X7.10/X8.3 consume them.
Feature keys and units below follow **21's catalog** (plural units; 09 row 9).

In the **personal** workspace nothing changes: the same services keep calling `AiBudgetService.decide`
with the user's own login (ADR-018). The org path is taken only when `TenantContext`/`X-Kiwiply-Workspace`
names an org and the handler is an org route.

## 2. Hook table

| # | operation (doc §) | feature key | actor | beneficiary | quantity / unit | where `check` runs | on deny |
|---|---|---|---|---|---|---|---|
| 1 | AI job matching for a consultant (31 §4, X8.3) | `ai.job_matching` | marketer (or SYSTEM nightly `OrgMatchJob`) | consultant | unit `matches`: a run **reserves** `enterprise.matching.batch_size` (default 20) and **commits** the scored count | `OrgMatchService.matchOne(orgId, memberId, actor)` explicit `check` (scheduler has no handler); handler `POST /consultants/{memberId}/matches/run` uses `@RequiresFeature("ai.job_matching", PATH_MEMBER)` | 402 `FEATURE_NOT_LICENSED` → UI chip "AI matching isn't on Anika's license · ask your admin" (admin deep-link to Configure License, Session C) |
| 2 | Rule-based matching / job discovery for a consultant (X8.2) | **none** (core, free, identical in all tiers per CLAUDE.md) | marketer | consultant | — | step 1–6, 9–10 only (`@OrgPermissionRequired(OPPORTUNITIES_MANAGE)`, act-for) | — |
| 3 | AI resume tailoring in act-for mode (30 §6, X7.5) | `ai.resume_tailoring` | marketer | consultant | 1 `tailorings` | `@RequiresFeature("ai.resume_tailoring", PATH_MEMBER)` on `POST …/resumes/{id}/ai/tailor`; CONSENT dependency → `org_feature_consent('consent.ai_tailoring')` via `ConsentGate` (step 10, 09 row 10) | 402 / 403 `CONSENT_REQUIRED` card |
| 4 | Consultant tailors their own resume inside the org workspace (self-service) | `ai.resume_tailoring` | consultant | consultant | 1 | existing `ResumeTailorService` path with `@RequiresFeature(..., SELF)` when in an org workspace; personal budget otherwise (ADR-018: "Pro via Acme" only inside the org workspace) | 402 → "Not on your Acme license" with the personal-plan alternative shown honestly |
| 5 | Resume optimization / rewrite / summary / suggest (builder AI) for a consultant | `resume.optimization` | marketer or consultant | consultant | 1 `operation` | `POST …/resumes/{id}/ai/{rewrite\|summary\|suggest}` `@RequiresFeature("resume.optimization", PATH_MEMBER\|SELF)` | 402 |
| 6 | Advanced versions (named checkpoints beyond the free retention, diff view history > N) | `resume.advanced_versions` | consultant / marketer | consultant | per feature definition (`limit`, not metered) | `ResumeDocVersionService` retention reads the allowance via `check(quantity=0)` (a *limit* check, no reservation) | silently falls back to the free retention; UI shows the cap |
| 7 | Marketing-assisted applications: assign opportunities, prepare packets (31 §4–5) | `marketing.assisted_applications` | marketer / AM | consultant | unit `preparations`: **1 per assigned match row** (a batch of N reserves N) and **1 per submission packet (DRAFT)**; 0 for record, follow-ups and reads (09 row 9) | `@RequiresFeature("marketing.assisted_applications", PATH_MEMBER, quantity = N)` on `POST /matches` (N = rows), `quantity = 1` on `POST /submissions`; `POST /submissions/{id}/record` and `pipeline_task` writes are `quantity = 0` access checks | 402 → the consultant cannot be marketed until licensed; the directory shows a "No marketing feature" chip |
| 8 | Inbox monitoring — the **consultant's** own inbox suggestions moving their applications (32 §4) | `inbox.monitoring` | consultant | consultant | 1 `connection` (limit) + AI classification calls as today | `InboxPoller`'s existing `isPro(login)` gate becomes `EntitlementService.check(SELF, "inbox.monitoring")` resolving personal **or** any org license that grants it (ADR-018 stacking rule: not stacked — the first ACTIVE grant wins; personal if present) | the existing NOT_PRO behaviour (poll skipped, status shown) |
| 9 | Inbox monitoring — the **marketer's** own inbox attribution to submissions (32 §4, D4) | **`module.talent_marketing`** (the org module's MODULE feature row, `ORG_POOL`; non-consultants never hold a consultant license — E3, 09 row 9) | marketer | the actor (usage booked to the org pool with `member_id = actor`) | AI calls when rules are ambiguous: 1 `operations` each | `MarketerInboxAttributionService` explicit `check(actor = beneficiary = marketer, "module.talent_marketing", 1)` | rules-only attribution continues; no AI |
| 10 | AI interview preparation (33 §6, X9.7) | `interview.ai_prep` | consultant | consultant | 1 `session` | `@RequiresFeature("interview.ai_prep", SELF)` on `POST /api/profile/interviews/{id}/prep` when the workspace header names the org; the marketer's `/prep/request` consumes nothing | 402 → "Ask Acme to add Interview Prep" + org-curated practice sets (free) |
| 11 | Advanced alerts (daily digest of pipeline changes for marketers; bench-aging alerts) (X8.6) | **`module.talent_marketing`** (as #9; `alerts.advanced` stays a per-*consultant* FEATURE for the consultant's own alerts) | marketer | the actor | limit (on/off; `check(quantity=0)`) | `FollowUpReminderJob` explicit `check(quantity=0)` per marketer against the module | basic in-app notifications only |
| 12 | Application analytics per consultant (X10.7 consultant-level rows) | `analytics.applications` — stays a **per-consultant FEATURE** (09 row 9) | admin / manager | consultant | limit | `check(quantity=0)` per consultant row | the row shows counts only |
| 12b | Org-wide analytics (X12.1) | **none** — gated by `flag.enterprise.analytics` (step 6), not by a license | admin / exec | — | — | step 6 `MODULE_OFF` | 404 on the report kind; nav hidden |
| 13 | Autopilot prepare for assigned jobs (X12.2) | `automation.approved_apply` | consultant (own extension) | consultant | per item: 1 `preparation`, caps 30/day · 300/period | `GET /api/autopilot/next` (prior art) with `@RequiresFeature(SELF)`; assigned items carry `match_id`; **stops before submit, attestation untouched** | 402 `AUTOPILOT_REQUIRED`/`AUTOPILOT_LIMIT` as designed |
| 14 | Requirement email-paste enrichment (34 §2) | **`module.talent_marketing`** (as #9) | AM | the actor | 1 `operations` | explicit `check` in `RequirementParser.enrich` | rules-only parse |
| 15 | Extra AI credits top-up consumed by any of 1, 3, 5, 10 | `ai.credits_extra` | — | consultant | drawn automatically by Session C's allowance resolver when the primary allowance is exhausted | inside `EntitlementService` (step 8) | 402 `FEATURE_ALLOWANCE_EXHAUSTED` |

Operations with **no** feature (free, core): directory, consultant profile overlay, org_resume links
and approval, viewing/downloading an approved resume under consent, assignments, workload, client/
requirement CRUD, submissions *without* marketing assistance? — no: recording a submission **is**
marketing assistance (#7). Interviews coordination, offers, placements, HR, Finance records: no
feature (modules gated by `flag.enterprise.marketing` / `flag.enterprise.hr_finance` at step 6 and by
the org's module entitlement that Session C defines as `org_module` rows).

## 3. Shape for Sonnet (one pattern everywhere)

```java
@OrgPermissionRequired(value = {SUBMISSIONS_PREPARE}, beneficiary = Beneficiary.PATH_MEMBER)
@RequiresFeature(value = "marketing.assisted_applications", beneficiary = Beneficiary.PATH_MEMBER, quantity = 1)
@PostMapping("/api/orgs/{orgId}/consultants/{memberId}/submissions")
public ResponseEntity<SubmissionDTO> create(@PathVariable Long orgId, @PathVariable Long memberId, @RequestBody SubmissionCreate body,
                                            @RequestAttribute(AuthzDecision.ATTRIBUTE) AuthzDecision authz) {
    SubmissionDTO dto = submissions.createDraft(authz, body);   // service commits authz.reservationId() on success
    return ResponseEntity.status(201).body(dto);
}
```
- Non-HTTP: `EntitlementDecision d = entitlements.check(EntitlementRequest.acting(ctx, actorLogin, beneficiaryLogin, "ai.job_matching", 1, idem));`
  `if (!d.allowed()) { log + return; }` … `entitlements.commit(d.reservationId())` / `release`.
- Idempotency keys: `"{featureKey}:{entityType}:{entityId}:{actorMemberId}:{yyyyMMddHH}"` for jobs; the
  request's `Idempotency-Key` header for handlers (required on POSTs that consume a feature).
- `AuthzCoverageTest` (05 §6) fails the build if an org handler references a feature key string
  without `@RequiresFeature` or an explicit `check`.

## 4. What Session C must provide (alignment list)
1. **Resolved (09 row 9): 21's catalog is authoritative.** Units are 21 §2.4's plurals (`matches`,
   `tailorings`, `optimizations`, `connections`, `sessions`, `preparations`, `operations`, `credits`, …);
   `pool_mode` default PER_CONSULTANT; `module.talent_marketing` has a MODULE row (`ORG_POOL`, `operations`)
   for #9/#11/#14.
2. **Resolved:** `feature_dependency` per 21 §3.4 — `ai.resume_tailoring → consent.ai_tailoring` (CONSENT),
   `ai.job_matching` stays independent, and D's `automation.approved_apply → marketing.assisted_applications`
   TECHNICAL row is **dropped**.
3. `EntitlementRequest.acting(...)` / `.self(...)` factories, `commit`/`release`, `check(quantity=0)` as a
   limit probe, and the resolver that treats a **personal** subscription and an **org** license as
   alternatives, never summed (ADR-018).
4. **Resolved (09 row 12):** `@RequiresFeature` + the shared `Beneficiary {NONE, SELF, PATH_MEMBER, BODY_MEMBER, QUERY_MEMBER}`
   and `AuthzDecision.ATTRIBUTE` (X5.6).
5. **Resolved (09 row 11):** `ai_call` columns + `AiCallContext` + the `AiRouter`/`AiMeteringService` overloads are X5.8's.
6. **Withdrawn (09 row 9):** no marketer-seat *license* preset — #9/#11/#14 charge the org module (20 §6).

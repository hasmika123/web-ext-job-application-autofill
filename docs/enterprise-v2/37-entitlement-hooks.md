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
to `AiRouter` so `ai_call` carries `beneficiary_login/org_id/feature_key/usage_event_id`.

In the **personal** workspace nothing changes: the same services keep calling `AiBudgetService.decide`
with the user's own login (ADR-018). The org path is taken only when `TenantContext`/`X-Kiwiply-Workspace`
names an org and the handler is an org route.

## 2. Hook table

| # | operation (doc §) | feature key | actor | beneficiary | quantity / unit | where `check` runs | on deny |
|---|---|---|---|---|---|---|---|
| 1 | AI job matching for a consultant (31 §4, X8.3) | `ai.job_matching` | marketer (or SYSTEM nightly `OrgMatchJob`) | consultant | 1 `matching_run` per consultant per run | `OrgMatchService.matchOne(orgId, memberId, actor)` explicit `check` (scheduler has no handler); handler `POST /consultants/{memberId}/matches/run` uses `@RequiresFeature("ai.job_matching", PATH_MEMBER)` | 402 `FEATURE_NOT_LICENSED` → UI chip "AI matching isn't on Anika's license · ask your admin" (admin deep-link to Configure License, Session C) |
| 2 | Rule-based matching / job discovery for a consultant (X8.2) | **none** (core, free, identical in all tiers per CLAUDE.md) | marketer | consultant | — | step 1–6, 9–10 only (`@OrgPermissionRequired(OPPORTUNITIES_MANAGE)`, act-for) | — |
| 3 | AI resume tailoring in act-for mode (30 §6, X7.5) | `ai.resume_tailoring` | marketer | consultant | 1 `tailoring` | `@RequiresFeature("ai.resume_tailoring", PATH_MEMBER)` on `POST …/resumes/{id}/ai/tailor`; CONSENT dependency → `org_feature_consent('ai.resume_tailoring')` (step 10) | 402 / 403 `CONSENT_REQUIRED` card |
| 4 | Consultant tailors their own resume inside the org workspace (self-service) | `ai.resume_tailoring` | consultant | consultant | 1 | existing `ResumeTailorService` path with `@RequiresFeature(..., SELF)` when in an org workspace; personal budget otherwise (ADR-018: "Pro via Acme" only inside the org workspace) | 402 → "Not on your Acme license" with the personal-plan alternative shown honestly |
| 5 | Resume optimization / rewrite / summary / suggest (builder AI) for a consultant | `resume.optimization` | marketer or consultant | consultant | 1 `operation` | `POST …/resumes/{id}/ai/{rewrite\|summary\|suggest}` `@RequiresFeature("resume.optimization", PATH_MEMBER\|SELF)` | 402 |
| 6 | Advanced versions (named checkpoints beyond the free retention, diff view history > N) | `resume.advanced_versions` | consultant / marketer | consultant | per feature definition (`limit`, not metered) | `ResumeDocVersionService` retention reads the allowance via `check(quantity=0)` (a *limit* check, no reservation) | silently falls back to the free retention; UI shows the cap |
| 7 | Marketing-assisted applications: assign opportunities, prepare packets, record submissions, follow-ups (31 §4–5, §12) | `marketing.assisted_applications` | marketer / AM | consultant | 1 `operation` per **assignment batch** and per submission record (not per read) | `@RequiresFeature("marketing.assisted_applications", PATH_MEMBER)` on `POST /matches` (batch counts 1), `POST /submissions`, `POST /submissions/{id}/record` | 402 → the consultant cannot be marketed until licensed; the directory shows a "No marketing feature" chip |
| 8 | Inbox monitoring — the **consultant's** own inbox suggestions moving their applications (32 §4) | `inbox.monitoring` | consultant | consultant | 1 `connection` (limit) + AI classification calls as today | `InboxPoller`'s existing `isPro(login)` gate becomes `EntitlementService.check(SELF, "inbox.monitoring")` resolving personal **or** any org license that grants it (ADR-018 stacking rule: not stacked — the first ACTIVE grant wins; personal if present) | the existing NOT_PRO behaviour (poll skipped, status shown) |
| 9 | Inbox monitoring — the **marketer's** own inbox attribution to submissions (32 §4, D4) | `inbox.monitoring` | marketer | **marketer** (their own license — a marketer seat is a licensed consultant-shaped member per E3 presets) | AI calls when rules are ambiguous: 1 `request` each | `MarketerInboxAttributionService` explicit `check(actor = beneficiary = marketer)` | rules-only attribution continues; no AI |
| 10 | AI interview preparation (33 §6, X9.7) | `interview.ai_prep` | consultant | consultant | 1 `session` | `@RequiresFeature("interview.ai_prep", SELF)` on `POST /api/profile/interviews/{id}/prep` when the workspace header names the org; the marketer's `/prep/request` consumes nothing | 402 → "Ask Acme to add Interview Prep" + org-curated practice sets (free) |
| 11 | Advanced alerts (daily digest of pipeline changes for marketers; bench-aging alerts) (X8.6) | `alerts.advanced` | marketer | **marketer** | limit (on/off) | `FollowUpReminderJob` explicit `check(quantity=0)` per marketer | basic in-app notifications only |
| 12 | Application analytics for the org (X10.7 consultant-level rows; X12.1) | `analytics.applications` | admin / manager | **org** (`ORG_POOL`-style org-level entitlement = `org_module`, step 6 MODULE) | — | step 6 `MODULE_OFF` | 404 on the report kind; nav hidden |
| 13 | Autopilot prepare for assigned jobs (X12.2) | `automation.approved_apply` | consultant (own extension) | consultant | per item: 1 `preparation`, caps 30/day · 300/period | `GET /api/autopilot/next` (prior art) with `@RequiresFeature(SELF)`; assigned items carry `match_id`; **stops before submit, attestation untouched** | 402 `AUTOPILOT_REQUIRED`/`AUTOPILOT_LIMIT` as designed |
| 14 | Requirement email-paste enrichment (34 §2) | `marketing.assisted_applications` | AM | **AM** (own) | 1 `operation` | explicit `check` in `RequirementParser.enrich` | rules-only parse |
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
1. `feature_definition` rows for the 11 keys above with `usage_unit`: `matching_run`, `tailoring`,
   `operation`, `connection`, `session`, `preparation`, `credits`; `pool_mode` default PER_CONSULTANT.
2. `feature_dependency`: `ai.resume_tailoring` → CONSENT (`org_feature_consent`), `ai.job_matching` →
   TECHNICAL on `marketing.assisted_applications`? **No** — matching is useful alone; keep independent.
   `automation.approved_apply` → TECHNICAL on `marketing.assisted_applications`.
3. `EntitlementRequest.acting(...)` / `.self(...)` factories, `commit`/`release`, `check(quantity=0)` as a
   limit probe, and the resolver that treats a **personal** subscription and an **org** license as
   alternatives, never summed (ADR-018).
4. `@RequiresFeature` + `Beneficiary.PATH_MEMBER|SELF` and `AuthzDecision.ATTRIBUTE` (X5.*).
5. `ai_call` additive columns `beneficiary_login, org_id, feature_key, usage_event_id` and
   `AiRouter`'s `AiCallContext` (X5 metering story) — X7.5/X8.3 depend on them.
6. A marketer seat preset ("Talent Marketing Support") so #9 and #11 have a license to charge.

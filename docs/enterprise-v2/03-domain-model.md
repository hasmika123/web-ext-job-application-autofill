# 03 — Domain model: bounded contexts, entities, relationships, and the map onto existing tables

> Status: design, 2026-10-12. Build-ready at the level of tables, keys and ownership. Column-by-column
> DDL for each phase is written by the follow-up session that owns the context (see README). Money is
> always `*_minor` (long, minor units) + `currency CHAR(3)`. Timestamps are `DATETIME(6)` UTC, named
> `*_at`. Status columns are `VARCHAR(20)` enum names (repo convention). Every org-owned table has
> `org_id BIGINT NOT NULL` first in every index. Liquibase ids: `202610xxxxxxxx_ent_<context>.xml`.

## 1. Bounded contexts

```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│ PLATFORM (Kiwiply)                                                                           │
│  identity (jhi_user) · settings registry · catalog (products, prices, features, presets,     │
│  tiers) · contracts · platform admin audit · stripe gateway                                  │
└────────────────────────────────────────────────────────────────────────────────────────────┘
          │ provisions / prices                                   ▲ webhooks / reconciler
┌─────────▼──────────────────────────────┐   ┌───────────────────┴───────────────────────────┐
│ TENANCY                                 │   │ COMMERCE (per org)                             │
│ organization · org_hostname · branding  │   │ org_billing_account · consultant_license ·     │
│ org_setting · membership (org_member)   │   │ license_feature · license_quote ·              │
│ roles (org_role, org_member_role)       │   │ license_change · usage_event · org_subscription│
│ groups (departments/teams) · invites    │   │ · org_invoice(_line) · entitlement decisions   │
│ consent (data_share) · org_audit_event  │   └────────────────────────────────────────────────┘
└─────────┬──────────────────────────────┘
          │ membership-scoped
┌─────────▼──────────────────────────────┐   ┌────────────────────────────────────────────────┐
│ TALENT                                  │   │ PIPELINE (per org)                              │
│ consultant_profile · org_assignment ·   │──▶│ client_account/contact/relationship ·           │
│ org_resume (links to person resumes)    │   │ client_requirement · opportunity ·              │
│ employment_record · hr_task · policy_ack│   │ opportunity_match · candidate_submission ·      │
└────────────────────────────────────────┘   │ interview_slot · offer · placement ·            │
                                              │ pipeline_event                                   │
┌────────────────────────────────────────┐   └────────────────────────────────────────────────┘
│ PERSON (unchanged, user-owned)          │
│ profile (Bio/ProfileItem) · resume(_doc)│◀── read through consent (data_share) and links
│ application · interview · inbox ·       │
│ notification · subscription (personal)  │
└────────────────────────────────────────┘
```

Rules between contexts:
- PERSON tables never gain `org_id`. TALENT/PIPELINE reference them by id through link rows
  (`org_resume.resume_id`, `candidate_submission.application_id` nullable) and read them only under
  consent.
- PLATFORM owns prices; COMMERCE references price ids and never copies amounts except into
  invoice snapshots.
- TENANCY is the only context that knows hostnames and branding.

## 2. Entity catalogue

### 2.1 TENANCY

| Entity | Exists? | Key columns (new in **bold**) | Notes |
|---|---|---|---|
| `organization` | yes | slug, name, type, status, stripe_customer_id, setup_fee_paid_at, billing_email, logo_key, website, size_band, country, timezone, settings_json, **subdomain** (VARCHAR 63, unique, nullable), **subdomain_enabled** (bool default false), **config_version** (int, bumped on any tenancy write), **display_name** (VARCHAR 120, nullable; brand name if ≠ legal name) | Phase 1 adds the bold columns. `OrgType` gains **STAFFING**, **PROFESSIONAL_SERVICES** (additive enum values; COACH still reserved). |
| `org_hostname` | **new** | id, org_id, hostname (VARCHAR 253, unique, lower-case, punycode), kind SUBDOMAIN\|CUSTOM, status PENDING\|VERIFYING\|VERIFIED\|ACTIVE\|SUSPENDED\|REMOVED, is_primary (bool), verification_method DNS_TXT\|DNS_CNAME, verification_token (char 32), verified_at, activated_at, suspended_at, removed_at, last_check_at, last_check_result (VARCHAR 200), cert_state NONE\|REQUESTED\|ISSUED\|FAILED (from the `ask` endpoint hits), created_by_member_id | Exactly one `is_primary` per org (generated active key). Subdomain rows are created by provisioning; custom rows by the org admin with `domains.manage`. `org_domain` (email auto-join) is **not** reused. |
| `org_branding` | **new** | org_id (PK/FK), logo_key, favicon_key, login_banner_key, primary_color, secondary_color, accent_color (CHAR 7 `#rrggbb`, validated), theme LIGHT\|DARK\|SYSTEM, welcome_title (120), welcome_message (500), terminology_json (label overrides, allow-listed keys), nav_prefs_json (hidden/ordered nav keys, allow-listed), published_at, draft_json (unpublished edits), updated_by_member_id | Publish copies draft → columns and bumps `config_version`. Only published values reach the public tenant DTO. Contrast is validated server-side (WCAG AA on text/background pairs); the login still renders with safe defaults if a value is invalid. |
| `org_setting` | **new** | org_id, key (registry key), value_json, updated_by, updated_at; unique (org_id, key) | Per-org override of allow-listed `SettingDefinitions` keys (e.g. `org.invite.require_email_match`, `org.attention.inactive_days`). Resolution: org override → global registry → code default. |
| `org_member` | yes | + **primary_role_id** (FK org_role, nullable during backfill), **title** (80), **department_group_id**, **team_group_id**, **manager_member_id**, **employment_status** (from HR, nullable), **last_active_at**; branch-B invite columns (invite_name, invite_batch_id, invite_sent_at, invite_resend_count, invite_resend_window_at) | `role` (enum string) stays and is dual-written. `group_id` stays for cohorts (schools). |
| `org_role` | **new** | id, org_id (NULL = system template), key (40), name (80), description, template_key (the system template it derives from), is_system, is_editable, workspace_key (default landing workspace), created_at, updated_at | Seeded system rows: OWNER, ORG_ADMIN, STAFF, MEMBER, CONSULTANT, MARKETING_SPECIALIST, MARKETING_MANAGER, HR_SPECIALIST, FINANCE_SPECIALIST, ACCOUNT_MANAGER, TALENT_ACQUISITION, EXECUTIVE_VIEWER. Unique (org_id, key). |
| `org_role_permission` | **new** | role_id, permission_key (60), scope OWN\|ASSIGNED\|TEAM\|DEPARTMENT\|ORG; unique (role_id, permission_key) | Permission keys are the string registry (`OrgPermission.key()` + new keys, `05-permission-model.md`). |
| `org_member_role` | **new** | id, org_id, member_id, role_id, is_primary, granted_by_member_id, granted_at, ends_at | Unique (member_id, role_id) where ends_at IS NULL (generated active key). |
| `org_group` | yes | kind DEPARTMENT\|COHORT\|TEAM, + **parent_group_id** (team → department), **lead_member_id** | Departments and teams are groups; a team may belong to a department. |
| `org_invite_batch`, `org_join_code` | yes | + **role_ids_json** on join code | Branch B's invite model is adopted. |
| `data_share`, `data_share_event` | yes | unchanged | Consent scope NONE/SUMMARY/FULL; `full_to_member_id` names the paired marketer. |
| `org_feature_consent` | **new (Phase 7)** | org_id, member_id, feature_key, granted_to_member_id NULL (any assignee) , consent_version, granted_at, revoked_at | Per-feature "act for me" consent (e.g. AI tailoring, resume edits); FULL pairing is the baseline. |
| `org_audit_event` | yes | + **hostname_id**, **beneficiary_login**, **risk** LOW\|MEDIUM\|HIGH | Additive. |

### 2.2 COMMERCE (platform catalog + per-org)

| Entity | Exists? | Key columns | Notes |
|---|---|---|---|
| `product` | **new (Phase 18 design)** | code, name, kind SUBSCRIPTION\|SEAT\|SERVICE\|FEE\|BUNDLE\|**BASE_LICENSE**\|**FEATURE**\|**ORG_MODULE**, sold_to INDIVIDUAL\|ORG\|BOTH, **feature_key** (nullable; FEATURE/ORG_MODULE), active, sort_order | One catalog for personal and enterprise. |
| `product_price` | **new (Phase 18)** | product_id, audience, billing_interval MONTH\|QUARTER\|ONE_TIME (no ANNUAL), amount_minor, currency, stripe_price_id, payout_minor, subscriber_discount_pct, margin_pct_worst, active, published_at, retired_at, **effective_from**, **effective_until**, **catalog_version** | Immutable rows (ADR-013). |
| `product_entitlement` | **new (Phase 18)** | product_id, feature_key, limit_value | Personal plans' feature limits. Enterprise features use `feature_definition`. |
| `feature_definition` | **new** | feature_key (PK, 60), name, description, category MATCHING\|RESUME\|EMAIL\|MARKETING\|INTERVIEW\|ALERTS\|ANALYTICS\|AUTOMATION\|AI_CREDITS, usage_unit (e.g. `tailorings`, `sessions`, `requests`, `connections`, `operations`, `credits`), default_allowance (long), pool_mode PER_CONSULTANT\|ORG_POOL, allowance_period MONTH\|QUARTER\|PERIOD, eligibility_json (org types, min base), active, catalog_version | Separate from pricing (requirements §15). Initial keys: `ai.job_matching`, `ai.resume_tailoring`, `resume.optimization`, `resume.advanced_versions`, `inbox.monitoring`, `marketing.assisted_applications`, `interview.ai_prep`, `alerts.advanced`, `analytics.applications`, `automation.approved_apply` (= Autopilot prepare), `ai.credits_extra`. |
| `feature_dependency` | **new** | feature_key, requires_feature_key, kind TECHNICAL\|COMMERCIAL\|INTEGRATION\|CONSENT, note | COMMERCIAL → cost confirmation; CONSENT → `org_feature_consent` required at use. |
| `license_preset` | **new** | key, name, description, feature_keys_json, active, sort_order, catalog_version | Shortcuts (Job Search Essentials, Resume & AI Support, Talent Marketing Support, Interview Support, Full Career Support) — admin-editable. |
| `volume_tier` | **new** | product_id NULL, min_licensed_consultants, pct_off, active, effective_from/until | Ships empty (ADR-015). |
| `org_contract` | **new** | org_id, status, currency, starts_at, ends_at, billing_interval, stackable, volume_applies, notes, created_by, approved_by | Platform-admin only. |
| `org_contract_price` | **new** | contract_id, product_id, override_amount_minor NULL, override_pct_off NULL, min_quantity | One of the two. |
| `org_billing_account` | **new** | org_id (unique), stripe_customer_id, billing_email, billing_contacts_json, collection_method CHARGE_AUTOMATICALLY\|SEND_INVOICE, tax_status, status NONE\|ACTIVE\|PAST_DUE\|SUSPENDED, billing_mode SUBSCRIPTION_ITEMS\|COMPUTED_INVOICE, current_period_start/end | Mirrors `organization.stripe_customer_id` during transition. |
| `consultant_license` | **new** | org_id, member_id, status PENDING\|ACTIVE\|SUSPENDED\|CANCEL_AT_PERIOD_END\|ENDED, base_product_id, base_price_id, starts_at, ends_at, cancel_at_period_end, created_by_member_id | One live license per member per org (generated active key). Tied to membership, not user (requirements §18). |
| `license_feature` | **new** | org_id, license_id, feature_key, product_id, price_id, allowance_override NULL, starts_at, ends_at, added_by_member_id, change_id | Unique live (license_id, feature_key). |
| `license_quote` | **new** | org_id, created_by_member_id, inputs_hash, catalog_version, lines_json, current_recurring_minor, proposed_recurring_minor, delta_minor, proration_estimate_minor, next_invoice_estimate_minor, tax_estimate_minor, currency, effective_at, expires_at, status OPEN\|APPLIED\|EXPIRED | ADR-019. |
| `license_change` | **new** | org_id, license_id, quote_id, kind, payload_json, effective_at, status PENDING\|APPLIED\|CANCELLED\|FAILED, applied_by_member_id, applied_at, stripe_ref | Scheduled removals live here until period end. |
| `usage_event` | **new** | org_id, member_id, actor_member_id, feature_key, quantity, unit, status RESERVED\|COMMITTED\|RELEASED, overage, idempotency_key (unique), period_key (`2026-10`), reference_type, reference_id, created_at, committed_at | ADR-016. Index (org_id, feature_key, period_key, status). |
| `org_subscription`, `org_subscription_item`, `org_invoice`, `org_invoice_line` | **new** | mirrors (stripe ids, status, period, quantities, amounts, pdf url) | Written only by `BillingWebhookService` (org scope routing). |
| `entitlement_decision_log` | optional (Phase 6) | sampled denials for support | Not a source of truth. |

### 2.3 TALENT

| Entity | Exists? | Key columns | Notes |
|---|---|---|---|
| `consultant_profile` | **new** | org_id, member_id (unique), availability_status AVAILABLE\|ON_PROJECT\|NOTICE\|UNAVAILABLE, available_from, marketing_status NOT_MARKETED\|PREPARING\|ACTIVE\|PAUSED, bench_since, preferred_locations_json, work_modes_json, rate_band_label, work_auth_category (self-declared label only), headline (120), skills_json (org-curated tags), updated_by_member_id | ADR-006. No document numbers, no DOB. |
| `org_assignment` | **new** | org_id, consultant_member_id, assignee_member_id, kind PRIMARY\|BACKUP\|MANAGER\|DELEGATE, starts_at, ends_at, reason, created_by_member_id | ADR-008. One open PRIMARY per consultant. |
| `org_resume` | **new** | org_id, resume_id, member_id, managed_by_member_id, kind PERSONAL_SHARED\|ORG_MANAGED, approval_status, approved_at, approved_version_no, visibility ORG\|ASSIGNED\|PRIVATE, primary_for_org, edit_allowed | ADR-009. |
| `employment_record` | **new (Phase 11)** | org_id, member_id, title, department_group_id, team_group_id, manager_member_id, employment_type, start_date, end_date, status ONBOARDING\|ACTIVE\|LEAVE\|OFFBOARDING\|ENDED, updated_by | Lifecycle only. |
| `hr_task`, `policy_ack` | **new (Phase 11)** | checklist items; acknowledgements with version | No identity documents. |

### 2.4 PIPELINE

| Entity | Exists? | Key columns | Notes |
|---|---|---|---|
| `client_account` | **new** | org_id, kind END_CLIENT\|VENDOR\|PRIME\|PARTNER, name, website, status PROSPECT\|ACTIVE\|INACTIVE, owner_member_id, notes | ADR-011. |
| `client_contact` | **new** | org_id, client_id, name, work_email, phone, title, status | Scanned for PII. |
| `client_relationship` | **new** | org_id, from_client_id, to_client_id, kind SUBCONTRACTS_TO\|SUPPLIES\|MSP, terms_label | Vendor chains. |
| `client_requirement` | **new** | org_id, client_id, via_client_id, title, description, skills_json, location, mode, rate_band_label, status OPEN\|ON_HOLD\|FILLED\|CLOSED, opens_at, closes_at, owner_member_id, source MANUAL\|EMAIL\|IMPORT, dedupe_key | |
| `opportunity` | **new** | org_id, kind JOB_POSTING\|CLIENT_REQUIREMENT, posting_id NULL (global `job_posting`), requirement_id NULL, title, company, url, status NEW\|TRIAGED\|ASSIGNED\|CLOSED, created_by_member_id, assignment_id | Exactly one of posting/requirement. |
| `opportunity_match` | **new** | org_id, opportunity_id, consultant_member_id, score, reason, model, status SUGGESTED\|ASSIGNED\|ACCEPTED\|DECLINED\|WITHDRAWN, assigned_by_member_id, assigned_at, consultant_decided_at, resume_id (org-approved), authorization CONSULTANT_APPROVED\|PENDING\|DECLINED, authorized_at | Unique (opportunity_id, consultant_member_id) = duplicate guard. |
| `candidate_submission` | **new** | org_id, match_id, requirement_id, consultant_member_id, submitted_by_member_id, resume_id, resume_version_no, channel_label, external_reference, status DRAFT\|AUTHORIZED\|SUBMITTED\|SHORTLISTED\|REJECTED\|WITHDRAWN, submitted_at, authorized_at | **Record only** (ADR-010). Unique (requirement_id, consultant_member_id). |
| `pipeline_application_link` | **new** | org_id, match_id, application_id (consultant's `application`), linked_at, source SUBMIT_DETECT\|CONSULTANT | The consultant's own application row, linked by submit-detect or by the consultant. Org reads status under consent. |
| `interview_slot` | **new** | org_id, submission_id NULL, match_id NULL, consultant_member_id, interview_id NULL (consultant's own `interview` row when they accept it), kind, starts_at, ends_at, tz, with_contact_id, status PROPOSED\|CONFIRMED\|DONE\|CANCELLED\|NO_SHOW, outcome, feedback_json, scheduled_by_member_id | The org-side record; the consultant's calendar row is their own. |
| `offer` | **new** | org_id, submission_id, consultant_member_id, client_id, rate_band_label, bill_rate_minor NULL, pay_rate_minor NULL, currency, start_date, duration_label, status DRAFT\|EXTENDED\|ACCEPTED\|DECLINED\|EXPIRED, decided_by_member_id, decided_at | Rates are finance records (ADR-011). |
| `placement` | **new** | org_id, offer_id, consultant_member_id, client_id, bill_to_client_id, start_date, end_date, status PENDING_START\|ACTIVE\|EXTENDED\|ENDED\|TERMINATED, extension_of_placement_id, redeployment_of_placement_id | Distinct from application. Feeds Timesheets (H). |
| `pipeline_event` | **new** | org_id, entity_type, entity_id, kind, from_status, to_status, actor_member_id, beneficiary_member_id, summary, created_at | One timeline for every pipeline object (mirrors `application_event`). |

### 2.5 PERSON (unchanged)
`jhi_user` (+ `phone`, `title` additive), `bio`, `profile_item`, `resume`, `resume_doc`, `resume_doc_version`,
`resume_access`, `application`, `application_event`, `application_note`, `interview`,
`inbox_connection`, `inbox_message`, `notification`, `notification_preference`, `subscription`.
**No `org_id` on any of these.**

## 3. Relationships (the ones that carry rules)

```
organization 1─* org_hostname          (one is_primary; subdomain row auto-provisioned)
organization 1─1 org_branding          (published vs draft)
organization 1─* org_member *─1 jhi_user (nullable until join; one live row per org+user)
org_member   *─* org_role via org_member_role (one is_primary)
org_role     1─* org_role_permission
org_group    (department) 1─* org_group (team via parent_group_id)
org_member   *─1 org_group (department_group_id) ; *─1 org_group (team_group_id)
org_member   (consultant) 1─* org_assignment *─1 org_member (assignee)
org_member   1─0..1 consultant_profile
org_member   1─0..1 consultant_license 1─* license_feature *─1 feature_definition
license_quote 1─* license_change *─1 consultant_license
usage_event  *─1 org_member (beneficiary) ; *─1 org_member (actor)
org_resume   *─1 resume (person-owned)   ; *─1 org_member (member) ; *─1 org_member (managed_by)
client_account 1─* client_contact ; client_relationship (from→to)
client_requirement *─1 client_account (issuer) ; *─0..1 client_account (via)
opportunity  *─0..1 job_posting | *─0..1 client_requirement
opportunity  1─* opportunity_match *─1 org_member (consultant)
opportunity_match 1─0..1 candidate_submission ; 1─0..1 pipeline_application_link *─1 application (person-owned)
candidate_submission 1─* interview_slot ; 1─0..1 offer 1─0..1 placement
placement    0..1─* placement (extension_of / redeployment_of)
org_contract 1─* org_contract_price *─1 product
product      1─* product_price ; product (FEATURE) *─1 feature_definition
```

## 4. State machines (summary; full transitions in the owning follow-up doc)

| Object | States |
|---|---|
| `org_hostname` | PENDING → VERIFYING → VERIFIED → ACTIVE ⇄ SUSPENDED → REMOVED (REMOVED is terminal; re-adding creates a new row) |
| `organization.status` | unchanged: DRAFT → PENDING_SETUP_FEE → ACTIVE ⇄ PAST_DUE → SUSPENDED → CLOSED |
| `org_member.status` | unchanged: INVITED → ACTIVE ⇄ SUSPENDED → LEFT/REMOVED → ERASED (+ HR `employment_record.status` for lifecycle) |
| `consultant_license` | PENDING → ACTIVE ⇄ SUSPENDED → CANCEL_AT_PERIOD_END → ENDED; REACTIVATE from SUSPENDED/CANCEL_AT_PERIOD_END |
| `license_change` | PENDING → APPLIED \| CANCELLED \| FAILED |
| `usage_event` | RESERVED → COMMITTED \| RELEASED |
| `opportunity_match` | SUGGESTED → ASSIGNED → ACCEPTED \| DECLINED → (authorization PENDING → CONSULTANT_APPROVED \| DECLINED) → WITHDRAWN |
| `candidate_submission` | DRAFT → AUTHORIZED → SUBMITTED → SHORTLISTED \| REJECTED \| WITHDRAWN |
| `interview_slot` | PROPOSED → CONFIRMED → DONE \| CANCELLED \| NO_SHOW |
| `offer` | DRAFT → EXTENDED → ACCEPTED \| DECLINED \| EXPIRED |
| `placement` | PENDING_START → ACTIVE → EXTENDED \| ENDED \| TERMINATED |

## 5. Migration map (existing → V2)

| Existing | V2 treatment | Phase |
|---|---|---|
| `organization.*` | kept; + subdomain, subdomain_enabled, config_version, display_name | 1 |
| `org_domain` (email auto-join) | kept as-is; **not** the hostname table | — |
| `org_member.role` | kept, dual-written; `org_member_role` becomes authoritative | 1 (backfill), 4 (authoritative) |
| `org_member.support_owner_member_id` | kept for STAFF flow; `org_assignment` for consultants | 4 |
| `org_group` | kept; + parent_group_id, lead_member_id | 4 |
| `data_share*` | kept unchanged; `org_feature_consent` added | 7 |
| `organization.stripe_customer_id/billing_email` | mirrored into `org_billing_account` | 5 |
| `subscription` (personal) | untouched | — |
| `ai_call` | + org_id, beneficiary_login, feature_key, usage_event_id | 5 |
| `job_match` (personal) | untouched; `opportunity_match` for org | 8 |
| `application`/`interview` | untouched; linked from pipeline | 9 |
| `resume*` | untouched; `org_resume` links | 7 |
| `org_audit_event` | + hostname_id, beneficiary_login, risk | 1 |

## 6. Indexing and retention rules (apply to every new table)
- Primary access path index starts with `org_id`; status filters next; `created_at` last.
- Generated "active key" columns for one-live-row rules (pattern from `org_member.active_key`).
- Retention from settings: `usage_event` 24 months, `pipeline_event` 36 months, `entitlement_decision_log` 90 days, money mirrors 7 years (Timesheets rule). Purge jobs follow the existing `*PurgeJob` pattern.
- Soft lifecycle everywhere (status + `ended_at`); no hard deletes except the account-erasure path, which anonymises membership rows as today.

# 41 — Database design: structural inventory, tenant-key rules, migrations, retention, lifecycle

> Status: design (Session E, task 3), 2026-10-12. MySQL 9 (prod: managed-by-us container; CI: Testcontainers MySQL of the prod version), additive Liquibase only (ADR-023).
> **Columns live in the owner docs** (03 §2 foundation, 17, 20, 21, 23, 25, 26, 30–36) — this doc is the **structural contract**: what exists, which keys/indexes/FKs/delete rules apply, how it is migrated, backfilled, rolled back, retained, erased. Wording of `09-consistency-decisions.md` assumed applied (changelog names = row 16).
> `⚑ needs design review` marks judgment calls.

## 1. Rules (every table, enforced by CI — §12)

| # | Rule | Enforcement |
|---|---|---|
| R1 | **Org-owned table** = has `org_id BIGINT NOT NULL`, FK → `organization(id)` **ON DELETE RESTRICT** (orgs are never hard-deleted). **Every secondary index starts with `org_id`.** Surrogate `id BIGINT AUTO_INCREMENT` PK. | `TenantKeyPolicyTest` parses changelogs |
| R2 | **Person-owned tables never gain `org_id`**: `jhi_user, bio, profile_item, resume, resume_doc, resume_doc_version, resume_access, application, application_event, application_note, interview, interview_prep, inbox_connection, inbox_message, notification, notification_preference, subscription, job_match, refresh_token` (the last gets `org_id` **only** as an attribution column — see R2a). Org data refers to them by id through link rows. | `PersonTablesNoOrgIdTest` |
| R2a | Closed list of **attribution ledgers** that may carry a *nullable* `org_id` without being org-owned: `ai_call`, `stripe_event`, `refresh_token` (session→tenant binding, X2.7). Nothing else. Adding to the list needs review (⚑). | same test, `ATTRIBUTION_LEDGERS` constant |
| R3 | **Composite tenant FKs (⚑):** every FK from one org-owned table to another is `(org_id, parent_id) → parent(org_id, id)`; each org-owned parent therefore gets `uk_<t>_org_id UNIQUE (org_id, id)`. A child row can never point at another tenant's parent — a DB fact, not a service check. Added to existing parents additively (`org_member`, `org_group`, `org_hostname`). JPA maps plain columns; the FK is DDL only. FKs to platform tables (`product`, `product_price`, `feature_definition`) are single-column. | `CompositeTenantFkTest` |
| R4 | **Delete rules:** default **RESTRICT**. `CASCADE` only for *owned detail rows with no independent meaning and no audit value*: `org_role_permission→org_role`, `hr_checklist_item_template→hr_checklist_template`, `org_webhook_delivery→org_webhook`, `org_branding_version→org_branding`. (Contract price rows, invoice lines and every financial/consent/audit row are **never** cascaded.) `SET NULL` only on nullable *snapshot pointers into person data* (R6). Nothing cascades from `jhi_user`: new tables never FK `jhi_user` (use `member_id`, or a `*_login` string snapshot that survives erasure by being scrubbed, §10). | `DeleteRuleAllowListTest` |
| R5 | Soft lifecycle: `status` + `ended_at`/`removed_at`; "one live row" rules are **generated STORED `*_key` columns + UNIQUE** (pattern: `org_member.active_key`). MySQL generated columns can't use `NOW()`: time-dependent liveness is a service-maintained `live` flag (see `license_feature`, 20 §2.2). | `GeneratedKeyTest` per table |
| R6 | Links into person data (`org_resume.resume_id`, `opportunity_match.resume_id`, `candidate_submission.resume_id`, `pipeline_application_link.application_id`, `interview_slot.interview_id`): `org_resume` link row **CASCADE** on `resume` delete (it is only a link; a `ResumeDeletionHook` first writes `RESUME_LINK_REMOVED` audit and ends open approvals); snapshot pointers are nullable **SET NULL** and carry a text snapshot (`resume_label`, `resume_version_no`, `application_title`) so the CRM record stays readable. ⚑ (person deleting their own resume must never be blocked by org records) | `PersonDeleteDoesNotBlockIT` |
| R7 | Types: money `BIGINT *_minor` + `CHAR(3) currency`; rates in bps `INT *_bp`; timestamps `DATETIME(6)` UTC `*_at`; dates `DATE`; status/kind `VARCHAR(≤40)` enum names (never MySQL ENUM); booleans `BOOLEAN NOT NULL DEFAULT`; text columns have explicit lengths; `utf8mb4_0900_ai_ci`; no `FLOAT/DOUBLE`; ids `BIGINT`; tokens CHAR(32/64) hashed at rest where secrets. | `ColumnTypePolicyTest` (parses XML) |
| R8 | Changelog files `20261<13+P>NN0000_ent_<context>.xml` (09 row 16); one `changeSet id="ent-<ctx>-<n>"` per table/alteration, `author="enterprise"`, `<preConditions onFail="MARK_RAN">` (`tableExists false` / `columnExists false`); backfills are **separate** changesets (`runOnChange=false`, idempotent). | `LiquibaseAdditiveTest` (refuses `dropColumn|dropTable|renameColumn|modifyDataType|dropIndex` on existing objects) |
| R9 | Enterprise tables hold **no sensitive PII** (§9). | `NeverCollectedSchemaTest` |
| R10 | Tenant-visible ids are never trusted: `idempotency_key`, `usage_event.idempotency_key`, `stripe_*` ids are globally UNIQUE but constructed with an org prefix (cross-tenant collision impossible). | `IdempotencyKeyShapeTest` |

## 2. Changelog map: phase → file → contents → backfill → rollback

`Rollback` always = **flag off** (data inert); the "extra" column says what, if anything, an operator must also do. No `<rollback>` blocks that drop data are written (R8) — a failed changeset is fixed forward; a half-applied changeset can't exist (each changeSet is one DDL with `runInTransaction=false` for MySQL DDL, precondition-guarded so a re-run is a no-op).

| Ph | File (bucket `202610<13+P>`) | Creates / alters | Backfill changeset | Rollback (flag) | Extra rollback note |
|---|---|---|---|---|---|
| 1 | `20261015010000_ent_tenancy` | `org_hostname`, `org_branding`, `org_setting`; `organization` + `subdomain, subdomain_enabled, config_version, display_name`, `type` → VARCHAR(40); `org_audit_event` + `hostname_id, beneficiary_login, risk`; `uk_*_org_id` on `org_member, org_group` | none (new tables empty; `config_version` DEFAULT 1) | `flag.enterprise` off | none: unused columns inert |
| 1 | `20261015020000_ent_roles` | `org_role`, `org_role_permission`, `org_member_role`; `org_member.primary_role_id`; seeds system templates (`org_id NULL`) | `ent-roles-backfill`: one `org_member_role` per live member from `org_member.role`; `primary_role_id`; idempotent (`NOT EXISTS`) | `flag.enterprise.roles` off → `OrgAccessService` keeps reading the enum (dual-written) | verify job counts must match before flipping on |
| 1 | `20261015030000_ent_authz` | `org_assignment` shell (empty) | none | n/a | |
| 1 | `20261015040000_ent_platform` | `idempotency_record`, `ent_job_run`; index adds on `org_audit_event (org_id,created_at)…` (X4.9 may add later) | none | n/a | purge jobs only |
| 1 | branch-B `20261014010000_org_invites` (cherry-pick, keeps its own name) | invite columns on `org_member` | none | `flag.enterprise` off hides tenant links; legacy `/org` console unaffected | |
| 1 | `20261015040000_ent_invites` (X1.15) | `org_member` + `invite_role_ids_json`, `department_group_id`, `team_group_id`, `manager_member_id` (FK SET NULL; **X4 must add these behind `columnExists`**), `invite_message`, `invite_ended_reason`, `invite_ended_at`; index `idx_member_org_invites (org_id, invite_sent_at)`. An invitation IS the INVITED `org_member` row: no `org_invite` table | none | invites without `invite_role_ids_json` read their live role rows / the enum | |
| 2 | `20261016010000_ent_shell` | `org_branding_version`; `org_branding.draft_version, draft_updated_at, powered_by`; `org_member.landing_workspace`; `org_member_dismissal`; `org_setting_history`; `jhi_user.phone/title/avatar_key`; `refresh_token.org_id/user_agent/last_used_at`; `login_challenge` (X2.14; reuse `AdminMfaService` table if generalisable ⚑ small) | `ent-shell-branding-seed`: one `org_branding` row (draft = published defaults) per enterprise-flagged org, created lazily by service otherwise | `flag.enterprise` off | columns on `jhi_user` stay NULL |
| 3 | `20261017010000_ent_domains` | `org_hostname` + `active_hostname_key (gen, UNIQUE), primary_key (gen, UNIQUE), failing_since, last_ask_at, cert_issued_at, google_origin_registered`; `le_issuance` | none | `flag.enterprise.domains` off → ask endpoint 404s CUSTOM rows; resolver ignores CUSTOM | the edge Caddy change is separate (44 §6); rolling back flags does **not** revoke already-issued certs (harmless) |
| 4 | `20261018010000_ent_employees` | `org_member` + `title, department_group_id, team_group_id, manager_member_id, employment_status, last_active_at` + search/gen columns + indexes; `org_group.parent_group_id, lead_member_id`; `org_member_offboarding`; `org_assignment` full DDL (generated `primary_active_key`, `open_key`); `org_role_permission.ceiling_role_key`, `row_filter` (legacy `OrgScope` mapping, 05 §4) | `ent-employees-backfill`: `team_group_id/department_group_id` from `org_group` cohort mapping only where unambiguous; `org_assignment` from `support_owner_member_id` for **consultants only** (STAFF flow untouched) | `flag.enterprise.roles` off | verification job `OrgMemberRoleAuthoritativeIT` (X4.10) must pass before removing the enum fallback; the enum column is never dropped |
| 5 | `20261019010000_ent_catalog` | `product, product_price, product_entitlement, bundle_item, entitlement_grant, promo_code, catalog_change, catalog_publish, feature_definition, feature_definition_limit, feature_dependency, license_preset, volume_tier` | seeds `feature_definition/dependency/preset` **inactive, no prices** (precondition-guarded) | catalog invisible without `flag.enterprise.billing` | if Phase 18 shipped earlier, `tableExists` preconditions MARK_RAN; amount column is `amount_minor` from the start |
| 5 | `20261019020000_ent_contracts` | `org_contract, org_contract_price, contract_event, org_discount, org_discount_redemption` | none | `flag.enterprise.billing` off | |
| 5 | `20261019030000_ent_licenses` | `consultant_license, license_feature, license_quote, license_change, org_module_license, org_subscription, org_subscription_item` | none (the old org seat path is **not** migrated: orgs with legacy seat subscriptions keep them; enterprise licenses are a new path, ADR-018/023) | `flag.enterprise.billing` off | no data move |
| 5 | `20261019040000_ent_usage` | `usage_event, usage_counter, usage_period_rollup`, optional `entitlement_decision_log`; `ai_call` + `org_id, beneficiary_login, feature_key, usage_event_id` (+ index); `feature_definition.overage_product_id` | none | `flag.enterprise.billing` off | |
| 6 | `20261020010000_ent_org_billing` | `org_billing_account, org_invoice, org_invoice_line, org_stripe_discount, billing_drift`; `stripe_event.org_id` | `ent-billing-account-mirror`: one `org_billing_account` per org that already has `stripe_customer_id` (mirror; dual-write continues) | Stripe path off by blank key / `flag.enterprise.billing` UI off; LOCAL applier keeps writing mirrors | **do not** delete Stripe customers/subscriptions created in test mode; reconcile via runbook 44 §8 |
| 6 | `20261020030000_ent_break_glass` | `break_glass_grant` (**X6.17**; `…020000` is the X6.14 mirrors file — reviewed §13) | none | n/a | |
| 7 | `20261021010000_ent_talent` | `consultant_profile, consultant_profile_proposal, org_resume, org_feature_consent, consent_request, consent_event` | `ent-talent-profile-seed`: none — profiles created on first view | `flag.enterprise.marketing` off | `org_resume` links deletable by flag-off job `OrgResumeLinkSweep` only on explicit admin action |
| 8 | `20261022010000_ent_pipeline` | `job_opportunity, org_job_bank, opportunity_match, candidate_submission, pipeline_application_link, pipeline_task, interview_slot, offer, placement, placement_extension, pipeline_event, client_account, client_contact, client_relationship, client_requirement` (all created here, even Phase 9/10 tables, so FKs/uniques land once) | none | `flag.enterprise.marketing` off | |
| 9 | `20261023010000_ent_applications` | `application_note.shared_with_org`; `interview.application_id` nullable (`dropNotNullConstraint` = the only constraint *relaxation* in the programme, explicitly allowed by `LiquibaseAdditiveTest` allow-list); `interview_prep` | none | `flag.enterprise.extension_workspaces` / marketing off | relaxation is irreversible but harmless (code writes values as before) |
| 10 | `20261024010000_ent_placements_bridge` | `ops_placement.pipeline_placement_id` + index (in product H's table; **only if H's changelog is frozen**) | `ent-bridge-link`: none (links created on placement start) | `flag.enterprise.marketing` off | H's data untouched |
| 11 | `20261025010000_ent_hr_finance` | `employment_record, hr_checklist_template, hr_checklist_item_template, hr_task, org_policy, policy_ack, talent_pool, talent_pool_member` | `ent-hr-seed-templates` (inactive templates) | `flag.enterprise.hr_finance` off | `policy_ack` rows are legal records: never deleted on flag off |
| 12 | `20261026010000_ent_advanced` | `org_webhook, org_webhook_delivery, org_sso_config, org_analytics_snapshot` (if X12.1 materialises), `ent_shedlock` (ShedLock table) | none | per-feature flags | |
| R1 | `20261105010000_phase1_job_identity` (doc 60) | `client_requirement` + job identity (`job_url, url_key, url_key_hash, external_job_id, ats_platform, capture_source, …`, UNIQUE `uk_req_url`, `uk_req_ext`); `mkt_opportunity` + lifecycle (`state, priority, due_on, *_at, decline_reason, info_*`); `talent_application` + `personal_application_id, entry_path, stage_source`; `version` on all four; NEW `pipeline_application_link` (opportunity ↔ the consultant's own application, generated `live_key` UNIQUE). Supersedes the Phase 8 sketch of `pipeline_application_link` above for the opportunity flow | `mkt_opportunity.state` from legacy `interest` (separate guarded changeSet) | `flag.enterprise.consultant_jobs` off | additive only; columns/table stay inert |

Notes: (a) Product H's own bucket is ≥ `20261027` (09 row 16). (b) Every changelog is also run **on a DB at the previous release's schema** (not only empty) — `MigrationUpgradeIT` (§12). (c) Each phase ships *one* PR-sized changelog; if a story needs a table earlier than its phase, it adds a changeSet to **its phase's** file (never a new bucket).

## 3. Structural inventory by context

Legend: **UQ** unique · **GK** generated STORED unique key · **IX** index (always `org_id`-first on org-owned tables, omitted below) · FK `→` composite per R3 unless noted `(single)`.

### 3.1 Platform infrastructure (new in Phase 1)
| Table | Columns (beyond id) | Keys / indexes | FK / delete |
|---|---|---|---|
| `idempotency_record` | `org_id` NULL, `actor_login`, `key_hash CHAR(64)`, `request_hash CHAR(64)`, `status INT`, `response_json` (≤ 64 KB), `state IN_FLIGHT\|DONE`, `created_at`, `expires_at` | UQ `(actor_login, key_hash)`; IX `(expires_at)` | none (ledger; `org_id` is attribution) — purge by `IdempotencyPurgeJob` 24 h |
| `ent_job_run` | `job_key`, `org_id` NULL, `started_at`, `finished_at`, `status OK\|FAIL`, `detail ≤ 200`, `items INT` | IX `(job_key, started_at)` | none; purge 30 d. Feeds `/api/internal/health/ent` + alerts (44 §10); also fed by `app_setting` keys of 10 §7 |
| `le_issuance` | `registered_domain`, `hostname`, `issued_at` | IX `(registered_domain, issued_at)` | none; purge 120 d |

### 3.2 Tenancy
| Table | Keys / constraints | Indexes | FK / delete |
|---|---|---|---|
| `org_hostname` | UQ `hostname` **via GK `active_hostname_key` = hostname when status≠REMOVED**; GK `primary_key` = org_id when `is_primary` & status ACTIVE (one primary); UQ `(org_id,id)` | `(org_id,status)`, `(status,last_check_at)` (job), `(hostname,status)` (resolver) | `org_id`→organization RESTRICT |
| `org_branding` | PK = `org_id` (1:1) | — | →organization RESTRICT; `org_branding_version(org_id,version_no)` UQ, CASCADE from branding |
| `org_setting` | UQ `(org_id,key)` | — | RESTRICT; `org_setting_history` append-only (RESTRICT) |
| `org_role` | UQ `(org_id,key)` with `org_id NULL` system rows (UQ via GK `role_key_scope = COALESCE(org_id,0):key`) | `(org_id)` | `org_id` NULL-able → organization RESTRICT |
| `org_role_permission` | UQ `(role_id, permission_key)` | — | →org_role **CASCADE** |
| `org_member_role` | GK `active_role_key = member_id:role_id` when `ends_at IS NULL`; GK `primary_key = member_id` when `is_primary` & live | `(org_id,member_id)`, `(org_id,role_id)` | composite →org_member, →org_role (role may be system row: `(role_id)` single FK when `org_id NULL`; service guards org match) |
| `org_member` (existing +) | existing GKs unchanged; `uk_member_org_id (org_id,id)` | + `(org_id,status,department_group_id)`, `(org_id,team_group_id)`, `(org_id,manager_member_id)`, `(org_id,last_active_at)` | `department/team_group_id`, `manager_member_id` composite self/org_group, RESTRICT |
| `org_group` (existing +) | `uk_group_org_id`; `parent_group_id` composite self-FK | `(org_id,parent_group_id)` | RESTRICT |
| `org_assignment` | GK `primary_active_key`, GK `open_key` (17 §2) | `(org_id,consultant_member_id,ends_at)`, `(org_id,assignee_member_id,ends_at)`, `(org_id,kind,ends_at)` | both member FKs composite RESTRICT; `replaced_by_assignment_id` composite self |
| `org_feature_consent` | UQ live `(org_id,member_id,feature_key,granted_to_member_id)` GK | `(org_id,member_id)` | composite →org_member; `feature_key` holds a **consent kind** (09 row 10), not FK |
| `consent_request` / `consent_event` | request cooldown lookup `(org_id,member_id,consent_kind,created_at)`; `consent_event` append-only, login-keyed | | RESTRICT |
| `org_audit_event` (existing +) | append-only (no UPDATE/DELETE grants in code: `OrgAuditService` only) | `(org_id,created_at)`, `(org_id,action)`, `(org_id,actor_login)`, `(org_id,target_login)`, `(org_id,hostname_id)` | login strings, **no FK to jhi_user** (survives erasure, scrubbed per §10) |
| `org_member_dismissal` | PK `(org_id,member_id,key)` | | composite →org_member RESTRICT |
| `org_member_offboarding` | UQ pending per member GK | `(org_id,status,effective_at)` | composite →org_member |
| `break_glass_grant` (Phase 6 file) | `id, admin_login, org_id, reason ≤ 400 (@NoSensitiveText), mfa_verified_at, scope_json, starts_at, expires_at, ended_at, tenant_audit_event_id` | `(org_id,expires_at)`, `(admin_login,starts_at)` | →organization RESTRICT; append-only; **never deleted** (7 y) |

### 3.3 Commerce (platform catalog: no `org_id`)
| Table | Keys / constraints | FK / delete |
|---|---|---|
| `product` | UQ `code` | `feature_key`→feature_definition (single, RESTRICT) |
| `product_price` | GK `active_key` = `product_id:audience:interval:currency` when `active` UNIQUE (21 §2.2); `immutable_hash CHAR(64)` (§4); IX `(product_id,audience,billing_interval,currency,effective_from)`, `(stripe_price_id)` | →product RESTRICT; **no UPDATE of money columns** (§4) |
| `catalog_publish`, `catalog_change` | PK = catalog_version (INT); append-only | none |
| `feature_definition`, `feature_definition_limit`, `feature_dependency`, `license_preset`, `volume_tier`, `product_entitlement`, `bundle_item`, `entitlement_grant`, `promo_code` | per 21 §2 (PK `feature_key`; dependency PK `(feature_key,requires_feature_key,kind)`) | RESTRICT; presets' item lists JSON (§8) |
| `org_contract` | GK `active_key = org_id` when `status='ACTIVE'` (one active); UQ `(org_id,reference)`; `version`; two-person rule in service | composite→organization |
| `org_contract_price` | **adds `version_from INT NOT NULL`, `version_to INT NULL`** (⚑ gap in 23 §2.2: amendments must not rewrite a price row that an issued quote pinned; a read at contract version *v* uses rows with `version_from ≤ v < COALESCE(version_to,∞)`); `contract_event` records adds/removals | →org_contract RESTRICT (history) |
| `org_discount`, `org_discount_redemption` | UQ `code`; redemption UQ `(discount_id,org_id)` | redemption composite org |
| `org_billing_account` | UQ `org_id`, UQ `stripe_customer_id`, UQ `stripe_subscription_id` NULL-able | →organization RESTRICT |
| `consultant_license` | GK `active_key` one live per member; UQ `(org_id,id)`; IX `(org_id,status)`,`(org_id,member_id)`,`(org_id,ends_at)` | composite→org_member RESTRICT; `base_price_id`→product_price (single) RESTRICT |
| `license_feature` | `live`+`live_seq` unique `(license_id,feature_key,live_seq)` (20 §2.2) | composite→consultant_license; `price_id` single RESTRICT |
| `license_quote` | IX `(org_id,status,expires_at)`; `inputs_hash` CHAR(64) | RESTRICT; purge OPEN/EXPIRED > 90 d, APPLIED kept 7 y |
| `license_change` | UQ `stripe_idempotency_key` NULL-able; IX `(org_id,status,effective_at)`, `(license_id,created_at)` | composite→license/quote |
| `org_module_license` | GK live `(org_id,module_key,role_key)` | |
| `org_subscription`, `org_subscription_item` | UQ `stripe_subscription_id` NULL-able; `source STRIPE\|LOCAL`; `last_event_at` | mirrors, written only by `BillingWebhookService`/`LocalBillingApplier` |
| `org_invoice`, `org_invoice_line` | UQ `stripe_invoice_id` NULL-able; `source`; `compose_key` UQ for COMPUTED_INVOICE | lines CASCADE? **RESTRICT** (financial records, 7 y) |
| `org_stripe_discount`, `billing_drift` | `billing_drift` IX `(org_id,resolved_at)` | |
| `usage_event` | UQ `idempotency_key` (global, org-prefixed); IX `(org_id,feature_key,period_key,status)`, `(org_id,member_id,period_key)`, `(status,expires_at)`, `(org_id,created_at)` | composite→org_member (member **and** actor) RESTRICT |
| `usage_counter` | PK `(org_id,member_id,feature_key,limit_key,period_key)` (member_id 0 = pool) | maintained transactionally with events |
| `usage_period_rollup` | PK `(org_id,feature_key,period_key)`; `committed_qty, released_qty, events` | written by purge job before deleting events (§5) |
| `ai_call` (existing +) | + IX `(org_id,beneficiary_login,created_at)` | attribution only (R2a) |
| `stripe_event` (existing +) | `org_id` NULL | attribution only |

### 3.4 Talent and pipeline (all org-owned, composite FKs)
| Table | Keys / constraints | Notable indexes |
|---|---|---|
| `consultant_profile` | UQ `(org_id,member_id)` | `(org_id,availability_status,marketing_status)` |
| `consultant_profile_proposal` | | `(org_id,member_id,status)` |
| `org_resume` | GK `live_key=(org_id,resume_id)` when not ended; GK `primary_key`; `resume_id`→resume **CASCADE** (R6) | `(org_id,member_id,approval_status)` |
| `job_opportunity` | GK live `(org_id,posting_id)` and `(org_id,requirement_id)`; CHECK exactly one; `dedupe_key` UQ live | `(org_id,status)` |
| `org_job_bank` | UQ `(org_id,consultant_member_id,name)` | |
| `opportunity_match` | **UQ `(org_id,opportunity_id,consultant_member_id)`** (duplicate guard) | `(org_id,consultant_member_id,status)`, `(org_id,status,assigned_at)` |
| `candidate_submission` | GK live UQ `(org_id,requirement_id,consultant_member_id)` | `(org_id,match_id)`, `(org_id,status)` |
| `pipeline_application_link` | UQ live `(org_id,match_id)` and `(org_id,application_id)`; `application_id`→application **SET NULL** + `application_title` snapshot | |
| `pipeline_task` | | `(org_id,assignee_member_id,status,due_at)` |
| `interview_slot` | `interview_id`→interview **SET NULL** | `(org_id,consultant_member_id,starts_at)` |
| `offer`, `placement`, `placement_extension` | `placement.offer_id` NOT NULL UQ; extension chain self-FK | `(org_id,status,start_date)`, `(org_id,consultant_member_id)` |
| `pipeline_event` | append-only; keyset `(org_id,entity_type,entity_id,id)` and `(org_id,created_at)` | purge 36 mo |
| `client_account` | GK `name_key = LOWER(name)` UQ per org | `(org_id,kind,status)` |
| `client_contact`, `client_relationship`, `client_requirement` | requirement GK `dedupe_key` live | `(org_id,status,closes_at)` |
| `employment_record` | effective-dated: `effective_from`, `superseded_by_id`; GK one current row per member | `(org_id,member_id,effective_from)` |
| `hr_checklist_template`, `hr_checklist_item_template`(CASCADE), `hr_task`, `org_policy`, `policy_ack` | `policy_ack` UQ `(org_id,policy_id,policy_version,member_id)` — version-pinned, `member_login` snapshot scrubbed on erasure, row survives (legal record) | `(org_id,member_id,status)` |
| `talent_pool`, `talent_pool_member` | UQ `(pool_id,member_id)` | |
| `org_webhook`, `org_webhook_delivery`(CASCADE) | secret via `SecretBox` (never plaintext); delivery IX `(org_id,status,next_attempt_at)` | purge deliveries 30 d |
| `org_sso_config` | UQ `org_id`; metadata/cert only (no client secrets in plaintext: `SecretBox`) | |

## 4. Effective-dated, immutable prices (ADR-013)

| Table | Time dimension | Overlap rule | Immutability |
|---|---|---|---|
| `product_price` | `effective_from` / `effective_until` + `catalog_version` | one active row per `(product,audience,interval,currency)` — GK `active_key` UNIQUE + `PriceOverlapIT` (no two rows' `[from,until)` intersect for the same key) | Money columns (`amount_minor, currency, billing_interval, product_id, effective_from`) are **never UPDATEd**. Correction = insert a new row, retire the old (`active=false`, `retired_at`). `immutable_hash = sha256(product|audience|interval|currency|amount|from)` set on insert; nightly `PriceIntegrityJob` recomputes and raises a HIGH alert on mismatch (tamper/bug detection). No DB triggers (binlog/SUPER constraints; `ImmutablePriceIT` + hash instead) ⚑ |
| `volume_tier` | `effective_from/until` | non-overlapping ranges per product enforced on save + test | rows retired, not edited |
| `org_contract` | `starts_at/ends_at` + `version` | one ACTIVE per org (GK) | amendment = `version+1` |
| `org_contract_price` | `version_from/version_to` (§3.3 ⚑) | read at version *v* | closed with `version_to`, never edited |
| `org_discount` | `starts_at/ends_at` (required, ≤ 12 mo) | n/a | `archived_at` |
| `consultant_license.base_price_id`, `license_feature.price_id` | pinned to the price row id | n/a | a license never silently re-prices; a re-price is a `license_change` through a quote |
| `org_invoice_line` | snapshot of description/amount/price id/qty/period | n/a | never recomputed from catalog |

Historic query pattern: "what did Acme pay for `ai.resume_tailoring` on 2026-12-03?" = license_feature row (`price_id`) → `product_price` row — always answerable because no price row is ever mutated or deleted.

## 5. Usage ledger: volume, retention, rollup
- Expected volume: ≤ 50 consultants/org × ≲ 300 events/consultant/month ⇒ ≲ 15 k rows/org-month; 1 000 orgs ⇒ 15 M/month worst case — far above launch (≤ 20 orgs). Keyset pagination + `(org_id,created_at)` index keep reads flat.
- `UsageEventPurgeJob` (daily, per org, batch 5 000): for events older than `enterprise.usage.retention_months` (24) it **first** upserts `usage_period_rollup` (committed/released quantities, event count, overage quantity) then deletes the batch, in one transaction per batch. `usage_period_rollup` is kept 7 years (money-adjacent). `usage_counter` rows for periods older than 3 months are dropped (derivable).
- `RESERVED` rows are swept to `RELEASED(TIMEOUT)` by `UsageSweeperJob` (60 s) — never purged while `RESERVED`.
- Partitioning: **not** now; revisit when any org-month exceeds 5 M rows (RANGE on `created_at` requires PK change ⇒ would need a non-additive migration; decide then, ⚑ deliberately deferred).
- `pipeline_event` 36 months, `org_audit_event` 7 years (tenant record; HIGH rows forever), `entitlement_decision_log` 90 days.

## 6. Migration map from existing org / subscription tables

| Existing | Becomes | Method | Reversible by |
|---|---|---|---|
| `organization.*` | kept; + tenancy columns; `type` VARCHAR(20) → VARCHAR(40) because `PROFESSIONAL_SERVICES` (21 chars) does not fit (⚑ the one `modifyDataType` in the programme: widening VARCHAR is online and lossless; `LiquibaseAdditiveTest` allow-lists exactly changeSet `ent-tenancy-org-type-widen`) | additive + 1 allow-listed widening | flag off (column stays wide) |
| `org_member.role` | dual-written from `org_member_role` primary; never dropped | `LegacyRoleMirror` | flag off ⇒ reads revert to the enum, already correct |
| `org_member.support_owner_member_id` | STAFF flow unchanged; consultants use `org_assignment` | backfill for consultants only | n/a |
| `org_domain` (email auto-join) | untouched; **not** `org_hostname` | — | — |
| `org_group` | + parent/lead | additive | — |
| `data_share*` | untouched; `org_feature_consent` added | — | — |
| `organization.stripe_customer_id`, `billing_email` | mirrored into `org_billing_account` (both directions until Phase 6 exit) | `ent-billing-account-mirror` | stop dual-write job |
| legacy org seat Stripe prices/subscriptions (old Phase 18 plan) | **not migrated**; coexist; an org on legacy seats is not enterprise-billed (`billing_mode=NONE`) ⚑ product choice: migration of any real legacy-seat org is a manual admin conversion (44 §7) | manual | n/a |
| `subscription` (personal) | **untouched**; written only by the personal webhook path | `WriterRegistryTest` | — |
| `ai_call` | + 4 nullable columns | additive | — |
| `job_match` | untouched; `opportunity_match` is new | — | — |
| `application`, `interview`, `resume*` | untouched; link tables; `interview.application_id` NULLable (Phase 9) | additive | — |
| `org_audit_event` | + 3 columns, indexes | additive | — |
| `jhi_user` | + `phone, title, avatar_key` | additive | — |
| `refresh_token` | + `org_id, user_agent, last_used_at` | additive; old tokens have NULL `org_id` ⇒ treated as PLATFORM sessions | — |

Data-volume impact on migration: all tables are new/empty except the three backfills (`org_member_role` ≈ members; `org_billing_account` ≈ orgs with Stripe customers; `org_assignment` ≈ consultants with `support_owner`). Production today has ≈ 0 orgs with members (prod data was rebuilt empty 2026-09-17), so backfills run in milliseconds; they are still written idempotently for dev/demo DBs.

## 7. Per-phase backfill + verification + rollback (operator view)

| Ph | Pre-flight | Verify after deploy (SQL / job) | If wrong |
|---|---|---|---|
| 1 | `mysqldump` (nightly exists; take a manual one before first enterprise deploy) | `SELECT COUNT(*) FROM org_member m LEFT JOIN org_member_role r ON r.member_id=m.id AND r.ends_at IS NULL WHERE m.status IN('ACTIVE','SUSPENDED','INVITED') AND r.id IS NULL` = 0; one `is_primary` per live member | rerun backfill changeset (idempotent) or leave `flag.enterprise.roles` off |
| 3 | DNS wildcard exists | `ent_job_run` shows `HostnameCheckJob` OK | flag off |
| 4 | | `OrgMemberRoleAuthoritativeIT` + verification job (X4.10) = clean for 7 days | keep enum fallback |
| 5 | catalog ships **without prices** | `product_price` count = 0 until admin publishes; margin guard report | nothing to roll back |
| 6 | Stripe test mode only until go-live checklist | reconciler `billing_drift` empty after test-clock run | flag off; Stripe objects in test mode are disposable |
| 7–11 | | each phase's registry lines green in prod smoke (read-only) | flag off |

## 8. JSON column policy

| Rule | Detail |
|---|---|
| Allowed uses | (a) **snapshots** of computed state at an instant (`license_quote.lines_json`, `license_change.payload_json`, `contract_event.before/after_json`, `usage` none); (b) **allow-listed config** (`org_branding.terminology_json/nav_prefs_json/draft_json`, `feature_definition.eligibility_json`); (c) **key lists** (`license_preset.feature_keys_json`, `org_contract` scope lists); (d) **small free-text bags scanned for PII** (`interview_slot.feedback_json`, `consultant_profile.skills_json`, `org_policy` none). |
| Forbidden | anything filtered, joined, sorted, uniquely constrained, authorised on, or summed. If a JSON key becomes queried, **promote it to a real column** (additive) — no JSON generated-column indexes in this programme. |
| Shape | every JSON column has a Java record + `"v": <int>` schema version; `JsonSchemaGuard` validates on write and tolerates unknown keys on read; max `enterprise.json.max_bytes` (64 KB, DB column type `JSON`, not TEXT). |
| PII | JSON that can carry free text passes `SensitiveContent.check(path,node)` before save (36 §5). |
| CI | `JsonColumnPolicyTest` parses changelogs; every `type="JSON"` column must appear in `json-columns.allowlist` with its record class; a new JSON column without an entry fails. |

## 9. PII hooks (no SSN / tax / bank / passport / visa / I-9 / DOB — anywhere, product-wide)

1. **Schema deny-list** — `NeverCollectedSchemaTest` parses **all** `ent_*` changelogs (and DTO classes by reflection): fails on any column/field whose name matches `(?i)(ssn|social_?sec|itin|tax_?id|\bein\b|national_?id|bank|routing|iban|swift|account_?number|passport|visa|i-?9|driver_?licen[cs]e|dob|birth|card_?number|cvv|pan_)` (allow-list: `work_auth_category` (self-declared label), `bank` in the English sense `job_bank`/`org_job_bank` via explicit allow entries). Extends H's `HrFinanceNeverCollectedTest`.
2. **Write paths** — `@NoSensitiveText` on every `String` DTO field under `web/rest/org/{hr,finance,pipeline,talent}/**`, `SensitiveContent.check` for JSON, `PdfTextScanner` for policy PDFs, per-cell scan for CSV imports (`SensitiveTextCoverageTest` enforces the annotation). A hit refuses the write: `422 SENSITIVE_CONTENT {path, kind}` — the value is **never** logged or returned.
3. **Read/AI paths** — AI prompts through `AiInputs.forModel → SensitivePatterns.redact`; exports pass a `redact` pass.
4. **Stripe** — cards never touch us; `tax_status` is a label only; Stripe tax-ID collection stays off (CLAUDE.md); `org_billing_account` has no tax identifier column.
5. **Sweep job (defence in depth)** — weekly `PiiSweepJob` runs `SensitivePatterns.scan` over a sample of free-text columns (`notes`, `summary`, `reason`) of enterprise tables and writes **counts only** to `ent_job_run.detail`; any hit pages an operator (44 §10) — it never copies the value.

## 10. Lifecycle and erasure (what happens to each table when…)

| Event | Org-owned member data | Ledgers / audit | Person data |
|---|---|---|---|
| **Member leaves / removed** | `org_member` → LEFT/REMOVED; licenses `ENDED(MEMBER_LEFT)` now; open `org_assignment` ended; `org_resume` links ended (rows kept, `ended_at`); consent rows revoked; open matches WITHDRAWN `CONSULTANT_LEFT` (09 row 4 order) | kept | untouched (their resumes remain theirs) |
| **Account erasure** (`AccountDeletionService`) | `org_member` anonymised as today (`user_id` NULL, name/email nulled, status `ERASED`); `consultant_profile` free text cleared; `org_policy_ack` keeps `member_id` + version, drops `member_login`→`erased:<memberId>` | `ErasureRegistry` scrubs every registered login/email-bearing column (`usage_event.actor_login/beneficiary_login`, `ai_call.*login`, `org_audit_event.actor_login/target_login/beneficiary_login`, `pipeline_event` none (ids), `consent_event.*_login`, `break_glass_grant.admin_login` is **not** a member — never scrubbed) to `erased:<memberId>`; **counts and money survive**; `ErasureRegistryCoverageTest` fails if a new ent column named `*_login`/`*email*`/`*_name` isn't registered or explicitly exempted | personal subscription cancelled (existing); resumes deleted per existing flow ⇒ R6 SET NULL / CASCADE rules apply |
| **Org suspended** (billing) | rows untouched; resolver → UNKNOWN; licenses `ENDED(ORG_SUSPENDED)` (27) | kept | untouched |
| **Org closed** | soft: status CLOSED; data kept `enterprise.org.closed_retention_months` (default 12) then `OrgPurgeJob` **anonymises** (names/contacts/notes cleared, money mirrors + audit kept) — never hard-deletes `organization` ⚑ (GDPR "erasure of org contacts" vs 7-y finance records) | audit 7 y | untouched |
| **Hostname removed** | row kept (REMOVED, key cleared) | audit | — |
| **Retention** | per §11 jobs | | |
| **Org export** (data portability) | `GET /api/orgs/{id}/export` (OWNER, async, CSV zip, no resume files) — Phase 12; audited | | |

Platform-admin reads of tenant data never copy data out: they go through `break_glass_grant` projections and write HIGH audit rows into the **tenant's** log (42 §3.9).

## 11. Retention summary

| Data | Keep | Job | Notes |
|---|---|---|---|
| `usage_event` | 24 mo detail → `usage_period_rollup` 7 y | `UsageEventPurgeJob` | setting `enterprise.usage.retention_months` |
| `usage_counter` | 3 mo | `UsageCounterPurgeJob` | derivable |
| `pipeline_event` | 36 mo | `PipelineEventPurgeJob` | |
| `org_audit_event` | 7 y (HIGH forever) | none now | append-only |
| `license_quote` | OPEN/EXPIRED 90 d; APPLIED 7 y | `QuotePurgeJob` | |
| `org_invoice*`, `org_subscription*`, `billing_drift`, `license_change`, `contract_event` | 7 y | none | financial record |
| `idempotency_record` | 24 h | `IdempotencyPurgeJob` | |
| `ent_job_run`, `le_issuance`, `entitlement_decision_log` | 30 d / 120 d / 90 d | | |
| `org_webhook_delivery` | 30 d | | |
| `consent_event`, `policy_ack`, `break_glass_grant` | 7 y | none | evidence |
| `org_hostname` REMOVED rows | 2 y | `HostnamePurgeJob` | names re-registrable meanwhile (GK cleared) |

All retention numbers are settings in `EnterpriseSettingKeys` (admin-editable, never hard-coded).

## 12. Database CI gates (all run in `./gradlew test integrationTest`)

`LiquibaseAdditiveTest` · `TenantKeyPolicyTest` (R1/R2/R2a) · `CompositeTenantFkTest` (R3) · `DeleteRuleAllowListTest` (R4) · `GeneratedKeyTest` · `ColumnTypePolicyTest` (R7) · `JsonColumnPolicyTest` (§8) · `NeverCollectedSchemaTest` (§9) · `ErasureRegistryCoverageTest` (§10) · `MigrationUpgradeIT` (empty DB **and** a DB loaded from the previous release's schema snapshot `src/test/resources/db/prev-release.sql`, then all new changelogs, then `OrgIsolationIT` smoke) · `PriceOverlapIT`/`ImmutablePriceIT` (§4) · `PersonDeleteDoesNotBlockIT` (R6).

## 13. Design review decisions on the ⚑ items (Session E Task 4, 2026-10-12)

| Item | Decision | Consequence |
|---|---|---|
| R2a closed list of attribution ledgers | **Accept**, extended: `ATTRIBUTION_LEDGERS = {ai_call, stripe_event, refresh_token, break_glass_grant}` (`break_glass_grant` is platform-owned with a NOT NULL `org_id` but no tenant route — X6.17); `platform_metric_daily`, `user_mfa_method`, `user_recovery_code`, `shedlock`, `rate_limit_bucket`, `cache_invalidation` are platform tables without `org_id` (`TenantKeyPolicyTest` allow-list) | X6.17, X12.5, X12.11, X12.12 DB bullets |
| R3 composite tenant FKs, DDL-only | **Accept** | `CompositeTenantFkTest` stays the gate; JPA maps plain columns |
| R6 person deletes never blocked by org rows | **Accept** | `PersonDeleteDoesNotBlockIT` |
| Row 2 `login_challenge` vs the `AdminMfaService` table | **Change**: no new table — `admin_mfa_challenge` gains nullable `org_id`, `kind (EMAIL\|TOTP\|PASSKEY)`, `hostname_id` (additive); X2.14 writes it, X12.11 extends it, X12.5 makes it the only challenge store (no in-memory state) | X2.14, X12.5, X12.11 |
| Row 6 `20261020020000_ent_break_glass` | **Change**: that timestamp is X6.14's mirrors file; break-glass is `20261020030000_ent_break_glass.xml` owned by **X6.17** | X6.17 |
| `org_contract_price.version_from/version_to` | **Accept** — applied to 23 §2.2 and X5.5/X5.15 (Task 3) | — |
| `product_price` immutability by hash + nightly job (no triggers) | **Accept** | `ImmutablePriceIT`, `PriceIntegrityJob` |
| `usage_event` partitioning deferred | **Accept** (revisit at 5 M rows per org-month) | — |
| `organization.type` VARCHAR(20→40) — the one `modifyDataType` | **Accept** (online, lossless widening) — the single allow-listed exception to 06 §4 rule 4; escalated as **E21** for visibility | `LiquibaseAdditiveTest` allow-list `ent-tenancy-org-type-widen` |
| Legacy org-seat Stripe rows not migrated | **Accept** — manual admin conversion per org; **E22** asks the user whether any real org is on legacy seats | 44 §7 |
| Org CLOSED → anonymise after 12 months, never hard-delete | **Accept** — folded into **E13** (retention periods) for the user's confirmation | `OrgPurgeJob` |

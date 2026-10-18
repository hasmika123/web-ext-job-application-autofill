# 02 — Architecture debate (23 topics) and the CLAUDE.md reconciliation

> Status: decided, 2026-10-12. Council: SaaS, Security, Billing, Database, UX, Product, Engineering,
> QA, DevOps. Each topic ends in a **final decision** that has an ADR (`adr/ADR-NNN-*.md`).
> Decisions are deliberately safe and reversible. Anything that touches security, money, destructive
> migration or contract behaviour is also listed in `08-decisions-for-user.md`.
>
> Part A reconciles the requirements against `CLAUDE.md`'s locked decisions (tensions a–g plus the
> ones found during the audit). Part B is the 23-topic debate. Facts about the code come from
> `01-existing-system-audit.md`.

---

## Part A — Reconciliation with CLAUDE.md (the conflicts we will not override silently)

| # | Requirement text | Locked decision | Resolution | Escalation |
|---|---|---|---|---|
| **a** | §12 "submit through authorized supported channels"; §15 feature "Approved Job Application Automation"; §32-D "Sarah submits through an authorized workflow" | "Consultancy Marketer … **never submits and never signs in as a consultant**; the consultant … runs the fill and submits"; "**No auto-submit, ever**"; Autopilot "stops before submit… never ticks attestation boxes" | Two different objects: a **candidate submission** to a client/vendor requirement (a CRM record: resume sent to a vendor contact — recorded, optionally emailed by the marketer *from their own mailbox*, never by Kiwiply) and a **job application** on an ATS/job board (consultant-owned, submitted only by the consultant in their own session). "Approved Job Application Automation" = Autopilot batch-prepare for the consultant, stops before submit. Marketers get *prepare, request, record, follow up*; never *submit*. | **E1** (confirm this reading; the alternative violates CLAUDE.md and the platform's store/legal posture) |
| **b** | §6 HR "employee records, HR documents, compliance tasks"; Finance "payments"; §25 Finance "Payments" | "We never collect sensitive PII… not asked for, accepted, extracted, learned, sent to AI, or stored"; Consultancy Ops "Record money, never move it; no bank numbers, SSNs or tax IDs" | HR = **lifecycle records** (title, department, manager, start/end, status, policy acknowledgements, compliance *checklists* with done/not-done and due dates), **no identity documents** and no document extraction. Finance = **records** (placement rates, invoice records, payment *status* with an external reference) — Kiwiply never executes a payment. The existing `SensitivePatterns` scanner guards every new text and upload path. | **E2** |
| **c** | §14–17 per-consultant base + individually priced features, contracts, volume discounts, presets | Org = one-time setup fee + per-person items **priced above individual**; ≥ 80 % worst-case margin; nothing unlimited; AI budgets; **no annual plan**; **no refunds**; prices from the admin catalog, never code | Fully compatible once "per-person items" are read as *base license + feature add-ons*. The existing "Pro seat / Autopilot seat" rows become **presets** (base + feature set) whose configured price still satisfies the ≥ individual rule and the margin guard. Billing intervals: MONTH (and QUARTER only if the catalog allows); no ANNUAL. Removals take effect at period end (= no refunds). Every feature carries a usage allowance (= nothing unlimited). Setup fee stays. | **E3** (the base price and preset composition are admin inputs; confirm the model) |
| **d** | §6, §8 configurable permissions, multiple roles per user, scopes Own/Assigned/Team/Department/Org | Existing `OrgRole` enum with compiled matrix (tenant-model.md decision 5: "custom roles are Phase 8") | Enterprise V2 *is* that Phase-8 item. Role **templates** are seeded from the enum (the matrix becomes data), org admins may clone and edit templates, a member holds N roles; scopes are normalised to the five requested values. The `org_member.role` column stays as the *primary* role and is written through for compatibility. | **E4** (custom roles may never exceed the granter's own permissions; OWNER is immutable) |
| **e** | §3.2 custom domains + HTTPS; "evaluate Cloudflare for SaaS, CloudFront, or other" | Single box; BeeCompete's edge Caddy owns :80/:443; **never run our own**; Cloudflare DNS grey-cloud; `api.kiwiply.com` exception; CI/CD never touches the edge | Caddy **on-demand TLS** at the shared edge (one hand-applied global option + one catch-all block, `ask` → our API) for both subdomains and custom domains; a wildcard DNS record for `*.kiwiply.com`; Cloudflare for SaaS documented as the scale-up path (it requires orange-cloud, i.e. reversing a locked DNS decision). | **E5** (the edge change is outside this repo and affects BeeCompete; the user applies it) |
| **f** | §22 org-funded entitlements apply in the org workspace; extension gates AI on plan | Extension = single account, no login of its own, mirror pulls `/api/profile/version {plan}`; `/connect` only from kiwiply.com | Phase 1–8: extension stays personal. Phase 9: `GET /api/profile/version` adds `workspaces[]` and the extension's drawer gets a workspace selector; the token is still user-only, the server scopes by an explicit `X-Kiwiply-Workspace` header checked against membership. `/connect` stays on kiwiply.com (same account). | **E6** (low) |
| **g** | Reuse the paused org dashboard work | The user paused it pending these requirements | Adopt branch A's gate/nav/switcher logic and branch B's invite/join/consent API as Phase 1–2 inputs after re-verification; rework the WIP dashboard into the Org Admin Dashboard; consolidate the duplicated web helpers. Nothing is thrown away; nothing WIP is trusted. | — |
| **h** (found) | §6 Platform Super Admin "privileged access to customer data must remain separately restricted and audited" | tenant-model.md decision 3: platform admins reach org data only through the admin console with an audited reason | Keep: break-glass read with typed reason (`ReasonSheet` exists), `OrgAuditEvent` row visible to the org's audit log, MFA re-auth. | **E8** |
| **i** (found) | §9 "multiple memberships per global identity"; branch B invite binds to any signed-in account | — | Enterprise orgs default to `org.invite.require_email_match=true`; the join page says which account the invite was for. | **E7** |
| **j** (found) | §3.3 "Do not fall back to another organization's portal or Kiwiply's public website" vs existing `/org/*` path console on kiwiply.com | — | Both coexist: `kiwiply.com/org/*` is the *personal-side* org chooser for people who administer orgs from their personal account; the tenant host is the enterprise portal. Unknown hosts → a tenant-404 page, never a redirect. | — |

---

## Part B — The 23 topics

Format per topic: **Problem · Options · Pros/Cons · Security · Financial · Complexity · Migration risk · Recommendation · Final decision (ADR)**.

### 1. Tenant isolation model
- **Problem.** One MySQL, one API, one web. Where does the tenant boundary live, and how is it enforced so that a bug in one query cannot leak Beta's rows to Acme?
- **Options.** (A) Shared schema, `org_id` discriminator on every org-owned table, repository contract "orgId first", generic 404 (today's pattern). (B) Schema-per-tenant on MySQL with dynamic datasource routing. (C) Database-per-tenant. (D) A plus Hibernate `@Filter`/`@TenantId` auto-filtering. (E) Row-level security — not available in MySQL.
- **Pros/Cons.** A: proven in this repo (`OrgIsolationIT`), cheap, one migration path; relies on discipline (tests). B/C: strong blast-radius isolation; breaks every existing user-owned table (resumes, applications are *not* org-owned), Liquibase per schema, backups ×N, connection pools ×N on a 512 MB JVM — no. D: convenience on top of A, but Hibernate filters silently *hide* rows rather than failing loudly, and don't cover native queries.
- **Security.** A is only as good as the contract tests → the tests are the gate (every org repository method exercised cross-tenant; every route annotated). D adds defence in depth but can mask bugs. Member-owned data (resume, application) is deliberately **not** org-keyed; the org reads it through consent (`data_share`) — keeping that boundary is itself an isolation property.
- **Financial.** A: zero infra cost. B/C: hosting multiplies.
- **Complexity.** A low; D medium; B/C high.
- **Migration risk.** A none (existing tables already follow it).
- **Recommendation.** A, with the request-scoped `TenantContext` making the active tenant explicit, and a reflection contract test that fails the build for any org-scoped repository method without a leading `orgId`.
- **Final decision.** **Shared schema + `org_id` discriminator + explicit tenant context + contract tests; no Hibernate auto-filter; member data stays person-owned and consent-viewed.** → ADR-001.

### 2. Custom-domain provider
- **Problem.** `careers.acme.com` must get a certificate and reach our web container, on a box whose :80/:443 belong to a Caddy outside this repo, with Cloudflare DNS in grey-cloud.
- **Options.** (A) Caddy **on-demand TLS** at the shared edge: global `on_demand_tls { ask http://dossier-api:8080/api/internal/tenant-hosts/check }`, a catch-all `https://` block `tls { on_demand }` → `dossier-web:3000`; customers CNAME to `edge.kiwiply.com` (or A to the box). (B) **Cloudflare for SaaS** (Custom Hostnames): Cloudflare terminates TLS for customer hosts; needs the zone **orange-clouded** and a fallback origin; priced per hostname above the included quota. (C) **CloudFront + ACM**: per-domain ACM certs validated by customer CNAME, a distribution with alternate names; moves the edge to AWS, breaks the "co-hosted single box" model and Caddy rate-limit assumptions. (D) Our own second Caddy on alternate ports — pointless, the edge still owns 443.
- **Pros/Cons.** A: no new vendor, HTTP-01 works because DNS is grey-cloud, zero per-host cost; needs a one-time edge change we do not own, LE rate limits (50/registered-domain/week — fine for custom domains, a concern only for *our* subdomains), customers must not orange-cloud their CNAME. B: best operational story at scale (cert renewals, DDoS); reverses the grey-cloud decision, adds spend, and the edge still needs a catch-all route. C: heavy, changes hosting.
- **Security.** A: the `ask` endpoint must answer 200 only for **verified + active** hostnames (otherwise anyone can make our edge mint certs for arbitrary names → rate-limit abuse). Internal-network only. B: Cloudflare sees traffic (TLS terminates there).
- **Financial.** A ≈ $0. B: per-hostname fees + plan. C: AWS egress.
- **Complexity.** A low in code (one endpoint + domain lifecycle), medium in ops (edge coordination). B medium. C high.
- **Migration risk.** A reversible (remove the block). B requires DNS mode change (reversible but disruptive).
- **Recommendation.** A now; B as the documented scale-up path when > ~200 custom hosts or DDoS exposure justifies it.
- **Final decision.** **Caddy on-demand TLS at the shared edge with an `ask` endpoint; wildcard DNS `*.kiwiply.com` A record (grey-cloud) also served by on-demand per-host certs (no DNS-01 plugin needed); Cloudflare for SaaS reserved.** → ADR-002. Escalation E5.

### 3. Hostname resolution
- **Problem.** Given `Host`, pick exactly one tenant or none, on every request, without trusting anything the browser sends beyond the host itself, and without the browser ever naming a tenant id.
- **Options.** (A) Web `proxy.ts` resolves the host via the API's public tenant endpoint and forwards a *resolved org id* header to the API. (B) Web forwards the **raw host** (`X-Kiwiply-Host`), and the API resolves it itself (`TenantResolver`) — both sides resolve, API is authoritative. (C) API resolves from the standard `X-Forwarded-Host` the edge sets — but the browser talks to the BFF, not the API, so the API never sees the tenant host unless the BFF forwards it.
- **Pros/Cons.** A: one resolution, but the API then trusts a tenant *id* from a caller — the exact anti-pattern §5 forbids (the extension calls the API directly and could spoof it). B: the API resolves from a host string; a spoofed host can at most select a tenant the caller is not a member of, and membership/permission checks still apply → spoofing yields nothing. Public branding is public anyway.
- **Security.** B is the only option where no caller supplies a tenant id. Resolution order is strict: exact `org_hostname` match (ACTIVE) → `{slug}.kiwiply.com` for orgs with subdomain enabled → reserved hosts (`kiwiply.com`, `www`, `app`, `api`, dev hosts) = PLATFORM → otherwise **UNKNOWN → 404**, never a fallback.
- **Financial.** Negligible; a 60-second in-process cache with version bump.
- **Complexity.** Low–medium.
- **Migration risk.** None.
- **Recommendation.** B.
- **Final decision.** **The BFF forwards the raw host; the API's `TenantResolver` is authoritative; the tenant id is never accepted from a client; unknown hosts fail closed with a tenant-404.** → ADR-003.

### 4. Custom-domain authentication
- **Problem.** Sessions are host-only cookies. Acme users sign in on `careers.acme.com`; the same person may also use `kiwiply.com`. How are sessions scoped so a token from one tenant cannot be used on another, and what about Google sign-in?
- **Options.** (A) Keep host-only cookies; mint **tenant-bound tokens** (`tid` claim) when login happens in a tenant context; the API refuses org routes whose `{orgId}` ≠ `tid`. (B) Shared cookie on `.kiwiply.com` for subdomains + separate cookies for custom domains (two models). (C) A central auth host (`auth.kiwiply.com`) issuing one-time codes to tenant hosts (OIDC-like SSO) — real cross-domain SSO.
- **Pros/Cons.** A: simplest, strongest isolation, one model for both subdomains and custom domains; cost = one login per host (acceptable: enterprise users live on one host). B: two models, cookie-domain leakage between tenants on subdomains — rejected. C: correct long-term SSO but a new auth surface; defer to Phase 12 with SAML/OIDC.
- **Security.** A: tokens bound to tenant; refresh families already per login; personal tokens (no `tid`) keep working on kiwiply.com; a `tid` token used on `/api/orgs/{other}` → 404. Google sign-in needs each custom origin registered in the Google console (manual) → password + email verification first, Google per-domain as a Phase 3 option.
- **Financial.** None.
- **Complexity.** Low.
- **Migration risk.** None (claim absent = today's behaviour).
- **Recommendation.** A.
- **Final decision.** **Host-only sessions, tenant-bound access/refresh tokens (`tid`), login-first on the tenant host, no cross-domain cookie sharing; SSO (SAML/OIDC) is Phase 12.** → ADR-004.

### 5. Multi-role permissions
- **Problem.** The enum matrix cannot express "Sarah is Org Admin and Marketing Manager" or an org-edited role.
- **Options.** (A) Keep the enum; add a second `role2` column — no. (B) `org_role` table (system templates + org-defined), `org_role_permission` (permission key, scope), `org_member_role` join; effective permissions = union, scope = widest; templates seeded from `OrgRole`. (C) Full ABAC/policy engine (OPA/Cedar) — overkill for the current team and box.
- **Pros/Cons.** B: data-driven, auditable, keeps the existing permission keys and the interceptor; needs a cache per membership and a backfill. C: flexible, new runtime dependency, hard to test exhaustively.
- **Security.** B: role editing is itself a permission (`roles.manage`) with the rule *a granter cannot grant what they do not hold*; OWNER template immutable; the "last admin" guard exists (O5.2). Every change audited.
- **Financial.** None.
- **Complexity.** Medium.
- **Migration risk.** Low: additive tables; backfill one `org_member_role` per seat from `org_member.role`; the enum column is written through as the primary role until Phase 4 ends.
- **Recommendation.** B.
- **Final decision.** **Role templates as data, N roles per membership, union-of-permissions with widest scope, enum kept as seed + primary-role mirror.** → ADR-005. Escalation E4.

### 6. Basic profile vs consultant profile
- **Problem.** §7: one basic profile per member; consultants additionally have a career profile; admins must not be forced through a career profile.
- **Options.** (A) Reuse the personal career profile (`Bio`/`ProfileItem`) as the consultant profile, visible to the org by consent. (B) A separate org-owned copy of the career profile. (C) A: personal profile stays the *source* + an org-scoped **overlay** `consultant_profile` (availability, marketing status, bench date, preferences, self-declared work-authorisation category) keyed by membership.
- **Pros/Cons.** A alone lacks org-only fields. B duplicates and drifts, and violates "data belongs to people". C keeps one source of truth and adds only what is org-specific.
- **Security.** C: the overlay is org data (deleted with the membership); the career profile is read via `data_share` scope; FULL unlocks resumes/answers to the paired marketer only.
- **Financial/Complexity.** Low.
- **Migration risk.** None.
- **Final decision.** **Basic profile = user-level fields (`User` + additive `phone`, `title`) surfaced via the avatar menu; consultant profile = personal career profile (consent-viewed) + membership-scoped overlay.** → ADR-006.

### 7. Unified vs role-specific dashboards
- **Problem.** §25 lists eight role surfaces. Eight shells is unmaintainable; one shell with a 40-item sidebar is unusable.
- **Options.** (A) One shell, nav filtered by permission (branch A's `org-nav.ts` model), **workspaces** = curated nav groups per role template, home = primary role's home, switcher only when the user has > 1 workspace. (B) Separate shells per role. (C) One shell, one flat nav.
- **Pros/Cons.** A reuses components across roles (§26), keeps the basic profile in the avatar menu, satisfies "Org Admin lands on the Org Admin Dashboard". B duplicates. C overcrowds.
- **Security.** Navigation is presentation; every page re-checks on the server.
- **Complexity.** Medium (workspace definitions are data: `workspace_key → nav items → permission needs`).
- **Final decision.** **One enterprise shell, permission-driven nav, data-defined workspaces, primary-role landing, optional switcher.** → ADR-007.

### 8. Consultant–marketer relationships
- **Problem.** `org_member.support_owner_member_id` is a single field; §10 needs primary/backup/manager, effective dates, history, delegation and workload.
- **Options.** (A) Add more columns. (B) `org_assignment` entity (consultant member, assignee member, kind PRIMARY/BACKUP/MANAGER, starts_at, ends_at, reason, created_by) — the auditable history O3.2/O10.1 already sketched.
- **Final decision.** **`org_assignment` with kinds and effective dates; `support_owner_member_id` stays for the existing STAFF flow and is no longer written for consultants.** Consent FULL pairing continues to name the marketer (`data_share.full_to_member_id`); backup/manager get SUMMARY unless the consultant extends consent. → ADR-008.

### 9. Resume ownership
- **Problem.** §11 distinguishes personal resumes from organization-managed resumes with approval, visibility and audit.
- **Options.** (A) Move ownership of org-managed resumes to the org (`resume.org_id` owner). (B) Resumes stay user-owned; an `org_resume` link carries management rights (managed_by, approval state, visibility, primary-for-org, version pin). (C) Copy resumes into the org.
- **Pros/Cons.** A breaks "data belongs to people" and leaves orphans on departure. B: the consultant approves before use; leaving the org deletes the links, never the resume; the builder's `createdByLogin`/`updatedByLogin`, versions and `ResumeAccess` already give audit and sharing. C drifts.
- **Security.** B: marketer edits require FULL pairing + `resume.edit_for` permission + the link's `edit_allowed`; every edit creates a `ResumeDocVersion` with reason.
- **Final decision.** **User-owned resumes + `org_resume` link with approval and visibility; no ownership transfer.** → ADR-009.

### 10. Application authorization (the no-submit rule)
- **Problem.** Part A (a).
- **Options.** (A) Marketer may submit via "authorized channels" (requirements wording). (B) Marketer prepares and requests; consultant authorizes and submits; candidate *submissions* to clients are records (plus the marketer's own email). (C) B + Kiwiply sends submission emails on the marketer's behalf.
- **Pros/Cons.** A violates three locked rules and the store/legal posture. C makes Kiwiply a sender (locked: "we never send… mail"). B keeps every promise and still gives the pipeline the marketer wants.
- **Security/legal.** B: no server endpoint can submit; `NoSubmitSurfaceTest` (reflection) stays in CI.
- **Final decision.** **B.** Submission ≠ application; marketers prepare/request/record; consultants authorize and submit; attestation boxes never auto-ticked. → ADR-010. Escalation E1.

### 11. Client / vendor modelling
- **Problem.** Staffing chains: end client ← prime vendor ← sub-vendor ← our consultancy. Requirements come from any link; submissions go to a contact at one link.
- **Options.** (A) One `client` table with `kind` (END_CLIENT, VENDOR, PRIME) and a `client_relationship` edge table (from, to, kind, terms); requirements reference the issuing client and an optional `via_client_id` chain. (B) Separate `vendor`/`client` tables. (C) Free text.
- **Final decision.** **A — one `client_account` with kinds + relationship edges + contacts; requirements carry the issuing account and the via-chain; placements carry the bill-to account.** → ADR-011. HR/Finance scope per Part A (b) sits in the same ADR family: ADR-011 covers data minimisation for client, HR and finance records.

### 12. Base license plus add-ons
- **Problem.** §16: a required base license plus optional features vs. everything optional vs. fixed packages.
- **Options.** (A) Base mandatory, features optional, presets as shortcuts. (B) Everything optional (no base). (C) Fixed Basic/Pro/Premium only.
- **Pros/Cons.** A matches the locked "per-person items" + "nothing unlimited" + margin guard (the base carries the fixed costs: support, storage, seat admin). B makes margin per feature impossible to guarantee and allows a $0 licensed consultant. C is explicitly rejected by §14.
- **Financial.** Base ≥ individual Pro ÷ (1 − margin headroom) is an admin input; the margin guard checks base + each feature's worst-case AI budget.
- **Final decision.** **A.** Catalog products of kind `BASE_LICENSE` and `FEATURE`; `feature_dependency` with kinds TECHNICAL/COMMERCIAL/INTEGRATION/CONSENT; `license_preset` admin-defined. → ADR-012. Escalation E3.

### 13. Feature-catalog versioning
- **Problem.** Prices must never change under a contract; features evolve.
- **Options.** (A) Immutable `product_price` rows with `effective_from/until`, `catalog_version` stamp on publish (Phase 18 D2). (B) Mutable prices with history table. (C) Versioned catalog snapshots as JSON.
- **Final decision.** **A** — extend Phase 18: `catalog_version` monotonic; licenses reference `product_price.id`; invoices snapshot amounts; a feature definition (`feature_key`) is separate from its prices. → ADR-013.

### 14. Price overrides (contracts)
- **Problem.** Negotiated rates per org without double discounts.
- **Options.** (A) `org_contract` + `org_contract_price` (per product: fixed override amount **or** pct off list), precedence list → contract → discount → effective; override and promotional discount mutually exclusive by default. (B) Stripe coupons only. (C) Per-org catalog copies.
- **Financial.** A keeps a single pricing function, testable with a golden table; Stripe sees the *effective* price (as a per-org Stripe Price or as a coupon — topic 20).
- **Final decision.** **A.** Exact precedence: `list(price_version) → contract override (replaces) → best eligible discount (one, non-stacking unless contract says `stackable`) → volume tier (only if no contract override or contract says `volume_applies`) → effective`. → ADR-014.

### 15. Volume discounts
- **Options.** (A) `volume_tier` rows in the catalog (min licensed consultants → pct), one tier applies, evaluated per billing period on the count of licensed consultants. (B) Hard-coded. (C) None.
- **Final decision.** **A, shipped empty** (admin seeds tiers; CLAUDE.md "volume discounts come later as catalog prices, not code"). → ADR-015.

### 16. Usage credits (allowances)
- **Problem.** Per-consultant vs org-pooled allowances; retries; async reservations.
- **Options.** (A) Per-consultant allowances by default; `pool_mode` per catalog product (PER_CONSULTANT | ORG_POOL); `usage_event` ledger with `idempotency_key`, states RESERVED → COMMITTED | RELEASED; overage recorded, hard-stopped at allowance unless an `overage_price` exists (Phase 6+). (B) Org pool only. (C) Unlimited with fair use — forbidden.
- **Final decision.** **A.** AI cost budgets stay the second guard (`AiBudgetService`) keyed by beneficiary + org. → ADR-016.

### 17. Organization billing aggregation
- **Options.** (A) One Stripe customer and **one subscription per org**, one subscription item per distinct effective price, `quantity` = consultants carrying that line (identical charges aggregate); the per-consultant configuration lives only in Kiwiply. (B) One Stripe subscription per consultant. (C) Kiwiply computes the monthly invoice and creates invoice items itself.
- **Pros/Cons.** A matches `docs/design/org/billing.md`, prorations by Stripe, one invoice. B explodes objects and invoices. C simplest Stripe object model, but prorations and dunning become ours.
- **Final decision.** **A, with C as the flagged fallback** when Stripe's per-subscription item limit (topic 20) is hit. → ADR-017.

### 18. Existing subscription compatibility
- **Problem.** §22 and the locked rule: personal subscriptions untouched; benefits never auto-combine.
- **Options.** (A) `EntitlementService` gains an **`EntitlementContext`** (PERSONAL or ORG(orgId)); personal path unchanged (`isPro(login)`); org path resolves licenses; no stacking across workspaces. (B) Merge benefits "highest wins" (prior-art O3.3). (C) Two services.
- **Pros/Cons.** B contradicts §22 ("never combine… automatically"); the prior-art story is superseded. C duplicates. A keeps one seam and one 402 vocabulary (`PRO_REQUIRED` personal, `FEATURE_NOT_LICENSED` org).
- **Final decision.** **A.** Regression suite over `BillingResourceIT`/`BillingWebhookIT`/`EntitlementService` stays green; joining/leaving an org never touches `subscription`. → ADR-018.

### 19. Mid-cycle changes
- **Final decision.** **Add/upgrade = effective now with proration; remove/downgrade = scheduled to period end (no credit = no refunds); every change goes through a backend quote (`license_quote`, 15-minute expiry, price-version hash) and a `license_change` row (PENDING → APPLIED/CANCELLED) — the frontend never computes a charge.** → ADR-019.

### 20. Billing-provider limitations
- **Facts.** Stripe limits a subscription to **20 items**; prices are immutable; coupons apply at customer/subscription level; proration previews via upcoming invoice; test clocks exist; automatic tax; no tax-ID collection (locked).
- **Risk.** Base + up to 11 features + presets + contract-specific prices could exceed 20 distinct lines per org.
- **Final decision.** **Contract overrides map to Stripe coupons/discounts on the subscription (not new prices) to keep item count = distinct list prices (≤ ~13); if an org still exceeds the cap, the flagged fallback (ADR-017 option C: Kiwiply-computed invoice items on a `send_invoice` subscription) applies. Stripe test clocks in the QA runbook.** → ADR-020. Escalation E9.

### 21. Feature-entitlement enforcement
- **Final decision.** **One `EntitlementService.check(EntitlementRequest)` on the server for every protected feature (AI router, matching, inbox connect, autopilot, resume tailoring); evaluation order from §8 + §20 (tenant → membership → org status → permission → scope → module → license/feature → allowance → actor permission → assignment → consent → subscription state); annotation `@RequiresFeature(key, beneficiary=…)`; UI only reflects decisions.** → ADR-021.

### 22. Scalability
- **Final decision.** **Design for two instances, run one:** tenant/branding/permission caches are TTL + version-bumped (no sticky state), `org_id`-leading indexes, S3 keys `org/{id}/…`, MDC tenant id in logs, per-tenant rate-limit keys, ShedLock before replica 2 (Phase 12), MySQL only (no search engine) — tenant filters on FULLTEXT queries. → ADR-022.

### 23. Migration strategy
- **Final decision.** **Additive Liquibase only, backfills as separate changesets with preconditions, dual-write for the role column, feature flags per phase in the settings registry (`flag.enterprise`, `flag.enterprise.domains`, `flag.enterprise.roles`, `flag.enterprise.billing`, `flag.enterprise.marketing`, `flag.enterprise.hr_finance`), `OrgIsolationIT` + `TenantRepositoryContractTest` as CI gates, no table renames, no data moves.** → ADR-023.

---

## Part C — What this debate deliberately leaves to follow-up sessions
Session B (domains/branding/login/identity/dashboards UX), C (catalog/pricing/entitlements/metering/
billing), D (talent marketing/resumes/applications/clients/placements/HR/finance), E (API specs, test
plan, deployment plan, full story set). Each inherits these decisions and may only *refine* them;
reopening one requires a new ADR that supersedes the old.

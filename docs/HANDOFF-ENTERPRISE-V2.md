# HANDOFF-ENTERPRISE-V2.md — Enterprise V2 (multi-tenant portals, roles, consultant licensing, talent marketing)

> Branch: local **`enterprise-v2`** (cut from `5191298`, merged with the verified resume-builder tip
> `32046a8`). **Not pushed.** Design by Fable only; **all code is written by Sonnet agents** from the
> specs under `docs/enterprise-v2/`. The user's requirements (33 sections, 2026-10-12) are the source of
> intent; `CLAUDE.md`'s locked decisions win on conflict and every conflict is escalated in
> `docs/enterprise-v2/08-decisions-for-user.md`.

## START HERE

**Build branch:** `ev2-build-p1` (cut from `enterprise-v2` at `834e2fa`; not pushed). **Last story done:** X1.2 (`ev2-x1.2: ...`; X1.1 before it; `git log --oneline -4`). **Next story:** X1.3 (TenantResolver, public tenant endpoint, ask endpoint). Design branch `enterprise-v2` is the Phase 0 design only.

**First commands**
```bash
git checkout ev2-build-p1
git log --oneline -3
node docs/roadmap/build-master-roadmap.mjs --list | tail -4      # ent area present, 0 dangling ids
cat docs/enterprise-v2/README.md                                  # the index and who owns what
cat docs/enterprise-v2/progress-tracker.md                        # statuses
```

**If you are a design session (Fable):** pick your letter in `docs/enterprise-v2/README.md` (B domains/branding/login/identity/dashboards UX · C catalog/pricing/entitlements/metering/billing · D talent marketing/resumes/applications/clients/placements/HR/finance · E API specs/test plan/deployment plan/full story set). Read `00`–`08` first (they are short on purpose), then the ADRs your section names, then write only your files. Do not re-open an ADR without a superseding ADR. Write every story in the §30 format used in `07-backlog.md` §2 and add it to `docs/roadmap/areas/ent.json` by editing the generator spec, never by hand.

**If you are a build session (Sonnet):** X1.1 (flags in `EnterpriseSettingKeys`, `EnterpriseFeatureFlag`, `EnterpriseEnabledFilter`) and X1.2 (tenancy schema `20261015010000_ent_tenancy.xml`, `domain/ent`, `repository/ent`, `OrgTenancyService`) are done; take the next story in order. Build order for Phase 1: **X1.1 → X1.2 → X1.3 → X1.4 → X1.5 → X1.6 → X1.7 → X1.8 → X1.9 → X1.10 → X1.11 → X1.12** (X1.6/X1.7 may run in parallel with X1.3–X1.5 once X1.2 is in; X1.9 needs X1.12). Each story in `docs/enterprise-v2/07-backlog.md` §2 is build-ready (functional, UI, backend, DB, APIs, permissions, AC, tests). Loop per `CLAUDE.md`: one story → tests green → `progress-tracker.md` + `--set X1.n=…` → one commit `ent-x1.n: <subject>` → PR into `develop` (never `main`). Branch topic branches off `enterprise-v2` while the programme is private; the user decides when `enterprise-v2` merges to `develop`.

## What was done this session (Phase 0)
- Audited the real code at `ce30edc` (after merging `32046a8`), the three merging branches and the two parked org branches; wrote the reuse matrix, the subscription audit and the infra audit (`01-existing-system-audit.md`).
- Debated 23 topics and reconciled the requirements with `CLAUDE.md` (`02-architecture-debate.md`); one ADR per decision (`adr/`).
- Foundation design: `00` vision, `03` domain model (bounded contexts, every entity, migration map), `04` tenancy & security (resolution, context, per-layer isolation, negative tests, threat model), `05` permission model (11-step order, templates, scopes, actor/beneficiary), `06` phase plan (0–12, flags, migration strategy, DoD).
- Plan: `07-backlog.md` + roadmap area **`ent` (prefix `X`)** with 13 epics / 109 stories (Phase 1 fully specified), back-links from `org.json`/`admin.json`, roadmap regenerated with 0 dangling ids; `progress-tracker.md`; `08-decisions-for-user.md` (20 escalations with safe defaults).

## The decisions in one breath
Shared schema + `org_id` + explicit `TenantContext` (ADR-001) · Caddy on-demand TLS at the shared edge, Cloudflare for SaaS reserved (002) · the API resolves the host, clients never name a tenant, unknown hosts 404 (003) · host-only sessions + `tid` claim (004) · roles as data, N roles per member, five scopes, ceiling rule (005) · basic profile vs membership-scoped consultant overlay (006) · one shell, permission nav, data-defined workspaces (007) · `org_assignment` history (008) · person-owned resumes + `org_resume` links (009) · **marketers prepare, consultants submit, Kiwiply never submits** (010) · one client model with relationship edges; HR/Finance record-only, no identity documents (011) · base license + feature add-ons, presets as shortcuts (012) · immutable effective-dated prices (013) · list → contract → one discount → volume tier (014) · volume tiers ship empty (015) · idempotent usage ledger, per-consultant allowances (016) · one Stripe subscription per org, quantities aggregate (017) · personal subscriptions untouched, no cross-workspace stacking (018) · add now/remove at period end, backend quotes with expiry (019) · discounts as Stripe coupons, 20-item fallback, test clocks (020) · one `EntitlementService.check` with the 11-step order (021) · design for two instances, run one (022) · additive Liquibase + per-phase flags (023).

## Waiting on the user (defaults already applied)
E1 marketer-submits reading · E2 HR/Finance scope · E3 base+add-on pricing model · E4 role ceiling · **E5 edge Caddy change (the only one that blocks public tenant hosts)** · E7 invite email match · E8 admin break-glass · E9 Stripe discount representation · E10 subdomain approval · E12 public ops endpoints at the edge (independent of V2). Full list: `docs/enterprise-v2/08-decisions-for-user.md`.

## Gotchas
- `OrgIsolationIT` is the CI gate; every new org route must be in its coverage registry or CI fails (by design).
- The two parked branches (`18f2123`, `2672733`) conflict with each other in web helpers and test fixtures; X2.1 consolidates, X1.8 cherry-picks only `a6a9a62`. Treat their WIP commits as unverified.
- ITs run only in CI (Testcontainers); locally use `./gradlew test --tests …` for units and the mock API for the web.
- Never add `org_id` to person-owned tables (resume, application, inbox…); orgs get links and consent-scoped views.
- Prefix `E` belongs to the extension area; enterprise is `X`.

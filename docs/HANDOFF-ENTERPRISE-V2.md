# HANDOFF-ENTERPRISE-V2.md — Enterprise V2 (multi-tenant portals, roles, consultant licensing, talent marketing)

> Branch: local **`enterprise-v2`** (cut from `5191298`, merged with the verified resume-builder tip
> `32046a8`). **Not pushed.** Design by Fable only; **all code is written by Sonnet agents** from the
> specs under `docs/enterprise-v2/`. The user's requirements (33 sections, 2026-10-12) are the source of
> intent; `CLAUDE.md`'s locked decisions win on conflict and every conflict is escalated in
> `docs/enterprise-v2/08-decisions-for-user.md`.

## START HERE

**Branch layout (2026-10-12):** `enterprise-v2` = the design line (Phase 0). `ev2-design-b/c/d` = the three
parallel design sessions (docs 10–16, 20–29, 17 + 30–38). **`ev2-design-e`** = Session E, which merged B, C and D
(`93c519e`, `d8629f4`, `6d0aba1` — conflicts resolved by content, `ent.json` parses, `--list` → 0 dangling ids) and was
**paused by the usage limit** at the WIP commit `wip: enterprise-v2 design E — paused (usage limit), see HANDOFF`.
`ev2-build-p1` = Phase 1 code in progress (X1.1 done at `f3e71b2`; X1.2–X1.3 next). Nothing is pushed.

**Session E status — resume here (checkout `ev2-design-e`):**
| Task | State | Where |
|---|---|---|
| 0 Merge B/C/D, regenerate roadmap | **done** | three merge commits; `08-decisions-for-user.md` restructured (Answered table → open items → B/C/D blocks) |
| 1 Cross-session consistency pass | **partial** — every mismatch is *decided* in `docs/enterprise-v2/09-consistency-decisions.md` (20 rows + planned story work) but **not yet applied** to docs 05/11/12/14/15/16/20/21/24/25/28/30–38 or to `ent.json`/`07-backlog.md` | apply row by row; X1.4 must be amended (row 15) before `ev2-build-p1` reaches it |
| 2 CLAUDE.md E3 change (+ Go-to-market line, Enterprise V2 locked bullet, ROADMAP.md note at the org price table ≈ line 1134) | **not started** | text is in the Session E brief |
| 3 Docs 40–44 (API, DB, threat model, testing, deployment) | **not started** | README still lists them as 40/41/42 — rename to 40–44 |
| 4 Story review: X4.10 + X12.* full spec, X1.13/X2.15 new, 26 L→S/M splits, global build order in 06 + tracker | **not started** (plan in 09 "Planned story work") | render stories into `07-backlog.md` in the X1 section format |
| 5 This START HERE (next Sonnet stories, open escalations) | **partial** (this table) | after X1.3: X1.4 (amended), X1.5, X1.6, X1.7 in that order; X1.10/X1.12 parallel |

**Open escalations needing the user (material only):** E4 role ceiling, E8 break-glass, E9 coupons, E10 subdomain approval,
E12 ops endpoints (fix story X1.13 planned), B1 ask-token via query param, C1 enterprise credits, C3 Stripe Tax, C5 preset
pricing, D1 link checks, D2 Autopilot feed, D4 marketer inbox — all with safe defaults applied (`08-decisions-for-user.md`).

**Last design commit:** `enterprise-v2: phase 0 audit, architecture debate, ADRs, foundation design, phase plan` on `enterprise-v2` (see `git log --oneline -1`).

**First commands**
```bash
git checkout enterprise-v2
git log --oneline -3
node docs/roadmap/build-master-roadmap.mjs --list | tail -4      # ent area present, 0 dangling ids
cat docs/enterprise-v2/README.md                                  # the index and who owns what
cat docs/enterprise-v2/progress-tracker.md                        # statuses
```

**If you are a design session (Fable):** pick your letter in `docs/enterprise-v2/README.md` (B domains/branding/login/identity/dashboards UX · C catalog/pricing/entitlements/metering/billing · D talent marketing/resumes/applications/clients/placements/HR/finance · E API specs/test plan/deployment plan/full story set). Read `00`–`08` first (they are short on purpose), then the ADRs your section names, then write only your files. Do not re-open an ADR without a superseding ADR. Write every story in the §30 format used in `07-backlog.md` §2 and add it to `docs/roadmap/areas/ent.json` by editing the generator spec, never by hand.

**If you are a build session (Sonnet):** the first task is **X1.1** (enterprise flags + `EnterpriseEnabledFilter`). Build order for Phase 1: **X1.1 → X1.2 → X1.3 → X1.4 → X1.5 → X1.6 → X1.7 → X1.8 → X1.9 → X1.10 → X1.11 → X1.12** (X1.6/X1.7 may run in parallel with X1.3–X1.5 once X1.2 is in; X1.9 needs X1.12). Each story in `docs/enterprise-v2/07-backlog.md` §2 is build-ready (functional, UI, backend, DB, APIs, permissions, AC, tests). Loop per `CLAUDE.md`: one story → tests green → `progress-tracker.md` + `--set X1.n=…` → one commit `ent-x1.n: <subject>` → PR into `develop` (never `main`). Branch topic branches off `enterprise-v2` while the programme is private; the user decides when `enterprise-v2` merges to `develop`.

## What was done this session (Phase 0)
- Audited the real code at `ce30edc` (after merging `32046a8`), the three merging branches and the two parked org branches; wrote the reuse matrix, the subscription audit and the infra audit (`01-existing-system-audit.md`).
- Debated 23 topics and reconciled the requirements with `CLAUDE.md` (`02-architecture-debate.md`); one ADR per decision (`adr/`).
- Foundation design: `00` vision, `03` domain model (bounded contexts, every entity, migration map), `04` tenancy & security (resolution, context, per-layer isolation, negative tests, threat model), `05` permission model (11-step order, templates, scopes, actor/beneficiary), `06` phase plan (0–12, flags, migration strategy, DoD).
- Plan: `07-backlog.md` + roadmap area **`ent` (prefix `X`)** with 13 epics / 109 stories (Phase 1 fully specified), back-links from `org.json`/`admin.json`, roadmap regenerated with 0 dangling ids; `progress-tracker.md`; `08-decisions-for-user.md` (20 escalations with safe defaults).

## Session D (2026-10-12, branch `ev2-design-d`, not pushed)
Designed assignments (`17`), org resume management (`30`), the talent-marketing lifecycle as state machines
(`31`), applications (`32`), interviews (`33`), clients (`34`), placements + Timesheets bridge (`35`),
HR & Finance record-only (`36`), the entitlement hook map for Session C (`37`) and the talent UX (`38`).
Specified 44 stories (X4.7–X4.8, X7–X11; new X8.10 pipeline schema/engine, X10.8 Timesheets bridge,
X11.7 PII-scanner coverage) in `ent.json` + `07-backlog.md`; added escalations D1–D7 and recorded
**E1, E2, E3, E5 as answered 2026-10-12** in `08-decisions-for-user.md`. Build order per phase is in the
`07-backlog.md` section headers and `progress-tracker.md`. Sessions B/C must align on: `ORG_*` notification
kinds, `X-Kiwiply-Workspace`, `AiCallContext` + `ai_call` columns, feature keys/units in `37` §4,
`ShareField.OFFERS` doc row, `interview.application_id` nullable, `ops_placement.pipeline_placement_id`.

## The decisions in one breath
Shared schema + `org_id` + explicit `TenantContext` (ADR-001) · Caddy on-demand TLS at the shared edge, Cloudflare for SaaS reserved (002) · the API resolves the host, clients never name a tenant, unknown hosts 404 (003) · host-only sessions + `tid` claim (004) · roles as data, N roles per member, five scopes, ceiling rule (005) · basic profile vs membership-scoped consultant overlay (006) · one shell, permission nav, data-defined workspaces (007) · `org_assignment` history (008) · person-owned resumes + `org_resume` links (009) · **marketers prepare, consultants submit, Kiwiply never submits** (010) · one client model with relationship edges; HR/Finance record-only, no identity documents (011) · base license + feature add-ons, presets as shortcuts (012) · immutable effective-dated prices (013) · list → contract → one discount → volume tier (014) · volume tiers ship empty (015) · idempotent usage ledger, per-consultant allowances (016) · one Stripe subscription per org, quantities aggregate (017) · personal subscriptions untouched, no cross-workspace stacking (018) · add now/remove at period end, backend quotes with expiry (019) · discounts as Stripe coupons, 20-item fallback, test clocks (020) · one `EntitlementService.check` with the 11-step order (021) · design for two instances, run one (022) · additive Liquibase + per-phase flags (023).

## Waiting on the user (defaults already applied)
**Answered 2026-10-12:** E1 (the consultant submits; marketers prepare/request/record) · E2 (HR/Finance record-only, no identity documents, no money movement) · E3 (base license + per-feature add-ons) · E5 (edge change planned: Session B wrote the snippet + runbook in `docs/enterprise-v2/10-domain-routing.md` §5.3/§8; the user applies it on the BeeCompete edge once X3.3 is deployed; dev on `*.localhost` until then).
Still open with defaults: E4 role ceiling · E7 invite email match · E8 admin break-glass · E9 Stripe discount representation · E10 subdomain approval · E12 public ops endpoints at the edge (independent of V2) · Session B's B1–B8 (ask token via query param, `/w/{workspace}` + proxy rewrite, org email MFA, apex domains, invite-only signup on tenant hosts, redirect defaults, two API deps, last-active visibility). Full list: `docs/enterprise-v2/08-decisions-for-user.md`.

## Session B (design, 2026-10-12, branch `ev2-design-b`)
Docs `10`–`16` (domains, branding/login, identity, profiles, org administration, employees/teams, page inventory) and fully specified stories X2.1–X2.14, X3.1–X3.8, X4.1–X4.6, X4.9 in `07-backlog.md` §3 / `ent.json`. **Alignment note for X1.4 builders:** tenant hosts serve `/login`, `/me`, `/w/{workspace}/…` via a `proxy.ts` rewrite to `web/src/app/(tenant)/_t/**` (16 §2.3, escalation B2) — build X1.4's `(tenant)` group that way from the start.

## Gotchas
- `OrgIsolationIT` is the CI gate; every new org route must be in its coverage registry or CI fails (by design).
- The two parked branches (`18f2123`, `2672733`) conflict with each other in web helpers and test fixtures; X2.1 consolidates, X1.8 cherry-picks only `a6a9a62`. Treat their WIP commits as unverified.
- ITs run only in CI (Testcontainers); locally use `./gradlew test --tests …` for units and the mock API for the web.
- Never add `org_id` to person-owned tables (resume, application, inbox…); orgs get links and consent-scoped views.
- Prefix `E` belongs to the extension area; enterprise is `X`.

# 43 — Testing plan: pyramid, isolation matrix, contract tests, billing clocks, E2E scenarios A–F, Playwright on tenant hosts, a11y/responsive, performance, fixtures, CI gates

> Status: design (Session E, task 3), 2026-10-12. Each story already names its own tests (07-backlog, ent.json); this doc owns the **cross-cutting suites**, the **scenario scripts**, the **matrix** and the **CI wiring**. Existing baseline (from `HANDOFF-CONTINUE.md` §1): ui 582 · web 2001 · api 1424 unit / 986 IT · Playwright 141 (mock). CI jobs today: extension (jsdom), web typecheck+lint+build, web e2e (Playwright on `dev:demo`), web Docker smoke, ops scripts (backup/restore drill), API `test integrationTest`.
> Ids `SEC-nn` are the security tests of `42-threat-model.md` §8. `⚑ needs design review` = judgment call.

## 1. Pyramid and ownership

| Layer | Tool | Target share | Runs | Owns |
|---|---|---|---|---|
| Static / structural | ArchUnit (`TechnicalStructureTest`), ESLint rules, `LiquibaseAdditiveTest` & policy tests (41 §12), TypeScript, `no-svg` / no-hex / no-`dangerouslySetInnerHTML` lint, dependency scan | gate | every PR | rules that make a class of bug impossible |
| Unit | JUnit 5 + AssertJ (pure services, engines, state machines), Vitest (web/ui) | ~65 % | every PR | `PricingEngine` golden G1–G14 + property tests, `ScopeEvaluator` truth table, `PipelineTransitions` table vs doc, `TenantResolver` host table, `QuoteHash`, contrast derivation |
| Integration (API) | Spring Boot test + Testcontainers MySQL (prod version), `FakeStripeGateway`, MockMvc/`TestRestTemplate` with `X-Kiwiply-Host` | ~22 % | every PR | isolation (`OrgIsolationIT`), authz order, webhooks, jobs, migrations, scenario ITs |
| Contract | `OpenApiContractIT`, DTO snapshots, mock-parity, extension parser | ~3 % | every PR | the API is what the web, mock and extension believe it is |
| UI E2E (mock) | Playwright over `dev:demo` (+ tenant mock) | ~8 % | every PR (sharded) | scenarios A–F journeys, responsive, a11y |
| Real-stack smoke | `web/scripts/ent-smoke.mjs` against compose (MySQL + API + web), like `rb-smoke.mjs` | ~2 % | nightly + pre-release | wiring the mock can't prove (cookies, proxy rewrite, real Host handling) |
| Manual / runbook | Stripe test clocks, edge rehearsal, `MANUAL-QA.md` additions | — | pre-release | things needing real accounts or the user's edge |

Rules: (1) **A test that can be a unit test must not be an IT**; (2) every IT uses an injected **`Clock`** (`MutableClock` bean in tests) — ArchUnit forbids `Instant.now()/LocalDate.now()` in `service.ent..`, jobs and engines; (3) no real network (Stripe, Gemini, DNS) in PR tests: `FakeStripeGateway`, `StubAiProvider`, `FakeDnsResolver`; (4) test data is synthetic only (`*.test`/`*.localhost`, generated credentials from fixtures; never real PII, never real keys); (5) a failing isolation, PII, no-submit or personal-subscription test blocks merge — never `@Disabled` without a tracker entry.

## 2. Cross-cutting suites (who builds, when, what they assert)

| Suite | Story | Asserts |
|---|---|---|
| `OrgIsolationIT` (exists) + **registry rule** | extended by **every** API story | every `/api/orgs/{orgId}/**` and `/api/me/orgs/{orgId}/**` route has a COVERAGE line (40 §10); stale lines fail |
| `CrossTenantSweepIT` | X1.9 | replays every registry line as the §3 actors |
| `TenantRepositoryContractTest` | X1.9 | reflection over `repository.org`/`repository.ent`: first parameter `Long orgId` (allow-list for `findMine(userId)`-style), no `findById`/`getById` on org-owned entities, `@Query` strings contain `org_id`/`orgId` predicate |
| `HostMatrixIT` | X1.3, X1.5 | 40 §2.2 table cell by cell |
| `AuthzCoverageTest` | X5.16 | handler with a feature key without `@RequiresFeature` fails; `OpenApiAuthzExtensionsIT`: every org handler has `x-permission` or `x-unscoped` |
| `NoSubmitSurfaceTest`, `MarketerScopeTest`, extension `no_submit.test.js` | X8.9, X9.9 | 31 §10 |
| `PersonalSubscriptionUnchangedIT` + `WriterRegistryTest` | X5.9 | 29 §1–2 (E0–E12) |
| `HrFinanceNeverCollectedTest`, `NeverCollectedSchemaTest`, `SensitiveTextCoverageTest` | X11.7 (+X1.2 schema gate from Phase 1) | 41 §9 |
| `MigrationUpgradeIT` + Liquibase policy tests | per phase changelog | 41 §12 |
| `EnterpriseSettingKeysTest` / `SettingDefinitionsTest` | X1.1 + each story adding keys | duplicate-key guard; defaults safe (flags off); doc-sync with 10 §10 / 06 §3 |
| `DashboardWidgetDocSyncTest`, `ShareMatrixTest`, `PermissionRegistryDocSyncTest` | X2.4, X1.7 | code registries ↔ docs 14 §2.2, consent matrix, 05 §3 |
| `OpenApiContractIT` | every API story | `api/openapi.json` current; error schemas present |
| `RouteFamiliesTest` | X1.9 | a controller mapped outside the declared families (40 §1) fails |
| `ArchRules` (ArchUnit) | X1.10 | no `TenantContextHolder` in `*Scheduler/*Job`; no `Instant.now()` in ent services; `SubscriptionRepository.save` only from allowed classes; no `RestTemplate`/`HttpClient` created outside `OutboundHttp` (SSRF guard) |
| `ManagementSecurityIT` & friends | X1.13 | 42 §5 |

## 3. Negative-test matrix (the isolation promise, exhaustively)

`CrossTenantSweepIT` iterates the registry; for each route it runs every row below with the expected status. **Expected is always 404 unless stated.** Same-tenant rows use objects the actor *can't* see (out of scope / unassigned).

| # | Actor (context) | Route class → expectation |
|---|---|---|
| N1 | Anonymous | org/me-org/admin ⇒ **401**; public ⇒ 200; internal ⇒ 401/404 (X1.13) |
| N2 | Authenticated non-member of acme (on `acme.localhost`) | org/me-org ⇒ 404; `/api/me/tenant` ⇒ 404 |
| N3 | acme **owner** on beta ids (acme host, token `tid=acme`) | every route ⇒ 404 (path org ≠ tenant) |
| N4 | beta owner on acme ids (beta host) | 404 |
| N5 | acme owner, token `tid=acme`, on **beta host** | 401 `TENANT_MISMATCH` (login-required) / 404 (org routes) |
| N6 | acme member, tid-less token, tenant host | tenant routes treated unauthenticated ⇒ 401; `/api/account` 200 (hand-off) |
| N7 | acme member, PLATFORM context, other org id | 404 |
| N8 | Platform admin on `/api/orgs/**` | 404; on a **tenant host** `/api/admin/**` ⇒ 404 |
| N9 | Same tenant, role lacks permission | 404 (not 403) |
| N10 | Same tenant, permission but **out of scope** (unassigned marketer; other team) | 404 |
| N11 | Assigned marketer, **no FULL consent** | consent-protected routes ⇒ **403 `CONSENT_REQUIRED`** (the only 403); summary routes 200 (counts only) |
| N12 | Assigned marketer, consent revoked **mid-job** | job commit refused; subsequent calls ⇒ 403 |
| N13 | Consultant on another consultant's `/api/me/orgs/{o}/…` ids | 404 |
| N14 | Suspended member / ex-member / ERASED | 404 (`/api/me/tenant` 403 `MEMBER_SUSPENDED` for suspended) |
| N15 | Org SUSPENDED/CLOSED/DRAFT | org routes 404 (`ORG_INACTIVE`), explicit state actions 409 `ORG_STATE` |
| N16 | Module off (flag allow-list excludes org) | 404, identical to unknown route |
| N17 | Licensed-feature routes without license | 402 `FEATURE_NOT_LICENSED` (**only after** membership+permission passed; for non-members still 404) |
| N18 | Quote/ license/ hostname/ invoice **ids of another org** | 404 |
| N19 | Idempotency key of tenant A replayed by tenant B | treated as new (key space = actor+key; org-prefixed ledger key) — no replay leak |
| N20 | Forged `X-Kiwiply-Host` (member of beta → acme) | `/api/public/tenant` 200 public DTO; all else 404 |
| N21 | Foreign `Origin`/`Referer` on cookie-auth POST | rejected 404 (42 T27) |
| N22 | Direct object ref to person-owned data (`/api/profile/resumes/{id}`) with org membership only | 404 (org membership never grants person routes) |
| N23 | Signed URL of acme asset used under beta session/after TTL | 404 (never 410) |
| N24 | Webhook/Stripe event of org A applied to org B (customer mismatch) | no mirror change; logged |

Additional per-domain negatives live in the owning story (consent-matrix for `ShareField`, assignment-end revoking access, ceiling rule, last-admin, `ASSIGNMENT_CAP`…). Each new domain adds its **consent/scope rows** to the registry line (`body` attack + expectation) — reviewers reject a route line with only the N3 row.

## 4. Contract tests

| Contract | Test | Notes |
|---|---|---|
| OpenAPI ↔ code | `OpenApiContractIT` (120 s timeout) | regenerated `api/openapi.json` committed; PR fails on drift; error enum, `x-*` extensions (40 §10) |
| DTO shapes | `DtoSnapshotTest` (JSON snapshots under `src/test/resources/dto/`) for `PublicTenantDTO`, `MeTenantDTO`, `LicenseQuoteDTO`, `EntitlementsDTO`, `ProblemDTO`, `PageDTO` | additive diffs allowed (snapshot approve flag), removals/renames fail |
| Mock ↔ API | `MockParityTest` (web, Vitest + ajv): every route the tenant mock serves exists in `openapi.json` and its sample payload validates against the schema; mock's 404s use the same problem shape | prevents Playwright-over-mock drifting from the real API |
| Web ↔ API types | `web/src/lib/ent/*` types generated from `openapi.json` (`npm run gen:api`) and checked in; CI diffs | |
| Extension ↔ API | extension jsdom test feeds `/api/profile/version` with `workspaces[]`, and `plan` with/without; asserts unchanged behaviour (29 §3); `tracking.js` normaliser ignores unknown | version bump ritual applies |
| Stripe ↔ gateway | `StripeGatewayImplIT` with recorded fixtures (WireMock): idempotency key on every write; live key refuses test clocks | cassettes re-recorded manually |
| Docs ↔ code registries | doc-sync tests (§2) | `permissions`, `dashboard widgets`, `settings`, `consent matrix`, `PipelineTransitions` vs docs |
| Edge ↔ ask | `AskEndpointIT` + dev-edge rehearsal (§9.4) | proves the Caddy snippet's contract |

## 5. Billing tests and Stripe test clocks

### 5.1 Layers
| Layer | What | Where |
|---|---|---|
| Pure math | golden tables G1–G14, property tests (`PricingEnginePropertyTest`: monotonic, no negative, half-even, order-independence, quote total = Σ lines, same result LOCAL vs Stripe path) | PR |
| State machines | `LicenseStateMachineTest`, `MidCycleRulesTest` (every row of 27 §2), `PaidThroughTest`, `DunningIT` (webhook sequence with the LOCAL applier and fixtures) | PR |
| Gateway | `StripeGatewayImplIT` recorded fixtures; `LicenseChangeApplierTest` (item maths, coupon re-size, failure → FAILED + same keys on retry); `OrgBillingWebhookHandlerTest` | PR |
| Reconciler | `OrgSeatReconcilerTest` each drift kind; never writes Stripe | PR |
| Regression | `PersonalSubscriptionUnchangedIT` + `BillingResourceIT`/`BillingWebhookIT`/`EntitlementServiceTest` unchanged — CI job `personal-billing-regression` (required) | PR |
| **Live test-mode** | Stripe test clocks, scripted below | nightly **if** `STRIPE_TEST_SECRET_KEY` secret exists; else manual runbook (X6.11) |

### 5.2 Test-clock script (nightly job `billing-clock`; refuses a live key; creates and deletes its own clock + customers; run id in object metadata)
| # | Step | Assert (API mirrors + Stripe objects) |
|---|---|---|
| 1 | create org → clock frozen at T0; pay setup via Checkout with `4242…` (Stripe API, no UI) | `setup_fee_paid_at`; org ACTIVE; `org_billing_account` ACTIVE |
| 2 | quote+confirm: A = BASE + `ai.job_matching` + `ai.resume_tailoring`; B = BASE + `inbox.monitoring` + `marketing.assisted_applications`; C = BASE | subscription with 3 distinct price items qty (3,1,1,1,1); no coupon; `org_subscription_item` mirrors; `expected == actual` in reconciler |
| 3 | add contract (G2) + re-quote | coupon `amount_off` = discount_total; reconciler clean |
| 4 | remove `ai.resume_tailoring` from A (scheduled) | Stripe quantity decremented now (no proration); Kiwiply `ends_at = period_end`; feature works until then |
| 5 | advance clock to `period_end + 1 h` | `invoice.created/finalized/paid`; `org_invoice` + lines match `PricingEngine` snapshot; `paid_through_at` advanced; removed feature 402 |
| 6 | mid-cycle add (D) | proration invoice item amount == `prorationEstimate` ±0 (Kiwiply is the authority) |
| 7 | dunning: set default card `4000 0000 0000 0341`; advance a period | `invoice.payment_failed` → PAST_DUE; features still on until `paid_through_at`; advance past → `SUBSCRIPTION_STATE` 402; pay → ACTIVE |
| 8 | webhook replay of step 5's event | no mirror change (idempotent) |
| 9 | cancel org (period end) | `CANCEL_AT_PERIOD_END`; at clock end → licenses ENDED, org SUSPENDED/CLOSED per 27 §6 |
| 10 | cleanup | clock + customers deleted; run leaves **zero** drift rows |
Pass criteria also include: personal customer created in the same run has an untouched `subscription` row (E-style check) — proves routing.

## 6. E2E scenarios A–F (names from requirements §32), scripted

Layers per scenario: **API** = `Scenario<X>IT` (Testcontainers, `TestRestTemplate`, headers, authoritative); **UI** = Playwright over the tenant mock (`web/e2e/journeys/ent/…`), projects §7; **Smoke** = nightly subset on the compose stack. Fixtures in §8. Steps: *action → expected*. A phase column says when a step becomes runnable (steps behind a later phase are `test.fixme` with the story id, so the file exists from Phase 2 and fills in).

### A — Organization Admin (`e2e-a-org-admin`, UI projects: `ent-desktop` + `ent-mobile-390`)
| # | Step | Expected | Ph |
|---|---|---|---|
| A1 | Fixture: platform admin has provisioned **acme** (CONSULTANCY, ACTIVE, `acme.localhost` ACTIVE); `acme-admin` OWNER exists | `GET acme.localhost/` shows branded login with Acme default theme, "Powered by Kiwiply" | 2 |
| A2 | Sign in as `acme-admin` on `acme.localhost` | lands **directly** on Org Admin Dashboard (no switcher, no public site hop); header shows Acme display name; shell uses Acme tokens | 2 |
| A3 | Open **Organization Branding**; set primary `#1F6FEB`, logo PNG, welcome text; each field autosaves (✓), contrast warning appears for a failing pair and publish blocked until fixed | draft saved with `If-Match`; `config_version` unchanged until publish | 2 |
| A4 | Publish | published; reopen `acme.localhost` in a **fresh context**: login now shows new logo/colours/welcome (within 60 s cache) | 2 |
| A5 | Open **Domains**; add `careers.acme.localhost` | row PENDING with TXT/CNAME instructions (copy buttons) | 3 |
| A6 | Test hook `POST /__mock/dns` sets TXT+CNAME; click **Verify now** | VERIFIED → auto ACTIVE; timeline "DNS verified → Certificate → Live" (mock cert ISSUED) | 3 |
| A7 | Make it primary | non-primary host now 308-redirects pages to primary; links in mail preview use primary | 3 |
| A8 | Visit `careers.acme.localhost` fresh context | branded login (same Acme brand) | 3 |
| A9 | Sign in there as `acme-admin` | lands on Org Admin Dashboard on the custom host; session is **separate** from `acme.localhost` (cookie host-only) — visiting the subdomain still requires login | 3 |
| A10 | Avatar menu → **My Profile** | basic profile (photo, name, phone, title, timezone, notification prefs, security, memberships); **no** career fields or org settings | 2 |
| A11 | Avatar menu / sidebar → **Organization Settings** | separate page (identity, contact, policies, subdomain read-only); changing a setting autosaves with undo toast | 2 |
| A12 | **Employees**: invite `sarah@acme.test` with roles ORG_ADMIN + MARKETING_MANAGER; bulk-assign a role to two members; try to grant a role above own ceiling (as a custom role editor) | invite listed INVITED; bulk result toast; ceiling attempt refused `ROLE_CEILING` with inline reason | 4 |
| A13 | **Roles & Permissions**: clone MARKETING_SPECIALIST, remove a permission, rename | system rows read-only; clone saved with history entry; diff vs template shown | 4 |
| A14 | Audit page | rows for branding publish, domain events, invite, role edit with risk badges | 4 |
| A15 | a11y + layout sweep of every page touched (axe, no horizontal scroll at 360/390/1440, tooltips on icon buttons) | zero serious/critical violations | all |
API twin `ScenarioAOrgAdminIT`: A1–A14 as API calls with `X-Kiwiply-Host`; asserts audit rows, `config_version` bumps, resolver cache eviction, ask endpoint 200/404 per hostname state.

### B — Multi-Role User (`e2e-b-multi-role`)
| # | Step | Expected | Ph |
|---|---|---|---|
| B1 | Fixture: `sarah` has ORG_ADMIN (primary) + MARKETING_MANAGER on acme | one account | 2/4 |
| B2 | Sign in once on `acme.localhost` | primary landing = Org Admin Dashboard; `GET /api/me/tenant` has two workspaces (`ADMIN`, `MARKETING_MGMT`) | 2 |
| B3 | Workspace switcher visible (>1 workspace); switch to **Marketing** | URL `/w/marketing-mgmt/…`; nav shows only marketing-manager permissions; **no re-login** | 2 |
| B4 | In Marketing: open Approvals/Workload; attempt Billing URL by typing `/w/admin/billing` | allowed (ORG_ADMIN grants it) — then remove ORG_ADMIN as OWNER in another context and reload | 4 |
| B5 | After role removal, within the ETag revalidation window banner "Your access changed — reload"; reload | admin workspace gone from switcher; typed admin URL ⇒ "not part of your role" empty state (404 from BFF), **not** a redirect to another workspace | 4 |
| B6 | Profile (avatar) in both workspaces | identical basic profile; edit title in one, visible in the other | 2 |
| B7 | Permission enforcement per workspace (API): MARKETING_MANAGER-scope call on a consultant outside her team ⇒ 404; ORG_ADMIN-scope billing read ⇒ 200 | | 4 |
API twin: `ScenarioBMultiRoleIT` (token has no permissions; effective set recomputed per request; `ETag` flips after role change).

### C — Consultant License (`e2e-c-consultant-license`)
| # | Step | Expected | Ph |
|---|---|---|---|
| C1 | Fixture: acme ACTIVE, billing **LOCAL** applier (Stripe off), catalog published with draft prices (21 §6, test only), `anika` CONSULTANT member | Consultant Licenses page lists Anika "Unlicensed" | 6 |
| C2 | Open **Configure License** for Anika → activate **base** | quote shown: base price from catalog, recurring total | 6 |
| C3 | Select **AI Job Matching** | feature price + allowance displayed; total updates (backend quote, debounced) | 6 |
| C4 | Select **AI Resume Tailoring** | total = base + JM + RT; `QuoteSummary` shows current vs proposed, next-invoice estimate, tax note | 6 |
| C5 | Select a feature with a COMMERCIAL dependency | cost-confirm sheet lists the extra paid feature; **Confirm** disabled until ticked; unticked ⇒ cannot proceed | 6 |
| C6 | Tamper test (API twin): edit `lines` after quote then confirm | `409 QUOTE_STALE` | 5 |
| C7 | Wait 15 min (MutableClock) then confirm | `410 QUOTE_EXPIRED`; UI offers "Refresh prices" | 5/6 |
| C8 | **Confirm** (with `Idempotency-Key`); double-click confirm | exactly one batch; second click returns same result | 5/6 |
| C9 | Sign in as Anika on `acme.localhost` → **My Available Features** | JM + RT active with allowances; unlicensed features show "Ask your admin" (no prices) | 6 |
| C10 | Anika calls an unlicensed feature (e.g. Interview Prep) | 402 `FEATURE_NOT_LICENSED` — UI card, not an error page | 6 |
| C11 | Anika uses RT to the allowance limit | 402 `FEATURE_ALLOWANCE_EXHAUSTED` with `resetsAt`; usage page shows 100 % | 6 |
| C12 | Admin removes RT | scheduled for period end (pending chip); still works until `ends_at`; after MutableClock jump ⇒ 402 | 6 |
| C13 | Margin guard (admin UI): publish a price below floor | refused unless typed reason; audit row | 6 |
| C14 | Stripe-mode variant (nightly §5.2) | mirrors + reconciler clean | 6 |
API twin: `ScenarioCConsultantLicenseIT`; unit: golden tables for the exact numbers.

### D — Marketing Specialist (`e2e-d-marketing`, Phase 8–9; **E1: consultant submits, Kiwiply never submits**)
| # | Step | Expected | Ph |
|---|---|---|---|
| D1 | Fixture: `sarah-m` MARKETING_SPECIALIST (module `talent_marketing` on), PRIMARY assignment to Anika; Anika has JM + RT licenses; Anika's `data_share` = SUMMARY | Sarah's "My Assigned Talent" shows Anika (summary only) | 8 |
| D2 | Sarah opens Anika's profile | sees overlay + readiness; **resume content hidden**: `CONSENT_REQUIRED` card "Anika hasn't shared this with you yet" + **Ask Anika** | 7 |
| D3 | Ask Anika (twice within 7 days) | first sends `ORG_CONSENT` notification; second ⇒ 429 cooldown message | 7 |
| D4 | Anika grants FULL to Sarah (own session) | Sarah can now open the **approved** resume (audited read) | 7 |
| D5 | Sarah runs **Job Discovery** for Anika → AI matches | matches with scores/reasons; `usage_event` charged to **Anika** (actor Sarah, beneficiary Anika); org without JM license ⇒ 402 | 8 |
| D6 | Sarah assigns 3 opportunities with the approved resume v | one batched notification to Anika; duplicate assignment ⇒ `DUPLICATE_WARNING` / unique guard | 8 |
| D7 | Anika (consultant workspace) accepts one, declines one | statuses update on both boards; decline reason required | 8 |
| D8 | Anika **authorizes** the accepted match with scope `BOTH` | `authorization=CONSULTANT_APPROVED`; Sarah sees "Authorized"; **Sarah has no authorize/submit control anywhere** (NoSubmit lint, UI test asserts absence of button labels) | 8 |
| D9 | Anika applies in her **own browser session** (simulated: `PUT /api/profile/applications/{id}` APPLIED with Anika's token — the extension's submit-detect path) | `pipeline_application_link` created; match → IN_PROGRESS; both boards show "Applied"; Sarah sees status under consent | 9 |
| D10 | Sarah **records** a vendor submission (channel label + reference) for a requirement match | `candidate_submission` RECORDED; a second record for the same requirement+consultant ⇒ 409 `SUBMISSION_EXISTS`; no outbound call exists | 8/10 |
| D11 | Interview slot proposed by Sarah → Anika confirms; `.ics` downloads | consultant's own `interview` row created; reminders scheduled | 9 |
| D12 | Outcome recorded → offer extended (Account Manager) → Anika accepts → placement created | placement ACTIVE; Timesheets bridge link; timeline merged both sides | 10 |
| D13 | Negative sweep inside D: another marketer (unassigned) opens Anika ⇒ 404; Sarah after assignment **ended** ⇒ 404 and prior FULL reads stop; Anika revokes consent ⇒ job commit refused | | 7–8 |
API twin: `ScenarioDMarketingIT`. The extension piece is covered by `job-autofill` tests (`workspace.test.js`, `no_submit.test.js`), not Playwright.

### E — Personal Subscription Compatibility (`e2e-e-personal`)
Authoritative script = `PersonalSubscriptionUnchangedIT` E0–E12 (29 §2). UI journey (`e2e-e-personal.spec.ts`, mock):
| # | Step | Expected |
|---|---|---|
| E1 | Anika (personal Pro, mirrored) signs in on **kiwiply.com** (`localhost` platform host) | personal dashboard unchanged; plan Pro |
| E2 | Accept Acme invite from the join page on `acme.localhost` | joins as CONSULTANT; personal plan **unchanged** on the platform host |
| E3 | Acme licenses her (C-flow) | on acme host: org features visible; on platform host: personal plan only, **no** org features; billing page on platform shows personal subscription only |
| E4 | Use a personal feature on platform host; use an org feature on acme host | each charges its own context (usage + `ai_call.org_id` NULL vs acme) |
| E5 | Org feature on the platform host / personal feature rescue for unlicensed org feature | 402 — no stacking |
| E6 | Leave Acme; personal subscription byte-identical | ✔ |

### F — Tenant Security (`e2e-f-tenant-security`, project `ent-isolation`; API twin = the §3 matrix)
| # | Step | Expected |
|---|---|---|
| F1 | Fixture: acme and beta with different brand, subscriptions, resumes | |
| F2 | `acme.localhost` vs `beta.localhost` login pages | different branding, no cross-references |
| F3 | acme admin visits `beta.localhost` | branded **beta** login; sign-in with acme credentials ⇒ "not a member" state; no beta data |
| F4 | acme admin types beta org id URLs (resumes, billing, members) | tenant-404 / "not part of your role"; never beta data |
| F5 | Unknown host `nobody.localhost` | tenant-404 with no branding, no links to platform or other tenants |
| F6 | `/admin`, `/org`, `/api/admin/…` on tenant hosts | 404 (no platform-admin or personal screens exposed) |
| F7 | Direct API calls with acme token to beta ids | 404 matrix (N3) |
| F8 | Forged `X-Kiwiply-Host` via `page.request` | public DTO only (N20) |
| F9 | Cross-origin POST from `beta.localhost` page to acme API with cookies | rejected (N21) |
| F10 | Sessions: suspend `acme` custom host in admin; reload old tab | ≤ 60 s later 401 → branded login |
| F11 | Resume file: copy a signed PDF URL of acme into a beta session / after TTL | 404 |

## 7. Playwright for tenant hosts and device matrix

### 7.1 Setup
- **Hosts**: Chromium resolves `*.localhost` to loopback. `next dev -p 3100` is served as `http://acme.localhost:3100`, `beta.localhost`, `careers.acme.localhost`, `nobody.localhost`; `proxy.ts` derives host from `x-forwarded-host ?? host` (port stripped). Mock API (X1.12) resolves tenants by `X-Kiwiply-Host` (set by the BFF) and exposes **test hooks** only when `MOCK_ENTERPRISE_ENABLED=true`: `POST /__mock/dns`, `POST /__mock/clock`, `POST /__mock/reset`.
- **Cookies**: host-only cookies are per `*.localhost` host automatically (matches production). `__Host-` cookies need `Secure`; Chromium accepts Secure cookies on `localhost` hosts — verify in X3.7; fallback `dossier.cookies.host-prefix=false` **only** for mock/dev profile (never prod; `ProdConfigIT` asserts) — accepted (Task 4), written into X1.5.
- **Storage state** per account/host: `setup` project signs in once per (account, host) pair and saves `e2e/.auth/<host>-<account>.json`.

### 7.2 Projects (`web/playwright.config.ts`, additive to existing `setup` + `chromium`)
| Project | baseURL | Viewport / device | Tests | Notes |
|---|---|---|---|---|
| `ent-setup` | — | — | `e2e/ent/auth.setup.ts` | accounts: acme-admin, sarah, sarah-m, anika, beta-owner, platform-admin |
| `ent-desktop` | `http://acme.localhost:3100` | 1440×900 | `journeys/ent/**/*.spec.ts` | default |
| `ent-mobile-390` | same | 390×844, touch, `isMobile` | tagged `@responsive` + A/B/C/D mobile subsets | iPhone-class |
| `ent-mobile-360` | same | 360×740 | `@responsive` only | smallest Android; tap targets ≥ 44 px primary |
| `ent-beta` | `http://beta.localhost:3100` | 1440×900 | F + isolation specs (second tenant) | |
| `ent-custom` | `http://careers.acme.localhost:3100` | 1440×900 | A8–A9 | custom-host session separation |
| `ent-isolation` | no fixed baseURL (explicit URLs) | 1440×900 | `e2e-f-*`, cross-host assertions | uses `browser.newContext` per host |
| `ent-a11y` | acme | 1440 + 390 | `@a11y` sweeps | axe-core |
| `ent-firefox-smoke`, `ent-webkit-smoke` | acme | default | login + dashboard + switcher only | **nightly only** (cookie/redirect differences) |
Helpers: `hostFor(page)`, `withHost(context, host)`, `signIn(host, account)`, `resetMock()`; every spec starts from `POST /__mock/reset` for determinism. `fullyParallel: false` stays (single mock state) but specs are **sharded by file** across CI machines (`--shard=i/3`) with one mock per shard.

### 7.3 Accessibility, responsive and UX checks (`@a11y`, `@responsive`)
| Check | How | Gate |
|---|---|---|
| axe-core WCAG 2.1 AA on **every page state**: loading, empty, error, populated; light and dark; **both tenant themes** (acme blue, beta orange, plus a deliberately low-contrast brand to prove the derived-token fallback) | `@axe-core/playwright`, `wait for slide-in` / reduced-motion to avoid the known onboarding race | 0 serious/critical |
| Keyboard: tab order, visible focus, `Esc` closes sheets, focus trap + restore in `ReasonSheet/ConfirmTypedSheet/QuoteSummary` | scripted | pass |
| Icon-only controls have `aria-label` **and** tooltip on hover/focus (user rule) | DOM sweep: any `button` without text must have `aria-label` + `[data-tooltip]`/`role=tooltip` after hover | pass |
| No horizontal scroll at 360/390/1440; sidebar viewport-height and independently scrollable; primary actions ≥ 44×44 CSS px on mobile | `scrollWidth <= innerWidth`, bounding boxes | pass |
| Reduced motion respected (mascot, transitions) | `reducedMotion: 'reduce'` run | pass |
| `prefers-color-scheme` dark + tenant theme tokens | `colorScheme: 'dark'` project variant for dashboard + login | contrast pass |
| Autosave UX (Gen-Z/Notion style): inline ✓, undo toast, **no Save buttons** in forms | per page spec asserts absence of `button[type=submit]` labelled Save outside sheets | pass |
| Visual snapshots (BrandedLogin ×3 themes ×3 widths, dashboard 1440/390) | `toHaveScreenshot` (`maxDiffPixelRatio 0.01`), **generated and compared only on CI Linux** (font rendering) | CI only |
| No-submit/no-hex lints under `src/app/(tenant)/**`, `src/components/ent/**` | ESLint (static) | PR |
Manual (`MANUAL-QA.md` addition): honest-delight review of mascot usage (compact, never blocking), copy review for "never silently add paid features" cost-confirm flows, real-device smoke at 360/390.

## 8. Fixtures

| Fixture | Where | Content |
|---|---|---|
| `EntFixtures` (Java, extends `OrgFixtures`) | `api/src/test/.../web/rest/ent/EntFixtures.java` | `twoTenants()`: acme (CONSULTANCY, ACTIVE, subdomain ACTIVE) and beta; members per role template (`owner, admin, sarahAdminMgr, sarahMarketer, hr, finance, am, anika(CONSULTANT, personal Pro), bobUnlicensed`); published **test-only** catalog (21 §6 draft numbers via `CatalogFixtures`), `MutableClock`, `FakeStripeGateway`, `StubAiProvider`, `FakeDnsResolver` |
| `PrevReleaseSchema` | `src/test/resources/db/prev-release.sql` | schema dump of the last released version for `MigrationUpgradeIT` |
| Mock tenants | `web/scripts/fixtures/enterprise.mjs` (X1.12) | same cast as `EntFixtures`; branding acme `#1F6FEB`, beta `#E8590C`, low-contrast brand variant |
| Seeder | `DemoOrgSeeder` enterprise variant | idempotent, only when `dossier.demo.enterprise=true` |
| Credentials | generated per run into `e2e/.auth` / fixtures; **never** real passwords or secrets in the repo; documented in fixture file header | |
| PII corpus | `src/test/resources/pii/{positive,negative}.txt` shared by Java and Vitest | SSN/ITIN/bank/passport/DOB variants (fake, Luhn-invalid where relevant) and benign look-alikes |
| Injection corpus | `src/test/resources/security/{xss,prompt-injection,ssrf}.txt` | for SEC-19/40/50 |
| Stripe cassettes | `src/test/resources/stripe/*.json` | recorded once in test mode |
| Performance seed | `PerfSeed` (Gradle `perfTest` only) | 50 orgs × 50 consultants, 1 M `usage_event`, 200 k `pipeline_event`, 20 k `opportunity_match` |

## 9. Performance, capacity and resilience checks

### 9.1 Deterministic (PR, `integrationTest` with `PerfSeed-lite`: 5 orgs × 20 consultants, 50 k events)
| Check | Assertion |
|---|---|
| **Query count** (Hibernate `StatementInspector`) | `GET /api/orgs/{o}/members` page ≤ 4 statements; licenses list ≤ 5; `GET /api/me/tenant` ≤ 6; `/usage?by=consultant` ≤ 5; quote create ≤ 12 for 25 lines — no N+1 |
| **EXPLAIN** (`ExplainIT`) | key queries (members list, usage reserve, resolver, ask, audit keyset, pipeline board) use an index whose first column is `org_id` (or `hostname`), no `Using filesort` on > 1 000 rows, `rows` < 5 % of table |
| Cache | resolver second call: 0 DB statements; negative cache works |
| Payload | list endpoints ≤ 100 rows; DTO JSON ≤ 200 KB; `X-Total-Count` present |

### 9.2 Load / latency (nightly, CI compose stack, `PerfSeed`, k6 binary, 60 s, 50 VUs mixed) — budgets on the CI runner (≈ prod box)
| Endpoint | p95 |
|---|---|
| `GET /api/public/tenant` (cache hit) | < 50 ms |
| `GET /api/internal/tenant-hosts/check` | < 50 ms |
| `GET /api/me/tenant` | < 100 ms |
| `GET /api/orgs/{o}/members?size=25` (5 000 members) | < 200 ms |
| `POST …/licenses/quotes` (50 consultants bulk) | < 400 ms |
| usage `reserve`+`commit` | < 40 ms |
| `GET …/pipeline/board` (2 000 matches) | < 300 ms |
Error rate < 0.1 %; API heap ≤ **512 MB** (current JVM limit) with no GC pauses > 500 ms; MySQL slow-query log empty (> 200 ms).

### 9.3 Web
Lighthouse CI (nightly) on branded login and Org Admin Dashboard (mobile profile, 4× CPU, fast 3G): LCP < 2.5 s, TBT < 300 ms, CLS < 0.1; **bundle budgets** in `next build` check: tenant route group first-load JS ≤ 180 kB gz, no tenant page imports `admin-v3` code; `@kiwiply/ui` tree-shaking verified.

### 9.4 Resilience and ops rehearsals
`docker-compose.dev-edge.yml` rehearsal (X3.6, **CI-only job** with Docker): Caddy `local_certs` + the exact snippet from 10 §5.3: `https://acme.localhost` issues, unknown host refused at handshake, REMOVED host not renewed. Chaos-lite ITs: Stripe/Gemini/DNS timeouts ⇒ documented degraded behaviour (40 §4 503, reads OK). Restore drill on the new tables (44 §8) added to the existing `verify-restore.sh` assertions.

## 10. CI gates and where things run

| Stage | Job (existing → new) | Required to merge | Notes |
|---|---|---|---|
| PR | `api-tests` (`./gradlew test integrationTest`) — now includes isolation, authz, migration policy, scenario ITs, doc-sync | **yes** | timeout 25 → 40 min; Testcontainers cached |
| PR | `web` typecheck+lint+build+Vitest (incl. `MockParityTest`) | yes | |
| PR | `ui` tests (`@kiwiply/ui`) | yes | |
| PR | **`ent-e2e`** (Playwright `ent-*` projects, 3 shards) | yes for X-stories touching UI | uploads report |
| PR | `extension` jsdom | yes | |
| PR | **`personal-billing-regression`** (29 §2) | **yes** | runs on every PR touching `api/` |
| PR | **`db-migrations`** (`MigrationUpgradeIT` from prev-release schema + policy tests) | **yes** | |
| PR | **`security-static`**: ESLint tenant rules, dependency scan (`npm audit --omit=dev`, Gradle `dependencyCheck` HIGH blocks) | yes (HIGH) | |
| PR | web Docker image smoke; ops scripts | yes | existing |
| Nightly (`develop`) | `billing-clock` (needs secret), `ent-smoke` real stack, k6 load, Lighthouse CI, Firefox/WebKit smoke, visual snapshots refresh check, full a11y sweep | no (alerts) | failure opens an issue tagged `nightly` |
| Release (manual, before promoting to `main`) | `MANUAL-QA` enterprise checklist; Stripe test-clock full run (X6.11); dev-edge rehearsal; go-live checklist (44 §12) | the user | |

**Runs only in CI (not expected locally):** visual snapshots (Linux fonts), Testcontainers matrix on the exact prod MySQL version (devs may use a local Docker; Windows needs `DOCKER_API_VERSION=1.44`), dev-edge Caddy rehearsal, k6/Lighthouse, Firefox/WebKit, dependency scan, Stripe clocks, full-axe sweeps. **Local fast loop:** `./gradlew test --tests '*OrgIsolationIT'`, `npm run test:e2e:ent -w web -- --project=ent-desktop <spec>`, `npm test -w web`.

Flake policy: a flaky test is quarantined within one day (`@flaky` tag → separate non-blocking job) with a tracker entry; retries: Playwright 1 in CI (existing), JUnit none (fix the clock/race instead); never `Thread.sleep` — use `MutableClock` and awaitility.

## 11. Definition of "tested" per story (added to the common DoD)
Unit tests for logic · IT for each new route (**registry line included**) with N-rows from §3 relevant to the domain · contract artifacts regenerated (`openapi.json`, DTO snapshots, mock parity) · migration policy tests green · scenario files updated (`test.fixme` → live) · a11y/responsive tags on new pages · no `Instant.now()` · PII corpus run if the story accepts free text.

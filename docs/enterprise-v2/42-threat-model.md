# 42 — Threat model: STRIDE per surface, abuse cases, ops-endpoint fix (X1.13), controls → stories, residual risk, security tests

> Status: design (Session E, task 3), 2026-10-12. Supersedes the "initial threat model" in `04-tenancy-and-security.md` §6 (T1–T15 keep their ids; new threats continue from T16).
> Inputs: 04, 05, 10, 12, ADR-001…023, 20–27, 30–38, `01-existing-system-audit.md` (R13), `08` escalations. Locked: no sensitive PII ever · consultants submit, Kiwiply never submits · HR/Finance record-only · shared edge Caddy is BeeCompete's (the user applies edge changes) · Gemini only for AI.
> `⚑ needs design review` = judgment call / risk area. `NEW` = a control this doc adds that is not yet in a story (listed in §6.2 as story amendments).

## 1. Method, assets, actors

STRIDE per **surface** (trust boundary crossing), ranked **L**ikelihood × **I**mpact (H/M/L) on a one-box, one-API-instance, one-admin-team deployment.

| Asset | Why it matters |
|---|---|
| Consultant resumes, profiles, applications, interviews | personal career data; consent-gated; highest privacy impact |
| Tenant isolation (org A never sees B) | the product's core promise (ADR-001) |
| Money: catalog prices, quotes, licenses, invoices, Stripe objects | revenue integrity, ≥ 80 % margin floor |
| Identity: sessions, refresh families, admin MFA | account takeover |
| Edge certificates + `ask` oracle | shared with BeeCompete; abuse hurts another product |
| Audit logs | non-repudiation |
| Secrets: Stripe keys, `SecretBox` key, internal/ask/scrape tokens, Gemini key, S3 keys | blast radius of any single leak |

| Actor | Capabilities assumed |
|---|---|
| Anonymous internet user | any request to any host pointing at the box; DNS control of their own domains |
| Tenant member (consultant, marketer, HR, finance, AM) | valid session on their tenant host(s) |
| Tenant admin (OWNER/ORG_ADMIN) | roles, domains, invites, billing for their org |
| Malicious tenant | a paying org trying to reach another org, the platform, or free features |
| Compromised/rogue platform admin | `ROLE_ADMIN`, admin console |
| Malicious integration target | webhook receiver, SAML IdP, job-board page content, AI output |
| Co-tenant of the box (BeeCompete) | shares edge Caddy, host, disk |

## 2. Trust boundaries

```
Internet ─▶ [BeeCompete edge Caddy :443, on-demand TLS, ask] ─▶ dossier-web (Next BFF) ─▶ dossier-api ─▶ MySQL / S3 / Stripe / Gemini / DNS
   ▲ ext (Chrome) ─▶ api.kiwiply.com (token auth)               ▲ X-Kiwiply-Host (untrusted claim)   ▲ internal chain (/api/internal/**)
```
Boundary rules: (B1) nothing the edge or browser sends is a tenant *credential* — tenant is derived from the `org_hostname` row; (B2) `X-Forwarded-Host` is believed only from the edge, never from clients (Caddy overwrites it for untrusted clients — **verified in the runbook**, 44 §6.2); (B3) the API port is not published; `/api/internal/**` and non-health `/management/**` are never reachable from a public host (X1.13 + edge rule); (B4) AI providers receive redacted text only.

## 3. STRIDE per surface

Threat ids: S spoofing · T tampering · R repudiation · I information disclosure · D denial of service · E elevation. Columns: **Ctrl** = control(s); **Story** = story that builds it; **Test** = id from §8; **Res** = residual risk.

### 3.1 Custom domains and on-demand TLS (10, ADR-002)
| Id | Threat | Ctrl | Story | Test | Res |
|---|---|---|---|---|---|
| T3 | **S/E** Junk or hostile names make the shared edge mint certs (cert-minting oracle) | `ask` 200 only for ACTIVE hostname of ACTIVE/PAST_DUE org; empty 404 otherwise; 600/min global rate limit; 404-rate alert | X1.3, X3.3 | SEC-04 | L |
| T4 | **S** Domain takeover: org claims a name it doesn't control | TXT ownership (per-row random token) **and** routing check before VERIFIED; 24 h re-check; grace → SUSPENDED; resume re-verifies | X3.2, X3.5 | SEC-05 | L |
| T16 | **D** Burn Let's Encrypt limits (many ACTIVE hostnames on a domain the attacker owns; 300 orders/3 h per account) so **other tenants and BeeCompete** cannot get certs | custom domains require flag allow-list (admin-granted ⇒ paid orgs only), `org.domains.max_custom` = 5, **NEW** global activation cap `enterprise.domains.activations_per_day` (default 30, excess stays VERIFIED with `CAPACITY_QUEUED`, admin alert), LE counter (10 §7) stops subdomain provisioning at 45/week | X3.3 (+amend), X1.11 | SEC-06 | M ⚑ |
| T17 | **I** Ask token leaks (Caddy needs it in the URL query, `?t=`; appears in edge logs/config) and is the **same value as `DOSSIER_INTERNAL_TOKEN`** (10 §8) ⇒ leak grants the internal chain (PDF renderer etc.) | **NEW** separate secret `DOSSIER_ASK_TOKEN` accepted **only** by `/api/internal/tenant-hosts/check` (header or `t`); internal-chain token never leaves the compose network; mask `t=` in all access logs (API + web); rotation = change both env files + `caddy reload`; runbook step in 44 §6 | X1.3 (amend), X1.13 | SEC-07 | L ⚑ |
| T18 | **S** Phishing: lookalike org on `{label}.kiwiply.com` or a custom domain impersonating another brand | reserved + confusable labels (ASCII-only labels, deny-list `kiwiply, secure, login, support, billing` + edit-distance-1 of existing orgs), platform approval for subdomains of young orgs (E10), "Powered by Kiwiply" mark + report link on branded login; org display name uniqueness not enforced (judgment) | X1.11, X2.3, X3.1 | SEC-08 | M ⚑ |
| T19 | **T** Cookie tossing: `evil.kiwiply.com` JS sets `Domain=.kiwiply.com` cookies that shadow `acme.kiwiply.com` cookies (login CSRF / fixation) | **NEW** auth cookies use the `__Host-` prefix (Secure, no Domain, Path=/) on **all** hosts, so a domain cookie can never replace them; server ignores any non-`__Host-` auth cookie when `enterprise` on; tenant hosts serve **no tenant-authored script** (branding is data, escaped) | X3.7 (amend; pull from "evaluated in Phase 3" to **required**), X1.5 | SEC-09 | L |
| T20 | **I** HSTS `includeSubDomains/preload` set on a tenant host pins `kiwiply.com` subdomains to HTTPS even where the edge can't serve it | no `includeSubDomains`/`preload` anywhere until every subdomain is edge-served (04 §7); `SecurityHeadersIT` asserts | X3.7 | SEC-10 | L |
| T21 | **T** Dangling hostname after org stops paying/removes DNS: name still ACTIVE | org SUSPENDED ⇒ resolver UNKNOWN and ask 404 immediately; re-check job; REMOVED names re-registrable only with fresh TXT | X3.5 | SEC-05 | L |
| T22 | **I** Probe job (API → `https://{host}`) abused as SSRF scanner (attacker's host resolves to internal IP) | probe connects only to the **edge IP** with SNI = host (`probe_via_edge_ip` default **true** in prod), never to a resolved attacker IP; DNS resolution of verification targets uses public resolvers; private/loopback result IPs are ignored | X3.3 (amend default) | SEC-11 | L ⚑ |
| T23 | **S** Edge trusts client-supplied `X-Forwarded-Host` (if BeeCompete's Caddy has `trusted_proxies` widened) ⇒ `kiwiply.com` request claims `acme` | runbook step asserts spoofed XFH is overwritten; web also ignores XFH when `Host` is a **platform host** (platform host list wins) | X1.4 (amend), 44 §6.2 | SEC-12 | L |

### 3.2 Tenant resolution (04 §2, ADR-003)
| Id | Threat | Ctrl | Story | Test | Res |
|---|---|---|---|---|---|
| T1 | **I/E** Cross-tenant read via path/body/forged host | path org = context org; membership; repository composite-key contract; 404-not-403 | X1.3, X1.7, X1.9 | SEC-01..03 | L |
| T13 | **I** Enumerate tenants (`{label}.kiwiply.com`, `/api/public/tenant`) | public DTO only for ACTIVE; identical 404 body+timing (padded) for PENDING/unknown; per-IP limit; **NEW** negative cache (10 s) so random hosts cost one cache miss, not a DB read per request | X1.3 | SEC-13 | L |
| T24 | **D** Resolver cache flood with random Host values | Caffeine max size 10 000 + negative cache; rate limit before resolver for unauthenticated public routes | X1.3 | SEC-13 | L |
| T12 | **T** Host-header injection into mail/redirect links | `TenantUrls` builds only from `org_hostname` primary rows; never from request host | X2.10 | SEC-14 | L |
| T25 | **S** Missing/legacy header = PLATFORM compatibility lets a tenant-less client reach enterprise features | tenant routes need an explicit TENANT ctx for **login on tenant hosts**; legacy console keeps today's behaviour only under `flag.enterprise` per-org rules; extension never sends the header | X1.3 | SEC-02 | L |
| T26 | **E** Forged `X-Kiwiply-Host` direct to `api.kiwiply.com` by a member of beta | tid-bound tokens (a token without `tid` is "unauthenticated on tenant routes"); 404 on `/api/orgs/{acme}`; public DTO only | X1.3, X1.5 | SEC-03 | L |

### 3.3 Sessions, tokens, browser (12, ADR-004)
| Id | Threat | Ctrl | Story | Test | Res |
|---|---|---|---|---|---|
| T2 | **S** Token replay across tenants | `tid`+`hid` claims, host-only `__Host-` cookies, refresh families, `TOKEN_HOST_REVOKED` ≤ 60 s after suspend | X1.5 | SEC-15 | L |
| T27 | **E** **CSRF between sibling tenants**: `*.kiwiply.com` tenants are **same-site**, so `SameSite=Lax/Strict` cookies *are* sent from `evil.kiwiply.com` → `acme.kiwiply.com` | **NEW** `OriginCheckFilter` on every non-GET/HEAD request using cookie auth: `Origin` (else `Referer`) host must equal the resolved tenant host or the org's other ACTIVE hostnames; missing both ⇒ rejected with the generic **404** (WARN logged); Bearer-token (extension) requests exempt; BFF also checks | X1.5 (amend) → new AC | SEC-16 | L ⚑ |
| T28 | **S** Account enumeration / credential stuffing on branded login | generic failure; limit 10/5 min per IP+host and per username; org MFA (`org.security.mfa_required`) | X2.3, X2.14 | SEC-17 | M |
| T29 | **E** Stale role/permission in client | permissions never in the JWT; each request evaluates DB state; UI `ETag` revalidation; role/membership change → `config_version`/membership cache evicted ≤ 5 s (in-process) | X1.6, X2.2 | SEC-18 | L |
| T30 | **T** XSS in branded surfaces (welcome text, terminology, org/display names, invite names) | all tenant-authored strings are plain text, length-capped, React-escaped, never `dangerouslySetInnerHTML`; terminology allow-listed keys; CSP nonce; lint forbids `dangerouslySetInnerHTML` under `src/app/(tenant)/**` and `src/components/ent/**` | X2.5, X3.7 | SEC-19 | L |
| T31 | **E** Extension: workspace header used to make the extension fill another person's data | header only selects plan/resume list/assigned jobs; no endpoint returns another person's bio; `no_submit.test.js`; token never carries `tid`; `/connect` stays on kiwiply.com (E6) | X9.9 | SEC-20 | L |

### 3.4 Role ceiling and assignments (05, ADR-005/008)
| Id | Threat | Ctrl | Story | Test | Res |
|---|---|---|---|---|---|
| T7 | **E** Admin grants a role more than they hold / edits own roles | ceiling rule per permission+scope; `roles.manage` cannot modify **own** membership; OWNER immutable; last-admin guard evaluated after batch; HIGH audit | X1.14, X4.1, X4.3 | SEC-21 | L |
| T32 | **E** Invite-time escalation: inviter's rights shrink before acceptance | ceiling **re-checked at accept** against the inviter's *current* rights (else roles trimmed to MEMBER and inviter notified); invite binds to email when `org.invite.require_email_match` (default true) | X1.8, X1.15 | SEC-22 | L ⚑ |
| T33 | **E** Assignment churn to read consultant data (assign → read → end → repeat) | assignment ≠ consent: FULL data needs the consultant's `data_share` naming the marketer; every read audited; `assignments.manage` TEAM; reassign emits `ORG_ASSIGNMENT`+`ORG_CONSENT` notifications; per-actor assignment rate limit 20/h | X4.7, X7.6 | SEC-23 | M |
| T34 | **E** SSO JIT mapping grants admin roles from IdP attributes (Phase 12) | JIT may only map to roles ≤ `org.sso.max_jit_role` (default CONSULTANT/MEMBER); never OWNER/ORG_ADMIN; domain claim requires DNS TXT proof | X12.4 / X12.10 | SEC-24 | M ⚑ |

### 3.5 Billing and entitlements (20–27, ADR-012…021)
| Id | Threat | Ctrl | Story | Test | Res |
|---|---|---|---|---|---|
| T10 | **T** Client-computed totals / tampered quote | backend `PricingEngine`; quote `inputs_hash` + `expires_at` (15 min); confirm recomputes; UI never computes money | X5.5, X5.4 | SEC-25 | L |
| T35 | **T/R** Replay or double-confirm of a quote; double charge on retry | `Idempotency-Key` + `license_quote` row lock (`OPEN→APPLYING`) + Stripe idempotency keys (26 §8) | X5.4, X6.7 | SEC-26 | L |
| T36 | **S** Forged / replayed / mis-routed Stripe webhook | signature check, 5 min skew, `stripe_event.id` PK, route by `customerId ∈ org_billing_account` or `scope=org`; org event never touches personal `subscription` and vice versa (`PersonalSubscriptionUnchangedIT`) | X6.6, X5.9 | SEC-27 | L |
| T37 | **T** Silent price changes / history rewrite | immutable `product_price` rows + `immutable_hash` nightly check; license pins `price_id`; invoice snapshots | X5.1 | SEC-28 | L |
| T38 | **E** Admin discount/contract abuse (margin leak, self-approval) | margin guard (`MARGIN_BELOW_FLOOR`, typed reason), two-person rule on contracts, HIGH audit with before/after JSON, `contract_event` | X5.3, X5.5, X6.9 | SEC-29 | M |
| T15 | **D** Denial of wallet via AI loops | per-feature allowance + AI cost budgets (≥ 80 % margin worst case) + per-actor 20/min + per-org AI concurrency cap (`enterprise.ai.max_concurrent_per_org`, default 3) | X5.7, X5.8 | SEC-30 | L |
| T39 | **E** One consultant drains an `ORG_POOL` allowance | pool features shown with per-member consumption; per-actor rate limit; admin can switch `pool_mode` per contract | X5.7, X6.5 | SEC-30 | M |
| T40 | **E** Test/dev billing flags enabled in prod (`dossier.orgs.dev-activate`, test clock) | `BillingConfigIT` fails startup config if dev-activate true with a live key; test clocks refused with live key; startup check logs | X5.9, X6.11 | SEC-31 | L |
| T41 | **T** Money drift between Kiwiply and Stripe unnoticed | nightly reconciler → `billing_drift` + admin alert; **never auto-fixes money** | X6.8 | SEC-32 | L |
| T42 | **E** Feature access after downgrade/removal (timing) | removals effective at period end by rule; entitlement reads `license_feature.ends_at`; `LicenseLifecycleJob` + step 7 reads rows (not cache) | X5.4, X5.6 | SEC-33 | L |
| T43 | **D** Stripe outage blocks users | read paths never call Stripe; quote/confirm degrade to `503 DEPENDENCY_UNAVAILABLE`; entitlements keep working from mirrors | X6.6 | SEC-34 | L |

### 3.6 Marketer / consultant consent (ADR-008/010, 17, 30, 31)
| Id | Threat | Ctrl | Story | Test | Res |
|---|---|---|---|---|---|
| T8 | **E** Acting for a consultant without consent | steps 9–10 of the 11-step order at request **and** re-checked when an async/AI job commits; revoke immediate; `data_share`/`org_feature_consent` | X5.6, X7.6 | SEC-35 | L |
| T44 | **S** Impersonation | no `act_as`/impersonate claim; `OrgAccessService.resolve` takes no login param; every act-for row records actor+beneficiary | X8.9 | SEC-36 | L |
| T45 | **E** Marketer submits / authorizes on a consultant's behalf (E1 breach) | `NoSubmitSurfaceTest` (verbs, injected beans, `PipelineTransitions` actor rule), `authorize` is OWN-only, `record` needs consultant authorization scope ⊇ `SUBMIT_RECORD`; extension `no_submit.test.js`; web lint on labels | X8.9, X9.9 | SEC-37 | L |
| T46 | **I** Marketer mass-exports consultant data | exports need `reports.export`, redaction pass, 5/h limit, audited MEDIUM; consultant "What Acme did" timeline; FULL reads individually audited | X7.*, X4.9 | SEC-38 | M |
| T47 | **I** Consent request spam / dark patterns | one request per (feature, beneficiary) per 7 days; card states exactly what is shared | X7.6 | SEC-39 | L |
| T48 | **T** **Prompt injection** from job descriptions, client requirements or resume text steering Gemini output | AI calls have **no tools/side effects**; outputs are drafts the user reviews, never auto-applied to submissions; inputs pass `SensitivePatterns.redact`; output rendered as text; length caps; per-org call caps | X5.8, X7.10, X8.3 | SEC-40 | M ⚑ |
| T49 | **I** Stale access after assignment ends/consent revoked via cached PDFs/thumbnails | signed URLs TTL ≤ 120 s, `Cache-Control: private, no-store`; thumbnail and PDF share `ResumeAccessService`; org share of resume revoked ⇒ links return 404 immediately | X7.3 | SEC-41 | L |

### 3.7 HR and Finance, record-only (36, ADR-011, E2)
| Id | Threat | Ctrl | Story | Test | Res |
|---|---|---|---|---|---|
| T11 | **I** Sensitive PII ingestion (SSN/tax/bank/passport/DOB) in notes, JSON, CSV, PDF | `@NoSensitiveText` everywhere, `SensitiveContent.check` for JSON, per-cell CSV scan, `PdfTextScanner`; **no image upload in HR**; PDFs with no text layer are refused; schema deny-list; weekly `PiiSweepJob` counts | X11.7, X1.2.. | SEC-42 | M ⚑ (obfuscated/spelled-out numbers evade regex) |
| T50 | **T** Money movement or payment instruction | no payment/transfer endpoints exist (`FinanceVerbsTest`); finance rows are records; Stripe handles cards; org billing contacts are emails only | X11.4, X11.7 | SEC-43 | L |
| T51 | **I** Rate/margin visibility leaks to non-finance roles | rate bands for `pipeline.view`; amounts only with `finance.view`; AM sees offers' bands; DTO tests per role | X10.3, X11.4 | SEC-44 | L |
| T52 | **E** HR ↔ Finance separation (HR editing finance, Finance editing employment) | distinct permission keys; `finance.manage` implies `ops.*` only; role template tests | X11.* | SEC-44 | L |

### 3.8 Assets, signed URLs, uploads (04 §4, X2.13)
| Id | Threat | Ctrl | Story | Test | Res |
|---|---|---|---|---|---|
| T53 | **I** Cross-tenant asset read, prefix listing, guessable keys | keys `org/{orgId}/{kind}/{uuid}`; `OrgStorageKeys`; keys from DB rows only; no listing from user input; signed URLs TTL ≤ 120 s; logo/favicon/banner served by API **by host** (no public bucket) | X2.5, X2.13 | SEC-45 | L |
| T54 | **T/E** Stored XSS via uploaded image (SVG scripts, polyglots) | **NEW** raster only (PNG/JPEG/WebP; **no SVG**), magic-byte check, re-encode server-side (strip metadata), `X-Content-Type-Options: nosniff`, size ≤ 1 MB (`ent.upload.max_bytes`) | X2.5 (amend) | SEC-46 | L ⚑ |
| T55 | **I** `.ics` feed URL leaks interview titles/companies | 32-byte random token per user, hashed at rest, revocable, rate-limited, content = time + generic title unless consultant opts in (`calendar.include_company`, default off) | X9.5 | SEC-47 | M ⚑ |
| T56 | **I** Referer leakage of signed URLs | `Referrer-Policy: strict-origin-when-cross-origin`; signed URLs never in page URLs | X3.7 | SEC-10 | L |

### 3.9 Platform admin and break-glass (E8)
| Id | Threat | Ctrl | Story | Test | Res |
|---|---|---|---|---|---|
| T9 | **I/R** Admin reads tenant data without a reason | admin is **not** a membership path (404 on `/api/orgs/**`); `POST /api/admin/orgs/{id}/break-glass {reason, mfa}` → 15-min grant (`break_glass_grant`), re-auth MFA (`STEP_UP_REQUIRED`), projections allow-listed (summary, member list names, licenses/usage, hostnames, audit) — **never** resume text, consent-protected data, rates; HIGH `ADMIN_READ` audit **written into the tenant's log**; OWNER notified (setting `enterprise.breakglass.notify_owner`, default on); security mailbox alert | X1.11, X6.10 | SEC-48 | M ⚑ |
| T57 | **E** Admin console reachable from a tenant host (XSS pivot) | `/api/admin/**` 404 on TENANT context (`AdminHostGuardIT`); admin UI served only on platform hosts; host-only cookies | X1.13 | SEC-49 | L |
| T58 | **T** Rogue admin edits audit/prices | audit append-only in code (no update/delete paths); HIGH rows in nightly off-box dump; price immutability + hash; contracts two-person rule; admin count minimised | X1.10, X5.1 | SEC-28 | M (root DB access is out of scope; stated to customers) |
| T59 | **E** Admin takeover | admin MFA (existing `AdminMfaService`), 30-min idle timeout, no "login as", `ROLE_ADMIN` grants audited | existing | SEC-48 | L |
| T60 | **I** Admin UI renders tenant-controlled strings unsafely | same escaping rule as T30 | X1.11 | SEC-19 | L |

### 3.10 Webhooks, integrations, SSO (Phase 12; Stripe inbound is §3.5)
| Id | Threat | Ctrl | Story | Test | Res |
|---|---|---|---|---|---|
| T61 | **I/T** Outbound webhook SSRF (internal IPs, metadata endpoint, DNS rebinding, redirects) | https only; resolve at send time and **pin the IP**; refuse private/loopback/link-local/metadata ranges; no redirects; 5 s timeout; 64 KB; per-org rate cap; secret via `SecretBox` | X12.3 | SEC-50 | M ⚑ |
| T62 | **S** Webhook receiver spoofing/replay | `X-Kiwiply-Signature t=,v1=` HMAC over `t.body`, 5-min window guidance, event id | X12.3 | SEC-50 | L |
| T63 | **S/E** SAML/OIDC: XML signature wrapping, replay, audience/issuer mix-up, IdP-initiated CSRF | vetted library only (Spring Security SAML2 / OIDC), signed assertions required, `InResponseTo`, audience = per-org entity id, clock skew ≤ 2 min, one-time assertion ids, SP-initiated only by default | X12.4 | SEC-24 | M ⚑ |
| T64 | **I** Supply chain (dnsjava, SAML libs, jqwik) | dependency review in PR template, Dependabot/`npm audit`/`gradle dependencyCheck` in CI (non-blocking → blocking for HIGH) | all | SEC-51 | M |

### 3.11 Operational endpoints (E12) — see §5
| Id | Threat | Ctrl | Story | Test | Res |
|---|---|---|---|---|---|
| T14 | **I/E** `/management/prometheus` and `/management/info` are `permitAll`; `/api/internal/**` is reachable through `api.kiwiply.com` if the edge routes the whole host; a leaked internal token would give service-level access | **X1.13**: admin-or-scrape-token for prometheus, admin for info, `PublicHostGuardFilter` refuses internal/management paths on public hosts, exposure allow-list test; edge path rule (user, 44 §6.4) is the second layer | **X1.13** | SEC-52..55 | L after X1.13 |

### 3.12 Noisy neighbour / availability (shared 3.7 GB box)
| Id | Threat | Ctrl | Story | Test | Res |
|---|---|---|---|---|---|
| T65 | **D** One tenant's batch (match runs, exports, PDF renders, CSV import) starves others and BeeCompete | per-org batch caps (`enterprise.matching.batch_size`, export 5 000 rows sync), per-org concurrency (AI 3, PDF render 2), job loops are per-org with `checks_per_run` caps, upload size caps, DB pool sized with headroom, memory limits per container (44 §9) | X5.7, X8.3, X11.6 | SEC-56 | M ⚑ |
| T66 | **D** Login/ask flood | rate limits (40 §8); `RateLimitFilter` before security; edge-side limits are the user's | X1.3, X2.3 | SEC-17 | M |

## 4. Abuse cases (attacker stories) → controls

| # | Abuse | Path | Why it fails / what limits it | Test |
|---|---|---|---|---|
| A1 | Org adds 60 attacker-owned subdomains to exhaust LE quota | Domains API | allow-list + 5/org + global activation cap + admin alert (T16) | SEC-06 |
| A2 | Lookalike `acme-support.kiwiply.com` collects passwords | subdomain provisioning | reserved/confusable rules, approval for young orgs, "Powered by Kiwiply" + report link (T18) | SEC-08 |
| A3 | Member of Beta guesses Acme ids on every route | `/api/orgs/{acme}/…` | 404 sweep over the whole registry (`CrossTenantSweepIT`) | SEC-01 |
| A4 | Forged `X-Kiwiply-Host` to read Acme branding + data | direct API call | branding is public by design; data 404 (T26) | SEC-03 |
| A5 | Marketer "reads, then ends" assignment repeatedly | assignments + FULL reads | consent is separate from assignment; reads audited; consultant sees timeline (T33) | SEC-23 |
| A6 | Marketer clicks "Submit" for a consultant | any org route | no such verb/route/transition (T45) | SEC-37 |
| A7 | Admin edits quote JSON in the browser to lower price | confirm | server recomputes; `QUOTE_STALE` (T10) | SEC-25 |
| A8 | Replay a captured confirm request | confirm | idempotency + status guard (T35) | SEC-26 |
| A9 | Forge `invoice.paid` to reactivate a suspended org | webhook | signature required; no secret ⇒ no effect (T36) | SEC-27 |
| A10 | HR admin pastes SSNs in notes / uploads a scanned I-9 | HR forms/policies | refused 422 / no image upload / text-layer-less PDFs refused (T11) | SEC-42 |
| A11 | Tenant member stores script in display name | profile/branding | escaped everywhere (T30) | SEC-19 |
| A12 | Evil org site POSTs to `acme.kiwiply.com` using the victim's cookie | cross-site (same-site) CSRF | Origin check + `__Host-` cookies (T27, T19) | SEC-16 |
| A13 | Org registers webhook to `http://169.254.169.254/` | integrations | SSRF guard (T61) | SEC-50 |
| A14 | Org Owner exports everything then leaves | exports/audit | audited, rate-limited, redacted; org-level export is a Phase 12 owner action; licenses end now; consent revoked | SEC-38 |
| A15 | AI cost abuse via requirement text with giant payload | AI handlers | length caps, allowance, budget, per-actor limits (T15, T48) | SEC-30 |
| A16 | Spoof `X-Forwarded-Host: acme…` on `kiwiply.com` | edge | Caddy overwrites; web prefers platform Host (T23) | SEC-12 |
| A17 | Brute-force 32-char join/invite tokens | `/api/join/**` | entropy, hashing, per-IP+token limit, single use | SEC-17 |
| A18 | Admin (rogue) reads Acme resumes | admin console | no such projection; break-glass allow-list; audit visible to Acme (T9) | SEC-48 |

## 5. E12 → story X1.13 (ops endpoints)

**Current exposure (audit R13, verified in `SecurityConfiguration` lines 74–78 and `InternalSecurityConfiguration`):** `/management/health[/**]` permitAll (needed: UptimeRobot keyword monitor, `DEPLOY.md` §10), `/management/info` permitAll, **`/management/prometheus` permitAll** (leaks routes, tenant-labelled metric names, JVM and queue internals), other `/management/**` admin-only; `/api/internal/**` is a separate filter chain guarded by `X-Internal-Token` only and reachable from the internet if the edge proxies all of `api.kiwiply.com` (it does; the extension uses that host). With V2 the internal surface grows (`tenant-hosts/check`, `health/ent`), so the fix lands in Phase 1.

### X1.13 — Ops endpoints off the public host: prometheus behind admin-or-scrape-token, `/api/internal/**` + non-health `/management/**` refused on public hosts, exposure allow-list tests
- **Epic:** X1 · **Size/Complexity:** S/S · **Owners:** API, Ops · **Deps:** — (independent of V2; soft: X1.3 reuses the new internal endpoint for its negative test) · **Relates:** E12, T14, T17, 44 §6.4
- **Persona:** Operator / security reviewer
- **Objective:** Nothing operational or service-to-service is reachable from the internet through `api.kiwiply.com`, even if the shared edge's path rules are missing, and scraping stays possible with a dedicated credential.
- **Story:** As the operator, I want Prometheus metrics and the internal API closed to public hosts so that a scanner or a leaked token cannot read internals or call service-only endpoints.

**Functional requirements**
- `/management/prometheus`: `hasAuthority(ROLE_ADMIN)` **or** a valid scrape token (`Authorization: Bearer <token>`, `ScrapeTokenFilter`, constant-time compare against `dossier.management.scrape-token` ← env `DOSSIER_SCRAPE_TOKEN`; blank/unset ⇒ token path disabled, admin only; token ≥ 32 chars or the app refuses to enable it; never logged).
- `/management/info` → `ROLE_ADMIN`. `/management/health` and `/management/health/{liveness,readiness}` stay `permitAll` with `management.endpoint.health.show-details=never` (monitors keep working; `DEPLOY.md` expectation `{"status":"UP"}` unchanged).
- `PublicHostGuardFilter` (`OncePerRequestFilter`, `@Order(HIGHEST_PRECEDENCE + 5)`, ahead of both security chains) answers **404** (empty body, same as an unknown route, **before** any token check) for any request to `/api/internal/**` or `/management/**` (except the health paths above) when **either** (a) it carries `X-Forwarded-Host` (the edge always sets it; compose-internal callers — web BFF, Caddy's `ask` call, Docker healthchecks — never do), **or** (b) its `Host` (port stripped) is **not** in the internal allow-list setting `enterprise.hosts.internal` (HIGH, registered in `EnterpriseSettingKeys.Ops`, default `["localhost","127.0.0.1","[::1]","api","dossier-api","web","dossier-web"]`) — fail-closed. Master switch `dossier.internal.refuse-public-host` (default **true**; tests set it per case).
- The BFF (`serverApiFetch`) must **not** forward `X-Forwarded-Host` to the API (X1.4 AC; the host travels only as `X-Kiwiply-Host`), otherwise its own internal calls would be refused — covered by `BffDoesNotForwardForwardedHostTest`.
- Actuator exposure allow-list: `management.endpoints.web.exposure.include = health,info,prometheus` in **every** profile (`ManagementExposureTest` reads the effective environment and fails on any other id, e.g. `env`, `beans`, `heapdump`, `loggers`, `threaddump`); Swagger UI and `/v3/api-docs/**` stay disabled/admin-only in prod (`OpenApiExposureTest`).
- Docs: `DEPLOY.md` gets the env var, the "prometheus now needs a token" note and the edge rule reference (44 §6.4); `.env.example` gets `DOSSIER_SCRAPE_TOKEN=`.

**UI requirements**
- — (the platform-admin Tenant Health page, X3.3, may show "metrics endpoint: protected ✓" from a self-check; optional)

**Backend requirements**
- `config/SecurityConfiguration` (matchers), `security/ScrapeTokenFilter`, `web/filter/PublicHostGuardFilter`, `config/ManagementProperties` (`dossier.management.scrape-token`, `dossier.internal.refuse-public-host`), application YAMLs (exposure + health details), test config.

**Database changes**
- None.

**APIs**
- `GET /management/prometheus` → 200 (admin JWT **or** scrape token) | 401 | 404 (public host)
- `GET /management/info` → 200 admin | 401/403
- `GET /management/health` → 200 `{"status":"UP"}` (public, no details)
- `/api/internal/**` → unchanged contract for internal callers; 404 for public-looking requests

**Permissions**
- `ROLE_ADMIN` or scrape token; internal token for `/api/internal/**` (unchanged)

**Feature entitlements**
- —

**Acceptance criteria**
- Anonymous `GET /management/prometheus` → 401 (no body detail); with `Authorization: Bearer <wrong>` → 401; with the right token → 200 and the Prometheus text format; an admin JWT → 200; token unset ⇒ token header ignored (401).
- Request to `/api/internal/tenant-hosts/check?domain=acme.kiwiply.com&t=<right>` carrying `X-Forwarded-Host: api.kiwiply.com` → **404**; the same request without that header (Caddy-style, `Host: dossier-api:8080`) → 200/404 per the ask rules; with `Host: api.kiwiply.com` and no XFH → 404 (not in the internal allow-list); with `Host: dossier-api:8080` and no XFH → allowed.
- `/management/health` → 200 `{"status":"UP"}` with and without XFH; response contains no `components`/`details`.
- `/management/env`, `/management/beans`, `/management/heapdump`, `/management/loggers`, `/management/threaddump` → 404 (not exposed) even for admin; `ManagementExposureTest` lists exactly `health,info,prometheus`.
- `/management/info` anonymous → 401; admin → 200.
- The extension's calls to `/api/profile/version`, `/api/extension/session` etc. on `api.kiwiply.com` are unaffected (regression: `ExtensionRoutesUnaffectedIT`).
- The web container's calls to `dossier-api:8080/api/internal/...` (PDF renderer, resume PDF bridge) still succeed (`InternalCallersStillWorkIT` with the compose-style Host and no XFH).
- Logs never contain the scrape token or the `t=` query value (`LogMaskingTest`).

**Test cases**
- `ManagementSecurityIT`, `PrometheusScrapeTokenIT`, `PublicHostGuardFilterTest` (table: Host × XFH × path), `InternalHostGuardIT`, `ManagementExposureTest`, `OpenApiExposureTest`, `BffDoesNotForwardForwardedHostTest`, `LogMaskingTest`, `ExtensionRoutesUnaffectedIT`, `InternalCallersStillWorkIT`.

- **Tech notes:** *Reconciliation with the summary version in `07-backlog.md` §2 (written by the consistency pass, 09 row 19):* this section is the full spec and governs; the differences are deliberate — (1) the scrape token comes from **env** `DOSSIER_SCRAPE_TOKEN` (CLAUDE.md: secrets via env only; a registry setting would put a credential in the DB, dumps and settings history), not from `enterprise.ops.scrape_token`; (2) the host rule is the **union** of the backlog's internal-host allow-list and the `X-Forwarded-Host` presence test, so it holds even if an operator adds a public alias to the allow-list; (3) deps are "—" because the prometheus half does not need X1.3. Update the backlog entry to match when that file is next edited. This is defence in depth for escalation **E12 (a)+(b)**: the **edge deny rule** (`@blocked path /api/internal/* /management/prometheus /management/info` → 404, snippet and runbook in 44 §6.4) is still applied **by the user** and is the first layer; X1.13 makes the code correct without it. If a Prometheus scraper is added later it uses `bearer_token_file`. `/management/health` stays public on purpose (uptime monitors).
- **Definition of Done:** `DEPLOY.md` + `.env.example` updated; `openapi.json` unchanged; CI green; plus the common DoD in `06-phase-plan.md` §5.

## 6. Controls → stories

### 6.1 Coverage matrix (control → story that builds it → test that proves it)
| Control | Story | Test (id) |
|---|---|---|
| Resolver fails closed, public DTO, ask oracle | X1.3 | `TenantResolverTest`, `AskEndpointIT` (SEC-04) |
| Web carries host, never trusts client host | X1.4 | `BffDoesNotForwardForwardedHostTest`, Playwright isolation (SEC-12) |
| tid/hid-bound sessions, host revocation | X1.5 | `HostMismatchIT` (SEC-15) |
| Roles as data, ceiling, last-admin | X1.6, X1.14, X4.1, X4.3 | `RoleCeilingIT` (SEC-21) |
| 11-step AuthorizationService, scopes, `@RequiresFeature` coverage | X1.7, X5.6, X5.16 | `AuthzCoverageTest` |
| Invites bind to email, re-check ceiling at accept | X1.8, X1.15 | `JoinResourceIT` + `InviteCeilingAtAcceptIT` (SEC-22) |
| Isolation gate (registry, contract test, sweep) | X1.9 | `OrgIsolationIT`, `CrossTenantSweepIT` (SEC-01) |
| Tenant MDC/audit | X1.10 | `LogCaptureIT` |
| Admin hostnames + reserved/confusable labels | X1.11 | `SubdomainProvisioningIT` (SEC-08) |
| **Ops endpoints off the public host** | **X1.13** | SEC-52..55 |
| Branded login, escaping, MFA | X2.3, X2.14, X2.5 | `LoginRateLimitIT` (SEC-17), `XssSurfaceTest` (SEC-19) |
| Assets: raster only, signed/host-resolved | X2.5, X2.13 | `AssetUploadIT` (SEC-46), `AssetIsolationIT` (SEC-45) |
| Verification, grace, suspend, resume | X3.2, X3.5 | `HostnameCheckJobIT`, `SuspendedHostnameIT` (SEC-05) |
| Activation cap, LE counter, probe pinning | X3.3 | `ActivationCapIT` (SEC-06), `ProbeTargetIT` (SEC-11) |
| `__Host-` cookies, HSTS rule, CSP, headers | X3.7 | `SecurityHeadersIT` (SEC-09/10) |
| Assignments + audit | X4.7 | `AssignmentAuditIT` (SEC-23) |
| Catalog immutability, margin | X5.1, X5.3 | `ImmutablePriceIT` (SEC-28) |
| Quote/confirm integrity | X5.4, X5.5 | `QuoteConfirmIT` (SEC-25/26) |
| Usage idempotency/allowance | X5.7 | `UsageLedgerIT` (SEC-30) |
| Personal subscription untouched | X5.9 | `PersonalSubscriptionUnchangedIT` |
| Webhook signature/routing, reconciler | X6.6, X6.8 | `OrgBillingWebhookIT` (SEC-27), reconciler (SEC-32) |
| Consent + revoke | X7.6 | `ConsentRevokeIT` (SEC-35) |
| No-submit | X8.9, X9.9 | `NoSubmitSurfaceTest` (SEC-37) |
| PII scanner | X11.7 | `HrFinanceNeverCollectedTest`, `NeverCollectedSchemaTest` (SEC-42) |
| Outbound webhooks SSRF, SSO | X12.3, X12.4 | `WebhookSsrfIT` (SEC-50), `SamlAssertionIT` (SEC-24) |

### 6.2 Amendments this doc requires on existing stories (apply when the story is next edited; none edits happen in this task)
| Story | Amendment (acceptance criterion to add) |
|---|---|
| X1.3 | dedicated `DOSSIER_ASK_TOKEN` for the ask endpoint (T17); negative cache 10 s + max 10 000 entries (T13/T24) |
| X1.4 | web prefers platform `Host` over `X-Forwarded-Host`; BFF never forwards `X-Forwarded-Host` upstream (T23, X1.13) |
| X1.5 | `OriginCheckFilter` for cookie-authenticated non-GET requests (T27); `__Host-` cookies (T19) |
| X1.8 / X1.15 | ceiling re-check at accept (T32) |
| X2.5 | raster-only uploads, re-encode, no SVG (T54) |
| X3.3 | activation cap + `CAPACITY_QUEUED` (T16); probe via edge IP default true in prod (T22) |
| X3.7 | `__Host-` prefix required, HSTS rule asserted (T19/T20) |
| X9.5 | `.ics` token hashing + generic titles default (T55) |
| X12.3 | SSRF guard acceptance criteria as in doc 40 §9.2 (T61) |
| 23 §2.2 / X5.5 | `org_contract_price.version_from/version_to` (41 §3.3) |
| 10 §5.2/§8 | use `KIWIPLY_ASK_TOKEN` ≠ `DOSSIER_INTERNAL_TOKEN` (T17); runbook gets the XFH-spoof check (T23) |

## 7. Residual risk register (accepted unless the user objects)

| # | Risk | Likelihood·Impact | Why accepted / mitigation | Owner |
|---|---|---|---|---|
| RR1 | Shared edge is BeeCompete's: its Caddy misconfiguration or reload affects us (and vice-versa) | M·H | change applied by the user with backup + validate + reload (44 §6); no cert/ask state outside Caddy's storage; rollback = restore Caddyfile | user |
| RR2 | Single API instance: in-memory rate limits reset on restart; one box = single point of failure | M·M | ADR-022; restart storms limited by `restart: unless-stopped` backoff; second-instance readiness X12.5 | user |
| RR3 | Platform admin/DB root can read everything | L·H | stated in customer terms; break-glass audited; backups encrypted at rest on S3 | user ⚑ |
| RR4 | PII regex scanner evades obfuscation (spelled-out numbers, Unicode digits) | M·M | scanner + no-image-upload + weekly sweep + AI redaction; policy: no identity docs; report path for customers | Sonnet X11.7 ⚑ |
| RR5 | Same-site tenants (`*.kiwiply.com`) share a registrable domain: browser-level isolation weaker than separate domains | M·M | Origin check, `__Host-` cookies, no tenant script, CSP; **custom domains are cross-site** (stronger); Public Suffix List submission for `kiwiply.com` is **not** done (would also break the apex app) — ⚑ revisit if tenant count > 200 | user ⚑ |
| RR6 | Gemini output untrusted/prompt-injected | M·L | no tools, draft-only, redacted input | Sonnet |
| RR7 | Stripe account-level incident (key leak) | L·H | env-only keys, restricted key scopes (no refunds/payouts), test/live separation, reconciler | user |
| RR8 | Let's Encrypt rate-limit exhaustion by legitimate growth | L·M | counter + alert + Cloudflare-for-SaaS eval (X12.6) | user |
| RR9 | Backups: only nightly dump; RPO 24 h | M·M | existing nightly + weekly restore drill; per-phase manual dump before enterprise deploys (44 §8) | user |
| RR10 | Insider (tenant admin) exfiltrates own org's data | M·L | their data; audited exports; offboarding | — |
| RR11 | `X-Kiwiply-Host` is a client-settable claim at `api.kiwiply.com` | H·L | by design harmless (public branding only); documented in ADR-003 | — |

## 8. Security test list (ids referenced above; implemented by the owning story, orchestrated by 43)

| Id | Test | Kind |
|---|---|---|
| SEC-01 | Cross-tenant sweep: every registry route × {acme-owner on beta ids, beta-owner on acme ids, non-member, platform admin} ⇒ 404 | IT |
| SEC-02 | Header-less / PLATFORM / UNKNOWN matrix per 40 §2.2 (`HostMatrixIT`) | IT |
| SEC-03 | Forged `X-Kiwiply-Host` by non-member/member-of-other ⇒ public DTO only | IT |
| SEC-04 | Ask endpoint truth table incl. 401 without token, token in `t` and header | IT |
| SEC-05 | Hostname lifecycle: takeover attempt (wrong TXT), grace → suspend, removed name re-claim needs new TXT | IT/unit |
| SEC-06 | Activation cap and LE counter | IT |
| SEC-07 | Ask token ≠ internal token; internal token rejected by ask and vice versa; `t=` masked in logs | IT |
| SEC-08 | Reserved/confusable subdomain labels rejected; young-org approval | unit/IT |
| SEC-09 | Auth cookies carry `__Host-`; shadow domain cookie ignored | IT + Playwright |
| SEC-10 | Security headers per 04 §7; no HSTS `includeSubDomains/preload`; Referrer-Policy | IT |
| SEC-11 | Probe connects only to edge IP; private-IP DNS answers ignored | unit |
| SEC-12 | Spoofed `X-Forwarded-Host` on platform host ignored (web) + edge runbook check | unit + manual (44) |
| SEC-13 | Negative cache + max entries; identical 404 timing (±20 % over 200 samples) | unit/IT |
| SEC-14 | `TenantUrls` never uses request host | unit |
| SEC-15 | tid/hid mismatch ⇒ 401/404; suspended host ⇒ 401 within 60 s | IT |
| SEC-16 | Cross-tenant POST with foreign `Origin` ⇒ rejected; same-origin OK; Bearer exempt | IT |
| SEC-17 | Login/join/invite rate limits (host+IP, username, token) | IT |
| SEC-18 | Role change reflected on next request; `ETag` flips | IT |
| SEC-19 | XSS corpus in every tenant-authored string (welcome text, terminology, names) renders inert; lint rule | Vitest + Playwright |
| SEC-20 | Extension: workspace never fills another person's data; no submit click | extension tests |
| SEC-21 | Ceiling rule, self-edit refusal, OWNER immutable, last-admin | IT |
| SEC-22 | Ceiling re-check at accept; email-bound invite | IT |
| SEC-23 | Assignment churn audited; FULL needs consent regardless of assignment | IT |
| SEC-24 | SSO: signature wrapping, replay, wrong audience, JIT role cap | IT (Phase 12) |
| SEC-25 | Quote tamper ⇒ `QUOTE_STALE`; expired ⇒ 410 | IT |
| SEC-26 | Confirm replay/double-submit ⇒ one batch; Stripe keys stable | IT |
| SEC-27 | Webhook: bad/absent signature, stale timestamp, duplicate id, mis-routed customer | IT |
| SEC-28 | Price rows immutable; hash mismatch alert; audit append-only | IT |
| SEC-29 | Margin refusal; contract two-person rule | IT |
| SEC-30 | Allowance + AI budget + per-actor + concurrency caps | IT |
| SEC-31 | Dev-activate/test-clock guards with a live key | IT |
| SEC-32 | Reconciler detects each drift kind; never writes Stripe | unit |
| SEC-33 | Removal at period end; entitlement off at `ends_at` | IT (test clock) |
| SEC-34 | Stripe down ⇒ reads OK, writes 503 | IT |
| SEC-35 | Revoke consent mid-job ⇒ commit refused; act-for without FULL ⇒ 403 | IT |
| SEC-36 | No `act_as` claim; `resolve` signature | reflection |
| SEC-37 | `NoSubmitSurfaceTest` + web lint + extension no-submit | reflection/lint |
| SEC-38 | Export limits, redaction, audit, CSV injection | IT |
| SEC-39 | Consent request cooldown | IT |
| SEC-40 | Prompt-injection corpus on JD/resume text: no tool calls exist, output escaped, redaction applied | IT |
| SEC-41 | PDF/thumbnail after revoke ⇒ 404; signed URL expiry | IT |
| SEC-42 | PII corpus (SSN/ITIN/bank/passport/DOB variants) refused on every write path incl. CSV, JSON, PDF | IT |
| SEC-43 | No payment verbs/routes (`FinanceVerbsTest`) | reflection |
| SEC-44 | DTO field visibility per role (rates, bands) | IT |
| SEC-45 | Asset key isolation (logo of A via B ⇒ 404; no listing) | IT |
| SEC-46 | Upload: SVG/polyglot/oversize ⇒ 415/413; re-encode strips EXIF | IT |
| SEC-47 | `.ics` token revoke/rate-limit/generic title | IT |
| SEC-48 | Break-glass: no grant ⇒ 404; grant ⇒ projection only; audit row in tenant log; MFA step-up | IT |
| SEC-49 | `/api/admin/**` ⇒ 404 on a tenant host | IT |
| SEC-50 | Webhook SSRF corpus (RFC1918, link-local, metadata, DNS rebinding, redirect, IPv6) | unit/IT |
| SEC-51 | Dependency scan gate | CI |
| SEC-52 | `/management/prometheus`: admin/token/anonymous matrix | IT |
| SEC-53 | `PublicHostGuardFilter` Host × XFH × path table | unit |
| SEC-54 | Actuator exposure allow-list; health shows no details | IT |
| SEC-55 | Internal callers and extension routes unaffected | IT |
| SEC-56 | Per-org caps/concurrency (batch, export, AI, PDF) | IT |

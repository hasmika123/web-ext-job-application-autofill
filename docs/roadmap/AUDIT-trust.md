# AUDIT — area `trust` (Trust, legal & compliance)

Written 2026-10-11 against local `version2` (= `product-roadmap` + the three finished area plans).
Method: read the legal pages, consent code, deletion/export services, retention jobs, the extension's
store disclosure and manifest, the security configuration of web/API/edge, CI, and the three finished
area designs that touch this area (`docs/design/admin/security-compliance-operations.md`,
`docs/design/admin/rbac-audit-mfa-impersonation.md`, `docs/design/org/consent-data-sharing.md`,
`docs/design/user/auth-account-security.md`). State legend: **real** = exists, wired, tested ·
**partial** = exists but incomplete, untested, or copy-only · **missing** = nothing. Paths are
repo-relative. Companion: `PLAN-trust.md`, `areas/trust.json`, `docs/design/trust/*.md`.

This audit is not legal advice. Where a question needs a lawyer it says so and is carried into the
register in `docs/design/trust/legal-review-register.md`.

## 0. What is real underneath

| Capability | Evidence | Notes |
|---|---|---|
| Privacy policy, plain-language, feature-by-feature AI disclosure | `web/src/app/(marketing)/privacy/page.tsx` (`UPDATED = "October 2026"`, sections: collect / parsing / AI features per task / storage / payments / team access / marketing / bug reports / retention / rights / extension / analytics / cookies / CWS data use / contact) | Honest and specific; **no version history, no effective date, no changelog, no DPO/EU representative, no transfer mechanism (SCCs), no "sensitive data" (EEO) paragraph, no state-law (CPRA categories) section, no children paragraph** |
| Terms of service | `web/src/app/(marketing)/terms/page.tsx` | 16+ rule (`:75`), no auto-submit/CAPTCHA promise, billing section per the locked rules, inbox read-only promise, AI "can be wrong". **No governing law / venue / dispute clause**; "continuing to use = accept" (`Changes to these terms`) — lawyer item PL.1 / ROADMAP 15.2 still open |
| Acceptance line at signup | `web/src/components/auth/AuthScreen.tsx:454` ("By creating an account, you agree to our…") | Copy only — **nothing is recorded** (no `legal_acceptance`, no version, no timestamp) |
| Cookie consent (web) | `web/src/components/CookieConsent.tsx`, `web/src/lib/analytics.ts` | Opt-in, equal Accept/Decline, gtag loads only after consent, analytics dark unless `NEXT_PUBLIC_ANALYTICS_ENABLED=true`. Choice in `localStorage` only (no server record), **no Global Privacy Control signal honoured**, no cookie table |
| AI resume-parse consent | `web/src/lib/ai-parse-consent.ts`, `packages/ui/src/ResumeUpload.tsx:944-954` | **Default ON** (product decision 2026-07-02), per-browser opt-out in `localStorage`; disclosed on the page and in `/privacy` "How resume parsing works" |
| Extension AI consent + telemetry switches | `job-autofill/entrypoints/options/OptionsApp.tsx:336-342` (Kiwiply AI off by default + explicit consent checkbox naming Gemini), `:376` ("Learn from my applications"), `:381` (analytics) | Real, per device; the consent flag travels with each AI request (`consent` in `TrackingProvider.aiDraft/aiParseResume/resumeMatch/jobFit`) |
| Store disclosure | `job-autofill/PRIVACY.md`, `job-autofill/wxt.config.ts` (`data_collection_permissions` required: `personallyIdentifyingInfo`, `authenticationInfo`, `websiteContent`; optional `technicalAndInteraction`; host permissions incl. `www.google-analytics.com`) | Thorough; **manually kept in step** (no test that manifest ↔ PRIVACY.md ↔ `/privacy` agree). Written before the CWS July-2026 Limited-Use tightening (enforced since 2026-08-01) |
| Self-service DSAR export | `api/.../service/AccountExportService.java`, `AccountExportResource`, `web/src/app/api/account/export` | JSON only: account, bio, resume *metadata*, applications, field cache, suggestions, inbox, notifications, AI answers. **Missing:** resume files, AI reports (resume match / job fit / tailor), job matches + feedback, fill telemetry (unlinked by design — fine), legal acceptances, org memberships (O6.5 plans it), product events (U18.4 plans it) |
| Self + admin GDPR deletion | `AccountDeletionService.java` (blobs first, single transaction, Stripe cancel first, AI usage anonymised, inbox/notifications/matches/fit/tailor/suggestions deleted) · tests `AccountDeletionResourceIT` | Good core. **Gaps:** `ai_quota_override` survives (HANDOFF-ROADMAP §5), Brevo contact / `email_subscriber` not deleted, `bug_report`/`sales_inquiry` rows keyed by email untouched, S3 object *versions* and the planned backups are not addressed in the policy, no deletion receipt, no completeness test that discovers every table with `user_id`/`login`/`email` |
| Retention | `service/inbox/InboxRetention.java` (365 d), `UserService.removeNotActivatedUsers` (3 d), job postings 7 d (`service/jobs/*`), admin design D6 proposes a policy table | **No catalogue, no published table**, refresh tokens / MFA challenges never purged (AUDIT-admin §3), logs/backups retention undefined |
| Admin access to user data | `docs/design/admin/rbac-audit-mfa-impersonation.md` D5 ("no log-in-as, ever"; consented 24 h view-as), `/privacy` "How our team accesses your data" | Design matches the policy promise; `reason` is never non-null today (AUDIT-admin §27) so the promise "requires a logged reason" is **ahead of the code** |
| Org data sharing consent | `docs/design/org/consent-data-sharing.md` (NONE/SUMMARY/FULL, consent-version stored, instant revoke, 16+ for SCHOOL/BOOTCAMP) | Design only (O6.*); the model is right for this area |
| EEO / sensitive data handling | `web/src/components/onboarding/Onboarding.tsx` (EEO offered, never required), `/privacy` ("never your name, contact details or self-identification answers" to AI), `PRIVACY.md` (suggestions never take EEO), `AiInputs.java` (resume digest = summary/skills/roles/education only) | Promises are **by construction, not by test**: nothing asserts that EEO/DOB never reach `AiInputs`, `ProfileSuggestion`, org DTOs, telemetry or the ranker |
| AI provider & tasks | `service/ai/AiTask.java` (DRAFT, PICK, MAP, ENRICH, PARSE, MATCH, FIT, TAILOR, JOBS, INBOX), `AiPolicy.java` (per-task model, kill switch), `GeminiAiProvider.java`; `/privacy`: "we currently use Gemini's **free tier** … Google may use what we send it to improve its services, and human reviewers may see it" | Honest, but **no DPA is possible on the free tier** and the "may be used to improve services" clause is weaker than every serious competitor (Simplify: "enterprise or no-training configurations"). This is the single biggest trust gap for a product that handles resumes |
| Security baseline | bcrypt, 15-min JWT + rotating refresh families (`RefreshTokenService`), httpOnly cookies (`web/src/lib/cookies.ts`), admin email-OTP MFA (`AdminMfaService`), `SecretBox` AES-256-GCM for IMAP app passwords (ROADMAP 14.2), S3 SSE-S3 (DEPLOY §), per-IP BFF rate limits (`web/src/lib/rate-limit.ts`) | **No HTTP security headers** on the web (`web/next.config.ts` has none, `web/src/proxy.ts` sets none), none at the edge (`Caddyfile` only `encode gzip` + `reverse_proxy`; the shared `beecompete-edge-caddy` is outside this repo), API = Spring Security defaults only (no CSP). API rate limiter **off by default** and keyed on spoofable XFF, `/management/info` public, Google sign-in bypasses admin MFA, stale authorities on refresh (AUDIT-admin §4 / A0.2) |
| Vulnerability disclosure | — | **Missing:** no `/.well-known/security.txt` (`web/public` has only logos), no `SECURITY.md`, no policy page, no `security@` triage route |
| Dependency / secret scanning | `.github/workflows/{ci,deploy,publish-extension}.yml` | **Missing:** no Dependabot (`.github/dependabot.yml` absent), no `npm audit`/Gradle dependency-check gate, no gitleaks/CodeQL |
| Accessibility tooling | `web/package.json`, `web/eslint.config.*`, `packages/ui/package.json`, CI | **Missing:** no axe, no `eslint-plugin-jsx-a11y`, no Lighthouse; 27 files under `packages/ui/src` + `web/src/components/app-v3` use `aria-label`/`prefers-reduced-motion` (effort exists, unverified — HANDOFF-V2 "never verified: keyboard/screen-reader use") |
| Age / minors | `terms/page.tsx:75` (16+), org design D6 | **No age screen at signup**, no `User` field for age confirmation (`User.java` has none), no under-age report runbook, no high-privacy defaults for 16–17 |
| Legal entity & lawyer review | `/privacy`, `/terms`, `PRIVACY.md` name AutomoraLab LLC; PROGRESS.md PL.1 "lawyer review deferred"; ROADMAP 15.2 "DPAs with Brevo + AWS S3" | **Open**: lawyer review, governing law, DPAs (AWS, Brevo, Stripe DPA auto-applies via the SSA — confirm; Google Gemini: none on the free tier) |

## 1. Feature-by-feature

| Topic | State | Real today | Gap | Stories |
|---|---|---|---|---|
| Legal documents & acceptance | **partial** | pages; signup line | no versioning, no acceptance record, no re-acceptance, no governing law, no changelog | T0.1–T0.6 |
| DSAR export | **partial** | JSON self-serve | files, AI reports, matches, acceptances, async ZIP + link, email-sourced path with verification | T1.2, T1.8 |
| Deletion | **partial** | self + admin, transactional | completeness test, downstream purge (Brevo/S3 versions/backups), receipt, `ai_quota_override` | T1.3, T1.9 |
| Retention | **partial** | inbox 365 d, unactivated 3 d, postings 7 d | catalogue + published table + job for the rest (tokens, challenges, logs, backups, security events) | T1.4 |
| Subprocessors & DPAs | **missing** | prose in `/privacy` ("infrastructure providers") and `/terms` ("Services we rely on") | named public list with purpose/region/DPA status; DPAs signed; Gemini tier | T1.5, T1.6 |
| Data map / RoPA (GDPR Art. 30) | **missing** | — | generated from code with a doc-sync test | T1.1 |
| Consent & GPC | **partial** | web banner opt-in; ext switches | GPC signal, server-side consent record, cookie table, CPRA "Your Privacy Choices" | T1.7 |
| Minors | **partial** | 16+ in terms | age screen, under-age handling, org assertion, high-privacy defaults for 16–17 | T2.1–T2.5 |
| AI-in-hiring law | **missing** | per-task disclosure prose | AI feature register as code, disclosure component + "why", sensitive-field firewall test, attestation detector, counsel memo, fairness check | T3.1–T3.7 |
| Accessibility | **partial** | aria effort in ui/app-v3 | statement page, CI gate, ui contract, manual SR audit, extension drawer, ACR for org buyers | T4.1–T4.6 |
| Security program | **partial** | auth baseline, encryption | security.txt + VDP, headers/CSP, supply-chain scanning, /security page, IR runbook, pen test, secrets rotation, SOC 2 path, extension hardening | T5.1–T5.9 |
| Store compliance | **partial** | PRIVACY.md, AMO `data_collection_permissions` | 2026 Limited-Use review (analytics!), sync test, per-fill transparency, one source for three stores | T6.1–T6.4 |
| Trust UX | **missing** | — | /trust hub, nutrition label, personal data-access ledger, claims register, transparency report | T7.1–T7.5 |
| Regulatory watch | **missing** | — | quarterly log + CI doc-sync bundle | T8.1–T8.2 |

## 2. Findings that change the plan (ranked)

1. **Gemini free tier** means resumes, questions and job mail may be used by Google "to improve its
   services" and seen by human reviewers, with no DPA. Every competitor with a serious policy avoids
   this. Fix before Launch 1 (T1.6); the AI budget math moves from $0 to real per-call cost (see §4).
2. **Chrome Web Store Limited Use was tightened and is enforced since 2026-08-01**: user data must be
   "strictly necessary to the extension's disclosed single purpose"; collection for other purposes is
   prohibited and data practices must be prominently disclosed, with proactive notice on change. The
   extension's GA4 analytics (opt-out) and `www.google-analytics.com` host permission are the exposed
   part (T6.1). First-party, unlinked fill-quality counts are defensible as quality of the single
   purpose; third-party analytics is the thing to drop or make opt-in.
3. **No HTTP security headers anywhere** (web, API beyond Spring defaults, edge). A CSP, HSTS,
   `frame-ancestors`, `Referrer-Policy` and `Permissions-Policy` are a one-session fix (T5.2) and the
   first thing any pen test or procurement questionnaire asks.
4. **Nothing is recorded when a user accepts the terms** (T0.2). Without `legal_acceptance` the
   billing terms (auto-renew, no refunds) rest on a copy line, and material changes cannot be
   re-accepted (A9.6 designed the table; this area makes the user side real).
5. **16+ without an age screen** exposes the product to COPPA (under 13, amended rule in force, compliance
   deadline 2026-04-22) and GDPR Art. 8 (16 default; 13–16 by member state) with no evidence of a
   neutral check. 16–17-year-olds are "children" under the UK Children's Code, so defaults for that
   band matter (T2.1, T2.4).
6. **Promises without tests**: "never EEO to AI/orgs/suggestions", "never auto-submit", "admins see
   metadata only" are true by construction today and one refactor away from false. T3.3, T3.4, T1.3
   turn them into failing tests.
7. **No vulnerability disclosure route** — a researcher who finds something today has `support@`
   routed to Gmail and no safe-harbour statement (T5.1).

## 3. Competitive benchmark (checked 2026-10-11)

Job seekers hand these tools their whole history — resume, salary, work authorization, EEO answers,
every application. Trust is decided by five things: who else sees it (ads, employers, model
training), whether it acts without you (auto-apply), whether you can leave cleanly (export/delete),
whether the policy is current and specific, and whether security is described or merely asserted.

| Product | What it does best (trust-wise) | Controversies / weak spots | Kiwiply: beats / must match / don't copy |
|---|---|---|---|
| **Simplify** (`simplify.jobs`, autofill extension) — policy updated 2026-08-19 ([simplify.jobs/privacy.html](https://simplify.jobs/privacy.html)) | The most complete policy in the category: named analytics/ads providers, CPRA categories, **GPC honoured**, 45-day CA process with appeals, SCCs for transfers, EEA ads/analytics off unless opted in, "no AI feature makes hiring decisions without human review", providers may not train on Simplify data ("enterprise or no-training configurations"), **18+** | Shares identifiers/conversion events with **Google and Meta ad platforms**; extension collects **form field values you enter**, diagnostic URLs and, in support reports, "a recording of your interaction with the application page"; uses behavioural signals (jobs viewed/saved/applied, responses to AI suggestions) to train its own matching models; opt-in data-labelling program collects tax details | **Beats:** no ads, no ad pixels, count-only telemetry with no field values or URLs, no interaction recordings, EEO firewall. **Must match:** GPC, CPRA categories + 45-day process, named providers, SCCs, provider no-training (we are *behind* on the free tier — T1.6), human-review statement. **Don't copy:** ad-platform sharing, recordings, behavioural-signal training |
| **Teal** (`tealhq.com`, tracker + resume builder) — policy "Last Updated: August 12, 2026" ([tealhq.com/privacy-policy](https://www.tealhq.com/privacy-policy)) | Names **OpenAI**, Stripe, Google Analytics, Impact.com; encryption in transit/at rest, "regular security assessments"; deletion/anonymisation within **30 days**; CCPA + EEA/UK sections | "Career content may be used to improve Teal's AI models in anonymized, aggregated form"; export/delete by **emailing support** (no self-serve); **no minimum age stated**; advertising partners + affiliate tracking | **Beats:** self-serve export + delete, no model training on career content, explicit age rule. **Must match:** a 30-day backup purge statement, named AI provider, "regular security assessments" (T5.6). **Don't copy:** anonymised training on resumes, email-only rights |
| **Jobscan** (`jobscan.co`, ATS match scoring) — policy page not retrievable programmatically on 2026-10-11 (`/privacy-policy` 404, `/privacy` renders only navigation) | Deep ATS-parsing research; free tier | Deletion via support/live chat; retention after deletion and AI-provider sharing not stated per third-party write-ups ([jobshinobi](https://jobshinobi.com/blog/jobscan-resume-scanner-privacy-and-data)); no SOC 2 evidence found | **Beats:** reachable, specific policy; self-serve delete. **Must match:** nothing beyond what Simplify sets. **Don't copy:** a policy that can't be read without JS |
| **Huntr** (`huntr.co`, tracker + autofill) — policy last modified 2024-02-08 ([huntr.co/privacy](https://huntr.co/privacy)) | "Never sell"; employer/organization sharing only with consent; **18+** | Policy **two and a half years old**, no GDPR/CCPA sections, no export right, deletion "through your Organization" when Huntr is a processor for a school; third parties unnamed except Stripe | **Beats:** the org consent model (`consent-data-sharing.md`: the person owns the switch, no "request access" button) and a current, versioned policy (T0.3). **Must match:** 18+ clarity for org deployments — we chose 16+ with assertions, so our minors design must be visibly stronger (T2) |
| **LazyApply / mass auto-apply tools** (`lazyapply.com`) | Volume (claims up to 1,500 Easy Apply/day) | LinkedIn's User Agreement bans bots; users report 30-day bans and "excessive applying" warnings ([dev.to](https://dev.to/elyasian_57e0befd2a586e37/why-lazyapply-got-me-linkedin-banned-and-what-i-use-instead-jjh), [scale.jobs](https://scale.jobs/blog/lazyapply-risk-profile-banned-linkedin)); Trustpilot complaints about spam-flagged emails and no replies from 1,000+ applications; generic applications | **Beats (by locked decision):** no auto-submit, no CAPTCHA bypass, Autopilot stops before submit and never ticks attestations. **Don't copy:** anything. Say so on the trust page — "we never apply for you" is a trust *feature* this audience understands |
| **LinkedIn** | Scale; verified employer identity | Opted US members **into AI training by default** (Aug 2024), opt-out introduced after press coverage, "won't reverse training already completed"; 2025 class action over Premium InMail used for training ([ITPro](https://itpro.com/security/privacy/linkedin-faces-lawsuit-amid-claims-it-shared-users-private-messages-to-train-ai-models), [Silicon Republic](https://www.siliconrepublic.com/business/linkedin-ai-lawsuit-us-premium)); ICO said opt-out was insufficient | **Beats:** no training on user data, ever, and the connected inbox is read-only with a dedicated account. **Don't copy:** default-on training, retroactive opt-outs |
| **Jobright** (`jobright.ai`, AI matching + auto-apply) — policy effective 2026-06-15 per tracker ([tostracker](https://tostracker.app/document/jobrightai-privacy)) | Fast matching UX | Tracker summary: "may use your content to train AI models", "uses automated decision-making"; auto-apply | **Beats:** explicit no-training, explainable rules-first matching with "why this match" (T3.2). **Don't copy:** training on content, auto-apply |
| **Sonara** (`sonara.ai`, auto-apply) — policy updated 2026-07-21 | Hands-off applying | Applies on your behalf — the exact behaviour the locked decisions exclude; policy text not retrievable beyond the intro | **Beats:** every submit is yours. **Don't copy:** auto-apply |
| **Careerflow** (`careerflow.ai`, LinkedIn optimiser + tracker) | FAQ: encrypted in transit and at rest, never sold ([careerflow.ai/faq](https://www.careerflow.ai/faq)) | Policy last updated **December 2022**; trust claims live in an FAQ, not the policy | **Beats:** current policy with a changelog. **Must match:** the plain "encrypted at rest" sentence on a /security page (T5.4) |
| **Platform rules** — Chrome Web Store 2026 policy update ([developer.chrome.com](https://developer.chrome.com/blog/cws-policy-updates-2026)), enforced 2026-08-01 | — | "Any user data collected by an extension must now be strictly necessary to the extension's disclosed single purpose"; disclosure must be prominent; practice changes need proactive user notice | **Must match now:** T6.1 (analytics decision), T6.2 (sync test), T0.4 (change notice). Firefox AMO already enforces `data_collection_permissions` (done in `wxt.config.ts`) |

**Where Kiwiply already leads:** no ads and no ad pixels; no auto-submit; count-only telemetry that
cannot be linked to an account; per-feature AI disclosure naming exactly what is sent; EEO answers
set only on the web and never sent anywhere; inbox read-only on a dedicated account; self-serve
export and delete that also cancels Stripe; an org model where the member owns the sharing switch.

**Where Kiwiply is behind today:** AI provider on a free tier with a "may be used to improve
services" clause (T1.6); no GPC (T1.7); no named subprocessor list or DPAs (T1.5); no acceptance
record (T0.2); no security headers, security.txt or scanning (T5.1–T5.3); no accessibility statement
or CI gate (T4.1–T4.2); 16+ with no age screen (T2.1); policy without version history (T0.3).

**What we should not copy:** ad-platform sharing, interaction recordings, behavioural-signal or
content training, email-only rights, default-on anything that sends data to a third party, auto-apply.

## 4. Cost note (for T1.6)

Moving PARSE/DRAFT/MATCH/FIT/TAILOR/JOBS/INBOX off the Gemini free tier makes every call cost real
money. `AiPolicy` already meters per task with a $3/mo · $8/quarter Pro budget and a kill switch; the
Free plan's one AI call (resume parsing) becomes a per-signup cost (one parse of ≤ 10 k tokens on a
flash-class model is a fraction of a cent). The 80 % margin floor is unaffected at these prices; what
changes is that "free tier" disappears from `/privacy` and a DPA + no-training terms become possible
(Gemini API paid tier / Vertex AI). The exact tier choice is an open question for the `ai` area and the
user.

## 5. Status counts for `areas/trust.json`

**done** (1): the privacy baseline that exists (T1.0). **partial** (14): copy or code exists but is
unrecorded, untested or incomplete (acceptance line, policy pages, export, delete, retention,
cookie banner, 16+ rule, AI disclosure copy, sensitive-field handling, no-auto-submit, store
disclosure, extension security, nutrition-label plans, provenance ledger). **blocked** (3): the stories
that cannot finish without counsel (T0.5, T2.5, T3.5). **not_started** (38): everything else.

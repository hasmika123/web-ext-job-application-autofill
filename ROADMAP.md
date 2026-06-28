# Dossier — Productization Roadmap & Architecture Plan

> Companion to `job-autofill/` (manifest 0.6.9, ruleset v4). This plan takes the
> extension from a privacy-first local-only tool to a public free product with a
> path to commercial SaaS. Hand this file to Claude Code as the working spec.

## Decisions locked in (from planning)

- **Data model:** Cloud backend is the source of truth. Accounts required; the
  extension and a new web app are clients.
- **Product goal:** Public free product first, commercial SaaS later. So every
  choice below is made to be *free-tier cheap now* and *monetizable later*.
- **Backend:** Spring Boot (JHipster 8, Java 17) + MySQL — **decided & built** (see `CLAUDE.md` locked decisions).
- **Analytics:** GA4, with a light, respectful disclosure. Not strictly private,
  but no selling data and a clear privacy policy.

## The one tension to name up front

The current README sells "All data stays on your device. No server." Moving to a
cloud source of truth **reverses the product's headline promise.** That is a
legitimate product decision — Simplify and Teal (the two market leaders) both run
exactly this model: you build a profile on their site, and the extension is a
thin client against their cloud account. ([Simplify](https://simplify.jobs/copilot),
[Teal](https://www.tealhq.com/tool/job-search-chrome-extension)) But it means you
must, on day one of Phase 1: rewrite the privacy section, publish a real privacy
policy, and update the Chrome Web Store data-use disclosures. Treat that as a
hard checklist item, not an afterthought — CWS rejects extensions whose disclosed
data use doesn't match behavior.

---

## Backend stack (decided & built — Phase 1 complete)

> Historical rationale kept for context; the stack below is **decided and live**
> (it does not need approval). You know Spring Boot best, you're aiming at SaaS, and
> you were worried about Supabase cost/scalability at scale. That pointed cleanly to:

**Spring Boot 3 (JHipster 8, Java 17) + MySQL + Cloudflare R2 + JWT auth.**

| Concern | Recommendation | Why |
|---|---|---|
| API | Spring Boot 3, Java 17, Gradle | Your strongest skill = fastest *real* progress and the codebase you'll actually maintain. Scales horizontally, trivially containerized. |
| Auth | Spring Security + JWT (access + refresh tokens) | No per-MAU billing (the thing that bites with hosted auth). Full control for SaaS tiers later. *Alternative if you want to skip auth plumbing: Clerk or Auth0 — fast, but per-MAU cost returns.* |
| Database | **MySQL** (managed) — **Railway MySQL** or **Aiven** (free tier) to start; **AWS RDS / Aurora MySQL** when revenue justifies | Your choice. MySQL is rock-solid, ubiquitous, cheap to host, and JHipster supports it natively. (Note: Neon is Postgres-only, so it's out; Railway lets you run the app + MySQL on one platform to start.) |
| Resume file storage | **Cloudflare R2** (S3-compatible, **zero egress fees**) | Resumes are blobs; don't put them in the DB. R2 is dramatically cheaper than S3 at download-heavy scale. |
| App hosting | **Railway** or **Render** to launch (cheap, container-native), migrate to AWS/GCP later | Containerize from day one so the host is swappable. |
| Web dashboard | **Next.js (React)** as a long-running **container** (`next start`, `output: 'standalone'`) on Railway/Render/Fly/VPS | Needed for tracking + account management (see below). **No Express/custom server** (Next ships its own). Vercel allowed but not assumed — a container removes the serverless body limit so resume uploads proxy through Next (Option A). |

### On Supabase (your prior experience)
Supabase is excellent for shipping in days, but your instinct is right: its
pricing steps up after the free tier (compute + per-MAU auth + bandwidth), and at
scale you have less control over cost than self-hosted Spring + MySQL + R2. Since
you already know Spring Boot, you capture more long-term value building the API
yourself. **Use Supabase only if speed-to-first-launch matters more than control.**
My recommendation is Spring Boot. *Approve this and Phase 1 proceeds; say the word
and I'll re-plan Phase 1 around Supabase instead.*

### The component you didn't list but need
Tracking + accounts implies a **web dashboard** (account signup, the Kanban
application tracker, settings, eventually billing). Both Simplify and Teal put the
tracker on their website, not in the extension popup. Budget for this Next.js app —
it's a first-class deliverable, folded into Phases 1 and 3 below.

---

## Target architecture

```
                          ┌─────────────────────────┐
                          │   GA4 (Measurement       │
                          │   Protocol + gtag.js)    │
                          └──────────▲───────▲───────┘
                                     │       │
   ┌──────────────────┐   events     │       │  events    ┌──────────────────┐
   │  Chrome/Edge/FF  │──────────────┘       └────────────│  Web dashboard   │
   │  Extension (MV3) │                                   │ Next.js container│
   │                  │                                   │                  │
   │  - adapters      │                                   │  - signup/login  │
   │  - filler        │                                   │  - Kanban tracker│
   │  - local cache   │                                   │  - settings      │
   │  - SW: API+GA    │                                   │  - billing(later)│
   │  ┌────────────┐  │   REST + JWT      ┌───────────────└──────────────────┘
   │  │Tracking     │  │  (canonical DTOs) ▼
   │  │Provider     │──┼──────────────► ┌─────────────────────┐
   │  │(swappable)  │  │                │  Spring Boot API     │
   │  └────────────┘  │                │  (Java 17, Railway)  │
   └──────────────────┘                │  - /auth /profile    │
        │  same interface →            │  - /resumes /apps    │
        │  any compatible backend      │  - /ai (metered)     │──► Anthropic API
        ▼                              │  - /fieldcache       │    (server key)
   ┌──────────────┐                    └───────┬─────────┬────┘
   │ 3rd-party     │                           ▼         ▼
   │ tracker API   │                ┌──────────────┐  ┌──────────────┐
   │ (future)      │                │  MySQL       │  │ Cloudflare R2│
   └──────────────┘                │  (Railway)   │  │ resume blobs │
                                    └──────────────┘  └──────────────┘
```

The extension keeps its current local store as an **offline cache / write-ahead
buffer**, but the server is authoritative: on login it pulls profile + resumes,
and it pushes changes up. This keeps autofill working if the network blips while
making cloud the source of truth.

### Pluggable tracking backend (swappable by design)
The extension must **not** be hardwired to the Dossier API. All outbound calls go
through a single `TrackingProvider` interface that speaks **canonical DTOs**
(the same field vocabulary the adapters already use), not any one backend's wire
format. A concrete `DossierApiProvider` implements it for our backend; a future
provider can point the same extension at a different tracker (Teal/Huntr-style,
or a self-hosted one) by implementing the interface and mapping DTOs ↔ that API.

Design rules to keep it unpluggable-and-repluggable:
- **One seam:** every network call lives behind `TrackingProvider`
  (`authenticate`, `pushProfile/pullProfile`, `pushResume`, `pushApplication`,
  `listApplications`, `syncFieldCache`). No `fetch()` to the backend anywhere else.
- **Canonical DTOs, versioned:** the extension owns a stable data contract; each
  provider adapter translates to/from its backend. Backend changes never ripple
  into adapter/filler code.
- **Config-driven endpoint:** base URL + auth strategy are settings, not constants,
  so swapping backends is a config change plus a provider class — not a refactor.
- **Documented REST contract (OpenAPI):** the Spring Boot API publishes an OpenAPI
  spec (JHipster generates springdoc by default). That spec *is* the contract a
  third-party backend implements to be Dossier-compatible.
- **Mirror it server-side (ports & adapters):** keep controllers thin and put
  storage behind interfaces, so the backend itself can swap MySQL or R2 later
  without touching business logic.

This is the same ports-and-adapters philosophy the site adapters already follow,
applied to the outbound integration.

### Core data model (MySQL sketch)

```
users(id, email, password_hash, created_at, plan)
bios(id, user_id → users, json_payload, updated_at)          -- one per user
resumes(id, user_id, label, r2_object_key, parsed_json,
        status, created_at)                                  -- many per user
resumes(... + archived BOOL default false)                   -- archive, never lose
applications(id, user_id, resume_id → resumes, company,
        role_title, location, job_url, external_job_id,
        ats_platform, job_description, status, submission_confirmed,
        applied_at, source, created_at, updated_at)          -- the tracker
field_cache(id, user_id, field_key, context_hash, value,
        hit_count, updated_at)                               -- learned answers
ai_answers(id, user_id, question_hash, answer, model,
        tokens, created_at)                                  -- cached AI drafts
events_outbox(...)  -- optional, if you buffer GA events server-side

-- application.status ∈ {DRAFT, SAVED, APPLIED, INTERVIEW, OFFER, REJECTED}
--   DRAFT = fill started, submission NOT confirmed by the extension → the web
--           tracker shows a "Did you submit?" nudge to resolve it.
-- external_job_id + job_url = dedup key (upsert, no duplicate rows on revisit).
-- submission_confirmed = true only when the extension saw the confirmation.
```

`applications.job_description` + `resume_id` is the key insight from Teal: capture
the JD and the exact resume variant used at submit time, so the user can later see
*what they sent where*. ([Teal](https://www.tealhq.com/tools/job-tracker))

> **Already-built note:** the backend (`api/`) was generated from `dossier.jdl` in
> Phase 1 and is live with MySQL. These new columns are therefore applied as an
> **additive Liquibase migration on the existing backend** — do NOT regenerate the
> whole app. `dossier.jdl` is kept updated as *documentation* / clean-regen source,
> but the migration is the authoritative change.

---

## Recommended build order

The order below is driven by **dependencies and value**, not the order you listed.
Two items need no backend and can start *immediately, in parallel* with everything;
the rest form a dependency chain.

### Phase 0 — Quick wins, no backend (start now, parallel)
- **Cached Field Choices (local-only version).** Pure client work: when the user
  corrects a filled value or picks a custom-dropdown option, persist
  `{field_key, context, value}` in IndexedDB and prefer it on the next fill. Big
  UX win, zero infra, and it de-risks the data shape you'll later sync to the
  server in Phase 4.
- **More ATS adapters** (part of "Other Platforms"). Adding Indeed / LinkedIn
  Easy Apply / deeper iCIMS-Taleo support needs no backend and follows your
  existing "copy lever.js, edit three methods" pattern. This work is continuous
  and can interleave with every later phase.

### Client split — extension vs web (the product shape)
The **web app is the primary product**: sign up, upload/parse/manage resumes, edit
the bio, and browse/manage the application board — all without installing anything.
The **extension is the optional on-page agent**: it does only what *requires being
on the live application/job page* — autofill, capture job details into the tracker,
record which resume was used, detect submission, and save-a-job. This lowers
adoption friction (try the product with no install) and matches how Simplify and
Teal are structured. Resume parsing (`parser.js`, pdf.js + mammoth) is plain
browser JS, so it's extracted into a **shared module both clients use** — the web
app parses in the user's browser; no separate Java parser needed.

Capabilities by surface:
- **Extension (on-page only):** autofill · job-detail capture · resume-used
  linkage · submission detection · save-a-job · field-choice learning · review
  overlay · file attach.
- **Web app (everything else):** account/auth · resume upload+review+archive · bio
  editor · Kanban application board · settings · billing (later).

### Runtime & hosting (locked)
Both apps run as **long-running containers; no serverless is assumed.**
- **Web** = Next.js's own server (`next start`, built with `output: 'standalone'`).
  **No Express / custom server** — Next ships its server, and wrapping it in Express
  would only disable Next optimizations. Express is revisited *only* if a separate
  standalone Node microservice ever appears.
- **API** = Spring Boot embedded Tomcat in a container (already how it runs).
  Standalone-Tomcat WAR stays a possible option, not the default.
- **Consequence:** the resume **upload proxy (Option A)** is permanent — a
  long-running Node server has no serverless body limit, so the browser uploads
  through a Next route handler to Spring/R2 (consistent with "browser never calls
  Spring directly"). Presigned direct-to-R2 (Option B) is kept only as a fallback if
  the web app is ever moved to a serverless host. Stream uploads + cap size (~10MB).
- **Deployable units:** API container + managed MySQL + R2 bucket · web container
  (`next start`) · extension → Chrome Web Store.

### Phase 1 — Backend + Accounts  *(keystone — unblocks everything)*
Spring Boot API (MySQL), JWT auth, R2 file storage; Next.js app with
signup/login/settings; extension gains a login screen and sync layer (built:
`tracking.js` provider seam + `sync.js`). Migrate the local bio + resumes model to
server-backed. **Ship the privacy policy + CWS disclosure rewrite here.** Nothing
else cloud-dependent can start until this lands.

### Phase 2 — Deployment + CI/CD  *(do it right after first deploy)*
Stand up staging + prod for the API and web app as **long-running containers**
(API = Spring embedded Tomcat; web = Next `next start`, `output: 'standalone'`, no
Express) on Railway/Render/Fly/VPS — no serverless assumed. Then the pipeline (**G**): GitHub Actions runs `npm test` for the
extension and the Spring test suite, builds artifacts, deploys backend on merge to
`main`, and publishes the extension via the Chrome Web Store API. Doing this early
means every later phase ships safely and automatically. (G depends on D; treat
them as one phase.)

### Phase 3 — Application Tracking  *(flagship value — the self-populating tracker)*
The tracker fills *itself* as the user applies. Pieces:

- **Job-detail capture chain.** When the user fills or saves, the extension reads
  the job: try `schema.org/JobPosting` **JSON-LD first** (standardized across many
  ATS/boards → title, company, location, description), then a per-site
  `captureJob()` on the existing adapter, then generic `<meta>`/heuristics. Returns
  a canonical `JobCapture` DTO and pushes it via `TrackingProvider.pushApplication`.
- **Resume-used linkage.** The extension already knows which variant was picked for
  the fill → attach `resume_id`. No detection needed.
- **Submission detection (graceful).** On fill, upsert a **DRAFT** entry (dedup on
  `external_job_id`/`job_url`). If the extension is active and sees the confirmation
  — a redirect to a "thank you / received" page (`webNavigation`) or a success
  signal in the DOM — it flips the entry to **APPLIED** (`submission_confirmed=true`,
  `applied_at` set) automatically. If fill started but no confirmation was captured,
  the entry stays **DRAFT** and the **web tracker shows a "Did you submit?" nudge**
  to resolve it (Yes → APPLIED, No → keep/drop). Never auto-submit; detection
  degrades to a user confirmation rather than guessing.
- **Save-a-job.** One click in the popup → **SAVED** entry via the same capture
  chain, no resume attached.
- **Resume archive guard.** Resumes carry an `archived` flag. If the user tries to
  delete a resume that's referenced by any application (esp. an APPLIED one), the UI
  **nudges them to archive instead** so the applied job keeps its resume reference.
  Archived resumes are hidden from the active picker but never lost.
- **Web board.** Next.js Kanban (Draft → Saved → Applied → Interview → Offer →
  Rejected) — the main reason users create an account. Matches Simplify/Teal.

Backend: additive migration (new Application/Resume columns + DRAFT enum value),
and the provider/seam grows `updateApplication` (status changes, confirm submit)
and `archiveResume` alongside the existing `pushApplication`/`listApplications`.

### Phase 4 — Cached Field Choices (cloud sync)
Promote the Phase 0 local cache to `field_cache` on the server so learned answers
follow the user across devices and browsers. Add last-write-wins + `hit_count`
ranking.

### Phase 5 — AI Integration (server-side)
Today AI is bring-your-own Anthropic key, called from the service worker. For a
public product, add a **server-side metered AI proxy** (`/ai`) so free users get a
small monthly quota on *your* key and you can rate-limit and later gate by plan —
this is how the paid leaders work ($15–40/mo tiers all bundle server-side AI).
([market scan](https://www.resumly.ai/best/best-ai-auto-apply-tools)) **Keep the
BYO-key option** as a free "unlimited if you bring your own key" path; it costs you
nothing and power users like it. Server-side keeps your API key out of the client
(BYO-key in an extension is fine but your own key must never ship in the bundle).

### Phase 6 — Google Analytics (full funnel)
Extension events go through the **GA4 Measurement Protocol from the service
worker** — gtag.js and any remote code are banned under MV3, so the Measurement
Protocol (with `measurement_id` + `api_secret`) is the only supported path, and
it's the one Chrome's own docs prescribe.
([Chrome docs](https://developer.chrome.com/docs/extensions/how-to/integrate/google-analytics-4))
The web app uses normal gtag.js. Watch the MV3 gotcha: the service worker dies
after ~30s idle, so **send events immediately, don't batch in memory.** A light
disclosure in the privacy policy covers the "respectful" bar you asked for.

### Phase 7 — Accommodate Other Platforms (browsers)
The *browser* side of "other platforms": Edge and Firefox are largely free (both
run MV3; Firefox needs minor `browser.*` vs `chrome.*` polyfilling and its own
store submission). Safari needs Apple's converter + a Mac/Xcode and is a bigger
lift — defer it. Do browser-porting **last** because it multiplies your test and
release surface, and you want CI/CD (Phase 2) and a stable core in place first.

> **Ambiguity flag:** "Accommodate Other Platforms" could mean *more job sites/ATS*
> or *more browsers*. I've split it: ATS adapters live in Phase 0 (continuous,
> no dependencies); browser ports live in Phase 7. If you meant only one of these,
> tell me and I'll collapse it.

### Phase 8 — Enterprise & Compliance (deferred B2B work)
The enterprise-only slices, parked until the consumer product + deployment are real.
The *consumer-grade* pieces of these areas were pulled forward into Phase 1.11
(basic account/data deletion for GDPR/CCPA; basic refresh-token rotation +
revocation) because they're table-stakes for any public product handling resume PII,
not enterprise upsells. Phase 8 is the fuller, org-selling version: **8.1 SSO**
(SAML/OIDC + later SCIM/MFA), **8.2 multi-tenancy** (org/tenant model + isolation +
admin console, building on the 1.11 leak fix and the "current principal"
abstraction), **8.3 session control** (revocable sessions, rotation at scale, forced
logout across both the extension Bearer and web cookie surfaces), **8.4 audit &
compliance** (audit logging, PII retention tooling, GDPR/CCPA + SOC 2 groundwork,
secrets in vault/KMS, deeper RBAC). Easy to reorder earlier if a B2B deal demands it.

### Order at a glance

| Order | Feature | Depends on | Backend? |
|---|---|---|---|
| 0 | Field cache (local) + more ATS adapters | — | No |
| 1 | Backend + Accounts + web app + privacy/deletion/security gate | — | **Builds it** |
| 2 | Deployment + CI/CD (containers, no serverless assumed) | 1 | Yes |
| 3 | Application Tracking | 1 | Yes |
| 4 | Field cache (cloud sync) | 1, (0) | Yes |
| 5 | AI Integration (server proxy + keep BYO) | 1, 2 | Yes |
| 6 | Google Analytics (full) | 1 | Yes |
| 7 | Other browsers (Edge/Firefox; Safari later) | 2 | No |
| 8 | Enterprise & Compliance (SSO, multi-tenancy, audit) | 1, 2 | Yes |
| 9 | Admin console, ops & comms — **see `ADMIN-PLAN.md`** (A0 default-admin fix → admin/users/audit → AI/sessions/ops → analytics → email subscription → bug reports) | 1, 2 | Yes |

---

## How this compares to the industry leaders (cross-check)

| Area | Your plan | Simplify / Teal (leaders) | Verdict |
|---|---|---|---|
| Source of truth | Cloud account | Cloud account (profile built on their site) | ✅ Same — you're aligned. |
| Tracking | Kanban on web dashboard, auto-logged on submit | Identical pattern; Teal stores JDs, Simplify auto-logs every submit | ✅ Adopt JD capture + resume-version link. |
| AI | Server proxy (metered free) **+** keep BYO key | Server-side only, gated behind $15–40/mo | ⚠️ Your BYO-key free path is a *differentiator* — keep it. |
| Analytics | GA4 (MP in extension, gtag on web) | Standard product analytics | ✅ Fine; just disclose. |
| Multi-platform | Chrome→Edge→Firefox, Safari later; ATS adapters continuous | Chrome + Firefox + Edge | ✅ Same priority order. |
| Field caching | Learned per-field cache, synced | Leaders "learn" answers across applications | ✅ Table stakes — don't skip it. |

**Two things the leaders do that aren't on your list but are cheap wins:** (1)
*bookmark/save a job without applying* (a row in `applications` with status
`Saved`) — both leaders push this hard as the top-of-funnel hook; (2) *job-board
capture* (save postings from LinkedIn/Indeed), which reuses your content-script
infra. Consider folding both into Phase 3.

**One thing to be cautious about:** several "auto-apply" tools blur into bulk
auto-submission, which trips ATS anti-bot systems and draws CWS scrutiny. Your
no-auto-submit stance is a *trust asset* — keep it even as you add accounts.

---

## Should you switch to Claude Code? — Yes, for this.

For the work ahead, Claude Code is the better-fit tool, and there's a concrete
reason beyond general preference:

- **This is now a multi-repo software project** (Spring Boot API + Next.js app +
  the extension), with git, two test suites, builds, and CI. Claude Code is
  terminal-native: it runs `./gradlew test`, `npm test`, git operations, and the
  deploy pipeline in a tight loop — exactly the inner loop Phases 1–7 demand.
- **It kills the sync bug your dossier warns about.** Your handoff notes that the
  OneDrive↔sandbox mount serves "stale/truncated copies" in this Cowork
  environment. That's an artifact of the cloud-mounted sandbox. Claude Code
  running on a normal local git checkout doesn't have that mount layer, so that
  whole class of "verify the file actually wrote" pain disappears.
- **Persistent project context:** a `CLAUDE.md` in each repo, custom slash
  commands (e.g. `/new-adapter`, `/bump-version`), and subagents for review/test
  fit a long-lived codebase far better than per-session Cowork chats.

Keep Cowork for what it's good at: research, docs, one-off file/spreadsheet jobs,
and GUI/connector automation. **Do the build in Claude Code.**

To set it up well: drop this `ROADMAP.md` plus a short `CLAUDE.md` (build/test
commands, the "capture tenant DOM before guessing" rule, the version-bump ritual
from your dossier) at each repo root, and consider a monorepo
(`/extension`, `/api`, `/web`) so one Claude Code session sees all three.

---

## Immediate next steps (original kickoff — all complete; kept for history)
1. ✅ Stack decided: Spring Boot (JHipster 8) + MySQL + R2 + Next.js (not Supabase).
2. ✅ "Other Platforms" split: more ATS = Phase 0 (continuous); more browsers = Phase 7.
3. ✅ Phase 0 done (local field cache + Workable adapter).
4. ✅ Build moved into Claude Code; `CLAUDE.md` files + Phase 1 backend skeleton built.
   *Live status is tracked in `PROGRESS.md` — currently Phase 1, Task 1.10d.*

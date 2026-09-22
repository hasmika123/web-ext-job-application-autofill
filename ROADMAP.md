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

#### Phase 3.6 — Job-details extraction v2 (capture provenance + structured salary + opt-in AI enrichment)
Upgrade the capture chain from "first non-empty string wins" to a provenance-aware,
queryable capture — keeping the deterministic pipeline as tier 1 (free, instant,
private) and adding AI only as an opt-in gap-filler, never as the primary extractor.

- **Structured salary.** Alongside the display string, derive
  `salaryParsed {min,max,currency,period}` from schema.org amounts or the matched
  salary text — the prerequisite for salary filtering/sorting on the web board.
- **Field provenance.** Every captured field is tagged with its extractor
  (`jsonld|adapter|board|generic|text|ai`) in `capture.sources`, so the UI and
  future features can distinguish structured-data facts from heuristic guesses.
- **Wider deterministic heuristics before AI.** Conservative description-text scans
  for jobType (single unambiguous keyword; two different types = no call) and
  jobMode (work/role/location-bound phrases only — "hybrid cloud"/"onsite
  interviews" never match), cutting null rates without breaking the dossier
  "capture a strong signal, don't guess" rule.
- **Opt-in AI enrichment (its OWN toggle, default OFF).** `JAF.jobEnrich` + the SW's
  `enrichCapture()` fill ONLY the remaining gaps (jobType/jobMode/salary) from the
  posting's public description text — never profile/resume data, never overriding a
  deterministic value. Rides the existing two-tier model chain (BYO Anthropic key →
  consented Kiwiply AI/Gemini relay), strict JSON-out validation, per-posting cache
  so a job costs at most one AI call ever.
- **Later (unscheduled):** server-side `salary_min/max/currency/period` columns
  (additive Liquibase) + board salary filters; cross-board dedup of the same posting
  (normalized company+title+location match, no embeddings); adapter-rot telemetry
  (anonymous per-tier extraction-miss counts so Workday markup changes surface
  before users report them); review-overlay provenance badges (show `sources`).

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

> **Extended to resume parsing (2026-07-02, see PROGRESS.md Phase 5.4).** The same
> `AiProvider` seam now also does structured resume→JSON parsing (not just answer
> drafting) — Gemini's `responseSchema` structured output, with the original PDF sent
> when text extraction looks garbled (scanned/multi-column layouts), on the same
> metered quota. This is the accuracy fix for varied resume structures that the
> regex-only heuristic parser couldn't reliably handle.

> **Extended to fill-engine matching quality (2026-07-03, see PROGRESS.md Phase 5.5).**
> Four upgrades to the extension's autofill-matching pipeline, keeping the same
> deterministic-first / AI-as-fallback shape: (1) the standardized W3C `autocomplete`
> attribute as a high-confidence signal (data-driven per-host distrust list — Workday's
> is unreliable); (2) tiered label-signal scoring so a real `<label>` beats a placeholder,
> surfaced as low-confidence/unchecked rows in the review overlay; (3) a **cached AI
> field-mapper** — fields the deterministic rules miss get one batched, cached model call
> through the same BYO-key/server-AI gates as drafting, so any given page costs at most one
> call ever per device; (4) **AI picks for constrained screening questions** (selects/radio
> groups), where the model's reply is validated against the page's own literal option list
> (hallucination-proof by construction). No new tech stack, no per-field LLM cost.

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

### Phase 10 — Fill Quality & the Self-Building Profile  *(the Pro-plan gate)*

**Why this phase exists.** Phases 0–9 built the platform; this one makes the thing people
actually pay for *good*. A paid user forgives a missing feature and does not forgive an
autofill that leaves half the form empty. Today the engine has 6 adapters and a **23-field
vocabulary** (`src/lib/schema.js`), so anything outside name/contact/links/EEO is AI-or-nothing
— and AI is **off by default** (BYO key or server-AI opt-in). Five manifest hosts (iCIMS,
Taleo, SmartRecruiters, BambooHR, Jobvite) run on the generic label scanner with no adapter at
all. Market benchmark: Simplify advertises 100+ ATS and 20k+ career pages, a rich profile
schema, and a saved-answer bank; reliability — not speed — is what users punish in reviews.

#### 10.1 Measure first (do before any adapter work)
- **Fill telemetry per ATS**: one event per fill with `{ats, fieldsFound, fieldsFilled,
  userCorrected, requiredLeftEmpty}`. No values, only counts — same privacy line the field
  mapper already holds (labels leave the page, values never do).
- Feeds a `/admin/analytics` panel ranking ATS by failure rate, so adapter work is **directed
  by data instead of guessed**. Without this, 10.4 is a guessing game.
- **As built (2026-09-22):**
  - **First-party, into our DB** (`fill_event`), not GA4 — the admin panel has to read it.
    **No user id on the row**: this measures the engine, not people, so there is nothing to link
    back to an account or to erase with one.
  - **ATS = a fixed family**, reduced from the hostname *in the content script*
    (`fill-telemetry.js`), because the five uncovered hosts all run on the generic adapter and
    would otherwise be indistinguishable — and a company's careers domain must never leave the
    page. The server re-enforces the vocabulary (`FillTelemetryService.ATS_FAMILIES`).
  - **`fieldsFound`** = fillable + manual rows; **`fieldsFailed`** = ticked but not applied;
    **`requiredLeftEmpty`** from `required-audit.js` (native `required`/`aria-required` only —
    under-counts custom widgets on purpose; 10.2 reuses the scan and can widen it).
  - **`userCorrected`** arrives later: the first time the user commits a *different* value to a
    field we filled (baseline taken right after the fill), one signal against that fill's random
    id. Server-bounded to the fill's window (1 h) and to `fieldsFilled`. Radio-group changes
    aren't seen yet (the change fires on the newly picked radio).
  - Honours the existing **analytics opt-out**; nothing is sent when signed out.
  - Panel ranks by **gap rate** (fills leaving ≥1 required field empty), then fill rate, then
    volume.

#### 10.2 Post-fill audit (biggest perceived-quality win per hour of work)
After filling, scan for **required-but-empty** controls and tell the user: *"3 required fields
still need you"*, each with a jump-to link. Cheap to build, and it converts the worst failure
mode ("it silently missed things") into a handled one. Ship this before any schema work.
- **As built (2026-09-22):** when a fill leaves required fields empty, the modal panel becomes a
  small **non-modal card** (bottom-right, the page stays usable): *"2 required fields still need
  you"*, each field named by its label (a radio group by its question), **Go →** scrolls to it,
  focuses it and outlines it briefly, and items tick off as the user fills them; once the last is
  done it says so, reminds them the submit is theirs, and goes. **Auto-advance waits** while any
  are missing — the page would refuse the step anyway. Same scan as 10.1, so the admin count and
  the user's list can't disagree; widened to fields whose label ends in `*` (a leading `*` is a
  footnote, not a requirement). Custom widgets with no native control are still unseen.

#### 10.3 The self-building profile  *(user decision 2026-09-21 — the core idea)*
> **Principle: never make the user fill a long profile form.** Ask the bare minimum, let the
> resume do the heavy lifting, and learn the rest from real applications as they happen.

Three tiers, and a field belongs in the *latest* tier that can supply it:

| Tier | How it's populated | What belongs here |
|---|---|---|
| **A — Ask** (≤6 questions at signup) | A short, comfortable onboarding step | Only what a resume *cannot* give and an application *always* wants: work authorization + sponsorship, desired compensation, earliest start / notice period, remote-or-relocation preference. EEO self-ID is offered here but **always skippable** and never required. |
| **B — Derive** | The existing resume parser (`parser-core.js` + AI parsing, Phase 5.4) | Name, contact, address, links, `experience[]`, `education[]`, `skills[]`, languages, certifications. The user confirms once in the review screen that already exists. |
| **C — Capture** | Learned automatically **while applying** | Everything else and the long tail: years-of-experience-with-X, referral source, references, visa specifics, per-company free text. |

**Tier C is the new mechanism, and it already has most of its plumbing.** The field cache
learns an answer whenever the user corrects a filled value or picks a dropdown option, and
(since the cross-site work) stores it under a host-agnostic twin and syncs it to the server.
The missing step is **promotion**: when a learned answer's label resolves to a canonical
profile field (via the deterministic rules or the cached AI mapper), push it up as a
*suggested* profile value rather than leaving it as a per-question cache row. The web shows a
quiet "we learned 3 things about you — keep these?" review; nothing is silently overwritten.

> ⚠️ **This extends a locked decision.** CLAUDE.md says the extension is *pull-only, only
> resume creates push back*. Tier C adds a second write-back path (learned answers → profile
> suggestions). That is deliberate and user-decided, on the same reasoning as the 2026-06-30
> resume-upload exception: it is **creation**, not editing — the server still owns the record,
> the user still confirms, and editing existing values still happens only on the web.

**Schema expansion is therefore a Tier-A/B job only.** Add `experience[]`, `education[]`,
salary expectation, start date / notice, work-preference and referral source as *canonical*
fields — because they are asked on nearly every application and deserve deterministic
matching. Resist adding Tier-C long-tail fields to the vocabulary: they are unbounded, and the
field cache already handles them better than a schema ever will. Expand `MAPPABLE` in
`field-map.js` to match the new canonical set.

**Plan (2026-09-22, user-approved defaults):** 10.3a fields → 10.3b onboarding → 10.3c
suggestions API → 10.3d extension capture → 10.3e web review, one PR each.
- **`experience[]`/`education[]` stay on each resume**, not the profile: they already exist in
  every resume's parsed data (Workday fills from it), and a profile copy would drift.
- **Tier C is free**, through its own suggestions endpoint — the field-cache sync stays Pro and
  is not the carrier (it holds only label *hashes*, and only learns fields it planned to fill).
- **A blank field is suggested at once; a change to an existing value only after the same new
  value appears on 2 applications** — a salary typed for one job must not replace the default.
- **EEO is never learned from pages**, only set on the web. **"Learn from my applications"** is
  a device setting, on by default. **Onboarding shows once** after the first sign-in.

- **10.3a as built (2026-09-22):** `desiredSalary`, `noticePeriod`, `earliestStartDate`,
  `workPreference`, `willingToRelocate`, `referralSource`. Matched by **phrases**, never the bare
  word — "salary", "start date" and "remote" alone also label "Current salary", a work-history
  row and Yes/No questions these values can't answer. The web offers fixed lists for notice
  period and work preference so the stored value is one an ATS dropdown is likely to offer word
  for word. Three fill guards came with it: `type=number` gets the number (`$120,000`/`120k`),
  `type=date` only a real date, and a radio group of choices gets the option it names — a
  non-Yes/No value is never coerced into "No". Workday-specific rules wait for captured DOM; the
  generic scan already runs over Workday's leftovers.
- **10.3b as built (2026-09-22):** `/welcome`, one question per screen, six screens (work auth,
  sponsorship, salary, notice, work preference + relocation, EEO — optional and labelled so).
  Every question skippable; "Skip for now" always visible; saves per step. The **dashboard**
  redirects there while the bio has neither `onboardedAt` nor `authorizedToWork` — so it's once,
  existing profiles aren't nagged, and deep links (`/connect`, `?next=`) never are. A failed
  profile fetch (anything but 404) never triggers it. The resume comes **last**, as the finish
  screen's call to action, because the questions are the part a user abandons.

#### 10.4 ATS coverage (the long grind — metered by 10.1)
Real adapters for the five uncovered manifest hosts, and depth for the three thin ones
(**Greenhouse is 61 lines / 6 selectors**, Lever 46, Ashby 49 — versus Workday's 479 with its
experience/education blocks and self-ID handling). Capture real tenant DOM first, per the
CLAUDE.md rule. Generalize the multi-step orchestration that only Workday and Indeed have.

#### 10.5 AI posture for Pro
Server-side AI **on by default for paying users** (metered, Phase 5's proxy), BYO key retained
as the free unlimited path. The mapper and the answer drafter are what close the long tail, and
today most users never switch them on — the quality gap is partly a defaults problem.

#### 10.6 Defend it
- **Real-DOM regression suite**: saved HTML snapshots per ATS as jsdom fixtures (Workday,
  Workable and Indeed have this shape already; Greenhouse/Lever/Ashby have none), run in CI,
  alerting when a fill rate drops. This is what stops silent adapter rot — the same concern
  3.6.6 raised for job-detail extraction.
- **Answer library on the web**: view/edit/delete learned answers, satisfying both the
  usability want and the GDPR "see and correct what you hold on me" duty.

**Sequencing:** 10.1 → 10.2 → 10.3 → (10.5 alongside) → 10.4 → 10.6. Measurement first,
then the cheap visible win, then the schema/profile spine, then the grind.

> **Scope note (2026-09-21):** fill quality ships **free** — core autofill is the acquisition
> hook and is identical in both tiers. "Pro-plan gate" means *quality gate before we sell Pro*,
> not a paid feature. 10.5's "server AI on for Pro" is the only Pro-gated piece of this phase.

---

## Go-to-market build (Phases 11–17) — locked 2026-09-21

> Two launches. **Launch 1** = billing + Pro AI + inbox + sync + fill-quality core.
> **Launch 2** = daily job matches + engagement + analytics + price rise. Everything below is
> written so a session can pick up a phase and build without re-deriving the decisions.
> Tasks live in `PROGRESS.md` under the same numbers.

### Tiers, price, and what's where

| | **Free** | **Pro** |
|---|---|---|
| Price | $0 | **Launch 1: $19.99/mo · $44.99 / 3 months** → **Launch 2: $24.99/mo · $54.99 / 3 months.** No annual plan (job searches run 3–6 months; Teal sells weekly/monthly/quarterly and no annual; Simplify's annual is a margin giveaway). |
| Autofill on every supported ATS, review overlay, multi-step | ✅ | ✅ |
| Job capture, board/tracker, auto-log on submit, save-a-job | ✅ | ✅ |
| Self-building profile + post-fill audit (Phase 10) | ✅ | ✅ |
| Resume upload + **AI parsing** (the one free server-AI exception — one call per resume, and the Tier-B moment the profile depends on) | ✅ **3 resumes** | ✅ unlimited |
| Learned answers on this device | ✅ | ✅ |
| Learned answers **synced across devices** | — | ✅ |
| Bring-your-own Anthropic key (mapping, picks, drafting) | ✅ | ✅ |
| **Kiwiply AI for autofill** (field mapping, constrained picks, answer drafting — already built) | — | ✅ |
| Resume recommendation per job · job-fit panel · resume tailoring to JD · **ATS resume score** | — | ✅ |
| Inbox auto-status + notifications | — | ✅ |
| Daily job matches | — | ✅ light (Launch 1) → strong with feedback loop + email (Launch 2) |
| Reminders, stale nudges, weekly digest, calendar export | — | ✅ (Launch 2) |
| Cover-letter generator · resume builder + templates | — | ✅ (Launch 2) |
| Analytics (response rate by resume / ATS / role) | — | ✅ (Launch 2) |
| Edge + Firefox, dark mode, bug reporter | ✅ | ✅ |

**Advertising line:** *Free — everything you need to apply. Pro — everything that gets you the
interview: AI that picks and tailors your resume, and an inbox that updates your board for you.*

**Margin (Gemini rates, Sep 2026):** median active Pro user ≈ $0.20–0.50/mo of model cost
(mapping + picks on Flash-Lite, job-fit + tailoring on Flash, inbox classification only on
ambiguous mail); p95 ≈ $2–3. At $19.99 that is 1–3 % of revenue, Stripe ≈ $0.88 → **gross
margin ≈ 90 %+**. Gemini 2.5 Flash-Lite retires **2026-10-16** (successor ~5× the price);
median still < $1. Model names are **config-driven** so the swap is an env change.

### Phase 11 — Sync: signal + version check  *(Launch 1)*
**Today:** the extension pulls only when the drawer opens, throttled to 90 s
(`panel/home-actions.ts`); nothing tells it about a web-side change, and **sign-out on the web
never reaches the extension**. **Design — signal when you can, version-check when you can't,
pull only on change:**
- **11.1 Web→extension signal.** After any profile/resume save, sign-in or sign-out, the web
  calls `chrome.runtime.sendMessage(extId, {type: "changed" | "signedOut"})` over the existing
  `externally_connectable` channel (`onMessageExternal` already exists for the connect
  handoff). `signedOut` clears `trackingAuth` immediately.
- **11.2 `GET /api/profile/version`.** Contract: `200 {"version": "<16 hex>"}`, Bearer like the
  rest of `/api/profile`, **never 404** — a user with no profile yet still gets a stable "empty"
  version, because the extension must always be able to compare. **It is a hash, not a counter:**
  `Resume` has no `updatedAt` column (only `createdAt`), so a counter would need a migration and a
  touch on every write path and could still miss one. Instead `ProfileService.profileVersion()`
  SHA-256s a canonical string of exactly what a pull returns — bio `updatedAt` + `payload`, then
  every resume DTO sorted by id (`id|label|status|archived|starred|defaultResume|createdAt|
  r2ObjectKey|parsedJson`) — truncated to 16 hex. Cannot miss a change, needs no schema change,
  ≤ 50 resumes so it is cheap. Extension: `TrackingProvider.profileVersion()` (base throws
  NotSupported; Kiwiply provider GETs it, returns the string or null). Tests: IT — no data → 200 +
  16 hex, stable across two GETs, changes after PUT profile / resume create / archive toggle /
  delete, and another user's change does not move mine; `tracking.test.js` — path + mapping.
- **11.3 Extension checks.** A pure `JAF.sync.checkAndPull(provider, storage, settings)`: GET
  the version, compare with `settings.__profileVersion`; on mismatch (or first run) `pullAll` and
  store `__profileVersion` + `__lastPull`; a provider error means **no pull and keep the old
  version** (offline must not thrash). Callers: (1) `chrome.alarms` `"kiwiply-sync"` every 15 min,
  created on `onInstalled` + `onStartup` — **new `"alarms"` permission** in `wxt.config.ts` (no new
  data collected, so the store listing's privacy answers are unchanged); (2) `chrome.windows.
  onFocusChanged` in the SW, guarded to at most one check per 60 s — a *cheap* guard on a cheap
  GET, not the old throttle, since the pull itself only happens on change; (3) the drawer's
  `refreshMirror`, which **replaces the 90 s throttle and its `pullAll`** with `checkAndPull`
  (keep the one-time resume-migration push). Every pull that changed the mirror broadcasts
  `KIWIPLY_MIRROR_UPDATED` (11.1). The 11.1 `changed` signal keeps pulling unconditionally (it
  *knows* something changed) but must then fetch and store the new version so later checks agree.
  Tests: `sync.test.js` for `checkAndPull` (first run, hit, miss, provider error); a
  `sync_signal`-style SW test for alarm registration + `onAlarm` → check → pull/broadcast;
  `tracking.test.js` for the provider method. Version bump.
- **11.4 Docs.** `ARCHITECTURE.md` gets a "Sync model" section: signal → version check → alarm,
  the revoke path (1.11 rotation: a stale token dies at its next refresh; `signedOut` clears at
  once), and why there are no WebSockets — MV3 kills the SW after 30 s idle. `HANDOFF.md` one
  line. Docs-only commit.

### Phase 12 — Billing & entitlements (Stripe)  *(Launch 1 — build the gate before the gated features)*

> **Planned to build depth 2026-09-21.** Build order is **12.0 → 12.1 → 12.2 → 12.3 → 12.4 →
> 12.5 → 12.6 → 12.7**: schema + entitlement first (no UI, fully testable), then the webhook
> (the only writer of subscription state), then checkout/portal + web, then the gates, then
> admin, then copy, then the end-to-end checklist in Stripe test mode. Nothing in 13–16 may ship
> before 12.3's `requirePro()` exists to gate it.

**Decisions locked for this phase (don't re-derive):**
- **Stripe is the source of truth for subscription state; our `subscription` row is a mirror
  written only by webhooks** (never by the checkout return page — that page can be skipped,
  replayed or faked). The extension and web read the mirror.
- **`past_due` stays Pro until `current_period_end`.** Stripe Smart Retries run during that
  window; we downgrade at period end, not on the first failed charge. `canceled` with
  `cancel_at_period_end` likewise keeps Pro until the period ends (Stripe keeps `status=active`
  until then anyway). `unpaid`, `incomplete_expired` → Free immediately.
- **Gated calls fail with HTTP 402 `PRO_REQUIRED`** (a ProblemDetail with `code`), not 403 —
  unambiguous for clients, and "forbidden" would be wrong: the user *may* do it, for $19.99.
- **No free trial.** The 3-month price is the hook; trials plus a no-refund policy invite
  disputes. Revisit with data.
- **Free resume cap counts non-archived resumes.** Archived ones don't count (archiving is how
  a Free user makes room); nothing is ever deleted on downgrade; over-cap resumes stay readable
  and fillable, only *creating* is blocked.
- **The admin AI-quota override (9.A2.2) outranks the plan gate** — an explicit override
  grants that many calls whether or not the user is Pro. It is the support escape hatch and
  must keep working.
- **The plan rides on the version endpoint.** `GET /api/profile/version` returns
  `{version, plan}`; the extension already polls it (11.3), so plan state reaches the drawer
  and options within a check with no new round-trip. No plan claim in the JWT — a token would
  go stale for a whole session after an upgrade.
- **New backend dependency: `com.stripe:stripe-java`**, wrapped behind one `StripeGateway`
  interface so every test stubs it and nothing else in the codebase imports Stripe types.

- **12.0 Stripe account setup — human, before any code runs against it.** In the Stripe
  dashboard, **test mode first, live mode identically later**: Product "Kiwiply Pro" with two
  recurring Prices — `$19.99 / month` and `$44.99 / 3 months` (interval `month`, count `3`);
  **the Product needs a `tax_code`** (`txcd_10103000` SaaS-personal / `txcd_10103001`
  SaaS-business — a tax determination, confirm it before going live). That is not optional:
  **Managed Payments is on by default for new Stripe accounts**, and it rejects a Checkout
  Session whose product has no tax code (`stripe products update prod_… -d
  "tax_code=txcd_…"`). **Stripe Tax on**; Customer Portal configured (cancel at period end allowed, update payment
  method, invoice history; no plan switching in the portal — one plan); a webhook endpoint at
  `https://api.kiwiply.com/api/billing/webhook` subscribed to `checkout.session.completed`,
  `customer.subscription.created`, `customer.subscription.updated`,
  `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`. Record
  `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_3MO` in
  the password manager (`.env` is never held by GitHub — see the data-loss decision) and in
  the box's `.env`; `docker-compose.prod.yml` passes them through like the `DOSSIER_AI_*`
  block. Local dev: `stripe listen --forward-to localhost:8080/api/billing/webhook` gives a
  per-session webhook secret.
- **12.1 Schema + entitlement + gateway (API only, no UI).**
  - Liquibase `20260921000000_subscription.xml` (+ master include): table `subscription` —
    `id`, `user_id` (FK `jhi_user`, **unique**: one row per user), `stripe_customer_id`
    (unique, nullable until first checkout), `stripe_subscription_id` (unique, nullable),
    `plan` (`FREE|PRO`), `status` (Stripe's string verbatim: `active|trialing|past_due|
    canceled|unpaid|incomplete|incomplete_expired|none`), `price_id`, `current_period_end`
    (timestamp), `cancel_at_period_end` (bool), `last_event_at` (timestamp — for ordering),
    `created_at`, `updated_at`. Table `stripe_event` — `id` (the `evt_…` id, **PK** — this is
    the idempotency key), `type`, `received_at`, `processed_at`, `status` (`ok|failed|
    duplicate`), `error` (text). Both additive; no data migration.
  - `domain/Subscription`, `domain/StripeEvent`, repositories, `service/dto/PlanDTO
    {plan, status, currentPeriodEnd, cancelAtPeriodEnd, billingEnabled, hasCustomer}`.
  - `service/EntitlementService`: `isPro(login)` and `plan(login)` per the decisions above
    (pure function of the row + `Instant.now()`, unit-tested as a status × period matrix);
    `requirePro(login)` throws `ResponseStatusException(402)` carrying `code=PRO_REQUIRED`.
    Cache nothing — it is one indexed row read.
  - `service/billing/StripeGateway` interface: `createCustomer(user)`, `createCheckoutSession
    (customerId, priceId, userId, successUrl, cancelUrl)`, `createPortalSession(customerId,
    returnUrl)`, `constructEvent(payload, sigHeader)`; `StripeGatewayImpl` is the only class
    that imports `com.stripe.*`. `config/StripeProperties` (`dossier.stripe.secret-key`,
    `webhook-secret`, `price-monthly`, `price-3mo`, `success-url`, `cancel-url`,
    `portal-return-url`); **billing is disabled when the secret key is blank** — `PlanDTO.
    billingEnabled=false`, checkout/portal return 503 `BILLING_DISABLED`, and the pricing page
    renders "coming soon". That is how `develop` and CI run without keys.
  - `GET /api/billing/me` → `PlanDTO` (authenticated). Tests: `EntitlementServiceTest` (matrix),
    `BillingResourceIT` for `/me` on a user with no row (Free, `billingEnabled` reflects config).
- **12.2 Webhook — the only writer.** `POST /api/billing/webhook`, **permitAll** in
  `SecurityConfiguration`, declared with `@RequestBody String payload` so the raw bytes are
  verified (`Stripe-Signature` + webhook secret via the gateway; bad or missing signature →
  400, nothing recorded). Then, in one transaction: insert into `stripe_event` — a duplicate id
  short-circuits with 200 (`status=duplicate`); ignore any event whose `created` is **older**
  than the row's `last_event_at` (Stripe does not guarantee order); apply by type:
  `checkout.session.completed` → bind `stripe_customer_id` ↔ user via `client_reference_id`
  (the user id we set at checkout) and create the row if absent; `customer.subscription.
  created|updated|deleted` → upsert `status`, `price_id`, `current_period_end`,
  `cancel_at_period_end`, `stripe_subscription_id`, set `plan` from `isPro`-eligibility of the
  new status; `invoice.paid` → status `active`; `invoice.payment_failed` → status `past_due` +
  send the "payment failed — update your card" email through the existing `MailService`
  (Brevo). A handler exception → `stripe_event.status=failed` + **HTTP 500 so Stripe retries**;
  success → 200. Never trust the event's embedded objects beyond the ids you need for the
  `subscription` object itself — that object *is* the state. Tests (`BillingWebhookIT`): sign a
  fixture payload with the test secret (HMAC-SHA256 over `t.payload`, header
  `t=…,v1=…`) → row upserted; wrong secret → 400 and no row; same event twice → second is 200
  + `duplicate` + row unchanged; an older `created` after a newer one → ignored;
  `subscription.deleted` → `canceled` and `isPro` false once `current_period_end` passes;
  `payment_failed` → `past_due`, still Pro, one email captured on a `MailService` spy.
- **12.3 Checkout + portal + web surfaces.**
  - API: `POST /api/billing/checkout {price: "monthly"|"3mo"}` → creates the Stripe customer
    on first use (stores id), then a hosted Checkout Session (`mode=subscription`,
    `client_reference_id=userId`, `customer=…`, `allow_promotion_codes=true`,
    `automatic_tax.enabled=true`, `success_url=…/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    `cancel_url=…/pricing`) → `{url}`. Already Pro → 409 `ALREADY_SUBSCRIBED`. `POST
    /api/billing/portal` → Billing Portal session `{url}`; no customer yet → 404.
  - Web BFF routes (`web/src/app/api/billing/{checkout,portal,me}/route.ts`) forward with the
    session cookie, same shape as the other `/api/*` proxies. **`/pricing`** (marketing group,
    public): Free vs Pro table straight from the Free/Pro section above, the two prices,
    "Upgrade" → checkout when signed in, `/signup?next=/pricing` when not; billing disabled →
    "coming soon". **`/billing/success`**: polls `/api/billing/me` every 1.5 s (≤ 20 s) until
    `plan=PRO` — the webhook usually lands within a second or two — then "You're Pro"; on
    timeout, "Payment received, activating…" with a refresh link (never an error: the money
    went through). **Settings › Billing** replaces the placeholder: plan pill, renewal or
    "cancels on" date, **Manage billing** → portal, **Upgrade** → checkout. `AppShell` shows a
    small **Pro** pill next to the account name. Plan for client components comes from one
    `serverApiFetch("/api/billing/me")` in the `(app)` layout passed down as a prop/context —
    not a second fetch per component.
  - Extension: `ProfileVersionVM` gains `plan`; `checkAndPull` stores `settings.plan` on
    **every** answered check (unchanged included — plan can flip without the profile moving);
    the 11.1 `changed` path stores it too. `tracking.js` `request()` surfaces 402 as an error
    with `.status=402` and `.code`, so callers can branch. Options page: plan badge + "Upgrade
    on kiwiply.com" link when Free.
  - Tests: `BillingResourceIT` — checkout with a stubbed gateway returns the URL and stored the
    customer id; second checkout reuses it; Pro → 409; portal without customer → 404; billing
    disabled → 503. `tracking.test.js` — 402 mapping. `sync.test.js` — `checkAndPull` stores
    `plan` on an unchanged check. Web: tsc + eslint (+ the Docker smoke).
- **12.4 The gates (Free-tier redefinition).** Each is one `requirePro()` call at the service
  boundary plus the client UX for the 402:
  - **Server AI drafting, field mapping and picks** (`AiDraftService`, and whatever `JAF_MAP_
    FIELDS` / `JAF_PICK` route through) → Pro, **unless** an admin quota override exists for
    the login. New `Status.PRO_REQUIRED` in the result so the SW can show "Kiwiply AI is a Pro
    feature — upgrade, or add your own key" instead of the quota message. **`AiResumeParseService`
    is untouched** — the one free server-AI exception. Pro quota: new
    `dossier.ai.pro-monthly-quota` (default 2000 calls; 13.1 turns this into cost credits).
  - **Cross-device learned-answer sync** (`POST /api/profile/field-caches/sync`) → Pro. The
    extension already treats any failure there as best-effort, so a 402 is a silent no-op;
    answers keep working on-device.
  - **Resume cap**: `ProfileService.createResume` (covers the web upload route and the
    extension's on-the-fly upload, both of which land there) → if Free and non-archived count
    ≥ 3 → 402 `RESUME_LIMIT` with `{limit:3, count}`. Web `ResumeUpload` shows the upgrade CTA
    inline on that code; the extension's upload flow shows the same message with the link.
  - Tests: `AiDraftResourceIT` (Free → `PRO_REQUIRED`; Free + override → drafts; Pro → drafts;
    parse-resume Free → still works); `FieldCacheSyncResourceIT` (Free → 402, Pro → 200);
    `ProfileResourceIT` (4th create Free → 402; archived don't count; Pro → 201).
- **12.5 Admin revenue panel.** `AdminAnalyticsService.overview()` gains `billing {activePro,
  monthlyCount, threeMonthCount, mrr, newThisMonth, churnedThisMonth, pastDue}` from the
  `subscription` table (MRR = monthly × 19.99 + 3-month × 44.99 ÷ 3, from `price_id`); one
  card on `/admin/analytics`. Test: `AdminAnalyticsResourceIT` with two seeded rows.
- **12.6 Copy + legal hooks (feeds 15.2).** Checkout CTA and `/pricing` carry the
  **auto-renew disclosure** ("renews monthly / every 3 months until you cancel; cancel any
  time from Settings › Billing — takes effect at the end of the period"), the portal is the
  **click-to-cancel** path (FTC rule + California ARL want cancellation as easy as sign-up),
  and the ToS gains a Billing section (prices, renewal, no-trial, **refund policy**,
  price-change notice). Docs-only commit; the lawyer reviews the wording in 15.2.
  > **Refund policy — decided 2026-09-21: "no refunds, cancel anytime."** Stated plainly on
  > `/pricing`, at checkout and in the ToS, not buried. It is coherent with the rest of the
  > model: cancelling keeps Pro to the end of the paid period (`EntitlementService`), so nobody
  > loses time they paid for, and the 3-month plan is the commitment device rather than a trial.
  > Consumer law still overrides it where it applies — statutory withdrawal rights (EU/UK) and
  > card-network chargebacks are not waived by a ToS line, which is one of the things 15.2's
  > lawyer review has to confirm before launch.
- **12.7 End-to-end in Stripe test mode (before the phase is called done).** With `stripe
  listen` forwarding: sign up → `/pricing` → checkout with card `4242…` → success page flips
  to Pro → settings shows renewal date → extension options shows Pro within one version check
  → cancel in the portal → settings shows "cancels on …" → simulate `invoice.payment_failed`
  via `stripe trigger` → email arrives + still Pro → advance the clock (test-clock customer) →
  Free, resumes intact, 4th upload blocked with the CTA. Record the run in the PROGRESS log.

### Phase 13 — Pro AI  *(Launch 1 — needs 12 for the gate, 10.3 for structured `experience[]`/`education[]`)*
**Cost architecture first (13.1), features after — every feature inherits it.**
- **13.1 Credit metering & routing.** Meter by estimated cost (tokens × model rate) into a
  monthly Pro budget (≈ $5 of model cost; effectively unreachable for real users) with a visible
  meter; soft cap → cheaper model, hard cap → top-up. Route by task: mapping / picks /
  classification → Flash-Lite; job-fit + tailoring → Flash. Cache per (question + options) —
  exists — plus per (resume × JD). **Context-cache the resume prompt prefix** (cache reads at
  10 % of input). Batch overnight scoring (50 % off). Bounded inputs: structured resume JSON,
  JD capped by tokens. Kill switch per feature.
- **13.2 Resume recommendation per job.** Score every stored resume against the captured JD
  (Flash-Lite or embeddings); "best match: *Backend v3* — 82 %" in the drawer + on the board.
  Later learns from inbox outcomes (Phase 14 + 16).
- **13.3 Job-fit panel.** On the posting: match %, missing keywords, red flags. Cached per
  (resume × JD).
- **13.4 Resume tailoring to JD.** Bullet rewrites with a diff, truthfulness guardrails (no
  invented employers/dates/degrees), saved as a **new** resume version — fits "resume creates
  push back".
- **13.5 ATS resume score** *(Launch 1 — user decision 2026-09-21).* 0–100 score per stored
  resume: structure checks (sections, dates, contact), measurable-results density, keyword
  coverage against the captured JD when one is present. Deterministic checks first (free to
  run), one Flash-Lite call only for the keyword/impact read; cached per (resume × JD). Shown on
  the resumes page and inside the job-fit panel. Teal's most-used hook — we match it at Launch 1.
- **13.6 Daily job matches — LIGHT** *(Launch 1 — user decision 2026-09-21; the strong version
  is 16.1).* Sources: the Greenhouse, Lever and Ashby **public job-board APIs** only. Preference
  profile = Tier A answers + role/seniority/location inferred from the resume. Gates: posted
  ≤ 48 h, dedup. Scoring: Flash-Lite, batch overnight, ≤ 50 candidates per user per day; show
  match %. Delivery: **in-app list only** (no email yet); dismiss hides a job. Empty list allowed.

### Phase 14 — Inbox: IMAP  *(Launch 1 — needs 12)*
**Design — mirrors Sales-App `integrations/email/imap`: no Kiwiply address of any kind.** The
user creates a **dedicated consumer Gmail** for job applications, turns on 2-Step Verification,
generates a Gmail **App Password**, and pastes address + app password into Kiwiply. The API
polls `INBOX` **and** `[Gmail]/Sent Mail` over IMAP — both directions natively. No forwarding,
no OAuth, no Google API → no restricted-scope verification, no CASA.
- **14.1 Connect flow** (`/settings/inbox`): guided steps with the Gmail screenshots, test
  connection, disconnect. Consumer Gmail only (Workspace blocks password auth since May 2025).
- **14.2 Credentials at rest.** App password encrypted with a server-side key (pulls the 8.4
  "secrets/KMS" slice forward as **required**). Deleting the app password in Gmail revokes us.
- **14.3 Poller.** Scheduled IMAP sync (UID-based incremental, backfill on connect), stores
  headers + body text only — **no attachments, ever**. Rate-limited; per-user error state.
- **14.4 Parser → status.** Deterministic first: known ATS sender domains + subject templates
  (Greenhouse, Lever, Workday, Ashby, iCIMS…) → `applied / interview / rejected / offer`. AI
  (Flash-Lite) only on ambiguous mail. Match to an application by company + role + the
  address the application was sent from; unmatched mail creates a *suggested* application.
- **14.5 Cross-board dedup (was 3.6.5).** One application per posting, or auto-updates
  double-count. Normalized company + title (+ fuzzy location) at upsert.
- **14.6 Notifications.** In-app + email to the user's *real* address on status change;
  browser push later.
- **14.7 Retention & deletion (the 8.4 slice).** Mail rows expire (default 12 months), purge
  on disconnect and on account delete; DSAR export includes mail. Read-only guarantee stated
  in product and policy: *we never send, move or delete*.
- **Legal shape for PL.1** (not legal advice): user-directed connection of their own account
  = consent; recruiter PII under legitimate interest with deletion; ToS warranty of account
  ownership; automated-processing disclosure; the dedicated-account rule is the real safeguard
  because an app password cannot be scoped read-only.

### Phase 15 — Launch 1
- **15.1 Ops (deliberately here, not earlier).** Nightly off-box `mysqldump` to S3 with
  retention · uptime + error monitoring with alerting · **a restore drill actually performed**.
  Money cannot be at risk before this exists.
- **15.2 Legal (PL.1 completion).** Lawyer review of privacy + terms now covering: billing
  (auto-renew, click-to-cancel, refunds), IMAP mail processing, AI data use, governing law +
  entity (AutomoraLab LLC). DPAs with Brevo + AWS S3.
- **15.3 Store.** CWS resubmit with the Pro build + AMO first submission; listing copy for the
  Free/Pro split; the `NEXT_PUBLIC_KIWIPLY_EXTENSION_ID` redeploy.
- **15.4 Launch checklist.** Pricing page live, Stripe live keys, webhook signing verified,
  support path for billing, W5-QA walked in Chrome (light + dark), SmartRecruiters live check.

### Phase 16 — Between launches  *(after Launch 1, before Launch 2)*
- **16.1 Daily job matches — STRONG** *(builds on the 13.6 light version; refine before build).*
  **Job:** 10–15 fresh, high-quality, well-matched jobs every day so the user never has to go
  hunting; an empty list beats a padded one. What 16.1 adds over 13.6: all six ATS sources +
  aggregator fallback, the full quality gates (ATS-verified tenant, agency/spam filter), the
  like / dismiss / applied **feedback loop** that re-ranks, daily **email** delivery at the
  user's chosen time, and explicit preference editing.
  - **Sources — direct from the ATS, not scraped boards.** Greenhouse, Lever, Ashby,
    Workable, SmartRecruiters and Recruitee all expose **public job-board JSON APIs** (no auth,
    no scraping). Direct-from-employer = verified company; posting timestamps = real recency.
    These are the same ATS the extension already fills, so a match is one click from an apply.
    Aggregator API (LoopCV / Apify multi-ATS feeds) only as a coverage fallback.
  - **Quality gates:** posted ≤ 48 h · company verified by ATS tenant · dedup across sources ·
    staffing-agency / spam filter · location/remote fits preference.
  - **Matching:** preference profile = Tier A answers + role/seniority/location inferred from
    the resume + explicit preferences; score with embeddings or Flash-Lite, show **match %**.
  - **Feedback loop:** like / dismiss / applied → re-rank; "not interested" companies excluded.
  - **Delivery:** in-app list + daily email at the user's chosen time (Brevo).
  - **Cost:** batch scoring overnight; candidate set pre-filtered deterministically so the
    model sees ≤ 50 jobs per user per day.
- **16.2 Analytics.** Response / interview rate by resume, ATS, role, company size — the chart
  only the inbox can power.
- **16.3 Reminders + stale nudges.** "No reply in 10 days" → nudge; follow-up date on cards.
- **16.4 Weekly digest.** Applications, replies, interviews, matches — one email.
- **16.5 Calendar export.** Interview → `.ics` / Google Calendar link.
- **16.6 Cover-letter generator** *(Launch 2 — user decision 2026-09-21).* From profile +
  resume + captured JD; the bounded cousin of the Q&A drafting we deferred. Flash, cached per
  (resume × JD), saved alongside the application. Truthfulness guardrails as in 13.4.
- **16.7 Resume builder + templates** *(Launch 2 — user decision 2026-09-21; extends
  upload-first, does not replace it).* Build a resume from the structured profile
  (`experience[]`, `education[]`, skills) into ATS-friendly templates, export PDF, save as a
  new resume. Reuses the 10.3 schema — the profile is already the data model a builder needs.

### Phase 17 — Launch 2
Price → **$24.99 / $54.99** (grandfather existing subscribers for one cycle) · adapter depth
milestone from 10.4 · listing refresh with matches + analytics · 13.5 candidates if confirmed.

### Competitor cross-check (2026-09-21) — what they offer that we don't, and the verdict

| They have | Who | Verdict |
|---|---|---|
| Job matches / daily recommendations with match score, early-posting alerts | Simplify (free), Jobright (core), Huntr (basic) | **Build — light 13.6 (Launch 1), strong 16.1 (Launch 2)** |
| ATS resume score (0–100, 15 checks) | Teal (free, their top hook), Careerflow | **Build — 13.5 (Launch 1)** |
| Cover-letter generator | Simplify+, Huntr Pro, Teal+ | **Build — 16.6 (Launch 2)** |
| Resume **builder** + templates | Teal, Simplify, Huntr | **Build — 16.7 (Launch 2)**, on top of upload-first (user decision) |
| LinkedIn profile optimizer | Careerflow | No |
| Weekly plan ($9–13/wk) | Teal | No — churn bait |

**Reading of the market:** everyone gives tracking + autofill away and charges for AI writing
and matching; billing surprises and AI output "that needs heavy editing" are the top paid-tier
complaints. Our differentiators are the **inbox that updates the board** and the **self-building
profile** — nobody in the table has either.

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
| 10 | **Fill quality & the self-building profile** (telemetry → post-fill audit → 3-tier profile + schema → ATS coverage → regression suite) — ships free | 1, 4, 5 | Yes |
| 11 | **Sync** — web→ext signal + `/api/profile/version` + alarms; drop the 90 s throttle | 1 | Yes |
| 12 | **Billing & entitlements** — Stripe, `subscription`, `isPro()`, pricing page, free = BYO only | 1, 2 | Yes |
| 13 | **Pro AI** — credit metering/routing/caching, resume recommendation, job-fit panel, tailoring, ATS score, light job matches | 12, 10.3 | Yes |
| 14 | **Inbox (IMAP)** — dedicated Gmail + app password, poll inbox + sent, parser → status, notifications, dedup, retention | 12 | Yes |
| 15 | **Launch 1** — ops (backup/monitoring/restore drill), PL.1 legal, CWS + AMO resubmit, checklist | 10–14 | — |
| 16 | **Between launches** — strong job matches, analytics, reminders, digest, calendar, cover letter, resume builder | 14, 15 | Yes |
| 17 | **Launch 2** — price rise to $24.99 / $54.99, adapter milestone, listing refresh | 16 | — |

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

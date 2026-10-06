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
*(2026-10-05: the org/tenant model is now planned as **Phase 21 — Organizations**. SSO waits
until a school deal needs it.)*

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
- **10.3c as built (2026-09-22):** `profile_suggestion` (user, field, value, status
  PENDING/ACCEPTED/DISMISSED, `seen_count`, `last_context`). The extension posts `{fieldKey, value,
  context}` where `context` is an opaque hash of the application — enough to count *distinct*
  applications for the 2-application change rule without storing where anyone applied. The server
  owns every rule (allowed keys, thresholds, caps) so a buggy or old extension can't widen them.
  Dismissed rows are kept on purpose: they're what stops a value coming back. Accepting writes
  through `ProfileService.upsertProfile`, so the profile version moves and the extension pulls.
- **10.3d as built (2026-09-22):** learning starts **after a fill** (the moment the user is
  applying with Kiwiply), not on every page view. Watched: the fill's canonical items (a later
  change = a candidate change) and high-confidence profile questions the fill had no value for (the
  answer = a blank field filled). The page address reaches only the service worker, which sends a
  per-install **salted** hash — a plain hash of a job URL could be reversed by hashing known URLs.
  A known limit: a multi-step ATS whose path changes per step can count one application twice
  toward the change rule; blank-field suggestions are unaffected.
- **10.3e as built (2026-09-22):** a dashboard card, rendered only when the server has something
  worth showing — the server owns every rule, the card just renders the list. Keep / Edit /
  Dismiss per row; Edit offers the same fixed list the profile editor uses for list fields.
  **10.3 is complete:** ask ≤6 questions once (10.3b), derive the rest from the resume (the
  existing review screen), learn the remainder while applying (10.3c–e).

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
| Price | $0 | **Launch 1: $19.99/mo · $49.99 / 3 months** *(was $44.99 — raised 2026-10-05 for the 80 % margin floor, task 15.5)* → **Launch 2: $24.99/mo · $54.99 / 3 months.** No annual plan (job searches run 3–6 months; Teal sells weekly/monthly/quarterly and no annual; Simplify's annual is a margin giveaway). |
| Autofill on every supported ATS, review overlay, multi-step | ✅ | ✅ |
| Job capture, board/tracker, auto-log on submit, save-a-job | ✅ | ✅ |
| Self-building profile + post-fill audit (Phase 10) | ✅ | ✅ |
| Resume upload + **AI parsing** (the one free server-AI exception — one call per resume, and the Tier-B moment the profile depends on) | ✅ **3 resumes** | ✅ **25** *(was unlimited — capped 2026-10-05, task 15.5)* |
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

> **2026-10-05:** a third tier (**Autopilot**), organizations and services are added. See
> **Expansion build (Phases 18–23)**. It also locks an **80 % worst-case margin floor**, a Pro AI
> budget of **$3/month · $8 per 3-month period** (was $5/month), and AI budgets that run **per
> billing period**.

**Advertising line:** *Free — everything you need to apply. Pro — everything that gets you the
interview: AI that picks and tailors your resume, and an inbox that updates your board for you.*

**Margin (Gemini rates, Sep 2026):** median active Pro user ≈ $0.20–0.50/mo of model cost
(mapping + picks on Flash-Lite, job-fit + tailoring on Flash, inbox classification only on
ambiguous mail); p95 ≈ $2–3. At $19.99 that is 1–3 % of revenue, Stripe ≈ $0.88 → **gross
margin ≈ 90 %+**. Gemini 2.5 Flash-Lite retires **2026-10-16** (successor ~5× the price);
median still < $1. Model names are **config-driven** so the swap is an env change.
*(Checked 2026-09-22: the 2026-10-16 date is **Vertex AI's** — the Gemini API we call lists no
shutdown date for 2.5 Flash-Lite yet. Google's named successor is `gemini-3.1-flash-lite` at
$0.25 / $1.50 per M tokens, 2.5× input and 3.75× output.)*

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
- **13.1 plan (2026-09-22, user-approved defaults):** 13.1a track real cost → 13.1b budget +
  routing → 13.1c usage meter. **Top-up is deferred to Phase 16** (needs a price and one-time
  Stripe payments; the $5 budget is meant to be unreachable) — at 100 % AI stops until the month
  resets. Users see **a percentage, never dollars**. Resume-prefix context caching and the
  (resume × JD) cache move to **13.2/13.3**, overnight batch to **13.6** — nothing exercises them yet.
- **13.1a as built (2026-09-22):** `AiTask` on every request; `AiProvider.generate(task, …)` returns
  an `AiResult` with the tokens Gemini billed; `AiMeteringService` counts (atomic upsert) and writes
  the `ai_call` ledger at `AiPricing` rates. The ledger never holds prompts or answers. Found and
  fixed on the way: Pro parse capped at the Free quota, the prod model default, the lost-update
  counter. **Check the box's `.env`:** if it sets `DOSSIER_AI_MODEL=gemini-2.0-flash` explicitly,
  the compose fix doesn't reach it.
- **13.1b as built (2026-09-22):** `AiBudgetService` decides every call before the provider is
  touched: the per-task **kill switch** (`dossier.ai.policy.disabled-tasks`), the Pro gate, a Free
  user's resume-parse **count** (the one free exception), and otherwise a **cost budget** summed
  from the `ai_call` ledger for the calendar month (UTC) — $5 for Pro, or the admin override, now a
  **budget in cents** that still outranks the plan (existing grants carried over as $5; $0 = none).
  Past `soft-cap-percent` (80) every task moves to `economy-model` (blank = no switch); at 100 %
  AI stops until the 1st. Each task runs on `dossier.ai.policy.models.<task>` (blank = the default
  model). Responses carry `resetsAt`; for a budget `used`/`quota` are a percentage and 100, so a
  user is told "resets on October 1" — never dollars. `AiPricing` gained the 3.x models, with the
  2.5 cache rates corrected to Google's current list.
- **13.1c as built (2026-09-22):** `GET /api/ai/usage` + a `Meter` primitive; web Settings and
  extension Options show a percentage and a reset date (Free: the parse count). The admin AI page
  reads the ledger: total cost, per feature, per user with share of the Pro budget. **13.1 is
  complete.** Model: **stay on gemini-2.5-flash-lite** (user decision 2026-09-22) until the Gemini
  API — not Vertex — announces a shutdown; the successor is priced and one env var away.
- **13.2 Resume recommendation per job.** Score every stored resume against the captured JD
  (Flash-Lite or embeddings); "best match: *Backend v3* — 82 %" in the drawer + on the board.
  Later learns from inbox outcomes (Phase 14 + 16).
  - **As built (2026-09-22):** one JSON-mode Flash-Lite call per (JD × resume set), cached in
    `resume_match` by a content hash — the "(resume × JD) cache" 13.1 moved here. Drawer: a
    suggestion under the picker (Pro + Kiwiply AI on), never an auto-switch. Board: "Resume fit" in
    the detail panel, run on click, with "Link this resume". Inbox-outcome learning waits for 14/16.
- **13.3 Job-fit panel.** On the posting: match %, missing keywords, red flags. Cached per
  (resume × JD).
  - **As built (2026-09-22):** `JobFitService` + `job_fit` cache (the "(resume × JD) cache"),
    red flags reading nine profile answers and nothing else, a shared `JobFitReport` component in
    the drawer (on click) and per resume on the board. One score per resume everywhere — the
    report defers to 13.2's ranking. Default model Flash-Lite; Flash is `DOSSIER_AI_MODEL_FIT`.
- **13.4 Resume tailoring to JD.** Bullet rewrites with a diff, truthfulness guardrails (no
  invented employers/dates/degrees), saved as a **new** resume version — fits "resume creates
  push back".
  - **As built (2026-09-22):** proposals are checked server-side (existing refs only, no new
    numbers, no hiring company, skills reorder-only, suggestions never applied) and applied from the
    stored proposal by ref — the client never sends text; a changed source resume refuses an old
    proposal. Web board only, as a before/after dialog. The saved version is structured (no PDF of
    its own until the 16.x resume builder), so "Copy kept changes" covers sending a file today.
- **13.5 ATS resume score** *(Launch 1 — user decision 2026-09-21).* 0–100 score per stored
  resume: structure checks (sections, dates, contact), measurable-results density, keyword
  coverage against the captured JD when one is present. Deterministic checks first (free to
  run), one Flash-Lite call only for the keyword/impact read; cached per (resume × JD). Shown on
  the resumes page and inside the job-fit panel. Teal's most-used hook — we match it at Launch 1.
  *Built 2026-09-22:* 15 weighted checks; with a job, 70 % structure + 30 % keyword coverage, where
  coverage reuses 13.3's cached job-fit report (that is the one Flash-Lite read — no second call).
  The contact check became "has a file" — stored resumes carry no contact block.
- **13.6 Daily job matches — LIGHT** *(Launch 1 — user decision 2026-09-21; the strong version
  is 16.1).* Sources: the Greenhouse, Lever and Ashby **public job-board APIs** only. Preference
  profile = Tier A answers + role/seniority/location inferred from the resume. Gates: posted
  ≤ 48 h, dedup. Scoring: Flash-Lite, batch overnight, ≤ 50 candidates per user per day; show
  match %. Delivery: **in-app list only** (no email yet); dismiss hides a job. Empty list allowed.
- **13.6 plan (2026-09-22, user decisions):** the public APIs are keyed by company — there is no
  global feed — so the source is a **pool of boards: a verified seed list + every Greenhouse / Lever /
  Ashby board a user has applied on** (company only, never who) + admin adds. Scoring uses **ordinary
  calls overnight**; the Batch API (50 % off) waits for 16.1's volume. **13.6a** sources + nightly
  read → **13.6b** matching → **13.6c** the `/matches` page.
- **13.6a as built (2026-09-22):** 217 verified boards (`config/job-sources.csv`); nightly read at
  02:00 UTC keeps postings first published ≤ 48 h, deduped by company + title + location, for 7 days;
  failing boards switch off after 5 nights; admin Job sources page.
- **13.6b as built (2026-09-22):** opt-in per user (off by default — it sends the resume summary to
  the model nightly without a click). Preferences come from the profile + default resume, no form. A
  no-AI pre-filter (location segment, title words, level, skills) picks ≤ 50; one Flash-Lite call
  scores them (match % + ≤ 15-word reason), metered against the user's budget; ≥ 60 is shown. Ashby's
  `isRemote` is set on hybrid jobs, so a stated workplace type always wins.
- **13.6c as built (2026-09-22):** `/matches` — the switch (its caption is the consent), today's list
  (≥ 60, best first, with the reason), save to board as a SAVED application built server-side from the
  posting, or dismiss for good. **Phase 13 is complete.**

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
- **Phase 14 plan (2026-09-22, user decisions).** Sales-App's IMAP code (Node: imapflow + an
  AES-256-GCM env key) is the model; the port uses Jakarta Mail (already on the classpath via
  `spring-boot-starter-mail`) and fixes four things it lacks: **UID + UIDVALIDITY per folder**
  (it syncs by date), **one connection per sync** (it opens one per message), **backoff and a
  stopped state** — a rejected password stops polling and says "reconnect" (it retries forever),
  and **real IMAP tests with GreenMail** (it has none). Kept from it: the Sent folder found by its
  `\Sent` special-use flag, never by name (localised names); Message-ID dedup; an error listener on
  every connection (an unhandled socket error once took its whole process down).
  - **Key:** AES-256-GCM with one 32-byte key from `DOSSIER_INBOX_KEY` (box `.env` + password
    manager — never the repo, never GitHub secrets); each ciphertext carries a key version so it
    can be rotated; a startup canary warns when the key can't read what's stored. KMS: not now.
  - **What's kept:** headers of every message (dedup, matching); **body text only for job mail**
    — from a known ATS sender or tied to an application. Everything else is read in memory and
    dropped. Never attachments. 12-month expiry (14.7).
  - **Cadence:** every **15 minutes**, one mailbox at a time. Backfill on connect: 60 days,
    ≤ 500 messages per folder.
  - **Emails to the user:** **interview and offer** go out at once; applied / rejected are in-app
    only.
  - **Order:** 14.2 (encryption) → 14.1 (connect) → 14.3 (poller) → **14.5 (dedup) before 14.4**
    (so mail never updates a duplicate) → 14.4 (parser) → 14.6 (notifications) → 14.7 (retention,
    export, the read-only line). Purge-on-disconnect and account deletion land with each step, not
    saved up for 14.7. Pro only.
  - **14.2 as built (2026-09-22):** `SecretBox` (AES-256-GCM, per-row associated data, versioned
    ciphertexts for rotation) + `InboxKeyCheck` (a startup canary: a changed key turns the inbox off
    and says so, instead of failing every poll). DEPLOY.md §12.
  - **14.1 as built (2026-09-23):** `/settings/inbox` — guided steps (links, not screenshots), then a
    live Gmail check before anything is stored; non-Gmail addresses and non-app-passwords refused
    before Gmail is asked; each Gmail refusal gets its own fix; 5 tries / 15 min; disconnect deletes.
  - **14.3 as built (2026-09-23):** UID + UIDVALIDITY per folder, one session per read, 60-day /
    500-message backfill, bodies only for job mail (`JobMailRules`), attachments never opened,
    NEEDS_RECONNECT on a rejected password, backoff to 6 h, first read right after connecting.
  - **14.5 as built (2026-09-23):** upsert matches by ATS id → link (tracking noise stripped) →
    company + title + compatible location (< 180 days, not archived), via `ApplicationKeys`; the
    first board's id and link are kept. No retroactive merge.
  - **14.4a as built (2026-09-23):** rules (`MailClassifier`) settle most mail; Flash-Lite only for the
    unsure, batched and metered; unsure-and-unasked changes nothing. Threads, then company + role
    (`MailMatcher`); ambiguity → unmatched, never guessed. Forward-only status; `StatusChanged` event.
  - **14.4b as built (2026-09-23):** "From your inbox" suggestions above the board (add at the mail's
    stage, or dismiss the company); an Emails section per application.
  - **14.6 as built (2026-09-23):** in-app notices for every change (sidebar bell), email for
    interview/offer only (off switch on the Inbox page); nothing for mail older than 7 days, email only
    within 48 h — so connecting an inbox never floods anyone.
  - **14.7 as built (2026-09-23):** 12-month expiry of stored mail (by sent date); the inbox and
    notifications in the data export (never the password); the read-only promise in a new Terms
    section. **Phase 14 is complete.**
- **Legal shape for PL.1** (not legal advice): user-directed connection of their own account
  = consent; recruiter PII under legitimate interest with deletion; ToS warranty of account
  ownership; automated-processing disclosure; the dedicated-account rule is the real safeguard
  because an app password cannot be scoped read-only.

### Phase 15 — Launch 1
- **15.1 Ops (deliberately here, not earlier).** Nightly off-box `mysqldump` to S3 with
  retention · uptime + error monitoring with alerting · **a restore drill actually performed**.
  Money cannot be at risk before this exists.
  **Plan (user decisions 2026-09-23):**
  - **Where:** a separate bucket `kiwiply-db-backups` (versioned, private, SSE-S3) and an IAM user
    that can **List + Put + Get but never Delete**, so a compromised box can't wipe its backups.
    Lifecycle keeps 30 daily + 12 monthly (the 1st). The last 3 dumps also stay on the box.
  - **Alarms:** Healthchecks.io for the backup (daily) and the drill (weekly): start / success /
    fail pings, so a night cron didn't run alerts too. UptimeRobot every 5 min on `kiwiply.com` and
    `api.kiwiply.com/management/health` (`"status":"UP"` = API and DB both up).
  - **Errors:** in-house, no new processor: the API collects ERROR log events and emails the
    admin a digest, grouped and counted, at most every 15 minutes, via the existing Brevo mail.
  - **Drill:** `verify-restore.sh` restores the newest backup into a throwaway container weekly
    (checks sha256, age ≤ 2 days, users + changelog + live tables, row counts), plus one run by
    hand, logged in DEPLOY.md.
  - **Steps:** **15.1a** scripts + runbook + CI job · **15.1b** the error digest · **15.1c** go
    live on the box (bucket/IAM/accounts are the user's; needs `develop` → `main`) + the drill by
    hand.
- **15.2 Legal (PL.1 completion).** Lawyer review of privacy + terms now covering: billing
  (auto-renew, click-to-cancel, refunds), IMAP mail processing, AI data use, governing law +
  entity (AutomoraLab LLC). DPAs with Brevo + AWS S3.
- **15.3 Store.** CWS resubmit with the Pro build + AMO first submission; listing copy for the
  Free/Pro split; the `NEXT_PUBLIC_KIWIPLY_EXTENSION_ID` redeploy.
- **15.5 Re-price Pro (expansion decision 2026-10-05, must land before 15.4 goes live).**
  - 3-month price $44.99 → **$49.99**: a new Stripe Price in test and live, plus
    `dossier.stripe.amount3mo`.
  - Pro AI budget $5/month → **$3/month · $8 per 3-month period**, with `AiBudgetService`
    summing over the subscription's **billing period** instead of the calendar month.
  - Pro resume cap unlimited → **25** non-archived (402 `RESUME_LIMIT`; over-cap resumes stay
    readable and fillable).
  - Update `/pricing`, the ToS Billing section and the MRR math to match.
  - See Expansion build → Cost controls.
- **15.6 Full catalog on `/pricing`, "Contact us" for what isn't sold by checkout yet (user
  decision 2026-10-05).**
  - **What's on the page:** Free and Pro keep their checkout. Autopilot, Organization (the $499
    setup fee + the per-person menu), Consultancy (Marketer seats), the Consultancy Ops add-on
    and the four human services are listed in full (scope, limits, price) with **Contact us**.
  - **Where Contact us goes:** a `/contact` form (topic preselected) → a `sales_inquiry` row +
    an email to support@ → the admin **Inquiries** queue (New / Contacted / Won / Lost, audited).
  - **Catalog content:** lives in `web/src/lib/catalog.ts` until Phase 18 moves it into the
    database catalog.
  - **Ops-add-on price:** shown as "Custom" until 23.0 sets it.
  - **When answering an inquiry,** say plainly what's available today and when the rest will be.
    These products are listed ahead of their build, so a reply must never imply instant access.
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
- **16.1 update (user, 2026-10-05): pulled forward. This is the first build after Launch 1,
  before Phase 18.**
  - **Target 10–20 jobs a day.**
  - **Feedback:** 👍 / 👎 (plus "applied"). It re-ranks future matches and tunes the
    preferences. This is *not* AI model fine-tuning, which would cost more for no gain at this size.
  - **Explicit preference form** on top of what's inferred from the resume: titles, locations /
    remote, salary floor, seniority, must-have and never keywords, companies to exclude.
  - **Sources:** ATS public job-board APIs first (direct from the employer), plus **one licensed
    aggregator API** for coverage. **No scraping:** our ToS bans it and job sites' terms forbid it.
  - **Consultancies:** a marketer sees each consultant's daily matches and adds them to the job
    bank in one click (22.3).
  - **Email cost:** Brevo's free plan caps at 300 emails a day. Move to a paid plan before daily
    match emails pass about 250 a day.
  - **Decisions (locked by the user, 2026-10-05):**
    1. **Free tier:** 3 matches a day, ranked by the no-AI pre-filter only, in-app only. No match
       % or reason line, no email. This keeps "no server AI on Free".
    2. **Pro and Autopilot:** 10–20 AI-scored matches a day, daily email at the user's chosen
       time, and 👍/👎 feedback.
    3. **Consultancies:** included in each consultant's Pro seat, with no extra fee for now.
       Revisit with usage data.
    4. **Coverage:** add **one licensed aggregator API**, chosen after a cost check (price per
       call or per month, terms that allow showing results to users, overlap with the ATS
       boards). Record the pick and its cost here before building it.
    5. **Email:** move to a paid Brevo plan before daily match emails pass about 250 a day.
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
| 9 | Admin console, ops & comms — **see `ADMIN-PLAN.md`** (A0 default-admin fix → admin/users/audit → AI/sessions/ops → analytics → email subscription → bug reports; **9.B admin expansion**: runtime settings, flags, support toolkit, unit economics) | 1, 2 | Yes |
| 10 | **Fill quality & the self-building profile** (telemetry → post-fill audit → 3-tier profile + schema → ATS coverage → regression suite) — ships free | 1, 4, 5 | Yes |
| 11 | **Sync** — web→ext signal + `/api/profile/version` + alarms; drop the 90 s throttle | 1 | Yes |
| 12 | **Billing & entitlements** — Stripe, `subscription`, `isPro()`, pricing page, free = BYO only | 1, 2 | Yes |
| 13 | **Pro AI** — credit metering/routing/caching, resume recommendation, job-fit panel, tailoring, ATS score, light job matches | 12, 10.3 | Yes |
| 14 | **Inbox (IMAP)** — dedicated Gmail + app password, poll inbox + sent, parser → status, notifications, dedup, retention | 12 | Yes |
| 15 | **Launch 1** — ops (backup/monitoring/restore drill), PL.1 legal, CWS + AMO resubmit, checklist | 10–14 | — |
| 16 | **Between launches** — strong job matches, analytics, reminders, digest, calendar, cover letter, resume builder | 14, 15 | Yes |
| 17 | **Launch 2** — price rise to $24.99 / $54.99, adapter milestone, listing refresh (+ Autopilot, Phase 19) | 16, 19 | — |
| 18 | **Catalog & entitlements engine** — DB products/prices/limits, grants, admin catalog with margin guard | 15 | Yes |
| 19 | **Autopilot** — batch-prepare applications in the user's browser, stop before submit, review queue | 18 | Yes |
| 20 | **Services** — AI Interview Practice (text) + human services marketplace | 18 | Yes |
| 21 | **Organizations** — setup fee + per-person items, org admin console, Coach hook | 18, hosting move | Yes |
| 22 | **Consultancy Marketer** — oversees consultants, builds resumes, assigns jobs + resumes, recruiter inbox; consultant submits | 21, 19, 14 | Yes |
| 23 | **Consultancy Ops add-on** — timesheets, placements, bill/pay rates, invoices, profit (record only, never move money) | 22, brainstorm 23.0 | Yes |

---

## Expansion build (Phases 18–23) — locked 2026-10-05

> Planned with the user on 2026-10-05. Adds a second paid tier (**Autopilot**), **services**
> (human services plus AI interview practice), and an **Organization** plan sold item by item, per
> person. All of it sits on one **catalog + entitlements** engine, so prices, limits and future
> packages change from the admin console, not in a release. **The Coach tier is deliberately not
> being built.** The org model keeps a hook for it (see "Coach later"), so adding it later is not
> a rework. Nothing here starts before Launch 1. The one exception is **15.5 (re-price Pro)**,
> which must land before 15.4 switches on live Stripe keys.
> **Added later on 2026-10-05:** consultancies get a **Marketer** role (Phase 22). The marketer
> oversees 4–5 consultants, builds their resumes, assigns them jobs with chosen resumes, and
> receives recruiter mail that updates the consultants' boards. **The consultant always
> submits.** Consultancies can also buy an optional **Consultancy Ops add-on** for timesheets
> and finances (Phase 23).

### What we sell (final structure)

| Product | Sold to | Billing |
|---|---|---|
| Free | everyone | — |
| Pro | individuals | monthly · 3 months |
| **Autopilot** | individuals | monthly · 3 months |
| **AI Interview Practice** (text) | organizations, per person, as its own item. Individuals get it **inside** Pro and Autopilot | monthly, per person |
| **Human services:** resume review · resume rewrite · mock interview · career coaching | anyone | one-time |
| **Organization** | companies, schools, outplacement firms, consultancies | one-time setup fee + per-person items, invoiced monthly |
| **Marketer seat** | consultancy orgs, per marketer | monthly |
| **Consultancy Ops add-on** (timesheets + finances) | consultancy orgs, optional | monthly |
| ~~Coach~~ | — | **Not built.** Revisit only once organizations are in use and show the need |
| ~~AI voice mock interview~~ | — | **Dropped for now** |

**No packages or bundles at launch.** The catalog supports them (18.1 `bundle_item`), so a
package later is an admin-console action, not a release.

### Prices — individuals

| | Monthly | 3 months | Launch 2 (Phase 17) |
|---|---|---|---|
| Free | $0 | — | — |
| Pro | $19.99 | **$49.99** (was $44.99, raised for the 80 % floor) | $24.99 · $54.99 |
| Autopilot | **$39.99** | **$99.99** | revisit at Launch 2 |

Still no annual plan, no free trial, and "no refunds, cancel anytime" (Phase 12, unchanged).

### Prices — organizations
- **Setup fee: $499, one-time, per organization.** Always charged, and nothing activates until it
  is paid. It covers the workspace, admin accounts, bulk CSV invite and one onboarding call.
- **Per person, per month, item by item.** The org mixes freely, person by person:

  | Item | Org price | vs individual |
  |---|---|---|
  | Pro | **$24.99** | +25 %. Becomes $29.99 when individual Pro goes to $24.99 at Launch 2 |
  | Autopilot | **$49.99** | +25 % |
  | AI Interview Practice | **$9.99** | sold standalone to orgs only |
  | Marketer seat (consultancies) | **$29.99** | org-only. Manages up to 10 consultants; each managed consultant needs at least a Pro seat |
  | Consultancy Ops add-on | **$99 per org + $4 per active consultant** *(proposed, confirm in 23.0)* | optional, org-only |
  | Human services | same list price as individuals | no subscriber discount |

- **Buying for specific people:** an org admin assigns any item to any member, for example Pro
  for one person, Autopilot for another and a resume rewrite for a third. Nothing forces
  "everyone gets the same thing".
- **Orgs pay more per person than individuals (decided). Why:**
  - Business seats conventionally cost more than personal plans (ChatGPT Team vs Plus, Claude Team vs Pro).
  - Orgs get admin, assignment, invoices and reports that individuals don't.
  - Orgs compare us to outplacement at $499–2,499 per person, not to consumer apps.
  - Org seats are used harder and need more support.

  Volume discounts come later as catalog prices, not code.
- **Billing:** a monthly invoice to the org, paid by card or bank transfer (Stripe Invoicing).
  Adding a person mid-month is prorated. Removing someone takes effect at the end of the period
  (no refunds, the same as for individuals).

### Prices — human services

| Service | Price | Expert payout | Our worst-case margin (after Stripe + 10 % subscriber discount) |
|---|---|---|---|
| Human resume review (written, 48 h) | $79 | ~$50 | ~26 % (33 % at list) |
| Professional resume rewrite (one revision round) | $199 | ~$130 | ~24 % |
| Human mock interview (45 min) | $129 | ~$85 | ~24 % |
| Career coaching (60 min) | $119 | ~$80 | ~22 % |

- **Delivery:** vetted freelance experts paid per order, with no staff. Booking runs through
  Cal.com or Calendly at first, payment through Stripe one-time Checkout. Payouts are manual at
  first, moving to Stripe Connect once volume justifies it.
- **Discount:** Pro and Autopilot subscribers get 10 % off, taken from our share. Orgs pay list price.
- **Service terms (proposed, lawyer to confirm in 20.5):** reschedule up to 24 h before. If the
  expert doesn't show up, the client gets a refund or a rebooking.

### Cost controls — nothing is unlimited
**Margin floors (locked):**
- Every **subscription** price must keep **≥ 80 % gross margin in the worst case**. Worst case
  means the AI budget is fully spent and the Stripe fee is paid.
- Every **service** must keep **≥ 20 %** after the expert payout, Stripe and the discount.
- The admin catalog enforces both (18.4).

| Limit | Free | Pro | Autopilot | Org AI Interview Practice |
|---|---|---|---|---|
| AI budget (model cost, per **billing period**) | resume parsing only, count-capped as today | **$3 / month · $8 per 3-month period** (was $5/month) | **$6 / month · $16 per 3-month period** | $1.50 / month |
| Resumes (non-archived) | 3 | **25** (was unlimited) | **50** | — |
| Prepared applications | — | — | **300 / month, 30 / day** | — |

- **Budget period:** the AI budget now runs **per billing period**, replacing today's calendar
  month. A 3-month plan gets one pooled budget for the quarter. The mechanics are unchanged: at
  80 % it switches to the economy model, and at 100 % AI stops until the period renews. Users
  see a percentage, never dollars, and the admin override still outranks everything.
- **Stacking:** a person with several grants (say personal Pro + org Autopilot) gets the
  **highest** value of each limit, never the sum.
- **Already bounded, keep as is:**
  - The inbox stores text only, never attachments, and deletes mail after 12 months.
  - Job matching scores at most 50 jobs per user per night.
  - Every AI feature has its own kill switch.
  - Resume uploads have a size cap.
- **Consultancy limits (Phases 22–23):**
  - **Marketer seat:** a $4/month AI budget (inbox classification + resume tailoring), at most
    10 consultants, and at most 100 open job assignments per consultant. The marketer's inbox
    follows the same text-only, 12-month rules.
  - **Ops add-on:** no AI. Attachments up to 5 MB each and 2 GB per org.
- **Watch:** the $3 Pro budget is close to the p95 estimate ($2–3 a month, as of Sep 2026). If
  more than 5 % of Pro users hit 100 % in a month, decide with data between raising the price
  and accepting a lower floor. Don't quietly raise the cap.
- **Model prices:** Flash-Lite's successor costs 2.5–3.75× more. Budgets are in dollars, so the
  worst case stays bounded, but the typical margin shrinks.

**Margins at these prices.** These cover variable costs only; hosting is a fixed cost and is not included.

| Plan | Price | Worst-case cost (AI + Stripe) | Margin, worst / typical |
|---|---|---|---|
| Pro monthly | $19.99 | $3.00 + $0.88 | 81 % / 93 % |
| Pro 3 months | $49.99 | $8.00 + $1.75 | 80 % / 93 % |
| Pro at Launch 2 | $24.99 · $54.99 | $4.02 · $9.89 | 84 % · 82 % worst |
| Autopilot monthly | $39.99 | $6.00 + $1.46 | 81 % / 91 % |
| Autopilot 3 months | $99.99 | $16.00 + $3.20 | 81 % / 91 % |
| Org Pro seat | $24.99 | $3.00 + $0.72 | 85 % worst |
| Org Autopilot seat | $49.99 | $6.00 + $1.45 | 85 % worst |
| Org AI Interview Practice | $9.99 | $1.50 + $0.29 | 82 % worst |
| Org Marketer seat | $29.99 | $4.00 + $0.87 | 84 % worst |
| Consultancy Ops add-on | $99 + $4 per consultant | Stripe only, no AI | ~95 %+ (proposed) |
| Org setup fee | $499 | ~$15 Stripe + ~2–3 h of onboarding time | — |

### Architecture decisions
- **No rewrite.** The extension, web app, API, MySQL, Stripe and Gemini all stay.
- **No cloud auto-apply** (headless browsers on our servers filling forms). Each application
  would cost us money, all traffic would come from our server's address (which Workday's and
  Greenhouse's fraud tools flag), and it would hit CAPTCHAs we won't bypass. Autopilot runs in
  the user's own browser.
- **Still no auto-submit.** Autopilot stops at the final review page and **never ticks
  certification, attestation or consent boxes**. The user clicks Submit.
- **Prepare, never submit as someone else.** Org staff, **including consultancy marketers**,
  never submit on a member's behalf and never sign in as them. A marketer may *prepare* almost
  everything: resumes, a job bank, a resume per job. The member still runs the fill, ticks the
  attestation box and submits from their own account.
- **Hosting:** move off the shared BeeCompete box onto our own server, with the Phase 15
  backups proven, **before Phase 21 ships**.
- **The `tabs` permission** (needed for Autopilot) triggers a Chrome Web Store re-review and a
  one-time permission prompt for existing users. Ship it in its own release, with listing copy
  that explains why.

### Phase 18 — Catalog & entitlements engine  *(after Launch 1; before 19–21)*
Goal: prices, limits and (later) packages live in the database and are edited from admin. Code
asks "does this person have feature X, and what is their limit Y", never "is this person Pro".
- **18.1 Schema (additive Liquibase):**
  - `product`: code, name, kind `SUBSCRIPTION|SEAT|SERVICE|FEE|BUNDLE`, sold-to flags (individual / org), active.
  - `product_price`: product, audience `INDIVIDUAL|ORG`, interval `MONTH|QUARTER|ONE_TIME`,
    amount, currency, `stripe_price_id`, active. **Rows are immutable:** a price change is a
    new row, and existing subscribers stay on theirs (grandfathering comes for free).
  - `product_entitlement`: product, feature key, limit value. Examples: `ai.server`,
    `ai.budget_cents_per_period`, `resumes.max`, `answers.sync`, `inbox`,
    `autopilot.apps_per_month`, `autopilot.apps_per_day`, `interview.ai_practice`.
  - `bundle_item`: links a bundle product to its component products. **Built, but unused at
    launch.** It is what makes packages an admin action later.
  - `entitlement_grant`: user, product, source `STRIPE_SUBSCRIPTION|ORG_ASSIGNMENT|ADMIN_COMP|SERVICE_ORDER`,
    `source_ref`, nullable `org_id`, `starts_at`, `ends_at`.
- **18.2 `EntitlementService` on grants.**
  - It resolves a user's active grants into features + limits; for any limit, the highest value wins.
  - `isPro()` / `requirePro()` become thin wrappers over `has(feature)`. `PRO_REQUIRED` stays,
    and `PLAN_REQUIRED {feature}` is added.
  - The webhook stays the only writer of subscription-sourced grants.
  - Free and Pro are seeded from today's config, and a migration test proves behaviour is identical.
- **18.3 Features on the version endpoint.** `GET /api/profile/version` → `{version, plan,
  features[]}`. The extension gates on features, not plan names.
- **18.4 Admin catalog page.**
  - Create and edit products, prices and limits, and publish prices to Stripe through `StripeGateway`.
  - **Margin guard:** shows each price's worst-case margin (AI budget + payout + Stripe fee).
    It refuses to publish below the floor (80 % for subscriptions, 20 % for services) unless the
    admin types an override reason, which is written to the audit log.
- **18.5 Re-home hard-coded config onto the catalog:** `pro-monthly-budget-usd`, the resume
  caps, the Stripe price ids, and the MRR math in the revenue card.

### Phase 19 — Autopilot  *(ships with Launch 2)*
- **19.1 Queue (API + web).** New tables `autopilot_run` and `autopilot_item`. Each item has a
  job, a status (`QUEUED|FILLING|READY|NEEDS_YOU|SUBMITTED|SKIPPED`) and a reason. On the web,
  the user picks jobs from matches, saved jobs or the board and clicks "Prepare N". The server
  enforces 300 per month and 30 per day.
- **19.2 Extension orchestrator.**
  - Opens items in a dedicated Autopilot window, at most 3 at a time, with throttling and jitter.
  - Fills each one with the existing engine plus auto-advance and **stops at the final page**.
  - **Never clicks Submit and never ticks attestation, consent or certification boxes.** Each
    adapter gets a detector for those boxes and a test list.
- **19.3 "Needs you" handling.** These cases park the item with a reason:
  - sign-in walls (Workday tenant accounts)
  - CAPTCHAs
  - an unknown required question
  - a failed upload
  - an exhausted AI budget

  Nothing retries in a way that looks like a bot.
- **19.4 Review queue.** A list of READY items in the drawer and on the web. One click focuses
  the tab. The existing submit-detect flips the item to SUBMITTED and logs the application.
- **19.5 Store release.** The `tabs` permission in its own release, with listing copy and a
  privacy note. QA on the 6 adapters + generic.
- **19.6 Selling it.** Catalog rows, the pricing page, and Stripe prices ($39.99 / $99.99).

### Phase 20 — Services
- **20.1 AI Interview Practice (text).**
  - Input: role + JD + resume. Output: an interviewer chat, feedback on each answer, and a session summary.
  - Runs on Flash-Lite / Flash and counts against the AI budget.
  - Included in Pro and Autopilot. An org-only standalone product row carries its own $1.50 budget.
- **20.2 Service orders.**
  - New `service_order` table: user, product, status `PAID|SCHEDULED|IN_PROGRESS|DELIVERED|REFUNDED`,
    expert, `payout_cents`, deliverable.
  - Stripe one-time Checkout, with the 10 % subscriber discount read from the catalog.
- **20.3 Expert side.**
  - Admin-created, vetted `expert` profiles, with orders assigned by admin.
  - A limited expert view showing only the ordering client's resume and target job; the client
    consents at checkout.
  - Deliverable upload, plus a booking link (Cal.com or Calendly) for live sessions.
- **20.4 Payouts.** A payout ledger (manual payouts first, Stripe Connect later) and an admin services page.
- **20.5 Terms.** Service terms (rescheduling, no-shows, the revision round) go to lawyer review.

### Phase 21 — Organizations  *(after the hosting move)*
- **21.0 Prerequisites.**
  - Our own server, with the restore drill passing.
  - Every org endpoint scoped by membership, with tests proving one org can't read another's
    data. This extends the 1.11 leak fix and the deferred Phase 8.2.
- **21.1 Schema.**
  - `organization`: name, type `COMPANY|SCHOOL|OUTPLACEMENT|CONSULTANCY`, `stripe_customer_id`,
    `setup_fee_paid_at`, status.
  - `org_member`: org, user, role `OWNER|ADMIN|MEMBER`, invite email, status. Phase 22 adds
    `MARKETER` and Phase 23 adds `FINANCE`.
  - `org_assignment`: org, member, product, price, start/end dates. It writes an
    `entitlement_grant` with source `ORG_ASSIGNMENT`.
  - `data_share`: member, org, scope `NONE|SUMMARY|FULL`. Org admins get SUMMARY. FULL is used
    only by a consultant's assigned marketer, with the consultant's consent (Phase 22).
- **21.2 Org billing.**
  - The setup fee is a one-time invoice item, and the org activates once it is paid.
  - One Stripe subscription per org, with one line per org price and quantity = the number of assignments.
  - Services are added as invoice items.
  - Adding a person is prorated; removing one takes effect at the end of the period.
  - An unpaid invoice goes through Stripe dunning, then the grants end.
- **21.3 Org admin console (web).**
  - Members, CSV invite, and assigning or unassigning any item per person.
  - Invoices.
  - A summary report: who has activated, and how many applications were prepared and
    submitted. Counts only, and only with the member's consent.
- **21.4 Member side.**
  - The person accepts the invitation, and the account stays theirs.
  - Leaving the org ends the org's grants at the end of the period; the person keeps whatever
    they pay for themselves, otherwise Free. Nothing is deleted.
  - Someone who already pays personally is told so and can cancel in the portal. We never cancel for them.
- **21.5 Selling it.** A sales page and order form. Phase 8.1 SSO is built only when a school deal needs it.

### Phase 22 — Consultancy: the Marketer role  *(after 21; needs 19 for Autopilot and 14 for the inbox)*
**Why:** in a staffing consultancy, each **marketer** looks after 4–5 consultants (the
employees looking for placements) and traditionally applies to jobs *for* them. We don't do
that part. It isn't legal for anyone but the candidate to attest an application, and it breaks
our no-submit rule. Instead, the marketer does **everything up to the click**: they oversee the
consultant's dashboard, build resumes, and assign jobs, each with its own chosen resume. The
consultant runs Autopilot, or opens each link if they are on Pro, then reviews, ticks the
attestation box and submits.

**Decisions locked for this phase:**
- **Who is who.** The marketer is an org member with role `MARKETER`. A consultant is an org
  member (`MEMBER`) whom an org admin assigns to one marketer. A marketer typically has 4–5
  consultants, **capped at 10**.
- **Never as the consultant.** A marketer never signs in as the consultant, never starts
  Autopilot on the consultant's machine, and never submits. The consultant always does the
  final review and the click.
- **Consent.** On joining, the consultant gives explicit, revocable consent for their marketer
  to see everything (`data_share` scope `FULL`). Revoking it cuts the marketer's access at once
  and notifies the org admin.
- **Resumes the marketer builds belong to the consultant.** They live in the consultant's
  account, carry a "made by your marketer" label, and count toward the consultant's resume cap.
  **The consultant approves each such resume once, with one click, before it can be used.**
  They are the person attesting it is true.
- **Seats.** Each **marketer needs a Marketer seat**, and each **consultant managed by a
  marketer needs at least a Pro seat**. Assigned jobs then flow through sync, and Autopilot
  needs an Autopilot seat.
- **Caps.** At most **100 open job assignments per consultant**. When the consultant runs
  Autopilot, assigned jobs count toward their own 300/month and 30/day limits.

**Tasks:**
- **22.1 Roles + pairing.**
  - Add the `MARKETER` role and a `marketer_assignment` table (marketer member → consultant member).
  - Org admins pair marketers with consultants.
  - The consultant's consent screen writes `data_share` `FULL`.
  - Tests: a marketer sees only their own consultants, never another marketer's or another org's.
- **22.2 Marketer workspace (web).**
  - A consultant switcher, and a read view of each consultant's dashboard, board and applications.
  - Create and edit resumes on the consultant's behalf, with AI tailoring counted against the
    marketer seat's budget.
  - The approval flow for marketer-made resumes.
- **22.3 Job bank + assignment.**
  - The marketer builds a bank of jobs for a consultant (for example 40) from pasted links, job
    matches, or the extension's **"Save for consultant…"** on any job page.
  - They pick a default resume, override it per job, and assign the batch.
  - Each job becomes a `job_assignment` row (consultant, job, resume, assigned_by, status
    `ASSIGNED|IN_QUEUE|APPLIED|SKIPPED`) and appears on the consultant's board as **Assigned**,
    with its resume.
  - The consultant gets one notification per batch, not one per job.
- **22.4 Consultant side.**
  - **Autopilot consultants:** assigned jobs are a source for the Phase 19 queue
    (`autopilot_item` gains `assignment_id` + `resume_id`), and Autopilot fills each one with
    the assigned resume.
  - **Pro consultants:** an "Assigned jobs" list where each item opens the link, and the
    extension pre-selects the assigned resume.
  - Either way, the consultant reviews, ticks the attestation box and submits. Submit-detect
    marks the assignment `APPLIED`, and the marketer sees it right away.
- **22.5 Marketer inbox.**
  - Recruiters often email the **marketer** about a consultant. The marketer connects **their
    own dedicated Gmail**, using the same IMAP + App Password model as Phase 14: text only, no
    attachments, 12-month retention, and we never send, move or delete mail.
  - The parser attributes each message to a consultant using:
    - the consultant's name or email in the message
    - a company or job already on that consultant's board
    - a thread already linked to that consultant
  - When matched, it updates that consultant's application status and notifies both people.
  - Unmatched or ambiguous mail lands in a **"Needs review"** list, where the marketer assigns
    it to a consultant in one click.
  - Classification is rule-based first, using AI only for ambiguous messages, charged to the
    marketer seat's AI budget.
- **22.6 Selling it.** A catalog row for the Marketer seat ($29.99/mo, org-only, consultancy
  orgs) with its entitlements: `org.marketer`, `consultants.max = 10`,
  `assignments.open_max = 100`, `inbox`, and `ai.budget_cents_per_period = 400`. Plus copy on
  the sales page.

### Phase 23 — Consultancy Ops add-on: timesheets + finances  *(optional add-on; after 22; starts with a brainstorm)*
**What it is:** a **separate, optional** product a consultancy can add to its subscription. It
gives them one place to track consultants' hours and the money flowing around them: what each
end client pays, what each consultant is paid, and the profit in between. It is **not**
required for any other feature. **The scope below is a first draft. Task 23.0 must turn it into
a locked spec before any code is written.**

**Boundaries (locked now, whatever the brainstorm decides):**
- **We record money, we never move it.** No payroll processing, no payments to people, no tax
  filing. Paying people stays in the consultancy's bank or payroll provider. Integrations such
  as QuickBooks or Gusto may come later.
- **We never store bank account numbers, SSNs or tax IDs.** Amounts, rates and dates only.
- **Only some people see finances.** Finance data is visible to org `OWNER` / `ADMIN` and a new
  `FINANCE` role. A consultant sees only their own hours (and their own pay, if the org turns
  that on). Marketers see no finances unless also given `FINANCE`.
- **Not tax or legal advice.** Records come with a clear disclaimer, and everything exports
  (CSV / PDF), so the org is never locked in.

**Draft scope:**
- **Timesheets.**
  - Consultants log hours each week against a placement; reminders go out when a week isn't submitted.
  - Submit → approve or reject (admin or finance), with a comment.
  - An optional upload of the client-approved timesheet.
  - CSV / PDF export.
- **Placements.** Consultant × end client × (optional vendor chain) × start and end dates ×
  **bill rate** (what the client pays per hour) × **pay rate** (what the consultant gets) ×
  pay-type label (W-2 / 1099 / C2C, a label only).
- **Money tracking.**
  - Client invoices generated from approved hours, kept as records and PDFs; sending them comes later.
  - Payments received from clients, payments made to consultants, and expenses, all recorded by hand.
- **Profit view.** Billed − paid − expenses, by consultant, by client and by month, plus
  outstanding invoices and unapproved hours.

**Tasks:**
- **23.0 Brainstorm → locked spec.** The scope above, roles, the `FINANCE` role, retention
  (financial records often need about 7 years: confirm), the legal check, and the final price
  (must clear the 80 % floor; there's no AI, so it will).
- **23.1–23.n** are written after 23.0. The expected order is timesheets → placements + rates →
  invoices + payments → profit dashboard.
- **Pricing (proposed, confirm in 23.0):** **$99 per org per month + $4 per active consultant
  per month**, optional, org-only. No AI cost, so the margin is about 95 %+.
- **Caps:** timesheet attachments 5 MB each and **2 GB per org** in total.

### Coach later — the hook (not built)
A coach is just:
- an `organization` of type `COACH`
- a `COACH` role in `org_member`
- `data_share` scope `FULL`, consented to by the member
- catalog rows for coach and client prices

No new tables and no billing rework. Build it only if Phase 21 usage shows the demand.
**Phase 22 makes this even smaller:** a marketer is already a staff member with consented,
delegated access to a few members. A coach would mostly be the same mechanism, outside a
consultancy.

### Order
Launch 1 (including 15.5) → **16.1 job matches (strong)** → **18** → **19** alongside Phase 16 → **Launch 2** (Autopilot ships
with it) → **20** → **21** → **22** (Marketer) → **23** (Ops add-on, after its brainstorm).

### Market position (research 2026-10-05; mostly 2026 third-party reviews, Huntr + Simplify first-party)

| Ours | Our price | Market | Verdict |
|---|---|---|---|
| Pro | $19.99 · $49.99 / 3 mo | Simplify+, Jobright, Huntr, Jobscan ≈ $40 · $90 / 3 mo; Teal+ $29 · $79; Careerflow $23.99 · $54.99 | **Low** (deliberate; Launch 2 raise is safe) |
| Autopilot | $39.99 · $99.99 / 3 mo | JobCopilot ≈ $38–56; AIApply $49–99; Jobhire $49; Massive $59–99; LazyApply $99–999 / yr | **Middle.** We keep the last click: "safe autopilot" |
| Org seats + setup | $24.99 / $49.99 / $9.99 + $499 | Huntr ≈ $40 / user; Jobscan Coach $199 / mo; outplacement $499–2,499 / person | **Low** vs outplacement |
| Services | $79 · $199 · $129 · $119 | resume writing $139–349 (Fiverr ≈ $50); human mock $150–340; coaching $75–200 / h | **Low–middle** |

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
*(2026-10-05: **Autopilot** (Phase 19) batch-**prepares** applications and stops at the final
review page. It never submits and never ticks attestation boxes, so this stance holds.)*

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

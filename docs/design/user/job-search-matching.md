# Design — Job ingestion, search, matching and ranking (area `user`, epic U4)

Status: decided 2026-10-11 (Fable). Implementers: Sonnet, one story each. Everything here is a
decision unless listed in §12. Read `CLAUDE.md` (no scraping · Free = 3 rule-ranked matches/day,
no AI · Pro/Autopilot = 10–20 AI-scored · one licensed aggregator · ≤ 50 model candidates per
user per night) and ROADMAP 13.6 / 16.1 first — this doc builds on what 13.6 already shipped.

## 0. Summary

1. **One posting store, two readers.** `job_posting` (exists, 13.6a) becomes the single table that
   both the nightly matcher and a new **search endpoint** read. Retention grows from 7 to **30
   days**; "fresh" for matches stays ≤ 48 h.
2. **Sources = six ATS public job-board APIs + one licensed aggregator.** Greenhouse, Lever, Ashby
   exist; add Workable, SmartRecruiters, Recruitee parsers to `JobBoardParsers` (same
   `JobBoardClient` seam). The aggregator is behind its own `JobBoardClient` implementation
   (`AggregatorClient`) and a `source.kind = AGGREGATOR` so quality gates can treat it differently.
   **No HTML scraping anywhere** — if a source has no JSON API it is not a source.
3. **Search is MySQL FULLTEXT first.** No new infrastructure until > 300 k live rows (then
   Meilisearch, same DTO). Ranking is deterministic and explainable: text relevance × recency ×
   preference fit × feedback, in SQL + Java, free for every tier.
4. **Match % is a Pro overlay, never the ranking.** The nightly `job_match` score (13.6b) and an
   on-demand "Score this job" (one metered Flash-Lite call, cached in `job_fit` by content hash)
   decorate results; the list order itself never needs the model, so Free gets the same list.
5. **Preferences are explicit > inferred.** A new `job_preference` row (titles, locations, remote,
   salary floor, seniority band, must/never keywords, excluded companies) overrides what
   `MatchPreferences.from(bio, resume)` infers. Onboarding writes the first row in two taps.
6. **Feedback re-ranks, never fine-tunes.** `job_feedback` (👍/👎/applied/hide company) adjusts the
   deterministic score and excludes companies; it also feeds the nightly pre-filter.
7. **Alerts are saved searches** (see `alerts-notifications.md`): the same query object, stored,
   evaluated after each ingest run.

## 1. Audience lens

A 19-year-old on a phone opens Kiwiply between classes. She types "ux intern remote", sees
results in under a second with chips she can tap to narrow (Remote · Internship · Posted today),
swipes a card right to save, left to hide, and gets a "3 new for 'ux intern remote'" push the next
morning. She never sees a 12-field filter form; the rail is a bottom sheet with chips. Match %
appears as a small ring only on Pro, with a one-line reason. An empty result says what to loosen
("Try without 'remote' — 14 more") instead of a blank page.

## 2. Current code (do not rebuild)

- `api/.../service/jobs/JobIngestService` + `JobIngestScheduler` (02:00 UTC) — fetch, dedup
  (`dedupKey` = company+title+location), ≤ 48 h filter, 7-day keep, failing boards off after 5 nights.
- `JobBoardClient` / `HttpJobBoardClient` / `JobBoardParsers` / `JobBoardUrls` — Greenhouse, Lever, Ashby.
- `JobPrefilter` + `MatchPreferences` — location segment, title words, seniority (`Seniority.of`),
  skills (≤ 30), → ≤ 50 candidates.
- `JobMatchService` + `JobMatchScheduler` (04:00 UTC) — one Flash-Lite call per opted-in Pro user,
  `job_match {user, posting, score, reason, status NEW|SAVED|DISMISSED, model}`.
- `JobMatchResource` — `GET /api/profile/job-matches`, `POST …/{id}/save|dismiss`, `GET/PUT …/settings`.
- `JobSourceService` + admin page `/admin/job-sources`; seed `config/job-sources.csv` (219).
- Web: `components/app-v2/jobs/data.ts loadJobs()`, `app-v3/jobs/*` (client-side filter over sample).

## 3. Data model (additive Liquibase; MySQL 8)

### 3.1 `job_posting` — alter
```
ALTER TABLE job_posting
  ADD COLUMN salary_min INT NULL, ADD COLUMN salary_max INT NULL, ADD COLUMN salary_currency CHAR(3) NULL,
  ADD COLUMN salary_period VARCHAR(8) NULL,              -- YEAR|MONTH|HOUR (from the aggregator or JD regex; reuse ext salaryParsed shape)
  ADD COLUMN seniority TINYINT NULL,                     -- MatchPreferences.Seniority.of(title) at ingest
  ADD COLUMN location_country CHAR(2) NULL, ADD COLUMN location_region VARCHAR(64) NULL, ADD COLUMN location_city VARCHAR(96) NULL,
  ADD COLUMN skills_json JSON NULL,                      -- ≤ 30 skill tokens found in the JD (same dictionary as MatchPreferences)
  ADD COLUMN quality_flags VARCHAR(128) NULL,            -- CSV: AGENCY, DUPLICATE_OF:<id>, NO_DESCRIPTION, STALE_REPOST
  ADD COLUMN apply_ats VARCHAR(24) NULL,                 -- greenhouse|lever|ashby|workable|smartrecruiters|recruitee|other (= the extension adapter that will fill it)
  ADD COLUMN last_seen_at TIMESTAMP NULL, ADD COLUMN expired_at TIMESTAMP NULL,
  ADD COLUMN search_text MEDIUMTEXT NULL;                -- title + company + location + first 4 000 chars of description, lowercased, for FULLTEXT
CREATE FULLTEXT INDEX ft_job_posting_search ON job_posting (title, company, search_text);
CREATE INDEX ix_job_posting_pub ON job_posting (published_at DESC, id);
CREATE INDEX ix_job_posting_loc ON job_posting (location_country, remote, published_at);
CREATE INDEX ix_job_posting_expired ON job_posting (expired_at);
```
Retention: `expired_at = now` when a posting disappears from its board on a later read (not
deleted immediately — the board detail stays openable from the tracker for 30 days); hard delete
30 days after `expired_at` or `published_at`, whichever is later. Applications never reference
`job_posting` by FK (they copy company/title/url at save time — `JobMatchService.save` already does).

### 3.2 `job_source` — alter
`ADD COLUMN kind VARCHAR(16) NOT NULL DEFAULT 'ATS'` (`ATS|AGGREGATOR`),
`ADD COLUMN platform VARCHAR(24)` (greenhouse|lever|ashby|workable|smartrecruiters|recruitee|aggregator),
`ADD COLUMN agency BOOLEAN DEFAULT FALSE` (admin-flagged staffing agencies are excluded from matches, searchable with a badge).

### 3.3 `job_preference` (new, 1:1 user)
```
user_id BIGINT PK FK user, titles_json JSON (≤ 10 strings), locations_json JSON (≤ 5 {city,region,country}),
remote_pref VARCHAR(8) (ANY|REMOTE|HYBRID|ONSITE), salary_floor INT NULL, salary_currency CHAR(3),
seniority_min TINYINT, seniority_max TINYINT, employment_types_json JSON (FULL_TIME|PART_TIME|CONTRACT|INTERNSHIP),
must_keywords_json JSON (≤ 10), never_keywords_json JSON (≤ 20), excluded_companies_json JSON (≤ 50),
source VARCHAR(8) (ONBOARDING|FORM|INFERRED), updated_at TIMESTAMP
```
`MatchPreferences.from(...)` gains a third argument: the explicit row overrides each inferred field
when present. Onboarding (U2.3) writes `titles_json`, `locations_json`, `remote_pref`, `employment_types_json`.

### 3.4 `job_feedback` (new)
```
id BIGINT PK, user_id FK, posting_id FK job_posting (ON DELETE CASCADE), signal VARCHAR(12) (LIKE|DISLIKE|APPLIED|HIDE|HIDE_COMPANY),
company_key VARCHAR(160) NULL (normalized company for HIDE_COMPANY, kept after the posting is purged),
created_at TIMESTAMP, UNIQUE (user_id, posting_id, signal)
```
A nightly job rolls up per-user **term weights**: for every LIKE/APPLIED posting, +1 for each
title token and skill; DISLIKE −1. Stored as `job_preference.learned_json` (≤ 60 tokens with
weights) — simple, inspectable, deletable ("Reset what Kiwiply learned").

### 3.5 `job_search_event` — **not a table**; search queries are product events (U18), never stored with the query text beyond 180 days.

## 4. Ingestion pipeline

```
JobIngestScheduler (02:00, 08:00, 14:00, 20:00 UTC — 4×/day, HTTP only, no model cost)
  for each active job_source (round-robin, ≤ 8 concurrent, 2 s timeout, 3 retries w/ jitter)
    fetch → parse (JobBoardParsers.<platform>) → FetchedPosting[]
    for each posting:
      normalize (company, title, location → country/region/city via a tiny gazetteer + the ATS fields)
      enrich (seniority, skills_json, salary regex when the ATS gives none, apply_ats, search_text)
      quality gates:
        - description < 200 chars → NO_DESCRIPTION (searchable, never matched)
        - source.agency || title matches /staffing|recruit(er|ing) agency|talent partner/ → AGENCY
        - dedupKey seen from ANOTHER source within 14 d → DUPLICATE_OF:<id> (ATS row wins over aggregator)
        - same dedupKey re-published by the same board within 30 d → STALE_REPOST (keeps original published_at)
      upsert by (source_id, external_id); set last_seen_at; mark missing ones expired_at
  after the run: AlertEvaluator.run(sourcesTouched)  (see alerts doc)
```
Aggregator specifics: query it per **distinct title cluster** from `job_preference` rows (top 200
title strings × top 20 countries), ≤ N calls/day set by the admin runtime setting (9.B1), results
go through the same gates; `apply_ats = other` unless the apply URL is a known ATS host.
Aggregator rows carry `source.kind = AGGREGATOR` so the UI shows "via <aggregator>" and the
licence's attribution text (a legal requirement for most of them).

**Licensed aggregator pick — open question §12.1.** Default candidate order for the cost check:
Adzuna (free developer tier, attribution required, salary estimates), Jooble, Careerjet. The ROADMAP
rule stands: record the pick, price and terms in ROADMAP 16.1 before building U4.4.

## 5. Search API

`GET /api/jobs/search` (authenticated; Free and Pro)
```
q           string ≤ 120   free text (FULLTEXT BOOLEAN MODE; tokens quoted; "-" prefix = exclude)
loc         string ≤ 80    city/region/country text, resolved against the gazetteer
remote      ANY|REMOTE|HYBRID|ONSITE
type        CSV of FULL_TIME|PART_TIME|CONTRACT|INTERNSHIP
level       CSV of 0..5 (Seniority)
posted      1|3|7|14|30 (days)
salaryMin   int (only rows WITH a salary ≥ it; rows without salary are kept unless `salaryStrict=1`)
company     string ≤ 80 (prefix match on company)
ats         CSV of platform
sort        best|newest|salary
page/size   size ≤ 30, page ≤ 34 (hard cap 1 000 results; past that say "narrow your search")
```
Response `JobSearchPage { total, page, size, took_ms, items: JobCard[], facets: {remote, type, level, ats, postedBuckets}, suggestions: Relax[] }`
`JobCard { id, title, company, companyKey, location, remote, employmentType, seniority, salary{min,max,currency,period}?, publishedAt, source{kind,platform,label}, applyAts, skills[≤8], saved: bool, feedback: LIKE|DISLIKE|null, match?: {score, reason, at} }`
`match` is filled only for Pro from `job_match` (nightly) or `job_fit` (on-demand) — never computed in the search request.
`Relax[]` = up to 3 cheaper queries with their counts when `total < 5` (drop `remote`, widen `posted`, drop last `q` token) — computed with `COUNT(*)` queries capped at 3.

`GET /api/jobs/{id}` → `JobDetail` (card + descriptionText (sanitized plain text, ≤ 20 000 chars) + url + applyUrl + companyJobsCount + similar[≤ 5] (same FULLTEXT query on the title)).
`POST /api/jobs/{id}/feedback {signal}` / `DELETE …/feedback/{signal}`.
`POST /api/jobs/{id}/save` → creates a `SAVED` application exactly like `JobMatchService.save` (one code path, `ApplicationKeys` dedup).
`POST /api/jobs/{id}/score` (Pro; `AiTask.JOB_FIT`; metered; cached in `job_fit` by hash(default resume parsed_json + posting description)) → `{score, reason, missingKeywords[≤8]}`. Daily cap 30 per user (runtime setting) on top of the budget.
`GET/PUT /api/profile/job-preferences`.

Web BFF: `web/src/app/api/jobs/search/route.ts` etc. proxy 1:1 (server talks to Spring). Search
results are rendered by a server component on first load (`?q=` in the URL = shareable) and by
`fetch` on filter changes (URL updated with `history.replaceState`).

## 6. Ranking (deterministic, same for every tier)

```
score = 0.45 * text_relevance     -- MySQL MATCH() AGAINST() normalized 0..1 within the result page (0.5 when q is empty)
      + 0.20 * recency            -- exp(-hours_since_published / 72)
      + 0.25 * preference_fit     -- avg of: title overlap with job_preference.titles (0/0.5/1), location fit (1 remote-ok or city/region match, 0.5 country, 0), seniority in band (1/0.5/0), employment type (1/0), salary ≥ floor when known (1) / unknown (0.6) / below (0)
      + 0.10 * feedback           -- Σ learned_json weights over title tokens ∪ skills, squashed tanh(x/3) → -1..1, then (x+1)/2
      − 1.00 * hard_exclusions    -- excluded company, never_keywords hit, HIDE on this posting, AGENCY when user has not opted in, DUPLICATE_OF
```
`sort=best` orders by `score`; `newest` by `published_at`; `salary` by `salary_max` nulls last. The
first page runs the FULLTEXT query with `LIMIT 300`, scores in Java, slices the page (300 rows ×
≤ 1 KB = cheap; beyond page 10 it re-queries). Every score term is returned in a debug field when
`?explain=1` and the account is `ROLE_ADMIN` — the admin "why did this rank here" tool.

**Match % (Pro)** = `job_match.score` when the posting was in last night's batch, else the
on-demand `job_fit` score when the user tapped "Score"; otherwise hidden. Never shown on Free (locked).

**Free daily matches** (CLAUDE.md): the top 3 of `sort=best` over postings published ≤ 48 h with the
user's preferences and no `q`, cached per user per day in `job_match` with `model = 'rules'` and
`reason = null`. Same table, same UI, no model.

## 7. State machines

Posting: `ACTIVE (last_seen_at fresh)` → `EXPIRED (expired_at set)` → purged (30 d). A posting can
return to ACTIVE if the board lists it again within 30 d (clears `expired_at`, keeps `published_at`).

User × posting: `none` → `SAVED` (application row) · `HIDDEN` (feedback HIDE) · `LIKED/DISLIKED`
(feedback) · `APPLIED` (application status ≥ APPLIED, from the extension or the inbox). HIDE on a
SAVED posting archives the application. APPLIED postings drop out of search by default (toggle
"show jobs I applied to").

## 8. Failure modes

| Failure | Behaviour |
|---|---|
| A board 5xx / timeout | skip, `job_source.failures++`, off after 5 consecutive (exists); never blocks the run |
| Aggregator quota exhausted | `AggregatorClient` returns empty, admin runtime setting shows "quota hit at HH:MM", search still serves ATS rows |
| FULLTEXT query too short (< 3 chars, InnoDB `innodb_ft_min_token_size`) | fall back to `LIKE 'q%'` on title + company (indexed prefix), note `took_ms` |
| Zero results | `suggestions` (relaxations) + "Create an alert for this" CTA + 3 freshest postings in the user's preferred location |
| Model budget exhausted (Pro) | `score` → 402-style `AI_BUDGET` problem; UI hides the Score button and shows "resets <date>" |
| Duplicate across sources | the aggregator row is flagged `DUPLICATE_OF` and hidden; the ATS row shows "also on <aggregator>" |
| Posting purged while on a user's screen | `GET /api/jobs/{id}` → 410; card shows "No longer listed" with the original URL |

## 9. Security & privacy

- Search parameters are never logged with the user id beyond the product-event (name tokens are
  hashed per user for the "popular searches" admin tile; raw `q` is kept 180 d max, U18).
- Descriptions are sanitized plain text (`HtmlText` exists) — never rendered as HTML.
- `job_feedback` and `job_preference` are in the DSAR export and deleted with the account.
- Aggregator terms: attribution shown; no re-publication of their data to third parties; postings
  purged on the licence's schedule if shorter than 30 d (set per source in `job_source.retention_days`).
- No per-user requests to the aggregator (queries are per title cluster, not per person).

## 10. Cost model

| Item | Volume | Cost |
|---|---|---|
| ATS reads | ~250 boards × 4 runs/day × ~40 KB | HTTP only, ~40 MB/day egress, $0 |
| Aggregator | ≤ 400 calls/day (setting) | depends on §12.1; Adzuna free tier covers it |
| Storage | 6 ATS × ~30 d ≈ 60–150 k rows × ~6 KB | < 1 GB; MySQL on the box |
| Nightly match (Pro) | 1 Flash-Lite call ≤ 50 candidates × opted-in users | exists; ~ $0.002/user/night |
| On-demand score | ≤ 30/user/day, cached | ≤ $0.06/user/day worst case; inside the $3/mo budget by the meter |
| Search | FULLTEXT p95 < 120 ms at 150 k rows (measure in U4.3; threshold to Meilisearch = p95 > 400 ms or > 300 k rows) | $0 |

## 11. Tests

- Parser fixtures per platform (`src/test/resources/jobs/<platform>.json`, captured from real boards —
  **capture real responses, never guess**, the same rule as ATS DOM).
- `JobIngestServiceTest`: gates (AGENCY, DUPLICATE_OF precedence ATS > aggregator, STALE_REPOST, NO_DESCRIPTION), expiry/return.
- `JobSearchServiceIT` (Testcontainers MySQL, FULLTEXT needs real InnoDB): query parsing, boolean
  exclude, short-token fallback, facets, relaxations, cap at 1 000, `explain` only for admins.
- `JobRankerTest`: each term on fixed rows; hard exclusions; feedback squash; stable sort ties by id.
- `JobPreferenceResourceIT`: validation limits, override of inferred prefs, learned reset.
- Web: Playwright (U19.3) — search on a 390 px viewport: type, chip, open detail sheet, save, hide,
  empty state shows relaxations; Pro vs Free fixtures from the mock API.

## 12. Open questions

1. **Aggregator pick + cost** (Adzuna / Jooble / Careerjet) — the user records the choice in ROADMAP 16.1 before U4.4.
2. Should agency postings be searchable at all (badge) or hidden entirely? Default: searchable with a badge, excluded from matches/alerts.
3. Ingest cadence 4×/day vs 2×/day — default 4× (HTTP only); drop to 2× if any board rate-limits.

## 13. Mobile wireframes (390 px)

```
┌──────────────────────────────┐   ┌──────────────────────────────┐
│ ‹  Job Search            🔔  │   │ Filters                    ✕ │  (bottom sheet, 70% height)
│ ┌──────────────────────────┐ │   │ Where   [Remote][Austin, TX]+│
│ │🔍 ux intern remote      ✕│ │   │ Type    [Intern✓][Full][Part]│
│ └──────────────────────────┘ │   │ Level   [Intern✓][Junior]    │
│ [Remote✓][Internship✓][Today]│   │ Posted  [Today][3d][7d✓]     │
│ [Filters 2]                  │   │ Salary  ≥ $[   ] /yr         │
│ 128 jobs · Best ▾            │   │ Hide agencies  (●)           │
│ ┌──────────────────────────┐ │   │ [ Clear ]      [ Show 128 ]  │
│ │ G  UX Design Intern      │ │   └──────────────────────────────┘
│ │    Google · Remote · 2h  │ │
│ │    Figma · Research   ○92│ │   swipe → save  ·  swipe ← hide
│ │    [Save]  [Hide]        │ │
│ ├──────────────────────────┤ │   ┌──────────────────────────────┐
│ │ S  Product Design Intern │ │   │ ═══                          │  (detail sheet, full height)
│ │    Stripe · Remote · 5h  │ │   │ UX Design Intern             │
│ │    …                     │ │   │ Google · Remote · $45/h ·2h  │
│ └──────────────────────────┘ │   │ [Figma][Research][Prototyping]│
│                              │   │ ◔ 92% match — "Figma + your  │
│ ⌂ Jobs  ☰ Apps  ✦ AI  ♡  ⋯   │   │   research project"  (Pro)   │
└──────────────────────────────┘   │ About · What you'll do · Reqs│
                                   │ …description…                │
  Empty:                            │ ──────────────────────────── │
  "Nothing for 'ux intern remote'  │ [ Apply on Google ↗ ] [Save] │
   today. Try: without 'remote'     └──────────────────────────────┘
   (14) · last 7 days (31)          Apply = opens the posting; on desktop with the
   [Create an alert for this]"      extension installed the drawer autofills.
```

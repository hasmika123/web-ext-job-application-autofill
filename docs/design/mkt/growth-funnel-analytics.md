# Design — Acquisition attribution and the marketing funnel (area `mkt`, epic M8)

Status: decided 2026-10-11. Today the web has a GA4 helper that is dark by default behind an
equal-weight cookie banner (`web/src/lib/analytics.ts`, `components/CookieConsent.tsx`), the
extension sends GA4 Measurement Protocol events from its service worker (`job-autofill/src/lib/analytics.js`),
and nothing records where a signup came from. The user area designs the first-party product event
pipeline (`docs/design/user/analytics-events.md`, U18); the admin area planned acquisition charts
(A11.6) and the KPI board (A11.1). This design adds the **acquisition** half: first-touch capture,
the marketing → product funnel, cookieless counts, and the admin growth view. It does not create a
second event pipeline.

## 0. Summary

1. **First touch is captured server-side at signup**, not by a client script: the marketing site sets
   one first-party cookie `kw_src` (httpOnly, 90 days, SameSite=Lax) on the first visit that carries
   UTM params, a referrer, a `ref` code (M6), or a known landing path. The signup BFF forwards it;
   the API stores one `user_acquisition` row. No PII in the cookie, no third party.
2. **The funnel is six steps**: `visit → signup_started → account_created → email_verified →
   extension_connected → first_fill` (phone cohort: `first_save` replaces `first_fill`). The first
   two come from this design (`page_view_route` counts, `signup_started` event); the rest already
   exist as rows (`jhi_user.created_date`, `activated`, `extension session`, `fill_event`). The
   nightly rollup joins them by `user_id` into `funnel_daily(channel, step, count)`.
3. **Cookieless route counts** (`page_hit_daily(route, day, hits, uniques_approx)`) are recorded by a
   Next middleware increment with a HyperLogLog-ish daily salted hash — enough to see traffic by
   page without consent, because nothing identifies a person.
4. **GA4 stays optional** and gains Consent Mode v2 defaults (`analytics_storage: denied` until the
   banner says otherwise), so the GA4 numbers and ours never disagree about consent.
5. **Admin sees one Growth page** (A11 owns the board; this design supplies the tiles' queries):
   funnel by channel, top landing pages, referral and campus channels, install conversion, and the
   "where did paying users come from" cut.

## 1. Decisions

| Decision | Choice | Why |
|---|---|---|
| Attribution model | First touch, 90-day cookie; last touch stored too (`last_*` columns) | Simple to explain; marketing content is top-of-funnel |
| Where attribution is read | Server (BFF → API) at `POST /api/register` and Google sign-up | Works with ad blockers; one write |
| Channel taxonomy | `organic_search, direct, referral_program, affiliate, campus, social, email, paid, store_listing, content, other` — derived from UTM/referrer/ref by `channel.ts` | Stable buckets for the admin board |
| Visit counting | Route-level daily counters, no cookies, no IP stored (daily salted hash for uniques) | Consent-free by construction |
| Product funnel steps | Reuse rows that already exist; only `signup_started` and `page_view` are new | No duplicate pipeline; U18 owns the event schema |
| Experiments | Flag-based (A5 flags / U18.5 bucketing); marketing variants are server-rendered by flag so they are indexable | No client flicker; no third-party A/B tool |
| Retention | `user_acquisition` lives with the user (deleted on account deletion); `page_hit_daily` aggregate forever; `funnel_daily` aggregate forever | Privacy by schema |

## 2. Data model (MySQL, additive)

```sql
CREATE TABLE user_acquisition (
  user_id BIGINT PRIMARY KEY,
  first_touch_at TIMESTAMP NOT NULL,
  channel VARCHAR(24) NOT NULL,                -- derived
  utm_source VARCHAR(80) NULL, utm_medium VARCHAR(80) NULL, utm_campaign VARCHAR(120) NULL,
  utm_content VARCHAR(120) NULL, utm_term VARCHAR(120) NULL,
  referrer_host VARCHAR(120) NULL,             -- host only, never full URL
  landing_path VARCHAR(200) NULL,              -- our path, no query string
  ref_code CHAR(10) NULL,                      -- referral (M6) / affiliate (M7) / campus (M7) code
  last_touch_at TIMESTAMP NULL, last_channel VARCHAR(24) NULL, last_utm_campaign VARCHAR(120) NULL,
  surface ENUM('WEB','EXT','PHONE') NOT NULL DEFAULT 'WEB',
  country CHAR(2) NULL,                        -- from the edge header (CF-IPCountry) if present; A11.6
  CONSTRAINT fk_user_acq_user FOREIGN KEY (user_id) REFERENCES jhi_user(id) ON DELETE CASCADE
);

CREATE TABLE page_hit_daily (
  day DATE NOT NULL, route VARCHAR(160) NOT NULL,
  hits INT NOT NULL DEFAULT 0, uniques_approx INT NOT NULL DEFAULT 0,
  PRIMARY KEY (day, route)
);

CREATE TABLE funnel_daily (
  day DATE NOT NULL, channel VARCHAR(24) NOT NULL, surface ENUM('WEB','EXT','PHONE') NOT NULL,
  step ENUM('visit','signup_started','account_created','email_verified','extension_connected','first_fill','first_save','first_paid') NOT NULL,
  count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (day, channel, surface, step)
);
```

Cookie `kw_src` (set by `web/src/proxy.ts`/middleware on marketing routes when absent):
`v1|ts|channel|utm_source|utm_medium|utm_campaign|utm_content|utm_term|referrer_host|landing_path|ref`
(URL-encoded, ≤ 1 KB, no identifiers). The cookie is **never read by client JS** (httpOnly).

## 3. API

- `POST /api/register` and `POST /api/auth/google` (via the web BFF) accept an `acquisition` object
  built from the cookie; the API writes `user_acquisition` (idempotent; ignores if present).
- `POST /api/public/hit {route}` is **not** used — the middleware increments in-process and flushes
  per minute to `page_hit_daily` through `POST /api/internal/page-hits` (service token), so no
  client call exists to block or spam.
- `GET /api/admin/growth/funnel?from=&to=&channel=&surface=` → steps with counts and conversion %.
- `GET /api/admin/growth/landing?from=&to=` → top routes by hits and by signups attributed.
- `GET /api/admin/growth/channels?from=&to=` → signups, activated, paid, by channel (joins `subscription`).
- Nightly `GrowthRollupJob`: fills `funnel_daily` from `user_acquisition` × user state tables × U18
  rollups; idempotent per day; registered in A10 job health.

## 4. Funnel definitions (exact)

| Step | Source | Rule |
|---|---|---|
| visit | `page_hit_daily` | sum of marketing routes (registry `kind=marketing`) |
| signup_started | U18 event `signup_started` (new; fired on `/signup` form focus or Google button click) | per anonymous session, deduped by the `kw_src` cookie timestamp |
| account_created | `jhi_user.created_date` | — |
| email_verified | `jhi_user.activated = 1` and `activation_key IS NULL` (or Google) | — |
| extension_connected | first `POST /api/extension/session` for the user | — |
| first_fill / first_save | first `fill_event` row / first `application` row with `status=SAVED` | — |
| first_paid | `subscription` first `active` | — |

Conversion = step N / step N−1 within the window, by the user's `first_touch` channel. Visits cannot
be joined to users (no identifier), so `visit → signup_started` is a ratio of daily totals, labelled
as such on the admin page.

## 5. Consent and GA4

- Consent Mode v2 defaults set before gtag loads (`ad_storage`, `analytics_storage`,
  `ad_user_data`, `ad_personalization` = `denied`); the existing banner's Accept updates them. GA4
  only ever runs after Accept (unchanged).
- The marketing conversion events (M1.5: `cta_click {id, route}`, `signup_started`, `install_click
  {browser}`, `pricing_view {plan}`) are sent to GA4 **and** to the first-party pipeline (U18.1)
  once it exists; until then GA4 only. No PII, no user id in GA4.
- Privacy policy "Analytics" section (`(marketing)/privacy/page.tsx:304`) gains the cookieless counts
  sentence and the attribution cookie (U14.5 carries the edit).

## 6. Failure modes

| Failure | Behaviour |
|---|---|
| Cookie absent at signup (blocked, direct typed URL) | `channel=direct`, `landing_path` from the signup page referrer if same-origin |
| UTM spam / 10 KB query strings | Each field truncated; unknown params dropped; cookie capped at 1 KB |
| Middleware counter lost on container restart | ≤ 1 minute of hits lost; acceptable; documented |
| Rollup late | Admin page shows "through <date>"; job health alerts (A10) |
| Google sign-up path skips the BFF | The Google callback runs through `web/src/app/api/auth/*`, which forwards the cookie too (test) |

## 7. Security / privacy

No IPs, no fingerprints, no cross-site identifiers. `referrer_host` is the host only. The cookie is
httpOnly so content scripts and third parties cannot read it. `user_acquisition` is deleted with the
account (cascade) and included in the DSAR export (`AccountExportResource`). Aggregates have no
`user_id`. Experiments assign by hashed user id or a session cookie, never by IP.

## 8. Cost

Zero external services. One middleware branch, one table write at signup, one nightly job. GA4 stays
free. Admin page is one Sonnet session on the existing admin-v3 components.

## 9. Tests

- `channel.test.ts`: UTM/referrer/ref → channel for 20 fixtures (google organic, tiktok, campus code,
  affiliate code, newsletter, store listing, direct).
- BFF: cookie parsed, truncated, forwarded on both register paths; httpOnly, Lax, 90 days.
- `UserAcquisitionResourceIT`: idempotent write, cascade delete, DSAR export includes the row.
- `GrowthRollupJobIT`: seeded users across steps → correct `funnel_daily`; rerun idempotent.
- Middleware counter unit test: route normalisation (`/companies/<slug>` → `/companies/[slug]`), flush.
- Admin page Playwright at 390 px: funnel renders, channel filter, "through <date>" label.

## 10. Rollout

M8.1 cookie + `user_acquisition` + channel derivation (no UI) → M8.4 cookieless counts + Consent Mode
v2 → M1.5 conversion events → M8.2 rollup job → M8.3 admin growth page → M8.6 install funnel join
with extension telemetry (U20) → M8.5 experiments on the hero (after U18.5 bucketing).

## 11. Wireframe — admin Growth page (390 px)

```
┌──────────────────────────────────────┐
│ Growth · last 28 days  [channel ▾]   │
│ through 10 Oct                       │
│ Visits        41,200   (route totals)│
│ ▼ 3.1 %                              │
│ Signup started 1,290                 │
│ ▼ 68 %                               │
│ Accounts        877                  │
│ ▼ 71 %                               │
│ Verified        623                  │
│ ▼ 54 %                               │
│ Extension       336  · phone 102 saved│
│ ▼ 61 %                               │
│ First fill      205                  │
│ ▼ 6.8 %                              │
│ Paid             14                  │
│ ──────────────────────────────────── │
│ By channel    signups  paid          │
│ organic search   412     6           │
│ referral          96     3           │
│ store listing     88     2           │
│ campus (3 codes)  61     1           │
│ Top landing pages ›                  │
└──────────────────────────────────────┘
```

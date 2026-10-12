# Design — `/help`: the public help center (area `mkt`, epic M4)

Status: decided 2026-10-11. Today "Help Center" is a `mailto:` and "FAQ" links to `/v3#faq`
(`(marketing)/contact/page.tsx:31-39`), the footer's "Browser Extension Help" goes to `/signup`, and
the signed-in Settings "Help & Support" panel says "Coming soon" (`AUDIT-user.md`). Benchmarks:
Simplify/Huntr/Rezi run Intercom help centres with article URLs that rank; Jobscan's FAQ + learning
centre feed its SEO.

**Ownership split with the `sup` area (Support, help & community):** `mkt` owns the **public,
indexable site** at `/help` — IA, content pipeline, search, FAQ, SEO, contextual deep links. `sup`
owns in-app support surfaces (the Settings panel, AI support, ticketing, the job-scam safety centre
content, community). The content directory is shared (`web/content/help/**`); `sup` adds articles,
`mkt` keeps the shell. `relates` on M4 stories point at `sup` once its ids exist.

## 0. Summary

1. `/help` is a static, searchable site built from `web/content/help/<section>/<slug>.md` by the
   M5.1 pipeline, with a client-side search index (`/help/search-index.json`, built at compile
   time, ~50 KB, no service), `FAQPage` JSON-LD, breadcrumbs, "Was this helpful?" votes, and
   contextual entry points from the app and the extension (`/help/<slug>?from=ext-drawer`).
2. Six sections at launch: **Get started** (install, connect, first fill) · **Autofill** (review
   plan, what fills, what doesn't, per-ATS notes, auto-advance) · **Your profile & resumes** ·
   **Inbox tracking** (Gmail app password, what we read, what we never do) · **Plans & billing**
   (prices, cancel, no refunds, resume caps, AI budget) · **Privacy & your data** (export, delete,
   what we store). A seventh, **Safety** (job scams, fake recruiters), is authored by `sup`.
3. Twenty articles in M4.2 cover ≥ 80 % of today's inbound inquiry topics (admin A8.3 categories)
   and every "Coming soon" link on the site.
4. No ticketing here: the bottom of every article offers "Still stuck? → `/contact?topic=support`"
   (existing inquiries queue) and, when signed in, prefills the account email.

## 1. Decisions

| Decision | Choice | Why |
|---|---|---|
| Platform | In-repo Markdown, not Intercom/Zendesk | No vendor, no script on the page, claims lint applies, ranks on our domain |
| Search | Build-time index (title, headings, first 300 chars, tags) + a 60-line client scorer (prefix + token match, section boost) | No service; instant; works offline in the PWA later |
| Article URL | `/help/<section>/<slug>`; stable slugs; renames add a redirect in `redirects.ts` | Links live in emails and the extension |
| Contextual links | Extension and app link with `?from=<surface>` → recorded as an event (`help_opened {slug, from}`) and used to rank "popular from here" | Measures which screens confuse people |
| Feedback | "Was this helpful?" Yes/No + optional 200-char note → `POST /api/public/help-feedback` (anonymous, rate-limited) → admin A8 queue weekly digest | Cheapest signal of a bad article |
| Screenshots | Real UI only, captured by the M10.3 screenshot pipeline (Playwright against the demo account), stored under `web/public/help/<slug>/` with alt text | Board art would be dishonest here |
| Status page | Out of scope for mkt (plat owns monitoring); `/help` links to the UptimeRobot public page once it exists; footer "Status" stops pointing at `/contact` | |

## 2. Data

No DB table for articles. One small table for feedback:

```sql
CREATE TABLE help_feedback (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(160) NOT NULL,
  helpful TINYINT(1) NOT NULL,
  note VARCHAR(200) NULL,
  from_surface VARCHAR(40) NULL,
  user_id BIGINT NULL,             -- only when signed in
  ip_hash CHAR(64) NOT NULL,       -- sha256(ip + daily salt) for rate limiting, never raw IP
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_help_feedback_slug (slug, created_at)
);
```

Front matter per article: `title`, `description`, `section`, `updated`, `tags[]`, `faq[]`,
`claims[]`, `related[]`, `surfaces[]` (which app/extension screens link here), `audience`
(`all | pro | org`).

Generated artefacts: `web/public/help/search-index.json`, `web/content/generated/help-toc.json`
(used by the app's Settings "Help & Support" panel — `sup` consumes it).

## 3. API shapes

- `POST /api/public/help-feedback {slug, helpful, note?, from?}` → 204; 10/IP/day.
- `GET /api/public/help/top?from=<surface>` → `[{slug, title}]` (top 5 by opens for that surface,
  from U18 rollups; falls back to front matter `surfaces`).

## 4. Information architecture (launch set — M4.2)

| Section | Articles |
|---|---|
| Get started | Install on Chrome · Install on Edge · Install on Firefox · Connect the extension to your account · Your first autofill (the review plan) · Using Kiwiply on a phone (what works, what needs a laptop) |
| Autofill | What gets filled and what you still type · Why a field was skipped · Auto-advance (Next, never Submit) · Workday notes · Greenhouse/Lever/Ashby/Workable notes · Sites we haven't seen (label matching) |
| Profile & resumes | Upload and review a resume · Choose which resume fills a form · Learned answers and suggestions · Resume limits per plan |
| Inbox | Connect Gmail with an app password · What we read, what we never do · Disconnect and delete mail data |
| Plans & billing | Prices and what's in each plan · Cancel (keeps Pro to period end) · No refunds, no trial — why · AI budget and the meter · Update card / invoices (Stripe portal) |
| Privacy & data | What we store · Export my data · Delete my account · Cookies and analytics |

Every article ends with: related articles · "Was this helpful?" · "Still stuck? Contact us".

## 5. Contextual entry points (M4.3)

| Surface | Link |
|---|---|
| Extension drawer "?" (panel header) | `/help/autofill/review-plan?from=ext-drawer` |
| Extension options page | `/help/get-started/connect?from=ext-options` |
| Settings › Help & Support panel (app) | renders `help-toc.json` + search box (sup builds the panel; mkt supplies the data) |
| 402 upgrade sheet | `/help/plans/what-is-in-each-plan?from=upgrade-sheet` |
| Inbox connect page | `/help/inbox/connect-gmail?from=inbox-connect` |
| Activation / sign-in emails | `/help/get-started/install-chrome?from=email-welcome` |

## 6. Failure modes

| Failure | Behaviour |
|---|---|
| Search index fails to build | Build fails (the index is a build artefact with a test) |
| Article references a claim that flipped to `banned` | Claims lint fails the build |
| Feedback spam | IP-hash limit, note length cap, no links rendered anywhere |
| Screenshot stale after a UI change | M10.3 pipeline regenerates on release; the article's `updated` is bumped by the script; a visual diff test flags > 20 % change |

## 7. Security / privacy

Articles are static. Feedback stores no raw IP, no email unless signed in (then `user_id`). No
third-party scripts. `?from=` values are an enum (unknown values dropped) so nothing user-supplied is
echoed or stored.

## 8. Cost

Zero runtime. Authoring: 20 articles × ~400 words, mostly from `STORE-LISTING.md`, `PRIVACY.md`,
`ARCHITECTURE.md`, the pricing catalog and the ToS — one Sonnet session drafts, the user reviews.

## 9. Tests

- `help-index.test.ts`: every article has required front matter; slugs unique; related links
  resolve; index contains every article; FAQ renders `FAQPage`.
- Search scorer unit test: "cancel" ranks the cancel article first; "gmail password" finds inbox.
- `HelpFeedbackResourceIT`: limits, no raw IP persisted, enum `from`.
- Playwright 390 px: search → article → feedback → contact link carries `topic=support`.

## 10. Rollout

M4.1 shell + search + FAQ page (moves `/v3#faq` content to `/help/faq`, contact page links fixed) →
M4.2 twenty articles with real screenshots → M4.3 contextual links (one extension bump, one app
change) → M4.4 feedback + top-from-surface.

## 11. Wireframes (390 px)

```
/help                                      /help/plans/cancel
┌──────────────────────────────┐           ┌──────────────────────────────┐
│ Help                         │           │ Help › Plans & billing       │
│ ┌──────────────────────────┐ │           │ Cancel your plan             │
│ │ 🔍 Search help…          │ │           │ Updated 11 Oct 2026          │
│ └──────────────────────────┘ │           │                              │
│ Popular                      │           │ Cancelling keeps Pro until   │
│ › Your first autofill        │           │ the end of the period you    │
│ › Connect Gmail              │           │ paid for. No refunds, no     │
│ › Cancel your plan           │           │ trial — that's the deal and  │
│                              │           │ we say it up front.          │
│ Get started            ›     │           │ 1. Settings › Billing        │
│ Autofill               ›     │           │ 2. Manage subscription       │
│ Profile & resumes      ›     │           │    (opens Stripe)            │
│ Inbox tracking         ›     │           │ 3. Cancel plan               │
│ Plans & billing        ›     │           │ [screenshot: real portal]    │
│ Privacy & your data    ›     │           │ You'll get an email with the │
│ Safety                 ›     │           │ exact date Pro ends.         │
│                              │           │ ──────────────────────────── │
│ Still stuck? Contact us →    │           │ Was this helpful? [Yes] [No] │
└──────────────────────────────┘           │ Related: What's in each plan │
                                           │ Still stuck? Contact us →    │
                                           └──────────────────────────────┘
```

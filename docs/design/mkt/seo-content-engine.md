# Design — SEO foundation and the content engine (area `mkt`, epics M3 + M5)

Status: decided 2026-10-11. Benchmarks: Huntr's 3,500-example hub with a free tool on every page,
Jobscan's ownership of "ats resume checker" through guides + a free scan, Simplify/JobRight's
programmatic jobs and companies directories, Rezi's `/tools` hub (`AUDIT-mkt.md` §4). Constraints:
no scraping, no server AI on Free (so public tools are deterministic), no new web runtime deps
unless a story asks, honest claims only, hosting = long-running Next container (ISR is fine; no
serverless assumptions).

## 0. Summary

1. **Foundation first (M3):** a route registry that feeds sitemap, canonical, breadcrumbs and
   JSON-LD; per-page OG images; `not-found.tsx` + a redirect registry; `llms.txt`; Lighthouse and a
   link checker in CI; Search Console/Bing/IndexNow wiring.
2. **Content pipeline (M5.1):** Markdown/MDX files in `web/content/**` compiled at build with the
   already-present TypeScript toolchain (a 150-line Markdown-to-HTML renderer, no `next-mdx-remote`
   unless the story approves it), one layout per content type, authoring rules in
   `web/content/README.md`, every page a server component with ISR where it reads live data.
3. **Four content types, in this order of leverage:**
   - **ATS application guides** (`/guides/apply/<ats>`): how Workday/Greenhouse/Lever/Ashby/Workable
     application forms really work — steps, repeating sections, custom dropdowns, the questions they
     ask — written from the DOM fixtures we already capture. Nobody else can write these truthfully.
   - **Free tools** (`/tools/<tool>`): the public **ATS resume check** (deterministic checks, no
     sign-in, rate-limited), a **job-description keyword finder**, an **application-question answer
     guide** (from aggregated learned-answer labels). Each tool page ends in the product, not a wall.
   - **Programmatic pages from the posting store** (`/companies/<slug>`, `/jobs/<title-slug>`):
     real open roles from `job_posting` (U4.1) with "which ATS this company uses" — the thing only a
     fill engine knows — and the apply hand-off.
   - **Resume examples** (`/resume-examples/<role>`): shared with the Resume Builder's R7 Growth
     epic; mkt owns the hub page, SEO plumbing and internal linking; R7 owns the example content and
     the "open in builder" hand-off.
4. **Every page carries honest copy from the register** (`<Claim>`), a `FAQPage` block where there is
   a FAQ, and exactly one primary CTA.

## 1. Decisions

| Decision | Choice | Why |
|---|---|---|
| Content storage | Files in the repo (`web/content/{guides,help,blog,tools,compare}/*.md` with front matter), not a CMS | No new infra; PR review = editorial review; the claims lint runs on it |
| Markdown renderer | In-repo renderer (`web/src/lib/markdown.ts`): headings, lists, links, code, tables, callouts, images; front matter parsed by hand | Keeps "no new runtime deps"; if the story owner approves `marked` + `gray-matter` that is a one-line swap |
| Programmatic pages | ISR (`revalidate: 3600`) over `GET /api/public/companies/{slug}` and `GET /api/public/jobs?title=` | Live data without a build per change; cache at the edge Caddy (plat) |
| Index policy | Programmatic pages index only above thresholds (company: ≥ 1 open role in the last 30 days; title: ≥ 20 open roles); otherwise `noindex,follow` | Thin pages hurt the whole domain |
| URL scheme | `/guides/apply/workday`, `/tools/ats-resume-check`, `/companies/northwind`, `/jobs/ux-designer`, `/resume-examples/ux-designer`, `/compare/kiwiply-vs-simplify`, `/blog/<slug>`, `/help/<section>/<slug>` | Short, flat, no dates in URLs |
| Structured data | `Organization` + `WebSite` (root), `SoftwareApplication` (landing, `/extension`), `Product`+`Offer` (pricing), `FAQPage` (FAQ, help, guides), `BreadcrumbList` (all deep pages), `JobPosting` (job pages, only with the employer's canonical URL as `url`), `Article` (blog/guides) | Rich results where Google shows them; `JobPosting` is a direct Google Jobs feed for the roles we already ingest |
| `llms.txt` | Yes, `web/src/app/llms.txt/route.ts` listing the public pages with one-line summaries; `llms-full.txt` later | Simplify ships one; cheap; AI answer engines read it |
| Free ATS check | Reuses the deterministic part of the ATS score (13.5); no AI call; file parsed server-side and discarded; no account needed; 5 checks/IP/day; result page offers "save this report" → signup | Free = no server AI (locked); the hook must be truly free |
| Blog | Last, not first. Only product changelog posts and guide round-ups until M5.2–M5.6 exist | Generic career blogs are the most crowded SERP in this market |

## 2. Route registry and SEO plumbing (M3.1–M3.3)

```ts
// web/src/lib/routes.ts
export interface PublicRoute {
  path: string; title: string; description: string;
  priority: number; changefreq: "daily" | "weekly" | "monthly";
  lastModified?: string;            // static pages: hand-set; content pages: front matter `updated`
  index: boolean;                   // false → noindex,follow + excluded from sitemap
  og?: { headline: string; kicker?: string; family?: Family }; // per-page OG image inputs
  breadcrumbs?: { name: string; path: string }[];
}
export function publicRoutes(): PublicRoute[]  // static list + content front matter + programmatic feeds
```

- `sitemap.ts` becomes `sitemap/[id]/route.ts`-style chunked sitemaps (static, guides, help, tools,
  companies, jobs, examples) with a sitemap index; `lastModified` from front matter or the row's
  `updated_at`. `NON_INDEXABLE_PATHS` stays the single disallow list.
- `generateMetadata()` helper `seo({ route })` sets `alternates.canonical`, OG/Twitter, robots.
- `opengraph-image.tsx` moves to a shared generator `og/[...slug]/route.tsx` reading the route's
  `og` inputs (headline + kicker + family colour) — one template, every page.
- `not-found.tsx` (marketing theme, search box over the help index, top links) + `redirects.ts`
  (source → destination, 301/410) applied in `next.config.ts` and covered by a test.
- IndexNow: `web/src/app/api/indexnow/route.ts` pings Bing/Yandex with changed URLs after a content
  deploy (key file at `/<key>.txt`); Google via Search Console sitemap submission (manual, documented).

## 3. Content pipeline (M5.1)

```
web/content/
  README.md                 # authoring rules, front matter schema, claims rules, review cadence
  guides/apply/workday.md   # front matter: title, description, updated, author, ats, faq[], claims[]
  tools/…                   # copy blocks for tool pages (the tool UI is a component)
  help/…                    # see help-center.md
  compare/kiwiply-vs-simplify.md
  blog/2026-10-launch.md
```

Front matter schema (validated at build by `web/scripts/content-lint.mjs`): `title`, `description`
(≤ 160 chars), `updated` (ISO), `author` (from `web/content/authors.ts`), `index` (default true),
`faq` (array of `{q,a}` → `FAQPage`), `claims` (ids that must exist in the register), `cta`
(`signup | extension | pricing | tool:<id>`).

Rendering: `web/src/components/content/{ContentLayout,Toc,Callout,FaqBlock,Breadcrumbs,CtaBand}.tsx`.
Reading time, "updated on", author card (no stock photos; mascot fallback), related pages by tag.

## 4. ATS application guides (M5.2)

One page per verified ATS, written from `job-autofill/test/fixtures/<ats>/*` and `AUTOFILL-QA.md`:

- Sections: what the form looks like · the steps · the repeating sections (work history, education)
  · the questions it always asks (work authorization, EEO, "how did you hear") · the traps (custom
  dropdowns, file upload limits, "Save and continue" vs submit) · what Kiwiply fills and what it
  leaves for you (honest, per `ats-verified`) · FAQ.
- A live "what this form asks" block from the adapter's field map (generated at build from the
  rules file `src/config/rules.js` → `web/content/generated/ats-fields.json`, produced by
  `job-autofill` script `npm run export:fields`), so the guide stays true to the engine.
- Internal links: to `/companies` filtered by that ATS, to the free resume check, to `/help` install.

## 5. Free tools (M5.3, M5.4)

**ATS resume check** (`/tools/ats-resume-check`)
- Client: drag-drop/upload (PDF/DOCX ≤ 5 MB) → `POST /api/public/ats-check` (multipart) → report.
- Server (`PublicAtsCheckResource`): parses with the existing resume parser (text only), runs the
  deterministic checks (sections present, contact block, dates parse, tables/columns/images that
  break parsers, file type, length, keyword density against an optional pasted JD), returns
  `{score, checks[{id, pass, why, fix}], keywords{present[], missing[]}}`. **No AI call.** File bytes
  are never stored; the parsed text lives in memory for the request only.
- Limits: 5 checks per IP per day (`RateLimit` keyed on the proxy-provided client IP, in-memory →
  Redis when plat adds it), 20/day per signed-in Free user (then the in-app scorer takes over).
- Result page: the report + "Save this report and fix it in the builder" → signup with the parsed
  text handed to R1.4 (card review) via a one-time server token (10-minute TTL, no PII in URL).
- Honesty: the page says "15 deterministic checks modelled on how parsers read resumes — not a
  prediction of whether a human will call you" (`<Claim id="ats-check-honest" />`, new).

**Application-question answer guides** (`/guides/questions/<slug>`)
- Source: `profile_suggestion`/learned-answer **labels** aggregated across users: label text, count,
  which ATS asks it. Never answer values. Export job: `SELECT label, ats, COUNT(*)` with `COUNT ≥ 50`
  → `web/content/generated/questions.json` (nightly, admin A6 job list).
- Each page: why the form asks it · what a good answer contains · a template · "Kiwiply remembers
  your answer and offers it next time" (`learned-answers` claim, ships) · FAQ.

**JD keyword finder** (`/tools/job-keywords`): paste a JD → client-side TF-IDF over a bundled
stop-list + our skills taxonomy (`web/src/lib/skills.json` from the profile schema) → chips → "see
which of these are on your resume" → the ATS check with the JD attached. No server call.

## 6. Programmatic pages from the posting store (M5.6)

Depends on U4.1 (posting store v2). API (public, cached, no auth):

- `GET /api/public/companies?ats=&page=` → `{items:[{slug,name,ats,openCount,locations[],updatedAt}]}`
- `GET /api/public/companies/{slug}` → company + up to 50 open roles (`title, location, remote,
  postedAt, url (employer canonical), applyUrl`)
- `GET /api/public/jobs/titles` → title clusters with counts (the same clusters U2 uses for chips)
- `GET /api/public/jobs?title=&location=&page=` → roles

Pages: `/companies` (index by ATS and letter), `/companies/<slug>` ("Northwind uses Greenhouse —
Kiwiply fills it", roles list, JobPosting JSON-LD with `url` = employer page, "Save to my board"
→ signup/app), `/jobs/<title-slug>` (roles + the matching guide + the question guides that ATS asks).
Thresholds (§1) decide `index`. Attribution line for aggregator rows per its licence (U4.4).

Tables: none new; reads `job_posting`, `job_source`. Add index `job_posting(company_slug, posted_at)`
and a nightly `company_stats` materialised row (`slug, ats, open_count, last_posted_at`) to keep the
index page one query.

## 7. Resume examples (M5.5, with R7)

mkt owns `/resume-examples` (hub, filters by role family, internal links to guides/jobs), the
per-example SEO wrapper (breadcrumbs, FAQ, `Article`), and the thresholds; R7 owns the example data
(`docs/resume-builder/stories.json` R7.*) and the "Use this example" hand-off into the builder.
Until R7 lands, the hub is not linked (no "Soon" page in the index).

## 8. Comparison pages (M5.8)

`/compare/kiwiply-vs-<competitor>` for Simplify, Teal, Huntr, Jobscan, JobRight: a table of **their
published facts** (price, free tier, what's paid, refund/cancel policy, auto-submit stance) with the
source URL and the date checked, next to ours from the register and the catalog. Rules: quote, cite,
date; no adjectives about them; refresh quarterly (front matter `checked`); the claims lint allows
quoted multipliers only inside the attributed cell.

## 9. Failure modes

| Failure | Behaviour |
|---|---|
| Posting store empty / API down | Programmatic routes return `noindex` 200 with "loading jobs" and the static guide content; ISR keeps the last good page |
| Public ATS check abused | IP limit, 5 MB cap, 10 s parse timeout, file type sniffing; a `kill` runtime setting (A5) hides the tool in one flip |
| A guide claims a field we no longer fill | `ats-fields.json` regenerates on every extension release; the guide's generated block changes; the prose carries only register claims |
| Thin pages indexed | Thresholds + weekly Search Console coverage check (M3.6 doc) |
| Duplicate content across `/jobs/<title>` and `/companies/<slug>` | Different primary content (guide vs company); canonical set per page; roles list capped and ordered by recency |

## 10. Security / privacy

Public endpoints read only public employer postings and aggregated labels (counts ≥ 50, no values).
Uploaded resumes for the free check are processed in memory and never written to disk, S3 or logs
(assert in `PublicAtsCheckResourceIT`); the one-time hand-off token holds a server-side key, not the
text. No user data appears in generated pages. `robots` keeps `/api/` disallowed; public API is
rate-limited and CORS-restricted to `kiwiply.com`.

## 11. Cost

No AI. Programmatic pages are ISR + edge cache. Resume parsing CPU for the free check: ~200 ms/file;
5/IP/day. Content authoring is the real cost: 5 ATS guides × ~1,500 words, 30 question guides
(generated skeletons + human pass), comparison pages (research already in `AUDIT-mkt.md` §4).

## 12. Tests

- `routes.test.ts`: every public route has title/description/canonical; sitemap chunks are disjoint
  from `NON_INDEXABLE_PATHS`; redirects resolve to 200.
- `content-lint`: front matter schema, claims ids exist, description length, FAQ shape.
- `markdown.test.ts`: renderer fixtures (headings, tables, callouts, links open safely).
- `PublicAtsCheckResourceIT`: no persistence, limits, score determinism, bad file types.
- `PublicCompanyResourceIT`: thresholds, caching headers, aggregator attribution.
- Playwright (after U19.3): `/guides/apply/workday`, `/tools/ats-resume-check`, `/companies/<seed>`
  at 390 px; JSON-LD validates against schema fixtures; Lighthouse CI budget (LCP ≤ 2.5 s, CLS ≤ 0.1,
  TBT ≤ 200 ms) on `/`, `/pricing`, one guide, one tool.

## 13. Rollout

M3.1 registry + JSON-LD → M3.2 canonical/OG → M3.3 sitemap chunks + IndexNow → M3.7 404/redirects →
M3.4 llms.txt → M3.5 Lighthouse/link-check → M5.1 pipeline → M5.2 Workday guide first (highest
search intent: "workday application tips") then the other four → M5.3 ATS check → M5.4 questions →
M5.6 companies/jobs (after U4.1) → M5.8 comparisons → M5.5 examples (with R7) → M5.7 blog/RSS.

## 14. Wireframes (390 px)

```
/guides/apply/workday                      /tools/ats-resume-check
┌──────────────────────────────┐           ┌──────────────────────────────┐
│ Guides › Apply › Workday     │           │ Free ATS resume check        │
│ How a Workday application    │           │ 15 checks. No account. Your  │
│ really works (2026)          │           │ file is read once, not kept. │
│ Updated 12 Oct · 7 min       │           │ ┌──────────────────────────┐ │
│ ─────────────────────────    │           │ │  ⬆ Drop PDF or DOCX      │ │
│ On this page ▾               │           │ └──────────────────────────┘ │
│ 1. The steps                 │           │ Paste a job description      │
│ 2. Repeating sections        │           │ (optional) ▾                 │
│ 3. Questions it always asks  │           │ [ Check my resume ]          │
│ ┌──────────────────────────┐ │           │                              │
│ │ What this form asks      │ │           │ Result                       │
│ │ • Legal name  • Address  │ │           │ 72/100   9 of 15 passed      │
│ │ • Work history (repeat)  │ │           │ ✗ Two-column layout — parsers│
│ │ • Work authorization     │ │           │   read columns as one line   │
│ │ generated from the engine│ │           │   Fix: single column         │
│ └──────────────────────────┘ │           │ ✓ Contact block found        │
│ …                            │           │ …                            │
│ ┌──────────────────────────┐ │           │ [ Save report & fix it ]     │
│ │ Kiwiply fills Workday.   │ │           │ Creates a free account       │
│ │ You review. You submit.  │ │           └──────────────────────────────┘
│ │ [ Add to Chrome ]        │ │
│ └──────────────────────────┘ │
│ FAQ ▾                        │
└──────────────────────────────┘
```

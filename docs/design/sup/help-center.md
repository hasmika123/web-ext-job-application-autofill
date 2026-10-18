# Design — Help center `/help` (area `sup`, epic S1)

Status: decided 2026-10-11. Fills the hole the contact page admits (`HELP_HREF = mailto:` in
`web/src/app/(marketing)/contact/page.tsx:34`) and the store listing's "support site" promise
(`job-autofill/STORE-LISTING.md:132`).

## 0. Summary

1. **Articles are Markdown files in the repo**, not DB rows: `web/content/help/<category>/<slug>.md`
   with front-matter (`title, summary, category, tags, audience(web|extension|both), ats, plan,
   updated, related[]`). Reviewed in PRs like code, versioned with the product, never out of sync
   with a release. The DB only holds **stats** (views, 👍/👎, search misses).
2. **Build-time index, zero deps.** A `scripts/build-help-index.mjs` step (run by `npm run build -w
   web`, like `sync-parser-core.mjs`) renders Markdown to HTML with a tiny in-repo renderer
   (headings, lists, links, code, images, callouts; no raw HTML) and emits `help-index.json`
   (slug, title, summary, tags, stemmed tokens). Client search is an in-memory token match with
   prefix + tag boost; good enough for < 300 articles. AI search is S6 (Pro) on top of this.
3. **Deep-link contract.** Every surface links by stable slug: `/help/a/<slug>` (article),
   `/help/c/<category>`, `/help?q=`. Query params carry context, never PII: `?from=ext&ats=workday&v=0.65.0`
   (used for analytics and to show "You came from Workday — here's the Workday guide").
4. **Six launch categories**, ~40 articles written by a content pass (S1.3): Getting started ·
   Extension & autofill (one article per supported ATS) · Resumes & profile · Jobs, matches &
   alerts · Plans, billing & cancelling (the locked "no refunds, cancel anytime" stated plainly) ·
   Privacy & safety (links into the scam centre).
5. **Every article ends with "Was this helpful? 👍 👎"** → `help_article_feedback` (S5 feedback
   event) and **"Still stuck? Message us"** → ticket pre-filled with the article slug (S2).
6. **Tone**: second person, ≤ 120 words before the first step, GIF or 3-frame screenshot per
   extension task, phone screenshots first. Reading level ~ grade 7.

## 1. Content model

```
web/content/help/
  getting-started/   install-the-extension.md · connect-your-account.md · first-autofill.md
  autofill/          workday.md · greenhouse.md · lever.md · ashby.md · icims.md · taleo.md
                     smartrecruiters.md · workable.md · indeed.md · linkedin-easy-apply.md
                     site-didnt-fill.md · review-before-submit.md · eeo-questions.md
  resumes/           upload-and-parse.md · ai-parsing.md · resume-caps.md · tailor.md
  jobs/              matches.md · alerts.md · saved-jobs.md · tracker.md · inbox-gmail.md
  billing/           plans.md · cancel-anytime-no-refunds.md · 402-upgrade.md · receipts.md
  privacy-safety/    what-we-store.md · delete-account.md · job-scams.md (→ /safety)
```

Front-matter (validated by the build script; a bad file fails the build):

```yaml
title: "Workday: what autofills and what doesn't"
summary: "Workday forms are multi-step; here's what to expect and how to fix a stuck field."
category: autofill          # one of the six
tags: [workday, autofill, dropdown]
audience: extension         # web | extension | both
ats: workday                # optional; lets the drawer deep-link by adapter id
plan: all                   # all | pro | autopilot
updated: 2026-10-11
related: [site-didnt-fill, review-before-submit]
```

Rendered output: `web/.help/` (gitignored) → imported by the route via `fs` at request time in
`next start` (standalone) — files are bundled with `outputFileTracingIncludes`.

## 2. Data (MySQL, additive)

```
help_article_stat   slug VARCHAR(120) PK, views INT, helpful_up INT, helpful_down INT,
                    last_viewed_at DATETIME                     -- rolled up daily from events
help_search_miss    id BIGINT PK, query VARCHAR(200), from_surface VARCHAR(20), hits INT,
                    created_at DATETIME, INDEX(created_at)       -- "knowledge gaps" report (S9.3)
```
Article feedback rows live in `feedback_event` (see `feedback-and-changelog.md`) with
`target_type='help_article'`. No user id on search misses; queries are truncated to 200 chars and
scrubbed of emails/phone numbers before insert (same regex set as the scam checker).

## 3. API

| Method | Path | Auth | Notes |
|---|---|---|---|
| `GET` | `/help`, `/help/c/{cat}`, `/help/a/{slug}` | public | Next pages, SSG at build, ISR off (content ships with the deploy) |
| `GET` | `/api/help/index` | public | the JSON index (cached 1 h) — used by the extension drawer's search box |
| `POST` | `/api/help/events` | public, BFF 60/h/IP | `{type: view|search|miss, slug?, query?, from?}` → Spring `POST /api/help/events` (batch, fire-and-forget) |
| `GET` | `/api/admin/help/stats` | ADMIN | top viewed, lowest helpful ratio, top misses (S9.3) |

Spring: `HelpEventResource` + `HelpStatService` (daily rollup job). No article content on the API.

## 4. Surfaces

- **Web** `/help` (marketing layout, no sign-in): search box first, six category tiles, "Popular
  this week" (from stats), "Report a scam" + "Message us" pinned.
- **App**: Settings → Help & Support becomes a sheet: search, 5 contextual articles for the current
  route (`route → tags` map in `web/src/lib/help-context.ts`), My requests (S2), What's new (S5),
  Status (S7), keyboard shortcuts.
- **Extension drawer**: "?" icon → `HelpSheet` inside the drawer: top 3 articles for the current
  adapter (`?ats=`) fetched from `/api/help/index`, "This site didn't fill" (S4.2), open full help.
  Works offline from a bundled fallback list of 10 slugs.

## 5. Failure modes

| Failure | Behaviour |
|---|---|
| Index fetch fails in the drawer | show the bundled 10-slug fallback; never block the fill |
| Article references a feature behind a plan | `plan:` front-matter renders a quiet "Pro" chip, never hides the article |
| Stale article after a release | `updated` older than 90 days shows "Checked on …" and raises a row in the admin "stale" list (S9.3) |
| Search returns nothing | log a miss (scrubbed), show "Message us" with the query pre-filled |

## 6. Privacy

No PII in URLs. Events are anonymous (no login, IP only for the BFF limiter, not stored). The
`?from=ext` context is a surface tag, not an identifier. Article feedback with a free-text reason
is capped at 500 chars and scrubbed.

## 7. Cost

Zero runtime AI. Hosting: static. Content cost is the real one: ~40 articles × ~40 min = one
Sonnet session for drafts (S1.3) + human review for the ATS articles (screenshots must be real;
CLAUDE.md rule "capture real ATS DOM" applies to help too).

## 8. Tests

- `scripts/build-help-index.test.mjs`: front-matter validation, slug uniqueness, no raw HTML,
  relative links resolve.
- web: render test for `/help/a/[slug]` (404 on unknown slug), search ranking unit test
  (prefix + tag boost), `help-context` route map test.
- API: `HelpEventResourceIT` (batch accepted, scrubbed query, rollup counts).
- Playwright 390px: search → article → 👍 → "Message us" pre-filled.

## 9. Rollout

S1.1 route + renderer + 6 seed articles → S1.2 index + search → S1.3 content pass → S1.4 stats +
feedback → S1.5 drawer HelpSheet (needs `/api/help/index`) → S1.6 app help sheet → S1.7 footer/
contact/store-listing links switched from mailto to `/help`.

## 10. 390 px wireframes

```
┌──────────────────────────────┐  ┌──────────────────────────────┐  ┌──────────────────────────────┐
│ Help                      ✕  │  │ ‹ Autofill                   │  │ ‹ Workday                    │
│ [🔍 Search help…          ]  │  │ Workday: what autofills   ›  │  │ Workday: what autofills      │
│ Popular                      │  │ Greenhouse                › │  │ and what doesn't             │
│ • Site didn't fill?       ›  │  │ Site didn't fill?         › │  │ Checked 11 Oct · 2 min read  │
│ • Cancel anytime (no refunds)│  │ Review before submit      › │  │ Workday forms are multi-step │
│ • Is this job a scam?     ›  │  │ EEO questions             › │  │ … [GIF: dropdown fix]        │
│ ┌────────┐┌────────┐┌──────┐ │  │                              │  │ 1. Open the drawer …         │
│ │Getting ││Autofill││Resume│ │  │                              │  │ 2. …                         │
│ │started ││        ││s     │ │  │                              │  │ ──────────────────────────── │
│ └────────┘└────────┘└──────┘ │  │                              │  │ Was this helpful?  👍   👎   │
│ ┌────────┐┌────────┐┌──────┐ │  │                              │  │ Still stuck? [Message us]    │
│ │Jobs    ││Billing ││Safety│ │  │                              │  │ Related: Site didn't fill ›  │
│ └────────┘└────────┘└──────┘ │  │                              │  │                              │
│ 🛡 Report a scam · 💬 Message│  │                              │  │                              │
└──────────────────────────────┘  └──────────────────────────────┘  └──────────────────────────────┘
Drawer "?" sheet (360 px wide): "Help for Workday" · 3 article rows · [This site didn't fill] ·
[Open help center ↗]. Search box filters the fetched index client-side.
```

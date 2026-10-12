# Design — Feedback loops, feature requests, what's new (area `sup`, epic S5)

Status: decided 2026-10-11. One tiny event table powers every 👍/👎 in the product (AI drafts,
tailoring, help articles, help answers, fills, matches via U4.6), a public feature-request board
replaces "Idea" tickets that vanish, and a changelog closes the loop ("you asked, we shipped").

## 0. Summary

1. **One `feedback_event` table, typed targets.** `target_type ∈ {ai_draft, ai_tailor, ai_fit,
   help_article, help_answer, fill, match, feature, changelog}`, `vote ∈ {-1, +1}`, optional
   `reason` code + ≤ 500-char comment (scrubbed). Idempotent per (user-or-anon-key, target) — a
   second tap flips the vote. The `packages/ui` primitive `ThumbsFeedback` is the only UI; it posts
   through one BFF.
2. **Feature requests are public, voted, and honest.** `/feedback` lists requests with status
   `CONSIDERING · PLANNED · IN_PROGRESS · SHIPPED · NOT_PLANNED` and a vote count; one vote per
   account; submitting also opens a `support_ticket` kind IDEA (so the author gets a reply) and the
   admin can **merge** duplicates. No comments at launch (moderation cost); "Shipped" links the
   changelog entry.
3. **Changelog is Markdown in the repo** (`web/content/changelog/2026-10-11-v0-66.md` with
   `surface: web|extension|api`, `version`, `highlights[]`, `requests[]` ids it closes). Rendered at
   `/changelog`; an in-app "What's new" sheet shows unseen entries (last-seen stored per user);
   the extension shows a one-time card after a version bump from **bundled** notes (no network).
4. **CSAT/NPS are tiny.** CSAT = one tap after a ticket resolves (😞 😐 😀), NPS = one 0–10 question
   in-app ≤ 1 per 90 days, dismiss is sticky, never on the first session, never during a fill.
5. **The store-review prompt (G10)** is a feedback surface too: after the 3rd successful fill not
   undone, once per 90 days, deep-links to the right store; owned here with the `ext` area.

## 1. Data (MySQL, additive)

```
feedback_event
  id BIGINT PK, user_id BIGINT NULL, anon_key CHAR(32) NULL      -- one of the two
  target_type VARCHAR(16) NOT NULL, target_id VARCHAR(120) NOT NULL
  vote TINYINT NOT NULL, reason VARCHAR(24) NULL, comment VARCHAR(500) NULL
  surface VARCHAR(12) NOT NULL (web|extension|help), plan VARCHAR(12) NULL, version VARCHAR(20) NULL
  created_at DATETIME, UNIQUE(user_id, target_type, target_id), UNIQUE(anon_key, target_type, target_id)
  INDEX(target_type, created_at)

feature_request
  id BIGINT PK, slug VARCHAR(80) UNIQUE, title VARCHAR(120), body VARCHAR(2000), author_user_id NULL
  status VARCHAR(16) NOT NULL DEFAULT 'CONSIDERING', votes INT NOT NULL DEFAULT 0
  merged_into_id BIGINT NULL, changelog_slug VARCHAR(120) NULL, ticket_id BIGINT NULL
  created_at, updated_at, INDEX(status, votes)

feature_vote   request_id FK, user_id FK, created_at, PRIMARY KEY(request_id, user_id)
user_seen      user_id PK, changelog_seen_at DATETIME, nps_asked_at DATETIME, review_prompted_at DATETIME
```

Reasons (per target): ai_* → `wrong_facts · tone · too_long · generic · other`; help_* → `wrong ·
outdated · unclear · wanted_human`; fill → `missed_fields · wrong_values · dropdowns · slow`.

## 2. API

| Method | Path | Auth | Notes |
|---|---|---|---|
| `POST` | `/api/feedback` | optional | `{targetType, targetId, vote, reason?, comment?, surface, version?}`; BFF 120/h/IP; upsert |
| `GET` | `/api/feedback/requests?status&sort=votes|new` | public | board (no author identity) |
| `POST` | `/api/feedback/requests` | user | create (+ IDEA ticket); BFF 5/day/user |
| `POST/DELETE` | `/api/feedback/requests/{id}/vote` | user | one vote |
| `PUT` | `/api/admin/feedback/requests/{id}` | ADMIN | status, merge, changelog link; audited `FEATURE_REQUEST_UPDATE` |
| `GET` | `/api/admin/feedback/summary?targetType&days` | ADMIN | up/down ratio, top reasons, by version/plan |
| `GET` | `/api/changelog/unseen` | user | count + entries since `changelog_seen_at`; `POST .../seen` |

AI-quality feedback is also readable by the admin AI cost view (A4) joined on `ai_call.id` =
`target_id` for `ai_*` targets, so "$ per 👍" exists per task.

## 3. Surfaces

- `ThumbsFeedback` (packages/ui): two 44 px buttons, optional reason chips on 👎, "Thanks" state,
  `aria-pressed`, works without JS state loss on re-render; theme tokens only.
- Extension: after an AI draft and after a fill (S4.3); bundled "What's new" card on version bump.
- Web: tailor/fit results, help articles/answers, `/feedback` board, `/changelog`, bell entry for
  "What's new" (1 per release, through the notification engine U7.1 when it exists, else a sheet).

## 4. Failure modes

| Failure | Behaviour |
|---|---|
| Vote spam on the board | one per account, account must be activated ≥ 24 h, admin can freeze a request |
| Anonymous 👍/👎 abuse | `anon_key` is a random cookie; BFF limits; aggregates only, never shown as counts publicly |
| Changelog claims a shipped request that isn't | the build script checks every `requests[]` id exists and flips status to SHIPPED only on deploy (admin confirms) |
| NPS fatigue | 90-day cool-down, sticky dismiss, never for demo accounts |

## 5. Privacy

Comments scrubbed; `feedback_event` is exported in the DSAR bundle and nulled on deletion; the
board shows no author names; votes are private. The store-review prompt never passes data to the
store; it's a link.

## 6. Cost

Zero AI. One more table scan per admin summary. Content: changelog entries are part of each
release PR (CLAUDE.md version-bump ritual gets one more line).

## 7. Tests

`FeedbackResourceIT` (upsert flip, anon vs user uniqueness, limits), `FeatureRequestResourceIT`
(vote once, merge keeps votes, status audit), `changelog` build test (front-matter, request ids),
ui `ThumbsFeedback` render/a11y test, extension `whats_new.test.js` (card once per version),
`review_prompt.test.js` (3rd fill, no undo, 90-day cool-down).

## 8. 390 px wireframes

```
┌──────────────────────────────┐  ┌──────────────────────────────┐  ┌──────────────────────────────┐
│ Feature requests   [+ Ask]   │  │ What's new            ✕      │  │ Did this help?               │
│ (Top)(New)(Planned)(Shipped) │  │ v0.66 · extension · today    │  │      👍          👎           │
│ ▲ 212  Dark mode in drawer   │  │ • Workday dropdowns fixed    │  │ ┌──────────────────────────┐ │
│        Planned · Q4          │  │   (you asked: #184)          │  │ │ What went wrong?         │ │
│ ▲ 97   Firefox support       │  │ • "This site didn't fill"    │  │ │ (Wrong facts)(Too long)  │ │
│        In progress           │  │   button in the drawer       │  │ │ (Generic)(Other)         │ │
│ ▲ 41   Indeed Apply          │  │ [Open changelog]             │  │ │ [Tell us more… optional] │ │
│        Considering           │  │                              │  │ └──────────────────────────┘ │
│ ✓ 156  Resume caps shown     │  │                              │  │ Thanks — this tunes drafts.  │
│        Shipped · v0.65       │  │                              │  │                              │
└──────────────────────────────┘  └──────────────────────────────┘  └──────────────────────────────┘
```

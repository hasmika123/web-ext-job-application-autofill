# Design — Share to Kiwiply and Send to laptop (area `mob`, epics N1, N2)

Status: decided 2026-10-11. The phone captures, the laptop fills. Builds on: `applications`
upsert via `ApplicationSyncResource` (exists), the extension's 15-minute sync alarm and
`GET /api/profile/version` (exist), the job store in `docs/design/user/job-search-matching.md`,
the notification engine in `alerts-notifications.md`, and U2.7's "send the install link to my
laptop" email. Locked constraints: no auto-submit; no scraping (we resolve **one URL the user
handed us**, via public ATS board APIs or the page's own OG/JSON-LD, never behind a login, never
LinkedIn/Indeed HTML); server is the truth, extension is a mirror.

## 0. Decisions

1. **Share sheet → `/share` → one Save sheet → done in two taps.** Android/Chromium: Web Share
   Target (`share_target` in the manifest, `GET`, installed PWA only). iOS: no API — **Paste a
   link** on the Saved tab (clipboard button, iOS shows its paste permission bubble) plus a
   downloadable **Shortcut** ("Save to Kiwiply") that appears in the iOS share sheet and opens
   `kiwiply.com/share?url=…`. A native Share Extension replaces both when N6 ships.
2. **Resolve the URL on the server, honestly.** `POST /api/jobs/resolve {url, title?, text?}`
   normalises the URL (strip trackers, canonical host), matches it to an existing `job_posting`
   row when the source is one we ingest, otherwise fetches the public page once (10 s, 1 MB,
   `text/html` only, no cookies) and reads JSON-LD `JobPosting` / OpenGraph. If the host is a
   login-walled aggregator (LinkedIn, Indeed, Glassdoor, ZipRecruiter) we **do not fetch** —
   we keep the title/company from the shared text and ask the user to confirm two fields.
3. **A share creates a `SAVED` application** with `source = PHONE_SHARE`, deduped on the
   normalised URL / `externalJobId`, undo for 8 s. Same table the drawer's Save-a-job writes.
4. **"Send to laptop" is a flag on the application, not a new object.** `handoff_state`
   (`NONE | QUEUED | OPENED | DONE | EXPIRED`) + timestamps. Queued rows surface in the
   extension drawer ("From your phone · 3"), on desktop web when the extension is present, in a
   once-a-day desktop notification, and in an optional evening email. **Nothing is submitted**;
   "Open & fill" opens the posting in a tab and the drawer fills it like any other page.
5. **The queue count rides on `GET /api/profile/version`** (`handoffQueued: 3`) so the extension
   learns about it on its existing alarm without a new poll; the web sends the existing
   `KIWIPLY_SYNC {event:"changed"}` signal after a queue action so an open laptop reacts at once.
6. **Offline capture never loses a job.** Share-target saves go into an IndexedDB outbox when the
   POST fails; replayed on next open or via Background Sync (Chromium). The outbox is the *only*
   queued write in the product (`pwa-push.md` §3 keeps every other offline write disabled).
7. **First install from the phone is a QR / one-time link**, not just an email: the phone shows a
   QR for `kiwiply.com/connect?k=<one-time>` that the laptop scans; `/connect` installs/connects
   the extension and lands on the queue. The U2.7 email stays as the fallback.

## 1. Data model (additive, Liquibase)

```
ALTER TABLE application
  ADD COLUMN source_detail VARCHAR(24) NULL,          -- PHONE_SHARE | PHONE_PASTE | IOS_SHORTCUT | SHELL_SHARE (source stays "web"/"extension")
  ADD COLUMN normalized_url VARCHAR(768) NULL,        -- for dedupe; index below
  ADD COLUMN handoff_state VARCHAR(10) NOT NULL DEFAULT 'NONE',  -- NONE|QUEUED|OPENED|DONE|EXPIRED
  ADD COLUMN handoff_queued_at TIMESTAMP NULL, ADD COLUMN handoff_opened_at TIMESTAMP NULL,
  ADD COLUMN handoff_opened_on VARCHAR(80) NULL,      -- "Chrome · MacBook" (extension UA summary)
  ADD COLUMN handoff_note VARCHAR(140) NULL;          -- "use the design resume" (optional, from the phone)
CREATE INDEX ix_application_handoff ON application (user_id, handoff_state, handoff_queued_at);
CREATE INDEX ix_application_norm_url ON application (user_id, normalized_url(191));

CREATE TABLE handoff_link (                            -- QR / one-time link (N2.5)
  id BIGINT PK, user_id FK, token_hash CHAR(64) UNIQUE, created_at, expires_at (10 min), used_at NULL, used_by_ua VARCHAR(200) NULL
);
```
`job_posting` is untouched; a resolved share that matches an ingested posting sets
`application.posting_id` (soft ref, exists in the tracker design).

## 2. API

```
POST /api/jobs/resolve {url, title?, text?}           → 200 ResolvedJob { normalizedUrl, host, ats: GREENHOUSE|LEVER|ASHBY|WORKABLE|SMARTRECRUITERS|WORKDAY|OTHER|WALLED,
                                                          postingId?, title?, company?, location?, remote?, salary?, confidence: HIGH|MEDIUM|LOW, needsConfirm: ["company"] , existingApplicationId? }
                                                        422 INVALID_URL · 429 (20/min/user) · never 5xx for a dead page (confidence LOW)
POST /api/applications {…, sourceDetail, normalizedUrl}  (exists; upsert dedupes on normalizedUrl|externalJobId — extend ApplicationSyncResource)
POST /api/applications/{id}/handoff/queue {note?}     → 200 {handoffState:"QUEUED"}   (idempotent)
POST /api/applications/{id}/handoff/unqueue           → 200
GET  /api/applications/handoff?state=QUEUED           → [{id, title, company, jobUrl, queuedAt, note, resumeHint}]  (extension + desktop web)
POST /api/applications/{id}/handoff/opened {ua}       → sets OPENED (extension, when "Open & fill" runs)
GET  /api/profile/version                              (exists) + handoffQueued:int
POST /api/handoff-links                                → {token, url, expiresAt}   (phone; 3/hour)
GET  /connect?k=<token>                                (web page; exchanges the token server-side: POST /api/handoff-links/{token}/use → session hint, then the normal /connect flow)
```
Resolver rules per ATS (all public, already used by ingest in `api/.../service/jobs/*`):
Greenhouse `boards-api.greenhouse.io/v1/boards/{board}/jobs/{id}`, Lever `api.lever.co/v0/postings/{company}/{id}`,
Ashby `api.ashbyhq.com/posting-api/job-board/{org}` (filter by id), Workable `apply.workable.com/api/v2/accounts/{sub}/jobs/{short}`,
SmartRecruiters `api.smartrecruiters.com/v1/companies/{c}/postings/{id}`. Workday has no public
posting API → OG/JSON-LD fetch of the posting page (public). Walled hosts → no fetch.
Submit-detect (`job-autofill/src/lib/app-tracking.js:102-109`) already transitions SAVED →
APPLIED on the same row; the hand-off flips to `DONE` when that happens.

## 3. Web flows

### 3.1 Android share sheet (N1.1)
`manifest.webmanifest`:
```json
"share_target": { "action": "/share", "method": "GET", "params": { "title": "title", "text": "text", "url": "url" } }
```
`web/src/app/share/page.tsx` (in the `(app)` group? **No** — it must survive a signed-out hit:
like `/connect`, it lives outside the group and bounces to `/login?next=/share?…` keeping the
params). On load: extract the URL (from `url`, else the first `https://` in `text` — LinkedIn's
app shares the link in `text`), call `resolve`, render the Save sheet, `POST /api/applications`,
toast "Saved · Undo", offer **Send to laptop** right there. Replace history so Back goes to Saved.

### 3.2 iOS (N1.4)
- Saved tab header: **[ Paste a link ]** → `navigator.clipboard.readText()` on tap (user gesture;
  iOS shows the paste bubble) → same sheet. If the clipboard has no URL: inline field.
- `/help/save-on-iphone`: install a **Shortcut** (`.shortcut` hosted in `web/public/shortcuts/`,
  signed with the user's own iCloud on import) that accepts URLs/text from the share sheet and
  opens `https://kiwiply.com/share?url=…&src=ios-shortcut`. One-time setup, then "Save to
  Kiwiply" sits in the iOS share sheet exactly like Android. Honest copy: "until Apple lets web
  apps join the share sheet".
- Foreground paste hint (optional, N1.4 AC): when the app regains focus and the clipboard
  contains a URL from a known job host, show a non-blocking chip "Save the link you copied?" —
  only on tap do we read the clipboard (no silent reads).

### 3.3 Send to laptop (N2.3)
Every job card / detail sheet / Saved row gets **Send to laptop** (icon: laptop with arrow).
Tap → `queue` → the row shows "Waiting on your laptop" → after the extension opens it,
"Opened on Chrome · MacBook at 10:42" → after submit-detect, "Applied ✓". Un-queue from the same
row. On a **desktop browser with the extension present** the same action reads "Open & fill
now" and opens the tab directly (no queue).

### 3.4 Extension (N2.2)
- Drawer home gets a **From your phone (3)** section (`job-autofill/entrypoints/panel/home-actions.ts`
  pattern): rows with title · company · note; **Open & fill** → `chrome.tabs.create({url})` +
  `handoff/opened`; the fill proceeds as on any page (never submits). Dismiss → `unqueue`.
- Count: `checkAndPull` (`src/lib/sync.js`) reads `handoffQueued` from `/api/profile/version`
  and sets the action badge (`chrome.action.setBadgeText`) — the badge is also how a laptop
  learns about a queue while the drawer is closed.
- Once per day, if `handoffQueued > 0` on the alarm: a browser notification "3 jobs from your
  phone are waiting — open Kiwiply to fill them" (desktop `chrome.notifications`, respects the
  user's quiet hours from preferences; off in Settings).

### 3.5 QR pairing from the phone (N2.5)
Dashboard checklist (U2.7) on a phone: "Install on your laptop" → sheet with **QR code**
(`qrcode` is tiny; render as SVG inline, no dependency if `packages/ui` already has an SVG QR
helper — add one there) + "Email me the link" (U2.7's endpoint) + "Copy link". The laptop opens
`/connect?k=…`: signed-in → straight to the extension install/connect; signed-out → `/login` with
the `k` preserved; the token is single-use, 10 min.

## 4. State machine

```
application.handoff_state
  NONE ──queue──▶ QUEUED ──extension opened──▶ OPENED ──submit-detect / user marks applied──▶ DONE
   ▲                │  ▲                          │
   └───unqueue──────┘  └──── re-queue ◀───────────┘   (user taps again after 24 h without a submit)
  QUEUED ──14 days──▶ EXPIRED  (nightly job; the row stays SAVED; nudge "Still want it?" via STALE_NUDGE, digest-only)
```
Transitions are idempotent; `OPENED` from a second device updates `handoff_opened_on`.

## 5. Notifications (through the engine, `alerts-notifications.md`)

| Kind | When | Channels (default) |
|---|---|---|
| `HANDOFF_WAITING` (new kind) | laptop-side only: extension alarm once/day while QUEUED > 0 | desktop browser notification (extension), not push |
| `HANDOFF_EVENING` (new kind) | at the user's digest time if QUEUED > 0 and nothing opened today | email digest section "Tonight: 3 jobs ready to fill on your laptop" — Pro/Free alike, digest-only |
| `HANDOFF_DONE` | submit-detect flips a queued row to DONE | in-app only (the phone sees "Applied ✓" on next open); push off |

No push to the phone for hand-off events — the phone is where the user *started*; pinging it
is noise (JobRight/Indeed complaint class).

## 6. Security and privacy

- `/share` accepts only `https:` URLs ≤ 2 KB; `title`/`text` ≤ 1 KB each, HTML-stripped; stored
  as entered only after the Save tap (nothing is saved on mere arrival at `/share`).
- The resolver is a **SSRF surface**: allow-list public hosts by scheme/port (443), resolve DNS
  and refuse private/link-local ranges, no redirects to non-https, 10 s / 1 MB caps, no cookies,
  fixed UA `KiwiplyResolver/1 (+https://kiwiply.com/bot)`. Walled hosts never fetched.
- Rate limits: resolve 20/min/user; handoff-links 3/hour; queue ops 60/min.
- One-time link tokens are 32 random bytes, stored hashed, single-use, 10 min; the `/connect`
  page never puts the token in a cookie or localStorage.
- Hand-off rows are the user's own applications — no new PII. DSAR export includes
  `handoff_state` with the application. Deleted with the account.
- Browser notifications on the laptop carry counts only ("3 jobs"), not company names.

## 7. Failure modes

| Failure | Behaviour |
|---|---|
| Share arrives signed-out | `/login?next=` round-trip keeps the params; on return the sheet opens |
| PWA not installed (share_target needs install) | Android shows no Kiwiply in the share sheet; the install card copy says why ("Install to share jobs here") |
| Resolver can't read the page | sheet with title from the shared text, `confidence LOW`, two editable fields; saved anyway |
| Duplicate (already saved/applied) | sheet says "Already in your tracker (Applied 3 Oct)" with "Open" instead of "Save" |
| Offline at Save | outbox row + toast "Saved — will sync when you're online"; replay on focus / Background Sync; conflicts resolved by the server upsert |
| Laptop never opens the queue | evening digest once; `EXPIRED` after 14 days; the job stays Saved |
| Extension not installed on the laptop | desktop web shows the queue with "Install the extension to fill these" (U20.3 install card) and a plain "Open posting" link |
| QR scanned by someone else's laptop | token exchange requires the *phone's* session to have minted it and lands on `/connect`, which still requires sign-in on the laptop — the token only pre-fills intent, never authenticates |

## 8. Cost

Resolver fetches are one HTTP call per share (≤ 1 MB); ATS API calls are the same endpoints
ingest already uses. No new services. Email volume: ≤ 1 digest section/day/user (existing digest).

## 9. Tests

- API: `JobResolveServiceTest` (normalisation table: UTM/`gh_src`/`lever-source` stripped, trailing
  slash, host casing), per-ATS parsers on recorded fixtures, walled-host no-fetch, SSRF
  refusals (private IP, redirect to http, oversized), rate limit; `ApplicationHandoffIT` (queue →
  opened → done; unqueue; expiry job; `handoffQueued` on `/api/profile/version`; idempotency);
  `HandoffLinkIT` (single use, expiry, wrong user).
- Web (Playwright, Pixel 7 project): `/share?url=…` signed-in → Save sheet → row in Saved;
  signed-out → login → sheet; duplicate path; offline → outbox → replay (route block/unblock);
  iOS project: Paste a link with a mocked clipboard.
- Extension (`npm test`): `checkAndPull` sets the badge from `handoffQueued`; "Open & fill" posts
  `opened`; notification once per day (fake clock); drawer section renders 0/1/3 items.
- Manual (N8.2): share from the LinkedIn and Indeed Android apps; the iOS Shortcut end to end.

## 10. Rollout

N1.2 resolver (API only, feature-flag `share.resolve`) → N1.1 `/share` + manifest (Android)
→ N1.3 save + dedupe + undo → N2.1 schema/API → N2.2 extension badge + drawer → N2.3 web
action + states → N1.4 iOS paste/Shortcut → N2.4 nudges → N1.5 outbox → N2.5 QR.

## 11. Wireframes (390 px)

```
/share (after resolve)                          Saved row states
┌──────────────────────────────────────┐        ┌──────────────────────────────────────┐
│ ✕                      Save a job    │        │ Product Designer · Figma             │
│ ┌──────────────────────────────────┐ │        │ Remote · saved from LinkedIn · 2h    │
│ │ ◉ Figma                          │ │        │ ⏳ Waiting on your laptop  [Un-queue]│
│ │ Product Designer, Growth         │ │        ├──────────────────────────────────────┤
│ │ San Francisco · Hybrid · $150k+  │ │        │ Data Analyst · Stripe                │
│ │ via Greenhouse · posted 3d ago   │ │        │ Opened on Chrome · MacBook · 10:42   │
│ └──────────────────────────────────┘ │        ├──────────────────────────────────────┤
│ Note for laptop-you (optional)       │        │ UX Intern · Notion                   │
│ [ use the design resume            ] │        │ Applied ✓ · 1 Oct                    │
│                                      │        └──────────────────────────────────────┘
│ [ 💾 Save ]  [ 💻 Save & send to laptop ]
│ Saved jobs sync to your laptop; the  │        Extension drawer home (desktop)
│ extension fills them — you submit.   │        ┌──────────────────────────────┐
└──────────────────────────────────────┘        │ From your phone (3)          │
                                                │ Product Designer · Figma     │
iOS · Saved tab header                          │ "use the design resume"      │
┌──────────────────────────────────────┐        │      [ Open & fill ] [ ✕ ]   │
│ Saved                 [ Paste a link ]│        │ Data Analyst · Stripe        │
│ On iPhone? Add "Save to Kiwiply" to  │        │      [ Open & fill ] [ ✕ ]   │
│ your share sheet → How              │        └──────────────────────────────┘
└──────────────────────────────────────┘

Install on your laptop (phone)
┌──────────────────────────────────────┐
│ Install Kiwiply on your laptop       │
│   ┌──────────┐  Scan with your       │
│   │ ▓▒▓▒▓▒▓▒ │  laptop's camera or   │
│   │ ▒▓ QR ▓▒ │  open the emailed link│
│   │ ▓▒▓▒▓▒▓▒ │  Expires in 10 min    │
│   └──────────┘                       │
│ [ Email me the link ]  [ Copy link ] │
└──────────────────────────────────────┘
```

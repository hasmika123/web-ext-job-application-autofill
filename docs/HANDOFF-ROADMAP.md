# HANDOFF-ROADMAP — product roadmap, resume-builder design, and where the app stands

Written 2026-10-11 at the end of a long session. Read after root `CLAUDE.md`. Companion docs:
`docs/HANDOFF-V2.md` (the `version2` app work), `docs/HANDOFF-RESUME-BUILDER.md` (resume builder),
`docs/roadmap/README.md` (how the roadmap generator works).

## 0. START HERE — the exact continuation point

**Branches (all pushed to origin, working tree clean at the time of writing):**

| Branch | Head | What it holds |
|---|---|---|
| `version2` | `2c5212b` | The built app: landing, auth, user app v3 (13 pages), org `/org` (10 pages, sample data), app admin `/admin` (12 pages), demo accounts, mobile polish. **Not promoted** to `develop`/`main`. |
| `resume-builder` | `a810371` | Branched from `version2`. Resume Builder design docs + stories + HTML pages (`docs/RESUME-BUILDER-*.md`, `docs/resume-builder/`). No product code yet. |
| `product-roadmap` | `9758a83` | Branched from `resume-builder`. The whole-product roadmap: three area plans, 27 design docs, the master roadmap HTML + generator. **Current branch.** |

Promotion (`develop` → `main` = production deploy) is the user's call only (root `CLAUDE.md` → Branching).

```bash
git checkout product-roadmap
npm ci                                  # at the ROOT (npm workspaces)
# view the roadmap page
npx --yes serve docs/roadmap -l 5056    # then open http://localhost:5056/master-roadmap.html
# run the app with demo accounts (mock API, no DB). 8080 may be taken on this machine, so:
MOCK_API_PORT=8081 npm run dev:demo -w web   # http://localhost:3000/login -> left "Demo accounts" tab
```

**The task in flight:** finish the roadmap by planning the **8 cross-cutting areas** below, then
regenerate the master roadmap page, then start building stories (first: Resume Builder R0.1).

### 0.1 Eight areas still to plan (nothing written yet)

The user chose all eight. Eight Fable designers were launched and **all failed on a usage-limit error
before writing any file** (nothing to salvage). The user then said **"stop using Fable — use Sonnet"**,
so relaunch them on **Sonnet** (`Agent` with `model: "sonnet"`, `subagent_type: "general-purpose"`,
background). A first relaunch attempt errored at the tool level (empty error, probably the same limit
window) — just retry later. The brief every designer follows is
`roadmap-brief.txt` in the session scratchpad; its content is reproduced in §3 so it survives.

| key | prefix | Area | Owns (in short) |
|---|---|---|---|
| `ext` | E | Browser extension & application tracking engine | `job-autofill/**`, ATS adapters + DOM-fixture harness, capture/submit detection (never auto-submit), store policies, Firefox/Edge, telemetry |
| `mkt` | M | Marketing site & growth | `(marketing)` pages, SEO, honest-claims register, referral/creator/campus programs, funnels, `/help` (missing) |
| `plat` | P | Platform, DevOps & reliability | deploy/CI, environments (no staging), **backups never ran**, monitoring, hardening, `FileStorage` seam (local now, S3 later), capacity |
| `ai` | I | AI platform | model routing, prompt registry + evals, guardrails, embeddings, fairness/explainability, shared metering/budgets |
| `mob` | N | Mobile app & PWA | PWA + native decision, share-target / send-to-laptop, offline/push, store payment rules |
| `pay` | B | Payments, plans & billing engine | catalog + entitlements + margin guard, tax, regional pricing, discounts, dunning/cancel |
| `trust` | T | Trust, legal & compliance | privacy ops, **minors/age rules**, AI-in-hiring law, accessibility, security program, lawyer-review list |
| `sup` | S | Support, help & community | help center, in-app/AI support, **job-scam safety centre**, feedback, community |

Each designer writes **only its own files**: `docs/roadmap/AUDIT-<key>.md`, `PLAN-<key>.md`,
`docs/roadmap/areas/<key>.json` (schema in §3, set `"kind":"cross-cutting"`), `docs/design/<key>/*.md`.
Existing stories they overlap are referenced via the optional `relates` / `supersedes` fields (no edits to
other areas' files; reconciliation is a later pass).

**After the 8 land — generator update (small Sonnet task):** `docs/roadmap/build-master-roadmap.mjs` has a
hard-coded `AREAS` list of four (`user`, `org`, `admin`, `resume`). Add the eight, group the home page
into **Dashboards / Cross-cutting / Resume Builder**, add an **"All epics" flat view** (61 epics today →
more after), then `node docs/roadmap/build-master-roadmap.mjs` and commit `master-roadmap.html`.

## 1. What exists on the roadmap today

`node docs/roadmap/build-master-roadmap.mjs --list`:

| Area | Epics | Stories | Done | Partial | Not started | Progress |
|---|---|---|---|---|---|---|
| User dashboard (U) | 21 | 110 | 9 | 20 | 81 | 18% |
| Organization dashboard (O) | 15 | 113 | 1 | 14 | 98 | 8% |
| App admin dashboard (A) | 17 | 94 | 7 | 7 | 80 | 10% |
| Resume Builder (R) | 8 | 45 | 0 | 0 | 45 | 0% |
| **Total** | **61** | **362** | | | | **10%** |

Progress rule (shown on the page): points S=1/M=2/L=3; Done 100%, In review 75%, Partial 50%,
In progress 25%, Not started/Blocked 0. Update a status: `node docs/roadmap/build-master-roadmap.mjs --set U1.2=done`
(edits the right JSON, regenerates the HTML; commit both). Resume Builder keeps its own
`docs/resume-builder/stories.json`/`build-roadmap.mjs`; the master generator reads that file.

Plans: `docs/roadmap/PLAN-{user,org,admin}.md` (narrative, build order, risks, open questions),
audits `docs/roadmap/AUDIT-*.md`, design docs `docs/design/{user,org,admin}/*.md` (25 critical-area docs),
Resume Builder: `docs/RESUME-BUILDER-{DESIGN,STORIES,DECISIONS}.md`.

## 2. Decisions recorded this session

- **Resume Builder defaults accepted** ("go with the recommendations"): Chromium sidecar for PDF; all
  builder AI Pro/Autopilot-only; 3 launch templates (Modern, Classic, Compact); share links out of v1.
  Recorded in `docs/RESUME-BUILDER-DECISIONS.md`.
- **Storage: local first.** All file bytes go through one `FileStorage` seam with a local-filesystem
  driver; S3 is wired later by config only. R0.6 must not call S3 directly.
- **Demo accounts are controlled by server config only** — `DEMO_ENABLED` (default false) + API restart;
  no admin switch, no SQL flip; "Reset demo data" stays in admin. The *App admin* demo account exists only
  in the local mock (`web/scripts/mock-api.mjs`), never in production.
- **Model policy:** the user said **stop using Fable; use Sonnet** for design and implementation.
  (Earlier rule "Fable designs, Sonnet builds" is superseded.)
- **Audience lens (every page/story):** Gen Z and Gen Alpha first, millennials second — mobile-first,
  short flows, conversational AI, instant feedback, honest privacy, dark mode, accessibility.
- Branch policy for this feature work: `resume-builder` then `product-roadmap` stacked on `version2`
  until the user promotes (user request); normal rule is branch off `develop`.

## 3. The designer brief (reproduce for the 8 relaunches)

Each Sonnet designer must: (1) **audit** its area (route/feature, state real|partial|missing, evidence
paths, gaps) → `AUDIT-<key>.md`; (2) plan **epics + stories** (small enough for one Sonnet session,
vertical slices, owners API/web/ui/extension, deps by ID, size S/M/L, testable AC, tests, tech notes
citing real files; status from the audit: `done` = real data + API + tests, `partial` = UI on
sample data, `not_started`); (3) identify **critical areas** and design each in depth in
`docs/design/<key>/<topic>.md` (decisions, MySQL tables, API shapes, state machines, failure modes,
security/privacy, cost, tests, rollout, 390px ASCII wireframes); (4) write
`docs/roadmap/areas/<key>.json`:

```json
{ "area":"ext", "name":"…", "prefix":"E", "kind":"cross-cutting", "updated":"2026-10-11",
  "epics":[{"id":"E1","name":"…","goal":"…","priority":"P0|P1|P2"}],
  "stories":[{"id":"E1.1","epic":"E1","title":"…","status":"done|partial|in_progress|in_review|blocked|not_started",
    "size":"S|M|L","owners":["API","web","ui","extension"],"deps":["U6.1"],"relates":[],"supersedes":[],
    "story":"As a … I want … so that …","genz":"how it serves Gen Z/Alpha/millennials",
    "ac":["…"],"tests":["…"],"tech":"…","evidence":["…"],"design":"docs/design/ext/…md|null","critical":true}] }
```

(5) `PLAN-<key>.md`: narrative, recommended build order (first 10), an area-specific "Experience
principles for Gen Z/Alpha/millennials" paragraph, 3–6 open questions. Commit prefix `roadmap:`,
`git pull --rebase --autostash origin product-roadmap`, `git push origin product-roadmap`; touch only
files named after the area.

Area scope notes (for the prompts): see the table in §0.1; extra detail — `ext`: capture real ATS DOM
before writing selectors, never auto-submit, no CAPTCHA bypass; `plat`: shared edge Caddy must never be
run by us, `.env` lives in a password manager, GitHub secrets are write-only; `pay`: Free/Pro/Autopilot
pricing and the ≥80% (subs) / ≥20% (services) margin floors, no refunds/no trial/no annual, reconcile with
`docs/design/org/billing.md` and `docs/design/admin/catalog-margin-entitlements.md`; `trust`: minors
(COPPA/GDPR-K, 16+ rule from the org design), EU AI Act/NYC LL144 for resume scoring, list which
documents need a lawyer; `ai`: reconcile `docs/design/user/ai-assistant.md` and admin AI cost governance;
`mob`: reconcile `docs/design/user/pwa-push.md` and U0/U17.

## 4. Open questions waiting on the user (from the three finished plans)

User (`PLAN-user.md` §open): which licensed job aggregator (Adzuna / Jooble / Careerjet); OK to add
Yubico `webauthn-server-core` + `web-push` to the API; Free alert cap (2 + push + weekly digest);
Apple sign-in now vs later and confirm dropping LinkedIn; referral reward (1 Pro month both sides) vs the
80% floor; push lock-screen text specific vs generic.
Org (`PLAN-org.md` §6): FULL data grants to a non-marketer coach in schools (default no); hard 16+ rule
for school/bootcamp orgs (default yes); confirm Consultancy Ops 23.0 points ($99 + $4/consultant,
7-year retention); rename "Consultancy plan" to generic Organizations; shared jobs for schools in
Phase 21; confirm admin owns Phase 18.1–18.5.
Admin (`PLAN-admin.md`): mandatory TOTP for staff + separate break-glass login; real platform AI caps and
whether a breach pauses everyone or only paid users; who verifies emailed privacy requests and the
30/45-day policy; transactional email tracking off?; publish the subprocessor page before DPAs are
signed?; capture country/UTM at signup or keep those charts decorative.
Resume Builder: all four open questions answered (see §2).

## 5. Findings worth acting on (from the audits — not re-verified by hand)

- **No organization model exists** anywhere in the API; `(org)/layout.tsx` admits any signed-in user; the
  org marketing/settings pages claim ATS sync, SSO, approval rules, 2FA/AES-256 that locked decisions
  exclude. Org model (`docs/design/org/tenant-model.md`) is the foundation for O/A stories.
- **Backups never ran; no restore drill; no uptime monitoring** (DEPLOY.md §5; admin A10.1 is build-order #1).
- **Admin security gaps** (A0.2): Google sign-in bypasses admin MFA; `/api/refresh` keeps stale
  authorities so a revoked admin survives up to 90 days; API rate limiter off by default and keyed on a
  spoofable header; some `UserResource` mutations unaudited; `/management/info` leaks git/env; subscriber
  CSV export unaudited; `ai_quota_override` survives account deletion.
- The org designer found the planned AI Interview price ($9.99) fails the 80% floor under naive Stripe fee
  math — the org billing design allocates fees per invoice.
- Every chart/trend/delta on the admin boards is SAMPLE; user Job Search/Alerts/Assistant/Messages/
  Interview Prep/Explore are sample/client-only; real accounts can see sample rows until U0.5.

## 6. App state and known leftovers (details in `docs/HANDOFF-V2.md`)

- `npm test -w web` (tsc + eslint) and `npm run build -w web` pass on `version2`. Extension `npm test`
  passes (the one date-locale test `sync_signal` was fixed to accept "October 1" and "1 October").
- Never verified: keyboard/screen-reader use, dark mode, real (non-mock) API paths (billing, inbox, 402),
  pixel fidelity to the boards, touch interactions, 1024px beyond overflow checks, `/admin/users/[login]`
  at phone size, a real contact-form send in the browser (mock accepts `POST /api/inquiries` now).
- Contact page: phone layout follows the mobile board; the board's bird mascot art doesn't exist, the
  existing envelope mascot is used. The user reported not seeing the phone change — it renders on
  `localhost:3000`; likely a stale view/other server. Unresolved.
- Bug-report button is draggable and can float over content on phones.
- Placeholder testimonials, `/` vs `/v3` home, Jordan Lee vs Priya Sharma demo seed name: still the
  user's decisions.
- Board images are committed under `design/{app-v3,admin-v3,contact-v3}/`.

## 7. Local environment notes

- Ports on this machine: `8080` is held by an unrelated `node mock.js apps`; the demo mock uses `8081`.
- A static viewer may still be running: `serve docs/roadmap -l 5056` (and earlier `5055`); stop with
  Task Manager / `taskkill` if needed. The Next dev server is on `3000`.
- `.claude/launch.json` is gitignored; example in `docs/claude-launch.example.json`.
- Subagent etiquette: agents use their **own** browser tab, reset the viewport, close the tab; never
  `git add -A`; one agent per file set; worktree agents push their own branch and the coordinator merges.
- CRLF warnings on commit are harmless (Windows autocrlf).

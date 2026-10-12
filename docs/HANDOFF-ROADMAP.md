# HANDOFF-ROADMAP — product roadmap, resume-builder design, and where the app stands

Written 2026-10-11 at the end of a long session. Read after root `CLAUDE.md`. Companion docs:
`docs/HANDOFF-V2.md` (the `version2` app work), `docs/HANDOFF-RESUME-BUILDER.md` (resume builder),
`docs/roadmap/README.md` (how the roadmap generator works).

## 0. START HERE — the exact continuation point (updated 2026-10-11, end of session 2)

**Everything is LOCAL ONLY — do not push until the user says so.** Two local branches carry the work:

- **`version2`** — app v3 + the **whole-product roadmap, now complete**: 12 areas, 144 epics, **893 stories**,
  0 dangling refs (`node docs/roadmap/build-master-roadmap.mjs --list`). Since session 1 it gained: the
  competitive landscape (`docs/roadmap/COMPETITIVE-{LANDSCAPE,GAPS}.md`, 22 competitors, 44 gaps), the eight
  cross-cutting areas (ext, mkt, plat, ai, mob, pay, trust, sup — `AUDIT-/PLAN-<key>.md`, `areas/<key>.json`,
  `docs/design/<key>/`), the generator for all 12 areas (grouped home, all-epics view, benchmark + relates),
  **`docs/roadmap/RECONCILIATION.md`** (gap coverage, 47 dedupes, "Already built" per area, never-collected
  rule, admin-configured sweep, **whole-product build order first 25**, **65 consolidated user decisions**),
  and the timesheets 23.0 spec (`docs/design/org/timesheets.md`, `PROPOSAL-timesheets.md` APPLIED).
- **`resume-builder`** — the **Resume Builder walking skeleton is DONE** (rb0.1–rb0.7 + p5.1 FileStorage seam),
  14/14 end-to-end smoke against real Spring + MySQL + Chromium sidecar. Next story **R1.1** — see
  `docs/HANDOFF-RESUME-BUILDER.md` START HERE (incl. its **promotion checklist**: storage driver must stay
  `s3` in prod until P5.4, `uploads` volume backup, chromium sidecar, React 19.2.4 vs 19.2.7, stale openapi.json).
  It branches from `version2`@`f679549`; merge `version2` into it (docs only, no conflicts expected) before a PR.

**User decisions recorded 2026-10-11 (also in root `CLAUDE.md` + memory):**
- **Model policy:** Fable for design/epics/stories/roadmap analysis + competitor benchmarks; Sonnet builds.
  (Supersedes session 1's "stop using Fable".)
- **We never collect sensitive PII** — no SSN/ITIN, bank/routing, tax IDs, passport/visa/document numbers, DOB;
  not asked, accepted, extracted, learned, sent to AI or stored. Stripe holds cards; Stripe tax-ID collection off.
- **Everything is admin-configured** — every feature switch, price, limit and default comes from the app admin
  settings (catalog + settings registry A5.1 + flags A5.3 + feature registry A5.7); stories name a setting key +
  default instead of a constant. A5 is now P0 and in the build order's top 10.
- **Timesheets (Consultancy Ops, O11):** org add-on only · priced later in admin · OCR optional, off by default ·
  **O11 stays P2**. Other 23.0 defaults applied, user may override.

**Next, in order (ask the user which):** (1) answer the top decisions in `RECONCILIATION.md` — esp. **the 80 %
margin floor fails at current Stripe fees** (Pro $19.99 = 79.9 % worst case; ~76 % with Managed Payments), Gemini
free-tier/no-training, GA4 in the extension vs CWS Limited Use, 16+ vs 18+; (2) continue Resume Builder at R1.1;
(3) start the whole-product build order (P0.1 backups go-live needs a `develop`→`main` promotion — user only).

```bash
git checkout version2 && npm ci        # ROOT (npm workspaces)
node docs/roadmap/build-master-roadmap.mjs --list
npx --yes serve docs/roadmap -l 5056   # http://localhost:5056/master-roadmap.html
MOCK_API_PORT=8081 npm run dev:demo -w web   # 8080 is taken on this machine
```

> Session 1 notes on the eight-area relaunch and the generator update are done and removed; §3 keeps the designer brief.

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
`git pull --rebase --autostash origin version2` (do NOT push; user wants these local), local commit only (no push); touch only
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

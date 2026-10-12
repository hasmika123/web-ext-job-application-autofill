# HANDOFF — Resume Builder + Common Profile (branch `resume-builder`)

## START HERE

**Branch:** `resume-builder`, cut from `version2` (which is 75+ commits ahead of `main`; nothing
promoted). Stay on this branch; PR into `develop` only when the user asks.
**Last commit:** `rb2.0: settings seam + builder config endpoint` (2026-10-12) — **R2.0 is built** (`ResumeBuilderSettingKeys`/`ResumeBuilderSettings`/`ResumeEntitlements`, `GET /api/profile/resume-builder/config`, `web/src/lib/resume-builder-config.ts`, the no-literal ESLint rule; next in the build order: R2.7). Before it: `design: Resume Builder v2 — full build-ready design to the v3 boards (schema v2, scoring, job match, AI, templates)` (2026-10-12) — **DESIGN v2 is written; R2.1 onward is not built yet.** Before it: `rb0.7: walking-skeleton smoke against the real API + handoff refresh` (2026-10-11) — **R0 (the walking skeleton) is complete** (DB → API → editor → template → PDF, proven 14/14 against real Spring + MySQL + the Chromium sidecar by `web/scripts/rb-smoke.mjs`).
**Also built (parallel):** `rb2.9: SideSheet primitive (left/right slide-in, push/overlay/fullscreen) + editor UI state (ui.ts)` (2026-10-12; UI primitive + state only, nothing wired into a page until R2.10). Before it: `design: Resume Builder v2 — full build-ready design to the v3 boards (schema v2, scoring, job match, AI, templates)` (2026-10-12) — **DESIGN v2 is written; nothing from R2 on is built yet.** Before it: `rb0.7: walking-skeleton smoke against the real API + handoff refresh` (2026-10-11) — **R0 (the walking skeleton) is complete** (DB → API → editor → template → PDF, proven 14/14 against real Spring + MySQL + the Chromium sidecar by `web/scripts/rb-smoke.mjs`).
**State:** R0 done as built (schema v1 tables, `ResumeDocument` v1 contract, doc endpoints with ETag/If-Match, `@kiwiply/ui` resume package + Modern template, editor skeleton with autosave, PDF via the sidecar through `FileStorage`). **Design v2** (2026-10-12) re-plans everything after R0 to the user's v3 boards (`design/resume-builder-v3/*.webp` — layout only; templates come later) and the 2026-10-12 requirements (template capability model, dynamic left side-nav, right side-nav with Print layout / PDF view, save pipeline with async PDF, resume metadata + access control, start chooser, Save / Save & Download, the resume header bar, the My Resumes and org Resumes & Profiles pages). Four documents define the work:

1. `docs/RESUME-BUILDER-DESIGN.md` **v2** — the build-ready design (read §0 first, then the sections your story cites; §21 lists the platform seams).
2. `docs/RESUME-BUILDER-STORIES.md` **v2** + `docs/resume-builder/stories.json` — 68 implementation-spec stories (R0 done, R1 kept, R2–R8 new), with the **build order** at the top. `stories.json` is the status source of truth (`node docs/resume-builder/build-roadmap.mjs --set R2.0=done`).
3. `docs/RESUME-BUILDER-DECISIONS.md` **v2** — the board-vs-v1 conflicts and defaults; rows marked **"needs user OK"** and the dependency approvals in §C are **awaiting the user** (see below).
4. `docs/HANDOFF-RESUME-BUILDER.md` — this file.

**The rule for every implementing agent: Sonnet implements exactly what DESIGN v2 + the story say. If something is unspecified, ambiguous or contradicts the code you find — stop and ask; do not improvise.** Never add a dependency the story does not name (DECISIONS v2 §C lists the ones needing approval).

**Decisions — ALL ACCEPTED by the user 2026-10-12** ("Accept all defaults"; deps `docx` + `@axe-core/playwright` approved; new #28 rail-collapse rule for R2.10). Formerly awaiting (DECISIONS v2): #1 inline marks model (R2.7/R2.11) · #2 capability model (R2.8) · #3 theme presets (R2.8) · #4 photo now (R7.4) · #5 pinned header row in Swap (R2.2) · #6 Interests/Custom (R2.12) · #7 TS score engine (R2.5) · #8 AI Suggestions auto-refresh off (R4.6) · #9 Job Match + tailored copies (R5.x) · #10 section/item controls (R2.1) · #11 document canvas instead of a preview pane (R2.1) · #12 **`docx` dependency** (R7.3) · #15 `resume.label` is the name's truth (R3.9) · #17 Save button on the top bar (R3.3) · #18 no template step in the chooser (R2.6) · #20 "Shared with Recruiters" = links (R3.11) · #21 Master/Tailored semantics (R3.9) · #22 web-hosted PDF worker (R3.7) · #25 org page scope — anything employer-ATS-like is a user decision (R8) · #27 lifecycle (R2.6); dev dep `@axe-core/playwright` (R6.5). Defaults apply until answered; a story whose decision is vetoed is re-scoped by the orchestrator, not by the implementer.
**First commands**
```bash
git checkout resume-builder
npm ci                               # repo ROOT (npm workspaces)
npm test -w web                      # tsc + eslint, green
cd api && ./gradlew test             # unit; `./gradlew integrationTest` needs Docker (Windows + Docker 29: `DOCKER_API_VERSION=1.44` alone was not enough on 2026-10-11; also set `JAVA_TOOL_OPTIONS=-Dapi.version=1.44`; JDK 17 is at `C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot`)
```

**First story (done as rb2.0):** **R2.0 Settings seam + builder config endpoint** (`docs/RESUME-BUILDER-STORIES.md` R2.0: `ResumeBuilderSettingKeys` + `ResumeBuilderSettings` over `app_setting`, `GET /api/profile/resume-builder/config`, `web/src/lib/resume-builder-config.ts`, the no-literal ESLint rule; DESIGN §9.1 + §15; Owner API + web, size M; tests `ResumeBuilderSettingsTest`, `ResumeBuilderSettingKeysParityTest`, `ResumeBuilderConfigResourceIT`, `resume-builder-config.test.ts`). Then follow the **build order** at the top of STORIES v2: R2.7 → R2.8 → R2.9 → R2.10 → R2.1 → R2.11 → R2.12 → R2.2 → R2.4 → R2.5 → R2.6 (end of R2 = the board's editor + My Resumes page, click-through). **In parallel on a second agent:** R1.1 (profile items API + the shared `SensitivePatterns` library) → R1.2 … R1.6. Cross-area prerequisites per story are in its "Cross-area prerequisites" note (DESIGN §21 explains which seams the R story builds itself when the platform story is not there yet). To try the editor without the API: `MOCK_API_PORT=<free port> npm run dev:demo -w web` (the mock serves the R0 doc endpoints in memory; extend it per story). Commit prefix `rb<epic>.<n>:`.

**Run the walking-skeleton smoke locally** (`web/scripts/rb-smoke.mjs`, dev only; needs Docker + JDK 17; pick free ports, 8080/8081 are often taken):
```bash
# 1. MySQL (same version as prod) + the pinned Chromium sidecar (published to localhost for this test only)
docker run --rm -d --name rb-smoke-mysql -e MYSQL_ROOT_PASSWORD=smoketest -e MYSQL_DATABASE=dossierApi -p 127.0.0.1:33411:3306 mysql:9.2.0 mysqld --lower_case_table_names=1 --skip-mysqlx --character_set_server=utf8mb4 --explicit_defaults_for_timestamp
docker run -d --name rb-smoke-chromium --init --shm-size=512m -p 127.0.0.1:13222:3000 ghcr.io/browserless/chromium:v2.57.0@sha256:6bac628b3d8293f8fb251d3a6b63030dfc5a1cb0c7e5c39abe5efd8f4b25360b   # keep in step with docker-compose.prod.yml
# 2. Spring API (dev profile, local storage driver in a temp dir, demo on)
export JAVA_HOME="/c/Program Files/Microsoft/jdk-17.0.19.10-hotspot"
cd api && SPRING_DATASOURCE_URL='jdbc:mysql://127.0.0.1:33411/dossierApi?useSSL=false&allowPublicKeyRetrieval=true&createDatabaseIfNotExist=true' SPRING_DATASOURCE_PASSWORD=smoketest SERVER_PORT=18081 DEMO_ENABLED=true DOSSIER_STORAGE_LOCAL_ROOT=<tmp dir> ./gradlew bootRun
# 3. web (separate shell)
cd web && DOSSIER_API_URL=http://127.0.0.1:18081 PDF_BROWSER_URL=ws://127.0.0.1:13222 npx next dev -p 13111
# 4. the smoke (separate shell; exit 0 only if every row passes)
cd web && RB_API=http://127.0.0.1:18081 RB_WEB=http://127.0.0.1:13111 RB_STORAGE_ROOT=<same tmp dir> RB_MYSQL_CONTAINER=rb-smoke-mysql RB_MYSQL_PASSWORD=smoketest node scripts/rb-smoke.mjs
# 5. tear down: stop bootRun + next dev, then: docker rm -f rb-smoke-mysql rb-smoke-chromium
```
Notes: the demo accounts are read-only (`DemoGuard`), so the smoke registers + activates a throwaway local account via the API (activation key read from the MySQL container because no mail server runs locally) and keeps its credentials only in the gitignored `web/.env.rb-smoke`; later runs reuse it (delete the file to mint a new one after wiping the DB). The script refuses `NODE_ENV=production` and non-local hosts. With `PDF_BROWSER_URL` unset the web launches a local Edge/Chrome instead of the sidecar. Only Modern is registered in the web, so the template step is modern -> modern.

One story = one commit = one push. After each story: tick it in `PROGRESS.md` → *Resume Builder*
section, move **Current focus**, add a Log line, and update the "Last commit" line above.

**How the user wants it built** (from `docs/HANDOFF-V2.md` §1): the orchestrating model designs and
reviews; **Sonnet agents implement**, one story each, strict file ownership, never `git add -A`
while others work. Agents open their own browser tab for checks and reset it.

## ⚠️ Before this branch is ever promoted to `main` (production)
- **Storage driver (P5.1):** prod's resumes uploaded since the 2026-09-17 rebuild live in **S3**. The
  new default `DOSSIER_STORAGE_DRIVER=local` would make every one of them 404. Before the deploy,
  either set `DOSSIER_STORAGE_DRIVER=s3` in the box's `.env` (keeps serving them; S3_* values
  unchanged) or run the S3→local copy (plat P5.4) first. Also add the new `uploads` volume to the
  nightly backup — it is not in the MySQL dump — and never `docker compose down -v`.
- **PDF sidecar (R0.6):** the new `chromium` service (`docker-compose.prod.yml`, pinned image+digest, internal network only) starts with the stack, needs ~1 GB of the shared box's memory, and must be health-checked per DEPLOY.md §14 after the deploy. `web/next.config.ts` carries `outputFileTracingIncludes` for the export route (resume.css, fonts, react/react-dom: pdf.ts loads react-dom/server by name because Next refuses to bundle it) — verify a production build (`npm run build -w web`, then run `.next/standalone/web/server.js`) still exports after any Next upgrade.
- **Two Reacts:** `web` pins react 19.2.4 while the hoisted root copy (what `@kiwiply/ui` resolves) is
  19.2.7; `web/vitest.config.ts` aliases around it. Align the versions before promotion.
- `api/openapi.json` is stale (~8k lines of drift); regenerate it in its own commit.

## Key facts an implementer must not rediscover
- The extension reads `bio.payload` (flat keys) and `resume.parsedJson` (`StructuredResume`) via
  `job-autofill/src/lib/tracking.js`; `ProfileVersion` hashes them. The builder **must keep
  `parsed_json` as a projection of `doc_json`** on every save (DESIGN §4, §5.11). No extension
  release is needed for R0–R4.
- Reuse, don't rebuild: `ProfileService.createResume` (plan cap), `ResumeTailorService` (truth
  checks → extract to `AiTruthChecks`), `AiBudgetService.decide` + `AiMeteringService.record`
  (every AI call), `AtsChecks` (lint rules), `POST /api/resumes/{id}/file` (PDF storage),
  `parseResumeWithAi` + `parser-core` (onboarding import), `HeroBand`/`UnderlineTabs`/`SectionCard`/
  `SidePanel` (v3 shell), `web/src/lib/rate-limit.ts`, `web/src/lib/analytics.ts`.
- Templates live in `packages/ui/src/resume/` and use **only** `.rz-*` classes from
  `styles/resume.css` + theme CSS variables — no Tailwind, no hooks — so preview and PDF render the
  same string.
- New deps are listed in DECISIONS v2 §C (dnd-kit pre-approved; docx and @axe-core/playwright need approval); add nothing else without asking.
- Open questions for the user are DESIGN §11 (PDF engine placement, Free AI taste, 3 vs 5
  templates, share links). Defaults apply until answered.

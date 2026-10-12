# HANDOFF — Resume Builder + Common Profile (branch `resume-builder`)

## START HERE

**Branch:** `resume-builder`, cut from `version2` (which is 75+ commits ahead of `main`; nothing
promoted). Stay on this branch; PR into `develop` only when the user asks.
**Last commit:** `rb0.7: walking-skeleton smoke against the real API + handoff refresh` (2026-10-11) — **the walking skeleton is complete** (DB -> API -> editor -> template -> PDF, proven 14/14 against real Spring + MySQL + the Chromium sidecar by `web/scripts/rb-smoke.mjs`; no skeleton bug found). Before it: `rb0.6: PDF export via Chromium sidecar, stored through FileStorage` (2026-10-11) — R0.6 done: `chromium` Compose sidecar (internal only), `web/src/lib/pdf.ts` (`renderResumeHtml`, `printPdf`, `exportResumePdf` with the fit ladder, queue/timeout config `resume.pdf.*` via `RESUME_PDF_*` env), BFF `POST /api/resumes/[id]/export`, API `POST /api/profile/resumes/{id}/export-recorded`, Export PDF in the editor top bar, "PDF out of date" on the list (`ResumeDTO.contentHash/exportedHash/exportedAt`). Local dev: with `PDF_BROWSER_URL` unset it launches installed Edge/Chrome; the real-browser smoke is `PDF_SMOKE=1 npm run test:unit -w web -- pdf.browser`. Before it: `p5.1: FileStorage seam with local driver; S3 behind it by config` (2026-10-11) — platform prerequisite for R0.6, done: all file bytes go through `com.dossier.api.service.storage.FileStorage` (`dossier.storage.driver=local|s3`, default `local`; root `dossier.storage.local.root` = `/srv/uploads` in prod, `~/.dossier/uploads` in dev). **R0.6 must store the PDF through `FileStorage`, via the existing `POST /api/resumes/{id}/file` path (`ResumeFileResource`), never the AWS SDK** (ArchUnit forbids the SDK outside `service.storage.s3`). Before it: `rb0.5: resume editor skeleton — live preview, autosave with ETag, conflict dialog` (2026-10-11) — R0.5 done: BFF routes (`/api/resumes/built`, `/[id]/doc`, `/[id]/doc/template`), `/resume-builder/[id]` editor (`web/src/components/app-v3/resume-builder/`: `ResumeEditor`, `SectionEditor`, `PreviewPane`, `ConflictDialog`, `state/{reducer,history,autosave}.ts`), `PageFrame` + `UndoIcon`/`RedoIcon` in `@kiwiply/ui`, the list page's working "New resume", vitest in `web` (`npm run test:unit -w web`, wired into `npm test -w web`), doc endpoints in `web/scripts/mock-api.mjs`. Before it, `rb0.3: resume doc endpoints with ETag/If-Match` (2026-10-11) — R0.3 done: `ResumeDocResource`/`ResumeDocService` (create from profile, GET with ETag, PUT with If-Match -> 428/409/413/422, template PATCH, `/doc/text`), `ResumeDocumentSeeder`, `ResumeDocException` -> `ExceptionTranslator`, `ResumeDocResourceIT`. Also done: `rb0.4` (`@kiwiply/ui` resume package, Modern template, TS projection, vitest). Before them: `rb0.2` (validator/hash/projections), `rb0.1` (the four tables, entities, repositories).
**State:** R0 is DONE. Design, the R0.1 schema, the R0.2 document contract, the R0.3 doc endpoints, the R0.4 `@kiwiply/ui` resume package and the R0.5 editor skeleton (summary + experience editing, live preview, autosave). Three documents define the work:

1. `docs/RESUME-BUILDER-DESIGN.md` — the design (read §0 first, then the section your story cites).
2. `docs/RESUME-BUILDER-STORIES.md` — the ordered backlog (45 stories, R0–R7).
3. `docs/RESUME-BUILDER-DECISIONS.md` — one page of vetoable defaults; check the user has not
   overridden any before starting an epic.

**First commands**
```bash
git checkout resume-builder
npm ci                               # repo ROOT (npm workspaces)
npm test -w web                      # tsc + eslint, green
cd api && ./gradlew test             # unit; `./gradlew integrationTest` needs Docker (Windows + Docker 29: `DOCKER_API_VERSION=1.44` alone was not enough on 2026-10-11; also set `JAVA_TOOL_OPTIONS=-Dapi.version=1.44`; JDK 17 is at `C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot`)
```

**First story:** **R1.1 Profile items API** (`docs/RESUME-BUILDER-STORIES.md` R1.1: `ProfileItemResource` `/api/profile/items` GET/POST/PUT/DELETE + `/reorder` + `/import`, `GET /api/profile/completeness`, `ProfileItemService.ensureSeeded`, DESIGN §6.1 + §2.4; Owner API, size L; tests `ProfileItemResourceIT` + `CompletenessTest`). It builds on the R0.1 `profile_item` table/entity/repository. To try the editor without the API: `MOCK_API_PORT=<free port> npm run dev:demo -w web` (the mock serves the doc endpoints in memory; `curl -X POST localhost:<port>/mock/resumes/<id>/edit-elsewhere` forces a 409). Commit prefix `rb<epic>.<n>:`.

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
- New deps are listed in DESIGN §7.3; add nothing else without asking.
- Open questions for the user are DESIGN §11 (PDF engine placement, Free AI taste, 3 vs 5
  templates, share links). Defaults apply until answered.

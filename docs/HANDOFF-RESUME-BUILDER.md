# HANDOFF — Resume Builder + Common Profile (branch `resume-builder`)

## START HERE

**Branch:** `resume-builder`, cut from `version2` (which is 75+ commits ahead of `main`; nothing
promoted). Stay on this branch; PR into `develop` only when the user asks.
**Last commit:** `rb0.5: resume editor skeleton — live preview, autosave with ETag, conflict dialog` (2026-10-11) — R0.5 done: BFF routes (`/api/resumes/built`, `/[id]/doc`, `/[id]/doc/template`), `/resume-builder/[id]` editor (`web/src/components/app-v3/resume-builder/`: `ResumeEditor`, `SectionEditor`, `PreviewPane`, `ConflictDialog`, `state/{reducer,history,autosave}.ts`), `PageFrame` + `UndoIcon`/`RedoIcon` in `@kiwiply/ui`, the list page's working "New resume", vitest in `web` (`npm run test:unit -w web`, wired into `npm test -w web`), doc endpoints in `web/scripts/mock-api.mjs`. Before it, `rb0.3: resume doc endpoints with ETag/If-Match` (2026-10-11) — R0.3 done: `ResumeDocResource`/`ResumeDocService` (create from profile, GET with ETag, PUT with If-Match -> 428/409/413/422, template PATCH, `/doc/text`), `ResumeDocumentSeeder`, `ResumeDocException` -> `ExceptionTranslator`, `ResumeDocResourceIT`. Also done: `rb0.4` (`@kiwiply/ui` resume package, Modern template, TS projection, vitest). Before them: `rb0.2` (validator/hash/projections), `rb0.1` (the four tables, entities, repositories).
**State:** design, the R0.1 schema, the R0.2 document contract, the R0.3 doc endpoints, the R0.4 `@kiwiply/ui` resume package and the R0.5 editor skeleton (summary + experience editing, live preview, autosave). Three documents define the work:

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

**First story:** R0.6 PDF export (Chromium sidecar + `pdf.ts`; `export-recorded`). **The `FileStorage` seam (platform roadmap P5.1) must land before or with it** — local filesystem driver first, S3 by config later; R0.6 must not call S3 directly. Then R0.7 (smoke) to
finish the walking skeleton (DB → API → editor → template → PDF). To try the editor without the API: `MOCK_API_PORT=<free port> npm run dev:demo -w web` (the mock serves the doc endpoints in memory; `curl -X POST localhost:<port>/mock/resumes/<id>/edit-elsewhere` forces a 409). Commit prefix `rb<epic>.<n>:`.
One story = one commit = one push. After each story: tick it in `PROGRESS.md` → *Resume Builder*
section, move **Current focus**, add a Log line, and update the "Last commit" line above.

**How the user wants it built** (from `docs/HANDOFF-V2.md` §1): the orchestrating model designs and
reviews; **Sonnet agents implement**, one story each, strict file ownership, never `git add -A`
while others work. Agents open their own browser tab for checks and reset it.

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

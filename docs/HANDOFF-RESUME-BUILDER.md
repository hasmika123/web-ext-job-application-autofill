# HANDOFF — Resume Builder + Common Profile (branch `resume-builder`)

## START HERE

**Branch:** `resume-builder`, cut from `version2` (which is 75+ commits ahead of `main`; nothing
promoted). Stay on this branch; PR into `develop` only when the user asks.
**Last commit:** `rb0.2: ResumeDocument validator, canonical hash, projections` (2026-10-11) — R0.2 done: pure-Java contract under `api/.../service/resume/` (`ResumeDocument`, `ResumeDocumentValidator`, `ResumeDocumentCanonical` + `contentHash`, `ResumeDocumentProjector`, `ResumeDocumentText`, `ResumeDocumentJson`) and golden fixtures in `api/src/test/resources/resume-doc/` (R0.4 copies them byte-for-byte; the porting rules are the class comments). Before it: `rb0.1` (the four tables, entities, repositories).
**State:** design, the R0.1 schema and the R0.2 document contract; no endpoints or UI yet. Three documents define the work:

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

**First story:** R0.3 Doc endpoints (STORIES → R0; use `ResumeDocumentValidator.validate` → 422/413, `ResumeDocumentProjector.toStructuredJson` → `resume.parsed_json`, `ResumeDocumentCanonical.contentHash`). Then R0.4 → R0.5 (the ★ five), then R0.6–R0.7 to
finish the walking skeleton (DB → API → editor → template → PDF). Commit prefix `rb<epic>.<n>:`.
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

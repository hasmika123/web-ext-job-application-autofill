# HANDOFF-CONTINUE — picking this up on another machine (written 2026-10-12)

The session that wrote this stopped because the account's weekly usage limit reached 97 %.
Everything is **committed locally**; **nothing has been pushed** (the user asked to keep work local).
This file is the single START HERE for whoever continues — read it top to bottom once.

## START HERE

### 0. Get the code onto the new machine (the old machine must do step A first)
All work lives in **local branches on the original laptop** — `resume-builder` is 214 commits and
`version2` 41 commits ahead of GitHub; `enterprise-v2` and `ev2-*` have never been pushed. Pick one:

**A1 — push to GitHub (simplest; needs the user's OK, they asked to keep things local so far):**
```bash
git push origin version2 resume-builder enterprise-v2 ev2-build-p1 ev2-design-b ev2-design-c ev2-design-d ev2-design-e
```
Then on the new machine: `git clone https://github.com/hasmika123/web-ext-job-application-autofill.git`,
`git fetch --all`, `git checkout <branch>`.

**A2 — no push: one bundle file (copy it by USB/drive):**
```bash
git bundle create kiwiply-2026-10-12.bundle version2 resume-builder enterprise-v2 ev2-build-p1 ev2-design-b ev2-design-c ev2-design-d ev2-design-e worktree-agent-a7fe68fefef32a211 worktree-agent-a762c854ab9596188 worktree-agent-a4535d93fc0919fe1
```
On the new machine, inside a clone of the repo: `git fetch /path/to/kiwiply-2026-10-12.bundle 'refs/heads/*:refs/heads/*'`.

Not in git (copy by hand if needed, never commit): `api/.env.ai.local` (Gemini key — still empty),
`web/.env.rb-smoke` / `web/.env.ai-smoke` (throwaway local test accounts — regenerate instead), `.claude/launch.json`
(demo launcher; recreate from `docs/claude-launch.example.json`).

### 1. Branch map (what is where)
| Branch | Tip | What it is | State |
|---|---|---|---|
| `version2` | (this commit) | landing/app redesign line; **docs-only tracker sync** from `resume-builder` | clean |
| `resume-builder` | `32046a8` | **integration line for all app work** (Resume Builder, onboarding v2 + delight, user dashboard/tracker/settings, AI admin + AI proof, admin kit + settings registry, analytics, job search) | **verified green** (ui 582, web 2001, api 1424 unit / 986 IT, Playwright 141) |
| `enterprise-v2` | `834e2fa` | Enterprise V2 **design line** — Phase 0 (audit, 23 ADRs, foundation design, phase plan) | committed |
| `ev2-design-e` | `766f03c` | **latest Enterprise V2 design**: B + C + D merged + `09-consistency-decisions.md` | **WIP** — see §3 |
| `ev2-design-b/c/d` | `6415e72` / `653ec25` / `6ad59a7` | the three parallel design sessions (already merged into `ev2-design-e`) | done |
| `ev2-build-p1` | `f0c559c` | Enterprise Phase 1 **code**: X1.1 ✅ `f3e71b2`, X1.2 ✅ `82e12a4`, X1.3 **WIP** `f0c559c` (written, never compiled) | WIP |
| `worktree-agent-a7fe68fefef32a211` | `7e066dc` | parked old-org lane C (O1.6 gate, O1.7 switcher, E2E-O4.0, O2.1 `/org/new` verified; O2.7 WIP) — prior art only | parked |
| `worktree-agent-a762c854ab9596188` | `2672733` | parked old-org lane D (O2.2 invites API verified; O6.2/O2.3 WIP) — X1.8 cherry-picks `a6a9a62` | parked |
| `worktree-agent-a4535d93fc0919fe1` | `80e770e` | parked U4.3 Jobs page WIP (does not typecheck) — resume U4.3/U4.5/U4.8 from here | parked |

(The ~100 other `worktree-agent-*` branches are finished agent work already merged; safe to ignore.)

### 2. The immediate next task — Enterprise V2 (user's top priority)
Requirements (verbatim from the user): **[`ENTERPRISE-V2-REQUIREMENTS.md`](ENTERPRISE-V2-REQUIREMENTS.md)**.
Rule from the user: **"design only with Fable and any coding will be with Sonnet."** (Fable = design/roadmap/stories;
Sonnet = implementation; Sonnet records "Decisions I made" instead of stopping to ask.)

1. `git checkout ev2-design-e` and read `docs/HANDOFF-ENTERPRISE-V2.md` (START HERE + per-task table) and
   `docs/enterprise-v2/README.md`, `08-decisions-for-user.md`, `09-consistency-decisions.md`.
2. **Finish design session E (Fable)** — not done when paused:
   - apply `09-consistency-decisions.md` row by row to the docs/stories — **row 15 first: X1.4 must use the
     `(tenant)/_t/**` route group + `proxy.ts` rewrite** (before Phase 1 code reaches X1.4);
   - Task 2: CLAUDE.md E3 text (exact replacement wording is in the Session C report, reproduced in `HANDOFF-ENTERPRISE-V2.md`);
   - Task 3: docs 40 API specs, 41 database design, 42 threat model (incl. E12 → story X1.13), 43 testing plan
     (scenarios A–F scripted), 44 deployment plan;
   - Task 4: §30-format review of every story, specify X12.*, X4.10, X2.15, X1.13, split the 26 L stories (plan in 09);
   - then fast-forward `enterprise-v2` to the result.
3. **Resume Phase 1 code (Sonnet)** on `ev2-build-p1`: compile + test the WIP X1.3 (`f0c559c`), regenerate
   `api/openapi.json`, mark X1.3 done; then X1.4 (amended) → X1.5 → X1.6 → X1.7, with X1.10 / X1.12 in parallel.
   Fable must review the Phase 1 builder's spec gaps (recorded in `progress-tracker.md`): `organization.type`
   widened to VARCHAR(40); flag allow-list semantics; reserved platform hosts resolved **first**; only `localhost`
   is a platform host (`*.localhost` is for tenant dev, new key `enterprise.hosts.tenant_base_domains`);
   missing host header = legacy behaviour; signed asset URLs needed for X2.

### 3. Decisions already made by the user (don't re-ask)
- **E1** consultant submits — marketers prepare/request/record; Kiwiply never submits; no auto-submit (CLAUDE.md stands).
- **E2** HR & Finance are **record-only** — no identity documents, no SSN/tax/bank/DOB, never move money; PII scanner on every path.
- **E3** pricing = **mandatory base license + individually priced feature add-ons per consultant**; old seat items become
  presets/features/org modules; setup fee stays; ≥80 % margin guard; catalog ships **without prices** (admin publishes).
- **E5** custom domains: Fable writes the BeeCompete-edge Caddyfile snippet + runbook (`docs/enterprise-v2/10-domain-routing.md`
  §5.3/§8); **the user applies it**; develop on `*.localhost` until then.
- Org work from the old plan is superseded by Enterprise V2 (old org branches = prior art).
- AI: **Gemini for now**; Ollama/local LLMs only when the user asks (Phase 2 of `AI-ADMIN-CONFIG-DESIGN.md`).
- Admin-area plan defaults (Q-1…Q-8 in `ADMIN-E2E-PLAN.md`) stand until the user objects.
- UX bar: Gen Z/Alpha, Notion-style autosave (no Save buttons, inline ✓, undo toasts), playful but honest delight;
  every icon-only control has a tooltip; check 360/390/1440.

### 4. Still waiting on the user
- Material Enterprise escalations on defaults: E4, E8, E9, E10, E12, B1, C1, C3, C5, D1, D2, D4 (`08-decisions-for-user.md`).
- **Scanned-PDF parsing** vs the never-send-PII-to-AI rule (file fallback sends the whole PDF to Gemini; recommended:
  turn the fallback off by default and ask the user to paste text).
- Gemini key in `api/.env.ai.local` for the live AI pass (`node web/scripts/ai-smoke.mjs --live`, DEPLOY.md §10.3).
- Optional: commission the 8 hi-res mascot poses (`ONBOARDING-DELIGHT-DESIGN.md` §2.7); extension store URL check.
- Whether to push the local branches (see §0).

### 5. Other paused work (after Enterprise, or if the user redirects)
- **User app (`HANDOFF-APP-E2E.md`):** U4.3 Jobs page (WIP branch above), U4.5 preferences, U4.8 top-bar search; Waves 2–4.
- **Admin area (`HANDOFF-ADMIN-E2E.md`):** Wave 1 after the kit — A0.2, A12.2, A6.2, A1.3, A2.1, **A5.8 Settings home**, A1.9, …
- **Onboarding delight:** R1.17, R1.18, R1.19, R1.20 (`ONBOARDING-DELIGHT-DESIGN.md`); flaky axe race on the onboarding
  source screen (audit should wait for the slide-in, or run reduced-motion).
- **Resume Builder:** R4.3 summary, R4.7 evals and the rest of `docs/resume-builder/stories.json`.

### 6. How this repo is worked (local tooling that matters)
- Integration on `resume-builder`; each story by one agent in its own git worktree; merge `--no-ff`; bookkeeping
  conflicts (PROGRESS.md, HANDOFF, roadmap HTML) resolved by keeping both sides and regenerating
  (`node docs/roadmap/build-master-roadmap.mjs`, `node docs/resume-builder/build-roadmap.mjs`); code conflicts → an
  integration agent. After every merge run the **full** verify: `npm ci` (root) → `npm test -w packages/ui` →
  `npm test -w web` → `npm run build -w web` → `cd api && ./gradlew test integrationTest` (JDK 17; on Windows set
  `DOCKER_API_VERSION=1.44 JAVA_TOOL_OPTIONS=-Dapi.version=1.44`); Playwright `npx playwright test` from `web` with
  `PW_CHANNEL=chrome`. Under heavy load, rerun a single timed-out vitest with `--testTimeout=60000 --maxWorkers=3`.
- **Never run `gradlew --stop` or machine-wide `taskkill node`** — it killed the live demo twice. Kill only your own PIDs.
- Test uploads are per-worktree (`dossier.test.uploads-root` → `build/test-uploads`); `OpenApiContractIT` has a 120 s timeout.
- Local demo stack (optional): MySQL 9.2 container on 33511, browserless Chromium `v2.57.0` on 13322, API on 18181
  (`./gradlew bootRun --no-daemon` with `DEMO_ENABLED=true`), web `next start` on 13211; real-stack smoke
  `node web/scripts/rb-smoke.mjs` (51 rows); AI smoke `node web/scripts/ai-smoke.mjs --stub`.
- Never push / deploy / merge to `main` without the user saying so (`main` auto-deploys to production).

# HANDOFF-ADMIN-E2E — Platform admin area, real data end to end

Written 2026-10-12 (Fable, design only — nothing implemented). Read after root `CLAUDE.md`. The plan itself is
**`docs/ADMIN-E2E-PLAN.md`**; this file is the continuation point for whoever builds it. Its twin for the user
and org dashboards is `docs/HANDOFF-APP-E2E.md` (branch `app-e2e`); the two plans own disjoint files (§5 D-1 of
the plan) and merge into `develop` independently.

## START HERE

**Last commit (design):** the commit that added this file and `docs/ADMIN-E2E-PLAN.md` on top of the
`resume-builder` tip **`bddac23`** ("Merge commit '3fd5fcf' into resume-builder" — the I1.13 AI providers page is
the newest admin work). `git log --oneline -1` after checking the branch out tells you the exact SHA.

**Branch to build on:** create **`admin-e2e`** from that commit. PR into `develop` only when the user asks; never
`main`.

```bash
git checkout resume-builder && git checkout -b admin-e2e      # or from the design commit's SHA
npm ci                                                        # repo ROOT (npm workspaces)
npm test -w web                                               # tsc + eslint + vitest — green
cd api && ./gradlew test                                      # unit (no Docker); ./gradlew integrationTest needs Docker (JDK 17)
node docs/roadmap/build-master-roadmap.mjs --list             # 0 dangling ids; admin = 109 stories (7 done, 11 partial)
npm run dev:demo -w web                                       # mock API + Next; /login → "App admin" → /admin (demo-admin)
```

**First stories to build in parallel (Wave 1, ADMIN-E2E-PLAN §4) — one Sonnet session each, strict file ownership:**

1. **E2E-A15.0** · admin page kit (lane K — every page story imports it) — start first.
2. In parallel with it (no dependency on the kit): **A0.2** auth gaps (lane S) · **A12.2** audit columns + `AdminActions` + `@AdminArea` + server filters + export (lane A) · **A5.1** settings registry + `SettingsService` + generic settings API (lane A) · **A6.2** ingest ledger (lane A).
3. When the kit lands: **A1.3** users list · **A2.1** customers summary/pagination · **A5.8** Settings home v0 (after A5.1) · **A1.9** user + bug detail restyle · **E2E-A10.0** System honest · **E2E-A11.0** Overview/Analytics honest (after A6.2) · **A4.1** AI usage remaining · **A15.1** admin smoke + axe.
4. After A12.2: **A12.3** audit every mutation → then **E2E-A7.0** Email honest, **A8.2** bug triage v1, **A8.4** inquiries triage v1, **E2E-A9.0** Security honest v0.
5. Wave 1 ends with the §4 "Wave 1 demo" passing on `dev:demo` and on a local API, `grep -r sample-data web/src/components/admin-v3` empty, and `admin-smoke.spec.ts` green with 0 axe violations.

Mark progress with `node docs/roadmap/build-master-roadmap.mjs --set A12.2=done` (edits the admin JSON,
regenerates `master-roadmap.html`; commit both). One story = one commit (`admin-e2e: A12.2 …`), pushed on
`admin-e2e`. Add one line under **Log** in `PROGRESS.md` per story, as the e2e-u* entries do.

**Build progress (update as stories land).**
- **A5.1 done (API only)** — settings registry + `SettingsService` + `/api/admin/settings` (list / PUT·PATCH / DELETE /
  history / revert). Built on `resume-builder` @ `ebfad7a`, one commit `admin-a5.1: …`. The web Settings home is **A5.8**
  (separate agent): the contract is in the PROGRESS.md log entry for A5.1 and `api/openapi.json`. Facts for A5.8 / later
  stories: `ResumeBuilderSettings` was **not** renamed (no Java type alias exists; `SettingsService` in
  `api/service/settings` wraps it and adds the env layer + provenance), the `Key` record gained `area` + `risk`, new keys
  live in `AdminSettingKeys` (descriptions say "Not enforced yet" until the story that reads them ships — remove that
  sentence there), generic writes audit as `SETTING_CHANGE` with `area=… risk=…` in `details` until A12.2 adds real
  columns, and `AdminSettingsWriter.writeValidated` is the shared persist step (the AI path still uses `write`).

## Key facts an implementer must not rediscover

- **The audit of 2026-10-12** (ADMIN-E2E-PLAN §1): 3 REAL routes (`/admin/ai/providers`, `/admin/users/[login]`,
  `/admin/bug-reports/[id]` — the last two in v2 styling with Save buttons), 11 PARTIAL (every table real, every
  delta / series / donut / "recent" list a `sample-data.ts` constant rendered to production admins), 1 SAMPLE
  (`/admin/security`), 1 MISSING (`/admin/settings`). Ten `sample-data.ts` files to delete, listed in §1.2.
- **I1.9 is the settings write path** — do not build another: `AdminSettingsWriter.write(key, value, reason, risk)`
  validates against `ResumeBuilderSettingKeys.find(key)` (+ `AiSettingKeys` families), writes `app_setting` +
  `app_setting_history`, audits, invalidates the 60 s cache. A5.1 adds `area`/`risk` to the `Key` record, the
  `AdminSettingKeys` families (plan §2.1 table), renames `ResumeBuilderSettings` → `SettingsService` (alias kept
  one wave) and exposes `GET/PUT/DELETE /api/admin/settings[/{key}]`, `/history`, `/revert`. Audit action
  `SETTING_CHANGE`; `AI_CONFIG_CHANGE` stays on the AI endpoints.
- **The AI page is the reference implementation** of the admin UX bar: `admin-v3/ai/useAiAdmin.tsx` (optimistic +
  ✓ + undo + inline error), `ReasonDialog.tsx` (Dialog / `BottomSheet`), `HistoryDrawer.tsx`, `lib/ai-admin.ts`
  (`Resolved<T>`), BFF helpers `app/api/admin/ai/respond.ts`. E2E-A15.0 lifts them into `admin-v3/common` and
  `lib/admin-{client,proxy}.ts`; the `ai/` files become re-exports and `AiProvidersPage.test.tsx` must stay green.
- **Role model**: `ROLE_ADMIN` only until A0.3 (Wave 3). Every new `/api/admin/**` handler carries `@AdminArea("…")`
  from A12.2 on (`AdminAreaCoverageTest` fails otherwise). HIGH = reason required (+ typed confirm when
  irreversible); re-auth arrives with A0.5 and changes nothing in the pages (plan §3.1, §3.3).
- **Audit**: `AdminActions` enum (A12.2) gives every action `area` + `risk`; `AdminAuditService.record` fills ip /
  user agent / roles; exports are HIGH and go through `CsvWriter.cell` (formula-injection guard). Never derive area
  or risk on the client again.
- **Empty-or-real, admin edition** (plan §3.5): no decorative panels at all, labelled or not; a panel without a
  source is removed and returns with its story; tile deltas only from `{value, previous}`; `SampleTag` is deleted
  at the end of Wave 1; ESLint `no-restricted-imports` guards `**/admin-v3/**/sample-data`.
- **List contract**: `ListPage<T>` + `ListQuery` (API, from APP-E2E's E2E-U0.0) and `useListQuery` (web) for every
  new admin list; legacy `x-total-count` arrays stay until the page story moves them.
- **Mock + tests**: `web/scripts/mock-api.mjs` admin block (`demo-admin` is ROLE_ADMIN in the mock only) + one
  fixture module per page under `web/scripts/fixtures/admin-<page>.mjs`; writes stay `403 DEMO_READ_ONLY`;
  Playwright specs sign in through `POST /api/auth/demo` and intercept writes (`e2e/journeys/admin-ai.spec.ts` is
  the pattern); `@axe-core/playwright` 4.13 is already a dev dep; `e2e/fixtures/admin.ts` (E2E-A15.0) gives
  `signInAdmin`, `expectAccessible`, `noOverflow`.
- **Spring facts**: 14 `Admin*Resource` classes; JHipster `UserResource` mutations are unaudited and bypass the
  self-guards (A12.3 fixes, DELETE → `AccountDeletionService`); `RateLimitFilter` off by default and keyed on
  `X-Forwarded-For` (A0.2); nine `@Scheduled` jobs with no registry (A10.2); `AdminAnalyticsService.billing()`
  already computes MRR — Customers reuses it (plan D-14); `AiCall` has tokens/provider/latency/success;
  `OpenApiContractIT` regenerates `api/openapi.json` — commit it with every endpoint; ArchUnit layering; ITs on
  Testcontainers MySQL 9.2.
- **Rules that bind every story**: ADMIN-E2E-PLAN §3 (auth, audit, reason, PII, empty-or-real, kit, tests, mock)
  and §9 (UX bar: autosave, undo, reason sheets, cards under `md`, dark + axe, numbers only when real). Locked
  decisions in `CLAUDE.md` (everything admin-configured, never collect sensitive PII, billing mechanics, ≥ 80 %
  margin floor, keys from env only, no Coach tier). Design docs win over stories; unspecified → stop and ask.
- **Decisions waiting on the user** (plan §6, defaults apply): Q-1 AI caps $40/day · $600/month, breach pauses all
  but free parsing (yes) · Q-2 TOTP mandatory, separate break-glass login (yes) · Q-3 rate limiting on in prod
  with the listed per-hour defaults (yes) · Q-4 ADMIN verifies privacy requests, 30/45 days (yes) · Q-5 remove
  country/channel charts until A11.6 (yes) · Q-6 admin search excludes resumes (yes) · Q-7 mock admin stays
  read-only (yes) · Q-8 Settings home shows resume-builder keys too (yes). Waves 1–2 need no credential and no
  decision.

## What this commit changed

- `docs/ADMIN-E2E-PLAN.md` (new): §1 audit table + status corrections, §2 target per page + the Settings home
  spec, §3 cross-cutting concerns, §4 three waves (18 / 20 / 23 stories) + "after", §5 decisions D-1–D-20, §6 user
  questions, §7 non-goals, §8 risks, §9 UX bar.
- `docs/roadmap/areas/admin.json`: +12 stories (E2E-A15.0, E2E-A10.0, E2E-A9.0, E2E-A11.0, E2E-A7.0, E2E-A5.1,
  A0.7, A3.6, A3.7, A9.8, A9.9, A1.10); statuses A5.1 / A4.2 / A4.3 / A15.1 → partial; L stories resized to M by
  splitting (A0.4, A3.2, A3.4, A5.7, A9.4, A1.5, A9.2); dependency re-points so Waves 1–2 are buildable on
  `ROLE_ADMIN` without re-auth (A12.2, A1.3, A5.1, A2.1, A5.8, A1.9, A4.1, A8.2, A8.4, A15.1, A5.6, A9.2, A6.4,
  A1.4, A4.2, A4.3, A11.3, A3.3, A0.5, A3.4, A3.5, A5.7, A5.9, A2.4, A2.8, A9.3, A9.4, A11.5, A1.8); E2E-A15.0
  supersedes A15.4.
- `docs/roadmap/master-roadmap.html` regenerated (0 dangling ids; admin = 109 stories).
- This handoff.

## Not done here (by design)

No code, no mock routes, no tests were written. The per-page audits, the BFF inventory and the Spring greps that
fed §1 are summarised in the plan; re-run the greps in §1.3 if the branch has moved.

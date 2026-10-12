# HANDOFF — Timesheets & Consultancy Ops (product area H)

## START HERE

**Branch to create when building:** `timesheets`, cut from `version2` (`git checkout -b timesheets version2`).
Stay on it; PR into `develop` only when the user asks. **Nothing is built yet** — the design landed on
`version2` on 2026-10-11 (commit `design: Timesheets promoted to a product area (H) — design, stories,
decisions, handoff`). Four documents define the work:

1. `docs/TIMESHEETS-DESIGN.md` — the design (read §0 first, then the section your story cites).
2. `docs/TIMESHEETS-STORIES.md` — the ordered backlog (42 stories, H0–H8), rendered from
   `docs/timesheets/stories.json`, which is the **status source of truth** the master roadmap reads.
3. `docs/TIMESHEETS-DECISIONS.md` — what the user decided (D1, D2, D7, D10) and the vetoable defaults;
   check nothing was overridden before starting an epic.
4. This file.

**First story:** `H0.1 Schema v0` (STORIES → H0). Then H0.2 → H0.5 (the ★ five), then H0.6–H0.7 to close
the walking skeleton (gate → placement → one sheet submitted and approved → one CSV → `ts-smoke.mjs`).
Commit prefix `ts<epic>.<n>:`. One story = one commit = one push. After each story: tick it in
`PROGRESS.md` → *Timesheets* section, move **Current focus**, add a Log line, run
`node docs/roadmap/build-master-roadmap.mjs --set H0.1=done` (edits the JSON and regenerates the HTML),
and update the "Last commit" line here.

**But first — the blocker you must not rediscover:** every H story depends on the **org model, which does
not exist in the API yet.** `H0.1` needs O1.1 (org core schema) + O1.4 (org audit); `H0.2` needs O1.2
(`OrgAccessService`, FINANCE is already in the role enum design) + A5.3 (flags) + A5.1 (settings registry);
`H0.3` needs O2.2 (invites → members); `H0.5` needs O1.6 (web gate). The org walking skeleton is
`docs/roadmap/PLAN-org.md` §3 (O1.1 → O1.2 → O1.4 → O1.3 → O6.1 → O2.2 → O1.5). Do not start H0 until
O1.5 (`OrgIsolationIT`) is green; it discovers the ops routes automatically. If A5.1/A5.3 have not landed,
read the defaults from `application.yml` behind the same key names and swap when they do.

**First commands**
```bash
git checkout -b timesheets version2
npm ci                                   # repo ROOT (npm workspaces)
npm test -w web                          # tsc + eslint, green
cd api && ./gradlew test                 # unit; `./gradlew integrationTest` needs Docker (Windows: DOCKER_API_VERSION=1.44)
node docs/roadmap/build-master-roadmap.mjs --list   # H area present, 0 dangling ids
```

**How the user wants it built** (from `docs/HANDOFF-V2.md` §1 and the Resume Builder handoff): the
orchestrating model designs and reviews; **Sonnet agents implement**, one story each, strict file
ownership, never `git add -A` while others work. Agents open their own browser tab for checks and reset it.

## Key facts an implementer must not rediscover
- **Priority is P2 for every epic** (D10). Nobody re-prioritises; the order is in the deps.
- **Package naming:** `api/src/main/java/com/dossier/api/service/ops/` already exists and is *platform* ops
  (`ErrorDigest*`). Consultancy ops lives under `domain/org/ops/`, `service/org/ops/`, `web/rest/org/ops/`,
  tests under `org/ops/`. Table names keep the `ops_*` prefix (the never-collected test keys off it).
- **Key namespaces:** this product's *settings* are `org.ops.*` (A5.1); its *entitlements* are `ops.*`
  (B1.1 catalog) — a different registry from the platform's `ops.maintenance` setting. The flag is
  `flag.ops_timesheets`. Open question 6 in DESIGN §18 asks whether to rename entitlements; default is keep.
- **Routes:** consultant surface is `/timesheets` in the user app — file `web/src/app/(app)/timesheets/page.tsx`
  (route groups add no URL segment; there is no `/app/` prefix); approver/placements/finance/exports under
  `web/src/app/(org)/org/ops/*`; admin at `web/src/app/(admin)/ops/*`. Web calls the API only through the BFF
  (`web/src/app/api/orgs/[id]/ops/**`, pattern of `web/src/lib/api.ts`).
- **Never collected is a build gate, not a policy:** `@NoSensitiveText` on every String DTO field,
  `OpsNeverCollectedTest` (H3.1) over schema/DTO/export/AI-schema/enums. If T1.1's shared `SensitivePatterns`
  has not landed, the patterns live in `api/.../validation/` and T1.1 adopts them later.
- **Files:** everything through the `FileStorage` seam (P5.1, local driver first, **no presigned URLs**,
  proxied downloads). If P5.1 has not started, H3.2 builds on `ResumeStorageService` behind an adapter with
  the same key shape (`ops-ts/<org>/<sheet>-<uuid>-<name>`) and swaps when P5.1 lands — no table change.
  Two-phase upload: temp → scan → move. A refused file never gets a ledger row.
- **AI:** only two gateway tasks, both hard-capped per period — `OPS_TS_SCAN` (mandatory, platform safety
  budget, classify-only) and `OPS_TS_OCR` (optional, **off by default**, org Ops-grant budget, suggestion-only).
  Schemas are closed; `OpsNeverCollectedTest` (d) asserts it. No AI anywhere in money records.
- **Money is recorded, never moved.** Integer minor units, one currency per org, rates effective-dated
  (`OpsRateService.inForce(placement, weekStart)`), invoices lock sheets (`locked_reason=INVOICED`),
  corrections of locked sheets set `needs_reissue` on the invoice — never blocked.
- **Reuse, don't rebuild:** `OrgAccessService` + `@OrgPermissionRequired` (O1.2), `OrgAuditService` (O1.4),
  `OrgIsolationIT` (O1.5), O13.3 notification kinds + daily cap, `AiBudgetService`/`AiMeteringService`/
  `AiGateway` (I0.3), the Resume Builder's Chromium PDF sidecar (R0.6) via a shared `PdfRenderer`,
  `DemoAccountService` (seed), `AccountDeletionService`/`AccountExportService` hooks, `MetricRollupJob` (O7),
  `web/src/lib/analytics.ts`, `HeroBand`/`SectionCard`/`SidePanel` from the v3 shell. New `@kiwiply/ui`
  primitives go under `packages/ui/src/ops/` **first**; no inline `<svg>`.
- **Liquibase changesets** are per story (`20261013010000_ts_skeleton.xml` … `20261013060000_ts_money.xml`,
  DESIGN §5 header), not one big file.
- **Smoke:** `web/scripts/ts-smoke.mjs` (H0.7) next to `rb-smoke.mjs`; H8.2 adds `--demo`.
- **Master roadmap:** `docs/roadmap/build-master-roadmap.mjs` reads `docs/timesheets/stories.json` as a
  product area (prefix `H`, `kind: "product"`, epic `priority` in the JSON). `--set H0.1=done` works once the
  generator lists the file (a follow-up wiring task adds the "Products" group with Resume Builder +
  Timesheets and removes the temporary Add-ons spotlight that pointed at the old org epic).
- **Open questions** for the user are DESIGN §18 (retention anchor, marketer presence, submit-for,
  one-person shops, proof scan mode, entitlement namespace, disclaimer wording). Defaults apply until answered.
- **Old ids:** the backlog replaced the org area's fourteen Consultancy Ops stories; the mapping is DESIGN §13 (the only place the
  old ids appear). RECONCILIATION, PROPOSAL-timesheets, PLAN/AUDIT-org and the competitive docs were re-pointed.

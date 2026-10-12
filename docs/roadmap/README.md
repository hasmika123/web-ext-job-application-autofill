# Master roadmap

`master-roadmap.html` is a self-contained drill-down (works from file://). The home page groups thirteen area boxes into **Dashboards** (user, org, admin), **Cross-cutting** (ext, mkt, plat, ai, mob, pay, trust, sup) and **Products** (Resume Builder `R`, Timesheets `H`; each card links its Design / Decisions / Stories docs), then feature boxes (epics), then stories, then story details. `#/epics` is the flat **All epics** view (every epic, grouped by priority P0/P1/P2, sortable within a priority, respects the status/priority/owner filters). Deep links look like `#/user/U2/U2.3`.

Sources it reads (any that are missing show as "Plan being written"):

- `docs/roadmap/areas/<key>.json` for `user`, `org`, `admin`, `ext`, `mkt`, `plat`, `ai`, `mob`, `pay`, `trust`, `sup` (schema: area, name, prefix, kind, updated, epics[], stories[])
- `docs/resume-builder/stories.json` (Resume Builder; `star` means critical; epic `priority` in the file wins, the generator only falls back to `RESUME_PRIORITY` when it is missing)
- `docs/timesheets/stories.json` (Timesheets & Consultancy Ops, product area **H**; same schema as the Resume Builder file; `prefix`, `kind: "product"`, `name` and every epic's `priority` come from the JSON; `--set H0.1=done` edits it)
- Optional `docs/roadmap/PLAN-<area>.md` and `AUDIT-<area>.md` (linked from the area page), plus `COMPETITIVE-LANDSCAPE.md` and `COMPETITIVE-GAPS.md` (linked from the home and every area page)

The area list, short names, group and curated one-to-two sentence summaries live in the `AREAS` array at the top of the generator (the JSON's long `name` is shown as a subtitle on the area page; `prefix` and `kind` are read from the JSON). Add a new area by adding one entry there.

## Spotlight epics (currently none)

The `SPOTLIGHTS` array in the generator (next to `AREAS`) is empty. The mechanism stays for future use: each entry `{ key, group, badge, name, summary, epicIds: [...], areaKey }` renders a card at the top of the home-page group named by `group` (it must be a `GROUPS` key), with stats (progress, epics, stories, done / partial / not started, priority) computed from those epic ids only. Open goes to the owning area's view with the first epic expanded. The stories keep their ids and stay counted in their own area, so spotlights are excluded from the overall totals (`--list` prints them as a `spotlight` row and warns if an epic id is missing). The former `ops` spotlight (Consultancy Ops & Timesheets) was removed on 2026-10-11 when Timesheets became product area H.

## Optional story fields

- `benchmark` (string): which competitor bar the story meets or beats; shown as a Benchmark block in the story detail.
- `relates` / `supersedes` (arrays of story or epic ids, cross-area allowed): rendered as links. `G<n>` ids link to a row of `COMPETITIVE-GAPS.md`; a bare area prefix such as `M` links to that area. Any other id that matches nothing is shown as a dashed, non-clickable chip (no crash) and listed as a warning by `--list` and in the page footer. Stories that are superseded show a "Superseded by" row.

## Usage

```
node docs/roadmap/build-master-roadmap.mjs                          # regenerate the HTML
node docs/roadmap/build-master-roadmap.mjs --set U1.2=done,R0.1=in_progress   # change statuses (any area prefix edits that area's JSON), stamp `updated`, regenerate
node docs/roadmap/build-master-roadmap.mjs --list                   # per-area table, overall, epics by priority, dangling-id warnings; no write
npx --yes serve docs/roadmap -l 5057                                # then open http://localhost:5057/master-roadmap.html
```

Statuses: `done`, `in_review`, `partial`, `in_progress`, `blocked`, `not_started`.

Progress: story points S=1, M=2, L=3 times status credit (done 100%, in review 75%, partial 50%, in progress 25%, not started or blocked 0). Computed per epic, area, group, P0-only per area, and overall.

Never edit the HTML by hand. Env overrides for testing: `ROADMAP_AREAS_DIR`, `ROADMAP_OUT`.

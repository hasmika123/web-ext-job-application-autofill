# Master roadmap

`master-roadmap.html` is a self-contained drill-down (works from file://). The home page groups twelve area boxes into **Dashboards** (user, org, admin), **Cross-cutting** (ext, mkt, plat, ai, mob, pay, trust, sup) and **Resume Builder**, plus an **Add-ons** group of spotlight cards (see below), then feature boxes (epics), then stories, then story details. `#/epics` is the flat **All epics** view (every epic, grouped by priority P0/P1/P2, sortable within a priority, respects the status/priority/owner filters). Deep links look like `#/user/U2/U2.3`.

Sources it reads (any that are missing show as "Plan being written"):

- `docs/roadmap/areas/<key>.json` for `user`, `org`, `admin`, `ext`, `mkt`, `plat`, `ai`, `mob`, `pay`, `trust`, `sup` (schema: area, name, prefix, kind, updated, epics[], stories[])
- `docs/resume-builder/stories.json` (Resume Builder; epic priorities are set in the generator, `star` means critical)
- `docs/timesheets/stories.json` (Timesheets & Consultancy Ops, product area **H** — same schema as the Resume Builder file; `prefix`, `kind: "product"`, `name` and epic `priority` are in the JSON; **not yet listed in `AREAS`** — wiring it into a "Products" group next to the Resume Builder is a follow-up)
- Optional `docs/roadmap/PLAN-<area>.md` and `AUDIT-<area>.md` (linked from the area page), plus `COMPETITIVE-LANDSCAPE.md` and `COMPETITIVE-GAPS.md` (linked from the home and every area page)

The area list, short names, group and curated one-to-two sentence summaries live in the `AREAS` array at the top of the generator (the JSON's long `name` is shown as a subtitle on the area page; `prefix` and `kind` are read from the JSON). Add a new area by adding one entry there.

## Spotlight epics (Add-ons group)

The `SPOTLIGHTS` array in the generator (next to `AREAS`) drives the home page's **Add-ons** group: each entry `{ key, group: 'addons', badge, name, summary, epicIds: [...], areaKey }` renders one card whose stats (progress, epics, stories, done / partial / not started, priority) are computed from those epic ids only. Open goes to the owning area's view with the first epic expanded. The stories keep their ids and stay counted in their own area, so spotlights are excluded from the overall totals (`--list` prints them as a `spotlight` row marked "excluded from overall"). The first entry (`ops`, pointing at the former org epic) is **obsolete since 2026-10-11**: Timesheets became product area H and the epic left `org.json`, so `--list` warns about it until the Products group replaces the spotlight. Add another add-on by appending one entry.

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

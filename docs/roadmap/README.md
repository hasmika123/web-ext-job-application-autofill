# Master roadmap

`master-roadmap.html` is a self-contained drill-down (works from file://): four area boxes, then feature boxes (epics), then stories, then story details. Deep links look like `#/user/U2/U2.3`.

Sources it reads (any that are missing show as "Plan being written"):

- `docs/roadmap/areas/user.json`, `org.json`, `admin.json` (schema: area, name, prefix, updated, epics[], stories[])
- `docs/resume-builder/stories.json` (Resume Builder; epic priorities are set in the generator, `star` means critical)
- Optional `docs/roadmap/PLAN-<area>.md` (first paragraph becomes the area summary) and `AUDIT-<area>.md` (linked)

## Usage

```
node docs/roadmap/build-master-roadmap.mjs                          # regenerate the HTML
node docs/roadmap/build-master-roadmap.mjs --set U1.2=done,R0.1=in_progress   # change statuses, stamp `updated`, regenerate
node docs/roadmap/build-master-roadmap.mjs --list                   # counts per area, no write
```

Statuses: `done`, `in_review`, `partial`, `in_progress`, `blocked`, `not_started`.

Progress: story points S=1, M=2, L=3 times status credit (done 100%, in review 75%, partial 50%, in progress 25%, not started or blocked 0). Computed per epic, area, P0-only per area, and overall.

Never edit the HTML by hand. Env overrides for testing: `ROADMAP_AREAS_DIR`, `ROADMAP_OUT`.

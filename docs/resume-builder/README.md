# Resume Builder - roadmap and design pages

Static pages for the `resume-builder` branch. No build step, no dependencies; open from disk
(`file://`) or in a preview pane. Google Fonts is the only optional external request.

| File | What |
|---|---|
| `roadmap.html` | Generated. Progress ring, epic cards, 45 filterable stories, next-up panel, dependency view. |
| `design.html` | Hand-written visual walkthrough of `docs/RESUME-BUILDER-DESIGN.md` (clickable mockups, template switcher, diagrams). |
| `stories.json` | **Single source of truth for status.** Story text is copied from `docs/RESUME-BUILDER-STORIES.md`. |
| `roadmap.template.html` | The page template; `build-roadmap.mjs` injects the data. |
| `build-roadmap.mjs` | Plain Node generator. |

## Update a status

```bash
node docs/resume-builder/build-roadmap.mjs --set R0.1=done
node docs/resume-builder/build-roadmap.mjs --set R0.2=in_progress,R0.3=in_review   # several at once
node docs/resume-builder/build-roadmap.mjs --list                                   # print all statuses
node docs/resume-builder/build-roadmap.mjs                                          # regenerate only
```

Statuses: `not_started` `in_progress` `in_review` `done` `blocked`. `--set` edits `stories.json`,
stamps `updated` with today's date, and rewrites `roadmap.html`. You can also edit `stories.json`
by hand and run the script with no arguments. Commit both files.

## Rules the page applies

- Weighted progress: size S = 1, M = 2, L = 3 points; **only Done earns points**. Epic percentages use the same weights.
- Epic status: Not started (nothing started), Done (all done), otherwise In progress.
- "Ready" / "Next up": a not-started story whose dependencies are all Done. A dependency of `R2` means every story in epic R2.
- `R-design` is a separate line (Done, not counted in the totals).

## Known simplifications

- R7 stories have no text in the stories doc: their sizes are estimates (`sizeEstimated`) and their dependency on `R6` is assumed (`depsAssumed`).
- When a story is added or reworded in `RESUME-BUILDER-STORIES.md`, mirror it in `stories.json` by hand (no parser is shipped).

# HANDOFF-V2 — the `version2` branch, for the next machine / agent

Written 2026-10-11 at the end of a two-day session. Everything below is on `origin/version2`
(75 commits ahead of `main`). **Nothing has been promoted to `develop` or `main`**; that merge is a
production deploy and only the user triggers it (see root `CLAUDE.md` → Branching).

Read in this order: root `CLAUDE.md` → this file → `web/LANDING-V2-SPEC.md` → `web/APP-V2-SPEC.md`
→ `web/APP-V3-SPEC.md`. The `PROGRESS.md` **Log** has one line per completed phase.

## 0. START HERE — the exact continuation point

**Last commit:** the `app3qa:` series on `origin/version2` (2026-10-11; `git log --oneline -8`).
**App v3 is built and QA'd**: all 13 signed-in routes exist as v3 pages, `npm test -w web` and
`npm run build -w web` are green. Nothing is promoted to `develop` or `main`.

```bash
git clone <repo> && cd web-ext-job-application-autofill
git checkout version2
npm ci                      # at the ROOT (npm workspaces)
npm test -w web             # tsc + eslint, green
npm run dev:demo -w web     # mock API (:8080) + Next (:3000); /login -> "Job seeker" -> "Open demo"
```

**What to do next** (in this order; nothing here is blocked on code):

1. Get the user's decisions in section 3 (board images in `design/app-v3/`, `/` vs `/v3`, placeholder
   copy). Board images are the only thing that changes page work: re-check each page against its
   image and fix by diff.
2. A real-browser look by the user at 1440/1024/375 (agents verified in a throttled hidden pane, see
   "never verified" below).
3. Only when the user asks: PR `version2` into `develop`. Promotion to `main` is a production deploy.

## 1. How the user wants work done (decisions, not suggestions)

- **Model split:** the orchestrating model does *deep design* (specs, trade-offs, review);
  **all implementation and deploy work is done by Sonnet agents**, several in parallel, each with
  strict file ownership. "Use more agents if needed and use Sonnet only."
- **Exact to the boards.** The user supplies AI-generated design boards and wants them reproduced
  *exactly* (copy, rows, chips, art placement). Where a board claim was untrue, the user later chose
  honesty for the marketing site (see `honest:` commits); the app boards keep their sample data.
- **Layering rule (from repeated feedback):** people cutouts render *in front of* cards; mascot and
  sticky notes in front of people; nothing clips a cutout; a card never covers a face. Verify with
  `document.elementFromPoint` on a face pixel.
- **Responsive rule:** two-column sections stay side by side from **768px** up and *shrink* (fluid
  type via `clamp()`, fixed compositions via `ScaledCanvas` / `container-type: inline-size` scale);
  only phones stack. The user tests in a ~1250–1300px window and treats stacking there as a bug.
- **Browser etiquette for agents:** the user watches the in-app browser's "seed" tab; agents must
  open their own tab, do all `resize_window` there, reset to desktop and close it.
- One agent per file set; never `git add -A` while others work; worktree agents push their own
  `worktree-agent-*` branch and the coordinator merges.

## 2. State of the branch

### Done and reviewed
| Area | Routes | Spec | Notes |
|---|---|---|---|
| Landing v2 (carousel) | `/` | LANDING-V2-SPEC §13 (exact-board) + `honest:` commits | 4-slide hero, trust strip (Works today / On the roadmap), sections rebuilt to per-section boards (`design/landing-v2/section-*.{webp,png}`), full-bleed CTA with campus backdrop |
| Landing v3 (alternate) | `/v3` | APP-V2-SPEC §7 | own header/footer via `ChromeGate`; `noindex`; user hasn't chosen `/` vs `/v3` |
| About, Organizations, Pricing | `/about`, `/organizations`, `/pricing` | LANDING-V2-SPEC §13.5 | layering + responsive polish done |
| Auth | `/login`, `/signup`, `/forgot-password`, `/reset-password` | APP-V2-SPEC §4 | demo card on login when the feature is on |
| App v2 (first-generation signed-in app) | `/dashboard`, `/jobs`, `/jobs/[id]`, `/saved`, `/ai-apply`, `/applications`, `/interviews`, `/resume`, coming-soon stubs | APP-V2-SPEC §3 | real data where APIs exist, sample otherwise |
| Enterprise admin | `/org` + 9 pages | APP-V2-SPEC §5–§6 | sample data; visible to any signed-in user (no org model yet) |
| Demo accounts | admin switch at `/admin/system` | APP-V2-SPEC §9 | off by default; see `DEPLOY.md` §12.1 |
| Marketing nav | header | — | active item highlighted |

### App v3 (second-generation signed-in app): built and QA'd
Spec: `web/APP-V3-SPEC.md`. Pages live in `web/src/components/app-v3/*` (one folder per route, one
shared `sample-data.ts` marked SAMPLE); shared primitives in `app-v2/common` (single `HeroBand` with
an `art` band look and a `mascot` PageHero look). Old routes redirect via `lib/legacy-redirect.ts`
(`/ai-apply /interviews /resume /ai-tools /insights /companies /networking /learning /profile /board
/matches /jobs/<id>` -> v3 pages; `/jobs/<id>` opens `/jobs?job=<id>`).

V3-QA (`app3qa:` commits) folded the three local `HeroBand` copies into the shared one, merged the four
sample-data files, deleted the unused v2 page folders (kept: `app-v2/applications/mapping.ts`,
`jobs/{data,JobBits,job-utils}`, `resume/{ResumeDrawer,TemplateThumb}`, `sample-data.ts`, `common/*`)
and two dead components, and removed `/profile/loading.tsx` so `/profile` is a plain server redirect.
Smoke at 1440/1024/375 over all 14 signed-in routes (incl. `/org`): no horizontal overflow, no blank
page, no console errors beyond a dev-only HMR websocket warning.

**Honestly never verified**
- Pixel fidelity against the per-page board images (never received); pages follow the transcribed spec.
- The smoke ran in the hidden in-app browser pane: streamed pages (`/dashboard`, `/jobs`, `/settings`
  have `loading.tsx`) only paint when the pane is woken, so those three were checked by screenshot
  at selected widths, not by the automated sweep at every width. Tap-target sizes, keyboard and screen
  reader paths, dark mode, and real (non-demo) data/empty states were not checked.
- Real-API behaviour: the sweep used `scripts/mock-api.mjs` (demo account); billing/inbox/402 paths
  and a signed-out `/profile` against the real Spring API were not exercised.
- Sample-data pages (Alerts, Messages, Assistant, Interview Prep, Explore, Analytics partly) show
  board rows when the real list is empty; none of them persists anything yet.
- `components/ApplicationBoard.tsx` is only used for its `Application` type; the component itself is
  dead weight left in place (moving the type is trivial but touches many imports).

## 3. Open items the user still has to decide / supply
- Per-page app v3 board images → `design/app-v3/` (then a fidelity pass).
- `/` (carousel) vs `/v3` as the real home page.
- Replace placeholder testimonials/quotes (`*/placeholder-data.ts`, marked `PLACEHOLDER`) and the
  "Trusted by organizations" eyebrow before promotion.
- High-res mascot/people renders: everything in `web/public/v2/` and `web/public/v2/app/` was cut
  from the boards with an AI background-removal model and is modest resolution (see
  `web/public/v2/README.md`).
- Phone-width leftovers: home hero sticky note clips at the right edge; carousel dots and footer
  links under 44px tap size.
- A React "state update on a component that hasn't mounted" console error was seen once in a
  long-lived tab during hot reload; not reproducible on clean loads.

## 4. Local environment that is NOT in git (recreate on the new machine)
- **Dev server:** `npm run dev -w web` from the repo root (install with `npm ci` at the ROOT — npm
  workspaces). The Claude desktop launch config was `.claude/launch.json` (gitignored):
  `{"version":"0.0.1","configurations":[{"name":"web","runtimeExecutable":"npm","runtimeArgs":["run","dev","-w","web"],"port":3000}]}`.
- **Image tooling** used for all cutouts (scratchpad only, not a project dependency): a folder with
  `npm i sharp @imgly/background-removal-node`, and this `rmbg.mjs`:
  ```js
  import { removeBackground } from "@imgly/background-removal-node";
  import fs from "node:fs"; import path from "node:path";
  for (const n of process.argv.slice(2)) {
    const src = path.resolve("crops", n + "-src.png");
    const blob = await removeBackground(new Blob([fs.readFileSync(src)], { type: "image/png" }), { model: "medium", output: { format: "image/png", quality: 1 } });
    fs.writeFileSync(path.resolve("crops", n + ".png"), Buffer.from(await blob.arrayBuffer()));
  }
  ```
  Recipes that worked: crop the board region with `sharp.extract`, run rmbg, `trim()`; make a
  cutout's interior opaque by flood-filling "outside" from the border through alpha<40 and setting
  everything else to alpha 255; backdrops = board strip with text/mascot regions filled by row-wise
  interpolation + blur.
- **Full-page screenshots:** headless Edge works:
  `msedge --headless=new --disable-gpu --hide-scrollbars --window-size=1440,6000 --virtual-time-budget=15000 --screenshot=out.png http://localhost:3000/`
  (note: `--window-size=375,…` renders wider than 375; use the in-app browser's mobile preset for
  phone checks).
- **Gotchas:** Turbopack's dev server crashed (exit 3221226505) when several agents edited `web/`
  at once — delete `web/.next/dev` and restart; replacing a file under `web/public` keeps a stale
  copy in `web/.next/dev/cache/images` (delete it, or rename the file as was done for
  `mascot-envelope-2.png` / `track-foliage-2.png`); Testcontainers on Windows needed
  `DOCKER_API_VERSION=1.44` for the API integration tests.
- **API tests:** `cd api && ./gradlew test` (unit) and `./gradlew integrationTest` (needs Docker).

## 5. Memory notes from the previous machine (verbatim intent)
- "Fable designs, Sonnet builds/deploys."
- "Landing v2 stays on `version2` until the user promotes; exact-board mode supersedes the
  honest-copy rules except where the user later asked for honest claims on marketing pages."
- "App v2 overnight build plan: six-agent split, merge each `worktree-agent-*` branch, then a QA
  agent dedupes and smoke-tests every route."

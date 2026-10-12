# @kiwiply/ui — the design system

The **single source of truth for everything visual** in Kiwiply: design tokens, UI
primitives, icons, and the portable `ResumeUpload` form. Consumed **as source** (no build
step) by both surfaces — web (`web/`, Next 16, via `transpilePackages`) and the extension
(`job-autofill/`, WXT/Vite) — so the two read as ONE product.

## The rule (read this first)

> **If it's a visual element that could ever appear on more than one page or surface, it
> lives here.** Never inline an `<svg>` icon, copy a primitive, or hand-roll a
> button/badge/input style in `web/` or `job-autofill/`. Import it — and if it doesn't
> exist yet, add it here first, then import it.

Concretely:

- **Icons** → `src/primitives/icons.tsx`. One component per glyph, exported from the barrel
  (`SearchIcon`, `TrashIcon`, `ChevronDownIcon`, …). To add one: follow `makeIcon` (24×24
  stroke on `currentColor`, per-icon default stroke weight). Size at the call site via
  `className` (`h-4 w-4`) or the `size` prop. A web ESLint rule **fails the build on inline
  `<svg>`** outside this package (the one exception: `web/src/app/opengraph-image.tsx`,
  which `next/og` requires to be self-contained).
- **Primitives** → `src/primitives/`. Button, IconButton, Input, Select, Field, Card, Badge
  (+ Pill/Tag), Switch, ChoiceGroup, ChipInput (strings as chips: skills), SourceChip (provenance label: "From your resume" ...), Meter, Tabs, Toast (`ToastProvider`/`useToast`, optional `action` button such as Undo), Skeleton, Spinner,
  EmptyState, Dialog, SidePanel, SideSheet (left/right slide-in: push / overlay / fullscreen; the Resume Builder's two side-navs), Tooltip, DragHandle (the grip button of a sortable row), Menu, Brand marks. Export new ones from
  `src/index.ts`.
- **Feature components** → `src/`: `ResumeUpload` (the portable resume form) and `JobFitReport`
  (13.3 — one resume against one job, shown the same in the drawer and on the board) and
  `AtsReport` (13.5 — a resume's ATS score, what to fix first, and keyword coverage for a job).
- **Tokens** → `styles/tokens.css` (Tailwind v4 `@theme`; light defaults + `.dark`
  overrides). Never hard-code a color/radius/shadow in a surface — use the token utilities
  (`bg-paper`, `text-ink`, `border-line`, `rounded-[var(--radius)]`, …).
- **Animations** → `styles/animations.css` (`.kiwi-fade-in`, `.kiwi-slide-up`) —
  reduced-motion safe.

In `web/`, keep importing from `@/components/ui` — those files are **thin re-exports** of
this package (plus the few genuinely web-only pieces: `Logo` (next/image), `BetaBadge`,
`PasswordInput`). Extension surfaces import `@kiwiply/ui` directly.

## Adding or changing a primitive

1. Build it dependency-free on the shared tokens (no new runtime deps — this package has
   none, and both bundlers consume it as source).
2. Match the established look: rounded-full buttons, hairline `border-line` borders,
   `--radius*` corners, accent = key CTAs only, text on accent = `text-on-accent` (never
   white). Check `Button.tsx` / `Card.tsx` for the idiom.
3. Make it dark-mode-correct by construction: only token utilities, no raw hex.
4. Export it (and its types) from `src/index.ts`.
5. Both consumers tree-shake — an unused primitive costs nothing, so err on adding here
   rather than locally.

## Resume templates (`src/resume/`)

The Resume Builder's render layer. **A template is `(ResumeDocument, Theme, Capabilities) -> markup` plus a
declaration of what it can show** (DESIGN 6), so the editor preview and the Chromium-printed PDF are the
same string (`renderToStaticMarkup(<ResumePreview doc theme templateId caps />)`).

| File | Job |
|---|---|
| `types.ts` | `ResumeDocument` v2, `Theme` v2 (spacing preset, `showPhoto`), `TemplateCapabilities`, `TemplateMeta` (mirrors the Java contract in `api/.../service/resume/`) |
| `capabilities.ts` | `ATS_STRICT` / `DESIGN_FREE`, `isAtLeastAsStrictAs`, `tightenCapabilities` (admin overrides, tighten-only), `planSections`, `hiddenContent` (what a template switch hides), `controlStates` (what each editor control does), `allowedMarks`. Pure; no registry import. |
| `registry.ts` | `TEMPLATES`, `getTemplate(id)` (unknown id falls back to `modern`), `listTemplates()`, `resolveCapabilities(id, overrides)` (registry profile + `resume.templates.overrides`) |
| `project.ts` / `text.ts` / `json.ts` | doc -> `StructuredResume` (`parsed_json`), doc -> ATS text, byte-exact JSON writer + canonical hash. **Ports of the Java classes; tested byte-for-byte against `__fixtures__/` (copied from `api/src/test/resources/resume-doc/`).** Change a rule in Java first, regenerate the fixtures, then here. They never depend on the template. |
| `fit.ts` | Spacing presets, the 7-step page-fit ladder as deltas on the preset, `resolveTheme(theme, step)`, `pageCount`, `fitToPages` |
| `theme.ts` | defaults, sanitising (hostile values never reach CSS; v1 sliders map to a preset), `applyCapabilities`, the scoped CSS-variable block |
| `templates/shared.tsx` | the renderer: data rules AND capability rules every template reuses (hidden items, dates, links, marks, lists, standard headings, skill-group collapse, photo) |
| `styles/resume.css` | ALL template CSS, `.rz-*` classes; fonts in `fonts/` (Inter + Source Serif 4, Latin variable subsets, SIL OFL licences alongside) |

**The capability contract.** Every template declares `meta.capabilities` (a `TemplateCapabilities`). A template with
`ats: true` must satisfy `isAtLeastAsStrictAs(caps, ATS_STRICT)` (one column, standard headings, bold only, no photo,
no lists, plain colours...); one with `ats: false` stays inside `DESIGN_FREE`; `registry.test.ts` enforces both. The
renderer, not the template, applies the capabilities, and the editor reads the resolved object
(`resolveCapabilities(templateId, config.templates.overrides)`) instead of testing for "ATS". Admin overrides may only
tighten. Content a template does not draw is kept in the document and listed by `hiddenContent` - switching never
deletes anything.

**Rules for a template** (a test enforces the first three on rendered HTML):

1. Only `.rz-*` classes from `styles/resume.css` and the theme variables (`--rz-accent`, `--rz-font-body`,
   `--rz-font-display`, `--rz-size`, `--rz-density`, `--rz-margin`, `--rz-page-w/h`). **No Tailwind, no
   `style=""`, no `<table>`/`<svg>`** for layout; the photo is the one `<img>` (`Photo` from `shared.tsx`).
2. **No hooks, no effects, no `next/*` imports** - the template must survive `renderToStaticMarkup`.
3. Render sections only through `renderSections(doc, theme, caps, only?)` (hidden sections/items, empty ones and
   everything the capabilities forbid are dropped there). The template decides placement (columns, where `Photo`
   goes), never data.
4. ATS-friendly means one reading order in the DOM (sidebar after main), real text, standard section titles,
   contact info in the body.

**Adding a template:** (1) `templates/<id>.tsx` exporting a `TemplateDefinition` (`meta` incl. `capabilities` +
`Render`), (2) add it to `registry.ts` (and its id to `ResumeDocService.KNOWN_TEMPLATE_IDS` in the API), (3) any new
`.rz-*` rules in `styles/resume.css` (scope them with `.rz-tpl-<id>`), (4) a 240x340 PNG
`src/resume/thumbs/<id>.png` (screenshot of `__fixtures__/full.json`), (5) a snapshot test next to it
(`templates/<id>.test.tsx`, copy `modern.test.tsx`) and the registry rule test passing, (6) for `ats: true` the
parse-check gate (DESIGN 7.3). `templates/__test__/designFree.tsx` is the test-only two-column example; it is
registered only inside tests (`registerTemplateForTests`).

`PageFrame` (`src/primitives/PageFrame.tsx`) is the editor's page box: children are laid out at the page's natural width (816 px Letter) and scaled with a CSS transform to fit the container (`fitScale`), reserving the scaled height; `onMeasure` reports `{scale, contentHeight}`. Use it to show a `ResumePreview` anywhere (editor pane, template picker thumbnails).

Tests: `npm test -w packages/ui` (vitest + jsdom, this package only; web runs its own unit tests via `npm run test:unit -w web`, which `npm test -w web` includes).

## Consumption wiring (for reference)

```css
/* web/src/app/globals.css and each extension entrypoint's style.css */
@import "tailwindcss";
@import "@kiwiply/ui/styles/tokens.css";
@import "@kiwiply/ui/styles/animations.css";
/* + an @source directive so Tailwind scans packages/ui/src */
```

- **web**: `next.config.ts` `transpilePackages: ["@kiwiply/ui"]`.
- **extension**: workspace member; `@tailwindcss/vite` in `wxt.config.ts`.
- Gates: `web` — `npm test` (tsc + eslint, incl. the no-inline-svg rule); `job-autofill` —
  `npm run typecheck`. Both compile this package as source, so breakage here fails both.

## Workspace

An npm-workspaces package under the repo-root `package.json`. Run `npm install` at the
**repo root** to materialize it.

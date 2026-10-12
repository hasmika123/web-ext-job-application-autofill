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
  EmptyState, Dialog, SidePanel, SideSheet (left/right slide-in: push / overlay / fullscreen; the Resume Builder's two side-navs), Tooltip, Menu, Brand marks. Export new ones from
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

The Resume Builder's render layer. **A template is `(ResumeDocument, Theme) -> markup`, nothing else**,
so the editor preview and the Chromium-printed PDF are the same string
(`renderToStaticMarkup(<ResumePreview doc theme templateId />)`).

| File | Job |
|---|---|
| `types.ts` | `ResumeDocument` v1, `Theme`, `TemplateMeta` (mirrors the Java contract in `api/.../service/resume/`) |
| `registry.ts` | `TEMPLATES`, `getTemplate(id)` (unknown id falls back to `modern`), `listTemplates()` |
| `project.ts` / `text.ts` / `json.ts` | doc -> `StructuredResume` (`parsed_json`), doc -> ATS text, byte-exact JSON writer + canonical hash. **Ports of the Java classes; tested byte-for-byte against `__fixtures__/` (copied from `api/src/test/resources/resume-doc/`).** Change a rule in Java first, regenerate the fixtures, then here. |
| `fit.ts` | the 7-step page-fit ladder, `resolveTheme(theme, step)`, `pageCount`, `fitToPages` |
| `theme.ts` | defaults, sanitising (hostile values never reach CSS), the scoped CSS-variable block |
| `templates/shared.tsx` | data rules every template reuses (hidden items, dates, links, per-kind item markup) |
| `styles/resume.css` | ALL template CSS, `.rz-*` classes; fonts in `fonts/` (Inter + Source Serif 4, Latin variable subsets, SIL OFL licences alongside) |

**Rules for a template** (a test enforces the first three on rendered HTML):

1. Only `.rz-*` classes from `styles/resume.css` and the theme variables (`--rz-accent`, `--rz-font-body`,
   `--rz-font-display`, `--rz-size`, `--rz-density`, `--rz-margin`, `--rz-page-w/h`). **No Tailwind, no
   `style=""`, no `<table>`/`<img>`/`<svg>`** for layout.
2. **No hooks, no effects, no `next/*` imports** - the template must survive `renderToStaticMarkup`.
3. Render every section kind in `doc.sections[]` order via `renderSections` (it already drops hidden
   sections/items and empty ones, and renders unknown kinds as a generic list). The template decides
   layout, never data. Switching templates must never lose content.
4. ATS-safe means one reading order in the DOM, real text, conventional section titles, contact info in
   the body. Two-column templates declare `atsSafe: "caution"`.

**Adding a template:** (1) `templates/<id>.tsx` exporting a `TemplateDefinition` (`meta` + `Render`),
(2) add it to `registry.ts`, (3) any new `.rz-*` rules in `styles/resume.css` (scope them with
`.rz-tpl-<id>`), (4) a 240x340 PNG `src/resume/thumbs/<id>.png` (screenshot of `__fixtures__/full.json`),
(5) a snapshot test next to it (`templates/<id>.test.tsx`, copy `modern.test.tsx`). Nothing in the API
changes; the web must import `@kiwiply/ui/styles/resume.css` once for the preview.

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

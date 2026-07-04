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
  (+ Pill/Tag), Switch, Tabs, Toast (`ToastProvider`/`useToast`), Skeleton, Spinner,
  EmptyState, Dialog, SidePanel, Tooltip, Menu, Brand marks. Export new ones from
  `src/index.ts`.
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

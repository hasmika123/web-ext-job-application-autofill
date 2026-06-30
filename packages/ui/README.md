# @kiwiply/ui

Shared UI for the Kiwiply **web app** (`web/`, Next 16) and **browser extension**
(`job-autofill/`, WXT/Vite). One source for design tokens, primitives, and the
`ResumeUpload` form — so the two surfaces look and behave the same.

Part of the extension UI-platform build-out — see `../../EXT-UI-PLATFORM-PLAN.md` (Phase W1).
Consumed **as source** (no build step): Next and Vite both transpile this workspace
package directly.

## Status (W1.1)
- ✅ `styles/tokens.css` — the canonical design tokens (brand palette + shape/elevation +
  the Tailwind v4 `@theme inline` mapping). Single source of truth.
- ⏳ React primitives + `ResumeUpload` (moved from web) — **W1.2 / W1.3**.
- ⏳ Web + extension wired to consume this package, and `web/`+`job-autofill/` added as
  workspace members (with their Docker/CI install changes) — **W1.4**.

## Layout
```
styles/tokens.css   design tokens (import this; don't fork the palette)
src/                React primitives + ResumeUpload   (added in W1.3)
```

## Usage (once wired in W1.4)
```css
/* web/src/app/globals.css and the extension's Tailwind entry */
@import "tailwindcss";
@import "@kiwiply/ui/styles/tokens.css";
```
App-specific globals (body styles, focus ring, keyframes) stay in each consumer's own
stylesheet — only **tokens** live here.

## Workspace
This is an npm-workspaces package under the repo-root `package.json`
(`workspaces: ["packages/*"]`). Run `npm install` at the repo root to materialize it.

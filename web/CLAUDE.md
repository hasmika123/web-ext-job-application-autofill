@AGENTS.md

# Dossier web app — working notes

The primary product surface. Next 16 (App Router) + React 19 + TypeScript + Tailwind v4.
Root conventions live in the repo-root `CLAUDE.md`; this file adds web-specific facts.

## Next 16 gotchas (different from older Next / training data)

Confirmed against the bundled docs (`node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`):

- **`cookies()` / `headers()` are async** — `const store = await cookies()`, then
  `store.get(...)` / `store.set(...)`. Forgetting `await` is the #1 trap.
- **Cookies can only be *set/deleted* in a Route Handler or Server Action** (not during
  Server Component render). Our auth flow does exactly that: a login Route Handler
  proxies the Spring API and sets the httpOnly JWT cookie.
- **Auth gating middleware is now `proxy.ts`**, not `middleware.ts` (renamed in 16).
- **Turbopack is the default** for `next dev` and `next build` — no `--turbopack` flag.
  A custom `webpack` config makes `next build` fail; use `turbopack` config instead.
- **`turbopack` config is top-level** in `next.config.ts` (not `experimental.turbopack`).
  We pin `turbopack.root` to `/web` (monorepo + stray home-dir lockfiles confuse root
  inference).
- **Linting is the ESLint CLI** (`eslint`), not `next lint`.

## Hosting model (locked)

- Runs as a **long-running container** via `next start` (build with
  `output: 'standalone'` for a lean image). **No Express / custom server** — Next
  ships its own; a custom server only disables Next optimizations.
- Because it's a container (not serverless), **resume uploads proxy through a Next
  route handler** to the Spring upload endpoint (Option A, permanent) — no ~4.5MB
  serverless body limit. Stream the upload, cap it ~10MB. Presigned direct-to-R2
  (Option B) is only a fallback if this app ever moves to a serverless host.
- Vercel is allowed but not assumed; deploy on Railway/Render/Fly/VPS.

## Conventions here

- **Server talks to Spring, browser talks to Next.** The browser never calls the Spring
  API directly. Next Route Handlers proxy auth + data so the JWT lives in httpOnly
  cookies. The API base URL is `src/lib/config.ts` (`DOSSIER_API_URL`, server env, no
  `NEXT_PUBLIC_`).
- **Sessions: short access token, silent refresh.** Access token ~15 min, refresh ~90
  days (rolling). `src/proxy.ts` (Next 16 `proxy`, was middleware) transparently refreshes
  the access cookie when it's expired but the refresh token is valid, so users aren't
  bounced at the 15-min mark. The `(app)` layout is the *gate* (validates via `/api/account`,
  redirects on 401); the proxy only *renews*. Cookie names + lifetime live in
  `src/lib/cookies.ts` (no `next/headers`, so the proxy can import them).
- **Shared resume parsing**: import the extension's `parser-core.js` (pure JS, no build
  step) rather than reimplementing — it's the single source of truth for resume → fields.
- **Tests**: `npm test` = `tsc --noEmit && eslint .`. `npm run build` is the strongest gate.
- **This machine's npm shell**: a poisoned `COMSPEC` env var breaks npm spawns; `web/.npmrc`
  pins `script-shell` so installs here always work.

/**
 * Public-facing site constants.
 *
 * The canonical origin lives here rather than in `app/layout.tsx` because three
 * places need it and they must never disagree: the metadata base (canonical +
 * OpenGraph URLs), `app/robots.ts` (the `Sitemap:` line), and `app/sitemap.ts`
 * (every `<loc>`). A mismatch there is invisible in dev and silently wrong in
 * Search Console. Not a server-only module — `layout.tsx` is shared code.
 *
 * Apex is canonical; www 301s to it at the edge (see DEPLOY.md).
 */

/** Canonical origin of the marketing + app site. No trailing slash. */
export const SITE_URL = "https://kiwiply.com";

/**
 * Paths that must stay out of search results.
 *
 * Three reasons a path lands here, and all three matter:
 *  - **Token-bearing links** (`/account/activate`, `/newsletter/*`) — crawling one
 *    would *consume* a single-use link before the human clicks it, and the token
 *    would end up in an indexed URL. This is the one group that would actively
 *    break things.
 *  - **Auth-gated app surfaces** (`/dashboard`, `/board`, …, `/admin`) — a crawler
 *    only ever sees the sign-in redirect, so indexing them yields thin duplicates.
 *  - **No search value** (`/api/`, `/login`, `/connect`) — route handlers and
 *    plumbing pages.
 *
 * Trailing-slash entries are directory prefixes; bare entries are exact pages that
 * have no children.
 */
export const NON_INDEXABLE_PATHS = [
  "/api/",
  "/admin",
  "/dashboard",
  "/board",
  "/profile",
  "/resumes",
  "/settings",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/connect",
  "/account/",
  "/newsletter/",
] as const;

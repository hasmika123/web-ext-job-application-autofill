import type { MetadataRoute } from "next";
import { NON_INDEXABLE_PATHS, SITE_URL } from "@/lib/site";

/**
 * Serves /robots.txt (App Router convention file — must sit at the `app/` root, not
 * inside a route group, or it is served as a page instead).
 *
 * Without this file the site 404s on /robots.txt, which crawlers treat as "index
 * everything" — including the auth-gated app shell and the single-use activation and
 * newsletter links. The disallow list is shared with nothing else on purpose: it is
 * the one place that says what is public.
 *
 * `Disallow` is a crawl instruction, not an indexing one: a disallowed URL can still
 * be listed if something links to it. The app surfaces are behind auth and the
 * token links are unguessable, so that residual risk is acceptable here and far
 * smaller than letting crawlers walk them.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [...NON_INDEXABLE_PATHS],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}

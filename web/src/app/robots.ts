import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { NON_INDEXABLE_PATHS, SITE_URL } from "@/lib/site";
import { SURFACE_HEADER } from "@/lib/tenant-host";

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
 *
 * A tenant host (a consultancy's own domain or Kiwiply subdomain) gets its own answer: crawlers stay out of the whole site (its workspace is
 * private) and no Kiwiply sitemap or host is named, because a tenant site never names Kiwiply. `.txt` paths are not rewritten into the tenant
 * tree, so this file is reached on every host; the proxy's surface header (always overwritten) says which one.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  if ((await headers()).get(SURFACE_HEADER) !== "platform") return { rules: [{ userAgent: "*", disallow: "/" }] };
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

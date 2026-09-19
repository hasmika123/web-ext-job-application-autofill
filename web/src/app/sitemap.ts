import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * Serves /sitemap.xml (App Router convention file — same root-placement rule as
 * `robots.ts`). This is the URL handed to Google Search Console and Bing Webmaster
 * Tools; the site had no sitemap at all before, so there was nothing to submit.
 *
 * Only genuinely public, indexable pages belong here. Everything auth-gated or
 * token-bearing is listed in `NON_INDEXABLE_PATHS` instead — a URL that appears in
 * both a sitemap and a robots `Disallow` is a Search Console warning, so the two
 * lists must stay disjoint.
 *
 * `lastModified` is hand-maintained rather than `new Date()`: a build-time timestamp
 * would claim every page changed on every deploy, and a lastmod that's provably wrong
 * is a signal crawlers learn to ignore. Bump the date here when a page's content
 * actually changes.
 */
const PAGES: Array<{ path: string; lastModified: string; priority: number }> = [
  { path: "/", lastModified: "2026-07-01", priority: 1 },
  { path: "/privacy", lastModified: "2026-09-18", priority: 0.3 },
  { path: "/terms", lastModified: "2026-09-17", priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map(({ path, lastModified, priority }) => ({
    url: `${SITE_URL}${path}`,
    lastModified: new Date(lastModified),
    priority,
  }));
}

import type { ReactNode } from "react";
import OpportunitiesPage from "./opportunities/OpportunitiesPage";
import type { ConPageProps } from "./parts";

/**
 * The Consultant workspace's real pages, keyed by the first path segment under `/w/consultant`. The catch-all route calls this once;
 * a page that is not listed (null) keeps the "on the way" screen. Mirrors `marketingPage`: one page = one folder here.
 *
 * `/w/consultant/opportunities/{id}` is the same page with a job open: the catch-all already matches it (the menu item's href is a
 * prefix), so the canonical details URL needs no extra route folder.
 */
export function consultantPage(slug: string[], props: Omit<ConPageProps, "detailId">): ReactNode | null {
  if (slug.length === 0) return null; // Consultant Home is not built yet
  switch (slug[0]) {
    case "opportunities": {
      if (slug.length === 1) return <OpportunitiesPage {...props} detailId={null} />;
      if (slug.length === 2 && /^\d{1,18}$/.test(slug[1])) return <OpportunitiesPage {...props} detailId={Number(slug[1])} />;
      return null;
    }
    default:
      return null;
  }
}

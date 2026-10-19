import type { ReactNode } from "react";
import MarketingHomePage from "./MarketingHomePage";
import TalentPage from "./talent/TalentPage";
import ResumesPage from "./resumes/ResumesPage";
import JobDiscoveryPage from "./jobs/JobDiscoveryPage";
import JobMatchesPage from "./matches/JobMatchesPage";
import OpportunitiesPage from "./opportunities/OpportunitiesPage";
import JobStreamsPage from "./streams/JobStreamsPage";
import SubmissionsPage from "./submissions/SubmissionsPage";
import ApplicationsPage from "./applications/ApplicationsPage";
import InterviewsPage from "./interviews/InterviewsPage";
import FollowupsPage from "./followups/FollowupsPage";
import TasksPage from "./tasks/TasksPage";
import ActivitiesPage from "./activity/ActivitiesPage";
import PerformancePage from "./performance/PerformancePage";
import type { MktPageProps } from "./parts";
import { firstNameOf } from "@/lib/ent/dashboard";
import type { MeTenant } from "@/lib/ent/workspaces";

/**
 * The Marketing workspace's real pages, keyed by the first path segment under `/w/marketing`. The catch-all route calls this once;
 * a page that is not listed keeps the "on the way" screen. One page = one folder here, so
 * pages never edit the same file.
 */
export function marketingPage(slug: string[], props: MktPageProps): ReactNode | null {
  if (slug.length === 0) return <MarketingHomePage {...props} />;
  if (slug.length > 1) return null;
  switch (slug[0]) {
    case "talent":
      return <TalentPage {...props} />;
    case "resumes":
      return <ResumesPage {...props} />;
    case "jobs":
      return <JobDiscoveryPage {...props} />;
    case "matches":
      return <JobMatchesPage {...props} />;
    case "opportunities":
      return <OpportunitiesPage {...props} />;
    case "streams":
      return <JobStreamsPage {...props} />;
    case "submissions":
      return <SubmissionsPage {...props} />;
    case "applications":
      return <ApplicationsPage {...props} />;
    case "interviews":
      return <InterviewsPage {...props} />;
    case "followups":
      return <FollowupsPage {...props} />;
    case "tasks":
      return <TasksPage {...props} />;
    case "activity":
      return <ActivitiesPage {...props} />;
    case "performance":
      return <PerformancePage {...props} />;
    default:
      return null;
  }
}

/** Marketing pages merged into another page's tab in the UI refresh (Phase 1, plan s5): old slug -> the tab's address. */
const MERGED: Record<string, string> = {
  matches: "/w/marketing/jobs?tab=matches",
  streams: "/w/marketing/jobs?tab=sources",
  followups: "/w/marketing/tasks?tab=followups",
};

/** Where an old Marketing address now lives (`/w/marketing/matches` -> Jobs › Matches), or null. */
export function marketingRedirect(slug: string[]): string | null {
  return slug.length === 1 ? (MERGED[slug[0]] ?? null) : null;
}

/**
 * The Marketing workspace page for `slug`, with the props every one of them takes, from the signed-in member. ONE place builds them: the catch-all route and every
 * explicit `[workspace]/<page>` route that must hand the Marketing workspace its own page (D5 of the 2026-10-16 audit: `[workspace]/jobs/page.tsx` shadowed the
 * catch-all and answered "on the way" to a marketer, so `JobDiscoveryPage` never mounted). Null when the member has no organization id or the page is not built.
 */
export function marketingPageFor(me: MeTenant, slug: string[]): ReactNode | null {
  if (!me.org.id) return null;
  const nav = me.workspaces.find((w) => w.key === "marketing")?.nav ?? [];
  const hrefs: Record<string, string> = Object.fromEntries(nav.map((n) => [n.key, n.href]));
  // the tabs that replaced menu rows (Jobs › Matches / Sources, Tasks › Follow-ups) keep their old keys, so "View all" links still land there
  if (hrefs.jobs) {
    hrefs.matches ??= `${hrefs.jobs}?tab=matches`;
    hrefs.streams ??= `${hrefs.jobs}?tab=sources`;
  }
  if (hrefs.tasks) hrefs.followups ??= `${hrefs.tasks}?tab=followups`;
  return marketingPage(slug, { orgId: me.org.id, orgName: me.org.displayName, firstName: firstNameOf(me.person.name), hrefs, selfMemberId: me.member.id });
}

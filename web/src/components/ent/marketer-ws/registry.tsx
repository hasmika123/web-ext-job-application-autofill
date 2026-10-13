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
import type { MktPageProps } from "./parts";

/**
 * The Marketing workspace's real pages, keyed by the first path segment under `/w/marketing`. The catch-all route calls this once;
 * a page that is not listed (tasks, activity, performance for now) keeps the "on the way" screen. One page = one folder here, so
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
    default:
      return null;
  }
}

"use client";

import { Tab, TabList, Tabs } from "@kiwiply/ui";
import PageHeader from "@/components/ent/shell/ShellContext";
import type { MktPageProps } from "../parts";
import { useTabParam } from "../useTabParam";
import JobMatchesPage from "../matches/JobMatchesPage";
import JobStreamsPage from "../streams/JobStreamsPage";
import JobDiscoveryPage from "./JobDiscoveryPage";

/**
 * Jobs: the one page that replaced Job Discovery, Job Matches and Job Streams. The tab is in the URL (`?tab=matches`, `?tab=sources`; Openings is
 * the page without a tab), so the old addresses redirect straight onto the right tab. Only the open tab is mounted, so only its calls are made.
 */
export const JOB_TABS = ["openings", "matches", "sources"] as const;
export type JobTab = (typeof JOB_TABS)[number];
const LABEL: Record<JobTab, string> = { openings: "Openings", matches: "Matches", sources: "Sources" };

export default function JobsPage(props: MktPageProps) {
  const [tab, setTab] = useTabParam(JOB_TABS, "openings");
  return (
    <div data-mkt-jobs data-tab={tab} className="flex flex-col gap-4 sm:gap-5">
      <PageHeader title="Jobs" subtitle="Openings from your sources, matched to your consultants." />
      <Tabs value={tab} onValueChange={(t) => setTab(t as JobTab)} variant="underline" className="ent-tabs ent-card !inline-flex !w-auto max-w-full px-2">
        <TabList aria-label="Jobs views">
          {JOB_TABS.map((t) => (
            <Tab key={t} value={t}>{LABEL[t]}</Tab>
          ))}
        </TabList>
      </Tabs>
      {tab === "openings" ? <JobDiscoveryPage {...props} embedded /> : tab === "matches" ? <JobMatchesPage {...props} embedded /> : <JobStreamsPage {...props} embedded />}
    </div>
  );
}

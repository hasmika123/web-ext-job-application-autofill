import type { Metadata } from "next";
import { loadJobs } from "@/components/app-v2/jobs/data";
import JobsClient from "@/components/app-v2/jobs/JobsClient";

export const metadata: Metadata = { title: "Job Search" };

/**
 * Job Search (board `app-job-search.webp` + the split view `app-job-search-split.webp`). Pro accounts
 * see their real daily matches; everyone else sees the board's sample rows. `?q=` prefills the search
 * (the top bar's search lands here) and `?job=<id>` opens a row's detail panel.
 */
export default async function JobsPage({ searchParams }: { searchParams: Promise<{ q?: string; job?: string }> }) {
  const { q, job } = await searchParams;
  const data = await loadJobs();
  return (
    <JobsClient
      jobs={data.jobs}
      real={data.real}
      matchEnabled={data.matchEnabled}
      initialQuery={q?.slice(0, 200) ?? ""}
      initialSelectedId={job ?? null}
    />
  );
}

import type { Metadata } from "next";
import { loadJobs } from "@/components/app-v2/jobs/data";
import JobsPage from "@/components/app-v3/jobs/JobsPage";

export const metadata: Metadata = { title: "Job Search" };

/**
 * Job Search (app v3, spec 2.2). Pro accounts see their real daily matches; everyone else the board's
 * SAMPLE rows. `?q=` prefills the search (the top bar lands here) and `?job=<id>` opens a row's panel.
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; job?: string }> }) {
  const { q, job } = await searchParams;
  const data = await loadJobs();
  return <JobsPage realJobs={data.real ? data.jobs : null} initialQuery={q?.slice(0, 200) ?? ""} initialSelectedId={job ?? null} />;
}

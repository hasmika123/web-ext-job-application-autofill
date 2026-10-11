import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadJobs } from "@/components/app-v2/jobs/data";
import { findJob, neighbours } from "@/components/app-v2/jobs/job-utils";
import { SIMILAR_JOB_IDS, type SampleJob } from "@/components/app-v2/sample-data";
import JobDetailView from "@/components/app-v2/jobs/JobDetailView";

export const metadata: Metadata = { title: "Job details" };

/**
 * Job detail (board `app-job-detail.webp`). The id is a sample job's slug, or `m-<id>` for one of the
 * user's real daily matches. Previous / Next cycle the same list the search page shows.
 */
export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { jobs } = await loadJobs();
  const job = findJob(jobs, id);
  if (!job) notFound();

  const { prev, next } = neighbours(jobs, id);
  // Similar jobs: the board's pair for sample jobs, otherwise the nearest other matches.
  const fromBoard = SIMILAR_JOB_IDS.map((s) => findJob(jobs, s)).filter((j): j is SampleJob => !!j && j.id !== id);
  const similar = fromBoard.length > 0 ? fromBoard : jobs.filter((j) => j.id !== id).slice(0, 2);

  return <JobDetailView job={job} prev={prev} next={next} similar={similar} />;
}

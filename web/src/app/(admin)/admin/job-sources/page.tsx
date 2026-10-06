import type { Metadata } from "next";
import { serverApiFetch } from "@/lib/api";
import JobSourcesPanel, { type JobSourcesView } from "@/components/admin/JobSourcesPanel";

export const metadata: Metadata = {
  title: "Job sources · Admin · Kiwiply",
  robots: { index: false, follow: false },
};

/**
 * Admin job sources (Phase 13.6a): the public Greenhouse / Lever / Ashby boards daily job matches
 * read — the verified seed list, companies users applied to, and boards added here — with each
 * board's last read, plus what the last nightly run did. Add a board, switch one off, or read them
 * all now.
 */
export default async function AdminJobSourcesPage() {
  const res = await serverApiFetch("/api/admin/job-sources");
  if (!res.ok) {
    return (
      <div className="mx-auto max-w-5xl">
        <h1 className="font-display text-[26px] font-bold tracking-tight text-ink">Job sources</h1>
        <div className="mt-4 rounded-[var(--radius)] border border-line bg-paper p-6 text-sm text-ink-soft">
          Couldn&apos;t load the job sources.
        </div>
      </div>
    );
  }
  const data = (await res.json()) as JobSourcesView;
  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="font-display text-[26px] font-bold tracking-tight text-ink">Job sources</h1>
        <p className="mt-1 text-sm text-ink-soft">
          The public job boards daily job matches read, every night at 02:00 UTC
          {data.nightlyEnabled ? "" : " (switched off on this server)"}. Postings first published in the last 48 hours are kept
          for 7 days.
        </p>
      </header>
      <JobSourcesPanel initial={data} />
    </div>
  );
}

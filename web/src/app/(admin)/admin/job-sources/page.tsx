import type { Metadata } from "next";
import { serverApiFetch } from "@/lib/api";
import type { JobSourcesView } from "@/components/admin/JobSourcesPanel";
import JobSourcesBoard from "@/components/admin-v3/job-sources/JobSourcesBoard";
import { AdminHero } from "@/components/admin-v3/common";

export const metadata: Metadata = {
  title: "Job sources · Admin",
  robots: { index: false, follow: false },
};

/**
 * Admin job sources (Phase 13.6a): the public Greenhouse / Lever / Ashby boards daily job matches
 * read — the verified seed list, companies users applied to, and boards added here — with each
 * board's last read, plus what the last nightly run did. Add a board, switch one off, or read them
 * all now. Presentation: admin-v3/job-sources/JobSourcesBoard (board 16).
 */
export default async function AdminJobSourcesPage() {
  const res = await serverApiFetch("/api/admin/job-sources");
  if (!res.ok) {
    return (
      <div className="mx-auto max-w-[1500px] space-y-4">
        <AdminHero title="Job Sources" subtitle="Connect and manage job sources to import jobs from multiple platforms." note="More jobs. Happier teams." />
        <div className="rounded-2xl border border-v2-line/70 bg-paper p-6 text-sm text-ink-soft">Couldn&apos;t load the job sources.</div>
      </div>
    );
  }
  const data = (await res.json()) as JobSourcesView;
  return <JobSourcesBoard initial={data} />;
}

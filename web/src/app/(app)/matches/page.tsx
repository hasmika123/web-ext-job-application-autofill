import type { Metadata } from "next";
import { serverApiFetch } from "@/lib/api";
import { getPlan } from "@/lib/billing";
import JobMatches, { type MatchesData } from "@/components/matches/JobMatches";

export const metadata: Metadata = { title: "Job matches · Kiwiply" };

/**
 * Daily job matches (Phase 13.6c, Pro): fresh jobs from company job boards, scored against the
 * user's resume and preferences overnight. The page is the switch (and the consent it needs) plus
 * today's list. Free users see what it is and where it lives.
 */
export default async function MatchesPage() {
  const plan = await getPlan();
  const isPro = plan.plan === "PRO";
  let data: MatchesData | null = null;
  if (isPro) {
    const res = await serverApiFetch("/api/profile/job-matches");
    if (res.ok) data = (await res.json().catch(() => null)) as MatchesData | null;
  }
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Job matches</h1>
        <p className="mt-1 text-sm text-muted">
          Fresh jobs from company job boards, posted in the last two days and scored against your resume every morning.
        </p>
      </header>
      <JobMatches isPro={isPro} data={data} />
    </div>
  );
}

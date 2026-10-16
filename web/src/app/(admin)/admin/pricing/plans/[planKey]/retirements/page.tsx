import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EmptyState } from "@kiwiply/ui";
import { serverApiFetch } from "@/lib/api";
import type { RetirementListRow } from "@/lib/admin-retirements";
import PlanLoadError from "@/components/admin-v3/pricing/PlanLoadError";

export const metadata: Metadata = {
  title: "Retirements · Pricing · Admin",
  robots: { index: false, follow: false },
};

/** The plan's retirements: opens the newest one (the plans list sends a retiring plan here), or says there is none. */
export default async function AdminPlanRetirementsPage({ params }: { params: Promise<{ planKey: string }> }) {
  const { planKey } = await params;
  if (!/^[A-Za-z0-9_]{1,40}$/.test(planKey)) notFound();
  const res = await serverApiFetch(`/api/admin/retirements?planKey=${planKey}`).catch(() => null);
  if (!res?.ok) return <PlanLoadError what="the retirements" />;
  const rows = ((await res.json().catch(() => [])) as RetirementListRow[]) ?? [];
  if (rows.length > 0) redirect(`/admin/pricing/retirements/${rows[0].id}`);
  return (
    <div className="mx-auto max-w-[900px] space-y-3">
      <EmptyState title="No retirement for this plan" description="Nothing has been started for it yet." />
      <Link href={`/admin/pricing/plans/${planKey}/retire`} className="inline-flex min-h-11 items-center text-[13px] font-semibold text-v2-blue-ink hover:underline">
        Retire this plan
      </Link>
    </div>
  );
}

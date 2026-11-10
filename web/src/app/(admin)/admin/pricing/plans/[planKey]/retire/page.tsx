import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { serverApiFetch } from "@/lib/api";
import type { Plan, PlanSummary } from "@/lib/admin-plans";
import PlanLoadError from "@/components/admin-v3/pricing/PlanLoadError";
import RetirementWizard from "@/components/admin-v3/pricing/RetirementWizard";

export const metadata: Metadata = {
  title: "Retire a plan · Pricing · Admin",
  robots: { index: false, follow: false },
};

/**
 * The retirement wizard (K10.9). The plan and the plans a subscriber could move to are read here; the impact, coverage and notice preview are read by the
 * wizard through the BFF as the admin changes the successors.
 */
export default async function AdminPlanRetirePage({ params }: { params: Promise<{ planKey: string }> }) {
  const { planKey } = await params;
  if (!/^[A-Za-z0-9_]{1,40}$/.test(planKey)) notFound();
  const [planRes, listRes] = await Promise.all([serverApiFetch(`/api/admin/plans/${planKey}`).catch(() => null), serverApiFetch("/api/admin/plans").catch(() => null)]);
  if (planRes?.status === 404) notFound();
  if (!planRes?.ok) return <PlanLoadError what="the plan" />;
  const plan = (await planRes.json().catch(() => null)) as Plan | null;
  if (!plan) notFound();
  const all = listRes?.ok ? ((await listRes.json().catch(() => [])) as PlanSummary[]) : [];
  const candidates = all
    .filter((p) => p.planKey !== plan.planKey && p.audience === plan.audience && p.status === "PUBLISHED")
    .map((p) => ({ planKey: p.planKey, name: p.name }));
  return <RetirementWizard plan={{ planKey: plan.planKey, name: plan.name, status: plan.status }} candidates={candidates} />;
}

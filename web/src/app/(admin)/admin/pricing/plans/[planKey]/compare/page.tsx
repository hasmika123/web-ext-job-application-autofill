import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { serverApiFetch } from "@/lib/api";
import type { Plan, SubscribersResult } from "@/lib/admin-plans";
import CompareVersions from "@/components/admin-v3/pricing/CompareVersions";
import PlanLoadError from "@/components/admin-v3/pricing/PlanLoadError";

export const metadata: Metadata = {
  title: "Compare versions · Pricing · Admin",
  robots: { index: false, follow: false },
};

const asVersion = (v: string | string[] | undefined): number | null => {
  const s = Array.isArray(v) ? v[0] : v;
  return s && /^\d{1,6}$/.test(s) ? Number(s) : null;
};

/**
 * Compare two versions of a plan (K4.5). Without `?a=&b=` it compares the live version with the newest other one (a draft if there
 * is one). The plan and the subscriber counts are read here; the comparison itself is read by the page through the BFF.
 */
export default async function AdminPlanComparePage({ params, searchParams }: { params: Promise<{ planKey: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { planKey } = await params;
  if (!/^[A-Za-z0-9_]{1,40}$/.test(planKey)) notFound();
  const planRes = await serverApiFetch(`/api/admin/plans/${planKey}`).catch(() => null);
  if (planRes?.status === 404) notFound();
  if (!planRes?.ok) return <PlanLoadError what="the plan" />;
  const plan = (await planRes.json().catch(() => null)) as Plan | null;
  if (!plan || plan.versions.length === 0) notFound();
  const sp = await searchParams;
  const numbers = plan.versions.map((v) => v.version).sort((x, y) => y - x);
  const live = plan.versions.find((v) => v.status === "PUBLISHED")?.version ?? numbers[numbers.length - 1];
  const other = numbers.find((n) => n !== live) ?? live;
  const a = asVersion(sp.a) ?? live;
  const b = asVersion(sp.b) ?? other;
  const subsRes = await serverApiFetch(`/api/admin/plans/${planKey}/subscribers`).catch(() => null);
  const subs = subsRes?.ok ? ((await subsRes.json().catch(() => null)) as SubscribersResult | null) : null;
  return <CompareVersions plan={plan} a={a} b={b} counts={subs?.byVersion ?? {}} />;
}

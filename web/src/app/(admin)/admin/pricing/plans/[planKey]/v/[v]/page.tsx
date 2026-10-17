import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { serverApiFetch } from "@/lib/api";
import type { CatalogProduct, Plan } from "@/lib/admin-plans";
import PlanEditor from "@/components/admin-v3/pricing/PlanEditor";
import PlanLoadError from "@/components/admin-v3/pricing/PlanLoadError";

export const metadata: Metadata = {
  title: "Plan editor · Pricing · Admin",
  robots: { index: false, follow: false },
};

/**
 * The plan editor for one version (K4.2). The plan (with all its versions) and the catalog's products are read here so the first
 * paint is complete; everything after that goes through the BFF. A published version opens read-only.
 */
export default async function AdminPlanEditorPage({ params }: { params: Promise<{ planKey: string; v: string }> }) {
  const { planKey, v } = await params;
  if (!/^[A-Za-z0-9_]{1,40}$/.test(planKey) || !/^\d{1,6}$/.test(v)) notFound();
  const planRes = await serverApiFetch(`/api/admin/plans/${planKey}`).catch(() => null);
  if (planRes?.status === 404) notFound();
  if (!planRes?.ok) return <PlanLoadError what="the plan" />;
  const plan = (await planRes.json().catch(() => null)) as Plan | null;
  const version = plan?.versions?.find((x) => x.version === Number(v));
  if (!plan || !version) notFound();
  const catRes = await serverApiFetch("/api/admin/catalog").catch(() => null);
  const catalog = catRes?.ok ? ((await catRes.json().catch(() => null)) as { products?: CatalogProduct[] } | null) : null;
  return <PlanEditor plan={plan} version={version} products={catalog?.products ?? []} />;
}

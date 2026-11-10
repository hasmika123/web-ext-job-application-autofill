import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { serverApiFetch } from "@/lib/api";
import type { RetirementDetail } from "@/lib/admin-retirements";
import PlanLoadError from "@/components/admin-v3/pricing/PlanLoadError";
import RetirementProgress from "@/components/admin-v3/pricing/RetirementProgress";

export const metadata: Metadata = {
  title: "Retirement progress · Pricing · Admin",
  robots: { index: false, follow: false },
};

/** Progress of one retirement (K10.9): tiles, revenue, decisions over time and the per-subscriber rows. */
export default async function AdminRetirementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{1,18}$/.test(id)) notFound();
  const res = await serverApiFetch(`/api/admin/retirements/${id}`).catch(() => null);
  if (res?.status === 404) notFound();
  if (!res?.ok) return <PlanLoadError what="the retirement" />;
  const detail = (await res.json().catch(() => null)) as RetirementDetail | null;
  if (!detail) notFound();
  return <RetirementProgress initial={detail} />;
}

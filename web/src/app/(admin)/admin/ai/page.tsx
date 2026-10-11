import type { Metadata } from "next";
import { serverApiFetch } from "@/lib/api";
import AiUsagePage, { type AiUsageView } from "@/components/admin-v3/ai/AiUsagePage";

export const metadata: Metadata = {
  title: "AI usage · Admin",
  robots: { index: false, follow: false },
};

/**
 * Admin AI usage (Phase 9.A2.1; cost-based since 13.1c). What server AI actually cost in a UTC
 * month, from the `ai_call` ledger: the total, per user (dearest first, with each user's share of the
 * Pro budget) and per feature. This is the only place dollars appear — users see a percentage.
 * Presentation: admin-v3/ai/AiUsagePage (board 18).
 */
export default async function AdminAiUsagePage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const sp = await searchParams;
  const periodParam = sp.period && /^\d{4}-\d{2}$/.test(sp.period) ? `?period=${sp.period}` : "";

  const res = await serverApiFetch(`/api/admin/ai-usage${periodParam}`);
  const data = res.ok ? ((await res.json()) as AiUsageView) : null;
  return <AiUsagePage data={data} />;
}

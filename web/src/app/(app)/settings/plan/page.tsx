import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import MyPlan from "@/components/billing/MyPlan";
import { serverApiFetch } from "@/lib/api";
import { FREE_PLAN } from "@/lib/billing";
import type { PlanV3 } from "@/lib/subscription/types";

export const metadata: Metadata = { title: "My plan · Settings" };

/**
 * My plan (K5.5): the plan and its add-ons, the impact of any change before it is confirmed, usage and invoices. Personal accounts only: the API answers
 * 404 to an enterprise account, so this page is a 404 for them too (an organization's billing lives on its own tenant pages).
 */
export default async function MyPlanPage() {
  const res = await serverApiFetch("/api/billing/me");
  if (res.status === 401 || res.status === 403) redirect("/login");
  if (res.status === 404) notFound();
  const plan = res.ok ? ((await res.json().catch(() => FREE_PLAN)) as PlanV3) : (FREE_PLAN as PlanV3);
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header>
        <Link href="/settings#billing" className="text-[13px] font-medium text-muted hover:text-ink">
          ← Settings
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink">My plan</h1>
        <p className="mt-1 text-sm text-muted">Your plan, your add-ons, and what any change would cost before you confirm it.</p>
      </header>
      <MyPlan initialPlan={plan} />
    </div>
  );
}

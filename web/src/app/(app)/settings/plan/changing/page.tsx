import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import PlanChangingPage from "@/components/billing/PlanChangingPage";
import { serverApiFetch } from "@/lib/api";
import type { RetirementMe } from "@/lib/subscription/retirement";

export const metadata: Metadata = { title: "Your plan is changing · Settings" };

/**
 * Your plan is changing (K10.10): the notice page behind the banner. Personal accounts only (the API answers 404 to an enterprise account, as it does
 * for My plan). When the API cannot be read the page says so instead of pretending nothing is changing.
 */
export default async function PlanChangingRoute() {
  const res = await serverApiFetch("/api/billing/retirement/me").catch(() => null);
  if (res && (res.status === 401 || res.status === 403)) redirect("/login");
  if (res?.status === 404) notFound();
  const data: RetirementMe | null = res?.ok ? ((await res.json().catch(() => null)) as RetirementMe | null) : null;
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <header>
        <Link href="/settings/plan" className="text-[13px] font-medium text-muted hover:text-ink">
          ← My plan
        </Link>
      </header>
      {data ? (
        <PlanChangingPage initial={data} />
      ) : (
        <p role="alert" className="text-sm text-danger-text">
          We couldn&apos;t load this just now. Your plan has not changed. Reload the page to try again.
        </p>
      )}
    </div>
  );
}

import type { Metadata } from "next";
import SuccessPoller from "@/components/billing/SuccessPoller";
import { safeReturnTo } from "@/lib/subscription/return-to";

export const metadata: Metadata = { title: "Welcome to Pro", robots: { index: false } };

/**
 * Where Stripe returns after a completed checkout (Phase 12.3).
 *
 * This page does **not** grant anything — the webhook does, and it usually lands within a second
 * or two. All this does is wait for our mirror to catch up, which is why it never shows an
 * error: the payment succeeded either way, and telling someone who just paid that something
 * went wrong would be both alarming and untrue.
 */
export default async function BillingSuccessPage({ searchParams }: { searchParams: Promise<{ return_to?: string | string[] }> }) {
  const { return_to } = await searchParams;
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-lg flex-col items-center justify-center gap-4 px-5 py-16 text-center">
      <SuccessPoller returnTo={safeReturnTo(return_to)} />
    </main>
  );
}

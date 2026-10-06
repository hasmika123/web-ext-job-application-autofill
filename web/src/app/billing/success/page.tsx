import type { Metadata } from "next";
import SuccessPoller from "@/components/billing/SuccessPoller";

export const metadata: Metadata = { title: "Welcome to Pro — Kiwiply", robots: { index: false } };

/**
 * Where Stripe returns after a completed checkout (Phase 12.3).
 *
 * This page does **not** grant anything — the webhook does, and it usually lands within a second
 * or two. All this does is wait for our mirror to catch up, which is why it never shows an
 * error: the payment succeeded either way, and telling someone who just paid that something
 * went wrong would be both alarming and untrue.
 */
export default function BillingSuccessPage() {
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-lg flex-col items-center justify-center gap-4 px-5 py-16 text-center">
      <SuccessPoller />
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/Button";

export const metadata: Metadata = { title: "Checkout cancelled", robots: { index: false } };

/**
 * Where Stripe returns when the person backs out of Checkout (set STRIPE_CANCEL_URL to this page; the default is /pricing, which also works).
 * Nothing was charged and nothing changed, and the page says exactly that.
 */
export default function BillingCancelledPage() {
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-lg flex-col items-center justify-center gap-4 px-5 py-16 text-center">
      <h1 className="font-display text-2xl font-semibold text-ink">No charge was made</h1>
      <p className="text-sm text-muted">You left checkout before paying, so nothing changed on your account. Your plan and add-ons are as they were.</p>
      <Link href="/pricing" className={buttonVariants("accent")}>
        Back to pricing
      </Link>
      <Link href="/dashboard" className={buttonVariants("ghost")}>
        Go to your dashboard
      </Link>
    </main>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button, { type ButtonVariant } from "@/components/ui/Button";

type Props = {
  plan: "monthly" | "3mo";
  label?: string;
  variant?: ButtonVariant;
  className?: string;
  /** A signed-out visitor is sent to sign up first; there is nobody to bill yet. */
  signedOut?: boolean;
};

/**
 * Starts a Stripe Checkout and sends the browser to it (Phase 12.3).
 *
 * The error codes matter more than the happy path here — a user who is already subscribed
 * should be told so and handed the portal, not shown "something went wrong".
 */
export default function UpgradeButton({ plan, label = "Upgrade to Pro", variant = "accent", className, signedOut = false }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (signedOut) {
      router.push(`/signup?next=${encodeURIComponent("/pricing")}`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; code?: string };

      if (res.ok && data.url) {
        window.location.href = data.url; // hand off to Stripe's hosted page
        return;
      }
      switch (data.code) {
        case "ALREADY_SUBSCRIBED":
          setError("You're already on Pro. Manage your plan in Settings › Billing.");
          break;
        case "BILLING_DISABLED":
          setError("Payments aren't switched on yet — check back shortly.");
          break;
        default:
          setError("Couldn't start checkout. Please try again.");
      }
    } catch {
      setError("Couldn't reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={start} disabled={busy} variant={variant} className={className}>
        {busy ? "Starting…" : label}
      </Button>
      {error ? <p className="text-[12.5px] text-danger">{error}</p> : null}
    </div>
  );
}

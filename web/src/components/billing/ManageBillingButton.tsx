"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";

/**
 * Opens the Stripe Billing Portal (Phase 12.3).
 *
 * This is the **click-to-cancel** path the FTC rule and California's ARL require — cancelling
 * must be as easy as subscribing — so it is a plain, always-visible button rather than
 * something behind a confirmation maze, and a failure says so out loud instead of silently
 * doing nothing.
 */
export default function ManageBillingButton({ label = "Manage billing" }: { label?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { url?: string; code?: string };
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      setError(
        data.code === "NO_CUSTOMER"
          ? "You don't have a billing account yet."
          : "Couldn't open the billing portal. Please try again.",
      );
    } catch {
      setError("Couldn't reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={open} disabled={busy} variant="ghost" size="sm">
        {busy ? "Opening…" : label}
      </Button>
      {error ? <p className="text-[12.5px] text-danger">{error}</p> : null}
    </div>
  );
}

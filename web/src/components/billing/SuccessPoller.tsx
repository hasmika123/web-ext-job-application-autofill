"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/Button";
import type { Plan } from "@/lib/billing";

/** How long to wait for the webhook before telling the user it's still landing. */
const TIMEOUT_MS = 20_000;
const INTERVAL_MS = 1500;

/**
 * Polls `/api/billing/me` until the plan flips to PRO (Phase 12.3).
 *
 * The payment is already done by the time this renders; we're waiting on Stripe's webhook to
 * reach us. Two consequences for the UI: there is no error state — a timeout says "activating",
 * not "failed" — and there is no retry button, because retrying would do nothing. Both matter:
 * this is the screen someone sees immediately after paying.
 */
export default function SuccessPoller() {
  const [state, setState] = useState<"waiting" | "pro" | "slow">("waiting");

  useEffect(() => {
    let cancelled = false;
    const started = Date.now();

    async function check() {
      if (cancelled) return;
      try {
        const res = await fetch("/api/billing/me", { cache: "no-store" });
        if (res.ok) {
          const plan = (await res.json()) as Plan;
          if (plan.plan === "PRO") {
            if (!cancelled) setState("pro");
            return;
          }
        }
      } catch {
        /* keep waiting — a transient failure here is not the user's problem */
      }
      if (cancelled) return;
      if (Date.now() - started > TIMEOUT_MS) {
        setState("slow");
        return;
      }
      setTimeout(check, INTERVAL_MS);
    }

    check();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "pro") {
    return (
      <>
        <h1 className="font-display text-2xl font-semibold text-ink">You&apos;re on Pro</h1>
        <p className="text-sm text-muted">
          Everything is unlocked. The extension picks it up automatically within a few minutes — or reopen the drawer to
          see it straight away.
        </p>
        <Link href="/dashboard" className={buttonVariants("accent")}>
          Go to your dashboard
        </Link>
      </>
    );
  }

  if (state === "slow") {
    return (
      <>
        <h1 className="font-display text-2xl font-semibold text-ink">Payment received</h1>
        <p className="text-sm text-muted">
          Your subscription is still activating — this occasionally takes a moment longer. Nothing else is needed from
          you; refresh in a minute and it&apos;ll be there.
        </p>
        <Link href="/settings#billing" className={buttonVariants("ghost")}>
          Check billing settings
        </Link>
      </>
    );
  }

  return (
    <>
      <h1 className="font-display text-2xl font-semibold text-ink">Setting up your subscription…</h1>
      <p className="text-sm text-muted">Payment received. This usually takes a second or two.</p>
    </>
  );
}

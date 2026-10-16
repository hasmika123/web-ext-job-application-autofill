"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/Button";
import { MoneyText } from "@kiwiply/ui";
import type { Plan } from "@/lib/billing";
import type { HeldAddon } from "@/lib/subscription/types";

/** How long to wait for the webhook before telling the user it's still landing. */
const TIMEOUT_MS = 20_000;
const INTERVAL_MS = 1500;

type PlanWithAddons = Plan & { addons?: HeldAddon[] };

/**
 * Polls `/api/billing/me` until the plan flips to PRO (Phase 12.3) and the mirror has linked the plan version.
 *
 * The payment is already done by the time this renders; we're waiting on Stripe's webhook to
 * reach us. Two consequences for the UI: there is no error state — a timeout says "activating",
 * not "failed" — and there is no retry button, because retrying would do nothing. Both matter:
 * this is the screen someone sees immediately after paying.
 *
 * K5.3: once linked, the page names the plan and lists the add-ons that are now active (GET /api/billing/me v3). `returnTo` is a same-site path
 * the checkout was started from; the primary button goes there when it is safe.
 */
export default function SuccessPoller({ returnTo }: { returnTo?: string }) {
  const [state, setState] = useState<"waiting" | "pro" | "slow">("waiting");
  const [plan, setPlan] = useState<PlanWithAddons | null>(null);

  useEffect(() => {
    let cancelled = false;
    const started = Date.now();

    async function check() {
      if (cancelled) return;
      try {
        const res = await fetch("/api/billing/me", { cache: "no-store" });
        if (res.ok) {
          const next = (await res.json()) as PlanWithAddons;
          if (next.plan === "PRO") {
            // Linked (planKey set) is the better signal; a plain PRO without it is still accepted after a few polls, so a not-yet-linked
            // subscriber is not held on this page.
            if (next.planKey || Date.now() - started > 6000) {
              if (!cancelled) {
                setPlan(next);
                setState("pro");
              }
              return;
            }
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
    const name = plan?.planName ?? "Pro";
    const addons = plan?.addons ?? [];
    return (
      <>
        <h1 className="font-display text-2xl font-semibold text-ink">You&apos;re on {name}</h1>
        <p className="text-sm text-muted">
          Everything is unlocked. The extension picks it up automatically within a few minutes — or reopen the drawer to
          see it straight away.
        </p>
        {addons.length > 0 && (
          <div className="w-full rounded-[var(--radius)] bg-paper-2 px-4 py-3 text-left" data-testid="success-addons">
            <p className="text-[11.5px] font-bold uppercase tracking-[.08em] text-muted">Your add-ons</p>
            <ul className="mt-2 flex flex-col gap-1.5 text-[14px]">
              {addons.map((a) => (
                <li key={a.featureKey} className="flex items-baseline justify-between gap-3">
                  <span className="text-ink">
                    {a.name}
                    {a.quantity > 1 ? <span className="text-muted"> x{a.quantity}</span> : null}
                  </span>
                  {a.unitMinor != null && plan?.currency ? <MoneyText minor={a.unitMinor} currency={plan.currency} tone="muted" /> : null}
                </li>
              ))}
            </ul>
          </div>
        )}
        <Link href={returnTo ?? "/dashboard"} className={buttonVariants("accent")}>
          {returnTo ? "Continue" : "Go to your dashboard"}
        </Link>
        {plan?.planKey ? (
          <Link href="/settings/plan" className={buttonVariants("ghost")}>
            Manage your plan
          </Link>
        ) : null}
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

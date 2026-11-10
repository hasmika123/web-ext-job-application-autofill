"use client";

import Link from "next/link";
import { StatePill, hasStateMap, registerStateMap } from "@kiwiply/ui";
import { COPY, type LockSummary, type RetirementSummary } from "@/lib/subscription/retirement";

/** The tones of the notice pills (domain "plan-notice"): CHANGING amber, LOCKED grey. Registered once per module load (hot reload safe). */
const DOMAIN = "plan-notice";
if (!hasStateMap(DOMAIN)) registerStateMap(DOMAIN, { CHANGING: "amber", LOCKED: "grey" });

/**
 * The banner of every signed-in page while the subscriber's plan is being retired, or after a fallback while services are read-only
 * (docs/subscriptions/11-plan-retirement.md section 12). It reads the two small objects `GET /api/billing/me` already carries, so a normal page costs no
 * extra request. Calm on purpose: a pill, one sentence with the date, one link; never red, never a countdown. Renders nothing when neither applies.
 */
export default function RetirementBanner({ retirement, lock }: { retirement?: RetirementSummary | null; lock?: LockSummary | null }) {
  if (retirement) {
    return (
      <div role="region" aria-label="Plan change" data-testid="retirement-banner" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-line bg-brown-soft px-4 py-2.5 text-[13.5px] text-brown-deep">
        <StatePill domain={DOMAIN} state="CHANGING" label={retirement.decided ? "Chosen" : "Changing"} />
        <span className="min-w-0 flex-1">
          {COPY.banner(retirement.planName, retirement.effectiveAt)}
          {retirement.lastDay ? ` · ${COPY.lastDay}` : ""}
        </span>
        <Link href="/settings/plan/changing" className="inline-flex min-h-11 items-center font-semibold underline sm:min-h-0">
          {retirement.decided ? "Review your choice" : COPY.bannerCta}
        </Link>
      </div>
    );
  }
  if (lock) {
    return (
      <div role="region" aria-label="Read-only services" data-testid="lock-banner" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-line bg-paper-2 px-4 py-2.5 text-[13.5px] text-ink-soft">
        <StatePill domain={DOMAIN} state="LOCKED" label="Read-only" />
        <span className="min-w-0 flex-1">{COPY.lockBanner(lock.since)}</span>
        <Link href="/settings/plan" className="inline-flex min-h-11 items-center font-semibold text-ink underline sm:min-h-0">
          {COPY.lockBannerCta}
        </Link>
      </div>
    );
  }
  return null;
}

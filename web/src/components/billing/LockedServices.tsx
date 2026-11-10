"use client";

import Link from "next/link";
import { LockIcon } from "@kiwiply/ui";
import { Card } from "@/components/ui";
import { shortDate } from "@/lib/subscription/copy";
import type { EntitlementSet } from "@/lib/subscription/types";

/**
 * "What changed" after a fallback to Free (B4.4; docs/subscriptions/11-plan-retirement.md sections 7 and 12): the services that are read-only now, since
 * when, and how to unlock them. Reads `locked[]` of the entitlements; renders nothing when there is none. Calm wording: the data is safe, it can be read
 * and downloaded, and picking a plan unlocks it at once. Never "deleted", "lost" or "expired".
 */
export default function LockedServices({ ent }: { ent: EntitlementSet | null | "error" }) {
  const locked = ent && ent !== "error" ? (ent.locked ?? []) : [];
  if (locked.length === 0) return null;
  return (
    <Card className="flex flex-col gap-3" id="locked" data-testid="locked-services">
      <div className="flex items-start gap-3">
        <span className="mt-1 flex-none text-muted">
          <LockIcon size={18} aria-hidden />
        </span>
        <div>
          <p className="font-display text-lg font-semibold text-ink">Read-only for now</p>
          <p className="mt-1 text-[14px] text-ink-soft">Your data is safe. You can read and download everything you made. Pick a plan and these unlock at once.</p>
        </div>
      </div>
      <ul className="flex flex-col gap-1.5 text-[14px]">
        {locked.map((l) => (
          <li key={l.featureKey} className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-line px-3 py-2">
            <span className="text-ink">{l.name}</span>
            <span className="text-[12.5px] text-muted">read-only since {shortDate(l.lockedSince)}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <Link href="/pricing" className="inline-flex min-h-11 items-center rounded-full bg-accent px-5 text-sm font-semibold text-on-accent sm:min-h-0 sm:py-[11px]">
          Pick a plan to unlock
        </Link>
        <a href="/api/account/export" download className="inline-flex min-h-11 items-center text-[13.5px] font-semibold text-ink-soft underline sm:min-h-0">
          Download my data
        </a>
      </div>
    </Card>
  );
}

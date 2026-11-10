"use client";

import Link from "next/link";
import { LockIcon } from "@kiwiply/ui";
import { Card } from "@/components/ui";
import { COPY } from "@/lib/subscription/retirement";

/**
 * The calm card a locked service shows in place of its create / run controls (docs/subscriptions/11-plan-retirement.md sections 7.1 and 12): what is
 * locked, that everything made there is still here to read and download, and one way to unlock. Never "deleted", "lost" or "expired". The data list
 * of the service renders as usual beneath it. `exportHref` is the app's own data export where one exists; omit it where there is none.
 */
export default function LockCard({ serviceName, exportHref }: { serviceName: string; exportHref?: string }) {
  return (
    <Card className="flex flex-col gap-2 border-line bg-paper-2" data-testid="lock-card">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex-none text-muted">
          <LockIcon size={18} aria-hidden />
        </span>
        <p className="text-[14px] text-ink-soft">{COPY.lockCard(serviceName)}</p>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pl-[30px]">
        <Link href="/settings/plan" className="inline-flex min-h-11 items-center text-[13.5px] font-semibold text-ink underline sm:min-h-0">
          {COPY.lockCardCta}
        </Link>
        {exportHref ? (
          <a href={exportHref} className="inline-flex min-h-11 items-center text-[13.5px] font-semibold text-ink-soft underline sm:min-h-0" download>
            Download my data
          </a>
        ) : null}
      </div>
    </Card>
  );
}

/**
 * A button that cannot be used while its service is locked: disabled, with the reason as visible text and in `title`, so it is never a silent dead end.
 * Replaces "Tailor", "Run", "New" and the like next to a `LockCard`.
 */
export function LockedAction({ children, serviceName }: { children: string; serviceName: string }) {
  return (
    <Link
      href="/settings/plan"
      aria-label={`${children}: ${serviceName} is locked. Pick a plan to unlock it.`}
      title={`${serviceName} is read-only on your plan. Pick a plan to unlock it.`}
      className="inline-flex min-h-11 items-center rounded-full border border-line bg-paper-2 px-4 text-[13.5px] font-semibold text-muted sm:min-h-0 sm:py-2"
    >
      {COPY.lockCardCta}
    </Link>
  );
}

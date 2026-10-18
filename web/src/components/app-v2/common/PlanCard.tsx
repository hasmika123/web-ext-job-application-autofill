import Link from "next/link";
import { CrownIcon, cn } from "@kiwiply/ui";

/**
 * Sidebar plan card (app v3): amber crown, "Free Plan" bold, "Upgrade for more power" muted and a lime
 * "Upgrade →" pill to /pricing. On Pro it reads "Pro Plan" with a "Manage" pill to /settings#billing.
 * Display only: entitlement is enforced server-side.
 */
export default function PlanCard({
  isPro = false,
  className,
  onNavigate,
}: {
  isPro?: boolean;
  className?: string;
  onNavigate?: () => void;
}) {
  return (
    <div className={className}>
      <div className="rounded-2xl border border-v2-line/70 bg-[linear-gradient(160deg,#FBFFF4_0%,#F1FADF_100%)] p-3.5">
        <div className="flex items-center gap-2">
          <span aria-hidden className="grid h-7 w-7 flex-none place-items-center rounded-lg bg-v2-amber-soft text-v2-amber">
            <CrownIcon size={16} />
          </span>
          <span className="text-[14px] font-extrabold text-ink">{isPro ? "Pro Plan" : "Free Plan"}</span>
        </div>
        <p className="mt-1.5 text-[12.5px] leading-snug text-v2-muted">
          {isPro ? "Thanks for backing Kiwiply." : "Upgrade for more power"}
        </p>
        <Link
          href={isPro ? "/settings#billing" : "/pricing"}
          onClick={onNavigate}
          className={cn(
            "mt-3 inline-flex items-center justify-center rounded-full bg-v2-lime px-4 py-1.5 text-[13px] font-bold text-v2-navy",
            "transition-[filter] hover:brightness-95",
          )}
        >
          {isPro ? "Manage" : "Upgrade →"}
        </Link>
      </div>
    </div>
  );
}

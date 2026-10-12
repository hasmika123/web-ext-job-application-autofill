"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { buttonVariants, InfoIcon } from "@kiwiply/ui";
import { useOrg } from "./OrgContext";

/**
 * The pay banner of a DRAFT workspace (onboarding-invites.md section 2, "Skip for now lands in the DRAFT console with the pay
 * banner"): one calm line at the top of every console page until the workspace is active, with one action. It says what is
 * true (people can't be invited yet) and nothing else; it is hidden on the billing page, where the action lives.
 */
export default function DraftBanner() {
  const { org, can } = useOrg();
  const pathname = usePathname();
  if ((org.status !== "DRAFT" && org.status !== "PENDING_SETUP_FEE") || pathname.startsWith("/org/billing")) return null;
  const pending = org.status === "PENDING_SETUP_FEE";
  return (
    <div role="status" data-draft-banner className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-v2-amber/40 bg-v2-amber-soft px-4 py-3">
      <InfoIcon className="h-5 w-5 flex-none text-v2-amber-ink" />
      <p className="min-w-0 flex-1 basis-56 text-[13.5px] font-medium leading-snug text-v2-amber-ink">
        {pending ? "We're waiting for the setup payment before this workspace goes live." : "This workspace is a draft. Activate it to start inviting people."}
      </p>
      {can("billing.view") && (
        <Link href="/org/billing" className={buttonVariants("primary", "sm", "min-h-11 flex-none sm:min-h-0")}>
          {pending ? "See status" : "Activate"}
        </Link>
      )}
    </div>
  );
}

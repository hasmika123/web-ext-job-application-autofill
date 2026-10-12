"use client";

import { ShieldCheckIcon } from "@kiwiply/ui";
import { removedNotice } from "@/lib/profile-setup/sensitive";

/** "We removed N sensitive values - we never collect those." Shown on the review and the finish summary when any were taken out. */
export default function SensitiveNotice({ removed }: { removed: number }) {
  const text = removedNotice(removed);
  if (!text) return null;
  return (
    <p role="status" className="flex items-start gap-2 rounded-xl bg-accent-soft/60 px-3 py-2.5 text-[13px] font-medium text-accent-deep">
      <ShieldCheckIcon size={16} className="mt-0.5 flex-none" aria-hidden />
      <span>{text}</span>
    </p>
  );
}

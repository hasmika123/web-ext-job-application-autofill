"use client";

import Link from "next/link";
import { EmptyState, buttonVariants, cn } from "@kiwiply/ui";
import ApplicationEmails from "@/components/board/ApplicationEmails";
import { shortDay, statusLabel, type ApplicationDetailData } from "@/lib/applications";

/**
 * Recruiter mail the connected inbox matched to this application. With no mail (and no inbox) it says so and
 * offers the one next step: connect Gmail. Mail about an archived application is never acted on; the reading is
 * shown here as "would have moved to ...", so nothing is silently lost.
 */
export default function EmailsTab({ app }: { app: Pick<ApplicationDetailData, "id" | "mailCount" | "suggestions"> }) {
  const mail = app.mailCount ?? 0;
  const suggestions = app.suggestions ?? [];
  if (mail === 0 && suggestions.length === 0) {
    return (
      <EmptyState
        variant="inline"
        title="No recruiter mail here yet"
        description="Connect your Gmail and replies about this job show up on its timeline on their own."
        action={
          <Link href="/settings/inbox" className={cn(buttonVariants("ghost", "sm"), "min-h-10")}>
            Connect Gmail
          </Link>
        }
      />
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {suggestions.length > 0 && (
        <ul aria-label="Mail that would have moved this application" className="flex flex-col gap-2">
          {suggestions.map((s) => (
            <li key={s.inboxMessageId} className="rounded-xl border border-v2-amber/40 bg-v2-amber-soft/60 px-3 py-2 text-[13px] text-ink">
              <span className="font-semibold">{s.subject || "(no subject)"}</span>
              <span className="block text-[12px] text-ink-soft">
                Would have moved this to {statusLabel(s.to)}
                {s.sentAt ? ` · ${shortDay(s.sentAt)}` : ""}. It is archived, so nothing changed.
              </span>
            </li>
          ))}
        </ul>
      )}
      {mail > 0 && <ApplicationEmails key={`mail-${app.id}`} appId={app.id} />}
    </div>
  );
}

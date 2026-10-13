"use client";

import { useState, type ReactNode } from "react";
import { BellIcon, Button, EmptyState, MemberAvatar, Skeleton } from "@kiwiply/ui";
import { displayName, relativeTime, type Activity } from "@/lib/ent/invitations";

const COLLAPSED = 5;

function line(a: Activity): { text: ReactNode; sub: string | null } {
  const who = <strong className="font-semibold text-ink">{displayName(a)}</strong>;
  const by = a.actor?.name ? `Invited by ${a.actor.name}` : null;
  switch (a.kind) {
    case "INVITED":
      return { text: <>{who} was invited to join</>, sub: by };
    case "ACCEPTED":
      return { text: <>{who} accepted their invitation</>, sub: null };
    case "REVOKED":
      return { text: <>{who}&apos;s invitation was revoked</>, sub: a.actor?.name ? `Revoked by ${a.actor.name}` : null };
    default:
      return { text: <>{who}&apos;s invitation expired</>, sub: null };
  }
}

/** "Recent Invitation Activity": the API's latest events, newest first, with relative times. */
export default function ActivityFeed({ items, now }: { items: Activity[] | null; now?: number }) {
  const [all, setAll] = useState(false);
  const shown = items ? (all ? items : items.slice(0, COLLAPSED)) : [];
  return (
    <section aria-labelledby="inv-activity-h" data-invitation-activity className="min-w-0 rounded-[var(--radius-lg)] border border-line bg-paper p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 id="inv-activity-h" className="flex items-center gap-2 text-[16px] font-bold text-ink">
          <BellIcon aria-hidden size={18} className="text-danger" />
          Recent Invitation Activity
        </h2>
        {items && items.length > COLLAPSED && (
          <Button type="button" variant="accent-soft" size="sm" aria-expanded={all} onClick={() => setAll((v) => !v)}>
            {all ? "Show less" : "View all"}
          </Button>
        )}
      </div>
      {items === null ? (
        <div className="mt-4 space-y-3" role="status" aria-label="Loading activity">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState variant="inline" title="Nothing yet" description="Invitations you send, and what happens to them, show up here." />
      ) : (
        <ul className="mt-3 divide-y divide-line/60">
          {shown.map((a, i) => {
            const { text, sub } = line(a);
            return (
              <li key={`${a.kind}-${a.invitationId ?? i}-${a.at}`} className="flex items-center gap-3 py-2.5">
                <MemberAvatar name={displayName(a)} size={34} />
                <div className="min-w-0 flex-1 text-[13.5px] leading-snug text-ink-soft">
                  <p className="truncate">{text}</p>
                  {sub && <p className="truncate text-[12px] text-muted">{sub}</p>}
                </div>
                <time dateTime={a.at} suppressHydrationWarning className="flex-none text-[12.5px] tabular-nums text-muted">
                  {relativeTime(a.at, now)}
                </time>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

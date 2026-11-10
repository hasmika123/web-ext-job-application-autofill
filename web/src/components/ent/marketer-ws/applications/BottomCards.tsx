"use client";

import { AlertIcon, MemberAvatar } from "@kiwiply/ui";
import { daysText, type ApplicationsView } from "@/lib/ent/marketer-ws/applications";
import { CardSkeleton, CARD, Empty, Head } from "../parts";

/** Below the Applications table: the marketer's overdue actions (the funnel lives on Performance, recent updates on Activity). */

export function OverdueCard({ view, loading, viewAll, canMark, onDone }: { view: ApplicationsView | null; loading: boolean; viewAll: string | null; canMark: boolean; onDone: (id: number) => void }) {
  return (
    <section data-app-card="overdue" className={CARD}>
      <Head icon={AlertIcon} title="Overdue actions" tint="pink" viewAll={viewAll} />
      {loading ? (
        <CardSkeleton />
      ) : !view || view.overdue.length === 0 ? (
        <Empty>Nothing overdue.</Empty>
      ) : (
        <ul className="flex flex-col">
          {view.overdue.map((o) => (
            <li key={o.id} data-overdue-row={o.id} className="flex items-center gap-2.5 border-b border-line py-2 last:border-0">
              <input type="checkbox" checked={false} disabled={!canMark} onChange={() => onDone(o.id)} aria-label={`Mark done: ${o.title}`} className="h-4 w-4 flex-none rounded border-line" />
              <MemberAvatar name={o.consultant.name} src={o.consultant.avatarUrl} size={30} />
              <span className="w-[22%] min-w-0 flex-none truncate text-[13px] font-bold text-ink">{o.consultant.name}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-ink">{o.title}</span>
                <span className="block truncate text-[12px] text-muted">{o.sub}</span>
              </span>
              <span className="flex-none text-[12.5px] font-semibold text-danger-text">{daysText(o.daysOverdue)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

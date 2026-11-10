"use client";

import { ClockIcon, cn } from "@kiwiply/ui";
import { CARD, CardSkeleton, Empty, Head, TH, VIEW_ALL } from "../parts";
import { daysChip, dayText, type FeedbackRow } from "@/lib/ent/marketer-ws/interviews";
import { Person, RowMenu } from "./bits";

const ViewAll = ({ onClick, label }: { onClick: () => void; label: string }) => (
  <button type="button" onClick={onClick} aria-label={label} className={VIEW_ALL}>
    View all
  </button>
);

const DAYS_TONE = { red: "bg-v2-pink-soft text-v2-pink-ink", amber: "bg-v2-amber-soft text-v2-amber-ink", green: "bg-v2-green-soft text-v2-green-ink" } as const;

export function PendingFeedbackCard({ rows, loading, onViewAll, onRecord }: { rows: FeedbackRow[]; loading: boolean; onViewAll: () => void; onRecord: (row: FeedbackRow) => void }) {
  return (
    <section data-card="pending-feedback" className={CARD}>
      <Head icon={ClockIcon} title="Pending feedback" tint="amber">
        <ViewAll onClick={onViewAll} label="View all pending feedback" />
      </Head>
      {loading ? (
        <CardSkeleton />
      ) : rows.length === 0 ? (
        <Empty>No feedback is waiting.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[440px] text-left text-[12.5px]">
            <thead>
              <tr className="bg-paper-2">
                {["Interview date", "Consultant", "Client", "Round", "Days"].map((h) => (
                  <th key={h} className={TH}>{h}</th>
                ))}
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const chip = daysChip(r.daysOverdue);
                return (
                  <tr key={r.id} data-feedback-row={r.id} className="border-b border-line last:border-0">
                    <td className="whitespace-nowrap px-2 py-2 text-ink-soft">{dayText(r.interviewAt)}</td>
                    <td className="px-2"><Person name={r.consultant} avatarUrl={r.avatarUrl} size={24} bold={false} /></td>
                    <td className="px-2 text-ink-soft">{r.client}</td>
                    <td className="px-2 text-ink-soft">{r.round}</td>
                    <td className="px-2">
                      <span data-days-chip={chip.tone} className={cn("inline-block whitespace-nowrap rounded-md px-2 py-0.5 text-[12px] font-semibold", DAYS_TONE[chip.tone])}>
                        {chip.label}
                      </span>
                    </td>
                    <td className="px-1">
                      <RowMenu row={{ status: "PENDING_FEEDBACK", consultant: r.consultant }} label={`Actions for ${r.consultant}`} onAction={() => onRecord(r)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

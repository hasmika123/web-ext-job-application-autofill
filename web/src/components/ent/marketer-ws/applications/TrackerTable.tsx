"use client";

import { ArrowsUpDownIcon, MemberAvatar, SourceLogo, Tooltip, ConsentChip, cn } from "@kiwiply/ui";
import { dueDate, logoFor, shortDate, type Row, type StageKey } from "@/lib/ent/marketer-ws/applications";
import { rowActorLine } from "@/lib/actors";
import { RelationTag, RelTime } from "@/components/app-v3/applications/UpdatedBy";
import { seatViewer } from "@/components/ent/applications/changeAudit";
import RowActions from "./RowActions";

/** The Application Tracker table (board columns, in board order). A detail the consultant has not shared is a dotted "Not shared" with a tooltip. */

const STAGE_CHIP: Record<StageKey, { chip: string; dot: string }> = {
  applied: { chip: "bg-accent-soft text-accent-deep", dot: "bg-blue-500" },
  awaiting: { chip: "bg-v2-violet-soft text-v2-violet-ink", dot: "bg-violet-500" },
  interviewing: { chip: "bg-v2-amber-soft text-v2-amber-ink", dot: "bg-amber-400" },
  offer: { chip: "bg-v2-green-soft text-v2-green-ink", dot: "bg-green-500" },
  hired: { chip: "bg-v2-teal-soft text-v2-teal-ink", dot: "bg-teal-500" },
  not_selected: { chip: "bg-v2-pink-soft text-v2-pink-ink", dot: "bg-red-500" },
};
const TH = "px-2 py-2.5 text-left text-[12.5px] font-semibold text-ink-soft";

function NotShared({ who }: { who: string }) {
  return (
    <Tooltip content={`${who} has not shared this`}>
      <span tabIndex={0} data-not-shared className="cursor-help border-b border-dotted border-muted text-[12.5px] text-muted">
        Not shared
      </span>
    </Tooltip>
  );
}

export default function TrackerTable({
  orgId, rows, perms, selected, onToggle, onToggleAll, sortAsc, onSort, onChanged, selfMemberId,
}: {
  orgId: number;
  rows: Row[];
  perms: { followups: boolean; record: boolean };
  selected: Set<number>;
  onToggle: (id: number) => void;
  onToggleAll: (checked: boolean) => void;
  sortAsc: boolean;
  onSort: () => void;
  onChanged: () => void;
  /** The viewer's own seat: a row they changed does not read "by you" (D2). */
  selfMemberId?: number | null;
}) {
  const me = seatViewer(selfMemberId);
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1100px] text-left text-[13.5px]" data-tracker-table>
        <thead>
          <tr className="bg-paper-2">
            <th className="w-9 rounded-l-lg px-2 py-2.5">
              <input type="checkbox" aria-label="Select all applications" checked={allSelected} onChange={(e) => onToggleAll(e.target.checked)} className="h-4 w-4 rounded border-line" />
            </th>
            <th className={TH}>Consultant</th>
            <th className={TH}>Applied Role</th>
            <th className={TH}>Client</th>
            <th className={TH}>Source</th>
            <th className={TH} aria-sort={sortAsc ? "ascending" : "descending"}>
              <button type="button" onClick={onSort} aria-label="Sort by application date" className="inline-flex items-center gap-1 font-semibold text-ink-soft hover:text-ink">
                Application Date <ArrowsUpDownIcon size={13} aria-hidden />
              </button>
            </th>
            <th className={TH}>Stage</th>
            <th className={TH}>Updated</th>
            <th className={TH}>Owner</th>
            <th className={TH}>Next Action</th>
            <th className="w-9 rounded-r-lg" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const full = r.consultant.consent === "FULL";
            const who = r.consultant.name.split(" ")[0] || "This consultant";
            const chip = STAGE_CHIP[r.stage.key];
            return (
              <tr key={r.id} data-app-row={r.id} data-row-consent={r.consultant.consent} className="border-b border-line last:border-0">
                <td className="px-2 py-2">
                  <input type="checkbox" aria-label={`Select ${r.consultant.name}`} checked={selected.has(r.id)} onChange={() => onToggle(r.id)} className="h-4 w-4 rounded border-line" />
                </td>
                <td className="px-2">
                  <span className="flex items-center gap-2.5 font-bold text-ink">
                    <MemberAvatar name={r.consultant.name} src={r.consultant.avatarUrl} size={34} />
                    <span className="flex flex-col items-start gap-0.5">
                      {r.consultant.name}
                      {!full ? <ConsentChip level="SUMMARY" who={r.consultant.name} className="min-h-5 px-2 text-[11px]" /> : null}
                    </span>
                  </span>
                </td>
                <td className="px-2 text-ink-soft">{full ? r.role : <NotShared who={who} />}</td>
                <td className="px-2 text-ink-soft">{full ? r.client : <NotShared who={who} />}</td>
                <td className="px-2">
                  {full ? (
                    r.source ? (
                      <span className="flex items-center gap-2 text-ink-soft">
                        <SourceLogo source={r.source} src={logoFor(r.source)} size={24} />
                        {r.source}
                      </span>
                    ) : null
                  ) : (
                    <NotShared who={who} />
                  )}
                </td>
                <td className="whitespace-nowrap px-2 text-ink-soft">{full ? shortDate(r.appliedOn) : <NotShared who={who} />}</td>
                <td className="px-2">
                  <span data-stage={r.stage.key} className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[12.5px] font-semibold", chip.chip)}>
                    <span aria-hidden className={cn("h-2 w-2 rounded-full", chip.dot)} />
                    {r.stage.label}
                  </span>
                </td>
                <td className="px-2" data-updated-cell>
                  {full && r.updatedAt ? (
                    <span className="flex flex-col leading-tight">
                      <span className="text-ink-soft"><RelTime iso={r.updatedAt} /></span>
                      {rowActorLine(r.updatedBy, me) ? (
                        <span className="text-[12px] text-muted">
                          {rowActorLine(r.updatedBy, me)} <RelationTag actor={r.updatedBy} me={me} />
                        </span>
                      ) : null}
                    </span>
                  ) : (
                    <span className="text-muted">-</span>
                  )}
                </td>
                <td className="px-2">
                  {r.owner ? (
                    <span className="flex items-center gap-2 text-ink-soft">
                      <MemberAvatar name={r.owner.name} src={r.owner.avatarUrl} size={30} />
                      {r.owner.name}
                    </span>
                  ) : null}
                </td>
                <td className="px-2">
                  {full ? (
                    r.nextAction ? (
                      <span className="flex flex-col leading-tight">
                        <span className="text-ink-soft">{r.nextAction}</span>
                        {r.nextActionDue ? <span className="text-[12.5px] font-semibold text-danger-text">{dueDate(r.nextActionDue)}</span> : null}
                      </span>
                    ) : (
                      <span className="text-muted">-</span>
                    )
                  ) : (
                    <NotShared who={who} />
                  )}
                </td>
                <td className="px-1">
                  <RowActions orgId={orgId} row={r} perms={perms} onChanged={onChanged} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

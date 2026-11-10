"use client";

import { Menu, MoreVerticalIcon } from "@kiwiply/ui";
import type { MenuEntry } from "@kiwiply/ui";
import { STATUS_LABEL, dayText, timeText, type ActivityRow, type ActivityStatus } from "@/lib/ent/marketer-ws/activity";
import { HEAD_ROW, TH, TINTS } from "../parts";
import { Chip, ClientCell, IconTile, PersonCell, STATUS_CHIP, typeIcon } from "./bits";

/**
 * The activity table. Columns: Date and time, Activity, Actor, Consultant, Related to (the client with its logo), Type (the type chip), Status and a kebab. The kebab opens the details; only a manual (logged) row can change status, and only for a caller who may log.
 */

export type RowAction = { kind: "details" } | { kind: "status"; status: ActivityStatus };

export default function ActivityTable({ rows, canLog, onAction }: { rows: ActivityRow[]; canLog: boolean; onAction: (row: ActivityRow, action: RowAction) => void }) {
  return (
    <div className="overflow-x-auto" data-activity-table>
      <table className="w-full min-w-[900px] text-left text-[13px]">
        <thead>
          <tr className={HEAD_ROW}>
            <th className={`${TH} rounded-l-lg pl-3`}>Date and time</th>
            <th className={TH}>Activity</th>
            <th className={TH}>Actor</th>
            <th className={TH}>Consultant</th>
            <th className={TH}>Related to</th>
            <th className={TH}>Type</th>
            <th className={TH}>Status</th>
            <th className="w-9 rounded-r-lg" aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const items: MenuEntry[] = [{ label: "View details", onSelect: () => onAction(r, { kind: "details" }) }];
            if (r.manual && canLog) {
              if (r.status !== "COMPLETED") items.push({ label: "Mark completed", onSelect: () => onAction(r, { kind: "status", status: "COMPLETED" }) });
              if (r.status !== "SCHEDULED") items.push({ label: "Mark scheduled", onSelect: () => onAction(r, { kind: "status", status: "SCHEDULED" }) });
              if (r.status !== "CANCELLED") items.push({ label: "Cancel activity", danger: true, onSelect: () => onAction(r, { kind: "status", status: "CANCELLED" }) });
            }
            return (
              <tr key={r.id} data-activity-row={r.id} className="border-b border-line last:border-0">
                <td className="whitespace-nowrap py-2.5 pl-3 pr-2">
                  <span className="block font-medium text-ink">{dayText(r.at)}</span>
                  <span className="block text-[12px] text-muted">{timeText(r.at)}</span>
                </td>
                <td className="px-2">
                  <span className="flex items-center gap-2.5">
                    <IconTile spec={typeIcon(r.type, r.group)} />
                    <span className="min-w-0">
                      <span className="block font-bold text-ink">{r.title}</span>
                      <span className="block max-w-[260px] truncate text-[12px] text-muted" title={r.subtitle}>
                        {r.subtitle}
                      </span>
                    </span>
                  </span>
                </td>
                <td className="px-2">
                  <PersonCell name={r.actor?.name} url={r.actor?.avatarUrl} />
                </td>
                <td className="px-2">
                  <PersonCell name={r.consultant?.name} url={r.consultant?.avatarUrl} />
                </td>
                <td className="px-2">
                  <ClientCell name={r.client?.name} />
                </td>
                <td className="px-2">
                  <Chip className={TINTS.blue}>{r.groupLabel}</Chip>
                </td>
                <td className="px-2">
                  <span className={`inline-block min-w-[84px] rounded-md px-2.5 py-1 text-center text-[12px] font-semibold ${STATUS_CHIP[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                </td>
                <td className="px-1">
                  <Menu
                    trigger={
                      <button type="button" aria-label={`More for ${r.title}`} className="grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-paper-2">
                        <MoreVerticalIcon size={16} />
                      </button>
                    }
                    items={items}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

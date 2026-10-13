"use client";

import { IconButton, KanbanBoard, Menu, MoreHorizontalIcon } from "@kiwiply/ui";
import type { MenuEntry } from "@kiwiply/ui";
import { formatShort, moveOptions, nextStagesOf, type ApplicationRow, type CloseReason, type Column, type Stage } from "@/lib/ent/applications";
import { MarketerCell } from "./parts";

export interface PipelineProps {
  columns: Column[];
  openId: number | null;
  onOpen: (row: ApplicationRow) => void;
  /** Whether the caller may record moves (the API is the real gate). */
  canMove: boolean;
  onMove: (row: ApplicationRow, stage: Stage, reason?: CloseReason) => void;
  orgName: string;
}

/**
 * The pipeline view: one column per stage, built from the same rows as the table (same filters). There is no dragging: a card moves by its
 * own menu, which records what happened ("Record as Submitted"); the API decides which moves are legal.
 */
export default function PipelineBoard({ columns, openId, onOpen, canMove, onMove, orgName }: PipelineProps) {
  const board = columns.map((c) => ({ id: c.stage, title: c.label, count: c.count, cards: c.items }));
  return (
    <div data-pipeline>
      <KanbanBoard
        label="Applications by stage"
        columns={board}
        cardKey={(c) => String(c.id)}
        emptyLabel="No applications in this stage"
        renderCard={(c) => {
          const items: MenuEntry[] = [{ label: "Open details", onSelect: () => onOpen(c) }];
          if (canMove) {
            const opts = moveOptions(nextStagesOf(c.stage));
            if (opts.length > 0) items.push({ separator: true }, { heading: "Record a move" }, ...opts.map((o) => ({ label: o.label, onSelect: () => onMove(c, o.stage, o.closedReason) })));
          }
          return (
            <div data-card-id={c.id} className={`rounded-xl border bg-paper p-2.5 ${openId === c.id ? "border-accent" : "border-line"}`}>
              <div className="flex items-start gap-1">
                <button type="button" onClick={() => onOpen(c)} className="min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                  <span className="block truncate text-[13px] font-semibold text-ink">{c.jobTitle}</span>
                  <span className="block truncate text-[11.5px] text-muted">{c.code}</span>
                </button>
                <Menu
                  trigger={
                    <IconButton aria-label={`Actions for ${c.code}`} title="Card actions">
                      <MoreHorizontalIcon size={15} />
                    </IconButton>
                  }
                  items={items}
                />
              </div>
              <p className="mt-1.5 truncate text-[12.5px] text-ink-soft">{c.consultant.name}</p>
              <p className="truncate text-[12px] text-muted">{c.client.name} · {orgName}</p>
              <div className="mt-2 flex items-center justify-between gap-2 text-[11.5px] text-muted">
                <span className="min-w-0 truncate">
                  {c.stage === "CLOSED" ? "Closed" : c.nextAction ?? "No next action"}
                  {c.stage !== "CLOSED" && c.nextActionDue ? <span className={c.overdue ? "font-semibold text-danger"  : undefined}> · {formatShort(c.nextActionDue)}</span> : null}
                </span>
                <MarketerCell marketer={c.marketer} />
              </div>
            </div>
          );
        }}
      />
      {columns.some((c) => c.count > c.items.length) && <p className="mt-2 text-[12px] text-muted">Each column shows its 20 most recently moved applications. Use the table (All Applications) with the Stage filter to see the rest.</p>}
    </div>
  );
}

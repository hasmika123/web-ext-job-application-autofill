"use client";

import { useState } from "react";
import type { DragEvent, ReactNode } from "react";
import { cn } from "../primitives/cn";
import DragHandle from "../primitives/DragHandle";
import IconButton from "../primitives/IconButton";
import Menu from "../primitives/Menu";
import useMediaQuery from "../primitives/useMediaQuery";
import { MoreVerticalIcon } from "../primitives/icons";

/**
 * Board pieces (X2.15; 38 s7): `KanbanBoard`, `WorkloadColumn`, `TimelineFeed`.
 */

/* ── KanbanBoard ─────────────────────────────────────────────────────────────────── */

export interface KanbanColumn<T> {
  id: string;
  title: string;
  /** Overrides the count in the header (a server total beyond the loaded cards). */
  count?: number;
  cards: T[];
}

export interface KanbanBoardProps<T> {
  columns: KanbanColumn<T>[];
  cardKey: (card: T) => string;
  renderCard: (card: T, column: KanbanColumn<T>) => ReactNode;
  /** The empty column's one line ("Nothing here yet"). */
  emptyLabel?: string;
  label: string;
  className?: string;
}

/**
 * Columns side by side. On a phone (390) the row scrolls sideways and each column SNAPS to the viewport (85 % wide so the
 * next column peeks); from `xl` (1440) every column shares the width and scrolls vertically on its own. There is NO drag
 * between columns: a card moves by its own menu (the state machine decides what is legal, not the pointer).
 */
export function KanbanBoard<T>({ columns, cardKey, renderCard, emptyLabel = "Nothing here yet", label, className }: KanbanBoardProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      data-kanban
      style={{ ["--kanban-cols" as string]: columns.length }}
      className={cn(
        "-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0",
        "xl:grid xl:snap-none xl:grid-cols-[repeat(var(--kanban-cols),minmax(0,1fr))] xl:overflow-x-visible",
        className,
      )}
    >
      {columns.map((col) => (
        <section
          key={col.id}
          aria-label={col.title}
          data-kanban-column={col.id}
          className="flex w-[85%] flex-none snap-start flex-col rounded-[var(--radius)] border border-line bg-paper-2/50 sm:w-72 xl:w-auto"
        >
          <header className="flex items-center justify-between gap-2 px-3 py-2.5">
            <h3 className="truncate text-[13px] font-bold text-ink">{col.title}</h3>
            <span className="flex-none rounded-full bg-paper px-2 py-[1px] text-[11.5px] font-semibold tabular-nums text-ink-soft">{col.count ?? col.cards.length}</span>
          </header>
          <ul className="flex flex-1 flex-col gap-2 px-2 pb-2 xl:max-h-[70dvh] xl:overflow-y-auto">
            {col.cards.length === 0 ? (
              <li className="px-2 py-4 text-center text-[12.5px] text-muted">{emptyLabel}</li>
            ) : (
              col.cards.map((card) => <li key={cardKey(card)}>{renderCard(card, col)}</li>)
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}

/* ── WorkloadColumn ──────────────────────────────────────────────────────────────── */

export interface WorkloadItem {
  id: string;
  label: ReactNode;
}

export interface WorkloadColumnProps {
  id: string;
  title: string;
  /** How many items this person can carry; the dots show used/free. */
  capacity: number;
  items: WorkloadItem[];
  /** Where an item can go (the other columns). Drives both the desktop drop and the touch menu. */
  moveTargets?: { id: string; label: string }[];
  onMove?: (itemId: string, toColumnId: string) => void;
  className?: string;
}

/** The capacity dots: `filled` of `capacity` (over capacity adds red dots beyond). */
export function capacityDots(capacity: number, used: number): { filled: number; free: number; over: number } {
  const cap = Math.max(0, Math.floor(capacity));
  const n = Math.max(0, Math.floor(used));
  return { filled: Math.min(n, cap), free: Math.max(0, cap - n), over: Math.max(0, n - cap) };
}

const MIME = "text/x-kiwiply-workload-item";

/**
 * One person's column of assigned items. Desktop (a fine pointer): a `DragHandle` on each row and the column accepts drops.
 * Touch: the same move is a "Move to" menu per row (a finger can not drag precisely and the menu is keyboard-reachable).
 */
export function WorkloadColumn({ id, title, capacity, items, moveTargets = [], onMove, className }: WorkloadColumnProps) {
  const touch = useMediaQuery("(pointer: coarse)", false);
  const [over, setOver] = useState(false);
  const dots = capacityDots(capacity, items.length);
  const full = dots.free === 0;
  const canMove = !!onMove && moveTargets.length > 0;

  function drop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    const itemId = e.dataTransfer.getData(MIME);
    if (itemId && onMove) onMove(itemId, id);
  }

  return (
    <section
      aria-label={title}
      data-workload-column={id}
      onDragOver={(e) => {
        if (!touch && onMove && e.dataTransfer.types.includes(MIME)) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
      className={cn("rounded-[var(--radius)] border bg-paper p-3 transition-colors", over ? "border-accent bg-accent-soft/40" : "border-line", className)}
    >
      <header className="mb-2 flex items-center justify-between gap-2">
        <h3 className="truncate text-[13.5px] font-bold text-ink">{title}</h3>
        <span
          role="img"
          aria-label={`${items.length} of ${capacity} used${dots.over > 0 ? `, ${dots.over} over capacity` : ""}`}
          data-capacity={full ? "full" : "open"}
          className="flex flex-none items-center gap-[3px]"
        >
          {Array.from({ length: dots.filled }, (_, i) => (
            <span key={`f${i}`} className="h-2 w-2 rounded-full bg-accent" />
          ))}
          {Array.from({ length: dots.free }, (_, i) => (
            <span key={`o${i}`} className="h-2 w-2 rounded-full border border-line" />
          ))}
          {Array.from({ length: dots.over }, (_, i) => (
            <span key={`x${i}`} className="h-2 w-2 rounded-full bg-danger" />
          ))}
        </span>
      </header>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li
            key={item.id}
            draggable={!touch && canMove}
            onDragStart={(e) => e.dataTransfer.setData(MIME, item.id)}
            className="flex items-center gap-1 rounded-[var(--radius-sm)] border border-line bg-paper-2/40 px-1.5 py-1"
          >
            {!touch && canMove && <DragHandle aria-label="Drag to another column" tabIndex={-1} />}
            <span className="min-w-0 flex-1 truncate px-1 text-[13px] text-ink">{item.label}</span>
            {touch && canMove && (
              <Menu
                trigger={
                  // The trigger button IS the menu button (Menu wires it), so the name is aria-label + a native title tip.
                  <IconButton aria-label="Move to another column" title="Move to another column">
                    <MoreVerticalIcon size={16} />
                  </IconButton>
                }
                items={[{ heading: "Move to" }, ...moveTargets.filter((t) => t.id !== id).map((t) => ({ label: t.label, onSelect: () => onMove?.(item.id, t.id) }))]}
              />
            )}
          </li>
        ))}
        {items.length === 0 && <li className="px-2 py-3 text-center text-[12.5px] text-muted">No one assigned</li>}
      </ul>
    </section>
  );
}

/* ── TimelineFeed ────────────────────────────────────────────────────────────────── */

export type TimelineSource = "application_event" | "pipeline_event";

export interface TimelineEvent {
  id: string;
  /** ISO instant. */
  at: string;
  source: TimelineSource;
  title: ReactNode;
  detail?: ReactNode;
  actor?: { name: string; /** "Marketer" | "Consultant" | "System" ... shown as a small tag. */ tag?: string };
}

/** The merged feed: both sources interleaved, newest first, stable for equal instants (input order wins). */
export function mergeTimeline(...sources: TimelineEvent[][]): TimelineEvent[] {
  return sources
    .flat()
    .map((e, i) => ({ e, i, t: Date.parse(e.at) }))
    .sort((a, b) => (Number.isNaN(b.t) ? 0 : b.t) - (Number.isNaN(a.t) ? 0 : a.t) || a.i - b.i)
    .map((x) => x.e);
}

const WHEN: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false };

export interface TimelineFeedProps {
  events: TimelineEvent[];
  /** Shown for an empty feed. */
  empty?: ReactNode;
  timeZone?: string;
  className?: string;
}

export function TimelineFeed({ events, empty = "Nothing has happened yet.", timeZone, className }: TimelineFeedProps) {
  const rows = mergeTimeline(events);
  if (rows.length === 0) return <p className={cn("py-4 text-center text-[13px] text-muted", className)}>{empty}</p>;
  return (
    <ol className={cn("relative space-y-4 border-l border-line pl-4", className)}>
      {rows.map((e) => (
        <li key={e.id} data-timeline-source={e.source} className="relative text-[13px]">
          <span aria-hidden className={cn("absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-paper", e.source === "pipeline_event" ? "bg-accent" : "bg-muted")} />
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="font-semibold text-ink">{e.title}</span>
            <time dateTime={e.at} suppressHydrationWarning className="text-[12px] tabular-nums text-muted">
              {new Date(e.at).toLocaleString("en-US", { ...WHEN, timeZone })}
            </time>
          </div>
          {e.detail != null && <p className="mt-0.5 break-words text-ink-soft">{e.detail}</p>}
          {e.actor && (
            <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted">
              {e.actor.name}
              {e.actor.tag && <span className="rounded-full bg-paper-2 px-1.5 py-[1px] text-[10.5px] font-semibold uppercase tracking-[.04em] text-ink-soft">{e.actor.tag}</span>}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}

"use client";

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useState } from "react";
import type { CSSProperties, ElementType, HTMLAttributes, ReactNode, Ref } from "react";
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { Announcements, CollisionDetection, DragEndEvent, KeyboardCoordinateGetter, Modifier, UniqueIdentifier } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@kiwiply/ui";

/**
 * Drag-to-reorder for vertical lists, on `@dnd-kit` (the Swap Section panel, the canvas item rows and, in
 * R1.3, the profile lists):
 *
 *   <SortableRoot groups={{ sections: ids }} label={nameOf} onMove={({ id, to }) => ...}>
 *     <SortableGroup group="sections" ids={ids}>
 *       {ids.map((id) => <SortableRow key={id} id={id} group="sections">{(row) => ...}</SortableRow>)}
 *     </SortableGroup>
 *   </SortableRoot>
 *
 * One `SortableRoot` (one `DndContext`) can hold several groups: a drag is restricted to the group it
 * started in (a section never lands among another section's items). Sensors: mouse, touch (a short press
 * on the grip) and keyboard (Space picks up, arrows move, Space drops, Escape cancels, with the sortable
 * coordinate getter limited to the same group). Screen readers hear plain-English announcements
 * ("Picked up Work Experience, position 3 of 9"). `SortableList` is the flat, single-group shortcut.
 */

export interface SortableMove {
  /** The group the row belongs to. */
  group: string;
  id: string;
  from: number;
  /** The index it was dropped on, in the group's order before the move. */
  to: number;
}

export interface SortableRootProps {
  /** The current order of every group (ids). */
  groups: Readonly<Record<string, readonly string[]>>;
  /** What a row is called aloud ("Work Experience"). */
  label: (id: string, group: string) => string;
  onMove: (move: SortableMove) => void;
  children: ReactNode;
}

const TOUCH_PRESS_MS = 120;
const TOUCH_TOLERANCE_PX = 8;
const MOUSE_DISTANCE_PX = 4;

const lockVertical: Modifier = ({ transform }) => ({ ...transform, x: 0 });

const groupOf = (e: { data: { current?: Record<string, unknown> } } | null | undefined): string | null => {
  const g = e?.data.current?.group;
  return typeof g === "string" ? g : null;
};

/**
 * Rows can differ a lot in height (an open section holds its items), which defeats centre- and
 * corner-based collisions. Compare top-left corners instead: the row whose top-left is nearest to the
 * carried row's top-left, among the rows of the same group, is the one being hovered.
 */
const sameGroupOnly: CollisionDetection = ({ active, collisionRect, droppableRects, droppableContainers }) => {
  const group = groupOf(active);
  const hits: Array<{ id: UniqueIdentifier; data: { droppableContainer: (typeof droppableContainers)[number]; value: number } }> = [];
  for (const c of droppableContainers) {
    if (groupOf(c) !== group) continue;
    const r = droppableRects.get(c.id);
    if (!r) continue;
    hits.push({ id: c.id, data: { droppableContainer: c, value: Math.hypot(r.left - collisionRect.left, r.top - collisionRect.top) } });
  }
  return hits.sort((a, b) => a.data.value - b.data.value);
};

/** Keyboard: Up / Down put the carried row's top-left on the previous / next row of its own group. */
const sameGroupCoordinates: KeyboardCoordinateGetter = (event, { context: { active, over, droppableContainers, droppableRects } }) => {
  if (event.code !== "ArrowDown" && event.code !== "ArrowUp") return undefined;
  event.preventDefault();
  if (!active) return undefined;
  const group = groupOf(droppableContainers.get(active.id) ?? null);
  const rows = droppableContainers
    .getEnabled()
    .filter((c) => groupOf(c) === group && droppableRects.has(c.id))
    .sort((a, b) => droppableRects.get(a.id)!.top - droppableRects.get(b.id)!.top);
  const here = rows.findIndex((c) => c.id === (over?.id ?? active.id));
  const next = rows[Math.max(0, Math.min(rows.length - 1, here + (event.code === "ArrowDown" ? 1 : -1)))];
  const rect = next && droppableRects.get(next.id);
  return rect ? { x: rect.left, y: rect.top } : undefined;
};

export function SortableRoot({ groups, label, onMove, children }: SortableRootProps) {
  const dndId = useId();
  const [carrying, setCarrying] = useState(false);
  // Escape cancels the drag (the sensor listens on the document); mark it handled first, in the capture
  // phase, so a sheet or dialog around the list does not also close on that same key press.
  useEffect(() => {
    if (!carrying) return;
    const claimEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") e.preventDefault();
    };
    window.addEventListener("keydown", claimEscape, true);
    return () => window.removeEventListener("keydown", claimEscape, true);
  }, [carrying]);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: MOUSE_DISTANCE_PX } }),
    useSensor(TouchSensor, { activationConstraint: { delay: TOUCH_PRESS_MS, tolerance: TOUCH_TOLERANCE_PX } }),
    useSensor(KeyboardSensor, { coordinateGetter: sameGroupCoordinates }),
  );

  const where = useCallback(
    (id: UniqueIdentifier, group: string | null): string => {
      const ids = (group && groups[group]) || [];
      const i = ids.indexOf(String(id));
      return i < 0 ? "" : `position ${i + 1} of ${ids.length}`;
    },
    [groups],
  );
  const nameOf = useCallback((id: UniqueIdentifier, group: string | null) => label(String(id), group ?? ""), [label]);

  const announcements = useMemo<Announcements>(
    () => ({
      onDragStart: ({ active }) => {
        const g = groupOf(active);
        return `Picked up ${nameOf(active.id, g)}, ${where(active.id, g)}.`;
      },
      onDragOver: ({ active, over }) => {
        const g = groupOf(active);
        return over && over.id !== active.id && groupOf(over) === g ? `${nameOf(active.id, g)} moved to ${where(over.id, g)}.` : undefined;
      },
      onDragEnd: ({ active, over }) => {
        const g = groupOf(active);
        return over && groupOf(over) === g
          ? `Dropped ${nameOf(active.id, g)} at ${where(over.id, g)}.`
          : `Dropped ${nameOf(active.id, g)}. It stays where it was, ${where(active.id, g)}.`;
      },
      onDragCancel: ({ active }) => {
        const g = groupOf(active);
        return `Cancelled. ${nameOf(active.id, g)} is back at ${where(active.id, g)}.`;
      },
    }),
    [nameOf, where],
  );

  const onDragStart = () => setCarrying(true);
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setCarrying(false);
    const group = groupOf(active);
    if (!over || !group || groupOf(over) !== group || active.id === over.id) return;
    const ids = groups[group] ?? [];
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onMove({ group, id: String(active.id), from, to });
  };

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={sameGroupOnly}
      modifiers={[lockVertical]}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable: "To pick up a row, press Space or Enter. Use the arrow keys to move it, Space to drop it, Escape to cancel.",
        },
      }}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setCarrying(false)}
    >
      {children}
    </DndContext>
  );
}

const GroupCtx = createContext<{ group: string; count: number } | null>(null);

/** The rows of one group; the order is `ids`. */
export function SortableGroup({ group, ids, children }: { group: string; ids: readonly string[]; children: ReactNode }) {
  const value = useMemo(() => ({ group, count: ids.length }), [group, ids.length]);
  return (
    <GroupCtx.Provider value={value}>
      <SortableContext items={ids as string[]} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </GroupCtx.Provider>
  );
}

/** What a row renders its grip with: spread onto a `DragHandle`. */
export interface SortableRowApi {
  handleProps: HTMLAttributes<HTMLButtonElement> & { ref: Ref<HTMLButtonElement> };
  isDragging: boolean;
  index: number;
  count: number;
}

export interface SortableRowProps {
  id: string;
  group: string;
  /** A row that cannot be picked up (it still holds its place in the list). */
  disabled?: boolean;
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
  children: (row: SortableRowApi) => ReactNode;
}

export function SortableRow({ id, group, disabled = false, as: Tag = "div", className, style, children }: SortableRowProps) {
  const ctx = useContext(GroupCtx);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging, index } = useSortable({
    id,
    // A row that cannot be picked up still holds its place, and the others can be dropped on it.
    disabled: disabled ? { draggable: true, droppable: false } : false,
    data: { group },
  });
  const rowStyle: CSSProperties = {
    ...style,
    transform: CSS.Translate.toString(transform),
    transition,
    position: "relative",
    zIndex: isDragging ? 20 : undefined,
  };
  return (
    <Tag ref={setNodeRef} style={rowStyle} data-sortable-id={id} data-dragging={isDragging ? "true" : undefined} className={cn(isDragging && "shadow-lg", className)}>
      {children({
        handleProps: { ref: setActivatorNodeRef, ...attributes, ...(disabled ? {} : listeners) },
        isDragging,
        index,
        count: ctx?.count ?? 0,
      })}
    </Tag>
  );
}

/** A flat list with one group: `renderRow` draws a row and puts `handleProps` on a `DragHandle`. */
export function SortableList<T extends { id: string }>({
  items,
  label,
  onMove,
  renderRow,
  group = "list",
  as = "ul",
  rowAs = "li",
  className,
  rowClassName,
}: {
  items: readonly T[];
  label: (item: T) => string;
  onMove: (move: SortableMove) => void;
  renderRow: (item: T, row: SortableRowApi) => ReactNode;
  group?: string;
  as?: ElementType;
  rowAs?: ElementType;
  className?: string;
  rowClassName?: string;
}) {
  const ids = useMemo(() => items.map((i) => i.id), [items]);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const Tag = as;
  const nameOf = useCallback((id: string) => {
    const it = byId.get(id);
    return it ? label(it) : id;
  }, [byId, label]);
  return (
    <SortableRoot groups={{ [group]: ids }} label={nameOf} onMove={onMove}>
      <SortableGroup group={group} ids={ids}>
        <Tag className={className}>
          {items.map((item) => (
            <SortableRow key={item.id} id={item.id} group={group} as={rowAs} className={rowClassName}>
              {(row) => renderRow(item, row)}
            </SortableRow>
          ))}
        </Tag>
      </SortableGroup>
    </SortableRoot>
  );
}

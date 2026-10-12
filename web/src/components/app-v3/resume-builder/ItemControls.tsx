"use client";

import type { RefObject } from "react";
import {
  ArrowDownIcon,
  DragHandle,
  Menu,
  MoreVerticalIcon,
  PencilIcon,
  Tooltip,
  TrashIcon,
  cn,
  iconButtonClass,
  useToast,
} from "@kiwiply/ui";
import type { MenuEntry, ResumeSection } from "@kiwiply/ui";
import { useCanvas, useField } from "./canvasContext";
import { useItemGrip } from "./itemGrip";
import { KIND_META } from "./sectionKinds";
import { nowMs } from "./state/clock";
import { newId } from "./state/ids";

/** A loosely typed view of any item: the canvas reads fields by name and the reducer owns the shapes. */
export type AnyItem = Record<string, unknown> & { id: string; hidden?: boolean; bullets?: Array<{ id: string; text: string }> };

/** The string in `it[key]`, or "". */
export const fieldText = (it: AnyItem, key: string): string => {
  const v = it[key];
  return typeof v === "string" ? v : "";
};

/** What an item is called in labels and toasts ("Senior Engineer · Acme", else "Experience 2"). */
export function itemHeading(section: ResumeSection, it: AnyItem, index: number): string {
  const parts =
    section.kind === "EDUCATION"
      ? [fieldText(it, "degree"), fieldText(it, "school")]
      : section.kind === "SKILLS"
        ? [fieldText(it, "group")]
        : section.kind === "LANGUAGES"
          ? [fieldText(it, "name")]
          : section.kind === "ACHIEVEMENTS" || section.kind === "INTERESTS"
            ? [fieldText(it, "text")]
            : [fieldText(it, "title"), fieldText(it, "org")];
  const text = parts.map((p) => p.trim()).filter(Boolean).join(" · ");
  const clipped = text.length > 40 ? `${text.slice(0, 40)}...` : text; // config-literal-ok: label length, not a limit
  return clipped || `${KIND_META[section.kind].singular} ${index + 1}`;
}

/**
 * The right-hand controls of an item row (DESIGN 10.5): edit (focus the first field), move down,
 * the menu (Move up, Move down, Duplicate, Hide from this resume, Delete) and delete. Deleting
 * shows the "removed - Undo" toast; the Undo undoes the last history step, which is that delete.
 */
export function ItemControls({
  section,
  item,
  index,
  count,
  heading,
  rowRef,
}: {
  section: ResumeSection;
  item: AnyItem;
  index: number;
  count: number;
  heading: string;
  rowRef: RefObject<HTMLElement | null>;
}) {
  const { dispatch, limits } = useCanvas();
  const toast = useToast();
  const grip = useItemGrip();
  const meta = KIND_META[section.kind];
  const base = { sectionId: section.id, itemId: item.id } as const;

  const move = (to: number) => dispatch({ type: "item/move", ...base, to, at: nowMs() });
  const duplicate = () =>
    dispatch({ type: "item/duplicate", ...base, newItemId: newId("i"), newBulletIds: (item.bullets ?? []).map(() => newId("b")), at: nowMs() });
  const hide = () => dispatch({ type: "item/hide", ...base, hidden: true, at: nowMs() });
  const remove = () => {
    dispatch({ type: "item/remove", ...base, at: nowMs() });
    toast({ title: `${meta.singular} removed`, action: { label: "Undo", onClick: () => dispatch({ type: "history/undo" }) } });
  };
  const edit = () => rowRef.current?.querySelector<HTMLElement>("input:not([disabled]), textarea")?.focus();

  const entries: MenuEntry[] = [
    { label: "Move up", onSelect: () => move(index - 1), disabled: index === 0 },
    { label: "Move down", onSelect: () => move(index + 1), disabled: index >= count - 1 },
    { label: "Duplicate", onSelect: duplicate, disabled: count >= limits.items },
    { label: "Hide from this resume", onSelect: hide },
    { separator: true },
    { label: "Delete", onSelect: remove, danger: true },
  ];

  return (
    <div className="flex flex-none items-center gap-0.5 self-start">
      {grip && (
        <Tooltip content="Drag to reorder">
          <DragHandle aria-label={`Drag ${heading} to reorder`} {...grip} />
        </Tooltip>
      )}
      <Tooltip content={`Edit ${heading}`}>
        <button type="button" aria-label={`Edit ${heading}`} onClick={edit} className={cn(iconButtonClass, "max-sm:h-11 max-sm:w-11")}>
          <PencilIcon className="h-4 w-4" />
        </button>
      </Tooltip>
      <Tooltip content={`Move ${heading} down`}>
        <button
          type="button"
          aria-label={`Move ${heading} down`}
          disabled={index >= count - 1}
          onClick={() => move(index + 1)}
          className={cn(iconButtonClass, "max-sm:h-11 max-sm:w-11")}
        >
          <ArrowDownIcon className="h-4 w-4" />
        </button>
      </Tooltip>
      <Tooltip content={`More actions for ${heading}`}>
        <Menu
          items={entries}
          trigger={
            <button type="button" aria-label={`More actions for ${heading}`} className={cn(iconButtonClass, "max-sm:h-11 max-sm:w-11")}>
              <MoreVerticalIcon className="h-4 w-4" />
            </button>
          }
        />
      </Tooltip>
      <Tooltip content={`Delete ${heading}`}>
        <button type="button" aria-label={`Delete ${heading}`} onClick={remove} className={cn(iconButtonClass, "max-sm:h-11 max-sm:w-11")}>
          <TrashIcon className="h-4 w-4" />
        </button>
      </Tooltip>
    </div>
  );
}

/** A hidden item collapses to one line with "Hidden" and "Show" (it stays in the document and out of the render). */
export function HiddenItemRow({
  section,
  item,
  index,
  heading,
}: {
  section: ResumeSection;
  item: AnyItem;
  index: number;
  heading: string;
}) {
  const { dispatch } = useCanvas();
  const toast = useToast();
  const rowField = useField(item.id);
  const meta = KIND_META[section.kind];
  void index;
  return (
    <article {...rowField} data-hidden="true" aria-label={`${heading} (hidden)`} className="flex items-center gap-2 rounded-xl bg-paper-2/70 px-3 py-1.5 text-[13px] text-ink-soft">
      <span className="flex-none rounded bg-paper px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-ink-soft">Hidden</span>
      <span className="min-w-0 flex-1 truncate">{heading}</span>
      <button
        type="button"
        aria-label={`Show ${heading}`}
        onClick={() => dispatch({ type: "item/hide", sectionId: section.id, itemId: item.id, hidden: false, at: nowMs() })}
        className="flex-none rounded-md px-2 py-1 text-[12.5px] font-bold text-v2-green-ink hover:bg-v2-green-soft max-sm:min-h-11"
      >
        Show
      </button>
      <Tooltip content={`Delete ${heading}`}>
        <button
          type="button"
          aria-label={`Delete ${heading}`}
          onClick={() => {
            dispatch({ type: "item/remove", sectionId: section.id, itemId: item.id, at: nowMs() });
            toast({ title: `${meta.singular} removed`, action: { label: "Undo", onClick: () => dispatch({ type: "history/undo" }) } });
          }}
          className={cn(iconButtonClass, "max-sm:h-11 max-sm:w-11")}
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      </Tooltip>
    </article>
  );
}

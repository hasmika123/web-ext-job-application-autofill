"use client";

import { useMemo } from "react";
import type { Dispatch, ReactNode } from "react";
import type { ResumeDocument } from "@kiwiply/ui";
import { SortableRoot, type SortableMove } from "@/components/common/SortableList";
import { track } from "@/lib/analytics";
import { itemHeading, type AnyItem } from "./ItemControls";
import { nowMs } from "./state/clock";
import type { EditorAction } from "./state/types";

/**
 * The drag-and-drop context of the document canvas: one group per section (its item ids), so an item
 * never leaves its section. It is always mounted (the rows only become draggable while the Swap Section
 * panel is open), so opening the panel does not remount the document.
 */
export default function CanvasReorder({ doc, dispatch, children }: { doc: ResumeDocument; dispatch: Dispatch<EditorAction>; children: ReactNode }) {
  const groups = useMemo(() => Object.fromEntries(doc.sections.map((s) => [s.id, (s.items as AnyItem[]).map((it) => it.id)])), [doc.sections]);
  const label = useMemo(() => {
    const names = new Map<string, string>();
    for (const s of doc.sections) (s.items as AnyItem[]).forEach((it, i) => names.set(it.id, itemHeading(s, it, i)));
    return (id: string) => names.get(id) ?? "item";
  }, [doc.sections]);

  const onMove = ({ group, id, to }: SortableMove) => {
    const section = doc.sections.find((s) => s.id === group);
    dispatch({ type: "item/move", sectionId: group, itemId: id, to, at: nowMs() });
    if (section) track("resume_item_reordered", { kind: section.kind.toLowerCase(), via: "drag" });
  };

  return (
    <SortableRoot groups={groups} label={label} onMove={onMove}>
      {children}
    </SortableRoot>
  );
}

"use client";

import type { ReactNode } from "react";
import { SortableRow } from "@/components/common/SortableList";
import { ItemGripProvider } from "./itemGrip";

/** One item row of the canvas as a sortable (the grip shows while `reorder`, i.e. the Swap Section panel is open). */
export default function SortableItem({ id, sectionId, reorder, children }: { id: string; sectionId: string; reorder: boolean; children: ReactNode }) {
  return (
    <SortableRow id={id} group={sectionId} disabled={!reorder}>
      {(row) => <ItemGripProvider value={reorder ? row.handleProps : null}>{children}</ItemGripProvider>}
    </SortableRow>
  );
}

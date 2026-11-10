"use client";

import type { ReactNode } from "react";
import { SortableRow } from "@/components/common/SortableList";
import { LINK_TARGET } from "./canvasStyles";
import { ItemGripProvider } from "./itemGrip";
import { useLinkTarget } from "./moveLink";

/**
 * One item row of the canvas as a sortable (the grip shows while `reorder`, i.e. the Swap Section panel is
 * open) and the link target the panel's hover / focus ring and the move flash land on (`moveLink.ts`).
 */
export default function SortableItem({ id, sectionId, reorder, children }: { id: string; sectionId: string; reorder: boolean; children: ReactNode }) {
  const link = useLinkTarget(id, "canvas");
  return (
    <SortableRow id={id} group={sectionId} disabled={!reorder}>
      {(row) => (
        <ItemGripProvider value={reorder ? row.handleProps : null}>
          {/* the highlight (panel row hovered) and the flash (just moved) land on this box; it is also what scrolls into view */}
          <div {...link} className={LINK_TARGET}>
            {children}
          </div>
        </ItemGripProvider>
      )}
    </SortableRow>
  );
}

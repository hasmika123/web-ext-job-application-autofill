"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { BottomSheet, Dialog, useNarrow } from "@kiwiply/ui";

/** A Dialog from `md` up, a BottomSheet on a phone; focus returns to whatever opened it. */
export default function Sheet({ id, open, onClose, title, description, children }: { id: string; open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode }) {
  const narrow = useNarrow();
  const trigger = useRef<HTMLElement | null>(null);
  // Before any child effect moves focus into the sheet, remember who had it.
  useLayoutEffect(() => {
    if (open) trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, [open]);
  if (narrow) {
    return (
      <BottomSheet id={id} open={open} onClose={onClose} title={title} description={description} returnFocusTo={trigger} defaultSnap="full">
        {children}
      </BottomSheet>
    );
  }
  return (
    <Dialog open={open} onClose={onClose} title={title} description={description}>
      {children}
    </Dialog>
  );
}

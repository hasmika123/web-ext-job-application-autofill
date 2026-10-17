"use client";

import type { ReactNode } from "react";
import { BottomSheet, useMediaQuery } from "@kiwiply/ui";
import { Dialog } from "@/components/ui";

/**
 * One sheet for the billing flows (05-customer-ux.md section 3): a bottom sheet on a phone (390 px), a centred dialog from 640 px up. Both come from
 * `@kiwiply/ui`; this only picks one.
 */
export default function ResponsiveSheet({
  open,
  onClose,
  title,
  description,
  id,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  /** DOM id of the sheet (the bottom sheet needs one). */
  id: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const phone = useMediaQuery("(max-width: 639px)", false);
  if (!open) return null;
  if (phone) {
    return (
      <BottomSheet open onClose={onClose} title={title} description={description} id={id} footer={footer} defaultSnap="full">
        {children}
      </BottomSheet>
    );
  }
  return (
    <Dialog open onClose={onClose} title={title} description={description} footer={footer} className="sm:max-w-md">
      {children}
    </Dialog>
  );
}

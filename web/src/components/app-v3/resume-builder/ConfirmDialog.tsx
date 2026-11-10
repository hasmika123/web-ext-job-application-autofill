"use client";

import type { ReactNode } from "react";
import { Button, Dialog } from "@kiwiply/ui";

/**
 * A small yes/no confirmation (the header bar's "Restore v5?", "Everyone with the link will lose access", ...). Built on
 * the shared `Dialog`; the confirm button is the accent one unless `danger`, and both buttons are disabled while `busy`.
 * Rendered AFTER any side sheet in the tree so it stacks above it (both sit at the same z-index).
 */
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
  children,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? "danger" : "accent"} onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}

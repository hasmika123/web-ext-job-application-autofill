/**
 * undoToast: the one "do it now, offer Undo" toast (DECISIONS #32, APP-E2E-PLAN section 7.2). A reversible but
 * destructive action (archive, remove from a list, dismiss, pause) acts immediately and calls this, so every page
 * shows the same toast: a title, one "Undo" button, gone after `ms` (6 s).
 *
 *   const toast = useToast();
 *   archive(id);
 *   undoToast(toast, { title: "Application archived", onUndo: () => restore(id) });
 *
 * Clicking Undo runs `onUndo` and dismisses the toast (the toast primitive does the dismissing).
 */
import type { ToastOptions } from "@kiwiply/ui";

/** How long the undo toast stays: 6 s (E2E-U0.0; section 7.2 of the plan says "5 s", the story and section 2.3 say 6). */
export const UNDO_TOAST_DEFAULT_MS = 6000;

export interface UndoToastOptions {
  title: ToastOptions["title"];
  description?: ToastOptions["description"];
  /** Reverses the action. */
  onUndo: () => void;
  /** Time on screen (default 6 s). */
  ms?: number;
  /** The button label (default "Undo"). */
  label?: string;
}

/** The function `useToast()` returns. */
export type ToastFn = (opts: ToastOptions) => void;

export function undoToast(toast: ToastFn, { title, description, onUndo, ms = UNDO_TOAST_DEFAULT_MS, label = "Undo" }: UndoToastOptions): void {
  toast({ title, description, duration: ms, action: { label, onClick: onUndo } });
}

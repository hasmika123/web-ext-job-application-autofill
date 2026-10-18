import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { GripIcon } from "./icons";
import { cn } from "./cn";

/**
 * DragHandle - the six-dot grip button of a sortable row (Swap Section, the canvas item rows, the
 * profile lists). It is a real `<button>` so it is reachable by keyboard; spread the sortable's
 * `attributes` and `listeners` onto it and pass its `ref`. `touch-action: none` keeps a finger on the
 * grip from scrolling the page instead of dragging. The target is 44 px on touch, 32 px with a mouse.
 * `disabled` draws the greyed, non-draggable grip (e.g. a row that always stays first).
 */
export const dragHandleClass =
  "inline-flex h-8 w-6 flex-none touch-none cursor-grab items-center justify-center rounded-[var(--radius-sm)] text-muted " +
  "transition-colors hover:bg-paper-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 " +
  "focus-visible:outline-accent active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40 " +
  "disabled:hover:bg-transparent disabled:hover:text-muted max-sm:h-11 max-sm:w-8";

export type DragHandleProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">;

const DragHandle = forwardRef<HTMLButtonElement, DragHandleProps>(function DragHandle({ className, type = "button", ...props }, ref) {
  return (
    <button ref={ref} type={type} className={cn(dragHandleClass, className)} {...props}>
      <GripIcon className="h-3.5 w-3.5" />
    </button>
  );
});

export default DragHandle;

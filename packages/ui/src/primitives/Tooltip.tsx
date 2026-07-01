import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * Tooltip — a lightweight, dependency-free hover/focus label. CSS-only reveal (group-hover
 * + group-focus-within) so there's no JS state or positioning library; good enough for the
 * short hints we need on icon buttons. The bubble is aria-hidden decorative — put the real
 * accessible name on the trigger via aria-label. Non-interactive content only.
 */
export type TooltipSide = "top" | "bottom" | "left" | "right";

const SIDE: Record<TooltipSide, string> = {
  top: "bottom-full left-1/2 mb-1.5 -translate-x-1/2",
  bottom: "top-full left-1/2 mt-1.5 -translate-x-1/2",
  left: "right-full top-1/2 mr-1.5 -translate-y-1/2",
  right: "left-full top-1/2 ml-1.5 -translate-y-1/2",
};

export interface TooltipProps {
  content: ReactNode;
  side?: TooltipSide;
  children: ReactNode;
  className?: string;
}

export default function Tooltip({ content, side = "top", children, className }: TooltipProps) {
  return (
    <span className={cn("group relative inline-flex", className)}>
      {children}
      <span
        role="tooltip"
        aria-hidden
        className={cn(
          "pointer-events-none absolute z-50 whitespace-nowrap rounded-[var(--radius-sm)] bg-ink px-2 py-1 " +
            "text-[11px] font-medium text-paper opacity-0 shadow-[var(--shadow)] transition-opacity duration-150 " +
            "group-hover:opacity-100 group-focus-within:opacity-100",
          SIDE[side],
        )}
      >
        {content}
      </span>
    </span>
  );
}

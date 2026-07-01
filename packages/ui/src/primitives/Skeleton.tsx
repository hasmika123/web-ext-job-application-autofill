import type { HTMLAttributes } from "react";
import { cn } from "./cn";

/**
 * Skeleton — a pulsing placeholder block for loading states. Size it with layout utilities
 * (h-*, w-*) via className. Honors prefers-reduced-motion through Tailwind's animate-pulse.
 */
export default function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse rounded-[var(--radius)] bg-paper-2 motion-reduce:animate-none", className)}
      {...props}
    />
  );
}

import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * Loading placeholder. Size it via `className` (e.g. `h-4 w-32`).
 * Used for server-fetched lists while data loads (R6.2 wires these in).
 */
export default function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse rounded-[var(--radius)] bg-paper-2", className)}
      {...props}
    />
  );
}

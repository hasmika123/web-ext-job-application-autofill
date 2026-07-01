import type { SVGProps } from "react";
import { cn } from "./cn";

/**
 * Spinner — a small indeterminate loading ring (inline SVG, currentColor). Use inside
 * buttons or beside "Loading…" copy. Size via className (defaults to 1em so it tracks text).
 */
export interface SpinnerProps extends SVGProps<SVGSVGElement> {
  label?: string;
}

export default function Spinner({ className, label = "Loading", ...props }: SpinnerProps) {
  return (
    <svg
      role="status"
      aria-label={label}
      viewBox="0 0 24 24"
      fill="none"
      className={cn("h-[1em] w-[1em] animate-spin", className)}
      {...props}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

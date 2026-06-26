import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export const cardClass =
  "bg-paper border border-line rounded-[var(--radius-lg)] shadow-[var(--shadow)]";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Add default inner padding (p-6). Off by default so the surface stays neutral. */
  padded?: boolean;
}

/** Warm paper surface (ported from the mockup `.card`). Add padding via `padded` or `className`. */
export default function Card({ padded, className, ...props }: CardProps) {
  return <div className={cn(cardClass, padded && "p-6", className)} {...props} />;
}

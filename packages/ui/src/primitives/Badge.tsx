import type { HTMLAttributes } from "react";
import { cn } from "./cn";

/**
 * Badge — a small pill for status/labels. Tints come from the shared tokens, so each
 * variant reads correctly in light and dark. Keep copy short (a word or two).
 */
export type BadgeVariant = "neutral" | "accent" | "brown" | "ok" | "warn" | "danger";

const BASE =
  "inline-flex items-center gap-1 rounded-[var(--radius-pill)] border px-2.5 py-0.5 " +
  "text-[11px] font-semibold leading-none whitespace-nowrap";

const VARIANTS: Record<BadgeVariant, string> = {
  neutral: "bg-paper-2 text-ink-soft border-line",
  accent: "bg-accent-soft text-accent-deep border-transparent",
  brown: "bg-brown-soft text-brown-deep border-transparent",
  ok: "bg-accent-soft text-accent-deep border-transparent",
  warn: "bg-brown-soft text-brown-deep border-transparent",
  danger:
    "text-danger border-[color-mix(in_srgb,var(--danger)_35%,transparent)] " +
    "bg-[color-mix(in_srgb,var(--danger)_12%,transparent)]",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export default function Badge({ variant = "neutral", className, ...props }: BadgeProps) {
  return <span className={cn(BASE, VARIANTS[variant], className)} {...props} />;
}

import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "accent" | "ghost" | "danger";
export type ButtonSize = "md" | "sm";

const BASE =
  "inline-flex items-center justify-center gap-2 font-body font-semibold leading-none " +
  "rounded-full cursor-pointer no-underline select-none " +
  "transition-[transform,box-shadow,opacity,filter] duration-150 active:translate-y-px " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " +
  "disabled:opacity-50 disabled:pointer-events-none";

const VARIANTS: Record<ButtonVariant, string> = {
  // Primary = ink (charcoal), NOT green. Green is the accent (key CTAs only).
  primary: "bg-ink text-paper hover:shadow-[var(--shadow)]",
  // Text/icons ON the lime fill must be charcoal (--on-accent), never white.
  accent: "bg-accent text-on-accent hover:brightness-95",
  ghost: "bg-transparent text-ink border border-line hover:bg-paper-2",
  danger: "bg-danger text-paper hover:brightness-95",
};

const SIZES: Record<ButtonSize, string> = {
  md: "px-5 py-[11px] text-sm",
  sm: "px-3.5 py-2 text-[13px]",
};

/** Class string for the button look — use on `<Link>`/`<a>` that should look like a button. */
export function buttonVariants(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className?: string,
): string {
  return cn(BASE, VARIANTS[variant], SIZES[size], className);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export default function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button type={type} className={buttonVariants(variant, size, className)} {...props} />
  );
}

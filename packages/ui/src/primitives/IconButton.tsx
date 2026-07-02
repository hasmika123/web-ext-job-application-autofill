import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

/**
 * IconButton — the one canonical square icon button (close, settings, and other icon-only
 * affordances) so every "generic" button reads the same across the app: 32x32, radius-md,
 * muted -> ink, subtle paper-2 hover, accent focus ring. Pass an icon (SVG / Tabler) as children
 * and an `aria-label` (icon-only buttons need one).
 */
export const iconButtonClass =
  "inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius)] text-muted " +
  "transition-colors hover:bg-paper-2 hover:text-ink focus-visible:outline-2 " +
  "focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50 disabled:pointer-events-none";

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { className, type = "button", ...props },
  ref,
) {
  return <button ref={ref} type={type} className={cn(iconButtonClass, className)} {...props} />;
});

export default IconButton;

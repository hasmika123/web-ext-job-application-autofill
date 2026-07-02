import type { HTMLAttributes } from "react";
import { cn } from "./cn";

/**
 * Card — the standard surface container: warm paper, hairline border, soft elevation.
 * Classes resolve against the shared tokens (styles/tokens.css) so it flips with dark mode.
 * Sub-parts (CardHeader/CardTitle/CardDescription/CardFooter) give a consistent internal
 * rhythm for sectioned layouts (e.g. the options page). All are plain styled `<div>`s.
 */
export const cardClass =
  "bg-paper text-ink border border-line rounded-[var(--radius-lg)] shadow-[var(--shadow)]";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Apply the default inner padding. Turn off for cards that manage their own spacing. */
  padded?: boolean;
}

export default function Card({ className, padded = true, ...props }: CardProps) {
  return <div className={cn(cardClass, padded && "p-6", className)} {...props} />;
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mb-3 flex flex-col gap-1", className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("font-display text-base leading-tight text-ink", className)} {...props} />;
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-[13px] leading-relaxed text-muted", className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("mt-4 flex items-center gap-2 border-t border-line pt-4", className)} {...props} />
  );
}

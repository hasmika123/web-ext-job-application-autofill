import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";
import { cn } from "./cn";

/**
 * Bare styled `<input>` — mirror of the web app's `@/components/ui/Input`. Copied so
 * @kiwiply/ui is self-contained; the design system unifies primitives in W5.1. The
 * Tailwind classes resolve against the shared tokens (see styles/tokens.css).
 */
export const inputClass =
  "w-full border border-line bg-paper rounded-[var(--radius)] px-[13px] py-[11px] " +
  "text-[16px] sm:text-sm font-body text-ink outline-none placeholder:text-muted " +
  "focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-soft)] " +
  "aria-[invalid=true]:border-danger aria-[invalid=true]:focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-danger)_22%,transparent)] " +
  "disabled:opacity-60 disabled:cursor-not-allowed";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(inputClass, className)} {...props} />;
});

export default Input;

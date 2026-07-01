import { forwardRef } from "react";
import type { SelectHTMLAttributes } from "react";
import { cn } from "./cn";

/**
 * Select — a styled NATIVE `<select>` (native is the reliable choice in an extension: no
 * portal/z-index fights with page content, keyboard + a11y come free). Matches the Input
 * treatment and adds a chevron. Pass `<option>`s as children.
 */
export const selectClass =
  "w-full appearance-none border border-line bg-paper rounded-[var(--radius)] " +
  "pl-[13px] pr-9 py-[11px] text-[16px] sm:text-sm font-body text-ink outline-none " +
  "focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)] " +
  "aria-[invalid=true]:border-danger " +
  "disabled:opacity-60 disabled:cursor-not-allowed";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, children, ...props },
  ref,
) {
  return (
    <span className="relative block">
      <select ref={ref} className={cn(selectClass, className)} {...props}>
        {children}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 20 20"
        fill="none"
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
      >
        <path d="M6 8l4 4 4-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
});

export default Select;

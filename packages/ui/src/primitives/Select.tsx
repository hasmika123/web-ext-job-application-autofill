import { forwardRef } from "react";
import type { SelectHTMLAttributes } from "react";
import { cn } from "./cn";
import { inputClass } from "./Input";

/**
 * Select — a native `<select>` styled to match `Input` with a caret, 1:1 with the web app's
 * `ui/Select`. Native is also the reliable choice in an extension (no portal/z-index fights).
 */
export const selectClass = cn(inputClass, "appearance-none pr-9 font-medium cursor-pointer");

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, children, ...props },
  ref,
) {
  return (
    <div className="relative w-full">
      <select ref={ref} className={cn(selectClass, className)} {...props}>
        {children}
      </select>
      <span
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted"
      >
        ▾
      </span>
    </div>
  );
});

export default Select;

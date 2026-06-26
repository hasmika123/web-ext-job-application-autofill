import { forwardRef } from "react";
import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { inputClass } from "./Input";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

/** Native `<select>` styled to match `Input`, with a custom caret (input look from the mockup). */
const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, children, ...props },
  ref,
) {
  return (
    <div className="relative">
      <select
        ref={ref}
        className={cn(inputClass, "appearance-none pr-9 font-medium cursor-pointer", className)}
        {...props}
      >
        {children}
      </select>
      <span
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted text-xs"
      >
        ▾
      </span>
    </div>
  );
});

export default Select;

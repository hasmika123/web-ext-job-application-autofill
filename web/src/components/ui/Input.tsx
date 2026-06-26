import { forwardRef } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export const inputClass =
  "w-full border border-line bg-paper rounded-[var(--radius)] px-[13px] py-[11px] " +
  "text-[16px] sm:text-sm font-body text-ink outline-none placeholder:text-muted " +
  "focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)] " +
  "aria-[invalid=true]:border-danger aria-[invalid=true]:focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--danger)_22%,transparent)] " +
  "disabled:opacity-60 disabled:cursor-not-allowed";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

/** Bare styled `<input>` (ported from the mockup `.input`). Pair with `Field` for label + error. */
const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(inputClass, className)} {...props} />;
});

export default Input;

export interface FieldProps {
  label?: ReactNode;
  htmlFor?: string;
  /** Error message — when set, shown in the error slot below the control. */
  error?: ReactNode;
  /** Optional helper text shown when there's no error. */
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** Label + control + error/hint slot. Wrap an `Input`/`Select` (or any control). */
export function Field({ label, htmlFor, error, hint, className, children }: FieldProps) {
  return (
    <div className={cn("mb-[15px]", className)}>
      {label && (
        <label
          htmlFor={htmlFor}
          className="mb-1.5 block text-[12.5px] font-semibold text-ink-soft"
        >
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-1.5 text-[12.5px] font-medium text-danger">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-[12.5px] text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

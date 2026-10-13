"use client";

import { useState, type InputHTMLAttributes, type ReactNode } from "react";
import { EyeIcon, EyeOffIcon, cn, inputClass } from "@kiwiply/ui";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "type"> & {
  id: string;
  label: string;
  /** Leading glyph (a `@kiwiply/ui` icon element). */
  icon: ReactNode;
  error?: string;
  /** Right-aligned slot on the label row (e.g. "Forgot password?"). */
  aside?: ReactNode;
  /** Renders a password field with the show/hide eye. */
  password?: boolean;
  type?: "text" | "email";
};

/**
 * Auth-board field: label row (+ optional aside link), 52px input with a leading icon and, for
 * passwords, a 44px show/hide toggle. Error text sits under the input (`aria-describedby`).
 */
export default function AuthField({ id, label, icon, error, aside, password, type = "text", className, ...input }: Props) {
  const [visible, setVisible] = useState(false);
  const msgId = `${id}-msg`;
  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-[14px] font-semibold text-v2-navy">
          {label}
        </label>
        {aside}
      </div>
      <div className="relative">
        <span aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-v2-navy">
          {icon}
        </span>
        <input
          id={id}
          type={password ? (visible ? "text" : "password") : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? msgId : undefined}
          className={cn(inputClass, "h-[52px] pl-12", password && "pr-12", className)}
          {...input}
        />
        {password && (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Hide password" : "Show password"}
            aria-pressed={visible}
            className="absolute inset-y-0 right-0 grid w-12 place-items-center text-v2-muted transition-colors hover:text-v2-navy"
          >
            {visible ? <EyeOffIcon size={20} /> : <EyeIcon size={20} />}
          </button>
        )}
      </div>
      {error && (
        <p id={msgId} className="mt-1.5 text-[12.5px] font-medium text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}

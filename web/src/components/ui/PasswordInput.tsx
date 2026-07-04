"use client";

import { forwardRef, useState } from "react";
import Input, { type InputProps } from "./Input";
import { cn } from "@/lib/cn";
import { EyeIcon, EyeOffIcon } from "@kiwiply/ui";

/**
 * Password field with a show/hide toggle (an eye button inside the field). Takes everything a
 * normal `Input` does except `type` — it owns that, flipping between "password" and "text".
 * Pair with `Field` for the label + error slot, exactly like `Input`.
 */
const PasswordInput = forwardRef<HTMLInputElement, Omit<InputProps, "type">>(function PasswordInput(
  { className, ...props },
  ref,
) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input ref={ref} type={visible ? "text" : "password"} className={cn("pr-11", className)} {...props} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted transition-colors hover:text-ink-soft"
      >
        {visible ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
      </button>
    </div>
  );
});

export default PasswordInput;

"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { Select, cn } from "@kiwiply/ui";

/**
 * Compact bordered dropdown (the board's "All Statuses" filter). Wraps the shared `Select` so the
 * popup is styled, not OS-rendered.
 *
 * Controlled when `value` is given, otherwise it keeps its own state (starting on `defaultValue`,
 * or the first option). `placeholder` adds a leading empty option labelled `label` (a filter that
 * starts as just its name, e.g. "Job Type"). Pass `className` for the width.
 */
export default function FilterSelect({
  label,
  options = [],
  value,
  defaultValue,
  onChange,
  placeholder,
  leadingIcon,
  className,
}: {
  label: string;
  options?: string[];
  value?: string;
  defaultValue?: string;
  onChange?: (v: string) => void;
  placeholder?: boolean;
  leadingIcon?: ReactNode;
  className?: string;
}) {
  const [inner, setInner] = useState(defaultValue ?? (placeholder ? "" : (options[0] ?? "")));
  const current = value ?? inner;
  const mapped = options.map((o) => ({ value: o, label: o }));
  const all = placeholder ? [{ value: "", label }, ...mapped] : mapped;
  return (
    <div className={cn("min-w-0", className)}>
      <Select
        aria-label={label}
        value={current}
        onChange={(v) => {
          setInner(v);
          onChange?.(v);
        }}
        options={all}
        leadingIcon={leadingIcon}
        className="rounded-[10px]! border-[#DCE2EE]! py-2.5! text-[13px]! font-medium! text-v2-navy!"
      />
    </div>
  );
}

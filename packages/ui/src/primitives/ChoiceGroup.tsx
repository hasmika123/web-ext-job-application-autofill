"use client";

import { useRef } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { cn } from "./cn";

/**
 * ChoiceGroup — a single-choice question answered with one tap: a row of pill buttons that
 * behave as a radio group (role="radiogroup", arrow keys move, one tab stop). For short fixed
 * answers where a dropdown would hide the options — "Yes / No", "Remote / Hybrid / On-site".
 *
 *   <ChoiceGroup aria-label="Work preference" options={["Remote","Hybrid","On-site"]}
 *                value={v} onChange={setV} />
 *
 * Clicking the selected option again clears it when `allowClear` is set, so an optional
 * question can be un-answered without a separate control.
 */
export interface ChoiceGroupProps {
  options: (string | { value: string; label: ReactNode })[];
  value?: string;
  onChange: (value: string) => void;
  allowClear?: boolean;
  disabled?: boolean;
  className?: string;
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}

export default function ChoiceGroup({
  options,
  value,
  onChange,
  allowClear,
  disabled,
  className,
  id,
  ...aria
}: ChoiceGroupProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const items = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  const selected = items.findIndex((o) => o.value === value);
  // One tab stop: the selected option, or the first when nothing is picked yet.
  const tabStop = selected >= 0 ? selected : 0;

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (i + step + items.length) % items.length;
    refs.current[next]?.focus();
    onChange(items[next].value);
  }

  return (
    <div id={id} role="radiogroup" {...aria} className={cn("flex flex-wrap gap-2", className)}>
      {items.map((o, i) => {
        const on = i === selected;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={i === tabStop ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(on && allowClear ? "" : o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "rounded-full border px-4 py-2 text-sm font-semibold transition-colors duration-150 cursor-pointer",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              on ? "border-accent bg-accent-soft text-accent-deep" : "border-line bg-paper text-ink hover:bg-paper-2",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

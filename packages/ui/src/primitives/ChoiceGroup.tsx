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
 *
 * `size="lg"` is the onboarding chip: 56 px tall, rounded tiles whose label may carry an icon, in a grid of
 * `columns` per row (2 on a phone, up to 4 from `sm`), and the picked one pops once (reduced motion: colour only).
 */
export interface ChoiceGroupProps {
  options: (string | { value: string; label: ReactNode })[];
  value?: string;
  onChange: (value: string) => void;
  allowClear?: boolean;
  /** "md" (default): a row of pills. "lg": big 56 px tiles in a grid (the onboarding questions). */
  size?: "md" | "lg";
  /** With `size="lg"`: tiles per row from `sm` up (2 on a phone). Default 2. */
  columns?: 2 | 3 | 4;
  disabled?: boolean;
  className?: string;
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}

const GRID = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-4" } as const;

export default function ChoiceGroup({
  options,
  value,
  onChange,
  allowClear,
  size = "md",
  columns = 2,
  disabled,
  className,
  id,
  ...aria
}: ChoiceGroupProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const items = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  const lg = size === "lg";
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
    <div
      id={id}
      role="radiogroup"
      {...aria}
      className={cn(lg ? "grid grid-cols-2 gap-2.5" : "flex flex-wrap gap-2", lg && GRID[columns], className)}
    >
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
              lg
                ? "flex min-h-14 items-center justify-center gap-2.5 rounded-2xl border px-3 py-2 text-center text-[14.5px] font-semibold leading-tight transition-colors duration-150 cursor-pointer"
                : "min-h-11 rounded-full border px-4 py-2 text-sm font-semibold sm:min-h-0 transition-colors duration-150 cursor-pointer",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              on ? "border-accent bg-accent-soft text-accent-deep" : "border-line bg-paper text-ink hover:bg-paper-2",
              on && lg && "kiwi-pop",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

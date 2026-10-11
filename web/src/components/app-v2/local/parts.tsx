"use client";

import type { ReactNode } from "react";
import { CheckCircleIcon, Menu, cn, type MenuEntry } from "@kiwiply/ui";

/** The row "⋮" button opening a dropdown menu (text glyph: the icon set has no vertical-dots icon). */
export function KebabMenu({ items, label = "More actions" }: { items: MenuEntry[]; label?: string }) {
  return (
    <Menu
      align="end"
      items={items}
      trigger={
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[18px] font-bold leading-none text-v2-ink-soft hover:bg-[#F1F5FB]">
          <span className="sr-only">{label}</span>
          <span aria-hidden>{"⋮"}</span>
        </span>
      }
    />
  );
}

/** A green tick-in-circle list (the boards' "All your saved jobs in one place" cards). */
export function CheckList({ items, className, large }: { items: string[]; className?: string; large?: boolean }) {
  return (
    <ul className={cn("space-y-3", className)}>
      {items.map((t) => (
        <li key={t} className={cn("flex items-center gap-3 text-v2-navy", large ? "text-[14.5px]" : "text-[13.5px]")}>
          <CheckCircleIcon className="h-5 w-5 flex-none text-v2-green" />
          {t}
        </li>
      ))}
    </ul>
  );
}

/** Grey outlined pill select-like control (decorative filter, native <select> underneath). */
export function FilterSelect({
  label,
  options,
  className,
  value,
  onChange,
}: {
  label: string;
  options?: string[];
  className?: string;
  value?: string;
  onChange?: (v: string) => void;
}) {
  return (
    <label className={cn("relative inline-flex", className)}>
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        className="h-10 w-full cursor-pointer appearance-none rounded-xl border border-v2-line bg-white pl-3.5 pr-9 text-[13.5px] font-medium text-v2-navy outline-none focus:border-v2-blue"
      >
        <option value="">{label}</option>
        {(options ?? []).map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-v2-ink-soft">
        {"▼"}
      </span>
    </label>
  );
}

/** Square tinted icon tile used in the settings / preparation lists. */
export function IconTile({ children, tone }: { children: ReactNode; tone: string }) {
  return <span className={cn("flex h-10 w-10 flex-none items-center justify-center rounded-xl", tone)}>{children}</span>;
}

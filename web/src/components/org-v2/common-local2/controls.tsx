"use client";

import { useId } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn, MoreVerticalIcon, Select, SearchIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from "@kiwiply/ui";

/**
 * Controls for the C2 org pages (buttons, tabs, search, filter selects, data table, pagination).
 * Same names/props as spec section 2 where one exists. TEMP: dedupe in the QA phase.
 */

/* ── Button ───────────────────────────────────────────────────────────────────────────── */
type OrgButtonVariant = "solid" | "outline" | "soft-blue" | "soft-violet";
const BTN: Record<OrgButtonVariant, string> = {
  solid: "bg-v2-blue text-white hover:brightness-110 shadow-[0_6px_14px_rgba(30,111,245,.25)]",
  outline: "border border-[#D7DEEC] bg-white text-v2-blue hover:bg-v2-blue-soft",
  "soft-blue": "bg-v2-blue-soft text-v2-blue hover:brightness-95",
  "soft-violet": "bg-v2-violet-soft text-v2-violet hover:brightness-95",
};

export function OrgButton({
  variant = "outline",
  size = "md",
  icon,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: OrgButtonVariant;
  size?: "sm" | "md";
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-[10px] font-semibold leading-none transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-blue disabled:pointer-events-none disabled:opacity-50",
        size === "sm" ? "px-3 py-2 text-[12.5px]" : "px-4 py-2.5 text-[13px]",
        BTN[variant],
        className,
      )}
      {...props}
    >
      {icon && <span className="flex [&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
      {children}
    </button>
  );
}

/** The `⋮` row-action trigger (no menu behind it yet — board data only). */
export function MoreButton({ label = "More actions", className }: { label?: string; className?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn("flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-v2-muted hover:bg-[#F1F4FA]", className)}
    >
      <MoreVerticalIcon className="h-4 w-4" />
    </button>
  );
}

/* ── Tabs ─────────────────────────────────────────────────────────────────────────────── */
export interface TabDef {
  id: string;
  label: string;
  count?: number;
  icon?: ReactNode;
  /** A trailing chevron (e.g. "Departments ▾"). */
  menu?: boolean;
}

/** Pill-style tabs with counts: active = blue-soft fill + blue text + hairline blue border. */
export function PillTabs({ tabs, value, onChange, label }: { tabs: TabDef[]; value: string; onChange: (id: string) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-2">
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={cn(
              "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold transition",
              active ? "border-v2-blue/40 bg-v2-blue-soft text-v2-blue" : "border-transparent text-v2-ink-soft hover:bg-[#F1F4FA]",
            )}
          >
            {t.label}
            {t.count != null && <span> ({t.count})</span>}
            {t.menu && <ChevronDownIcon className="h-3.5 w-3.5" />}
          </button>
        );
      })}
    </div>
  );
}

/** Underline tabs (icon + label, active underlined blue). Scrolls sideways on small screens. */
export function UnderlineTabs({
  tabs,
  value,
  onChange,
  label,
  className,
}: {
  tabs: TabDef[];
  value: string;
  onChange: (id: string) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="tablist" aria-label={label} className={cn("flex gap-1 overflow-x-auto border-b border-v2-line", className)}>
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={cn(
              "-mb-px inline-flex flex-none cursor-pointer items-center gap-2 border-b-2 px-3.5 py-3 text-[13.5px] font-semibold transition",
              active ? "border-v2-blue text-v2-blue" : "border-transparent text-v2-ink-soft hover:text-v2-navy",
            )}
          >
            {t.icon && <span className="flex [&>svg]:h-4 [&>svg]:w-4">{t.icon}</span>}
            {t.label}
            {t.count != null && <span className="text-v2-muted"> ({t.count})</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ── SearchInput / FilterSelect ───────────────────────────────────────────────────────── */
export function SearchInput({
  placeholder,
  size = "md",
  value,
  onChange,
  className,
}: {
  placeholder: string;
  size?: "sm" | "md";
  value?: string;
  onChange?: (v: string) => void;
  className?: string;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className={cn("relative block min-w-0", className)}>
      <span className="sr-only">{placeholder}</span>
      <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-v2-muted" />
      <input
        id={id}
        type="search"
        placeholder={placeholder}
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        className={cn(
          "w-full rounded-xl border border-transparent bg-[#F3F5FA] pl-10 pr-3 text-[16px] text-v2-navy outline-none placeholder:text-v2-muted focus:border-v2-blue/40 focus:bg-white sm:text-[13px]",
          size === "sm" ? "py-2" : "py-2.5",
        )}
      />
    </label>
  );
}

/** Compact bordered dropdown (the board's "All Statuses ▾"). Wraps the shared `Select`. */
export function FilterSelect({
  value,
  onChange,
  options,
  label,
  leadingIcon,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  label: string;
  leadingIcon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <Select
        aria-label={label}
        value={value}
        onChange={onChange}
        options={options.map((o) => ({ value: o, label: o }))}
        leadingIcon={leadingIcon}
        className="rounded-[10px]! border-[#DCE2EE]! py-2.5! text-[13px]! font-medium! text-v2-navy!"
      />
    </div>
  );
}

/** Square icon button for the filter funnel next to a search bar. */
export function IconSquareButton({ label, children }: { label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      className="flex h-[42px] w-[42px] flex-none cursor-pointer items-center justify-center rounded-[10px] border border-[#DCE2EE] bg-white text-v2-ink-soft hover:bg-[#F1F4FA] [&>svg]:h-[18px] [&>svg]:w-[18px]"
    >
      {children}
    </button>
  );
}

/* ── DataTable ────────────────────────────────────────────────────────────────────────── */
export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Extra classes on the <th>/<td> (width, alignment). */
  className?: string;
  /** Hide the header label in the stacked mobile card and render the cell full-width (e.g. the name). */
  primary?: boolean;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  selectable,
  actions = true,
  footer,
  minWidth = 760,
  caption,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  selectable?: boolean;
  /** Render the trailing `⋮` actions column (or a custom node per row). */
  actions?: boolean | ((row: T) => ReactNode);
  footer?: ReactNode;
  minWidth?: number;
  caption: string;
}) {
  const actionCell = (row: T) => (typeof actions === "function" ? actions(row) : actions ? <MoreButton /> : null);
  return (
    <div>
      {/* md+: real table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-left text-[12.5px]" style={{ minWidth }}>
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="bg-[#F6F8FC] text-[12px] font-medium text-v2-muted">
              {selectable && (
                <th scope="col" className="w-9 rounded-l-lg px-3 py-2.5">
                  <input type="checkbox" aria-label="Select all rows" className="h-4 w-4 cursor-pointer accent-[#1E6FF5]" />
                </th>
              )}
              {columns.map((c, i) => (
                <th key={c.key} scope="col" className={cn("whitespace-nowrap px-3 py-2.5 font-medium", !selectable && i === 0 && "rounded-l-lg", c.className)}>
                  {c.header}
                </th>
              ))}
              {actions && (
                <th scope="col" className="w-12 rounded-r-lg px-3 py-2.5 text-right font-medium">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} className="border-b border-[#EEF1F7] last:border-0 hover:bg-[#F9FBFF]">
                {selectable && (
                  <td className="px-3 py-3">
                    <input type="checkbox" aria-label="Select row" className="h-4 w-4 cursor-pointer accent-[#1E6FF5]" />
                  </td>
                )}
                {columns.map((c) => (
                  <td key={c.key} className={cn("px-3 py-3 align-middle text-v2-ink-soft", c.className)}>
                    {c.cell(row)}
                  </td>
                ))}
                {actions && <td className="px-3 py-3 text-right">{actionCell(row)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* <md: stacked cards */}
      <ul className="space-y-3 md:hidden">
        {rows.map((row) => {
          const primary = columns.find((c) => c.primary) ?? columns[0];
          return (
            <li key={rowKey(row)} className="rounded-xl border border-[#EEF1F7] p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 text-[13px] font-semibold text-v2-navy">{primary.cell(row)}</div>
                {actions && actionCell(row)}
              </div>
              <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2 text-[12.5px]">
                {columns
                  .filter((c) => c !== primary)
                  .map((c) => (
                    <div key={c.key} className="min-w-0">
                      <dt className="text-[11px] text-v2-muted">{c.header}</dt>
                      <dd className="mt-0.5 text-v2-ink-soft">{c.cell(row)}</dd>
                    </div>
                  ))}
              </dl>
            </li>
          );
        })}
      </ul>
      {footer}
    </div>
  );
}

/* ── Pagination ───────────────────────────────────────────────────────────────────────── */
export function Pagination({
  page,
  pages,
  summary,
  onPage,
}: {
  page: number;
  pages: number;
  summary: string;
  onPage?: (p: number) => void;
}) {
  // 1 2 3 4 5 … last (the boards' shape)
  const shown = pages <= 6 ? Array.from({ length: pages }, (_, i) => i + 1) : [1, 2, 3, 4, 5, -1, pages];
  const btn = "flex h-8 min-w-8 cursor-pointer items-center justify-center rounded-lg border px-2 text-[12.5px] font-semibold transition";
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[#EEF1F7] pt-3">
      <p className="text-[12.5px] text-v2-ink-soft">{summary}</p>
      <nav aria-label="Pagination" className="flex items-center gap-1.5">
        <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage?.(page - 1)} className={cn(btn, "border-[#DCE2EE] text-v2-ink-soft disabled:opacity-40")}>
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
        {shown.map((p, i) =>
          p === -1 ? (
            <span key={`gap-${i}`} aria-hidden className="px-1 text-v2-muted">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              aria-current={p === page ? "page" : undefined}
              onClick={() => onPage?.(p)}
              className={cn(btn, p === page ? "border-v2-blue bg-v2-blue-soft text-v2-blue" : "border-[#DCE2EE] text-v2-ink-soft hover:bg-[#F1F4FA]")}
            >
              {p}
            </button>
          ),
        )}
        <button type="button" aria-label="Next page" disabled={page >= pages} onClick={() => onPage?.(page + 1)} className={cn(btn, "border-[#DCE2EE] text-v2-ink-soft disabled:opacity-40")}>
          <ChevronRightIcon className="h-4 w-4" />
        </button>
      </nav>
    </div>
  );
}

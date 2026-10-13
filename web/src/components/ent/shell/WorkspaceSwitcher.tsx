"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";
import { BottomSheet, CheckIcon, ChevronDownIcon, Tooltip, cn } from "@kiwiply/ui";
import type { SwitcherRow } from "@/lib/ent/shell";

export interface SwitcherProps {
  rows: SwitcherRow[];
  open: boolean;
  onOpenChange(open: boolean): void;
  onChoose(row: SwitcherRow): void;
  /** Pin a workspace as the one that opens first (local until X4.2's endpoint exists). */
  onPrefer(row: SwitcherRow): void;
  /** "sidebar": the chip under the logo (menu on a desktop). "bar": the phone top-bar chip (bottom sheet). */
  variant: "sidebar" | "bar";
  collapsed?: boolean;
  currentLabel: string;
}

function Rows({ rows, onChoose, onPrefer, autoFocus }: Pick<SwitcherProps, "rows" | "onChoose" | "onPrefer"> & { autoFocus?: boolean }) {
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (autoFocus) list.current?.querySelector<HTMLElement>('[role="menuitemradio"]')?.focus();
  }, [autoFocus]);
  const move = (e: KeyboardEvent<HTMLUListElement>) => {
    const items = Array.from(list.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? []);
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") (items[(i + 1) % items.length] ?? items[0])?.focus();
    else if (e.key === "ArrowUp") (items[(i - 1 + items.length) % items.length] ?? items[0])?.focus();
    else return;
    e.preventDefault();
  };
  return (
    <ul ref={list} role="menu" aria-label="Your workspaces" onKeyDown={move} className="flex flex-col gap-0.5">
      {rows.map((r) => (
        <li key={r.key} role="none" className="flex items-stretch gap-1">
          <button
            type="button"
            role="menuitemradio"
            aria-checked={r.current}
            onClick={() => onChoose(r)}
            data-switcher-row={r.key}
            className={cn("flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-paper-2", r.current && "bg-accent-soft")}
          >
            <span className="w-4 flex-none text-accent">{r.current ? <CheckIcon size={16} /> : null}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-semibold text-ink">{r.label}</span>
              <span className="block truncate text-[12.5px] text-muted">{r.roles}{r.landing ? " · opens first" : ""}</span>
            </span>
          </button>
        </li>
      ))}
      {rows
        .filter((r) => !r.landing)
        .map((r) => (
          <li key={`pref-${r.key}`} role="none" className="border-t border-line first-of-type:mt-1 first-of-type:pt-1">
            <button
              type="button"
              role="menuitem"
              onClick={() => onPrefer(r)}
              className="flex min-h-10 w-full items-center rounded-lg px-3 py-2 text-left text-[13px] text-muted hover:bg-paper-2 hover:text-ink"
            >
              Open {r.label} first
            </button>
          </li>
        ))}
    </ul>
  );
}

/**
 * The workspace switcher (16 s4). The shell only mounts it when the member has more than one workspace (otherwise a static
 * eyebrow shows the workspace's name). A menu under the sidebar chip on a desktop, a bottom sheet from the top-bar chip on a
 * phone. Switching is navigation: the URL is the state, so the back button works.
 */
export default function WorkspaceSwitcher({ rows, open, onOpenChange, onChoose, onPrefer, variant, collapsed, currentLabel }: SwitcherProps) {
  const root = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open || variant !== "sidebar") return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) onOpenChange(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        onOpenChange(false);
        btn.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, variant, onOpenChange]);

  if (variant === "bar") {
    return (
      <>
        <button
          ref={btn}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => onOpenChange(true)}
          data-workspace-switcher="bar"
          className="flex h-11 min-w-0 items-center gap-1 rounded-lg px-2 text-[14px] font-semibold text-ink hover:bg-paper-2"
        >
          <span className="truncate">{currentLabel}</span>
          <ChevronDownIcon size={14} className="flex-none text-muted" />
        </button>
        <BottomSheet id="workspace-switcher" open={open} onClose={() => onOpenChange(false)} title="Switch workspace" description="Pick where to work." returnFocusTo={btn}>
          <Rows rows={rows} onChoose={onChoose} onPrefer={onPrefer} />
        </BottomSheet>
      </>
    );
  }

  const trigger = (
    <button
      ref={btn}
      type="button"
      aria-haspopup="menu"
      aria-expanded={open}
      aria-label={collapsed ? `Workspace: ${currentLabel}. Switch workspace` : undefined}
      onClick={() => onOpenChange(!open)}
      data-workspace-switcher="sidebar"
      className={cn(
        "flex min-h-10 w-full items-center gap-2 rounded-[10px] border border-line bg-paper px-3 text-left text-[13.5px] font-semibold text-ink hover:bg-paper-2",
        collapsed && "justify-center px-0",
      )}
    >
      {collapsed ? <span aria-hidden>{currentLabel.slice(0, 1)}</span> : <span className="min-w-0 flex-1 truncate">{currentLabel}</span>}
      {collapsed ? null : <ChevronDownIcon size={14} className={cn("flex-none text-muted transition-transform", open && "rotate-180")} />}
    </button>
  );

  return (
    <div ref={root} className="relative px-3">
      {collapsed ? (
        <Tooltip content={`${currentLabel} (switch workspace)`} side="right" className="flex w-full">
          {trigger}
        </Tooltip>
      ) : (
        trigger
      )}
      {open ? (
        <div className="absolute inset-x-3 top-[calc(100%+4px)] z-50 rounded-xl border border-line bg-paper p-1.5 shadow-[var(--shadow-lg,0_12px_40px_rgb(0_0_0/0.14))]">
          <p className="px-3 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">Your workspaces</p>
          <Rows rows={rows} onChoose={onChoose} onPrefer={onPrefer} autoFocus />
        </div>
      ) : null}
    </div>
  );
}

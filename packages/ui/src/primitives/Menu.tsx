"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "./cn";

/**
 * Menu — a dependency-free dropdown menu: a trigger + a popover list with click-outside,
 * Escape, scroll and resize to close, arrow/Home/End roving focus, and `menu`/`menuitem`
 * roles. The popover renders in a PORTAL (fixed-positioned under the trigger, flipping above
 * when there isn't room below) so a scrolling container — e.g. a board column — never clips
 * it. Entries are data (not children) so the keyboard model stays simple; alongside action
 * items you can pass `{ heading }` labels and `{ separator: true }` rules to group them.
 *
 *   <Menu trigger={<Button size="sm" variant="ghost">Actions</Button>} items={[
 *     { label: "Rename", icon: <PencilIcon />, onSelect: rename },
 *     { separator: true },
 *     { label: "Delete", onSelect: remove, danger: true },
 *   ]} />
 */
export interface MenuItem {
  label: ReactNode;
  onSelect: () => void;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
}
/** A non-interactive section label (e.g. "Move to"). */
export interface MenuHeading {
  heading: ReactNode;
}
/** A horizontal rule between groups. */
export interface MenuSeparator {
  separator: true;
}
export type MenuEntry = MenuItem | MenuHeading | MenuSeparator;

const isHeading = (e: MenuEntry): e is MenuHeading => "heading" in e;
const isSeparator = (e: MenuEntry): e is MenuSeparator => "separator" in e;

export interface MenuProps {
  trigger: ReactNode;
  items: MenuEntry[];
  align?: "start" | "end";
  className?: string;
  menuClassName?: string;
  /** When true the trigger can't be opened (e.g. a row mid-mutation). */
  disabled?: boolean;
}

export default function Menu({ trigger, items, align = "end", className, menuClassName, disabled }: MenuProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const baseId = useId();

  // Place the portal-rendered menu under the trigger (flipping above when it would run off the
  // bottom), right- or left-aligned. Measured after render, so it's kept hidden until placed.
  useEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const btn = triggerRef.current?.getBoundingClientRect();
    if (!btn) return;
    const menu = menuRef.current?.getBoundingClientRect();
    const menuW = menu?.width ?? 200;
    const menuH = menu?.height ?? 0;
    const gap = 4;
    const spaceBelow = window.innerHeight - btn.bottom;
    const openUp = menuH > 0 && spaceBelow < menuH + gap + 8 && btn.top > spaceBelow;
    const top = openUp ? Math.max(8, btn.top - menuH - gap) : btn.bottom + gap;
    const left = align === "end" ? Math.max(8, btn.right - menuW) : Math.min(btn.left, window.innerWidth - menuW - 8);
    setPos({ top, left });
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const close = () => setOpen(false);
    document.addEventListener("mousedown", onDocMouseDown);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    // Focus the first enabled item on open.
    const first = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])');
    first?.focus();
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  function moveFocus(dir: 1 | -1 | "first" | "last") {
    const menuitems = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? [],
    );
    if (menuitems.length === 0) return;
    const idx = menuitems.indexOf(document.activeElement as HTMLElement);
    let next = 0;
    if (dir === "first") next = 0;
    else if (dir === "last") next = menuitems.length - 1;
    else if (dir === 1) next = idx < 0 ? 0 : (idx + 1) % menuitems.length;
    else next = idx < 0 ? menuitems.length - 1 : (idx - 1 + menuitems.length) % menuitems.length;
    menuitems[next]?.focus();
  }

  function onListKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        moveFocus(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        moveFocus(-1);
        break;
      case "Home":
        e.preventDefault();
        moveFocus("first");
        break;
      case "End":
        e.preventDefault();
        moveFocus("last");
        break;
      case "Escape":
        e.preventDefault();
        setOpen(false);
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  }

  return (
    <div className={cn("inline-flex", className)}>
      <span
        ref={triggerRef}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-disabled={disabled || undefined}
        aria-controls={open ? `${baseId}-menu` : undefined}
        onClick={(e) => {
          e.stopPropagation();
          if (disabled) return;
          setOpen((v) => !v);
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
            e.preventDefault();
            e.stopPropagation();
            setOpen(true);
          }
        }}
        className="inline-flex"
      >
        {trigger}
      </span>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            id={`${baseId}-menu`}
            role="menu"
            aria-orientation="vertical"
            onKeyDown={onListKeyDown}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              top: pos?.top ?? -9999,
              left: pos?.left ?? -9999,
              maxHeight: "calc(100vh - 16px)",
              visibility: pos ? "visible" : "hidden",
            }}
            className={cn(
              "scroll-slim z-[161] min-w-[9rem] overflow-y-auto rounded-[var(--radius)] border border-line bg-paper p-1 shadow-[var(--shadow-lg)]",
              menuClassName,
            )}
          >
            {items.map((entry, i) => {
              if (isSeparator(entry)) return <div key={i} className="my-1 h-px bg-line" />;
              if (isHeading(entry))
                return (
                  <div key={i} className="px-2.5 pb-0.5 pt-1.5 text-[10px] font-bold uppercase tracking-wide text-muted">
                    {entry.heading}
                  </div>
                );
              return (
                <button
                  key={i}
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  disabled={entry.disabled}
                  aria-disabled={entry.disabled || undefined}
                  onClick={() => {
                    if (entry.disabled) return;
                    setOpen(false);
                    entry.onSelect();
                  }}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors " +
                      "focus:outline-none focus-visible:bg-paper-2 disabled:pointer-events-none disabled:opacity-50",
                    entry.danger
                      ? "text-danger hover:bg-[color-mix(in_srgb,var(--color-danger)_10%,transparent)]"
                      : "text-ink hover:bg-paper-2",
                  )}
                >
                  {entry.icon != null && (
                    <span className={cn("grid shrink-0 place-items-center", entry.danger ? "text-danger" : "text-muted")}>
                      {entry.icon}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}

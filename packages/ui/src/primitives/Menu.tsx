import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { cn } from "./cn";

/**
 * Menu — a dependency-free dropdown menu: a trigger + a popover list with click-outside and
 * Escape to close, arrow/Home/End roving focus, and `menu`/`menuitem` roles. Items are data
 * (not children) so the keyboard model stays simple. Anchored to the trigger; opens below,
 * right-aligned by default.
 *
 *   <Menu trigger={<Button size="sm" variant="ghost">Actions</Button>} items={[
 *     { label: "Rename", onSelect: rename },
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

export interface MenuProps {
  trigger: ReactNode;
  items: MenuItem[];
  align?: "start" | "end";
  className?: string;
}

export default function Menu({ trigger, items, align = "end", className }: MenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const baseId = useId();

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    // Focus the first enabled item on open.
    const first = listRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])');
    first?.focus();
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  function moveFocus(dir: 1 | -1 | "first" | "last") {
    const menuitems = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? [],
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
    <div ref={rootRef} className={cn("relative inline-flex", className)}>
      <span
        role="button"
        tabIndex={0}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${baseId}-menu` : undefined}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className="inline-flex"
      >
        {trigger}
      </span>

      {open && (
        <div
          ref={listRef}
          id={`${baseId}-menu`}
          role="menu"
          onKeyDown={onListKeyDown}
          className={cn(
            "absolute top-full z-50 mt-1 min-w-[180px] overflow-hidden rounded-[var(--radius)] " +
              "border border-line bg-paper py-1 shadow-[var(--shadow-lg)]",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {items.map((item, i) => (
            <button
              key={i}
              type="button"
              role="menuitem"
              tabIndex={-1}
              disabled={item.disabled}
              aria-disabled={item.disabled || undefined}
              onClick={() => {
                if (item.disabled) return;
                setOpen(false);
                item.onSelect();
              }}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] transition-colors " +
                  "focus:outline-none focus-visible:bg-paper-2 disabled:opacity-50 disabled:pointer-events-none",
                item.danger ? "text-danger hover:bg-[color-mix(in_srgb,var(--color-danger)_10%,transparent)]" : "text-ink hover:bg-paper-2",
              )}
            >
              {item.icon != null && <span className="shrink-0 text-muted">{item.icon}</span>}
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

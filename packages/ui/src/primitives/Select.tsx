"use client";

import { Children, isValidElement, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "./cn";
import { inputClass } from "./Input";
import { CheckIcon, ChevronDownIcon } from "./icons";

/**
 * Select — a custom dropdown whose expanded popup is fully styled (rounded, bordered, with a
 * check on the selected option), unlike a native `<select>` whose menu is OS-rendered. Used
 * across the web app and the extension so every small selection dropdown matches the board's
 * Sort dropdown.
 *
 * Drop-in-ish for a native select: pass `<option>` children (parsed into options) or an
 * `options` array, a controlled `value`, and a value-based `onChange(value)`. Two trigger looks:
 * `field` (full-width, matches Input — for forms) and `pill` (rounded — for toolbars). The popup
 * renders in a portal (fixed-positioned under the trigger) so it's never clipped by a scrolling
 * panel; it closes on outside-click, Escape, scroll, or resize.
 */
export interface SelectOption {
  value: string;
  label: ReactNode;
  disabled?: boolean;
  title?: string;
}

export interface SelectProps {
  value?: string;
  onChange?: (value: string) => void;
  options?: SelectOption[];
  children?: ReactNode;
  placeholder?: string;
  disabled?: boolean;
  variant?: "field" | "pill";
  className?: string;
  menuClassName?: string;
  id?: string;
  name?: string;
  leadingIcon?: ReactNode;
  "aria-label"?: string;
}

/** The field-look trigger base (matches Input), kept as an export for parity with the old API. */
export const selectClass = cn(inputClass, "flex items-center gap-2 pr-9 text-left font-medium cursor-pointer");

const PILL_TRIGGER =
  "flex items-center gap-1.5 rounded-full border border-line bg-paper py-2 pl-3 pr-2.5 text-[13px] " +
  "font-medium text-ink-soft transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-60";

function optionsFromChildren(children: ReactNode): SelectOption[] {
  const out: SelectOption[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child) || child.type !== "option") return;
    const p = child.props as { value?: string | number; children?: ReactNode; disabled?: boolean; title?: string };
    out.push({
      value: String(p.value ?? ""),
      label: p.children ?? String(p.value ?? ""),
      disabled: p.disabled,
      title: p.title,
    });
  });
  return out;
}

function Chevron({ open }: { open: boolean }) {
  return (
    <ChevronDownIcon className={cn("h-4 w-4 shrink-0 text-muted transition-transform", open && "rotate-180")} />
  );
}

export default function Select({
  value = "",
  onChange,
  options,
  children,
  placeholder,
  disabled,
  variant = "field",
  className,
  menuClassName,
  id,
  name,
  leadingIcon,
  ...rest
}: SelectProps) {
  const opts = useMemo(() => options ?? optionsFromChildren(children), [options, children]);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const ariaLabel = rest["aria-label"];

  const selected = opts.find((o) => o.value === value);
  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 6, left: r.left, width: r.width });
  };

  useEffect(() => {
    if (!open) return;
    place();
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  const triggerCls = variant === "pill" ? PILL_TRIGGER : cn(selectClass, "relative w-full");

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        id={id}
        name={name}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => (disabled ? undefined : setOpen((o) => !o))}
        className={cn(triggerCls, className)}
      >
        {leadingIcon != null && <span className="shrink-0 text-muted">{leadingIcon}</span>}
        <span className={cn("min-w-0 flex-1 truncate", !selected && "text-muted")}>
          {selected ? selected.label : (placeholder ?? "")}
        </span>
        {variant === "pill" ? (
          <Chevron open={open} />
        ) : (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
            <Chevron open={open} />
          </span>
        )}
      </button>
      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            aria-label={ariaLabel}
            style={{ position: "fixed", top: pos.top, left: pos.left, minWidth: pos.width }}
            className={cn(
              "scroll-slim z-[200] max-h-64 overflow-auto rounded-[var(--radius)] border border-line bg-paper p-1 shadow-[var(--shadow-lg)]",
              menuClassName,
            )}
          >
            {opts.map((o) => {
              const sel = o.value === value;
              return (
                <button
                  key={o.value}
                  type="button"
                  role="option"
                  aria-selected={sel}
                  disabled={o.disabled}
                  title={o.title}
                  onClick={() => {
                    setOpen(false);
                    if (!o.disabled && o.value !== value) onChange?.(o.value);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors disabled:opacity-50",
                    sel ? "bg-accent-soft font-semibold text-accent-deep" : "text-ink hover:bg-paper-2",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {sel && <CheckIcon className="h-3.5 w-3.5 shrink-0" />}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}

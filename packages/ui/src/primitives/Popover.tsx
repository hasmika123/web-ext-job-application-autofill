"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { createPortal } from "react-dom";
import { cn } from "./cn";

/**
 * Popover — a dependency-free floating panel for content that is more than a list of actions (switches,
 * links with Copy / Revoke, version rows): the sibling of `Menu`. The trigger is a render prop that gets a
 * ref and the ARIA props (`aria-haspopup="dialog"`, `aria-expanded`, `aria-controls`) so it can be a real
 * `<button>`; the panel renders in a PORTAL (fixed under the trigger, flipping above when there is no room,
 * clamped to the viewport) so a scrolling card never clips it. Click-outside, Escape (focus returns to the
 * trigger), window resize and a scroll OUTSIDE the panel close it; Tab is not trapped (it is not modal).
 * Open focuses the first control in the panel, else the panel.
 *
 *   <Popover label="Visibility" trigger={(t) => <button {...t.props} ref={t.ref}>Private</button>}>
 *     {({ close }) => <p>…</p>}
 *   </Popover>
 */
export interface PopoverTriggerApi {
  ref: Ref<HTMLButtonElement>;
  props: Pick<ButtonHTMLAttributes<HTMLButtonElement>, "aria-haspopup" | "aria-expanded" | "aria-controls" | "onClick" | "type">;
  open: boolean;
}

export interface PopoverProps {
  /** The accessible name of the panel. */
  label: string;
  trigger: (api: PopoverTriggerApi) => ReactNode;
  children: ReactNode | ((api: { close: () => void }) => ReactNode);
  align?: "start" | "end";
  className?: string;
  panelClassName?: string;
  /** Controlled mode: pass both. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** The trigger cannot open it (a row mid-mutation). */
  disabled?: boolean;
}

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export default function Popover({ label, trigger, children, align = "start", className, panelClassName, open: openProp, onOpenChange, disabled }: PopoverProps) {
  const [openState, setOpenState] = useState(false);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : openState;
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const baseId = useId();

  const setOpen = useCallback(
    (next: boolean) => {
      if (!controlled) setOpenState(next);
      onOpenChange?.(next);
    },
    [controlled, onOpenChange],
  );
  const close = useCallback(() => setOpen(false), [setOpen]);

  // Place the panel under the trigger (above when it would run off the bottom), then keep it inside the viewport.
  useEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const btn = triggerRef.current?.getBoundingClientRect();
    if (!btn) return;
    const panel = panelRef.current?.getBoundingClientRect();
    const w = panel?.width ?? 280;
    const h = panel?.height ?? 0;
    const gap = 6;
    const margin = 8;
    const spaceBelow = window.innerHeight - btn.bottom;
    const openUp = h > 0 && spaceBelow < h + gap + margin && btn.top > spaceBelow;
    const top = openUp ? Math.max(margin, btn.top - h - gap) : btn.bottom + gap;
    const wanted = align === "end" ? btn.right - w : btn.left;
    const left = Math.max(margin, Math.min(wanted, window.innerWidth - w - margin));
    setPos({ top, left });
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    (panel?.querySelector<HTMLElement>(FOCUSABLE) ?? panel)?.focus();

    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    const onScroll = (e: Event) => {
      if (e.target instanceof Node && panelRef.current?.contains(e.target)) return; // the panel's own list may scroll
      setOpen(false);
    };
    const onResize = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, setOpen]);

  const panelId = `${baseId}-popover`;
  return (
    <div className={cn("inline-flex", className)}>
      {trigger({
        ref: triggerRef,
        open,
        props: {
          type: "button",
          "aria-haspopup": "dialog",
          "aria-expanded": open,
          "aria-controls": open ? panelId : undefined,
          onClick: () => {
            if (!disabled) setOpen(!open);
          },
        },
      })}
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            id={panelId}
            role="dialog"
            aria-label={label}
            tabIndex={-1}
            style={{
              position: "fixed",
              top: pos?.top ?? -9999,
              left: pos?.left ?? -9999,
              maxHeight: "calc(100vh - 16px)",
              maxWidth: "calc(100vw - 16px)",
              visibility: pos ? "visible" : "hidden",
            }}
            className={cn(
              "scroll-slim z-[161] min-w-[16rem] overflow-y-auto rounded-[var(--radius)] border border-line bg-paper p-2 text-ink shadow-[var(--shadow-lg)] outline-none",
              panelClassName,
            )}
          >
            {typeof children === "function" ? children({ close }) : children}
          </div>,
          document.body,
        )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { CSSProperties, FocusEvent, KeyboardEvent, PointerEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "./cn";

/**
 * Tooltip - the one hover / keyboard-focus label for icon-only controls.
 *
 *  - Opens after `delayMs` (default 400) of hover OR keyboard focus (`:focus-visible`, so a click does not
 *    leave one behind); closes on leave, blur, press and Esc.
 *  - Never opens for touch (a finger has no hover; the control's `aria-label` is the name).
 *  - The bubble is drawn in a portal at `position: fixed`, so a scrolling or clipping parent (the right rail,
 *    a sheet) can never cut it off.
 *  - The bubble is decorative (`aria-hidden`): put the real accessible name on the trigger via `aria-label`
 *    and use the same words (plus a shortcut hint) as `content`. The wrapper carries `data-tooltip-trigger`.
 *
 * Wrap exactly one control; non-interactive `content` only.
 */
export type TooltipSide = "top" | "bottom" | "left" | "right";

/** How long a pointer or the keyboard focus rests on a control before its tooltip shows. */
export const TOOLTIP_DELAY_MS = 400;

const GAP = 8;
const FLIP_MARGIN = 44;

export interface TooltipProps {
  content: ReactNode;
  side?: TooltipSide;
  children: ReactNode;
  className?: string;
  /** Rest time before it shows (ms). */
  delayMs?: number;
  /** No tooltip (e.g. the control already shows its words). */
  disabled?: boolean;
}

interface Placement {
  style: CSSProperties;
}

function place(rect: DOMRect, side: TooltipSide): Placement {
  let s = side;
  if (s === "top" && rect.top < FLIP_MARGIN) s = "bottom";
  if (s === "bottom" && typeof window !== "undefined" && window.innerHeight - rect.bottom < FLIP_MARGIN && rect.top >= FLIP_MARGIN) s = "top";
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  switch (s) {
    case "top":
      return { style: { top: rect.top - GAP, left: cx, transform: "translate(-50%, -100%)" } };
    case "bottom":
      return { style: { top: rect.bottom + GAP, left: cx, transform: "translate(-50%, 0)" } };
    case "left":
      return { style: { top: cy, left: rect.left - GAP, transform: "translate(-100%, -50%)" } };
    case "right":
      return { style: { top: cy, left: rect.right + GAP, transform: "translate(0, -50%)" } };
  }
}

/**
 * Was the last input a key press (so a focus ring is showing) rather than a pointer press? Tracked once per page
 * instead of asking `:focus-visible`, which also answers "no" for focus a menu hands back to its trigger.
 */
let keyboardModality = true;
let modalityWatched = false;
function watchModality() {
  if (modalityWatched || typeof document === "undefined") return;
  modalityWatched = true;
  document.addEventListener("keydown", () => (keyboardModality = true), true);
  document.addEventListener("pointerdown", () => (keyboardModality = false), true);
}

export default function Tooltip({ content, side = "top", children, className, delayMs = TOOLTIP_DELAY_MS, disabled = false }: TooltipProps) {
  const id = useId();
  const wrap = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // After a press the pointer is still over the control: stay quiet until it leaves.
  const pressed = useRef(false);
  const [placement, setPlacement] = useState<Placement | null>(null);

  const cancel = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);
  const close = useCallback(() => {
    cancel();
    setPlacement(null);
  }, [cancel]);
  const schedule = useCallback(() => {
    if (disabled) return;
    cancel();
    timer.current = setTimeout(() => {
      timer.current = null;
      const el = wrap.current;
      if (el) setPlacement(place(el.getBoundingClientRect(), side));
    }, delayMs);
  }, [cancel, delayMs, disabled, side]);

  useEffect(() => {
    watchModality();
    return cancel;
  }, [cancel]);

  // Scrolling moves the control out from under a fixed bubble.
  const open = placement !== null;
  useEffect(() => {
    if (!open) return;
    const hide = () => close();
    window.addEventListener("scroll", hide, true);
    return () => window.removeEventListener("scroll", hide, true);
  }, [open, close]);

  const onPointerEnter = (e: PointerEvent) => {
    if (e.pointerType === "touch" || pressed.current) return;
    schedule();
  };
  const onPointerLeave = () => {
    pressed.current = false;
    close();
  };
  const onPointerDown = () => {
    pressed.current = true;
    close();
  };
  const onFocus = (e: FocusEvent) => {
    // Focus inside a portal (a Menu's list) bubbles here through the React tree: it is not this control's focus.
    if (keyboardModality && wrap.current?.contains(e.target as Node)) schedule();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
  };

  return (
    <span
      ref={wrap}
      data-tooltip-trigger=""
      className={cn("inline-flex", className)}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onPointerDown={onPointerDown}
      onFocusCapture={onFocus}
      onBlurCapture={close}
      onKeyDown={onKeyDown}
    >
      {children}
      {placement &&
        typeof document !== "undefined" &&
        createPortal(
          <span
            id={id}
            role="tooltip"
            aria-hidden
            data-tooltip=""
            style={placement.style}
            className={cn(
              "pointer-events-none fixed z-[10000] max-w-[260px] whitespace-nowrap rounded-[var(--radius-sm)] bg-ink px-2 py-1 " +
                "text-[11px] font-medium text-paper shadow-[var(--shadow)]",
            )}
          >
            {content}
          </span>,
          document.body,
        )}
    </span>
  );
}

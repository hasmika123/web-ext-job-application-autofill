"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode, RefObject } from "react";
import { cn } from "./cn";
import { XIcon } from "./icons";
import { EASE, FOCUSABLE, SIDE_SHEET_MS, SIDE_SHEET_REDUCED_MS, usePrefersReducedMotion, usePresence } from "./SideSheet";
import Tooltip from "./Tooltip";

/**
 * BottomSheet - the phone sheet of the page kit (E2E-U0.0): `SideSheet`'s `side="bottom"`. It slides up from the
 * bottom edge over a scrim, rests at one of two snap points and is dismissed by dragging it down:
 *
 *   partial  70 % of the viewport height (the default)         full  the whole viewport
 *
 *  - Drag the grip: down past `SNAP_DRAG_PX` closes from partial / drops full to partial; up lifts partial to full.
 *    The grip is also a real button (Enter / Space toggles partial <-> full), so the sheet works without a pointer.
 *  - Esc and the scrim close it; focus moves into the sheet on open, is trapped while open and returns to
 *    `returnFocusTo` on close; the page behind does not scroll (body scroll lock).
 *  - Motion is the SideSheet's: 200 ms transform; under `prefers-reduced-motion` no transform at all, an 80 ms fade.
 *  - It stays a bottom sheet at every width (centred, `max-w-2xl`, on a wide screen). A page that wants a side
 *    panel on desktop renders `SideSheet` there instead.
 *
 *   <BottomSheet id="app-detail" open={open} title="Acme - Designer" onClose={close}>...</BottomSheet>
 */
export type BottomSheetSnap = "partial" | "full";

/** The partial snap height as a share of the viewport. */
export const SNAP_PARTIAL_RATIO = 0.7;
/** How far (px) the grip must travel to count as a deliberate drag rather than a tap. */
export const SNAP_DRAG_PX = 80;

/**
 * Where a drag of `dy` px (positive = down) ends: `"close"` or the snap to rest at. Pure so it is unit-testable.
 * A drag shorter than `SNAP_DRAG_PX` springs back to `from`.
 */
export function snapAfterDrag(from: BottomSheetSnap, dy: number): BottomSheetSnap | "close" {
  if (dy >= SNAP_DRAG_PX) return from === "full" ? "partial" : "close";
  if (dy <= -SNAP_DRAG_PX) return "full";
  return from;
}

export interface BottomSheetProps {
  open: boolean;
  onClose(): void;
  title: string;
  description?: string;
  /** The DOM id of the dialog. */
  id: string;
  children: ReactNode;
  footer?: ReactNode;
  /** The snap the sheet opens at (default "partial"). Ignored when `snap` is passed. */
  defaultSnap?: BottomSheetSnap;
  /** Controlled snap. */
  snap?: BottomSheetSnap;
  onSnapChange?(snap: BottomSheetSnap): void;
  /** Focus returns here when the sheet closes. */
  returnFocusTo?: RefObject<HTMLElement | null>;
  className?: string;
}

export default function BottomSheet({
  open,
  onClose,
  title,
  description,
  id,
  children,
  footer,
  defaultSnap = "partial",
  snap: snapProp,
  onSnapChange,
  returnFocusTo,
  className,
}: BottomSheetProps) {
  const reduced = usePrefersReducedMotion();
  const ms = reduced ? SIDE_SHEET_REDUCED_MS : SIDE_SHEET_MS;
  const { mounted, shown } = usePresence(open, ms);
  const sheetRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  const [innerSnap, setInnerSnap] = useState<BottomSheetSnap>(defaultSnap);
  const snap = snapProp ?? innerSnap;
  const setSnap = useCallback(
    (next: BottomSheetSnap) => {
      if (snapProp === undefined) setInnerSnap(next);
      onSnapChange?.(next);
    },
    [snapProp, onSnapChange],
  );

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  const returnRef = useRef(returnFocusTo);
  useEffect(() => {
    returnRef.current = returnFocusTo;
  });

  /* A reopened sheet starts at its default snap again. */
  useEffect(() => {
    if (!open && snapProp === undefined) setInnerSnap(defaultSnap);
  }, [open, defaultSnap, snapProp]);

  /* Focus: into the sheet on open (the first control), back to the trigger on close. */
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      wasOpen.current = true;
      const sheet = sheetRef.current;
      const first = Array.from(sheet?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).find((el) => !el.closest("[inert]"));
      (first ?? sheet)?.focus({ preventScroll: true });
    } else if (!open && wasOpen.current) {
      wasOpen.current = false;
      returnRef.current?.current?.focus?.();
    }
  }, [open, mounted]);

  /* Esc closes (unless a layer above already consumed it); Tab is trapped inside the sheet. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const sheet = sheetRef.current;
      if (!sheet) return;
      if (e.key === "Escape") {
        if (e.defaultPrevented) return;
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = Array.from(sheet.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => (el.offsetParent !== null || el === document.activeElement) && !el.closest("[inert]"),
      );
      if (items.length === 0) {
        e.preventDefault();
        sheet.focus();
        return;
      }
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === firstEl || active === sheet)) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && active === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  /* The page behind does not scroll while the sheet is up. */
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  /* Dragging the grip. */
  const [drag, setDrag] = useState<number | null>(null);
  const dragStart = useRef<{ y: number; pointerId: number } | null>(null);
  const moved = useRef(false);

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    dragStart.current = { y: e.clientY, pointerId: e.pointerId };
    moved.current = false;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrag(0);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const start = dragStart.current;
    if (!start) return;
    const dy = e.clientY - start.y;
    if (Math.abs(dy) > 4) moved.current = true;
    // Down follows the finger; up is allowed only as far as the lift to full needs (it is not a free-floating sheet).
    setDrag(Math.max(dy, -SNAP_DRAG_PX * 2));
  };
  const endDrag = (e: ReactPointerEvent<HTMLElement>) => {
    const start = dragStart.current;
    dragStart.current = null;
    if (!start) return;
    e.currentTarget.releasePointerCapture?.(start.pointerId);
    const dy = e.clientY - start.y;
    setDrag(null);
    const next = snapAfterDrag(snap, dy);
    if (next === "close") onCloseRef.current();
    else if (next !== snap) setSnap(next);
  };

  if (!mounted) return null;

  const full = snap === "full";
  const translate = reduced ? undefined : shown ? `translateY(${drag ?? 0}px)` : "translateY(100%)";

  return (
    <div className="fixed inset-0 z-[1000]" data-mode="bottom" data-state={open ? "open" : "closed"}>
      <div
        data-sheet-scrim
        aria-hidden
        onClick={() => onCloseRef.current()}
        className="absolute inset-0 bg-[color-mix(in_srgb,var(--color-ink)_45%,transparent)]"
        style={{ opacity: shown ? 1 : 0, transition: `opacity ${ms}ms linear` }}
      />
      <div
        ref={sheetRef}
        id={id}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-snap={snap}
        tabIndex={-1}
        className={cn(
          "absolute inset-x-0 bottom-0 mx-auto flex w-full max-w-2xl flex-col bg-paper text-ink outline-none",
          "border border-b-0 border-line shadow-[var(--shadow-lg)]",
          full ? "rounded-none" : "rounded-t-[var(--radius-lg)]",
          className,
        )}
        style={{
          height: full ? "100dvh" : `${SNAP_PARTIAL_RATIO * 100}dvh`,
          transform: translate,
          opacity: reduced ? (shown ? 1 : 0) : undefined,
          transition:
            drag !== null
              ? "none"
              : reduced
                ? `opacity ${ms}ms linear`
                : `transform ${ms}ms ${EASE}, height ${ms}ms ${EASE}`,
        }}
      >
        {/* The grip: drag it, or press it to flip between the two snaps. */}
        <div className="flex justify-center pt-1.5">
          <Tooltip content={full ? "Shrink sheet" : "Expand sheet"} side="bottom">
            <button
              type="button"
              data-sheet-grip
              aria-label={full ? "Shrink sheet" : "Expand sheet"}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onClick={() => {
                // A drag already resolved on pointer-up; only a still press toggles.
                if (moved.current) {
                  moved.current = false;
                  return;
                }
                setSnap(full ? "partial" : "full");
              }}
              className="inline-flex h-7 w-16 touch-none cursor-grab items-center justify-center rounded-full text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:cursor-grabbing max-sm:h-11"
            >
              <span aria-hidden className="block h-1 w-10 rounded-full bg-line" />
            </button>
          </Tooltip>
        </div>

        <header className="flex items-start gap-3 py-2 pl-5 pr-14">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="font-display text-lg leading-tight text-ink">
              {title}
            </h2>
            {description != null && <p className="mt-0.5 text-[13px] leading-snug text-muted">{description}</p>}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">{children}</div>

        {footer != null && <footer className="flex items-center gap-2 border-t border-line px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</footer>}

        {/* Last in DOM order on purpose, like SideSheet: first focus lands on the sheet's first control. */}
        <Tooltip content={`Close ${title}`} side="left" className="absolute right-3 top-3">
          <button
            type="button"
            data-sheet-close
            onClick={() => onCloseRef.current()}
            aria-label={`Close ${title}`}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-muted transition-colors hover:bg-paper-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:h-9 sm:w-9"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}

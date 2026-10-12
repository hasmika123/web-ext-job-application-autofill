"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import type { CSSProperties, ReactNode, RefObject } from "react";
import { cn } from "./cn";
import { XIcon } from "./icons";

/**
 * SideSheet — ONE accessible slide-in for both of the Resume Builder's side-navs (DESIGN v2 §10.3).
 *
 *  - `mode: "push"`       an `<aside role="region">` that RESERVES `width` px in its parent (a grid
 *                         track / flex row) while open and collapses to 0 when closed. No focus trap.
 *  - `mode: "overlay"`    a `role="dialog" aria-modal` panel floating above the page with a scrim
 *                         (click closes) and a focus trap.
 *  - `mode: "fullscreen"` the same dialog covering the viewport (phone); no scrim; locks body scroll.
 *
 * Open moves focus to the sheet's first focusable (the ✕ is LAST in DOM order, so that is the
 * panel's first control); Esc closes; close returns focus to `returnFocusTo`. Motion: a 200 ms
 * `translateX` slide (plus a width transition for push); under `prefers-reduced-motion: reduce`
 * there is no transform at all, just an 80 ms opacity fade. Rendered inline with `position: fixed`
 * (no portal), like Dialog, so it works on every surface.
 *
 *   <SideSheet id="rb-left-sheet" side="left" mode="push" open={open} title="Add Section"
 *              description="Choose a section to add to your resume" onClose={close}
 *              returnFocusTo={toggleRef}>…</SideSheet>
 */
export interface SideSheetProps {
  side: "left" | "right";
  open: boolean;
  /** "push" reserves a grid track; "overlay" floats above with a scrim; "fullscreen" covers the viewport. */
  mode: "push" | "overlay" | "fullscreen";
  /** px; default 400 (left) / 520 (right). Fullscreen ignores it. */
  width?: number;
  title: string;
  description?: string;
  /** The green circular icon tile (pass the glyph; the tile is drawn here). */
  icon?: ReactNode;
  onClose(): void;
  /** The toggle button — focus returns here when the sheet closes. */
  returnFocusTo?: RefObject<HTMLElement | null>;
  /** Overrides the accessible name source (an element id); defaults to `title` as `aria-label`. */
  labelledBy?: string;
  /** The DOM id — what the toggle's `aria-controls` names. */
  id: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

const EASE = "cubic-bezier(.2,.8,.2,1)";
export const SIDE_SHEET_MS = 200;
export const SIDE_SHEET_REDUCED_MS = 80;

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReduced(cb: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const mq = window.matchMedia(REDUCED_QUERY);
  mq.addEventListener?.("change", cb);
  return () => mq.removeEventListener?.("change", cb);
}

function reducedSnapshot() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(REDUCED_QUERY).matches
    : false;
}

/** `prefers-reduced-motion: reduce`, live (false on the server). */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReduced, reducedSnapshot, () => false);
}

/**
 * Presence: `mounted` stays true for `ms` after `open` goes false (so the exit can play) and
 * `shown` flips true two frames after mounting (so the entrance transition has a start state).
 * A sheet that is open on first render skips the entrance.
 */
function usePresence(open: boolean, ms: number) {
  const [state, setState] = useState({ mounted: open, shown: open });

  if (open && !state.mounted) setState({ mounted: true, shown: false });

  useEffect(() => {
    if (open) {
      let r2 = 0;
      const r1 = requestAnimationFrame(() => {
        r2 = requestAnimationFrame(() => setState((s) => (s.shown ? s : { mounted: true, shown: true })));
      });
      return () => {
        cancelAnimationFrame(r1);
        cancelAnimationFrame(r2);
      };
    }
    setState((s) => (s.shown ? { ...s, shown: false } : s));
    const t = setTimeout(() => setState((s) => (s.mounted ? { mounted: false, shown: false } : s)), ms);
    return () => clearTimeout(t);
  }, [open, ms]);

  return state;
}

export default function SideSheet({
  side,
  open,
  mode,
  width,
  title,
  description,
  icon,
  onClose,
  returnFocusTo,
  labelledBy,
  id,
  children,
  footer,
  className,
}: SideSheetProps) {
  const reduced = usePrefersReducedMotion();
  const ms = reduced ? SIDE_SHEET_REDUCED_MS : SIDE_SHEET_MS;
  const { mounted, shown } = usePresence(open, ms);
  const sheetRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  const returnRef = useRef(returnFocusTo);
  useEffect(() => {
    returnRef.current = returnFocusTo;
  });

  const modal = mode !== "push";
  const px = width ?? (side === "left" ? 400 : 520);

  /* Focus: into the sheet on open, back to the toggle on close. */
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      wasOpen.current = true;
      const sheet = sheetRef.current;
      const first = sheet?.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? sheet)?.focus({ preventScroll: true });
    } else if (!open && wasOpen.current) {
      wasOpen.current = false;
      returnRef.current?.current?.focus?.();
    }
  }, [open, mounted]);

  /* Esc closes (both modes); a modal sheet also traps Tab. Menus/dialogs that consume Esc first
   * (preventDefault / stopPropagation) win, so only the topmost layer closes. */
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      const sheet = sheetRef.current;
      if (!sheet) return;
      if (e.key === "Escape") {
        if (e.defaultPrevented) return;
        // A push sheet is not modal: only react when focus is inside it (or nowhere in particular).
        const active = document.activeElement;
        if (!modal && active && active !== document.body && !sheet.contains(active)) return;
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !modal) return;
      const items = Array.from(sheet.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
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
    },
    [modal],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, handleKey]);

  /* Body scroll lock: fullscreen only. */
  useEffect(() => {
    if (!open || mode !== "fullscreen") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, mode]);

  /* Motion. Normal: translateX(∓100%) -> 0 over 200 ms. Reduced: no transform, 80 ms opacity. */
  const hiddenX = side === "left" ? "-100%" : "100%";
  const motion: CSSProperties = reduced
    ? { opacity: shown ? 1 : 0, transition: `opacity ${ms}ms linear` }
    : {
        transform: shown ? "translateX(0)" : `translateX(${hiddenX})`,
        transition: `transform ${ms}ms ${EASE}`,
      };

  const ariaName = labelledBy
    ? { "aria-labelledby": labelledBy }
    : { "aria-label": title };

  const body = (
    <>
      <header className="flex items-start gap-3 py-4 pl-5 pr-14">
        {icon != null && (
          <span
            aria-hidden
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent"
          >
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="font-display text-lg leading-tight text-ink">
            {title}
          </h2>
          {description != null && (
            <p className="mt-0.5 text-[13px] leading-snug text-muted">{description}</p>
          )}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>

      {footer != null && (
        <footer className="flex items-center gap-2 border-t border-line px-5 py-3">{footer}</footer>
      )}

      {/* Last in DOM order on purpose (first focus lands on the panel's first control); drawn top-right. */}
      <button
        type="button"
        data-sheet-close
        onClick={() => onClose()}
        aria-label={`Close ${title}`}
        className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-paper-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <XIcon className="h-4 w-4" />
      </button>
    </>
  );

  // No `relative` here: the modal branch is `absolute` (the two would fight; `relative` won and parked a right-hand sheet at the left edge)
  const surface =
    "flex h-full min-h-0 flex-col bg-paper text-ink outline-none border-line";

  /* ── push: the aside always exists (aria-controls target) and reserves `px` while open. ── */
  if (mode === "push") {
    return (
      <aside
        id={id}
        role="region"
        {...ariaName}
        aria-hidden={mounted ? undefined : true}
        data-state={open ? "open" : "closed"}
        data-mode="push"
        inert={!open}
        className={cn("relative h-full min-h-0 shrink-0 overflow-hidden", className)}
        style={{
          width: open ? px : 0,
          transition: reduced ? "none" : `width ${ms}ms ${EASE}`,
          visibility: mounted ? "visible" : "hidden",
        }}
      >
        <div
          ref={sheetRef}
          tabIndex={-1}
          className={cn(
            surface,
            "relative",
            "rounded-[var(--radius-lg)] border",
          )}
          style={{ width: px, ...motion }}
        >
          {mounted && body}
        </div>
      </aside>
    );
  }

  /* ── overlay / fullscreen: a modal dialog. ── */
  if (!mounted) return null;
  const fullscreen = mode === "fullscreen";
  return (
    <div className="fixed inset-0 z-[1000]" data-mode={mode} data-state={open ? "open" : "closed"}>
      {!fullscreen && (
        <div
          data-sheet-scrim
          aria-hidden
          onClick={() => onClose()}
          className="absolute inset-0 bg-[color-mix(in_srgb,var(--color-ink)_45%,transparent)]"
          style={{
            opacity: shown ? 1 : 0,
            transition: `opacity ${ms}ms linear`,
          }}
        />
      )}
      <div
        ref={sheetRef}
        id={id}
        role="dialog"
        aria-modal="true"
        {...ariaName}
        tabIndex={-1}
        className={cn(
          surface,
          "absolute inset-y-0 shadow-[var(--shadow-lg)]",
          side === "left" ? "left-0" : "right-0",
          fullscreen ? "w-full" : "max-w-full rounded-none",
          className,
        )}
        style={{ ...(fullscreen ? null : { width: px }), ...motion }}
      >
        {body}
      </div>
    </div>
  );
}

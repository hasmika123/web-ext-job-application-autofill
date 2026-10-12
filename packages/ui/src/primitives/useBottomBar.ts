"use client";

import { useEffect, type RefObject } from "react";

/** The CSS variable every bottom bar publishes: how many px of the window's bottom edge the bars cover. */
export const BOTTOM_INSET_VAR = "--kiwi-bottom-inset";

/** `data-bottom-bar` is set on `<html>` while any bar is registered, for CSS that wants a yes/no. */
const BOTTOM_ATTR = "data-bottom-bar";

const insets = new Map<symbol, number>();

function publish() {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const px = Math.round(Math.max(0, ...insets.values()));
  if (px > 0) {
    root.style.setProperty(BOTTOM_INSET_VAR, `${px}px`);
    root.setAttribute(BOTTOM_ATTR, "");
  } else {
    root.style.removeProperty(BOTTOM_INSET_VAR);
    root.removeAttribute(BOTTOM_ATTR);
  }
}

/** How far up from the window's bottom edge a bar reaches; 0 when it is hidden, or in the page's flow (not stuck). */
export function bottomInsetOf(el: HTMLElement): number {
  if (typeof window === "undefined") return 0;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return 0;
  if (style.position !== "sticky" && style.position !== "fixed") return 0;
  const rect = el.getBoundingClientRect();
  if (rect.height === 0) return 0;
  // Measured from the bar's top edge to the window's bottom edge: a sticky bar on a short page sits higher and still clears.
  return Math.max(0, window.innerHeight - rect.top);
}

/**
 * useBottomBar - a sticky or fixed action bar at the bottom of the window announces itself, so anything else that floats
 * at the bottom can stay clear of it. It publishes `--kiwi-bottom-inset` (px, on `<html>`) and `data-bottom-bar`: the
 * bug-report button lifts above it and toasts sit above it (full width on a phone), so neither ever covers the bar's
 * primary action. With several bars the biggest inset wins; the variable is gone when the last one unmounts.
 *
 *   const ref = useRef<HTMLDivElement>(null);
 *   useBottomBar(ref);
 *   return <div ref={ref} className="sticky bottom-0 ...">...</div>;
 *
 * A bar that is not sticky or fixed at the current width (a footer that is in the flow from `sm` up) counts as 0.
 */
export default function useBottomBar(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined") return;
    const id = Symbol("bottom-bar");
    let frame = 0;
    const measure = () => {
      frame = 0;
      insets.set(id, bottomInsetOf(el));
      publish();
    };
    const schedule = () => {
      if (frame === 0) frame = window.requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, { passive: true });
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : null;
    observer?.observe(el);
    return () => {
      if (frame !== 0) window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule);
      observer?.disconnect();
      insets.delete(id);
      publish();
    };
  }, [ref]);
}

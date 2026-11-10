"use client";

/**
 * The link between the Swap Section panel (left) and the document canvas (middle), DESIGN 10.3.3 /
 * DECISIONS #31. They are siblings in the editor, and either can move an item or a section, so they
 * talk through one tiny module-level store keyed by item / section id:
 *
 *   - `highlight(id)`: the panel row under the pointer / focus -> the canvas item gets a soft ring;
 *   - `reveal(id)`: scroll the canvas item into view (focus, click, drag start);
 *   - `moved(id, text)`: after ANY move -> the canvas item scrolls into view and flashes, the panel row
 *     flashes too (if the panel is open), and `text` is announced ("Moved X to position 2 of 3 in Experience").
 *
 * Every target is a `useLinkTarget(id, role)`; it renders `data-link` / `data-flash` (styled in
 * globals.css) and scrolls itself after the render that shows the new order.
 */
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

/** How long a moved item stays flashed (ms); the `rb-flash` animation in globals.css is the same length. */
export const FLASH_MS = 1200; // config-literal-ok: UI animation timing (no settings group for UI timing)

interface LinkState {
  highlight: string | null;
  flash: { id: string; seq: number } | null;
  scroll: { id: string; seq: number; block: ScrollLogicalPosition } | null;
  announcement: { text: string; seq: number } | null;
}

const EMPTY: LinkState = { highlight: null, flash: null, scroll: null, announcement: null };

let state: LinkState = EMPTY;
let seq = 0;
let carrying = false;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function set(next: Partial<LinkState>): void {
  state = { ...state, ...next };
  for (const l of Array.from(listeners)) l();
}
const subscribe = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

export const moveLink = {
  /** The id whose canvas item gets the soft ring (the panel row hovered / focused / dragged), or null. A row being dragged keeps it. */
  highlight(id: string | null): void {
    if (carrying) return;
    if (state.highlight !== id) set({ highlight: id });
  },
  /** A row was picked up (`id`: ring its canvas item and scroll to it, and keep the ring for the whole drag) or put down (`null`). */
  carry(id: string | null): void {
    carrying = id !== null;
    set({ highlight: id, ...(id ? { scroll: { id, seq: ++seq, block: "center" as const } } : {}) });
  },
  /** Scroll the canvas item with this id into view. */
  reveal(id: string, block: ScrollLogicalPosition = "center"): void {
    set({ scroll: { id, seq: ++seq, block } });
  },
  /** An item or section moved: flash it everywhere, scroll the canvas to it and (when given) announce `text`. */
  moved(id: string, text?: string): void {
    if (timer) clearTimeout(timer);
    const n = ++seq;
    set({ flash: { id, seq: n }, ...(text ? { announcement: { text, seq: n } } : {}) });
    timer = setTimeout(() => {
      timer = null;
      // the announcement goes with the flash: a screen reader has read it by now, and a stale line must not
      // be read again when a live region mounts or un-hides later
      set({ flash: null, announcement: null });
    }, FLASH_MS);
  },
  /** Back to nothing (tests). */
  reset(): void {
    if (timer) clearTimeout(timer);
    timer = null;
    carrying = false;
    state = EMPTY;
    for (const l of Array.from(listeners)) l();
  },
};

/** The latest move announcement, for a polite live region ("" before any). */
export function useMoveAnnouncement(): string {
  return useSyncExternalStore(
    subscribe,
    () => state.announcement?.text ?? "",
    () => "",
  );
}

const reducedMotion = (): boolean => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Scroll `el` into view after the render that shows the new order: smooth, instant under reduced motion. */
function bringIntoView(el: HTMLElement | null, block: ScrollLogicalPosition): void {
  requestAnimationFrame(() => {
    if (el?.isConnected) el.scrollIntoView?.({ behavior: reducedMotion() ? "auto" : "smooth", block });
  });
}

export interface LinkTargetProps {
  ref: (el: HTMLElement | null) => void;
  "data-link-id": string;
  "data-link"?: "true";
  "data-flash"?: "true";
}

/**
 * Props to spread on the element that stands for item / section `id`. `canvas` targets also scroll for
 * `reveal` (the panel row was focused / clicked / dragged); a `panel` row only ever scrolls on a flash,
 * and only to the nearest edge (a move made on the canvas must show where the row went).
 */
export function useLinkTarget(id: string, role: "canvas" | "panel"): LinkTargetProps {
  const el = useRef<HTMLElement | null>(null);
  const ref = useCallback((node: HTMLElement | null) => {
    el.current = node;
  }, []);
  const linked = useSyncExternalStore(subscribe, () => state.highlight === id, () => false);
  const flash = useSyncExternalStore(subscribe, () => (state.flash?.id === id ? state.flash.seq : 0), () => 0);
  const reveal = useSyncExternalStore(subscribe, () => (state.scroll?.id === id ? state.scroll.seq : 0), () => 0);

  useEffect(() => {
    if (flash) bringIntoView(el.current, "nearest");
  }, [flash]);
  useEffect(() => {
    if (reveal && role === "canvas" && state.scroll) bringIntoView(el.current, state.scroll.block);
  }, [reveal, role]);

  return {
    ref,
    "data-link-id": id,
    ...(role === "canvas" && linked ? { "data-link": "true" as const } : {}),
    ...(flash ? { "data-flash": "true" as const } : {}),
  };
}

"use client";

import { useSyncExternalStore } from "react";

/** Reads a CSS media query; `fallback` where `matchMedia` is missing (the server, jsdom). */
function useMedia(query: string, fallback: boolean): boolean {
  return useSyncExternalStore(
    (cb) => {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
      const mq = window.matchMedia(query);
      mq.addEventListener?.("change", cb);
      return () => mq.removeEventListener?.("change", cb);
    },
    () => (typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(query).matches : fallback),
    () => fallback,
  );
}

// config-literal-ok: Tailwind's `md` breakpoint (768 px) in media-query form; layout geometry, not a tunable
const NARROW_QUERY = "(max-width: 767px)";
// config-literal-ok: Tailwind's `xl` breakpoint (1280 px) in media-query form; the routing table needs this much room
const WIDE_QUERY = "(min-width: 1280px)";

/** True on a phone (below `md`): confirm dialogs become bottom sheets, the history drawer goes full screen. */
export function useNarrow(): boolean {
  return useMedia(NARROW_QUERY, false);
}

/** True from `xl` up: the routing and pricing tables show as real tables; below, as cards with a sheet editor. */
export function useWide(): boolean {
  return useMedia(WIDE_QUERY, true);
}

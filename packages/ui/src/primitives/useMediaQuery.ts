"use client";

import { useSyncExternalStore } from "react";

/**
 * useMediaQuery - follows a CSS media query live. `fallback` is the answer where `matchMedia` does not exist (the
 * server, jsdom) and during hydration; a client whose query differs corrects itself right after. Layout decisions that
 * CSS alone cannot make (a Dialog on a desktop but a BottomSheet on a phone) use it; plain show/hide stays in Tailwind.
 *
 *   const phone = useMediaQuery("(max-width: 767px)", false);
 */
export default function useMediaQuery(query: string, fallback = false): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => undefined;
      const mq = window.matchMedia(query);
      mq.addEventListener?.("change", onChange);
      return () => mq.removeEventListener?.("change", onChange);
    },
    () => (typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(query).matches : fallback),
    () => fallback,
  );
}

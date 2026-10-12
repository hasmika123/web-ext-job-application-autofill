"use client";

import { useSyncExternalStore } from "react";

/**
 * True while `query` matches (`useMediaQuery("(min-width: 768px)")`). False on the server and wherever `matchMedia` is
 * missing (jsdom), so the phone-first markup is what first renders; it settles on the real answer after hydration.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
      const mq = window.matchMedia(query);
      mq.addEventListener?.("change", cb);
      return () => mq.removeEventListener?.("change", cb);
    },
    () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches,
    () => false,
  );
}

"use client";

import { useSyncExternalStore } from "react";

// config-literal-ok: Tailwind's `sm` breakpoint (640 px) in CSS media-query form; layout geometry, not a tunable
const PHONE_QUERY = "(max-width: 639px)";

function subscribe(cb: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const mq = window.matchMedia(PHONE_QUERY);
  mq.addEventListener?.("change", cb);
  return () => mq.removeEventListener?.("change", cb);
}

const snapshot = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(PHONE_QUERY).matches;

/**
 * True below Tailwind's `sm` breakpoint (a phone). False on the server and wherever `matchMedia` is
 * missing (tests), so desktop markup is what first renders. The list page and the new-resume chooser use
 * it to swap a desktop control row for a Filters sheet and a Dialog for a fullscreen sheet (DESIGN 10.14, 10.17).
 */
export function usePhone(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}

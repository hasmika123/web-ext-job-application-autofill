"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/** True when the user asked the OS for less motion. False on the server (no window). */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(QUERY).matches;
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => undefined;
  const mq = window.matchMedia(QUERY);
  // `addEventListener` is missing on very old Safari; a media query list without it simply never notifies.
  mq.addEventListener?.("change", onChange);
  return () => mq.removeEventListener?.("change", onChange);
}

/**
 * useReducedMotion - the one place components ask "should this move?" (SwipeCard, ConfettiBurst, the
 * onboarding shell). Follows `prefers-reduced-motion` live, so flipping the OS setting takes effect without a
 * reload. The server snapshot is `false`; a client that prefers less motion corrects itself on hydration.
 *
 *   const reduced = useReducedMotion();
 */
export default function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, prefersReducedMotion, () => false);
}

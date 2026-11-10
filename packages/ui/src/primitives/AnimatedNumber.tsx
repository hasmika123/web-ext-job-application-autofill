"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "./cn";
import useReducedMotion from "./useReducedMotion";

/**
 * AnimatedNumber - a number that moves when it changes (ONBOARDING-DELIGHT-DESIGN 3.3 / 5.6 / 9.3).
 *
 * - `mode="flip"` (default): the old figure slides up and fades while the new one slides in from below, 180 ms, inside a box one
 *   line high with `overflow-hidden` and `tabular-nums`, so the width and the height never jump (the review's "3 / 8", the bar's
 *   "about 2 min left").
 * - `mode="countUp"`: counts from `from` (default 0) to `value` over `duration` ms (default 800), easing out, and ends EXACTLY on
 *   `value` (the payoff's "~31 fields").
 *
 * For assistive tech the FINAL value is plain text in an `sr-only` span from the first render; the moving digits are `aria-hidden`.
 * Under `prefers-reduced-motion` the value just changes (flip) or is the final number at once (countUp).
 *
 *   <AnimatedNumber value={cursor + 1} />
 */
export interface AnimatedNumberProps {
  value: number;
  mode?: "flip" | "countUp";
  /** countUp only: how long the count takes (ms). */
  duration?: number;
  /** countUp only: where it starts. */
  from?: number;
  /**
   * Put the final value in an `sr-only` span for assistive tech (default). Turn it off where the host already names the value
   * (the review counter's `aria-label="Card 3 of 8"`, a decorative chip), so it is not said twice and `textContent` stays clean.
   */
  announce?: boolean;
  className?: string;
}

/** How long a flip takes (ms); the CSS animation in `styles/delight.css` runs the same time. */
export const FLIP_MS = 180;

export default function AnimatedNumber({ value, mode = "flip", duration = 800, from = 0, announce = true, className }: AnimatedNumberProps) {
  return mode === "countUp" ? (
    <CountUp value={value} duration={duration} from={from} announce={announce} className={className} />
  ) : (
    <Flip value={value} announce={announce} className={className} />
  );
}

function Flip({ value, announce, className }: { value: number; announce: boolean; className?: string }) {
  const reduced = useReducedMotion();
  // The figure that is leaving, kept for one flip. Derived from the change during render (no extra paint with a stale number).
  const [shown, setShown] = useState(value);
  const [leaving, setLeaving] = useState<number | null>(null);
  if (shown !== value) {
    setLeaving(reduced ? null : shown);
    setShown(value);
  }
  useEffect(() => {
    if (leaving === null) return;
    const t = setTimeout(() => setLeaving(null), FLIP_MS);
    return () => clearTimeout(t);
  }, [leaving]);

  return (
    <span className={cn("relative inline-block overflow-hidden align-bottom tabular-nums", className)} data-animated-number="flip">
      {announce && <span className="sr-only">{value}</span>}
      <span aria-hidden className={cn("block", leaving !== null && "kiwi-flip-in")} key={value}>
        {value}
      </span>
      {leaving !== null && (
        <span aria-hidden data-flip-out className="kiwi-flip-out absolute inset-0 block">
          {leaving}
        </span>
      )}
    </span>
  );
}

function CountUp({ value, duration, from, announce, className }: { value: number; duration: number; from: number; announce: boolean; className?: string }) {
  const reduced = useReducedMotion();
  const [n, setN] = useState(reduced ? value : from);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    if (reduced || duration <= 0 || typeof requestAnimationFrame !== "function") {
      // Final number at once: reading it in an effect keeps server and first client render the same.
      setN(value); // eslint-disable-line react-hooks/set-state-in-effect
      return;
    }
    let start: number | null = null; // the first frame's own timestamp: no assumption about the clock's origin
    const tick = (now: number) => {
      start ??= now;
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out
      setN(t >= 1 ? value : Math.round(from + (value - from) * eased));
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
    };
  }, [value, duration, from, reduced]);

  return (
    <span className={cn("tabular-nums", className)} data-animated-number="countUp">
      {announce && <span className="sr-only">{value}</span>}
      <span aria-hidden>{n}</span>
    </span>
  );
}

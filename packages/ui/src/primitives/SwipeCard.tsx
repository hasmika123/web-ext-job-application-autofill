"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, PointerEvent, ReactNode } from "react";
import { cn } from "./cn";
import useReducedMotion from "./useReducedMotion";

/**
 * SwipeCard - a keep / skip gesture around one card (profile setup review). Swipe right to keep, left
 * to skip: on touch and pen by default (a mouse drag would fight text selection; `mouse` turns it on).
 * Vertical movement is left to the browser (`touch-action: pan-y`), so the page still scrolls.
 *
 * The gesture is a convenience, never the only way: the host always renders Keep and Skip buttons, and
 * with the card itself focused the arrow keys do the same (Right = keep, Left = skip). Under
 * `prefers-reduced-motion` the card does not move or tilt while dragged; the Keep / Skip hint still
 * fades in so the drag has feedback.
 *
 * `stamp` turns the plain hint pill into a game stamp (ONBOARDING-DELIGHT-DESIGN 3.2): a rotated "KEEP ✓" (top right, accent) or
 * "SKIP" (top left, danger) whose opacity tracks the drag. A release past the threshold then calls `onKeep` / `onSkip` at once
 * with the drag offset (`{ dx }`) so the host can fly the card off from where the finger let go; on its own the card flies off
 * too (`onFlingEnd` after 240 ms). `fling="keep" | "skip"` plays that fly-off now (a decision made with a button or a key) with
 * the stamp at full strength; a host draws the card that just left this way. Under reduced motion nothing flies or tilts: the
 * stamp is the feedback (opacity only) and `onFlingEnd` follows after 120 ms.
 *
 * With none of `stamp` / `fling` set the card is exactly what it always was.
 *
 *   <SwipeCard onKeep={keep} onSkip={skip} aria-label="Software Engineer at Acme">...</SwipeCard>
 */
export interface SwipeCardProps {
  /** `info.dx` is the drag offset in px of a swipe release (stamp mode); a key or a button gives none. */
  onKeep: (info?: { dx: number }) => void;
  onSkip: (info?: { dx: number }) => void;
  children: ReactNode;
  /** Accessible name of the card (it is a focusable group). */
  "aria-label": string;
  disabled?: boolean;
  /** Pixels of horizontal travel that count as a decision. */
  threshold?: number;
  /** Also accept a mouse drag. */
  mouse?: boolean;
  keepLabel?: string;
  skipLabel?: string;
  /** The stamp look for the hint (default: today's pill). */
  stamp?: boolean;
  /** Play the fly-off now, in this direction (the card that just left). */
  fling?: "keep" | "skip" | null;
  /** The fly-off (240 ms; 120 ms under reduced motion) is over. */
  onFlingEnd?: () => void;
  /** `aria-keyshortcuts` of the card ("ArrowRight ArrowLeft" by default; the review adds its E and Z). */
  keyShortcuts?: string;
  className?: string;
}

/** The fly-off's length (ms): the CSS animation in `styles/delight.css` runs the same time. */
const FLING_MS = 240;
const FLING_STILL_MS = 120;

export default function SwipeCard({
  onKeep,
  onSkip,
  children,
  disabled,
  threshold = 96,
  mouse = false,
  keepLabel = "Keep",
  skipLabel = "Skip",
  stamp = false,
  fling = null,
  onFlingEnd,
  keyShortcuts = "ArrowRight ArrowLeft",
  className,
  ...rest
}: SwipeCardProps) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  // A release past the threshold in stamp mode: the card keeps flying from where it was let go.
  const [released, setReleased] = useState<{ dir: "keep" | "skip"; from: number } | null>(null);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const still = useReducedMotion();

  const reset = () => {
    start.current = null;
    setDragging(false);
    setDx(0);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled || released || fling) return;
    if (e.pointerType === "mouse" && !mouse) return;
    // Let controls inside the card (inputs, buttons, links) keep their own pointer behaviour.
    if ((e.target as HTMLElement).closest("button, a, input, textarea, select, label, [data-no-swipe]")) return;
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    setDragging(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    setDx(e.clientX - s.x);
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    const moved = e.clientX - s.x;
    const past = moved >= threshold || moved <= -threshold;
    // In stamp mode a decision keeps the card where it is (flying off from there) instead of snapping it back.
    if (stamp && past) {
      start.current = null;
      setDragging(false);
      setReleased({ dir: moved > 0 ? "keep" : "skip", from: moved });
      setDx(0);
    } else {
      reset();
    }
    if (moved >= threshold) onKeep(stamp ? { dx: moved } : undefined);
    else if (moved <= -threshold) onSkip(stamp ? { dx: moved } : undefined);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled || e.target !== e.currentTarget) return; // arrows inside a field belong to the field
    if (e.key === "ArrowRight") {
      e.preventDefault();
      onKeep();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      onSkip();
    }
  };

  const dir = fling ?? released?.dir ?? null;
  const flingFrom = fling ? 0 : (released?.from ?? 0);
  // `onFlingEnd` once the fly-off has had its time (a timer, not an animationend event: it also fires where nothing animates).
  const onEnd = useRef(onFlingEnd);
  useEffect(() => {
    onEnd.current = onFlingEnd;
  });
  useEffect(() => {
    if (!dir) return;
    const t = setTimeout(() => onEnd.current?.(), still ? FLING_STILL_MS : FLING_MS);
    return () => clearTimeout(t);
  }, [dir, still]);

  const progress = Math.min(1, Math.abs(dx) / threshold);
  const dragDir = dx > 0 ? "keep" : dx < 0 ? "skip" : null;
  const hint = dragDir === "keep" ? keepLabel : dragDir === "skip" ? skipLabel : "";

  const style: CSSProperties = {
    touchAction: "pan-y",
    transform: dragging && !still ? `translateX(${dx}px) rotate(${dx / 24}deg)` : undefined,
    transition: dragging || still ? "none" : "transform 160ms ease-out",
  };
  if (stamp && dragging) style.willChange = "transform"; // only while a finger is on it
  if (flingFrom) (style as Record<string, unknown>)["--kiwi-fling-from"] = Math.round(flingFrom);

  // The stamp: strength follows the drag; a decision made by a button, a key or a release shows it at full strength.
  const stampDir = dir ?? dragDir;
  const stampOpacity = dir ? 1 : progress;
  const stampLabel = stampDir === "keep" ? keepLabel : skipLabel;

  return (
    <div
      role="group"
      aria-roledescription="swipeable card"
      aria-keyshortcuts={keyShortcuts}
      tabIndex={disabled ? -1 : 0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={reset}
      onKeyDown={onKeyDown}
      data-fling={dir ?? undefined}
      style={style}
      className={cn(
        "relative rounded-[var(--radius-lg)] outline-none focus-visible:ring-2 focus-visible:ring-accent",
        dir && !still && (dir === "keep" ? "kiwi-fling-right" : "kiwi-fling-left"),
        className,
      )}
      {...rest}
    >
      {children}
      {stamp
        ? stampDir && (
            <span
              aria-hidden
              data-swipe-hint={stampDir}
              data-stamp
              style={{ opacity: stampOpacity, transform: `rotate(${stampDir === "keep" ? 12 : -12}deg)` }}
              className={cn(
                "kiwi-stamp-snap pointer-events-none absolute top-4 rounded-lg border-[2.5px] px-3 py-1 text-[16px] font-extrabold uppercase leading-tight tracking-[.08em]",
                stampDir === "keep" ? "right-4 border-accent bg-accent-soft text-accent-deep" : "left-4 border-danger bg-paper text-danger-text",
              )}
            >
              {stampLabel}
              {stampDir === "keep" ? " ✓" : ""}
            </span>
          )
        : hint && (
            <span
              aria-hidden
              data-swipe-hint={dx > 0 ? "keep" : "skip"}
              style={{ opacity: progress }}
              className={cn(
                "pointer-events-none absolute top-3 rounded-full border-2 px-3 py-1 text-[13px] font-extrabold uppercase tracking-wide",
                dx > 0 ? "right-3 border-accent bg-accent-soft text-accent-deep" : "left-3 border-danger bg-paper text-danger-text",
              )}
            >
              {hint}
            </span>
          )}
    </div>
  );
}

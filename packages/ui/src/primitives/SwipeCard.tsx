"use client";

import { useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent, ReactNode } from "react";
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
 *   <SwipeCard onKeep={keep} onSkip={skip} aria-label="Software Engineer at Acme">...</SwipeCard>
 */
export interface SwipeCardProps {
  onKeep: () => void;
  onSkip: () => void;
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
  className?: string;
}

export default function SwipeCard({
  onKeep,
  onSkip,
  children,
  disabled,
  threshold = 96,
  mouse = false,
  keepLabel = "Keep",
  skipLabel = "Skip",
  className,
  ...rest
}: SwipeCardProps) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);

  const reset = () => {
    start.current = null;
    setDragging(false);
    setDx(0);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
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
    reset();
    if (moved >= threshold) onKeep();
    else if (moved <= -threshold) onSkip();
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

  const still = useReducedMotion();
  const progress = Math.min(1, Math.abs(dx) / threshold);
  const hint = dx > 0 ? keepLabel : dx < 0 ? skipLabel : "";

  return (
    <div
      role="group"
      aria-roledescription="swipeable card"
      aria-keyshortcuts="ArrowRight ArrowLeft"
      tabIndex={disabled ? -1 : 0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={reset}
      onKeyDown={onKeyDown}
      style={{
        touchAction: "pan-y",
        transform: dragging && !still ? `translateX(${dx}px) rotate(${dx / 24}deg)` : undefined,
        transition: dragging || still ? "none" : "transform 160ms ease-out",
      }}
      className={cn("relative rounded-[var(--radius-lg)] outline-none focus-visible:ring-2 focus-visible:ring-accent", className)}
      {...rest}
    >
      {children}
      {hint && (
        <span
          aria-hidden
          data-swipe-hint={dx > 0 ? "keep" : "skip"}
          style={{ opacity: progress }}
          className={cn(
            "pointer-events-none absolute top-3 rounded-full border-2 px-3 py-1 text-[13px] font-extrabold uppercase tracking-wide",
            dx > 0 ? "right-3 border-accent bg-accent-soft text-accent-deep" : "left-3 border-danger bg-paper text-danger",
          )}
        >
          {hint}
        </span>
      )}
    </div>
  );
}

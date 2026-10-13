"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "./cn";
import { StarDoodle } from "./doodles";
import useReducedMotion from "./useReducedMotion";

/**
 * SparkleBurst - a tiny burst of dots and stars from a point: the review's Keep (ONBOARDING-DELIGHT-DESIGN 3.7 / 9.4).
 * Eight pieces (six 6 px dots in the accent, the deep accent and the warm colour, two 8 px stars) radiate 48 px over 320 ms,
 * shrinking and fading, with deterministic angles (no randomness: a screenshot or a test is stable).
 *
 * Plays exactly once when it mounts (the host re-keys it to play again). It is decoration: `aria-hidden`,
 * `pointer-events-none`, `absolute` at the centre of its nearest positioned ancestor (the Keep button's wrapper, or the card
 * stack), so it never takes part in layout. Renders nothing under `prefers-reduced-motion`.
 *
 *   <span className="relative"><Button>Keep</Button><SparkleBurst key={n} /></span>
 */
export interface SparkleBurstProps {
  /** Where it starts. Only the centre of the positioned parent for now. */
  at?: "center";
  /** How many pieces (default 8; two of them are stars). */
  count?: number;
  className?: string;
}

const COLORS = ["var(--color-accent)", "var(--color-accent-deep)", "var(--color-warn)"];
/** How far the pieces travel (px) and how long they take (ms). */
const RADIUS = 48;
export const SPARKLE_MS = 320;

export default function SparkleBurst({ at = "center", count = 8, className }: SparkleBurstProps) {
  const reduced = useReducedMotion();
  // Decided after mount so the server and the first client render agree (both draw nothing).
  const [on, setOn] = useState(false);
  const host = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    setOn(!reduced); // eslint-disable-line react-hooks/set-state-in-effect -- a media query is only readable on the client
  }, [reduced]);

  useEffect(() => {
    if (!on || !host.current) return;
    const pieces = Array.from(host.current.children) as HTMLElement[];
    const runs = pieces.map((el, i) => {
      if (typeof el.animate !== "function") return null;
      const angle = (i / pieces.length) * Math.PI * 2 - Math.PI / 2; // evenly round the circle, starting straight up
      const x = Math.cos(angle) * RADIUS;
      const y = Math.sin(angle) * RADIUS;
      return el.animate(
        [
          { transform: "translate(-50%, -50%) scale(1)", opacity: 1 },
          { transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(0)`, opacity: 0 },
        ],
        { duration: SPARKLE_MS, easing: "cubic-bezier(.2,.7,.4,1)", fill: "forwards" },
      );
    });
    return () => runs.forEach((a) => a?.cancel());
  }, [on]);

  if (!on) return null;
  return (
    <span ref={host} aria-hidden data-sparkle-burst data-at={at} className={cn("pointer-events-none absolute left-1/2 top-1/2 z-10 h-0 w-0", className)}>
      {Array.from({ length: count }, (_, i) => {
        const star = i % 4 === 1 && i < 8; // two of the eight
        const color = COLORS[i % COLORS.length];
        return star ? (
          <span key={i} data-sparkle="star" className="absolute left-0 top-0 block h-2 w-2" style={{ color, opacity: 0 }}>
            <StarDoodle className="h-2 w-2" fill="currentColor" />
          </span>
        ) : (
          <span key={i} data-sparkle="dot" className="absolute left-0 top-0 block h-1.5 w-1.5 rounded-full" style={{ background: color, opacity: 0 }} />
        );
      })}
    </span>
  );
}

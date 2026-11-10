"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "./cn";
import useReducedMotion from "./useReducedMotion";

/**
 * ConfettiBurst - one short burst of confetti for a finished moment (the profile setup's last step).
 * Plays exactly once when it mounts, then stays empty; decorative (`aria-hidden`, no pointer events).
 * Renders nothing at all under `prefers-reduced-motion`. Put it inside a `relative` container; the
 * burst starts at the top centre and falls through the container.
 *
 *   <div className="relative"><ConfettiBurst /> ...the finished view...</div>
 */
const COLORS = ["var(--color-accent)", "var(--color-accent-deep)", "var(--color-warn)", "var(--color-danger)", "var(--color-ink)"];

export default function ConfettiBurst({ count = 24, className }: { count?: number; className?: string }) {
  const reduced = useReducedMotion();
  const [on, setOn] = useState(false);
  const host = useRef<HTMLDivElement>(null);

  // Decided after mount so server and first client render agree (both render nothing); it follows the OS setting
  // if that changes while the burst is on screen.
  useEffect(() => {
    // Reading the media query is only possible on the client, hence state set in an effect.
    setOn(!reduced);
  }, [reduced]);

  useEffect(() => {
    if (!on || !host.current) return;
    const pieces = Array.from(host.current.children) as HTMLElement[];
    const runs = pieces.map((el, i) => {
      if (typeof el.animate !== "function") return null;
      const angle = (i / pieces.length) * Math.PI - Math.PI / 2 + (Math.sin(i * 12.9898) * 0.35); // spread over the top half, deterministic
      const speed = 120 + ((i * 37) % 90);
      const x = Math.sin(angle) * speed * 1.6;
      const up = -Math.cos(angle) * speed * 0.9;
      return el.animate(
        [
          { transform: "translate(0, 0) rotate(0deg)", opacity: 1 },
          { transform: `translate(${x * 0.6}px, ${up}px) rotate(${(i % 2 ? 1 : -1) * 200}deg)`, opacity: 1, offset: 0.35 },
          { transform: `translate(${x}px, ${up + 260}px) rotate(${(i % 2 ? 1 : -1) * 520}deg)`, opacity: 0 },
        ],
        { duration: 1500 + (i % 5) * 140, easing: "cubic-bezier(.2,.7,.4,1)", fill: "forwards" },
      );
    });
    return () => runs.forEach((a) => a?.cancel());
  }, [on]);

  if (!on) return null;
  return (
    <div ref={host} aria-hidden data-confetti className={cn("pointer-events-none absolute left-1/2 top-0 z-10 h-0 w-0", className)}>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className="absolute block h-2 w-1.5 rounded-[1px]"
          style={{ background: COLORS[i % COLORS.length], opacity: 0 }}
        />
      ))}
    </div>
  );
}

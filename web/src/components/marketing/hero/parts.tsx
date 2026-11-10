import type { CSSProperties, ReactNode } from "react";
import { cn } from "@kiwiply/ui";

/**
 * Small building blocks for the hero art stage (V2.2x). The stage is an 820x700 px canvas (scaled
 * by `.hero-art-stage` in globals.css), so everything here is positioned in plain px with `Box`.
 * Server components; icons come from `@kiwiply/ui`, never inline svg.
 */

export interface BoxProps {
  x: number;
  y: number;
  w?: number;
  h?: number;
  /** Degrees. */
  rot?: number;
  z?: number;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

/** Absolutely positioned box on the stage canvas. */
export function Box({ x, y, w, h, rot, z = 10, className, style, children }: BoxProps) {
  return (
    <div
      className={cn("absolute", className)}
      style={{
        left: x,
        top: y,
        width: w,
        height: h,
        zIndex: z,
        transform: rot ? `rotate(${rot}deg)` : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** White floating card (18px radius, soft float shadow). */
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "h-full w-full rounded-[18px] border border-white/80 bg-white shadow-[0_18px_44px_rgba(27,31,94,.13),0_2px_6px_rgba(27,31,94,.05)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Rounded-square tile holding a glyph (or letters), in a soft family colour. */
export function Tile({
  size = 40,
  className,
  children,
}: {
  size?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      aria-hidden
      className={cn("grid flex-none place-items-center rounded-[12px]", className)}
      style={{ width: size, height: size }}
    >
      {children}
    </span>
  );
}

/** Yellow sticky note, hand font. */
export function Sticky({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      aria-hidden
      className={cn(
        "bg-v2-sticky font-[family-name:var(--font-hand)] leading-[1.1] text-v2-sticky-ink shadow-[0_10px_22px_rgba(27,31,94,.14)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Soft blurred disc (the lime circle behind the person, bokeh behind cards). */
export function Disc({ x, y, d, color, opacity = 1, blur = 0, z = 0 }: {
  x: number;
  y: number;
  d: number;
  color: string;
  opacity?: number;
  blur?: number;
  z?: number;
}) {
  return (
    <div
      aria-hidden
      className="absolute rounded-full"
      style={{
        left: x,
        top: y,
        width: d,
        height: d,
        background: color,
        opacity,
        filter: blur ? `blur(${blur}px)` : undefined,
        zIndex: z,
      }}
    />
  );
}

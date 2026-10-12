"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * PageFrame - a fixed-width "sheet of paper" scaled to fit its container (Resume Builder editor
 * preview, DESIGN 7.4/7.5). Children are laid out at their natural `pageWidth` (CSS px; Letter is
 * 816, A4 is 794) and the whole sheet is shrunk with a CSS transform so it never overflows the pane:
 *
 *   scale = min(maxScale, containerWidth / pageWidth) * zoom
 *
 * The outer box reserves the *scaled* height, so the page flow below it is correct (a transformed
 * element keeps its unscaled layout box). The sheet gets a paper surface and a soft shadow; the
 * content decides its own height (the template's `.rz-page` has a Letter/A4 `min-height`).
 *
 * `onMeasure` reports `{scale, contentHeight}` (unscaled px) whenever either changes, which is what a
 * page-count badge or the fit ladder needs. No dependencies; falls back to scale 1 where
 * `ResizeObserver` is missing (SSR, jsdom).
 */
export interface PageFrameProps {
  children: ReactNode;
  /** Natural width of the sheet in CSS px. Default 816 (8.5 in). */
  pageWidth?: number;
  /** Upper bound for the fit scale (1 = never magnify). */
  maxScale?: number;
  /** Extra zoom multiplier applied on top of the fit scale. */
  zoom?: number;
  onMeasure?: (m: { scale: number; contentHeight: number }) => void;
  className?: string;
  /** Accessible name for the region. */
  label?: string;
}

/** The fit scale for a container: never magnify past `maxScale`, never collapse to nothing. */
export function fitScale(containerWidth: number, pageWidth: number, maxScale = 1, zoom = 1): number {
  if (!(containerWidth > 0) || !(pageWidth > 0)) return Math.max(0.05, maxScale * zoom);
  return Math.max(0.05, Math.min(maxScale, containerWidth / pageWidth) * zoom);
}

export default function PageFrame({
  children,
  pageWidth = 816,
  maxScale = 1,
  zoom = 1,
  onMeasure,
  className,
  label = "Page preview",
}: PageFrameProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, contentHeight: 0 });
  const measureRef = useRef(onMeasure);
  useEffect(() => {
    measureRef.current = onMeasure;
  });

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner || typeof ResizeObserver === "undefined") return;
    const read = () => {
      const width = outer.clientWidth;
      const contentHeight = inner.offsetHeight;
      setBox((b) => (b.width === width && b.contentHeight === contentHeight ? b : { width, contentHeight }));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(outer);
    ro.observe(inner);
    return () => ro.disconnect();
  }, []);

  const scale = fitScale(box.width, pageWidth, maxScale, zoom);

  useEffect(() => {
    if (box.contentHeight > 0) measureRef.current?.({ scale, contentHeight: box.contentHeight });
  }, [scale, box.contentHeight]);

  return (
    <div
      ref={outerRef}
      role="region"
      aria-label={label}
      className={cn("relative w-full min-w-0 overflow-hidden", className)}
      style={{ height: box.contentHeight > 0 ? Math.ceil(box.contentHeight * scale) : undefined }}
    >
      <div
        ref={innerRef}
        data-page-frame-sheet=""
        className="absolute left-0 top-0 origin-top-left bg-white shadow-[0_8px_24px_rgb(0_0_0/0.12)] ring-1 ring-black/5"
        style={{ width: pageWidth, transform: `scale(${scale})` }}
      >
        {children}
      </div>
    </div>
  );
}

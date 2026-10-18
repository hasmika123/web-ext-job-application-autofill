"use client";

import { useRef } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { cn } from "@kiwiply/ui";
import { MAX_ZOOM, MIN_ZOOM, ZOOM_STEP, cropRect, panByPixels, panByStep, zoomTo } from "./crop";
import type { Crop } from "./crop";

/** The crop window's side in CSS pixels. */
const VIEWPORT = 256; // config-literal-ok: layout size of the crop window

/**
 * The square photo crop (R7.4, DESIGN 5.1), no dependency: the picture sits in a fixed window; drag to move it, the
 * slider or `+` / `-` to zoom (1x to 3x), arrow keys to move it by a few percent. A circle shows how a round slot will
 * frame it; the stored picture is the whole square. The crop state lives in the parent (`PhotoDialog`), which also
 * exports it.
 */
export default function PhotoCropper({
  src,
  naturalWidth,
  naturalHeight,
  crop,
  onCropChange,
  disabled = false,
}: {
  src: string;
  naturalWidth: number;
  naturalHeight: number;
  crop: Crop;
  onCropChange: (next: Crop) => void;
  disabled?: boolean;
}) {
  const drag = useRef<{ x: number; y: number } | null>(null);
  const { sx, sy, side } = cropRect(naturalWidth, naturalHeight, crop);
  const scale = VIEWPORT / side;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const move = (dx: number, dy: number) => {
      e.preventDefault();
      onCropChange(panByStep(naturalWidth, naturalHeight, crop, dx, dy));
    };
    switch (e.key) {
      case "ArrowLeft":
        return move(-1, 0);
      case "ArrowRight":
        return move(1, 0);
      case "ArrowUp":
        return move(0, -1);
      case "ArrowDown":
        return move(0, 1);
      case "+":
      case "=":
        e.preventDefault();
        return onCropChange(zoomTo(naturalWidth, naturalHeight, crop, crop.zoom + ZOOM_STEP));
      case "-":
      case "_":
        e.preventDefault();
        return onCropChange(zoomTo(naturalWidth, naturalHeight, crop, crop.zoom - ZOOM_STEP));
    }
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    drag.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const from = drag.current;
    if (!from) return;
    const dx = e.clientX - from.x;
    const dy = e.clientY - from.y;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    drag.current = { x: e.clientX, y: e.clientY };
    onCropChange(panByPixels(naturalWidth, naturalHeight, crop, dx, dy, VIEWPORT));
  };
  const endDrag = () => {
    drag.current = null;
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        role="group"
        tabIndex={disabled ? -1 : 0}
        aria-label="Photo crop. Drag or use the arrow keys to move the picture, plus and minus to zoom."
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={{ width: VIEWPORT, height: VIEWPORT }}
        className={cn(
          "relative touch-none select-none overflow-hidden rounded-2xl bg-paper-2 outline-none focus-visible:ring-2 focus-visible:ring-accent",
          disabled ? "opacity-60" : "cursor-grab active:cursor-grabbing",
        )}
        data-testid="photo-crop-window"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL being cropped; next/image cannot optimise it */}
        <img
          src={src}
          alt=""
          draggable={false}
          style={{ position: "absolute", maxWidth: "none", width: naturalWidth * scale, height: naturalHeight * scale, left: -sx * scale, top: -sy * scale }}
        />
        <span aria-hidden className="pointer-events-none absolute inset-3 rounded-full border-2 border-white/90 shadow-[0_0_0_999px_rgba(0,0,0,0.35)]" />
      </div>
      <label className="flex w-full max-w-[256px] items-center gap-3 text-[13px] text-ink-soft">
        <span className="flex-none font-medium">Zoom</span>
        <input
          type="range"
          aria-label="Zoom"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={0.05}
          value={crop.zoom}
          disabled={disabled}
          onChange={(e) => onCropChange(zoomTo(naturalWidth, naturalHeight, crop, Number(e.target.value)))}
          className="h-6 min-w-0 flex-1 accent-accent max-sm:h-11"
        />
      </label>
    </div>
  );
}

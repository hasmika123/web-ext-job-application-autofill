/**
 * The photo crop maths (R7.4, DESIGN 5.1): pure functions, no DOM except `cropToBlob`. A crop is a square window onto
 * the picture: `zoom` 1 shows the picture's short side whole, 3 shows a third of it; `cx` / `cy` are the window's centre as
 * fractions of the picture (0..1), always clamped so the window stays inside the picture.
 */

export interface Crop {
  zoom: number;
  cx: number;
  cy: number;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 3;
/** One keyboard / button zoom step. */
export const ZOOM_STEP = 0.25;
/** One arrow-key pan step, as a fraction of the visible window. */
export const PAN_STEP = 0.05;
/** The stored photo's side (API `ResumePhotoProcessor.OUT_SIDE`): the crop is exported at this size, or smaller if the picture is. */
export const OUT_SIDE = 512; // config-literal-ok: schema constant shared with the API's photo processor, not a builder tunable

export const INITIAL_CROP: Crop = { zoom: MIN_ZOOM, cx: 0.5, cy: 0.5 };

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** The side, in source pixels, of the square the crop shows. */
export function visibleSide(nw: number, nh: number, zoom: number): number {
  return Math.min(nw, nh) / clamp(zoom, MIN_ZOOM, MAX_ZOOM);
}

/** `crop` with its zoom bounded and its centre moved just enough that the window lies inside the picture. */
export function clampCrop(nw: number, nh: number, crop: Crop): Crop {
  const zoom = clamp(crop.zoom, MIN_ZOOM, MAX_ZOOM);
  const side = visibleSide(nw, nh, zoom);
  const halfX = side / 2 / nw;
  const halfY = side / 2 / nh;
  return { zoom, cx: clamp(crop.cx, halfX, 1 - halfX), cy: clamp(crop.cy, halfY, 1 - halfY) };
}

/** The window in source pixels. */
export function cropRect(nw: number, nh: number, crop: Crop): { sx: number; sy: number; side: number } {
  const c = clampCrop(nw, nh, crop);
  const side = visibleSide(nw, nh, c.zoom);
  return { sx: c.cx * nw - side / 2, sy: c.cy * nh - side / 2, side };
}

/** Drag by `dx` / `dy` viewport pixels (the viewport is `viewport` px square): the picture follows the pointer. */
export function panByPixels(nw: number, nh: number, crop: Crop, dx: number, dy: number, viewport: number): Crop {
  const side = visibleSide(nw, nh, crop.zoom);
  const perPx = side / viewport;
  return clampCrop(nw, nh, { ...crop, cx: crop.cx - (dx * perPx) / nw, cy: crop.cy - (dy * perPx) / nh });
}

/** Move the window by a fraction of itself (arrow keys): `+1` right / down. */
export function panByStep(nw: number, nh: number, crop: Crop, stepsX: number, stepsY: number): Crop {
  const side = visibleSide(nw, nh, crop.zoom);
  return clampCrop(nw, nh, { ...crop, cx: crop.cx + (stepsX * PAN_STEP * side) / nw, cy: crop.cy + (stepsY * PAN_STEP * side) / nh });
}

export function zoomTo(nw: number, nh: number, crop: Crop, zoom: number): Crop {
  return clampCrop(nw, nh, { ...crop, zoom });
}

/** The pixel size the export is drawn at: the window itself when it is smaller than {@link OUT_SIDE}, never scaled up. */
export function outSize(nw: number, nh: number, crop: Crop): number {
  return Math.max(1, Math.min(OUT_SIDE, Math.floor(visibleSide(nw, nh, crop.zoom))));
}

/** The crop drawn onto a canvas and encoded as PNG (lossless: the server makes the one JPEG). Null when the browser cannot. */
export async function cropToBlob(img: HTMLImageElement, crop: Crop): Promise<Blob | null> {
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  if (!nw || !nh) return null;
  const { sx, sy, side } = cropRect(nw, nh, crop);
  const size = outSize(nw, nh, crop);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff"; // a transparent PNG is flattened onto white, like the server does
  ctx.fillRect(0, 0, size, size);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}

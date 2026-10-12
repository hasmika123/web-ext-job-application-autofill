/**
 * The page-fit ladder (DESIGN section 3.3). Pure: the preview measures the rendered `.rz-page`, the
 * export route re-measures in Chromium, and both walk the same seven steps.
 *
 * Step 0 is the roomiest (density 1, 11 pt, 0.75 in margins); each later step trades whitespace for
 * room. `resolveTheme(theme, step)` returns the theme with `size` / `density` / `margin` taken from
 * that step and `fit.step` set, leaving every other key (accent, fonts, page size, ...) alone.
 */
import type { PageSize, Theme } from "./types";

export interface FitStep {
  density: number;
  /** Body size in pt. */
  size: number;
  /** Page margin in inches. */
  margin: number;
}

export const FIT_LADDER: readonly FitStep[] = Object.freeze([
  { density: 1, size: 11, margin: 0.75 },
  { density: 1, size: 10.5, margin: 0.7 },
  { density: 0.92, size: 10.5, margin: 0.65 },
  { density: 0.88, size: 10, margin: 0.6 },
  { density: 0.82, size: 10, margin: 0.55 },
  { density: 0.78, size: 9.5, margin: 0.5 },
  { density: 0.72, size: 9.5, margin: 0.45 },
]);

export const MAX_FIT_STEP = FIT_LADDER.length - 1;

/** Clamps to an integer in `[0, MAX_FIT_STEP]`; non-finite input gives 0. */
export function clampStep(step: number): number {
  if (!Number.isFinite(step)) return 0;
  return Math.min(MAX_FIT_STEP, Math.max(0, Math.trunc(step)));
}

/** The theme as rendered at ladder `step`. Never mutates `theme`. */
export function resolveTheme(theme: Theme, step: number): Theme {
  const s = clampStep(step);
  const { density, size, margin } = FIT_LADDER[s];
  return { ...theme, density, size, margin, fit: { ...theme.fit, step: s } };
}

/** Page dimensions in CSS inches (Letter 8.5 x 11, A4 210 x 297 mm). */
export const PAGE_DIMENSIONS: Record<PageSize, { widthIn: number; heightIn: number }> = {
  letter: { widthIn: 8.5, heightIn: 11 },
  a4: { widthIn: 210 / 25.4, heightIn: 297 / 25.4 },
};

/**
 * Pages needed for content of `contentHeightPx` CSS px (the height of `.rz-page`'s content box,
 * i.e. excluding its padding) at the given margin. On paper every page loses `2 * margin` to the
 * `@page` margins, so each page holds `pageHeight - 2 * margin` of content.
 */
export function pageCount(contentHeightPx: number, pageSize: PageSize, marginIn: number): number {
  const perPage = (PAGE_DIMENSIONS[pageSize].heightIn - 2 * marginIn) * 96;
  if (!(contentHeightPx > 0) || !(perPage > 0)) return 1;
  return Math.max(1, Math.ceil(contentHeightPx / perPage - 1e-6));
}

export interface FitResult {
  /** The ladder step to store. */
  step: number;
  /** Page count measured at that step. */
  pages: number;
  /** `pages <= target`. When false the ladder ended ("Still N pages"). */
  fits: boolean;
}

/**
 * Walks the ladder from `startStep` until `measure(resolvedTheme) <= target` or the ladder ends.
 * `measure` renders (or simulates) the document at a theme and returns its page count.
 */
export function fitToPages(theme: Theme, target: number, measure: (resolved: Theme) => number, startStep = 0): FitResult {
  let step = clampStep(startStep);
  let pages = measure(resolveTheme(theme, step));
  while (pages > target && step < MAX_FIT_STEP) {
    step += 1;
    pages = measure(resolveTheme(theme, step));
  }
  return { step, pages, fits: pages <= target };
}

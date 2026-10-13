/**
 * Spacing presets and the page-fit ladder (DESIGN 3.3 and 4). Pure: the preview measures the rendered
 * `.rz-page`, the export route re-measures in Chromium, and both walk the same seven steps.
 *
 * The user picks a Spacing preset (compact / normal / spacious); the fit ladder then trades whitespace
 * for room as DELTAS on that preset, step 0 being the preset itself. For `normal` the seven steps
 * reproduce the v1 absolute ladder exactly (`fit.test.ts` asserts the triples).
 * `resolveTheme(theme, step)` returns the theme with `size` / `density` / `margin` taken from
 * preset + delta and `fit.step` set, leaving every other key (accent, fonts, page size, ...) alone.
 */
import type { PageSize, Spacing, Theme } from "./types";

export interface FitStep {
  density: number;
  /** Body size in pt. */
  size: number;
  /** Page margin in inches. */
  margin: number;
}

/** A ladder step: added to the Spacing preset. */
export interface FitDelta {
  dDensity: number;
  dSize: number;
  dMargin: number;
}

export const SPACING_PRESETS: Readonly<Record<Spacing, FitStep>> = Object.freeze({
  compact: Object.freeze({ size: 10.5, density: 0.88, margin: 0.6 }),
  normal: Object.freeze({ size: 11, density: 1, margin: 0.75 }), // == v1 ladder step 0
  spacious: Object.freeze({ size: 11, density: 1.1, margin: 0.9 }),
});

export const FIT_LADDER: readonly FitDelta[] = Object.freeze([
  { dDensity: 0, dSize: 0, dMargin: 0 },
  { dDensity: 0, dSize: -0.5, dMargin: -0.05 },
  { dDensity: -0.08, dSize: -0.5, dMargin: -0.1 },
  { dDensity: -0.12, dSize: -1, dMargin: -0.15 },
  { dDensity: -0.18, dSize: -1, dMargin: -0.2 },
  { dDensity: -0.22, dSize: -1.5, dMargin: -0.25 },
  { dDensity: -0.28, dSize: -1.5, dMargin: -0.3 },
]);

export const MAX_FIT_STEP = FIT_LADDER.length - 1;

/** Floors of a resolved theme (size >= 9 pt, density >= 0.6, margin >= 0.3 in). */
const MIN_SIZE = 9;
const MIN_DENSITY = 0.6;
const MIN_MARGIN = 0.3;

const round3 = (n: number) => Number(n.toFixed(3));

/** Clamps to an integer in `[0, MAX_FIT_STEP]`; non-finite input gives 0. */
export function clampStep(step: number): number {
  if (!Number.isFinite(step)) return 0;
  return Math.min(MAX_FIT_STEP, Math.max(0, Math.trunc(step)));
}

/** `spacing` when it names a preset, else `normal`. */
export function presetFor(spacing: unknown): FitStep {
  return typeof spacing === "string" && Object.prototype.hasOwnProperty.call(SPACING_PRESETS, spacing) ? SPACING_PRESETS[spacing as Spacing] : SPACING_PRESETS.normal;
}

/** size / density / margin of `spacing` at ladder `step`: preset + delta, clamped to the floors. */
export function stepValues(spacing: unknown, step: number): FitStep {
  const base = presetFor(spacing);
  const d = FIT_LADDER[clampStep(step)];
  return {
    density: round3(Math.max(MIN_DENSITY, base.density + d.dDensity)),
    size: round3(Math.max(MIN_SIZE, base.size + d.dSize)),
    margin: round3(Math.max(MIN_MARGIN, base.margin + d.dMargin)),
  };
}

/** The theme as rendered at ladder `step`. Never mutates `theme`. */
export function resolveTheme(theme: Theme, step: number): Theme {
  const s = clampStep(step);
  const { density, size, margin } = stepValues(theme.spacing, s);
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

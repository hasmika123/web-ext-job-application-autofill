/**
 * Theme defaults, sanitising and the computed CSS-variable block (`<style>` content) that
 * `ResumePreview` and the PDF route both emit. The block is the ONLY styling that depends on the
 * theme; everything else is static `.rz-*` rules in `styles/resume.css`.
 */
import { PAGE_DIMENSIONS, SPACING_PRESETS, clampStep, stepValues } from "./fit";
import type { FontPair, PageSize, Spacing, TemplateCapabilities, Theme } from "./types";

/** The text colour (`--rz-ink`): what a template without accent colours uses in place of the accent. */
export const INK = "#111827";

export const DEFAULT_THEME: Theme = Object.freeze({
  accent: "#2563eb",
  fontPair: "inter",
  spacing: "normal",
  size: 11,
  density: 1,
  margin: 0.75,
  pageSize: "letter",
  dateStyle: "range",
  showPhoto: null,
  fit: Object.freeze({ mode: "auto", target: 1, step: 0 }),
}) as Theme;

export const FONT_STACKS: Record<FontPair, { body: string; display: string }> = {
  inter: {
    body: '"Inter", "Helvetica Neue", Arial, sans-serif',
    display: '"Inter", "Helvetica Neue", Arial, sans-serif',
  },
  "source-serif": {
    body: '"Source Serif 4", Georgia, "Times New Roman", serif',
    display: '"Source Serif 4", Georgia, "Times New Roman", serif',
  },
  "georgia-arial": {
    body: 'Arial, "Helvetica Neue", Helvetica, sans-serif',
    display: 'Georgia, "Times New Roman", serif',
  },
  plex: {
    body: '"IBM Plex Sans", "Helvetica Neue", Arial, sans-serif',
    display: '"IBM Plex Sans", "Helvetica Neue", Arial, sans-serif',
  },
  garamond: {
    body: '"EB Garamond", Garamond, Georgia, "Times New Roman", serif',
    display: '"EB Garamond", Garamond, Georgia, "Times New Roman", serif',
  },
};

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function clamp(n: unknown, lo: number, hi: number, fallback: number): number {
  return typeof n === "number" && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
}

function num(n: number): string {
  return String(Number(n.toFixed(3)));
}

/**
 * The Spacing a v1 theme (no `spacing` key) maps to, from its stored density slider:
 * below 0.94 compact, above 1.05 spacious, otherwise normal (DESIGN 4).
 */
function spacingFromV1(density: unknown): Spacing {
  if (typeof density !== "number" || !Number.isFinite(density)) return "normal";
  if (density < 0.94) return "compact";
  if (density > 1.05) return "spacious";
  return "normal";
}

/**
 * A theme that is safe to interpolate into CSS: unknown values fall back to the defaults. `size` /
 * `density` / `margin` are always recomputed from `spacing` + `fit.step` (preset + ladder delta), so a
 * stored v1 theme with free sliders lands on the nearest preset.
 */
export function sanitizeTheme(theme: Partial<Theme> | null | undefined): Theme {
  const t = theme ?? {};
  const d = DEFAULT_THEME;
  const spacing: Spacing =
    typeof t.spacing === "string" && Object.prototype.hasOwnProperty.call(SPACING_PRESETS, t.spacing) ? t.spacing : spacingFromV1(t.density);
  const fit = { ...d.fit, ...(t.fit ?? {}) };
  fit.step = clampStep(fit.step);
  fit.mode = fit.mode === "manual" ? "manual" : "auto";
  fit.target = fit.target === 2 ? 2 : 1;
  const { size, density, margin } = stepValues(spacing, fit.step);
  return {
    ...d,
    ...t,
    accent: typeof t.accent === "string" && HEX.test(t.accent) ? t.accent : d.accent,
    fontPair: typeof t.fontPair === "string" && Object.prototype.hasOwnProperty.call(FONT_STACKS, t.fontPair) ? t.fontPair : d.fontPair,
    spacing,
    size,
    density,
    margin,
    pageSize: t.pageSize === "a4" ? "a4" : "letter",
    dateStyle: t.dateStyle === "year" ? "year" : "range",
    showPhoto: typeof t.showPhoto === "boolean" ? t.showPhoto : null,
    fit,
  };
}

/**
 * The theme as the template draws it: what the capabilities do not allow is replaced - the accent by
 * the ink colour when `theme.accent` is false, a font outside `theme.fontPairs` by the first allowed
 * one, a date style the template does not render by its first, `fit.target` capped at `maxPages`.
 * The stored theme is never changed; switching to a capable template shows the original again.
 */
export function applyCapabilities(theme: Theme, caps: TemplateCapabilities): Theme {
  const fonts = caps.theme.fontPairs;
  return {
    ...theme,
    accent: caps.theme.accent ? theme.accent : INK,
    fontPair: fonts.includes(theme.fontPair) || fonts.length === 0 ? theme.fontPair : fonts[0],
    dateStyle: caps.dateStyles.includes(theme.dateStyle) || caps.dateStyles.length === 0 ? theme.dateStyle : caps.dateStyles[0],
    fit: { ...theme.fit, target: Math.min(theme.fit.target, caps.maxPages) as 1 | 2 },
  };
}

function pageCss(pageSize: PageSize, marginIn: number): { w: string; h: string; atPage: string } {
  if (pageSize === "a4") {
    return { w: "210mm", h: "297mm", atPage: `@page{size:210mm 297mm;margin:${num(marginIn)}in}` };
  }
  const { widthIn, heightIn } = PAGE_DIMENSIONS.letter;
  return { w: `${widthIn}in`, h: `${heightIn}in`, atPage: `@page{size:${widthIn}in ${heightIn}in;margin:${num(marginIn)}in}` };
}

/** Short deterministic id for a theme block (FNV-1a over the declarations), used as the CSS scope. */
export function themeScope(theme: Theme, caps?: TemplateCapabilities): string {
  const s = themeDeclarations(effective(theme, caps));
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

function effective(theme: Theme, caps?: TemplateCapabilities): Theme {
  const t = sanitizeTheme(theme);
  return caps ? applyCapabilities(t, caps) : t;
}

function themeDeclarations(t: Theme): string {
  const fonts = FONT_STACKS[t.fontPair];
  const page = pageCss(t.pageSize, t.margin);
  return [
    `--rz-accent:${t.accent}`,
    `--rz-font-body:${fonts.body}`,
    `--rz-font-display:${fonts.display}`,
    `--rz-size:${num(t.size)}pt`,
    `--rz-density:${num(t.density)}`,
    `--rz-margin:${num(t.margin)}in`,
    `--rz-page-w:${page.w}`,
    `--rz-page-h:${page.h}`,
  ].join(";");
}

/**
 * The `<style>` text: variables scoped to `[data-rz-theme="<scope>"]` plus the `@page` rule. With `caps`
 * the accent is the ink colour when the template has no accent colours, and the font is the first
 * allowed pair when the stored one is not allowed.
 */
export function themeCss(theme: Theme, caps?: TemplateCapabilities): string {
  const t = effective(theme, caps);
  return `[data-rz-theme="${themeScope(t)}"]{${themeDeclarations(t)}}${pageCss(t.pageSize, t.margin).atPage}`;
}

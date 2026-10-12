/**
 * Pure helpers for Customize Template (R2.4, DESIGN 4 + 6.4): turning a control change into the theme
 * the PATCH sends, template defaults on a switch, and the few CSS variables the document follows.
 * No React. The palette, the allowed fonts and which controls are on all come from the caller
 * (admin config + the template's capabilities); nothing here decides a limit.
 */
import { FONT_STACKS, applyCapabilities, sanitizeTheme } from "@kiwiply/ui";
import type { CSSProperties } from "react";
import type { DateStyle, FontPair, ResumeSpacing, ResumeTheme, TemplateCapabilities, TemplateMeta } from "@kiwiply/ui";

type Theme = Partial<ResumeTheme>;

/** One control of the Customize Template block (also the analytics `control`). */
export type ThemeChange =
  | { control: "accent"; value: string }
  | { control: "font"; value: FontPair }
  | { control: "spacing"; value: ResumeSpacing }
  | { control: "pages"; value: 1 | 2 }
  | { control: "dateStyle"; value: DateStyle };

/** The labels the board shows (DESIGN 4). */
export const FONT_LABELS: Record<FontPair, string> = {
  inter: "Inter (Recommended)",
  "source-serif": "Source Serif 4",
  "georgia-arial": "Georgia / Arial",
};

export const SPACING_LABELS: Record<ResumeSpacing, string> = { compact: "Compact", normal: "Normal", spacious: "Spacious" };

export const DATE_STYLE_LABELS: Record<DateStyle, string> = { range: "Month Year", year: "Year" };

/** Names for the default palette's swatches (screen readers); any other colour is announced by its hex. */
const COLOR_NAMES: Record<string, string> = {
  "#16a34a": "Green",
  "#2563eb": "Blue",
  "#7c3aed": "Purple",
  "#ec4899": "Pink",
  "#f97316": "Orange",
  "#eab308": "Yellow",
};

export function colorName(hex: string): string {
  return COLOR_NAMES[hex.toLowerCase()] ?? hex;
}

/** Only what the server stores: the derived `size` / `density` / `margin` are recomputed from `spacing` + `fit.step`. */
export function storedTheme(theme: Theme | null | undefined): Theme {
  const { size: _s, density: _d, margin: _m, ...rest } = (theme ?? {}) as Theme;
  void _s;
  void _d;
  void _m;
  return rest;
}

function touch(theme: Theme, key: string): string[] {
  const t = theme._touched ?? [];
  return t.includes(key) ? t : [...t, key];
}

/**
 * The theme after one control changed. Starts from the stored theme (so unrelated keys, including a
 * stored value a stricter template hides, are kept), marks the key as touched by the user (a later
 * template switch keeps it) and, for Spacing, resets the fit ladder to the preset (`fit.step` 0, DESIGN 4).
 */
export function editTheme(current: Theme | null, change: ThemeChange): Theme {
  const base = storedTheme(current);
  const fit = sanitizeTheme(current).fit;
  switch (change.control) {
    case "accent":
      return { ...base, accent: change.value, _touched: touch(base, "accent") };
    case "font":
      return { ...base, fontPair: change.value, _touched: touch(base, "fontPair") };
    case "spacing":
      return { ...base, spacing: change.value, fit: { ...fit, step: 0 }, _touched: touch(base, "spacing") };
    case "pages":
      return { ...base, fit: { ...fit, target: change.value }, _touched: touch(base, "fit") };
    case "dateStyle":
      return { ...base, dateStyle: change.value, _touched: touch(base, "dateStyle") };
  }
}

/**
 * The theme a template switch lands on: the new template's `meta.defaults` for every key the user has
 * not touched (types.ts `TemplateMeta.defaults`). `null` when nothing changes (no PATCH needed).
 */
export function themeAfterSwitch(current: Theme | null, to: TemplateMeta): Theme | null {
  const defaults = to.defaults;
  if (!defaults) return null;
  const touched = current?._touched ?? [];
  const base = storedTheme(current);
  let changed = false;
  const next: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(defaults)) {
    if (touched.includes(key) || value === undefined) continue;
    if (next[key] !== value) {
      next[key] = value;
      changed = true;
    }
  }
  return changed ? (next as Theme) : null;
}

/**
 * The CSS variables the document canvas follows (accent colour, font pair; the template's capabilities
 * decide whether they apply, like the renderer's `applyCapabilities`). The placeholder blocks use them
 * until the document canvas (R2.1) does the same.
 */
export function canvasThemeStyle(theme: Theme | null, caps: TemplateCapabilities): CSSProperties {
  const drawn = applyCapabilities(sanitizeTheme(theme), caps);
  const fonts = FONT_STACKS[drawn.fontPair];
  return {
    "--rb-doc-accent": drawn.accent,
    "--rb-doc-font-body": fonts.body,
    "--rb-doc-font-display": fonts.display,
  } as CSSProperties;
}

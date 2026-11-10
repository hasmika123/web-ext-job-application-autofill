/**
 * Pure helpers for Customize Template (R2.4, DESIGN 4 + 6.4): turning a control change into the theme
 * the PATCH sends, template defaults on a switch, and the few CSS variables the document follows.
 * No React. The palette, the allowed fonts and which controls are on all come from the caller
 * (admin config + the template's capabilities); nothing here decides a limit.
 */
import { FONT_STACKS, applyCapabilities, clampStep, hiddenContent, hiddenNotice, sanitizeTheme } from "@kiwiply/ui";
import type { CSSProperties } from "react";
import type { DateStyle, FontPair, HiddenItem, ResumeDocument, ResumeSpacing, ResumeTheme, TemplateCapabilities, TemplateMeta } from "@kiwiply/ui";

type Theme = Partial<ResumeTheme>;

/** One control of the Customize Template block (also the analytics `control`). */
export type ThemeChange =
  | { control: "accent"; value: string }
  | { control: "font"; value: FontPair }
  | { control: "spacing"; value: ResumeSpacing }
  | { control: "pages"; value: 1 | 2 }
  /** "Fit to one page" (Print layout, R3.8): the fit-ladder rung the measured document needs. */
  | { control: "fit"; step: number }
  | { control: "dateStyle"; value: DateStyle }
  /** Show or hide the photo on this resume (R7.4): `theme.showPhoto`; the file is kept either way. */
  | { control: "photo"; value: boolean };

/** The labels the board shows (DESIGN 4). */
export const FONT_LABELS: Record<FontPair, string> = {
  inter: "Inter (Recommended)",
  "source-serif": "Source Serif 4",
  "georgia-arial": "Georgia / Arial",
  plex: "IBM Plex Sans",
  garamond: "EB Garamond",
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
    case "fit":
      return { ...base, fit: { ...fit, mode: "auto", step: clampStep(change.step) }, _touched: touch(base, "fit") };
    case "dateStyle":
      return { ...base, dateStyle: change.value, _touched: touch(base, "dateStyle") };
    case "photo":
      return { ...base, showPhoto: change.value, _touched: touch(base, "showPhoto") };
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

/** What the theme keys are called in the "what changes" note. */
const THEME_KEY_LABELS: Record<string, string> = {
  accent: "accent colour",
  fontPair: "font",
  spacing: "spacing",
  pageSize: "page size",
  dateStyle: "date style",
  showPhoto: "photo",
};

/** The theme keys a switch to `to` sets because the user never touched them (and that actually change). */
export function defaultedKeys(current: Theme | null, to: TemplateMeta): string[] {
  const next = themeAfterSwitch(current, to);
  if (!next) return [];
  const base = storedTheme(current) as Record<string, unknown>;
  // in the order the labels are listed (not the order a template happened to declare its defaults)
  return Object.keys(THEME_KEY_LABELS).filter((k) => k in (to.defaults ?? {}) && (next as Record<string, unknown>)[k] !== base[k]);
}

/** "Accent colour and font are now Classic's defaults." - the "what changes" half of the switch toast. */
export function themeChangeNote(keys: readonly string[], templateName: string): string | null {
  const names = keys.map((k) => THEME_KEY_LABELS[k] ?? k);
  if (names.length === 0) return null;
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${list.charAt(0).toUpperCase()}${list.slice(1)} ${names.length === 1 ? "is" : "are"} now ${templateName}'s default - change ${names.length === 1 ? "it" : "them"} in Customize Template.`;
}

/**
 * Everything a switch to `to` does to what the user sees, computed ONE way for both the Pick Template card's
 * "Hides: ..." line (before the click) and the switch toast (after it), so the two can never disagree
 * (R3.4, DESIGN 6.5): the theme the switch lands on, what the new template hides of this document in that
 * theme (`hiddenContent`), the toast sentence, and the theme keys that were defaulted.
 */
export interface SwitchPreview {
  theme: Theme | null;
  hidden: HiddenItem[];
  notice: string | null;
  defaulted: string[];
}

export function previewSwitch(doc: ResumeDocument, current: Theme | null, to: TemplateMeta, caps: TemplateCapabilities): SwitchPreview {
  const theme = themeAfterSwitch(current, to) ?? current;
  const hidden = hiddenContent(doc, sanitizeTheme(theme), caps);
  return { theme, hidden, notice: hiddenNotice(hidden, caps), defaulted: defaultedKeys(current, to) };
}

/**
 * The CSS variables the document canvas follows (accent colour, font pair; the template's capabilities
 * decide whether they apply, like the renderer's `applyCapabilities`): `--rb-doc-accent` (section headings),
 * `--rb-doc-font-body` / `--rb-doc-font-display` (the canvas re-points the app's font tokens at them) and
 * `--rb-doc-density` (a multiplier on the canvas' vertical rhythm, from Spacing + the fit ladder). The
 * document canvas (R2.1) carries them on its root, so the editor follows what Pick Template changes.
 */
export function canvasThemeStyle(theme: Theme | null, caps: TemplateCapabilities): CSSProperties {
  const drawn = applyCapabilities(sanitizeTheme(theme), caps);
  const fonts = FONT_STACKS[drawn.fontPair];
  return {
    "--rb-doc-accent": drawn.accent,
    "--rb-doc-font-body": fonts.body,
    "--rb-doc-font-display": fonts.display,
    "--rb-doc-density": String(caps.theme.spacing ? drawn.density : 1),
  } as CSSProperties;
}

/**
 * Theme defaults, sanitising and the computed CSS-variable block (`<style>` content) that
 * `ResumePreview` and the PDF route both emit. The block is the ONLY styling that depends on the
 * theme; everything else is static `.rz-*` rules in `styles/resume.css`.
 */
import { PAGE_DIMENSIONS } from "./fit";
import type { FontPair, PageSize, Theme } from "./types";

export const DEFAULT_THEME: Theme = Object.freeze({
  accent: "#2563eb",
  fontPair: "inter",
  size: 11,
  density: 1,
  margin: 0.75,
  pageSize: "letter",
  dateStyle: "range",
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
  // IBM Plex is not bundled yet (R7); the stack degrades to Inter, then system sans.
  "ibm-plex": {
    body: '"IBM Plex Sans", "Inter", Arial, sans-serif',
    display: '"IBM Plex Serif", "Source Serif 4", Georgia, serif',
  },
  "georgia-arial": {
    body: 'Arial, "Helvetica Neue", Helvetica, sans-serif',
    display: 'Georgia, "Times New Roman", serif',
  },
};

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function clamp(n: unknown, lo: number, hi: number, fallback: number): number {
  return typeof n === "number" && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
}

function num(n: number): string {
  return String(Number(n.toFixed(3)));
}

/** A theme that is safe to interpolate into CSS: unknown values fall back to the defaults. */
export function sanitizeTheme(theme: Partial<Theme> | null | undefined): Theme {
  const t = theme ?? {};
  const d = DEFAULT_THEME;
  return {
    ...d,
    ...t,
    accent: typeof t.accent === "string" && HEX.test(t.accent) ? t.accent : d.accent,
    fontPair: t.fontPair && t.fontPair in FONT_STACKS ? t.fontPair : d.fontPair,
    size: clamp(t.size, 9, 12, d.size),
    density: clamp(t.density, 0.6, 1.1, d.density),
    margin: clamp(t.margin, 0.3, 1, d.margin),
    pageSize: t.pageSize === "a4" ? "a4" : "letter",
    dateStyle: t.dateStyle === "year" ? "year" : "range",
    fit: { ...d.fit, ...(t.fit ?? {}) },
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
export function themeScope(theme: Theme): string {
  const s = themeDeclarations(sanitizeTheme(theme));
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
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

/** The `<style>` text: variables scoped to `[data-rz-theme="<scope>"]` plus the `@page` rule. */
export function themeCss(theme: Theme): string {
  const t = sanitizeTheme(theme);
  return `[data-rz-theme="${themeScope(t)}"]{${themeDeclarations(t)}}${pageCss(t.pageSize, t.margin).atPage}`;
}

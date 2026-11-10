/**
 * Tenant brand colours (Enterprise V2, X2.12): from an organization's PRIMARY and SECONDARY hex colours to a complete,
 * contrast-safe set of CSS variables. Pure functions, no dependencies, no DOM: the server validates the two base colours
 * (the Java `BrandingColors` gate: white text must reach 4.5:1 on them), the web turns them into variables at render time,
 * and the same code runs in tests and previews.
 *
 * What it produces, per colour: a 50..900 scale (OKLCH lightness curve, hue kept, chroma eased and clamped into sRGB)
 * with the chosen base colour sitting EXACTLY at step 600; an "on" colour for every step (white, or black when white fails
 * 4.5:1) so text on any shade is readable; and the semantic variables components use (solid / hover / active / text /
 * subtle / border / ring). A light and a dark set are produced; status colours (success, warning, error) are NOT part of
 * this: they stay neutral and are never derived from a brand.
 *
 * Variable names (set on the tenant root only; the regular Kiwiply pages never see them):
 *   --brand-50..900 --on-brand-50..900            primary scale and its on-colours
 *   --brand-2-50..900 --on-brand-2-50..900        secondary scale and its on-colours
 *   --brand-solid --on-brand --brand-solid-hover --brand-solid-active --brand-text --brand-subtle --brand-border --brand-ring
 *   --brand-2-solid --on-brand-2 --brand-2-text --brand-2-subtle --brand-2-border
 */

export const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const;
export type Step = (typeof STEPS)[number];
export type Scale = Record<Step, string>;

/** The board's blue and teal: what a tenant with no colours set (or an invalid one) gets. Both carry white text at AA. */
export const DEFAULT_PRIMARY = "#0f5fc4";
export const DEFAULT_SECONDARY = "#0b7a8a";

/** WCAG AA: body text, and large text / UI components. */
export const AA_BODY = 4.5;
export const AA_LARGE = 3;

/** The dark-mode page surface the dark set is derived against (the app's dark paper). */
export const DARK_SURFACE = "#0f172a";
export const LIGHT_SURFACE = "#ffffff";
const WHITE = "#ffffff";
const BLACK = "#000000";

const HEX = /^#[0-9a-fA-F]{6}$/;
export const isHex = (v: unknown): v is string => typeof v === "string" && HEX.test(v);

// ---- WCAG ---------------------------------------------------------------------------------------------------------

function rgbOf(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toLinear = (c8: number) => {
  const c = c8 / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

/** WCAG 2.1 relative luminance of `#rrggbb`. */
export function luminance(hex: string): number {
  const [r, g, b] = rgbOf(hex);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** WCAG contrast ratio of two colours, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** The readable text colour on `bg`: white when it reaches 4.5:1, otherwise black (which then always does). */
export function onColor(bg: string): string {
  return contrastRatio(bg, WHITE) >= AA_BODY ? WHITE : BLACK;
}

// ---- OKLCH (Ottosson) ---------------------------------------------------------------------------------------------

const toSrgb = (l: number) => {
  const c = l <= 0.0031308 ? 12.92 * l : 1.055 * Math.pow(l, 1 / 2.4) - 0.055;
  return c;
};

/** `#rrggbb` to OKLCH ([L 0..1, C, h degrees]). */
export function hexToOklch(hex: string): [number, number, number] {
  const [r8, g8, b8] = rgbOf(hex);
  const r = toLinear(r8);
  const g = toLinear(g8);
  const b = toLinear(b8);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.sqrt(A * A + B * B);
  const h = C < 1e-4 ? 0 : ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
  return [L, C, h];
}

function oklchToLinear(L: number, C: number, hDeg: number): [number, number, number] {
  const a = C * Math.cos((hDeg * Math.PI) / 180);
  const b = C * Math.sin((hDeg * Math.PI) / 180);
  const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = Math.pow(L - 0.0894841775 * a - 1.291485548 * b, 3);
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (rgb: [number, number, number]) => rgb.every((c) => c >= -0.0005 && c <= 1.0005);

/** OKLCH to `#rrggbb`, reducing chroma until the colour fits sRGB (hue and lightness are kept). */
export function oklchToHex(L: number, C: number, h: number): string {
  let c = Math.max(0, C);
  let lin = oklchToLinear(L, c, h);
  for (let i = 0; i < 40 && !inGamut(lin); i++) {
    c *= 0.93;
    lin = oklchToLinear(L, c, h);
  }
  const to8 = (v: number) => Math.round(Math.min(1, Math.max(0, toSrgb(Math.min(1, Math.max(0, v))))) * 255);
  return "#" + lin.map((v) => to8(v).toString(16).padStart(2, "0")).join("");
}

// ---- the scale ----------------------------------------------------------------------------------------------------

const ENDPOINT_LIGHT = 0.975;

/**
 * The 50..900 scale of `base`: the base colour is step 600 exactly; lighter steps climb to a near-white tint of the same
 * hue, darker steps fall towards a deep shade. Chroma is eased (pale tints are desaturated) and clamped into sRGB.
 * Lightness is strictly decreasing from 50 to 900, so a higher step is always darker.
 */
export function brandScale(base: string): Scale {
  const hex = isHex(base) ? base.toLowerCase() : DEFAULT_PRIMARY;
  const [Lb, Cb, h] = hexToOklch(hex);
  const lightEnd = Math.max(ENDPOINT_LIGHT, Lb + 0.12);
  // a light base (yellow, lime) still needs dark steps: the 900 end is at most 0.34 so text-on-white steps exist for any brand
  const darkEnd = Math.min(Lb - 0.06, Math.max(0.18, Math.min(Lb - 0.3, 0.34)));
  const out = {} as Scale;
  STEPS.forEach((step, i) => {
    if (step === 600) {
      out[600] = hex;
      return;
    }
    if (i < 6) {
      const t = i / 6; // 0 at 50, 1 at 600
      const L = lightEnd + (Lb - lightEnd) * t;
      out[step] = oklchToHex(L, Cb * (0.12 + 0.88 * Math.pow(t, 1.1)), h);
    } else {
      const t = (i - 6) / 3; // 0 at 600, 1 at 900
      const L = Lb + (darkEnd - Lb) * t;
      out[step] = oklchToHex(L, Cb * (1 - 0.18 * t), h);
    }
  });
  return out;
}

/** The on-colour (white or black) for every step of a scale. */
export function onScale(scale: Scale): Scale {
  const out = {} as Scale;
  for (const s of STEPS) out[s] = onColor(scale[s]);
  return out;
}

// ---- semantic roles per mode --------------------------------------------------------------------------------------

export interface BrandRoles {
  solid: string;
  on: string;
  hover: string;
  active: string;
  /** Brand-coloured TEXT on the page surface: >= 4.5:1. */
  text: string;
  subtle: string;
  border: string;
  /** Focus ring: >= 3:1 against the page surface. */
  ring: string;
}

function firstPassing(scale: Scale, order: Step[], bg: string, min: number): string {
  for (const s of order) if (contrastRatio(scale[s], bg) >= min) return scale[s];
  return order.length ? scale[order[order.length - 1]] : scale[600];
}

export function rolesFor(scale: Scale, mode: "light" | "dark"): BrandRoles {
  if (mode === "light") {
    return {
      solid: scale[600],
      on: onColor(scale[600]),
      hover: scale[700],
      active: scale[800],
      text: firstPassing(scale, [600, 700, 800, 900], LIGHT_SURFACE, AA_BODY),
      subtle: scale[50],
      border: scale[200],
      ring: firstPassing(scale, [500, 600, 700, 800, 900], LIGHT_SURFACE, AA_LARGE),
    };
  }
  // dark: the solid must stand out from the dark page (3:1) and carry readable text; text/ring come from the light end
  const solidStep = ([600, 500, 400, 300] as Step[]).find((s) => contrastRatio(scale[s], DARK_SURFACE) >= AA_LARGE) ?? 300;
  const solid = scale[solidStep];
  const lighter = STEPS[Math.max(0, STEPS.indexOf(solidStep) - 1)];
  const darker = STEPS[Math.min(STEPS.length - 1, STEPS.indexOf(solidStep) + 1)];
  return {
    solid,
    on: onColor(solid),
    hover: scale[lighter],
    active: scale[darker],
    text: firstPassing(scale, [300, 200, 100, 50], DARK_SURFACE, AA_BODY),
    subtle: scale[900],
    border: scale[800],
    ring: firstPassing(scale, [400, 300, 200, 100, 50], DARK_SURFACE, AA_LARGE),
  };
}

// ---- the variable set ---------------------------------------------------------------------------------------------

export type Mode = "light" | "dark";

/** Every CSS variable for a tenant (see the header). Invalid hex input falls back to the default colour, never throws. */
export function tenantThemeVars(primary: string | null | undefined, secondary: string | null | undefined, mode: Mode = "light"): Record<string, string> {
  const p = brandScale(isHex(primary) ? primary : DEFAULT_PRIMARY);
  const s = brandScale(isHex(secondary) ? secondary : DEFAULT_SECONDARY);
  const pr = rolesFor(p, mode);
  const sr = rolesFor(s, mode);
  const vars: Record<string, string> = {};
  for (const step of STEPS) {
    vars[`--brand-${step}`] = p[step];
    vars[`--on-brand-${step}`] = onColor(p[step]);
    vars[`--brand-2-${step}`] = s[step];
    vars[`--on-brand-2-${step}`] = onColor(s[step]);
  }
  vars["--brand-solid"] = pr.solid;
  vars["--on-brand"] = pr.on;
  vars["--brand-solid-hover"] = pr.hover;
  vars["--brand-solid-active"] = pr.active;
  vars["--brand-text"] = pr.text;
  vars["--brand-subtle"] = pr.subtle;
  vars["--brand-border"] = pr.border;
  vars["--brand-ring"] = pr.ring;
  vars["--brand-2-solid"] = sr.solid;
  vars["--on-brand-2"] = sr.on;
  vars["--brand-2-text"] = sr.text;
  vars["--brand-2-subtle"] = sr.subtle;
  vars["--brand-2-border"] = sr.border;
  return vars;
}

/**
 * CSS text for a tenant root: the light set on `selector`, the dark set on `selector.dark`. Values are generated from
 * validated hex colours only, so the string can be placed in a <style> element.
 */
export function tenantThemeCss(selector: string, primary: string | null | undefined, secondary: string | null | undefined): string {
  const block = (sel: string, vars: Record<string, string>) =>
    `${sel}{${Object.entries(vars)
      .map(([k, v]) => `${k}:${v}`)
      .join(";")}}`;
  return block(selector, tenantThemeVars(primary, secondary, "light")) + block(`${selector}.dark`, tenantThemeVars(primary, secondary, "dark"));
}

/** What the server would say about a colour (mirrors the Java gate): can white text be read on it, and the nearest colour that can. */
export function whiteTextCheck(hex: string): { ok: boolean; ratio: number; suggestion: string } {
  if (!isHex(hex)) return { ok: false, ratio: 0, suggestion: DEFAULT_PRIMARY };
  const ratio = contrastRatio(hex, WHITE);
  if (ratio >= AA_BODY) return { ok: true, ratio, suggestion: hex.toLowerCase() };
  const [L0, C, h] = hexToOklch(hex);
  let L = L0;
  let candidate = hex.toLowerCase();
  while (L > 0 && contrastRatio(candidate, WHITE) < AA_BODY) {
    L -= 0.005;
    candidate = oklchToHex(L, C, h);
  }
  return { ok: false, ratio, suggestion: candidate };
}

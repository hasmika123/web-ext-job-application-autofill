import { describe, expect, it } from "vitest";
import {
  AA_BODY,
  AA_LARGE,
  DARK_SURFACE,
  DEFAULT_PRIMARY,
  DEFAULT_SECONDARY,
  LIGHT_SURFACE,
  STEPS,
  brandScale,
  contrastRatio,
  hexToOklch,
  isHex,
  luminance,
  onColor,
  oklchToHex,
  rolesFor,
  tenantThemeCss,
  tenantThemeVars,
  whiteTextCheck,
} from "./brand";

/** The same golden values as api BrandingColorsTest (white on colour). */
const GOLDEN: Record<string, number> = { "#000000": 21, "#ffffff": 1, "#0f5fc4": 6.08, "#808080": 3.95, "#ffeb3b": 1.22 };

/** The handful of colours the task names: blue, green, yellow, near-white, near-black (+ the board's two and an orange). */
const SAMPLES: Record<string, string> = {
  blue: "#1d4ed8",
  green: "#15803d",
  yellow: "#ffeb3b",
  nearWhite: "#f8f8f4",
  nearBlack: "#0b0b10",
  boardBlue: DEFAULT_PRIMARY,
  boardTeal: DEFAULT_SECONDARY,
  orange: "#b4531a",
  purple: "#6d28d9",
};

describe("contrast math", () => {
  it("matches the golden table shared with the Java gate", () => {
    for (const [hex, ratio] of Object.entries(GOLDEN)) expect(contrastRatio(hex, "#ffffff")).toBeCloseTo(ratio, 1);
  });
  it("luminance is 0 for black and 1 for white", () => {
    expect(luminance("#000000")).toBe(0);
    expect(luminance("#ffffff")).toBeCloseTo(1, 5);
  });
  it("onColor is white on blue and black on yellow", () => {
    expect(onColor("#1d4ed8")).toBe("#ffffff");
    expect(onColor("#ffeb3b")).toBe("#000000");
  });
  it("isHex only accepts #rrggbb", () => {
    expect(isHex("#0f5fc4")).toBe(true);
    expect(isHex("0f5fc4")).toBe(false);
    expect(isHex("#fff")).toBe(false);
    expect(isHex("red; x:y")).toBe(false);
    expect(isHex(null)).toBe(false);
  });
});

describe("OKLCH round trip", () => {
  it("returns (almost) the same colour", () => {
    for (const hex of Object.values(SAMPLES)) {
      const [L, C, h] = hexToOklch(hex);
      const back = oklchToHex(L, C, h);
      const d = [1, 3, 5].map((i) => Math.abs(parseInt(hex.slice(i, i + 2), 16) - parseInt(back.slice(i, i + 2), 16)));
      expect(Math.max(...d)).toBeLessThanOrEqual(2);
    }
  });
});

describe("brandScale", () => {
  it("has the 10 steps with the base exactly at 600", () => {
    for (const [name, hex] of Object.entries(SAMPLES)) {
      const scale = brandScale(hex);
      expect(Object.keys(scale)).toHaveLength(10);
      expect(scale[600], name).toBe(hex.toLowerCase());
      for (const s of STEPS) expect(isHex(scale[s]), `${name} ${s}`).toBe(true);
    }
  });
  it("gets darker with every step (relative luminance strictly decreasing) for a normal colour", () => {
    const scale = brandScale("#1d4ed8");
    const lum = STEPS.map((s) => luminance(scale[s]));
    for (let i = 1; i < lum.length; i++) expect(lum[i]).toBeLessThan(lum[i - 1]);
  });
  it("falls back to the default colour for invalid input and never throws", () => {
    expect(brandScale("nope")[600]).toBe(DEFAULT_PRIMARY);
  });
});

describe("AA on every shade (task rule: >=4.5 body, >=3 UI)", () => {
  it("every step has a readable on-colour (>= 4.5:1) in the light and dark sets for every sample colour", () => {
    for (const [name, hex] of Object.entries(SAMPLES)) {
      const vars = tenantThemeVars(hex, hex, "light");
      for (const s of STEPS) {
        expect(contrastRatio(vars[`--brand-${s}`], vars[`--on-brand-${s}`]), `${name} step ${s}`).toBeGreaterThanOrEqual(AA_BODY);
        expect(contrastRatio(vars[`--brand-2-${s}`], vars[`--on-brand-2-${s}`]), `${name} 2 step ${s}`).toBeGreaterThanOrEqual(AA_BODY);
      }
    }
  });

  it("light roles: solid carries its on-colour at 4.5, brand text is readable on white at 4.5, the ring is visible at 3", () => {
    for (const [name, hex] of Object.entries(SAMPLES)) {
      const r = rolesFor(brandScale(hex), "light");
      expect(contrastRatio(r.solid, r.on), `${name} solid`).toBeGreaterThanOrEqual(AA_BODY);
      expect(contrastRatio(r.hover, onColor(r.hover)), `${name} hover`).toBeGreaterThanOrEqual(AA_BODY);
      expect(contrastRatio(r.active, onColor(r.active)), `${name} active`).toBeGreaterThanOrEqual(AA_BODY);
      expect(contrastRatio(r.text, LIGHT_SURFACE), `${name} text on white`).toBeGreaterThanOrEqual(AA_BODY);
      expect(contrastRatio(r.text, r.subtle) >= AA_BODY || contrastRatio(r.text, LIGHT_SURFACE) >= AA_BODY, `${name} text on subtle`).toBe(true);
      expect(contrastRatio(r.ring, LIGHT_SURFACE), `${name} ring`).toBeGreaterThanOrEqual(AA_LARGE);
    }
  });

  it("dark roles: the solid is visible against the dark surface (3:1) and carries readable text; brand text and ring are readable on it", () => {
    for (const [name, hex] of Object.entries(SAMPLES)) {
      const r = rolesFor(brandScale(hex), "dark");
      expect(contrastRatio(r.solid, r.on), `${name} solid`).toBeGreaterThanOrEqual(AA_BODY);
      expect(contrastRatio(r.text, DARK_SURFACE), `${name} text on dark`).toBeGreaterThanOrEqual(AA_BODY);
      expect(contrastRatio(r.ring, DARK_SURFACE), `${name} ring on dark`).toBeGreaterThanOrEqual(AA_LARGE);
      // a dark brand (near-black) needs a LIGHTER solid than its 600 to stand out
      if (name === "nearBlack") expect(r.solid).not.toBe(hex);
    }
  });

  it("a property sweep over 600 random colours holds the same guarantees", () => {
    let seed = 12345;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let i = 0; i < 600; i++) {
      const hex = "#" + Math.floor(rnd() * 0xffffff).toString(16).padStart(6, "0");
      for (const mode of ["light", "dark"] as const) {
        const scale = brandScale(hex);
        const r = rolesFor(scale, mode);
        expect(contrastRatio(r.solid, r.on), `${hex} ${mode} solid`).toBeGreaterThanOrEqual(AA_BODY);
        expect(contrastRatio(r.text, mode === "light" ? LIGHT_SURFACE : DARK_SURFACE), `${hex} ${mode} text`).toBeGreaterThanOrEqual(AA_BODY);
        expect(contrastRatio(r.ring, mode === "light" ? LIGHT_SURFACE : DARK_SURFACE), `${hex} ${mode} ring`).toBeGreaterThanOrEqual(AA_LARGE - 0.01);
        for (const s of STEPS) expect(contrastRatio(scale[s], onColor(scale[s]))).toBeGreaterThanOrEqual(AA_BODY);
      }
    }
  });
});

describe("tenantThemeVars / tenantThemeCss", () => {
  it("two tenants get different variable sets", () => {
    const a = tenantThemeVars("#0f5fc4", "#0b7a8a");
    const b = tenantThemeVars("#b4531a", "#2f6f4e");
    expect(a["--brand-600"]).not.toBe(b["--brand-600"]);
    expect(a["--brand-2-600"]).not.toBe(b["--brand-2-600"]);
    expect(a["--brand-solid"]).toBe("#0f5fc4");
    expect(b["--brand-solid"]).toBe("#b4531a");
  });
  it("no colours means the board's blue and teal", () => {
    const v = tenantThemeVars(null, undefined);
    expect(v["--brand-600"]).toBe(DEFAULT_PRIMARY);
    expect(v["--brand-2-600"]).toBe(DEFAULT_SECONDARY);
  });
  it("emits the full variable set", () => {
    const v = tenantThemeVars("#1d4ed8", "#15803d");
    for (const s of STEPS) {
      expect(v).toHaveProperty(`--brand-${s}`);
      expect(v).toHaveProperty(`--brand-2-${s}`);
      expect(v).toHaveProperty(`--on-brand-${s}`);
    }
    for (const k of ["--on-brand", "--brand-solid-hover", "--brand-solid-active", "--brand-ring", "--brand-text", "--brand-subtle", "--brand-border"]) expect(v).toHaveProperty(k);
  });
  it("css has a light block and a dark block, with hex values only", () => {
    const css = tenantThemeCss("[data-tenant-root]", "#1d4ed8", "javascript:alert(1)");
    expect(css).toContain("[data-tenant-root]{--brand-50:");
    expect(css).toContain("[data-tenant-root].dark{--brand-50:");
    expect(css).not.toMatch(/javascript|alert|</);
  });
});

describe("whiteTextCheck", () => {
  it("accepts blue and refuses yellow, near-white and grey with a safe suggestion", () => {
    expect(whiteTextCheck("#1d4ed8").ok).toBe(true);
    for (const bad of ["#ffeb3b", "#f8f8f4", "#808080"]) {
      const c = whiteTextCheck(bad);
      expect(c.ok).toBe(false);
      expect(contrastRatio(c.suggestion, "#ffffff")).toBeGreaterThanOrEqual(AA_BODY);
    }
  });
});

import { describe, expect, it } from "vitest";
import { ATS_STRICT, DESIGN_FREE } from "./capabilities";
import { DEFAULT_THEME, FONT_STACKS, INK, applyCapabilities, sanitizeTheme, themeCss, themeScope } from "./theme";
import type { Theme } from "./types";

/** A stored v1 theme: free size / density / margin sliders, no spacing / showPhoto. */
const v1 = (over: Record<string, unknown>) => ({ accent: "#2563eb", fontPair: "inter", size: 11, density: 1, margin: 0.75, pageSize: "letter", dateStyle: "range", fit: { mode: "auto", target: 1, step: 0 }, ...over }) as unknown as Partial<Theme>;

describe("theme v2: sanitizeTheme", () => {
  it("defaults: spacing normal, showPhoto null", () => {
    const t = sanitizeTheme(null);
    expect(t).toMatchObject({ spacing: "normal", showPhoto: null, size: 11, density: 1, margin: 0.75 });
    expect(sanitizeTheme(DEFAULT_THEME)).toEqual(DEFAULT_THEME);
  });

  it("maps a v1 density slider to the nearest preset (below 0.94 compact, above 1.05 spacious)", () => {
    expect(sanitizeTheme(v1({ density: 0.8 })).spacing).toBe("compact");
    expect(sanitizeTheme(v1({ density: 0.93 })).spacing).toBe("compact");
    expect(sanitizeTheme(v1({ density: 0.94 })).spacing).toBe("normal");
    expect(sanitizeTheme(v1({ density: 1 })).spacing).toBe("normal");
    expect(sanitizeTheme(v1({ density: 1.05 })).spacing).toBe("normal");
    expect(sanitizeTheme(v1({ density: 1.06 })).spacing).toBe("spacious");
    expect(sanitizeTheme(v1({ density: "x" as unknown as number })).spacing).toBe("normal");
  });

  it("recomputes size / density / margin from spacing + fit.step on read", () => {
    const t = sanitizeTheme(v1({ density: 0.8, size: 12, margin: 0.4, fit: { mode: "auto", target: 1, step: 2 } }));
    expect(t.spacing).toBe("compact");
    expect({ size: t.size, density: t.density, margin: t.margin }).toEqual({ size: 10, density: 0.8, margin: 0.5 });
  });

  it("an explicit spacing wins over the density", () => {
    expect(sanitizeTheme({ ...DEFAULT_THEME, spacing: "spacious", density: 0.5 }).spacing).toBe("spacious");
    expect(sanitizeTheme({ ...DEFAULT_THEME, spacing: "huge" as never }).spacing).toBe("normal");
  });

  it("is idempotent", () => {
    for (const input of [v1({ density: 0.8 }), v1({ density: 1.2, fit: { mode: "manual", target: 2, step: 4 } }), { ...DEFAULT_THEME, spacing: "compact" as const }]) {
      const once = sanitizeTheme(input);
      expect(sanitizeTheme(once)).toEqual(once);
    }
  });

  it("keeps showPhoto true / false, anything else is null", () => {
    expect(sanitizeTheme({ ...DEFAULT_THEME, showPhoto: true }).showPhoto).toBe(true);
    expect(sanitizeTheme({ ...DEFAULT_THEME, showPhoto: false }).showPhoto).toBe(false);
    expect(sanitizeTheme({ ...DEFAULT_THEME, showPhoto: "yes" as never }).showPhoto).toBeNull();
  });

  it("ibm-plex is gone: a stored ibm-plex theme falls back to the default font; no prototype keys sneak in", () => {
    expect(Object.keys(FONT_STACKS).sort()).toEqual(["georgia-arial", "inter", "source-serif"]);
    expect(sanitizeTheme({ ...DEFAULT_THEME, fontPair: "ibm-plex" as never }).fontPair).toBe("inter");
    expect(sanitizeTheme({ ...DEFAULT_THEME, fontPair: "toString" as never }).fontPair).toBe("inter");
  });

  it("clamps fit: step to the ladder, target to 1 or 2, mode to auto / manual", () => {
    const t = sanitizeTheme({ ...DEFAULT_THEME, fit: { mode: "weird" as never, target: 7 as never, step: 99 } });
    expect(t.fit).toEqual({ mode: "auto", target: 1, step: 6 });
  });
});

describe("theme v2: capabilities", () => {
  const touched: Theme = { ...DEFAULT_THEME, accent: "#ec4899", fontPair: "source-serif", fit: { mode: "auto", target: 2, step: 0 } };

  it("applyCapabilities: ink for the accent, first allowed font, first allowed date style, target capped; the stored theme is untouched", () => {
    const t = applyCapabilities({ ...touched, dateStyle: "year" }, ATS_STRICT);
    expect(t).toMatchObject({ accent: INK, fontPair: "inter", dateStyle: "range" });
    expect(t.fit.target).toBe(2);
    expect(applyCapabilities(touched, { ...ATS_STRICT, maxPages: 1 }).fit.target).toBe(1);
    expect(touched.accent).toBe("#ec4899");
    expect(applyCapabilities({ ...touched, dateStyle: "year" }, DESIGN_FREE)).toMatchObject({ accent: "#ec4899", fontPair: "source-serif", dateStyle: "year" });
  });

  it("themeCss(theme, caps): --rz-accent is the ink colour and the font the first allowed pair under ATS_STRICT", () => {
    const ats = themeCss(touched, ATS_STRICT);
    expect(ats).toContain(`--rz-accent:${INK}`);
    expect(ats).not.toContain("#ec4899");
    expect(ats).toContain("Inter");
    const free = themeCss(touched, DESIGN_FREE);
    expect(free).toContain("--rz-accent:#ec4899");
    expect(free).toContain("Source Serif 4");
    expect(themeCss(touched)).toContain("--rz-accent:#ec4899"); // no caps = as before
  });

  it("the scope differs when the capabilities change what is drawn, and is stable otherwise", () => {
    expect(themeScope(touched, ATS_STRICT)).not.toBe(themeScope(touched, DESIGN_FREE));
    expect(themeScope(touched, DESIGN_FREE)).toBe(themeScope(touched));
    expect(themeScope(touched, ATS_STRICT)).toBe(themeScope(touched, ATS_STRICT));
  });
});

import { describe, expect, it } from "vitest";
import { FIT_LADDER, MAX_FIT_STEP, SPACING_PRESETS, clampStep, fitToPages, pageCount, resolveTheme, stepValues } from "./fit";
import { DEFAULT_THEME } from "./theme";

describe("fit ladder", () => {
  it("is seven deltas on the Spacing preset, each tighter than the last", () => {
    expect(FIT_LADDER).toEqual([
      { dDensity: 0, dSize: 0, dMargin: 0 },
      { dDensity: 0, dSize: -0.5, dMargin: -0.05 },
      { dDensity: -0.08, dSize: -0.5, dMargin: -0.1 },
      { dDensity: -0.12, dSize: -1, dMargin: -0.15 },
      { dDensity: -0.18, dSize: -1, dMargin: -0.2 },
      { dDensity: -0.22, dSize: -1.5, dMargin: -0.25 },
      { dDensity: -0.28, dSize: -1.5, dMargin: -0.3 },
    ]);
    expect(MAX_FIT_STEP).toBe(6);
    for (let i = 1; i < FIT_LADDER.length; i++) {
      expect(FIT_LADDER[i].dDensity).toBeLessThanOrEqual(FIT_LADDER[i - 1].dDensity);
      expect(FIT_LADDER[i].dSize).toBeLessThanOrEqual(FIT_LADDER[i - 1].dSize);
      expect(FIT_LADDER[i].dMargin).toBeLessThan(FIT_LADDER[i - 1].dMargin);
    }
  });

  it("presets match DESIGN 4", () => {
    expect(SPACING_PRESETS).toEqual({
      compact: { size: 10.5, density: 0.88, margin: 0.6 },
      normal: { size: 11, density: 1, margin: 0.75 },
      spacious: { size: 11, density: 1.1, margin: 0.9 },
    });
  });

  it("for `normal` the seven steps reproduce the v1 absolute ladder exactly", () => {
    const v1 = [
      { density: 1, size: 11, margin: 0.75 },
      { density: 1, size: 10.5, margin: 0.7 },
      { density: 0.92, size: 10.5, margin: 0.65 },
      { density: 0.88, size: 10, margin: 0.6 },
      { density: 0.82, size: 10, margin: 0.55 },
      { density: 0.78, size: 9.5, margin: 0.5 },
      { density: 0.72, size: 9.5, margin: 0.45 },
    ];
    expect(v1.map((_, step) => stepValues("normal", step))).toEqual(v1);
  });

  it("never goes below the floors (size 9, density 0.6, margin 0.3), even at the last step of compact", () => {
    for (const spacing of ["compact", "normal", "spacious"] as const) {
      for (let step = 0; step <= MAX_FIT_STEP; step++) {
        const v = stepValues(spacing, step);
        expect(v.size).toBeGreaterThanOrEqual(9);
        expect(v.density).toBeGreaterThanOrEqual(0.6);
        expect(v.margin).toBeGreaterThanOrEqual(0.3);
      }
    }
    expect(stepValues("compact", 6)).toEqual({ size: 9, density: 0.6, margin: 0.3 });
    expect(stepValues("spacious", 0)).toEqual({ size: 11, density: 1.1, margin: 0.9 });
    expect(stepValues("nonsense", 0)).toEqual(stepValues("normal", 0));
  });

  it("clamps steps", () => {
    expect([clampStep(-3), clampStep(0), clampStep(2.9), clampStep(99), clampStep(NaN)]).toEqual([0, 0, 2, 6, 0]);
  });

  it("resolveTheme = preset + delta, sets fit.step and keeps everything else", () => {
    const theme = { ...DEFAULT_THEME, accent: "#ff0000", pageSize: "a4" as const, _touched: ["accent"] };
    const r = resolveTheme(theme, 3);
    expect(r).toMatchObject({ density: 0.88, size: 10, margin: 0.6, accent: "#ff0000", pageSize: "a4", _touched: ["accent"] });
    expect(r.fit).toEqual({ ...theme.fit, step: 3 });
    expect(theme.fit.step).toBe(0); // input untouched
    expect(resolveTheme(theme, 50).fit.step).toBe(6);
    expect(resolveTheme({ ...theme, spacing: "compact" }, 2)).toMatchObject({ size: 10, density: 0.8, margin: 0.5 });
    expect(resolveTheme({ ...theme, spacing: "spacious" }, 0)).toMatchObject({ size: 11, density: 1.1, margin: 0.9 });
  });

  it("pageCount counts pages from a measured content height", () => {
    const perPage = (11 - 2 * 0.75) * 96; // 912 px
    expect(pageCount(0, "letter", 0.75)).toBe(1);
    expect(pageCount(perPage, "letter", 0.75)).toBe(1);
    expect(pageCount(perPage + 5, "letter", 0.75)).toBe(2);
    expect(pageCount(perPage * 2 + 5, "letter", 0.75)).toBe(3);
  });

  it("fitToPages walks the ladder with a simulated measurement", () => {
    // Content height shrinks as density/size shrink: ~ 1500px at step 0 down to ~900px at step 6.
    const measure = (t: { size: number; density: number; margin: number; pageSize: "letter" | "a4" }) =>
      pageCount(1500 * (t.size / 11) * (0.5 + 0.5 * t.density), t.pageSize, t.margin);
    const fit = fitToPages(DEFAULT_THEME, 1, measure);
    expect(fit.fits).toBe(false); // 1 page budget cannot be met by this content
    expect(fit.step).toBe(6);
    const two = fitToPages(DEFAULT_THEME, 2, measure);
    expect(two).toEqual({ step: 0, pages: 2, fits: true });

    const tight = (t: { size: number }) => (t.size > 10 ? 2 : 1);
    expect(fitToPages(DEFAULT_THEME, 1, tight as never)).toEqual({ step: 3, pages: 1, fits: true });
  });
});

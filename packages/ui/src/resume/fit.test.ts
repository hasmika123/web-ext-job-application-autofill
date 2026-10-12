import { describe, expect, it } from "vitest";
import { FIT_LADDER, MAX_FIT_STEP, clampStep, fitToPages, pageCount, resolveTheme } from "./fit";
import { DEFAULT_THEME } from "./theme";

describe("fit ladder", () => {
  it("is the seven design steps, each tighter than the last", () => {
    expect(FIT_LADDER).toEqual([
      { density: 1, size: 11, margin: 0.75 },
      { density: 1, size: 10.5, margin: 0.7 },
      { density: 0.92, size: 10.5, margin: 0.65 },
      { density: 0.88, size: 10, margin: 0.6 },
      { density: 0.82, size: 10, margin: 0.55 },
      { density: 0.78, size: 9.5, margin: 0.5 },
      { density: 0.72, size: 9.5, margin: 0.45 },
    ]);
    expect(MAX_FIT_STEP).toBe(6);
    for (let i = 1; i < FIT_LADDER.length; i++) {
      expect(FIT_LADDER[i].density).toBeLessThanOrEqual(FIT_LADDER[i - 1].density);
      expect(FIT_LADDER[i].size).toBeLessThanOrEqual(FIT_LADDER[i - 1].size);
      expect(FIT_LADDER[i].margin).toBeLessThan(FIT_LADDER[i - 1].margin);
    }
  });

  it("clamps steps", () => {
    expect([clampStep(-3), clampStep(0), clampStep(2.9), clampStep(99), clampStep(NaN)]).toEqual([0, 0, 2, 6, 0]);
  });

  it("resolveTheme applies the step's size/density/margin and keeps everything else", () => {
    const theme = { ...DEFAULT_THEME, accent: "#ff0000", pageSize: "a4" as const, _touched: ["accent"] };
    const r = resolveTheme(theme, 3);
    expect(r).toMatchObject({ density: 0.88, size: 10, margin: 0.6, accent: "#ff0000", pageSize: "a4", _touched: ["accent"] });
    expect(r.fit).toEqual({ ...theme.fit, step: 3 });
    expect(theme.fit.step).toBe(0); // input untouched
    expect(resolveTheme(theme, 50).fit.step).toBe(6);
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

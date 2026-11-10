import { describe, expect, it } from "vitest";
import { ATS_STRICT, DESIGN_FREE, pageCount, stepValues } from "@kiwiply/ui";
import { contentHeightOf, drawnTheme, paginate } from "./paginate";

/** Letter at the Normal preset: margin 0.75 in, so one page holds (11 - 1.5) * 96 = 912 px of content. */
const PER_PAGE = 912;

describe("paginate", () => {
  it("one page up to the page's content height, two just past it", () => {
    const one = paginate(PER_PAGE, null, ATS_STRICT);
    expect(one.pages).toBe(1);
    expect(one.offsets).toEqual([0]);
    const two = paginate(PER_PAGE + 2, null, ATS_STRICT);
    expect(two.pages).toBe(2);
    expect(two.offsets).toEqual([0, PER_PAGE]);
  });

  it("uses the fit.ts page-count rule (the same one the ladder and the PDF route use)", () => {
    for (const h of [0, 100, 912, 913, 1824, 1825, 5000]) {
      expect(paginate(h, null, ATS_STRICT).pages).toBe(pageCount(h, "letter", 0.75));
    }
  });

  it("reports the sheet and margin in CSS px for Letter and A4", () => {
    const letter = paginate(500, null, ATS_STRICT);
    expect([letter.pageWidthPx, letter.pageHeightPx, letter.marginPx, letter.perPagePx]).toEqual([816, 1056, 72, PER_PAGE]);
    const a4 = paginate(500, { pageSize: "a4" }, ATS_STRICT);
    expect([a4.pageWidthPx, a4.pageHeightPx]).toEqual([794, 1123]);
  });

  it("the page budget is the stored Page Length, capped by the template's maxPages", () => {
    const two = { fit: { mode: "auto" as const, target: 2 as const, step: 0 } };
    expect(paginate(2000, null, DESIGN_FREE).limit).toBe(1);
    expect(paginate(2000, two, DESIGN_FREE).limit).toBe(2);
    expect(paginate(2000, two, { ...ATS_STRICT, maxPages: 1 }).limit).toBe(1);
  });

  it("over = more pages than the budget", () => {
    const two = { fit: { mode: "auto" as const, target: 2 as const, step: 0 } };
    expect(paginate(1500, null, ATS_STRICT)).toMatchObject({ pages: 2, limit: 1, over: true });
    expect(paginate(1500, two, ATS_STRICT)).toMatchObject({ pages: 2, limit: 2, over: false });
    expect(paginate(2000, two, ATS_STRICT)).toMatchObject({ pages: 3, limit: 2, over: true });
  });

  it("follows the stored fit step: a tighter step has a smaller margin, so a page holds more", () => {
    const tight = { fit: { mode: "auto" as const, target: 1 as const, step: 6 } };
    const { margin } = stepValues("normal", 6);
    expect(paginate(900, tight, ATS_STRICT).marginPx).toBeCloseTo(margin * 96);
    expect(paginate(900, tight, ATS_STRICT).perPagePx).toBeGreaterThan(PER_PAGE);
  });
});

describe("contentHeightOf / drawnTheme", () => {
  it("takes the margin off both sides of the measured sheet and never goes negative", () => {
    expect(contentHeightOf(1056, 0.75)).toBe(912);
    expect(contentHeightOf(100, 0.75)).toBe(0);
  });

  it("drawnTheme is the stored theme at its ladder step with the template's page cap applied", () => {
    const t = drawnTheme({ fit: { mode: "auto", target: 2, step: 3 } }, { ...ATS_STRICT, maxPages: 1 });
    expect(t.fit).toMatchObject({ target: 1, step: 3 });
    expect(t.size).toBe(stepValues("normal", 3).size);
  });
});

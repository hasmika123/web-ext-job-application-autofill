import { afterEach, describe, expect, it, vi } from "vitest";
import { CATALOG } from "./fixtures";
import { addonsFor, basketKey, fetchPublicCatalog, hasSellablePlan, precomputedTotal, resetCatalogCache, selectionToAddons, visibleIntervals } from "./catalog";
import { chargeSentence, problemCopy, quoteSavingsLine, savingsLine, shortDate } from "./copy";
import { CHECKOUT_QUOTE } from "./fixtures";
import { safeReturnTo } from "./return-to";

const PRO = CATALOG.plans[1];

describe("catalog helpers", () => {
  it("treats a catalog with a priced paid plan as sellable, and an empty one as not", () => {
    expect(hasSellablePlan(CATALOG)).toBe(true);
    expect(hasSellablePlan({ ...CATALOG, plans: [CATALOG.plans[0]] })).toBe(false);
    expect(hasSellablePlan({ ...CATALOG, plans: [] })).toBe(false);
    expect(hasSellablePlan(null)).toBe(false);
  });

  it("builds the interval tabs from the union of the paid plans and hides YEAR when the admin switch is off", () => {
    expect(visibleIntervals(CATALOG)).toEqual(["MONTH", "QUARTER", "YEAR"]);
    expect(visibleIntervals({ ...CATALOG, annualEnabled: false })).toEqual(["MONTH", "QUARTER"]);
  });

  it("lists only the add-ons with a published price for the interval", () => {
    expect(addonsFor(PRO, "MONTH").map((a) => a.featureKey)).toEqual(["ai.credits_extra", "resumes.extra_10"]);
    expect(addonsFor(PRO, "YEAR").map((a) => a.featureKey)).toEqual(["ai.credits_extra"]);
  });

  it("keys a basket by sorted feature key and reads the precomputed total instead of adding", () => {
    expect(basketKey({ "resumes.extra_10": 1, "ai.credits_extra": 1, zero: 0 })).toBe("ai.credits_extra:1,resumes.extra_10:1");
    expect(precomputedTotal(CATALOG, PRO, "MONTH", {})).toBe(1999);
    expect(precomputedTotal(CATALOG, PRO, "MONTH", { "ai.credits_extra": 2 })).toBe(2997);
    expect(precomputedTotal(CATALOG, PRO, "MONTH", { "ai.credits_extra": 4 })).toBeUndefined();
    expect(selectionToAddons({ b: 2, a: 1, c: 0 })).toEqual([
      { featureKey: "a", quantity: 1 },
      { featureKey: "b", quantity: 2 },
    ]);
  });
});

describe("fetchPublicCatalog", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetCatalogCache();
  });

  it("keeps serving the last good catalog when the API goes away", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(CATALOG), { status: 200 })));
    expect((await fetchPublicCatalog())?.catalogVersion).toBe(17);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    expect((await fetchPublicCatalog())?.catalogVersion).toBe(17);
  });

  it("returns null when nothing good was ever seen", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 503 })));
    expect(await fetchPublicCatalog()).toBeNull();
  });
});

describe("copy register", () => {
  it("states today, then the recurring amount with its date, and that nothing is refunded", () => {
    const s = chargeSentence({ todayMinor: 2997, recurringMinor: 2997, currency: "USD", interval: "MONTH", nextAt: "2026-11-15T12:00:00Z" });
    expect(s).toContain("$29.97 today");
    expect(s).toContain("$29.97 every month from");
    expect(s).toContain("Cancel any time");
    expect(s).toContain("No refunds for partial periods");
  });

  it("writes the yearly line from the DTO fields", () => {
    expect(savingsLine(PRO.prices.YEAR, "YEAR", "USD")).toBe("billed $215.89 once a year · about $17.99/mo · save $23.99");
    expect(savingsLine(PRO.prices.MONTH, "MONTH", "USD")).toBe("");
    const yearly = { ...CHECKOUT_QUOTE, interval: "YEAR" as const, proposed: { ...CHECKOUT_QUOTE.proposed, recurringMinor: 21589, monthlyEquivalentMinor: 1799, savingsMinor: 2399 } };
    expect(quoteSavingsLine(yearly)).toBe("billed $215.89 once a year · about $17.99/mo · you save $23.99");
  });

  it("formats a date in the viewer's year only when it is another year", () => {
    const now = new Date("2026-10-20T00:00:00Z");
    expect(shortDate("2026-11-15T12:00:00Z", now)).toMatch(/Nov 15/);
    expect(shortDate("2027-10-20T12:00:00Z", now)).toMatch(/2027/);
    expect(shortDate(null)).toBe("");
  });

  it("maps the error registry to plain sentences", () => {
    expect(problemCopy("QUOTE_STALE")).toMatch(/Prices changed/);
    expect(problemCopy("QUANTITY_LIMIT", { max: 5 })).toMatch(/at most 5/);
    expect(problemCopy("CANCEL_PENDING")).toMatch(/Resume/);
    expect(problemCopy("ALREADY_SUBSCRIBED")).toMatch(/My plan/);
    expect(problemCopy("WHATEVER")).toMatch(/try again/);
  });
});

describe("safeReturnTo", () => {
  it("accepts same-site paths only", () => {
    expect(safeReturnTo("/settings/plan")).toBe("/settings/plan");
    expect(safeReturnTo("//evil.test")).toBeUndefined();
    expect(safeReturnTo("https://evil.test")).toBeUndefined();
    expect(safeReturnTo("/a\\b")).toBeUndefined();
    expect(safeReturnTo(undefined)).toBeUndefined();
  });
});

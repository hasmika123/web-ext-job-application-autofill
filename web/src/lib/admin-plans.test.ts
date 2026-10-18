import { describe, expect, it } from "vitest";
import { bpText, failingChecks, leverParts, minorToInput, parseMinorInput, priceFor, summarizePlans, type PlanPreview } from "./admin-plans";

describe("parseMinorInput", () => {
  it("reads what an admin types as integer minor units without floats", () => {
    expect(parseMinorInput("19.99", "USD")).toBe(1999);
    expect(parseMinorInput("$5,49", "USD")).toBe(549);
    expect(parseMinorInput("3", "USD")).toBe(300);
    expect(parseMinorInput("0.1", "USD")).toBe(10);
    expect(parseMinorInput("1.005", "USD")).toBeNull();
    expect(parseMinorInput("abc", "USD")).toBeNull();
    expect(parseMinorInput("", "USD")).toBeNull();
    expect(parseMinorInput("1500", "JPY")).toBe(1500);
    expect(parseMinorInput("1.5", "JPY")).toBeNull();
  });
  it("round-trips through minorToInput", () => {
    expect(minorToInput(1999, "USD")).toBe("19.99");
    expect(minorToInput(5, "USD")).toBe("0.05");
    expect(minorToInput(1500, "JPY")).toBe("1500");
    expect(minorToInput(null, "USD")).toBe("");
  });
});

describe("display helpers", () => {
  it("shows basis points as a percentage", () => {
    expect(bpText(7960)).toBe("79.6 %");
    expect(bpText(8060)).toBe("80.6 %");
    expect(bpText(null)).toBe("—");
  });
  it("lists the levers the server sent and nothing else", () => {
    expect(leverParts({ minPriceMinor: 549, maxAiBudgetCents: null, maxDiscountBp: 900 })).toEqual([
      { kind: "minPrice", value: 549 },
      { kind: "maxDiscount", value: 900 },
    ]);
    expect(leverParts(null)).toEqual([]);
  });
  it("prefers a draft price over the active one", () => {
    const prices = [
      { priceId: 1, interval: "MONTH", currency: "USD", amountMinor: 1999, source: "ACTIVE", derived: false, stripePriceId: null, marginBp: null, ok: null },
      { priceId: 2, interval: "MONTH", currency: "USD", amountMinor: 2199, source: "DRAFT", derived: false, stripePriceId: null, marginBp: null, ok: null },
    ];
    expect(priceFor(prices, "MONTH", "USD")?.amountMinor).toBe(2199);
    expect(priceFor(prices, "QUARTER", "USD")).toBeNull();
  });
});

describe("summarizePlans", () => {
  it("counts plans, statuses and subscribers off the live version", () => {
    const s = summarizePlans([
      { status: "PUBLISHED", liveVersion: { version: 2, effectiveFrom: null }, subscribersByVersion: { "1": 212, "2": 5 } },
      { status: "DRAFT", liveVersion: null, subscribersByVersion: {} },
      { status: "RETIRING", liveVersion: { version: 1, effectiveFrom: null }, subscribersByVersion: { "1": 3 } },
    ]);
    expect(s).toEqual({ plans: 3, published: 1, drafts: 1, sunset: 1, oldVersionSubscribers: 212 });
  });
});

describe("failingChecks", () => {
  const base = { checks: [], worstCase: null } as unknown as PlanPreview;
  it("counts failing gates and a failing worst case once", () => {
    expect(failingChecks(null)).toBe(0);
    expect(failingChecks({ ...base, checks: [{ id: "deps", ok: true, failing: null }] })).toBe(0);
    expect(failingChecks({ ...base, checks: [{ id: "margin", ok: false, failing: [] }], worstCase: { ok: false } as PlanPreview["worstCase"] })).toBe(1);
    expect(failingChecks({ ...base, worstCase: { ok: false } as PlanPreview["worstCase"] })).toBe(1);
  });
});

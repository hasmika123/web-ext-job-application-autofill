import { describe, expect, it } from "vitest";
import {
  allowanceText,
  filterFeatures,
  needsAttention,
  overviewRows,
  parseFeatures,
  percentUsed,
  renewalText,
  usedShare,
  type FeatureRow,
} from "./features";

const row = (o: Partial<FeatureRow>): FeatureRow => ({
  key: "k", title: "T", description: "", tone: "accent", icon: "search", status: "ENABLED", premium: false, allowance: null, used: null, usedLastMonth: null,
  unit: "credits", usedNote: "used this month", resetsOn: null, href: "/w/consultant/matches", actionLabel: "View", overview: false, sample: true, ...o,
});

describe("parseFeatures", () => {
  it("rejects a body that is not the contract", () => {
    expect(parseFeatures(null)).toBeNull();
    expect(parseFeatures({ orgId: "2" })).toBeNull();
    expect(parseFeatures({ orgId: 2, tiles: {}, features: "x" })).toBeNull();
  });

  it("drops bad rows, defaults unknown enums and refuses foreign links", () => {
    const v = parseFeatures({
      orgId: 2,
      tiles: { active: 1 },
      features: [{ key: "a", title: "A", status: "WEIRD", tone: "nope", icon: "nope", href: "https://evil.example" }, { title: "no key" }, 7],
    })!;
    expect(v.features).toHaveLength(1);
    expect(v.features[0].status).toBe("NOT_AVAILABLE");
    expect(v.features[0].tone).toBe("accent");
    expect(v.features[0].href).toBe("/w/consultant/features");
    expect(v.tiles.creditsLeft).toBeNull();
  });
});

describe("usage helpers", () => {
  it("computes the share only for a metered, tracked feature", () => {
    expect(usedShare(row({ allowance: 50, used: 32 }))).toBeCloseTo(0.64);
    expect(percentUsed(row({ allowance: 50, used: 32 }))).toBe(64);
    expect(usedShare(row({ allowance: null, used: 3 }))).toBeNull();
    expect(usedShare(row({ allowance: 50, used: null }))).toBeNull();
    expect(usedShare(row({ allowance: 10, used: 99 }))).toBe(1);
  });

  it("words the allowance cell", () => {
    expect(allowanceText(row({ allowance: 50, used: 32 }))).toEqual({ headline: "32 / 50 credits", detail: null });
    expect(allowanceText(row({ allowance: null, used: 18, usedNote: "viewed this month" }))).toEqual({ headline: "Unlimited", detail: "18 viewed this month" });
    expect(allowanceText(row({ allowance: 20, used: null, unit: "sessions" })).detail).toMatch(/not|arrives/i);
    expect(allowanceText(row({ status: "DISABLED" })).headline).toBe("No allowance");
  });

  it("words renewal and availability", () => {
    expect(renewalText({ status: "ENABLED", resetsOn: "2026-11-01" })).toBe("Resets Nov 1, 2026");
    expect(renewalText({ status: "ENABLED", resetsOn: null })).toBe("Included in plan");
    expect(renewalText({ status: "NOT_AVAILABLE", resetsOn: null })).toBe("Not in your plan");
  });
});

describe("filters", () => {
  const rows = [
    row({ key: "a", premium: true, allowance: 10, used: 9 }),
    row({ key: "b" }),
    row({ key: "c", status: "DISABLED", overview: true }),
    row({ key: "d", overview: true }),
  ];
  it("filters", () => {
    expect(filterFeatures(rows, "all")).toHaveLength(4);
    expect(filterFeatures(rows, "enabled").map((f) => f.key)).toEqual(["a", "b", "d"]);
    expect(filterFeatures(rows, "attention").map((f) => f.key)).toEqual(["a", "c"]);
    expect(filterFeatures(rows, "premium").map((f) => f.key)).toEqual(["a"]);
    expect(needsAttention(rows[1])).toBe(false);
    expect(overviewRows(rows).map((f) => f.key)).toEqual(["d"]);
  });
});

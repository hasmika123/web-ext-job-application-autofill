import { describe, expect, it } from "vitest";
import { collectionText, day, lastMonths, meterPercent, methodText, money, monthName, recurringText, setupFeeText } from "./billing";

/** ORG-BILLING-BUILD.md step 1a: money comes from minor units only, and a missing price says so instead of $0. */
describe("billing helpers", () => {
  it("formats minor units and dates, and a missing value is a dash", () => {
    expect(money(127449)).toBe("$1,274.49");
    expect(money(0)).toBe("$0.00");
    expect(money(null)).toBe("-");
    expect(day("2026-11-05")).toBe("Nov 5, 2026");
    expect(day("2026-11-30T23:30:00Z")).toBe("Nov 30, 2026");
    expect(day(null)).toBe("-");
    expect(monthName("2026-10")).toBe("October 2026");
  });

  it("the recurring line is money, 'Price not set' with licences, or 'No licences yet'", () => {
    expect(recurringText({ monthlyRecurringMinor: 4297, currency: "USD", tiles: { consultants: 2, licensed: 2, unlicensed: 0 } })).toBe("$42.97 / month");
    expect(recurringText({ monthlyRecurringMinor: null, currency: "USD", tiles: { consultants: 2, licensed: 1, unlicensed: 1 } })).toBe("Price not set");
    expect(recurringText({ monthlyRecurringMinor: null, currency: "USD", tiles: { consultants: 2, licensed: 0, unlicensed: 2 } })).toBe("No licences yet");
  });

  it("describes the card on file and how the organization pays", () => {
    expect(methodText({ kind: "CARD", brand: "visa", last4: "4242", expMonth: 4, expYear: 2029 })).toBe("Visa ending 4242, expires 04/2029");
    expect(methodText(null)).toBeNull();
    expect(collectionText("SEND_INVOICE")).toBe("An invoice each period, paid within 15 days");
    expect(collectionText(undefined)).toBe("-");
  });

  it("the setup fee in words: waived, paid, or on the first invoice (never $0)", () => {
    expect(setupFeeText("WAIVED", null)).toBe("Waived");
    expect(setupFeeText("PAID", 50000)).toBe("Paid");
    expect(setupFeeText("ADDED", 50000)).toBe("On your first invoice: $500.00");
    expect(setupFeeText("OWED", null)).toBe("On your first invoice (price to be confirmed)");
    expect(setupFeeText(null, null)).toBeNull();
  });

  it("meters and the month picker", () => {
    expect(meterPercent(27, 40)).toBe(68);
    expect(meterPercent(50, 40)).toBe(100);
    expect(meterPercent(3, null)).toBeNull();
    expect(lastMonths(new Date("2026-01-15T00:00:00Z"), 3)).toEqual(["2026-01", "2025-12", "2025-11"]);
  });
});

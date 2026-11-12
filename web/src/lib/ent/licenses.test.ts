import { describe, expect, it } from "vitest";
import { addOnNames, dayText, deltaText, errorText, holdsLicense, lineText, moneyText, priceText, summarize, type LicenseCatalog, type LicenseRow, type QuoteLine } from "./licenses";

const catalog: LicenseCatalog = {
  currency: "USD",
  basePriceMinor: null,
  billingConnected: false,
  addOns: [
    { key: "ai.resume_tailoring", name: "AI resume tailoring", description: null, priceMinor: null, usesAi: true },
    { key: "inbox.monitoring", name: "Inbox monitoring", description: null, priceMinor: 500, usesAi: true },
    { key: "alerts.advanced", name: "Advanced alerts", description: null, priceMinor: null, usesAi: false },
  ],
};
const row = (status: LicenseRow["status"], features: string[] = []): LicenseRow => ({
  consultantId: 1, name: "Anika Rao", email: "a@x.test", signInLinked: true, status, features, monthlyMinor: null, priceSet: false, since: null, endsAt: null, suspendReason: null,
});

describe("licence helpers", () => {
  it("a suspended licence can still be changed; an ended one cannot", () => {
    expect(holdsLicense(row("ACTIVE"))).toBe(true);
    expect(holdsLicense(row("SUSPENDED"))).toBe(true);
    expect(holdsLicense(row("ENDING"))).toBe(true);
    expect(holdsLicense(row("ENDED"))).toBe(false);
    expect(holdsLicense(row("NONE"))).toBe(false);
  });

  it("names add-ons in catalog order", () => {
    expect(addOnNames(["inbox.monitoring", "ai.resume_tailoring", "x.unknown"], catalog)).toEqual(["AI resume tailoring", "Inbox monitoring", "x.unknown"]);
  });

  it("counts licensed consultants and the ones with AI help", () => {
    const s = summarize([row("ACTIVE", ["alerts.advanced"]), row("ACTIVE", ["inbox.monitoring"]), row("SUSPENDED", ["ai.resume_tailoring"]), row("NONE"), row("ENDED")], catalog);
    expect(s).toEqual({ consultants: 5, licensed: 2, withAi: 1, unlicensed: 2 });
  });

  it("says plainly when no price is set", () => {
    expect(priceText(null, "USD")).toBe("Price not set");
    expect(priceText(5400, "USD")).toBe("$54.00 / month");
  });

  it("turns the licence conflicts into sentences", () => {
    expect(errorText({ status: 409, code: "NO_LICENSE", message: "x" })).toMatch(/no longer has a licence/);
    expect(errorText({ status: 409, code: "ALREADY_LICENSED", message: "x" })).toMatch(/already has a licence/);
    expect(errorText({ status: 404, message: "Not found" })).toMatch(/no longer in your view/);
  });
});

/** ORG-BILLING-BUILD.md step 1b: the quote helpers only format the API's numbers. */
describe("quote helpers", () => {
  const now = new Date("2026-11-11T10:00:00Z");
  const line = (op: QuoteLine["op"], effectiveAt = "2026-11-11T10:00:00Z"): QuoteLine => ({ op, featureKey: "inbox.monitoring", name: "Inbox monitoring", monthlyMinor: 900, dueNowMinor: null, effectiveAt });

  it("says what each line does, with the date a removal waits for", () => {
    expect(lineText({ ...line("CREATE"), name: "Base licence" }, now)).toBe("Give the base licence");
    expect(lineText(line("ADD_FEATURE"), now)).toBe("Add Inbox monitoring");
    expect(lineText(line("KEEP_FEATURE"), now)).toBe("Keep Inbox monitoring");
    expect(lineText(line("REMOVE_FEATURE"), now)).toBe("Remove Inbox monitoring now");
    expect(lineText(line("REMOVE_FEATURE", "2026-12-01T00:00:00Z"), now)).toBe("Remove Inbox monitoring on Dec 1, 2026");
  });

  it("money and the monthly change, with 'Price not set' instead of $0", () => {
    expect(moneyText(900, "USD")).toBe("$9.00");
    expect(moneyText(null, "USD")).toBe("Price not set");
    expect(dayText("2026-11-30")).toBe("Nov 30, 2026");
    const t = { currentMonthlyMinor: 1499, proposedMonthlyMinor: 2399, deltaMinor: 900, dueNowMinor: 600, priceSet: true, periodLastDay: "2026-11-30" };
    expect(deltaText(t, "USD")).toBe("+$9.00 / month");
    expect(deltaText({ ...t, deltaMinor: -900 }, "USD")).toBe("-$9.00 / month");
    expect(deltaText({ ...t, deltaMinor: 0 }, "USD")).toBe("No change");
    expect(deltaText({ ...t, priceSet: false, deltaMinor: null }, "USD")).toBe("Price not set");
  });

  it("explains a refused quote", () => {
    expect(errorText({ status: 409, code: "QUOTE_STALE", message: "x" })).toMatch(/changed since/);
    expect(errorText({ status: 410, code: "QUOTE_EXPIRED", message: "x" })).toMatch(/no longer valid/);
    expect(errorText({ status: 409, code: "QUOTE_USED", message: "x" })).toMatch(/already confirmed/);
    expect(errorText({ status: 422, code: "NO_CHANGE", message: "x" })).toMatch(/Nothing changes/);
    expect(errorText({ status: 409, code: "NOT_PENDING", message: "x" })).toMatch(/no longer waiting/);
  });
});

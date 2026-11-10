import { describe, expect, it } from "vitest";
import { addOnNames, errorText, holdsLicense, priceText, summarize, type LicenseCatalog, type LicenseRow } from "./licenses";

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

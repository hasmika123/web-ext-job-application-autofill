// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import QuoteSummary from "./QuoteSummary";
import type { LicenseQuote } from "@/lib/ent/licenses";

afterEach(cleanup);

const priced: LicenseQuote = {
  id: 9,
  consultantId: 23,
  consultantName: "Meera Shah",
  status: "OPEN",
  currency: "USD",
  lines: [
    { op: "ADD_FEATURE", featureKey: "ai.resume_tailoring", name: "AI resume tailoring", monthlyMinor: 1200, dueNowMinor: 800, effectiveAt: "2026-11-11T10:00:00Z" },
    { op: "REMOVE_FEATURE", featureKey: "inbox.monitoring", name: "Inbox monitoring", monthlyMinor: 900, dueNowMinor: 0, effectiveAt: "2026-12-01T00:00:00Z" },
  ],
  totals: { currentMonthlyMinor: 2399, proposedMonthlyMinor: 2699, deltaMinor: 300, dueNowMinor: 800, priceSet: true, periodLastDay: "2026-11-30" },
  billingConnected: false,
  expiresAt: "2026-11-11T10:15:00Z",
};

/** ORG-BILLING-BUILD.md step 1b: the summary draws the API's quote 1:1 and never computes money. */
describe("QuoteSummary", () => {
  it("shows each line, the monthly before and after, what the rest of the period costs, and that nothing is billed", () => {
    render(<QuoteSummary quote={priced} now={new Date("2026-11-11T10:00:00Z")} />);
    const lines = document.querySelector("[data-quote-lines]")!.textContent!;
    expect(lines).toMatch(/Add AI resume tailoring\$12\.00 \/ month/);
    expect(lines).toMatch(/Remove Inbox monitoring on Dec 1, 2026/);
    expect(document.querySelector("[data-quote-monthly]")!.textContent).toMatch(/\$23\.99 → \$26\.99\+\$3\.00\/mo/);
    expect(document.querySelector("[data-quote-due]")!.textContent).toBe("$8.00");
    const note = document.querySelector("[data-quote-note]")!.textContent!;
    expect(note).toMatch(/Nothing is billed yet/);
    expect(note).toMatch(/keep working until the period ends/);
  });

  it("without prices every amount reads 'Price not set' and nothing is due", () => {
    const bare: LicenseQuote = {
      ...priced,
      lines: priced.lines.map((l) => ({ ...l, monthlyMinor: null, dueNowMinor: null })),
      totals: { currentMonthlyMinor: null, proposedMonthlyMinor: null, deltaMinor: null, dueNowMinor: null, priceSet: false, periodLastDay: null },
    };
    render(<QuoteSummary quote={bare} now={new Date("2026-11-11T10:00:00Z")} />);
    expect(document.querySelector("[data-quote-monthly]")!.textContent).toBe("Price not set");
    expect(document.querySelector("[data-quote-due]")).toBeNull();
    expect(document.body.textContent).not.toMatch(/\$0/);
  });
});

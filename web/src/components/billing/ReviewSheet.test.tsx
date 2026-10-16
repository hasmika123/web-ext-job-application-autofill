import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ReviewSheet from "./ReviewSheet";
import { CHECKOUT_QUOTE } from "@/lib/subscription/fixtures";

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const yearly = {
  ...CHECKOUT_QUOTE,
  interval: "YEAR" as const,
  proposed: { ...CHECKOUT_QUOTE.proposed, recurringMinor: 26978, monthlyEquivalentMinor: 2248, savingsMinor: 3598 },
  nextInvoiceEstimateMinor: 26978,
  nextInvoiceAt: "2027-10-20T00:00:00Z",
};

describe("ReviewSheet annual variant (K9.4)", () => {
  it("says billed once a year, the monthly equivalent and the saving, all from the quote's fields, and the renewal a year out", async () => {
    vi.mocked(fetch).mockImplementation(() => json(yearly));
    render(<ReviewSheet open basket={{ planKey: "PRO", interval: "YEAR", addons: [{ featureKey: "ai.credits_extra", quantity: 2 }] }} planName="Pro" onClose={() => undefined} />);
    const sheet = await screen.findByTestId("review-sheet");
    await waitFor(() => expect(within(sheet).getByTestId("quote-total")).toBeTruthy());
    expect(within(sheet).getByText("billed $269.78 once a year · about $22.48/mo · you save $35.98")).toBeTruthy();
    const sentence = within(sheet).getByTestId("charge-sentence").textContent ?? "";
    expect(sentence).toContain("$269.78 today, then $269.78 once a year from");
    expect(sentence).toContain("No refunds for partial periods");
    expect(within(sheet).getByTestId("quote-total").textContent).toContain("/yr");
  });

  it("asks for the required service when the quote says one is needed, and keeps the button off until it is added", async () => {
    const needs = { ...CHECKOUT_QUOTE, requiresConfirmation: [{ featureKey: "ai.deep_tailor", requires: "ai.credits_extra", kind: "COMMERCIAL", priceMinor: 499, name: "Extra AI credits" }] };
    vi.mocked(fetch).mockImplementation(() => json(needs));
    render(<ReviewSheet open basket={{ planKey: "PRO", interval: "MONTH", addons: [{ featureKey: "ai.deep_tailor", quantity: 1 }] }} planName="Pro" onClose={() => undefined} />);
    const prompt = await screen.findByTestId("dependency-prompt");
    expect(prompt.textContent).toContain("also needs Extra AI credits");
    expect((screen.getByRole("button", { name: /Continue to payment/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});

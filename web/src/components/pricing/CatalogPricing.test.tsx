import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

import CatalogPricing from "./CatalogPricing";
import { CATALOG, CHECKOUT_QUOTE } from "@/lib/subscription/fixtures";

const viewer = { signedIn: true, billingLive: true, currentPlanKey: null, onPaidPlan: false };

const reply = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  push.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// Waiting is on conditions, never on the clock: a loaded machine (or CI next to a build) can take several seconds to render a sheet, so every
// async wait gets a generous ceiling and returns the moment its condition holds.
const WAIT = { timeout: 10_000 };

const bodyOf = (call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string);
/** The fetch calls made to one URL, in order. A basket's anonymous total quote is debounced 300 ms, so on a slow run it lands after the checkout: never read "the last call". */
const callsTo = (url: string) => fetchMock.mock.calls.filter((c) => String(c[0]) === url);

const proCard = () => screen.getByRole("heading", { name: "Pro" }).closest("div[class*='row-span-7']") as HTMLElement;

describe("CatalogPricing", () => {
  it("renders the plans from the catalog with the interval tabs", () => {
    render(<CatalogPricing catalog={CATALOG} {...viewer} />);
    expect(screen.getByRole("tab", { name: /Monthly/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /3 months/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Yearly · save 10 %/ })).toBeTruthy();
    expect(within(proCard()).getAllByText("$19.99").length).toBeGreaterThan(0);
    expect(within(proCard()).getByText("or $49.99 every 3 months")).toBeTruthy();
  });

  it("hides the Yearly tab when the admin switch is off", () => {
    render(<CatalogPricing catalog={{ ...CATALOG, annualEnabled: false }} {...viewer} />);
    expect(screen.queryByRole("tab", { name: /Yearly/ })).toBeNull();
  });

  it("shows the yearly price line from the DTO fields and drops add-ons that have no yearly price", () => {
    render(<CatalogPricing catalog={CATALOG} {...viewer} />);
    expect(within(proCard()).getByRole("checkbox", { name: /Extra resumes/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /Yearly/ }));
    expect(within(proCard()).getAllByText("$215.89").length).toBeGreaterThan(0);
    expect(within(proCard()).getByText("billed $215.89 once a year · about $17.99/mo · save $23.99")).toBeTruthy();
    expect(within(proCard()).queryByRole("checkbox", { name: /Extra resumes/ })).toBeNull();
  });

  it("shows the server's total for a ticked add-on without adding anything in the browser", () => {
    render(<CatalogPricing catalog={CATALOG} {...viewer} />);
    fireEvent.click(within(proCard()).getByRole("checkbox", { name: /Extra AI credits/ }));
    expect(screen.getByTestId("total-PRO").textContent).toContain("$24.98");
    fireEvent.click(within(proCard()).getByLabelText("More Extra AI credits"));
    expect(screen.getByTestId("total-PRO").textContent).toContain("$29.97");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks for an anonymous quote when the basket is outside the precomputed totals", async () => {
    fetchMock.mockImplementation(() => reply({ ...CHECKOUT_QUOTE, proposed: { ...CHECKOUT_QUOTE.proposed, recurringMinor: 3496 } }));
    render(<CatalogPricing catalog={CATALOG} {...viewer} />);
    fireEvent.click(within(proCard()).getByRole("checkbox", { name: /Extra AI credits/ }));
    for (let i = 0; i < 3; i++) fireEvent.click(within(proCard()).getByLabelText("More Extra AI credits"));
    await waitFor(() => expect(screen.getByTestId("total-PRO").textContent).toContain("$34.96"), WAIT);
    const body = JSON.parse((fetchMock.mock.calls.at(-1)![1] as RequestInit).body as string);
    expect(body).toMatchObject({ anonymous: true, planKey: "PRO", interval: "MONTH", addons: [{ featureKey: "ai.credits_extra", quantity: 4 }] });
  });

  it("sends a signed-out visitor to sign up", () => {
    render(<CatalogPricing catalog={CATALOG} {...viewer} signedIn={false} />);
    fireEvent.click(within(proCard()).getByRole("button", { name: "Get Pro" }));
    expect(push).toHaveBeenCalledWith("/signup?next=%2Fpricing");
  });

  it("says Payments open soon when Stripe is off, and points a subscriber of this plan to My plan", () => {
    const { unmount } = render(<CatalogPricing catalog={CATALOG} {...viewer} billingLive={false} />);
    expect((within(proCard()).getByRole("button", { name: "Payments open soon" }) as HTMLButtonElement).disabled).toBe(true);
    unmount();
    render(<CatalogPricing catalog={CATALOG} {...viewer} currentPlanKey="PRO" onPaidPlan />);
    const link = within(proCard()).getByRole("link", { name: /You.re on Pro/ });
    expect(link.getAttribute("href")).toBe("/settings/plan");
  });

  it("opens the review sheet with the quote's lines, the charge sentence and the consent text, then goes to payment", async () => {
    fetchMock.mockImplementation((url: string) => (String(url).endsWith("/checkout") ? reply({ url: "https://checkout.stripe.test/s" }) : reply(CHECKOUT_QUOTE)));
    const loc = { href: "" };
    vi.stubGlobal("location", loc);
    render(<CatalogPricing catalog={CATALOG} {...viewer} />);
    fireEvent.click(within(proCard()).getByRole("checkbox", { name: /Extra AI credits/ }));
    fireEvent.click(within(proCard()).getByRole("button", { name: /Go Pro/ }));
    const sheet = await screen.findByTestId("review-sheet", undefined, WAIT);
    await waitFor(() => expect(within(sheet).getByTestId("quote-total")).toBeTruthy(), WAIT);
    expect(within(sheet).getByText(/Extra AI credits/)).toBeTruthy();
    const sentence = within(sheet).getByTestId("charge-sentence").textContent ?? "";
    expect(sentence).toContain("$29.97 today, then $29.97 every month from");
    expect(sentence).toContain("No refunds for partial periods");
    expect(within(sheet).getByText("By continuing you agree to the Terms.")).toBeTruthy();
    // the review sheet's own quote is the one that is not anonymous (a debounced basket-total quote may be in flight too)
    const reviewQuote = callsTo("/api/billing/quotes").map(bodyOf).find((b) => !b.anonymous);
    expect(reviewQuote).toMatchObject({ kind: "CHECKOUT", planKey: "PRO", interval: "MONTH", addons: [{ featureKey: "ai.credits_extra", quantity: 1 }] });
    fireEvent.click(screen.getByRole("button", { name: /Continue to payment/ }));
    await waitFor(() => expect(loc.href).toBe("https://checkout.stripe.test/s"), WAIT);
    expect(callsTo("/api/billing/quotes/901/checkout")).toHaveLength(1);
  });

  it("re-quotes on QUOTE_STALE and says the prices changed", async () => {
    let quotes = 0;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (String(url).endsWith("/checkout")) return reply({ code: "QUOTE_STALE", reason: "PRICES_CHANGED" }, 409);
      // count the review sheet's quotes only: the card's own debounced anonymous total quote is a different request and its timing is the machine's
      if (JSON.parse(String(init?.body ?? "{}")).anonymous) return reply(CHECKOUT_QUOTE);
      quotes += 1;
      return reply({ ...CHECKOUT_QUOTE, quoteId: 900 + quotes });
    });
    render(<CatalogPricing catalog={CATALOG} {...viewer} />);
    fireEvent.click(within(proCard()).getByRole("button", { name: /Go Pro/ }));
    await screen.findByTestId("quote-total", undefined, WAIT);
    fireEvent.click(screen.getByRole("button", { name: /Continue to payment/ }));
    await waitFor(() => expect(screen.getByText(/Prices changed/)).toBeTruthy(), WAIT);
    await waitFor(() => expect(quotes).toBe(2), WAIT);
    // the second quote's response is applied a tick after the request is made: wait for the button to come back rather than reading it at once
    await waitFor(() => expect((screen.getByRole("button", { name: /Continue to payment/ }) as HTMLButtonElement).disabled).toBe(false), WAIT);
  });

  it("points ALREADY_SUBSCRIBED to My plan", async () => {
    fetchMock.mockImplementation(() => reply({ code: "ALREADY_SUBSCRIBED" }, 409));
    render(<CatalogPricing catalog={CATALOG} {...viewer} />);
    fireEvent.click(within(proCard()).getByRole("button", { name: /Go Pro/ }));
    expect(await screen.findByText(/already have a plan/, undefined, WAIT)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open My plan" }).getAttribute("href")).toBe("/settings/plan");
  });
});

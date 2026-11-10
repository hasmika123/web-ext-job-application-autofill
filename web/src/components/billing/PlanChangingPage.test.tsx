import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@kiwiply/ui";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import PlanChangingPage from "./PlanChangingPage";
import { CHANGE_QUOTE } from "@/lib/subscription/fixtures";
import { shortDate } from "@/lib/subscription/copy";
import type { RetirementMe, RetirementNotice } from "@/lib/subscription/retirement";

const AT = "2026-11-15T12:00:00Z";
const DATE = shortDate(AT);

const USES: RetirementNotice["uses"] = [
  { featureKey: "ai.tailoring", name: "AI tailoring", detail: "27 of 40", covered: true },
  { featureKey: "inbox.monitor", name: "Inbox monitoring", detail: null, covered: true },
  { featureKey: "resume.library", name: "12 resumes", detail: "3 free slots", covered: true },
];

const BASE: RetirementNotice = {
  retirementId: 7,
  planKey: "PRO",
  planName: "Pro v1",
  planVersion: 1,
  effectiveAt: AT,
  defaultOutcome: "FREE",
  interval: "MONTH",
  currency: "USD",
  uses: USES,
  suggestion: {
    successorPlanKey: "PRO",
    successorName: "Pro v3",
    interval: "MONTH",
    currency: "USD",
    currentMinor: 1999,
    proposedMinor: 1999,
    deltaMinor: 0,
    covers: ["AI tailoring"],
    gaps: [],
    atRenewalQuoteId: 501,
  },
  others: [{ planKey: "AUTOPILOT", name: "Autopilot", priceMinor: 3999, interval: "MONTH", currency: "USD" }],
  fallback: { locked: [{ featureKey: "ai.tailoring", name: "AI resume tailoring" }, { featureKey: "inbox.monitor", name: "Inbox monitoring" }], readOnlyResumes: 9 },
  decision: { status: "PENDING" },
};

const EQUAL: RetirementMe = { retirement: BASE };
const DEARER: RetirementMe = {
  retirement: { ...BASE, suggestion: { ...BASE.suggestion!, successorName: "Autopilot", successorPlanKey: "AUTOPILOT", proposedMinor: 3999, deltaMinor: 2000, atRenewalQuoteId: 601, nowQuoteId: 602, nowTodayMinor: 1320 } },
};

type Call = { url: string; method: string; headers: Record<string, string>; body?: unknown };
let calls: Call[];
let routes: Record<string, (c: Call) => Response | Promise<Response>>;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  calls = [];
  routes = {
    "POST /api/billing/retirement/me/choice": (c) => json({ retirement: { ...BASE, decision: { status: (c.body as { choice: string }).choice === "STAY_ON_FREE" ? "STAY_ON_FREE" : "SWITCH_SCHEDULED", planName: "Pro v3" } } }),
    "GET /api/billing/retirement/me": () => json(EQUAL),
    "POST /api/billing/quotes": () => json({ ...CHANGE_QUOTE, plan: { planKey: "AUTOPILOT", version: 2, name: "Autopilot" } }),
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const call: Call = {
        url: String(url),
        method: init?.method ?? "GET",
        headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v])),
        body: init?.body ? JSON.parse(init.body as string) : undefined,
      };
      calls.push(call);
      const route = routes[`${call.method} ${call.url}`];
      return route ? route(call) : json({ code: "NOT_FOUND" }, 404);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const renderPage = (initial: RetirementMe) =>
  render(
    <ToastProvider>
      <PlanChangingPage initial={initial} />
    </ToastProvider>,
  );

describe("PlanChangingPage (K10.10)", () => {
  it("titles the page with the plan and the subscriber's own date, and lists what they use", () => {
    renderPage(EQUAL);
    expect(screen.getByTestId("changing-title").textContent).toBe(`Pro v1 is changing on ${DATE}`);
    const uses = within(screen.getByTestId("uses"));
    expect(uses.getByText("AI tailoring")).toBeTruthy();
    expect(uses.getByText(/27 of 40/)).toBeTruthy();
  });

  it("equal price: ONE primary button 'Switch at renewal — free', no 'Switch now', and the date is stated next to it", () => {
    renderPage(EQUAL);
    const cta = screen.getByRole("button", { name: "Switch at renewal — free" });
    expect(screen.queryByRole("button", { name: /Switch now/ })).toBeNull();
    expect(cta.getAttribute("aria-describedby")).toBeTruthy();
    expect(document.getElementById(cta.getAttribute("aria-describedby")!)!.textContent).toContain(DATE);
    expect(screen.getByTestId("price-line").textContent).toContain("$19.99/mo");
    expect(screen.getByText(/same price, everything you use is included/)).toBeTruthy();
  });

  it("dearer: two explicit buttons with today's charge and the renewal price and date; neither is the pre-selected one", () => {
    renderPage(DEARER);
    const group = within(screen.getByRole("group", { name: "How to switch" }));
    const buttons = group.getAllByRole("button");
    expect(buttons).toHaveLength(2);
    expect(buttons[0].textContent).toBe("Switch now · $13.20 today (prorated)");
    expect(buttons[1].textContent).toBe(`Switch at renewal · $39.99/mo from ${DATE}`);
    for (const b of buttons) expect(b.getAttribute("aria-pressed")).toBeNull();
    expect(screen.queryByRole("button", { name: "Switch at renewal — free" })).toBeNull();
    expect(screen.getByText(/never move you to a higher price without your say-so/)).toBeTruthy();
  });

  it("copy lint: every choice button carries the effective date in its label or in the text it points to", () => {
    renderPage(DEARER);
    const ctas = screen.getAllByRole("button").filter((b) => /Switch|Move to Free/.test(b.textContent ?? ""));
    expect(ctas.length).toBeGreaterThanOrEqual(3);
    for (const b of ctas) {
      const described = b.getAttribute("aria-describedby");
      const text = `${b.textContent} ${described ? (document.getElementById(described)?.textContent ?? "") : ""}`;
      expect(text, b.textContent ?? "").toContain(DATE);
    }
  });

  it("choosing sends the choice and the quote id the API made, with an Idempotency-Key, then shows the decision", async () => {
    renderPage(EQUAL);
    fireEvent.click(screen.getByRole("button", { name: "Switch at renewal — free" }));
    await waitFor(() => expect(calls.find((c) => c.url === "/api/billing/retirement/me/choice")).toBeTruthy());
    const post = calls.find((c) => c.url === "/api/billing/retirement/me/choice")!;
    expect(post.body).toEqual({ choice: "SWITCH_AT_RENEWAL", quoteId: 501 });
    expect(post.headers["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/i);
    expect((await screen.findByTestId("decision-line")).textContent).toContain(`It starts on ${DATE}`);
  });

  it("states what happens if you do nothing, with the date, no deletion, a data download and a cancel route with no refunds", () => {
    renderPage(EQUAL);
    const block = within(screen.getByTestId("do-nothing"));
    expect(block.getByText(new RegExp(`on ${DATE} your account moves to Free`))).toBeTruthy();
    expect(block.getByText(/nothing is deleted/i)).toBeTruthy();
    expect(block.getByRole("link", { name: "Download my data" }).getAttribute("href")).toBe("/api/account/export");
    expect(block.getByText(new RegExp(`you keep Pro v1 until ${DATE}`, "i"))).toBeTruthy();
    expect(block.getByText(/No refunds for partial periods/)).toBeTruthy();
    expect(screen.getByTestId("free-lock-preview").textContent).toContain("9 resumes become read-only");
  });

  it("staying on Free is an explicit choice, never pre-selected", async () => {
    renderPage(EQUAL);
    fireEvent.click(screen.getByRole("button", { name: `Move to Free on ${DATE}` }));
    await waitFor(() => expect(calls.find((c) => c.url === "/api/billing/retirement/me/choice")?.body).toEqual({ choice: "STAY_ON_FREE" }));
  });

  it("another plan: See quote asks the API for a quote and shows the impact preview", async () => {
    renderPage(EQUAL);
    fireEvent.click(screen.getByRole("button", { name: "See quote for Autopilot" }));
    expect(await screen.findByTestId("impact-preview")).toBeTruthy();
    expect(calls.find((c) => c.url === "/api/billing/quotes")?.body).toMatchObject({ kind: "CHANGE", planKey: "AUTOPILOT", interval: "MONTH", addons: [] });
  });

  it("a refused choice says so calmly and keeps the page", async () => {
    routes["POST /api/billing/retirement/me/choice"] = () => json({ code: "QUOTE_STALE" }, 409);
    renderPage(EQUAL);
    fireEvent.click(screen.getByRole("button", { name: "Switch at renewal — free" }));
    expect((await screen.findByTestId("choice-problem")).textContent).toMatch(/Prices changed/);
    expect(screen.getByTestId("plan-changing")).toBeTruthy();
  });

  it("with nothing changing it says so and links back to My plan", () => {
    renderPage({ retirement: null });
    expect(screen.getByTestId("nothing-changing")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to My plan" }).getAttribute("href")).toBe("/settings/plan");
  });
});

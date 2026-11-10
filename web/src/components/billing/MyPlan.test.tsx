import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@kiwiply/ui";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import MyPlan from "./MyPlan";
import { BATCH, CATALOG, CHANGE_QUOTE, ENTITLEMENTS, INVOICES, SUB } from "@/lib/subscription/fixtures";
import type { PlanV3 } from "@/lib/subscription/types";

type Call = { url: string; method: string; headers: Record<string, string>; body?: unknown };
let calls: Call[];
let routes: Record<string, (c: Call) => Response | Promise<Response>>;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  calls = [];
  routes = {
    "GET /api/catalog/public": () => json(CATALOG),
    "GET /api/entitlements/me": () => json(ENTITLEMENTS),
    "GET /api/billing/invoices": () => json(INVOICES),
    "GET /api/billing/me": () => json(SUB),
    "POST /api/billing/quotes": () => json(CHANGE_QUOTE),
    "POST /api/billing/quotes/902/confirm": () => json(BATCH),
    "DELETE /api/billing/changes/51": () => json({ id: 51, kind: "DECREASE", prorationMinor: 0, status: "CANCELLED" }),
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

const renderPlan = (plan: PlanV3 = SUB) =>
  render(
    <ToastProvider>
      <MyPlan initialPlan={plan} />
    </ToastProvider>,
  );

const fewer = () => screen.findByRole("button", { name: "Fewer Extra AI credits" });

describe("MyPlan", () => {
  it("shows the plan, its version, the renewal and the held add-on", async () => {
    renderPlan();
    expect(screen.getByTestId("plan-name").textContent).toContain("Pro");
    expect(screen.getByText(/Pro v2 \(you keep this version\)/)).toBeTruthy();
    expect(screen.getByTestId("renews-line").textContent).toMatch(/Renews .*\$29\.97\/mo/);
    expect(screen.getByTestId("qty-ai.credits_extra").textContent).toBe("2");
    await waitFor(() => expect(screen.getByTestId("plan-meters")).toBeTruthy());
    expect(screen.getByTestId("invoice-list")).toBeTruthy();
  });

  it("a Free subscriber sees the Free card and no add-on controls", () => {
    renderPlan({ plan: "FREE", status: "none", currentPeriodEnd: null, cancelAtPeriodEnd: false, billingEnabled: true, hasCustomer: false });
    expect(screen.getByTestId("my-plan-free")).toBeTruthy();
    expect(screen.getByRole("link", { name: "See plans" }).getAttribute("href")).toBe("/pricing");
    expect(screen.queryByTestId("addon-steppers")).toBeNull();
  });

  it("dialling an add-on down changes nothing until a CHANGE quote is confirmed, and previews the impact", async () => {
    renderPlan();
    fireEvent.click(await fewer());
    await screen.findByTestId("impact-preview");
    const quoteCall = calls.find((c) => c.method === "POST" && c.url === "/api/billing/quotes")!;
    expect(quoteCall.body).toMatchObject({ kind: "CHANGE", addons: [{ featureKey: "ai.credits_extra", quantity: 1 }] });
    expect((quoteCall.body as Record<string, unknown>).planKey).toBeUndefined();
    expect(screen.getByTestId("impact-current").textContent).toContain("$29.97");
    expect(screen.getByTestId("impact-proposed").textContent).toContain("$24.98");
    expect(screen.getByTestId("impact-proposed").textContent).toContain("−$4.99/mo");
    expect(screen.getByTestId("impact-removals").textContent).toMatch(/works until .* · no refund/);
    expect(screen.getByTestId("impact-today").textContent).toMatch(/Today: \$0\.00/);
    expect(calls.some((c) => c.url.endsWith("/confirm"))).toBe(false);
  });

  it("confirms with an Idempotency-Key, then offers Undo removal, which deletes the scheduled change", async () => {
    renderPlan();
    fireEvent.click(await fewer());
    const confirm = await screen.findByRole("button", { name: /Confirm change/ });
    fireEvent.click(confirm);
    await waitFor(() => expect(calls.some((c) => c.url === "/api/billing/quotes/902/confirm")).toBe(true));
    const c = calls.find((x) => x.url === "/api/billing/quotes/902/confirm")!;
    expect(c.headers["idempotency-key"]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    const undo = await screen.findByRole("button", { name: "Undo removal" });
    fireEvent.click(undo);
    await waitFor(() => expect(calls.some((x) => x.method === "DELETE" && x.url === "/api/billing/changes/51")).toBe(true));
  });

  it("re-quotes with a notice when the confirm answers QUOTE_STALE", async () => {
    routes["POST /api/billing/quotes/902/confirm"] = () => json({ code: "QUOTE_STALE", reason: "PRICES_CHANGED" }, 409);
    renderPlan();
    fireEvent.click(await fewer());
    fireEvent.click(await screen.findByRole("button", { name: /Confirm change/ }));
    expect(await screen.findByText(/Prices changed/)).toBeTruthy();
    await waitFor(() => expect(calls.filter((c) => c.method === "POST" && c.url === "/api/billing/quotes").length).toBe(2));
  });

  it("locks a row with a scheduled removal and offers Undo on the row", async () => {
    renderPlan({
      ...SUB,
      addons: [{ featureKey: "ai.credits_extra", name: "Extra AI credits", quantity: 2, unitMinor: 499, endsAt: "2026-11-15T00:00:00Z" }],
      pendingChanges: [{ id: 51, kind: "REMOVE", featureKey: "ai.credits_extra", quantityFrom: 2, quantityTo: 0, effectiveAt: "2026-11-15T00:00:00Z", status: "PENDING" }],
    });
    expect(screen.getByText(/Removed on .* works until then · no refund/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Fewer Extra AI credits" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(calls.some((x) => x.method === "DELETE" && x.url === "/api/billing/changes/51")).toBe(true));
  });

  it("explains an interval switch the API cannot do yet instead of failing silently", async () => {
    routes["POST /api/billing/quotes"] = () => json({ code: "PLAN_SWITCH_UNSUPPORTED" }, 422);
    renderPlan();
    await screen.findByRole("tab", { name: "Yearly" });
    fireEvent.click(screen.getByRole("tab", { name: "Yearly" }));
    const alert = await screen.findByTestId("change-problem");
    expect(alert.textContent).toMatch(/isn't available yet/);
    const body = calls.find((c) => c.method === "POST" && c.url === "/api/billing/quotes")!.body as Record<string, unknown>;
    expect(body.interval).toBe("YEAR");
  });

  it("writes the term-end sentence for an interval change from the quote's own fields", async () => {
    routes["POST /api/billing/quotes"] = () =>
      json({
        ...CHANGE_QUOTE,
        interval: "YEAR",
        intervalChange: { from: "MONTH", to: "YEAR", effectiveAt: "period end" },
        removals: [],
        proposed: { ...CHANGE_QUOTE.proposed, recurringMinor: 21589 },
        current: { ...CHANGE_QUOTE.current!, recurringMinor: 1999 },
        deltaMinor: 0,
      });
    renderPlan();
    await screen.findByRole("tab", { name: "Yearly" });
    fireEvent.click(screen.getByRole("tab", { name: "Yearly" }));
    const note = await screen.findByTestId("interval-note");
    expect(note.textContent).toMatch(/you'll pay \$215\.89 once a year instead of \$19\.99 monthly/);
  });

  it("lists the other plans in the switch sheet and previews a switch", async () => {
    const withAutopilot = {
      ...CATALOG,
      plans: [
        ...CATALOG.plans,
        { planKey: "AUTOPILOT", name: "Autopilot", intervals: ["MONTH"] as ("MONTH")[], prices: { MONTH: { amountMinor: 3999 } }, included: [], optional: [] },
      ],
    };
    routes["GET /api/catalog/public"] = () => json(withAutopilot);
    renderPlan();
    fireEvent.click(await screen.findByRole("button", { name: "Switch plan..." }));
    const options = await screen.findByTestId("switch-options");
    expect(within(options).getByText("$39.99/mo")).toBeTruthy();
    fireEvent.click(within(options).getByRole("button", { name: "Preview switch" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url === "/api/billing/quotes" && (c.body as Record<string, unknown>).planKey === "AUTOPILOT")).toBe(true));
    expect(screen.getByTestId("plan-notice").textContent).toMatch(/Extra AI credits.*won't carry over/);
  });
});

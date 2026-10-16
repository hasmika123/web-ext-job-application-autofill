import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ToastProvider } from "@kiwiply/ui";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlanSummary } from "@/lib/admin-plans";
import { DESKTOP, PHONE, fakeList, stubViewport } from "../common/kit-test-utils";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }), usePathname: () => "/admin/pricing/plans", useSearchParams: () => new URLSearchParams() }));

let listFor: () => ReturnType<typeof fakeList<PlanSummary>>;
vi.mock("@/lib/list-query", () => ({ useListQuery: () => listFor() }));

import PlansPage from "./PlansPage";

const row = (over: Partial<PlanSummary>): PlanSummary => ({
  planKey: "PRO",
  name: "Pro",
  audience: "INDIVIDUAL",
  status: "PUBLISHED",
  publicPlan: true,
  liveVersion: { version: 2, effectiveFrom: "2026-10-12T00:00:00Z" },
  draftVersion: null,
  subscribersByVersion: { "1": 212, "2": 1038 },
  pricesByInterval: { MONTH: 1999, QUARTER: 4999 },
  marginWorstBp: 8060,
  successorPlanKey: null,
  ...over,
});

const ROWS: PlanSummary[] = [
  row({ planKey: "FREE", name: "Free", subscribersByVersion: { "1": 4120 }, liveVersion: { version: 1, effectiveFrom: null }, pricesByInterval: {}, marginWorstBp: null }),
  row({}),
  row({ planKey: "PRO_STUDENT", name: "Pro Student", status: "DRAFT", liveVersion: null, draftVersion: 1, subscribersByVersion: {}, pricesByInterval: { MONTH: 1199 } }),
  row({ planKey: "ORG_CONSULTANCY", name: "Org Consultancy", audience: "ORG", status: "SUNSET", subscribersByVersion: { "1": 2 }, liveVersion: { version: 1, effectiveFrom: null } }),
];

const renderPage = () =>
  render(
    <ToastProvider>
      <PlansPage />
    </ToastProvider>,
  );

beforeEach(() => {
  push.mockReset();
  listFor = () => ({ ...fakeList<PlanSummary>({ items: ROWS }), summary: { plans: 4, published: 2, drafts: 1, sunset: 1, oldVersionSubscribers: 212 } });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PlansPage", () => {
  it("lists every plan with its status pill, formatted prices and worst-case margin (desktop)", () => {
    stubViewport(DESKTOP);
    renderPage();
    const table = screen.getByRole("table");
    expect(within(table).getByText("Pro Student")).toBeTruthy();
    expect(within(table).getAllByText("Published").length).toBeGreaterThan(0);
    expect(within(table).getByText("Sunset")).toBeTruthy();
    expect(within(table).getByText("Draft")).toBeTruthy();
    // money is formatted from minor units; nothing is added
    expect(within(table).getAllByText("$19.99").length).toBeGreaterThan(0);
    expect(within(table).getAllByText("80.6 %").length).toBeGreaterThan(0);
    expect(within(table).getByText(/older: v1: 212/)).toBeTruthy();
  });

  it("shows the stat tiles from the list summary, including subscribers on older versions", () => {
    stubViewport(DESKTOP);
    renderPage();
    expect(screen.getByText("On older versions")).toBeTruthy();
    expect(screen.getByText("212")).toBeTruthy();
  });

  it("opens the draft when a plan has one, otherwise the live version", () => {
    stubViewport(DESKTOP);
    renderPage();
    fireEvent.click(within(screen.getByRole("table")).getByText("Pro Student"));
    expect(push).toHaveBeenCalledWith("/admin/pricing/plans/PRO_STUDENT/v/1");
    fireEvent.click(within(screen.getByRole("table")).getByText("Pro"));
    expect(push).toHaveBeenCalledWith("/admin/pricing/plans/PRO/v/2");
  });

  it("keeps Sunset... disabled with its reason on every row", () => {
    stubViewport(DESKTOP);
    renderPage();
    const sunset = screen.getAllByRole("button", { name: "Sunset…" });
    expect(sunset.length).toBeGreaterThanOrEqual(ROWS.length);
    for (const b of sunset) expect((b as HTMLButtonElement).disabled).toBe(true);
  });

  it("renders cards on a phone with one price line", () => {
    stubViewport(PHONE);
    renderPage();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getAllByText("$19.99").length).toBeGreaterThan(0);
  });

  it("asks for the first plan when there are none", () => {
    stubViewport(DESKTOP);
    listFor = () => ({ ...fakeList<PlanSummary>({ items: [] }), summary: { plans: 0, published: 0, drafts: 0, sunset: 0, oldVersionSubscribers: 0 } });
    renderPage();
    expect(screen.getByText("No plans yet")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Create Free first/ }).length).toBeGreaterThan(0);
  });

  it("shows the kit error card with a retry when the list cannot load", () => {
    stubViewport(DESKTOP);
    const l = fakeList<PlanSummary>({ noData: true, error: { status: 502, message: "Couldn't reach the server." } });
    listFor = () => l;
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(l.spies.refetch).toHaveBeenCalled();
  });
});

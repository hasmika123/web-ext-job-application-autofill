import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@kiwiply/ui";
import type { RetirementDetail, RetirementItem } from "@/lib/admin-retirements";
import { DESKTOP, PHONE, fakeList, stubViewport } from "../common/kit-test-utils";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/admin/pricing/retirements/7", useSearchParams: () => new URLSearchParams() }));

let list: ReturnType<typeof fakeList<RetirementItem>>;
vi.mock("@/lib/list-query", () => ({ useListQuery: () => list }));

type Call = { method: string; path: string; body?: Record<string, unknown> };
const calls: Call[] = [];
let respond: (c: Call) => { status?: number; error?: string; data?: unknown };
vi.mock("@/lib/admin-client", async (orig) => {
  const real = await orig<typeof import("@/lib/admin-client")>();
  return {
    ...real,
    adminFetch: vi.fn(async (method: string, path: string, body?: Record<string, unknown>) => {
      const call = { method, path, body };
      calls.push(call);
      const out = respond(call);
      if (out.status && out.status >= 400) return { ok: false, status: out.status, code: null, error: out.error ?? "refused", extra: {} };
      return { ok: true, data: out.data };
    }),
  };
});

import RetirementProgress from "./RetirementProgress";

const DETAIL: RetirementDetail = {
  id: 7,
  planKey: "PRO",
  planName: "Pro",
  planVersion: 1,
  status: "NOTICING",
  mode: "RETIRE_AT_RENEWAL",
  defaultOutcome: "FREE",
  reason: "Pro v1 is replaced",
  startedAt: "2026-10-16T09:00:00Z",
  startedBy: "jk",
  earliestEffectiveAt: "2026-11-15T00:00:00Z",
  latestEffectiveAt: "2027-01-11T00:00:00Z",
  successors: [{ planKey: "PRO_STUDENT", name: "Pro Student", rank: 1 }],
  noticeScheduleDays: [60, 30, 7, 1],
  channels: ["EMAIL", "IN_APP"],
  messageMd: null,
  counts: { pending: 212, switchedNow: 0, switchScheduled: 0, cancelled: 0, fellBack: 0, migrated: 0, excluded: 0 },
  currency: "USD",
  mrrRetainedMinor: 0,
  mrrAtRiskMinor: 423888,
  decisionsOverTime: [],
  canCancel: true,
  canClose: false,
  driftCount: 0,
  hasOrgItems: false,
};

const ROW: RetirementItem = {
  id: 7000,
  login: "priya.nair",
  scope: "PERSONAL",
  orgName: null,
  interval: "MONTH",
  periodEnd: "2026-11-15T00:00:00Z",
  effectiveAt: "2026-11-15T00:00:00Z",
  status: "PENDING",
  successorName: "Pro Student",
  lastNoticeDays: null,
  deltaMinor: -800,
  currency: "USD",
  uses: ["AI tailoring", "Inbox"],
};

const renderIt = (d: RetirementDetail = DETAIL) =>
  render(
    <ToastProvider>
      <RetirementProgress initial={d} />
    </ToastProvider>,
  );

beforeEach(() => {
  calls.length = 0;
  stubViewport(DESKTOP);
  list = fakeList<RetirementItem>({ items: [ROW] });
  respond = () => ({ data: DETAIL });
});
afterEach(() => cleanup());

describe("RetirementProgress (K10.9)", () => {
  it("shows the outcome tiles and the revenue from the detail, formatted from minor units", () => {
    renderIt({ ...DETAIL, counts: { ...DETAIL.counts, pending: 200, switchedNow: 8, switchScheduled: 4 }, mrrRetainedMinor: 23988 });
    expect(screen.getByText("200")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("8 now · 4 scheduled")).toBeTruthy();
    const mrr = within(screen.getByTestId("mrr"));
    expect(mrr.getByText("$239.88")).toBeTruthy();
    expect(mrr.getByText("$4,238.88")).toBeTruthy();
  });

  it("lists the rows with the suggested successor and the change per month", () => {
    renderIt();
    const table = screen.getByRole("table");
    expect(within(table).getByText("priya.nair")).toBeTruthy();
    expect(within(table).getByText("Pro Student")).toBeTruthy();
    expect(within(table).getByText("None yet")).toBeTruthy();
  });

  it("disables Cancel retirement once somebody acted, with the reason, and enables Close only when nothing is pending", () => {
    renderIt({ ...DETAIL, canCancel: false, canClose: false });
    const cancel = screen.getByRole("button", { name: "Cancel retirement…" }) as HTMLButtonElement;
    expect(cancel.disabled).toBe(true);
    expect(cancel.title).toMatch(/no subscriber has acted/);
    expect((screen.getByRole("button", { name: "Close" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("cancels only after the plan key is typed and a reason is given, then re-reads the retirement", async () => {
    respond = (c) => (c.path.endsWith("/cancel") ? { data: { ...DETAIL, status: "CANCELLED" } } : { data: { ...DETAIL, status: "CANCELLED", canCancel: false } });
    renderIt();
    fireEvent.click(screen.getByRole("button", { name: "Cancel retirement…" }));
    const confirm = (await screen.findByRole("button", { name: "Cancel retirement" })) as HTMLButtonElement;
    fireEvent.change(screen.getByPlaceholderText("Why this retirement is being cancelled"), { target: { value: "The successor is not ready yet, pausing" } });
    expect(confirm.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Type PRO to confirm"), { target: { value: "PRO" } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(calls.find((c) => c.path === "/retirements/7/cancel")).toBeTruthy());
    expect(calls.find((c) => c.path === "/retirements/7/cancel")!.body).toEqual({ reason: "The successor is not ready yet, pausing", confirmPlanKey: "PRO" });
    await waitFor(() => expect(calls.some((c) => c.method === "GET" && c.path === "/retirements/7")).toBe(true));
  });

  it("resends a notice and excludes a row with a reason", async () => {
    renderIt();
    fireEvent.click(screen.getByRole("button", { name: /Resend notice/ }));
    await waitFor(() => expect(calls.find((c) => c.path === "/retirements/7/items/7000/resend")).toBeTruthy());
    expect(list.spies.refetch).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Exclude…" }));
    fireEvent.change(await screen.findByPlaceholderText("Why this subscriber is excluded"), { target: { value: "Enterprise contract, handled by sales" } });
    fireEvent.click(screen.getByRole("button", { name: "Exclude" }));
    await waitFor(() => expect(calls.find((c) => c.path === "/retirements/7/items/7000/exclude")).toBeTruthy());
  });

  it("links the personal rows to the admin account page and renders cards on a phone", () => {
    renderIt();
    expect(screen.getByRole("link", { name: /Open subscriber/ }).getAttribute("href")).toBe("/admin/users/priya.nair");
    cleanup();
    stubViewport(PHONE);
    renderIt();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getAllByText("priya.nair").length).toBeGreaterThan(0);
  });
});

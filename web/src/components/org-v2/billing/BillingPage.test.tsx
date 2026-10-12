import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ToastProvider } from "@kiwiply/ui";
import type { CurrentOrg, OrgBilling, OrgStatus } from "@/lib/org-types";

/** E2E-O4.0: the billing page has three honest states and not one invented number. */

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }), usePathname: () => "/org/billing" }));
vi.mock("../shell/OrgPageHero", () => ({ default: ({ title }: { title: string }) => <h1>{title}</h1> }));

import BillingPage from "./BillingPage";
import { OrgProvider } from "../shell/OrgContext";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  refresh.mockReset();
});

function current(status: OrgStatus): CurrentOrg {
  return {
    org: { id: 7, slug: "acme", name: "Acme Bootcamp", type: "BOOTCAMP", status, website: null, sizeBand: null, country: null, timezone: "UTC", billingEmail: null, settings: null, createdAt: null, closedAt: null },
    role: "OWNER",
    permissions: ["billing.view", "billing.manage"],
    memberCount: 1,
  };
}

const billing = (over: Partial<OrgBilling> = {}): OrgBilling => ({ status: "DRAFT", billingEnabled: false, devActivation: true, subscription: null, items: [], invoices: [], ...over });

function mount(initial: OrgBilling | null, status: OrgStatus = initial?.status ?? "DRAFT") {
  return render(
    <ToastProvider>
      <OrgProvider current={current(status)} orgs={[]}>
        <BillingPage initial={initial} />
      </OrgProvider>
    </ToastProvider>,
  );
}

describe("BillingPage", () => {
  it("billing off, draft, owner: the real status, 'not connected', and the dev activation that calls the API and refreshes", async () => {
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async (url) => (url.endsWith("/activate") ? new Response("{}", { status: 200 }) : new Response(JSON.stringify(billing({ status: "ACTIVE", devActivation: false })), { status: 200 })));
    vi.stubGlobal("fetch", fetchMock);
    mount(billing());
    expect(screen.getByText("Your workspace is a draft")).toBeTruthy();
    expect(screen.getByText("Billing isn't connected in this environment")).toBeTruthy();
    expect(screen.getByText("Acme Bootcamp · Bootcamp")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Activate workspace (dev)" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/orgs/7/activate");
    expect(fetchMock.mock.calls[0]![1]?.method).toBe("POST");
    expect(await screen.findByText("Your workspace is active")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Activate workspace (dev)" })).toBeNull();
  });

  it("billing off, draft, someone who is not the owner: no button, an honest line", () => {
    mount(billing({ devActivation: false }));
    expect(screen.queryByRole("button", { name: /Activate/ })).toBeNull();
    expect(screen.getByText("The workspace owner can activate it.")).toBeTruthy();
  });

  it("billing connected but the workspace unpaid: a 'Set up billing' call to action", () => {
    mount(billing({ billingEnabled: true, devActivation: false }));
    expect(screen.getByRole("heading", { name: "Set up billing" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Set up billing" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText("Billing isn't connected in this environment")).toBeNull();
  });

  it("active with billing off: still says billing is not connected, and shows no plan, seats, card or invoice", () => {
    mount(billing({ status: "ACTIVE", devActivation: false }));
    expect(screen.getByText("Your workspace is active")).toBeTruthy();
    expect(screen.getByText("Billing isn't connected in this environment")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Enterprise|4242|INV-|\/ 100/);
  });

  it("a failed activation says so and leaves the page alone", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
    mount(billing());
    fireEvent.click(screen.getByRole("button", { name: "Activate workspace (dev)" }));
    expect(await screen.findByText("Couldn't activate the workspace")).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("a demo account's refusal is the demo line, not a generic failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ code: "DEMO_READ_ONLY" }), { status: 403 })));
    mount(billing());
    fireEvent.click(screen.getByRole("button", { name: "Activate workspace (dev)" }));
    expect(await screen.findByText("This is a demo account - changes aren't saved")).toBeTruthy();
  });

  it("when the first load failed it offers Retry and shows the page once it works", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(billing({ status: "ACTIVE", devActivation: false })), { status: 200 })));
    mount(null, "ACTIVE");
    expect(screen.getByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Your workspace is active")).toBeTruthy();
  });
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/extension-signal", () => ({ notifyExtension: vi.fn() }));

import type { DemoInfo } from "@/lib/demo";
import DemoSideTab from "./DemoSideTab";

const JOB_SEEKER = { login: "demo", label: "Job seeker", description: "A ready-made job search.", landing: "/dashboard" };
const APP_ADMIN = { login: "demo-admin", label: "App admin", description: "Kiwiply's own admin console.", landing: "/admin" };
// An API that still listed the retired organization account must not make the panel draw it.
const LEGACY_ORG = { login: "demo-org", label: "Organization admin", description: "people, boards and reports", landing: "/org" };

const adminOn: DemoInfo = { enabled: true, accounts: [JOB_SEEKER, APP_ADMIN], tenantDemo: null };
const adminOff: DemoInfo = { enabled: true, accounts: [JOB_SEEKER], tenantDemo: null };

beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
  vi.restoreAllMocks();
});
afterEach(cleanup);

function openPanel() {
  fireEvent.click(screen.getByRole("button", { name: "Demo accounts" }));
}

describe("DemoSideTab cards", () => {
  it("renders nothing while the demo is off", () => {
    expect(render(<DemoSideTab demo={{ enabled: false, accounts: [] }} />).container.innerHTML).toBe("");
  });

  it("offers Job seeker and App admin when the admin demo is on, and no organization card", () => {
    render(<DemoSideTab demo={adminOn} />);
    openPanel();
    expect(screen.getByText("Job seeker")).toBeTruthy();
    expect(screen.getByText("App admin")).toBeTruthy();
    expect(screen.queryByText(/organization admin/i)).toBeNull();
    expect(screen.queryByText(/people, boards and reports/i)).toBeNull();
  });

  it("hides the App admin card when the server does not list it (admin demo off)", () => {
    render(<DemoSideTab demo={adminOff} />);
    openPanel();
    expect(screen.getByText("Job seeker")).toBeTruthy();
    expect(screen.queryByText("App admin")).toBeNull();
  });

  it("never draws the retired demo-org account, even if the API lists it", () => {
    render(<DemoSideTab demo={{ enabled: true, accounts: [JOB_SEEKER, LEGACY_ORG], tenantDemo: null }} />);
    openPanel();
    expect(screen.getByText("Job seeker")).toBeTruthy();
    expect(screen.queryByText(/organization admin/i)).toBeNull();
    expect(screen.getAllByRole("button", { name: /open demo/i })).toHaveLength(1);
  });

  it("asks the BFF once when it is not given the info, then shows what the server offers", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(adminOn), { status: 200 }));
    render(<DemoSideTab />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Demo accounts" })).toBeTruthy());
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/demo");
    openPanel();
    expect(screen.getByText("App admin")).toBeTruthy();
  });
});

describe("DemoSideTab sign-in", () => {
  it("opens the App admin demo through the BFF and lands on /admin", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: true, landing: "/admin" }), { status: 200 }));
    render(<DemoSideTab demo={adminOn} />);
    openPanel();
    const buttons = screen.getAllByRole("button", { name: /open demo/i });
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[1]); // Job seeker first, App admin second
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin"));
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/auth/demo");
    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toEqual({ login: "demo-admin" });
  });

  it("shows the server's refusal and does not navigate", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: "The demo isn't available right now." }), { status: 403 }));
    render(<DemoSideTab demo={adminOn} />);
    openPanel();
    fireEvent.click(screen.getAllByRole("button", { name: /open demo/i })[1]);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("available right now"));
    expect(push).not.toHaveBeenCalled();
  });
});

describe("DemoSideTab demo company link", () => {
  const withTenant: DemoInfo = { ...adminOn, tenantDemo: { host: "acme.localhost", name: "Acme Staffing" } };

  it("links to the demo company's sign-in on its own host, never signing in from here", () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    render(<DemoSideTab demo={withTenant} />);
    openPanel();
    expect(screen.getByText("Organizations: try a demo company")).toBeTruthy();
    const link = screen.getByRole("link", { name: /acme staffing/i }) as HTMLAnchorElement;
    // jsdom's location is http://localhost:3000: the same port, on the tenant's loopback host
    expect(link.getAttribute("href")).toBe("http://acme.localhost:3000/login");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows no company link when the server names none", () => {
    render(<DemoSideTab demo={adminOn} />);
    openPanel();
    expect(screen.queryByText(/try a demo company/i)).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });
});

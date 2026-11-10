// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

import { parseTenantDemo, roleLine, statusNote, type TenantDemoInfo } from "@/lib/ent/demo";
import TenantDemoTab from "./TenantDemoTab";

const INFO: TenantDemoInfo = {
  enabled: true,
  org: "Acme Staffing",
  accounts: [
    { login: "demo-ent-acme-sarah", name: "Sarah Chen", primaryRole: "Organization Admin", roles: ["Organization Admin", "Marketing Manager"], status: "ACTIVE", canSignIn: true },
    { login: "demo-ent-acme-anika", name: "Anika Rao", primaryRole: "Consultant", roles: ["Consultant"], status: "ACTIVE", canSignIn: true },
    { login: "demo-ent-acme-sam", name: "Sam Whitfield", primaryRole: "Consultant", roles: ["Consultant"], status: "SUSPENDED", canSignIn: false },
    { login: null, name: "Nina Vogel", primaryRole: "Consultant", roles: ["Consultant"], status: "INVITED", canSignIn: false },
  ],
};

beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
  vi.restoreAllMocks();
});
afterEach(cleanup);

describe("TenantDemoTab gating (config-only)", () => {
  it("renders nothing when the API says the demo is off", () => {
    const { container } = render(<TenantDemoTab demo={{ enabled: false, accounts: [] }} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing for an enabled answer with no members, and for no answer at all", () => {
    expect(render(<TenantDemoTab demo={{ enabled: true, accounts: [] }} />).container.innerHTML).toBe("");
    cleanup();
    expect(render(<TenantDemoTab demo={null} />).container.innerHTML).toBe("");
  });

  it("asks the BFF once when it is not given the list, and stays hidden when that answers off", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ enabled: false, accounts: [] }), { status: 200 }));
    const { container } = render(<TenantDemoTab />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/ent/demo");
    expect(container.innerHTML).toBe("");
  });

  it("shows the tab when the BFF answers with members", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(INFO), { status: 200 }));
    render(<TenantDemoTab />);
    expect(await screen.findByRole("button", { name: /Demo accounts/ })).toBeTruthy();
  });
});

describe("TenantDemoTab list", () => {
  it("lists every member with all of their role labels, themed by brand variables only", () => {
    const { container } = render(<TenantDemoTab demo={INFO} />);
    fireEvent.click(screen.getByRole("button", { name: /Demo accounts/ }));
    expect(screen.getByText("Sarah Chen")).toBeTruthy();
    expect(screen.getByText("Organization Admin + Marketing Manager")).toBeTruthy();
    expect(screen.getByText("Anika Rao")).toBeTruthy();
    expect(screen.getByText(/Acme Staffing: pick a person/)).toBeTruthy();
    const html = container.innerHTML;
    expect(html).toContain("var(--brand-solid)");
    expect(html).not.toMatch(/#[0-9a-f]{6}/i); // no literal colour: it is the tenant's, never ours
  });

  it("lists a suspended and an invited member but offers no sign-in for them", () => {
    render(<TenantDemoTab demo={INFO} />);
    fireEvent.click(screen.getByRole("button", { name: /Demo accounts/ }));
    expect(screen.getByText("Access paused - can't sign in")).toBeTruthy();
    expect(screen.getByText("Invitation pending - no account yet")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Sign in as Sam Whitfield" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Sign in as Nina Vogel" })).toBeNull();
    expect(screen.getAllByRole("button", { name: /^Sign in as / })).toHaveLength(2);
  });
});

describe("TenantDemoTab one-click sign-in", () => {
  it("posts the login to the tenant demo route and lands on the member's workspace", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: true, landing: "/" }), { status: 200 }));
    render(<TenantDemoTab demo={INFO} />);
    fireEvent.click(screen.getByRole("button", { name: /Demo accounts/ }));
    fireEvent.click(screen.getByRole("button", { name: "Sign in as Sarah Chen" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("/api/auth/tenant-demo");
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ login: "demo-ent-acme-sarah" });
    expect(refresh).toHaveBeenCalled();
  });

  it("shows the refusal and stays on the page when the sign-in fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: "You're not a member of this workspace.", code: "NOT_A_MEMBER" }), { status: 403 }));
    render(<TenantDemoTab demo={INFO} />);
    fireEvent.click(screen.getByRole("button", { name: /Demo accounts/ }));
    fireEvent.click(screen.getByRole("button", { name: "Sign in as Anika Rao" }));
    expect((await screen.findByRole("alert")).textContent).toContain("not a member");
    expect(push).not.toHaveBeenCalled();
  });

  it("closes on Escape", () => {
    render(<TenantDemoTab demo={INFO} />);
    fireEvent.click(screen.getByRole("button", { name: /Demo accounts/ }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("dialog", { hidden: true }).className).toContain("invisible");
  });
});

describe("lib/ent/demo", () => {
  it("parses the API body and reads anything else as off", () => {
    const ok = parseTenantDemo({ enabled: true, org: "Acme Staffing", accounts: [{ login: "demo-ent-acme-sarah", name: "Sarah Chen", roles: ["Organization Admin"], status: "ACTIVE", canSignIn: true }] });
    expect(ok.enabled).toBe(true);
    expect(ok.accounts[0].primaryRole).toBe("Organization Admin");
    expect(parseTenantDemo({ enabled: false, accounts: [] }).enabled).toBe(false);
    expect(parseTenantDemo({ enabled: true })).toEqual({ enabled: false, org: null, accounts: [] });
    expect(parseTenantDemo("nope").enabled).toBe(false);
    expect(parseTenantDemo({ enabled: true, accounts: [{ name: 5 }] }).enabled).toBe(false);
  });

  it("never lets a member without a login be signed in, whatever canSignIn says", () => {
    const parsed = parseTenantDemo({ enabled: true, accounts: [{ login: null, name: "Nina", roles: [], status: "INVITED", canSignIn: true }] });
    expect(parsed.accounts[0].canSignIn).toBe(false);
  });

  it("formats role lines and status notes", () => {
    expect(roleLine({ roles: ["A", "B"], primaryRole: "A" })).toBe("A + B");
    expect(roleLine({ roles: [], primaryRole: "A" })).toBe("A");
    expect(statusNote({ status: "ACTIVE" })).toBeNull();
  });
});

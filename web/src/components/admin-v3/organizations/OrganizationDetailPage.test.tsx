import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@kiwiply/ui";
import { DESKTOP, PHONE, stubViewport } from "../common/kit-test-utils";
import OrganizationDetailPage from "./OrganizationDetailPage";
import type { OrgDetail } from "@/lib/admin-orgs";

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

const detail = (over: Partial<OrgDetail> = {}): OrgDetail => ({
  id: 7,
  name: "Acme Staffing",
  displayName: "Acme Staffing",
  slug: "acme",
  type: "STAFFING",
  status: "ACTIVE",
  sizeBand: null,
  country: null,
  subdomain: "acme",
  subdomainEnabled: true,
  configVersion: 3,
  createdAt: "2026-10-01T10:00:00Z",
  memberCount: 4,
  pendingInvites: 2,
  baseDomain: "kiwiply.com",
  enterprise: { on: false, allowListed: false, denied: false, masterOn: false },
  modules: [{ key: "roles", label: "Roles and permissions", on: false, allowListed: false }],
  hostnames: [{ id: 11, hostname: "acme.kiwiply.com", kind: "SUBDOMAIN", status: "ACTIVE", primary: true, certState: "NONE", activatedAt: "2026-10-01T10:00:00Z", suspendedAt: null, createdAt: "2026-10-01T10:00:00Z" }],
  audit: [{ id: 1, action: "ADMIN_SUBDOMAIN_PROVISION", actorLogin: "admin", risk: "HIGH", details: "host=acme.kiwiply.com", createdAt: "2026-10-01T10:00:00Z" }],
  ...over,
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const calls = () => (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => [String(c[0]).replace("/api/admin", ""), (c[1] as RequestInit | undefined)?.method ?? "GET", (c[1] as RequestInit | undefined)?.body ? JSON.parse((c[1] as RequestInit).body as string) : undefined]);

beforeEach(() => stubViewport(DESKTOP));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

async function typeReason(reason: string) {
  fireEvent.change(await screen.findByLabelText("Reason (required)"), { target: { value: reason } });
}

describe("OrganizationDetailPage", () => {
  it("shows counts and hostnames, never member data", () => {
    show(<OrganizationDetailPage initial={detail()} id={7} />);
    expect(screen.getByRole("heading", { name: "Acme Staffing" })).toBeTruthy();
    expect(screen.getByText("Pending invites")).toBeTruthy();
    expect(screen.getByText("acme.kiwiply.com")).toBeTruthy();
    expect(screen.getByRole("switch", { name: /Enterprise for Acme Staffing/ }).getAttribute("aria-checked")).toBe("false");
  });

  it("the enterprise switch asks for a reason, then posts it and shows the refreshed state", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(detail({ enterprise: { on: true, allowListed: true, denied: false, masterOn: true } })));
    vi.stubGlobal("fetch", fetchMock);
    show(<OrganizationDetailPage initial={detail()} id={7} />);
    fireEvent.click(screen.getByRole("switch", { name: /Enterprise for Acme Staffing/ }));
    const confirm = await screen.findByRole("button", { name: "Turn on" });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    await typeReason("Order form signed");
    fireEvent.click(confirm);
    await waitFor(() => expect(screen.getByRole("switch", { name: /Enterprise for Acme Staffing/ }).getAttribute("aria-checked")).toBe("true"));
    expect(calls()).toEqual([["/orgs/7/enterprise", "POST", { on: true, reason: "Order form signed" }]]);
  });

  it("a module switch asks for a reason and posts the module key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(detail({ modules: [{ key: "roles", label: "Roles and permissions", on: true, allowListed: true }] })));
    vi.stubGlobal("fetch", fetchMock);
    show(<OrganizationDetailPage initial={detail()} id={7} />);
    fireEvent.click(screen.getByRole("switch", { name: /Roles and permissions for Acme Staffing/ }));
    await typeReason("Part of the pilot scope");
    fireEvent.click(await screen.findByRole("button", { name: "Turn on" }));
    await waitFor(() => expect(screen.getByRole("switch", { name: /Roles and permissions for Acme Staffing/ }).getAttribute("aria-checked")).toBe("true"));
    expect(calls()).toEqual([["/orgs/7/modules", "POST", { key: "roles", on: true, reason: "Part of the pilot scope" }]]);
  });

  it("suspends a hostname with a reason and offers Resume afterwards", async () => {
    const suspended = detail({ hostnames: [{ ...detail().hostnames[0], status: "SUSPENDED", suspendedAt: "2026-10-02T10:00:00Z" }] });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(suspended)));
    show(<OrganizationDetailPage initial={detail()} id={7} />);
    fireEvent.click(screen.getByRole("button", { name: "Suspend" }));
    await typeReason("Payment dispute under review");
    fireEvent.click(await screen.findByRole("button", { name: "Suspend", hidden: false, description: undefined }).catch(() => screen.getAllByRole("button", { name: "Suspend" })[1]));
    expect(await screen.findByRole("button", { name: "Resume" })).toBeTruthy();
    expect(calls()[0]).toEqual(["/orgs/7/hostnames/11/suspend", "POST", { reason: "Payment dispute under review" }]);
  });

  it("provision: the live check refuses a reserved label and offers a suggestion for a taken one", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("label=api")) return json({ label: "api", valid: false, reserved: true, taken: false, suggestion: "api-2", host: "api.kiwiply.com" });
      if (url.includes("label=beta")) return json({ label: "beta", valid: false, reserved: false, taken: true, suggestion: "beta-2", host: "beta.kiwiply.com" });
      return json({ label: "acme-corp", valid: true, reserved: false, taken: false, suggestion: null, host: "acme-corp.kiwiply.com" });
    });
    vi.stubGlobal("fetch", fetchMock);
    show(<OrganizationDetailPage initial={detail({ subdomain: null, hostnames: [] })} id={7} />);
    fireEvent.click(screen.getByRole("button", { name: "Provision subdomain" }));
    const dialog = await screen.findByRole("dialog");
    const input = within(dialog).getByLabelText("Address");
    const submit = within(dialog).getByRole("button", { name: "Provision" }) as HTMLButtonElement;
    fireEvent.change(input, { target: { value: "api" } });
    expect((await within(dialog).findByText(/reserved for Kiwiply/)).textContent).toMatch(/api/);
    expect(submit.disabled).toBe(true);
    fireEvent.change(input, { target: { value: "beta" } });
    expect(await within(dialog).findByText(/already taken/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Use beta-2" }));
    expect((input as HTMLInputElement).value).toBe("beta-2");
    fireEvent.change(input, { target: { value: "acme-corp" } });
    expect(await within(dialog).findByText(/acme-corp.kiwiply.com is available/)).toBeTruthy();
    await waitFor(() => expect(submit.disabled).toBe(false));
  });

  it("reset owner password shows the new password once and not again", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn() } });
    const secret = "Zq7!hTn4-Wm2+Rp9"; // test value
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => (String(input).includes("reset-password") ? json({ ownerEmail: "olivia@example.test", tempPassword: secret, tempPasswordExpiresAt: "2026-10-21T10:00:00Z" }) : json(detail()))),
    );
    show(<OrganizationDetailPage initial={detail()} id={7} />);
    fireEvent.click(screen.getByRole("button", { name: /Reset owner password/ }));
    await typeReason("Owner lost the first password");
    fireEvent.click(screen.getByRole("button", { name: "Reset password" }));
    const field = (await screen.findByTestId("temp-password")) as HTMLInputElement;
    expect(field.value).toBe(secret);
    fireEvent.click(screen.getByRole("button", { name: "I have copied it" }));
    await waitFor(() => expect(screen.queryByTestId("temp-password")).toBeNull());
    expect(document.body.textContent).not.toContain(secret);
  });

  it("works on a phone and shows the load error with Try again when there is no organization", async () => {
    stubViewport(PHONE);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: "Couldn't load." }, 500)));
    show(<OrganizationDetailPage initial={null} id={7} />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Couldn't load.")).toBeTruthy();
  });
});

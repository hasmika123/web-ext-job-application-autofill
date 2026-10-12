import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ToastProvider } from "@kiwiply/ui";
import { ROLE_PERMISSIONS } from "../../../../scripts/mock-orgs.mjs";
import type { CurrentOrg, OrgMine, OrgRole } from "@/lib/org-types";

/**
 * O1.7: the shell shows each role only its pages (APP-E2E-PLAN / tenant-model.md section 8), the org chip is the switcher
 * (a bottom sheet on a phone, a menu from md up), the role label is the real one, and a path outside the role is not rendered.
 */

const refresh = vi.fn();
const push = vi.fn();
let pathname = "/org";
vi.mock("next/navigation", () => ({ usePathname: () => pathname, useRouter: () => ({ refresh, push }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));
vi.mock("next/image", () => ({ default: (p: { alt: string }) => <span role="img" aria-label={p.alt} /> }));
vi.mock("@/components/marketing/BrandLogo", () => ({ default: () => <span>Kiwiply logo</span> }));
vi.mock("@/components/app-shell/NotificationBell", () => ({ default: () => <button type="button" aria-label="Notifications">bell</button> }));
vi.mock("@/lib/extension-signal", () => ({ notifyExtension: vi.fn() }));
vi.mock("@/components/demo/DemoSideTab", () => ({ default: () => null }));

import OrgShell from "./OrgShell";

const roles = ROLE_PERMISSIONS as Record<string, string[]>;

function current(role: OrgRole, over: Partial<CurrentOrg["org"]> = {}): CurrentOrg {
  return {
    org: { id: 7, slug: "acme", name: "Acme Bootcamp", type: "BOOTCAMP", status: "ACTIVE", website: null, sizeBand: null, country: null, timezone: "UTC", billingEmail: null, settings: null, createdAt: null, closedAt: null, ...over },
    role,
    permissions: roles[role],
    memberCount: 3,
  };
}

const mine = (...rows: Array<[number, string, OrgRole]>): OrgMine[] => rows.map(([orgId, name, role]) => ({ orgId, slug: name.toLowerCase(), name, role, status: "ACTIVE", memberCount: 2 }));

function mount(role: OrgRole, orgs: OrgMine[] = mine([7, "Acme Bootcamp", role]), account = { login: "sam", firstName: "Sam", lastName: "Rivera" }) {
  return render(
    <ToastProvider>
      <OrgShell account={account as never} current={current(role)} orgs={orgs}>
        <p>the page</p>
      </OrgShell>
    </ToastProvider>,
  );
}

const navLabels = () => within(screen.getByRole("navigation", { name: "Organization" })).getAllByRole("link").map((a) => a.textContent);

function setViewport(desktop: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: desktop && query.includes("min-width"), media: query, addEventListener: () => {}, removeEventListener: () => {} }));
}

beforeEach(() => {
  pathname = "/org";
  setViewport(false);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  refresh.mockReset();
  push.mockReset();
});

describe("role-aware nav", () => {
  const ALL = ["Dashboard", "Team Management", "Job Opportunities", "Applications", "Interviews", "Analytics & Reports", "AI Resume Support", "Integrations", "Billing & Subscription", "Settings"];

  it("an owner and an admin see all ten pages", () => {
    mount("OWNER");
    expect(navLabels()).toEqual(ALL);
    cleanup();
    mount("ADMIN");
    expect(navLabels()).toEqual(ALL);
  });

  it("a support owner sees Dashboard, Team, Applications, Interviews and Resumes", () => {
    mount("STAFF");
    expect(navLabels()).toEqual(["Dashboard", "Team Management", "Applications", "Interviews", "AI Resume Support"]);
  });

  it("finance sees Dashboard, Analytics and Billing", () => {
    mount("FINANCE");
    expect(navLabels()).toEqual(["Dashboard", "Analytics & Reports", "Billing & Subscription"]);
  });

  it("a marketer sees the people pages and the job bank, never money or settings", () => {
    mount("MARKETER");
    expect(navLabels()).toEqual(["Dashboard", "Team Management", "Job Opportunities", "Applications", "Interviews", "AI Resume Support"]);
  });

  it("marks the page you are on", () => {
    pathname = "/org/team";
    mount("OWNER");
    expect(screen.getByRole("link", { name: "Team Management" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Dashboard" }).getAttribute("aria-current")).toBeNull();
  });

  it("shows the real role under the name", () => {
    mount("STAFF");
    expect(screen.getByText("Support owner")).toBeTruthy();
  });

  it("a page outside the role is replaced by a calm explanation, not rendered", () => {
    pathname = "/org/billing";
    mount("STAFF");
    expect(screen.queryByText("the page")).toBeNull();
    expect(screen.getByText("That page isn't part of your role")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to the dashboard" }).getAttribute("href")).toBe("/org");
  });

  it("a page inside the role renders", () => {
    pathname = "/org/applications";
    mount("STAFF");
    expect(screen.getByText("the page")).toBeTruthy();
  });
});

describe("the chip is the switcher", () => {
  const two = mine([7, "Acme Bootcamp", "OWNER"], [9, "Zephyr Academy", "ADMIN"]);

  it("shows the real org name, not a sample", () => {
    mount("OWNER", two);
    expect(screen.getAllByText("Acme Bootcamp").length).toBeGreaterThan(0);
    expect(screen.queryByText("Acme Corp")).toBeNull();
  });

  it("on a phone opens a bottom sheet of 44px+ rows; picking one sets the cookie and refreshes", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    mount("OWNER", two);
    fireEvent.click(screen.getByRole("button", { name: /Switch organization/ }));
    const sheet = await screen.findByRole("dialog", { name: "Your organizations" });
    const rows = within(sheet).getAllByRole("button").filter((b) => /Zephyr|Acme|Create a workspace/.test(b.textContent ?? ""));
    expect(rows.length).toBe(3);
    for (const row of rows) expect(row.className).toMatch(/min-h-14/); // 56 px, above the 44 px floor
    expect(within(sheet).getByText("Admin · Active")).toBeTruthy();

    fireEvent.click(within(sheet).getByText("Zephyr Academy"));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/orgs/current");
    expect(JSON.parse(String(init.body))).toEqual({ orgId: 9 });
  });

  it("Escape closes the sheet and picking the open org changes nothing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    mount("OWNER", two);
    fireEvent.click(screen.getByRole("button", { name: /Switch organization/ }));
    const sheet = await screen.findByRole("dialog", { name: "Your organizations" });
    fireEvent.click(within(sheet).getAllByText("Acme Bootcamp")[0]);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Your organizations" })).toBeNull());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Switch organization/ }));
    await screen.findByRole("dialog", { name: "Your organizations" });
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Your organizations" })).toBeNull());
  });

  it("a failed switch says so and does not refresh", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
    mount("OWNER", two);
    fireEvent.click(screen.getByRole("button", { name: /Switch organization/ }));
    const sheet = await screen.findByRole("dialog", { name: "Your organizations" });
    fireEvent.click(within(sheet).getByText("Zephyr Academy"));
    expect(await screen.findByText("Couldn't switch workspace")).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("from md up it is a menu", async () => {
    setViewport(true);
    mount("OWNER", two);
    fireEvent.click(screen.getByRole("button", { name: /Switch organization/ }));
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByText("Zephyr Academy")).toBeTruthy();
    expect(within(menu).getByText("Create a workspace")).toBeTruthy();
  });
});

// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ push: vi.fn(), pathname: "/w/admin", search: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, refresh: vi.fn() }),
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
}));

import { ToastProvider } from "@kiwiply/ui";
import { MOCK_TENANTS } from "../../../../scripts/mock-tenants.mjs";
import { meTenantFor as untyped } from "../../../../scripts/mock-me-tenant.mjs";
import { parseMeTenant } from "@/lib/ent/tenant-session-core";
import type { MeTenant } from "@/lib/ent/workspaces";
import EnterpriseShell from "./EnterpriseShell";
import PageHeader from "./ShellContext";
import { ComingSoon, NotYourRole } from "./ShellStates";

const meTenantFor = untyped as (host: string, login: string) => { body: unknown; etag: string } | null;
const sessionOf = (host: string, login: string) => {
  const a = meTenantFor(host, login)!;
  return { me: parseMeTenant(a.body)!, etag: a.etag };
};

/** matchMedia: `phone` makes (max-width: 767px) true; `wide` makes (min-width: 1024px) true. */
function viewport({ phone = false, wide = true }: { phone?: boolean; wide?: boolean }) {
  window.matchMedia = ((query: string) => ({
    matches: query.includes("max-width: 767px") ? phone : query.includes("min-width: 1024px") ? wide : false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    onchange: null,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

const acme = MOCK_TENANTS["acme.localhost"] as unknown as { displayName: string; branding: { logoUrl?: string | null; supportEmail?: string | null } };

function mount(login: string, opts: { host?: string; slug?: string; children?: React.ReactNode; edit?: (me: MeTenant) => MeTenant } = {}) {
  const host = opts.host ?? "acme.localhost";
  const s = sessionOf(host, login);
  const me = opts.edit ? opts.edit(s.me) : s.me;
  const workspace = me.workspaces.find((w) => w.key === (opts.slug ?? me.workspaces[0].key))!;
  return render(
    <ToastProvider>
      <EnterpriseShell me={me} etag={s.etag} workspace={workspace} tenant={{ displayName: me.org.displayName, logoUrl: acme.branding.logoUrl, supportEmail: acme.branding.supportEmail }}>
        {opts.children ?? <p>page body</p>}
      </EnterpriseShell>
    </ToastProvider>,
  );
}

beforeEach(() => {
  nav.push.mockReset();
  nav.pathname = "/w/admin";
  nav.search = "";
  viewport({});
  // the access check must not hit the network in these tests: an unreachable API is "not changed"
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 503 })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe("EnterpriseShell: the frame (16 s2.1)", () => {
  it("owner: a viewport-tall sticky sidebar that scrolls by itself, the org logo from the host's branding, the board's menu", () => {
    const { container } = mount("owner@acme.com");
    const aside = container.querySelector("[data-shell-sidebar]")!;
    expect(aside.className).toContain("sticky");
    expect(aside.className).toContain("h-dvh");
    expect(container.querySelector("[data-shell-scroll]")!.className).toContain("overflow-y-auto");
    expect(container.querySelector("[data-shell-sidebar] [data-tenant-logo=\"image\"] img")?.getAttribute("src")).toContain("/tenant-assets/logo");
    const labels = Array.from(aside.querySelectorAll("[data-nav-item]")).map((a) => a.textContent?.trim());
    expect(labels.slice(0, 6)).toEqual(["Dashboard", "Employees", "Invitations", "Teams", "Departments", "Roles & Permissions"]);
    expect(labels).toContain("Organization Branding");
  });

  it("highlights the active item with aria-current and leaves the others plain", () => {
    nav.pathname = "/w/admin/roles";
    const { container } = mount("owner@acme.com");
    const current = container.querySelectorAll("[data-shell-sidebar] [aria-current=\"page\"]");
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toContain("Roles & Permissions");
  });

  it("landmarks and the skip link: header, nav, main, a skip link to #main-content", () => {
    const { container } = mount("owner@acme.com");
    expect(screen.getByText("Skip to content").getAttribute("href")).toBe("#main-content");
    expect(container.querySelector("main#main-content")).toBeTruthy();
    expect(screen.getAllByRole("navigation", { hidden: true }).length).toBeGreaterThanOrEqual(2);
    expect(container.querySelector("aside[aria-label=\"Sidebar\"]")).toBeTruthy();
  });

  it("shows the page's own title and subtitle in the top bar, the menu label until it mounts", () => {
    nav.pathname = "/w/admin/teams";
    const { container } = mount("owner@acme.com");
    expect(container.querySelector("[data-page-header] h1")!.textContent).toBe("Teams");
    cleanup();
    mount("owner@acme.com", { children: <PageHeader title="Organization Dashboard" subtitle="Welcome back! Here's what's happening at Acme today." /> });
    expect(screen.getAllByText("Organization Dashboard").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Welcome back! Here's what's happening at Acme today.").length).toBeGreaterThan(0);
  });

  it("the global search is honest: board placeholder, results only from pages the member can open, and it says so", () => {
    const { container } = mount("owner@acme.com");
    const box = container.querySelector<HTMLInputElement>("[data-shell-search] input")!;
    expect(box.placeholder).toBe("Search people, applications, jobs, clients, and more...");
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: "bill" } });
    const opts = screen.getAllByRole("option");
    expect(opts.map((o) => o.textContent)).toEqual([expect.stringContaining("Billing")]);
    expect(container.querySelector("[data-search-note]")!.textContent).toContain("Showing pages you can open");
    fireEvent.keyDown(box, { key: "Enter" });
    expect(nav.push).toHaveBeenCalledWith("/w/admin/billing");
  });

  it("the Need help card carries the bee and opens a help panel that says there is no assistant yet", () => {
    const { container } = mount("owner@acme.com");
    const card = container.querySelector("[data-help-card]")!;
    expect(within(card as HTMLElement).getByText("Need help, Olivia?")).toBeTruthy();
    expect(card.querySelector("[data-mascot-pose]")).toBeTruthy();
    fireEvent.click(within(card as HTMLElement).getByText("Ask a question..."));
    expect(screen.getByRole("dialog").textContent).toContain("isn't switched on yet");
    expect(screen.getByRole("dialog").querySelector('a[href="mailto:it@acme.com"]')).toBeTruthy();
  });

  it("drops the card's bee when the page shows its own (one mascot per view)", () => {
    const { container } = mount("owner@acme.com", { children: <ComingSoon title="Jobs" /> });
    expect(container.querySelector("[data-help-card] [data-mascot-pose]")).toBeNull();
    expect(container.querySelectorAll("[data-mascot-pose]")).toHaveLength(1);
  });

  it("user menu: avatar, name and role, then My profile first; Sign out last", () => {
    const { container } = mount("owner@acme.com");
    const trigger = container.querySelector<HTMLElement>("[data-account-menu]")!;
    expect(trigger.textContent).toContain("Olivia Owner");
    fireEvent.click(trigger);
    const items = screen.getAllByRole("menuitem").map((i) => i.textContent);
    expect(items[0]).toContain("My profile");
    expect(items[items.length - 1]).toContain("Sign out");
    expect(items.join("|")).not.toContain("Switch workspace"); // owner holds one workspace
  });

  it("icon-only controls are named (tooltips carry the same words)", () => {
    const { container } = mount("owner@acme.com");
    for (const name of ["Collapse sidebar", "Search", "Open menu"]) expect(screen.getAllByLabelText(name, { exact: false }).length, name).toBeGreaterThan(0);
    expect(container.querySelector("[data-shell-bell] button")!.getAttribute("aria-label")).toContain("Notifications");
  });
});

describe("workspace switcher (16 s4)", () => {
  it("a single-workspace member sees a static eyebrow and no switcher", () => {
    const { container } = mount("owner@acme.com");
    expect(container.querySelector("[data-workspace-switcher]")).toBeNull();
    expect(container.querySelector("[data-workspace-eyebrow]")!.textContent).toBe("Administration");
  });

  it("Sarah (admin + marketing manager) gets the switcher with two rows and lands on the first", () => {
    const { container } = mount("sarah@acme.com");
    const chip = container.querySelector<HTMLElement>("[data-workspace-switcher=\"sidebar\"]")!;
    expect(chip.textContent).toContain("Administration");
    fireEvent.click(chip);
    const rows = screen.getAllByRole("menuitemradio");
    expect(rows.map((r) => r.textContent)).toEqual([expect.stringContaining("Administration"), expect.stringContaining("Marketing management")]);
    expect(rows[0].getAttribute("aria-checked")).toBe("true");
    fireEvent.click(rows[1]);
    expect(nav.push).toHaveBeenCalledWith("/w/marketing-mgmt");
  });

  it("Ctrl+Shift+W opens it; 'Open Marketing management first' is a local choice with an undo toast", () => {
    mount("sarah@acme.com");
    fireEvent.keyDown(window, { key: "W", ctrlKey: true, shiftKey: true });
    expect(screen.getAllByRole("menuitemradio")).toHaveLength(2);
    fireEvent.click(screen.getByText("Open Marketing management first"));
    expect(screen.getByText("Marketing management opens first")).toBeTruthy();
    expect(window.localStorage.getItem("kw.shell.landing.2")).toBe("marketing-mgmt");
    fireEvent.click(screen.getByText("Undo"));
    expect(window.localStorage.getItem("kw.shell.landing.2")).toBeNull();
  });

  it("a single-workspace member's Ctrl+Shift+W does nothing", () => {
    mount("owner@acme.com");
    fireEvent.keyDown(window, { key: "W", ctrlKey: true, shiftKey: true });
    expect(screen.queryAllByRole("menuitemradio")).toHaveLength(0);
  });
});

describe("'Your access changed' banner (X2.2 ETag, on focus)", () => {
  it("shows when the tag moved, with a Reload action", async () => {
    const s = sessionOf("acme.localhost", "owner@acme.com");
    vi.stubGlobal("fetch", vi.fn(async (_p: string, init?: RequestInit) => {
      if (_p === "/api/me/tenant") expect((init?.headers as Record<string, string>)["If-None-Match"]).toBe(s.etag);
      return new Response(JSON.stringify(meTenantFor("acme.localhost", "owner@acme.com")!.body), { status: 200, headers: { etag: '"changed"', "content-type": "application/json" } });
    }));
    const { container } = mount("owner@acme.com");
    expect(container.querySelector("[data-shell-banner]")).toBeNull();
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(() => expect(container.querySelector('[data-shell-banner="access-changed"]')).toBeTruthy());
    expect(container.querySelector('[data-shell-banner="access-changed"]')!.textContent).toContain("Your access changed");
  });

  it("stays quiet on a 304 and when the API is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 304 })));
    const { container } = mount("owner@acme.com");
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(container.querySelector("[data-shell-banner]")).toBeNull();
  });
});

describe("banners by permission", () => {
  const pastDue = (me: MeTenant): MeTenant => ({ ...me, org: { ...me.org, flags: { ...me.org.flags, pastDue: true } } });
  it("past-due shows for a member who can see billing and links to it; a marketer never sees it", () => {
    const { container } = mount("owner@acme.com", { edit: pastDue });
    expect(container.querySelector('[data-shell-banner="past-due"] a')!.getAttribute("href")).toBe("/w/admin/billing");
    cleanup();
    const second = mount("marketer@acme.com", { edit: pastDue });
    expect(second.container.querySelector('[data-shell-banner="past-due"]')).toBeNull();
  });
});

describe("phone: top bar, menu sheet, bottom tabs (< md)", () => {
  beforeEach(() => viewport({ phone: true, wide: false }));

  it("bottom bar = the first four tabs of the workspace + More", () => {
    const { container } = mount("owner@acme.com");
    const tabs = container.querySelector("[data-shell-tabs]")!;
    expect(Array.from(tabs.querySelectorAll("a")).map((a) => a.textContent)).toEqual(["Dashboard", "Employees", "Consultants", "Billing"]);
    expect(tabs.textContent).toContain("More");
  });

  it("the menu button opens the full menu as a sheet with the account actions, and a link closes it", async () => {
    mount("owner@acme.com");
    fireEvent.click(screen.getByLabelText("Open menu"));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByText("Organization Branding")).toBeTruthy();
    expect(within(sheet).getByText("My profile")).toBeTruthy();
    expect(within(sheet).getByText("Sign out")).toBeTruthy();
    fireEvent.click(within(sheet).getByText("Billing"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("More opens the same sheet; the workspace chip is the phone switcher for Sarah", async () => {
    const { container } = mount("sarah@acme.com");
    fireEvent.click(screen.getByText("More"));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(container.querySelector("[data-workspace-switcher=\"bar\"]")!);
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getAllByRole("menuitemradio")).toHaveLength(2);
  });
});

describe("states inside the shell", () => {
  it("the catch-all page says 'on the way' with the bee; not-your-role offers the way back", () => {
    mount("owner@acme.com", { children: <ComingSoon title="Jobs" /> });
    expect(screen.getAllByText("This page is on the way").length).toBeGreaterThan(0);
    cleanup();
    mount("owner@acme.com", { children: <NotYourRole switchTo={{ label: "Administration", href: "/w/admin" }} /> });
    expect(screen.getAllByText("This isn't part of your role").length).toBeGreaterThan(0);
    expect(screen.getByText("Open Administration").getAttribute("href")).toBe("/w/admin");
  });
});

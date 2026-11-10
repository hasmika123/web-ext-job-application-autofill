// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@kiwiply/ui";
import OrgSettingsPage from "./OrgSettingsPage";

const nav = vi.hoisted(() => ({ search: "tab=resumes", replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: nav.replace }),
  usePathname: () => "/w/admin/settings",
  useSearchParams: () => new URLSearchParams(nav.search),
}));

let current: { consultantShareLinks: boolean; overridden: boolean; activeConsultantLinks: number };
let calls: { method: string; url: string; body: unknown }[];
let writeStatus = 200;

beforeEach(() => {
  nav.search = "tab=resumes";
  nav.replace.mockClear();
  calls = [];
  current = { consultantShareLinks: false, overridden: false, activeConsultantLinks: 3 };
  writeStatus = 200;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      if (String(url).includes("/org-settings")) return new Response("{}", { status: 404 }); // the General / Security sections have their own test file
      const method = init.method ?? "GET";
      const body = init.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, url, body });
      if (method === "PUT" && writeStatus === 200) current = { ...current, consultantShareLinks: body.consultantShareLinks, overridden: true };
      const status = method === "PUT" ? writeStatus : 200;
      return new Response(JSON.stringify(status === 200 ? current : { error: "Nope." }), { status, headers: { "content-type": "application/json" } });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const flush = () => act(async () => void (await new Promise((res) => setTimeout(res, 20))));
async function mount() {
  render(
    <ToastProvider>
      <OrgSettingsPage orgId={7} />
    </ToastProvider>,
  );
  await flush();
}
const toggle = () => screen.getByRole("switch", { name: /Share links/ });

describe("Settings: the five tabs", () => {
  it("draws General | Security | Autopilot | Resumes | Policies, and opens the one in ?tab=", async () => {
    await mount();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["General", "Security", "Autopilot", "Resumes", "Policies"]);
    expect(screen.getByRole("tab", { name: "Resumes" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("switch", { name: /Share links/ })).toBeTruthy();
  });

  it("opens on General when there is no tab, and a click on a tab writes it to the address", async () => {
    nav.search = "";
    await mount();
    expect(screen.getByRole("tab", { name: "General" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("tab", { name: "Autopilot" }));
    expect(nav.replace).toHaveBeenCalledWith("/w/admin/settings?tab=autopilot", { scroll: false });
  });

  it("?tab=policies opens the Policies tab and ?tab=autopilot the Autopilot block", async () => {
    nav.search = "tab=policies";
    await mount();
    expect(screen.getByRole("tab", { name: "Policies" }).getAttribute("aria-selected")).toBe("true");
    cleanup();
    nav.search = "tab=autopilot";
    await mount();
    expect(screen.getByRole("tab", { name: "Autopilot" }).getAttribute("aria-selected")).toBe("true");
  });
});

describe("the org admin's consultant share-link switch", () => {
  it("reads the policy of its own organization and explains the switch in one line, off by default", async () => {
    await mount();
    expect(calls[0]).toMatchObject({ method: "GET", url: "/api/orgs/7/resume-policy" });
    expect(screen.getByText("Let consultants create share links for their organization resumes")).toBeTruthy();
    expect(screen.getByText("Off by default. A marketer preparing a resume for a consultant can never create share links.")).toBeTruthy();
    expect(toggle().getAttribute("aria-checked")).toBe("false");
  });

  it("autosaves on a click (no Save button), shows an inline check, and offers Undo", async () => {
    await mount();
    expect(screen.queryByRole("button", { name: /^Save/ })).toBeNull();
    fireEvent.click(toggle());
    await flush();
    expect(calls.filter((c) => c.method === "PUT")).toEqual([{ method: "PUT", url: "/api/orgs/7/resume-policy", body: { consultantShareLinks: true } }]);
    expect(toggle().getAttribute("aria-checked")).toBe("true");
    expect(document.querySelector("[data-saved-tick]")).not.toBeNull();
    expect(screen.getByText("Consultants can now create share links")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await flush();
    expect(calls.filter((c) => c.method === "PUT").map((c) => c.body)).toEqual([{ consultantShareLinks: true }, { consultantShareLinks: false }]);
    expect(toggle().getAttribute("aria-checked")).toBe("false");
  });

  it("turning it ON needs no confirmation", async () => {
    await mount();
    fireEvent.click(toggle());
    await flush();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(calls.filter((c) => c.method === "PUT")).toHaveLength(1);
  });

  describe("turning it OFF", () => {
    beforeEach(() => {
      current = { consultantShareLinks: true, overridden: true, activeConsultantLinks: 3 };
    });

    it("asks first, naming how many links stop working, and Cancel keeps it on without saving", async () => {
      await mount();
      expect(toggle().getAttribute("aria-checked")).toBe("true");
      fireEvent.click(toggle());
      await flush();
      const dialog = screen.getByRole("dialog");
      expect(dialog.textContent).toContain("3 active share links will stop working right away. You can turn sharing back on later to restore them.");
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      await flush();
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(toggle().getAttribute("aria-checked")).toBe("true");
      expect(calls.filter((c) => c.method === "PUT")).toEqual([]);
    });

    it("says it in the singular for one link, and plainly when there are none", async () => {
      current = { consultantShareLinks: true, overridden: true, activeConsultantLinks: 1 };
      await mount();
      fireEvent.click(toggle());
      await flush();
      expect(screen.getByRole("dialog").textContent).toContain("1 active share link will stop working right away. You can turn sharing back on later to restore it.");
      cleanup();

      current = { consultantShareLinks: true, overridden: true, activeConsultantLinks: 0 };
      await mount();
      fireEvent.click(toggle());
      await flush();
      expect(screen.getByRole("dialog").textContent).toContain("No share links are active right now");
    });

    it("saves only after the admin confirms, then offers Undo, which restores the links by turning it back on", async () => {
      await mount();
      fireEvent.click(toggle());
      await flush();
      expect(calls.filter((c) => c.method === "PUT")).toEqual([]);
      fireEvent.click(screen.getByRole("button", { name: "Turn off" }));
      await flush();
      expect(calls.filter((c) => c.method === "PUT")).toEqual([{ method: "PUT", url: "/api/orgs/7/resume-policy", body: { consultantShareLinks: false } }]);
      expect(toggle().getAttribute("aria-checked")).toBe("false");
      expect(document.querySelector("[data-saved-tick]")).not.toBeNull();
      expect(screen.getByText("Consultants can no longer create share links")).toBeTruthy();
      expect(screen.getByText(/3 share links are paused/)).toBeTruthy();

      fireEvent.click(screen.getByRole("button", { name: "Undo" }));
      await flush();
      expect(calls.filter((c) => c.method === "PUT").map((c) => c.body)).toEqual([{ consultantShareLinks: false }, { consultantShareLinks: true }]);
      expect(toggle().getAttribute("aria-checked")).toBe("true");
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("puts the switch back and says why when the save is refused", async () => {
    await mount();
    writeStatus = 422;
    fireEvent.click(toggle());
    await flush();
    expect(toggle().getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText("Not saved")).toBeTruthy();
    expect(screen.getByText("Nope.")).toBeTruthy();
    expect(document.querySelector("[data-saved-tick]")).toBeNull();
  });

  it("shows a quiet denied state when the API answers 404 (not the org's admin)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
    await mount();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.getByText(/don't have access/i)).toBeTruthy();
  });
});

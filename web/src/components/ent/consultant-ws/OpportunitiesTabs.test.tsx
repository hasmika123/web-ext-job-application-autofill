// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ search: "", replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: nav.replace }),
  usePathname: () => "/w/consultant/opportunities",
  useSearchParams: () => new URLSearchParams(nav.search),
}));

import { ToastProvider } from "@kiwiply/ui";
import OpportunitiesPage from "./OpportunitiesPage";

const urls: string[] = [];
beforeEach(() => {
  urls.length = 0;
  nav.replace.mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      urls.push(url);
      return new Response("{}", { status: 404 }); // the role panel is enough: this file only checks which tab mounts
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  nav.search = "";
});

const mount = async () => {
  render(
    <ToastProvider>
      <OpportunitiesPage orgId={2} firstName="Anika" />
    </ToastProvider>,
  );
  await act(async () => void (await new Promise((r) => setTimeout(r, 20))));
};

describe("Opportunities tabs", () => {
  it("has Assigned, Matches and Browse, and Assigned is the default", async () => {
    await mount();
    const tabs = screen.getAllByRole("tab").map((t) => t.textContent);
    expect(tabs).toEqual(["Assigned", "Matches", "Browse"]);
    expect(screen.getByRole("tab", { name: "Assigned" }).getAttribute("aria-selected")).toBe("true");
    expect(urls[0]).toMatch(/me-workspace\/opportunities\?/);
  });

  it("?tab=matches mounts the Matches tab", async () => {
    nav.search = "tab=matches";
    await mount();
    expect(screen.getByRole("tab", { name: "Matches" }).getAttribute("aria-selected")).toBe("true");
    expect(urls[0]).toBe("/api/orgs/2/me-workspace/matches");
  });

  it("?tab=browse mounts the Browse tab", async () => {
    nav.search = "tab=browse";
    await mount();
    expect(screen.getByRole("tab", { name: "Browse" }).getAttribute("aria-selected")).toBe("true");
    expect(urls.some((u) => u.includes("/me-workspace/job-discovery"))).toBe(true);
  });

  it("an unknown tab falls back to Assigned, and choosing a tab writes it to the address", async () => {
    nav.search = "tab=nope";
    await mount();
    expect(screen.getByRole("tab", { name: "Assigned" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("tab", { name: "Browse" }));
    expect(nav.replace).toHaveBeenCalledWith("/w/consultant/opportunities?tab=browse", { scroll: false });
    fireEvent.click(screen.getByRole("tab", { name: "Assigned" }));
    expect(nav.replace).toHaveBeenLastCalledWith("/w/consultant/opportunities", { scroll: false });
  });
});

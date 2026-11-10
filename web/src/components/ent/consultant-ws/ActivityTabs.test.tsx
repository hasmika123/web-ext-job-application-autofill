// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ search: "", replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: nav.replace }),
  usePathname: () => "/w/consultant/activity",
  useSearchParams: () => new URLSearchParams(nav.search),
}));

import { ToastProvider } from "@kiwiply/ui";
import ActivityPage from "./ActivityPage";

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
      <ActivityPage orgId={2} firstName="Anika" />
    </ToastProvider>,
  );
  await act(async () => void (await new Promise((r) => setTimeout(r, 20))));
};

describe("Activity tabs", () => {
  it("has Needs attention and Timeline, and Needs attention is the default", async () => {
    await mount();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Needs attention", "Timeline"]);
    expect(screen.getByRole("tab", { name: "Needs attention" }).getAttribute("aria-selected")).toBe("true");
    expect(urls[0]).toMatch(/me-workspace\/notifications\?/);
  });

  it("?tab=timeline mounts the Timeline tab", async () => {
    nav.search = "tab=timeline";
    await mount();
    expect(screen.getByRole("tab", { name: "Timeline" }).getAttribute("aria-selected")).toBe("true");
    expect(urls[0]).toMatch(/me-workspace\/activity-timeline/);
  });

  it("?tab=attention mounts Needs attention and choosing Timeline writes the tab to the address", async () => {
    nav.search = "tab=attention";
    await mount();
    expect(screen.getByRole("tab", { name: "Needs attention" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("tab", { name: "Timeline" }));
    expect(nav.replace).toHaveBeenCalledWith("/w/consultant/activity?tab=timeline", { scroll: false });
  });
});

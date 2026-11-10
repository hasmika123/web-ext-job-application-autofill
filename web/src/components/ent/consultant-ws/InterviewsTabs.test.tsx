// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ search: "", replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: nav.replace }),
  usePathname: () => "/w/consultant/interviews",
  useSearchParams: () => new URLSearchParams(nav.search),
}));

import InterviewsPage from "./InterviewsPage";

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
  render(<InterviewsPage orgId={2} firstName="Anika" />);
  await act(async () => void (await new Promise((r) => setTimeout(r, 20))));
};

describe("Interviews tabs", () => {
  it("has Schedule and Prepare, and Schedule is the default", async () => {
    await mount();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Schedule", "Prepare"]);
    expect(screen.getByRole("tab", { name: "Schedule" }).getAttribute("aria-selected")).toBe("true");
    expect(urls[0]).toMatch(/me-workspace\/interviews$/);
  });

  it("?tab=prepare mounts the Prepare tab", async () => {
    nav.search = "tab=prepare";
    await mount();
    expect(screen.getByRole("tab", { name: "Prepare" }).getAttribute("aria-selected")).toBe("true");
    expect(urls[0]).toMatch(/me-workspace\/interview-prep/);
  });

  it("choosing Prepare writes ?tab=prepare and choosing Schedule clears it", async () => {
    await mount();
    fireEvent.click(screen.getByRole("tab", { name: "Prepare" }));
    expect(nav.replace).toHaveBeenCalledWith("/w/consultant/interviews?tab=prepare", { scroll: false });
    nav.search = "tab=prepare";
    cleanup();
    await mount();
    fireEvent.click(screen.getByRole("tab", { name: "Schedule" }));
    expect(nav.replace).toHaveBeenLastCalledWith("/w/consultant/interviews", { scroll: false });
  });
});

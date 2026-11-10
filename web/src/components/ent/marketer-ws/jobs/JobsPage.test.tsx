// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
let query = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace }),
  usePathname: () => "/w/marketing/jobs",
  useSearchParams: () => new URLSearchParams(query),
}));

vi.mock("@/components/ent/shell/ShellContext", () => ({
  default: ({ title, subtitle }: { title: string; subtitle: string }) => (
    <header data-page-header>
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </header>
  ),
  ClaimsMascot: () => null,
  ClaimsHelpCard: () => null,
  openHelpPanel: () => undefined,
}));

import JobsPage from "./JobsPage";

const PROPS = { orgId: 2, orgName: "Acme", firstName: "Sarah", hrefs: { jobs: "/w/marketing/jobs", matches: "/w/marketing/jobs?tab=matches", streams: "/w/marketing/jobs?tab=sources" } };
let urls: string[] = [];
beforeEach(() => {
  urls = [];
  replace.mockClear();
  // an unreadable body makes each tab draw its own "didn't load" state; the test only cares which tab asked which route
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    urls.push(String(input));
    return new Response("{}", { status: 500 });
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const asked = (part: string) => urls.some((u) => u.includes(part));

describe("JobsPage (Openings | Matches | Sources)", () => {
  it("has one title and the plan's subtitle, and three tabs", async () => {
    query = "";
    render(<JobsPage {...PROPS} />);
    expect(document.querySelectorAll("[data-page-header]")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Jobs" })).toBeTruthy();
    expect(screen.getByText("Openings from your sources, matched to your consultants.")).toBeTruthy();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Openings", "Matches", "Sources"]);
  });

  it("opens on Openings without a tab in the URL, and only that tab's calls are made", async () => {
    query = "";
    render(<JobsPage {...PROPS} />);
    await waitFor(() => expect(asked("/mkt/jobs")).toBe(true));
    expect((document.querySelector("[data-mkt-jobs]") as HTMLElement).getAttribute("data-tab")).toBe("openings");
    expect(screen.getByRole("tab", { name: "Openings" }).getAttribute("aria-selected")).toBe("true");
    expect(asked("/mkt/matches")).toBe(false);
    expect(asked("/mkt/streams")).toBe(false);
  });

  it("?tab=matches shows the Matches tab (the old /matches address redirects here)", async () => {
    query = "tab=matches";
    render(<JobsPage {...PROPS} />);
    await waitFor(() => expect(asked("/mkt/matches")).toBe(true));
    expect((document.querySelector("[data-mkt-jobs]") as HTMLElement).getAttribute("data-tab")).toBe("matches");
    expect(screen.getByRole("tab", { name: "Matches" }).getAttribute("aria-selected")).toBe("true");
    expect(asked("/mkt/jobs")).toBe(false);
    expect(document.querySelectorAll("[data-page-header]")).toHaveLength(1);
  });

  it("?tab=sources shows the Sources tab (the old /streams address redirects here)", async () => {
    query = "tab=sources";
    render(<JobsPage {...PROPS} />);
    await waitFor(() => expect(asked("/mkt/streams")).toBe(true));
    expect(screen.getByRole("tab", { name: "Sources" }).getAttribute("aria-selected")).toBe("true");
    expect(document.querySelectorAll("[data-page-header]")).toHaveLength(1);
  });

  it("an unknown tab falls back to Openings", async () => {
    query = "tab=nope";
    render(<JobsPage {...PROPS} />);
    expect((document.querySelector("[data-mkt-jobs]") as HTMLElement).getAttribute("data-tab")).toBe("openings");
  });

  it("choosing a tab writes it to the URL; Openings is written without one", async () => {
    query = "";
    render(<JobsPage {...PROPS} />);
    fireEvent.click(screen.getByRole("tab", { name: "Sources" }));
    expect(replace).toHaveBeenLastCalledWith("/w/marketing/jobs?tab=sources", { scroll: false });
    cleanup();
    query = "tab=sources";
    render(<JobsPage {...PROPS} />);
    fireEvent.click(screen.getByRole("tab", { name: "Openings" }));
    expect(replace).toHaveBeenLastCalledWith("/w/marketing/jobs", { scroll: false });
  });
});

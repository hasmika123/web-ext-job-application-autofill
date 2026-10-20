// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
let query = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace }),
  usePathname: () => "/w/marketing/tasks",
  useSearchParams: () => new URLSearchParams(query),
}));

vi.mock("@/components/ent/shell/ShellContext", () => ({
  default: ({ title, subtitle }: { title: string; subtitle: string }) => (
    <header data-page-header>
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </header>
  ),
}));

import TaskTabsPage from "./TaskTabsPage";

const PROPS = { orgId: 2, orgName: "Acme", firstName: "Sarah", hrefs: { tasks: "/w/marketing/tasks", followups: "/w/marketing/tasks?tab=followups" } };
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

describe("TaskTabsPage (Tasks | Follow-ups)", () => {
  it("has one title and the plan's subtitle, and two tabs", () => {
    query = "";
    render(<TaskTabsPage {...PROPS} />);
    expect(document.querySelectorAll("[data-page-header]")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Tasks" })).toBeTruthy();
    expect(screen.getByText("What you owe and when: tasks, calls and reminders.")).toBeTruthy();
    expect(screen.getByRole("tablist", { name: "Tasks views" }).textContent).toBe("TasksFollow-ups");
  });

  it("opens on Tasks without a tab in the URL, and only that tab's calls are made", async () => {
    query = "";
    render(<TaskTabsPage {...PROPS} />);
    await waitFor(() => expect(asked("/mkt/tasks")).toBe(true));
    expect((document.querySelector("[data-mkt-tasks]") as HTMLElement).getAttribute("data-tab")).toBe("tasks");
    expect(screen.getByRole("tab", { name: "Tasks" }).getAttribute("aria-selected")).toBe("true");
    expect(asked("/mkt/followups")).toBe(false);
  });

  it("?tab=followups shows the Follow-ups tab (the old /followups address redirects here)", async () => {
    query = "tab=followups";
    render(<TaskTabsPage {...PROPS} />);
    await waitFor(() => expect(asked("/mkt/followups")).toBe(true));
    expect((document.querySelector("[data-mkt-tasks]") as HTMLElement).getAttribute("data-tab")).toBe("followups");
    expect(screen.getByRole("tab", { name: "Follow-ups" }).getAttribute("aria-selected")).toBe("true");
    expect(asked("/mkt/tasks")).toBe(false);
    expect(document.querySelectorAll("[data-page-header]")).toHaveLength(1);
  });

  it("an unknown tab falls back to Tasks", () => {
    query = "tab=nope";
    render(<TaskTabsPage {...PROPS} />);
    expect((document.querySelector("[data-mkt-tasks]") as HTMLElement).getAttribute("data-tab")).toBe("tasks");
  });

  it("choosing a tab writes it to the URL; Tasks is written without one", () => {
    query = "";
    render(<TaskTabsPage {...PROPS} />);
    fireEvent.click(screen.getByRole("tab", { name: "Follow-ups" }));
    expect(replace).toHaveBeenLastCalledWith("/w/marketing/tasks?tab=followups", { scroll: false });
    cleanup();
    query = "tab=followups";
    render(<TaskTabsPage {...PROPS} />);
    fireEvent.click(screen.getByRole("tab", { name: "Tasks" }));
    expect(replace).toHaveBeenLastCalledWith("/w/marketing/tasks", { scroll: false });
  });
});

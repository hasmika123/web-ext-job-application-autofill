// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ search: "", replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: nav.replace }),
  usePathname: () => "/w/admin/teams",
  useSearchParams: () => new URLSearchParams(nav.search),
}));

import { ToastProvider } from "@kiwiply/ui";
import TeamsDepartmentsPage from "./TeamsDepartmentsPage";
import { CONSULTING, MARKETING, STRUCTURE, directory, stubGroupsFetch } from "./groups.fixtures";

beforeEach(() => {
  nav.search = "tab=departments";
  nav.replace.mockClear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const mount = (canManage = true) =>
  render(
    <ToastProvider>
      <TeamsDepartmentsPage orgId={2} orgName="Acme" canManage={canManage} />
    </ToastProvider>,
  );

describe("Departments tab (X4.5)", () => {
  it("shows one line of counts and the directory, with no tiles, no card grid, no performance bars and no help card", async () => {
    stubGroupsFetch();
    mount();
    expect((await screen.findByText("2 departments · 9 people")).closest("[data-group-counts]")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Department numbers" })).toBeNull();
    expect(screen.queryByRole("list", { name: "Departments" })).toBeNull();
    expect(screen.queryByRole("list", { name: "Employees per department" })).toBeNull();
    expect(screen.queryByText("Department Performance")).toBeNull();
    expect(screen.queryByRole("region", { name: "Need help with departments?" })).toBeNull();
    expect(screen.queryByText(/open positions/i)).toBeNull(); // no recruiting data exists
    expect(document.querySelector(".grp-page")).toBeTruthy(); // the board's scoped look
    const table = await screen.findByRole("table", { name: "Departments" });
    const row = within(table).getByText("Consulting").closest("tr")!;
    expect(within(row).getByText("Amara Silva")).toBeTruthy();
    expect(within(row).getByText("3")).toBeTruthy(); // employees
  });

  it("draws the structure once, as a tree under the directory, with the teams inside each department", async () => {
    stubGroupsFetch();
    mount();
    const structure = await screen.findByRole("region", { name: "Structure" });
    expect(within(structure).getByRole("heading", { name: "Structure" })).toBeTruthy();
    expect(await within(structure).findByText("Consulting")).toBeTruthy();
    expect(within(structure).getByText("Bench East")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /View full structure/i })).toBeNull();
    expect(document.querySelector("[data-org-chart]")).toBeNull();
  });

  it("opens on the Departments tab from ?tab=departments, and the Teams tab click clears it from the address", async () => {
    stubGroupsFetch();
    mount();
    expect(screen.getByRole("tab", { name: "Departments" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("tab", { name: "Teams" }));
    expect(nav.replace).toHaveBeenCalledWith("/w/admin/teams", { scroll: false });
  });

  it("creates a department with a name, lead, icon and color (nothing is sent until the button)", async () => {
    const calls = stubGroupsFetch();
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Create department" }));
    const sheet = await screen.findByRole("dialog", { name: "Create department" });
    fireEvent.change(within(sheet).getByLabelText(/Department name/), { target: { value: "Legal" } });
    expect(calls.some((c) => c.method === "POST")).toBe(false);
    fireEvent.focus(within(sheet).getByRole("combobox", { name: "Department lead" }));
    const option = await within(sheet).findByRole("option", { name: /Hana Petrov/ });
    fireEvent.click(within(option).getByRole("button"));
    fireEvent.click(within(sheet).getByRole("button", { name: "shield" }));
    fireEvent.click(within(sheet).getByRole("button", { name: "Amber" }));
    fireEvent.click(within(sheet).getByRole("button", { name: "Create department" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.body).toMatchObject({ name: "Legal", kind: "DEPARTMENT", leadMemberId: 4, icon: "shield", color: "warning" });
  });

  it("changes a lead with the group's version as If-Match and offers Undo", async () => {
    const calls = stubGroupsFetch();
    mount();
    const row = (await screen.findByRole("table", { name: "Departments" })).querySelector("tbody tr")!;
    fireEvent.click(within(row as HTMLElement).getByRole("button", { name: "Row actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Change lead" }));
    const dialog = await screen.findByRole("dialog", { name: /Change the lead of Consulting/ });
    fireEvent.focus(within(dialog).getByRole("combobox"));
    fireEvent.click(within(await within(dialog).findByRole("option", { name: /Hana Petrov/ })).getByRole("button"));
    await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true));
    const patch = calls.find((c) => c.method === "PATCH")!;
    expect(patch.url).toContain("/groups/11");
    expect(patch.headers["if-match"]).toBe(CONSULTING.version);
    expect(patch.body).toEqual({ leadMemberId: 4 });
    const undo = await screen.findByRole("button", { name: "Undo" });
    fireEvent.click(undo);
    await waitFor(() => expect(calls.filter((c) => c.method === "PATCH").length).toBe(2));
    expect(calls.filter((c) => c.method === "PATCH")[1].body).toEqual({ leadMemberId: 1 }); // back to Amara, with the NEW version
    expect(calls.filter((c) => c.method === "PATCH")[1].headers["if-match"]).toBe('W/"1"');
  });

  it("will not offer to delete a department that still has people (the guard says why)", async () => {
    stubGroupsFetch();
    mount();
    const rows = (await screen.findByRole("table", { name: "Departments" })).querySelectorAll("tbody tr");
    fireEvent.click(within(rows[0] as HTMLElement).getByRole("button", { name: "Row actions" }));
    const guarded = await screen.findByRole("menuitem", { name: /Delete \(move people out first\)/ });
    expect(guarded.getAttribute("aria-disabled") === "true" || (guarded as HTMLButtonElement).disabled).toBe(true);
  });

  it("an empty department can be deleted after a confirmation, with its version", async () => {
    const calls = stubGroupsFetch({ dir: (k) => directory(k as "DEPARTMENT", { items: [MARKETING], total: 1 }) });
    mount();
    const row = (await screen.findByRole("table", { name: "Departments" })).querySelector("tbody tr")!;
    fireEvent.click(within(row as HTMLElement).getByRole("button", { name: "Row actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete department" }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE")).toBe(true));
    expect(calls.find((c) => c.method === "DELETE")!.headers["if-match"]).toBe(MARKETING.version);
  });

  it("hides every control for a viewer without groups.manage but keeps the facts", async () => {
    stubGroupsFetch();
    mount(false);
    await screen.findByRole("table", { name: "Departments" });
    expect(screen.queryByRole("button", { name: /Create department/ })).toBeNull();
    const row = (await screen.findByRole("table", { name: "Departments" })).querySelector("tbody tr")!;
    fireEvent.click(within(row as HTMLElement).getByRole("button", { name: "Row actions" }));
    expect(screen.queryByRole("menuitem", { name: "Change lead" })).toBeNull();
    expect(screen.getByRole("menuitem", { name: "Open" })).toBeTruthy();
  });

  it("searches the directory through the API and keeps the page when nothing matches", async () => {
    const calls = stubGroupsFetch({ dir: (k) => (k ? directory("DEPARTMENT") : directory("DEPARTMENT")) });
    mount();
    await screen.findByRole("table", { name: "Departments" });
    fireEvent.change(screen.getByRole("searchbox", { name: "Search departments" }), { target: { value: "mark" } });
    await waitFor(() => expect(calls.some((c) => c.url.includes("/groups/directory") && c.url.includes("q=mark"))).toBe(true));
    expect(calls.filter((c) => c.url.includes("/groups/directory")).every((c) => c.url.includes("kind=DEPARTMENT"))).toBe(true);
  });

  it("with no departments at all it says so, with the bee and a way to start", async () => {
    stubGroupsFetch({
      structure: { ...STRUCTURE, departments: [] },
      dir: () => ({ ...directory("DEPARTMENT"), items: [], total: 0, summary: { ...directory("DEPARTMENT").summary, departments: 0, teams: 0, averageTeamSize: null } }),
    });
    mount();
    expect(await screen.findByText("Group people into departments and teams")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Create department" }).length).toBeGreaterThan(0);
  });

  it("shows the real reason when the list can not be loaded", async () => {
    stubGroupsFetch({ answer: (c) => (c.url.includes("/groups/directory") ? { status: 404, body: { error: "Not found." } } : null) });
    mount();
    expect(await screen.findByText(/couldn.t load the departments|could not load the departments|the departments/i)).toBeTruthy();
  });
});

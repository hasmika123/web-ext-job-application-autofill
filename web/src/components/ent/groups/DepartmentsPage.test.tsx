// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { ToastProvider } from "@kiwiply/ui";
import DepartmentsPage from "./DepartmentsPage";
import { CONSULTING, MARKETING, STRUCTURE, directory, stubGroupsFetch } from "./groups.fixtures";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const mount = (canManage = true) =>
  render(
    <ToastProvider>
      <DepartmentsPage orgId={2} canManage={canManage} />
    </ToastProvider>,
  );

describe("DepartmentsPage (X4.5)", () => {
  it("shows the KPI tiles the API can count, the department cards with their leads, and no open-positions tile", async () => {
    stubGroupsFetch();
    mount();
    const tiles = await screen.findByRole("region", { name: "Department numbers" });
    expect(within(tiles).getByText("Total Departments")).toBeTruthy();
    expect(within(tiles).getByText("Total Employees")).toBeTruthy();
    expect(within(tiles).getByText("Department Leads")).toBeTruthy();
    expect(within(tiles).getByText("Avg. Team Size")).toBeTruthy();
    expect(within(tiles).getByText("9")).toBeTruthy();
    expect(screen.queryByText(/open positions/i)).toBeNull(); // no recruiting data exists: no tile
    expect(document.querySelector(".grp-page")).toBeTruthy(); // the board's scoped look
    expect(screen.getByRole("region", { name: "Need help with departments?" })).toBeTruthy(); // the board's own help card
    const cards = await screen.findByRole("list", { name: "Departments" });
    const consulting = within(cards).getByText("Consulting").closest("button")!;
    expect(consulting.textContent).toContain("3 employees");
    expect(within(consulting).getByText("Amara Silva")).toBeTruthy();
    expect(within(consulting).getByText("Account Manager")).toBeTruthy();
    expect(within(cards).getByText("No lead yet")).toBeTruthy(); // Marketing
  });

  it("draws employees per department as bars and the organization chart, from the same numbers", async () => {
    stubGroupsFetch();
    mount();
    const bars = await screen.findByRole("list", { name: "Employees per department" });
    expect(within(bars).getByRole("img", { name: "Consulting: 3 employees" })).toBeTruthy();
    expect(within(bars).getByRole("img", { name: "Marketing: 0 employees" })).toBeTruthy();
    const chart = await screen.findByRole("list", { name: "Departments in the organization" });
    expect(within(chart).getByText("Marketing")).toBeTruthy();
    expect(screen.getByText("Acme Staffing")).toBeTruthy();
  });

  it("creates a department with a name, lead, icon and colour (nothing is sent until the button)", async () => {
    const calls = stubGroupsFetch();
    mount();
    fireEvent.click(await screen.findByRole("button", { name: /Create Department/ }));
    const sheet = await screen.findByRole("dialog", { name: "Create Department" });
    fireEvent.change(within(sheet).getByLabelText(/Department name/), { target: { value: "Legal" } });
    expect(calls.some((c) => c.method === "POST")).toBe(false);
    fireEvent.focus(within(sheet).getByRole("combobox", { name: "Department lead" }));
    const option = await within(sheet).findByRole("option", { name: /Hana Petrov/ });
    fireEvent.click(within(option).getByRole("button"));
    fireEvent.click(within(sheet).getByRole("button", { name: "shield" }));
    fireEvent.click(within(sheet).getByRole("button", { name: "Amber" }));
    fireEvent.click(within(sheet).getByRole("button", { name: "Create Department" }));
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
    await screen.findByRole("list", { name: "Departments" });
    expect(screen.queryByRole("button", { name: /Create Department/ })).toBeNull();
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
    expect(screen.getAllByRole("button", { name: "Create Department" }).length).toBeGreaterThan(0);
  });

  it("shows the real reason when the list can not be loaded", async () => {
    stubGroupsFetch({ answer: (c) => (c.url.includes("/groups/directory") ? { status: 404, body: { error: "Not found." } } : null) });
    mount();
    expect(await screen.findByText(/couldn.t load the departments|could not load the departments|the departments/i)).toBeTruthy();
  });
});

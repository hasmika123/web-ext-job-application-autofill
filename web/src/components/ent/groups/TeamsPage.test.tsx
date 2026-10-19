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
import { BENCH, stubGroupsFetch } from "./groups.fixtures";

beforeEach(() => {
  nav.search = "";
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

describe("Teams tab (X4.5)", () => {
  it("shows one line of counts and the directory table, with no tiles, no card grid and no invented numbers", async () => {
    stubGroupsFetch();
    mount();
    expect((await screen.findByText(/1 team · 2 members · 7 people not in a team/)).closest("[data-group-counts]")).toBeTruthy();
    const table = await screen.findByRole("table", { name: "Team directory" });
    const row = within(table).getByText("Bench East").closest("tr")!;
    expect(within(row).getByText("Consulting")).toBeTruthy();
    expect(within(row).getByText("Anika Rao")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Team numbers" })).toBeNull();
    expect(screen.queryByRole("list", { name: "Teams" })).toBeNull();
    expect(screen.queryByText(/workload/i)).toBeNull();
    expect(screen.queryByText(/open roles/i)).toBeNull();
  });

  it("has no Team Performance card, no structure tree and no help card on this tab", async () => {
    stubGroupsFetch();
    mount();
    await screen.findByRole("table", { name: "Team directory" });
    expect(screen.queryByText(/Nothing measures team performance yet/)).toBeNull();
    expect(screen.queryByText("Team Performance")).toBeNull();
    expect(screen.queryByRole("region", { name: "Structure" })).toBeNull();
    expect(screen.queryByText(/Ask a question/)).toBeNull();
  });

  it("shows the two tabs, Teams first, and a tab click writes ?tab=departments to the address", async () => {
    stubGroupsFetch();
    mount();
    expect(screen.getByRole("tab", { name: "Teams" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("tab", { name: "Departments" }));
    expect(nav.replace).toHaveBeenCalledWith("/w/admin/teams?tab=departments", { scroll: false });
  });

  it("filters the directory by department through the API", async () => {
    const calls = stubGroupsFetch();
    mount();
    await screen.findByRole("table", { name: "Team directory" });
    fireEvent.click(document.querySelector('[role=search] button[aria-label="Department"]')!);
    fireEvent.click(await screen.findByRole("option", { name: "Consulting" }));
    await waitFor(() => expect(calls.some((c) => c.url.includes("/groups/directory") && c.url.includes("departmentId=11"))).toBe(true));
  });

  it("creates a team under a department with a lead and people: one create, then one idempotent move", async () => {
    const calls = stubGroupsFetch();
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Create team" }));
    const sheet = await screen.findByRole("dialog", { name: "Create team" });
    fireEvent.change(within(sheet).getByLabelText(/Team name/), { target: { value: "Delivery Pod" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Department" }));
    fireEvent.click(await screen.findByRole("option", { name: "Consulting" }));
    fireEvent.focus(within(sheet).getByRole("combobox", { name: "Team lead" }));
    fireEvent.click(within(await within(sheet).findByRole("option", { name: /Hana Petrov/ })).getByRole("button"));
    fireEvent.focus(within(sheet).getByRole("combobox", { name: "Add people to the team" }));
    fireEvent.click(within(await within(sheet).findByRole("option", { name: /Amara Silva/ })).getByRole("button"));
    expect(within(sheet).getByRole("list", { name: "People in the new team" })).toBeTruthy();
    fireEvent.click(within(sheet).getByRole("button", { name: "Create team" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/members"))).toBe(true));
    const create = calls.find((c) => c.method === "POST" && !c.url.endsWith("/members"))!;
    expect(create.body).toMatchObject({ name: "Delivery Pod", kind: "TEAM", parentGroupId: 11, leadMemberId: 4 });
    const move = calls.find((c) => c.method === "POST" && c.url.endsWith("/members"))!;
    expect(move.url).toContain("/groups/99/members");
    expect(move.body).toEqual({ memberIds: [1] });
    expect(move.headers["idempotency-key"]).toMatch(/^[0-9a-f-]{20,}/);
  });

  it("moves a team under another department from its sheet, with Undo", async () => {
    const calls = stubGroupsFetch();
    mount();
    const cards = await screen.findByRole("table", { name: "Team directory" });
    fireEvent.click(within(cards).getByText("Bench East"));
    const sheet = await screen.findByRole("dialog", { name: "Bench East" });
    fireEvent.click(await within(sheet).findByRole("button", { name: "Department of this team" }));
    fireEvent.click(await screen.findByRole("option", { name: "Marketing" }));
    await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true));
    const patch = calls.find((c) => c.method === "PATCH")!;
    expect(patch.body).toEqual({ parentGroupId: 12 });
    expect(patch.headers["if-match"]).toBe(BENCH.version);
    expect(await screen.findByRole("button", { name: "Undo" })).toBeTruthy();
  });

  it("explains a refused delete from the API in plain words", async () => {
    stubGroupsFetch({ answer: (c) => (c.method === "PATCH" ? { status: 412, body: { error: "stale", code: "PRECONDITION_FAILED", currentVersion: 'W/"5"' } } : null) });
    mount();
    const cards = await screen.findByRole("table", { name: "Team directory" });
    fireEvent.click(within(cards).getByText("Bench East"));
    const sheet = await screen.findByRole("dialog", { name: "Bench East" });
    fireEvent.click(await within(sheet).findByRole("button", { name: "Archive" }));
    expect(await screen.findByText(/Someone else changed this just now/)).toBeTruthy();
  });

  it("read-only viewers see the teams but no create button or edit controls", async () => {
    stubGroupsFetch();
    mount(false);
    const cards = await screen.findByRole("table", { name: "Team directory" });
    expect(screen.queryByRole("button", { name: /Create team/ })).toBeNull();
    fireEvent.click(within(cards).getByText("Bench East"));
    const sheet = await screen.findByRole("dialog", { name: "Bench East" });
    await within(sheet).findByRole("list", { name: "People in this group" });
    expect(within(sheet).queryByRole("button", { name: "Archive" })).toBeNull();
    expect(within(sheet).queryByRole("combobox", { name: "Change lead" })).toBeNull();
  });
});

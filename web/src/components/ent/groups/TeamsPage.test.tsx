// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { ToastProvider } from "@kiwiply/ui";
import TeamsPage from "./TeamsPage";
import { BENCH, STRUCTURE, stubGroupsFetch } from "./groups.fixtures";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const mount = (canManage = true) =>
  render(
    <ToastProvider>
      <TeamsPage orgId={2} canManage={canManage} />
    </ToastProvider>,
  );

describe("TeamsPage (X4.5)", () => {
  it("shows real KPI tiles, the team cards with the people stack and the department, and no invented numbers", async () => {
    stubGroupsFetch();
    mount();
    const tiles = await screen.findByRole("region", { name: "Team numbers" });
    for (const label of ["Total Teams", "Total Team Members", "Team Leads", "Avg. Team Size"]) expect(within(tiles).getByText(label)).toBeTruthy();
    const cards = await screen.findByRole("list", { name: "Teams" });
    const card = within(cards).getByText("Bench East").closest("li")!;
    expect(within(card).getByText("Consulting")).toBeTruthy();
    expect(within(card).getByText("2 members")).toBeTruthy();
    expect(within(card).getByRole("img", { name: "2 people" })).toBeTruthy();
    expect(screen.queryByText(/workload/i)).toBeNull();
    expect(screen.queryByText(/open roles/i)).toBeNull();
  });

  it("says plainly that team performance is not measured yet instead of drawing a chart", async () => {
    stubGroupsFetch();
    mount();
    const note = await screen.findByText(/Nothing measures team performance yet/);
    expect(note.closest("[data-team-performance-empty]")).toBeTruthy();
    expect(document.querySelector("svg[role='img'][aria-label*='performance' i]")).toBeNull();
  });

  it("filters the cards by department and search without asking the API again", async () => {
    const calls = stubGroupsFetch({
      structure: { ...STRUCTURE, unassignedTeams: [{ ...BENCH, id: 22, name: "Floating", parentGroupId: null, parentName: null }] },
    });
    mount();
    const cards = await screen.findByRole("list", { name: "Teams" });
    expect(within(cards).getByText("Floating")).toBeTruthy();
    const before = calls.length;
    fireEvent.change(screen.getByRole("searchbox", { name: "Search teams" }), { target: { value: "float" } });
    await waitFor(() => expect(within(screen.getByRole("list", { name: "Teams" })).queryByText("Bench East")).toBeNull());
    expect(calls.length).toBe(before);
  });

  it("creates a team under a department with a lead and people: one create, then one idempotent move", async () => {
    const calls = stubGroupsFetch();
    mount();
    fireEvent.click(await screen.findByRole("button", { name: /Create Team/ }));
    const sheet = await screen.findByRole("dialog", { name: "Create Team" });
    fireEvent.change(within(sheet).getByLabelText(/Team name/), { target: { value: "Delivery Pod" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Department" }));
    fireEvent.click(await screen.findByRole("option", { name: "Consulting" }));
    fireEvent.focus(within(sheet).getByRole("combobox", { name: "Team lead" }));
    fireEvent.click(within(await within(sheet).findByRole("option", { name: /Hana Petrov/ })).getByRole("button"));
    fireEvent.focus(within(sheet).getByRole("combobox", { name: "Add people to the team" }));
    fireEvent.click(within(await within(sheet).findByRole("option", { name: /Amara Silva/ })).getByRole("button"));
    expect(within(sheet).getByRole("list", { name: "People in the new team" })).toBeTruthy();
    fireEvent.click(within(sheet).getByRole("button", { name: "Create Team" }));
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
    const cards = await screen.findByRole("list", { name: "Teams" });
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
    const cards = await screen.findByRole("list", { name: "Teams" });
    fireEvent.click(within(cards).getByText("Bench East"));
    const sheet = await screen.findByRole("dialog", { name: "Bench East" });
    fireEvent.click(await within(sheet).findByRole("button", { name: "Archive" }));
    expect(await screen.findByText(/Someone else changed this just now/)).toBeTruthy();
  });

  it("read-only viewers see the teams but no create button or edit controls", async () => {
    stubGroupsFetch();
    mount(false);
    const cards = await screen.findByRole("list", { name: "Teams" });
    expect(screen.queryByRole("button", { name: /Create Team/ })).toBeNull();
    fireEvent.click(within(cards).getByText("Bench East"));
    const sheet = await screen.findByRole("dialog", { name: "Bench East" });
    await within(sheet).findByRole("list", { name: "People in this group" });
    expect(within(sheet).queryByRole("button", { name: "Archive" })).toBeNull();
    expect(within(sheet).queryByRole("combobox", { name: "Change lead" })).toBeNull();
  });
});

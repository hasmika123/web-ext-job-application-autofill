// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TeamPage from "./TeamPage";

const team = {
  items: [
    {
      memberId: 103,
      name: "Sarah Chen",
      title: "Marketing Manager",
      status: "ACTIVE",
      capacity: 10,
      assigned: 7,
      percent: 70,
      overloaded: false,
      openApprovals: 1,
      openEscalations: 0,
      lastActiveAt: "2026-11-28T08:00:00Z",
      canManage: true,
    },
  ],
  page: 0,
  size: 25,
  total: 1,
  hasMore: false,
};

let calls: string[];

beforeEach(() => {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      calls.push(input);
      return new Response(JSON.stringify(team), { status: 200, headers: { "content-type": "application/json" } });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Marketing Manager Team filters", () => {
  it("uses the shared styled listboxes and still reloads after a selection", async () => {
    render(<TeamPage orgId={2} orgName="Acme" firstName="Sarah" hrefs={{}} />);
    await screen.findByText("Sarah Chen");

    expect(screen.queryByRole("combobox", { name: "Status" })).toBeNull();
    const status = screen.getByRole("button", { name: "Status" });
    expect(status.getAttribute("aria-haspopup")).toBe("listbox");

    fireEvent.click(status);
    fireEvent.click(screen.getByRole("option", { name: "Paused" }));

    await waitFor(() => expect(calls.some((url) => url.includes("status=PAUSED"))).toBe(true));
  });
});

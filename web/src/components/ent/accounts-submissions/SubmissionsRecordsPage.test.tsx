// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const url = vi.hoisted(() => {
  let params = new URLSearchParams("");
  const listeners = new Set<() => void>();
  return {
    get: () => params,
    set: (qs: string) => {
      params = new URLSearchParams(qs);
      listeners.forEach((l) => l());
    },
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
});

vi.mock("next/navigation", async () => {
  const react = await import("react");
  return {
    useRouter: () => ({ replace: (to: string) => url.set(to.includes("?") ? to.split("?")[1] : ""), push: vi.fn(), refresh: vi.fn() }),
    usePathname: () => "/w/accounts/submissions",
    useSearchParams: () => react.useSyncExternalStore(url.subscribe, url.get, url.get),
  };
});

import SubmissionsRecordsPage from "./SubmissionsRecordsPage";
import type { SubmissionRow } from "@/lib/ent/submissions-records";

const sub = (id: number, name: string, status: SubmissionRow["status"], approval = "APPROVED"): SubmissionRow => ({
  id,
  code: `SUB-${id}`,
  consultant: { id, name, initials: name.slice(0, 2).toUpperCase() },
  clientId: 5,
  clientName: "Acme Corp",
  requirementId: 7,
  requirementTitle: "Backend Role",
  status,
  approvalState: approval,
  submittedOn: status === "DRAFT" ? null : "2026-10-10T09:00:00Z",
  preparedBy: "Omar Haddad",
  note: null,
  createdAt: "2026-10-09T09:00:00Z",
});

let calls: { method: string; url: string }[];
let items: SubmissionRow[];

function stubApi() {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init: RequestInit = {}) => {
      calls.push({ method: init.method ?? "GET", url: input });
      const u = new URL(input, "http://x");
      if (u.pathname.endsWith("/counts")) {
        return { ok: true, status: 200, json: async () => ({ total: 3, byStatus: { SUBMITTED: 1, CLIENT_REVIEW: 1, INTERVIEW_REQUESTED: 0, REJECTED: 0, DRAFT: 1 }, awaitingApproval: 1 }) } as Response;
      }
      const status = u.searchParams.get("status");
      const found = items.filter((r) => !status || r.status === status);
      return { ok: true, status: 200, json: async () => ({ items: found, page: 0, size: 10, total: found.length, hasNext: false }) } as Response;
    }),
  );
}

function screenSize(phone: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: phone && query.includes("max-width: 767px"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

const settle = async (ms = 50) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  url.set("");
  items = [sub(1, "Casey One", "SUBMITTED"), sub(2, "Robin Two", "CLIENT_REVIEW"), sub(3, "Sam Three", "DRAFT", "DRAFT")];
  stubApi();
  screenSize(false);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function mount() {
  render(<SubmissionsRecordsPage orgId={2} orgName="Acme Corp" />);
  await settle(0);
}

describe("the Accounts Submissions page (records only)", () => {
  it("lists the submissions with the consultant, requirement, client, status and approval, and draws the four tiles", async () => {
    await mount();
    const rows = Array.from(document.querySelectorAll("tr[data-row-id]"));
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toContain("Casey One");
    expect(rows[0].textContent).toContain("Backend Role");
    expect(rows[0].textContent).toContain("Acme Corp");
    expect(rows[0].querySelector("[data-submission-status]")?.textContent).toBe("Submitted");
    expect(rows[2].textContent).toContain("Not sent for approval");
    expect(rows[2].textContent).toContain("Not yet");
    expect(Array.from(document.querySelectorAll("[data-tile]")).map((e) => e.getAttribute("data-tile"))).toEqual(["total", "review", "interview", "awaiting"]);
    expect(document.querySelector("[data-tile=total] [data-tile-value]")?.textContent).toBe("3");
    expect(document.querySelector("[data-tile=awaiting] [data-tile-value]")?.textContent).toBe("1");
  });

  it("has no submit, approve, edit or delete control and only ever reads", async () => {
    await mount();
    const buttons = screen.getAllByRole("button").map((b) => b.textContent ?? "");
    expect(buttons.join("|")).not.toMatch(/submit|approve|edit|delete|send|apply/i);
    expect(document.querySelector("form")).toBeNull();
    expect(calls.every((c) => c.method === "GET")).toBe(true);
  });

  it("filters by status through the URL", async () => {
    await mount();
    fireEvent.click(screen.getByRole("tab", { name: "Client review (1)" }));
    await settle();
    expect(url.get().get("status")).toBe("CLIENT_REVIEW");
    expect(document.querySelectorAll("tr[data-row-id]")).toHaveLength(1);
  });

  it("shows an empty state when nothing matches", async () => {
    items = [];
    await mount();
    expect(screen.getByText("No submissions here")).toBeTruthy();
  });

  it("shows cards on a phone", async () => {
    screenSize(true);
    await mount();
    expect(document.querySelector("[data-submissions-table]")).toBeNull();
    expect(document.querySelectorAll("[data-submission-cards] li")).toHaveLength(3);
  });
});

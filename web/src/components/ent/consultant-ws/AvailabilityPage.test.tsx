// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/w/consultant/availability" }));

import { ToastProvider } from "@kiwiply/ui";
import AvailabilityPage from "./AvailabilityPage";

const TODAY = "2026-10-14";
const block = (o: Record<string, unknown>) => ({ id: 1, kind: "VACATION", startDate: "2026-10-20", endDate: "2026-10-21", days: 2, reason: "Personal vacation", status: "APPROVED", sample: false, ...o });
let current: Record<string, unknown>;
let calls: { method: string; url: string; body: unknown }[];
let writeStatus = 200;
let writeBody: unknown = null;

const view = (o: Record<string, unknown> = {}) => ({
  orgId: 2,
  generatedAt: "2026-10-14T10:00:00Z",
  today: TODAY,
  name: "Anika Rao",
  availability: { status: "AVAILABLE", since: "2026-10-01", availableFrom: "2026-10-28" },
  tiles: {
    availableFrom: { status: "AVAILABLE", date: "2026-10-28", daysFromNow: 14 },
    openOpportunities: { value: 8, previous: 6, deltaPct: 33.3, sparkline: [1, 2, 3, 4, 6, 8] },
    workMode: "HYBRID",
    notice: { weeks: 2, availableOn: "2026-10-28" },
    vacation: { year: 2026, approvedDays: 12, scheduledDays: 5, pendingDays: 3 },
  },
  preferences: { locations: ["New York, NY", "Austin, TX"], workAuthorization: "AUTHORIZED_NO_SPONSORSHIP", workMode: "HYBRID", employmentTypes: ["CONTRACT", "CONTRACT_TO_HIRE"], rateMinMinor: 11000, rateMaxMinor: 14000, rateNote: "Flexible based on role and scope", travelLabel: "OCCASIONAL", travelPercent: 25, noticeWeeks: 2 },
  blocks: [block({ id: 1 }), block({ id: 2, kind: "VACATION", startDate: "2026-12-23", endDate: "2027-01-03", days: 12, reason: "Holiday vacation", status: "PENDING", sample: true }), block({ id: 3, kind: "PERSONAL", startDate: "2027-01-17", endDate: "2027-01-17", days: 1, reason: "Personal day" }), block({ id: 4, kind: "VACATION", startDate: "2026-09-01", endDate: "2026-09-02", reason: "Earlier trip" })],
  history: [
    { id: 11, effectiveDate: "2026-10-01", availabilityStatus: "AVAILABLE", availableFrom: "2026-10-28", workMode: "HYBRID", status: "ACTIVE", sample: false },
    { id: 10, effectiveDate: "2026-08-01", availabilityStatus: "AVAILABLE", availableFrom: null, workMode: "REMOTE", status: "EXPIRED", sample: true },
  ],
  ...o,
});

beforeEach(() => {
  calls = [];
  current = view();
  writeStatus = 200;
  writeBody = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? "GET";
      calls.push({ method, url, body: init.body ? JSON.parse(String(init.body)) : undefined });
      const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
      if (method !== "GET") return json(writeBody ?? current, writeStatus);
      return json(current);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const flush = () => act(async () => void (await new Promise((res) => setTimeout(res, 20))));
async function mount() {
  render(
    <ToastProvider>
      <AvailabilityPage orgId={2} firstName="Anika Rao" />
    </ToastProvider>,
  );
  await flush();
}
const cell = (iso: string) => document.querySelector(`button[data-iso="${iso}"]`) as HTMLButtonElement;
const writes = () => calls.filter((c) => c.method !== "GET");

describe("Availability from real data", () => {
  it("draws one summary line from the API's numbers, with no tiles, Quick Actions or help card", async () => {
    await mount();
    expect(calls[0]).toMatchObject({ method: "GET", url: "/api/orgs/2/me-workspace/availability" });
    expect(document.querySelector("[data-consultant-availability]")!.getAttribute("data-status")).toBe("ready");
    expect(document.querySelector("[data-avail-summary]")!.textContent).toContain("Available from Oct 28, 2026 · 2 weeks notice · Hybrid");
    expect(document.querySelector("[data-stat-tile]")).toBeNull();
    expect(document.querySelector("[data-quick]")).toBeNull();
    expect(document.querySelector('[data-home-card="avail-prefs"]')).toBeNull();
    expect(screen.queryByText(/Quick Actions|Ask a question/)).toBeNull();
    expect(screen.queryByText(/has no screen on their side/)).toBeNull();
  });

  it("shows the calendar for the server's month, navigates, and returns with Today", async () => {
    await mount();
    expect(document.querySelector("[data-month-title]")!.textContent).toBe("October 2026");
    expect(cell("2026-10-14").getAttribute("data-today")).toBe("true");
    expect(cell("2026-10-20").getAttribute("data-paint")).toBe("VACATION");
    expect(cell("2026-10-29").getAttribute("data-paint")).toBe("AVAILABLE"); // a Thursday after the open date
    expect(cell("2026-10-16").getAttribute("data-paint")).toBe("none"); // before the open date
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(document.querySelector("[data-month-title]")!.textContent).toBe("November 2026");
    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    expect(document.querySelector("[data-month-title]")!.textContent).toBe("September 2026");
    expect(cell("2026-09-01").getAttribute("data-paint")).toBe("VACATION");
    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(document.querySelector("[data-month-title]")!.textContent).toBe("October 2026");
  });

  it("is keyboard accessible: one tab stop, arrow keys move by day and week", async () => {
    await mount();
    const stops = [...document.querySelectorAll<HTMLButtonElement>("button[data-iso]")].filter((b) => b.tabIndex === 0);
    expect(stops).toHaveLength(1);
    expect(stops[0].getAttribute("data-iso")).toBe("2026-10-14");
    expect(stops[0].getAttribute("aria-label")).toContain("today");
    const grid = screen.getByRole("grid");
    fireEvent.keyDown(grid, { key: "ArrowRight" });
    await flush();
    expect(document.activeElement).toBe(cell("2026-10-15"));
    fireEvent.keyDown(grid, { key: "ArrowDown" });
    await flush();
    expect(document.activeElement).toBe(cell("2026-10-22"));
    fireEvent.keyDown(grid, { key: "PageDown" });
    await flush();
    expect(document.querySelector("[data-month-title]")!.textContent).toBe("November 2026");
    expect(document.activeElement).toBe(cell("2026-11-22"));
  });

  it("clicking an empty day opens the sheet for a new entry and posts it", async () => {
    await mount();
    fireEvent.click(cell("2026-10-15"));
    await flush();
    const form = document.querySelector("[data-block-form]") as HTMLElement;
    expect(form).toBeTruthy();
    expect((within(form).getAllByDisplayValue("2026-10-15"))).toHaveLength(2);
    fireEvent.change(within(form).getByPlaceholderText("For example: Family trip"), { target: { value: "Dentist" } });
    fireEvent.click(within(form).getByRole("button", { name: "Add entry" }));
    await flush();
    expect(writes()).toHaveLength(1);
    expect(writes()[0]).toMatchObject({ method: "POST", url: "/api/orgs/2/me-workspace/availability/blocks" });
    expect(writes()[0].body).toMatchObject({ kind: "VACATION", startDate: "2026-10-15", endDate: "2026-10-15", reason: "Dentist" });
    expect(document.querySelector("[data-block-form]")).toBeNull();
  });

  it("clicking a day with an entry edits it, and an overlap refusal is shown without closing", async () => {
    await mount();
    fireEvent.click(cell("2026-10-21"));
    await flush();
    const form = document.querySelector("[data-block-form]") as HTMLElement;
    expect(within(form).getByDisplayValue("Personal vacation")).toBeTruthy();
    writeStatus = 409;
    writeBody = { error: "These dates overlap another entry on your calendar", code: "BLOCK_OVERLAP" };
    fireEvent.click(within(form).getByRole("button", { name: "Save changes" }));
    await flush();
    expect(writes()[0]).toMatchObject({ method: "PUT", url: "/api/orgs/2/me-workspace/availability/blocks/1" });
    expect(within(form).getByRole("alert").textContent).toContain("overlap");
    expect(document.querySelector("[data-block-form]")).toBeTruthy();
  });

  it("refuses an end date before the start date without calling the API", async () => {
    await mount();
    fireEvent.click(cell("2026-10-15"));
    await flush();
    const form = document.querySelector("[data-block-form]") as HTMLElement;
    const dates = within(form).getAllByDisplayValue("2026-10-15");
    fireEvent.change(dates[1], { target: { value: "2026-10-10" } });
    fireEvent.click(within(form).getByRole("button", { name: "Add entry" }));
    await flush();
    expect(writes()).toHaveLength(0);
    expect(within(form).getByRole("alert").textContent).toMatch(/can't be before/);
  });

  it("shows the personal-information message when the API refuses sensitive text", async () => {
    await mount();
    fireEvent.click(cell("2026-10-15"));
    await flush();
    const form = document.querySelector("[data-block-form]") as HTMLElement;
    writeStatus = 422;
    writeBody = { error: "reason: contains sensitive data", code: "SENSITIVE_CONTENT" };
    fireEvent.change(within(form).getByPlaceholderText("For example: Family trip"), { target: { value: "my SSN 123-45-6789" } });
    fireEvent.click(within(form).getByRole("button", { name: "Add entry" }));
    await flush();
    expect(within(form).getByRole("alert").textContent).toContain("never store personal identifiers");
  });

  it("lists upcoming unavailable dates (not past ones) with status pills, a sample mark, and deletes after asking", async () => {
    await mount();
    const rows = [...document.querySelectorAll("tr[data-block]")].map((r) => r.getAttribute("data-block"));
    expect(rows).toEqual(["1", "2", "3"]); // the September trip is over
    const r2 = document.querySelector('tr[data-block="2"]') as HTMLElement;
    expect(within(r2).getByText("Pending")).toBeTruthy();
    expect(within(r2).getByText("Sample")).toBeTruthy();
    expect(within(document.querySelector('tr[data-block="3"]') as HTMLElement).getByText("Personal")).toBeTruthy();
    fireEvent.click(within(document.querySelector('tr[data-block="1"]') as HTMLElement).getByRole("button", { name: /More actions/ }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Delete/ }));
    expect(screen.getByText("Delete this entry?")).toBeTruthy();
    expect(writes()).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Delete entry" }));
    await flush();
    expect(writes()[0]).toMatchObject({ method: "DELETE", url: "/api/orgs/2/me-workspace/availability/blocks/1" });
  });

  it("links work preferences to My Profile", async () => {
    await mount();
    const link = screen.getByRole("link", { name: "Edit work preferences on My Profile" });
    expect(link.getAttribute("href")).toBe("/w/consultant/profile");
  });

  it("Update availability saves the status and date, and redraws from the answer", async () => {
    await mount();
    fireEvent.click(document.querySelector("[data-update-availability]") as HTMLElement);
    await flush();
    const form = document.querySelector("[data-status-form]") as HTMLElement;
    expect(within(form).getByDisplayValue("2026-10-28")).toBeTruthy();
    fireEvent.change(within(form).getByDisplayValue("2026-10-28"), { target: { value: "2026-11-10" } });
    writeBody = view({ availability: { status: "AVAILABLE", since: TODAY, availableFrom: "2026-11-10" }, tiles: { ...(view().tiles as object), availableFrom: { status: "AVAILABLE", date: "2026-11-10", daysFromNow: 27 } } });
    fireEvent.click(within(form).getByRole("button", { name: "Save availability" }));
    await flush();
    expect(writes()[0]).toMatchObject({ method: "PUT", url: "/api/orgs/2/me-workspace/availability/status", body: { status: "AVAILABLE", availableFrom: "2026-11-10" } });
    expect(document.querySelector("[data-avail-summary]")!.textContent).toContain("Available from Nov 10, 2026");
    expect(document.querySelector("[data-status-form]")).toBeNull();
  });

  it("rejects a past available-from date in the form", async () => {
    await mount();
    fireEvent.click(document.querySelector("[data-update-availability]") as HTMLElement);
    await flush();
    const form = document.querySelector("[data-status-form]") as HTMLElement;
    fireEvent.change(within(form).getByDisplayValue("2026-10-28"), { target: { value: "2026-10-01" } });
    fireEvent.click(within(form).getByRole("button", { name: "Save availability" }));
    await flush();
    expect(writes()).toHaveLength(0);
    expect(within(form).getByRole("alert").textContent).toMatch(/today or a later/);
  });

  it("Edit notice, work mode, rate and travel saves the rate in minor units", async () => {
    await mount();
    fireEvent.click(document.querySelector("[data-edit-prefs]") as HTMLElement);
    await flush();
    const form = document.querySelector("[data-prefs-form]") as HTMLElement;
    fireEvent.change(within(form).getByDisplayValue("110"), { target: { value: "120.5" } });
    fireEvent.click(within(form).getByRole("button", { name: "Save preferences" }));
    await flush();
    expect(writes()[0]).toMatchObject({ method: "PUT", url: "/api/orgs/2/me-workspace/availability/preferences" });
    expect(writes()[0].body).toMatchObject({ workMode: "HYBRID", noticeWeeks: 2, rateMinMinor: 12050, rateMaxMinor: 14000, travelLabel: "OCCASIONAL", travelPercent: 25 });
  });

  it("Add blocked dates opens the entry sheet for today", async () => {
    await mount();
    fireEvent.click(document.querySelector("[data-add-blocked]") as HTMLElement);
    await flush();
    expect(writes()).toHaveLength(0);
    expect(document.querySelector("form")).toBeTruthy();
  });

  it("shows the history, and View All reveals the rest", async () => {
    current = view({ history: [1, 2, 3, 4, 5].map((i) => ({ id: i, effectiveDate: `2026-0${i}-01`, availabilityStatus: "AVAILABLE", availableFrom: null, workMode: "HYBRID", status: i === 5 ? "ACTIVE" : "EXPIRED", sample: false })) });
    await mount();
    expect(document.querySelectorAll("tr[data-history]")).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: /View all 5 history rows/ }));
    expect(document.querySelectorAll("tr[data-history]")).toHaveLength(5);
  });

  it("says so when there is nothing yet, with no made-up numbers", async () => {
    current = view({
      blocks: [],
      history: [],
      availability: { status: "UNAVAILABLE", since: null, availableFrom: null },
      tiles: { availableFrom: { status: "UNAVAILABLE", date: null, daysFromNow: null }, openOpportunities: { value: 0, previous: 0, deltaPct: null, sparkline: [0, 0, 0, 0, 0, 0] }, workMode: null, notice: { weeks: null, availableOn: null }, vacation: { year: 2026, approvedDays: 0, scheduledDays: 0, pendingDays: 0 } },
      preferences: { locations: [], workAuthorization: null, workMode: null, employmentTypes: [], rateMinMinor: null, rateMaxMinor: null, rateNote: null, travelLabel: null, travelPercent: null, noticeWeeks: null },
    });
    await mount();
    expect(screen.getByText(/No time off scheduled/)).toBeTruthy();
    expect(screen.getByText(/No changes yet/)).toBeTruthy();
    expect(document.querySelector("[data-avail-summary]")!.textContent).toContain("Not available");
    expect(document.querySelectorAll('button[data-paint="AVAILABLE"]')).toHaveLength(0);
  });

  it("denies a non-consultant politely", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
    await mount();
    expect(screen.getByText(/isn't part of your role/)).toBeTruthy();
  });
});

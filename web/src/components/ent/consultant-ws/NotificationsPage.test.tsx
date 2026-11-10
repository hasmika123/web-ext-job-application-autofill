// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/w/consultant/notifications" }));

import { ToastProvider } from "@kiwiply/ui";
import NotificationsPage from "./NotificationsPage";

const tile = (value: number, delta: number, deltaPct: number | null = null, vs = "week") => ({ value, previous: value - delta, delta, deltaPct, sparkline: [0, 1, 2, 3, 4, value], vs });
const row = (o: Record<string, unknown>) => ({
  id: 1, category: "JOB_MATCH", title: "New Job Match Available", body: "Senior Business Analyst at TechCorp matches your skills and preferences.", priority: "HIGH", actionLabel: "View",
  actionHref: "/w/consultant/matches", relatedType: "MATCH", relatedId: 4, status: "UNREAD", createdAt: "2026-10-14T08:00:00Z", readAt: null, resolvedAt: null, snoozedUntil: null, ...o,
});
const pref = (category: string, o: Record<string, unknown> = {}) => ({ category, enabled: true, email: true, inApp: true, sms: false, smsAvailable: false, critical: ["INTERVIEW", "APPROVAL", "OFFER"].includes(category), ...o });
const CATS = ["JOB_MATCH", "APPLICATION", "INTERVIEW", "APPROVAL", "OFFER", "MESSAGE", "REMINDER"];
const view = () => ({
  orgId: 2, generatedAt: "2026-10-14T10:00:00Z", name: "Anika Rao",
  tiles: { unread: tile(12, 3), highPriority: tile(4, 2), today: tile(5, 2, null, "day"), upcomingReminders: tile(8, 1), resolvedThisWeek: tile(26, 8, 40) },
  tabs: { ALL: 12, JOB_MATCH: 3, APPLICATION: 2, INTERVIEW: 2, APPROVAL: 1, OFFER: 1, MESSAGE: 2, REMINDER: 1 },
  notifications: {
    items: [
      row({ id: 1 }),
      row({ id: 2, category: "APPROVAL", title: "Submission Approval Requested", body: "A submission for Data Engineer is waiting.", priority: "MEDIUM", actionHref: "/w/consultant/submissions", readAt: "2026-10-14T09:00:00Z", status: "READ" }),
      row({ id: 3, category: "REMINDER", title: "Follow-up Overdue", body: "Send availability was due Oct 12.", priority: "HIGH", actionLabel: "Snooze", actionHref: "/w/consultant/tasks" }),
      row({ id: 4, category: "REMINDER", title: "Complete Your Profile", body: "Your profile is 40% complete.", priority: "LOW", actionLabel: "Update", actionHref: "/w/consultant/profile" }),
    ],
    page: 0, size: 8, total: 12, totalPages: 2,
  },
  categories: { period: "WEEK", vs: "last week", items: CATS.map((c, i) => ({ category: c, count: i + 1, previous: i === 0 ? 0 : 1, deltaPct: i === 0 ? null : i === 1 ? -50 : 100 })) },
  prefs: CATS.map((c) => pref(c)),
  muted: false,
});

let current: Record<string, unknown>;
let calls: { method: string; url: string; body?: unknown }[];
let writeStatus = 200;
let writeBody: unknown = { changed: 1 };

beforeEach(() => {
  calls = [];
  current = view();
  writeStatus = 200;
  writeBody = { changed: 1 };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? "GET";
      calls.push({ method, url, body: init.body ? JSON.parse(String(init.body)) : undefined });
      if (method !== "GET") return new Response(JSON.stringify(writeBody), { status: writeStatus, headers: { "content-type": "application/json" } });
      return new Response(JSON.stringify(current), { status: 200, headers: { "content-type": "application/json" } });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const flush = () => act(async () => void (await new Promise((res) => setTimeout(res, 20))));
async function mount() {
  render(
    <ToastProvider>
      <NotificationsPage orgId={2} />
    </ToastProvider>,
  );
  await flush();
}
const rowOf = (id: number) => document.querySelector(`li[data-notification="${id}"]`) as HTMLElement;
const gets = () => calls.filter((c) => c.method === "GET").map((c) => new URLSearchParams(c.url.split("?")[1] ?? ""));
const writes = () => calls.filter((c) => c.method !== "GET");

describe("Notifications from real data", () => {
  it("draws the tabs and rows from the API's answer, with no tiles, categories, preferences card, Quick Actions or help card", async () => {
    await mount();
    expect(document.querySelector("[data-consultant-notifications]")!.getAttribute("data-status")).toBe("ready");
    expect(calls[0].url).toMatch(/^\/api\/orgs\/2\/me-workspace\/notifications\?/);
    expect(document.querySelector("[data-stat-tile]")).toBeNull();
    expect(screen.getByRole("tab", { name: "All (12)" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Job Matches (3)" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Reminders (1)" })).toBeTruthy();
    expect(within(rowOf(1)).getByText("High")).toBeTruthy();
    expect(within(rowOf(1)).getAllByText("2 hours ago").length).toBeGreaterThan(0);
    expect(within(rowOf(1)).getByText("New Job Match Available").closest("a")!.getAttribute("href")).toBe("/w/consultant/matches");
    expect(within(rowOf(1)).getByRole("link", { name: /View: New Job Match/ }).getAttribute("href")).toBe("/w/consultant/matches");
    expect(within(rowOf(2)).getByRole("link", { name: /View: Submission/ }).getAttribute("href")).toBe("/w/consultant/submissions");
    expect(within(rowOf(4)).getByRole("link", { name: /Update: Complete/ }).getAttribute("href")).toBe("/w/consultant/profile");
    expect(within(rowOf(3)).getByRole("button", { name: /Snooze: Follow-up/ })).toBeTruthy();
    expect(rowOf(1).getAttribute("data-status")).toBe("UNREAD");
    expect(screen.getByText("Showing 1 to 4 of 12")).toBeTruthy();
    expect(document.querySelector("[data-category-tile]")).toBeNull();
    expect(document.querySelector("[data-pref]")).toBeNull();
    expect(document.querySelector("[data-quick]")).toBeNull();
    expect(screen.queryByText(/Quick Actions|Ask a question|Notifications by Category|Notification Preferences/)).toBeNull();
    // the two actions that are not reachable elsewhere, and the link to the preferences on My profile
    expect(screen.getByRole("button", { name: "Mark all as read" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mute non-critical" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Notification preferences" }).getAttribute("href")).toBe("/me#notifications");
  });

  it("says so when there is nothing to show", async () => {
    const v = view();
    current = { ...v, tabs: { ALL: 0 }, notifications: { items: [], page: 0, size: 8, total: 0, totalPages: 0 } };
    await mount();
    expect(screen.getByText(/You're all caught up/)).toBeTruthy();
  });

  it("asks the API for tabs, filters, search and the pager", async () => {
    await mount();
    fireEvent.click(screen.getByRole("tab", { name: "Reminders (1)" }));
    await flush();
    expect(gets().at(-1)!.get("category")).toBe("REMINDER");
    fireEvent.change(screen.getByLabelText("Priority"), { target: { value: "HIGH" } });
    await flush();
    expect(gets().at(-1)!.get("priority")).toBe("HIGH");
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "UNREAD" } });
    await flush();
    expect(gets().at(-1)!.get("status")).toBe("UNREAD");
    fireEvent.change(screen.getByLabelText("Search notifications"), { target: { value: "cloud" } });
    await act(async () => void (await new Promise((res) => setTimeout(res, 400))));
    await flush();
    expect(gets().at(-1)!.get("q")).toBe("cloud");
    expect(gets().at(-1)!.get("page")).toBe("0");
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    await flush();
    expect(gets().at(-1)!.get("page")).toBe("1");
  });

  it("the Status filter shows the resolved list", async () => {
    await mount();
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "RESOLVED" } });
    await flush();
    expect(gets().at(-1)!.get("status")).toBe("RESOLVED");
  });

  it("row menu: mark read or unread, resolve, snooze one day", async () => {
    await mount();
    fireEvent.click(within(rowOf(1)).getByRole("button", { name: /More actions for New Job Match/ }));
    fireEvent.click(await screen.findByText("Mark as read"));
    await flush();
    expect(writes().at(-1)).toMatchObject({ method: "POST", url: "/api/orgs/2/me-workspace/notifications/read", body: { ids: [1], read: true } });

    fireEvent.click(within(rowOf(2)).getByRole("button", { name: /More actions for Submission/ }));
    fireEvent.click(await screen.findByText("Mark as unread"));
    await flush();
    expect(writes().at(-1)!.body).toEqual({ ids: [2], read: false });

    fireEvent.click(within(rowOf(1)).getByRole("button", { name: /More actions for New Job Match/ }));
    fireEvent.click(await screen.findByText("Resolve"));
    await flush();
    expect(writes().at(-1)).toMatchObject({ url: "/api/orgs/2/me-workspace/notifications/resolve", body: { ids: [1] } });

    fireEvent.click(within(rowOf(1)).getByRole("button", { name: /More actions for New Job Match/ }));
    fireEvent.click(await screen.findByText("Snooze 1 day"));
    await flush();
    const snooze = writes().at(-1)!;
    expect(snooze.url).toBe("/api/orgs/2/me-workspace/notifications/snooze");
    const until = Date.parse((snooze.body as { until: string }).until);
    expect(until - Date.now()).toBeGreaterThan(23 * 3600 * 1000);
    expect(until - Date.now()).toBeLessThanOrEqual(24 * 3600 * 1000);
  });

  it("the Snooze button of a reminder snoozes it in place", async () => {
    await mount();
    fireEvent.click(within(rowOf(3)).getByRole("button", { name: /Snooze: Follow-up/ }));
    await flush();
    expect(writes().at(-1)).toMatchObject({ url: "/api/orgs/2/me-workspace/notifications/snooze", body: { ids: [3] } });
  });

  it("bulk actions work on the selected rows and clear the selection", async () => {
    await mount();
    expect(document.querySelector("[data-bulk]")).toBeNull();
    fireEvent.click(screen.getByLabelText("Select New Job Match Available"));
    fireEvent.click(screen.getByLabelText("Select Follow-up Overdue"));
    expect(screen.getByText("2 selected")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Mark selected read" }));
    await flush();
    expect(writes().at(-1)).toMatchObject({ url: "/api/orgs/2/me-workspace/notifications/read", body: { ids: [1, 3], read: true } });
    expect(document.querySelector("[data-bulk]")).toBeNull();

    fireEvent.click(screen.getByLabelText("Select all on this page"));
    fireEvent.click(screen.getByRole("button", { name: "Resolve" }));
    await flush();
    expect(writes().at(-1)).toMatchObject({ url: "/api/orgs/2/me-workspace/notifications/resolve", body: { ids: [1, 2, 3, 4] } });
  });

  it("delete hides the row, offers Undo and sends nothing until the window ends", async () => {
    await mount();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fireEvent.click(within(rowOf(4)).getByRole("button", { name: /More actions for Complete Your Profile/ }));
    fireEvent.click(await screen.findByText("Delete"));
    expect(rowOf(4)).toBeNull();
    expect(writes()).toHaveLength(0);
    fireEvent.click(await screen.findByText("Undo"));
    expect(rowOf(4)).toBeTruthy();
    await act(async () => void (await vi.advanceTimersByTimeAsync(7000)));
    expect(writes()).toHaveLength(0);

    fireEvent.click(within(rowOf(4)).getByRole("button", { name: /More actions for Complete Your Profile/ }));
    fireEvent.click(await screen.findByText("Delete"));
    await act(async () => void (await vi.advanceTimersByTimeAsync(7000)));
    expect(writes().at(-1)).toMatchObject({ method: "DELETE", url: "/api/orgs/2/me-workspace/notifications/4" });
  });

  it("Mark All as Read writes, and a refusal is shown without changing the page", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "Mark all as read" }));
    await flush();
    expect(writes().at(-1)).toMatchObject({ method: "POST", url: "/api/orgs/2/me-workspace/notifications/mark-all-read" });

    writeStatus = 409;
    writeBody = { error: "A resolved notification cannot be snoozed." };
    fireEvent.click(within(rowOf(3)).getByRole("button", { name: /Snooze: Follow-up/ }));
    await flush();
    expect(document.querySelector("[data-notice]")!.textContent).toContain("cannot be snoozed");
  });

  it("Mute writes and Undo puts the previous preferences back", async () => {
    await mount();
    writeBody = { previous: CATS.map((c) => pref(c)), prefs: CATS.map((c) => pref(c, { enabled: ["INTERVIEW", "APPROVAL", "OFFER"].includes(c) })), muted: true };
    fireEvent.click(screen.getByRole("button", { name: "Mute non-critical" }));
    await flush();
    expect(writes().at(-1)).toMatchObject({ method: "POST", url: "/api/orgs/2/me-workspace/notifications/mute-non-critical" });
    fireEvent.click(await screen.findByText("Undo"));
    await flush();
    const undo = writes().at(-1)!;
    expect(undo).toMatchObject({ method: "PUT", url: "/api/orgs/2/me-workspace/notifications/preferences" });
    expect((undo.body as { items: unknown[] }).items).toHaveLength(7);
    expect(JSON.stringify(undo.body)).not.toContain("sms");
  });

  it("an already muted account cannot be muted again", async () => {
    current = { ...view(), muted: true };
    await mount();
    expect((screen.getByRole("button", { name: "Mute non-critical" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows an error panel with retry when the page fails to load", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    await mount();
    expect(document.querySelector("[data-consultant-notifications]")!.getAttribute("data-status")).toBe("failed");
    expect(screen.getByText(/didn't load/i)).toBeTruthy();
  });

  it("shows the not-your-role panel on a 404", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
    await mount();
    expect(screen.getByText(/isn't part of your role/)).toBeTruthy();
  });
});

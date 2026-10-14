import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_FILTERS,
  channelSummary,
  deleteNotifications,
  parseNotifications,
  parseRow,
  previousOf,
  primaryAction,
  queryString,
  relativeTime,
  safeHref,
  signed,
  snoozeUntil,
  withFilter,
  type NRow,
} from "./notifications";

const tile = { value: 3, previous: 1, delta: 2, deltaPct: null, sparkline: [0, 1, 2], vs: "week" };
const row = (o: Record<string, unknown> = {}) => ({
  id: 1, category: "JOB_MATCH", title: "New Job Match Available", body: "Senior Analyst at TechCorp", priority: "HIGH", actionLabel: "View", actionHref: "/w/consultant/matches",
  relatedType: "MATCH", relatedId: 4, status: "UNREAD", createdAt: "2026-10-14T08:00:00Z", readAt: null, resolvedAt: null, snoozedUntil: null, ...o,
});
const body = (o: Record<string, unknown> = {}) => ({
  orgId: 2, generatedAt: "2026-10-14T10:00:00Z", name: "Anika Rao",
  tiles: { unread: tile, highPriority: tile, today: { ...tile, vs: "day" }, upcomingReminders: tile, resolvedThisWeek: { ...tile, deltaPct: 40 } },
  tabs: { ALL: 2, JOB_MATCH: 1 },
  notifications: { items: [row(), row({ id: 2, category: "REMINDER", actionLabel: "Snooze", actionHref: "/w/consultant/tasks" })], page: 0, size: 8, total: 2, totalPages: 1 },
  categories: { period: "WEEK", vs: "last week", items: [{ category: "JOB_MATCH", count: 1, previous: 0, deltaPct: null }] },
  prefs: [{ category: "JOB_MATCH", enabled: true, email: true, inApp: true, sms: true, smsAvailable: true, critical: false }],
  muted: false,
  ...o,
});

afterEach(() => vi.unstubAllGlobals());

describe("parseNotifications", () => {
  it("reads the wire shape and never trusts the SMS flags", () => {
    const v = parseNotifications(body())!;
    expect(v.tiles.unread.delta).toBe(2);
    expect(v.tiles.unread.deltaPct).toBeNull();
    expect(v.tiles.today.vs).toBe("day");
    expect(v.tiles.resolvedThisWeek.deltaPct).toBe(40);
    expect(v.tabs.ALL).toBe(2);
    expect(v.notifications.items).toHaveLength(2);
    expect(v.categories.items[0].category).toBe("JOB_MATCH");
    expect(v.prefs[0].sms).toBe(false);
    expect(v.prefs[0].smsAvailable).toBe(false);
  });

  it("drops rows it cannot read and refuses a body without a feed", () => {
    const v = parseNotifications(body({ notifications: { items: [row(), { id: "x" }, row({ category: "SPAM" }), row({ priority: "URGENT" })], page: 0, size: 8, total: 1, totalPages: 1 } }))!;
    expect(v.notifications.items).toHaveLength(1);
    expect(parseNotifications({ tiles: {} })).toBeNull();
    expect(parseNotifications(null)).toBeNull();
  });
});

describe("safeHref", () => {
  it("only lets an internal consultant path through", () => {
    expect(safeHref("/w/consultant/offers")).toBe("/w/consultant/offers");
    expect(safeHref("/w/consultant/matches?tab=new")).toBe("/w/consultant/matches?tab=new");
    for (const bad of ["https://evil.example", "//evil.example", "/w/employer/x", "/w/consultant/../a", "javascript:alert(1)", 5, null]) expect(safeHref(bad)).toBeNull();
    expect(parseRow(row({ actionHref: "https://evil.example/x" }))!.actionHref).toBeNull();
  });
});

describe("helpers", () => {
  const now = Date.parse("2026-10-14T10:00:00Z");
  it("says how long ago", () => {
    expect(relativeTime("2026-10-14T09:59:40Z", now)).toBe("Just now");
    expect(relativeTime("2026-10-14T09:58:00Z", now)).toBe("2 minutes ago");
    expect(relativeTime("2026-10-14T08:00:00Z", now)).toBe("2 hours ago");
    expect(relativeTime("2026-10-13T09:00:00Z", now)).toBe("1 day ago");
    expect(relativeTime("2026-10-12T09:00:00Z", now)).toBe("2 days ago");
    expect(relativeTime("2026-07-01T09:00:00Z", now)).toBe("3 months ago");
    expect(relativeTime(null, now)).toBe("");
    expect(relativeTime("not a date", now)).toBe("");
  });

  it("signs counts and summarises channels without SMS", () => {
    expect(signed(3)).toBe("+3");
    expect(signed(-2)).toBe("-2");
    expect(signed(0)).toBe("0");
    const p = parseNotifications(body())!.prefs[0];
    expect(channelSummary(p)).toBe("Email, In-app");
    expect(channelSummary({ ...p, email: false })).toBe("In-app");
    expect(channelSummary({ ...p, email: false, inApp: false })).toBe("No channels");
  });

  it("picks the row's primary button", () => {
    const r = (o: Record<string, unknown>) => parseRow(row(o)) as NRow;
    expect(primaryAction(r({}))).toEqual({ kind: "link", label: "View", href: "/w/consultant/matches" });
    expect(primaryAction(r({ actionLabel: "Respond", actionHref: "/w/consultant/opportunities" }))).toEqual({ kind: "link", label: "Respond", href: "/w/consultant/opportunities" });
    expect(primaryAction(r({ actionLabel: "Snooze", actionHref: "/w/consultant/tasks" }))).toEqual({ kind: "snooze", label: "Snooze" });
    expect(primaryAction(r({ status: "RESOLVED", actionLabel: "Snooze" }))).toEqual({ kind: "link", label: "View", href: "/w/consultant/matches" });
    expect(primaryAction(r({ actionLabel: null, actionHref: null }))).toBeNull();
  });

  it("builds the query and resets the page on a filter change", () => {
    expect(queryString(DEFAULT_FILTERS)).toBe("status=ACTIVE&period=WEEK&page=0&size=8");
    const f = withFilter({ ...DEFAULT_FILTERS, page: 3 }, { category: "OFFER", priority: "HIGH", q: "  cloud " });
    expect(f.page).toBe(0);
    expect(queryString(f)).toBe("status=ACTIVE&category=OFFER&priority=HIGH&q=cloud&period=WEEK&page=0&size=8");
    expect(withFilter(f, { page: 2 }).page).toBe(2);
  });

  it("snoozes for one day and reads the previous preferences from a mute answer", () => {
    expect(Date.parse(snoozeUntil(now)) - now).toBe(24 * 3600 * 1000);
    expect(previousOf({ ok: true, body: { previous: [{ category: "OFFER", enabled: false }, { category: "NOPE" }] } })).toEqual([
      { category: "OFFER", enabled: false, email: true, inApp: true, sms: false, smsAvailable: false, critical: false },
    ]);
    expect(previousOf({ ok: false })).toEqual([]);
  });
});

describe("writes", () => {
  it("deletes one with DELETE and several with the bulk route", async () => {
    const calls: { method: string; url: string }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ method: init.method ?? "GET", url });
      return new Response(JSON.stringify({ changed: 1 }), { status: 200 });
    }));
    await deleteNotifications(2, [5]);
    await deleteNotifications(2, [5, 6]);
    expect(calls).toEqual([
      { method: "DELETE", url: "/api/orgs/2/me-workspace/notifications/5" },
      { method: "POST", url: "/api/orgs/2/me-workspace/notifications/delete" },
    ]);
  });
});

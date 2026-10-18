import { describe, expect, it } from "vitest";
import {
  activityHref,
  alertsOf,
  comparedToText,
  deltaFromPct,
  firstNameOf,
  moduleName,
  parseDashboard,
  relativeTime,
  statTileOf,
  unavailableText,
  widgetOf,
  type DashboardWidget,
} from "./dashboard";

const w = (over: Partial<DashboardWidget>): DashboardWidget => ({ key: "k", state: "ok", reason: null, module: null, data: null, ...over });

describe("parseDashboard", () => {
  it("keeps the order, drops what is not a widget, and is null for anything that is not the contract", () => {
    const v = parseDashboard({ orgId: 2, generatedAt: "2026-10-13T10:00:00Z", widgets: [{ key: "a", state: "ok", data: { x: 1 } }, { key: "b", state: "weird" }, { state: "ok" }, { key: "c", state: "unavailable", reason: "NOT_ENABLED", module: "applications" }] });
    expect(v?.widgets.map((x) => x.key)).toEqual(["a", "c"]);
    expect(widgetOf(v, "c")?.module).toBe("applications");
    expect(widgetOf(v, "zzz")).toBeNull();
    expect(parseDashboard(null)).toBeNull();
    expect(parseDashboard({ orgId: "2", widgets: [] })).toBeNull();
    expect(parseDashboard({ orgId: 2 })).toBeNull();
  });
});

describe("statTileOf", () => {
  it("is null unless the widget is ok with a real numeric value", () => {
    expect(statTileOf(null)).toBeNull();
    expect(statTileOf(w({ state: "unavailable", data: { value: 5 } }))).toBeNull();
    expect(statTileOf(w({ state: "empty", data: { value: 5 } }))).toBeNull();
    expect(statTileOf(w({ data: { value: "5" } }))).toBeNull();
    expect(statTileOf(w({ data: { value: NaN } }))).toBeNull();
  });
  it("reads value, delta (null stays null), sparkline and counts", () => {
    const t = statTileOf(w({ data: { value: 7, previous: 0, deltaPct: null, sparkline: [1, "x", 2], comparedTo: "30d", counts: { active: 7, bad: "x" } } }))!;
    expect(t).toMatchObject({ value: 7, previous: 0, deltaPct: null, sparkline: [1, 2], counts: { active: 7 } });
  });
});

describe("deltaFromPct", () => {
  it("null draws nothing; zero is flat; sign gives direction; small values keep one decimal", () => {
    expect(deltaFromPct(null)).toBeNull();
    expect(deltaFromPct(NaN)).toBeNull();
    expect(deltaFromPct(0)).toEqual({ dir: "flat", text: "0%" });
    expect(deltaFromPct(12.4)).toEqual({ dir: "up", text: "12%" });
    expect(deltaFromPct(-6)).toEqual({ dir: "down", text: "6%" });
    expect(deltaFromPct(3.46)).toEqual({ dir: "up", text: "3.5%" });
  });
});

describe("words", () => {
  it("compared-to text", () => {
    expect(comparedToText("30d")).toBe("vs last month");
    expect(comparedToText("7d")).toBe("vs last week");
    expect(comparedToText("whatever")).toBe("vs earlier");
  });
  it("module names read as words", () => {
    expect(moduleName("applications")).toBe("Applications");
    expect(moduleName("hrFinance")).toBe("HR and Finance");
    expect(moduleName("someNewModule")).toBe("Some New Module");
    expect(unavailableText("interviews")).toBe("Available when Interviews launches");
    expect(unavailableText(null)).toBe("Available when this module launches");
  });
  it("first name", () => {
    expect(firstNameOf("Sarah Chen")).toBe("Sarah");
    expect(firstNameOf("  ")).toBe("there");
  });
});

describe("relativeTime", () => {
  const now = Date.parse("2026-10-13T12:00:00Z");
  const at = (ms: number) => new Date(now - ms).toISOString();
  it("is relative then a date", () => {
    expect(relativeTime(at(10_000), now)).toBe("just now");
    expect(relativeTime(at(60_000), now)).toBe("1 minute ago");
    expect(relativeTime(at(5 * 60_000), now)).toBe("5 minutes ago");
    expect(relativeTime(at(3600_000), now)).toBe("1 hour ago");
    expect(relativeTime(at(3 * 3600_000), now)).toBe("3 hours ago");
    expect(relativeTime(at(24 * 3600_000), now)).toBe("1 day ago");
    expect(relativeTime(at(3 * 24 * 3600_000), now)).toBe("3 days ago");
    expect(relativeTime("not a date", now)).toBe("");
  });
  it("a time in the future never reads negative", () => {
    expect(relativeTime(new Date(now + 5000).toISOString(), now)).toBe("just now");
  });
});

describe("lists", () => {
  it("alerts sort danger, warn, info and drop malformed rows", () => {
    const list = alertsOf(w({ data: { items: [{ key: "I", severity: "info", title: "i" }, { key: "D", severity: "danger", title: "d" }, { key: "X", severity: "nope", title: "x" }, { key: "W", severity: "warn", title: "w", href: "/a" }] } }));
    expect(list.map((a) => a.key)).toEqual(["D", "W", "I"]);
    expect(list[1].href).toBe("/a");
  });
  it("an alerts widget that is not ok has no rows", () => {
    expect(alertsOf(w({ state: "error", data: { items: [{ key: "D", severity: "danger", title: "d" }] } }))).toEqual([]);
  });
  it("activity links only for kinds that have a page", () => {
    const a = (action: string) => ({ id: 1, action, label: "", actorLogin: null, actorName: null, targetType: null, targetLogin: null, targetName: null, at: "", source: "audit", subject: null });
    expect(activityHref(a("MEMBER_INVITE_RESEND"))).toBe("/w/admin/invitations");
    expect(activityHref(a("MEMBER_ROLE"))).toBe("/w/admin/employees");
    expect(activityHref(a("BRANDING_PUBLISH"))).toBe("/w/admin/branding");
    expect(activityHref(a("ORG_SETTINGS"))).toBeNull();
  });
});

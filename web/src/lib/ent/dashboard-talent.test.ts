import { describe, expect, it } from "vitest";
import { activityHref, comparedToText, formatMoney, lastMonths, pipelineOf, statTileOf, teamOf, tileValueText, type DashboardWidget } from "./dashboard";

const w = (over: Partial<DashboardWidget>): DashboardWidget => ({ key: "k", state: "ok", reason: null, module: null, data: null, ...over });

describe("talent widget parsers", () => {
  it("teamOf keeps aligned series and lastMonths slices them together", () => {
    const t = teamOf(w({ data: { months: ["Jan", "Feb", "Mar"], series: [{ key: "a", label: "A", values: [1, 2, 3] }, { key: "b", label: "B", values: [4, "x", 6] }, { key: 1 }] } }))!;
    expect(t.series.map((s) => s.key)).toEqual(["a", "b"]);
    expect(t.series[1].values).toEqual([4, 0, 6]);
    const last2 = lastMonths(t, 2);
    expect(last2.months).toEqual(["Feb", "Mar"]);
    expect(last2.series[0].values).toEqual([2, 3]);
    expect(lastMonths(t, 12).months).toHaveLength(3);
    expect(teamOf(w({ state: "empty" }))).toBeNull();
    expect(teamOf(w({ state: "unavailable", data: { months: ["Jan"], series: [{ key: "a", label: "A", values: [5] }] } }))).toBeNull();
  });

  it("pipelineOf takes the API total, else the sum, and nothing from a widget that is not ok", () => {
    const slices = [{ key: "n", label: "New", value: 4 }, { key: "r", label: "R", value: 5 }];
    expect(pipelineOf(w({ data: { total: 9, slices } }))!.total).toBe(9);
    expect(pipelineOf(w({ data: { slices } }))!.total).toBe(9);
    expect(pipelineOf(w({ state: "unavailable", data: { slices } }))).toBeNull();
    expect(pipelineOf(null)).toBeNull();
  });

  it("money tiles format compactly from minor units, counts stay plain", () => {
    expect(formatMoney(32_800_000, "USD")).toBe("$328K");
    expect(formatMoney(12_345, "USD")).toBe("$123");
    const m = statTileOf(w({ data: { value: 32_800_000, previous: 1, deltaPct: 6, sparkline: [], comparedTo: "30d", counts: {}, unit: "money", currency: "USD" } }))!;
    expect(tileValueText(m)).toBe("$328K");
    expect(tileValueText(statTileOf(w({ data: { value: 1234, sparkline: [] } }))!)).toBe("1,234");
  });

  it("a 7 day comparison reads 'vs last week' and an application event leads to the applications page", () => {
    expect(comparedToText("7d")).toBe("vs last week");
    expect(comparedToText("30d")).toBe("vs last month");
    const a = { id: 1, action: "APPLICATION_CREATED", label: "", actorLogin: null, actorName: null, targetType: null, targetLogin: null, targetName: null, at: "", source: "application", subject: "Job" };
    expect(activityHref(a)).toBe("/w/admin/applications");
  });
});

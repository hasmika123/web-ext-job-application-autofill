import { describe, expect, it } from "vitest";
import { overviewFixture } from "./reports.fixture";
import { csvCell, deltaText, durationText, isEmptyOverview, overviewCsv, parseOverview, reportTables, tileDeltaPct, tileValueText } from "./reports";

describe("csvCell", () => {
  it("prefixes anything a spreadsheet would run as a formula", () => {
    for (const bad of ["=1+1", "+SUM(A1)", "-2+3", "@cmd", "\tx", "\rx"]) expect(csvCell(bad).replace(/^"/, "").startsWith("'")).toBe(true);
  });
  it("quotes commas, quotes and line breaks, and writes numbers as numbers", () => {
    expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvCell("a\nb")).toBe('"a\nb"');
    expect(csvCell(-3)).toBe("-3");
    expect(csvCell(12.5)).toBe("12.5");
    expect(csvCell(null)).toBe("");
    expect(csvCell("plain")).toBe("plain");
  });
});

describe("overviewCsv", () => {
  it("writes every table with its title and header, and neutralizes a client named like a formula", () => {
    const csv = overviewCsv(overviewFixture());
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe('"Reports, last 30 days"');
    expect(csv).toContain("Marketing status,Consultants");
    expect(csv).toContain("Marketer,Assigned consultants,Open opportunities");
    expect(csv).toContain("Omar Aziz,12,9");
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"")",4`);
    expect(csv).toContain('"Globex, Inc",2');
    expect(lines.some((l) => /^[=+@]/.test(l))).toBe(false);
    expect(reportTables(overviewFixture()).map((t) => t.key)).toContain("top-clients");
  });
});

describe("parseOverview", () => {
  it("accepts the contract and refuses anything else", () => {
    const o = overviewFixture();
    expect(parseOverview(JSON.parse(JSON.stringify(o)))).toEqual(o);
    expect(parseOverview(null)).toBeNull();
    expect(parseOverview({ orgId: 2 })).toBeNull();
    expect(parseOverview({ ...o, funnel: "x" })).toBeNull();
  });
  it("turns missing numbers into zeros and a missing median into null", () => {
    const parsed = parseOverview({ orgId: 1, tiles: [], roster: {}, funnel: {}, interviews: {}, placements: {} });
    expect(parsed?.funnel.total).toBe(0);
    expect(parsed?.firstSubmission.medianHours).toBeNull();
    expect(parsed && isEmptyOverview(parsed)).toBe(true);
  });
});

describe("formatting", () => {
  it("shows durations the way a person says them", () => {
    expect(durationText(null)).toBe("No data yet");
    expect(durationText(0.5)).toBe("30 min");
    expect(durationText(30)).toBe("30 hours");
    expect(durationText(72)).toBe("3 days");
  });
  it("computes deltas only against a real earlier figure", () => {
    expect(deltaText(null)).toBeNull();
    expect(deltaText(0)).toBe("no change");
    expect(deltaText(20)).toBe("+20%");
    expect(deltaText(-8.04)).toBe("-8%");
    const t = overviewFixture().tiles;
    expect(tileDeltaPct(t[1])).toBe(20);
    expect(tileDeltaPct(t[0])).toBeNull();
    expect(tileValueText(t[2])).toBe("30 hours");
    expect(tileValueText({ ...t[0], value: null })).toBe("No data yet");
  });
});

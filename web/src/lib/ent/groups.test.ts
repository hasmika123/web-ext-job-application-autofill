import { describe, expect, it } from "vitest";
import { GROUP_COLORS, GROUP_ICONS, TONE_BAR, TONE_TILE, directoryQueryString, failMessage, plural, shortDate, toneOf } from "./groups";

describe("groups helpers (X4.5)", () => {
  it("builds the directory query with only what is set, and always a page and size", () => {
    expect(directoryQueryString({ kind: "TEAM", q: "bench", departmentId: "11", sort: "members", dir: "desc", page: 2, size: 8 })).toBe("kind=TEAM&departmentId=11&q=bench&sort=members&dir=desc&page=2&size=8");
    expect(directoryQueryString({})).toBe("page=0&size=10");
  });

  it("says the same thing the API means for each typed refusal", () => {
    const f = (code: string, extra: object = {}) => failMessage({ ok: false, status: 409, message: "raw", code, ...extra });
    expect(f("GROUP_NOT_EMPTY", { count: 7 })).toBe("Move the 7 people and teams out first.");
    expect(f("GROUP_NOT_EMPTY", { count: 1 })).toBe("Move the 1 person or team out first.");
    expect(f("LEAD_NOT_ACTIVE")).toContain("active member");
    expect(f("PRECONDITION_FAILED")).toContain("Someone else changed this");
    expect(f("UNKNOWN_CODE")).toBe("raw");
  });

  it("has a tone class for every colour the API accepts and falls back to neutral", () => {
    for (const c of GROUP_COLORS) {
      expect(TONE_TILE[c]).toBeTruthy();
      expect(TONE_BAR[c]).toBeTruthy();
    }
    expect(toneOf("nonsense")).toBe("neutral");
    expect(toneOf(null)).toBe("neutral");
    expect(GROUP_ICONS.length).toBe(12);
  });

  it("formats counts and dates", () => {
    expect(plural(1, "employee")).toBe("1 employee");
    expect(plural(28, "employee")).toBe("28 employees");
    expect(plural(2, "person", "people")).toBe("2 people");
    expect(shortDate("not a date")).toBe("–");
    expect(shortDate("2026-01-10T09:00:00Z")).toMatch(/2026/);
  });

  it("uses no hard-coded colour values (brand tokens and status tones only)", () => {
    for (const cls of [...Object.values(TONE_TILE), ...Object.values(TONE_BAR)]) expect(cls).not.toMatch(/#[0-9a-f]{3,6}|rgb\(/i);
  });
});

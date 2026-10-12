import { describe, expect, it } from "vitest";
import { fromLocalDate, fromLocalInput, toLocalDate, toLocalInput, tomorrowAt } from "@/lib/datetime-local";

describe("datetime-local helpers (the viewer's zone)", () => {
  it("round-trips an instant through the input value", () => {
    const iso = "2026-10-10T14:00:00.000Z";
    const input = toLocalInput(iso);
    expect(input).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(fromLocalInput(input)).toBe(iso);
  });
  it("empty and garbage are empty / null", () => {
    expect(toLocalInput(null)).toBe("");
    expect(toLocalInput("nope")).toBe("");
    expect(fromLocalInput("")).toBeNull();
    expect(fromLocalInput("nope")).toBeNull();
  });
  it("a date lands at 9:00 local on that day", () => {
    const iso = fromLocalDate("2026-10-14");
    expect(iso).not.toBeNull();
    expect(toLocalInput(iso)).toBe("2026-10-14T09:00");
    expect(toLocalDate(iso)).toBe("2026-10-14");
    expect(fromLocalDate("14/10/2026")).toBeNull();
  });
  it("tomorrowAt is the next day on the hour", () => {
    const now = new Date(2026, 9, 12, 15, 30);
    expect(toLocalInput(tomorrowAt(10, now))).toBe("2026-10-13T10:00");
  });
});

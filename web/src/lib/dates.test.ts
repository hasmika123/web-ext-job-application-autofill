import { describe, expect, it } from "vitest";
import { timeAgo } from "./dates";

const NOW = Date.parse("2026-10-12T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("timeAgo", () => {
  it("reads like a person, from just now to days", () => {
    expect(timeAgo(ago(10_000), NOW)).toBe("just now");
    expect(timeAgo(ago(MIN), NOW)).toBe("1 minute ago");
    expect(timeAgo(ago(5 * MIN), NOW)).toBe("5 minutes ago");
    expect(timeAgo(ago(2 * HOUR), NOW)).toBe("2 hours ago");
    expect(timeAgo(ago(DAY), NOW)).toBe("yesterday");
    expect(timeAgo(ago(3 * DAY), NOW)).toBe("3 days ago");
  });

  it("falls back to a short date after a week, and to empty for nothing", () => {
    expect(timeAgo(ago(30 * DAY), NOW)).toBe("Sep 12, 2026");
    expect(timeAgo(null, NOW)).toBe("");
    expect(timeAgo("not a date", NOW)).toBe("");
  });

  it("never reads a future time as negative", () => {
    expect(timeAgo(new Date(NOW + HOUR).toISOString(), NOW)).toBe("just now");
  });
});

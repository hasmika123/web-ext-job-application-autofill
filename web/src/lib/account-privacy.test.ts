import { describe, expect, it } from "vitest";
import { formatBytes, formatCountdown, safeDownloadPath } from "./account-privacy";

describe("formatCountdown", () => {
  it("counts down in hours and minutes, rounding up so it never says 0 min early", () => {
    expect(formatCountdown(23 * 3_600_000 + 41 * 60_000)).toBe("23 h 41 min");
    expect(formatCountdown(24 * 3_600_000)).toBe("24 h");
    expect(formatCountdown(41 * 60_000)).toBe("41 min");
    expect(formatCountdown(61_000)).toBe("2 min");
  });
  it("says so when under a minute or past due", () => {
    expect(formatCountdown(30_000)).toBe("Less than a minute");
    expect(formatCountdown(0)).toBe("Any moment now");
    expect(formatCountdown(-5)).toBe("Any moment now");
  });
});

describe("formatBytes", () => {
  it("scales and tolerates a missing size", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(188_000)).toBe("184 KB");
    expect(formatBytes(13_000_000)).toBe("12.4 MB");
    expect(formatBytes(null)).toBe("");
  });
});

describe("safeDownloadPath", () => {
  it("accepts only our own signed export link", () => {
    expect(safeDownloadPath("/api/account/exports/7/file?exp=1790000000&sig=ab_-C")).toBe("/api/account/exports/7/file?exp=1790000000&sig=ab_-C");
    expect(safeDownloadPath("https://evil.example/x")).toBeNull();
    expect(safeDownloadPath("//evil.example/api/account/exports/7/file")).toBeNull();
    expect(safeDownloadPath("/api/account/exports/7/file?x=<script>")).toBeNull();
    expect(safeDownloadPath(null)).toBeNull();
  });
});

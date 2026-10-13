import { describe, expect, it } from "vitest";
import { formatBytesCap } from "./format-bytes";

describe("formatBytesCap", () => {
  it("reads megabytes and kilobytes the way people say them", () => {
    expect(formatBytesCap(10485760)).toBe("10 MB");
    expect(formatBytesCap(2621440)).toBe("2.5 MB");
    expect(formatBytesCap(524288)).toBe("512 KB");
    expect(formatBytesCap(10)).toBe("1 KB");
  });
});

import { describe, expect, it } from "vitest";
import { tenantMetadata } from "./tenant-metadata";

describe("tenantMetadata", () => {
  it("names the organization and clears the platform's description and link previews", () => {
    const m = tenantMetadata({ displayName: "Aaruna Technologies" });
    expect(m.title).toEqual({ template: "%s · Aaruna Technologies", default: "Aaruna Technologies" });
    expect(m.applicationName).toBe("Aaruna Technologies");
    expect(m.description).toBeNull();
    expect(m.openGraph).toBeNull();
    expect(m.twitter).toBeNull();
    expect(JSON.stringify(m)).not.toMatch(/kiwiply/i);
  });
});

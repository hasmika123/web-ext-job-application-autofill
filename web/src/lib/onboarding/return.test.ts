import { describe, expect, it } from "vitest";
import { safeReturn } from "./return";

describe("safeReturn (?return= on /profiles/setup)", () => {
  it("keeps a path on this site, query and all", () => {
    expect(safeReturn("/resume-builder?new=profile")).toBe("/resume-builder?new=profile");
    expect(safeReturn(["/jobs", "/x"])).toBe("/jobs");
  });

  it("drops anything that could leave the site", () => {
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "resume-builder", "/a\nb", "", undefined, null]) {
      expect(safeReturn(bad as string | undefined)).toBeNull();
    }
  });
});

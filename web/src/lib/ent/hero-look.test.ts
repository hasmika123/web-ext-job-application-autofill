import { describe, expect, it } from "vitest";
import { HERO_VARIANTS, heroLook, pageSegment } from "./hero-look";

const ADMIN = ["", "employees", "invitations", "teams", "departments", "roles", "consultants", "resumes", "marketing-assignments", "jobs", "applications", "interviews", "clients", "placements", "subscription", "licenses", "billing", "usage", "reports", "branding", "domains", "audit", "settings", "policies"];

describe("heroLook", () => {
  it("names the page by its last path segment, a workspace home is 'home'", () => {
    expect(pageSegment("/w/admin/employees", false)).toBe("employees");
    expect(pageSegment("/w/admin", true)).toBe("home");
  });

  it("is stable: the same page always gets the same pose and design", () => {
    expect(heroLook("/w/admin/jobs", false)).toEqual(heroLook("/w/admin/jobs", false));
  });

  it("every design number is one of the six", () => {
    for (const p of ADMIN) {
      const v = heroLook(`/w/admin/${p}`, p === "").variant;
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(HERO_VARIANTS);
    }
  });

  it("the admin pages do not all look alike: several poses and every design is used", () => {
    const looks = ADMIN.map((p) => heroLook(`/w/admin/${p}`, p === ""));
    expect(new Set(looks.map((l) => l.pose)).size).toBeGreaterThanOrEqual(15);
    expect(new Set(looks.map((l) => l.variant)).size).toBe(HERO_VARIANTS);
  });

  it("a page missing from the pose table still gets a pose", () => {
    expect(heroLook("/w/admin/brand-new-page", false).pose).toMatch(/^[a-z-]+$/);
  });
});

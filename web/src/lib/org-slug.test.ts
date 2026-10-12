import { describe, expect, it } from "vitest";
import { cleanSlugInput, deriveSlug, isWellFormedSlug } from "./org-slug";

describe("deriveSlug (twin of the API's OrgSlugs.derive)", () => {
  it("lower-cases, folds accents and turns runs of other characters into one dash", () => {
    expect(deriveSlug("Acme Bootcamp")).toBe("acme-bootcamp");
    expect(deriveSlug("  Café  Étoile -- Academy! ")).toBe("cafe-etoile-academy");
    expect(deriveSlug("A&B / C")).toBe("a-b-c");
  });

  it("pads a name that is too short and falls back when nothing is left", () => {
    expect(deriveSlug("AI")).toBe("ai-org");
    expect(deriveSlug("!!!")).toBe("org-team");
    expect(deriveSlug("")).toBe("org-team");
  });

  it("caps the length at 60 without a dangling dash", () => {
    const s = deriveSlug("word ".repeat(30));
    expect(s.length).toBeLessThanOrEqual(60);
    expect(s.endsWith("-")).toBe(false);
  });
});

describe("isWellFormedSlug", () => {
  it("accepts 3 to 60 letters, digits and single dashes", () => {
    expect(isWellFormedSlug("abc")).toBe(true);
    expect(isWellFormedSlug("acme-bootcamp-2")).toBe(true);
  });
  it("refuses short, long, edge dashes, double dashes and capitals", () => {
    for (const bad of ["ab", "a".repeat(61), "-abc", "abc-", "a--b", "Abc", "a b c", "a_b"]) expect(isWellFormedSlug(bad)).toBe(false);
  });
});

describe("cleanSlugInput", () => {
  it("cleans as the person types", () => {
    expect(cleanSlugInput("My New Org")).toBe("my-new-org");
    expect(cleanSlugInput("--a   b")).toBe("a-b");
    expect(cleanSlugInput("x".repeat(80)).length).toBe(60);
  });
});

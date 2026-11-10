import { describe, expect, it } from "vitest";
import { FRESH_GOALS, GENERAL_SKILLS, HEADLINE_SUGGESTIONS, SKILL_FAMILIES, STUDY_FIRST_GOALS, suggestSkills } from "./profile-options";

describe("suggestSkills (headline -> skill chips)", () => {
  it("offers the family that matches a word in the text, case-insensitively", () => {
    expect(suggestSkills("Software Engineer")).toContain("Git");
    expect(suggestSkills("data analyst intern")).toContain("SQL");
    expect(suggestSkills("Barista and shift lead")).toContain("Customer service");
  });

  it("merges several matching families without duplicates", () => {
    const out = suggestSkills("data analyst who writes software");
    expect(out).toContain("Python");
    expect(new Set(out.map((s) => s.toLowerCase())).size).toBe(out.length);
  });

  it("matches the start of a word only, so 'career' is not 'care'", () => {
    expect(suggestSkills("Career changer")).toEqual(GENERAL_SKILLS);
    expect(suggestSkills("")).toEqual(GENERAL_SKILLS);
  });

  it("every goal has headline starters, and the study-first goals are real goals", () => {
    for (const g of FRESH_GOALS) expect(HEADLINE_SUGGESTIONS[g.id].length).toBeGreaterThan(0);
    for (const g of STUDY_FIRST_GOALS) expect(FRESH_GOALS.map((x) => x.id)).toContain(g);
    for (const f of SKILL_FAMILIES) expect(f.skills.length).toBeGreaterThan(0);
  });

  it("the headline starters themselves lead to sensible skills", () => {
    expect(suggestSkills(HEADLINE_SUGGESTIONS.internship[1])).toContain("Python");
    expect(suggestSkills(HEADLINE_SUGGESTIONS["first-job"][2])).toContain("Customer service");
  });
});

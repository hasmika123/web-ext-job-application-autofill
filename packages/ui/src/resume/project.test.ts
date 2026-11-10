import { describe, expect, it } from "vitest";
import { FIXTURES, fixtureDoc, fixtureText } from "./test-fixtures";
import { toStructured, toStructuredJson, toStructuredPretty } from "./project";

describe("project.ts reproduces the Java projection byte for byte", () => {
  for (const name of FIXTURES) {
    it(`${name}: pretty form equals ${name}.structured.json`, () => {
      expect(toStructuredPretty(fixtureDoc(name))).toBe(fixtureText(`${name}.structured.json`));
    });

    it(`${name}: compact form is the same value, no whitespace`, () => {
      const compact = toStructuredJson(fixtureDoc(name));
      expect(compact).not.toMatch(/\n/);
      expect(JSON.parse(compact)).toEqual(JSON.parse(fixtureText(`${name}.structured.json`)));
    });
  }

  it("always emits the six keys in contract order", () => {
    expect(Object.keys(toStructured({}))).toEqual(["summary", "skills", "experience", "education", "languages", "projects"]);
    expect(toStructuredJson(null)).toBe('{"summary":"","skills":[],"experience":[],"education":[],"languages":[],"projects":[]}');
  });

  it("current wins over end; hidden items and sections never leak", () => {
    const s = toStructured(fixtureDoc("full"));
    expect(s.experience).toHaveLength(2);
    expect(s.experience[0]).toMatchObject({ company: "Google", current: true, endDate: "" });
    expect(JSON.stringify(s)).not.toContain("Initech");
    expect(JSON.stringify(s)).not.toContain("COBOL");
    expect(JSON.stringify(s)).not.toContain("hidden alternative");
    expect(JSON.stringify(s)).not.toContain("AWS Solutions");
  });

  it("is tolerant: wrong types read as empty and never throw", () => {
    const junk = { sections: [null, 7, { kind: "EXPERIENCE", items: [{ title: 5, org: ["x"], bullets: "no" }, { title: "T", current: "yes" }] }] };
    const s = toStructured(junk);
    expect(s.experience).toEqual([
      { company: "", title: "T", location: "", startDate: "", endDate: "", current: false, bullets: [] },
    ]);
  });

  it("trims with the contract whitespace only (NBSP survives, like Java)", () => {
    const doc = { sections: [{ kind: "SUMMARY", items: [{ text: "  keep  " }] }] };
    expect(toStructured(doc).summary).toBe("  keep ");
  });
});

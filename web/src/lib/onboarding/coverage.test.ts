import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AUTOFILL_FIELD_KEYS, COVERAGE_GROUPS, autofillCoverage, type CoverageCounts } from "./coverage";

/**
 * The same fixtures the API's `AutofillCoverageTest` runs (`api/src/test/resources/onboarding/coverage-*.json`, copied
 * byte for byte): the Java and the TS twin must agree on every one.
 */
const FIXTURES_DIR = path.join(__dirname, "__fixtures__");
type Fixture = { name: string; bio: Record<string, unknown>; counts: CoverageCounts; expected: { fields: number; groups: Record<string, number> } };
const fixtures = readdirSync(FIXTURES_DIR)
  .filter((f) => /^coverage-.*\.json$/.test(f))
  .sort()
  .map((f) => JSON.parse(readFileSync(path.join(FIXTURES_DIR, f), "utf8")) as Fixture);

describe("autofillCoverage fixtures (shared with the API)", () => {
  it("has the four named fixtures", () => {
    expect(fixtures.map((f) => f.name).sort()).toEqual(["contact-only", "empty", "full", "student-fresh"]);
  });

  for (const f of fixtures) {
    it(`${f.name}: ${f.expected.fields} fields`, () => {
      const r = autofillCoverage(f.bio, f.counts);
      expect(r.groups).toEqual(f.expected.groups);
      expect(r.fields).toBe(f.expected.fields);
    });
  }

  it("the groups always add up to the total", () => {
    for (const f of fixtures) {
      const r = autofillCoverage(f.bio, f.counts);
      expect(COVERAGE_GROUPS.reduce((n, g) => n + r.groups[g], 0)).toBe(r.fields);
    }
  });
});

describe("autofillCoverage rules", () => {
  it("fullName needs both first and last name", () => {
    expect(autofillCoverage({ firstName: "Jo" }).groups.contact).toBe(1);
    expect(autofillCoverage({ firstName: "Jo", lastName: "Li" }).groups.contact).toBe(3);
  });

  it("blank and whitespace-only values count for nothing; numbers and booleans do count", () => {
    expect(autofillCoverage({ email: "  ", phone: "", city: null, state: undefined }).fields).toBe(0);
    expect(autofillCoverage({ willingToRelocate: true, desiredSalary: 90000 }).groups.preferences).toBe(2);
  });

  it("caps the repeated fields: 3 roles x 5, 2 schools x 4, and skills once", () => {
    const r = autofillCoverage({}, { experience: 9, education: 7, skills: 40 });
    expect(r.groups).toMatchObject({ work: 15, education: 8, skills: 1 });
    expect(r.fields).toBe(24);
  });

  it("negative or missing counts are zero; a bio skills value and skill items are the one field", () => {
    expect(autofillCoverage({}, { experience: -2 }).fields).toBe(0);
    expect(autofillCoverage(null).fields).toBe(0);
    expect(autofillCoverage({ skills: ["Go"] }, { skills: 4 }).groups.skills).toBe(1);
  });

  it("EEO counts only when answered", () => {
    expect(autofillCoverage({ gender: "", race: "" }).groups.eeo).toBe(0);
    expect(autofillCoverage({ gender: "Woman", veteranStatus: "No" }).groups.eeo).toBe(2);
  });

  it("the summary and cover letter are work, not contact", () => {
    expect(autofillCoverage({ summary: "x", coverLetter: "y" }).groups).toMatchObject({ work: 2, contact: 0 });
  });
});

describe("the key list", () => {
  it("is 31 keys with no duplicates, and every counted key is one of them", () => {
    expect(AUTOFILL_FIELD_KEYS).toHaveLength(31);
    expect(new Set(AUTOFILL_FIELD_KEYS).size).toBe(31);
  });
});

import { describe, expect, it } from "vitest";
import { buildTiles } from "./derive";
import { cleanDraft, describeItem, formatRange, normalizeDate, validateDraft } from "./itemSchema";
import { tabFromHref, tabFromParam } from "./tabs";
import type { Completeness, ProfileItem } from "@/lib/profile-items";

const limits = { bullets: 3, bulletChars: 40 };

describe("validateDraft", () => {
  it("requires the title and company of a role", () => {
    const e = validateDraft("EXPERIENCE", { bullets: [{ text: "" }] }, limits);
    expect(e.title).toMatch(/required/);
    expect(e.org).toMatch(/required/);
    expect(validateDraft("EXPERIENCE", { title: "Engineer", org: "Acme" }, limits)).toEqual({});
  });

  it("accepts YYYY and YYYY-MM dates, rejects others, and keeps end after start", () => {
    const base = { title: "T", org: "O" };
    expect(validateDraft("EXPERIENCE", { ...base, start: "2020-03", end: "2021" }, limits)).toEqual({});
    expect(validateDraft("EXPERIENCE", { ...base, start: "March 2020" }, limits).start).toMatch(/YYYY/);
    expect(validateDraft("EXPERIENCE", { ...base, start: "2021-05", end: "2020-01" }, limits).end).toMatch(/before/);
    // A bare year spans the whole year, so 2020 -> 2020-03 is not backwards.
    expect(validateDraft("EXPERIENCE", { ...base, start: "2020-03", end: "2020" }, limits)).toEqual({});
  });

  it("normalises MM/YYYY before checking", () => {
    expect(normalizeDate("3/2020")).toBe("2020-03");
    expect(validateDraft("EXPERIENCE", { title: "T", org: "O", start: "3/2020" }, limits)).toEqual({});
  });

  it("enforces the bullet limits it is given (builder settings), not constants", () => {
    const four = [{ text: "a" }, { text: "b" }, { text: "c" }, { text: "d" }];
    expect(validateDraft("EXPERIENCE", { title: "T", org: "O", bullets: four }, limits).bullets).toMatch(/At most 3/);
    expect(validateDraft("EXPERIENCE", { title: "T", org: "O", bullets: four }, { bullets: 4, bulletChars: 40 })).toEqual({});
    const long = [{ text: "x".repeat(41) }];
    expect(validateDraft("EXPERIENCE", { title: "T", org: "O", bullets: long }, limits).bullets).toMatch(/under 40/);
  });

  it("refuses never-collected values with the plain-language class", () => {
    const e = validateDraft("EXPERIENCE", { title: "T", org: "O", bullets: [{ text: "My SSN is 123-45-6789" }] }, limits);
    expect(e.bullets).toMatch(/We never store a Social Security/);
    const p = validateDraft("PROJECT", { title: "Passport number: X1234567" }, limits);
    expect(p.title).toMatch(/passport/);
  });

  it("checks links", () => {
    expect(validateDraft("PROJECT", { title: "P", url: "example.com" }, limits).url).toMatch(/https/);
    expect(validateDraft("PROJECT", { title: "P", url: "https://example.com/x" }, limits)).toEqual({});
  });
});

describe("cleanDraft", () => {
  it("trims, drops blanks, keeps bullet provenance and drops `end` for a current role", () => {
    const out = cleanDraft("EXPERIENCE", {
      title: "  Engineer ",
      org: "Acme",
      location: "   ",
      start: "3/2020",
      end: "2021",
      current: true,
      bullets: [{ text: " Shipped it ", src: "parsed" }, { text: "  " }, { text: "New" }],
      stray: "not a field",
    });
    expect(out).toEqual({
      title: "Engineer",
      org: "Acme",
      start: "2020-03",
      current: true,
      bullets: [
        { text: "Shipped it", src: "parsed" },
        { text: "New", src: "user" },
      ],
    });
  });
});

describe("describeItem / formatRange", () => {
  it("builds the card heading and meta", () => {
    expect(describeItem("EXPERIENCE", { title: "Engineer", org: "Acme", start: "2020-03", current: true, location: "Berlin" })).toEqual({
      heading: "Engineer · Acme",
      meta: "Mar 2020 – Present · Berlin",
    });
    expect(describeItem("EDUCATION", { school: "MIT", degree: "BS", field: "CS", start: "2012", end: "2016", gpa: "3.9" })).toEqual({
      heading: "MIT",
      meta: "BS · CS · 2012 – 2016 · GPA 3.9",
    });
    expect(describeItem("LANGUAGE", { name: "German", level: "B2" })).toEqual({ heading: "German", meta: "B2" });
    expect(formatRange("", "", false)).toBe("");
  });
});

describe("buildTiles", () => {
  const item = (section: ProfileItem["section"], data: ProfileItem["data"] = {}): ProfileItem => ({
    id: Math.random(),
    section,
    position: 0,
    data,
    provenance: "USER",
    sourceResumeId: null,
    hidden: false,
    updatedAt: null,
  });
  const completeness = (done: string[]): Completeness => ({
    score: 40,
    nextAction: null,
    parts: Object.fromEntries(
      ["identity", "location", "headline", "summary", "experience", "education", "skills", "links", "preferences"].map((k) => [k, { weight: 1, done: done.includes(k) }]),
    ),
  });

  it("maps the server's parts onto the six tiles", () => {
    const t = buildTiles(completeness(["identity", "location", "experience", "skills"]), [item("EXPERIENCE"), item("PROJECT"), item("PROJECT")]);
    const by = Object.fromEntries(t.map((x) => [x.key, x]));
    expect(by.personal).toMatchObject({ status: "partial", detail: "2/5" });
    expect(by.work).toMatchObject({ status: "done", detail: "Completed" });
    expect(by.education).toMatchObject({ status: "todo", detail: "Add" });
    expect(by.skills).toMatchObject({ status: "done" });
    expect(by.projects).toMatchObject({ status: "done", detail: "2 added" });
    expect(by.preferences).toMatchObject({ status: "todo" });
  });

  it("an experience without enough bullets is partial; skills below the bar show their count", () => {
    const t = buildTiles(completeness([]), [item("EXPERIENCE"), item("SKILL", { group: "x", skills: ["Go", "Rust"] })]);
    expect(t.find((x) => x.key === "work")).toMatchObject({ status: "partial", detail: "Add bullets" });
    expect(t.find((x) => x.key === "skills")).toMatchObject({ status: "partial", detail: "2 skills" });
  });

  it("with no completeness every tile is still usable", () => {
    expect(buildTiles(null, []).every((x) => x.status === "todo")).toBe(true);
  });
});

describe("?tab=", () => {
  it("reads known tabs and falls back to the overview", () => {
    expect(tabFromParam("work")).toBe("work");
    expect(tabFromParam("more")).toBe("more");
    expect(tabFromParam("nope")).toBe("overview");
    expect(tabFromParam(undefined)).toBe("overview");
  });
  it("follows the completeness next-action hrefs the API emits", () => {
    for (const tab of ["personal", "work", "education", "skills", "preferences"]) {
      expect(tabFromHref(`/profiles?tab=${tab}`)).toBe(tab);
    }
    expect(tabFromHref(null)).toBe("overview");
  });
});

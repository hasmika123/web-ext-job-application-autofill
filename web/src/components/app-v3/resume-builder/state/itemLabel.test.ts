import { describe, expect, it } from "vitest";
import { itemLabel } from "./itemLabel";

describe("itemLabel", () => {
  describe("EXPERIENCE", () => {
    it("is the title over the company and the date range", () => {
      const l = itemLabel("EXPERIENCE", { id: "i1", title: "Software Engineer", org: "Acme Inc.", start: "2022-03", end: "2024-03" });
      expect(l.primary).toBe("Software Engineer");
      expect(l.secondary).toBe("Acme Inc. · Mar 2022 – Mar 2024");
      expect(l.name).toBe("Software Engineer · Acme Inc.");
      expect(l.text).toBe("Software Engineer · Acme Inc. · Mar 2022 – Mar 2024");
      expect(l.empty).toBe(false);
    });

    it("says Present for a current role and ignores a stale end date", () => {
      const l = itemLabel("EXPERIENCE", { id: "i1", title: "Lead", org: "Acme", start: "2022-03", end: "2023-01", current: true });
      expect(l.secondary).toBe("Acme · Mar 2022 – Present");
    });

    it("shows what dates there are: a start only, an end only, a bare year", () => {
      expect(itemLabel("EXPERIENCE", { id: "i", title: "T", start: "2019" }).secondary).toBe("2019");
      expect(itemLabel("EXPERIENCE", { id: "i", title: "T", end: "2021-05" }).secondary).toBe("May 2021");
      expect(itemLabel("EXPERIENCE", { id: "i", title: "T", current: true }).secondary).toBe("Present");
    });

    it("falls back to the company when the title is empty, then to the first bullet", () => {
      const noTitle = itemLabel("EXPERIENCE", { id: "i", title: "  ", org: "Acme Inc.", start: "2022-03", end: "2024-03" });
      expect(noTitle.primary).toBe("Acme Inc.");
      expect(noTitle.secondary).toBe("Mar 2022 – Mar 2024"); // the company is not said twice
      expect(noTitle.name).toBe("Acme Inc.");

      const bulletOnly = itemLabel("EXPERIENCE", { id: "i", title: "", org: "", bullets: [{ id: "b1", text: "" }, { id: "b2", text: "Led the billing migration" }] });
      expect(bulletOnly.primary).toBe("Led the billing migration");
      expect(bulletOnly.empty).toBe(false);
    });

    it("is 'Untitled role n' when everything is empty - never 'Experience 1'", () => {
      const l = itemLabel("EXPERIENCE", { id: "i", title: "", org: "", bullets: [{ id: "b", text: "" }] }, 3);
      expect(l.primary).toBe("Untitled role 4");
      expect(l.name).toBe("Untitled role 4");
      expect(l.empty).toBe(true);
      expect(itemLabel("EXPERIENCE", {}, 0).primary).toBe("Untitled role 1");
      expect(itemLabel("EXPERIENCE", null, 1).primary).toBe("Untitled role 2");
    });

    it("keeps the dates on an otherwise empty item", () => {
      const l = itemLabel("EXPERIENCE", { id: "i", start: "2022-03", current: true });
      expect(l.empty).toBe(true);
      expect(l.secondary).toBe("Mar 2022 – Present");
    });
  });

  describe("EDUCATION", () => {
    it("is the degree in the field, over the school and dates", () => {
      const l = itemLabel("EDUCATION", { id: "i", degree: "B.S.", field: "Computer Science", school: "MIT", start: "2014", end: "2018" });
      expect(l.primary).toBe("B.S. in Computer Science");
      expect(l.secondary).toBe("MIT · 2014 – 2018");
      expect(l.name).toBe("B.S. in Computer Science · MIT");
    });

    it("uses the degree or the field alone, then the school", () => {
      expect(itemLabel("EDUCATION", { id: "i", degree: "MBA" }).primary).toBe("MBA");
      expect(itemLabel("EDUCATION", { id: "i", field: "Physics", school: "ETH" }).primary).toBe("Physics");
      const schoolOnly = itemLabel("EDUCATION", { id: "i", school: "ETH", start: "2010" });
      expect(schoolOnly.primary).toBe("ETH");
      expect(schoolOnly.secondary).toBe("2010");
    });

    it("is 'Untitled degree n' when empty", () => {
      expect(itemLabel("EDUCATION", { id: "i" }, 1)).toMatchObject({ primary: "Untitled degree 2", empty: true });
    });
  });

  describe("PROJECTS", () => {
    it("is the name over the role and dates when there are any", () => {
      expect(itemLabel("PROJECTS", { id: "i", title: "Dossier", start: "2023-01" }).secondary).toBe("Jan 2023");
      expect(itemLabel("PROJECTS", { id: "i", title: "Dossier", role: "Maintainer", start: "2023-01", end: "2024" }).secondary).toBe("Maintainer · Jan 2023 – 2024");
      expect(itemLabel("PROJECTS", { id: "i", title: "Dossier" })).toMatchObject({ primary: "Dossier", secondary: "" });
    });

    it("falls back to the first bullet, then 'Untitled project n'", () => {
      expect(itemLabel("PROJECTS", { id: "i", title: "", bullets: [{ id: "b", text: "Built a thing" }] }).primary).toBe("Built a thing");
      expect(itemLabel("PROJECTS", { id: "i", title: "" }, 2)).toMatchObject({ primary: "Untitled project 3", empty: true });
    });
  });

  describe("CERTIFICATIONS", () => {
    it("is the name over the issuer and date", () => {
      const l = itemLabel("CERTIFICATIONS", { id: "i", title: "AWS Solutions Architect", org: "Amazon", date: "2023-06" });
      expect(l).toMatchObject({ primary: "AWS Solutions Architect", secondary: "Amazon · Jun 2023", name: "AWS Solutions Architect · Amazon" });
    });

    it("falls back to the issuer, then 'Untitled certification n'", () => {
      expect(itemLabel("CERTIFICATIONS", { id: "i", org: "Amazon", date: "2023" })).toMatchObject({ primary: "Amazon", secondary: "2023" });
      expect(itemLabel("CERTIFICATIONS", { id: "i" })).toMatchObject({ primary: "Untitled certification 1", empty: true });
    });
  });

  describe("LANGUAGES", () => {
    it("is the language over its level", () => {
      expect(itemLabel("LANGUAGES", { id: "i", name: "Spanish", level: "Fluent" })).toMatchObject({ primary: "Spanish", secondary: "Fluent", name: "Spanish · Fluent" });
      expect(itemLabel("LANGUAGES", { id: "i" }, 4)).toMatchObject({ primary: "Untitled language 5", empty: true });
    });
  });

  describe("SKILLS", () => {
    it("is the group over its first skills", () => {
      const l = itemLabel("SKILLS", { id: "i", group: "Languages", skills: ["Go", "Rust", "Java", "C", "Zig"] });
      expect(l.primary).toBe("Languages");
      expect(l.secondary).toBe("Go, Rust, Java +2");
    });

    it("uses the first skill when the group has no name, then 'Untitled skill group n'", () => {
      expect(itemLabel("SKILLS", { id: "i", group: "", skills: ["Go", "Rust"] })).toMatchObject({ primary: "Go", secondary: "Rust" });
      expect(itemLabel("SKILLS", { id: "i", group: "", skills: [] })).toMatchObject({ primary: "Untitled skill group 1", empty: true });
    });
  });

  describe("text-only kinds", () => {
    it("ACHIEVEMENTS: the first non-empty line, with the date under it", () => {
      expect(itemLabel("ACHIEVEMENTS", { id: "i", text: "\n  Won the 2023 platform award\nsecond line", date: "2023-11" })).toMatchObject({
        primary: "Won the 2023 platform award",
        secondary: "Nov 2023",
      });
      expect(itemLabel("ACHIEVEMENTS", { id: "i", text: " " }, 1)).toMatchObject({ primary: "Untitled achievement 2", empty: true });
    });

    it("INTERESTS and SUMMARY: the first line of the text", () => {
      expect(itemLabel("INTERESTS", { id: "i", text: "Open-source, hiking, chess" }).primary).toBe("Open-source, hiking, chess");
      expect(itemLabel("SUMMARY", { id: "i", text: "Engineer who ships." }).primary).toBe("Engineer who ships.");
      expect(itemLabel("INTERESTS", { id: "i", text: "" })).toMatchObject({ primary: "Untitled interest 1", empty: true });
    });

    it("CUSTOM reads like an experience: title, organisation, dates; else the first bullet; else 'Untitled entry n'", () => {
      expect(itemLabel("CUSTOM", { id: "i", title: "Volunteer", org: "Food Bank", start: "2020", end: "2021" })).toMatchObject({
        primary: "Volunteer",
        secondary: "Food Bank · 2020 – 2021",
      });
      expect(itemLabel("CUSTOM", { id: "i", title: "", bullets: [{ id: "b", text: "Packed boxes" }] }).primary).toBe("Packed boxes");
      expect(itemLabel("CUSTOM", { id: "i" }, 1)).toMatchObject({ primary: "Untitled entry 2", empty: true });
    });
  });

  describe("truncation", () => {
    it("cuts a long first line (the bullet fallback) at about 40 characters with an ellipsis", () => {
      const long = "Reduced the p99 latency of the checkout service from 900 ms to 120 ms";
      const l = itemLabel("ACHIEVEMENTS", { id: "i", text: long });
      expect(l.primary.endsWith("…")).toBe(true);
      expect(l.primary.length).toBeLessThanOrEqual(41);
      expect(long.startsWith(l.primary.slice(0, -1))).toBe(true);
      const viaBullet = itemLabel("EXPERIENCE", { id: "i", bullets: [{ id: "b", text: long }] });
      expect(viaBullet.primary.endsWith("…")).toBe(true);
    });

    it("leaves a field the user typed whole (the row truncates it with CSS and puts the full text in the tooltip)", () => {
      const title = "Senior Staff Principal Distinguished Software Engineer of Platform Infrastructure";
      expect(itemLabel("EXPERIENCE", { id: "i", title, org: "Acme" }).text).toBe(`${title} · Acme`);
    });
  });
});

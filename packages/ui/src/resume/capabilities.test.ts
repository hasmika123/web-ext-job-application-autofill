import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import {
  ATS_STRICT,
  DESIGN_FREE,
  LIMITED_CUSTOM_TITLE,
  allowedMarks,
  controlStates,
  headingFor,
  hiddenContent,
  hiddenNotice,
  isAtLeastAsStrictAs,
  photoShown,
  planSections,
  resetOverrideWarnings,
  tightenCapabilities,
} from "./capabilities";
import { toStructured } from "./project";
import { renderText } from "./text";
import { fixtureDoc } from "./test-fixtures";
import { DEFAULT_THEME } from "./theme";
import type { ResumeDocument, TemplateCapabilities, Theme } from "./types";

const golden = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "__fixtures__", "capabilities.json"), "utf8")) as Record<string, unknown>;

/** The theme of the DESIGN 6.6 vectors: accent #ec4899, source-serif, two pages. */
const VECTOR_THEME: Theme = { ...DEFAULT_THEME, accent: "#ec4899", fontPair: "source-serif", fit: { mode: "auto", target: 2, step: 0 } };

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const caps = (over: Partial<TemplateCapabilities>): TemplateCapabilities => ({ ...clone(ATS_STRICT), ...over });

describe("the two profiles", () => {
  it("match the shared golden (Java twin reads the same file)", () => {
    expect(JSON.parse(JSON.stringify(ATS_STRICT))).toEqual(golden.ATS_STRICT);
    expect(JSON.parse(JSON.stringify(DESIGN_FREE))).toEqual(golden.DESIGN_FREE);
  });

  it("ATS_STRICT is DESIGN 6.2: bold only, no photo / lists / graphics / accent, standard headings, one custom section", () => {
    expect(ATS_STRICT).toMatchObject({
      ats: true,
      columns: 1,
      photo: false,
      photoDefault: false,
      marks: ["b"],
      lists: false,
      graphics: false,
      maxPages: 2,
      custom: "limited",
      customLimit: 1,
      headings: "standard",
      dateStyles: ["range"],
      maxSkillGroups: 6,
    });
    expect(ATS_STRICT.theme).toEqual({ accent: false, fontPairs: ["inter", "georgia-arial"], spacing: true, pageLength: true });
    expect(ATS_STRICT.sections).not.toContain("INTERESTS");
    expect(ATS_STRICT.sections).not.toContain("CUSTOM");
  });

  it("are frozen", () => {
    expect(Object.isFrozen(ATS_STRICT)).toBe(true);
    expect(Object.isFrozen(ATS_STRICT.marks)).toBe(true);
    expect(Object.isFrozen(DESIGN_FREE.theme)).toBe(true);
  });
});

describe("isAtLeastAsStrictAs", () => {
  it("reflexive; ATS_STRICT inside DESIGN_FREE; DESIGN_FREE is not inside ATS_STRICT", () => {
    expect(isAtLeastAsStrictAs(ATS_STRICT, ATS_STRICT)).toBe(true);
    expect(isAtLeastAsStrictAs(DESIGN_FREE, DESIGN_FREE)).toBe(true);
    expect(isAtLeastAsStrictAs(ATS_STRICT, DESIGN_FREE)).toBe(true);
    expect(isAtLeastAsStrictAs(DESIGN_FREE, ATS_STRICT)).toBe(false);
  });

  it.each<[string, Partial<TemplateCapabilities>]>([
    ["a second column", { columns: 2 }],
    ["a photo", { photo: true }],
    ["photoDefault", { photoDefault: true }],
    ["italic", { marks: ["b", "i"] }],
    ["lists", { lists: true }],
    ["graphics", { graphics: true }],
    ["free headings", { headings: "free" }],
    ["unlimited custom sections", { custom: "any" }],
    ["a larger custom limit", { customLimit: 2 }],
    ["a sidebar section", { sidebarSections: ["SKILLS"] }],
    ["Interests", { sections: [...ATS_STRICT.sections, "INTERESTS"] }],
    ["the year date style", { dateStyles: ["range", "year"] }],
    ["unlimited skill groups", { maxSkillGroups: 0 }],
    ["more skill groups", { maxSkillGroups: 7 }],
    ["an accent control", { theme: { ...ATS_STRICT.theme, accent: true } }],
    ["another font", { theme: { ...ATS_STRICT.theme, fontPairs: ["inter", "source-serif"] } }],
  ])("a profile with %s is looser than ATS_STRICT", (_name, over) => {
    expect(isAtLeastAsStrictAs(caps(over), ATS_STRICT)).toBe(false);
  });

  it.each<[string, Partial<TemplateCapabilities>]>([
    ["fewer marks", { marks: [] }],
    ["no custom sections", { custom: "none" }],
    ["one page", { maxPages: 1 }],
    ["fewer sections", { sections: ["SUMMARY", "EXPERIENCE"] }],
    ["3 skill groups", { maxSkillGroups: 3 }],
  ])("a profile with %s is at least as strict as ATS_STRICT", (_name, over) => {
    expect(isAtLeastAsStrictAs(caps(over), ATS_STRICT)).toBe(true);
  });

  it("ats: false is looser than ats: true", () => {
    expect(isAtLeastAsStrictAs(caps({ ats: false }), ATS_STRICT)).toBe(false);
    expect(isAtLeastAsStrictAs(ATS_STRICT, caps({ ats: false }))).toBe(true);
  });
});

describe("tightenCapabilities (admin overrides may only tighten)", () => {
  let warn: MockInstance<typeof console.warn>;
  beforeEach(() => {
    resetOverrideWarnings();
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it("no override: the base itself", () => {
    expect(tightenCapabilities("t", DESIGN_FREE, undefined)).toBe(DESIGN_FREE);
    expect(tightenCapabilities("t", DESIGN_FREE, null)).toBe(DESIGN_FREE);
    expect(warn).not.toHaveBeenCalled();
  });

  it("applies every kind of tightening", () => {
    const out = tightenCapabilities("t", DESIGN_FREE, {
      ats: false,
      columns: 1,
      photo: false,
      lists: false,
      graphics: false,
      marks: ["b", "a"],
      sections: ["SUMMARY", "EXPERIENCE", "EDUCATION"],
      sidebarSections: ["SKILLS"],
      custom: "limited",
      customLimit: 2,
      headings: "standard",
      maxPages: 1,
      dateStyles: ["range"],
      maxSkillGroups: 4,
      theme: { accent: false, spacing: false, pageLength: false, fontPairs: ["inter"] },
    });
    expect(out).toMatchObject({
      columns: 1,
      photo: false,
      lists: false,
      graphics: false,
      marks: ["b", "a"],
      sections: ["SUMMARY", "EXPERIENCE", "EDUCATION"],
      sidebarSections: ["SKILLS"],
      custom: "limited",
      customLimit: 2,
      headings: "standard",
      maxPages: 1,
      dateStyles: ["range"],
      maxSkillGroups: 4,
    });
    expect(out.theme).toEqual({ accent: false, spacing: false, pageLength: false, fontPairs: ["inter"] });
    expect(isAtLeastAsStrictAs(out, DESIGN_FREE)).toBe(true);
    expect(warn).not.toHaveBeenCalled();
    expect(DESIGN_FREE.photo).toBe(true); // the base is not mutated
  });

  it("custom: any to limited to none; a limited custom can only shrink", () => {
    expect(tightenCapabilities("t", DESIGN_FREE, { custom: "none" }).custom).toBe("none");
    expect(tightenCapabilities("t", ATS_STRICT, { custom: "none" }).custom).toBe("none");
    expect(tightenCapabilities("t", ATS_STRICT, { custom: "any" }).custom).toBe("limited");
    expect(tightenCapabilities("t", ATS_STRICT, { customLimit: 0 }).customLimit).toBe(0);
    expect(tightenCapabilities("t", ATS_STRICT, { customLimit: 5 }).customLimit).toBe(1);
  });

  it("loosening is ignored and reported once per template and field", () => {
    const out = tightenCapabilities("modern", ATS_STRICT, {
      photo: true,
      lists: true,
      columns: 2,
      marks: ["b", "i", "u", "a"],
      sections: [...ATS_STRICT.sections, "INTERESTS"],
      headings: "free",
      maxPages: 2,
      dateStyles: ["range", "year"],
      maxSkillGroups: 0,
      theme: { accent: true, fontPairs: ["inter", "source-serif", "georgia-arial"] },
    });
    expect(out).toEqual(ATS_STRICT);
    const fields = warn.mock.calls.map((c) => String(c[0]));
    for (const f of ["photo", "lists", "columns", "marks", "sections", "headings", "dateStyles", "maxSkillGroups", "theme.accent", "theme.fontPairs"]) {
      expect(fields.filter((m) => m.includes(`field "${f}"`))).toHaveLength(1);
    }
    expect(fields.every((m) => m.startsWith("resume.caps.override_ignored"))).toBe(true);
    warn.mockClear();
    tightenCapabilities("modern", ATS_STRICT, { photo: true }); // same template + field: not reported again
    expect(warn).not.toHaveBeenCalled();
    tightenCapabilities("other", ATS_STRICT, { photo: true }); // another template: reported
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("a mixed list keeps the tightening part and drops the loosening part", () => {
    const out = tightenCapabilities("t", ATS_STRICT, { theme: { fontPairs: ["inter", "source-serif"] } });
    expect(out.theme.fontPairs).toEqual(["inter"]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("will not leave a template without a font or a date style", () => {
    expect(tightenCapabilities("t", ATS_STRICT, { theme: { fontPairs: [] } }).theme.fontPairs).toEqual(["inter", "georgia-arial"]);
    expect(tightenCapabilities("t", DESIGN_FREE, { dateStyles: [] }).dateStyles).toEqual(["range", "year"]);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("ats can be demoted, never promoted", () => {
    expect(tightenCapabilities("t", ATS_STRICT, { ats: false }).ats).toBe(false);
    expect(tightenCapabilities("t", DESIGN_FREE, { ats: true }).ats).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("junk is ignored: wrong types, unknown values, non-object overrides", () => {
    const out = tightenCapabilities("t", DESIGN_FREE, { photo: "no", columns: 3, marks: "b", sections: ["NOPE"], custom: "many", maxPages: 5, maxSkillGroups: -1, theme: "x", unknown: true });
    expect(out).toEqual(DESIGN_FREE);
    expect(tightenCapabilities("t", DESIGN_FREE, "tighten")).toBe(DESIGN_FREE);
    expect(warn).toHaveBeenCalled();
  });

  it("allowedMarks is the marks list", () => {
    expect(allowedMarks(ATS_STRICT)).toEqual(["b"]);
    expect(allowedMarks(DESIGN_FREE)).toEqual(["b", "i", "u", "a"]);
  });
});

describe("DESIGN 6.6 vectors: caps-doc under ATS_STRICT and DESIGN_FREE", () => {
  const doc = fixtureDoc("caps-doc");
  const before = JSON.stringify(doc);

  it("hiddenContent: ATS_STRICT hides eight things", () => {
    const hidden = hiddenContent(doc, VECTOR_THEME, ATS_STRICT);
    expect(hidden.map((h) => h.kind)).toEqual(["photo", "marks", "lists", "section", "custom", "headingOverride", "accent", "font"]);
    expect(hidden).toEqual([
      { kind: "photo", label: "photo" },
      { kind: "marks", label: "italic, links", count: 2 },
      { kind: "lists", label: "lists", count: 2 },
      { kind: "section", label: "Interests" },
      { kind: "custom", label: "Awards", count: 1 },
      { kind: "headingOverride", label: "custom headings", count: 1 },
      { kind: "accent", label: "accent colour" },
      { kind: "font", label: "font" },
    ]);
    expect(hidden).toHaveLength(8);
  });

  it("hiddenContent: DESIGN_FREE hides nothing", () => {
    expect(hiddenContent(doc, VECTOR_THEME, DESIGN_FREE)).toEqual([]);
  });

  it("hiddenContent never changes the document", () => {
    hiddenContent(doc, VECTOR_THEME, ATS_STRICT);
    expect(JSON.stringify(doc)).toBe(before);
  });

  it("hiddenContent: pages, and no accent / font item when the theme is the plain default", () => {
    expect(hiddenContent(doc, VECTOR_THEME, caps({ maxPages: 1 })).map((h) => h.kind)).toContain("pages");
    const plain = hiddenContent(doc, DEFAULT_THEME, ATS_STRICT).map((h) => h.kind);
    expect(plain).not.toContain("accent");
    expect(plain).not.toContain("font");
    expect(hiddenContent(doc, { ...DEFAULT_THEME, _touched: ["accent"] }, ATS_STRICT).map((h) => h.kind)).toContain("accent");
  });

  it("hiddenContent: custom none hides every custom section; user-hidden content is not counted", () => {
    const none = hiddenContent(doc, DEFAULT_THEME, caps({ custom: "none" }));
    expect(none.find((h) => h.kind === "custom")).toEqual({ kind: "custom", label: "Volunteering & Impact!, Awards", count: 2 });
    const d = clone(doc) as ResumeDocument;
    d.sections.find((s) => s.kind === "INTERESTS")!.hidden = true;
    d.basics.photo = null;
    const kinds = hiddenContent(d, DEFAULT_THEME, ATS_STRICT).map((h) => h.kind);
    expect(kinds).not.toContain("section");
    expect(kinds).not.toContain("photo");
  });

  it("hiddenNotice composes the toast", () => {
    expect(hiddenNotice([], ATS_STRICT)).toBeNull();
    expect(hiddenNotice(hiddenContent(doc, VECTOR_THEME, ATS_STRICT).slice(0, 2), ATS_STRICT)).toBe("Hidden in this ATS template: photo, italic, links.");
    expect(hiddenNotice([{ kind: "photo", label: "photo" }], DESIGN_FREE)).toBe("Hidden in this template: photo.");
  });

  it("planSections: ATS keeps the first custom section and the document order", () => {
    const plan = planSections(doc, ATS_STRICT).map((p) => [p.section.id, p.verdict]);
    expect(plan).toEqual([
      ["s_summary", "shown"],
      ["s_experience", "shown"],
      ["s_skills", "shown"],
      ["s_volunteer", "shown"],
      ["s_awards01", "custom"],
      ["s_interests", "kind"],
    ]);
    expect(planSections(doc, DESIGN_FREE).every((p) => p.verdict === "shown")).toBe(true);
  });

  it("headingFor: standard headings ignore the override, custom sections keep their title", () => {
    const exp = doc.sections.find((s) => s.kind === "EXPERIENCE")!;
    const cus = doc.sections.find((s) => s.id === "s_volunteer")!;
    expect(headingFor(exp, "EXPERIENCE", ATS_STRICT)).toBe("Experience");
    expect(headingFor(exp, "EXPERIENCE", DESIGN_FREE)).toBe("Where I've worked");
    expect(headingFor(cus, "CUSTOM", ATS_STRICT)).toBe("Volunteering & Impact!");
    expect(headingFor({}, "SKILLS", DESIGN_FREE)).toBe("Skills");
    expect(headingFor({}, null, DESIGN_FREE)).toBe("Additional Information");
  });

  it("photoShown: capability, theme flag (null = template default) and a stored photo", () => {
    expect(photoShown(doc, { showPhoto: true }, DESIGN_FREE)).toBe(true);
    expect(photoShown(doc, { showPhoto: null }, DESIGN_FREE)).toBe(false); // photoDefault false everywhere
    expect(photoShown(doc, { showPhoto: null }, caps({ photo: true, photoDefault: true }))).toBe(true);
    expect(photoShown(doc, { showPhoto: false }, DESIGN_FREE)).toBe(false);
    expect(photoShown(doc, { showPhoto: true }, ATS_STRICT)).toBe(false);
    expect(photoShown({ ...doc, basics: { name: "x" } }, { showPhoto: true }, DESIGN_FREE)).toBe(false);
  });

  it("/doc/text and parsed_json do not depend on the template (same plain output both ways)", () => {
    // Neither function takes a profile; this pins that, and that the render side never mutated the doc.
    const text = renderText(doc);
    const structured = JSON.stringify(toStructured(doc));
    hiddenContent(doc, VECTOR_THEME, ATS_STRICT);
    expect(renderText(doc)).toBe(text);
    expect(JSON.stringify(toStructured(doc))).toBe(structured);
    expect(text).toContain("Rock climbing"); // the plain text keeps content a template hides
  });
});

describe("DESIGN 6.4 / 6.6 vectors: editor control states", () => {
  const doc = fixtureDoc("caps-doc");
  const ats = controlStates(doc, ATS_STRICT);
  const free = controlStates(doc, DESIGN_FREE);

  it("toolbar buttons rendered", () => {
    expect(ats.toolbar).toEqual(["b"]);
    expect(free.toolbar).toEqual(["b", "i", "u", "bullet", "number", "a"]);
    expect(controlStates(doc, caps({ marks: [], lists: false })).toolbar).toEqual([]); // no toolbar at all
  });

  it("accent swatches", () => {
    expect(ats.accent.enabled).toBe(false);
    expect(ats.accent.hint).toBe("(ATS) colours are not used by this template");
    expect(free.accent).toEqual({ enabled: true });
  });

  it("font family options: 2 vs 3", () => {
    expect(ats.fontPairs).toHaveLength(2);
    expect(free.fontPairs).toHaveLength(3);
  });

  it("add section: Interests row", () => {
    expect(ats.addSection.INTERESTS).toMatchObject({ enabled: false, label: "Not in this ATS template" });
    expect(free.addSection.INTERESTS).toMatchObject({ enabled: false, label: "Already added" }); // the fixture has one
    const without = clone(doc) as ResumeDocument;
    without.sections = without.sections.filter((s) => s.kind !== "INTERESTS");
    expect(controlStates(without, DESIGN_FREE).addSection.INTERESTS).toEqual({ enabled: true, label: "Add to resume" });
    expect(controlStates(without, ATS_STRICT).addSection.INTERESTS.enabled).toBe(false);
  });

  it("add section: Custom Section row", () => {
    expect(ats.addSection.CUSTOM).toMatchObject({ enabled: false, label: "Limit reached (ATS)" }); // 2 custom present > 1
    expect(free.addSection.CUSTOM).toEqual({ enabled: true, label: "Add to resume" });
    const none = clone(doc) as ResumeDocument;
    none.sections = none.sections.filter((s) => s.kind !== "CUSTOM");
    expect(controlStates(none, ATS_STRICT).addSection.CUSTOM).toEqual({ enabled: true, label: "Add to resume" }); // 0 < 1
    expect(controlStates(none, caps({ custom: "none" })).addSection.CUSTOM).toMatchObject({ enabled: false, label: "Not in this ATS template" });
  });

  it("add section: standard kinds are 'Add to resume' until the document has one", () => {
    expect(ats.addSection.EXPERIENCE).toEqual({ enabled: false, label: "Already added" });
    expect(ats.addSection.EDUCATION).toEqual({ enabled: true, label: "Add to resume" });
  });

  it("section title rename and the custom title pattern", () => {
    expect(ats.sectionTitleEditable.enabled).toBe(false);
    expect(ats.sectionTitleEditable.hint).toMatch(/Standard heading/);
    expect(free.sectionTitleEditable.enabled).toBe(true);
    expect(ats.customTitlePattern).toBe(LIMITED_CUSTOM_TITLE);
    expect(free.customTitlePattern).toBeNull();
    expect(LIMITED_CUSTOM_TITLE.test("Volunteering")).toBe(true);
    expect(LIMITED_CUSTOM_TITLE.test("Volunteering & Impact!")).toBe(false);
    expect(LIMITED_CUSTOM_TITLE.test("A")).toBe(false);
    expect(LIMITED_CUSTOM_TITLE.test("A".repeat(31))).toBe(false);
  });

  it("insights ATS group, photo slot, spacing, page length, date style control", () => {
    expect(ats.atsRulesGroup).toBe(true);
    expect(free.atsRulesGroup).toBe(false);
    expect(ats.photoSlot).toBe(false);
    expect(free.photoSlot).toBe(true);
    expect(ats.spacing.enabled).toBe(true);
    expect(controlStates(doc, caps({ theme: { ...ATS_STRICT.theme, spacing: false } })).spacing).toEqual({ enabled: false, hint: "(fixed by this template)" });
    expect(ats.pageLength).toMatchObject({ enabled: true, twoPages: true });
    expect(controlStates(doc, caps({ maxPages: 1 })).pageLength.twoPages).toBe(false);
    expect(controlStates(doc, caps({ theme: { ...ATS_STRICT.theme, pageLength: false } })).pageLength.enabled).toBe(false);
    expect(ats.dateStyleControl).toBe(false); // only "range"
    expect(free.dateStyleControl).toBe(true);
  });
});

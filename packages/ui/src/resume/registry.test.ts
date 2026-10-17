import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { ATS_STRICT, DESIGN_FREE, isAtLeastAsStrictAs, resetOverrideWarnings } from "./capabilities";
import { DEFAULT_TEMPLATE_ID, TEMPLATES, TEMPLATE_IDS, getTemplate, hasTemplate, listTemplates, registerTemplateForTests, resolveCapabilities } from "./registry";
import { designFree } from "./templates/__test__/designFree";

const thumbs = join(dirname(fileURLToPath(import.meta.url)), "thumbs");

/** The gallery order (TEMPLATES-DESIGN section 0). */
const PRODUCTION_IDS = ["modern", "consultant"];

describe("registry rule (DESIGN 6.2): every template declares capabilities", () => {
  it("no template still declares atsSafe or supports", () => {
    for (const meta of listTemplates()) {
      expect(meta).not.toHaveProperty("atsSafe");
      expect(meta).not.toHaveProperty("supports");
      expect(meta.capabilities).toBeTruthy();
    }
  });

  it("an ats: true template is at least as strict as ATS_STRICT; any other stays inside DESIGN_FREE", () => {
    const unregister = registerTemplateForTests(designFree);
    try {
      for (const id of TEMPLATE_IDS) {
        const caps = TEMPLATES[id].meta.capabilities;
        if (caps.ats) {
          expect(isAtLeastAsStrictAs(caps, ATS_STRICT)).toBe(true);
          expect(caps.columns).toBe(1);
          expect(caps.headings).toBe("standard");
          expect(caps.custom).not.toBe("any");
        } else {
          expect(isAtLeastAsStrictAs(caps, DESIGN_FREE)).toBe(true);
        }
      }
    } finally {
      unregister();
    }
  });

  it("every template has an id that matches its key, a name, a description and a thumbnail on disk", () => {
    for (const id of TEMPLATE_IDS) {
      const { meta } = TEMPLATES[id];
      expect(meta.id).toBe(id);
      expect(meta.name).not.toBe("");
      expect(meta.description).not.toBe("");
      expect(existsSync(join(thumbs, meta.thumb))).toBe(true);
    }
  });

  it("every template declares a category and a non-empty atsNote", () => {
    for (const meta of listTemplates()) {
      expect(["ats", "employer", "styled"], meta.id).toContain(meta.category);
      expect(meta.atsNote.trim(), meta.id).not.toBe("");
    }
  });

  it("the production templates, in gallery order (each template story adds its id here)", () => {
    expect(TEMPLATE_IDS).toEqual(PRODUCTION_IDS);
    expect(DEFAULT_TEMPLATE_ID).toBe("modern");
    expect(getTemplate("modern").meta.capabilities).toEqual(ATS_STRICT);
    expect(getTemplate("modern").meta.capabilities.photo).toBe(false);
    expect(getTemplate("modern").meta.capabilities.marks).toEqual(["b"]);
  });

  it("the test template is registered only while a test holds it", () => {
    expect(hasTemplate(designFree.meta.id)).toBe(false);
    const unregister = registerTemplateForTests(designFree);
    expect(hasTemplate(designFree.meta.id)).toBe(true);
    expect(listTemplates().map((m) => m.id)).toContain(designFree.meta.id);
    unregister();
    expect(hasTemplate(designFree.meta.id)).toBe(false);
    expect(TEMPLATE_IDS).toEqual(PRODUCTION_IDS);
  });
});

describe("resolveCapabilities (registry -> admin overrides)", () => {
  let warn: MockInstance<typeof console.warn>;
  beforeEach(() => {
    resetOverrideWarnings();
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it("no overrides: the registered profile", () => {
    expect(resolveCapabilities("modern", {})).toBe(ATS_STRICT);
    expect(resolveCapabilities("modern")).toBe(ATS_STRICT);
    expect(resolveCapabilities("modern", null)).toBe(ATS_STRICT);
  });

  it("an unknown id resolves like getTemplate: to the default template", () => {
    expect(resolveCapabilities("nope", {})).toBe(ATS_STRICT);
    expect(resolveCapabilities(null, {})).toBe(ATS_STRICT);
  });

  it("applies the override of that template only, tightening", () => {
    const c = resolveCapabilities("modern", { modern: { marks: [], maxPages: 1 }, other: { marks: ["b"] } });
    expect(c.marks).toEqual([]);
    expect(c.maxPages).toBe(1);
    expect(c.headings).toBe("standard");
    expect(isAtLeastAsStrictAs(c, ATS_STRICT)).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it("an override that loosens Modern is ignored with a warning; ats can be demoted", () => {
    const c = resolveCapabilities("modern", { modern: { photo: true, lists: true, ats: false } });
    expect(c.photo).toBe(false);
    expect(c.lists).toBe(false);
    expect(c.ats).toBe(false);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("works for a registered second template", () => {
    const unregister = registerTemplateForTests(designFree);
    try {
      const c = resolveCapabilities(designFree.meta.id, { [designFree.meta.id]: { photo: false, custom: "none" } });
      expect(c.photo).toBe(false);
      expect(c.custom).toBe("none");
      expect(c.columns).toBe(2);
      expect(resolveCapabilities(designFree.meta.id, {})).toBe(DESIGN_FREE);
    } finally {
      unregister();
    }
  });

  it("an inherited key such as toString is not an override", () => {
    expect(resolveCapabilities("modern", {})).toBe(ATS_STRICT);
    const weird = Object.create({ modern: { photo: false } }) as Record<string, unknown>;
    expect(resolveCapabilities("modern", weird)).toBe(ATS_STRICT);
  });
});

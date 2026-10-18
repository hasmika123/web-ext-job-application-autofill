import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TEMPLATES, TEMPLATE_IDS } from "./registry";

/**
 * `meta.defaults` (applied on a template switch to the theme keys the user never touched, R3.4) has a Java twin,
 * `TemplateThemeDefaults.BUILT_IN`, because `PATCH .../doc/template` applies it on the server. Both are compared
 * with `__fixtures__/template-defaults.json` (a byte-identical copy lives in `api/src/test/resources/resume-doc`),
 * so a template that gains defaults on one side only fails a test on the other.
 */
const golden = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "__fixtures__", "template-defaults.json"), "utf8")) as Record<string, unknown>;

describe("template defaults parity with the Java registry", () => {
  it("every registered template's meta.defaults is the fixture's entry, and the fixture names no other template", () => {
    for (const id of TEMPLATE_IDS) {
      expect(golden, `fixture entry for ${id}`).toHaveProperty(id);
      expect(TEMPLATES[id].meta.defaults ?? {}, id).toEqual(golden[id]);
    }
    expect(Object.keys(golden).sort()).toEqual([...TEMPLATE_IDS].sort());
  });

  it("only user-facing theme keys can be defaulted (the Java side accepts the same set)", () => {
    const allowed = ["accent", "fontPair", "spacing", "pageSize", "dateStyle", "showPhoto"];
    for (const id of TEMPLATE_IDS) {
      for (const key of Object.keys(TEMPLATES[id].meta.defaults ?? {})) expect(allowed).toContain(key);
    }
  });
});

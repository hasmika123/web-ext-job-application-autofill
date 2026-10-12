import { describe, expect, it } from "vitest";
import { FIXTURES, fixtureDoc, fixtureText } from "./test-fixtures";
import { renderText } from "./text";

describe("text.ts reproduces the Java plain-text export byte for byte", () => {
  for (const name of FIXTURES) {
    it(`${name}: equals ${name}.txt`, () => {
      expect(renderText(fixtureDoc(name))).toBe(fixtureText(`${name}.txt`));
    });
  }

  it("an empty document renders the empty string, a non-empty one ends with exactly one newline", () => {
    expect(renderText({})).toBe("");
    expect(renderText({ basics: { name: "A" } })).toBe("A\n");
  });

  it("keeps hidden content out and collapses internal whitespace", () => {
    const t = renderText(fixtureDoc("full"));
    expect(t).not.toContain("Initech");
    expect(t).not.toContain("COBOL");
    expect(t).toContain("Built an internal tool used by 300 engineers.");
  });

  it("falls back to the kind's default title, upper-cased", () => {
    const doc = { sections: [{ kind: "CUSTOM", title: "  ", items: [{ title: "x" }] }] };
    expect(renderText(doc)).toBe("ADDITIONAL INFORMATION\nx\n");
  });
});

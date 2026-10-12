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

describe("text.ts v2 rules (twin of ResumeDocumentTextTest)", () => {
  it("summary lists and numbered bullets use the literal prefixes", () => {
    const doc = {
      sections: [
        { kind: "SUMMARY", items: [{ text: "a\n\n  b  \nc", list: "bullet" }] },
        { kind: "CUSTOM", title: "X", items: [{ title: "T", listStyle: "number", bullets: [{ text: "p" }, { text: "q" }] }] },
        { kind: "PROJECTS", items: [{ title: "P", listStyle: "bullet", bullets: [{ text: "r" }] }] },
      ],
    };
    expect(renderText(doc)).toBe("SUMMARY\n- a\n- b\n- c\n\nX\nT\n1. p\n1. q\n\nPROJECTS\nP\n- r\n");
    expect(renderText({ sections: [{ kind: "SUMMARY", items: [{ text: "a\nb", list: "number" }] }] })).toBe("SUMMARY\n1. a\n1. b\n");
    expect(renderText({ sections: [{ kind: "SUMMARY", items: [{ text: "a\nb" }] }] })).toBe("SUMMARY\na b\n");
  });

  it("a link mark appends its href unless the text already is the URL", () => {
    const doc = {
      sections: [
        {
          kind: "EXPERIENCE",
          items: [
            {
              title: "T",
              bullets: [
                { text: "See my site now", marks: [{ s: 4, e: 11, t: "a", href: "https://x.dev" }, { s: 0, e: 3, t: "b" }] },
                { text: "https://x.dev", marks: [{ s: 0, e: 13, t: "a", href: "https://x.dev" }] },
                { text: "bad range", marks: [{ s: 2, e: 99, t: "a", href: "https://x.dev" }] },
              ],
            },
          ],
        },
      ],
    };
    expect(renderText(doc)).toBe("EXPERIENCE\nT\n- See my site (https://x.dev) now\n- https://x.dev\n- bad range\n");
  });

  it("link suffixes use raw offsets, before whitespace is collapsed", () => {
    const doc = {
      sections: [{ kind: "ACHIEVEMENTS", items: [{ text: "  a\n\n b  c  ", marks: [{ s: 2, e: 8, t: "a", href: " mailto:z@x.dev " }] }] }],
    };
    expect(renderText(doc)).toBe("ACHIEVEMENTS\n- a b (mailto:z@x.dev) c\n");
  });

  it("Interests render as one comma line", () => {
    const doc = {
      sections: [
        { kind: "INTERESTS", items: [{ text: " Chess " }, { text: "" }, { text: "Open\n source" }, { text: "x", hidden: true }] },
        { kind: "INTERESTS", hidden: true, items: [{ text: "never" }] },
        { kind: "INTERESTS", items: [{ text: "  " }] },
      ],
    };
    expect(renderText(doc)).toBe("INTERESTS\nChess, Open source\n");
  });

  it("the caps fixture renders (list lines, numbered bullet with a link, Interests, both custom sections)", () => {
    const t = renderText(fixtureDoc("caps-doc"));
    expect(t).toContain("SUMMARY\n- Product leader who ships.\n- Obsessed with clarity.");
    expect(t).toContain("WHERE I'VE WORKED\nGroup Product Manager — Northwind · Remote · 2020-03 – Present");
    expect(t).toContain("1. Grew revenue 3x after launching the self-serve plan (details in the case study (https://casey.example.com/case-study)).");
    expect(t).toContain("VOLUNTEERING & IMPACT!");
    expect(t).toContain("AWARDS\nProduct of the Year — ProductCon · 2023");
    expect(t).toContain("INTERESTS\nRock climbing, Specialty coffee");
  });
});

import { describe, expect, it } from "vitest";
import { fixtureDoc } from "./test-fixtures";
import { toStructured, toStructuredJson } from "./project";

describe("project.ts v2 rules (twin of ResumeDocumentProjectorTest)", () => {
  it("v2 content outside the six slots, and all formatting, never reaches the projection", () => {
    const doc = fixtureDoc("full-v2");
    const projected = toStructuredJson(doc);
    expect(projected).not.toMatch(/Chess|Trail|resume-photos/);

    // strip every mark, list setting and the photo: a formatting-only change must not move parsed_json
    const plain = JSON.parse(JSON.stringify(doc), (k, v) => (["marks", "list", "listStyle", "photo"].includes(k) ? undefined : v));
    expect(toStructuredJson(plain)).toBe(projected);
  });

  it("a list summary projects as its trimmed non-empty lines", () => {
    const list = { sections: [{ kind: "SUMMARY", items: [{ text: "  one \n\n  two\r\n \nthree  ", list: "number" }] }] };
    expect(toStructured(list).summary).toBe("one\ntwo\nthree");
    const plain = { sections: [{ kind: "SUMMARY", items: [{ text: "  one \n\n  two  " }] }] };
    expect(toStructured(plain).summary).toBe("one \n\n  two");
  });

  it("the caps fixture projects like any document (INTERESTS and CUSTOM are not slots)", () => {
    const s = toStructured(fixtureDoc("caps-doc"));
    expect(s.summary).toBe("Product leader who ships.\nObsessed with clarity.");
    expect(s.skills).toHaveLength(16);
    expect(s.experience).toHaveLength(1);
    expect(JSON.stringify(s)).not.toMatch(/Rock climbing|Mentor|Product of the Year/);
  });
});

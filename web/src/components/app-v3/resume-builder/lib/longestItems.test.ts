import { describe, expect, it } from "vitest";
import type { ResumeDocument } from "@kiwiply/ui";
import { testDoc } from "../state/test-doc";
import { LONGEST_COUNT, longestItems } from "./longestItems";

describe("longestItems", () => {
  it("names the three longest items, longest first, with their section", () => {
    const found = longestItems(testDoc());
    expect(found).toHaveLength(LONGEST_COUNT);
    expect(found[0]).toMatchObject({ itemId: "i_exp00001", section: "Experience", label: "Software Engineer · Acme" });
    expect(found.map((f) => f.chars)).toEqual([...found.map((f) => f.chars)].sort((a, b) => b - a));
  });

  it("ignores hidden sections and items", () => {
    const doc = testDoc();
    const exp = doc.sections.find((s) => s.kind === "EXPERIENCE")!;
    (exp.items[0] as { hidden?: boolean }).hidden = true;
    expect(longestItems(doc).map((f) => f.itemId)).not.toContain("i_exp00001");
    doc.sections.find((s) => s.kind === "SKILLS")!.hidden = true;
    expect(longestItems(doc).map((f) => f.itemId)).not.toContain("i_skl00001");
  });

  it("an empty document has none", () => {
    const empty: ResumeDocument = { schema: 2, meta: { title: "x" }, basics: {}, sections: [] };
    expect(longestItems(empty)).toEqual([]);
  });
});

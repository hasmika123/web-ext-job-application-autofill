import { describe, expect, it } from "vitest";
import type { ResumeDocument } from "@kiwiply/ui";
import { linesOfDoc, linesOfSection, longestBullets, longestFirst, resolveRef, textOfRef } from "./aiRefs";

const doc = (): ResumeDocument => ({
  schema: 2,
  meta: { title: "T" },
  basics: { name: "P" },
  sections: [
    { id: "s_sum", kind: "SUMMARY", title: "Summary", items: [{ id: "i_sum", text: "A senior engineer who ships." }] },
    {
      id: "s_exp",
      kind: "EXPERIENCE",
      title: "Experience",
      items: [
        {
          id: "i_a",
          title: "Eng",
          org: "Acme",
          bullets: [
            { id: "b_short", text: "Cut latency" },
            { id: "b_long", text: "Led the migration of the billing platform across three regions with zero downtime" },
            { id: "b_empty", text: "  " },
          ],
        },
        { id: "i_hidden", title: "Old", org: "Zed", hidden: true, bullets: [{ id: "b_hid", text: "Hidden item bullet" }] },
      ],
    },
    { id: "s_ach", kind: "ACHIEVEMENTS", title: "Achievements", items: [{ id: "i_ach", text: "Won the platform award" }] },
    { id: "s_skl", kind: "SKILLS", title: "Skills", items: [{ id: "i_skl", group: "L", skills: ["Go"] }] },
    { id: "s_hid", kind: "EXPERIENCE", title: "Hidden", hidden: true, items: [{ id: "i_h2", title: "X", org: "Y", bullets: [{ id: "b_h2", text: "Not sent" }] }] },
  ],
});

describe("which lines AI can rewrite", () => {
  it("takes bullets, the summary and achievements; skips empty lines, hidden items and hidden sections", () => {
    const refs = linesOfDoc(doc()).map((l) => l.ref);
    expect(refs).toEqual(["i_sum", "b_short", "b_long", "i_ach"]);
  });

  it("knows where each line lives", () => {
    const lines = linesOfSection(doc().sections[1]);
    expect(lines[1].at).toEqual({ sectionId: "s_exp", itemId: "i_a", bulletId: "b_long" });
    expect(linesOfSection(doc().sections[0])[0].at).toEqual({ sectionId: "s_sum", itemId: "i_sum" });
    expect(linesOfSection(doc().sections[3])).toEqual([]);
  });

  it("longestFirst sorts by length, keeps document order for ties and honours the cap", () => {
    const lines = linesOfDoc(doc());
    expect(longestFirst(lines, 2).map((l) => l.ref)).toEqual(["b_long", "i_sum"]);
    expect(longestFirst(lines, 0)).toEqual([]);
    expect(longestFirst(lines, 99)).toHaveLength(4);
  });

  it("longestBullets leaves out the summary and achievements", () => {
    expect(longestBullets(doc(), 3).map((l) => l.ref)).toEqual(["b_long", "b_short"]);
  });
});

describe("finding a ref again", () => {
  it("resolves bullets, summary and achievement ids, and the literal 'summary'", () => {
    const d = doc();
    expect(resolveRef(d, "b_short")).toEqual({ sectionId: "s_exp", itemId: "i_a", bulletId: "b_short" });
    expect(resolveRef(d, "i_ach")).toEqual({ sectionId: "s_ach", itemId: "i_ach" });
    expect(resolveRef(d, "summary")).toEqual({ sectionId: "s_sum", itemId: "i_sum" });
    expect(resolveRef(d, "nope")).toBeNull();
  });

  it("'summary' with no summary item resolves to nothing (the editor then adopts the server's copy)", () => {
    const d = doc();
    d.sections = d.sections.filter((s) => s.kind !== "SUMMARY");
    expect(resolveRef(d, "summary")).toBeNull();
  });

  it("reads the text a ref has now", () => {
    const d = doc();
    expect(textOfRef(d, "b_short")).toBe("Cut latency");
    expect(textOfRef(d, "summary")).toBe("A senior engineer who ships.");
    expect(textOfRef(d, "nope")).toBeNull();
  });
});

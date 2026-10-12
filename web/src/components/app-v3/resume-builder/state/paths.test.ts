import { describe, expect, it } from "vitest";
import type { ResumeDocument } from "@kiwiply/ui";
import { fieldIdForPath } from "./paths";

const doc: ResumeDocument = {
  schema: 2,
  meta: { title: "T" },
  basics: { name: "P", links: [{ label: "a", url: "x" }, { label: "b", url: "y" }] },
  sections: [
    { id: "s_sum", kind: "SUMMARY", title: "Summary", items: [{ id: "i_sum0001", text: "Hi" }] },
    {
      id: "s_exp",
      kind: "EXPERIENCE",
      title: "Experience",
      items: [{ id: "i_exp00001", title: "Eng", start: "2020", bullets: [{ id: "b_aaaaaaaa", text: "x" }, { id: "b_bbbbbbbb", text: "y" }] }],
    },
    { id: "s_skl", kind: "SKILLS", items: [{ id: "i_skl00001", group: "L", skills: ["Go"] }] },
  ],
};

describe("fieldIdForPath", () => {
  it("maps the resume name and the header fields", () => {
    expect(fieldIdForPath(doc, "$.meta.title")).toBe("meta.title");
    expect(fieldIdForPath(doc, "$.basics.name")).toBe("basics.name");
    expect(fieldIdForPath(doc, "$.basics.email")).toBe("basics.email");
    expect(fieldIdForPath(doc, "$.basics.links[1].url")).toBe("basics.link.1.url");
    expect(fieldIdForPath(doc, "$.basics.links[0].label")).toBe("basics.link.0.label");
    expect(fieldIdForPath(doc, "$.basics.links")).toBe("basics.links");
    expect(fieldIdForPath(doc, "$.basics.photo.key")).toBe("basics.photo");
  });

  it("maps a section, its heading, its items and their fields", () => {
    expect(fieldIdForPath(doc, "$.sections[1]")).toBe("s_exp");
    expect(fieldIdForPath(doc, "$.sections[1].kind")).toBe("s_exp");
    expect(fieldIdForPath(doc, "$.sections[1].title")).toBe("s_exp.title");
    expect(fieldIdForPath(doc, "$.sections[1].items")).toBe("s_exp");
    expect(fieldIdForPath(doc, "$.sections[1].items[0]")).toBe("i_exp00001");
    expect(fieldIdForPath(doc, "$.sections[1].items[0].start")).toBe("i_exp00001.start");
    expect(fieldIdForPath(doc, "$.sections[1].items[0].title")).toBe("i_exp00001.title");
  });

  it("maps a bullet (text or marks) to the bullet's id", () => {
    expect(fieldIdForPath(doc, "$.sections[1].items[0].bullets[1].text")).toBe("b_bbbbbbbb");
    expect(fieldIdForPath(doc, "$.sections[1].items[0].bullets[0].marks[2].e")).toBe("b_aaaaaaaa");
    expect(fieldIdForPath(doc, "$.sections[1].items[0].bullets[9].text")).toBe("i_exp00001"); // gone: the row
  });

  it("maps skills, and a summary's text / marks / list to the text field", () => {
    expect(fieldIdForPath(doc, "$.sections[2].items[0].skills[3]")).toBe("i_skl00001.skills");
    expect(fieldIdForPath(doc, "$.sections[2].items[0].group")).toBe("i_skl00001.group");
    expect(fieldIdForPath(doc, "$.sections[0].items[0].text")).toBe("i_sum0001.text");
    expect(fieldIdForPath(doc, "$.sections[0].items[0].marks[0].href")).toBe("i_sum0001.text");
    expect(fieldIdForPath(doc, "$.sections[0].items[0].list")).toBe("i_sum0001.text");
  });

  it("is null for what the document no longer has, and for nonsense", () => {
    expect(fieldIdForPath(doc, "$.sections[7].title")).toBeNull();
    expect(fieldIdForPath(doc, "$")).toBeNull();
    expect(fieldIdForPath(doc, "$.nonsense")).toBeNull();
    expect(fieldIdForPath(doc, "$.sections[1].items[5].title")).toBe("s_exp");
  });
});

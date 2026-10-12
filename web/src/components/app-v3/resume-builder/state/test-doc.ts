/** Test helper: a small valid ResumeDocument and a ready-made editor state. */
import type { ResumeDocument } from "@kiwiply/ui";
import { initEditorState } from "./reducer";
import type { EditorState } from "./types";

export function testDoc(): ResumeDocument {
  return {
    schema: 2,
    meta: { title: "Backend SWE" },
    basics: { name: "Priya Sharma", headline: "Software Engineer" },
    sections: [
      { id: "s_sum", kind: "SUMMARY", title: "Summary", items: [{ id: "i_sum0001", text: "Engineer.", src: "parsed" }] },
      {
        id: "s_exp",
        kind: "EXPERIENCE",
        title: "Experience",
        items: [
          {
            id: "i_exp00001",
            title: "Software Engineer",
            org: "Acme",
            start: "2022-06",
            end: null,
            current: true,
            bullets: [
              { id: "b_aaaaaaaa", text: "Led migration", src: "parsed" },
              { id: "b_bbbbbbbb", text: "Cut latency", src: "parsed" },
            ],
          },
          { id: "i_exp00002", title: "Intern", org: "Beta", start: "2020", end: "2021", bullets: [] },
        ],
      },
      { id: "s_skl", kind: "SKILLS", title: "Skills", items: [{ id: "i_skl00001", group: "Languages", skills: ["Go"] }] },
    ],
  };
}

export function testState(overrides: Partial<EditorState> = {}): EditorState {
  return { ...initEditorState({ doc: testDoc(), templateId: "modern", theme: null, docVersion: 1 }), ...overrides };
}

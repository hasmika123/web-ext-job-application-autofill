import { describe, expect, it } from "vitest";
import type { ResumeDocument, ResumeSection } from "@kiwiply/ui";
import { DEFAULT_BUILDER_CONFIG } from "@/lib/resume-builder-config.shared";
import {
  BASICS_MAX,
  MAX_LINKS,
  MAX_SKILLS,
  MAX_SKILL_CHARS,
  canUndoEdit,
  currentDoc,
  editorReducer,
  initEditorState,
} from "./reducer";
import type { DocLimits, EditorAction, EditorState } from "./types";
import { testDoc } from "./test-doc";

const at = 1000;
const run = (s: EditorState, ...actions: EditorAction[]) => actions.reduce(editorReducer, s);

/** Every kind, one item each (two where order matters), plus a profile link to prove duplicates drop it. */
function sinkDoc(): ResumeDocument {
  return {
    schema: 2,
    meta: { title: "Sink" },
    basics: { name: "Priya", links: [] },
    sections: [
      { id: "s_sum", kind: "SUMMARY", title: "Summary", items: [{ id: "i_sum0001", text: "Engineer.", src: "parsed", list: null }] },
      {
        id: "s_exp",
        kind: "EXPERIENCE",
        title: "Experience",
        items: [
          { id: "i_exp00001", title: "Staff", org: "Acme", profileItemId: 7, bullets: [{ id: "b_aaaaaaaa", text: "Led migration", src: "parsed", marks: [{ s: 0, e: 3, t: "b" }] }, { id: "b_bbbbbbbb", text: "Cut latency", src: "parsed" }] },
          { id: "i_exp00002", title: "Intern", org: "Beta", bullets: [] },
        ],
      },
      { id: "s_edu", kind: "EDUCATION", title: "Education", items: [{ id: "i_edu00001", school: "MIT", degree: "BS", bullets: [] }] },
      { id: "s_skl", kind: "SKILLS", title: "Skills", items: [{ id: "i_skl00001", group: "Languages", skills: ["Go", "Rust", "SQL"] }] },
      { id: "s_prj", kind: "PROJECTS", title: "Projects", items: [] },
      { id: "s_crt", kind: "CERTIFICATIONS", title: "Certifications", items: [] },
      { id: "s_lng", kind: "LANGUAGES", title: "Languages", items: [] },
      { id: "s_ach", kind: "ACHIEVEMENTS", title: "Achievements", items: [{ id: "i_ach00001", text: "Won an award", date: "2023", marks: [{ s: 4, e: 6, t: "i" }] }] },
      { id: "s_int", kind: "INTERESTS", title: "Interests", items: [] },
      { id: "s_cus", kind: "CUSTOM", title: "Volunteering", items: [] },
    ],
  };
}

const stateOf = (doc: ResumeDocument, limits?: DocLimits): EditorState => initEditorState({ doc, templateId: "modern", theme: null, docVersion: 1, limits });
const sink = (limits?: DocLimits) => stateOf(sinkDoc(), limits);
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper reads fields of every kind by name
const sec = (s: EditorState, id: string) => currentDoc(s).sections.find((x) => x.id === id) as ResumeSection & { items: Array<Record<string, any>> };
const itemIds = (s: EditorState, id: string) => sec(s, id).items.map((i) => i.id);

describe("limits come from the config, not literals", () => {
  const tight: DocLimits = { ...DEFAULT_BUILDER_CONFIG.limits, sections: 11, items: 2, bullets: 2, bulletChars: 10, summaryChars: 20, marks: 1 };

  it("clamps bullet and summary text to the config's lengths", () => {
    const s = run(
      sink(tight),
      { type: "summary/edit", sectionId: "s_sum", text: "x".repeat(50), newItemId: "i_n", at },
      { type: "bullet/edit", sectionId: "s_exp", itemId: "i_exp00001", bulletId: "b_aaaaaaaa", text: "y".repeat(50), at },
    );
    expect(sec(s, "s_sum").items[0].text).toHaveLength(20);
    expect(sec(s, "s_exp").items[0].bullets[0].text).toHaveLength(10);
  });

  it("stops adding sections, items and bullets at the config's counts", () => {
    let s = run(sink(tight), { type: "section/add", kind: "CUSTOM", sectionId: "s_c2", title: "More", at });
    expect(currentDoc(s).sections).toHaveLength(11);
    s = run(s, { type: "section/add", kind: "CUSTOM", sectionId: "s_c3", title: "Over", at });
    expect(currentDoc(s).sections).toHaveLength(11); // the 12th is refused

    s = run(s, { type: "item/add", sectionId: "s_exp", itemId: "i_x1", bulletId: "b_x1", at });
    expect(itemIds(s, "s_exp")).toHaveLength(2 + 0); // already two: refused
    s = run(s, { type: "bullet/add", sectionId: "s_exp", itemId: "i_exp00001", bulletId: "b_cccccccc", at });
    expect(sec(s, "s_exp").items[0].bullets).toHaveLength(2); // already two: refused
  });

  it("falls back to the declared defaults when no limits are passed", () => {
    expect(sink().limits).toEqual(DEFAULT_BUILDER_CONFIG.limits);
  });

  it("keeps a text's marks inside the (clamped) text and under the config's mark count", () => {
    const s = run(sink(tight), { type: "bullet/edit", sectionId: "s_exp", itemId: "i_exp00001", bulletId: "b_aaaaaaaa", text: "Led", marks: [{ s: 0, e: 3, t: "b" }, { s: 0, e: 3, t: "i" }], at });
    expect(sec(s, "s_exp").items[0].bullets[0].marks).toEqual([{ s: 0, e: 3, t: "b" }]); // one mark allowed
  });
});

describe("header (basics)", () => {
  it("edits a field, clamps it, ignores a no-op, and coalesces typing into one undo step", () => {
    let s = run(sink(), { type: "basics/field", field: "name", value: "Pri", at }, { type: "basics/field", field: "name", value: "Priya S", at: at + 200 });
    expect(currentDoc(s).basics.name).toBe("Priya S");
    expect(s.history.past).toHaveLength(1);
    const before = s;
    s = run(s, { type: "basics/field", field: "name", value: "Priya S", at: at + 300 });
    expect(s).toBe(before);
    s = run(s, { type: "basics/field", field: "name", value: "n".repeat(500), at: at + 5000 });
    expect(currentDoc(s).basics.name).toHaveLength(BASICS_MAX.name);
    expect(canUndoEdit(s)).toBe(true);
  });

  it("adds, edits and removes links; at most MAX_LINKS", () => {
    let s = run(sink(), { type: "basics/link.add", at });
    expect(currentDoc(s).basics.links).toEqual([{ label: null, url: "" }]);
    s = run(s, { type: "basics/link.edit", index: 0, field: "url", value: "linkedin.com/in/p", at }, { type: "basics/link.edit", index: 0, field: "label", value: "LinkedIn", at });
    expect(currentDoc(s).basics.links).toEqual([{ label: "LinkedIn", url: "linkedin.com/in/p" }]);
    for (let i = 0; i < 12; i++) s = run(s, { type: "basics/link.add", at });
    expect(currentDoc(s).basics.links).toHaveLength(MAX_LINKS);
    s = run(s, { type: "basics/link.remove", index: 0, at });
    expect(currentDoc(s).basics.links).toHaveLength(MAX_LINKS - 1);
    expect(run(s, { type: "basics/link.edit", index: 99, field: "url", value: "x", at })).toBe(s);
    expect(run(s, { type: "basics/link.remove", index: 99, at })).toBe(s);
  });
});

describe("sections", () => {
  it("adds a kind once (CUSTOM any number, always titled) and one history entry undoes it", () => {
    const base = stateOf({ ...sinkDoc(), sections: sinkDoc().sections.filter((s) => s.kind !== "INTERESTS") });
    let s = run(base, { type: "section/add", kind: "INTERESTS", sectionId: "s_new", at });
    expect(currentDoc(s).sections.at(-1)).toMatchObject({ id: "s_new", kind: "INTERESTS", items: [] });
    expect(run(s, { type: "section/add", kind: "INTERESTS", sectionId: "s_dup", at })).toBe(s); // one per kind
    s = run(s, { type: "section/add", kind: "CUSTOM", sectionId: "s_c1", title: "Awards", at }, { type: "section/add", kind: "CUSTOM", sectionId: "s_c2", at });
    expect(currentDoc(s).sections.filter((x) => x.kind === "CUSTOM").map((x) => x.title)).toEqual(["Volunteering", "Awards", "Additional Information"]);
    const undone = run(s, { type: "history/undo" });
    expect(currentDoc(undone).sections.some((x) => x.id === "s_c2")).toBe(false);
    expect(currentDoc(undone).sections.some((x) => x.id === "s_c1")).toBe(true);
  });

  it("removes, hides and shows a section", () => {
    let s = run(sink(), { type: "section/remove", sectionId: "s_prj", at });
    expect(currentDoc(s).sections.some((x) => x.id === "s_prj")).toBe(false);
    expect(run(s, { type: "section/remove", sectionId: "s_prj", at })).toBe(s);
    s = run(s, { type: "section/hide", sectionId: "s_exp", hidden: true, at });
    expect(sec(s, "s_exp").hidden).toBe(true);
    s = run(s, { type: "section/hide", sectionId: "s_exp", hidden: false, at });
    expect(sec(s, "s_exp").hidden).toBe(false);
  });

  it("renames; null resets a built-in section to its standard heading; a custom one keeps a title", () => {
    let s = run(sink(), { type: "section/rename", sectionId: "s_exp", title: "Work History", at });
    expect(sec(s, "s_exp").title).toBe("Work History");
    s = run(s, { type: "section/rename", sectionId: "s_exp", title: null, at: at + 5000 });
    expect("title" in sec(s, "s_exp")).toBe(false);
    s = run(s, { type: "section/rename", sectionId: "s_cus", title: "Mentoring", at }, { type: "section/rename", sectionId: "s_cus", title: "  ", at: at + 5000 });
    expect(sec(s, "s_cus").title).toBe("Mentoring");
    expect(currentDoc(run(sink(), { type: "section/rename", sectionId: "s_exp", title: "x".repeat(200), at })).sections[1].title).toHaveLength(60);
  });

  it("moves to an index (clamped); a move to the same place is a no-op", () => {
    let s = run(sink(), { type: "section/move", sectionId: "s_edu", to: 1, at });
    expect(currentDoc(s).sections.slice(0, 3).map((x) => x.id)).toEqual(["s_sum", "s_edu", "s_exp"]);
    const same = run(s, { type: "section/move", sectionId: "s_edu", to: 1, at });
    expect(same).toBe(s);
    s = run(s, { type: "section/move", sectionId: "s_edu", to: -5, at });
    expect(currentDoc(s).sections[0].id).toBe("s_edu");
    s = run(s, { type: "section/move", sectionId: "s_edu", to: 999, at });
    expect(currentDoc(s).sections.at(-1)?.id).toBe("s_edu");
    expect(run(s, { type: "section/move", sectionId: "nope", to: 0, at })).toBe(s);
  });
});

describe("moves are single history entries", () => {
  it("one undo reverts a section move and one reverts an item move; redo re-applies", () => {
    const base = sink();
    let s = run(base, { type: "section/move", sectionId: "s_edu", to: 0, at }, { type: "item/move", sectionId: "s_exp", itemId: "i_exp00002", to: 0, at: at + 5000 });
    expect(currentDoc(s).sections[0].id).toBe("s_edu");
    expect(sec(s, "s_exp").items.map((i) => (i as { id: string }).id)).toEqual(["i_exp00002", "i_exp00001"]);
    s = run(s, { type: "history/undo" });
    expect(sec(s, "s_exp").items.map((i) => (i as { id: string }).id)).toEqual(["i_exp00001", "i_exp00002"]);
    expect(currentDoc(s).sections[0].id).toBe("s_edu"); // the section move is still in
    s = run(s, { type: "history/undo" });
    expect(currentDoc(s)).toEqual(currentDoc(base));
    s = run(s, { type: "history/redo" });
    expect(currentDoc(s).sections[0].id).toBe("s_edu");
  });
});

describe("items", () => {
  it("adds a kind-aware item: timelines on top, the rest at the end; SUMMARY adds nothing", () => {
    let s = run(
      sink(),
      { type: "item/add", sectionId: "s_edu", itemId: "i_edu00002", bulletId: "b_e2", at },
      { type: "item/add", sectionId: "s_skl", itemId: "i_skl00002", bulletId: "b_s2", at },
      { type: "item/add", sectionId: "s_prj", itemId: "i_prj00001", bulletId: "b_p1", at },
      { type: "item/add", sectionId: "s_crt", itemId: "i_crt00001", bulletId: "b_c1", at },
      { type: "item/add", sectionId: "s_lng", itemId: "i_lng00001", bulletId: "b_l1", at },
      { type: "item/add", sectionId: "s_ach", itemId: "i_ach00002", bulletId: "b_a2", at },
      { type: "item/add", sectionId: "s_int", itemId: "i_int00001", bulletId: "b_i1", at },
      { type: "item/add", sectionId: "s_cus", itemId: "i_cus00001", bulletId: "b_x1", at },
    );
    expect(itemIds(s, "s_edu")).toEqual(["i_edu00002", "i_edu00001"]);
    expect(sec(s, "s_edu").items[0]).toMatchObject({ school: "", degree: "", field: "", gpa: "", bullets: [] });
    expect(itemIds(s, "s_skl")).toEqual(["i_skl00001", "i_skl00002"]);
    expect(sec(s, "s_skl").items[1]).toEqual({ id: "i_skl00002", group: "", skills: [] });
    expect(sec(s, "s_prj").items[0]).toMatchObject({ title: "", url: "", bullets: [{ id: "b_p1", text: "", src: "user" }] });
    expect(sec(s, "s_crt").items[0]).toMatchObject({ title: "", org: "", date: null, url: "" });
    expect(sec(s, "s_lng").items[0]).toEqual({ id: "i_lng00001", name: "", level: "" });
    expect(itemIds(s, "s_ach")).toEqual(["i_ach00001", "i_ach00002"]);
    expect(sec(s, "s_int").items[0]).toEqual({ id: "i_int00001", text: "" });
    expect(sec(s, "s_cus").items[0]).toMatchObject({ title: "", org: "", current: false, bullets: [{ id: "b_x1" }] });
    const sum = run(s, { type: "item/add", sectionId: "s_sum", itemId: "i_sum0002", bulletId: "b_z", at });
    expect(sum).toBe(s);
    // a repeated id is refused
    expect(run(s, { type: "item/add", sectionId: "s_edu", itemId: "i_edu00002", bulletId: "b_e3", at })).toBe(s);
    s = run(s, { type: "history/undo" });
    expect(itemIds(s, "s_cus")).toEqual([]);
  });

  it("duplicates right below with fresh ids, drops the profile link, keeps the content", () => {
    const s = run(sink(), { type: "item/duplicate", sectionId: "s_exp", itemId: "i_exp00001", newItemId: "i_copy0001", newBulletIds: ["b_copy0001", "b_copy0002"], at });
    expect(itemIds(s, "s_exp")).toEqual(["i_exp00001", "i_copy0001", "i_exp00002"]);
    const copy = sec(s, "s_exp").items[1];
    expect(copy).toMatchObject({ title: "Staff", org: "Acme" });
    expect("profileItemId" in copy).toBe(false);
    expect(copy.bullets.map((b: { id: string }) => b.id)).toEqual(["b_copy0001", "b_copy0002"]);
    expect(copy.bullets[0]).toMatchObject({ text: "Led migration", marks: [{ s: 0, e: 3, t: "b" }] });
    expect(sec(s, "s_exp").items[0].profileItemId).toBe(7); // the original keeps its link
    expect(run(s, { type: "item/duplicate", sectionId: "s_sum", itemId: "i_sum0001", newItemId: "i_copy0009", newBulletIds: [], at }).rev).toBe(s.rev);
  });

  it("will not duplicate past the item cap", () => {
    const capped = { ...DEFAULT_BUILDER_CONFIG.limits, items: 2 };
    const s = run(sink(capped), { type: "item/duplicate", sectionId: "s_exp", itemId: "i_exp00001", newItemId: "i_copy0001", newBulletIds: ["b_1", "b_2"], at });
    expect(itemIds(s, "s_exp")).toHaveLength(2);
    expect(s.rev).toBe(0);
  });

  it("hides and shows an item", () => {
    let s = run(sink(), { type: "item/hide", sectionId: "s_exp", itemId: "i_exp00002", hidden: true, at });
    expect(sec(s, "s_exp").items[1].hidden).toBe(true);
    s = run(s, { type: "item/hide", sectionId: "s_exp", itemId: "i_exp00002", hidden: false, at });
    expect(sec(s, "s_exp").items[1].hidden).toBe(false);
  });

  it("moves an item to an index (clamped); bounds are no-ops", () => {
    let s = run(sink(), { type: "item/move", sectionId: "s_exp", itemId: "i_exp00001", to: 1, at });
    expect(itemIds(s, "s_exp")).toEqual(["i_exp00002", "i_exp00001"]);
    const edge = run(s, { type: "item/move", sectionId: "s_exp", itemId: "i_exp00001", to: 5, at });
    expect(edge).toBe(s); // already last
    s = run(s, { type: "item/move", sectionId: "s_exp", itemId: "i_exp00001", to: -3, at });
    expect(itemIds(s, "s_exp")).toEqual(["i_exp00001", "i_exp00002"]);
  });

  it("edits every kind's fields; dates empty to null; long values are clamped", () => {
    let s = run(
      sink(),
      { type: "item/field", sectionId: "s_edu", itemId: "i_edu00001", field: "school", value: "Stanford", at },
      { type: "item/field", sectionId: "s_edu", itemId: "i_edu00001", field: "gpa", value: "3.9", at },
      { type: "item/field", sectionId: "s_edu", itemId: "i_edu00001", field: "end", value: "2016", at },
      { type: "item/field", sectionId: "s_ach", itemId: "i_ach00001", field: "date", value: "", at },
    );
    expect(sec(s, "s_edu").items[0]).toMatchObject({ school: "Stanford", gpa: "3.9", end: "2016" });
    expect(sec(s, "s_ach").items[0].date).toBeNull();

    s = run(s, { type: "item/add", sectionId: "s_prj", itemId: "i_prj00001", bulletId: "b_p1", at }, { type: "item/add", sectionId: "s_int", itemId: "i_int00001", bulletId: "b_i1", at }, { type: "item/add", sectionId: "s_lng", itemId: "i_lng00001", bulletId: "b_l1", at });
    s = run(
      s,
      { type: "item/field", sectionId: "s_prj", itemId: "i_prj00001", field: "url", value: "u".repeat(5000), at },
      { type: "item/field", sectionId: "s_int", itemId: "i_int00001", field: "text", value: "t".repeat(500), at },
      { type: "item/field", sectionId: "s_lng", itemId: "i_lng00001", field: "name", value: "n".repeat(500), at },
    );
    expect(sec(s, "s_prj").items[0].url).toHaveLength(2048);
    expect(sec(s, "s_int").items[0].text).toHaveLength(80);
    expect(sec(s, "s_lng").items[0].name).toHaveLength(200);
  });

  it("keeps an achievement's marks attached when its text is edited", () => {
    const s = run(sink(), { type: "item/field", sectionId: "s_ach", itemId: "i_ach00001", field: "text", value: "Won the award", at });
    // "Won an award" had an italic mark at 4..6 ("an"); inserting "the" in place of "an" shrinks it away.
    expect(sec(s, "s_ach").items[0].text).toBe("Won the award");
    for (const m of sec(s, "s_ach").items[0].marks ?? []) expect(m.e).toBeLessThanOrEqual("Won the award".length);
  });
});

describe("skills", () => {
  it("set replaces the chips with the per-skill and count caps", () => {
    const s = run(sink(), { type: "skills/set", sectionId: "s_skl", itemId: "i_skl00001", skills: [`${"x".repeat(100)}`, ...Array.from({ length: 60 }, (_, i) => `s${i}`)], at });
    const skills = sec(s, "s_skl").items[0].skills as string[];
    expect(skills).toHaveLength(MAX_SKILLS);
    expect(skills[0]).toHaveLength(MAX_SKILL_CHARS);
  });

  it("adds (no duplicates, no blanks), removes and moves", () => {
    let s = run(sink(), { type: "skills/add", sectionId: "s_skl", itemId: "i_skl00001", skill: "Kotlin", at });
    expect(sec(s, "s_skl").items[0].skills).toEqual(["Go", "Rust", "SQL", "Kotlin"]);
    const same = run(s, { type: "skills/add", sectionId: "s_skl", itemId: "i_skl00001", skill: "go", at }, { type: "skills/add", sectionId: "s_skl", itemId: "i_skl00001", skill: "  ", at });
    expect(same).toBe(s);
    s = run(s, { type: "skills/remove", sectionId: "s_skl", itemId: "i_skl00001", index: 1, at });
    expect(sec(s, "s_skl").items[0].skills).toEqual(["Go", "SQL", "Kotlin"]);
    s = run(s, { type: "skills/move", sectionId: "s_skl", itemId: "i_skl00001", from: 0, to: 2, at });
    expect(sec(s, "s_skl").items[0].skills).toEqual(["SQL", "Kotlin", "Go"]);
    expect(run(s, { type: "skills/remove", sectionId: "s_skl", itemId: "i_skl00001", index: 9, at })).toBe(s);
  });

  it("edits the group name, coalesced", () => {
    const s = run(sink(), { type: "skills/group.edit", sectionId: "s_skl", itemId: "i_skl00001", value: "Lang", at }, { type: "skills/group.edit", sectionId: "s_skl", itemId: "i_skl00001", value: "Languages & Tools", at: at + 100 });
    expect(sec(s, "s_skl").items[0].group).toBe("Languages & Tools");
    expect(s.history.past).toHaveLength(1);
  });
});

describe("bullets: move, marks that follow the text", () => {
  it("moves a bullet to an index", () => {
    const s = run(sink(), { type: "bullet/move", sectionId: "s_exp", itemId: "i_exp00001", bulletId: "b_aaaaaaaa", to: 1, at });
    expect(sec(s, "s_exp").items[0].bullets.map((b: { id: string }) => b.id)).toEqual(["b_bbbbbbbb", "b_aaaaaaaa"]);
    expect(run(s, { type: "bullet/move", sectionId: "s_exp", itemId: "i_exp00001", bulletId: "b_aaaaaaaa", to: 9, at })).toBe(s);
  });

  it("re-bases the marks when a bullet is typed into", () => {
    // "Led migration", bold on "Led" (0..3). Typing before it shifts it; typing inside grows it.
    let s = run(sink(), { type: "bullet/edit", sectionId: "s_exp", itemId: "i_exp00001", bulletId: "b_aaaaaaaa", text: "So Led migration", at });
    expect(sec(s, "s_exp").items[0].bullets[0].marks).toEqual([{ s: 3, e: 6, t: "b" }]);
    s = run(s, { type: "bullet/edit", sectionId: "s_exp", itemId: "i_exp00001", bulletId: "b_aaaaaaaa", text: "So Leed migration", at: at + 5000 });
    expect(sec(s, "s_exp").items[0].bullets[0].marks).toEqual([{ s: 3, e: 7, t: "b" }]);
  });

  it("drops a mark that loses all its text and never leaves one past the end", () => {
    const s = run(sink(), { type: "bullet/edit", sectionId: "s_exp", itemId: "i_exp00001", bulletId: "b_aaaaaaaa", text: " migration", at });
    const b = sec(s, "s_exp").items[0].bullets[0];
    expect("marks" in b).toBe(false);
    expect(b.text).toBe(" migration");
  });

  it("splits a bullet's marks across the two bullets and merges them back", () => {
    let s = run(sink(), { type: "bullet/split", sectionId: "s_exp", itemId: "i_exp00001", bulletId: "b_aaaaaaaa", before: "Le", after: "d migration", newBulletId: "b_newnewnew", at });
    const [first, second] = sec(s, "s_exp").items[0].bullets;
    expect(first).toMatchObject({ text: "Le", marks: [{ s: 0, e: 2, t: "b" }] });
    expect(second).toMatchObject({ id: "b_newnewnew", text: "d migration", marks: [{ s: 0, e: 1, t: "b" }] });
    s = run(s, { type: "bullet/mergeUp", sectionId: "s_exp", itemId: "i_exp00001", bulletId: "b_newnewnew", at });
    expect(sec(s, "s_exp").items[0].bullets[0]).toMatchObject({ text: "Led migration", marks: [{ s: 0, e: 2, t: "b" }, { s: 2, e: 3, t: "b" }] });
  });
});

describe("lists and replaced text", () => {
  it("sets the summary's list and an item's list style", () => {
    let s = run(sink(), { type: "list/set", sectionId: "s_sum", style: "number", at });
    expect(sec(s, "s_sum").items[0].list).toBe("number");
    s = run(s, { type: "list/set", sectionId: "s_exp", itemId: "i_exp00001", style: "bullet", at });
    expect(sec(s, "s_exp").items[0].listStyle).toBe("bullet");
    s = run(s, { type: "list/set", sectionId: "s_sum", style: null, at });
    expect(sec(s, "s_sum").items[0].list).toBeNull();
    expect(run(s, { type: "list/set", sectionId: "s_edu", style: "bullet", at })).toBe(s); // needs an itemId
    expect(run(s, { type: "list/set", sectionId: "s_sum", style: null, at })).toBe(s);
  });

  it("text/replace swaps a bullet or an item's text, clears its marks, and undoes in one step", () => {
    let s = run(sink(), { type: "text/replace", ref: { sectionId: "s_exp", itemId: "i_exp00001", bulletId: "b_aaaaaaaa" }, text: "Drove the migration", at });
    const b = sec(s, "s_exp").items[0].bullets[0];
    expect(b).toMatchObject({ text: "Drove the migration", src: "user" });
    expect("marks" in b).toBe(false);
    s = run(s, { type: "text/replace", ref: { sectionId: "s_ach", itemId: "i_ach00001" }, text: "Won the award", at });
    expect(sec(s, "s_ach").items[0]).toMatchObject({ text: "Won the award" });
    expect("marks" in sec(s, "s_ach").items[0]).toBe(false);
    s = run(s, { type: "text/replace", ref: { sectionId: "s_sum", itemId: "i_sum0001" }, text: "New summary", at });
    expect(sec(s, "s_sum").items[0]).toMatchObject({ text: "New summary", src: "user" });
    const undone = run(s, { type: "history/undo" });
    expect(sec(undone, "s_sum").items[0].text).toBe("Engineer.");
    expect(run(sink(), { type: "text/replace", ref: { sectionId: "s_exp", itemId: "nope" }, text: "x", at }).rev).toBe(0);
  });
});

describe("text/replaceMany (AI apply, R4.2)", () => {
  const items = [
    { ref: { sectionId: "s_exp", itemId: "i_exp00001", bulletId: "b_aaaaaaaa" }, text: "Drove the migration" },
    { ref: { sectionId: "s_exp", itemId: "i_exp00001", bulletId: "b_bbbbbbbb" }, text: "Cut latency 40%" },
    { ref: { sectionId: "s_sum", itemId: "i_sum0001" }, text: "Staff engineer." },
  ];

  it("replaces every line in ONE history step, clears their marks and tags them as AI text", () => {
    const s = run(sink(), { type: "text/replaceMany", items, src: "ai", at });
    const bullets = sec(s, "s_exp").items[0].bullets;
    expect(bullets[0]).toMatchObject({ text: "Drove the migration", src: "ai" });
    expect("marks" in bullets[0]).toBe(false);
    expect(bullets[1]).toMatchObject({ text: "Cut latency 40%", src: "ai" });
    expect(sec(s, "s_sum").items[0]).toMatchObject({ text: "Staff engineer.", src: "ai" });
    expect(s.rev).toBe(1);
    const undone = run(s, { type: "history/undo" });
    expect(sec(undone, "s_exp").items[0].bullets[0]).toMatchObject({ text: "Led migration", marks: [{ s: 0, e: 3, t: "b" }] });
    expect(sec(undone, "s_sum").items[0].text).toBe("Engineer.");
    expect(canUndoEdit(run(undone, { type: "history/undo" }))).toBe(false); // the whole rewrite was one step
  });

  it("without a src the lines read as the person's own", () => {
    const s = run(sink(), { type: "text/replaceMany", items: items.slice(0, 1), at });
    expect(sec(s, "s_exp").items[0].bullets[0]).toMatchObject({ src: "user" });
  });

  it("changes nothing (no history entry) when no line is found", () => {
    const s = sink();
    expect(run(s, { type: "text/replaceMany", items: [{ ref: { sectionId: "s_exp", itemId: "nope", bulletId: "x" }, text: "x" }], src: "ai", at }).rev).toBe(0);
  });
});

describe("one history entry per structural action", () => {
  it("every structural action undoes in a single step", () => {
    const actions: EditorAction[] = [
      { type: "section/move", sectionId: "s_edu", to: 0, at },
      { type: "section/hide", sectionId: "s_edu", hidden: true, at },
      { type: "section/remove", sectionId: "s_edu", at },
      { type: "item/add", sectionId: "s_exp", itemId: "i_exp00009", bulletId: "b_9", at },
      { type: "item/move", sectionId: "s_exp", itemId: "i_exp00001", to: 1, at },
      { type: "item/hide", sectionId: "s_exp", itemId: "i_exp00001", hidden: true, at },
      { type: "item/remove", sectionId: "s_exp", itemId: "i_exp00001", at },
      { type: "bullet/move", sectionId: "s_exp", itemId: "i_exp00001", bulletId: "b_aaaaaaaa", to: 1, at },
    ];
    for (const a of actions) {
      const s0 = sink();
      const s1 = run(s0, a);
      expect(s1.history.past, a.type).toHaveLength(1);
      expect(currentDoc(run(s1, { type: "history/undo" })), a.type).toBe(currentDoc(s0));
    }
  });
});

describe("422 error path", () => {
  it("remembers the path of a refused save; the next edit and a good save clear it", () => {
    let s = run(sink(), { type: "save/failed", message: "$.basics.name: must be at most 100 characters", path: "$.basics.name" });
    expect(s.errorPath).toBe("$.basics.name");
    expect(s.phase).toBe("error");
    s = run(s, { type: "basics/field", field: "name", value: "Short", at });
    expect(s.errorPath).toBeNull();
    s = run(s, { type: "save/failed", message: "boom", path: "$.sections[0].items[0].text" }, { type: "save/ok", rev: s.rev, version: 2, at });
    expect(s.errorPath).toBeNull();
    expect(run(sink(), { type: "save/failed", message: "offline" }).errorPath).toBeNull();
  });
});

describe("the test document stays valid for the older reducer tests", () => {
  it("testDoc still has the three R0 sections", () => {
    expect(testDoc().sections.map((x) => x.kind)).toEqual(["SUMMARY", "EXPERIENCE", "SKILLS"]);
  });
});

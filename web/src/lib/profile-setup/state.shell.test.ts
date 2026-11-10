import { describe, expect, it } from "vitest";
import type { ParsedBio, StructuredResume } from "@kiwiply/ui";
import { toDraft } from "./draft";
import { freshProgress, initialFresh } from "./fresh";
import { INITIAL_STATE, isResumable, progressOf, reducer, withProgress } from "./state";

/** The reducer and progress additions of the onboarding shell (R1.10). */
const structured: StructuredResume = {
  summary: "",
  skills: ["React"],
  experience: [
    { company: "Acme", title: "Engineer", location: "", startDate: "Jan 2020", endDate: "Present", current: false, bullets: [] },
    { company: "Globex", title: "Intern", location: "", startDate: "2018", endDate: "2019", current: false, bullets: [] },
  ],
  education: [],
  languages: [],
  projects: [],
};
const bio: ParsedBio = { firstName: "Jane", email: "jane@example.com" };
const draft = toDraft(structured, bio, [], { valueChars: 500, summaryChars: 2000 });
const parsed = reducer(INITIAL_STATE, { type: "parsed", draft, source: "ai", removed: 0, existing: {} });

describe("undecide (the Skip undo)", () => {
  it("takes the decision back and puts the cursor on that card", () => {
    let s = reducer(parsed, { type: "decide", id: "exp0", decision: "keep" });
    s = reducer(s, { type: "decide", id: "exp1", decision: "skip" });
    expect(s.cursor).toBe(2);
    const back = reducer(s, { type: "undecide", id: "exp1" });
    expect(back.decisions).toEqual({ exp0: "keep" });
    expect(back.cursor).toBe(1);
  });

  it("an unknown card leaves the cursor alone", () => {
    const s = reducer(parsed, { type: "undecide", id: "nope" });
    expect(s.cursor).toBe(parsed.cursor);
  });
});

describe("skipSource ('Skip for now' on the source screen)", () => {
  it("goes straight to the identity card with what the profile already has, and is worth resuming", () => {
    const s = reducer({ ...INITIAL_STATE, persona: "student" }, { type: "skipSource", existing: { firstName: "Janet", email: "j@example.com" } });
    expect(s.step).toBe("you");
    expect(s.parsed).toMatchObject({ candidates: [], skills: [] });
    expect(s.identity).toMatchObject({ firstName: "Janet", email: "j@example.com" });
    expect(s.persona).toBe("student");
    expect(isResumable(s)).toBe(true);
    expect(s.updatedAt).not.toBeNull();
  });
});

describe("the guided questions' goal follows the persona", () => {
  it("the first fresh action starts from the persona's goal", () => {
    const s = reducer({ ...INITIAL_STATE, persona: "student" }, { type: "fresh", action: { type: "headline", value: "Hi" } });
    expect(s.fresh).toMatchObject({ goal: "internship", headline: "Hi" });
    const none = reducer(INITIAL_STATE, { type: "fresh", action: { type: "headline", value: "Hi" } });
    expect(none.fresh?.goal).toBe("");
  });

  it("initialFresh takes a goal", () => {
    expect(initialFresh("switch").goal).toBe("switch");
    expect(initialFresh().goal).toBe("");
  });
});

describe("progress", () => {
  it("the guided questions move the bar within the source step, and only forward through the shared screens", () => {
    const ranks = (["goal", "headline", "menu", "role.title", "skills", "links"] as const).map((step) => freshProgress({ step }));
    for (let i = 1; i < ranks.length; i++) expect(ranks[i]).toBeGreaterThanOrEqual(ranks[i - 1]);
    expect(ranks[0]).toBe(0);
    expect(ranks[ranks.length - 1]).toBeLessThanOrEqual(1);
    const s = { ...INITIAL_STATE, path: "fresh" as const, fresh: { ...initialFresh(), step: "skills" as const } };
    expect(progressOf(s, true).subProgress).toBeCloseTo(0.6);
    expect(withProgress(s, true).subProgress).toBeCloseTo(0.6);
  });

  it("the /welcome link (questions with nothing parsed) is a two-step run", () => {
    const s = { ...INITIAL_STATE, step: "prefs" as const };
    expect(progressOf(s, true, 4)).toEqual({ stepsDone: 0, stepsTotal: 2, subProgress: 0 });
    expect(progressOf({ ...s, prefsDone: ["a", "b"] }, true, 4).subProgress).toBe(0.5);
  });
});

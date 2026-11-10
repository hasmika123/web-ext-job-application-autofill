import { describe, expect, it } from "vitest";
import {
  averageScore,
  checklistProgress,
  deltaIsGood,
  durationText,
  elapsedMinutes,
  nextLabel,
  parsePrep,
  parseSessionDetail,
  scoreTone,
  sheetProblem,
  tileDelta,
  withChecked,
  type CheckItem,
  type PrepTile,
} from "./interviewPrep";

const tile = (over: Partial<PrepTile> = {}): PrepTile => ({ value: 3, previous: null, delta: null, unit: "COUNT", sparkline: [], ...over });

describe("parsePrep", () => {
  const body = {
    orgId: 2,
    generatedAt: "2026-10-13T00:00:00Z",
    name: "Anika",
    tiles: { upcoming: { value: 2, unit: "COUNT", sparkline: [1, 0] }, score: { value: null, previous: null, delta: null, unit: "POINTS", sparkline: [] }, sets: { value: 6 }, weak: { value: 0 } },
    modules: [{ key: "technical", title: "Technical Topics", kind: "TECHNICAL", action: "PRACTICE", chips: ["Java", 5], chipsFromProfile: true, questions: [{ id: "tech-1", text: "Q?" }, { id: 3 }] }, { key: "bad", title: "x", kind: "NOPE" }],
    history: [{ id: 1, title: "S", kind: "BEHAVIORAL", score: 140, durationMinutes: 30, occurredAt: "2026-10-12T10:00:00Z" }, { id: "x" }],
    checklist: [{ key: "review-jd", label: "Review", checked: true }, { label: "no key" }],
    next: null,
    weakKinds: ["BEHAVIORAL", "WHAT"],
  };
  it("keeps valid rows, drops the rest and never invents a score", () => {
    const v = parsePrep(body)!;
    expect(v.tiles.score.value).toBeNull();
    expect(v.tiles.upcoming.sparkline).toEqual([1, 0]);
    expect(v.modules).toHaveLength(1);
    expect(v.modules[0].chips).toEqual(["Java"]);
    expect(v.modules[0].questions).toHaveLength(1);
    expect(v.history).toHaveLength(1);
    expect(v.history[0].score).toBe(100);
    expect(v.checklist).toHaveLength(1);
    expect(v.weakKinds).toEqual(["BEHAVIORAL"]);
    expect(v.next).toBeNull();
  });
  it("rejects a body that is not the contract", () => {
    expect(parsePrep(null)).toBeNull();
    expect(parsePrep({ orgId: "2" })).toBeNull();
  });
  it("parses a session detail", () => {
    const d = parseSessionDetail({ session: body.history[0], notes: "n", answers: [{ position: 1, question: "Q", score: 80 }, { position: 2 }] })!;
    expect(d.notes).toBe("n");
    expect(d.answers).toHaveLength(1);
    expect(parseSessionDetail({ session: { id: 1 } })).toBeNull();
  });
});

describe("helpers", () => {
  it("tile delta text and direction come from the API only", () => {
    expect(tileDelta(tile())).toBeNull();
    expect(tileDelta(tile({ delta: 12, unit: "POINTS" }))).toEqual({ dir: "up", text: "+12 pts" });
    expect(tileDelta(tile({ delta: -2 }))).toEqual({ dir: "down", text: "-2" });
    expect(tileDelta(tile({ delta: 0 }))).toEqual({ dir: "flat", text: "0" });
    expect(deltaIsGood("down", true)).toBe(true);
    expect(deltaIsGood("down", false)).toBe(false);
    expect(deltaIsGood("flat", true)).toBeNull();
  });
  it("score tone and duration text", () => {
    expect(scoreTone(85)).toBe("green");
    expect(scoreTone(75)).toBe("amber");
    expect(scoreTone(74)).toBe("coral");
    expect(durationText(1)).toBe("1 min");
    expect(durationText(45)).toBe("45 mins");
  });
  it("averages only scored questions and validates the sheet", () => {
    expect(averageScore({})).toBeNull();
    expect(averageScore({ a: 80, b: 61, c: undefined })).toBe(71);
    expect(sheetProblem({}, "")).toMatch(/at least one/);
    expect(sheetProblem({ a: 50 }, "x".repeat(1001))).toMatch(/1000/);
    expect(sheetProblem({ a: 50 }, "ok")).toBeNull();
  });
  it("measures minutes from open to save within the API limits", () => {
    expect(elapsedMinutes(0, 1000)).toBe(1);
    expect(elapsedMinutes(0, 61_000)).toBe(2);
    expect(elapsedMinutes(0, 10_000 * 60_000)).toBe(600);
  });
  it("the checklist toggles one item and counts progress", () => {
    const list: CheckItem[] = [
      { key: "a", label: "A", checked: false, checkedAt: null },
      { key: "b", label: "B", checked: true, checkedAt: "2026-01-01T00:00:00Z" },
    ];
    const on = withChecked(list, "a", true);
    expect(on[0].checked).toBe(true);
    expect(list[0].checked).toBe(false);
    expect(withChecked(on, "b", false)[1].checkedAt).toBeNull();
    expect(checklistProgress(on)).toEqual({ done: 2, total: 2 });
  });
  it("names the next interview", () => {
    expect(nextLabel(null)).toBe("");
    expect(nextLabel({ interviewId: 1, scheduledAt: "", role: "Dev", company: "Acme", round: null })).toBe("Dev at Acme");
    expect(nextLabel({ interviewId: 1, scheduledAt: "", role: null, company: "Acme", round: null })).toBe("Acme");
  });
});

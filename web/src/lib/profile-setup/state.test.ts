import { afterEach, describe, expect, it, vi } from "vitest";
import type { ParsedBio, StructuredResume } from "@kiwiply/ui";
import { toDraft, type BioLimits } from "./draft";
import {
  INITIAL_STATE,
  V1_DRAFT_KEY,
  draftPayload,
  isResumable,
  mapStep,
  migrateV1Draft,
  mirrorState,
  nextStep,
  prevStep,
  progressOf,
  readState,
  reducer,
  stepsFor,
  upgradeDraft,
  withProgress,
  type SetupState,
} from "./state";

const BIO: BioLimits = { valueChars: 500, summaryChars: 2000 };
const structured: StructuredResume = {
  summary: "Engineer who ships.",
  skills: ["React", "Go"],
  experience: [
    { company: "Acme", title: "Engineer", location: "", startDate: "Jan 2020", endDate: "Present", current: false, bullets: ["Cut p95 latency 40%"] },
    { company: "Globex", title: "Intern", location: "", startDate: "2018", endDate: "2019", current: false, bullets: [] },
  ],
  education: [{ school: "MIT", degree: "BS", field: "CS", startDate: "2012", endDate: "2016", gpa: "", location: "" }],
  languages: [],
  projects: [],
};
const bio: ParsedBio = { firstName: "Jane", lastName: "Doe", email: "jane@example.com" };
const draft = toDraft(structured, bio, [], BIO);
const parsed = reducer(INITIAL_STATE, { type: "parsed", draft, source: "ai", removed: 0, existing: {} });

afterEach(() => vi.useRealTimers());

describe("state v2: reducer", () => {
  it("is v2 and starts on the source step with 7 steps in view", () => {
    expect(INITIAL_STATE).toMatchObject({ v: 2, step: "source", persona: null, stepsDone: 0, stepsTotal: 7, subProgress: 0, coreConfirmedAt: null, prefsDone: [], updatedAt: null });
  });

  it("choosing a way in stays on `source` (the picker is `source` with no path); Back clears it", () => {
    const s = reducer(INITIAL_STATE, { type: "path", path: "upload" });
    expect(s).toMatchObject({ step: "source", path: "upload" });
    expect(reducer(s, { type: "backToPath" })).toMatchObject({ step: "source", path: null });
  });

  it("parsing lands on review, or on skills when nothing was found, and clears an earlier core confirm", () => {
    expect(parsed.step).toBe("review");
    const empty = reducer(INITIAL_STATE, { type: "parsed", draft: { ...draft, candidates: [] }, source: "heuristic", removed: 0, existing: {} });
    expect(empty.step).toBe("skills");
    const confirmed = reducer(parsed, { type: "coreConfirmed", at: "2026-10-12T10:00:00.000Z" });
    expect(confirmed.coreConfirmedAt).toBe("2026-10-12T10:00:00.000Z");
    expect(reducer(confirmed, { type: "parsed", draft, source: "ai", removed: 0, existing: {} }).coreConfirmedAt).toBeNull();
  });

  it("persona, prefDone (once per key) and coreConfirmed", () => {
    expect(reducer(INITIAL_STATE, { type: "persona", persona: "student" }).persona).toBe("student");
    expect(reducer({ ...INITIAL_STATE, persona: "student" }, { type: "persona", persona: null }).persona).toBeNull();
    let s = reducer(INITIAL_STATE, { type: "prefDone", key: "desiredSalary" });
    s = reducer(s, { type: "prefDone", key: "desiredSalary" });
    s = reducer(s, { type: "prefDone", key: "noticePeriod" });
    expect(s.prefsDone).toEqual(["desiredSalary", "noticePeriod"]);
    expect(reducer(INITIAL_STATE, { type: "coreConfirmed" }).coreConfirmedAt).toMatch(/^\d{4}-\d\d-\d\dT/);
  });

  it("stamps updatedAt on every change, but not when nothing changed and not on hydrate", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-12T09:00:00.000Z"));
    const a = reducer(INITIAL_STATE, { type: "pref", key: "desiredSalary", value: "100" });
    expect(a.updatedAt).toBe("2026-10-12T09:00:00.000Z");
    // prefDone on a key already done is a no-op: same object, same stamp
    const done = reducer(a, { type: "prefDone", key: "x" });
    vi.setSystemTime(new Date("2026-10-12T09:05:00.000Z"));
    expect(reducer(done, { type: "prefDone", key: "x" })).toBe(done);
    const theirs: SetupState = { ...parsed, updatedAt: "2026-10-11T08:00:00.000Z" };
    expect(reducer(a, { type: "hydrate", state: theirs })).toBe(theirs);
  });

  it("reset starts everything over but keeps who the person said they are", () => {
    const s = reducer({ ...parsed, persona: "switching" }, { type: "reset" });
    expect(s).toMatchObject({ step: "source", parsed: null, persona: "switching", prefsDone: [] });
  });
});

describe("state v2: steps and progress", () => {
  it("yields hello, source, review?, skills, you, prefs?, done; the total shrinks without review", () => {
    expect(stepsFor(parsed, true)).toEqual(["hello", "source", "review", "skills", "you", "prefs", "done"]);
    expect(stepsFor({ parsed: null }, true)).toEqual(["hello", "source", "skills", "you", "prefs", "done"]);
    expect(stepsFor({ parsed: null }, false)).toEqual(["hello", "source", "skills", "you", "done"]);
    expect(progressOf(parsed, true).stepsTotal).toBe(7);
    expect(progressOf({ ...parsed, parsed: { ...parsed.parsed!, candidates: [] } }, true).stepsTotal).toBe(6);
  });

  it("next / previous walk that list", () => {
    expect(nextStep({ ...parsed, step: "source" }, true)).toBe("review");
    expect(nextStep({ ...parsed, step: "you" }, false)).toBe("done");
    expect(prevStep({ ...parsed, step: "skills" }, true)).toBe("review");
    expect(prevStep({ ...parsed, step: "source" }, true)).toBe("hello");
  });

  it("'n of total done' counts the steps behind the current one; review and prefs add a fraction", () => {
    expect(progressOf({ ...parsed, step: "skills" }, true)).toEqual({ stepsDone: 3, stepsTotal: 7, subProgress: 0 });
    // three cards, one decided
    const one = reducer(parsed, { type: "decide", id: draft.candidates[0].id, decision: "keep" });
    expect(progressOf(one, true).stepsDone).toBe(2);
    expect(progressOf(one, true).subProgress).toBeCloseTo(1 / draft.candidates.length);
    const prefs = { ...parsed, step: "prefs" as const, prefsDone: ["a", "b"] };
    expect(progressOf(prefs, true, 4)).toEqual({ stepsDone: 5, stepsTotal: 7, subProgress: 0.5 });
    expect(progressOf({ ...parsed, step: "done" }, true)).toEqual({ stepsDone: 7, stepsTotal: 7, subProgress: 0 });
  });

  it("withProgress fills the three numbers, and hands back the same object when they are right", () => {
    const s = withProgress({ ...parsed, step: "skills" }, true);
    expect(s).toMatchObject({ stepsDone: 3, stepsTotal: 7 });
    expect(withProgress(s, true)).toBe(s);
  });
});

describe("state v2: what is worth keeping", () => {
  it("only parsed content or fresh answers; never the picker, hello, or done", () => {
    expect(isResumable(INITIAL_STATE)).toBe(false);
    expect(isResumable({ ...INITIAL_STATE, step: "hello" })).toBe(false);
    expect(isResumable(reducer(INITIAL_STATE, { type: "path", path: "upload" }))).toBe(false);
    expect(isResumable(parsed)).toBe(true);
    expect(isResumable({ ...parsed, step: "you" })).toBe(true);
    expect(isResumable({ ...parsed, step: "done" })).toBe(false);
    // `?step=prefs` with nothing parsed (the /welcome link) is just the questions
    expect(isResumable({ ...INITIAL_STATE, step: "prefs" })).toBe(false);
  });

  it("the server draft never holds the application-question answers", () => {
    const s = reducer(parsed, { type: "pref", key: "gender", value: "Woman" });
    const body = draftPayload(s);
    expect("prefs" in body).toBe(false);
    expect(JSON.stringify(body)).not.toContain("Woman");
    expect(JSON.stringify(body)).toContain("Engineer"); // parsed content is there
  });

  it("the local mirror keeps the answers except the voluntary self-identification ones", () => {
    const s = { ...parsed, prefs: { desiredSalary: "100k", gender: "Woman", race: "x", ethnicity: "x", veteranStatus: "x", disabilityStatus: "x", noticePeriod: "2 weeks" } };
    expect(mirrorState(s).prefs).toEqual({ desiredSalary: "100k", noticePeriod: "2 weeks" });
    expect(mirrorState(parsed)).toBe(parsed);
  });
});

describe("state v2: reading a stored state", () => {
  it("round-trips through JSON, and fills what a writer left out", () => {
    expect(readState(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
    const thin = readState({ v: 2, step: "skills", parsed: { candidates: [], parsedIdentity: {}, skills: [], suggestions: [], source: "ai", removed: 0 } });
    expect(thin).toMatchObject({ step: "skills", persona: null, prefs: {}, prefsDone: [], updatedAt: null });
  });

  it("refuses a foreign version, an unknown step or a broken parse", () => {
    expect(readState(null)).toBeNull();
    expect(readState({ v: 1, step: "skills" })).toBeNull();
    expect(readState({ v: 2, step: "cards" })).toBeNull();
    expect(readState({ v: 2, step: "skills", parsed: { candidates: "nope" } })).toBeNull();
  });

  it("drops a persona it does not know", () => {
    expect(readState({ ...parsed, persona: "wizard" })?.persona).toBeNull();
    expect(readState({ ...parsed, persona: "first_job" })?.persona).toBe("first_job");
  });
});

describe("the v1 sessionStorage draft", () => {
  const v1 = (over: Record<string, unknown> = {}) => ({
    v: 1,
    step: "cards",
    path: "paste",
    parsed: { candidates: draft.candidates, parsedIdentity: {}, skills: ["Go"], suggestions: [], source: "ai", removed: 1 },
    fresh: null,
    decisions: { exp0: "keep" },
    edits: {},
    cursor: 1,
    skills: ["Go"],
    languages: [],
    identity: { firstName: "Jane" },
    prefs: { desiredSalary: "100k" },
    imported: false,
    ...over,
  });
  const store = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
  };

  it("maps the old step names: path/input -> source, cards -> review, identity -> you", () => {
    expect(mapStep("path")).toBe("source");
    expect(mapStep("input")).toBe("source");
    expect(mapStep("cards")).toBe("review");
    expect(mapStep("identity")).toBe("you");
    expect(mapStep("skills")).toBe("skills");
    expect(mapStep("prefs")).toBe("prefs");
    expect(mapStep("review")).toBe("review"); // already v2
    expect(mapStep("nope")).toBeNull();
    expect(mapStep(3)).toBeNull();
  });

  it("upgrades the state: v2 fields, progress and a fresh stamp, content untouched", () => {
    const now = new Date("2026-10-12T10:00:00.000Z");
    const s = upgradeDraft(v1(), now)!;
    expect(s).toMatchObject({
      v: 2,
      step: "review",
      path: "paste",
      persona: null,
      prefsDone: [],
      coreConfirmedAt: null,
      updatedAt: "2026-10-12T10:00:00.000Z",
      cursor: 1,
      decisions: { exp0: "keep" },
      identity: { firstName: "Jane" },
      prefs: { desiredSalary: "100k" },
      stepsDone: 2,
      stepsTotal: 7,
    });
    expect(s.parsed?.candidates).toHaveLength(draft.candidates.length);
  });

  it("an old `input` step with a fresh run's answers becomes `source` with its path; an old `path` is not worth keeping", () => {
    const fresh = upgradeDraft(v1({ step: "input", path: "fresh", parsed: null, fresh: { goal: "same", step: "headline", headline: "x" } }))!;
    expect(fresh).toMatchObject({ step: "source", path: "fresh" });
    expect(upgradeDraft(v1({ step: "path", path: null, parsed: null }))).toBeNull();
  });

  it("ignores anything that is not a v1 draft", () => {
    expect(upgradeDraft(null)).toBeNull();
    expect(upgradeDraft({ ...v1(), v: 2 })).toBeNull();
    expect(upgradeDraft(v1({ step: "bogus" }))).toBeNull();
    expect(upgradeDraft(v1({ parsed: { candidates: "x" } }))).toBeNull();
  });

  it("migrates once: the sessionStorage key is removed whatever came of it", () => {
    const s = store();
    s.setItem(V1_DRAFT_KEY, JSON.stringify(v1()));
    expect(migrateV1Draft(s)?.step).toBe("review");
    expect(s.m.has(V1_DRAFT_KEY)).toBe(false);
    expect(migrateV1Draft(s)).toBeNull();

    s.setItem(V1_DRAFT_KEY, "{nope");
    expect(migrateV1Draft(s)).toBeNull();
    expect(s.m.has(V1_DRAFT_KEY)).toBe(false); // unreadable: gone too, never offered twice
    s.setItem(V1_DRAFT_KEY, JSON.stringify({ v: 1, step: "bogus" }));
    expect(migrateV1Draft(s)).toBeNull();
    expect(s.m.has(V1_DRAFT_KEY)).toBe(false);
    expect(migrateV1Draft(undefined)).toBeNull();
  });
});

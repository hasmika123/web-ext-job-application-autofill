import { describe, expect, it } from "vitest";
import {
  ROLE_STEPS,
  SCHOOL_STEPS,
  freshReducer,
  freshToDraft,
  hasFreshAnswers,
  initialFresh,
  menuOptions,
  normalizeLink,
  skillSuggestionsFor,
  stepContext,
  stepError,
  type FreshAction,
  type FreshLimits,
  type FreshState,
} from "./fresh";
import { INITIAL_STATE, isResumable, loadDraft, reducer, saveDraft, DRAFT_KEY } from "./state";
import { keptItems, skillItems } from "./import";

const LIMITS: FreshLimits = { shortChars: 100, bulletChars: 120 };

const run = (state: FreshState, ...actions: FreshAction[]) => actions.reduce(freshReducer, state);
const next = { type: "next" } as const;
const back = { type: "back" } as const;

/** Walks "Start fresh" to the first role question: goal, headline, then "a job". */
function atRoleTitle(goal: "same" | "internship" = "same"): FreshState {
  return run(initialFresh(), { type: "goal", goal }, next, { type: "headline", value: "Barista" }, next, { type: "choice", choice: "role" }, next);
}

describe("the question order (DESIGN 2.3)", () => {
  it("goes goal -> headline -> what to add -> role questions -> add another -> skills -> links", () => {
    let s = initialFresh();
    const seen = [s.step];
    const step = (a: FreshAction) => {
      s = freshReducer(s, a);
      seen.push(s.step);
    };
    step({ type: "goal", goal: "same" });
    step(next); // headline
    step(next); // menu
    step({ type: "choice", choice: "role" });
    step(next); // role.title
    for (let i = 0; i < ROLE_STEPS.length; i++) step(next); // through the role, back to the menu
    step({ type: "choice", choice: "school" });
    step(next);
    for (let i = 0; i < SCHOOL_STEPS.length; i++) step(next);
    step({ type: "choice", choice: "skills" });
    step(next); // skills
    step(next); // links
    expect(seen.filter((x, i) => x !== seen[i - 1])).toEqual([
      "goal",
      "headline",
      "menu",
      "role.title",
      "role.org",
      "role.start",
      "role.end",
      "role.what",
      "role.how",
      "role.result",
      "menu",
      "school.name",
      "school.degree",
      "school.start",
      "school.end",
      "menu",
      "skills",
      "links",
    ]);
  });

  it("the menu needs a pick, and a pick is spent when Next is pressed", () => {
    const atMenu = run(initialFresh(), next, next);
    expect(atMenu.step).toBe("menu");
    expect(freshReducer(atMenu, next).step).toBe("menu"); // nothing chosen: stays
    expect(stepError(atMenu, LIMITS)).toMatch(/Choose one/);
    const s = run(atMenu, { type: "choice", choice: "role" }, next);
    expect(s.step).toBe("role.title");
    expect(s.choice).toBe("");
    expect(s.entries).toHaveLength(1);
  });

  it("study comes first for an internship or a first job, work first otherwise", () => {
    const labels = (goal: "internship" | "first-job" | "switch" | "same" | "") => menuOptions({ goal, entries: [] }).map((o) => o.value);
    expect(labels("internship")).toEqual(["school", "role", "skills"]);
    expect(labels("first-job")).toEqual(["school", "role", "skills"]);
    expect(labels("switch")).toEqual(["role", "school", "skills"]);
    expect(labels("same")).toEqual(["role", "school", "skills"]);
    expect(labels("")).toEqual(["role", "school", "skills"]);
  });

  it("asks 'Add another?' once something is in", () => {
    const withRole = run(atRoleTitle(), { type: "entry", patch: { name: "Barista" } });
    expect(menuOptions(withRole).map((o) => o.label)).toEqual(["Another job or internship", "Another school or course", "That's everything for now"]);
    expect(menuOptions({ goal: "", entries: [] })[0].label).toBe("A job or internship");
  });

  it("labels each screen (Role 1, School 2, About you)", () => {
    expect(stepContext(initialFresh())).toBe("About you");
    expect(stepContext(atRoleTitle())).toBe("Role 1");
    let s = run(atRoleTitle(), { type: "entry", patch: { name: "Barista" } });
    for (let i = 0; i < ROLE_STEPS.length; i++) s = freshReducer(s, next);
    s = run(s, { type: "choice", choice: "school" }, next);
    expect(stepContext(s)).toBe("School 1");
  });
});

describe("going back", () => {
  it("steps back through an entry and keeps what was typed", () => {
    let s = run(atRoleTitle(), { type: "entry", patch: { name: "Barista", detail: "Cafe" } }, next, next);
    expect(s.step).toBe("role.start");
    s = freshReducer(s, back);
    expect(s.step).toBe("role.org");
    expect(s.entries[0]).toMatchObject({ name: "Barista", detail: "Cafe" });
  });

  it("from the first question of a blank entry it forgets the entry and returns to the menu", () => {
    const s = freshReducer(atRoleTitle(), back);
    expect(s.step).toBe("menu");
    expect(s.entries).toHaveLength(0);
  });

  it("from the first question of a finished entry it keeps the entry", () => {
    let s = run(atRoleTitle(), { type: "entry", patch: { name: "Barista" } });
    for (let i = 0; i < ROLE_STEPS.length; i++) s = freshReducer(s, next); // menu
    s = freshReducer(s, back); // last question of the role
    expect(s.step).toBe("role.result");
    for (let i = 0; i < ROLE_STEPS.length - 1; i++) s = freshReducer(s, back);
    expect(s.step).toBe("role.title");
    s = freshReducer(s, back);
    expect(s.step).toBe("menu");
    expect(s.entries).toHaveLength(1);
    // choosing a role again reuses nothing (the entry has content): a second one is added
    s = run(s, { type: "choice", choice: "role" }, next);
    expect(s.entries).toHaveLength(2);
  });

  it("Back from the menu with nothing added returns to the headline; from skills to the menu; from links to skills", () => {
    expect(run(initialFresh(), next, next, back).step).toBe("headline");
    const toSkills = run(initialFresh(), next, next, { type: "choice", choice: "skills" }, next);
    expect(toSkills.step).toBe("skills");
    expect(freshReducer(toSkills, back).step).toBe("menu");
    expect(freshReducer(freshReducer(toSkills, next), back).step).toBe("skills");
    expect(freshReducer(initialFresh(), back).step).toBe("goal"); // the first question: the wizard handles leaving
  });
});

describe("validation of each answer", () => {
  it("needs a job title, a company and a school, and nothing else on its own", () => {
    let s = atRoleTitle();
    expect(stepError(s, LIMITS)).toBe("Job title is required.");
    s = run(s, { type: "entry", patch: { name: "Barista" } }, next);
    expect(stepError(s, LIMITS)).toBe("Company is required.");
    s = run(s, { type: "entry", patch: { detail: "Cafe" } }, next); // start
    expect(stepError(s, LIMITS)).toBeNull(); // dates are optional
    const school = run(initialFresh(), next, next, { type: "choice", choice: "school" }, next);
    expect(stepError(school, LIMITS)).toBe("School is required.");
  });

  it("refuses never-collected values in anything typed", () => {
    const title = run(atRoleTitle(), { type: "entry", patch: { name: "SSN 123-45-6789" } });
    expect(stepError(title, LIMITS)).toMatch(/never store/);
    const headline = run(initialFresh(), next, { type: "headline", value: "Passport number X1234567" });
    expect(stepError(headline, LIMITS)).toMatch(/never store/);
    let bullet = run(atRoleTitle(), { type: "entry", patch: { name: "Barista", detail: "Cafe", what: "Handled tax ID 12-3456789 filings" } });
    bullet = { ...bullet, step: "role.what" };
    expect(stepError(bullet, LIMITS)).toMatch(/never store/);
  });

  it("holds each answer to the configured limits, not to fixed ones", () => {
    const long = run(atRoleTitle(), { type: "entry", patch: { name: "x".repeat(101) } });
    expect(stepError(long, LIMITS)).toBe("Keep this under 100 characters.");
    expect(stepError(long, { ...LIMITS, shortChars: 200 })).toBeNull();
    const bullet = { ...run(atRoleTitle(), { type: "entry", patch: { name: "A", detail: "B", what: "w".repeat(121) } }), step: "role.what" as const };
    expect(stepError(bullet, LIMITS)).toBe("Keep this under 120 characters.");
    expect(stepError(bullet, { ...LIMITS, bulletChars: 200 })).toBeNull();
  });

  it("checks dates: shape, and an end that is not before the start; a current role needs no end", () => {
    let s = run(atRoleTitle(), { type: "entry", patch: { name: "A", detail: "B", start: "20" } });
    s = { ...s, step: "role.start" };
    expect(stepError(s, LIMITS)).toMatch(/4-digit year/);
    s = run(s, { type: "entry", patch: { start: "2021-06", end: "2021-03" } });
    expect(stepError({ ...s, step: "role.end" }, LIMITS)).toMatch(/can't be before/);
    s = run(s, { type: "entry", patch: { end: "2021-06" } });
    expect(stepError({ ...s, step: "role.end" }, LIMITS)).toBeNull();
    s = run(s, { type: "entry", patch: { start: "2021", end: "2021-01" } }); // a bare year starts in January, so January is not before it
    expect(stepError({ ...s, step: "role.end" }, LIMITS)).toBeNull();
    s = run(s, { type: "entry", patch: { end: "garbage" } });
    expect(stepError({ ...s, step: "role.end" }, LIMITS)).toMatch(/4-digit year/);
    s = run(s, { type: "entry", patch: { current: true } });
    expect(s.entries[0].end).toBe(""); // saying "still here" clears the end
    expect(stepError({ ...s, step: "role.end" }, LIMITS)).toBeNull();
  });

  it("accepts links with or without https:// and refuses things that are not addresses", () => {
    expect(normalizeLink(" linkedin.com/in/me ")).toBe("https://linkedin.com/in/me");
    expect(normalizeLink("http://x.dev")).toBe("http://x.dev");
    expect(normalizeLink("")).toBe("");
    const links = (v: string) => ({ ...initialFresh(), step: "links" as const, links: { linkedin: v, github: "", website: "" } });
    expect(stepError(links("linkedin.com/in/me"), LIMITS)).toBeNull();
    expect(stepError(links(""), LIMITS)).toBeNull();
    expect(stepError(links("not a link"), LIMITS)).toMatch(/full web address/);
  });
});

describe("the draft the review lands on", () => {
  function filled(): FreshState {
    let s = run(initialFresh(), { type: "goal", goal: "first-job" }, next, { type: "headline", value: "Recent graduate seeking an entry-level role" }, next);
    s = run(s, { type: "choice", choice: "school" }, next, { type: "entry", patch: { name: "State University", detail: "BA Economics", start: "2019-09", end: "2023-05" } });
    for (let i = 0; i < SCHOOL_STEPS.length; i++) s = freshReducer(s, next);
    s = run(s, { type: "choice", choice: "role" }, next, {
      type: "entry",
      patch: { name: "Barista", detail: "Blue Cafe", start: "2021", current: true, what: "Served 80 customers a shift", how: "", result: "Kept waits under three minutes" },
    });
    for (let i = 0; i < ROLE_STEPS.length; i++) s = freshReducer(s, next);
    return run(s, { type: "skills", skills: ["Customer service", " Excel "] }, { type: "link", key: "linkedin", value: "linkedin.com/in/me" });
  }

  it("makes one card per entry in the order they were entered, with bullets from What / How / Result", () => {
    const { draft } = freshToDraft(filled());
    expect(draft.candidates).toEqual([
      { id: "edu0", section: "EDUCATION", data: { school: "State University", degree: "BA Economics", start: "2019-09", end: "2023-05" } },
      {
        id: "exp0",
        section: "EXPERIENCE",
        data: {
          title: "Barista",
          org: "Blue Cafe",
          start: "2021",
          current: true,
          bullets: [
            { text: "Served 80 customers a shift", src: "user" },
            { text: "Kept waits under three minutes", src: "user" },
          ],
        },
      },
    ]);
    expect(draft.skills).toEqual(["Customer service", "Excel"]);
    expect(draft.identity).toEqual({}); // nothing is "parsed" here
    expect(draft.removed).toBe(0);
  });

  it("returns what the person typed (headline, links) separately so it is written as theirs", () => {
    const { typed } = freshToDraft(filled());
    expect(typed).toEqual({ headline: "Recent graduate seeking an entry-level role", linkedin: "https://linkedin.com/in/me" });
  });

  it("drops an entry that never got a title", () => {
    const blank = run(atRoleTitle(), { type: "skills", skills: [] });
    expect(freshToDraft(blank).draft.candidates).toEqual([]);
  });

  it("suggests skills from the headline and the roles, minus the ones already chosen", () => {
    const s = filled();
    const offered = skillSuggestionsFor(s);
    expect(offered).toContain("Cash handling"); // Barista -> customer family
    expect(offered).not.toContain("Customer service"); // already chosen
    expect(skillSuggestionsFor({ headline: "", entries: [], skills: [] })).toContain("Communication"); // nothing matches: general list
  });

  it("imports the answers as the person's own (USER provenance), including skills", () => {
    const { draft } = freshToDraft(filled());
    const kept = Object.fromEntries(draft.candidates.map((c) => [c.id, "keep" as const]));
    expect(keptItems(draft.candidates, kept, {}, "USER").map((i) => i.provenance)).toEqual(["USER", "USER"]);
    expect(skillItems(draft.skills, "USER")[0].provenance).toBe("USER");
    expect(keptItems(draft.candidates, kept, {}).map((i) => i.provenance)).toEqual(["PARSED", "PARSED"]); // resume paths unchanged
  });
});

describe("inside the wizard state", () => {
  it("the fresh action drives the answers and the parsed action puts typed values over the profile's", () => {
    let s = reducer(INITIAL_STATE, { type: "path", path: "fresh" });
    expect(s.step).toBe("input");
    s = reducer(s, { type: "fresh", action: { type: "headline", value: "Barista" } });
    expect(s.fresh?.headline).toBe("Barista");
    const { draft, typed } = freshToDraft({ ...initialFresh(), headline: "Barista", links: { linkedin: "", github: "", website: "https://me.dev" } });
    s = reducer(s, { type: "parsed", draft, source: "fresh", removed: 0, existing: { headline: "Old headline", firstName: "Jane" }, typed });
    expect(s.identity).toEqual({ headline: "Barista", firstName: "Jane", website: "https://me.dev" });
    expect(s.parsed?.source).toBe("fresh");
    expect(s.fresh?.headline).toBe("Barista"); // still there for Back
  });

  it("a fresh run with answers is worth resuming after a reload; one without is not", () => {
    const empty = reducer(INITIAL_STATE, { type: "path", path: "fresh" });
    expect(hasFreshAnswers(empty.fresh)).toBe(false);
    expect(isResumable(empty)).toBe(false);
    const typing = reducer(empty, { type: "fresh", action: { type: "goal", goal: "same" } });
    expect(isResumable(typing)).toBe(true);

    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
    saveDraft(storage, typing);
    expect(store.has(DRAFT_KEY)).toBe(true);
    const back = loadDraft(storage);
    expect(back?.fresh?.goal).toBe("same");
    expect(back?.step).toBe("input");
    expect(back?.path).toBe("fresh");

    // an upload that has not produced anything is still not saved
    saveDraft(storage, reducer(INITIAL_STATE, { type: "path", path: "upload" }));
    expect(store.has(DRAFT_KEY)).toBe(false);
  });

  it("an older stored draft (no fresh field) still loads", () => {
    const store = new Map<string, string>([[DRAFT_KEY, JSON.stringify({ v: 1, step: "skills", path: "paste", parsed: { candidates: [], parsedIdentity: {}, skills: [], suggestions: [], source: "ai", removed: 0 } })]]);
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: () => undefined, removeItem: () => undefined };
    const s = loadDraft(storage);
    expect(s?.step).toBe("skills");
    expect(s?.fresh).toBeNull();
  });
});

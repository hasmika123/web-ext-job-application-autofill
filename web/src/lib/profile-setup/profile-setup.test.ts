import { describe, expect, it } from "vitest";
import type { ParsedBio, StructuredResume } from "@kiwiply/ui";
import { MAX_SKILL_CHARS, toDraft, toIsoDate, type BioLimits } from "./draft";
import {
  buildImportBody,
  identityConflicts,
  initialIdentity,
  keptItems,
  languageItems,
  planIdentity,
  skillItems,
} from "./import";
import { cleanParsedString, redactForParsing, removedNotice, stripMarker } from "./sensitive";
import { DRAFT_KEY, INITIAL_STATE, clearDraft, keptCounts, loadDraft, nextStep, prevStep, reducer, saveDraft, stepsFor } from "./state";

/** The bio caps `config.profile` carries (the API defaults). */
const BIO: BioLimits = { valueChars: 500, summaryChars: 2000 };

const structured: StructuredResume = {
  summary: "Engineer who ships.",
  skills: ["React", "react", " TypeScript ", "Go", "x".repeat(80)],
  experience: [
    {
      company: "Acme",
      title: "Senior Engineer",
      location: "Berlin",
      startDate: "Jan 2020",
      endDate: "Present",
      current: false,
      bullets: ["Cut p95 latency 40%", "  ", "Mentored 3 interns"],
    },
    { company: "Globex", title: "Engineer", location: "", startDate: "03/2016", endDate: "2019", current: false, bullets: [] },
    { company: "", title: "", location: "", startDate: "", endDate: "", current: false, bullets: [] },
  ],
  education: [{ school: "MIT", degree: "BS", field: "CS", startDate: "2012", endDate: "2016-05", gpa: "3.9", location: "" }],
  languages: [{ name: "English", proficiency: "Native" }],
  projects: [{ name: "Icon set", bullets: ["1.2k stars"] }],
};
const bio: ParsedBio = { firstName: "Jane", lastName: "Doe", email: "jane@example.com", city: "Berlin" };

describe("toIsoDate", () => {
  it("reads the usual ways a parser writes a date", () => {
    expect(toIsoDate("Jan 2020")).toBe("2020-01");
    expect(toIsoDate("September 2019")).toBe("2019-09");
    expect(toIsoDate("03/2016")).toBe("2016-03");
    expect(toIsoDate("2016.5")).toBe("2016-05");
    expect(toIsoDate("2019")).toBe("2019");
    expect(toIsoDate("2021-07")).toBe("2021-07");
  });
  it("drops what it cannot read", () => {
    expect(toIsoDate("sometime")).toBe("");
    expect(toIsoDate("")).toBe("");
  });
});

describe("toDraft", () => {
  const d = toDraft(structured, bio, ["Kubernetes", "react"], BIO);

  it("makes one candidate per non-empty experience, education and project, in the API's item shape", () => {
    expect(d.candidates.map((c) => c.section)).toEqual(["EXPERIENCE", "EXPERIENCE", "EDUCATION", "PROJECT"]);
    expect(new Set(d.candidates.map((c) => c.id)).size).toBe(4);
    expect(d.candidates[0].data).toEqual({
      title: "Senior Engineer",
      org: "Acme",
      location: "Berlin",
      start: "2020-01",
      current: true,
      bullets: [
        { text: "Cut p95 latency 40%", src: "parsed" },
        { text: "Mentored 3 interns", src: "parsed" },
      ],
    });
    expect(d.candidates[1].data).toEqual({ title: "Engineer", org: "Globex", start: "2016-03", end: "2019" });
    expect(d.candidates[2].data).toEqual({ school: "MIT", degree: "BS", field: "CS", gpa: "3.9", start: "2012", end: "2016-05" });
    expect(d.candidates[3].data).toEqual({ title: "Icon set", bullets: [{ text: "1.2k stars", src: "parsed" }] });
  });

  it("dedupes skills ignoring case, clips each, and offers the extras the parser missed", () => {
    expect(d.skills).toEqual(["React", "TypeScript", "Go", "x".repeat(MAX_SKILL_CHARS)]);
    expect(d.suggestions).toEqual(["Kubernetes"]);
  });

  it("carries identity, summary and languages", () => {
    expect(d.identity).toEqual({ firstName: "Jane", lastName: "Doe", email: "jane@example.com", city: "Berlin", summary: "Engineer who ships." });
    expect(d.languages).toEqual([{ name: "English", level: "Native" }]);
  });

  it("clips identity values and the summary to the configured bio limits, not to a fixed number", () => {
    const long = toDraft({ ...structured, summary: "s".repeat(300) }, { ...bio, city: "h".repeat(90) }, [], { valueChars: 40, summaryChars: 120 });
    expect(long.identity.summary).toHaveLength(120);
    expect(long.identity.city).toHaveLength(40);
    const plan = planIdentity({ city: "h".repeat(90), summary: "s".repeat(300) }, {}, {}, { valueChars: 40, summaryChars: 120 });
    expect(plan.fromUser.city).toHaveLength(40);
    expect(plan.fromUser.summary).toHaveLength(120);
  });

  it("removes a never-collected value the parser put back and counts it", () => {
    const dirty = toDraft(
      { ...structured, experience: [{ ...structured.experience[0], bullets: ["Led payroll. SSN: 123-45-6789", "Fine bullet"] }] },
      bio,
      [],
      BIO,
    );
    const texts = (dirty.candidates[0].data.bullets as { text: string }[]).map((b) => b.text);
    expect(texts.join(" ")).not.toContain("123-45-6789");
    expect(texts.join(" ")).not.toContain("[removed]");
    expect(dirty.removed).toBe(1);
  });
});

describe("sensitive values in the text", () => {
  it("redacts before parsing and says how many", () => {
    const r = redactForParsing("Jane Doe\nSSN 123-45-6789\nPassport number: X1234567\nLed a team");
    expect(r.removed).toBe(2);
    expect(r.text).not.toContain("123-45-6789");
    expect(r.text).not.toContain("X1234567");
    expect(r.text).toContain("Led a team");
  });
  it("leaves clean text alone", () => {
    expect(redactForParsing("Software Engineer at Acme, 2020 - 2024")).toEqual({ text: "Software Engineer at Acme, 2020 - 2024", removed: 0 });
  });
  it("strips the marker and its dangling label", () => {
    expect(stripMarker("Visa number: [removed]")).toBe("Visa number");
    expect(stripMarker("plain")).toBe("plain");
    expect(cleanParsedString("bullet", "Born on [removed] in Ohio").value).toBe("Born on in Ohio");
  });
  it("words the notice", () => {
    expect(removedNotice(0)).toBeNull();
    expect(removedNotice(1)).toContain("1 sensitive value ");
    expect(removedNotice(3)).toContain("3 sensitive values");
    expect(removedNotice(3)).toContain("we never collect");
  });
});

describe("import payload", () => {
  const cands = toDraft(structured, bio, [], BIO).candidates;

  it("sends only kept entries, edits applied, edited ones as the user's own", () => {
    const decisions = { [cands[0].id]: "keep", [cands[1].id]: "skip", [cands[2].id]: "keep" } as const;
    const edited = { title: "Staff Engineer", org: "Acme" };
    const items = keptItems(cands, { ...decisions }, { [cands[0].id]: edited });
    expect(items).toEqual([
      { section: "EXPERIENCE", dataJson: edited, provenance: "USER" },
      { section: "EDUCATION", dataJson: cands[2].data, provenance: "PARSED" },
    ]);
  });

  it("splits skills into rows of 40 under one group", () => {
    const rows = skillItems(Array.from({ length: 85 }, (_, i) => `s${i}`));
    expect(rows.map((r) => (r.dataJson.skills as string[]).length)).toEqual([40, 40, 5]);
    expect(rows[0]).toMatchObject({ section: "SKILL", provenance: "PARSED", dataJson: { group: "Skills" } });
    expect(skillItems([])).toEqual([]);
  });

  it("languages keep their level", () => {
    expect(languageItems([{ name: "English", level: "Native" }, { name: "Hindi", level: "" }])).toEqual([
      { section: "LANGUAGE", dataJson: { name: "English", level: "Native" }, provenance: "PARSED" },
      { section: "LANGUAGE", dataJson: { name: "Hindi" }, provenance: "PARSED" },
    ]);
  });

  it("the body is items plus parsed bio values, and omits bio when nothing came from the resume", () => {
    const items = skillItems(["Go"]);
    expect(buildImportBody(items, { firstName: "Jane" })).toEqual({ items, bio: { firstName: "Jane" }, provenanceBio: "parsed" });
    expect(buildImportBody(items, {})).toEqual({ items });
  });
});

describe("identity: never overwrite what the profile has without asking", () => {
  const parsed = { firstName: "Jane", lastName: "Doe", email: "jane@new.com", city: "Berlin" };
  const existing = { firstName: "Janet", email: "jane@old.com" };

  it("starts from the profile's value, else the resume's", () => {
    expect(initialIdentity(parsed, existing)).toEqual({ firstName: "Janet", lastName: "Doe", email: "jane@old.com", city: "Berlin" });
  });
  it("lists the disagreements", () => {
    expect(identityConflicts(parsed, existing)).toEqual({
      firstName: { existing: "Janet", parsed: "Jane" },
      email: { existing: "jane@old.com", parsed: "jane@new.com" },
    });
  });
  it("leaves an untouched value out of the write, imports resume values, routes typed values through the PUT", () => {
    const values = { firstName: "Janet", lastName: "Doe", email: "jane@new.com", city: "Hamburg" };
    const plan = planIdentity(values, parsed, existing, BIO);
    expect(plan.fromResume).toEqual({ lastName: "Doe", email: "jane@new.com" }); // chose the resume's email
    expect(plan.fromUser).toEqual({ city: "Hamburg" }); // typed over the resume's
    expect(Object.keys({ ...plan.fromResume, ...plan.fromUser })).not.toContain("firstName"); // kept theirs, unchanged
  });
});

describe("reducer and steps", () => {
  const draft = toDraft(structured, bio, [], BIO);
  const parsedState = reducer(INITIAL_STATE, { type: "parsed", draft, source: "ai", removed: 2, existing: {} });

  it("parsing lands on the review, or on skills when there are no cards", () => {
    expect(parsedState.step).toBe("cards");
    expect(parsedState.skills).toEqual(draft.skills);
    expect(reducer(INITIAL_STATE, { type: "parsed", draft: { ...draft, candidates: [] }, source: "heuristic", removed: 0, existing: {} }).step).toBe("skills");
  });

  it("deciding a card moves to the next, and past the last lands on the recap", () => {
    let s = parsedState;
    s = reducer(s, { type: "decide", id: draft.candidates[0].id, decision: "keep" });
    expect(s.cursor).toBe(1);
    for (const c of draft.candidates.slice(1)) s = reducer(s, { type: "decide", id: c.id, decision: "skip" });
    expect(s.cursor).toBe(draft.candidates.length);
    expect(keptCounts(s)).toEqual({ EXPERIENCE: 1, EDUCATION: 0, PROJECT: 0 });
  });

  it("keep-all decides only the remaining cards", () => {
    let s = reducer(parsedState, { type: "decide", id: draft.candidates[0].id, decision: "skip" });
    s = reducer(s, { type: "decideAll", decision: "keep" });
    expect(s.decisions[draft.candidates[0].id]).toBe("skip");
    expect(keptCounts(s).EXPERIENCE).toBe(1);
    expect(s.cursor).toBe(draft.candidates.length);
  });

  it("the steps follow what is there: no review without cards, no preferences when answered", () => {
    expect(stepsFor(parsedState, true)).toEqual(["path", "input", "cards", "skills", "identity", "prefs", "done"]);
    expect(stepsFor({ parsed: null }, false)).toEqual(["path", "input", "skills", "identity", "done"]);
    expect(nextStep({ ...parsedState, step: "identity" }, false)).toBe("done");
    expect(prevStep({ ...parsedState, step: "skills" }, false)).toBe("cards");
  });
});

describe("abandon-safe draft", () => {
  const store = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
  };
  const parsedState = reducer(INITIAL_STATE, { type: "parsed", draft: toDraft(structured, bio, [], BIO), source: "ai", removed: 0, existing: {} });

  it("round-trips a state worth resuming and holds only parsed content", () => {
    const s = store();
    saveDraft(s, parsedState);
    const raw = s.m.get(DRAFT_KEY) ?? "";
    expect(raw).toContain("Senior Engineer");
    expect(loadDraft(s)).toEqual(parsedState);
  });
  it("does not keep a draft before anything is parsed, nor after finishing", () => {
    const s = store();
    saveDraft(s, { ...INITIAL_STATE, step: "input", path: "paste" });
    expect(s.m.has(DRAFT_KEY)).toBe(false);
    saveDraft(s, parsedState);
    clearDraft(s);
    expect(loadDraft(s)).toBeNull();
  });
  it("ignores a corrupt or foreign draft", () => {
    const s = store();
    s.setItem(DRAFT_KEY, "{nope");
    expect(loadDraft(s)).toBeNull();
    s.setItem(DRAFT_KEY, JSON.stringify({ v: 2, step: "cards" }));
    expect(loadDraft(s)).toBeNull();
    expect(loadDraft(undefined)).toBeNull();
  });
});

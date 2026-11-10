/**
 * The "Start fresh" guided flow's state machine (Resume Builder R1.5, DESIGN v1 2.3): one question per
 * screen, no file and no AI. What are you looking for? -> headline -> a role or a school at a time
 * (title / company / start / end / What / How / Result, or school / degree / start / end) -> "Add
 * another?" -> skills -> links. The answers become the same `ParsedDraft` the Upload and Paste paths
 * produce, so the wizard lands on the same card-by-card review; every item it makes is the person's own
 * (`USER` provenance). Pure: no React, no network, nothing is stored anywhere but the wizard's own state.
 */
import { isMonthValue, scanSensitiveField } from "@kiwiply/ui";
import { sensitiveMessage } from "@/components/app-v3/profiles/itemSchema";
import { STUDY_FIRST_GOALS, suggestSkills, type FreshGoalId } from "@/lib/profile-options";
import type { Candidate, CandidateSection, Identity, ParsedDraft } from "./draft";
import { MAX_SKILL_CHARS } from "./draft";

export type EntryKind = "role" | "school";
export type MenuChoice = EntryKind | "skills" | "";

export type FreshStepId =
  | "goal"
  | "headline"
  | "menu"
  | "role.title"
  | "role.org"
  | "role.start"
  | "role.end"
  | "role.what"
  | "role.how"
  | "role.result"
  | "school.name"
  | "school.degree"
  | "school.start"
  | "school.end"
  | "skills"
  | "links";

export const ROLE_STEPS: FreshStepId[] = ["role.title", "role.org", "role.start", "role.end", "role.what", "role.how", "role.result"];
export const SCHOOL_STEPS: FreshStepId[] = ["school.name", "school.degree", "school.start", "school.end"];

/** One role or school as typed. `name` is the job title / school, `detail` the company / degree. */
export interface FreshEntry {
  kind: EntryKind;
  name: string;
  detail: string;
  start: string;
  end: string;
  current: boolean;
  /** The What / How / Result answers; each non-blank one becomes a bullet. */
  what: string;
  how: string;
  result: string;
}

export type LinkKey = "linkedin" | "github" | "website";

export interface FreshState {
  v: 1;
  step: FreshStepId;
  goal: FreshGoalId | "";
  headline: string;
  /** The pick on the "what next" screen, until Next is pressed. */
  choice: MenuChoice;
  /** Finished entries and, while one is being answered, the one in progress (always the last). */
  entries: FreshEntry[];
  skills: string[];
  links: Record<LinkKey, string>;
}

export type FreshAction =
  | { type: "goal"; goal: FreshGoalId | "" }
  | { type: "headline"; value: string }
  | { type: "choice"; choice: MenuChoice }
  | { type: "entry"; patch: Partial<FreshEntry> }
  | { type: "skills"; skills: string[] }
  | { type: "link"; key: LinkKey; value: string }
  | { type: "next" }
  | { type: "back" };

export function emptyEntry(kind: EntryKind): FreshEntry {
  return { kind, name: "", detail: "", start: "", end: "", current: false, what: "", how: "", result: "" };
}

/** A new run of the guided questions; `goal` pre-fills the first chip (from the persona, DESIGN 3.3), still changeable. */
export function initialFresh(goal: FreshGoalId | "" = ""): FreshState {
  return { v: 1, step: "goal", goal, headline: "", choice: "", entries: [], skills: [], links: { linkedin: "", github: "", website: "" } };
}

const stepsOf = (kind: EntryKind): FreshStepId[] => (kind === "role" ? ROLE_STEPS : SCHOOL_STEPS);

/** The step id belongs to a role or a school (null for the shared steps). */
export function entryKindOf(step: FreshStepId): EntryKind | null {
  return step.startsWith("role.") ? "role" : step.startsWith("school.") ? "school" : null;
}

const isBlank = (e: FreshEntry) => !e.name && !e.detail && !e.start && !e.end && !e.current && !e.what && !e.how && !e.result;

export function freshReducer(state: FreshState, a: FreshAction): FreshState {
  switch (a.type) {
    case "goal":
      return { ...state, goal: a.goal };
    case "headline":
      return { ...state, headline: a.value };
    case "choice":
      return { ...state, choice: a.choice };
    case "entry": {
      if (state.entries.length === 0) return state;
      const entries = state.entries.slice();
      const last = { ...entries[entries.length - 1], ...a.patch };
      if (a.patch.current === true) last.end = "";
      entries[entries.length - 1] = last;
      return { ...state, entries };
    }
    case "skills":
      return { ...state, skills: a.skills };
    case "link":
      return { ...state, links: { ...state.links, [a.key]: a.value } };
    case "next":
      return advance(state);
    case "back":
      return retreat(state);
  }
}

function advance(state: FreshState): FreshState {
  switch (state.step) {
    case "goal":
      return { ...state, step: "headline" };
    case "headline":
      return { ...state, step: "menu", choice: "" };
    case "menu": {
      if (state.choice === "") return state;
      if (state.choice === "skills") return { ...state, step: "skills", choice: "" };
      const kind = state.choice;
      const last = state.entries[state.entries.length - 1];
      // A blank entry left by going Back is reused, not stacked.
      const entries = last && last.kind === kind && isBlank(last) ? state.entries : [...state.entries, emptyEntry(kind)];
      return { ...state, entries, step: stepsOf(kind)[0], choice: "" };
    }
    case "skills":
      return { ...state, step: "links" };
    case "links":
      return state;
    default: {
      const kind = entryKindOf(state.step);
      if (!kind) return state;
      const steps = stepsOf(kind);
      const i = steps.indexOf(state.step);
      return i >= steps.length - 1 ? { ...state, step: "menu", choice: "" } : { ...state, step: steps[i + 1] };
    }
  }
}

function retreat(state: FreshState): FreshState {
  switch (state.step) {
    case "goal":
      return state;
    case "headline":
      return { ...state, step: "goal" };
    case "menu": {
      const last = state.entries[state.entries.length - 1];
      return last ? { ...state, step: stepsOf(last.kind)[stepsOf(last.kind).length - 1], choice: "" } : { ...state, step: "headline", choice: "" };
    }
    case "skills":
      return { ...state, step: "menu", choice: "" };
    case "links":
      return { ...state, step: "skills" };
    default: {
      const kind = entryKindOf(state.step);
      if (!kind) return state;
      const steps = stepsOf(kind);
      const i = steps.indexOf(state.step);
      if (i > 0) return { ...state, step: steps[i - 1] };
      // Back from the first question of an entry: an entry with nothing in it was never started.
      const last = state.entries[state.entries.length - 1];
      const entries = last && isBlank(last) ? state.entries.slice(0, -1) : state.entries;
      return { ...state, entries, step: "menu", choice: "" };
    }
  }
}

/**
 * How far through the guided questions the person is, 0 to 1, for the shell's bar: the shared screens (goal, headline,
 * the menu, skills, links) count one each, and the screens of an entry count together as the menu's share.
 */
export function freshProgress(state: Pick<FreshState, "step">): number {
  const order: Record<string, number> = { goal: 0, headline: 1, menu: 2, skills: 3, links: 4 };
  const rank = order[state.step] ?? 2.5; // a role / school question sits between the menu and skills
  return Math.min(1, rank / 5);
}

/** Anything typed or picked yet; a flow with nothing in it is not worth offering back after a reload. */
export function hasFreshAnswers(state: FreshState | null | undefined): boolean {
  if (!state) return false;
  return state.step !== "goal" || state.goal !== "" || state.headline !== "" || state.entries.length > 0 || state.skills.length > 0;
}

/** The order the "what would you like to add?" options come in: study first for an internship or a first job. */
export function menuOptions(state: Pick<FreshState, "goal" | "entries">): { value: MenuChoice; label: string }[] {
  const another = state.entries.some((e) => e.name.trim() !== "");
  const role = { value: "role" as const, label: another ? "Another job or internship" : "A job or internship" };
  const school = { value: "school" as const, label: another ? "Another school or course" : "School or training" };
  const done = { value: "skills" as const, label: another ? "That's everything for now" : "Skip, I'll add these later" };
  const studyFirst = state.goal !== "" && STUDY_FIRST_GOALS.includes(state.goal);
  return studyFirst ? [school, role, done] : [role, school, done];
}

/** "Role 1", "School 2", "About you": the small label above the question. */
export function stepContext(state: FreshState): string {
  const kind = entryKindOf(state.step);
  if (kind) {
    const n = state.entries.filter((e) => e.kind === kind).length;
    return `${kind === "role" ? "Role" : "School"} ${n}`;
  }
  if (state.step === "skills") return "Skills";
  if (state.step === "links") return "Links";
  if (state.step === "menu") return "Your history";
  return "About you";
}

// ---- validation ---------------------------------------------------------------------------------

export interface FreshLimits {
  /** Longest short answer (job title, company, school, degree, headline): `profile.bio.valueMaxChars`. */
  shortChars: number;
  /** Longest bullet: `resume.doc.limits.bulletChars`. */
  bulletChars: number;
}

const tooLong = (n: number) => `Keep this under ${n} characters.`;

function sensitive(key: string, value: string): string | null {
  const hit = scanSensitiveField(key, value)[0];
  return hit ? sensitiveMessage(hit.cls) : null;
}

/** Year-only dates cover the whole year: a start is January, an end is December. */
function monthIndex(v: string, end: boolean): string {
  return v.length === 4 ? `${v}-${end ? "12" : "01"}` : v;
}

/** The first problem with this step's answer (nothing when it can go on). */
export function stepError(state: FreshState, limits: FreshLimits): string | null {
  const entry = state.entries[state.entries.length - 1];
  const short = (key: string, value: string, required: boolean, what: string): string | null => {
    const v = value.trim();
    if (!v) return required ? `${what} is required.` : null;
    if (Array.from(v).length > limits.shortChars) return tooLong(limits.shortChars);
    return sensitive(key, v);
  };
  switch (state.step) {
    case "goal":
      return null;
    case "headline":
      return short("headline", state.headline, false, "Headline");
    case "menu":
      return state.choice === "" ? "Choose one to continue." : null;
    case "role.title":
      return entry ? short("title", entry.name, true, "Job title") : null;
    case "role.org":
      return entry ? short("org", entry.detail, true, "Company") : null;
    case "school.name":
      return entry ? short("school", entry.name, true, "School") : null;
    case "school.degree":
      return entry ? short("degree", entry.detail, false, "Degree") : null;
    case "role.start":
    case "school.start": {
      if (!entry || !entry.start) return null;
      return isMonthValue(entry.start) ? null : "Enter a 4-digit year, and a month if you know it.";
    }
    case "role.end":
    case "school.end": {
      if (!entry || entry.current || !entry.end) return null;
      if (!isMonthValue(entry.end)) return "Enter a 4-digit year, and a month if you know it.";
      if (entry.start && isMonthValue(entry.start) && monthIndex(entry.end, true) < monthIndex(entry.start, false)) return "The end can't be before the start.";
      return null;
    }
    case "role.what":
    case "role.how":
    case "role.result": {
      if (!entry) return null;
      const v = (state.step === "role.what" ? entry.what : state.step === "role.how" ? entry.how : entry.result).trim();
      if (!v) return null;
      if (Array.from(v).length > limits.bulletChars) return tooLong(limits.bulletChars);
      return sensitive("bullet", v);
    }
    case "skills":
      return state.skills.some((s) => Array.from(s).length > MAX_SKILL_CHARS) ? `Keep each skill under ${MAX_SKILL_CHARS} characters.` : null;
    case "links": {
      for (const k of ["linkedin", "github", "website"] as const) {
        const v = normalizeLink(state.links[k]);
        if (v && !/^https?:\/\/[^\s/]+\.[^\s/]+\S*$/i.test(v)) return "Use a full web address, like https://linkedin.com/in/yourname";
      }
      return null;
    }
  }
}

/** "linkedin.com/in/me" becomes "https://linkedin.com/in/me"; blank stays blank. */
export function normalizeLink(raw: string): string {
  const v = raw.trim();
  if (!v) return "";
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `https://${v}`;
}

// ---- the draft the review lands on ----------------------------------------------------------------

/** The skills to offer as one-tap adds: for the headline and the roles typed, minus the ones already chosen. */
export function skillSuggestionsFor(state: Pick<FreshState, "headline" | "entries" | "skills">): string[] {
  const text = [state.headline, ...state.entries.filter((e) => e.kind === "role").map((e) => e.name)].join(" ");
  const have = new Set(state.skills.map((s) => s.toLowerCase()));
  return suggestSkills(text).filter((s) => !have.has(s.toLowerCase()));
}

/**
 * The answers as the review's input. Entries without a title / school are dropped; each What / How /
 * Result answer is one bullet in that order. The headline and links come back as `typed`: values the
 * person typed themselves, which the wizard writes with `user` provenance, not as "parsed".
 */
export function freshToDraft(state: FreshState): { draft: ParsedDraft; typed: Identity } {
  const counts: Record<CandidateSection, number> = { EXPERIENCE: 0, EDUCATION: 0, PROJECT: 0 };
  const candidates: Candidate[] = [];
  for (const e of state.entries) {
    const name = e.name.trim();
    if (!name) continue;
    const section: CandidateSection = e.kind === "role" ? "EXPERIENCE" : "EDUCATION";
    const data: Candidate["data"] = e.kind === "role" ? { title: name } : { school: name };
    const detail = e.detail.trim();
    if (detail) data[e.kind === "role" ? "org" : "degree"] = detail;
    if (e.start) data.start = e.start;
    if (e.current) data.current = true;
    else if (e.end) data.end = e.end;
    if (e.kind === "role") {
      const bullets = [e.what, e.how, e.result].map((t) => t.trim()).filter(Boolean);
      if (bullets.length > 0) data.bullets = bullets.map((text) => ({ text, src: "user" }));
    }
    candidates.push({ id: `${section.slice(0, 3).toLowerCase()}${counts[section]++}`, section, data });
  }
  const skills = state.skills.map((s) => s.trim()).filter(Boolean);
  const draft: ParsedDraft = {
    candidates,
    skills,
    suggestions: skillSuggestionsFor({ ...state, skills }),
    languages: [],
    identity: {},
    removed: 0,
  };
  const typed: Identity = {};
  const headline = state.headline.trim();
  if (headline) typed.headline = headline;
  for (const k of ["linkedin", "github", "website"] as const) {
    const v = normalizeLink(state.links[k]);
    if (v) typed[k] = v;
  }
  return { draft, typed };
}

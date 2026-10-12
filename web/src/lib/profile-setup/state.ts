/**
 * The setup wizard's state (Resume Builder R1.4): one serialisable object, a reducer, the order of the
 * steps, and the abandon-safe draft in `sessionStorage`. Nothing here touches the network; nothing is
 * persisted to the account until the user finishes (see `import.ts`). The draft never holds the file or
 * the pasted text, only what was parsed out of it (already stripped of never-collected values).
 */
import type { ItemData } from "@/lib/profile-items";
import type { Candidate, Identity, Language, ParsedDraft } from "./draft";
import { initialIdentity, type Decision } from "./import";

export type StepKey = "path" | "input" | "cards" | "skills" | "identity" | "prefs" | "done";
export type SetupPath = "upload" | "paste";

export interface SetupState {
  v: 1;
  step: StepKey;
  path: SetupPath | null;
  /** The parse the review is working on; null until Upload / Paste has produced one. */
  parsed: { candidates: Candidate[]; parsedIdentity: Identity; skills: string[]; suggestions: string[]; source: "ai" | "heuristic"; removed: number } | null;
  decisions: Record<string, Decision>;
  edits: Record<string, ItemData>;
  /** Index of the card on screen; equal to the number of cards when the recap is showing. */
  cursor: number;
  skills: string[];
  languages: Language[];
  identity: Identity;
  prefs: Record<string, string>;
  /** The import call succeeded (a retry after a failed PUT must not import again). */
  imported: boolean;
}

export type Action =
  | { type: "path"; path: SetupPath }
  | { type: "parsed"; draft: ParsedDraft; source: "ai" | "heuristic"; removed: number; existing: Record<string, unknown> }
  | { type: "decide"; id: string; decision: Decision }
  | { type: "decideAll"; decision: Decision }
  | { type: "edit"; id: string; data: ItemData }
  | { type: "cursor"; cursor: number }
  | { type: "goto"; step: StepKey }
  | { type: "skills"; skills: string[] }
  | { type: "languages"; languages: Language[] }
  | { type: "identity"; key: keyof Identity; value: string }
  | { type: "pref"; key: string; value: string }
  | { type: "imported" }
  | { type: "restore"; state: SetupState }
  | { type: "reset" };

export const INITIAL_STATE: SetupState = {
  v: 1,
  step: "path",
  path: null,
  parsed: null,
  decisions: {},
  edits: {},
  cursor: 0,
  skills: [],
  languages: [],
  identity: {},
  prefs: {},
  imported: false,
};

export function reducer(state: SetupState, a: Action): SetupState {
  switch (a.type) {
    case "path":
      return { ...state, path: a.path, step: "input" };
    case "parsed": {
      const first = a.draft.candidates.length > 0 ? "cards" : "skills";
      return {
        ...state,
        step: first,
        parsed: { candidates: a.draft.candidates, parsedIdentity: a.draft.identity, skills: a.draft.skills, suggestions: a.draft.suggestions, source: a.source, removed: a.removed },
        decisions: {},
        edits: {},
        cursor: 0,
        skills: a.draft.skills,
        languages: a.draft.languages,
        identity: initialIdentity(a.draft.identity, a.existing),
        imported: false,
      };
    }
    case "decide": {
      const decisions = { ...state.decisions, [a.id]: a.decision };
      const total = state.parsed?.candidates.length ?? 0;
      // Deciding a card moves on; deciding one the user went back to also moves on, to the recap at most.
      const at = state.parsed?.candidates.findIndex((c) => c.id === a.id) ?? -1;
      return { ...state, decisions, cursor: Math.min(total, at >= 0 ? at + 1 : state.cursor) };
    }
    case "decideAll": {
      const decisions = { ...state.decisions };
      const list = state.parsed?.candidates ?? [];
      for (const c of list.slice(state.cursor)) decisions[c.id] = a.decision;
      return { ...state, decisions, cursor: list.length };
    }
    case "edit":
      return { ...state, edits: { ...state.edits, [a.id]: a.data } };
    case "cursor": {
      const total = state.parsed?.candidates.length ?? 0;
      return { ...state, cursor: Math.max(0, Math.min(total, a.cursor)) };
    }
    case "goto":
      return { ...state, step: a.step };
    case "skills":
      return { ...state, skills: a.skills };
    case "languages":
      return { ...state, languages: a.languages };
    case "identity":
      return { ...state, identity: { ...state.identity, [a.key]: a.value } };
    case "pref":
      return { ...state, prefs: { ...state.prefs, [a.key]: a.value } };
    case "imported":
      return { ...state, imported: true };
    case "restore":
      return a.state;
    case "reset":
      return INITIAL_STATE;
  }
}

// ---- step order --------------------------------------------------------------------------------

export const STEP_LABELS: Record<StepKey, string> = {
  path: "Start",
  input: "Your resume",
  cards: "Review",
  skills: "Skills",
  identity: "About you",
  prefs: "Preferences",
  done: "Done",
};

/** The steps this run goes through, in order: no Review without entries, no Preferences when all are answered. */
export function stepsFor(state: Pick<SetupState, "parsed">, hasPrefQuestions: boolean): StepKey[] {
  const steps: StepKey[] = ["path", "input"];
  if ((state.parsed?.candidates.length ?? 0) > 0) steps.push("cards");
  steps.push("skills", "identity");
  if (hasPrefQuestions) steps.push("prefs");
  steps.push("done");
  return steps;
}

export function nextStep(state: SetupState, hasPrefQuestions: boolean): StepKey {
  const steps = stepsFor(state, hasPrefQuestions);
  const i = steps.indexOf(state.step);
  return steps[Math.min(steps.length - 1, i + 1)];
}

export function prevStep(state: SetupState, hasPrefQuestions: boolean): StepKey {
  const steps = stepsFor(state, hasPrefQuestions);
  const i = steps.indexOf(state.step);
  return steps[Math.max(0, i - 1)];
}

/** Counts shown in the summary line and sent at the end. */
export function keptCounts(state: Pick<SetupState, "parsed" | "decisions">): { EXPERIENCE: number; EDUCATION: number; PROJECT: number } {
  const out = { EXPERIENCE: 0, EDUCATION: 0, PROJECT: 0 };
  for (const c of state.parsed?.candidates ?? []) if (state.decisions[c.id] === "keep") out[c.section]++;
  return out;
}

// ---- abandon-safe draft ------------------------------------------------------------------------

export const DRAFT_KEY = "kiwiply.profileSetup.draft.v1";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const STEP_KEYS: StepKey[] = ["path", "input", "cards", "skills", "identity", "prefs", "done"];

/** A stored draft worth resuming: parsed content exists and the user has not finished. */
export function isResumable(s: SetupState): boolean {
  return s.parsed !== null && s.step !== "path" && s.step !== "input" && s.step !== "done";
}

export function saveDraft(storage: StorageLike | undefined, state: SetupState): void {
  try {
    if (!storage) return;
    if (!isResumable(state)) storage.removeItem(DRAFT_KEY);
    else storage.setItem(DRAFT_KEY, JSON.stringify(state));
  } catch {
    // private mode / quota: the wizard works, it just cannot be resumed
  }
}

export function clearDraft(storage: StorageLike | undefined): void {
  try {
    storage?.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}

export function loadDraft(storage: StorageLike | undefined): SetupState | null {
  try {
    const raw = storage?.getItem(DRAFT_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<SetupState> | null;
    if (!s || s.v !== 1 || !s.step || !STEP_KEYS.includes(s.step) || !s.parsed || !Array.isArray(s.parsed.candidates)) return null;
    const merged: SetupState = { ...INITIAL_STATE, ...s, parsed: s.parsed } as SetupState;
    return isResumable(merged) ? merged : null;
  } catch {
    return null;
  }
}

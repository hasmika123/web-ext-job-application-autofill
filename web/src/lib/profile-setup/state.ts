/**
 * The setup wizard's state (Resume Builder R1.4; v2 since Onboarding v2 R1.9): one serialisable object, a
 * reducer, the order of the steps, the progress numbers behind "3 of 7 done", and the one-shot upgrade of the
 * old `sessionStorage` v1 draft. Nothing here touches the network (that is `lib/onboarding/`); nothing is
 * written to the profile until the user confirms (see `import.ts`). The draft never holds the file or the
 * pasted text, only what was parsed out of it (already stripped of never-collected values), and never the
 * application-question answers (ONBOARDING-V2-DESIGN 7.5): `draftPayload` leaves `prefs` out.
 */
import type { ItemData } from "@/lib/profile-items";
import type { Candidate, Identity, Language, ParsedDraft } from "./draft";
import { freshGoalFor } from "@/lib/onboarding/persona";
import { freshProgress, freshReducer, hasFreshAnswers, initialFresh, type FreshAction, type FreshState } from "./fresh";
import { initialIdentity, type Decision } from "./import";

/** DESIGN 3.1: hello (persona) -> source (the way in) -> review -> skills -> you (core confirm) -> prefs -> done. */
export type StepKey = "hello" | "source" | "review" | "skills" | "you" | "prefs" | "done";
export type SetupPath = "upload" | "paste" | "fresh";
/** Where a parse came from: the AI parser, the local one, or the guided "Start fresh" answers. */
export type ParseSource = "ai" | "heuristic" | "fresh";
/** DESIGN 3.2: a lens on the questions, never a wall. Mirrors the API's persona enum. */
export type Persona = "student" | "first_job" | "switching" | "experienced";

export const STATE_VERSION = 2;
export const STEP_KEYS: StepKey[] = ["hello", "source", "review", "skills", "you", "prefs", "done"];
export const PERSONAS: Persona[] = ["student", "first_job", "switching", "experienced"];

/** The v1 step names and where they went (DESIGN 3.1): `path` and `input` are both the `source` step now. */
const V1_STEP: Record<string, StepKey> = { path: "source", input: "source", cards: "review", skills: "skills", identity: "you", prefs: "prefs", done: "done" };

export interface SetupState {
  v: 2;
  step: StepKey;
  path: SetupPath | null;
  /** The parse the review is working on; null until Upload / Paste has produced one. */
  parsed: { candidates: Candidate[]; parsedIdentity: Identity; skills: string[]; suggestions: string[]; source: ParseSource; removed: number } | null;
  /** The "Start fresh" answers so far; kept here so Back from the review returns to them, and a reload keeps them. */
  fresh: FreshState | null;
  decisions: Record<string, Decision>;
  edits: Record<string, ItemData>;
  /** Index of the card on screen; equal to the number of cards when the recap is showing. */
  cursor: number;
  skills: string[];
  languages: Language[];
  identity: Identity;
  /** The application-question answers so far. Held on this device only: never in the server draft. */
  prefs: Record<string, string>;
  /** The import call succeeded (a retry after a failed PUT must not import again). */
  imported: boolean;
  /** Who the person says they are (a lens on the questions); null until chosen. Truth is `bio.meta_json.onboarding.persona`. */
  persona: Persona | null;
  /** Whole steps finished, the number of steps this run has, and how far through the current one (0..1): see `progressOf`. */
  stepsDone: number;
  stepsTotal: number;
  subProgress: number;
  /** When the core confirm (the import + profile PUT) went through; after it review / skills / you are shown as done. */
  coreConfirmedAt: string | null;
  /** The question keys answered or skipped so far. */
  prefsDone: string[];
  /** Client clock, ISO: stamped on every change; the local-vs-server tie-break and the "was that write ours" check. */
  updatedAt: string | null;
}

export type Action =
  | { type: "path"; path: SetupPath }
  /** Back to the picker of ways in (the `source` step with no path). */
  | { type: "backToPath" }
  | { type: "parsed"; draft: ParsedDraft; source: ParseSource; removed: number; existing: Record<string, unknown>; typed?: Identity }
  | { type: "fresh"; action: FreshAction }
  | { type: "decide"; id: string; decision: Decision }
  | { type: "decideAll"; decision: Decision }
  /** Take a decision back (the Skip undo): the card is undecided and on screen again. */
  | { type: "undecide"; id: string }
  /** "Skip for now" on the source screen: nothing parsed, straight to the identity card (DESIGN 5.3). */
  | { type: "skipSource"; existing: Record<string, unknown> }
  | { type: "edit"; id: string; data: ItemData }
  | { type: "cursor"; cursor: number }
  | { type: "goto"; step: StepKey }
  | { type: "skills"; skills: string[] }
  | { type: "languages"; languages: Language[] }
  | { type: "identity"; key: keyof Identity; value: string }
  | { type: "pref"; key: string; value: string }
  | { type: "persona"; persona: Persona | null }
  /** A question was answered or skipped. */
  | { type: "prefDone"; key: string }
  | { type: "imported" }
  /** The core confirm went through (import + profile PUT). */
  | { type: "coreConfirmed"; at?: string }
  /** Take a whole state from the server draft or the local mirror (it carries its own `updatedAt`). */
  | { type: "hydrate"; state: SetupState }
  /** Start over: everything unfinished resets, the persona stays. */
  | { type: "reset" };

export const INITIAL_STATE: SetupState = {
  v: 2,
  step: "source",
  path: null,
  parsed: null,
  fresh: null,
  decisions: {},
  edits: {},
  cursor: 0,
  skills: [],
  languages: [],
  identity: {},
  prefs: {},
  imported: false,
  persona: null,
  stepsDone: 0,
  stepsTotal: 7, // config-literal-ok: the full step list of DESIGN 3.1 (hello, source, review, skills, you, prefs, done)
  subProgress: 0,
  coreConfirmedAt: null,
  prefsDone: [],
  updatedAt: null,
};

function reduce(state: SetupState, a: Action): SetupState {
  switch (a.type) {
    case "path":
      return { ...state, path: a.path, step: "source" };
    case "backToPath":
      return { ...state, path: null, step: "source" };
    case "parsed": {
      const first = a.draft.candidates.length > 0 ? "review" : "skills";
      return {
        ...state,
        step: first,
        parsed: { candidates: a.draft.candidates, parsedIdentity: a.draft.identity, skills: a.draft.skills, suggestions: a.draft.suggestions, source: a.source, removed: a.removed },
        decisions: {},
        edits: {},
        cursor: 0,
        skills: a.draft.skills,
        languages: a.draft.languages,
        // Values the person typed themselves ("Start fresh": headline, links) go on top of what the profile has.
        identity: { ...initialIdentity(a.draft.identity, a.existing), ...a.typed },
        imported: false,
        coreConfirmedAt: null,
      };
    }
    case "fresh":
      return { ...state, fresh: freshReducer(state.fresh ?? initialFresh(freshGoalFor(state.persona)), a.action) };
    case "skipSource":
      return {
        ...state,
        step: "you",
        parsed: { candidates: [], parsedIdentity: {}, skills: [], suggestions: [], source: "heuristic", removed: 0 },
        decisions: {},
        edits: {},
        cursor: 0,
        skills: [],
        languages: [],
        identity: initialIdentity({}, a.existing),
        imported: false,
        coreConfirmedAt: null,
      };
    case "undecide": {
      const { [a.id]: _gone, ...decisions } = state.decisions;
      void _gone;
      const at = state.parsed?.candidates.findIndex((c) => c.id === a.id) ?? -1;
      return { ...state, decisions, cursor: at >= 0 ? at : state.cursor };
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
    case "persona":
      return { ...state, persona: a.persona };
    case "prefDone":
      return state.prefsDone.includes(a.key) ? state : { ...state, prefsDone: [...state.prefsDone, a.key] };
    case "imported":
      return { ...state, imported: true };
    case "coreConfirmed":
      return { ...state, coreConfirmedAt: a.at ?? new Date().toISOString() };
    case "hydrate":
      return a.state;
    case "reset":
      return { ...INITIAL_STATE, persona: state.persona };
  }
}

/** The reducer, stamping `updatedAt` on every real change (a hydrated state keeps the stamp it came with). */
export function reducer(state: SetupState, a: Action): SetupState {
  const next = reduce(state, a);
  if (next === state || a.type === "hydrate") return next;
  return { ...next, updatedAt: new Date().toISOString() };
}

// ---- step order --------------------------------------------------------------------------------

/** The label of the `source` step depends on whether a way in was picked, and which. */
export function stepLabel(key: StepKey, path: SetupPath | null): string {
  if (key === "source") return path === null ? "Start" : path === "fresh" ? "Your answers" : "Your resume";
  return STEP_LABELS[key];
}

export const STEP_LABELS: Record<StepKey, string> = {
  hello: "Who you are",
  source: "Your resume",
  review: "Review",
  skills: "Skills",
  you: "About you",
  prefs: "Preferences",
  done: "Done",
};

/**
 * The steps this run goes through, in order: no review without entries, no preferences when every question is
 * answered (DESIGN 3.1). The bar never jumps backwards because `stepsTotal` only shrinks when review is skipped.
 */
export function stepsFor(state: Pick<SetupState, "parsed">, hasPrefQuestions: boolean): StepKey[] {
  const steps: StepKey[] = ["hello", "source"];
  if ((state.parsed?.candidates.length ?? 0) > 0) steps.push("review");
  steps.push("skills", "you");
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

/**
 * "n of total done" (whole steps behind the current one; `done` counts when reached) and how far through the
 * current step the person is: cards decided on `review`, questions answered on `prefs` (DESIGN 3.1 / 5.0).
 */
export function progressOf(state: SetupState, hasPrefQuestions: boolean, prefQuestionCount = 0): { stepsDone: number; stepsTotal: number; subProgress: number } {
  // The `/welcome` link opens on the questions with nothing parsed: just the questions, then done.
  const steps = state.step === "prefs" && !state.parsed ? (["prefs", "done"] as StepKey[]) : stepsFor(state, hasPrefQuestions);
  const stepsTotal = steps.length;
  if (state.step === "done") return { stepsDone: stepsTotal, stepsTotal, subProgress: 0 };
  const at = Math.max(0, steps.indexOf(state.step));
  let sub = 0;
  if (state.step === "review") {
    const cards = state.parsed?.candidates.length ?? 0;
    sub = cards > 0 ? state.cursor / cards : 0;
  } else if (state.step === "source" && state.path === "fresh") {
    sub = freshProgress(state.fresh ?? { step: "goal" });
  } else if (state.step === "prefs") {
    sub = prefQuestionCount > 0 ? state.prefsDone.length / prefQuestionCount : 0;
  }
  return { stepsDone: at, stepsTotal, subProgress: Math.max(0, Math.min(1, sub)) };
}

/** `state` with `stepsDone` / `stepsTotal` / `subProgress` brought up to date (the same object when they already are). */
export function withProgress(state: SetupState, hasPrefQuestions: boolean, prefQuestionCount = 0): SetupState {
  const p = progressOf(state, hasPrefQuestions, prefQuestionCount);
  return p.stepsDone === state.stepsDone && p.stepsTotal === state.stepsTotal && p.subProgress === state.subProgress ? state : { ...state, ...p };
}

/** Counts shown in the summary line and sent at the end. */
export function keptCounts(state: Pick<SetupState, "parsed" | "decisions">): { EXPERIENCE: number; EDUCATION: number; PROJECT: number } {
  const out = { EXPERIENCE: 0, EDUCATION: 0, PROJECT: 0 };
  for (const c of state.parsed?.candidates ?? []) if (state.decisions[c.id] === "keep") out[c.section]++;
  return out;
}

// ---- what is worth keeping ---------------------------------------------------------------------

/**
 * A state worth resuming: parsed content exists and the user has not finished, or a "Start fresh" run has
 * answers in it (those take a while to type, so they survive a reload mid-flow). Nothing is saved before that,
 * so merely opening the page never creates a draft (and never makes the dashboard card say "in progress").
 */
export function isResumable(s: SetupState): boolean {
  if (s.step === "hello" || s.step === "done") return false;
  if (s.step === "source") return s.path === "fresh" && (s.parsed !== null || hasFreshAnswers(s.fresh));
  return s.parsed !== null;
}

/**
 * The server draft's `state` (DESIGN 7.5): everything but the application-question answers, which are written per
 * answer and never drafted (the voluntary self-identification answers among them are never sent anywhere early).
 */
export function draftPayload(s: SetupState): Omit<SetupState, "prefs"> {
  const { prefs: _prefs, ...rest } = s;
  void _prefs;
  return rest;
}

/** The voluntary self-identification answers (DESIGN 5.9): not kept anywhere early, not even on this device. */
const EEO_KEYS = ["gender", "ethnicity", "race", "veteranStatus", "disabilityStatus"];

/** What the local mirror keeps: the whole state minus the self-identification answers (not even on this device). */
export function mirrorState(s: SetupState): SetupState {
  const prefs = Object.fromEntries(Object.entries(s.prefs).filter(([k]) => !EEO_KEYS.includes(k)));
  return Object.keys(prefs).length === Object.keys(s.prefs).length ? s : { ...s, prefs };
}

// ---- reading a stored state --------------------------------------------------------------------

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

/**
 * A v2 state from storage or the server draft, checked and filled in; null when it is not one. Fields a newer or
 * older writer left out fall back to the initial values, so a half-written draft still opens.
 */
export function readState(raw: unknown): SetupState | null {
  if (!isObject(raw) || raw.v !== STATE_VERSION) return null;
  if (typeof raw.step !== "string" || !STEP_KEYS.includes(raw.step as StepKey)) return null;
  const parsed = raw.parsed ?? null;
  if (parsed !== null && (!isObject(parsed) || !Array.isArray(parsed.candidates))) return null;
  const persona = typeof raw.persona === "string" && (PERSONAS as string[]).includes(raw.persona) ? (raw.persona as Persona) : null;
  const s = {
    ...INITIAL_STATE,
    ...(raw as Partial<SetupState>),
    v: 2 as const,
    parsed: parsed as SetupState["parsed"],
    fresh: (raw.fresh ?? null) as SetupState["fresh"],
    persona,
    prefs: isObject(raw.prefs) ? (raw.prefs as Record<string, string>) : {},
    prefsDone: Array.isArray(raw.prefsDone) ? (raw.prefsDone as string[]) : [],
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : null,
    coreConfirmedAt: typeof raw.coreConfirmedAt === "string" ? raw.coreConfirmedAt : null,
  } satisfies SetupState;
  return s;
}

// ---- the v1 draft (sessionStorage) -------------------------------------------------------------

/** The v1 wizard kept its draft in this tab's `sessionStorage`; v2 moved it to the server + a local mirror. */
export const V1_DRAFT_KEY = "kiwiply.profileSetup.draft.v1";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** `StepKey` of a v1 (or v2) step name, or null for something unknown (DESIGN 3.1: path/input -> source, cards -> review, identity -> you). */
export function mapStep(raw: unknown): StepKey | null {
  if (typeof raw !== "string") return null;
  if ((STEP_KEYS as string[]).includes(raw)) return raw as StepKey;
  return V1_STEP[raw] ?? null;
}

/**
 * One v1 draft turned into a v2 state: steps renamed, the new fields given their starting values. A v1 draft
 * was only ever kept when it was worth resuming, so this keeps that promise (see `isResumable`).
 */
export function upgradeDraft(v1: unknown, now: Date = new Date()): SetupState | null {
  if (!isObject(v1) || v1.v !== 1) return null;
  const step = mapStep(v1.step);
  if (!step) return null;
  if (v1.parsed != null && (!isObject(v1.parsed) || !Array.isArray(v1.parsed.candidates))) return null;
  // v1 steps `path` and `input` both become `source`; the old `input` always had a path, the old `path` never did.
  const path = step === "source" && v1.step === "path" ? null : (v1.path as SetupPath | null) ?? null;
  const base = {
    ...INITIAL_STATE,
    ...(v1 as unknown as Partial<SetupState>),
    v: 2 as const,
    step,
    path,
    parsed: (v1.parsed ?? null) as SetupState["parsed"],
    fresh: (v1.fresh ?? null) as SetupState["fresh"],
    prefs: isObject(v1.prefs) ? (v1.prefs as Record<string, string>) : {},
    persona: null,
    prefsDone: [],
    coreConfirmedAt: null,
    updatedAt: now.toISOString(),
  } satisfies SetupState;
  const s = withProgress(base, true);
  return isResumable(s) ? s : null;
}

/**
 * The one-shot migration (DESIGN 7.1): read the v1 `sessionStorage` draft, upgrade it, and remove the v1 key
 * whatever came of it, so it is never offered twice.
 */
export function migrateV1Draft(storage: StorageLike | undefined): SetupState | null {
  try {
    const raw = storage?.getItem(V1_DRAFT_KEY);
    if (!raw) return null;
    storage?.removeItem(V1_DRAFT_KEY);
    return upgradeDraft(JSON.parse(raw));
  } catch {
    return null;
  }
}

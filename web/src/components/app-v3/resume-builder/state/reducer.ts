/**
 * The editor reducer (DESIGN 7.2): pure functions from `(state, action)` to the next state. Every
 * document edit goes through `commit`, which records an undo step (coalescing typing per field) and
 * bumps `rev`; autosave compares `rev` with `savedRev` to know whether there is anything to save.
 *
 * Limits mirror the server validator (`ResumeDocumentValidator`): at most 40 items per section, 12
 * bullets per item, 600 characters per bullet, 2000 per summary, 200 per short field. The reducer
 * clamps instead of rejecting, so a paste can never produce a document the API would answer 422 to.
 */
import type { ResumeBullet, ResumeDocument, ResumeSection, ResumeTheme } from "@kiwiply/ui";
import { canRedo, canUndo, createHistory, record, redo, undo } from "./history";
import type { EditorAction, EditorState, ItemTextField, SaveStatus } from "./types";

export const MAX_ITEMS = 40;
export const MAX_BULLETS = 12;
// config-literal-ok: mirrors settings keys resume.doc.limits.bulletChars / summaryChars (defaults); R2.1 ("limits clamp") threads the live config into the reducer
export const MAX_BULLET_CHARS = 600;
// config-literal-ok: resume.doc.limits.summaryChars default; see above
export const MAX_SUMMARY_CHARS = 2000;
// config-literal-ok: short-field maxLength is a schema constant (DESIGN 3.1), not a settings key
export const MAX_SHORT_CHARS = 200;

export interface InitialEditorInput {
  doc: ResumeDocument;
  templateId: string;
  theme: Partial<ResumeTheme> | null;
  docVersion: number;
}

export function initEditorState(input: InitialEditorInput): EditorState {
  return {
    history: createHistory(input.doc),
    theme: input.theme,
    templateId: input.templateId,
    docVersion: input.docVersion,
    rev: 0,
    savedRev: 0,
    savedAt: null,
    phase: "idle",
    error: null,
    conflict: null,
  };
}

/* ── selectors ────────────────────────────────────────────────────────────────────────────── */

export const currentDoc = (s: EditorState): ResumeDocument => s.history.present;
export const hasUnsaved = (s: EditorState): boolean => s.rev > s.savedRev;
export const canUndoEdit = (s: EditorState): boolean => canUndo(s.history);
export const canRedoEdit = (s: EditorState): boolean => canRedo(s.history);

/** The one word the top bar renders ("saved" / "saving" / ...). Unsaved-but-not-yet-sent reads as saving. */
export function saveStatus(s: EditorState): SaveStatus {
  if (s.phase === "conflict") return "conflict";
  if (s.phase === "error") return "error";
  if (s.phase === "retrying") return "retrying";
  if (s.phase === "saving" || hasUnsaved(s)) return "saving";
  return "saved";
}

/* ── document helpers (immutable; untouched branches keep their identity) ─────────────────── */

type AnyItem = Record<string, unknown> & { id: string; bullets?: ResumeBullet[] };

function mapSection(doc: ResumeDocument, sectionId: string, fn: (s: ResumeSection) => ResumeSection): ResumeDocument {
  let changed = false;
  const sections = doc.sections.map((s) => {
    if (s.id !== sectionId) return s;
    const next = fn(s);
    if (next !== s) changed = true;
    return next;
  });
  return changed ? { ...doc, sections } : doc;
}

function withItems(section: ResumeSection, items: unknown[]): ResumeSection {
  return { ...section, items } as ResumeSection;
}

function mapItem(doc: ResumeDocument, sectionId: string, itemId: string, fn: (item: AnyItem) => AnyItem): ResumeDocument {
  return mapSection(doc, sectionId, (s) => {
    let changed = false;
    const items = (s.items as AnyItem[]).map((it) => {
      if (it.id !== itemId) return it;
      const next = fn(it);
      if (next !== it) changed = true;
      return next;
    });
    return changed ? withItems(s, items) : s;
  });
}

function mapBullets(
  doc: ResumeDocument,
  sectionId: string,
  itemId: string,
  fn: (bullets: ResumeBullet[]) => ResumeBullet[],
): ResumeDocument {
  return mapItem(doc, sectionId, itemId, (it) => {
    const before = it.bullets ?? [];
    const after = fn(before);
    return after === before ? it : { ...it, bullets: after };
  });
}

const clamp = (s: string, max: number) => (s.length > max ? s.slice(0, max) : s);

/** The next document for an edit action, or the same `doc` when it is a no-op. */
function applyEdit(doc: ResumeDocument, a: Exclude<EditorAction, { type: `save/${string}` | `conflict/${string}` | `history/${string}` | `presentation/${string}` }>): ResumeDocument {
  switch (a.type) {
    case "title/edit": {
      const title = clamp(a.title, MAX_SHORT_CHARS);
      return doc.meta.title === title ? doc : { ...doc, meta: { ...doc.meta, title } };
    }

    case "summary/edit": {
      const text = clamp(a.text, MAX_SUMMARY_CHARS);
      return mapSection(doc, a.sectionId, (s) => {
        if (s.kind !== "SUMMARY") return s;
        const first = s.items[0];
        if (!first) return { ...s, items: [{ id: a.newItemId, text, src: "user" as const }] };
        if (first.text === text) return s;
        return { ...s, items: [{ ...first, text, src: "user" as const }, ...s.items.slice(1)] };
      });
    }

    case "item/field": {
      const raw = clamp(a.value, MAX_SHORT_CHARS);
      const value = a.field === "start" || a.field === "end" ? raw || null : raw;
      return mapItem(doc, a.sectionId, a.itemId, (it) => (it[a.field as ItemTextField] === value ? it : { ...it, [a.field]: value }));
    }

    case "item/current":
      return mapItem(doc, a.sectionId, a.itemId, (it) => ((it.current ?? false) === a.current ? it : { ...it, current: a.current }));

    case "item/add":
      return mapSection(doc, a.sectionId, (s) => {
        if (s.kind !== "EXPERIENCE" || s.items.length >= MAX_ITEMS) return s;
        const item = { id: a.itemId, title: "", org: "", start: null, end: null, current: false, bullets: [{ id: a.bulletId, text: "", src: "user" as const }] };
        // Newest first: a resume lists the latest role on top.
        return withItems(s, [item, ...s.items]);
      });

    case "item/remove":
      return mapSection(doc, a.sectionId, (s) => {
        const items = (s.items as AnyItem[]).filter((it) => it.id !== a.itemId);
        return items.length === s.items.length ? s : withItems(s, items);
      });

    case "bullet/edit": {
      const text = clamp(a.text, MAX_BULLET_CHARS);
      return mapBullets(doc, a.sectionId, a.itemId, (bs) => {
        const i = bs.findIndex((b) => b.id === a.bulletId);
        if (i < 0 || bs[i].text === text) return bs;
        return bs.map((b, j) => (j === i ? { ...b, text, src: "user" as const } : b));
      });
    }

    case "bullet/add":
      return mapBullets(doc, a.sectionId, a.itemId, (bs) =>
        bs.length >= MAX_BULLETS ? bs : [...bs, { id: a.bulletId, text: "", src: "user" as const }],
      );

    case "bullet/split":
      return mapBullets(doc, a.sectionId, a.itemId, (bs) => {
        const i = bs.findIndex((b) => b.id === a.bulletId);
        if (i < 0 || bs.length >= MAX_BULLETS) return bs;
        const out = bs.slice();
        out[i] = { ...bs[i], text: clamp(a.before, MAX_BULLET_CHARS), src: "user" };
        out.splice(i + 1, 0, { id: a.newBulletId, text: clamp(a.after, MAX_BULLET_CHARS), src: "user" });
        return out;
      });

    case "bullet/remove":
      return mapBullets(doc, a.sectionId, a.itemId, (bs) => {
        const out = bs.filter((b) => b.id !== a.bulletId);
        return out.length === bs.length ? bs : out;
      });

    case "bullet/mergeUp":
      return mapBullets(doc, a.sectionId, a.itemId, (bs) => {
        const i = bs.findIndex((b) => b.id === a.bulletId);
        if (i <= 0) return bs; // the first bullet has nothing above it
        const merged = bs[i - 1].text + bs[i].text;
        if (merged.length > MAX_BULLET_CHARS) return bs; // would overflow the cap: leave both
        const out = bs.slice();
        out[i - 1] = { ...bs[i - 1], text: merged, src: "user" };
        out.splice(i, 1);
        return out;
      });
  }
}

/** Typing into the same field within the coalescing window is one undo step. */
function coalesceKey(a: EditorAction): string | undefined {
  switch (a.type) {
    case "title/edit":
      return "title";
    case "summary/edit":
      return `summary:${a.sectionId}`;
    case "item/field":
      return `${a.itemId}:${a.field}`;
    case "bullet/edit":
      return `bullet:${a.bulletId}`;
    default:
      return undefined;
  }
}

function commit(state: EditorState, next: ResumeDocument, key: string | undefined, at: number): EditorState {
  if (next === state.history.present) return state;
  return {
    ...state,
    history: record(state.history, next, { key, at }),
    rev: state.rev + 1,
    // A new edit after a failed save is a new attempt: the autosave controller will try again.
    phase: state.phase === "error" ? "idle" : state.phase,
    error: state.phase === "error" ? null : state.error,
  };
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "history/undo": {
      const history = undo(state.history);
      return history === state.history ? state : { ...state, history, rev: state.rev + 1 };
    }
    case "history/redo": {
      const history = redo(state.history);
      return history === state.history ? state : { ...state, history, rev: state.rev + 1 };
    }

    case "presentation/set": {
      const templateId = action.templateId ?? state.templateId;
      const theme = action.theme === undefined ? state.theme : action.theme;
      return templateId === state.templateId && theme === state.theme ? state : { ...state, templateId, theme };
    }

    case "presentation/version":
      return state.docVersion === action.version ? state : { ...state, docVersion: action.version };

    case "save/start":
      return state.phase === "conflict" ? state : { ...state, phase: "saving", error: null };

    case "save/ok": {
      // Only what was *sent* is saved: edits made while the request was in flight stay unsaved.
      const savedRev = Math.max(state.savedRev, action.rev);
      return {
        ...state,
        docVersion: action.version,
        savedRev,
        savedAt: action.at,
        phase: "idle",
        error: null,
      };
    }

    case "save/retrying":
      return state.phase === "conflict" ? state : { ...state, phase: "retrying" };

    case "save/conflict":
      return { ...state, phase: "conflict", conflict: { serverVersion: action.serverVersion, doc: action.doc } };

    case "save/failed":
      return { ...state, phase: "error", error: action.message };

    case "conflict/keepMine": {
      if (!state.conflict) return state;
      // My document stays; the next save is sent against the server's version, so it wins.
      return { ...state, docVersion: state.conflict.serverVersion, conflict: null, phase: "idle", error: null };
    }

    case "conflict/takeTheirs": {
      if (!state.conflict) return state;
      const rev = state.rev + 1;
      return {
        ...state,
        history: createHistory(state.conflict.doc),
        docVersion: state.conflict.serverVersion,
        rev,
        savedRev: rev, // identical to the server's copy: nothing left to save
        conflict: null,
        phase: "idle",
        error: null,
      };
    }

    default: {
      const next = applyEdit(state.history.present, action);
      return commit(state, next, coalesceKey(action), action.at);
    }
  }
}

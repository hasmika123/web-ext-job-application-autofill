/**
 * Types for the Resume Builder editor state (DESIGN 7.2): one `useReducer` over the document, an
 * undo history, and the autosave lifecycle. Pure data - no React imports - so the reducer, the
 * history and the autosave controller are testable without a DOM.
 */
import type { ResumeDocument, ResumeListStyle, ResumeMark, ResumeSectionKind, ResumeTheme } from "@kiwiply/ui";
import type { ResumeBuilderConfig } from "@/lib/resume-builder-config.shared";
import type { History } from "./history";

/** The document limits the reducer clamps to: `config.limits` (settings `resume.doc.limits.*`), never literals. */
export type DocLimits = ResumeBuilderConfig["limits"];

/** Where the autosave loop is. `idle` also covers "saved" and "dirty": see `saveStatus`. */
export type SavePhase = "idle" | "saving" | "retrying" | "conflict" | "error";

/** The server's document after somebody else saved first (409 `DOC_VERSION_CONFLICT`). */
export interface Conflict {
  serverVersion: number;
  doc: ResumeDocument;
}

export interface EditorState {
  /** Undo/redo over the document; `history.present` is what the preview shows and autosave saves. */
  history: History<ResumeDocument>;
  /** Presentation: kept beside the document, never in the undo history (template switches are server-side). */
  theme: Partial<ResumeTheme> | null;
  templateId: string;
  /** The version the server has (the `If-Match` of the next save). Mirrored from `SAVE_OK`. */
  docVersion: number;
  /** Bumped on every change to the document (edit, undo, redo, take-theirs). */
  rev: number;
  /** The `rev` the server has confirmed. `rev > savedRev` = unsaved changes. */
  savedRev: number;
  savedAt: number | null;
  phase: SavePhase;
  /** Human-readable reason for `phase: "error"` or the last invalid response. */
  error: string | null;
  /** The validator's `path` of the last 422 (`$.sections[1].items[0].start`); the canvas rings that field. Cleared by the next edit. */
  errorPath: string | null;
  /** What the reducer clamps to (the builder config's limits). */
  limits: DocLimits;
  conflict: Conflict | null;
}

/** What the top bar shows. */
export type SaveStatus = "saved" | "saving" | "retrying" | "conflict" | "error";

/**
 * The string fields of every item kind (DESIGN 3.2) that `item/field` edits. `start` / `end` / `date`
 * hold `YYYY` or `YYYY-MM` (empty = null); `text` is an ACHIEVEMENTS or INTERESTS line.
 */
export type ItemTextField =
  | "title"
  | "org"
  | "location"
  | "start"
  | "end"
  | "school"
  | "degree"
  | "field"
  | "gpa"
  | "url"
  | "date"
  | "name"
  | "level"
  | "group"
  | "text";

/** The single-line contact fields of the header block. */
export type BasicsField = "name" | "headline" | "email" | "phone" | "location";

/** One text the AI apply / sync apply may replace: a bullet, or (no `bulletId`) the item's own `text`. */
export interface TextRef {
  sectionId: string;
  itemId: string;
  bulletId?: string;
}

export type EditorAction =
  /* document edits (each carries `at`, the timestamp the history uses to coalesce typing) */
  | { type: "title/edit"; title: string; at: number }
  /* header block */
  | { type: "basics/field"; field: BasicsField; value: string; at: number }
  | { type: "basics/link.add"; at: number }
  | { type: "basics/link.edit"; index: number; field: "label" | "url"; value: string; at: number }
  | { type: "basics/link.remove"; index: number; at: number }
  /* sections: one history entry each */
  | { type: "section/add"; kind: ResumeSectionKind; sectionId: string; title?: string; at: number }
  | { type: "section/remove"; sectionId: string; at: number }
  | { type: "section/hide"; sectionId: string; hidden: boolean; at: number }
  /** `title: null` (or empty) resets a built-in section to its standard heading. */
  | { type: "section/rename"; sectionId: string; title: string | null; at: number }
  /** Moves the section to index `to` (clamped). The up/down buttons and the Swap Section panel dispatch this. */
  | { type: "section/move"; sectionId: string; to: number; at: number }
  /** `marks`: the text's marks after the edit (the mark toolbar); absent = the reducer re-bases the old ones. */
  | { type: "summary/edit"; sectionId: string; text: string; newItemId: string; marks?: ResumeMark[]; at: number }
  | { type: "item/field"; sectionId: string; itemId: string; field: ItemTextField; value: string; at: number }
  | { type: "item/current"; sectionId: string; itemId: string; current: boolean; at: number }
  /** Kind-aware: the new item's shape follows the section's kind; `bulletId` is used when the kind has bullets. */
  | { type: "item/add"; sectionId: string; itemId: string; bulletId: string; at: number }
  | { type: "item/remove"; sectionId: string; itemId: string; at: number }
  /** A copy right below the original; the ids are client-generated (`newBulletIds[i]` for the i-th bullet). */
  | { type: "item/duplicate"; sectionId: string; itemId: string; newItemId: string; newBulletIds: string[]; at: number }
  | { type: "item/hide"; sectionId: string; itemId: string; hidden: boolean; at: number }
  | { type: "item/move"; sectionId: string; itemId: string; to: number; at: number }
  /* SKILLS groups */
  | { type: "skills/group.edit"; sectionId: string; itemId: string; value: string; at: number }
  | { type: "skills/set"; sectionId: string; itemId: string; skills: string[]; at: number }
  | { type: "skills/add"; sectionId: string; itemId: string; skill: string; at: number }
  | { type: "skills/remove"; sectionId: string; itemId: string; index: number; at: number }
  | { type: "skills/move"; sectionId: string; itemId: string; from: number; to: number; at: number }
  /** The summary's `list` (`itemId` absent = its one item) or an item's `listStyle`; `null` = plain. */
  | { type: "list/set"; sectionId: string; itemId?: string; style: ResumeListStyle | null; at: number }
  /** AI apply / sync apply: replaces one text and clears its marks (so one undo reverts it). */
  | { type: "text/replace"; ref: TextRef; text: string; at: number }
  | { type: "bullet/edit"; sectionId: string; itemId: string; bulletId: string; text: string; marks?: ResumeMark[]; at: number }
  | { type: "bullet/move"; sectionId: string; itemId: string; bulletId: string; to: number; at: number }
  /** Appends an empty bullet to an item (the "Add bullet" button). */
  | { type: "bullet/add"; sectionId: string; itemId: string; bulletId: string; at: number }
  /** Enter inside a bullet: the text before the caret stays, the text after moves to a new bullet. */
  | { type: "bullet/split"; sectionId: string; itemId: string; bulletId: string; before: string; after: string; newBulletId: string; at: number }
  | { type: "bullet/remove"; sectionId: string; itemId: string; bulletId: string; at: number }
  /** Backspace at the start of a non-empty bullet: append it to the previous one. */
  | { type: "bullet/mergeUp"; sectionId: string; itemId: string; bulletId: string; at: number }
  | { type: "history/undo" }
  | { type: "history/redo" }
  /* autosave lifecycle (dispatched by the autosave controller's callbacks) */
  | { type: "save/start" }
  | { type: "save/ok"; rev: number; version: number; at: number }
  | { type: "save/retrying" }
  | { type: "save/conflict"; serverVersion: number; doc: ResumeDocument }
  | { type: "save/failed"; message: string; path?: string }
  | { type: "conflict/keepMine" }
  | { type: "conflict/takeTheirs" }
  /* presentation (R2.4): the template / theme are optimistic and never in the undo history or the autosave PUT */
  | { type: "presentation/set"; templateId?: string; theme?: Partial<ResumeTheme> | null }
  /** A template / theme PATCH was confirmed: adopt the version its ETag carried. */
  | { type: "presentation/version"; version: number };

/**
 * Types for the Resume Builder editor state (DESIGN 7.2): one `useReducer` over the document, an
 * undo history, and the autosave lifecycle. Pure data - no React imports - so the reducer, the
 * history and the autosave controller are testable without a DOM.
 */
import type { ResumeDocument, ResumeTheme } from "@kiwiply/ui";
import type { History } from "./history";

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
  conflict: Conflict | null;
}

/** What the top bar shows. */
export type SaveStatus = "saved" | "saving" | "retrying" | "conflict" | "error";

/** Which field of an experience item a text input edits. */
export type ItemTextField = "title" | "org" | "location" | "start" | "end";

export type EditorAction =
  /* document edits (each carries `at`, the timestamp the history uses to coalesce typing) */
  | { type: "title/edit"; title: string; at: number }
  | { type: "summary/edit"; sectionId: string; text: string; newItemId: string; at: number }
  | { type: "item/field"; sectionId: string; itemId: string; field: ItemTextField; value: string; at: number }
  | { type: "item/current"; sectionId: string; itemId: string; current: boolean; at: number }
  | { type: "item/add"; sectionId: string; itemId: string; bulletId: string; at: number }
  | { type: "item/remove"; sectionId: string; itemId: string; at: number }
  | { type: "bullet/edit"; sectionId: string; itemId: string; bulletId: string; text: string; at: number }
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
  | { type: "save/failed"; message: string }
  | { type: "conflict/keepMine" }
  | { type: "conflict/takeTheirs" };

/**
 * Undo/redo history of immutable snapshots (DESIGN 3.2 / 7.2). Structural sharing comes for free
 * because the reducer builds each next document with spreads, so a snapshot costs a few pointers.
 *
 * - Capped at `HISTORY_CAP` undo steps (oldest dropped first).
 * - Typing is *coalesced*: consecutive records with the same `key` (one per field) that arrive
 *   within `COALESCE_MS` of the previous one overwrite the present instead of adding a step, so
 *   "Ctrl+Z" undoes a burst of typing, not one letter. A pause longer than the window, a different
 *   field, a structural edit (no key), or an undo/redo starts a new step.
 *
 * Pure: the caller supplies the clock (`at`), so tests need no fake timers.
 */
// config-literal-ok: client undo depth and typing-coalesce window are editor-local; DESIGN 15.2 has no key (resume.versions.* is the server version history)
export const HISTORY_CAP = 100;
// config-literal-ok: typing-coalesce window, same reason as above
export const COALESCE_MS = 1000;

export interface History<T> {
  past: T[];
  present: T;
  future: T[];
  /** Coalescing key of the last record, or `null` when the last move was structural/undo/redo. */
  key: string | null;
  /** Timestamp of the last record. */
  at: number;
}

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [], key: null, at: 0 };
}

export interface RecordOptions {
  /** Same key + within the window = coalesce into the previous step. */
  key?: string;
  at?: number;
  cap?: number;
  windowMs?: number;
}

/** Makes `next` the present. Identical (===) snapshots are ignored. Clears the redo stack. */
export function record<T>(h: History<T>, next: T, opts: RecordOptions = {}): History<T> {
  if (Object.is(next, h.present)) return h;
  const at = opts.at ?? 0;
  const key = opts.key ?? null;
  const window = opts.windowMs ?? COALESCE_MS;
  const cap = opts.cap ?? HISTORY_CAP;

  if (key !== null && h.key === key && h.past.length > 0 && at - h.at <= window) {
    // Same burst of typing: overwrite the present, extend the window, keep the redo stack empty.
    return { ...h, present: next, future: [], at };
  }
  const past = [...h.past, h.present];
  if (past.length > cap) past.splice(0, past.length - cap);
  return { past, present: next, future: [], key, at };
}

export const canUndo = (h: History<unknown>) => h.past.length > 0;
export const canRedo = (h: History<unknown>) => h.future.length > 0;

export function undo<T>(h: History<T>): History<T> {
  if (h.past.length === 0) return h;
  const present = h.past[h.past.length - 1];
  return { past: h.past.slice(0, -1), present, future: [h.present, ...h.future], key: null, at: 0 };
}

export function redo<T>(h: History<T>): History<T> {
  if (h.future.length === 0) return h;
  const [present, ...future] = h.future;
  return { past: [...h.past, h.present], present, future, key: null, at: 0 };
}

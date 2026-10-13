/**
 * The autosave controller (DESIGN 3.2 / 7.2; generalised for every page by E2E-U0.0): framework-free so it can be
 * driven by fake timers. `T` is whatever is being saved (the resume document, a settings form, ...).
 *
 * - **Debounce**: a save fires `delayMs` (800) after the *last* change.
 * - **Serialised**: one request in flight; a change made meanwhile is saved right after, never in
 *   parallel (parallel PUTs with the same `If-Match` would 409 each other).
 * - **`If-Match`**: the controller owns the document version. It sends it, and on success adopts the
 *   version the server returned, so the next save is sent against the new ETag.
 * - **409**: autosave *pauses* and reports the server's copy (`onConflict`). The UI asks the user;
 *   `resume({version})` (keep mine) saves against the server's version, `reset(...)` (take theirs)
 *   adopts the server document and drops the pending save.
 * - **Hold** (R2.4): the template / theme PATCHes bump the same `doc_version`, so they run between
 *   `hold()` (no new save starts; an in-flight one finishes) and `release(version)` (adopt the version the
 *   PATCH returned, then save whatever is pending). A content PUT can then never carry a stale `If-Match`.
 * - **Network / 5xx**: retry with backoff (`retryDelaysMs`, the last value repeats) and report
 *   `onRetrying`. A new edit during the wait restarts the normal debounce but keeps the backoff.
 * - **422 / 401 / 413 ...**: not retried by timer (retrying cannot fix them); reported via
 *   `onFailed`, and the *next edit* tries again.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { SaveStatus } from "@kiwiply/ui";

export const AUTOSAVE_DELAY_MS = 800;
/** Backoff ladder after a network / 5xx failure; the last value repeats. */
export const RETRY_DELAYS_MS: readonly number[] = [1000, 2000, 4000, 8000, 15000];

export interface Snapshot<T> {
  doc: T;
  /** Monotonic revision of the document; larger = newer. */
  rev: number;
}

/**
 * What one save attempt reports. The resume document's `SaveResult` is structurally one of these (with `T` = the
 * document), so it can be returned as is.
 */
export type AutosaveResult<T> =
  | { kind: "ok"; version?: number }
  /** Someone else saved first: `doc` is the server's current copy. */
  | { kind: "conflict"; serverVersion: number; doc: T }
  /** 422: the first problem the validator found. Not retried; the next edit retries. */
  | { kind: "invalid"; path: string; message: string }
  /** Transient (network, 5xx, 429): retry with backoff. */
  | { kind: "network" }
  /** Won't succeed by retrying (401/403/404/413/428...). */
  | { kind: "fatal"; message: string };

export interface AutosaveEvents<T> {
  onSaving?(rev: number): void;
  onSaved?(rev: number, version: number): void;
  onRetrying?(attempt: number, delayMs: number): void;
  onConflict?(serverVersion: number, doc: T): void;
  /** `path` is the validator's JSON path on a 422 (the canvas rings that field); absent for other failures. */
  onFailed?(message: string, path?: string): void;
}

export interface AutosaveOptions<T> extends AutosaveEvents<T> {
  /** Performs one save. Must not throw (a thrown error is treated as a network failure). */
  save(req: { doc: T; version: number }): Promise<AutosaveResult<T>>;
  /** The version the server had when the document was loaded. */
  version: number;
  /** The revision the server already has (nothing to save until a snapshot with a larger one). */
  rev?: number;
  delayMs?: number;
  retryDelaysMs?: readonly number[];
}

export interface Autosave<T> {
  /** Report the latest document. Cheap; call on every change. */
  schedule(snapshot: Snapshot<T>): void;
  /** Save now (cancels the debounce) and resolve when nothing is in flight. */
  flush(): Promise<void>;
  /** After "keep mine": continue against `version` (the server's) and save the latest snapshot. */
  resume(version: number): void;
  /** After "take theirs": adopt the server's `version`/`rev` as saved and forget anything pending. */
  reset(version: number, rev: number): void;
  /** Stop starting saves and wait for the one in flight (a PATCH is about to bump the version). Pair with `release`. */
  hold(): Promise<void>;
  /** End a `hold`: adopt `version` (what the PATCH returned) when given, then save what is pending. */
  release(version?: number): void;
  /** Stop all timers; later calls are ignored. */
  dispose(): void;
  readonly version: number;
  readonly savedRev: number;
  readonly paused: boolean;
}

export function createAutosave<T>(opts: AutosaveOptions<T>): Autosave<T> {
  const delayMs = opts.delayMs ?? AUTOSAVE_DELAY_MS;
  const retryDelays = opts.retryDelaysMs?.length ? opts.retryDelaysMs : RETRY_DELAYS_MS;

  let version = opts.version;
  let savedRev = opts.rev ?? 0;
  let latest: Snapshot<T> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let current: Promise<void> | null = null;
  let paused = false;
  let holds = 0;
  let disposed = false;
  let attempt = 0;

  const clear = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const arm = (ms: number) => {
    clear();
    timer = setTimeout(() => {
      timer = null;
      void run();
    }, ms);
  };

  const dirty = () => latest !== null && latest.rev > savedRev;

  /** One save of the latest snapshot; chains itself while edits keep arriving and nothing is armed. */
  function run(): Promise<void> {
    if (disposed || paused || holds > 0 || current || !dirty()) return current ?? Promise.resolve();
    const snap = latest as Snapshot<T>;
    opts.onSaving?.(snap.rev);

    current = (async () => {
      let result: AutosaveResult<T>;
      try {
        result = await opts.save({ doc: snap.doc, version });
      } catch {
        result = { kind: "network" };
      }
      current = null;
      if (disposed) return;

      switch (result.kind) {
        case "ok":
          version = result.version ?? version;
          savedRev = Math.max(savedRev, snap.rev);
          attempt = 0;
          opts.onSaved?.(snap.rev, version);
          // Edits that arrived while this request was in flight: save them next, unless a debounce is already armed.
          if (timer === null && dirty() && !paused && holds === 0) await run();
          return;
        case "conflict":
          paused = true;
          clear();
          opts.onConflict?.(result.serverVersion, result.doc);
          return;
        case "invalid":
          attempt = 0;
          opts.onFailed?.(`${result.path}: ${result.message}`, result.path);
          return;
        case "fatal":
          attempt = 0;
          opts.onFailed?.(result.message);
          return;
        case "network": {
          const delay = retryDelays[Math.min(attempt, retryDelays.length - 1)];
          attempt += 1;
          opts.onRetrying?.(attempt, delay);
          arm(delay);
          return;
        }
      }
    })();
    return current;
  }

  return {
    schedule(snapshot) {
      if (disposed) return;
      latest = snapshot;
      if (paused) return;
      if (!dirty()) {
        clear();
        return;
      }
      arm(delayMs);
    },

    async flush() {
      if (disposed) return;
      clear();
      if (current) await current;
      await run();
    },

    resume(nextVersion) {
      if (disposed) return;
      version = nextVersion;
      paused = false;
      attempt = 0;
      if (dirty()) {
        clear();
        void run();
      }
    },

    reset(nextVersion, rev) {
      if (disposed) return;
      version = nextVersion;
      savedRev = rev;
      paused = false;
      attempt = 0;
      clear();
    },

    async hold() {
      if (disposed) return;
      holds += 1;
      clear();
      if (current) await current;
    },

    release(nextVersion) {
      if (disposed) return;
      holds = Math.max(0, holds - 1);
      if (typeof nextVersion === "number" && !paused) version = nextVersion;
      if (holds === 0 && !paused && dirty()) arm(delayMs);
    },

    dispose() {
      disposed = true;
      clear();
    },

    get version() {
      return version;
    },
    get savedRev() {
      return savedRev;
    },
    get paused() {
      return paused;
    },
  };
}

/* ── useAutosave: the controller as a React hook, for any page ─────────────────────── */

/** The default debounce of the hook (the controller's own default stays 800 ms for the resume editor). */
export const USE_AUTOSAVE_DEBOUNCE_MS = 600;

export interface UseAutosaveOptions<T> {
  /** Quiet time after the last change before a save starts (default 600 ms). */
  debounceMs?: number;
  /** The server's version of what was loaded, sent back as `version` (an `If-Match`). Default 0 = unversioned. */
  version?: number;
  /** Someone else saved first. The hook pauses; resolve with `keepMine()` or `takeTheirs()`. */
  onConflict?(serverVersion: number, server: T): void;
  /** When false nothing is saved (a read-only demo account, a form that is not loaded yet). Default true. */
  enabled?: boolean;
  /** When the server last saved this (ms since epoch), shown as "Saved 5 minutes ago" until the first save here. */
  savedAt?: number | null;
}

export interface UseAutosaveResult {
  /** Feed this to `<SaveStatusChip status=... />`. */
  status: SaveStatus;
  /** When the last save in this session finished (ms since epoch), else `options.savedAt`, else null. */
  savedAt: number | null;
  /** The failure message while `status` is `error`. */
  error: string | null;
  /** Save right now (a failing save is retried immediately). */
  retry(): void;
  /** Save now and resolve when nothing is in flight. */
  flush(): Promise<void>;
  /** After a conflict: send my copy against the server's version. */
  keepMine(): void;
  /** After a conflict: drop my pending change; the caller puts the server's copy into `value`. */
  takeTheirs(): void;
}

/**
 * `useAutosave(value, save, options)`: save `value` shortly after it stops changing, with no Save button
 * (DECISIONS #32). The first value is the loaded baseline and is not saved; every later change (by identity) is
 * debounced, saves are serialised, a network failure retries with backoff, a 409 pauses for the caller to resolve.
 * A pending change is saved when the component unmounts, so leaving the page never loses an edit.
 *
 *   const { status, savedAt, retry } = useAutosave(form, (v) => putSettings(v));
 *   <SaveStatusChip status={status} savedAt={savedAt} now={now} error={null} onRetry={retry} />
 *
 * `save(value, { version })` returns an `AutosaveResult`; an unversioned endpoint just returns `{ kind: "ok" }`.
 */
export function useAutosave<T>(
  value: T,
  save: (value: T, ctx: { version: number }) => Promise<AutosaveResult<T>>,
  options: UseAutosaveOptions<T> = {},
): UseAutosaveResult {
  const { debounceMs = USE_AUTOSAVE_DEBOUNCE_MS, version = 0, enabled = true } = options;
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [savedAt, setSavedAt] = useState<number | null>(options.savedAt ?? null);
  const [error, setError] = useState<string | null>(null);

  const saveRef = useRef(save);
  const conflictRef = useRef(options.onConflict);
  useEffect(() => {
    saveRef.current = save;
    conflictRef.current = options.onConflict;
  });

  const ctrl = useRef<Autosave<T> | null>(null);
  const rev = useRef(0);
  const baseline = useRef(value);
  const serverVersion = useRef<number | null>(null);

  useEffect(() => {
    const c = createAutosave<T>({
      version,
      delayMs: debounceMs,
      save: ({ doc, version: v }) => saveRef.current(doc, { version: v }),
      onSaving: () => {
        setStatus("saving");
        setError(null);
      },
      onSaved: () => {
        setStatus("saved");
        setSavedAt(Date.now());
        setError(null);
      },
      onRetrying: () => setStatus("retrying"),
      onConflict: (v, doc) => {
        serverVersion.current = v;
        setStatus("conflict");
        conflictRef.current?.(v, doc);
      },
      onFailed: (message) => {
        setStatus("error");
        setError(message);
      },
    });
    ctrl.current = c;
    return () => {
      ctrl.current = null;
      // Leaving the page with a change still waiting out its debounce: save it now, then stand down.
      void c.flush().finally(() => c.dispose());
    };
    // The controller is created once per mount; `version` and `debounceMs` are read at creation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (Object.is(value, baseline.current) && rev.current === 0) return;
    rev.current += 1;
    if (!enabled) return;
    ctrl.current?.schedule({ doc: value, rev: rev.current });
  }, [value, enabled]);

  const retry = useCallback(() => {
    void ctrl.current?.flush();
  }, []);
  const flush = useCallback(() => ctrl.current?.flush() ?? Promise.resolve(), []);
  const keepMine = useCallback(() => {
    const c = ctrl.current;
    if (!c) return;
    c.resume(serverVersion.current ?? c.version);
    setStatus("saving");
  }, []);
  const takeTheirs = useCallback(() => {
    const c = ctrl.current;
    if (!c) return;
    c.reset(serverVersion.current ?? c.version, rev.current);
    setStatus("saved");
  }, []);

  return { status, savedAt, error, retry, flush, keepMine, takeTheirs };
}

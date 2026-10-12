/**
 * The autosave controller (DESIGN 3.2 / 7.2): framework-free so it can be driven by fake timers.
 *
 * - **Debounce**: a save fires `delayMs` (800) after the *last* change.
 * - **Serialised**: one request in flight; a change made meanwhile is saved right after, never in
 *   parallel (parallel PUTs with the same `If-Match` would 409 each other).
 * - **`If-Match`**: the controller owns the document version. It sends it, and on success adopts the
 *   version the server returned, so the next save is sent against the new ETag.
 * - **409**: autosave *pauses* and reports the server's copy (`onConflict`). The UI asks the user;
 *   `resume({version})` (keep mine) saves against the server's version, `reset(...)` (take theirs)
 *   adopts the server document and drops the pending save.
 * - **Network / 5xx**: retry with backoff (`retryDelaysMs`, the last value repeats) and report
 *   `onRetrying`. A new edit during the wait restarts the normal debounce but keeps the backoff.
 * - **422 / 401 / 413 ...**: not retried by timer (retrying cannot fix them); reported via
 *   `onFailed`, and the *next edit* tries again.
 */
import type { ResumeDocument } from "@kiwiply/ui";
import type { SaveResult } from "@/lib/resume-doc";

// config-literal-ok: autosave debounce and backoff are fixed by DESIGN 8.5 / 10.15 ("800 ms, as built"); no settings key exists for them in DESIGN 15.2
export const AUTOSAVE_DELAY_MS = 800;
// config-literal-ok: backoff ladder, same reason as above
export const RETRY_DELAYS_MS: readonly number[] = [1000, 2000, 4000, 8000, 15000];

export interface Snapshot {
  doc: ResumeDocument;
  /** Monotonic revision of the document; larger = newer. */
  rev: number;
}

export interface AutosaveEvents {
  onSaving?(rev: number): void;
  onSaved?(rev: number, version: number): void;
  onRetrying?(attempt: number, delayMs: number): void;
  onConflict?(serverVersion: number, doc: ResumeDocument): void;
  onFailed?(message: string): void;
}

export interface AutosaveOptions extends AutosaveEvents {
  /** Performs one save. Must not throw (a thrown error is treated as a network failure). */
  save(req: { doc: ResumeDocument; version: number }): Promise<SaveResult>;
  /** The version the server had when the document was loaded. */
  version: number;
  /** The revision the server already has (nothing to save until a snapshot with a larger one). */
  rev?: number;
  delayMs?: number;
  retryDelaysMs?: readonly number[];
}

export interface Autosave {
  /** Report the latest document. Cheap; call on every change. */
  schedule(snapshot: Snapshot): void;
  /** Save now (cancels the debounce) and resolve when nothing is in flight. */
  flush(): Promise<void>;
  /** After "keep mine": continue against `version` (the server's) and save the latest snapshot. */
  resume(version: number): void;
  /** After "take theirs": adopt the server's `version`/`rev` as saved and forget anything pending. */
  reset(version: number, rev: number): void;
  /** Stop all timers; later calls are ignored. */
  dispose(): void;
  readonly version: number;
  readonly savedRev: number;
  readonly paused: boolean;
}

export function createAutosave(opts: AutosaveOptions): Autosave {
  const delayMs = opts.delayMs ?? AUTOSAVE_DELAY_MS;
  const retryDelays = opts.retryDelaysMs?.length ? opts.retryDelaysMs : RETRY_DELAYS_MS;

  let version = opts.version;
  let savedRev = opts.rev ?? 0;
  let latest: Snapshot | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let current: Promise<void> | null = null;
  let paused = false;
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
    if (disposed || paused || current || !dirty()) return current ?? Promise.resolve();
    const snap = latest as Snapshot;
    opts.onSaving?.(snap.rev);

    current = (async () => {
      let result: SaveResult;
      try {
        result = await opts.save({ doc: snap.doc, version });
      } catch {
        result = { kind: "network" };
      }
      current = null;
      if (disposed) return;

      switch (result.kind) {
        case "ok":
          version = result.version;
          savedRev = Math.max(savedRev, snap.rev);
          attempt = 0;
          opts.onSaved?.(snap.rev, version);
          // Edits that arrived while this request was in flight: save them next, unless a debounce is already armed.
          if (timer === null && dirty() && !paused) await run();
          return;
        case "conflict":
          paused = true;
          clear();
          opts.onConflict?.(result.serverVersion, result.doc);
          return;
        case "invalid":
          attempt = 0;
          opts.onFailed?.(`${result.path}: ${result.message}`);
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

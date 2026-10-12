/**
 * The presentation sync (R2.4, DESIGN 4 + 6.5): template switches and Customize Template changes are
 * optimistic in the editor and saved by `PATCH …/doc/template` / `…/doc/theme`, which bump the SAME
 * `doc_version` the autosave's `If-Match` carries. Framework-free so fake timers can drive it.
 *
 * - **Serialised**: one PATCH in flight, in the order asked (a template switch and the theme defaults it
 *   brings never overtake each other).
 * - **Theme is debounced** (`THEME_DELAY_MS`, 500 ms: DESIGN 4) and coalesced: a run of swatch clicks sends
 *   the last theme once.
 * - **Around every PATCH the autosave is held** (`hold` / `release(version)`), so a content PUT can never be
 *   sent with the version this PATCH is about to make stale; `release` adopts the returned ETag.
 * - **Rollback**: a refused / failed PATCH reports `onTemplateFailed` / `onThemeFailed` with the last
 *   server-confirmed value to put back.
 */
import type { ResumeTheme } from "@kiwiply/ui";
import type { PatchResult } from "@/lib/resume-doc";

// config-literal-ok: DESIGN 4 fixes the theme PATCH debounce at 500 ms; no settings key exists for it in DESIGN 15.2
export const THEME_DELAY_MS = 500;

type Theme = Partial<ResumeTheme>;

export interface PresentationOptions {
  patchTemplate(templateId: string): Promise<PatchResult>;
  patchTheme(theme: Theme): Promise<PatchResult>;
  /** The autosave's `hold` / `release` (see autosave.ts). */
  hold(): Promise<void>;
  release(version?: number): void;
  /** The server-side presentation at load: what a rollback returns to. */
  templateId: string;
  theme: Theme | null;
  /** A PATCH was confirmed with this ETag version. */
  onVersion?(version: number): void;
  onTemplateFailed?(confirmed: string, message: string): void;
  onThemeFailed?(confirmed: Theme | null, message: string): void;
  delayMs?: number;
}

export interface PresentationSync {
  /** Save a template switch now (queued behind anything in flight). */
  setTemplate(templateId: string): void;
  /** Save this theme 500 ms after the last call. */
  setTheme(theme: Theme): void;
  /** Send a pending theme now (leaving the page); resolves when the queue is empty. */
  flush(): Promise<void>;
  dispose(): void;
  /** Something is waiting or in flight. */
  readonly busy: boolean;
}

export function createPresentationSync(opts: PresentationOptions): PresentationSync {
  const delayMs = opts.delayMs ?? THEME_DELAY_MS;
  let confirmedTemplate = opts.templateId;
  let confirmedTheme: Theme | null = opts.theme;
  let pendingTheme: Theme | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let tail: Promise<void> = Promise.resolve();
  let queued = 0;
  let disposed = false;

  /** Run `task` after everything already queued; the autosave is held around it. */
  const enqueue = (task: () => Promise<number | undefined>) => {
    queued += 1;
    tail = tail.then(async () => {
      let version: number | undefined;
      let held = false;
      try {
        if (!disposed) {
          await opts.hold();
          held = true;
          version = await task();
        }
      } finally {
        if (held) opts.release(version);
        queued -= 1;
      }
    });
  };

  const fireTheme = () => {
    timer = null;
    const theme = pendingTheme;
    pendingTheme = null;
    if (!theme || disposed) return;
    enqueue(async () => {
      const r = await opts.patchTheme(theme);
      if (r.kind === "ok") {
        confirmedTheme = theme;
        opts.onVersion?.(r.version);
        return r.version;
      }
      opts.onThemeFailed?.(confirmedTheme, r.message);
      return undefined;
    });
  };

  return {
    setTemplate(templateId) {
      if (disposed) return;
      enqueue(async () => {
        const r = await opts.patchTemplate(templateId);
        if (r.kind === "ok") {
          confirmedTemplate = templateId;
          opts.onVersion?.(r.version);
          return r.version;
        }
        opts.onTemplateFailed?.(confirmedTemplate, r.message);
        return undefined;
      });
    },

    setTheme(theme) {
      if (disposed) return;
      pendingTheme = theme;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(fireTheme, delayMs);
    },

    async flush() {
      if (timer !== null) {
        clearTimeout(timer);
        fireTheme();
      }
      await tail;
    },

    dispose() {
      disposed = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      pendingTheme = null;
    },

    get busy() {
      return timer !== null || queued > 0;
    },
  };
}

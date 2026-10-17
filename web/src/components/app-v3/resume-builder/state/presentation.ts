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
  /** `theme` = store exactly this theme with the template (undo / redo of a switch); absent = the server applies the template's defaults. */
  patchTemplate(templateId: string, theme?: Theme): Promise<PatchResult>;
  patchTheme(theme: Theme): Promise<PatchResult>;
  /** The autosave's `hold` / `release` (see autosave.ts). */
  hold(): Promise<void>;
  release(version?: number): void;
  /** The server-side presentation at load: what a rollback returns to. */
  templateId: string;
  theme: Theme | null;
  /** A PATCH was confirmed with this ETag version. */
  onVersion?(version: number): void;
  /**
   * A template PATCH was confirmed and the server stored this theme (it applies the new template's defaults to
   * the untouched keys, R3.4). Only reported when nothing else is waiting behind it and no theme edit is pending,
   * so a late answer never overwrites a newer choice.
   */
  onThemeAdopted?(theme: Theme): void;
  /**
   * `failed` = the template id whose PATCH was refused (its undo entry, if any, is dropped). `confirmedTheme` is the last
   * server-confirmed theme: the optimistic switch applied the new template's defaults to it, and going back must undo that too.
   */
  onTemplateFailed?(confirmed: string, message: string, failed: string, confirmedTheme: Theme | null): void;
  onThemeFailed?(confirmed: Theme | null, message: string): void;
  delayMs?: number;
}

export interface PresentationSync {
  /**
   * Save a template switch now (queued behind anything in flight). With `theme` the server stores that exact
   * theme (undo / redo) and a pending theme edit is dropped as superseded; without it the server applies the
   * new template's defaults to the untouched keys.
   */
  setTemplate(templateId: string, theme?: Theme): void;
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
    setTemplate(templateId, theme) {
      if (disposed) return;
      if (theme) {
        // The exact theme is sent with the template: an older pending edit would only overwrite it.
        if (timer !== null) clearTimeout(timer);
        timer = null;
        pendingTheme = null;
      }
      enqueue(async () => {
        const r = await opts.patchTemplate(templateId, theme);
        if (r.kind === "ok") {
          confirmedTemplate = templateId;
          if (r.theme) confirmedTheme = r.theme;
          else if (theme) confirmedTheme = theme;
          opts.onVersion?.(r.version);
          // queued includes this task: nothing else is waiting and the user has not touched a theme control since.
          if (r.theme && queued === 1 && pendingTheme === null) opts.onThemeAdopted?.(r.theme);
          return r.version;
        }
        opts.onTemplateFailed?.(confirmedTemplate, r.message, templateId, confirmedTheme);
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

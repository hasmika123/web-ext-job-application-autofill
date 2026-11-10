/**
 * The Resume Builder's UI beats (Notion-style autosave feedback, DECISIONS #32). There is no UI-timing group in the
 * builder config, so they live here, in one place, as plain constants. The tick's own time on screen is
 * `SAVED_TICK_MS` in `@kiwiply/ui` (1 s).
 */

/** How long an "Undo" toast stays (visibility, primary, recruiter sharing, archive, template switch). */
// config-literal-ok: UI timing
export const UNDO_TOAST_MS = 8000;

/** How long the "Version N saved" toast of Ctrl/Cmd+S stays. */
// config-literal-ok: UI timing
export const VERSION_TOAST_MS = 6000;

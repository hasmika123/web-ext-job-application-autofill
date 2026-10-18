/**
 * The clock the editor stamps onto actions (`at`), which the undo history uses to coalesce typing.
 * Event handlers call it; keeping it behind a function also keeps the React purity lint from
 * mistaking a handler that is invoked from an inline callback for render-time code.
 */
export const nowMs = (): number => Date.now();

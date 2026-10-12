/**
 * The editor skin of the canvas (DESIGN 10.5): text that reads like the document and turns into a
 * field on hover and focus. One class string so every inline control on the canvas looks the same,
 * and an `aria-invalid` field (the 422 ring, `state/paths.ts`) always shows red.
 */
export const GHOST =
  "w-full min-w-0 rounded-md border border-transparent bg-transparent px-1.5 py-1 font-body text-ink outline-none " +
  "placeholder:text-muted hover:border-line focus:border-accent focus:bg-paper focus:shadow-[0_0_0_3px_var(--color-accent-soft)] " +
  "aria-[invalid=true]:border-danger aria-[invalid=true]:bg-paper aria-[invalid=true]:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-danger)_25%,transparent)] " +
  "disabled:cursor-not-allowed disabled:opacity-60 max-sm:min-h-11";

/** The small outlined "+ Add ..." pill of the section header and the placeholder row. */
export const PILL_BUTTON =
  "inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-v2-line bg-paper px-3 text-[13px] font-semibold text-v2-green-ink " +
  "transition-colors hover:bg-v2-green-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " +
  "disabled:pointer-events-none disabled:opacity-50 max-sm:min-h-11";

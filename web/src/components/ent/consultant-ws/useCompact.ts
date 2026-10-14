"use client";

import { useMediaQuery } from "@kiwiply/ui";

/**
 * useCompact - true on a phone, a tablet in portrait and a touch tablet up to 1366 px (doc 54 s4 / doc 60 s7): the screens where a
 * 520 px slide-over would leave no usable list behind it, so a job's details open as their own screen instead. Sibling of `useNarrow`
 * (767 px, dialogs vs bottom sheets); this one only chooses between a drawer and a full details screen. The server snapshot is
 * false (desktop); a compact client corrects itself right after hydration.
 *
 * Kept local to the consultant workspace for now (a one-line move to `packages/ui/src/enterprise` once more than one workspace needs it).
 */
// config-literal-ok: layout geometry (Tailwind `lg` and the touch-tablet ceiling), not a tunable
export const COMPACT_QUERY = "(max-width:1023px), (pointer: coarse) and (max-width:1366px)";

export function useCompact(): boolean {
  return useMediaQuery(COMPACT_QUERY, false);
}

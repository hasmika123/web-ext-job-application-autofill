"use client";

import { useMediaQuery } from "@kiwiply/ui";

// config-literal-ok: Tailwind's `md` breakpoint (768 px) in media-query form; layout geometry, not a tunable
const NARROW_QUERY = "(max-width: 767px)";
// config-literal-ok: Tailwind's `xl` breakpoint (1280 px) in media-query form; wide tables need this much room
const WIDE_QUERY = "(min-width: 1280px)";

/**
 * True on a phone (below `md`): a Dialog becomes a BottomSheet, a table becomes cards, a drawer goes full screen.
 * The server snapshot is `false` (desktop), so a phone corrects itself right after hydration.
 */
export function useNarrow(): boolean {
  return useMediaQuery(NARROW_QUERY, false);
}

/** True from `xl` up: wide tables show as real tables; below, as cards with a sheet editor. */
export function useWide(): boolean {
  return useMediaQuery(WIDE_QUERY, true);
}

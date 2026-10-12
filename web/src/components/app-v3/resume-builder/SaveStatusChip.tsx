"use client";

/**
 * The save chip moved to `@kiwiply/ui` (E2E-U0.0) so every page can show the same one. The Resume Builder keeps
 * importing it from here, unchanged, until R6 re-points the imports.
 */
export { SaveStatusChip as default, savedAgo, statusLabel, chipTone, OFFLINE_LABEL } from "@kiwiply/ui";
export type { ChipTone } from "@kiwiply/ui";

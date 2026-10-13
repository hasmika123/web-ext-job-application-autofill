import { RESUME_DEFAULT_SECTION_TITLES } from "@kiwiply/ui";
import type { ResumeSection } from "@kiwiply/ui";

/** The heading a section shows: its own title, else the kind's default ("Experience", ...). */
export function sectionTitle(s: ResumeSection): string {
  return s.title?.trim() || RESUME_DEFAULT_SECTION_TITLES[s.kind];
}

/** The DOM id of a section's block on the canvas (`#rb-<sectionId>`); section tabs scroll to it. */
export const blockId = (sectionId: string): string => `rb-${sectionId}`;

/** The personal-info block (the header; not a section). */
export const BASICS_ID = "basics";
export const BASICS_BLOCK_ID = "rb-basics";

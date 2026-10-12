/**
 * Copy and option lists for the "My Resumes" board (design/resume-builder-v3/user-my-resumes.webp).
 * One file so the copy can change without touching a component.
 */

/** "Quick Tips" card: the board's four lines. */
export const QUICK_TIPS: readonly string[] = [
  "Create different resumes for different roles",
  "Tailor your resume for each job application",
  "Use AI suggestions to improve your content",
  "Keep one primary resume for quick applications",
];

export const HERO_TITLE = "My Resumes";
export const HERO_SUBTITLE = "Create, manage, and customize resumes for different opportunities.";
/** The handwritten note beside the hero art (decorative). */
export const HERO_NOTE = "One resume for every opportunity";

export type TabId = "all" | "active" | "drafts" | "archived";
export const TAB_LABELS: Record<TabId, string> = {
  all: "All Resumes",
  active: "Active",
  drafts: "Drafts",
  archived: "Archived",
};
export const TAB_ORDER: readonly TabId[] = ["all", "active", "drafts", "archived"];

/** The extra "Shared with me" tab (R3.11). It lists other people's resumes, so it is not a `TabId` of the filters. */
export const SHARED_TAB = "shared";
export const SHARED_TAB_LABEL = "Shared with me";
export const SHARED_EMPTY = {
  title: "Nothing shared with you",
  body: "When someone shares a resume with you, it shows up here to read.",
};

/** The "All Status" filter. `Primary` filters on the primary flag; the others on the card status. */
export const STATUS_FILTERS = ["All Status", "Primary", "Active", "Draft", "Archived"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

export const SORTS = ["Last Modified", "Date Created", "Name (A-Z)"] as const;
export type SortKey = (typeof SORTS)[number];
export const DEFAULT_SORT: SortKey = "Last Modified";

export type ViewMode = "grid" | "list";
export const VIEW_STORAGE_KEY = "kiwiply.resumes.view";

/** What each tab says when it has nothing in it. */
export const TAB_EMPTY: Record<TabId, { title: string; body: string }> = {
  all: { title: "No resumes yet", body: "A new resume starts from your profile, so most of it is already written." },
  active: { title: "No active resumes", body: "Resumes you are using for applications show up here." },
  drafts: { title: "No drafts yet", body: "Resumes you are still working on will show up here." },
  archived: { title: "Nothing archived", body: "Archived resumes are kept here, out of your way." },
};

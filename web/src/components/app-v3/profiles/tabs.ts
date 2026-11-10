/**
 * The My Profiles tabs and how `?tab=` maps to them. A plain module (no "use client") so the server
 * page can read the query string and the client page can share the same list.
 */
export type ProfileTabKey = "overview" | "personal" | "work" | "education" | "skills" | "projects" | "more" | "preferences";

export const PROFILE_TABS: { id: ProfileTabKey; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "personal", label: "Personal Info" },
  { id: "work", label: "Work Experience" },
  { id: "education", label: "Education" },
  { id: "skills", label: "Skills" },
  { id: "projects", label: "Projects" },
  { id: "more", label: "More" },
  { id: "preferences", label: "Preferences" },
];

const TAB_IDS = new Set<string>(PROFILE_TABS.map((t) => t.id));

/** `?tab=` value to a tab; anything unknown (or missing) opens the Overview. */
export function tabFromParam(value: string | null | undefined): ProfileTabKey {
  return value && TAB_IDS.has(value) ? (value as ProfileTabKey) : "overview";
}

/** The tab a completeness `nextAction.href` (`/profiles?tab=work`) points at. */
export function tabFromHref(href: string | null | undefined): ProfileTabKey {
  if (!href) return "overview";
  const q = href.split("?")[1] ?? "";
  return tabFromParam(new URLSearchParams(q).get("tab"));
}

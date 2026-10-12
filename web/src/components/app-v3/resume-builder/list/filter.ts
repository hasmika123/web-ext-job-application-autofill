/**
 * Pure tab / filter / sort / search logic for the "My Resumes" board. It works on `ResumeCardModel`s
 * only, so it does not change when the adapter's mapping does.
 */
import type { ResumeCardModel } from "./adapter";
import type { SortKey, StatusFilter, TabId } from "./constants";

export interface ListQuery {
  tab: TabId;
  status: StatusFilter;
  sort: SortKey;
  /** Free text, matched against the name, target and tags. */
  query: string;
}

export const tabMatches = (m: ResumeCardModel, tab: TabId): boolean =>
  tab === "all" ||
  (tab === "active" && m.status === "Active") ||
  (tab === "drafts" && m.status === "Draft") ||
  (tab === "archived" && m.status === "Archived");

/** Counts for the tabs (always over the whole list, not the current filter). */
export function tabCounts(models: readonly ResumeCardModel[]): Record<TabId, number> {
  return {
    all: models.length,
    active: models.filter((m) => tabMatches(m, "active")).length,
    drafts: models.filter((m) => tabMatches(m, "drafts")).length,
    archived: models.filter((m) => tabMatches(m, "archived")).length,
  };
}

const statusMatches = (m: ResumeCardModel, s: StatusFilter): boolean =>
  s === "All Status" || (s === "Primary" ? m.isPrimary : m.status === s);

/** Newest first; a missing date sorts last. */
const byDateDesc = (a: string | null, b: string | null): number => {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b.localeCompare(a);
};

const byName = (a: ResumeCardModel, b: ResumeCardModel) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

export function applyQuery(models: readonly ResumeCardModel[], q: ListQuery): ResumeCardModel[] {
  const needle = q.query.trim().toLowerCase();
  const out = models.filter(
    (m) =>
      tabMatches(m, q.tab) &&
      statusMatches(m, q.status) &&
      (needle === "" ||
        m.name.toLowerCase().includes(needle) ||
        (m.target ?? "").toLowerCase().includes(needle) ||
        m.tags.some((t) => t.toLowerCase().includes(needle))),
  );
  const cmp: Record<SortKey, (a: ResumeCardModel, b: ResumeCardModel) => number> = {
    "Last Modified": (a, b) => byDateDesc(a.modifiedAt, b.modifiedAt) || byName(a, b),
    "Date Created": (a, b) => byDateDesc(a.createdAt, b.createdAt) || byName(a, b),
    "Name (A-Z)": byName,
  };
  return out.sort(cmp[q.sort]);
}

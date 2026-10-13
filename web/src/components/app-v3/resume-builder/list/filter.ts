/**
 * Pure tab / filter / sort / search logic for the "My Resumes" board. It works on `ResumeCardModel`s
 * only, so it does not change when the adapter's mapping does.
 */
import { hasTemplate, getTemplate } from "@kiwiply/ui";
import type { ResumeCardModel } from "./adapter";
import type { SortKey, StatusFilter, TabId, TypeFilter } from "./constants";

export interface ListQuery {
  tab: TabId;
  status: StatusFilter;
  /** The Type group of the status menu; `All Types` filters nothing. */
  type?: TypeFilter;
  sort: SortKey;
  /** Free text, matched against the name, target and tags. */
  query: string;
}

/** A template's display name, or its id when the registry does not know it. */
export const templateName = (id: string): string => (hasTemplate(id) ? getTemplate(id).meta.name : id);

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

const typeMatches = (m: ResumeCardModel, t: TypeFilter | undefined): boolean => t === undefined || t === "All Types" || m.type === t;

/** Highest first; a resume with no score sorts last. */
const byScoreDesc = (a: number | null, b: number | null): number => {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b - a;
};

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
      typeMatches(m, q.type) &&
      (needle === "" ||
        m.name.toLowerCase().includes(needle) ||
        (m.target ?? "").toLowerCase().includes(needle) ||
        (m.templateId ? templateName(m.templateId).toLowerCase().includes(needle) : false) ||
        m.tags.some((t) => t.toLowerCase().includes(needle))),
  );
  const cmp: Record<SortKey, (a: ResumeCardModel, b: ResumeCardModel) => number> = {
    "Last Modified": (a, b) => byDateDesc(a.modifiedAt, b.modifiedAt) || byName(a, b),
    "Date Created": (a, b) => byDateDesc(a.createdAt, b.createdAt) || byName(a, b),
    "Name (A-Z)": byName,
    Score: (a, b) => byScoreDesc(a.score, b.score) || byDateDesc(a.modifiedAt, b.modifiedAt) || byName(a, b),
    "Last Exported": (a, b) => byDateDesc(a.exportedAt, b.exportedAt) || byDateDesc(a.modifiedAt, b.modifiedAt) || byName(a, b),
  };
  return out.sort(cmp[q.sort]);
}

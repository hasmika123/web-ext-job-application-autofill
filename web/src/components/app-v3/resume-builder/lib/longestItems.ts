/**
 * The longest items of a document (DESIGN 10.8): when the fit ladder ends and the resume is still over
 * its page limit, the Print layout banner names the three items that take the most room, so the user
 * knows what to shorten or hide. "Longest" = characters of text the item draws; only what is shown
 * counts (hidden sections and items take no room).
 */
import type { ResumeDocument } from "@kiwiply/ui";
import { sectionTitle } from "../sectionTitle";

/** How many items the banner names (DESIGN 10.8). */
export const LONGEST_COUNT = 3;

export interface LongestItem {
  sectionId: string;
  itemId: string;
  /** The section's heading as the editor shows it. */
  section: string;
  /** A short name for the item: "Software Engineer · Acme", "Languages", the first words of a summary. */
  label: string;
  /** Characters of text the item draws. */
  chars: number;
}

type Loose = Record<string, unknown>;

const FIELDS = ["title", "org", "school", "degree", "field", "location", "gpa", "group", "name", "level", "text", "url"] as const;
const LABEL_MAX = 48;

const text = (o: Loose, key: string): string => (typeof o[key] === "string" ? (o[key] as string).trim() : "");

function itemChars(item: Loose): number {
  let n = 0;
  for (const f of FIELDS) n += text(item, f).length;
  if (Array.isArray(item.bullets)) for (const b of item.bullets) if (b && typeof b === "object") n += text(b as Loose, "text").length;
  if (Array.isArray(item.skills)) for (const s of item.skills) if (typeof s === "string") n += s.trim().length;
  return n;
}

function itemLabel(item: Loose): string {
  const head = text(item, "title") || text(item, "degree") || text(item, "group") || text(item, "name");
  const where = text(item, "org") || text(item, "school");
  const joined = [head, where].filter(Boolean).join(" · ") || text(item, "text");
  if (!joined) return "Untitled item";
  return joined.length > LABEL_MAX ? `${joined.slice(0, LABEL_MAX - 1).trimEnd()}…` : joined;
}

/** The `count` longest shown items, longest first; ties keep document order. */
export function longestItems(doc: ResumeDocument, count: number = LONGEST_COUNT): LongestItem[] {
  const all: Array<LongestItem & { order: number }> = [];
  let order = 0;
  for (const section of doc.sections) {
    if (section.hidden) continue;
    for (const item of section.items as unknown as Loose[]) {
      if (item.hidden === true) continue;
      all.push({
        sectionId: section.id,
        itemId: String(item.id ?? ""),
        section: sectionTitle(section),
        label: itemLabel(item),
        chars: itemChars(item),
        order: order++,
      });
    }
  }
  return all
    .sort((a, b) => b.chars - a.chars || a.order - b.order)
    .slice(0, count)
    .map((entry) => ({ sectionId: entry.sectionId, itemId: entry.itemId, section: entry.section, label: entry.label, chars: entry.chars }));
}

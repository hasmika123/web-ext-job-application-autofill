"use client";

import { useMemo, useState } from "react";
import type { Dispatch } from "react";
import {
  ChevronDownIcon,
  DragHandle,
  InfoIcon,
  Menu,
  MoreVerticalIcon,
  Tooltip,
  UserIcon,
  cn,
  headingFor,
  iconButtonClass,
} from "@kiwiply/ui";
import type { MenuEntry, ResumeDocument, ResumeSection, TemplateCapabilities } from "@kiwiply/ui";
import { SortableGroup, SortableRoot, SortableRow, type SortableMove } from "@/components/common/SortableList";
import { track } from "@/lib/analytics";
import { itemHeading, type AnyItem } from "../ItemControls";
import { KIND_META } from "../sectionKinds";
import { nowMs } from "../state/clock";
import type { EditorAction } from "../state/types";

/** The group key of a section's items in the one `SortableRoot`. */
const SECTIONS = "sections";
const itemsGroup = (sectionId: string): string => `items:${sectionId}`;

/** Sections the board shows open at first (the two timelines); the rest start collapsed. */
const OPEN_AT_FIRST: ReadonlySet<ResumeSection["kind"]> = new Set(["EXPERIENCE", "EDUCATION"]);

/** Whether the template draws this section at all (`caps.sections`, and `caps.custom` for Custom). */
function drawnByTemplate(section: ResumeSection, caps: TemplateCapabilities): boolean {
  return section.kind === "CUSTOM" ? caps.custom !== "none" : caps.sections.includes(section.kind);
}

/** "Moved Work Experience up, position 2 of 9." for the status line (buttons have no drag announcements). */
const movedLine = (name: string, from: number, to: number, count: number): string =>
  `Moved ${name} ${to < from ? "up" : "down"}, position ${to + 1} of ${count}.`;

export interface SwapSectionPanelProps {
  doc: ResumeDocument;
  caps: TemplateCapabilities;
  dispatch: Dispatch<EditorAction>;
}

/**
 * Swap Section (board 2, DESIGN 10.3.3): every section as a row with a drag handle, its kind icon, its
 * title and a chevron that opens its items; Personal Information is pinned first with a disabled handle
 * (the header is not a section). One `SortableRoot`: the sections are one group, each open section's items
 * another, so an item never leaves its section. Drop (or Move up / Move down in the row's menu) dispatches
 * `section/move` / `item/move`, each one history entry, and the canvas follows.
 */
export default function SwapSectionPanel({ doc, caps, dispatch }: SwapSectionPanelProps) {
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(doc.sections.filter((s) => OPEN_AT_FIRST.has(s.kind) && s.items.length > 0).map((s) => s.id)));
  const [status, setStatus] = useState("");

  const toggle = (id: string) =>
    setOpen((cur) => {
      const next = new Set(cur);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const groups = useMemo(() => {
    const g: Record<string, string[]> = { [SECTIONS]: doc.sections.map((s) => s.id) };
    for (const s of doc.sections) g[itemsGroup(s.id)] = (s.items as AnyItem[]).map((it) => it.id);
    return g;
  }, [doc.sections]);

  const names = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of doc.sections) {
      m.set(s.id, headingFor(s, s.kind, caps));
      (s.items as AnyItem[]).forEach((it, i) => m.set(it.id, itemHeading(s, it, i)));
    }
    return m;
  }, [doc.sections, caps]);

  const moveSection = (id: string, to: number, via: "drag" | "buttons") => {
    dispatch({ type: "section/move", sectionId: id, to, at: nowMs() });
    track("resume_section_reordered", { via });
  };
  const moveItem = (section: ResumeSection, itemId: string, to: number, via: "drag" | "buttons") => {
    dispatch({ type: "item/move", sectionId: section.id, itemId, to, at: nowMs() });
    track("resume_item_reordered", { kind: section.kind.toLowerCase(), via });
  };

  const onDrop = ({ group, id, to }: SortableMove) => {
    if (group === SECTIONS) return moveSection(id, to, "drag");
    const section = doc.sections.find((s) => itemsGroup(s.id) === group);
    if (section) moveItem(section, id, to, "drag");
  };

  const sectionMenu = (s: ResumeSection, i: number): MenuEntry[] => {
    const count = doc.sections.length;
    const go = (to: number) => {
      moveSection(s.id, to, "buttons");
      setStatus(movedLine(names.get(s.id) ?? "Section", i, to, count));
    };
    return [
      { label: "Move up", onSelect: () => go(i - 1), disabled: i === 0 },
      { label: "Move down", onSelect: () => go(i + 1), disabled: i >= count - 1 },
    ];
  };
  const itemMenu = (s: ResumeSection, itemId: string, i: number, count: number): MenuEntry[] => {
    const go = (to: number) => {
      moveItem(s, itemId, to, "buttons");
      setStatus(movedLine(names.get(itemId) ?? "Item", i, to, count));
    };
    return [
      { label: "Move up", onSelect: () => go(i - 1), disabled: i === 0 },
      { label: "Move down", onSelect: () => go(i + 1), disabled: i >= count - 1 },
    ];
  };

  return (
    <div data-panel="swap" className="flex flex-col gap-3">
      <p className="text-[12.5px] leading-snug text-muted">Rearrange your resume structure. Changes update in the resume inline.</p>

      <SortableRoot groups={groups} label={(id) => names.get(id) ?? "row"} onMove={onDrop}>
        <ul aria-label="Sections" className="flex flex-col gap-2">
          {/* Personal Information is the header, not a section: it is always first and cannot be moved. */}
          <li data-pinned className="flex min-h-12 items-center gap-1.5 rounded-xl bg-paper-2/70 px-2 py-1.5">
            <Tooltip content="Your header always comes first" side="right">
              <DragHandle disabled aria-label="Personal Information always comes first" />
            </Tooltip>
            <UserIcon className="h-[18px] w-[18px] flex-none text-v2-green-ink" />
            <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink">Personal Information</span>
          </li>

          <SortableGroup group={SECTIONS} ids={groups[SECTIONS]}>
            {doc.sections.map((section, i) => {
              const Icon = KIND_META[section.kind].icon;
              const title = names.get(section.id) ?? "";
              const drawn = drawnByTemplate(section, caps);
              const items = section.items as AnyItem[];
              const expandable = section.kind !== "SUMMARY" && items.length > 0;
              const expanded = expandable && open.has(section.id);
              return (
                <SortableRow key={section.id} as="li" id={section.id} group={SECTIONS} disabled={!drawn} className="list-none">
                  {(row) => (
                    <div
                      data-section={section.id}
                      data-greyed={drawn ? undefined : "true"}
                      className={cn("rounded-xl bg-paper-2/70", row.isDragging && "bg-paper ring-1 ring-v2-line", !drawn && "opacity-60")}
                    >
                      <div className="flex min-h-12 items-center gap-1.5 px-2 py-1.5">
                        <DragHandle
                          aria-label={`Drag ${title} to reorder`}
                          title={drawn ? undefined : "Hidden in this template"}
                          {...row.handleProps}
                          disabled={!drawn}
                        />
                        <Icon className="h-[18px] w-[18px] flex-none text-v2-green-ink" />
                        <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink">{title}</span>
                        {!drawn && <span className="flex-none rounded bg-paper px-1.5 py-0.5 text-[10.5px] font-semibold text-ink-soft">Hidden in this template</span>}
                        {drawn && section.hidden && (
                          <span className="flex-none rounded bg-paper px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-ink-soft">Hidden</span>
                        )}
                        <Menu
                          items={sectionMenu(section, i)}
                          trigger={
                            <button type="button" aria-label={`More actions for ${title}`} title="More" className={cn(iconButtonClass, "max-sm:h-11 max-sm:w-11")}>
                              <MoreVerticalIcon className="h-4 w-4" />
                            </button>
                          }
                        />
                        {expandable ? (
                          <button
                            type="button"
                            aria-label={`${expanded ? "Hide" : "Show"} ${title} entries`}
                            aria-expanded={expanded}
                            onClick={() => toggle(section.id)}
                            className={cn(iconButtonClass, "max-sm:h-11 max-sm:w-11")}
                          >
                            <ChevronDownIcon className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")} />
                          </button>
                        ) : (
                          <span aria-hidden className="h-8 w-8 flex-none max-sm:h-11 max-sm:w-11" />
                        )}
                      </div>

                      {expanded && (
                        <SortableGroup group={itemsGroup(section.id)} ids={groups[itemsGroup(section.id)]}>
                          <ul aria-label={`${title} entries`} className="ml-6 flex flex-col gap-1.5 border-l border-dashed border-line pb-2 pl-3 pr-2">
                            {items.map((item, j) => {
                              const name = names.get(item.id) ?? "";
                              return (
                                <SortableRow key={item.id} as="li" id={item.id} group={itemsGroup(section.id)} disabled={!drawn} className="list-none">
                                  {(r) => (
                                    <div
                                      data-item={item.id}
                                      className={cn("flex min-h-11 items-center gap-1.5 rounded-lg bg-paper px-2 py-1", r.isDragging && "ring-1 ring-v2-line")}
                                    >
                                      <Icon className="h-4 w-4 flex-none text-v2-green-ink" />
                                      <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">{name}</span>
                                      {item.hidden && (
                                        <span className="flex-none rounded bg-paper-2 px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-ink-soft">Hidden</span>
                                      )}
                                      <Menu
                                        items={itemMenu(section, item.id, j, items.length)}
                                        trigger={
                                          <button type="button" aria-label={`More actions for ${name}`} title="More" className={cn(iconButtonClass, "max-sm:h-11 max-sm:w-11")}>
                                            <MoreVerticalIcon className="h-4 w-4" />
                                          </button>
                                        }
                                      />
                                      <DragHandle
                                        aria-label={`Drag ${name} to reorder`}
                                        title={drawn ? undefined : "Hidden in this template"}
                                        {...r.handleProps}
                                        disabled={!drawn}
                                      />
                                    </div>
                                  )}
                                </SortableRow>
                              );
                            })}
                          </ul>
                        </SortableGroup>
                      )}
                    </div>
                  )}
                </SortableRow>
              );
            })}
          </SortableGroup>
        </ul>
      </SortableRoot>

      <p role="status" aria-live="polite" className="sr-only">
        {status}
      </p>

      <div className="flex items-start gap-2.5 rounded-xl bg-v2-green-soft px-3.5 py-3 text-[13px] leading-snug text-v2-green-ink">
        <InfoIcon className="mt-0.5 h-4 w-4 flex-none" />
        <p>
          <strong className="font-bold">Tip:</strong> Drag any section or subsection to reorder your resume. Changes update instantly.
        </p>
      </div>
    </div>
  );
}

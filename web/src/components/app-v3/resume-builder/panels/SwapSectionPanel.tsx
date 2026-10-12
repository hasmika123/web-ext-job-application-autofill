"use client";

import { useMemo } from "react";
import { useState } from "react";
import type { Dispatch, FocusEvent, ReactNode, SyntheticEvent } from "react";
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
import type { AnyItem } from "../ItemControls";
import { moveLink, useLinkTarget, useMoveAnnouncement } from "../moveLink";
import { KIND_META } from "../sectionKinds";
import { nowMs } from "../state/clock";
import { itemLabel, type ItemLabel } from "../state/itemLabel";
import type { EditorAction } from "../state/types";

/** The group key of a section's items in the one `SortableRoot`. */
const SECTIONS = "sections";
const ITEMS_PREFIX = "items:";
const itemsGroup = (sectionId: string): string => `${ITEMS_PREFIX}${sectionId}`;

/** Sections the board shows open at first (the two timelines); the rest start collapsed. */
const OPEN_AT_FIRST: ReadonlySet<ResumeSection["kind"]> = new Set(["EXPERIENCE", "EDUCATION"]);

/** Whether the template draws this section at all (`caps.sections`, and `caps.custom` for Custom). */
function drawnByTemplate(section: ResumeSection, caps: TemplateCapabilities): boolean {
  return section.kind === "CUSTOM" ? caps.custom !== "none" : caps.sections.includes(section.kind);
}

/** "Moved Software Engineer · Acme to position 2 of 3 in Experience." for the status line (buttons have no drag announcements). */
const movedLine = (name: string, to: number, count: number, inSection?: string): string =>
  `Moved ${name} to position ${to + 1} of ${count}${inSection ? ` in ${inSection}` : ""}.`;

/**
 * One row of the panel (a section or an item) as a link target to the canvas (`moveLink.ts`): hovering or
 * focusing it rings the matching item in the document, focusing or clicking it scrolls the document there,
 * and it flashes when that item moves (from here or from the canvas).
 */
function LinkedRow({ id, className, attrs, label, children }: { id: string; className: string; attrs: Record<string, string | undefined>; label?: string; children: ReactNode }) {
  const link = useLinkTarget(id, "panel");
  // A section's row holds its items' rows: an event belongs to the innermost row it came from.
  const mine = (e: SyntheticEvent<HTMLDivElement>): boolean => (e.target as Element).closest("[data-link-id]") === e.currentTarget;
  // The row's menu button and chevron do not scroll the document: the menu closes on any scroll, and the move
  // itself scrolls to the item once it is made.
  const quiet = (e: SyntheticEvent<HTMLDivElement>): boolean => (e.target as Element).closest("[aria-haspopup], [aria-expanded]") !== null;
  return (
    <div
      {...link}
      {...attrs}
      role={label ? "group" : undefined}
      aria-label={label}
      className={className}
      onPointerOver={(e) => mine(e) && moveLink.highlight(id)}
      onPointerLeave={() => moveLink.highlight(null)}
      onFocus={(e) => {
        if (!mine(e)) return;
        moveLink.highlight(id);
        if (!quiet(e)) moveLink.reveal(id);
      }}
      onBlur={(e: FocusEvent<HTMLDivElement>) => {
        if (mine(e) && !e.currentTarget.contains(e.relatedTarget)) moveLink.highlight(null);
      }}
      onClick={(e) => mine(e) && !quiet(e) && moveLink.reveal(id)}
    >
      {children}
    </div>
  );
}

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
  const status = useMoveAnnouncement();

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

  // What each row is called: a section by its title, an item by its own content ("Software Engineer · Acme Inc."), live as the user types.
  const { names, labels } = useMemo(() => {
    const n = new Map<string, string>();
    const l = new Map<string, ItemLabel>();
    for (const s of doc.sections) {
      n.set(s.id, headingFor(s, s.kind, caps));
      (s.items as AnyItem[]).forEach((it, i) => {
        const label = itemLabel(s.kind, it, i);
        l.set(it.id, label);
        n.set(it.id, label.name);
      });
    }
    return { names: n, labels: l };
  }, [doc.sections, caps]);

  // After every move the canvas scrolls to the item and flashes it, and so does its row here; a drag is
  // announced by the drag's own live region, the menu by the status line.
  const moveSection = (id: string, to: number, via: "drag" | "buttons") => {
    dispatch({ type: "section/move", sectionId: id, to, at: nowMs() });
    track("resume_section_reordered", { via });
    moveLink.moved(id, via === "buttons" ? movedLine(names.get(id) ?? "Section", to, doc.sections.length) : undefined);
  };
  const moveItem = (section: ResumeSection, itemId: string, to: number, via: "drag" | "buttons") => {
    dispatch({ type: "item/move", sectionId: section.id, itemId, to, at: nowMs() });
    track("resume_item_reordered", { kind: section.kind.toLowerCase(), via });
    moveLink.moved(itemId, via === "buttons" ? movedLine(names.get(itemId) ?? "Item", to, section.items.length, names.get(section.id)) : undefined);
  };

  const onDrop = ({ group, id, to }: SortableMove) => {
    if (group === SECTIONS) return moveSection(id, to, "drag");
    const section = doc.sections.find((s) => itemsGroup(s.id) === group);
    if (section) moveItem(section, id, to, "drag");
  };

  const sectionMenu = (s: ResumeSection, i: number): MenuEntry[] => {
    const count = doc.sections.length;
    const go = (to: number) => moveSection(s.id, to, "buttons");
    return [
      { label: "Move up", onSelect: () => go(i - 1), disabled: i === 0 },
      { label: "Move down", onSelect: () => go(i + 1), disabled: i >= count - 1 },
    ];
  };
  const itemMenu = (s: ResumeSection, itemId: string, i: number, count: number): MenuEntry[] => {
    const go = (to: number) => moveItem(s, itemId, to, "buttons");
    return [
      { label: "Move up", onSelect: () => go(i - 1), disabled: i === 0 },
      { label: "Move down", onSelect: () => go(i + 1), disabled: i >= count - 1 },
    ];
  };

  return (
    <div data-panel="swap" className="flex flex-col gap-3">
      <p className="text-[12.5px] leading-snug text-muted">Rearrange your resume structure. Changes update in the resume inline.</p>

      <SortableRoot
        groups={groups}
        label={(id) => names.get(id) ?? "row"}
        groupLabel={(group) => (group === SECTIONS ? undefined : names.get(group.slice(ITEMS_PREFIX.length)))}
        onMove={onDrop}
        onCarry={(id) => moveLink.carry(id)}
      >
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
                    <LinkedRow
                      id={section.id}
                      attrs={{ "data-section": section.id, "data-greyed": drawn ? undefined : "true" }}
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
                              const label = labels.get(item.id) ?? itemLabel(section.kind, item, j);
                              const name = label.name;
                              return (
                                <SortableRow key={item.id} as="li" id={item.id} group={itemsGroup(section.id)} disabled={!drawn} className="list-none">
                                  {(r) => (
                                    <LinkedRow
                                      id={item.id}
                                      label={label.text}
                                      attrs={{ "data-item": item.id }}
                                      className={cn("flex min-h-11 items-center gap-1.5 rounded-lg bg-paper px-2 py-1", r.isDragging && "ring-1 ring-v2-line")}
                                    >
                                      <Icon className="h-4 w-4 flex-none text-v2-green-ink" />
                                      {/* the item's own content, not "Experience 1": the title over the company and dates; the whole text on hover */}
                                      <span className="flex min-w-0 flex-1 flex-col" title={label.text}>
                                        <span className={cn("truncate text-[13.5px] leading-snug", label.empty ? "italic text-muted" : "font-medium text-ink")}>{label.primary}</span>
                                        {label.secondary && <span className="truncate text-[12px] leading-snug text-muted">{label.secondary}</span>}
                                      </span>
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
                                    </LinkedRow>
                                  )}
                                </SortableRow>
                              );
                            })}
                          </ul>
                        </SortableGroup>
                      )}
                    </LinkedRow>
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

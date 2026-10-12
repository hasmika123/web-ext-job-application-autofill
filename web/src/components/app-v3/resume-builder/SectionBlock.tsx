"use client";

import { useState } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  LockIcon,
  Menu,
  MoreVerticalIcon,
  PlusIcon,
  SparklesIcon,
  TrashIcon,
  allowedMarks,
  cn,
  headingFor,
  iconButtonClass,
  useToast,
} from "@kiwiply/ui";
import type { MenuEntry, ResumeMark, ResumeSection } from "@kiwiply/ui";
import { useCanvas, useField } from "./canvasContext";
import { LINK_TARGET, PILL_BUTTON } from "./canvasStyles";
import ItemRow from "./ItemRow";
import { ScopedMarkToolbar } from "./MarkToolbar";
import MarkedTextarea from "./MarkedTextarea";
import { MarkScope } from "./markScope";
import { moveLink, useLinkTarget } from "./moveLink";
import SortableItem from "./SortableItem";
import { SortableGroup } from "@/components/common/SortableList";
import { KIND_META } from "./sectionKinds";
import { blockId } from "./sectionTitle";
import { nowMs } from "./state/clock";
import { newId } from "./state/ids";

/** The DOM hook the mark toolbar (R2.11) mounts into: one instance per block, bound to the focused text. */
export const MARK_TOOLBAR_SLOT = "mark-toolbar";

/**
 * One section of the document canvas (DESIGN 10.5): a header row (kind icon tile, the title in capitals,
 * and on the right `+ Add <thing>`, move up / down, the menu and delete), then its items. A section
 * with nothing in it shows one placeholder row that adds an item the moment it gets focus. A hidden
 * section collapses to its header with "Hidden" and "Show".
 */
/** One mark scope per block: the Summary's toolbar (in its header) and its text share the focused-field binding. */
export default function SectionBlock(props: { section: ResumeSection; index: number; count: number }) {
  return (
    <MarkScope>
      <SectionBlockInner {...props} />
    </MarkScope>
  );
}

function SectionBlockInner({ section, index, count }: { section: ResumeSection; index: number; count: number }) {
  const { dispatch, caps, controls, limits, canUndo, canRedo, requestFocus, aiAllowed } = useCanvas();
  const toast = useToast();
  const meta = KIND_META[section.kind];
  const Icon = meta.icon;
  const dom = blockId(section.id);
  const blockField = useField(section.id);
  const titleField = useField(`${section.id}.title`);
  const heading = headingFor(section, section.kind, caps);

  /* rename: a built-in section only when the template shows free headings; a custom one always */
  const renameState = section.kind === "CUSTOM" ? { enabled: true } : controls.sectionTitleEditable;
  const pattern = section.kind === "CUSTOM" ? controls.customTitlePattern : null;
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState("");
  const draftOk = draft.trim() !== "" || section.kind !== "CUSTOM";
  const patternOk = !pattern || draft.trim() === "" || pattern.test(draft.trim());

  const startRename = () => {
    setDraft(heading);
    setRenaming(true);
  };
  const commitRename = () => {
    if (draftOk && patternOk && draft.trim() !== heading) {
      dispatch({ type: "section/rename", sectionId: section.id, title: draft.trim() === "" ? null : draft.trim(), at: nowMs() });
    }
    setRenaming(false);
  };

  const addItem = () => {
    const itemId = newId("i");
    requestFocus({ field: `${itemId}.${meta.firstField}` });
    dispatch({ type: "item/add", sectionId: section.id, itemId, bulletId: newId("b"), at: nowMs() });
  };
  const move = (to: number) => {
    dispatch({ type: "section/move", sectionId: section.id, to, at: nowMs() });
    // the canvas follows the move: scroll to the section and flash it (the panel row flashes too)
    moveLink.moved(section.id, `Moved ${heading} to position ${to + 1} of ${count}.`);
  };
  const link = useLinkTarget(section.id, "canvas");
  const hide = (hidden: boolean) => dispatch({ type: "section/hide", sectionId: section.id, hidden, at: nowMs() });
  const remove = () => {
    dispatch({ type: "section/remove", sectionId: section.id, at: nowMs() });
    toast({ title: "Section removed", description: heading, action: { label: "Undo", onClick: () => dispatch({ type: "history/undo" }) } });
  };

  const menu: MenuEntry[] = [
    {
      label: renameState.enabled ? (
        "Rename section"
      ) : (
        <span title={controls.sectionTitleEditable.hint}>Rename section</span>
      ),
      onSelect: startRename,
      disabled: !renameState.enabled,
    },
    { label: section.hidden ? "Show on this resume" : "Hide from this resume", onSelect: () => hide(!section.hidden) },
    { label: "Undo", onSelect: () => dispatch({ type: "history/undo" }), disabled: !canUndo },
    { label: "Redo", onSelect: () => dispatch({ type: "history/redo" }), disabled: !canRedo },
    { separator: true },
    { label: "Delete section", onSelect: remove, danger: true },
  ];

  const titleNode = renaming ? (
    <input
      {...titleField}
      autoFocus
      aria-label="Section title"
      aria-invalid={!patternOk || !draftOk ? true : undefined}
      value={draft}
      // config-literal-ok: section label maxLength is a schema constant (DESIGN 3.1), not a settings key
      maxLength={60}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commitRename}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (draftOk && patternOk) commitRename();
        } else if (e.key === "Escape") {
          e.preventDefault();
          setRenaming(false);
        }
      }}
      className="min-h-8 min-w-0 rounded-md border border-accent bg-paper px-2 font-display text-[16px] font-extrabold uppercase tracking-wide text-[color:var(--rb-doc-accent,var(--color-ink))] outline-none aria-[invalid=true]:border-danger"
    />
  ) : renameState.enabled ? (
    <button
      {...titleField}
      type="button"
      title="Click to rename"
      onClick={startRename}
      className="rounded-md px-1 text-left font-display text-[16px] font-extrabold uppercase tracking-wide text-[color:var(--rb-doc-accent,var(--color-ink))] hover:bg-paper-2 focus-visible:outline-2 focus-visible:outline-accent"
    >
      {heading}
    </button>
  ) : (
    <span
      {...titleField}
      title={controls.sectionTitleEditable.hint}
      className="px-1 font-display text-[16px] font-extrabold uppercase tracking-wide text-[color:var(--rb-doc-accent,var(--color-ink))]"
    >
      {heading}
    </span>
  );

  const iconTile = (
    <span aria-hidden className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-v2-green-soft text-v2-green-ink">
      <Icon className="h-[18px] w-[18px]" />
    </span>
  );

  /* a hidden section: the header only */
  if (section.hidden) {
    return (
      <section {...blockField} {...link} id={dom} aria-label={`${heading} (hidden)`} className={cn("rb-block scroll-mt-20 rounded-xl bg-paper-2/70 px-3 py-2", LINK_TARGET)}>
        <div className="flex items-center gap-2.5">
          {iconTile}
          <h2 className="min-w-0 truncate font-display text-[15px] font-bold uppercase tracking-wide text-ink-soft">{heading}</h2>
          <span className="flex-none rounded bg-paper px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-ink-soft">Hidden</span>
          <span className="flex-1" />
          <button
            type="button"
            aria-label={`Show ${heading}`}
            onClick={() => hide(false)}
            className="rounded-md px-2 py-1 text-[12.5px] font-bold text-v2-green-ink hover:bg-v2-green-soft max-sm:min-h-11"
          >
            Show
          </button>
          <button type="button" aria-label={`Delete ${heading} section`} title="Delete section" onClick={remove} className={cn(iconButtonClass, "max-sm:h-11 max-sm:w-11")}>
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      </section>
    );
  }

  const items = section.items as unknown[];
  return (
    <section
      {...blockField}
      {...link}
      id={dom}
      aria-labelledby={`${dom}-h`}
      className={cn("rb-block scroll-mt-20 rounded-xl aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-danger/40", LINK_TARGET)}
    >
      <header className="mb-2 flex flex-wrap items-center gap-x-2.5 gap-y-2">
        {iconTile}
        <h2 id={`${dom}-h`} className="m-0 min-w-0">
          {titleNode}
        </h2>
        {section.kind !== "SUMMARY" && <span aria-hidden className="mx-1 hidden h-px min-w-6 flex-1 bg-line sm:block" />}

        {section.kind === "SUMMARY" && (
          <>
            {/* The mark toolbar (R2.11): the template decides which buttons it has (`controls.toolbar`); none = no bar. */}
            <div data-slot={MARK_TOOLBAR_SLOT} data-buttons={controls.toolbar.join(",")} className="flex min-h-8 flex-none items-center">
              <ScopedMarkToolbar />
            </div>
            <RewriteWithAi locked={!aiAllowed} />
            <span className="flex-1" />
          </>
        )}

        {meta.addLabel && (
          <button type="button" onClick={addItem} disabled={items.length >= limits.items} className={PILL_BUTTON} title={items.length >= limits.items ? `At most ${limits.items} entries` : undefined}>
            <PlusIcon className="h-3.5 w-3.5" /> {meta.addLabel}
          </button>
        )}

        <div className="flex flex-none items-center gap-0.5">
          <span className="inline-flex overflow-hidden rounded-lg border border-v2-line">
            <button
              type="button"
              aria-label={`Move ${heading} section up`}
              title="Move section up"
              disabled={index === 0}
              onClick={() => move(index - 1)}
              className={cn(iconButtonClass, "rounded-none max-sm:h-11 max-sm:w-11")}
            >
              <ArrowUpIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label={`Move ${heading} section down`}
              title="Move section down"
              disabled={index >= count - 1}
              onClick={() => move(index + 1)}
              className={cn(iconButtonClass, "rounded-none border-l border-v2-line max-sm:h-11 max-sm:w-11")}
            >
              <ArrowDownIcon className="h-4 w-4" />
            </button>
          </span>
          <Menu
            items={menu}
            trigger={
              <button type="button" aria-label={`More actions for ${heading} section`} title="More" className={cn(iconButtonClass, "max-sm:h-11 max-sm:w-11")}>
                <MoreVerticalIcon className="h-4 w-4" />
              </button>
            }
          />
          <button type="button" aria-label={`Delete ${heading} section`} title="Delete section" onClick={remove} className={cn(iconButtonClass, "max-sm:h-11 max-sm:w-11")}>
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      </header>

      {section.kind === "SUMMARY" ? <SummaryBody section={section} /> : <ItemList section={section} items={items} />}
    </section>
  );
}

/** "Rewrite with AI": the stub R4.2 fills in. Free shows the lock variant (DESIGN 13.7), Pro a disabled button. */
function RewriteWithAi({ locked }: { locked: boolean }) {
  const Icon = locked ? LockIcon : SparklesIcon;
  return (
    <button
      type="button"
      disabled
      aria-disabled="true"
      title={locked ? "Rewrite with AI is part of Pro" : "Rewrite with AI is coming soon"}
      className="inline-flex min-h-8 flex-none items-center gap-1.5 rounded-lg bg-v2-green-soft px-3 text-[13px] font-semibold text-v2-green-ink opacity-70 max-sm:min-h-11"
    >
      <Icon className="h-3.5 w-3.5" /> Rewrite with AI
    </button>
  );
}

function SummaryBody({ section }: { section: Extract<ResumeSection, { kind: "SUMMARY" }> }) {
  const { dispatch, limits, caps } = useCanvas();
  const first = section.items[0];
  const text = first?.text ?? "";
  const f = useField(first ? `${first.id}.text` : `${section.id}.text`);
  const list = first?.list ?? null;
  const edit = (next: string, marks: ResumeMark[], format?: boolean) =>
    dispatch({ type: "summary/edit", sectionId: section.id, text: next, newItemId: newId("i"), marks, format, at: nowMs() });
  return (
    <div>
      <MarkedTextarea
        {...f}
        rows={4}
        aria-label="Summary"
        maxLength={limits.summaryChars}
        value={text}
        marks={first?.marks}
        allowed={allowedMarks(caps)}
        sticky
        boxed
        listStyle={list}
        onListStyle={(style) => dispatch({ type: "list/set", sectionId: section.id, style, at: nowMs() })}
        placeholder="Two or three sentences: who you are, what you do best, what you want next."
        textClass="text-[14.5px] leading-snug"
        className="px-3 py-2.5"
        onChange={(next, marks) => edit(next, marks)}
        onFormat={(marks) => edit(text, marks, true)}
      />
      <p className="mt-1 flex items-center justify-between gap-2 text-[11.5px] text-muted">
        <span>{list ? `Printed as a ${list === "number" ? "numbered" : "bulleted"} list, one line per item (when the template shows lists).` : ""}</span>
        <span aria-live="off">
          {text.length} / {limits.summaryChars}
        </span>
      </p>
    </div>
  );
}

function ItemList({ section, items }: { section: ResumeSection; items: unknown[] }) {
  const { requestFocus, dispatch, reorder } = useCanvas();
  const meta = KIND_META[section.kind];
  const ids = (items as Array<{ id: string }>).map((it) => it.id);

  if (items.length === 0) {
    return (
      <input
        readOnly
        aria-label={meta.placeholder}
        placeholder={meta.placeholder}
        // The item is added on first focus (not on render), so an untouched placeholder adds nothing.
        onFocus={() => {
          const itemId = newId("i");
          requestFocus({ field: `${itemId}.${meta.firstField}` });
          dispatch({ type: "item/add", sectionId: section.id, itemId, bulletId: newId("b"), at: nowMs() });
        }}
        className="min-h-11 w-full cursor-text rounded-xl border border-dashed border-line bg-paper-2/50 px-4 text-[14px] text-ink-soft outline-none placeholder:text-muted hover:border-accent focus:border-accent sm:min-h-10"
      />
    );
  }

  return (
    <div className={cn("flex flex-col", meta.timeline && "relative before:absolute before:bottom-5 before:left-[3px] before:top-6 before:w-px before:bg-line")}>
      <SortableGroup group={section.id} ids={ids}>
        {items.map((item, i) => (
          <SortableItem key={(item as { id: string }).id} id={(item as { id: string }).id} sectionId={section.id} reorder={reorder}>
            <ItemRow section={section} item={item} index={i} count={items.length} />
          </SortableItem>
        ))}
      </SortableGroup>
    </div>
  );
}

"use client";

import { useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import { BoldIcon, ItalicIcon, LinkIcon, ListIcon, ListOrderedIcon, Tooltip, UnderlineIcon, clearMark, cn, isCovered, markAt, toggleMark } from "@kiwiply/ui";
import type { ResumeListStyle, ResumeMark, ToolbarButton } from "@kiwiply/ui";
import { useCanvas } from "./canvasContext";
import LinkPopover from "./LinkPopover";
import { useMarkScope } from "./markScope";

type FormatMark = "b" | "i" | "u";

const META: Record<ToolbarButton, { label: string; hint: string; Icon: typeof BoldIcon }> = {
  b: { label: "Bold", hint: "Ctrl+B", Icon: BoldIcon },
  i: { label: "Italic", hint: "Ctrl+I", Icon: ItalicIcon },
  u: { label: "Underline", hint: "Ctrl+U", Icon: UnderlineIcon },
  bullet: { label: "Bulleted list", hint: "", Icon: ListIcon },
  number: { label: "Numbered list", hint: "", Icon: ListOrderedIcon },
  a: { label: "Link", hint: "Ctrl+K", Icon: LinkIcon },
};

/** The text a link would cover: the selection, or the whole link the caret sits in. */
function linkRange(marks: readonly ResumeMark[], s: number, e: number): { s: number; e: number } | null {
  if (s < e) return { s, e };
  const at = markAt(marks, s, "a");
  return at ? { s: at.s, e: at.e } : null;
}

/**
 * The formatting toolbar of the board's PROFESSIONAL SUMMARY header (DESIGN 10.5 / 10.6): B, I, U, a
 * bulleted list, a numbered list and a link, in that order, and only the buttons the template can
 * print (`controls.toolbar`, from `controlStates`) - none at all renders nothing. Presentational: the
 * field it acts on is described by `marks` / `selection` / `list`, and the host (`ScopedMarkToolbar`)
 * turns clicks into document edits. A `role="toolbar"` with a roving tab stop and arrow-key
 * navigation; buttons keep the focus in the text (mouse down never steals it).
 */
export default function MarkToolbar({
  buttons,
  marks,
  selection,
  list,
  active = true,
  onToggle,
  onList,
  onLink,
  linkSignal = 0,
  className,
}: {
  buttons: readonly ToolbarButton[];
  marks: readonly ResumeMark[];
  selection: { s: number; e: number };
  list: ResumeListStyle | null;
  /** False when there is no text field to act on (the buttons are inert and dimmed). */
  active?: boolean;
  onToggle: (t: FormatMark) => void;
  /** The list button that was pressed; the host toggles it. */
  onList: (style: ResumeListStyle) => void;
  /** `href: null` removes the link from `range`. */
  onLink: (range: { s: number; e: number }, href: string | null) => void;
  /** Bumped by Ctrl/Cmd+K in the field: opens the link popover. */
  linkSignal?: number;
  className?: string;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const [stop, setStop] = useState(0);
  const [pop, setPop] = useState<{ range: { s: number; e: number }; initial: string; canRemove: boolean } | null>(null);
  const [seen, setSeen] = useState(linkSignal);

  const { s, e } = selection;
  const hasSelection = s < e;
  const range = linkRange(marks, s, e);

  const openLink = () => {
    if (!active) return;
    const r = linkRange(marks, selection.s, selection.e);
    if (!r) return;
    const existing = markAt(marks, r.s, "a");
    setPop({ range: r, initial: existing?.href ?? "", canRemove: !!existing });
  };

  // Ctrl/Cmd+K in the text asks for the popover (a counter the field bumps; adjusted during render, not in an effect).
  if (linkSignal !== seen) {
    setSeen(linkSignal);
    if (buttons.includes("a")) openLink();
  }

  if (buttons.length === 0) return null;

  const pressed = (b: ToolbarButton): boolean => {
    if (!active) return false;
    if (b === "bullet") return list === "bullet";
    if (b === "number") return list === "number";
    if (b === "a") return range ? isCovered(marks, range.s, range.e, "a") : false;
    return isCovered(marks, s, e, b);
  };
  const inert = (b: ToolbarButton): boolean => {
    if (!active) return true;
    if (b === "bullet" || b === "number") return false;
    if (b === "a") return !range;
    return !hasSelection;
  };

  const press = (b: ToolbarButton) => {
    if (inert(b)) return;
    if (b === "bullet" || b === "number") onList(b === "bullet" ? "bullet" : "number");
    else if (b === "a") (pop ? () => setPop(null) : openLink)();
    else onToggle(b);
  };

  const onKeyDown = (ev: KeyboardEvent<HTMLDivElement>) => {
    const n = buttons.length;
    const keys: Record<string, number> = { ArrowRight: (stop + 1) % n, ArrowLeft: (stop + n - 1) % n, Home: 0, End: n - 1 };
    const to = keys[ev.key];
    if (to === undefined) return;
    ev.preventDefault();
    setStop(to);
    refs.current[to]?.focus();
  };

  const keepFocus = (ev: MouseEvent) => ev.preventDefault();

  return (
    <div className={cn("inline-flex", className ?? "relative")}>
      <div
        role="toolbar"
        aria-label="Text formatting"
        aria-orientation="horizontal"
        onKeyDown={onKeyDown}
        className="inline-flex items-center gap-0.5 rounded-xl border border-v2-line bg-paper p-0.5 shadow-v2-soft"
      >
        {buttons.map((b, i) => {
          const { label, hint, Icon } = META[b];
          const on = pressed(b);
          const off = inert(b);
          return (
            <Tooltip key={b} content={hint ? `${label} (${hint})` : label}>
              <button
                ref={(el) => {
                  refs.current[i] = el;
                }}
                type="button"
                aria-label={label}
                aria-pressed={on}
                aria-disabled={off || undefined}
                aria-haspopup={b === "a" ? "dialog" : undefined}
                aria-expanded={b === "a" ? !!pop : undefined}
                tabIndex={i === stop ? 0 : -1}
                onFocus={() => setStop(i)}
                onMouseDown={keepFocus}
                onClick={() => press(b)}
                className={cn(
                  "inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-paper-2 hover:text-ink",
                  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent aria-disabled:opacity-40 aria-disabled:hover:bg-transparent max-sm:h-11 max-sm:w-11",
                  on && "bg-v2-green-soft text-v2-green-ink hover:bg-v2-green-soft",
                )}
              >
                <Icon className="h-4 w-4" />
              </button>
            </Tooltip>
          );
        })}
      </div>
      {pop && (
        <LinkPopover
          initial={pop.initial}
          canRemove={pop.canRemove}
          onApply={(href) => {
            onLink(pop.range, href);
            setPop(null);
          }}
          onRemove={() => {
            onLink(pop.range, null);
            setPop(null);
          }}
          onClose={() => setPop(null)}
        />
      )}
    </div>
  );
}

/**
 * The toolbar bound to the block's focused field (`MarkScope`) and to the template: buttons come from
 * `controls.toolbar`, clicks become one undo step each (the field's `applyMarks` / `setList`).
 */
export function ScopedMarkToolbar({ className }: { className?: string }) {
  const scope = useMarkScope();
  const { controls } = useCanvas();
  const target = scope?.target ?? null;
  if (controls.toolbar.length === 0) return null;

  return (
    <MarkToolbar
      className={className}
      buttons={controls.toolbar}
      marks={target?.marks ?? []}
      selection={target?.selection ?? { s: 0, e: 0 }}
      list={target?.list ?? null}
      active={!!target}
      linkSignal={scope?.linkRequest ?? 0}
      onToggle={(t) => {
        if (!target || !(target.selection.s < target.selection.e)) return;
        target.applyMarks(toggleMark(target.marks, target.selection.s, target.selection.e, t));
      }}
      onList={(style) => target?.setList(target.list === style ? null : style)}
      onLink={(range, href) => {
        if (!target) return;
        if (href === null) target.applyMarks(clearMark(target.marks, range.s, range.e, "a"));
        else {
          // a link over a link: replace the target (toggling a fully covered range would remove it)
          const base = isCovered(target.marks, range.s, range.e, "a") ? clearMark(target.marks, range.s, range.e, "a") : target.marks;
          target.applyMarks(toggleMark(base, range.s, range.e, "a", href));
        }
        target.focus();
      }}
    />
  );
}

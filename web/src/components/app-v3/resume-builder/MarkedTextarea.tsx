"use client";

import { forwardRef, useCallback, useEffect, useId, useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent, TextareaHTMLAttributes } from "react";
import { ResumeRichText, cn, shiftMarks, toggleMark } from "@kiwiply/ui";
import type { ResumeListStyle, ResumeMark, ResumeMarkType } from "@kiwiply/ui";
import AutoTextarea from "./AutoTextarea";
import { useMarkScope } from "./markScope";

/** The ctrl / cmd shortcuts: letter -> the mark it toggles (DESIGN 10.11). */
const SHORTCUTS: Record<string, ResumeMarkType> = { b: "b", i: "i", u: "u", k: "a" };

/**
 * The field skin on the wrapper: text that reads like the document and turns into a field on hover
 * and focus (the same look as `GHOST`, but driven by `focus-within` so the textarea itself can stay
 * transparent above the mirror).
 */
const SKIN =
  "w-full min-w-0 rounded-md border border-transparent bg-transparent px-1.5 py-1 hover:border-line " +
  "focus-within:border-accent focus-within:bg-paper focus-within:shadow-[0_0_0_3px_var(--color-accent-soft)] " +
  "has-[[aria-invalid=true]]:border-danger has-[[aria-invalid=true]]:bg-paper " +
  "has-[[aria-invalid=true]]:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-danger)_25%,transparent)] max-sm:min-h-11";

/**
 * The mirror draws the marks without moving a single glyph: the textarea above it holds the real
 * (transparent) text and the caret, so both layers must wrap identically. A real bold face is wider
 * than the regular one, so bold is a thickened stroke here (the document and the PDF use real bold);
 * italics are the synthesized slant (same advance) and links are underlined.
 */
const MIRROR =
  "pointer-events-none absolute inset-0 whitespace-pre-wrap break-words font-body text-ink select-none " +
  "[&_strong]:[font-weight:inherit] [&_strong]:[-webkit-text-stroke:0.45px_currentColor] [&_em]:[font-synthesis:style] " +
  "[&_a]:text-accent-deep [&_a]:underline";

export interface MarkedTextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange" | "className"> {
  value: string;
  marks?: readonly ResumeMark[];
  /** The marks the template renders (`allowedMarks(caps)`); also which Ctrl/Cmd shortcuts act. */
  allowed: readonly ResumeMarkType[];
  /** Typing / pasting / IME: the new text and the marks re-based onto it. */
  onChange: (text: string, marks: ResumeMark[]) => void;
  /** A formatting change over the same text (toolbar or shortcut). Default: `onChange(value, marks)`. */
  onFormat?: (marks: ResumeMark[]) => void;
  /** The selection moved (`select`, `keyup`, `mouseup`, focus, typing). */
  onSelection?: (s: number, e: number) => void;
  /** Ctrl/Cmd+K with the link mark allowed: the host opens its link popover. Default: the scope's toolbar. */
  onLinkRequest?: () => void;
  /** The list style the toolbar's • / 1. act on (the summary's `list`, or the item's `listStyle`). */
  listStyle?: ResumeListStyle | null;
  onListStyle?: (style: ResumeListStyle | null) => void;
  /** Stay the toolbar's target even without focus (the Summary: its toolbar sits in the block header). */
  sticky?: boolean;
  /** Font metrics (size, leading) shared by the mirror and the textarea so the two layers line up. */
  textClass?: string;
  /** Extra classes for the field's wrapper (padding, border, background). */
  className?: string;
  /** Draw the field box all the time (the summary) instead of only on hover / focus. */
  boxed?: boolean;
}

/** The edit that turned `from` into `to`, as `shiftMarks` wants it. The caret (where a typed or pasted run ended) settles ambiguous repeats. */
function edit(from: string, to: string, caret: number | null) {
  const max = Math.min(from.length, to.length);
  let p = 0;
  while (p < max && from[p] === to[p]) p++;
  let q = 0;
  while (q < max - p && from[from.length - 1 - q] === to[to.length - 1 - q]) q++;
  let at = p;
  let removed = from.length - p - q;
  const inserted = to.length - p - q;
  if (caret !== null && caret - inserted >= 0 && caret <= to.length) {
    // "aa" -> "aaa" with the caret at 1: the new character sits at 0, not at the end. A deletion leaves the caret where it began.
    const a = caret - inserted;
    const r = from.length - to.length + inserted;
    if (r >= 0 && from.slice(0, a) === to.slice(0, a) && from.slice(a + r) === to.slice(a + inserted)) {
      at = a;
      removed = r;
    }
  }
  return { at, removed, inserted };
}

/**
 * A textarea with inline marks (DESIGN 10.6, DECISIONS #1): two layers, no rich-text dependency. A
 * mirror `<div>` behind draws the text with its marks (`RichText`, the renderer the template uses);
 * the textarea on top holds the text, the caret and the selection with transparent ink. Typing re-bases
 * the marks on the new text (`shiftMarks` over the common prefix / suffix), Ctrl/Cmd+B / I / U / K act
 * only for the marks the template allows, and the field registers with its block's `MarkScope` so the
 * toolbar can read the selection and write marks back.
 */
const MarkedTextarea = forwardRef<HTMLTextAreaElement, MarkedTextareaProps>(function MarkedTextarea(
  { value, marks, allowed, onChange, onFormat, onSelection, onLinkRequest, listStyle = null, onListStyle, sticky = false, textClass, className, boxed = false, onKeyDown, onKeyUp, onMouseUp, onSelect, onFocus, onBlur, ...rest },
  forwardedRef,
) {
  const scope = useMarkScope();
  const register = scope?.register;
  const requestLink = scope?.requestLink;
  const id = useId();
  const own = useRef<HTMLTextAreaElement | null>(null);
  const [sel, setSel] = useState({ s: 0, e: 0 });
  const [focused, setFocused] = useState(false);
  const current = marks ?? NO_MARKS;

  const setRef = useCallback(
    (el: HTMLTextAreaElement | null) => {
      own.current = el;
      if (typeof forwardedRef === "function") forwardedRef(el);
      else if (forwardedRef) forwardedRef.current = el;
    },
    [forwardedRef],
  );

  // The latest callbacks, so the registered target stays one stable object between selection changes.
  const live = useRef({ onChange, onFormat, onListStyle, value });
  useEffect(() => {
    live.current = { onChange, onFormat, onListStyle, value };
  });

  const report = useCallback(() => {
    const el = own.current;
    if (!el) return;
    const s = el.selectionStart ?? 0;
    const e = el.selectionEnd ?? s;
    setSel((cur) => (cur.s === s && cur.e === e ? cur : { s, e }));
    onSelection?.(s, e);
  }, [onSelection]);

  useEffect(() => {
    if (!register || !(focused || sticky)) return;
    register({
      id,
      text: value,
      marks: current,
      selection: sel,
      list: listStyle,
      applyMarks: (next) => {
        const { onFormat: fmt, onChange: change, value: text } = live.current;
        if (fmt) fmt(next);
        else change(text, next);
      },
      setList: (style) => live.current.onListStyle?.(style),
      focus: () => own.current?.focus(),
    });
  }, [register, focused, sticky, id, value, current, sel, listStyle]);

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const el = e.target;
    const next = el.value;
    const { at, removed, inserted } = edit(value, next, el.selectionStart);
    onChange(next, shiftMarks(current, at, removed, inserted));
    report();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && !e.nativeEvent.isComposing) {
      const t = SHORTCUTS[e.key.toLowerCase()];
      if (t && allowed.includes(t)) {
        e.preventDefault();
        const el = e.currentTarget;
        const s = el.selectionStart ?? 0;
        const end = el.selectionEnd ?? s;
        if (t === "a") (onLinkRequest ?? requestLink)?.();
        else if (s < end) {
          const next = toggleMark(current, s, end, t);
          if (onFormat) onFormat(next);
          else onChange(value, next);
        }
        return;
      }
    }
    onKeyDown?.(e);
  };

  return (
    <div className={cn(SKIN, boxed && "border-line bg-paper", className)} data-marked-textarea>
      <div className="relative">
        <div aria-hidden data-mirror className={cn(MIRROR, textClass)}>
          <ResumeRichText text={value} marks={current} allowed={allowed} keepLines verbatim />
        </div>
        <AutoTextarea
          {...rest}
          ref={setRef}
          bare
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onKeyUp={(e) => {
            report();
            onKeyUp?.(e);
          }}
          onMouseUp={(e) => {
            report();
            onMouseUp?.(e);
          }}
          onSelect={(e) => {
            report();
            onSelect?.(e);
          }}
          onFocus={(e) => {
            setFocused(true);
            report();
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          className={cn("relative block w-full min-w-0 bg-transparent p-0 font-body text-transparent caret-ink outline-none placeholder:text-muted selection:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-60", textClass)}
        />
      </div>
    </div>
  );
});

const NO_MARKS: readonly ResumeMark[] = [];

export default MarkedTextarea;

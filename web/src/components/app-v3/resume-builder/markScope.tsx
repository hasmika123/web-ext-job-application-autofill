"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { ResumeListStyle, ResumeMark } from "@kiwiply/ui";

/**
 * What the mark toolbar acts on: the text field that last had focus inside a block (DESIGN 10.5,
 * "one toolbar instance per block, bound to the focused `MarkedTextarea`"). The field registers
 * itself with its current text, marks and selection; the toolbar reads them for the pressed states
 * and calls `applyMarks` / `setList` to change them.
 */
export interface MarkTarget {
  id: string;
  text: string;
  marks: readonly ResumeMark[];
  selection: { s: number; e: number };
  /** The list style of the summary, or of the item the focused bullet belongs to. */
  list: ResumeListStyle | null;
  /** Writes new marks for the same text (one undo step). */
  applyMarks: (marks: ResumeMark[]) => void;
  setList: (style: ResumeListStyle | null) => void;
  focus: () => void;
}

interface Scope {
  target: MarkTarget | null;
  register: (t: MarkTarget) => void;
  /** The focus left the block: the toolbar has nothing to act on until a field is focused again. */
  clear: () => void;
  /** Ctrl/Cmd+K in a field: ask the toolbar to open its link popover. */
  linkRequest: number;
  requestLink: () => void;
}

const Ctx = createContext<Scope | null>(null);

const same = (a: MarkTarget | null, b: MarkTarget) =>
  !!a && a.id === b.id && a.text === b.text && a.marks === b.marks && a.selection.s === b.selection.s && a.selection.e === b.selection.e && a.list === b.list;

/** A block of fields that share one mark toolbar (the Summary, or one item's bullets). */
export function MarkScope({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<MarkTarget | null>(null);
  const [linkRequest, setLinkRequest] = useState(0);
  const register = useCallback((t: MarkTarget) => setTarget((cur) => (same(cur, t) ? cur : t)), []);
  const clear = useCallback(() => setTarget(null), []);
  const requestLink = useCallback(() => setLinkRequest((n) => n + 1), []);
  const value = useMemo(() => ({ target, register, clear, linkRequest, requestLink }), [target, register, clear, linkRequest, requestLink]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The nearest scope, or null (a `MarkedTextarea` outside a scope still edits and reports; it just has no toolbar). */
export function useMarkScope(): Scope | null {
  return useContext(Ctx);
}

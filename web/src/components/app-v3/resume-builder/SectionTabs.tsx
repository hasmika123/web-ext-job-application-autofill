"use client";

import { useEffect, useMemo, useRef } from "react";
import type { RefObject } from "react";
import { ChevronDownIcon, Menu, cn } from "@kiwiply/ui";
import type { MenuEntry, ResumeSection, ResumeSectionKind } from "@kiwiply/ui";
import UnderlineTabs from "@/components/app-v2/common/UnderlineTabs";
import { BASICS_BLOCK_ID, BASICS_ID, blockId, sectionTitle } from "./sectionTitle";

/** The five fixed tabs, in board order. `kind` null = the personal-info block. */
const TABS: ReadonlyArray<{ key: string; label: string; kind: ResumeSectionKind | null }> = [
  { key: BASICS_ID, label: "Personal Info", kind: null },
  { key: "SUMMARY", label: "Summary", kind: "SUMMARY" },
  { key: "EXPERIENCE", label: "Experience", kind: "EXPERIENCE" },
  { key: "EDUCATION", label: "Education", kind: "EDUCATION" },
  { key: "SKILLS", label: "Skills", kind: "SKILLS" },
];
const TAB_KINDS: ReadonlySet<string> = new Set(TABS.flatMap((t) => (t.kind ? [t.kind] : [])));
const MORE = "more";

/** Smooth scroll (instant under reduced motion) to a block and focus its first field. */
export function scrollToBlock(domId: string): void {
  const el = document.getElementById(domId);
  if (!el) return;
  const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView?.({ behavior: reduced ? "auto" : "smooth", block: "start" });
  el.querySelector<HTMLElement>("input, textarea, select, [contenteditable='true']")?.focus({ preventScroll: true });
}

/**
 * The tabs above the document (DESIGN 10.4): Personal Info · Summary · Experience · Education ·
 * Skills · More ▾. They are navigation (`<nav aria-label="Resume sections">`): a click scrolls the
 * canvas to that block and focuses its first field, and the active underline follows the scroll
 * position (IntersectionObserver over `.rb-block` inside `scrollRootRef`). A tab for a kind the
 * document lacks still shows; clicking it opens Add Section with that row focused (`onAddSection`).
 */
export default function SectionTabs({
  sections,
  activeId,
  onActiveChange,
  scrollRootRef,
  onAddSection,
  className,
}: {
  sections: ResumeSection[];
  /** The section id (or "basics") the scroll-spy last reported. */
  activeId: string | null;
  onActiveChange: (id: string) => void;
  scrollRootRef: RefObject<HTMLElement | null>;
  onAddSection: (kind: ResumeSectionKind | null) => void;
  className?: string;
}) {
  const firstOfKind = useMemo(() => {
    const m = new Map<string, ResumeSection>();
    for (const s of sections) if (!m.has(s.kind)) m.set(s.kind, s);
    return m;
  }, [sections]);
  const more = useMemo(() => sections.filter((s) => !TAB_KINDS.has(s.kind)), [sections]);

  /* A tab click scrolls programmatically; until the user scrolls themselves (wheel / touch / keys) the
   * spy must not move the underline off the tab they chose (a short document cannot always bring the
   * chosen block to the top, so the block above would otherwise win). */
  const pinned = useRef(false);
  useEffect(() => {
    const root = scrollRootRef.current;
    if (!root) return;
    const release = () => {
      pinned.current = false;
    };
    const events = ["wheel", "touchmove", "keydown"] as const;
    events.forEach((e) => root.addEventListener(e, release, { passive: true }));
    return () => events.forEach((e) => root.removeEventListener(e, release));
  }, [scrollRootRef]);

  /* Scroll-spy: the first block (document order) that sits in the top 40% of the scroll area. */
  const idsKey = sections.map((s) => s.id).join("|");
  useEffect(() => {
    const root = scrollRootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const blocks = Array.from(root.querySelectorAll<HTMLElement>(".rb-block"));
    if (blocks.length === 0) return;
    const inView = new Set<Element>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) inView.add(e.target);
          else inView.delete(e.target);
        }
        const top = blocks.find((b) => inView.has(b));
        if (!top || pinned.current) return;
        onActiveChange(top.id === BASICS_BLOCK_ID ? BASICS_ID : top.id.replace(/^rb-/, ""));
      },
      { root, rootMargin: "0px 0px -60% 0px", threshold: 0 },
    );
    blocks.forEach((b) => io.observe(b));
    return () => io.disconnect();
  }, [scrollRootRef, onActiveChange, idsKey]);

  const activeSection = activeId && activeId !== BASICS_ID ? sections.find((s) => s.id === activeId) : undefined;
  const activeTab =
    activeId === BASICS_ID
      ? BASICS_ID
      : activeSection
        ? TAB_KINDS.has(activeSection.kind)
          ? activeSection.kind
          : MORE
        : "";

  const go = (key: string) => {
    pinned.current = true;
    if (key === BASICS_ID) {
      onActiveChange(BASICS_ID);
      scrollToBlock(BASICS_BLOCK_ID);
      return;
    }
    const target = firstOfKind.get(key);
    if (!target) {
      onAddSection(key as ResumeSectionKind);
      return;
    }
    onActiveChange(target.id);
    scrollToBlock(blockId(target.id));
  };

  const moreItems: MenuEntry[] = [
    ...more.map((s) => ({
      label: sectionTitle(s),
      onSelect: () => {
        pinned.current = true;
        onActiveChange(s.id);
        scrollToBlock(blockId(s.id));
      },
    })),
    ...(more.length > 0 ? [{ separator: true } as const] : []),
    { label: "Add a section…", onSelect: () => onAddSection(null) },
  ];

  return (
    <nav aria-label="Resume sections" className={cn("flex items-center border-b border-v2-line/70 bg-paper", className)}>
      <UnderlineTabs
        padded
        ariaLabel="Jump to a section"
        value={activeTab}
        onChange={go}
        tabs={TABS.map((t) => ({ id: t.key, label: t.label }))}
        className="min-w-0 flex-1 border-b-0"
      />
      <Menu
        align="end"
        items={moreItems}
        className="flex-none"
        trigger={
          <button
            type="button"
            className={cn(
              "-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-[3px] px-3.5 py-3 text-[14px] font-semibold transition-colors sm:px-4",
              activeTab === MORE ? "border-v2-green text-v2-green-ink" : "border-transparent text-ink-soft hover:text-ink",
            )}
          >
            More
            <ChevronDownIcon className="h-4 w-4" />
          </button>
        }
      />
    </nav>
  );
}

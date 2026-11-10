"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType, Dispatch, FormEvent } from "react";
import { CheckCircleIcon, PlusIcon, Tooltip, UserIcon, cn, controlStates } from "@kiwiply/ui";
import type { IconProps, ResumeDocument, ResumeSectionKind, TemplateCapabilities } from "@kiwiply/ui";
import AppArt from "@/components/app-v2/common/AppArt";
import { KIND_META } from "../sectionKinds";
import { scrollToBlock } from "../SectionTabs";
import { blockId } from "../sectionTitle";
import { newId } from "../state/ids";
import { nowMs } from "../state/clock";
import { MAX_TITLE_CHARS } from "../state/reducer";
import type { DocLimits, EditorAction } from "../state/types";

/** The eleven rows of the board, in order. `kind: null` = Personal Information (the header, not a section). */
const ROWS: ReadonlyArray<{ key: string; kind: ResumeSectionKind | null; label: string; icon: ComponentType<IconProps> }> = [
  { key: "basics", kind: null, label: "Personal Information", icon: UserIcon },
  { key: "SUMMARY", kind: "SUMMARY", label: "Professional Summary", icon: KIND_META.SUMMARY.icon },
  { key: "EXPERIENCE", kind: "EXPERIENCE", label: "Work Experience", icon: KIND_META.EXPERIENCE.icon },
  { key: "EDUCATION", kind: "EDUCATION", label: "Education", icon: KIND_META.EDUCATION.icon },
  { key: "SKILLS", kind: "SKILLS", label: "Skills", icon: KIND_META.SKILLS.icon },
  { key: "PROJECTS", kind: "PROJECTS", label: "Projects", icon: KIND_META.PROJECTS.icon },
  { key: "CERTIFICATIONS", kind: "CERTIFICATIONS", label: "Certifications", icon: KIND_META.CERTIFICATIONS.icon },
  { key: "ACHIEVEMENTS", kind: "ACHIEVEMENTS", label: "Achievements", icon: KIND_META.ACHIEVEMENTS.icon },
  { key: "LANGUAGES", kind: "LANGUAGES", label: "Languages", icon: KIND_META.LANGUAGES.icon },
  { key: "INTERESTS", kind: "INTERESTS", label: "Interests", icon: KIND_META.INTERESTS.icon },
  { key: "CUSTOM", kind: "CUSTOM", label: "Custom Section", icon: KIND_META.CUSTOM.icon },
];

type RowState = { state: "added" } | { state: "available" } | { state: "disabled"; label: string; hint?: string };

const PLAIN_HEADING_HINT = "Keep it a plain heading so ATS parsers recognise it";

export interface AddSectionPanelProps {
  doc: ResumeDocument;
  /** The active template's capabilities (DESIGN 6.4): decide which rows are open. */
  caps: TemplateCapabilities;
  limits: DocLimits;
  dispatch: Dispatch<EditorAction>;
  /** The kind a section tab asked for: its row takes focus when the panel opens (R2.10 hook). */
  focusKind?: ResumeSectionKind | null;
  /** The panel is open (it stays mounted while closed). */
  open?: boolean;
  /** Called once the row has been focused, so a later plain open does not focus it again. */
  onFocusHandled?: () => void;
  /** Set when the sheet covers the document (overlay / fullscreen): adding closes it so the new section shows. */
  onAdded?: () => void;
}

/**
 * Add Section (board 3, DESIGN 10.3.1): the eleven kinds, each `Already added` or `+ Add to resume`
 * (or disabled, with the reason, when the template cannot show it). Adding dispatches `section/add`,
 * scrolls the canvas to the new block and focuses its first field; Custom Section asks for a title
 * first (letters and spaces only when the template limits custom sections).
 */
export default function AddSectionPanel({ doc, caps, limits, dispatch, focusKind = null, open = true, onFocusHandled, onAdded }: AddSectionPanelProps) {
  const controls = useMemo(() => controlStates(doc, caps), [doc, caps]);
  const present = useMemo(() => new Set(doc.sections.map((s) => s.kind)), [doc.sections]);
  const atSectionLimit = doc.sections.length >= limits.sections;

  const [customOpen, setCustomOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [touched, setTouched] = useState(false);
  const [announce, setAnnounce] = useState("");
  const rowRefs = useRef(new Map<string, HTMLElement>());
  const buttonRefs = useRef(new Map<string, HTMLElement>());
  const customInput = useRef<HTMLInputElement>(null);
  /** The control a row offers (its Add button), else the row itself. */
  const focusRow = useCallback((key: string) => (buttonRefs.current.get(key) ?? rowRefs.current.get(key))?.focus(), []);
  const pending = useRef<string | null>(null);

  const stateOf = useCallback(
    (kind: ResumeSectionKind | null): RowState => {
      if (kind === null) return { state: "added" };
      const c = controls.addSection[kind];
      if (kind !== "CUSTOM" && present.has(kind) && c.label === "Already added") return { state: "added" };
      if (!c.enabled) return { state: "disabled", label: c.label ?? "Not available", hint: c.hint };
      if (atSectionLimit) return { state: "disabled", label: "Section limit reached", hint: "Remove a section to add another" };
      return { state: "available" };
    },
    [controls, present, atSectionLimit],
  );

  /* A new section is on the canvas after the next render: bring it into view and focus its first field. */
  useEffect(() => {
    const id = pending.current;
    if (!id || !doc.sections.some((s) => s.id === id)) return;
    // After the sheet's own focus handling (a modal sheet returns focus to its button when it closes).
    const t = setTimeout(() => {
      if (pending.current === id) pending.current = null;
      scrollToBlock(blockId(id));
    }, 0);
    return () => clearTimeout(t);
  }, [doc.sections]);

  /* A section tab asked for this kind: focus its row once the panel is open (after the sheet's own first-focus). */
  useEffect(() => {
    if (!open || !focusKind) return;
    const t = setTimeout(() => {
      focusRow(focusKind);
      onFocusHandled?.();
    }, 0);
    return () => clearTimeout(t);
  }, [open, focusKind, onFocusHandled, focusRow]);

  const closeCustom = useCallback(() => {
    setCustomOpen(false);
    setTitle("");
    setTouched(false);
  }, []);

  const add = (kind: ResumeSectionKind, label: string, sectionTitle?: string) => {
    const sectionId = newId("s");
    pending.current = sectionId;
    dispatch({ type: "section/add", kind, sectionId, ...(sectionTitle ? { title: sectionTitle } : {}), at: nowMs() });
    setAnnounce(`${sectionTitle ?? label} added to your resume`);
    onAdded?.();
  };

  const pattern = controls.customTitlePattern;
  const trimmed = title.trim();
  const titleError = !trimmed
    ? "Give the section a name"
    : pattern && !pattern.test(trimmed)
      ? "Use letters and spaces only, 2 to 30 characters"
      : null;

  const submitCustom = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (titleError) {
      customInput.current?.focus();
      return;
    }
    add("CUSTOM", "Custom Section", trimmed);
    closeCustom();
  };

  return (
    <div className="flex flex-col gap-3" data-focus-kind={focusKind ?? undefined}>
      <ul className="flex flex-col gap-1.5">
        {ROWS.map((row) => {
          const s = stateOf(row.kind);
          const Icon = row.icon;
          const isCustom = row.kind === "CUSTOM";
          const expanded = isCustom && customOpen && s.state === "available";
          return (
            <li
              key={row.key}
              ref={(el) => {
                if (el) rowRefs.current.set(row.key, el);
                else rowRefs.current.delete(row.key);
              }}
              tabIndex={-1}
              data-row={row.key}
              data-state={s.state}
              className="rounded-xl bg-paper-2/60 px-3 py-1 outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <div className="flex min-h-10 items-center gap-3 max-sm:min-h-11">
                <span aria-hidden className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-v2-green-soft text-v2-green-ink">
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <span className={cn("min-w-0 flex-1 truncate text-[14px] font-semibold", s.state === "disabled" ? "text-muted" : "text-ink")}>{row.label}</span>

                {s.state === "added" && (
                  <span className="inline-flex flex-none items-center gap-1.5 text-[12.5px] text-muted">
                    <CheckCircleIcon aria-hidden className="h-5 w-5 text-v2-green" />
                    Already added
                  </span>
                )}

                {s.state === "available" && (
                  <button
                    ref={(el) => {
                      if (el) buttonRefs.current.set(row.key, el);
                      else buttonRefs.current.delete(row.key);
                    }}
                    type="button"
                    aria-label={isCustom ? "Add a custom section" : `Add ${row.label} to resume`}
                    aria-expanded={isCustom ? expanded : undefined}
                    onClick={() => {
                      if (isCustom) {
                        if (customOpen) closeCustom();
                        else setCustomOpen(true);
                      } else if (row.kind) add(row.kind, row.label);
                    }}
                    className="inline-flex min-h-9 flex-none items-center gap-2 rounded-full max-sm:min-h-11 pl-1 pr-2 text-[12.5px] text-ink-soft hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    <span aria-hidden className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-v2-line bg-paper text-ink">
                      <PlusIcon className="h-4 w-4" />
                    </span>
                    Add to resume
                  </button>
                )}

                {s.state === "disabled" && (
                  <Tooltip content={s.hint ?? s.label} side="left">
                    <span
                      tabIndex={0}
                      role="note"
                      aria-label={`${row.label}: ${s.label}${s.hint ? `. ${s.hint}` : ""}`}
                      className="flex-none rounded-md text-[12.5px] text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      {s.label}
                    </span>
                  </Tooltip>
                )}
              </div>

              {expanded && (
                <form onSubmit={submitCustom} noValidate className="flex flex-col gap-1.5 pb-1 pl-12 pt-1">
                  <div className="flex items-center gap-2">
                    <input
                      ref={customInput}
                      autoFocus
                      aria-label="Section name"
                      placeholder="Section name"
                      maxLength={MAX_TITLE_CHARS}
                      value={title}
                      aria-invalid={touched && titleError ? true : undefined}
                      aria-describedby="rb-add-custom-hint"
                      onChange={(e) => setTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          e.preventDefault(); // the sheet closes on Esc; here it only cancels the title
                          e.stopPropagation();
                          closeCustom();
                          focusRow("CUSTOM");
                        }
                      }}
                      className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-paper px-3 text-[14px] text-ink outline-none placeholder:text-muted focus:border-accent aria-[invalid=true]:border-danger"
                    />
                    <button
                      type="submit"
                      className="inline-flex min-h-11 flex-none items-center rounded-lg bg-accent px-4 text-[13.5px] font-bold text-accent-ink hover:bg-accent-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      Add
                    </button>
                  </div>
                  <p id="rb-add-custom-hint" className={cn("text-[12px]", touched && titleError ? "text-danger-text" : "text-muted")}>
                    {touched && titleError ? titleError : pattern ? PLAIN_HEADING_HINT : "Name it anything, like Volunteering or Publications"}
                  </p>
                </form>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex items-center gap-3 rounded-2xl bg-v2-green-soft px-4 py-3">
        <AppArt name="mascot-wave-laptop" height={80} className="flex-none" />
        <div className="min-w-0">
          <p className="font-display text-[15px] font-extrabold text-ink">Pro tip!</p>
          <p className="mt-0.5 text-[13px] leading-snug text-ink-soft">Add relevant sections to showcase your unique strengths.</p>
        </div>
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {announce}
      </p>
    </div>
  );
}

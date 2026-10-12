"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Dispatch } from "react";
import { controlStates } from "@kiwiply/ui";
import type { ResumeDocument, ResumeTheme, TemplateCapabilities } from "@kiwiply/ui";
import { CanvasProvider, type FocusRequest } from "./canvasContext";
import CanvasReorder from "./CanvasReorder";
import HeaderBlock from "./HeaderBlock";
import { useMoveAnnouncement } from "./moveLink";
import SectionBlock from "./SectionBlock";
import type { DocLimits, EditorAction } from "./state/types";
import { canvasThemeStyle } from "./themeEdit";

/**
 * The document canvas (DESIGN 10.5), the centre of the editor: the header block, then every section in
 * document order, drawn in the editor skin (the document's structure made legible for editing, not the
 * template's render). The template's capabilities decide what the controls offer (`controlStates`:
 * the photo slot, whether a heading can be renamed, the mark toolbar's buttons); the limits are the
 * builder config's. Every edit is a reducer action; this component holds no document state.
 *
 * Moving focus after a structural change (a new item, a split bullet) is a queue the blocks write to
 * through the context: after the next render the field with that `data-field` id takes focus.
 */
export default function DocumentCanvas({
  doc,
  caps,
  theme = null,
  limits,
  dispatch,
  errorField,
  canUndo,
  canRedo,
  aiAllowed,
  onAddSection,
  reorder = false,
}: {
  doc: ResumeDocument;
  caps: TemplateCapabilities;
  /** The stored presentation (Pick Template): the canvas follows its accent, font pair and spacing, as far as `caps` allow. */
  theme?: Partial<ResumeTheme> | null;
  limits: DocLimits;
  dispatch: Dispatch<EditorAction>;
  /** The `data-field` id the last 422 pointed at (`state/paths.ts`), or null. */
  errorField: string | null;
  canUndo: boolean;
  canRedo: boolean;
  /** The plan has builder AI (the Summary's "Rewrite with AI" is a lock when not). */
  aiAllowed: boolean;
  /** "Start with a summary" on an empty resume opens the Add Section panel. */
  onAddSection: () => void;
  /** The Swap Section panel is open: item rows get a drag grip (R2.2). */
  reorder?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const pending = useRef<FocusRequest | null>(null);
  const requestFocus = useCallback((req: FocusRequest) => {
    pending.current = req;
  }, []);

  // After every render: honour a queued focus request (an item that was just added, a bullet that split or merged).
  useEffect(() => {
    const p = pending.current;
    if (!p || !root.current) return;
    const el = root.current.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-field="${p.field}"]`);
    if (!el) return;
    pending.current = null;
    el.focus();
    if (p.caret !== undefined && "setSelectionRange" in el) {
      const at = p.caret === "end" ? el.value.length : p.caret;
      try {
        el.setSelectionRange(at, at);
      } catch {
        /* an input type without a caret (a date, a checkbox) */
      }
    }
  });

  // A save the server refused (422): bring the field it named into view.
  useEffect(() => {
    if (!errorField || !root.current) return;
    const el = root.current.querySelector<HTMLElement>(`[data-field="${errorField}"]`);
    el?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  }, [errorField]);

  // A move made with the canvas's own arrows / menus is announced here ("Moved X to position 2 of 3 in Experience");
  // while the Swap Section panel is open it has the live region, so this one stays quiet.
  const moved = useMoveAnnouncement();

  const controls = useMemo(() => controlStates(doc, caps), [doc, caps]);
  const value = useMemo(
    () => ({ dispatch, caps, controls, limits, errorField, requestFocus, canUndo, canRedo, aiAllowed, reorder }),
    [dispatch, caps, controls, limits, errorField, requestFocus, canUndo, canRedo, aiAllowed, reorder],
  );

  return (
    <CanvasProvider value={value}>
      <div
        ref={root}
        data-canvas
        style={canvasThemeStyle(theme, caps)}
        className="flex flex-col gap-[calc(1.75rem*var(--rb-doc-density,1))] rounded-2xl border border-v2-line/70 bg-paper p-4 font-body shadow-v2-soft [--font-body:var(--rb-doc-font-body)] [--font-display:var(--rb-doc-font-display)] sm:p-6"
      >
        <HeaderBlock basics={doc.basics} />

        {doc.sections.length === 0 && (
          <div className="rounded-xl border border-dashed border-line bg-paper-2/50 px-4 py-6 text-center">
            <p className="text-[14px] text-ink-soft">This resume has no sections yet.</p>
            <button
              type="button"
              onClick={onAddSection}
              className="mt-2 inline-flex min-h-9 items-center rounded-lg px-3 text-[14px] font-bold text-v2-green-ink hover:bg-v2-green-soft max-sm:min-h-11"
            >
              Start with a summary
            </button>
          </div>
        )}

        <CanvasReorder doc={doc} caps={caps} dispatch={dispatch}>
          {doc.sections.map((section, i) => (
            <SectionBlock key={section.id} section={section} index={i} count={doc.sections.length} />
          ))}
        </CanvasReorder>

        <p role="status" aria-live="polite" data-move-status className="sr-only">
          {reorder ? "" : moved}
        </p>
      </div>
    </CanvasProvider>
  );
}

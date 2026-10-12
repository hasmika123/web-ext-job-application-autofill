"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { cn } from "@kiwiply/ui";
import { putDoc, type ResumeDocDTO } from "@/lib/resume-doc";
import ConflictDialog from "./ConflictDialog";
import EditorTopBar from "./EditorTopBar";
import PreviewPane from "./PreviewPane";
import SectionEditor from "./SectionEditor";
import SectionsRail, { sectionTitle } from "./SectionsRail";
import { createAutosave, type Autosave } from "./state/autosave";
import { canRedoEdit, canUndoEdit, currentDoc, editorReducer, hasUnsaved, initEditorState, saveStatus } from "./state/reducer";

type PhoneTab = "edit" | "preview";

/**
 * The Resume Builder editor (R0.5 skeleton). A client island over one reducer (`state/reducer`):
 * Sections rail, the active section's editor, and a live preview, with autosave (`state/autosave`,
 * `PUT /api/resumes/:id/doc` + `If-Match`) and undo/redo. Phone: Edit / Preview bottom tabs.
 */
export default function ResumeEditor({ initial, plan }: { initial: ResumeDocDTO; plan: "FREE" | "PRO" }) {
  const resumeId = initial.resumeId;
  const initialVersion = initial.docVersion;
  const [state, dispatch] = useReducer(editorReducer, initial, (dto) =>
    initEditorState({ doc: dto.doc, templateId: dto.templateId, theme: dto.theme, docVersion: dto.docVersion }),
  );
  const doc = currentDoc(state);

  const [activeId, setActiveId] = useState(() => (doc.sections.find((s) => s.kind === "EXPERIENCE") ?? doc.sections[0])?.id ?? "");
  const [tab, setTab] = useState<PhoneTab>("edit");
  const [now, setNow] = useState(() => Date.now());
  const autosave = useRef<Autosave | null>(null);

  /* ── autosave controller: one per resume ─────────────────────────────────────────────── */
  useEffect(() => {
    const a = createAutosave({
      version: initialVersion,
      rev: 0,
      save: ({ doc: d, version }) => putDoc(resumeId, version, { doc: d }),
      onSaving: () => dispatch({ type: "save/start" }),
      onSaved: (rev, version) => dispatch({ type: "save/ok", rev, version, at: Date.now() }),
      onRetrying: () => dispatch({ type: "save/retrying" }),
      onConflict: (serverVersion, serverDoc) => dispatch({ type: "save/conflict", serverVersion, doc: serverDoc }),
      onFailed: (message) => dispatch({ type: "save/failed", message }),
    });
    autosave.current = a;
    return () => {
      a.dispose();
      autosave.current = null;
    };
  }, [resumeId, initialVersion]);

  // Every change of the document tells the controller; it debounces and serialises.
  useEffect(() => {
    autosave.current?.schedule({ doc, rev: state.rev });
  }, [doc, state.rev]);

  /* ── leaving the page: warn when unsaved, flush when the tab is hidden ───────────────── */
  const unsaved = hasUnsaved(state) || state.phase === "conflict";
  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void autosave.current?.flush();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);

  /* ── "Saved · N min ago" stays honest ────────────────────────────────────────────────── */
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  /* ── Ctrl/⌘ Z, Shift Ctrl/⌘ Z (and Ctrl Y) ─────────────────────────────────────────── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || state.phase === "conflict") return;
      const k = e.key.toLowerCase();
      if (k === "z") {
        e.preventDefault(); // also replaces the textarea's own undo, which would fight the controlled value
        dispatch({ type: e.shiftKey ? "history/redo" : "history/undo" });
      } else if (k === "y" && !e.metaKey) {
        e.preventDefault();
        dispatch({ type: "history/redo" });
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [state.phase]);

  const active = useMemo(() => doc.sections.find((s) => s.id === activeId) ?? doc.sections[0], [doc.sections, activeId]);
  const status = saveStatus(state);

  const keepMine = () => {
    const c = state.conflict;
    if (!c) return;
    dispatch({ type: "conflict/keepMine" });
    autosave.current?.resume(c.serverVersion);
  };
  const takeTheirs = () => {
    const c = state.conflict;
    if (!c) return;
    dispatch({ type: "conflict/takeTheirs" });
    autosave.current?.reset(c.serverVersion, state.rev + 1);
  };

  return (
    <div data-plan={plan} className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 pb-20 md:pb-0">
      <EditorTopBar
        title={doc.meta.title}
        onTitleChange={(title) => dispatch({ type: "title/edit", title, at: Date.now() })}
        onTitleBlur={() => {
          if (!doc.meta.title.trim()) dispatch({ type: "title/edit", title: "Untitled resume", at: Date.now() });
        }}
        status={status}
        savedAt={state.savedAt}
        now={Math.max(now, state.savedAt ?? 0)}
        error={state.error}
        canUndo={canUndoEdit(state)}
        canRedo={canRedoEdit(state)}
        onUndo={() => dispatch({ type: "history/undo" })}
        onRedo={() => dispatch({ type: "history/redo" })}
      />

      <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-[200px_minmax(0,1fr)_minmax(0,1fr)]">
        <SectionsRail
          sections={doc.sections}
          activeId={active?.id ?? ""}
          onSelect={setActiveId}
          className={cn("md:col-span-2 xl:col-span-1", tab === "preview" && "max-md:hidden")}
        />

        <section
          aria-label="Editor"
          className={cn(
            "min-w-0 rounded-2xl border border-v2-line/70 bg-paper p-4 shadow-v2-soft sm:p-5",
            tab === "preview" && "max-md:hidden",
          )}
        >
          {active ? (
            <>
              <h2 className="mb-3 font-display text-[18px] font-extrabold tracking-tight text-ink">{sectionTitle(active)}</h2>
              <SectionEditor key={active.id} section={active} dispatch={dispatch} />
            </>
          ) : (
            <p className="text-[13.5px] text-ink-soft">This resume has no sections yet.</p>
          )}
        </section>

        <PreviewPane
          doc={doc}
          theme={state.theme}
          templateId={state.templateId}
          className={cn("md:sticky md:top-36", tab === "edit" && "max-md:hidden")}
        />
      </div>

      <div
        role="tablist"
        aria-label="Edit or preview"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-2 border-t border-line/70 bg-paper/95 backdrop-blur md:hidden"
      >
        {(["edit", "preview"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              "min-h-14 text-[14px] font-semibold capitalize transition-colors",
              tab === t ? "border-t-2 border-accent text-ink" : "border-t-2 border-transparent text-ink-soft",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <ConflictDialog open={state.phase === "conflict"} onKeepMine={keepMine} onTakeTheirs={takeTheirs} />
    </div>
  );
}

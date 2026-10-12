"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { ChartIcon, ChoiceGroup, FileTextIcon, Tooltip, cn, SideSheet, resolveCapabilities, useToast } from "@kiwiply/ui";
import type { ResumeSectionKind } from "@kiwiply/ui";
import type { ResumeBuilderConfig } from "@/lib/resume-builder-config";
import { exportPdf, exportText, putDoc, saveBlob, type ResumeDocDTO } from "@/lib/resume-doc";
import ConflictDialog from "./ConflictDialog";
import EditorTopBar from "./EditorTopBar";
import HiddenContentBar from "./HiddenContentBar";
import RailStrip from "./RailStrip";
import RightRail from "./RightRail";
import SectionEditor from "./SectionEditor";
import SectionTabs from "./SectionTabs";
import AddSectionPanel from "./panels/AddSectionPanel";
import PickTemplatePanel from "./panels/PickTemplatePanel";
import { PANEL_META, PANEL_ORDER } from "./panels/panelMeta";
import PanelPlaceholder from "./panels/PanelPlaceholder";
import SwapSectionPanel from "./panels/SwapSectionPanel";
import TailorPanel from "./panels/TailorPanel";
import PrintLayoutView from "./views/PrintLayoutView";
import { BASICS_BLOCK_ID, blockId, sectionTitle } from "./sectionTitle";
import { createAutosave, type Autosave } from "./state/autosave";
import { currentDoc, editorReducer, hasUnsaved, initEditorState, saveStatus } from "./state/reducer";
import {
  LEFT_SHEET_WIDTH,
  RAIL_STRIP_WIDTH,
  RAIL_WIDTH,
  RIGHT_SHEET_WIDTH,
  useUiState,
  type LeftPanel,
  type PhoneTab,
  type RailTab,
  type RightView,
} from "./state/ui";
import { canvasThemeStyle } from "./themeEdit";
import { useBuilderLayout } from "./useBuilderLayout";
import { usePresentation } from "./usePresentation";

/** A resume with nothing in it opens Add Section once (DESIGN 10.3). */
function isEmptyDoc(doc: ResumeDocDTO["doc"]): boolean {
  return doc.sections.every((s) => s.items.length === 0);
}

const PHONE_TABS: ReadonlyArray<{ value: PhoneTab; label: string }> = [
  { value: "edit", label: "Edit" },
  { value: "layout", label: "Layout" },
  { value: "insights", label: "Insights" },
  { value: "preview", label: "Preview" },
];

export interface ResumeEditorProps {
  initial: ResumeDocDTO;
  plan: "FREE" | "PRO";
  /** The builder settings (limits, switches, plan, AI): read on the server, never hard-coded here. */
  config: ResumeBuilderConfig;
  /** The AI meter's words (`describeAiUsage`, computed on the server) or null. */
  aiUsageLine?: { headline: string; detail: string } | null;
  /** When the Common Profile last changed; the sync banner (R3.x) compares it to `meta.profileSyncedAt`. */
  profileUpdatedAt?: string | null;
  /** The job this resume targets: always null until R5.6. */
  jobTarget?: null;
  /** Open AI suggestion cards: always empty until R4.1. */
  openProposals?: ReadonlyArray<{ id: string }>;
}

/**
 * The Resume Builder editor shell, to the v3 boards (DESIGN 10.1): a full-bleed top bar, a dynamic LEFT
 * side-nav (`SideSheet`: Add Section / Pick Template / Swap Section / Tailor to Job), the document
 * with its section tabs, the RIGHT rail (Insights / AI Suggestions / Job Match, collapsing to a 56 px
 * strip while the left sheet is open and short of room: rail collapse, DECISIONS #28) and a right
 * sheet for Print layout / PDF view (R3.8). A client island over `state/reducer` (document, autosave,
 * undo) and `state/ui` (panels, layout). Phone: a bottom tab bar, every sheet fullscreen.
 */
export default function ResumeEditor({ initial, plan, config, aiUsageLine = null, openProposals = [] }: ResumeEditorProps) {
  const resumeId = initial.resumeId;
  const initialVersion = initial.docVersion;
  const router = useRouter();
  const toast = useToast();
  const [state, dispatch] = useReducer(editorReducer, initial, (dto) =>
    initEditorState({ doc: dto.doc, templateId: dto.templateId, theme: dto.theme, docVersion: dto.docVersion }),
  );
  const doc = currentDoc(state);

  const [ui, uiDispatch] = useUiState({ openAdd: isEmptyDoc(initial.doc) });
  const gridRef = useRef<HTMLDivElement>(null);
  useBuilderLayout(gridRef, uiDispatch);
  const { layout } = ui;
  const phone = layout.viewport === "phone";
  const compact = phone || layout.viewport === "tablet";

  const [now, setNow] = useState(() => Date.now());
  const [loadedAt] = useState(() => {
    const t = initial.updatedAt ? Date.parse(initial.updatedAt) : Number.NaN;
    return Number.isFinite(t) ? t : null;
  });
  const autosave = useRef<Autosave | null>(null);
  const [exporting, setExporting] = useState(false);
  const latestRev = useRef(state.rev);
  const conflicted = useRef(false);
  useEffect(() => {
    latestRev.current = state.rev;
    conflicted.current = state.phase === "conflict";
  }, [state.rev, state.phase]);

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

  /* ── template + theme (R2.4): optimistic, saved by PATCH, the autosave held around each ─── */
  const caps = useMemo(() => resolveCapabilities(state.templateId, config.templates.overrides), [state.templateId, config.templates.overrides]);
  const presentation = usePresentation({ resumeId, autosave, templateId: state.templateId, theme: state.theme, doc, config, dispatch });

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

  /* ── "Saved N minutes ago" stays honest ──────────────────────────────────────────────── */
  useEffect(() => {
    // config-literal-ok: repaint tick for the "Saved N min ago" label (display only), not a builder timing
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  /* ── Ctrl/⌘ Z, Shift Ctrl/⌘ Z (and Ctrl Y): undo/redo live on the keys (not the bar) ────── */
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

  const status = saveStatus(state);

  /* ── panels: open / switch / close, the buttons' refs, where focus returns ───────────── */
  const addRef = useRef<HTMLButtonElement>(null);
  const templateRef = useRef<HTMLButtonElement>(null);
  const swapRef = useRef<HTMLButtonElement>(null);
  const tailorRef = useRef<HTMLButtonElement>(null);
  const panelRefs = useMemo(() => ({ add: addRef, template: templateRef, swap: swapRef, tailor: tailorRef }), []);
  const layoutTabRef = useRef<HTMLButtonElement>(null);
  const insightsTabRef = useRef<HTMLButtonElement>(null);
  const previewTabRef = useRef<HTMLButtonElement>(null);
  const downloadRef = useRef<HTMLSpanElement>(null);
  const scrollRef = useRef<HTMLElement>(null);
  const [addFocusKind, setAddFocusKind] = useState<ResumeSectionKind | null>(null);

  // The sheet keeps its panel's title while it slides out.
  const [shownPanel, setShownPanel] = useState<LeftPanel>("add");
  if (ui.leftPanel && ui.leftPanel !== shownPanel) setShownPanel(ui.leftPanel);
  const [shownView, setShownView] = useState<RightView>("print");
  if (ui.rightView && ui.rightView !== shownView) setShownView(ui.rightView);

  // On a phone the Layout sheet is open only on the Layout tab (a remembered panel does not open by itself).
  const leftOpen = ui.leftPanel !== null && (!phone || ui.phoneTab === "layout");
  const rightOpen = ui.rightView !== null;
  const railSheetOpen = compact && ui.phoneTab === "insights";

  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (phone) returnFocus.current = layoutTabRef.current;
    else if (ui.leftPanel) returnFocus.current = panelRefs[ui.leftPanel].current;
  }, [phone, ui.leftPanel, panelRefs]);
  const railReturnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    railReturnFocus.current = insightsTabRef.current;
  }, [phone]);
  // The right sheet hands focus back to what opened it: the Preview tab on a phone, else the Download button.
  const rightReturnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    rightReturnFocus.current = phone ? previewTabRef.current : (downloadRef.current?.querySelector<HTMLElement>('[aria-haspopup="menu"] button') ?? null);
  }, [phone]);

  const togglePanel = useCallback((panel: LeftPanel) => uiDispatch({ type: "panel/toggle", panel }), [uiDispatch]);
  const openPanel = useCallback(
    (panel: LeftPanel) => {
      if (ui.leftPanel !== panel) uiDispatch({ type: "panel/toggle", panel });
      if (compact) {
        uiDispatch({ type: "rightView/close" });
        uiDispatch({ type: "phone/tab", tab: "layout" });
      }
    },
    [ui.leftPanel, compact, uiDispatch],
  );
  const closeLeft = useCallback(() => {
    uiDispatch({ type: "panel/close" });
    if (compact) uiDispatch({ type: "phone/tab", tab: "edit" });
  }, [compact, uiDispatch]);
  const closeRight = useCallback(() => {
    uiDispatch({ type: "rightView/close" });
    if (compact) uiDispatch({ type: "phone/tab", tab: "edit" });
  }, [compact, uiDispatch]);
  /** Download ▾ → Print layout / Alt+P: open the view, or close it when it is the open one (one right view at a time). */
  const toggleView = useCallback(
    (view: RightView) => {
      if (view === "print" && !config.features.printLayout) return;
      if (ui.rightView === view) {
        closeRight();
        return;
      }
      if (compact) {
        uiDispatch({ type: "panel/close" });
        uiDispatch({ type: "phone/tab", tab: "preview" });
      }
      uiDispatch({ type: "rightView/toggle", view });
    },
    [config.features.printLayout, ui.rightView, compact, closeRight, uiDispatch],
  );
  const closeRailSheet = useCallback(() => uiDispatch({ type: "phone/tab", tab: "edit" }), [uiDispatch]);
  const closeAll = useCallback(() => {
    uiDispatch({ type: "panel/close" });
    uiDispatch({ type: "rightView/close" });
    uiDispatch({ type: "phone/tab", tab: "edit" });
  }, [uiDispatch]);

  /** The bottom tab bar (phone) / Insights bar (tablet): one sheet at a time, the open tab closes. */
  const selectPhoneTab = (picked: PhoneTab) => {
    const tab = picked === ui.phoneTab ? "edit" : picked;
    if (tab === "layout") {
      if (!ui.leftPanel) uiDispatch({ type: "panel/toggle", panel: "add" });
      uiDispatch({ type: "rightView/close" });
    } else if (tab === "preview") {
      uiDispatch({ type: "panel/close" });
      if (!ui.rightView) uiDispatch({ type: "rightView/toggle", view: "print" });
    } else {
      uiDispatch({ type: "panel/close" });
      uiDispatch({ type: "rightView/close" });
    }
    uiDispatch({ type: "phone/tab", tab });
  };

  const openAddFor = useCallback(
    (kind: ResumeSectionKind | null) => {
      setAddFocusKind(kind);
      openPanel("add");
    },
    [openPanel],
  );

  /* Alt+1..4 toggle the four panels, Alt+D opens the Download menu, Alt+P toggles Print layout (desktop and tablet). */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || phone) return;
      const digit = /^Digit([1-4])$/.exec(e.code)?.[1] ?? (/^[1-4]$/.test(e.key) ? e.key : null);
      if (digit) {
        const panel = PANEL_ORDER[Number(digit) - 1];
        if (panel === "tailor" && !config.features.tailor) return;
        e.preventDefault();
        togglePanel(panel);
      } else if (e.code === "KeyD" || e.key.toLowerCase() === "d") {
        e.preventDefault();
        downloadRef.current?.querySelector<HTMLElement>('[aria-haspopup="menu"]')?.click();
      } else if (e.code === "KeyP" || e.key.toLowerCase() === "p") {
        e.preventDefault();
        toggleView("print");
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [phone, config.features.tailor, togglePanel, toggleView]);

  /* Phone/tablet: one history entry per open sheet so the Back button closes it. */
  const modalOpen = compact && (leftOpen || railSheetOpen || rightOpen);
  const pushed = useRef(false);
  useEffect(() => {
    if (modalOpen && !pushed.current) {
      pushed.current = true;
      window.history.pushState({ ...(window.history.state as object | null), rbSheet: true }, "");
    } else if (!modalOpen && pushed.current) {
      pushed.current = false;
      if ((window.history.state as { rbSheet?: boolean } | null)?.rbSheet) window.history.back();
    }
  }, [modalOpen]);
  useEffect(() => {
    const onPop = () => {
      if (!pushed.current) return;
      pushed.current = false;
      closeAll();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [closeAll]);

  /* ── exports: both need the SAVED document, so save first and refuse if that fails ───── */
  const savedFirst = async (what: string): Promise<boolean> => {
    await presentation.flush(); // a theme still in its 500 ms debounce is part of "what's saved"
    await autosave.current?.flush();
    if ((autosave.current?.savedRev ?? 0) < latestRev.current) {
      toast({ title: `Couldn't ${what} yet`, description: "Your latest changes aren't saved. Fix the save problem shown above, then try again.", variant: "error" });
      return false;
    }
    return true;
  };

  const downloadPdf = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      if (!(await savedFirst("export"))) return;
      const res = await exportPdf(resumeId);
      if (res.kind === "error") {
        toast({ title: "Couldn't make the PDF", description: res.message, variant: "error" });
        return;
      }
      saveBlob(res.blob, res.fileName);
      const pages = `${res.pages} ${res.pages === 1 ? "page" : "pages"}`;
      toast({
        title: "PDF ready",
        variant: res.stored && res.fits ? "success" : "default",
        description: !res.stored
          ? `${pages}. It downloaded, but couldn't be attached to this resume - try again.`
          : res.fits
            ? `${pages}. Saved to this resume too, so the extension can attach it.`
            : `${pages} - still over your page target. Hide a section or shorten bullets to fit.`,
      });
    } finally {
      setExporting(false);
    }
  };

  const downloadText = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      if (!(await savedFirst("download"))) return;
      const res = await exportText(resumeId);
      if (res.kind === "error") {
        toast({ title: "Couldn't make the text file", description: res.message, variant: "error" });
        return;
      }
      saveBlob(res.blob, res.fileName);
      toast({ title: "Text file ready", description: "Plain text, the way an ATS reads your resume.", variant: "success" });
    } finally {
      setExporting(false);
    }
  };

  /* ✕: save what can be saved, then leave; the unsaved guard asks only when something is still not saved. */
  const closeEditor = async () => {
    await presentation.flush();
    await autosave.current?.flush();
    const stillUnsaved = (autosave.current?.savedRev ?? 0) < latestRev.current || conflicted.current;
    if (stillUnsaved && !window.confirm("Your latest changes aren't saved. Leave anyway?")) return;
    router.push("/resume-builder");
  };

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

  /* ── layout numbers ──────────────────────────────────────────────────────────────────── */
  const railTrack = layout.railCollapsed ? RAIL_STRIP_WIDTH : RAIL_WIDTH;
  const leftPush = leftOpen && layout.leftMode === "push";
  const rightPush = rightOpen && layout.rightMode === "push";
  const suggestionCount = openProposals.length;
  const onRailTab = (tab: RailTab) => uiDispatch({ type: "rail/tab", tab });

  const meta = PANEL_META[shownPanel];
  const leftBody = (
    <>
      {phone && (
        <ChoiceGroup
          aria-label="Layout panels"
          className="mb-4"
          options={PANEL_ORDER.filter((p) => p !== "tailor" || config.features.tailor).map((p) => ({ value: p, label: PANEL_META[p].title }))}
          value={shownPanel}
          onChange={(v) => openPanel(v as LeftPanel)}
        />
      )}
      {shownPanel === "add" && <AddSectionPanel focusKind={addFocusKind} />}
      {shownPanel === "template" && (
        <PickTemplatePanel doc={doc} templateId={state.templateId} theme={state.theme} config={config} controls={presentation} disabled={state.phase === "conflict"} />
      )}
      {shownPanel === "swap" && <SwapSectionPanel />}
      {shownPanel === "tailor" && <TailorPanel />}
    </>
  );

  const rightTitle = phone ? "Preview" : shownView === "pdf" ? "PDF view" : "Print layout";
  const rightDescription = shownView === "pdf" ? "Arrives with the PDF view" : "See how your resume paginates on paper";

  const rail = (
    <RightRail
      tab={ui.railTab}
      onTab={onRailTab}
      config={config}
      aiUsageLine={aiUsageLine}
      suggestionCount={suggestionCount}
      onTailor={() => openPanel("tailor")}
    />
  );

  return (
    <div data-plan={plan} className="flex h-dvh min-h-0 flex-col bg-v2-canvas">
      <EditorTopBar
        status={status}
        savedAt={state.savedAt ?? loadedAt}
        now={Math.max(now, state.savedAt ?? loadedAt ?? 0)}
        error={state.error}
        leftPanel={ui.leftPanel}
        onTogglePanel={togglePanel}
        panelRefs={panelRefs}
        showTailor={config.features.tailor}
        onDownloadPdf={downloadPdf}
        onDownloadText={downloadText}
        exporting={exporting}
        exportDisabled={state.phase === "conflict"}
        downloadRef={downloadRef}
        rightView={ui.rightView}
        onToggleView={toggleView}
        printLayout={config.features.printLayout}
        onClose={closeEditor}
      />

      <div
        ref={gridRef}
        data-rail={layout.railCollapsed ? "collapsed" : "full"}
        data-viewport={layout.viewport}
        style={{ "--rb-rail": `${railTrack}px` } as CSSProperties}
        className="grid min-h-0 flex-1 grid-cols-[auto_minmax(0,1fr)_0px_auto] pt-4 lg:grid-cols-[auto_minmax(0,1fr)_var(--rb-rail)_auto]"
      >
        {/* left side-nav */}
        <div className={cn("col-start-1 row-start-1 min-h-0 transition-[padding] duration-200", leftPush && "pb-4 pl-4")}>
          <SideSheet
            id="rb-left-sheet"
            side="left"
            mode={layout.leftMode}
            open={leftOpen}
            width={LEFT_SHEET_WIDTH}
            title={meta.title}
            description={meta.description}
            icon={meta.icon}
            onClose={closeLeft}
            returnFocusTo={returnFocus}
          >
            {leftBody}
          </SideSheet>
        </div>

        {/* the document */}
        <main
          ref={scrollRef}
          aria-label="Editor"
          className="col-start-2 row-start-1 min-h-0 min-w-0 overflow-y-auto px-4 pb-4 max-md:pb-24 md:max-lg:pb-20"
        >
          <div className="mx-auto flex max-w-[880px] flex-col gap-4">
            {/* Interim rename field until the resume header bar (R3.9) and the canvas name block (R2.1). */}
            <label className="flex items-center gap-3 rounded-2xl border border-v2-line/70 bg-paper px-4 py-2 shadow-v2-soft">
              <span className="flex-none text-[12.5px] font-semibold text-ink-soft">Resume name</span>
              <input
                value={doc.meta.title}
                // config-literal-ok: meta.title maxLength is a schema constant (DESIGN 3.1), not a settings key
                maxLength={200}
                onChange={(e) => dispatch({ type: "title/edit", title: e.target.value, at: Date.now() })}
                onBlur={() => {
                  if (!doc.meta.title.trim()) dispatch({ type: "title/edit", title: "Untitled resume", at: Date.now() });
                }}
                placeholder="Untitled resume"
                className="min-h-11 min-w-0 flex-1 truncate rounded-lg border border-transparent bg-transparent px-2 font-display text-[16px] font-bold text-ink outline-none hover:border-line focus:border-accent focus:bg-paper"
              />
            </label>

            <SectionTabs
              sections={doc.sections}
              activeId={ui.activeSectionId}
              onActiveChange={(id) => uiDispatch({ type: "section/active", id })}
              scrollRootRef={scrollRef}
              onAddSection={openAddFor}
              className="sticky top-0 z-10 rounded-2xl border shadow-v2-soft"
            />

            <HiddenContentBar doc={doc} theme={state.theme} caps={caps} />

            {/* Placeholder blocks (the R0 section editors) until the document canvas, R2.1; they follow the accent / font the template allows. */}
            <div
              style={canvasThemeStyle(state.theme, caps)}
              className="flex flex-col gap-8 rounded-2xl border border-v2-line/70 bg-paper p-4 shadow-v2-soft sm:p-6 [&_h2]:text-[color:var(--rb-doc-accent)] [&_h2]:[font-family:var(--rb-doc-font-display)]! [&_p]:[font-family:var(--rb-doc-font-body)]"
            >
              <section id={BASICS_BLOCK_ID} aria-label="Personal info" className="rb-block scroll-mt-20">
                <h2 className="font-display text-[26px] font-extrabold tracking-tight text-ink">{doc.basics.name?.trim() || "Your name"}</h2>
                {doc.basics.headline?.trim() && <p className="text-[15px] text-ink-soft">{doc.basics.headline}</p>}
                <p className="mt-2 text-[13px] text-ink-soft">
                  {[doc.basics.location, doc.basics.phone, doc.basics.email].filter(Boolean).join("  ·  ") || "No contact details yet."}
                </p>
                <p className="mt-2 text-[12.5px] text-muted">Editing your header arrives with the document canvas.</p>
              </section>

              {doc.sections.length === 0 && <p className="text-[13.5px] text-ink-soft">This resume has no sections yet.</p>}
              {doc.sections.map((s) => (
                <section key={s.id} id={blockId(s.id)} aria-labelledby={`${blockId(s.id)}-h`} className="rb-block scroll-mt-20">
                  <h2
                    id={`${blockId(s.id)}-h`}
                    className="mb-3 flex items-center gap-2 font-display text-[16px] font-extrabold uppercase tracking-wide text-ink"
                  >
                    {sectionTitle(s)}
                    {s.hidden && <span className="rounded bg-paper-2 px-1.5 py-0.5 text-[10.5px] font-semibold normal-case tracking-normal text-ink-soft">Hidden</span>}
                  </h2>
                  <SectionEditor section={s} dispatch={dispatch} />
                </section>
              ))}
            </div>
          </div>
        </main>

        {/* right rail, or its 56 px strip while the left sheet is open and short of room */}
        <div className="col-start-3 row-start-1 hidden min-h-0 lg:block">
          <div className="h-full overflow-y-auto pb-4 pr-4" style={{ width: railTrack }}>
            {layout.railCollapsed ? (
              <div className="pr-0.5" data-rail-collapsed>
                <RailStrip
                  config={config}
                  suggestionCount={suggestionCount}
                  activeTab={ui.railTab}
                  onExpand={(tab) => uiDispatch({ type: "rail/expand", tab })}
                />
              </div>
            ) : (
              rail
            )}
          </div>
        </div>

        {/* right side-nav: Print layout / PDF view (R3.8), also the phone Preview sheet */}
        <div className={cn("col-start-4 row-start-1 min-h-0 transition-[padding] duration-200", rightPush && "pb-4 pr-4")}>
          <SideSheet
            id="rb-right-sheet"
            side="right"
            mode={layout.rightMode}
            open={rightOpen}
            width={RIGHT_SHEET_WIDTH}
            title={rightTitle}
            description={rightDescription}
            icon={<FileTextIcon className="h-5 w-5" />}
            onClose={closeRight}
            returnFocusTo={rightReturnFocus}
          >
            {phone && (
              <ChoiceGroup
                aria-label="Preview type"
                className="mb-4"
                options={[
                  { value: "print", label: "Print layout" },
                  { value: "pdf", label: "PDF view" },
                ]}
                value={shownView}
                onChange={(v) => uiDispatch({ type: "rightView/toggle", view: v as RightView })}
              />
            )}
            {shownView === "print" ? (
              <PrintLayoutView
                doc={doc}
                theme={state.theme}
                templateId={state.templateId}
                caps={caps}
                controls={presentation}
                onDownloadPdf={downloadPdf}
                exporting={exporting}
                disabled={state.phase === "conflict"}
                zoomable={phone}
              />
            ) : (
              <PanelPlaceholder panel="preview" comingIn="R3.3" />
            )}
          </SideSheet>
        </div>
      </div>

      {/* phone / tablet: the rail lives in a sheet (Insights tab / bar) */}
      <SideSheet
        id="rb-rail-sheet"
        side="right"
        mode={phone ? "fullscreen" : "overlay"}
        open={railSheetOpen}
        width={RAIL_WIDTH}
        title="Insights"
        description="Your score, suggestions and job match"
        icon={<ChartIcon className="h-5 w-5" />}
        onClose={closeRailSheet}
        returnFocusTo={railReturnFocus}
      >
        {rail}
      </SideSheet>

      {/* phone: Edit · Layout · Insights · Preview (DESIGN 10.9) */}
      <div
        role="tablist"
        aria-label="Editor views"
        className="fixed inset-x-0 bottom-0 z-30 grid h-14 grid-cols-4 border-t border-line/70 bg-paper md:hidden"
      >
        {PHONE_TABS.map((t) => {
          const selected = ui.phoneTab === t.value;
          return (
            <button
              key={t.value}
              ref={t.value === "layout" ? layoutTabRef : t.value === "insights" ? insightsTabRef : t.value === "preview" ? previewTabRef : undefined}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => selectPhoneTab(t.value)}
              className={cn(
                "min-h-11 text-[13px] font-semibold transition-colors",
                selected ? "border-t-2 border-accent-deep text-ink" : "border-t-2 border-transparent text-ink-soft",
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* tablet: the rail collapses to one Insights bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 hidden h-14 items-center justify-center border-t border-line/70 bg-paper md:flex lg:hidden">
        <Tooltip content="Score, suggestions and job match" side="top">
          <button
            type="button"
            aria-expanded={railSheetOpen}
            aria-controls="rb-rail-sheet"
            onClick={() => selectPhoneTab("insights")}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-[14px] font-semibold text-ink hover:bg-paper-2"
          >
            <ChartIcon className="h-4 w-4" /> Insights
          </button>
        </Tooltip>
      </div>

      <ConflictDialog open={state.phase === "conflict"} onKeepMine={keepMine} onTakeTheirs={takeTheirs} />
    </div>
  );
}

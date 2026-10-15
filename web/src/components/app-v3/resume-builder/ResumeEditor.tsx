"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { ChartIcon, ChoiceGroup, FileTextIcon, GearIcon, SavedTick, Tooltip, cn, SideSheet, failingRules, resolveCapabilities, sanitizeTheme, useBottomBar, useSavedFlash, useToast, SCORE_ADD_REF_PREFIX } from "@kiwiply/ui";
import type { ResumeScoreGroupId, ResumeSectionKind } from "@kiwiply/ui";
import { track } from "@/lib/analytics";
import { COPY, suggestionNeedsReview, type AiProposal } from "@/lib/resume-ai";
import type { ResumeBuilderConfig } from "@/lib/resume-builder-config.shared";
import { DEFAULT_BUILDER_CONFIG, capabilitiesOf } from "@/lib/resume-builder-config.shared";
import { useBuilderEnv } from "./builderEnv";
import {
  checkpointDoc,
  exportPdf,
  exportText,
  putDoc,
  requestPdfNow,
  saveBlob,
  waitForStoredPdf,
  type CheckpointResult,
  type ResumeDocDTO,
} from "@/lib/resume-doc";
import type { ResumeMeta } from "@/lib/resume-meta";
import { TRIM_LONGEST_COUNT, longestBullets } from "./ai/aiRefs";
import OpenRewriteBar from "./ai/OpenRewriteBar";
import ProposalDiff from "./ai/ProposalDiff";
import { useRewriteFlow } from "./ai/useRewriteFlow";
import ConflictDialog from "./ConflictDialog";
import DocumentCanvas from "./DocumentCanvas";
import EditorTopBar from "./EditorTopBar";
import HiddenContentBar from "./HiddenContentBar";
import RailStrip from "./RailStrip";
import ResumeHeaderBar from "./ResumeHeaderBar";
import ResumeSettingsSheet from "./ResumeSettingsSheet";
import RightRail from "./RightRail";
import SuggestionsSheet from "./rail/SuggestionsSheet";
import { useSuggestions } from "./rail/useSuggestions";
import SectionTabs from "./SectionTabs";
import TipsSheet from "./TipsSheet";
import { goToField } from "./goToField";
import { defaultVersionName } from "./headerBar";
import { useScoreReport } from "./useScoreReport";
import AddSectionPanel from "./panels/AddSectionPanel";
import PickTemplatePanel from "./panels/PickTemplatePanel";
import { PANEL_META, PANEL_ORDER } from "./panels/panelMeta";
import SwapSectionPanel from "./panels/SwapSectionPanel";
import TailorPanel from "./panels/TailorPanel";
import PdfView from "./views/PdfView";
import PrintLayoutView from "./views/PrintLayoutView";
import { createAutosave, type Autosave } from "./state/autosave";
import { fieldIdForPath } from "./state/paths";
import { canRedoEdit, canUndoEdit, currentDoc, editorReducer, hasUnsaved, initEditorState, saveStatus } from "./state/reducer";
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
import { useLeaveGuard } from "./useLeaveGuard";
import { useOnline } from "./useOnline";
import { usePdfStatus } from "./usePdfStatus";
import { VERSION_TOAST_MS } from "./uiTiming";
import { useBuilderLayout } from "./useBuilderLayout";
import { usePresentation } from "./usePresentation";

/** The right sheet's two document views; Resume settings (R3.12) is the third right view and has no Download entry. */
type PreviewView = Exclude<RightView, "settings">;

/** The section ids in order: when it changes between two saves, a section was added, removed or moved. */
const sectionSignature = (d: ResumeDocDTO["doc"]): string => d.sections.map((x) => x.id).join("|");

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
  /** The resume's metadata (name, primary, visibility, versions...) read on the server for the header bar; null = it reads it itself. */
  initialMeta?: ResumeMeta | null;
  /** The job this resume targets: always null until R5.6. */
  jobTarget?: null;
  /** The user's current primary resume (null = unknown): lets "Set as primary" offer Undo, which restores this one. */
  primaryResumeId?: number | null;
  /** Where to land (R2.6, the list's View / AI buttons): `?view=pdf` opens the PDF view, `?tab=ai` the AI Suggestions tab. */
  entry?: { view?: "pdf" | "settings"; tab?: "ai" };
}

/**
 * The Resume Builder editor shell, to the v3 boards (DESIGN 10.1): a full-bleed top bar, a dynamic LEFT
 * side-nav (`SideSheet`: Add Section / Pick Template / Swap Section / Tailor to Job), the document
 * with its section tabs, the RIGHT rail (Insights / AI Suggestions / Job Match, collapsing to a 56 px
 * strip while the left sheet is open and short of room: rail collapse, DECISIONS #28) and a right
 * sheet for Print layout / PDF view (R3.8). A client island over `state/reducer` (document, autosave,
 * undo) and `state/ui` (panels, layout). Phone: a bottom tab bar, every sheet fullscreen.
 */
export default function ResumeEditor({ initial, plan, config: serverConfig, aiUsageLine = null, entry, initialMeta = null, primaryResumeId = null }: ResumeEditorProps) {
  const env = useBuilderEnv();
  // Role-based restrictions of the ONE builder (personal, a consultant in an organization, a marketer acting for a consultant), decided by the API for this
  // session. Without AI in the session the AI affordances (rewrite, suggestions, job match, tailor, upsell locks) are not drawn at all; the API refuses them too.
  const builderCaps = capabilitiesOf(serverConfig);
  const config = useMemo<ResumeBuilderConfig>(
    () => (builderCaps.ai ? serverConfig : { ...serverConfig, aiAllowed: false, features: { ...serverConfig.features, aiSuggestions: false, jobMatch: false, tailor: false } }),
    [builderCaps.ai, serverConfig],
  );
  const resumeId = initial.resumeId;
  const initialVersion = initial.docVersion;
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  // The inline "saved" ticks: beside the field just edited (canvas), and on the Add Section / Pick Template buttons.
  const canvasSaved = useSavedFlash<"canvas">();
  const panelSaved = useSavedFlash<"section" | "template">();
  const flashPanel = panelSaved.flash; // stable
  const [tickAt, setTickAt] = useState<{ top: number; left: number } | null>(null);
  const [state, dispatch] = useReducer(editorReducer, initial, (dto) =>
    initEditorState({ doc: dto.doc, templateId: dto.templateId, theme: dto.theme, docVersion: dto.docVersion, limits: config.limits }),
  );
  const doc = currentDoc(state);
  // What the template can show decides what the canvas offers (DESIGN 6.4); the 422 ring names the field the server refused.
  const caps = useMemo(() => resolveCapabilities(state.templateId, config.templates.overrides), [state.templateId, config.templates.overrides]);
  const errorField = state.errorPath ? fieldIdForPath(doc, state.errorPath) : null;
  // The Resume Score (DESIGN 11): live, debounced; the BFF runs the same function on save.
  const theme = useMemo(() => sanitizeTheme(state.theme), [state.theme]);
  const report = useScoreReport(doc, caps, theme, config.score);
  // config-literal-ok: percent conversion of the settings' 0-1 pass threshold
  const scoreGood = report.score >= config.score.passThreshold * 100;

  const [ui, uiDispatch] = useUiState({ openAdd: isEmptyDoc(initial.doc) });
  const gridRef = useRef<HTMLDivElement>(null);
  // The phone tab bar is fixed at the bottom: toasts and the bug-report button stay above it.
  const phoneNavRef = useRef<HTMLDivElement>(null);
  useBottomBar(phoneNavRef);
  useBuilderLayout(gridRef, uiDispatch);
  // Arriving from the list's View / AI buttons: once, after the remembered panels are restored.
  useEffect(() => {
    if (entry?.view === "pdf") uiDispatch({ type: "rightView/toggle", view: "pdf" });
    if (entry?.view === "settings") uiDispatch({ type: "rightView/open", view: "settings" });
    if (entry?.tab === "ai") uiDispatch({ type: "rail/expand", tab: "ai" });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const { layout } = ui;
  const phone = layout.viewport === "phone";
  const compact = phone || layout.viewport === "tablet";

  const [now, setNow] = useState(() => Date.now());
  const [loadedAt] = useState(() => {
    const t = initial.updatedAt ? Date.parse(initial.updatedAt) : Number.NaN;
    return Number.isFinite(t) ? t : null;
  });
  // The resume's metadata, shared by the header bar and Resume settings (each reports what it changes, both show the latest).
  const [liveMeta, setLiveMeta] = useState<ResumeMeta | null>(initialMeta);
  const autosave = useRef<Autosave | null>(null);
  const [exporting, setExporting] = useState(false);
  // Autosave settled: tick beside the field being edited, or on Add Section when the set of sections changed.
  const docRef = useRef(doc);
  const savedSections = useRef(sectionSignature(doc));
  const markSaved = () => {
    const sig = sectionSignature(docRef.current);
    if (sig !== savedSections.current) {
      savedSections.current = sig;
      panelSaved.flash("section");
      return;
    }
    const el = document.activeElement;
    if (el instanceof HTMLElement && scrollRef.current?.contains(el) && el.matches("input, textarea")) {
      const r = el.getBoundingClientRect();
      setTickAt({ top: r.top + 4, left: r.right - 24 });
      canvasSaved.flash("canvas");
    }
  };
  const markSavedRef = useRef(markSaved);
  useEffect(() => {
    markSavedRef.current = markSaved;
    docRef.current = doc;
  });
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
      onSaved: (rev, version) => {
        dispatch({ type: "save/ok", rev, version, at: Date.now() });
        markSavedRef.current();
      },
      onRetrying: () => dispatch({ type: "save/retrying" }),
      onConflict: (serverVersion, serverDoc) => dispatch({ type: "save/conflict", serverVersion, doc: serverDoc }),
      onFailed: (message, path) => {
        dispatch({ type: "save/failed", message, path });
        if (path) toast({ title: `Couldn't save: ${message.replace(/^\$[^:]*:\s*/, "")}`, variant: "error" });
      },
    });
    autosave.current = a;
    return () => {
      // Leaving the editor (navigation, ✕): save what is pending, then ask for the PDF now instead of after the
      // settle delay (R3.7). The request outlives the page (keepalive). Best effort: the next visit repairs a miss.
      void a.flush().finally(() => void requestPdfNow(resumeId, { keepalive: true }));
      a.dispose();
      autosave.current = null;
    };
  }, [resumeId, initialVersion, toast]);

  /* ── template + theme (R2.4): optimistic, saved by PATCH, the autosave held around each ─── */
  // A saved template / theme changes the render, so the server re-queues the PDF just like after a content save (R3.7 x R2.4).
  const [presentationSavedAt, setPresentationSavedAt] = useState<number | null>(null);
  const presentationDispatch = useCallback((a: Parameters<typeof dispatch>[0]) => {
    if (a.type === "presentation/version") {
      setPresentationSavedAt(Date.now());
      flashPanel("template");
    }
    dispatch(a);
  }, [flashPanel]);
  const presentation = usePresentation({ resumeId, autosave, templateId: state.templateId, theme: state.theme, doc, config, dispatch: presentationDispatch });

  // Every change of the document tells the controller; it debounces and serialises.
  useEffect(() => {
    autosave.current?.schedule({ doc, rev: state.rev });
  }, [doc, state.rev]);

  /* ── leaving the page: warn when unsaved, flush when the tab is hidden ───────────────── */
  const unsaved = hasUnsaved(state) || state.phase === "conflict";
  useLeaveGuard(unsaved);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void autosave.current?.flush();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);

  // Closing the tab / reloading: the unmount path above does not run, so ask for the PDF now here (R3.7).
  useEffect(() => {
    const onPageHide = () => {
      void autosave.current?.flush();
      void requestPdfNow(resumeId, { keepalive: true });
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [resumeId]);

  // The stored PDF's state for the top bar: "PDF updating…" after a save, "couldn't be made · Retry" on failure.
  const { pdf, retry: retryPdf, refresh: refreshPdf, follow: followPdf } = usePdfStatus(resumeId, initial.pdf, Math.max(state.savedAt ?? 0, presentationSavedAt ?? 0) || null);

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
  // The right sheet's views are the two feature switches (DESIGN 10.8); "print" leads when both are on.
  const views = useMemo<PreviewView[]>(
    () => [...(config.features.printLayout ? (["print"] as const) : []), ...(config.features.pdfView ? (["pdf"] as const) : [])],
    [config.features.printLayout, config.features.pdfView],
  );
  const [shownView, setShownView] = useState<RightView>(views[0] ?? "print");
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
  const defaultRightFocus = useCallback(
    (): HTMLElement | null => {
      if (phone) return previewTabRef.current;
      // The Download button carries the menu semantics itself (`Menu` puts them on a button trigger).
      const trigger = downloadRef.current?.querySelector<HTMLElement>('[aria-haspopup="menu"]') ?? null;
      return trigger instanceof HTMLButtonElement ? trigger : (trigger?.querySelector<HTMLElement>("button") ?? null);
    },
    [phone],
  );
  useEffect(() => {
    rightReturnFocus.current = defaultRightFocus();
  }, [defaultRightFocus]);

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
  /** Download ▾ → Print layout / PDF view, Alt+P / Alt+V: open the view, or close it when it is the open one (one right view at a time). */
  const toggleView = useCallback(
    (view: PreviewView) => {
      if (!views.includes(view)) return; // a switched-off view never opens
      if (ui.rightView === view) {
        closeRight();
        return;
      }
      rightReturnFocus.current = defaultRightFocus();
      if (compact) {
        uiDispatch({ type: "panel/close" });
        uiDispatch({ type: "phone/tab", tab: "preview" });
      }
      uiDispatch({ type: "rightView/toggle", view });
    },
    [views, ui.rightView, compact, closeRight, defaultRightFocus, uiDispatch],
  );
  /**
   * Resume settings (R3.12): the header ⋮ entry, every "Manage in Resume settings" link, the Download menu on a phone and
   * Alt+S. It is the third right view; opening it again keeps it open, and focus goes back to the header's ⋮ when it closes.
   */
  const openSettings = useCallback(() => {
    rightReturnFocus.current = document.querySelector<HTMLElement>("[data-rb-header-menu]")?.closest<HTMLElement>('[aria-haspopup="menu"]') ?? defaultRightFocus();
    if (compact) {
      uiDispatch({ type: "panel/close" });
      uiDispatch({ type: "phone/tab", tab: "preview" });
    }
    uiDispatch({ type: "rightView/open", view: "settings" });
    track("resume_panel_opened", { panel: "settings" });
  }, [compact, defaultRightFocus, uiDispatch]);
  const toggleSettings = useCallback(() => {
    if (ui.rightView === "settings") closeRight();
    else openSettings();
  }, [ui.rightView, closeRight, openSettings]);
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
      if (!ui.rightView && views[0]) uiDispatch({ type: "rightView/toggle", view: views[0] });
    } else {
      uiDispatch({ type: "panel/close" });
      uiDispatch({ type: "rightView/close" });
    }
    uiDispatch({ type: "phone/tab", tab });
  };

  const clearAddFocus = useCallback(() => setAddFocusKind(null), []);
  const openAddFor = useCallback(
    (kind: ResumeSectionKind | null) => {
      setAddFocusKind(kind);
      openPanel("add");
    },
    [openPanel],
  );

  /* ── Insights: "View tips" opens the tips sheet; "Go to" lands on the field a rule points at ── */
  const [tips, setTips] = useState<{ only: ResumeScoreGroupId | null } | null>(null);
  const viewTipsRef = useRef<HTMLButtonElement>(null);
  const openTips = useCallback(
    (only?: ResumeScoreGroupId) => {
      setTips({ only: only ?? null });
      track("resume_tips_opened", { failing: failingRules(report).length, scope: only ?? "all" });
    },
    [report],
  );
  const closeTips = useCallback(() => setTips(null), []);
  const goToTip = useCallback(
    (ref: string) => {
      setTips(null);
      if (ref.startsWith(SCORE_ADD_REF_PREFIX)) {
        openAddFor(ref.slice(SCORE_ADD_REF_PREFIX.length) as ResumeSectionKind);
        return;
      }
      if (compact) closeRailSheet();
      // after the sheets have slid out and handed focus back, put it on the field
      window.setTimeout(() => {
        if (!goToField(ref)) toast({ title: "That part of the resume isn't on the page right now", variant: "default" });
      }, 80); // config-literal-ok: lets the closing sheets return focus first (SIDE_SHEET_MS is 200, the sheet restores focus synchronously)
    },
    [compact, closeRailSheet, openAddFor, toast],
  );

  // Fire "score viewed" once per editor session, the first time the Insights tab is actually on screen.
  const scoreViewed = useRef(false);
  const insightsVisible = ui.railTab === "insights" && (compact ? railSheetOpen : !layout.railCollapsed);
  useEffect(() => {
    if (!insightsVisible || scoreViewed.current) return;
    scoreViewed.current = true;
    track("resume_score_viewed", { score: report.score, band: report.band.title });
  }, [insightsVisible, report.score, report.band.title]);

  /* Alt+1..4 toggle the four panels, Alt+D opens the Download menu, Alt+P / Alt+V toggle Print layout / PDF view, Alt+S Resume settings (desktop and tablet). */
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
      } else if (e.code === "KeyV" || e.key.toLowerCase() === "v") {
        e.preventDefault();
        toggleView("pdf");
      } else if (e.code === "KeyS" || e.key.toLowerCase() === "s") {
        e.preventDefault();
        toggleSettings();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [phone, config.features.tailor, togglePanel, toggleView, toggleSettings]);

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

  /* ── Save and the exports: all of them need the SAVED document, so flush first and refuse if that fails ───── */
  const flushAll = async (): Promise<boolean> => {
    await presentation.flush(); // a theme still in its 500 ms debounce is part of "what's saved"
    await autosave.current?.flush();
    return (autosave.current?.savedRev ?? 0) >= latestRev.current;
  };
  const savedFirst = async (what: string): Promise<boolean> => {
    if (await flushAll()) return true;
    toast({ title: `Couldn't ${what} yet`, description: "Your latest changes aren't saved. Fix the save problem shown above, then try again.", variant: "error" });
    return false;
  };

  /** Stable for the header bar: always the latest flushAll (it closes over the presentation hook). */
  const flushAllRef = useRef(flushAll);
  useEffect(() => {
    flushAllRef.current = flushAll;
  });
  const ensureSaved = useCallback(() => flushAllRef.current(), []);

  /** The header bar restored a version / pulled master changes: the server's document replaces the one on screen. */
  const adoptServerDoc = useCallback(
    (dto: ResumeDocDTO) => {
      dispatch({ type: "server/replace", doc: dto.doc, templateId: dto.templateId, theme: dto.theme, docVersion: dto.docVersion, at: Date.now() });
      autosave.current?.reset(dto.docVersion, latestRev.current + 1);
    },
    [],
  );


  /* Save a version (DECISIONS #32, DESIGN 10.15): there is no Save button. Autosave keeps the draft; a version is
     written from the header's Version menu -> Save version... (named) or Ctrl/Cmd+S (default name). Either flushes
     autosave, writes the checkpoint (MANUAL / NAMED) and the server queues the PDF at once. */
  const checkpointing = useRef(false);
  const [versionsStamp, setVersionsStamp] = useState(0);
  const pdfSettings = config.pdf ?? DEFAULT_BUILDER_CONFIG.pdf;

  // Saving a version and storing a PDF write as the resume's owner; acting for someone is edit-only (the API refuses both), so neither is offered.
  const ownerActions = builderCaps.versionRestore;
  const saveCheckpoint = async (name?: string): Promise<{ flushed: boolean; checkpoint: CheckpointResult | null }> => {
    if (!ownerActions || checkpointing.current || state.phase === "conflict") return { flushed: false, checkpoint: null };
    checkpointing.current = true;
    try {
      if (!(await savedFirst("save"))) return { flushed: false, checkpoint: null };
      const checkpoint = await checkpointDoc(resumeId, name);
      if (checkpoint.kind === "error") {
        toast({ title: "Couldn't save a version", description: checkpoint.message, variant: "error" });
        return { flushed: true, checkpoint };
      }
      followPdf(checkpoint.pdf);
      setVersionsStamp((n) => n + 1); // the header's Version menu and chip re-read the history
      return { flushed: true, checkpoint };
    } finally {
      checkpointing.current = false;
    }
  };
  /** Ctrl/Cmd+S: a version with the default name, and a toast that says which. */
  const quickSave = async () => {
    const next = (liveMeta?.version.current ?? 0) + 1;
    const name = liveMeta ? defaultVersionName(next) : undefined;
    const saved = await saveCheckpoint(name);
    if (saved.checkpoint?.kind !== "ok") return;
    const no = saved.checkpoint.versionNo || next;
    toast({ title: `Version ${no} saved`, description: name, variant: "success", duration: VERSION_TOAST_MS });
  };
  /** The Version menu's named save: the toast is the header's. */
  const saveNamedVersion = async (name?: string) => (await saveCheckpoint(name)).checkpoint;
  const quickSaveRef = useRef(quickSave);
  useEffect(() => {
    quickSaveRef.current = quickSave;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== "s") return;
      e.preventDefault(); // the browser's own "save page" has no business here
      void quickSaveRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  /**
   * Download the PDF. `withSave` (Download ▾ → Save & Download PDF): checkpoint first, then wait up to
   * `resume.pdf.waitMs` for the stored file the checkpoint queued, and download THAT; when it is not ready in time the
   * export below renders it itself (and stores it). Without it (a view's footer button): flush and export only.
   */
  const downloadPdfFile = async (withSave: boolean) => {
    if (exporting || !ownerActions) return;
    setExporting(true);
    try {
      let checkpoint: CheckpointResult | null = null;
      if (withSave) {
        const saved = await saveCheckpoint();
        if (!saved.flushed) return;
        checkpoint = saved.checkpoint;
        if (checkpoint?.kind === "ok" && checkpoint.pdf?.status !== "READY") {
          await waitForStoredPdf(resumeId, { waitMs: pdfSettings.waitMs, pollMs: pdf?.pollMs });
        }
      } else if (!(await savedFirst("export"))) {
        return;
      }
      const res = await exportPdf(resumeId);
      if (res.kind === "error") {
        toast({ title: "Couldn't make the PDF", description: res.message, variant: "error" });
        return;
      }
      saveBlob(res.blob, res.fileName);
      track("resume_download", { format: "pdf", cached: res.cached });
      if (res.stored) void refreshPdf();
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

  const downloadText = async (withSave: boolean) => {
    if (exporting || !ownerActions) return;
    setExporting(true);
    try {
      if (withSave) {
        if (!(await saveCheckpoint()).flushed) return;
      } else if (!(await savedFirst("download"))) {
        return;
      }
      const res = await exportText(resumeId);
      if (res.kind === "error") {
        toast({ title: "Couldn't make the text file", description: res.message, variant: "error" });
        return;
      }
      saveBlob(res.blob, res.fileName);
      track("resume_download", { format: "txt", cached: false });
      toast({ title: "Text file ready", description: "Plain text, the way an ATS reads your resume.", variant: "success" });
    } finally {
      setExporting(false);
    }
  };

  /* AI Suggestions (R4.6): the stored cards are read when the editor opens (no AI call); asking for new ones is a click. */
  const suggestions = useSuggestions({
    resumeId,
    enabled: config.aiAllowed && config.features.aiSuggestions,
    rev: state.rev,
    ensureSaved,
    autoRefresh: config.ai.suggestAutoRefresh,
    staleMinutes: config.ai.suggestStaleMinutes,
  });
  const { ask: askSuggestions, reload: reloadSuggestions } = suggestions;
  const refreshSuggestions = useCallback(() => void askSuggestions(true), [askSuggestions]);

  /* Rewrite with AI (R4.2): the section / bullet buttons ask, the diff sheet reviews, Apply writes through the reducer (Undo works).
     The same flow reviews and applies an AI Suggestions card (R4.6): Preview is its diff, "Apply Suggestion" its one-click apply. */
  const rewrite = useRewriteFlow({
    resumeId,
    enabled: config.aiAllowed,
    maxRefs: config.ai.rewriteMaxRefs,
    doc,
    dispatch,
    autosave,
    latestRev,
    ensureSaved,
    adoptServerDoc,
    onSettled: () => void reloadSuggestions(),
    onRefreshSuggestions: refreshSuggestions,
  });
  const [applyingCard, setApplyingCard] = useState<number | null>(null);
  const [seeAllOpen, setSeeAllOpen] = useState(false);
  const seeAllReturn = useRef<HTMLElement | null>(null);
  const seeAll = (returnTo: HTMLElement | null) => {
    seeAllReturn.current = returnTo;
    setSeeAllOpen(true);
    track("resume_ai_suggestions_see_all", { count: suggestions.cards.length });
  };
  const previewSuggestion = (p: AiProposal, returnTo: HTMLElement | null) => {
    // From the See all list the list closes first; the diff gives focus back to wherever the person was.
    if (seeAllOpen) setSeeAllOpen(false);
    rewrite.preview(p, returnTo);
  };
  const applySuggestion = async (p: AiProposal) => {
    if (applyingCard !== null) return;
    if (suggestionNeedsReview(p)) {
      previewSuggestion(p, document.activeElement instanceof HTMLElement ? document.activeElement : null);
      return;
    }
    setApplyingCard(p.id);
    try {
      const problem = await rewrite.quickApply(p);
      if (!problem) return;
      if (problem.kind === "placeholder") previewSuggestion(p, null);
      else if (problem.kind === "stale") {
        toast({ title: COPY.suggestStale, description: "Refresh to get suggestions for what is there now.", variant: "default" });
        void reloadSuggestions();
      } else if (problem.kind === "closed") {
        toast({ title: COPY.suggestUsed, variant: "default" });
        void reloadSuggestions();
      } else if (problem.kind === "locked") toast({ title: COPY.suggestLocked, variant: "default" });
      else toast({ title: problem.message ?? "Couldn't apply that", description: "Your resume is untouched. Try again.", variant: "error" });
    } finally {
      setApplyingCard(null);
    }
  };
  const railSuggestions = {
    state: suggestions,
    applyingId: applyingCard,
    busy: applyingCard !== null || rewrite.sheetProps.applying,
    onApply: (p: AiProposal) => void applySuggestion(p),
    onPreview: previewSuggestion,
    onSeeAll: seeAll,
  };
  const trimLongest = useMemo(
    () => ({
      allowed: config.aiAllowed,
      onTrim: () => {
        setTips(null);
        rewrite.start({ refs: longestBullets(doc, TRIM_LONGEST_COUNT).map((l) => l.ref), scope: "The longest bullets", from: "tip" }, "shorter", viewTipsRef.current);
      },
      onLocked: () => rewrite.canvasAi.onLocked("tip"),
    }),
    [config.aiAllowed, doc, rewrite],
  );

  /* ✕: save what can be saved, then leave; the unsaved guard asks only when something is still not saved. */
  const closeEditor = async () => {
    await presentation.flush();
    await autosave.current?.flush();
    const stillUnsaved = (autosave.current?.savedRev ?? 0) < latestRev.current || conflicted.current;
    if (stillUnsaved && !window.confirm("Your latest changes aren't saved. Leave anyway?")) return;
    router.push(env.listHref);
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
  const suggestionCount = suggestions.locked ? 0 : suggestions.cards.length;
  const onRailTab = (tab: RailTab) => uiDispatch({ type: "rail/tab", tab });

  const meta = PANEL_META[shownPanel];
  const leftBody = (
    <>
      {phone && (
        <ChoiceGroup
          aria-label="Layout panels"
          className="mb-4"
          // the fifth segment is Resume settings: a right view, so it opens that sheet instead of a panel (DESIGN 10.12)
          options={[...PANEL_ORDER.filter((p) => p !== "tailor" || config.features.tailor).map((p) => ({ value: p, label: PANEL_META[p].title })), { value: "settings", label: "Settings" }]}
          value={shownPanel}
          onChange={(v) => (v === "settings" ? openSettings() : openPanel(v as LeftPanel))}
        />
      )}
      {shownPanel === "add" && (
        <AddSectionPanel
          doc={doc}
          caps={caps}
          limits={state.limits}
          dispatch={dispatch}
          focusKind={addFocusKind}
          open={leftOpen}
          onFocusHandled={clearAddFocus}
          // The sheet covers the document (overlay / fullscreen): close it so the new section shows.
          onAdded={layout.leftMode === "push" ? undefined : closeLeft}
        />
      )}
      {shownPanel === "template" && (
        <PickTemplatePanel doc={doc} templateId={state.templateId} theme={state.theme} config={config} controls={presentation} disabled={state.phase === "conflict"} />
      )}
      {shownPanel === "swap" && <SwapSectionPanel doc={doc} caps={caps} dispatch={dispatch} />}
      {shownPanel === "tailor" && <TailorPanel />}
    </>
  );

  const rightTitle = shownView === "settings" ? "Resume settings" : phone ? "Preview" : shownView === "pdf" ? "PDF view" : "Print layout";
  const rightDescription =
    shownView === "settings"
      ? "Name, sharing and everything about this resume"
      : shownView === "pdf"
        ? "The file employers and job sites receive"
        : "See how your resume paginates on paper";

  const rail = (
    <RightRail
      tab={ui.railTab}
      onTab={onRailTab}
      config={config}
      aiUsageLine={aiUsageLine}
      suggestions={railSuggestions}
      onTailor={() => openPanel("tailor")}
      insights={{ report, good: scoreGood, onViewTips: openTips, viewTipsRef }}
    />
  );

  return (
    <div data-plan={plan} className="flex h-full min-h-0 flex-1 flex-col bg-v2-canvas">
      <EditorTopBar
        status={status}
        savedAt={state.savedAt ?? loadedAt}
        now={Math.max(now, state.savedAt ?? loadedAt ?? 0)}
        error={state.error}
        leftPanel={ui.leftPanel}
        onTogglePanel={togglePanel}
        panelRefs={panelRefs}
        showTailor={config.features.tailor}
        approvalNotice={builderCaps.approvalNotice}
        allowDownload={ownerActions}
        onDownloadPdf={() => void downloadPdfFile(true)}
        onDownloadText={() => void downloadText(true)}
        exporting={exporting}
        exportDisabled={state.phase === "conflict"}
        downloadRef={downloadRef}
        rightView={ui.rightView}
        onToggleView={toggleView}
        onOpenSettings={openSettings}
        settingsInMenu={phone}
        printLayout={config.features.printLayout}
        pdfView={config.features.pdfView}
        online={online}
        onRetrySave={() => void autosave.current?.flush()}
        savedFlash={panelSaved}
        onClose={closeEditor}
        pdf={pdf}
        onPdfRetry={retryPdf}
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
            <ResumeHeaderBar
              resumeId={resumeId}
              initialMeta={initialMeta}
              fallbackName={initial.label}
              config={config}
              viewport={layout.viewport}
              savedAt={state.savedAt}
              ensureSaved={ensureSaved}
              onDocReplaced={adoptServerDoc}
              onServerChange={() => void refreshPdf()}
              onSaveVersion={saveNamedVersion}
              versionsStamp={versionsStamp}
              primaryResumeId={primaryResumeId}
              onTailor={() => openPanel("tailor")}
              onOpenSettings={openSettings}
              syncedMeta={liveMeta}
              onMetaChange={setLiveMeta}
            />

            <SectionTabs
              sections={doc.sections}
              activeId={ui.activeSectionId}
              onActiveChange={(id) => uiDispatch({ type: "section/active", id })}
              scrollRootRef={scrollRef}
              onAddSection={openAddFor}
              className="sticky top-0 z-10 rounded-2xl border shadow-v2-soft"
            />

            {rewrite.pending && <OpenRewriteBar proposal={rewrite.pending} onReview={rewrite.review} onDiscard={rewrite.discardPending} />}

            <HiddenContentBar doc={doc} theme={state.theme} caps={caps} />

            <DocumentCanvas
              doc={doc}
              caps={caps}
              theme={state.theme}
              limits={state.limits}
              dispatch={dispatch}
              errorField={errorField}
              canUndo={canUndoEdit(state)}
              canRedo={canRedoEdit(state)}
              aiAllowed={config.aiAllowed}
              aiVisible={builderCaps.ai}
              ai={rewrite.canvasAi}
              onAddSection={() => openAddFor("SUMMARY")}
              reorder={leftOpen && ui.leftPanel === "swap"}
            />
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
            icon={shownView === "settings" ? <GearIcon className="h-5 w-5" /> : <FileTextIcon className="h-5 w-5" />}
            onClose={closeRight}
            returnFocusTo={rightReturnFocus}
          >
            {shownView !== "settings" && views.length > 1 && (
              <ChoiceGroup
                aria-label="Preview type"
                className="mb-4"
                options={views.map((v) => ({ value: v, label: v === "pdf" ? "PDF view" : "Print layout" }))}
                value={shownView}
                onChange={(v) => uiDispatch({ type: "rightView/toggle", view: v as RightView })}
              />
            )}
            {shownView === "settings" ? (
              <ResumeSettingsSheet
                resumeId={resumeId}
                meta={liveMeta}
                onMeta={setLiveMeta}
                config={config}
                active={ui.rightView === "settings"}
                phone={phone}
                liveScore={report.score}
              />
            ) : shownView === "print" ? (
              <PrintLayoutView
                doc={doc}
                theme={state.theme}
                templateId={state.templateId}
                caps={caps}
                controls={presentation}
                onDownloadPdf={() => void downloadPdfFile(false)}
                exporting={exporting}
                disabled={state.phase === "conflict"}
                zoomable={phone}
              />
            ) : (
              <PdfView
                resumeId={resumeId}
                doc={doc}
                theme={state.theme}
                templateId={state.templateId}
                caps={caps}
                prepare={flushAll}
                pdfInfo={pdf}
                autoRefresh={pdfSettings.viewAutoRefresh}
                disabled={state.phase === "conflict"}
                onStored={() => void refreshPdf()}
              />
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
        // while the tips sheet is open on top, Esc closes only that one
        onClose={tips ? closeTips : closeRailSheet}
        returnFocusTo={railReturnFocus}
      >
        {rail}
      </SideSheet>

      {/* "View tips": the failing score rules with a Go to each (a sibling of the sheets, not inside the rail's transformed one) */}
      <TipsSheet
        open={tips !== null}
        mode={phone ? "fullscreen" : "overlay"}
        report={report}
        only={tips?.only ?? null}
        onClose={closeTips}
        onGoTo={goToTip}
        trim={builderCaps.ai ? trimLongest : null}
        returnFocusTo={viewTipsRef}
      />

      {/* "Rewrite with AI": review the checked proposal change by change (DESIGN 13.3 / 13.4) */}
      <ProposalDiff
        {...rewrite.sheetProps}
        phone={phone}
        returnFocusTo={rewrite.returnFocusTo}
        onOpenTips={() => {
          rewrite.sheetProps.onClose();
          openTips();
        }}
      />

      {/* AI Suggestions "See all": every open card in one list (DESIGN 10.7) */}
      <SuggestionsSheet
        open={seeAllOpen}
        phone={phone}
        cards={suggestions.cards}
        stale={suggestions.stale}
        asking={suggestions.asking}
        applyingId={applyingCard}
        busy={applyingCard !== null || rewrite.sheetProps.applying || suggestions.settling}
        onApply={(p) => void applySuggestion(p)}
        onPreview={previewSuggestion}
        onRefresh={refreshSuggestions}
        onClose={() => setSeeAllOpen(false)}
        returnFocusTo={seeAllReturn}
      />

      {/* phone: Edit · Layout · Insights · Preview (DESIGN 10.9) */}
      <div
        ref={phoneNavRef}
        role="tablist"
        aria-label="Editor views"
        className={cn("fixed inset-x-0 bottom-0 z-30 grid h-14 border-t border-line/70 bg-paper md:hidden", views.length > 0 ? "grid-cols-4" : "grid-cols-3")}
      >
        {PHONE_TABS.filter((t) => t.value !== "preview" || views.length > 0).map((t) => {
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

      {/* the field-level "saved" tick, beside the text just edited (fades by itself; reduced motion: just goes) */}
      {tickAt && canvasSaved.active === "canvas" && (
        <span className="pointer-events-none fixed z-40" style={{ top: tickAt.top, left: tickAt.left }}>
          <SavedTick flash={canvasSaved} id="canvas" />
        </span>
      )}

      <ConflictDialog open={state.phase === "conflict"} onKeepMine={keepMine} onTakeTheirs={takeTheirs} />
    </div>
  );
}

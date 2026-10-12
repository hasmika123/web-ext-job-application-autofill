/**
 * The editor's UI state (DESIGN v2 §10.1, §10.3): which left panel and right view are open, which
 * rail tab is showing, how the two side sheets lay out at the current width, the scroll-spy section
 * and the phone tab. A separate reducer: it is not part of the document, not in the undo history and
 * never server data. Pure functions only; `useUiState` (below) is the thin React wrapper.
 *
 * Rules (one place, tested in `ui.test.ts`):
 *  - one left panel and one right view at a time; pressing the open one again closes it;
 *  - a sheet PUSHES (reserves a grid track) only when the centre column keeps >= MIN_CENTRE px,
 *    otherwise it OVERLAYS (§10.1 "space-aware push"); phone is always fullscreen;
 *  - two MODAL sheets (overlay / fullscreen) never stay open together: the newest wins and the older
 *    closes. A push + an overlay is fine.
 * `leftPanel` and `railTab` are remembered in `localStorage["rb.ui.v1"]` (never a URL parameter).
 */
import { useEffect, useReducer, useRef } from "react";
import type { Dispatch } from "react";

export type LeftPanel = "add" | "template" | "swap" | "tailor";
export type RightView = "print" | "pdf";
export type RailTab = "insights" | "ai" | "match";
export type SheetMode = "push" | "overlay" | "fullscreen";
export type Viewport = "phone" | "tablet" | "desktop" | "wide";
export type PhoneTab = "edit" | "layout" | "insights" | "preview";

export interface BuilderLayout {
  leftMode: SheetMode;
  rightMode: SheetMode;
  viewport: Viewport;
  /** The measured grid width the modes were computed from (px). */
  width: number;
}

export interface UiState {
  leftPanel: LeftPanel | null;
  rightView: RightView | null;
  railTab: RailTab;
  layout: BuilderLayout;
  /** Section id for the section tabs' active underline (scroll-spy). */
  activeSectionId: string | null;
  phoneTab: PhoneTab;
  /** Which open sheet was opened last; the other one closes first when they cannot coexist. */
  newest: "left" | "right" | null;
}

export type UiAction =
  | { type: "panel/toggle"; panel: LeftPanel }
  | { type: "panel/close" }
  | { type: "rightView/toggle"; view: RightView }
  | { type: "rightView/close" }
  | { type: "rail/tab"; tab: RailTab }
  | { type: "layout/set"; width: number }
  | { type: "section/active"; id: string | null }
  | { type: "phone/tab"; tab: PhoneTab }
  | { type: "ui/hydrate"; persisted: PersistedUi };

/* ── Layout model (DESIGN §10.1) ─────────────────────────────────────────────────── */

// config-literal-ok: viewport breakpoints and sheet widths are layout geometry (DESIGN 10.1), not tunables
export const PHONE_MAX = 768; //   < 768        phone: everything fullscreen
// config-literal-ok: layout geometry (DESIGN 10.1)
export const TABLET_MAX = 1024; // 768-1023     tablet: both sheets overlay, the rail collapses
// config-literal-ok: layout geometry (DESIGN 10.1)
export const DESKTOP_MAX = 1280; // 1024-1279   desktop: left may push, right overlays the rail
// config-literal-ok: layout geometry (DESIGN 10.1)
export const LEFT_SHEET_WIDTH = 400;
// config-literal-ok: layout geometry (DESIGN 10.1)
export const RIGHT_SHEET_WIDTH = 520;
// config-literal-ok: layout geometry (DESIGN 10.1)
export const RAIL_WIDTH = 360;
// config-literal-ok: layout geometry (DESIGN 10.1)
export const MIN_CENTRE = 560;

export function viewportFor(width: number): Viewport {
  if (width < PHONE_MAX) return "phone";
  if (width < TABLET_MAX) return "tablet";
  if (width < DESKTOP_MAX) return "desktop";
  return "wide";
}

/**
 * The mode each sheet has (or would have) at `width`. The left sheet is judged on its own; the right
 * sheet then accounts for a left sheet that is open and pushing.
 */
export function computeLayout(width: number, leftOpen: boolean): BuilderLayout {
  const viewport = viewportFor(width);
  if (viewport === "phone") return { leftMode: "fullscreen", rightMode: "fullscreen", viewport, width };
  if (viewport === "tablet") return { leftMode: "overlay", rightMode: "overlay", viewport, width };

  const leftMode: SheetMode = width - RAIL_WIDTH - LEFT_SHEET_WIDTH >= MIN_CENTRE ? "push" : "overlay";
  if (viewport === "desktop") return { leftMode, rightMode: "overlay", viewport, width };

  const leftTaken = leftOpen && leftMode === "push" ? LEFT_SHEET_WIDTH : 0;
  const rightMode: SheetMode =
    width - RAIL_WIDTH - RIGHT_SHEET_WIDTH - leftTaken >= MIN_CENTRE ? "push" : "overlay";
  return { leftMode, rightMode, viewport, width };
}

// config-literal-ok: assumed viewport width before measurement (layout geometry)
const DEFAULT_WIDTH = 1440;

export function initialUiState(overrides: Partial<Pick<UiState, "leftPanel" | "railTab">> = {}): UiState {
  const leftPanel = overrides.leftPanel ?? null;
  return reconcile({
    leftPanel,
    rightView: null,
    railTab: overrides.railTab ?? "insights",
    layout: computeLayout(DEFAULT_WIDTH, leftPanel !== null),
    activeSectionId: null,
    phoneTab: "edit",
    newest: leftPanel ? "left" : null,
  });
}

/** Recompute the layout from the open sheets, then close the older of two modal sheets. */
function reconcile(state: UiState): UiState {
  let { leftPanel, rightView, newest } = state;
  let layout = computeLayout(state.layout.width, leftPanel !== null);

  if (leftPanel && rightView && layout.leftMode !== "push" && layout.rightMode !== "push") {
    if (newest === "left") rightView = null;
    else leftPanel = null;
    layout = computeLayout(layout.width, leftPanel !== null);
  }
  if (!leftPanel && !rightView) newest = null;
  else if (!leftPanel) newest = "right";
  else if (!rightView) newest = "left";

  const same =
    leftPanel === state.leftPanel &&
    rightView === state.rightView &&
    newest === state.newest &&
    layout.leftMode === state.layout.leftMode &&
    layout.rightMode === state.layout.rightMode &&
    layout.viewport === state.layout.viewport &&
    layout.width === state.layout.width;
  return same ? state : { ...state, leftPanel, rightView, newest, layout };
}

export function uiReducer(state: UiState, action: UiAction): UiState {
  switch (action.type) {
    case "panel/toggle": {
      if (state.leftPanel === action.panel) return reconcile({ ...state, leftPanel: null });
      return reconcile({ ...state, leftPanel: action.panel, newest: "left" });
    }
    case "panel/close":
      return state.leftPanel === null ? state : reconcile({ ...state, leftPanel: null });
    case "rightView/toggle": {
      if (state.rightView === action.view) return reconcile({ ...state, rightView: null });
      return reconcile({ ...state, rightView: action.view, newest: "right" });
    }
    case "rightView/close":
      return state.rightView === null ? state : reconcile({ ...state, rightView: null });
    case "rail/tab":
      return state.railTab === action.tab ? state : { ...state, railTab: action.tab };
    case "layout/set": {
      const width = Number.isFinite(action.width) ? Math.max(0, Math.round(action.width)) : state.layout.width;
      if (width === state.layout.width) return state;
      return reconcile({ ...state, layout: { ...state.layout, width } });
    }
    case "section/active":
      return state.activeSectionId === action.id ? state : { ...state, activeSectionId: action.id };
    case "phone/tab":
      return state.phoneTab === action.tab ? state : { ...state, phoneTab: action.tab };
    case "ui/hydrate": {
      const { leftPanel, railTab } = action.persisted;
      return reconcile({
        ...state,
        leftPanel: leftPanel === undefined ? state.leftPanel : leftPanel,
        railTab: railTab ?? state.railTab,
        newest: leftPanel ? "left" : state.newest,
      });
    }
  }
}

/* ── Persistence: localStorage["rb.ui.v1"] = { leftPanel, railTab } ─────────────────────── */

export const UI_STORAGE_KEY = "rb.ui.v1";

export interface PersistedUi {
  leftPanel?: LeftPanel | null;
  railTab?: RailTab;
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;

const LEFT_PANELS: readonly LeftPanel[] = ["add", "template", "swap", "tailor"];
const RAIL_TABS: readonly RailTab[] = ["insights", "ai", "match"];

function defaultStorage(): StorageLike | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null; // blocked / private mode
  }
}

/** What was remembered. Anything missing, corrupt or out of range is ignored field by field. */
export function loadPersistedUi(storage: StorageLike | null = defaultStorage()): PersistedUi {
  if (!storage) return {};
  try {
    const raw = storage.getItem(UI_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const { leftPanel, railTab } = parsed as Record<string, unknown>;
    const out: PersistedUi = {};
    if (leftPanel === null || (typeof leftPanel === "string" && LEFT_PANELS.includes(leftPanel as LeftPanel))) {
      out.leftPanel = leftPanel as LeftPanel | null;
    }
    if (typeof railTab === "string" && RAIL_TABS.includes(railTab as RailTab)) out.railTab = railTab as RailTab;
    return out;
  } catch {
    return {};
  }
}

export function savePersistedUi(
  state: Pick<UiState, "leftPanel" | "railTab">,
  storage: StorageLike | null = defaultStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(UI_STORAGE_KEY, JSON.stringify({ leftPanel: state.leftPanel, railTab: state.railTab }));
  } catch {
    /* quota / blocked: the UI still works, it just forgets */
  }
}

/* ── React wrapper ──────────────────────────────────────────────────────────────────── */

export interface UseUiStateOptions {
  /** A brand-new resume with no items opens the Add Section panel (once), overriding the remembered panel. */
  openAdd?: boolean;
}

/**
 * `[state, dispatch]` for the editor. The first render uses the defaults (so server and client
 * markup agree); the remembered `leftPanel` / `railTab` are applied right after mount, and every
 * later change to either is written back.
 */
export function useUiState(options: UseUiStateOptions = {}): [UiState, Dispatch<UiAction>] {
  const [state, dispatch] = useReducer(uiReducer, undefined, () =>
    initialUiState(options.openAdd ? { leftPanel: "add" } : {}),
  );
  const hydrated = useRef(false);
  const openAdd = useRef(options.openAdd);

  useEffect(() => {
    if (!hydrated.current) return; // never overwrite what was remembered with the defaults
    savePersistedUi(state);
  }, [state.leftPanel, state.railTab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const persisted = loadPersistedUi();
    if (openAdd.current) delete persisted.leftPanel;
    hydrated.current = true;
    dispatch({ type: "ui/hydrate", persisted });
  }, []);

  return [state, dispatch];
}

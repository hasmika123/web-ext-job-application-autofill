import { act, cleanup, render } from "@testing-library/react";
import { useEffect, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UI_STORAGE_KEY, useUiState } from "./state/ui";
import type { UiAction, UiState } from "./state/ui";
import { useBuilderLayout } from "./useBuilderLayout";

let observers: Array<(entries: Array<{ contentRect: { width: number } }>) => void> = [];
const seen: { ui: UiState | null; dispatch: ((a: UiAction) => void) | null } = { ui: null, dispatch: null };
const latest = new Proxy({} as UiState, { get: (_t, k) => (seen.ui as unknown as Record<string | symbol, unknown>)[k] });

function Probe() {
  const ref = useRef<HTMLDivElement>(null);
  const [ui, dispatch] = useUiState();
  useBuilderLayout(ref, dispatch);
  useEffect(() => {
    seen.ui = ui;
    seen.dispatch = dispatch;
  });
  return <div ref={ref} />;
}

describe("useBuilderLayout + useUiState", () => {
  beforeEach(() => {
    observers = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(cb: (entries: Array<{ contentRect: { width: number } }>) => void) {
          observers.push(cb);
        }
        observe() {}
        disconnect() {}
      },
    );
    window.localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("derives the layout from the observed width", () => {
    render(<Probe />);
    act(() => observers[0]([{ contentRect: { width: 1100 } }]));
    expect(latest.layout).toMatchObject({ viewport: "desktop", leftMode: "push", rightMode: "overlay" });
    act(() => observers[0]([{ contentRect: { width: 1500 } }]));
    expect(latest.layout).toMatchObject({ viewport: "wide", leftMode: "push" });
    act(() => observers[0]([{ contentRect: { width: 390 } }]));
    expect(latest.layout).toMatchObject({ viewport: "phone", leftMode: "fullscreen", rightMode: "fullscreen" });
  });

  it("restores the remembered panel and rail tab after mount", () => {
    window.localStorage.setItem(UI_STORAGE_KEY, JSON.stringify({ leftPanel: "swap", railTab: "ai" }));
    render(<Probe />);
    expect([latest.leftPanel, latest.railTab]).toEqual(["swap", "ai"]);
  });

  it("does not overwrite the remembered values with the defaults on mount", () => {
    window.localStorage.setItem(UI_STORAGE_KEY, JSON.stringify({ leftPanel: null, railTab: "match" }));
    render(<Probe />);
    expect(JSON.parse(window.localStorage.getItem(UI_STORAGE_KEY) as string)).toEqual({
      leftPanel: null,
      railTab: "match",
    });
  });
});

describe("useBuilderLayout", () => {
  const width = (w: number) => act(() => observers[0]([{ contentRect: { width: w } }]));
  const send = (a: UiAction) => act(() => seen.dispatch?.(a));

  beforeEach(() => {
    observers = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(cb: (entries: Array<{ contentRect: { width: number } }>) => void) {
          observers.push(cb);
        }
        observe() {}
        disconnect() {}
      },
    );
    window.localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("collapses rail and pushes left at 1280", () => {
    render(<Probe />);
    width(1280);
    expect(latest.layout.railCollapsed).toBe(false); // nothing open yet: the full rail
    send({ type: "panel/toggle", panel: "add" });
    expect(latest.leftPanel).toBe("add");
    expect(latest.layout).toMatchObject({ viewport: "wide", leftMode: "push", railCollapsed: true });
  });

  it("re-expands rail on left close", () => {
    render(<Probe />);
    width(1280);
    send({ type: "panel/toggle", panel: "swap" });
    expect(latest.layout.railCollapsed).toBe(true);
    send({ type: "panel/close" });
    expect(latest.layout.railCollapsed).toBe(false);
  });

  it("strip icon closes left sheet and opens that rail tab", () => {
    render(<Probe />);
    width(1280);
    send({ type: "panel/toggle", panel: "template" });
    send({ type: "rail/expand", tab: "ai" });
    expect([latest.leftPanel, latest.railTab]).toEqual([null, "ai"]);
    expect(latest.layout.railCollapsed).toBe(false);
  });

  it("pushes with full rail when there is room (no collapse)", () => {
    render(<Probe />);
    width(1440);
    send({ type: "panel/toggle", panel: "add" });
    expect(latest.layout).toMatchObject({ leftMode: "push", railCollapsed: false });
  });
});

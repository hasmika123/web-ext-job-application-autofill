"use client";

import { useEffect } from "react";
import type { Dispatch, RefObject } from "react";
import type { UiAction } from "./state/ui";

/**
 * Feeds the editor grid's width into the UI reducer (`layout/set`), which derives
 * `layout.{leftMode, rightMode, viewport}` from it (DESIGN §10.1 "space-aware push": a sheet pushes
 * only while the centre column keeps >= 560 px, below 768 everything is fullscreen). Observes the
 * element with a `ResizeObserver`; falls back to `window` resize where there is none.
 *
 *   const gridRef = useRef<HTMLDivElement>(null);
 *   const [ui, dispatch] = useUiState();
 *   useBuilderLayout(gridRef, dispatch);   // then read ui.layout
 */
export function useBuilderLayout(ref: RefObject<HTMLElement | null>, dispatch: Dispatch<UiAction>): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      // A zero-width element (hidden, or no layout engine) falls back to the window.
      const width = el.getBoundingClientRect().width || window.innerWidth;
      dispatch({ type: "layout/set", width });
    };
    measure();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const ro = new ResizeObserver((entries) => {
      const width = entries[entries.length - 1]?.contentRect.width;
      if (width) dispatch({ type: "layout/set", width });
      else measure();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, dispatch]);
}

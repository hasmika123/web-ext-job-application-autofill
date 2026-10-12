"use client";

import { useCallback, useEffect, useState } from "react";
import { VIEW_STORAGE_KEY, type ViewMode } from "./constants";

/** The grid/list choice, remembered in this browser. Storage can be blocked or throw: every access is guarded. */
export function useViewMode(): [ViewMode, (v: ViewMode) => void] {
  const [view, setView] = useState<ViewMode>("grid");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(VIEW_STORAGE_KEY);
      // Restoring a per-viewer preference after hydration is the point of this effect.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved === "grid" || saved === "list") setView(saved);
    } catch {
      /* private window / blocked storage: keep the default */
    }
  }, []);

  const set = useCallback((v: ViewMode) => {
    setView(v);
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, v);
    } catch {
      /* not remembered, still works */
    }
  }, []);

  return [view, set];
}

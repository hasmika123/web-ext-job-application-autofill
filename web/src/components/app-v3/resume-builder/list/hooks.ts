"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@kiwiply/ui";
import { createBuilt } from "@/lib/resume-doc";
import { VIEW_STORAGE_KEY, type ViewMode } from "./constants";

/** Why "New Resume" did not open an editor: the plan's cap, with the copy the upload screen uses. */
export interface LimitNotice {
  message: string;
  plan?: string;
}

/**
 * "+ New Resume": `POST /api/resumes/built`, then straight into the editor; the 402 `RESUME_LIMIT`
 * becomes an inline notice (the same pattern the upload screen uses).
 *
 * // DESIGN-PENDING (R-list): the board's "+ New Resume" opens a START CHOOSER (upload a resume,
 * // use my profile, or copy an existing resume). Until that design lands this keeps today's working
 * // behaviour: one click creates a resume from the profile and opens the editor.
 */
export function useNewResume() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [limit, setLimit] = useState<LimitNotice | null>(null);

  const create = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setLimit(null);
    const res = await createBuilt({});
    if (res.kind === "ok") {
      router.push(`/resume-builder/${res.id}`); // stay busy until the editor takes over
      return;
    }
    setBusy(false);
    if (res.kind === "limit") setLimit({ message: res.message, plan: res.plan });
    else toast({ title: "Couldn't create the resume", description: res.message });
  }, [busy, router, toast]);

  return { create, busy, limit };
}

/** The "Coming soon" toast the repo's unbuilt controls use. `soon("Duplicate")()` is a click handler. */
export function useSoon() {
  const toast = useToast();
  return useCallback(
    (what: string) => () => toast({ title: "Coming soon", description: `${what} isn't available in the resume builder yet.` }),
    [toast],
  );
}

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

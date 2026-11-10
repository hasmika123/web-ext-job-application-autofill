"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { adminFetch } from "@/lib/admin-client";
import type { PlanPreview } from "@/lib/admin-plans";

const DEBOUNCE_MS = 250; // config-literal-ok: how long edits settle before the preview is asked again

export interface PreviewQuery {
  interval: string;
  currency: string;
  /** ORG plans: "[5]BASE,[3]PRESET_KEY"; blank = the server's sample roster. */
  roster?: string;
}

export interface PlanPreviewState {
  preview: PlanPreview | null;
  loading: boolean;
  error: string | null;
  /** Ask again now (the "Run all checks" button). */
  reload: () => void;
}

/**
 * Reads `GET .../versions/{v}/preview` for the editor and re-reads after every accepted write (`tick`) or query change.
 * The previous preview stays on screen while the next one loads, so numbers never flash away. Stale answers are dropped:
 * `loading` is "the last answer is not for the current question".
 */
export function usePlanPreview(planKey: string, version: number, query: PreviewQuery, tick: number): PlanPreviewState {
  const [preview, setPreview] = useState<PlanPreview | null>(null);
  const [answered, setAnswered] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState(0);
  const seq = useRef(0);
  const key = [planKey, version, query.interval, query.currency, query.roster ?? "", tick, manual].join("|");

  useEffect(() => {
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      const qs = new URLSearchParams({ interval: query.interval, currency: query.currency });
      if (query.roster?.trim()) qs.set("roster", query.roster.trim());
      const res = await adminFetch<PlanPreview>("GET", `/plans/${planKey}/versions/${version}/preview?${qs}`);
      if (mine !== seq.current) return;
      setAnswered(key);
      if (res.ok) {
        setPreview(res.data);
        setError(null);
      } else {
        setError(res.error);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [key, planKey, version, query.interval, query.currency, query.roster]);

  const reload = useCallback(() => setManual((n) => n + 1), []);
  return { preview, loading: answered !== key, error, reload };
}

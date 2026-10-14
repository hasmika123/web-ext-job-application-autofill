"use client";

/* eslint-disable react-hooks/set-state-in-effect -- data loaders: the effect starts a fetch and the answer is stored (the pattern of the other admin pages) */

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@kiwiply/ui";
import { errorSentence, placementsApi, type ApiResult, type PlacementDetail } from "@/lib/ent/placements";

export const UNDO_MS = 9000; // config-literal-ok: how long an Undo stays offered in the toast (UI timing; the API window is ten minutes)

export type DetailState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "gone" }
  | { status: "error"; message: string }
  | { status: "ok"; detail: PlacementDetail };

/** One placement's detail: loads on open, reloads when `reloadToken` changes, and lets the drawer replace it with an answer it already has. */
export function usePlacementDetail(orgId: number | string, id: number | null, reloadToken: number) {
  const [state, setState] = useState<DetailState>({ status: "idle" });
  const seq = useRef(0);

  const load = useCallback(
    async (quiet: boolean): Promise<PlacementDetail | null> => {
      if (id === null) {
        setState({ status: "idle" });
        return null;
      }
      const mine = ++seq.current;
      if (!quiet) setState({ status: "loading" });
      const r = await placementsApi.detail(orgId, id);
      if (mine !== seq.current) return null;
      if (r.ok) {
        setState({ status: "ok", detail: r.data });
        return r.data;
      }
      setState(r.status === 404 ? { status: "gone" } : { status: "error", message: errorSentence(r) });
      return null;
    },
    [orgId, id],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    void load(true);
  }, [reloadToken, load]);

  const replace = useCallback((detail: PlacementDetail) => setState({ status: "ok", detail }), []);

  return { state, replace };
}

export interface ActionSpec {
  /** The toast title: "Marked complete". */
  title: string;
  /** The line under it (what was recorded, in plain words). */
  description?: string;
}

/**
 * Runs one change of a placement (extend, request, complete, redeploy, note...). A change is a RECORD: the toast says what was recorded and, while the API
 * still offers it, an Undo that asks the API to take back the caller's own latest change. Returns the new detail, or null when it was refused (the
 * refusal is a toast in plain words).
 */
export function usePlacementAction(orgId: number | string, onChanged: (d: PlacementDetail) => void) {
  const toast = useToast();
  return useCallback(
    async (id: number, spec: ActionSpec, call: () => Promise<ApiResult<PlacementDetail>>): Promise<PlacementDetail | null> => {
      const r = await call();
      if (!r.ok) {
        toast({ title: "Couldn't record that", description: errorSentence(r), variant: "error" });
        return null;
      }
      const d = r.data;
      const undo = d.undo;
      toast({
        title: spec.title,
        description: spec.description,
        variant: "success",
        duration: UNDO_MS,
        action: undo
          ? {
              label: "Undo",
              onClick: () =>
                void placementsApi.undo(orgId, id, undo.eventId).then((u) => {
                  toast(u.ok ? { title: "Undone", description: "That change was taken back.", variant: "success" } : { title: "Couldn't undo", description: errorSentence(u), variant: "error" });
                  if (u.ok) onChanged(u.data);
                }),
            }
          : undefined,
      });
      onChanged(d);
      return d;
    },
    [orgId, toast, onChanged],
  );
}

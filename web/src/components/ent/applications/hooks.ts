"use client";

/* eslint-disable react-hooks/set-state-in-effect -- data loaders: the effect starts a fetch and the answer is stored (the pattern of the other admin pages) */

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@kiwiply/ui";
import { applicationsApi, errorSentence, stageLabel, type ApplicationDetail, type CloseReason, type PatchBody, type Stage } from "@/lib/ent/applications";

export const UNDO_MS = 9000; // config-literal-ok: how long an Undo stays offered in the toast (UI timing; the API window is ten minutes)

export type DetailState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "gone" }
  | { status: "error"; message: string }
  | { status: "ok"; detail: ApplicationDetail };

export type SaveResult = { ok: true; detail: ApplicationDetail } | { ok: false; message: string };

/** One application's detail: loads on open, reloads when `reloadToken` changes, and lets the drawer replace it with a saved answer. */
export function useApplicationDetail(orgId: number | string, id: number | null, reloadToken: number) {
  const [state, setState] = useState<DetailState>({ status: "idle" });
  const seq = useRef(0);

  const load = useCallback(
    async (quiet: boolean): Promise<ApplicationDetail | null> => {
      if (id === null) {
        setState({ status: "idle" });
        return null;
      }
      const mine = ++seq.current;
      if (!quiet) setState({ status: "loading" });
      const r = await applicationsApi.detail(orgId, id);
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

  const replace = useCallback((detail: ApplicationDetail) => setState({ status: "ok", detail }), []);

  const save = useCallback(
    async (body: PatchBody): Promise<SaveResult> => {
      if (id === null) return { ok: false, message: "Nothing is open." };
      const r = await applicationsApi.patch(orgId, id, body);
      if (!r.ok) return { ok: false, message: errorSentence(r) };
      setState({ status: "ok", detail: r.data });
      return { ok: true, detail: r.data };
    },
    [orgId, id],
  );

  return { state, replace, save, reload: () => load(true) };
}

/**
 * Records a stage move (the table's row menu, the pipeline cards and the drawer all use it). A move is a RECORD of what happened; the
 * toast says so and offers Undo, which asks the API to revert the caller's own latest move.
 */
export function useStageMove(orgId: number | string, onChanged: (d: ApplicationDetail) => void) {
  const toast = useToast();
  return useCallback(
    async (id: number, stage: Stage, closedReason?: CloseReason): Promise<ApplicationDetail | null> => {
      const r = await applicationsApi.move(orgId, id, stage, closedReason);
      if (!r.ok) {
        toast({ title: "Couldn't record that move", description: errorSentence(r), variant: "error" });
        return null;
      }
      const d = r.data;
      const undo = d.undo;
      toast({
        title: `${d.code} recorded as ${stageLabel(stage)}`,
        description: "This records what happened. Applications are never submitted from here.",
        variant: "success",
        duration: UNDO_MS,
        action: undo
          ? {
              label: "Undo",
              onClick: () =>
                void applicationsApi.undo(orgId, id, undo.eventId).then((u) => {
                  toast(u.ok ? { title: "Undone", description: `${d.code} is back to ${stageLabel(undo.fromStage)}.`, variant: "success" } : { title: "Couldn't undo", description: errorSentence(u), variant: "error" });
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

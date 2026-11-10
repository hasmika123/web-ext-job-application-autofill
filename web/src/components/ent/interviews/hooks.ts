"use client";

/* eslint-disable react-hooks/set-state-in-effect -- data loaders: the effect starts a fetch and the answer is stored (the pattern of the other admin pages) */

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@kiwiply/ui";
import { errorSentence, interviewsApi, statusLabel, type InterviewDetail, type PatchBody, type Status } from "@/lib/ent/interviews";

export const UNDO_MS = 9000; // config-literal-ok: how long an Undo stays offered in the toast (UI timing; the API window is the organization's setting)

export type DetailState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "gone" }
  | { status: "error"; message: string }
  | { status: "ok"; detail: InterviewDetail };

export type SaveResult = { ok: true; detail: InterviewDetail } | { ok: false; message: string };

/** One interview's detail: loads on open, reloads when `reloadToken` changes, and lets the drawer replace it with a saved answer. */
export function useInterviewDetail(orgId: number | string, id: number | null, reloadToken: number) {
  const [state, setState] = useState<DetailState>({ status: "idle" });
  const seq = useRef(0);

  const load = useCallback(
    async (quiet: boolean): Promise<InterviewDetail | null> => {
      if (id === null) {
        setState({ status: "idle" });
        return null;
      }
      const mine = ++seq.current;
      if (!quiet) setState({ status: "loading" });
      const r = await interviewsApi.detail(orgId, id);
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

  const replace = useCallback((detail: InterviewDetail) => setState({ status: "ok", detail }), []);

  const save = useCallback(
    async (body: PatchBody): Promise<SaveResult> => {
      if (id === null) return { ok: false, message: "Nothing is open." };
      const r = await interviewsApi.patch(orgId, id, body);
      if (!r.ok) return { ok: false, message: errorSentence(r) };
      setState({ status: "ok", detail: r.data });
      return { ok: true, detail: r.data };
    },
    [orgId, id],
  );

  return { state, replace, save, reload: () => load(true) };
}

/**
 * Records a status change (the table's row menu, the pipeline cards and the drawer all use it). A change is a RECORD of what happened; the
 * toast says so and offers Undo, which asks the API to revert the caller's own latest change.
 */
export function useStatusMove(orgId: number | string, onChanged: (d: InterviewDetail) => void) {
  const toast = useToast();
  return useCallback(
    async (id: number, status: Status, reason?: string): Promise<InterviewDetail | null> => {
      const r = await interviewsApi.setStatus(orgId, id, status, reason);
      if (!r.ok) {
        toast({ title: "Couldn't record that change", description: errorSentence(r), variant: "error" });
        return null;
      }
      const d = r.data;
      const undo = d.undo;
      toast({
        title: `${d.code} recorded as ${statusLabel(status)}`,
        description: "This records what happened. Interviews are not run or attended from here.",
        variant: "success",
        duration: UNDO_MS,
        action: undo
          ? {
              label: "Undo",
              onClick: () =>
                void interviewsApi.undo(orgId, id, undo.eventId).then((u) => {
                  toast(u.ok ? { title: "Undone", description: `${d.code} is back to ${statusLabel(undo.fromStatus)}.`, variant: "success" } : { title: "Couldn't undo", description: errorSentence(u), variant: "error" });
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

/** Records a reminder request. Nothing is sent: the toast says exactly that. */
export function useReminder(orgId: number | string, onChanged: (d: InterviewDetail) => void) {
  const toast = useToast();
  return useCallback(
    async (id: number): Promise<boolean> => {
      const r = await interviewsApi.remind(orgId, id);
      if (!r.ok) {
        toast({ title: "Couldn't record the reminder", description: errorSentence(r), variant: "error" });
        return false;
      }
      toast({ title: "Reminder recorded", description: `${r.data.code}: your team can see it. The message itself is not sent from here.`, variant: "success" });
      onChanged(r.data);
      return true;
    },
    [orgId, toast, onChanged],
  );
}

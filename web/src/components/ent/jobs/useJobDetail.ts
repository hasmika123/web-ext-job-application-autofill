"use client";

/* eslint-disable react-hooks/set-state-in-effect -- data loader: the effect starts a fetch and the answer is stored (the pattern of the other admin pages) */

import { useCallback, useEffect, useRef, useState } from "react";
import { errorSentence, jobsApi, type JobDetail, type PatchBody } from "@/lib/ent/jobs";

export type DetailState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "gone" }
  | { status: "error"; message: string }
  | { status: "ok"; detail: JobDetail };

export type SaveResult = { ok: true; detail: JobDetail } | { ok: false; error: string };

/**
 * One job's drawer data. `save` is the autosave: it PATCHes with the version of the last answer, one call at a time (a second edit waits
 * for the first, so the If-Match always names the newest version), and stores the answer. A stale version (412) reloads the job and says so.
 */
export function useJobDetail(orgId: number | string, jobId: number | null, reloadToken: number) {
  const [state, setState] = useState<DetailState>({ status: "idle" });
  const version = useRef("");
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const current = useRef<number | null>(null);

  const load = useCallback(
    async (id: number, quiet: boolean): Promise<JobDetail | null> => {
      if (!quiet) setState({ status: "loading" });
      const r = await jobsApi.detail(orgId, id);
      if (current.current !== id) return null;
      if (r.ok) {
        version.current = r.data.version;
        setState({ status: "ok", detail: r.data });
        return r.data;
      }
      if (r.status === 404) setState({ status: "gone" });
      else if (!quiet) setState({ status: "error", message: errorSentence(r) });
      return null;
    },
    [orgId],
  );

  useEffect(() => {
    current.current = jobId;
    if (jobId === null) {
      setState({ status: "idle" });
      return;
    }
    void load(jobId, false);
  }, [jobId, load]);

  useEffect(() => {
    if (reloadToken > 0 && jobId !== null) void load(jobId, true);
  }, [reloadToken, jobId, load]);

  const save = useCallback(
    (body: PatchBody): Promise<SaveResult> => {
      const id = current.current;
      if (id === null) return Promise.resolve({ ok: false, error: "No job is open." });
      const run = async (): Promise<SaveResult> => {
        const r = await jobsApi.patch(orgId, id, body, version.current);
        if (r.ok) {
          version.current = r.data.version;
          if (current.current === id) setState({ status: "ok", detail: r.data });
          return { ok: true, detail: r.data };
        }
        if (r.status === 412 || r.status === 428) void load(id, true);
        return { ok: false, error: errorSentence(r) };
      };
      const next = chain.current.then(run, run);
      chain.current = next;
      return next;
    },
    [orgId, load],
  );

  /** Takes an answer the page got elsewhere (an assign, a dismissed match) as the current detail. */
  const replace = useCallback((d: JobDetail) => {
    if (current.current !== d.id) return;
    version.current = d.version;
    setState({ status: "ok", detail: d });
  }, []);

  const reload = useCallback(async () => (current.current === null ? null : load(current.current, true)), [load]);

  return { state, save, replace, reload };
}

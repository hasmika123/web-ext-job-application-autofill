"use client";

/* eslint-disable react-hooks/set-state-in-effect -- data loader: the effect starts a fetch and the answer is stored (the pattern of the other admin pages) */

import { useCallback, useEffect, useRef, useState } from "react";
import { clientsApi, errorSentence, type ClientDetail, type PatchBody } from "@/lib/ent/clients";

export type DetailState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "gone" }
  | { status: "error"; message: string }
  | { status: "ok"; detail: ClientDetail };

export type SaveResult = { ok: true; detail: ClientDetail } | { ok: false; error: string };

/**
 * One client's drawer data. `save` is the autosave: it PATCHes with the version of the last answer, one call at a time (a second edit waits
 * for the first, so the If-Match always names the newest version), and stores the answer. A stale version (412) reloads the client and says so.
 */
export function useClientDetail(orgId: number | string, clientId: number | null, reloadToken: number) {
  const [state, setState] = useState<DetailState>({ status: "idle" });
  const version = useRef("");
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const current = useRef<number | null>(null);

  const load = useCallback(
    async (id: number, quiet: boolean): Promise<ClientDetail | null> => {
      if (!quiet) setState({ status: "loading" });
      const r = await clientsApi.detail(orgId, id);
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
    current.current = clientId;
    if (clientId === null) {
      setState({ status: "idle" });
      return;
    }
    void load(clientId, false);
  }, [clientId, load]);

  useEffect(() => {
    if (reloadToken > 0 && clientId !== null) void load(clientId, true);
  }, [reloadToken, clientId, load]);

  const save = useCallback(
    (body: PatchBody): Promise<SaveResult> => {
      const id = current.current;
      if (id === null) return Promise.resolve({ ok: false, error: "No client is open." });
      const run = async (): Promise<SaveResult> => {
        const r = await clientsApi.patch(orgId, id, body, version.current);
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

  /** Takes an answer the page got elsewhere (a new contact or note) as the current detail. */
  const replace = useCallback((d: ClientDetail) => {
    if (current.current !== d.id) return;
    version.current = d.version;
    setState({ status: "ok", detail: d });
  }, []);

  const reload = useCallback(async () => (current.current === null ? null : load(current.current, true)), [load]);

  return { state, save, replace, reload };
}

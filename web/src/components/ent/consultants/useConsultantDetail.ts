"use client";

/* eslint-disable react-hooks/set-state-in-effect -- data loaders: the effect starts a fetch and the answer is stored (the pattern of the other admin pages) */

import { useCallback, useEffect, useRef, useState } from "react";
import { consultantsApi, errorSentence, type ApiResult, type ConsultantDetail, type PatchBody } from "@/lib/ent/consultants";

export type DetailState = { status: "idle" } | { status: "loading" } | { status: "gone" } | { status: "error"; message: string } | { status: "ok"; detail: ConsultantDetail };

export type SaveResult = { ok: true; detail: ConsultantDetail } | { ok: false; message: string; code?: string };

/**
 * One consultant's drawer data: loads `GET /consultants/{id}` (the ETag travels in `detail.version`), and `save` PATCHes with `If-Match`. A 412
 * (someone else changed the consultant) reloads and sends the same change once more on the fresh version, so an edit is never silently lost and
 * never overwrites a field it did not touch (the PATCH carries only the changed keys).
 */
export function useConsultantDetail(orgId: number | string, id: number | null, reloadToken: number) {
  const [state, setState] = useState<DetailState>({ status: "idle" });
  const ref = useRef<DetailState>(state);
  const seq = useRef(0);
  useEffect(() => {
    ref.current = state;
  });

  const load = useCallback(
    async (cid: number, quiet: boolean) => {
      const mine = ++seq.current;
      if (!quiet) setState({ status: "loading" });
      const r = await consultantsApi.detail(orgId, cid);
      if (mine !== seq.current) return null;
      if (r.ok) {
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
    if (id === null) {
      seq.current++;
      setState({ status: "idle" });
      return;
    }
    void load(id, false);
  }, [id, load]);

  // an action elsewhere (a row menu, a bulk change) refreshes the open consultant quietly
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (id !== null) void load(id, true);
  }, [reloadToken, id, load]);

  const save = useCallback(
    async (body: PatchBody): Promise<SaveResult> => {
      const cur = ref.current;
      if (cur.status !== "ok") return { ok: false, message: "This consultant isn't loaded." };
      const cid = cur.detail.consultant.id;
      let r: ApiResult<ConsultantDetail> = await consultantsApi.patch(orgId, cid, body, cur.detail.version);
      if (!r.ok && (r.status === 412 || r.status === 428)) {
        const fresh = await consultantsApi.detail(orgId, cid);
        if (fresh.ok) {
          setState({ status: "ok", detail: fresh.data });
          r = await consultantsApi.patch(orgId, cid, body, fresh.data.version);
        }
      }
      if (r.ok) {
        seq.current++;
        setState({ status: "ok", detail: r.data });
        return { ok: true, detail: r.data };
      }
      return { ok: false, message: errorSentence(r), code: r.code };
    },
    [orgId],
  );

  const replace = useCallback((detail: ConsultantDetail) => setState({ status: "ok", detail }), []);

  return { state, save, replace, reload: () => (id !== null ? load(id, true) : Promise.resolve(null)) };
}

export type TabState<T> = { status: "loading" } | { status: "error"; message: string } | { status: "ok"; data: T };

/** A drawer tab's data: loaded when the tab opens and again whenever `reloadToken` or `version` moves (something changed this consultant). */
export function useTabData<T>(load: () => Promise<ApiResult<T>>, deps: ReadonlyArray<unknown>): { state: TabState<T>; retry: () => void } {
  const [state, setState] = useState<TabState<T>>({ status: "loading" });
  const [nonce, setNonce] = useState(0);
  const seq = useRef(0);
  useEffect(() => {
    const mine = ++seq.current;
    setState((s) => (s.status === "ok" ? s : { status: "loading" }));
    void load().then((r) => {
      if (mine !== seq.current) return;
      setState(r.ok ? { status: "ok", data: r.data } : { status: "error", message: errorSentence(r) });
    });
    // `load` closes over the ids named in `deps`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);
  return { state, retry: () => setNonce((n) => n + 1) };
}

"use client";

/* eslint-disable react-hooks/set-state-in-effect -- data loaders: the effect starts a fetch and the answer is stored (the pattern of the other admin pages) */

import { useCallback, useEffect, useRef, useState } from "react";
import { errorSentence, membersApi, type MemberDetail, type PatchBody } from "@/lib/ent/members";

export type DetailState = { status: "idle" } | { status: "loading" } | { status: "gone" } | { status: "error"; message: string } | { status: "ok"; detail: MemberDetail };

export type SaveResult = { ok: true; detail: MemberDetail } | { ok: false; message: string; code?: string };

/**
 * One member's detail sheet data: loads `GET /members/{id}` (the ETag travels in `detail.version`), and `save` PATCHes with `If-Match`.
 * A 412 (someone else changed the person) reloads the person and sends the same change once more on the fresh version, so an edit
 * is never silently lost and never overwrites a field it did not touch (the PATCH carries only the changed keys).
 */
export function useMemberDetail(orgId: number | string, memberId: number | null, reloadToken: number) {
  const [state, setState] = useState<DetailState>({ status: "idle" });
  const ref = useRef<DetailState>(state);
  const seq = useRef(0);
  useEffect(() => {
    ref.current = state;
  });

  const load = useCallback(
    async (id: number, quiet: boolean) => {
      const mine = ++seq.current;
      if (!quiet) setState({ status: "loading" });
      const r = await membersApi.detail(orgId, id);
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
    if (memberId === null) {
      seq.current++;
      setState({ status: "idle" });
      return;
    }
    void load(memberId, false);
  }, [memberId, load]);

  // an action elsewhere (suspend from the row menu, a bulk change) refreshes the open person quietly
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (memberId !== null) void load(memberId, true);
  }, [reloadToken, memberId, load]);

  const save = useCallback(
    async (body: PatchBody): Promise<SaveResult> => {
      const cur = ref.current;
      if (cur.status !== "ok") return { ok: false, message: "This person isn't loaded." };
      const id = cur.detail.id;
      let r = await membersApi.patch(orgId, id, body, cur.detail.version);
      if (!r.ok && (r.status === 412 || r.status === 428)) {
        const fresh = await membersApi.detail(orgId, id);
        if (fresh.ok) {
          setState({ status: "ok", detail: fresh.data });
          r = await membersApi.patch(orgId, id, body, fresh.data.version);
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

  const replace = useCallback((detail: MemberDetail) => setState({ status: "ok", detail }), []);

  return { state, save, replace, reload: () => (memberId !== null ? load(memberId, true) : Promise.resolve(null)) };
}

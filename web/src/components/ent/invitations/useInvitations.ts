"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_QUERY,
  hasFilter,
  invitationsApi,
  type Activity,
  type FormOptions,
  type Invitation,
  type InvitationCounts,
  type InviteStatus,
  type ListQuery,
} from "@/lib/ent/invitations";

export interface ListState {
  items: Invitation[];
  total: number;
  loading: boolean;
  error: string | null;
}

/**
 * The Invitations page's state: the filtered, paged list, the four counters, the activity feed and the form options, each loaded on
 * its own so one failure never blanks the page. A response that arrives after a newer request was made is dropped (typing in the
 * search box can outrun the network). Optimistic changes (`patchRow`, `restore`) touch only the loaded page; `refreshSide` then
 * brings the counters and the feed back in line with the server.
 */
export function useInvitations(orgId: number | string) {
  const [query, setQuery] = useState<ListQuery>(DEFAULT_QUERY);
  const [list, setList] = useState<ListState>({ items: [], total: 0, loading: true, error: null });
  const [counts, setCounts] = useState<InvitationCounts | null>(null);
  const [countsError, setCountsError] = useState(false);
  const [activity, setActivity] = useState<Activity[] | null>(null);
  const [options, setOptions] = useState<FormOptions | null>(null);
  const seq = useRef(0);
  const queryRef = useRef(query);
  useEffect(() => {
    queryRef.current = query;
  });

  const load = useCallback(
    async (q: ListQuery, quiet = false) => {
      const mine = ++seq.current;
      if (!quiet) setList((l) => ({ ...l, loading: true, error: null }));
      const r = await invitationsApi.list(orgId, q);
      if (mine !== seq.current) return;
      if (r.ok) setList({ items: r.data.items ?? [], total: r.data.total ?? 0, loading: false, error: null });
      else setList((l) => ({ ...l, loading: false, error: r.message }));
    },
    [orgId],
  );

  const refreshSide = useCallback(async () => {
    const [c, a] = await Promise.all([invitationsApi.counts(orgId), invitationsApi.activity(orgId, 10)]);
    if (c.ok) {
      setCounts(c.data);
      setCountsError(false);
    } else setCountsError(true);
    if (a.ok) setActivity(a.data);
  }, [orgId]);

  /** Reloads the list (quietly: the rows stay while it loads) and the counters. */
  const reload = useCallback(async () => {
    await Promise.all([load(queryRef.current, true), refreshSide()]);
  }, [load, refreshSide]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading data: the list follows the query (setState happens when the response lands)
    void load(query);
  }, [query, load]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading data: counters, feed and form options once per organization
    void refreshSide();
    void invitationsApi.options(orgId).then((r) => setOptions(r.ok ? r.data : { roles: [], departments: [], rolesAvailable: false, departmentsAvailable: false }));
  }, [orgId, refreshSide]);

  const setFilter = useCallback((patch: Partial<ListQuery>) => setQuery((q) => ({ ...q, ...patch, page: patch.page ?? 1 })), []);

  /** Optimistic: change one loaded row, or drop it (`null`). */
  const patchRow = useCallback((id: number, fn: (row: Invitation) => Invitation | null) => {
    setList((l) => {
      const items: Invitation[] = [];
      let removed = 0;
      for (const row of l.items) {
        if (row.id !== id) items.push(row);
        else {
          const next = fn(row);
          if (next) items.push(next);
          else removed += 1;
        }
      }
      return { ...l, items, total: Math.max(0, l.total - removed) };
    });
  }, []);

  /** Put a snapshot back (an optimistic change the server refused). */
  const restore = useCallback((snapshot: ListState) => setList(snapshot), []);

  const pageCount = Math.max(1, Math.ceil(list.total / query.size));
  const filtered = hasFilter(query);
  const countOf = (s: InviteStatus) => counts?.counts.find((c) => c.status === s);
  return { query, setFilter, list, load, reload, refreshSide, counts, countsError, countOf, activity, options, patchRow, restore, pageCount, filtered };
}

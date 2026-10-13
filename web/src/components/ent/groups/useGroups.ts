"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@kiwiply/ui";
import { failMessage, groupsApi, type DirectoryPage, type DirectoryQuery, type Group, type GroupBody, type GroupKind, type Structure } from "@/lib/ent/groups";

export type LoadState = "loading" | "ready" | "error";

/**
 * The two reads both pages use: the directory (filtered, sorted, paged: the table and the KPI numbers) and the structure (every
 * department with its teams: the cards, the tree, the bars). Both reload together after any change. The previous data stays on
 * screen while a new page loads, so a filter does not flash the skeleton.
 */
export function useGroupsData(orgId: number | string, kind: GroupKind, query: Omit<DirectoryQuery, "kind">) {
  const [directory, setDirectory] = useState<DirectoryPage | null>(null);
  const [structure, setStructure] = useState<Structure | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const key = JSON.stringify(query);
  const queryRef = useRef(query);
  useEffect(() => {
    queryRef.current = query;
  });

  const reload = useCallback(async () => {
    const mine = ++seq.current;
    const [d, s] = await Promise.all([groupsApi.directory(orgId, { ...queryRef.current, kind }), groupsApi.structure(orgId)]);
    if (mine !== seq.current) return; // a newer request owns the screen
    if (!d.ok) {
      setError(failMessage(d));
      setState("error");
      return;
    }
    if (!s.ok) {
      setError(failMessage(s));
      setState("error");
      return;
    }
    setDirectory(d.data);
    setStructure(s.data);
    setError(null);
    setState("ready");
  }, [orgId, kind]);

  useEffect(() => {
    void reload();
  }, [reload, key]);

  return { directory, structure, state, error, reload };
}

/**
 * The edits both pages make. Nothing here has a Save button: a change is sent the moment it is made, the toast says what
 * happened, and a change that can be reversed carries an Undo that sends the opposite edit with the group's NEW version.
 */
export function useGroupActions(orgId: number | string, reload: () => Promise<void> | void) {
  const toast = useToast();

  const fail = useCallback(
    (f: Parameters<typeof failMessage>[0]) => {
      toast({ title: failMessage(f), variant: "error" });
      if (f.status === 412) void reload();
    },
    [toast, reload],
  );

  /** Sends `body`; on success toasts `done` with an Undo that sends `inverse`. Resolves to the updated group, or null when refused. */
  const patch = useCallback(
    async (group: Group, body: GroupBody, done: string, inverse?: GroupBody): Promise<Group | null> => {
      const r = await groupsApi.update(orgId, group.id, group.version, body);
      if (!r.ok) {
        fail(r);
        return null;
      }
      const updated = r.data;
      toast({
        title: done,
        duration: 7000,
        action: inverse
          ? {
              label: "Undo",
              onClick: () => {
                void groupsApi.update(orgId, updated.id, updated.version, inverse).then((u) => {
                  if (!u.ok) fail(u);
                  void reload();
                });
              },
            }
          : undefined,
      });
      await reload();
      return updated;
    },
    [orgId, reload, toast, fail],
  );

  const create = useCallback(
    async (body: GroupBody, memberIds: number[] = []): Promise<Group | null> => {
      const r = await groupsApi.create(orgId, body);
      if (!r.ok) {
        fail(r);
        return null;
      }
      if (memberIds.length > 0) {
        const m = await groupsApi.move(orgId, r.data.id, memberIds);
        if (!m.ok) fail(m);
      }
      toast({ title: `${r.data.name} created`, variant: "success" });
      await reload();
      return r.data;
    },
    [orgId, reload, toast, fail],
  );

  const remove = useCallback(
    async (group: Group): Promise<boolean> => {
      const r = await groupsApi.remove(orgId, group.id, group.version);
      if (!r.ok) {
        fail(r);
        return false;
      }
      toast({ title: `${group.name} deleted` });
      await reload();
      return true;
    },
    [orgId, reload, toast, fail],
  );

  const move = useCallback(
    async (group: Group, memberIds: number[], what: string): Promise<boolean> => {
      const r = await groupsApi.move(orgId, group.id, memberIds);
      if (!r.ok) {
        fail(r);
        return false;
      }
      const { moved, unchanged, skipped } = r.data;
      toast({ title: moved > 0 ? `${what} moved to ${group.name}` : unchanged > 0 ? "Already there" : "Nobody was moved", description: skipped > 0 ? `${skipped} could not be moved.` : undefined });
      await reload();
      return moved > 0 || unchanged > 0;
    },
    [orgId, reload, toast, fail],
  );

  return { patch, create, remove, move, fail };
}

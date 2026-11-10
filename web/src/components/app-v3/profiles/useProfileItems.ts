"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@kiwiply/ui";
import { createItem, deleteItem, updateItem, type ItemData, type ProfileItem, type ProfileSection } from "@/lib/profile-items";

/** How long "Entry deleted - Undo" stays up before the delete is sent. */
export const UNDO_WINDOW_MS = 6000;

export interface ProfileItemsApi {
  /** Live items (a delete waiting out its undo window is already gone from here). */
  items: ProfileItem[];
  bySection: (section: ProfileSection) => ProfileItem[];
  /** Total live items, hidden ones included: what the per-user cap counts. */
  count: number;
  add: (section: ProfileSection, data: ItemData) => Promise<ProfileItem>;
  /** Replace an item's data. Rejects with the API's refusal so the form can show it. */
  save: (id: number, data: ItemData) => Promise<ProfileItem>;
  toggleHidden: (id: number) => Promise<void>;
  /** Hide the item now, offer Undo, and delete it for real when the window closes. */
  remove: (id: number) => void;
}

/**
 * The `/profiles` page's items: one list for every tab, so the Overview tiles and the section tabs
 * agree. Writes go through the BFF; `onChanged` runs after each successful write (the page re-reads
 * the completeness meter). Delete is optimistic with an undo window; a delete still waiting when the
 * page unmounts is sent then, so leaving the page never silently keeps something the user deleted.
 */
export function useProfileItems(initial: ProfileItem[], onChanged: () => void): ProfileItemsApi {
  const toast = useToast();
  const [items, setItems] = useState<ProfileItem[]>(initial);
  const [pending, setPending] = useState<ReadonlySet<number>>(new Set());
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const changed = useRef(onChanged);
  useEffect(() => {
    changed.current = onChanged;
  }, [onChanged]);

  const live = useMemo(() => items.filter((i) => !pending.has(i.id)), [items, pending]);

  const bySection = useCallback(
    (section: ProfileSection) => live.filter((i) => i.section === section).sort((a, b) => a.position - b.position),
    [live],
  );

  const add = useCallback(async (section: ProfileSection, data: ItemData) => {
    const created = await createItem(section, data);
    setItems((prev) => [...prev, created]);
    changed.current();
    return created;
  }, []);

  const save = useCallback(async (id: number, data: ItemData) => {
    const updated = await updateItem(id, { dataJson: data, provenance: "USER" });
    setItems((prev) => prev.map((i) => (i.id === id ? updated : i)));
    changed.current();
    return updated;
  }, []);

  const toggleHidden = useCallback(
    async (id: number) => {
      const current = items.find((i) => i.id === id);
      if (!current) return;
      const hidden = !current.hidden;
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, hidden } : i)));
      try {
        const updated = await updateItem(id, { hidden });
        setItems((prev) => prev.map((i) => (i.id === id ? updated : i)));
        changed.current();
      } catch {
        setItems((prev) => prev.map((i) => (i.id === id ? { ...i, hidden: !hidden } : i)));
        toast({ title: "Couldn't update that entry", description: "Check your connection and try again.", variant: "error" });
      }
    },
    [items, toast],
  );

  const settle = useCallback((id: number) => {
    setPending((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const commitDelete = useCallback(
    async (id: number) => {
      timers.current.delete(id);
      try {
        await deleteItem(id);
        setItems((prev) => prev.filter((i) => i.id !== id));
        settle(id);
        changed.current();
      } catch {
        settle(id); // the entry comes back
        toast({ title: "Couldn't delete that entry", description: "It's back in your list.", variant: "error" });
      }
    },
    [settle, toast],
  );

  const remove = useCallback(
    (id: number) => {
      setPending((prev) => new Set(prev).add(id));
      timers.current.set(
        id,
        setTimeout(() => void commitDelete(id), UNDO_WINDOW_MS),
      );
      toast({
        title: "Entry deleted",
        duration: UNDO_WINDOW_MS,
        action: {
          label: "Undo",
          onClick: () => {
            const t = timers.current.get(id);
            if (t) clearTimeout(t);
            timers.current.delete(id);
            settle(id);
          },
        },
      });
    },
    [commitDelete, settle, toast],
  );

  // Leaving the page with a delete still in its undo window: send it now.
  useEffect(() => {
    const open = timers.current;
    return () => {
      for (const [id, t] of open) {
        clearTimeout(t);
        void deleteItem(id).catch(() => undefined);
      }
      open.clear();
    };
  }, []);

  return { items: live, bySection, count: live.length, add, save, toggleHidden, remove };
}

"use client";

import { useEffect, useRef, useState } from "react";
import { ChipInput, Button, Input, PlusIcon, SourceChip, TrashIcon, scanSensitive } from "@kiwiply/ui";
import { ItemApiError, type ProfileItem } from "@/lib/profile-items";
import { sensitiveMessage, skillList } from "./itemSchema";
import type { ProfileItemsApi } from "./useProfileItems";

/** Quiet time after the last chip change before the group is saved. */
export const SKILLS_SAVE_DELAY_MS = 700;

/** The group name a skills item gets when the user adds chips without naming it. */
const DEFAULT_GROUP = "Skills";

type Edit = { group: string; skills: string[] };
type Draft = { key: string; id?: number };
type Status = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };
type Row = { key: string; id: number | undefined; group: string; skills: string[]; source: ProfileItem | undefined };

const omit = (obj: Record<string, Edit>, key: string): Record<string, Edit> => {
  const next = { ...obj };
  delete next[key];
  return next;
};

const sameSkills = (a: string[], b: string[]) => a.length === b.length && a.every((s, i) => s === b[i]);

/**
 * Skills as chips, in named groups ("Languages", "Tools" ...) (R1.2). Each group is one SKILL profile
 * item `{group, skills[]}`. Typing a skill and pressing Enter adds a chip; the group saves itself a
 * moment after the last change (the same feel as the bio editor), and a brand-new group is created on
 * its first chip. Deleting a group offers Undo like any other entry. Never-collected values are
 * refused here before the API has to.
 */
export default function SkillsChips({ api, atCap, loadFailed }: { api: ProfileItemsApi; atCap: boolean; loadFailed: boolean }) {
  const saved = api.bySection("SKILL");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [notice, setNotice] = useState<string | null>(null);

  // The latest view for the debounced save, which outlives the render that scheduled it.
  const rows: Row[] = (() => {
    const claimed = new Set(drafts.flatMap((d) => (d.id !== undefined ? [d.id] : [])));
    const build = (key: string, item: ProfileItem | undefined, id: number | undefined): Row => {
      const stored = item && typeof item.data.group === "string" && item.data.group ? item.data.group : item ? DEFAULT_GROUP : "";
      return {
        key,
        id,
        group: edits[key]?.group ?? stored,
        skills: edits[key]?.skills ?? (item ? skillList(item.data) : []),
        source: item,
      };
    };
    return [
      ...saved.filter((i) => !claimed.has(i.id)).map((i) => build(`item-${i.id}`, i, i.id)),
      ...drafts.map((d) => build(d.key, d.id !== undefined ? saved.find((i) => i.id === d.id) : undefined, d.id)),
    ];
  })();

  const rowsRef = useRef(rows);
  const editsRef = useRef(edits);
  const apiRef = useRef(api);
  useEffect(() => {
    rowsRef.current = rows;
    apiRef.current = api;
  });

  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const inflight = useRef(new Set<string>());
  const again = useRef(new Set<string>());
  const seq = useRef(0);

  const showError = (e: unknown) => {
    if (e instanceof ItemApiError && e.code === "SENSITIVE_CONTENT") setStatus({ kind: "error", message: sensitiveMessage(e.cls ?? "") });
    else if (e instanceof ItemApiError && e.code === "ITEM_LIMIT")
      setStatus({ kind: "error", message: "Your profile is full. Delete an entry to add more skills." });
    else setStatus({ kind: "error", message: "Couldn't save your skills. We'll try again on your next change." });
  };

  const flush = async (key: string): Promise<void> => {
    if (inflight.current.has(key)) {
      again.current.add(key);
      return;
    }
    const row = rowsRef.current.find((r) => r.key === key);
    const edit = editsRef.current[key];
    if (!row || !edit) return; // nothing changed since the last save
    if (row.id === undefined && edit.skills.length === 0) return; // an empty new group is not saved yet
    const data = { group: edit.group.trim() || DEFAULT_GROUP, skills: edit.skills };
    inflight.current.add(key);
    setStatus({ kind: "saving" });
    try {
      if (row.id !== undefined) {
        await apiRef.current.save(row.id, data);
      } else {
        const created = await apiRef.current.add("SKILL", data);
        setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, id: created.id } : d)));
      }
      // Drop the local copy unless the user typed more while the save was in flight.
      const now = editsRef.current[key];
      if (now && now.group.trim() === data.group && sameSkills(now.skills, data.skills)) {
        editsRef.current = omit(editsRef.current, key);
        setEdits(editsRef.current);
      }
      setStatus({ kind: "saved" });
    } catch (e) {
      showError(e);
    } finally {
      inflight.current.delete(key);
      if (again.current.delete(key)) void flush(key);
    }
  };

  const schedule = (key: string) => {
    const t = timers.current.get(key);
    if (t) clearTimeout(t);
    timers.current.set(
      key,
      setTimeout(() => {
        timers.current.delete(key);
        void flush(key);
      }, SKILLS_SAVE_DELAY_MS),
    );
  };

  // Leaving the tab with an unsaved change: save it now.
  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  });
  useEffect(() => {
    const open = timers.current;
    return () => {
      for (const [key, t] of open) {
        clearTimeout(t);
        void flushRef.current(key);
      }
      open.clear();
    };
  }, []);

  const change = (key: string, patch: Partial<Edit>) => {
    const row = rowsRef.current.find((r) => r.key === key);
    if (!row) return;
    const current = editsRef.current[key] ?? { group: row.group, skills: row.skills };
    const next: Edit = { group: patch.group ?? current.group, skills: patch.skills ?? current.skills };
    if (patch.skills) {
      const added = patch.skills.filter((s) => !current.skills.includes(s));
      const hit = added.map((s) => scanSensitive(s)[0]).find(Boolean);
      if (hit) {
        setNotice(sensitiveMessage(hit.cls));
        return;
      }
    }
    setNotice(null);
    editsRef.current = { ...editsRef.current, [key]: next };
    setEdits(editsRef.current);
    schedule(key);
  };

  const addGroup = () => {
    seq.current += 1;
    setDrafts((prev) => [...prev, { key: `draft-${seq.current}` }]);
  };

  const removeGroup = (key: string, id: number | undefined) => {
    const t = timers.current.get(key);
    if (t) clearTimeout(t);
    timers.current.delete(key);
    editsRef.current = omit(editsRef.current, key);
    setEdits(editsRef.current);
    setDrafts((prev) => prev.filter((d) => d.key !== key));
    if (id !== undefined) api.remove(id);
  };

  return (
    <section aria-label="Skills" className="rounded-2xl border border-v2-line/70 bg-paper p-4 shadow-v2-soft sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-[17px] font-extrabold text-v2-navy">Skills</h2>
        <Button variant="ghost" size="sm" className="ml-auto max-sm:min-h-11" disabled={loadFailed || atCap} onClick={addGroup}>
          <PlusIcon size={14} aria-hidden /> Add group
        </Button>
      </div>
      <p className="mt-1 text-[12.5px] text-v2-muted">Type a skill and press Enter. Group them however reads best on a resume.</p>

      {loadFailed && (
        <p role="alert" className="mt-3 text-[13px] text-danger">
          We couldn&apos;t load your skills. Refresh the page to try again.
        </p>
      )}

      {rows.length === 0 && !loadFailed ? (
        <p className="mt-4 text-[13.5px] text-v2-ink-soft">No skills yet. Add a group to start.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-4">
          {rows.map((r) => (
            <li key={r.key} className="rounded-xl border border-v2-line/70 p-3 sm:p-4">
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1 sm:max-w-xs">
                  <label htmlFor={`${r.key}-group`} className="mb-1.5 block text-[12.5px] font-semibold text-ink-soft">
                    Group name
                  </label>
                  <Input
                    id={`${r.key}-group`}
                    value={r.group}
                    placeholder={DEFAULT_GROUP}
                    disabled={loadFailed}
                    onChange={(e) => change(r.key, { group: e.target.value })}
                  />
                </div>
                <div className="flex flex-none items-center gap-2 pb-1">
                  <SourceChip provenance={r.source?.provenance} className="hidden sm:inline-flex" />
                  <button
                    type="button"
                    aria-label={`Delete group ${r.group || DEFAULT_GROUP}`}
                    onClick={() => removeGroup(r.key, r.id)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-v2-ink-soft transition-colors hover:bg-paper-2 hover:text-danger max-sm:h-11 max-sm:w-11"
                  >
                    <TrashIcon size={16} aria-hidden />
                  </button>
                </div>
              </div>
              <ChipInput
                className="mt-3"
                label={`Skills in ${r.group || DEFAULT_GROUP}`}
                placeholder="Add a skill"
                value={r.skills}
                disabled={loadFailed}
                onChange={(skills) => change(r.key, { skills })}
              />
            </li>
          ))}
        </ul>
      )}

      <div aria-live="polite" className="mt-3 min-h-5 text-[12.5px]">
        {notice ? (
          <span role="alert" className="font-medium text-danger">
            {notice}
          </span>
        ) : status.kind === "saving" ? (
          <span className="text-v2-muted">Saving&hellip;</span>
        ) : status.kind === "saved" ? (
          <span className="text-v2-green-ink">All changes saved</span>
        ) : status.kind === "error" ? (
          <span role="alert" className="font-medium text-danger">
            {status.message}
          </span>
        ) : null}
      </div>
    </section>
  );
}

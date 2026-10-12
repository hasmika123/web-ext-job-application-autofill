"use client";

import { useEffect, useRef, useState } from "react";
import { Button, EmptyState, IconButton, PlusIcon, StarIcon, Tooltip, TrashIcon, cn, useToast } from "@kiwiply/ui";
import { addNote, deleteNote, timeAgo, updateNote, type ApplicationNote } from "@/lib/applications";
import { useAutosave } from "@/lib/autosave";
import { toAutosave } from "@/lib/tracker-client";
import { undoToast } from "@/lib/undo-toast";
import AutosaveChip from "./AutosaveChip";

/** The longest note the API takes (`tracker.note.maxChars`): the box stops there instead of failing on save. */
const NOTE_MAX = 4000; // config-literal-ok: mirrors the server's note limit for the textarea's maxLength, not a tunable

interface Draft {
  /** A key that is stable for the editor's life (the note id, or a local one until the first save creates it). */
  key: string;
  note: ApplicationNote | null;
}

let localKey = 0;
const newDraft = (): Draft => ({ key: `new-${++localKey}`, note: null });

/**
 * Notes of one application. Each note is its own autosaving box: type and it saves (a new note is created the first
 * time it has words in it), pin to keep it on top, delete and Undo brings it back. No Save button anywhere.
 */
export default function NotesTab({
  applicationId,
  notes,
  onCount,
}: {
  applicationId: number;
  notes: ApplicationNote[];
  /** The note count changed (a note was created or removed): the list row's badge follows. */
  onCount(count: number): void;
}) {
  const toast = useToast();
  const [drafts, setDrafts] = useState<Draft[]>(() => notes.map((n) => ({ key: String(n.id), note: n })));
  const count = useRef(notes.length);

  function setCount(next: number) {
    if (next !== count.current) {
      count.current = next;
      onCount(next);
    }
  }

  const live = (list: Draft[]) => list.filter((d) => d.note).length;

  async function remove(d: Draft) {
    const note = d.note;
    if (!note) {
      setDrafts((all) => all.filter((x) => x.key !== d.key));
      return;
    }
    setDrafts((all) => all.filter((x) => x.key !== d.key));
    setCount(live(drafts) - 1);
    const r = await deleteNote(applicationId, note.id);
    if (r.kind === "error" && r.status !== 404) {
      setDrafts((all) => (all.some((x) => x.key === d.key) ? all : [d, ...all]));
      setCount(live(drafts));
      toast({ title: "Couldn't delete that note", description: r.message, variant: "error" });
      return;
    }
    undoToast(toast, {
      title: "Note deleted",
      onUndo: () => {
        void addNote(applicationId, note.body, note.pinned).then((back) => {
          if (back.kind === "ok") {
            setDrafts((all) => [{ key: String(back.data.id), note: back.data }, ...all]);
            setCount(live(drafts));
          } else toast({ title: "Couldn't bring the note back", description: back.message, variant: "error" });
        });
      },
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] text-ink-soft">Private to you. Autosaved as you type.</p>
        <Button size="sm" variant="ghost" onClick={() => setDrafts((all) => [newDraft(), ...all])} className="min-h-10 flex-none">
          <PlusIcon aria-hidden className="h-4 w-4" />
          Add note
        </Button>
      </div>
      {drafts.length === 0 ? (
        <EmptyState
          variant="inline"
          title="No notes yet"
          description="Prep ideas, names, what the recruiter said. Jot it here and it is saved."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {drafts.map((d) => (
            <li key={d.key}>
              <NoteEditor
                applicationId={applicationId}
                draft={d}
                onCreated={(n) => {
                  setDrafts((all) => all.map((x) => (x.key === d.key ? { ...x, note: n } : x)));
                  setCount(live(drafts) + (d.note ? 0 : 1));
                }}
                onDelete={() => void remove(d)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NoteEditor({
  applicationId,
  draft,
  onCreated,
  onDelete,
}: {
  applicationId: number;
  draft: Draft;
  onCreated(note: ApplicationNote): void;
  onDelete(): void;
}) {
  const [text, setText] = useState(draft.note?.body ?? "");
  const [pinned, setPinned] = useState(draft.note?.pinned ?? false);
  const id = useRef<number | null>(draft.note?.id ?? null);
  const savedText = useRef(draft.note?.body ?? "");
  const box = useRef<HTMLTextAreaElement>(null);
  const [mountedAt] = useState(() => Date.now());
  /** Set once the person deletes the note: a save still waiting out its debounce must not bring it back. */
  const gone = useRef(false);

  // A brand-new note takes focus so the person can start typing straight away.
  useEffect(() => {
    if (!draft.note) box.current?.focus();
  }, [draft.note]);

  const autosave = useAutosave<string>(text, async (value) => {
    if (gone.current) return { kind: "ok" };
    const body = value.trim() === "" ? "" : value;
    if (id.current === null) {
      if (!body) return { kind: "ok" }; // an empty new note is not saved at all
      const r = await addNote(applicationId, body, pinned);
      if (r.kind === "ok") {
        id.current = r.data.id;
        savedText.current = body;
        onCreated(r.data);
      }
      return toAutosave(r);
    }
    if (!body) return { kind: "ok" }; // emptied: kept until the person deletes it (an API note cannot be blank)
    if (body === savedText.current) return { kind: "ok" };
    const r = await updateNote(applicationId, id.current, { body });
    if (r.kind === "ok") savedText.current = body;
    return toAutosave(r);
  });

  async function togglePin() {
    const next = !pinned;
    setPinned(next);
    if (id.current === null) return; // saved with the note when it is created
    const r = await updateNote(applicationId, id.current, { pinned: next });
    if (r.kind === "error") setPinned(!next);
  }

  return (
    <div className="rounded-2xl border border-v2-line/70 bg-paper p-3 focus-within:border-v2-blue/50">
      <label className="sr-only" htmlFor={`note-${draft.key}`}>
        Note
      </label>
      <textarea
        ref={box}
        id={`note-${draft.key}`}
        value={text}
        maxLength={NOTE_MAX}
        rows={3}
        placeholder="Write a note…"
        onChange={(e) => setText(e.target.value)}
        className="block min-h-[4.5rem] w-full resize-y bg-transparent text-[14px] leading-relaxed text-ink placeholder:text-v2-muted focus:outline-none"
      />
      <div className="mt-2 flex items-center gap-1.5">
        <AutosaveChip autosave={autosave} className="min-w-0 flex-1" />
        {draft.note && <span className="hidden flex-none text-[12px] text-v2-muted sm:inline">{timeAgo(draft.note.createdAt, mountedAt)}</span>}
        <Tooltip content={pinned ? "Unpin note" : "Pin note"}>
          <IconButton aria-label={pinned ? "Unpin note" : "Pin note"} aria-pressed={pinned} onClick={() => void togglePin()} className={cn("h-10 w-10 sm:h-8 sm:w-8", pinned && "text-v2-amber")}>
            <StarIcon aria-hidden className={cn("h-4 w-4", pinned && "fill-current")} />
          </IconButton>
        </Tooltip>
        <Tooltip content="Delete note">
          <IconButton aria-label="Delete note" onClick={() => {
              gone.current = true;
              onDelete();
            }}
            className="h-10 w-10 sm:h-8 sm:w-8">
            <TrashIcon aria-hidden className="h-4 w-4" />
          </IconButton>
        </Tooltip>
      </div>
    </div>
  );
}

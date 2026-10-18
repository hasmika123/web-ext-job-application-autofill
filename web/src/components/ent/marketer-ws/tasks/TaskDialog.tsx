"use client";

import { useEffect, useState } from "react";
import { Button, Input, Select } from "@kiwiply/ui";
import {
  CATEGORY_LABEL, CATEGORY_ORDER, PRIORITY_LABEL, PRIORITY_ORDER, STATUS_LABEL, STATUS_ORDER, type NewTask, type Option, type TaskAction, type TaskCategory, type TaskOptions, type TaskPriority, type TaskRow, type TaskStatus,
} from "@/lib/ent/marketer-ws/tasks";

/**
 * The dialogs behind Add Task, Edit task, Reassign and Delete. Every one of them RECORDS something on a task; none emails anyone or submits an application
 * for a consultant (E1).
 */

export type DialogState =
  | { kind: "create"; preset?: Partial<NewTask> }
  | { kind: "edit"; task: TaskRow }
  | { kind: "reassign"; task: TaskRow; assignees: Option[] | null }
  | { kind: "delete"; task: TaskRow };

const pad = (n: number) => String(n).padStart(2, "0");
/** An ISO instant as the local value a `datetime-local` input takes. */
const toLocal = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const tomorrowTen = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return toLocal(d.toISOString());
};

const LABEL = "block text-[13px] font-semibold text-ink-soft";

function FormDialog({
  state, options, busy, error, onClose, onSubmit,
}: { state: Extract<DialogState, { kind: "create" | "edit" }>; options: TaskOptions; busy: boolean; error: string | null; onClose: () => void; onSubmit: (a: TaskAction) => void }) {
  const editing = state.kind === "edit" ? state.task : null;
  const preset = state.kind === "create" ? state.preset : undefined;
  const [title, setTitle] = useState(editing?.title ?? preset?.title ?? "");
  const [detail, setDetail] = useState(editing?.detail ?? preset?.detail ?? "");
  const [category, setCategory] = useState<TaskCategory>(editing?.category ?? preset?.category ?? "FOLLOW_UP");
  const [priority, setPriority] = useState<TaskPriority>(editing?.priority ?? preset?.priority ?? "MEDIUM");
  const [status, setStatus] = useState<TaskStatus>(editing?.status ?? "NOT_STARTED");
  const [due, setDue] = useState(editing ? toLocal(editing.dueAt) : tomorrowTen());
  const [consultant, setConsultant] = useState("");
  const [client, setClient] = useState("");
  const invalid = title.trim().length === 0 || due === "" || Number.isNaN(new Date(due).getTime());

  const submit = () => {
    const dueAt = new Date(due).toISOString();
    if (editing) {
      onSubmit({ kind: "update", id: editing.id, patch: { title: title.trim(), detail: detail.trim(), category, priority, status, dueAt } });
    } else {
      onSubmit({
        kind: "create",
        task: { title: title.trim(), detail: detail.trim() || undefined, category, priority, status, dueAt, consultantId: consultant ? Number(consultant) : null, clientAccountId: client ? Number(client) : null },
      });
    }
  };

  return (
    <>
      <h2 className="text-[18px] font-bold text-ink">{editing ? "Edit task" : "Add Task"}</h2>
      <p className="mt-1.5 text-[13px] leading-snug text-muted">A task is a note to yourself. Saving it only records it: nothing is emailed and nothing is submitted for a consultant.</p>
      <div className="mt-4 flex flex-col gap-3">
        <label className={LABEL}>
          Task title
          <Input className="mt-1.5" maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Task title" />
        </label>
        <label className={LABEL}>
          Details (optional)
          <Input className="mt-1.5" maxLength={200} value={detail} onChange={(e) => setDetail(e.target.value)} aria-label="Task details" />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={LABEL}>
            Type
            <Select className="mt-1.5" value={category} onChange={(v) => setCategory(v as TaskCategory)} aria-label="Task type" options={CATEGORY_ORDER.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))} />
          </label>
          <label className={LABEL}>
            Priority
            <Select className="mt-1.5" value={priority} onChange={(v) => setPriority(v as TaskPriority)} aria-label="Task priority" options={PRIORITY_ORDER.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))} />
          </label>
          <label className={LABEL}>
            Status
            <Select className="mt-1.5" value={status} onChange={(v) => setStatus(v as TaskStatus)} aria-label="Task status" options={STATUS_ORDER.map((s) => ({ value: s, label: STATUS_LABEL[s] }))} />
          </label>
          <label className={LABEL}>
            Due
            <Input className="mt-1.5" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Task due date" />
          </label>
        </div>
        {editing ? null : (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={LABEL}>
              Consultant (optional)
              <Select className="mt-1.5" value={consultant} onChange={setConsultant} aria-label="Task consultant" options={[{ value: "", label: "None" }, ...options.consultants.map((c) => ({ value: String(c.id), label: c.name }))]} />
            </label>
            <label className={LABEL}>
              Client (optional)
              <Select className="mt-1.5" value={client} onChange={setClient} aria-label="Task client" options={[{ value: "", label: "None" }, ...options.clients.map((c) => ({ value: String(c.id), label: c.name }))]} />
            </label>
          </div>
        )}
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-[13px] font-medium text-v2-coral-ink">
          {error}
        </p>
      ) : null}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant="accent" onClick={submit} disabled={busy || invalid}>
          {busy ? "Saving..." : editing ? "Save changes" : "Add Task"}
        </Button>
      </div>
    </>
  );
}

function ReassignDialog({
  state, busy, error, onClose, onSubmit,
}: { state: Extract<DialogState, { kind: "reassign" }>; busy: boolean; error: string | null; onClose: () => void; onSubmit: (a: TaskAction) => void }) {
  const [owner, setOwner] = useState("");
  const list = state.assignees;
  return (
    <>
      <h2 className="text-[18px] font-bold text-ink">Reassign task</h2>
      <p className="mt-1.5 text-[13px] leading-snug text-muted">
        Hand “{state.task.title}” to another marketer who can see this consultant. They will see it on their own Tasks page. Nothing is emailed.
      </p>
      {list === null ? (
        <p className="mt-4 text-[13px] text-muted">Loading…</p>
      ) : list.length === 0 ? (
        <p className="mt-4 text-[13px] font-medium text-ink-soft">There is nobody else who can take this task.</p>
      ) : (
        <label className={`${LABEL} mt-4`}>
          New owner
          <Select className="mt-1.5" value={owner} onChange={setOwner} aria-label="New owner" placeholder="Choose a marketer" options={list.map((o) => ({ value: String(o.id), label: o.name }))} />
        </label>
      )}
      {error ? (
        <p role="alert" className="mt-3 text-[13px] font-medium text-v2-coral-ink">
          {error}
        </p>
      ) : null}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant="accent" onClick={() => onSubmit({ kind: "reassign", id: state.task.id, ownerMemberId: Number(owner) })} disabled={busy || owner === ""}>
          {busy ? "Saving..." : "Reassign"}
        </Button>
      </div>
    </>
  );
}

function DeleteDialog({
  state, busy, error, onClose, onSubmit,
}: { state: Extract<DialogState, { kind: "delete" }>; busy: boolean; error: string | null; onClose: () => void; onSubmit: (a: TaskAction) => void }) {
  return (
    <>
      <h2 className="text-[18px] font-bold text-ink">Delete task?</h2>
      <p className="mt-1.5 text-[13px] leading-snug text-muted">“{state.task.title}” will be removed. You can only delete your own open tasks, and this cannot be undone.</p>
      {error ? (
        <p role="alert" className="mt-3 text-[13px] font-medium text-v2-coral-ink">
          {error}
        </p>
      ) : null}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant="danger" onClick={() => onSubmit({ kind: "delete", id: state.task.id })} disabled={busy}>
          {busy ? "Deleting..." : "Delete task"}
        </Button>
      </div>
    </>
  );
}

export default function TaskDialog({
  state, options, busy, error, onClose, onSubmit,
}: { state: DialogState; options: TaskOptions; busy: boolean; error: string | null; onClose: () => void; onSubmit: (a: TaskAction) => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [busy, onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={state.kind === "create" ? "Add Task" : state.kind === "edit" ? "Edit task" : state.kind === "reassign" ? "Reassign task" : "Delete task"}
        data-task-dialog={state.kind}
        className="w-full max-w-lg rounded-[var(--radius-lg)] border border-line bg-paper p-5 shadow-xl"
      >
        {state.kind === "create" || state.kind === "edit" ? (
          <FormDialog state={state} options={options} busy={busy} error={error} onClose={onClose} onSubmit={onSubmit} />
        ) : state.kind === "reassign" ? (
          <ReassignDialog state={state} busy={busy} error={error} onClose={onClose} onSubmit={onSubmit} />
        ) : (
          <DeleteDialog state={state} busy={busy} error={error} onClose={onClose} onSubmit={onSubmit} />
        )}
      </div>
    </div>
  );
}

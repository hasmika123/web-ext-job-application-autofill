"use client";

import { useEffect, useId, useState } from "react";
import { Button, Select, Textarea } from "@kiwiply/ui";
import { STATUS_LABEL, STATUS_ORDER, type FollowupAction, type FollowupStatus } from "@/lib/ent/marketer-ws/followups";

/** The small dialog behind Send Reminder / Log Call / Update Status. Every one of them RECORDS something; none emails anyone or submits for a consultant. */

export type DialogKind = "reminder" | "call" | "status";

const COPY: Record<DialogKind, { title: string; submit: string; note: string }> = {
  reminder: { title: "Send reminder", submit: "Record reminder", note: "This records a reminder request on the follow-up. Nothing is emailed or sent to the client, recruiter or consultant." },
  call: { title: "Log call", submit: "Save call", note: "Record the call notes and outcome. Nothing is sent to anyone." },
  status: { title: "Update status", submit: "Update status", note: "Mark the follow-up complete or move it to another status." },
};

export default function ActionDialog({
  kind, count, busy, error, onClose, onSubmit,
}: { kind: DialogKind; count: number; busy: boolean; error: string | null; onClose: () => void; onSubmit: (a: FollowupAction) => void }) {
  const copy = COPY[kind];
  const titleId = useId();
  const [note, setNote] = useState("");
  const [awaiting, setAwaiting] = useState(false);
  const [status, setStatus] = useState<FollowupStatus>("IN_PROGRESS");
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [busy, onClose]);

  const submit = () => {
    if (kind === "reminder") onSubmit({ kind: "reminder", note: note.trim() || undefined });
    else if (kind === "call") onSubmit({ kind: "call", note: note.trim(), awaitingReply: awaiting });
    else onSubmit(status === "COMPLETED" ? { kind: "complete" } : { kind: "status", status });
  };
  const invalid = kind === "call" && note.trim().length === 0;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} data-followup-dialog={kind} className="w-full max-w-md rounded-[var(--radius-lg)] border border-line bg-paper p-5 shadow-xl">
        <h2 id={titleId} className="text-[18px] font-bold text-ink">
          {copy.title}
          <span className="ml-1.5 text-[14px] font-semibold text-ink-soft">({count} selected)</span>
        </h2>
        <p className="mt-1.5 text-[13px] leading-snug text-muted">{copy.note}</p>
        {kind === "status" ? (
          <label className="mt-4 block text-[13px] font-semibold text-ink-soft">
            New status
            <Select
              className="mt-1.5"
              value={status}
              onChange={(v) => setStatus(v as FollowupStatus)}
              options={STATUS_ORDER.map((s) => ({ value: s, label: s === "COMPLETED" ? "Completed (mark complete)" : STATUS_LABEL[s] }))}
              aria-label="New status"
            />
          </label>
        ) : (
          <label className="mt-4 block text-[13px] font-semibold text-ink-soft">
            {kind === "call" ? "Call notes" : "Note (optional)"}
            <Textarea className="mt-1.5" rows={4} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} aria-label={kind === "call" ? "Call notes" : "Reminder note"} />
          </label>
        )}
        {kind === "call" ? (
          <label className="mt-3 flex items-center gap-2 text-[13px] text-ink-soft">
            <input type="checkbox" checked={awaiting} onChange={(e) => setAwaiting(e.target.checked)} className="h-4 w-4 accent-[var(--color-accent)]" />
            Waiting for a reply
          </label>
        ) : null}
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
            {busy ? "Saving..." : copy.submit}
          </Button>
        </div>
      </div>
    </div>
  );
}

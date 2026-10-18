"use client";

import { useState } from "react";
import { Button, Dialog, Input, Select, Textarea } from "@kiwiply/ui";
import { OUTCOMES, fromLocalInput, shortDateTime, toLocalInput, type InterviewRow } from "@/lib/ent/marketer-ws/interviews";

/** Result of a submit: null = done (the dialog closes), a string = the sentence to show. */
export type Submit<T> = (value: T) => Promise<string | null>;

function Footer({ onClose, busy, canSubmit, label, onSubmit }: { onClose: () => void; busy: boolean; canSubmit: boolean; label: string; onSubmit: () => void }) {
  return (
    <div className="flex justify-end gap-2">
      <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
        Cancel
      </Button>
      <Button variant="primary" size="sm" onClick={onSubmit} disabled={busy || !canSubmit}>
        {busy ? "Saving..." : label}
      </Button>
    </div>
  );
}

/**
 * Propose a new time. E1: this is a proposal; the consultant confirms it, and the slot keeps its time until a confirmed slot is recorded.
 */
export function RescheduleDialog({ row, onClose, onSubmit }: { row: InterviewRow; onClose: () => void; onSubmit: Submit<{ proposedAt: string; note: string }> }) {
  const [when, setWhen] = useState(toLocalInput(row.proposedFor ?? row.startsAt));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const iso = fromLocalInput(when);
  const submit = async () => {
    if (!iso || busy) return;
    setBusy(true);
    setError(await onSubmit({ proposedAt: iso, note: note.trim() }));
    setBusy(false);
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title="Propose a reschedule"
      description={`${row.consultant} - ${row.client}, currently ${shortDateTime(row.startsAt)}. ${row.consultant.split(" ")[0]} confirms the new time; the interview keeps its slot until then.`}
      footer={<Footer onClose={onClose} busy={busy} canSubmit={iso !== null} label="Propose new time" onSubmit={() => void submit()} />}
    >
      <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <label className="flex flex-col gap-1 text-[13px] font-semibold text-ink-soft">
          New date and time
          <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} required />
        </label>
        <label className="flex flex-col gap-1 text-[13px] font-semibold text-ink-soft">
          Note (optional)
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Why the time is moving" />
        </label>
        {error ? <p role="alert" className="text-[13px] text-danger-text">{error}</p> : null}
      </form>
    </Dialog>
  );
}

/** Record what happened. The outcome is required; the note is short and never holds IDs, phone numbers or other private data. */
export function FeedbackDialog({ row, onClose, onSubmit }: { row: Pick<InterviewRow, "consultant" | "client" | "round">; onClose: () => void; onSubmit: Submit<{ outcome: string; note: string }> }) {
  const [outcome, setOutcome] = useState("PASSED");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(await onSubmit({ outcome, note: note.trim() }));
    setBusy(false);
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title="Record feedback"
      description={`${row.consultant} - ${row.client}${row.round ? `, ${row.round}` : ""}`}
      footer={<Footer onClose={onClose} busy={busy} canSubmit label="Save feedback" onSubmit={() => void submit()} />}
    >
      <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <label className="flex flex-col gap-1 text-[13px] font-semibold text-ink-soft">
          Outcome
          <Select value={outcome} onChange={setOutcome} options={OUTCOMES.map((o) => ({ value: o.value, label: o.label }))} aria-label="Outcome" />
        </label>
        <label className="flex flex-col gap-1 text-[13px] font-semibold text-ink-soft">
          Feedback note (optional)
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="What the client said" />
        </label>
        {error ? <p role="alert" className="text-[13px] text-danger-text">{error}</p> : null}
      </form>
    </Dialog>
  );
}

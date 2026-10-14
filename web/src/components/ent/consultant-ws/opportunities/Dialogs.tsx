"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { Button, SensitiveTextField, SheetFrame, cn } from "@kiwiply/ui";
import {
  DECLINE_LABELS, DECLINE_REASONS, NOTE_MAX, QUESTION_MAX, fetchMyApplications,
  type ActionResult, type AppOption, type DeclineReason,
} from "@/lib/ent/consultant-ws/opportunities";

/**
 * The three small forms of Assigned Opportunities: decline (with a reason), ask the marketer a question, and link one of my own tracked
 * applications. Each one hands its answer to `onSubmit`, which runs the optimistic write and returns the API's verdict; a refusal (the
 * sensitive-text check, a validation error) is shown under the field and the dialog stays open, anything else closes it.
 */

type Submit<A extends unknown[]> = (...a: A) => Promise<ActionResult>;

function Frame({ id, title, onClose, children }: { id: string; title: string; onClose: () => void; children: ReactNode }) {
  return (
    <SheetFrame id={id} open onClose={onClose} title={title}>
      <div data-con-dialog={id} className="flex flex-col gap-3">
        {children}
      </div>
    </SheetFrame>
  );
}

/** A refusal's message: the sensitive-text check sits under the field, anything else under the buttons. */
function useOutcome(onClose: () => void) {
  const [busy, setBusy] = useState(false);
  const [field, setField] = useState<string | null>(null);
  const [general, setGeneral] = useState<string | null>(null);
  const run = async (call: () => Promise<ActionResult>) => {
    setBusy(true);
    setField(null);
    setGeneral(null);
    const r = await call();
    setBusy(false);
    if (r.kind === "OK") onClose();
    else if (r.kind === "SENSITIVE") setField(r.error);
    else if (r.kind === "INVALID" || r.kind === "FAILED") setGeneral(r.error);
    else onClose(); // a conflict or a missing row is explained by the page's own toast
  };
  return { busy, field, general, run, clear: () => setField(null) };
}

export function DeclineDialog({ onSubmit, onClose }: { onSubmit: Submit<[DeclineReason, string]>; onClose: () => void }) {
  const uid = useId();
  const [reason, setReason] = useState<DeclineReason>("NOT_INTERESTED");
  const [note, setNote] = useState("");
  const [hits, setHits] = useState(false);
  const o = useOutcome(onClose);
  return (
    <Frame id="con-decline" title="Decline this job" onClose={onClose}>
      <p className="text-[13.5px] text-ink-soft">Your marketer sees your reason, so they can find a better fit. You can change your mind later.</p>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-[13px] font-semibold text-ink">Why not?</legend>
        {DECLINE_REASONS.map((r) => (
          <label key={r} className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border border-line px-3 text-[14px] text-ink has-[:checked]:border-accent has-[:checked]:bg-accent-soft sm:min-h-9">
            <input type="radio" name={`${uid}-reason`} value={r} checked={reason === r} onChange={() => setReason(r)} className="accent-[var(--color-accent)]" />
            {DECLINE_LABELS[r]}
          </label>
        ))}
      </fieldset>
      <div>
        <p className="mb-1 text-[13px] font-semibold text-ink">Add a note <span className="font-normal text-muted">(optional, up to {NOTE_MAX} characters)</span></p>
        <SensitiveTextField label="Note for your marketer" value={note} onValueChange={(v) => { setNote(v); o.clear(); }} serverError={o.field} onHits={(h) => setHits(h.length > 0)} multiline rows={3} maxLength={NOTE_MAX} />
      </div>
      {o.general ? <p role="alert" className="text-[12.5px] text-danger-text">{o.general}</p> : null}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        <Button variant="danger" size="sm" disabled={o.busy || hits} onClick={() => void o.run(() => onSubmit(reason, note))}>Decline job</Button>
      </div>
    </Frame>
  );
}

export function AskDialog({ onSubmit, onClose }: { onSubmit: Submit<[string]>; onClose: () => void }) {
  const [question, setQuestion] = useState("");
  const [hits, setHits] = useState(false);
  const o = useOutcome(onClose);
  const trimmed = question.trim();
  return (
    <Frame id="con-ask" title="Ask a question" onClose={onClose}>
      <p className="text-[13.5px] text-ink-soft">Your marketer gets this as a task and answers here. Keep it to what you need to decide.</p>
      <SensitiveTextField label="Your question" placeholder="For example: is this role open to remote work?" value={question} onValueChange={(v) => { setQuestion(v); o.clear(); }} serverError={o.field} onHits={(h) => setHits(h.length > 0)} multiline rows={4} maxLength={QUESTION_MAX} />
      <p className="text-right text-[12px] text-muted">{question.length}/{QUESTION_MAX}</p>
      {o.general ? <p role="alert" className="text-[12.5px] text-danger-text">{o.general}</p> : null}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        <Button variant="accent" size="sm" disabled={o.busy || hits || trimmed.length === 0 || trimmed.length > QUESTION_MAX} onClick={() => void o.run(() => onSubmit(trimmed))}>Send question</Button>
      </div>
    </Frame>
  );
}

export function LinkDialog({ onSubmit, onClose }: { onSubmit: Submit<[number]>; onClose: () => void }) {
  const uid = useId();
  const [options, setOptions] = useState<AppOption[] | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const o = useOutcome(onClose);
  useEffect(() => {
    let live = true;
    void fetchMyApplications().then((r) => live && setOptions(r));
    return () => {
      live = false;
    };
  }, []);
  return (
    <Frame id="con-link" title="Link my application" onClose={onClose}>
      <p className="text-[13.5px] text-ink-soft">Pick the application you already tracked for this job. We only connect the two records; nothing is sent anywhere.</p>
      {options === null ? (
        <p aria-busy="true" className="py-3 text-[13px] text-muted">Loading your applications...</p>
      ) : options.length === 0 ? (
        <p className="py-3 text-[13px] text-muted">You have no tracked applications yet. Apply with the extension first, or press &ldquo;I applied&rdquo;.</p>
      ) : (
        <fieldset className="flex max-h-64 flex-col gap-1.5 overflow-y-auto">
          <legend className="sr-only">Your applications</legend>
          {options.map((a) => (
            <label key={a.id} className={cn("flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border border-line px-3 text-[14px] text-ink has-[:checked]:border-accent has-[:checked]:bg-accent-soft sm:min-h-9")}>
              <input type="radio" name={`${uid}-app`} value={a.id} checked={picked === a.id} onChange={() => setPicked(a.id)} className="accent-[var(--color-accent)]" />
              <span className="min-w-0 truncate">{a.label}</span>
            </label>
          ))}
        </fieldset>
      )}
      {o.general ? <p role="alert" className="text-[12.5px] text-danger-text">{o.general}</p> : null}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        <Button variant="accent" size="sm" disabled={o.busy || picked === null} onClick={() => picked !== null && void o.run(() => onSubmit(picked))}>Link application</Button>
      </div>
    </Frame>
  );
}

"use client";

import { useCallback, useState, type ReactNode } from "react";
import { Button, SheetFrame, Textarea } from "@kiwiply/ui";
import { DUPLICATE_REASON_MAX, reasonOk, type DuplicateConfirm, type DuplicateFinding, type GuardRefusal } from "@/lib/ent/marketer-ws/duplicate";

/**
 * The "Possible duplicate" answer shared by every marketing flow that can be refused by the duplicate guard (Sprint 2 / B1): the Opportunities board, Matches,
 * Jobs, Submissions and Applications. The API answers 409 DUPLICATE_WARNING with what it found; the marketer may go ahead by giving a reason (1 to 200
 * characters, kept in the audit trail). A block (the organization's policy) and the open-opportunity limit have nothing to confirm: the page shows
 * their sentence with `plainRefusal` and never opens this. E1: confirming only lets the record be made; nothing is answered or submitted for the consultant.
 */

/** What the notice shows: the API's findings (or its sentence when it sent none) and the reason box. `idBase` keeps two notices on one page apart. */
export function DuplicateNotice({ message, findings, reason, onReason, idBase = "dup" }: { message: string; findings: DuplicateFinding[]; reason: string; onReason: (v: string) => void; idBase?: string }) {
  return (
    <div data-dup-notice data-opp-duplicate role="alert" className="mt-2 rounded-lg border border-line bg-v2-amber-soft p-3 text-[13px] text-v2-amber-ink">
      <p className="font-semibold">This looks like a duplicate</p>
      {findings.length > 0 ? (
        <ul className="mt-1 list-disc pl-5">
          {findings.map((f, i) => <li key={`${f.rule}-${i}`}>{f.message}</li>)}
        </ul>
      ) : (
        <p className="mt-1">{message}</p>
      )}
      <label className="mt-2 block text-[12.5px] font-semibold" htmlFor={`${idBase}-reason`}>Why is it fine to go ahead?</label>
      <Textarea id={`${idBase}-reason`} rows={2} maxLength={DUPLICATE_REASON_MAX} value={reason} placeholder="For example: the client asked for both vendors" onChange={(e) => onReason(e.target.value)} />
      <p className="mt-1 text-[12px]">Your reason is kept in the audit trail. Please don&apos;t include ID numbers or dates of birth.</p>
    </div>
  );
}

/**
 * The state of an inline warning, for flows that live inside a dialog or sheet of their own. `ask` takes the refused answer; `confirm` is the confirmation to
 * send once the reason is good (undefined before a warning, or while the reason is empty), and `needsReason` keeps the primary button off until it is.
 * Call `reset` when the thing being asked about changes (another consultant or job): a warning belongs to one pair.
 */
export function useDuplicateAsk() {
  const [dup, setDup] = useState<{ message: string; findings: DuplicateFinding[] } | null>(null);
  const [reason, setReason] = useState("");
  const ask = useCallback((r: GuardRefusal) => {
    setDup({ message: r.error, findings: r.findings ?? [] });
    setReason("");
  }, []);
  const reset = useCallback(() => {
    setDup(null);
    setReason("");
  }, []);
  const confirm: DuplicateConfirm | undefined = dup && reasonOk(reason) ? { reason: reason.trim() } : undefined;
  return { dup, reason, setReason, ask, reset, confirm, needsReason: dup !== null && !reasonOk(reason) };
}

/** The sheet that asks for the reason when the page has no dialog of its own to hold the notice. */
export function DuplicateConfirmDialog({
  open, id = "dup-confirm", title = "Possible duplicate", intro, confirmLabel, message, findings, busy, onClose, onConfirm, bodyAttrs, idBase,
}: {
  open: boolean;
  id?: string;
  title?: string;
  intro: ReactNode;
  confirmLabel: string;
  message: string;
  findings: DuplicateFinding[];
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  /** Extra attributes on the body (a page's own test hook). */
  bodyAttrs?: Record<string, string>;
  idBase?: string;
}) {
  return (
    <SheetFrame id={id} open={open} onClose={onClose} title={title}>
      {open ? <DuplicateBody intro={intro} confirmLabel={confirmLabel} message={message} findings={findings} busy={busy} onClose={onClose} onConfirm={onConfirm} bodyAttrs={bodyAttrs} idBase={idBase ?? id} /> : null}
    </SheetFrame>
  );
}

/** Mounted only while the dialog is open, so the reason starts empty every time. */
function DuplicateBody({ intro, confirmLabel, message, findings, busy, onClose, onConfirm, bodyAttrs, idBase }: { intro: ReactNode; confirmLabel: string; message: string; findings: DuplicateFinding[]; busy: boolean; onClose: () => void; onConfirm: (reason: string) => void; bodyAttrs?: Record<string, string>; idBase: string }) {
  const [reason, setReason] = useState("");
  return (
    <div data-dup-dialog className="min-w-0" {...bodyAttrs}>
      <p className="text-[13.5px] text-ink-soft">{intro}</p>
      <DuplicateNotice message={message} findings={findings} reason={reason} onReason={setReason} idBase={idBase} />
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" disabled={busy || !reasonOk(reason)} onClick={() => onConfirm(reason.trim())}>{confirmLabel}</Button>
      </div>
    </div>
  );
}

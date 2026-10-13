"use client";

/* eslint-disable react-hooks/set-state-in-effect -- the form starts empty each time the dialog opens */

import { useEffect, useState } from "react";
import { Button, Dialog, Field, Input, Textarea } from "@kiwiply/ui";
import { formatDay } from "@/lib/ent/placements";

export type ExtensionMode = "extend" | "request" | "redeploy";

const COPY: Record<ExtensionMode, { title: string; description: string; field: string; submit: string }> = {
  extend: { title: "Extend placement", description: "Record that the client agreed to a later end date. The end date moves now; you can undo it for a few minutes.", field: "New end date", submit: "Extend placement" },
  request: { title: "Request extension", description: "Record that the client may want to continue. It waits for a decision and shows in the Extensions tab.", field: "Requested end date", submit: "Request extension" },
  redeploy: { title: "Start redeployment", description: "Add the consultant to the redeployment pool from the day they are free.", field: "Available from", submit: "Start redeployment" },
};

/** One date and an optional note: the shared form behind Extend Placement, Request Extension and Start Redeployment. */
export default function ExtensionDialog({
  open,
  mode,
  currentEnd,
  start,
  defaultDate,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  mode: ExtensionMode;
  /** The end date now; the new one must be later. */
  currentEnd: string | null;
  start: string;
  defaultDate?: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (date: string, note: string) => void;
}) {
  const copy = COPY[mode];
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  useEffect(() => {
    if (open) {
      setDate(defaultDate ?? "");
      setNote("");
    }
  }, [open, defaultDate]);
  const floor = mode === "redeploy" ? undefined : currentEnd ?? start;
  const valid = date !== "" && (mode === "redeploy" || date > (floor ?? ""));
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={copy.title}
      description={copy.description}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="accent" disabled={!valid || busy} onClick={() => onSubmit(date, note.trim())} data-extension-submit>
            {copy.submit}
          </Button>
        </>
      }
    >
      <div className="space-y-3.5" data-extension-dialog={mode}>
        <Field label={copy.field} required hint={mode !== "redeploy" && currentEnd ? `The end date now is ${formatDay(currentEnd)}.` : undefined}>
          <Input type="date" value={date} min={mode === "redeploy" ? undefined : floor} onChange={(e) => setDate(e.target.value)} aria-label={copy.field} />
        </Field>
        {mode !== "redeploy" && (
          <Field label="Note" hint="Optional. No ID numbers or other sensitive details.">
            <Textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note" />
          </Field>
        )}
        {error && <p role="alert" className="text-[13px] text-danger">{error}</p>}
      </div>
    </Dialog>
  );
}

"use client";

import { useState } from "react";
import { Button, UndoIcon } from "@kiwiply/ui";
import LocalDate from "@/components/LocalDate";
import { statusLabel as defaultStatusLabel } from "@/lib/applications";
import { TOO_LATE, undoInboxChange, type ReviewEndpoints } from "@/lib/inbox-review";

/**
 * The line under a timeline row that the inbox applied ("Updated by Inbox from mail on Oct 12") with an Undo that asks first. After the
 * undo window the server answers 409 UNDO_EXPIRED and the control turns into "Too late to undo". Used by the personal application timeline
 * and the consultant workspace application timeline; the caller passes the routes.
 */
const WHEN = { month: "short", day: "numeric", year: "numeric" } as const;

export default function InboxUndo({
  endpoints,
  applicationId,
  eventId,
  at,
  statusLabel,
  onUndone,
}: {
  endpoints: ReviewEndpoints;
  applicationId: number | string;
  eventId: number | string;
  /** When the mail moved the application (the timeline row's time). */
  at: string;
  statusLabel?: (s: string) => string;
  /** After a successful undo, so the timeline and the card can reload. */
  onUndone?: () => void;
}) {
  const [step, setStep] = useState<"idle" | "confirm" | "working" | "done" | "expired">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function undo() {
    setStep("working");
    setMessage(null);
    const r = await undoInboxChange(endpoints, applicationId, eventId);
    if (r.ok) {
      setStep("done");
      setMessage(r.status ? `Undone. Back to ${(statusLabel ?? defaultStatusLabel)(r.status)}.` : "Undone.");
      onUndone?.();
    } else if (r.expired) {
      setStep("expired");
      setMessage(TOO_LATE);
    } else {
      setStep("confirm");
      setMessage(r.message);
    }
  }

  return (
    <div data-inbox-undo={String(eventId)} className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
      <span>
        Updated by Inbox from mail on <LocalDate iso={at} options={WHEN} />
      </span>
      {step === "idle" ? (
        <Button type="button" size="sm" variant="ghost" data-action="undo" onClick={() => setStep("confirm")} className="min-h-8 px-2.5 py-1 text-[12px]">
          <UndoIcon size={13} />
          Undo
        </Button>
      ) : null}
      {step === "confirm" || step === "working" ? (
        <span role="group" aria-label="Confirm undo" className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-ink-soft">Put it back the way it was?</span>
          <Button type="button" size="sm" variant="primary" data-action="undo-confirm" disabled={step === "working"} onClick={() => void undo()} className="min-h-8 px-2.5 py-1 text-[12px]">
            Yes, undo
          </Button>
          <Button type="button" size="sm" variant="ghost" data-action="undo-cancel" disabled={step === "working"} onClick={() => setStep("idle")} className="min-h-8 px-2.5 py-1 text-[12px]">
            Keep it
          </Button>
        </span>
      ) : null}
      {message ? (
        <span role="status" data-undo-note={step} className={step === "done" ? "font-medium text-ink-soft" : "font-medium text-danger-text"}>
          {message}
        </span>
      ) : null}
    </div>
  );
}

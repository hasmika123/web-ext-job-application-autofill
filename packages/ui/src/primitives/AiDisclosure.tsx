"use client";

import { useId, useState } from "react";
import { cn } from "./cn";
import { InfoIcon, SparklesIcon } from "./icons";

/**
 * AiDisclosure — the line under anything an AI wrote (Resume Builder DESIGN 13.1, EU AI Act Art. 50 posture):
 * "AI · review before you use it", a "Why?" that opens the plain-words account (what was sent, which model,
 * the call id the support team can look up) and, by default, the "Made with Kiwiply AI" chip. It never says how
 * good the answer is; it says where it came from. The caller owns the facts; this only lays them out.
 *
 *   <AiDisclosure model="gemini-flash-lite" callId={4812} />
 */
export interface AiDisclosureProps {
  /** The model that answered, when known ("Model: …" line). */
  model?: string | null;
  /** The stored ledger id of the call, when known ("Call …" line). */
  callId?: number | string | null;
  /** What left the browser, in plain words. Default: the resume text and, if set, the job description. */
  sent?: string;
  /** Show the "Made with Kiwiply AI" chip. Default true. */
  chip?: boolean;
  className?: string;
}

export const AI_DISCLOSURE_LINE = "AI · review before you use it";
export const AI_SENT_DEFAULT = "your resume text and, if set, the job description";
export const AI_CHIP_TEXT = "Made with Kiwiply AI";

export default function AiDisclosure({ model, callId, sent = AI_SENT_DEFAULT, chip = true, className }: AiDisclosureProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div className={cn("text-[12px] leading-snug text-muted", className)}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <SparklesIcon aria-hidden className="h-3.5 w-3.5 flex-none text-v2-violet" />
        <span>{AI_DISCLOSURE_LINE}</span>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className="inline-flex min-h-6 items-center gap-1 rounded px-1 font-semibold text-v2-blue hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent max-sm:min-h-11"
        >
          <InfoIcon aria-hidden className="h-3 w-3" /> Why?
        </button>
        {chip && (
          <span className="ml-auto inline-flex items-center rounded-full bg-v2-violet-soft px-2 py-0.5 text-[10.5px] font-bold text-v2-violet-ink">{AI_CHIP_TEXT}</span>
        )}
      </div>
      {open && (
        <ul id={panelId} className="mt-1.5 list-disc space-y-0.5 pl-8 text-ink-soft">
          <li>An AI model suggested this. It can be wrong, so read it before you keep it.</li>
          <li>What was sent: {sent}.</li>
          {model && <li>Model: {model}</li>}
          {callId !== null && callId !== undefined && callId !== "" && <li>Call {callId}</li>}
        </ul>
      )}
    </div>
  );
}

"use client";

import { AlertIcon, CheckCircleIcon, ClockIcon, cn } from "@kiwiply/ui";
import { TINTS } from "../parts";
import type { TalentRow, Tone } from "@/lib/ent/marketer-ws/talent";

/** Small status chips of the My Assigned Talent board (availability dot chip, resume status chip). Tenant tokens only. */

const CHIP = "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[12.5px] font-semibold";
const DOT: Record<Tone, string> = { green: "bg-green-500", blue: "bg-blue-500", violet: "bg-violet-500", amber: "bg-amber-400", grey: "bg-muted" };
const CHIP_TONE: Record<Tone, string> = { green: TINTS.green, blue: TINTS.blue, violet: TINTS.violet, amber: TINTS.amber, grey: "bg-paper-2 text-ink-soft" };

export function AvailabilityChip({ availability }: { availability: TalentRow["availability"] }) {
  return (
    <span data-availability={availability.code} className={cn(CHIP, CHIP_TONE[availability.tone])}>
      <span aria-hidden className={cn("h-2 w-2 rounded-full", DOT[availability.tone])} />
      {availability.label}
    </span>
  );
}

export function ResumeChip({ resume }: { resume: TalentRow["resume"] }) {
  if (resume.state === "NEEDS_UPDATE")
    return (
      <span data-resume="NEEDS_UPDATE" className={cn(CHIP, TINTS.pink)}>
        <AlertIcon size={13} aria-hidden />
        {resume.label}
      </span>
    );
  if (resume.state === "PENDING_APPROVAL")
    return (
      <span data-resume="PENDING_APPROVAL" className={cn(CHIP, TINTS.amber)}>
        <ClockIcon size={13} aria-hidden />
        {resume.label}
      </span>
    );
  return (
    <span data-resume="UP_TO_DATE" className={cn(CHIP, TINTS.green)}>
      <CheckCircleIcon size={13} aria-hidden />
      {resume.label}
    </span>
  );
}
